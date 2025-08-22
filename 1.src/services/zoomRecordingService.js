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
      
      // Step 2: 音声ファイル処理 (取得 → AI処理 → メモリ破棄)
      const audioResult = await this.processAudioFile(recording, executionLogger);
      
      // Step 3: 文書保存処理 (文字起こし・要約をGoogle Driveに保存)
      let documentResult = null;
      if (audioResult.success && audioResult.transcription && audioResult.summary) {
        try {
          if (executionLogger) {
            executionLogger.startStep('DOCUMENT_STORAGE');
          }
          
          const documentStorageService = new DocumentStorageService();
          const meetingInfo = this.extractMeetingInfo(recording);
          
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
        meetingInfo: this.extractMeetingInfo(recording),
        video: videoResult,
        audio: audioResult,
        documents: documentResult,
        // Slack通知用フィールド
        summary: audioResult.summary,
        driveLink: videoResult.driveLink,
        processedAt: new Date().toISOString()
      };
      
      if (executionLogger) {
        executionLogger.logSuccess('RECORDING_COMPLETE_PROCESSING', {
          meetingId,
          meetingTopic,
          videoSaved: !!videoResult.success,
          audioProcessed: !!audioResult.success
        });
      }
      
      logger.info(`録画処理完了: ${meetingTopic}`);
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
   * @returns {Promise<Object>} 動画処理結果
   */
  async processVideoFile(recording, executionLogger = null) {
    try {
      if (executionLogger) {
        executionLogger.startStep('VIDEO_PROCESSING');
      }
      
      // 動画ファイルを特定
      const videoFile = recording.recording_files.find(file => file.file_type === 'MP4');
      if (!videoFile) {
        throw new Error('MP4動画ファイルが見つかりません');
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
        folderPath: saveResult.folderPath
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
   * @param {Object} recording - 録画データ
   * @param {ExecutionLogger} executionLogger - 実行ログ
   * @returns {Promise<Object>} 音声処理結果
   */
  async processAudioFile(recording, executionLogger = null) {
    try {
      if (executionLogger) {
        executionLogger.startStep('AUDIO_PROCESSING');
      }
      
      // 音声ファイルを特定 (M4A > MP3 の優先順位)
      const audioFile = recording.recording_files.find(file => file.file_type === 'M4A') ||
                       recording.recording_files.find(file => file.file_type === 'MP3');
      
      if (!audioFile) {
        throw new Error('音声ファイル(M4A/MP3)が見つかりません');
      }
      
      // ファイル名のフォールバック処理
      const audioFileName = audioFile.file_name || `audio_${recording.id}.${audioFile.file_type.toLowerCase()}`;
      
      logger.info(`音声ファイル取得開始: ${audioFileName} (${Math.round(audioFile.file_size / 1024 / 1024)}MB)`);
      
      // 音声ファイルをメモリバッファとして取得
      const audioBuffer = await this.zoomService.downloadFileAsBuffer(audioFile.download_url);
      
      // Gemini AIで文字起こし・要約処理
      const analysisResult = await this.audioSummaryService.processRealAudioBuffer(
        audioBuffer,
        audioFileName,
        this.extractMeetingInfo(recording)
      );
      
      if (executionLogger) {
        executionLogger.completeStep('AUDIO_PROCESSING', {
          fileName: audioFileName,
          fileSize: audioFile.file_size,
          transcriptionLength: analysisResult.transcription?.transcription?.length || 0,
          summaryGenerated: !!analysisResult.structuredSummary
        });
      }
      
      logger.info(`音声処理完了: 文字起こし${analysisResult.transcription?.transcription?.length || 0}文字`);
      
      // メモリからaudioBufferを明示的に解放
      // (JavaScriptのGCに頼るが、参照をnullにして解放を促進)
      
      return {
        success: true,
        fileName: audioFile.file_name,
        fileSize: audioFile.file_size,
        transcription: analysisResult.transcription,
        summary: analysisResult.structuredSummary,
        processingTime: analysisResult.processingTime
      };
      
    } catch (error) {
      if (executionLogger) {
        executionLogger.errorStep('AUDIO_PROCESSING', 'AI003', error.message);
      }
      
      throw new Error(`音声処理エラー: ${error.message}`);
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