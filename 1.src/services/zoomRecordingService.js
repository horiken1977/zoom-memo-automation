/**
 * Zoom Recording Service - 本番環境用録画データ処理サービス
 * 
 * 設計方針:
 * - シーケンシャル処理でメモリ効率を最適化
 * - Vercel環境制約(メモリ制限、300秒制限)に対応
 * - 動画と音声を分離処理してメモリ負荷を軽減
 * 
 * 処理フロー:
 * 1. Zoom録画リスト取得
 * 2. 動画ファイル取得 → Google Drive保存 → 共有リンク生成
 * 3. 音声ファイル取得 → Gemini AI処理 → メモリから破棄
 * 4. 処理結果統合
 */

const axios = require('axios');
const ZoomService = require('./zoomService');
const VideoStorageService = require('./videoStorageService');
const AudioSummaryService = require('./audioSummaryService');
const DocumentStorageService = require('./documentStorageService');
const { ExecutionLogger } = require('../utils/executionLogger');
const { ErrorManager } = require('../utils/errorCodes');
const logger = require('../utils/logger');

class ZoomRecordingService {
  constructor() {
    this.zoomService = new ZoomService();
    this.videoStorageService = new VideoStorageService();
    this.audioSummaryService = new AudioSummaryService();
  }

  /**
   * 全ユーザーの録画データを取得（本番環境と同じ方法）
   * @param {string} fromDate - 開始日 (YYYY-MM-DD)
   * @param {string} toDate - 終了日 (YYYY-MM-DD)  
   * @param {ExecutionLogger} executionLogger - 実行ログ
   * @returns {Promise<Array>} 全ユーザーの録画リスト
   */
  async getAllUsersRecordings(fromDate, toDate, executionLogger = null) {
    try {
      if (executionLogger) {
        executionLogger.startStep('ZOOM_ALL_USERS_SEARCH');
      }
      
      logger.info(`全ユーザー録画検索開始: ${fromDate} - ${toDate}`);
      
      // アクセストークン取得
      const token = await this.zoomService.getAccessToken();
      
      // 全アクティブユーザーを取得
      const usersResponse = await axios.get('https://api.zoom.us/v2/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          page_size: 300,
          status: 'active'
        }
      });
      
      const users = usersResponse.data.users || [];
      logger.info(`アクティブユーザー取得: ${users.length}名`);
      
      const allRecordings = [];
      let checkedUsers = 0;
      
      // 各ユーザーの録画を検索（最大5名まで）
      for (let i = 0; i < Math.min(users.length, 5); i++) {
        const user = users[i];
        checkedUsers++;
        
        try {
          logger.info(`ユーザー ${checkedUsers}/${Math.min(users.length, 5)}: ${user.email}`);
          
          const recordingsResponse = await axios.get(`https://api.zoom.us/v2/users/${user.id}/recordings`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            params: {
              from: fromDate,
              to: toDate,
              page_size: 100
            }
          });
          
          const meetings = recordingsResponse.data.meetings || [];
          
          for (const meeting of meetings) {
            // recording_filesをセット（Zoomの標準形式に合わせる）
            if (meeting.recording_files && meeting.recording_files.length > 0) {
              allRecordings.push({
                id: meeting.id,
                uuid: meeting.uuid,
                topic: meeting.topic,
                start_time: meeting.start_time,
                duration: meeting.duration,
                host_email: user.email,
                recording_files: meeting.recording_files
              });
            }
          }
          
        } catch (userError) {
          logger.warn(`ユーザー ${user.email} の録画取得でエラー:`, userError.response?.data || userError.message);
        }
      }
      
      if (executionLogger) {
        executionLogger.completeStep('ZOOM_ALL_USERS_SEARCH', {
          totalUsers: users.length,
          checkedUsers: checkedUsers,
          totalRecordings: allRecordings.length,
          dateRange: `${fromDate} - ${toDate}`
        }, 'SUCCESS', 'zoomRecordingService.js.getAllUsersRecordings');
      }
      
      logger.info(`全ユーザー録画検索完了: ${allRecordings.length}件の録画を発見`);
      return allRecordings;
      
    } catch (error) {
      if (executionLogger) {
        executionLogger.errorStep('ZOOM_ALL_USERS_SEARCH', 'E_ZOOM_RECORDING_NOT_FOUND', error.message, {
          error: error.message,
          dateRange: `${fromDate} - ${toDate}`
        }, 'zoomRecordingService.js.getAllUsersRecordings');
      }
      
      logger.error('全ユーザー録画検索エラー:', error.response?.data || error.message);
      throw ErrorManager.createError('E_ZOOM_RECORDING_NOT_FOUND', { error: error.message, dateRange: `${fromDate} - ${toDate}` });
    }
  }

  /**
   * 指定期間のZoom録画リストを取得
   * @param {string} fromDate - 開始日 (YYYY-MM-DD)
   * @param {string} toDate - 終了日 (YYYY-MM-DD)
   * @param {ExecutionLogger} executionLogger - 実行ログ
   * @returns {Promise<Array>} 録画データ配列
   */
  async getRecordingsList(fromDate, toDate, executionLogger = null) {
    try {
      if (executionLogger) {
        executionLogger.startStep('ZOOM_RECORDINGS_LIST');
      }

      // 本番環境と同じ全ユーザー録画検索を実行
      const recordings = await this.getAllUsersRecordings(fromDate, toDate, executionLogger);
      
      // 処理可能な録画のみをフィルタリング
      const processableRecordings = recordings.filter(recording => {
        const files = recording.recording_files || [];
        const hasVideo = files.some(file => file.file_type === 'MP4');
        const hasAudio = files.some(file => ['M4A', 'MP3'].includes(file.file_type));
        return hasVideo && hasAudio;
      });

      if (executionLogger) {
        executionLogger.completeStep('ZOOM_RECORDINGS_LIST', {
          totalRecordings: recordings.length,
          processableRecordings: processableRecordings.length,
          dateRange: `${fromDate} - ${toDate}`
        });
      }

      logger.info(`Zoom録画取得完了: ${processableRecordings.length}/${recordings.length}件が処理可能`);
      
      return processableRecordings;
      
    } catch (error) {
      if (executionLogger) {
        executionLogger.errorStep('ZOOM_RECORDINGS_LIST', 'E_ZOOM_RECORDING_NOT_FOUND', error.message, {
          error: error.message,
          dateRange: `${fromDate} - ${toDate}`
        });
      }
      
      logger.error('Zoom録画リスト取得エラー:', error);
      throw ErrorManager.createError('E_ZOOM_RECORDING_NOT_FOUND', { error: error.message, dateRange: `${fromDate} - ${toDate}` });
    }
  }

  /**
   * 単一録画の完全処理 (シーケンシャル処理)
   * @param {Object} recording - Zoom録画データ
   * @param {ExecutionLogger} executionLogger - 実行ログ
   * @returns {Promise<Object>} 処理結果
   */
  async processRecording(recording, executionLogger = null) {
    const meetingId = recording.id || recording.uuid;
    const meetingTopic = recording.topic || 'Unknown Meeting';
    
    logger.info(`録画処理開始: ${meetingTopic} (${meetingId})`);
    
    try {
      // Step 1: 動画ファイル処理 (取得 → Google Drive保存)
      const videoResult = await this.processVideoFile(recording, executionLogger);
      
      // TC206-S2対応: 動画処理が失敗/スキップされても後続処理を継続
      const warnings = [];
      if (!videoResult.success && videoResult.warning) {
        warnings.push(videoResult.warning);
        logger.info('動画処理をスキップして音声/Transcript処理に進みます');
      }
      
      // Step 2: v2.0 Transcript処理 (優先) または 音声処理 (フォールバック)
      const meetingInfo = this.extractMeetingInfo(recording);
      let audioResult;
      
      // v2.0: TranscriptService優先実行
      const transcriptResult = await this.tryTranscriptProcessing(recording, meetingInfo, executionLogger);
      
      if (transcriptResult.success) {
        // Transcript成功 - v2.0高速処理
        audioResult = transcriptResult;
        logger.info(`v2.0 Transcript処理成功: ${transcriptResult.processingTime}ms`);
        
      } else if (transcriptResult.requiresFallback) {
        // フォールバック: v1.0音声処理
        logger.info(`v1.0音声処理フォールバック実行 (理由: ${transcriptResult.fallbackReason})`);
        
        if (executionLogger) {
          executionLogger.startStep('AUDIO_FALLBACK_PROCESSING');
        }
        
        // 動画バッファを音声処理に渡してバッファリング使用（nullの場合もある）
        audioResult = await this.processAudioFile(recording, executionLogger, videoResult.videoBuffer);
        
        // フォールバック情報を追加
        audioResult.method = 'audio-fallback';
        audioResult.fallbackReason = transcriptResult.fallbackReason;
        audioResult.fallbackFromTranscript = true;
        
        if (executionLogger) {
          executionLogger.logSuccess('AUDIO_FALLBACK_COMPLETE', {
            fallbackReason: transcriptResult.fallbackReason,
            processingTime: audioResult.processingTime
          });
        }
        
      } else {
        // 完全失敗（通常発生しない）
        throw new Error(`音声・Transcript処理ともに失敗: ${transcriptResult.error}`);
      }
      
      // Step 3: 文書保存処理 (文字起こし・要約をGoogle Driveに保存)
      let documentResult = null;
      if (audioResult.success && audioResult.transcription && audioResult.summary) {
        try {
          if (executionLogger) {
            executionLogger.startStep('DOCUMENT_STORAGE');
          }
          
          const DocumentStorageService = require('./documentStorageService');
          const documentStorageService = new DocumentStorageService();
          
          documentResult = await documentStorageService.saveDocuments(
            audioResult,
            meetingInfo,
            process.env.GOOGLE_DRIVE_RECORDINGS_FOLDER
          );
          
          if (executionLogger) {
            executionLogger.logSuccess('DOCUMENT_STORAGE_COMPLETE', {
              transcriptionSaved: !!documentResult.transcriptionLink,
              summarySaved: !!documentResult.summaryLink
            });
          }
          
        } catch (docError) {
          logger.error('文書保存エラー（処理は継続）:', docError);
          if (executionLogger) {
            executionLogger.logWarning('DOCUMENT_STORAGE_FAILED', {
              error: docError.message
            });
          }
        }
      }
      
      // Step 4: 処理結果の統合
      const result = {
        success: true,
        meetingId: meetingId,
        meetingTopic: meetingTopic,
        meetingInfo: meetingInfo,
        video: videoResult.skipped ? null : videoResult,  // 動画がスキップされた場合はnull
        audio: audioResult,
        documents: documentResult,
        // Slack通知用フィールド
        summary: audioResult.summary,
        driveLink: videoResult.skipped ? null : videoResult.driveLink,  // 動画なしの場合はnull
        warnings: warnings.length > 0 ? warnings : undefined,  // TC206警告メッセージ
        processedAt: new Date().toISOString(),
        // v2.0追加: 処理方法の詳細情報
        processingDetails: {
          method: audioResult.method || 'unknown',
          processedFromVideo: audioResult?.processedFromVideo || false,
          hasVideo: !!videoResult?.success,
          hasAudio: !audioResult?.processedFromVideo,
          fallbackUsed: !!audioResult.fallbackFromTranscript,
          fallbackReason: audioResult.fallbackReason || null,
          processingTime: audioResult.processingTime || 0,
          // v2.0統計情報
          transcriptStats: audioResult.transcriptStats || null
        }
      };
      
      // TC206用: 音声処理の警告も統合
      if (audioResult.warnings && audioResult.warnings.length > 0) {
        result.warnings = [...(result.warnings || []), ...audioResult.warnings];
      }
      
      if (executionLogger) {
        executionLogger.logSuccess('RECORDING_COMPLETE_PROCESSING', {
          meetingId,
          meetingTopic,
          method: audioResult.method,
          processingTime: audioResult.processingTime,
          videoSaved: !!videoResult.success,
          audioProcessed: !!audioResult.success,
          fallbackUsed: !!audioResult.fallbackFromTranscript
        });
      }
      
      logger.info(`録画処理完了: ${meetingTopic} (${audioResult.method}: ${audioResult.processingTime || 0}ms)`);
      return result;
      
    } catch (error) {
      logger.error(`録画処理エラー: ${meetingTopic}`, error);
      
      if (executionLogger) {
        executionLogger.logError('RECORDING_PROCESSING_FAILED', 'E_STORAGE_UPLOAD_FAILED', error.message, {
          meetingId,
          meetingTopic,
          error: error.message
        });
      }
      
      return {
        success: false,
        meetingId,
        meetingTopic,
        error: error.message,
        processedAt: new Date().toISOString()
      };
    }
  }

  /**
   * 動画ファイルの処理 (取得 → Google Drive保存)
   * @param {Object} recording - 録画データ
   * @param {ExecutionLogger} executionLogger - 実行ログ
   * @returns {Promise<Object>} 動画処理結果 + videoBuffer（バッファリング用）
   */
  async processVideoFile(recording, executionLogger = null) {
    try {
      if (executionLogger) {
        executionLogger.startStep('VIDEO_PROCESSING');
      }
      
      // 動画ファイルを特定
      const videoFile = recording.recording_files.find(file => file.file_type === 'MP4');
      if (!videoFile) {
        // TC206-S2対応: 動画ファイルがない場合は警告付きで処理を継続
        logger.warn('MP4動画ファイルが見つかりません - 音声のみで処理を続行します');
        
        if (executionLogger) {
          executionLogger.logWarning('VIDEO_NOT_FOUND', {
            message: '動画ファイルが存在しませんでした',
            recordingId: recording.id,
            availableFiles: recording.recording_files?.map(f => f.file_type).join(', ')
          });
          // スキップ時は完了ではなく警告として記録（ログ表示改善）
          executionLogger.logWarning('VIDEO_PROCESSING_SKIPPED', {
            message: '動画ファイル処理をスキップしました',
            reason: 'No video file available'
          });
        }
        
        return {
          success: false,
          warning: '動画ファイルが存在しませんでした',
          videoBuffer: null,
          skipped: true
        };
      }
      
      logger.info(`動画ファイル取得開始: ${videoFile.file_name} (${Math.round(videoFile.file_size / 1024 / 1024)}MB)`);
      
      // 動画ファイルをメモリバッファとして取得
      const videoBuffer = await this.zoomService.downloadFileAsBuffer(videoFile.download_url);
      
      // Google Driveに実際のZoom録画を保存
      const meetingInfo = this.extractMeetingInfo(recording);
      const saveResult = await this.videoStorageService.saveZoomVideoBuffer(
        videoBuffer,
        videoFile.file_name,
        meetingInfo
      );
      
      if (executionLogger) {
        executionLogger.completeStep('VIDEO_PROCESSING', {
          fileName: videoFile.file_name,
          fileSize: videoFile.file_size,
          driveFileId: saveResult.fileId,
          shareLink: saveResult.shareLink
        });
      }
      
      logger.info(`動画保存完了: ${saveResult.fileName}`);
      
      return {
        success: true,
        fileName: videoFile.file_name,
        fileSize: videoFile.file_size,
        driveFileId: saveResult.fileId,
        shareLink: saveResult.viewLink,
        folderPath: saveResult.folderPath,
        videoBuffer: videoBuffer // バッファリング用に返す
      };
      
    } catch (error) {
      if (executionLogger) {
        executionLogger.errorStep('VIDEO_PROCESSING', 'E_STORAGE_UPLOAD_FAILED', error.message);
      }
      
      throw new Error(`動画処理エラー: ${error.message}`);
    }
  }

  /**
   * 音声ファイルの処理 (取得 → AI処理 → メモリ破棄)
   * 音声ファイルがない場合は動画ファイルから文字起こし
   * @param {Object} recording - 録画データ
   * @param {ExecutionLogger} executionLogger - 実行ログ
   * @param {Buffer} videoBuffer - 既に取得済みの動画バッファ（バッファリング使用）
   * @returns {Promise<Object>} 音声処理結果
   */
  async processAudioFile(recording, executionLogger = null, videoBuffer = null) {
    try {
      if (executionLogger) {
        executionLogger.startStep('AUDIO_PROCESSING');
      }
      
      // 音声ファイルを特定 (M4A > MP3 の優先順位)
      const audioFile = recording.recording_files.find(file => file.file_type === 'M4A') ||
                       recording.recording_files.find(file => file.file_type === 'MP3');
      
      if (audioFile) {
        // 通常の音声ファイル処理
        const audioFileName = audioFile.file_name || `audio_${recording.id}.${audioFile.file_type.toLowerCase()}`;
        
        logger.info(`音声ファイル取得開始: ${audioFileName} (${Math.round(audioFile.file_size / 1024 / 1024)}MB)`);
        
        // 音声ファイルをメモリバッファとして取得
        const audioBuffer = await this.zoomService.downloadFileAsBuffer(audioFile.download_url);
        
        // meetingInfoに動画ファイルの有無を追加（TC206-S2対応）
        const meetingInfo = this.extractMeetingInfo(recording);
        // TC206-S1と同様の方法: recording.recording_filesから動画ファイル存在を確認
        const hasVideoFile = recording.recording_files?.some(file => file.file_type === 'MP4');
        meetingInfo.hasVideoFile = hasVideoFile;
        
        // 【デバッグ】meetingInfo.duration値確認
        logger.info(`🔍 meetingInfo確認: duration=${meetingInfo.duration}分, topic=${meetingInfo.topic}`);
        
        // Gemini AIで文字起こし・要約処理
        const analysisResult = await this.audioSummaryService.processRealAudioBuffer(
          audioBuffer,
          audioFileName,
          meetingInfo
        );
        
        // 【修正】文字起こし文字数取得を改善
        let transcriptionLength = 0;
        let transcriptionData = null;
        
        if (analysisResult.transcription) {
          // チャンク処理の場合: 文字列として統合済み
          if (typeof analysisResult.transcription === 'string') {
            transcriptionLength = analysisResult.transcription.length;
            transcriptionData = analysisResult.transcription;
          }
          // 通常処理の場合: オブジェクト構造
          else if (analysisResult.transcription.transcription) {
            transcriptionLength = analysisResult.transcription.transcription.length;
            transcriptionData = analysisResult.transcription;
          } else {
            logger.warn('⚠️ 予期しない文字起こしデータ構造:', typeof analysisResult.transcription);
          }
        }
        
        if (executionLogger) {
          executionLogger.completeStep('AUDIO_PROCESSING', {
            fileName: audioFileName,
            fileSize: audioFile.file_size,
            transcriptionLength: transcriptionLength,
            summaryGenerated: !!analysisResult.structuredSummary
          });
        }
        
        logger.info(`音声処理完了: 文字起こし${transcriptionLength}文字`);
        
        return {
          success: true,
          fileName: audioFile.file_name,
          transcription: transcriptionData,
          summary: analysisResult.structuredSummary,
          processingTime: analysisResult.processingTime || 0
        };
      }
      
      // 音声ファイルがない場合：動画バッファから文字起こし
      logger.info('音声ファイルが見つからないため、動画バッファから文字起こしを実行');
      
      if (!videoBuffer) {
        throw new Error('音声ファイルなし、かつ動画バッファも提供されていません');
      }
      
      // 動画ファイルの存在確認
      const videoFile = recording.recording_files.find(file => file.file_type === 'MP4');
      if (!videoFile) {
        throw new Error('音声ファイルがなく、動画ファイル(MP4)も見つかりません');
      }
      
      const videoFileName = videoFile.file_name || `video_${recording.id}.mp4`;
      logger.info(`動画バッファから文字起こし開始: ${videoFileName}`);
      
      // 動画バッファからAI処理（音声ファイルがない場合の代替処理）
      const analysisResult = await this.audioSummaryService.processVideoAsAudio(
        videoBuffer,
        videoFileName,
        this.extractMeetingInfo(recording)
      );
      
      if (executionLogger) {
        executionLogger.completeStep('AUDIO_PROCESSING', {
          fileName: videoFileName,
          fileSize: videoBuffer.length,
          transcription: analysisResult.transcription,
          summary: analysisResult.structuredSummary,
          processingTime: analysisResult.processingTime,
          processedFrom: 'video'
        });
      }
      
      logger.info(`動画から音声処理完了: 文字起こし${analysisResult.transcription?.length || 0}文字`);
      
      return {
        success: true,
        fileName: videoFileName,
        transcription: analysisResult.transcription,
        summary: analysisResult.structuredSummary,
        processingTime: analysisResult.processingTime || 0,
        processedFrom: 'video'
      };
      
    } catch (error) {
      if (executionLogger) {
        executionLogger.errorStep('AUDIO_PROCESSING', 'AI003', error.message);
      }
      
      throw new Error(`音声処理エラー: ${error.message}`);
    }
  }

  /**
   * 動画ファイルから音声処理を実行（音声ファイルがない場合のフォールバック）
   * @param {Object} videoFile - 動画ファイル情報
   * @param {Object} recording - Zoom録画データ
   * @param {ExecutionLogger} executionLogger - 実行ログ
   * @returns {Promise<Object>} 処理結果
   */
  async processVideoAsAudio(videoFile, recording, executionLogger = null) {
    try {
      const videoFileName = videoFile.file_name || `video_${recording.id}.mp4`;
      
      logger.info(`動画ファイルから音声処理開始: ${videoFileName} (${Math.round(videoFile.file_size / 1024 / 1024)}MB)`);
      
      if (executionLogger) {
        executionLogger.logInfo('VIDEO_TO_AUDIO_PROCESSING', {
          fileName: videoFileName,
          fileSize: videoFile.file_size,
          reason: '音声ファイルが存在しないため動画から処理'
        });
      }
      
      // 動画ファイルをメモリバッファとして取得
      const videoBuffer = await this.zoomService.downloadFileAsBuffer(videoFile.download_url);
      
      // Gemini AIで動画から直接文字起こし・要約処理
      // 注：Gemini 2.0以降は動画ファイルも直接処理可能
      const analysisResult = await this.audioSummaryService.processVideoBuffer(
        videoBuffer,
        videoFileName,
        this.extractMeetingInfo(recording)
      );
      
      if (executionLogger) {
        executionLogger.completeStep('AUDIO_PROCESSING', {
          fileName: videoFileName,
          fileSize: videoFile.file_size,
          processedAs: 'video',
          transcriptionLength: analysisResult.transcription?.length || 0,
          summaryGenerated: !!analysisResult.structuredSummary
        });
      }
      
      logger.info(`動画からの音声処理完了: 文字起こし${analysisResult.transcription?.length || 0}文字`);
      
      return {
        success: true,
        fileName: videoFileName,
        fileSize: videoFile.file_size,
        processedFromVideo: true,  // 動画から処理したことを明示
        transcription: analysisResult.transcription,
        summary: analysisResult.structuredSummary,
        processingTime: analysisResult.processingTime
      };
      
    } catch (error) {
      if (executionLogger) {
        executionLogger.errorStep('VIDEO_TO_AUDIO_PROCESSING', 'AI004', error.message);
      }
      
      throw new Error(`動画からの音声処理エラー: ${error.message}`);
    }
  }

  /**
   * Zoom録画データから会議情報を抽出・正規化
   * @param {Object} recording - Zoom録画データ
   * @returns {Object} 正規化された会議情報
   */
  extractMeetingInfo(recording) {
    const startTime = new Date(recording.start_time);
    
    return {
      id: recording.id || recording.uuid,
      uuid: recording.uuid,
      topic: recording.topic || 'Untitled Meeting',
      start_time: recording.start_time,
      duration: recording.duration || 0,
      hostName: recording.host_email ? recording.host_email.split('@')[0] : 'unknown',
      hostEmail: recording.host_email || 'unknown',
      participantCount: recording.participant_count || 0,
      recordingStart: recording.recording_start,
      recordingEnd: recording.recording_end,
      totalSize: recording.total_size || 0,
      recordingCount: recording.recording_count || 0,
      shareUrl: recording.share_url || '',
      // フォルダパス用の日付情報
      year: startTime.getFullYear(),
      month: String(startTime.getMonth() + 1).padStart(2, '0'),
      dateString: startTime.toISOString().split('T')[0]
    };
  }

  /**
   * v2.0: TranscriptService統合処理
   * Transcript APIを試行し、失敗時はフォールバックを指示
   */
  async tryTranscriptProcessing(recording, meetingInfo, executionLogger = null) {
    try {
      // TranscriptService初期化
      const TranscriptService = require('./transcriptService');
      const transcriptService = new TranscriptService({
        aiService: this.audioSummaryService.aiService,
        zoomService: this.zoomService,
        fallbackEnabled: true
      });

      if (executionLogger) {
        executionLogger.startStep('TRANSCRIPT_PROCESSING');
      }

      logger.info('v2.0 Transcript API処理開始');
      
      // Transcript処理実行
      const transcriptResult = await transcriptService.processTranscript(recording, meetingInfo);
      
      if (transcriptResult.success) {
        // Transcript成功時
        if (executionLogger) {
          executionLogger.logSuccess('TRANSCRIPT_PROCESSING_COMPLETE', {
            method: transcriptResult.method,
            processingTime: transcriptResult.processingStats?.totalTime,
            participantCount: transcriptResult.transcript?.participants?.length || 0,
            segmentCount: transcriptResult.transcript?.segments?.length || 0
          });
        }

        logger.info(`Transcript処理成功: ${transcriptResult.processingStats?.totalTime || 0}ms`);
        
        // AudioSummaryServiceの戻り値形式に合わせて変換
        return {
          success: true,
          method: 'transcript-api',
          fileName: 'transcript.vtt',
          transcription: {
            transcription: transcriptResult.transcript.fullText,
            meetingInfo: meetingInfo,
            fileName: 'transcript.vtt',
            timestamp: new Date().toISOString(),
            participants: transcriptResult.transcript.participants,
            segments: transcriptResult.transcript.segments,
            processingTime: transcriptResult.processingStats?.totalTime || 0
          },
          summary: transcriptResult.structuredSummary,
          processingTime: transcriptResult.processingStats?.totalTime || 0,
          // v2.0追加情報
          transcriptStats: transcriptResult.processingStats,
          requiresFallback: false
        };

      } else if (transcriptResult.requiresFallback) {
        // フォールバック必要時
        logger.warn(`Transcript処理失敗、フォールバック実行: ${transcriptResult.reason}`);
        
        if (executionLogger) {
          executionLogger.logWarning('TRANSCRIPT_FALLBACK_REQUIRED', {
            reason: transcriptResult.reason,
            errorCode: transcriptResult.errorCode
          });
        }

        return {
          success: false,
          requiresFallback: true,
          fallbackReason: transcriptResult.reason,
          method: 'fallback-to-audio'
        };

      } else {
        // その他のエラー
        logger.error(`Transcript処理エラー: ${transcriptResult.error}`);
        
        if (executionLogger) {
          executionLogger.logError('TRANSCRIPT_PROCESSING_FAILED', transcriptResult.errorCode || 'TS-999', transcriptResult.error);
        }

        return {
          success: false,
          requiresFallback: true,
          fallbackReason: 'transcript_error',
          error: transcriptResult.error
        };
      }

    } catch (error) {
      logger.error('TranscriptService統合エラー:', error);
      
      if (executionLogger) {
        executionLogger.logError('TRANSCRIPT_INTEGRATION_ERROR', 'TS-999', error.message);
      }

      // 予期しないエラー時もフォールバック
      return {
        success: false,
        requiresFallback: true,
        fallbackReason: 'integration_error',
        error: error.message
      };
    }
  }

  /**
   * 複数録画の一括処理 (シーケンシャル)
   * @param {Array} recordings - 録画データ配列
   * @param {ExecutionLogger} executionLogger - 実行ログ
   * @param {number} maxRecordings - 最大処理件数（制限用）
   * @returns {Promise<Object>} 一括処理結果
   */
  async processBatchRecordings(recordings, executionLogger = null, maxRecordings = 5) {
    const limitedRecordings = recordings.slice(0, maxRecordings);
    const results = {
      total: limitedRecordings.length,
      successful: 0,
      failed: 0,
      results: []
    };
    
    logger.info(`一括処理開始: ${limitedRecordings.length}件の録画を処理`);
    
    for (let i = 0; i < limitedRecordings.length; i++) {
      const recording = limitedRecordings[i];
      
      try {
        logger.info(`[${i + 1}/${limitedRecordings.length}] 録画処理: ${recording.topic}`);
        
        const result = await this.processRecording(recording, executionLogger);
        results.results.push(result);
        
        if (result.success) {
          results.successful++;
        } else {
          results.failed++;
        }
        
        // 処理間隔 (Zoom APIレート制限対策)
        if (i < limitedRecordings.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        logger.error(`録画処理エラー [${i + 1}/${limitedRecordings.length}]:`, error);
        results.failed++;
        results.results.push({
          success: false,
          meetingId: recording.id || recording.uuid,
          meetingTopic: recording.topic || 'Unknown',
          error: error.message
        });
      }
    }
    
    logger.info(`一括処理完了: 成功${results.successful}件, 失敗${results.failed}件`);
    
    return results;
  }
}

module.exports = ZoomRecordingService;