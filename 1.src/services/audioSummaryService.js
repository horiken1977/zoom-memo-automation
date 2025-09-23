const AIService = require('./aiService');
const AudioCompressionService = require('./audioCompressionService');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class AudioSummaryService {
  constructor() {
    this.aiService = new AIService();
    this.audioCompressionService = new AudioCompressionService();
  }

  /**
   * 動画バッファをGeminiで文字起こし＆要約処理（Vercel環境用）
   * @param {Buffer} videoBuffer - 動画ファイルのBuffer
   * @param {string} fileName - ファイル名
   * @param {Object} meetingInfo - 会議情報
   * @returns {Object} 文字起こしと要約の結果
   */
  async processVideoBuffer(videoBuffer, fileName, meetingInfo) {
    try {
      logger.info(`Processing video buffer: ${fileName} (${videoBuffer.length} bytes)`);

      // バッファサイズ確認
      logger.info(`Video buffer size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

      // 動画ファイル形式を検証（ファイル名から）
      if (!fileName.toLowerCase().endsWith('.mp4')) {
        throw new Error(`Unsupported video format: ${fileName}. Only MP4 is supported.`);
      }

      // Gemini AIで動画から直接文字起こし・要約処理
      // 注：Gemini 2.0以降は動画ファイルも直接処理可能
      return await this.processRealVideoBuffer(videoBuffer, fileName, meetingInfo);

    } catch (error) {
      logger.error('Failed to process video buffer:', error.message);
      throw error;
    }
  }

  /**
   * 実際の動画バッファを処理（Vercel環境用）
   * Gemini 2.0以降対応
   */
  async processRealVideoBuffer(videoBuffer, fileName, meetingInfo) {
    const startTime = Date.now();
    const debugTimer = (step, detail = '') => {
      const elapsed = Date.now() - startTime;
      logger.info(`🎬 VideoSummaryService [${elapsed}ms] ${step} ${detail}`);
      return elapsed;
    };

    try {
      debugTimer('processRealVideoBuffer開始', `fileName: ${fileName}, bufferSize: ${videoBuffer.length}`);
      
      // Gemini AIサービス初期化
      debugTimer('Step 1: AI Service初期化');
      const modelName = await this.aiService.initializeModel();
      debugTimer('Step 1: AI Service初期化完了', `model: ${modelName}`);
      
      // 動画ファイルから文字起こし
      debugTimer('Step 2: 動画文字起こし開始');
      const transcriptionResult = await this.aiService.transcribeVideoBuffer(
        videoBuffer,
        fileName
      );
      const transcriptionTime = debugTimer('Step 2: 動画文字起こし完了', 
        `文字数: ${transcriptionResult?.transcription?.length || 0}`
      );
      
      // 文字起こしから要約生成
      debugTimer('Step 3: 構造化要約生成開始');
      const summaryResult = await this.generateStructuredSummary(
        transcriptionResult
      );
      const summaryTime = debugTimer('Step 3: 構造化要約生成完了');
      
      const totalTime = Date.now() - startTime;
      debugTimer('processRealVideoBuffer完了', `総処理時間: ${totalTime}ms`);
      
      return {
        transcription: transcriptionResult,
        structuredSummary: summaryResult,
        processingTime: {
          transcription: transcriptionTime,
          summary: summaryTime,
          total: totalTime
        },
        processedFrom: 'video',
        fileName: fileName,
        fileSize: videoBuffer.length,
        model: modelName
      };
      
    } catch (error) {
      const elapsed = Date.now() - startTime;
      logger.error(`🎬 VideoSummaryService [${elapsed}ms] エラー:`, error.message);
      throw error;
    }
  }

  /**
   * 音声バッファをGeminiで文字起こし＆要約処理（Vercel環境用）
   * @param {Buffer} audioBuffer - 音声ファイルのBuffer
   * @param {string} fileName - ファイル名
   * @param {Object} meetingInfo - 会議情報
   * @returns {Object} 文字起こしと要約の結果
   */
  async processAudioBuffer(audioBuffer, fileName, meetingInfo) {
    try {
      logger.info(`Processing audio buffer: ${fileName} (${audioBuffer.length} bytes)`);

      // バッファサイズ確認
      logger.info(`Audio buffer size: ${(audioBuffer.length / 1024).toFixed(2)} KB`);

      // 音声ファイル形式を検証（ファイル名から）
      this.validateAudioFileByName(fileName);

      // 実際の音声バッファ処理
      return await this.processRealAudioBuffer(audioBuffer, fileName, meetingInfo);

    } catch (error) {
      logger.error('Failed to process audio buffer:', error.message);
      throw error;
    }
  }

  /**
   * 音声ファイルをGeminiで文字起こし＆要約処理
   * @param {string} audioFilePath - 音声ファイルのパス
   * @param {Object} meetingInfo - 会議情報
   * @returns {Object} 文字起こしと要約の結果
   */
  async processAudioFile(audioFilePath, meetingInfo) {
    try {
      logger.info(`Processing audio file: ${audioFilePath}`);

      // ファイル存在確認
      try {
        await fs.access(audioFilePath);
      } catch (error) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      // ファイルサイズ確認
      const stats = await fs.stat(audioFilePath);
      logger.info(`Audio file size: ${(stats.size / 1024).toFixed(2)} KB`);

      // 音声ファイル形式を検証
      this.validateAudioFile(audioFilePath);

      // 実際の音声ファイル処理
      return await this.processRealAudioFile(audioFilePath, meetingInfo);

    } catch (error) {
      logger.error('Failed to process audio file:', error.message);
      throw error;
    }
  }

  /**
   * 実際の音声バッファを処理（Vercel環境用）
   */
  async processRealAudioBuffer(audioBuffer, fileName, meetingInfo) {
    const startTime = Date.now();
    const debugTimer = (step, detail = '') => {
      const elapsed = Date.now() - startTime;
      logger.info(`🔧 AudioSummaryService [${elapsed}ms] ${step} ${detail}`);
      
      // Phase1: 処理時間警告システム（60分会議用に調整）
      if (elapsed > 180000) { // 3分経過で警告（60分会議用調整）
        logger.warn(`⚠️ Processing time warning: ${(elapsed/1000).toFixed(1)}s - approaching timeout`);
      }
      
      return elapsed;
    };

    try {
      debugTimer('processRealAudioBuffer開始', `fileName: ${fileName}, bufferSize: ${audioBuffer.length}`);
      
      // 【Phase A+B統合】タイムアウト検出システム：大容量音声の自動チャンク分割
      const audioSizeMB = audioBuffer.length / (1024 * 1024);
      const estimatedDuration = meetingInfo.duration || (audioSizeMB * 60); // 1MB≒1分と仮定
      
      // チャンク分割条件判定（複数条件でチェック）
      const shouldUseChunking = 
        audioSizeMB > 20 ||                    // 20MB超過
        estimatedDuration > 1200 ||            // 20分超過
        (audioSizeMB > 15 && estimatedDuration > 900); // 15MB&15分超過
      
      if (shouldUseChunking) {
        logger.info(`🎯 大容量音声検出: ${audioSizeMB.toFixed(1)}MB (推定${Math.round(estimatedDuration/60)}分) → チャンク分割処理に切り替え`);
        return await this.processAudioInChunks(audioBuffer, fileName, meetingInfo);
      }
      
      logger.info(`📦 標準処理: ${audioSizeMB.toFixed(1)}MB (推定${Math.round(estimatedDuration/60)}分) → 通常処理を実行`);
      
      // Phase1: Slack通知用の処理時間監視（60分会議用に調整）
      const shouldSendTimeoutWarning = async (currentTime) => {
        const elapsed = currentTime - startTime;
        if (elapsed > 210000) { // 3.5分経過でSlack警告（60分会議用調整）
          try {
            const SlackService = require('./slackService');
            const slackService = new SlackService();
            await slackService.sendTimeoutWarning(meetingInfo, elapsed);
          } catch (slackError) {
            logger.warn('Failed to send timeout warning to Slack:', slackError.message);
          }
        }
      };
      
      // 0. 音声圧縮処理（文字起こし精度向上のため）
      debugTimer('Step 0: 音声圧縮処理開始');
      let processedAudioBuffer = audioBuffer;
      let compressionStats = null;
      let qualityCheckResult = null;
      
      // 0-1. 音声品質チェック
      debugTimer('Step 0-1: 音声品質チェック開始');
      qualityCheckResult = await this.checkAudioQuality(audioBuffer);
      debugTimer('Step 0-1: 音声品質チェック完了', `品質低下: ${qualityCheckResult.isLowQuality}, RMS: ${qualityCheckResult.averageRMS?.toFixed(4) || 'N/A'}`);
      
      // 音声品質が低い場合は警告を出力（ただし処理は継続）
      if (qualityCheckResult.isLowQuality) {
        const { ErrorManager } = require('../utils/errorCodes');
        const warningInfo = ErrorManager.createError('E_AUDIO_QUALITY_WARNING', {
          meetingTopic: meetingInfo?.topic || 'Unknown',
          fileName: fileName,
          qualityDetails: qualityCheckResult.details
        });
        
        logger.warn('⚠️ 音声品質警告が検出されました:', warningInfo);
        
        // 動画から音声を再抽出する処理をここに追加可能
        // TODO: VideoStorageServiceと連携して動画から音声を再抽出
        // const videoService = new VideoStorageService();
        // if (meetingInfo.videoAvailable) {
        //   processedAudioBuffer = await videoService.extractAudioFromVideo(meetingInfo.videoPath);
        //   logger.info('動画から音声を再抽出しました');
        // }
      }
      
      // 0-2. 音声圧縮処理
      if (this.audioCompressionService.shouldCompress(audioBuffer.length)) {
        logger.info('🗜️ 大容量音声ファイル検出 - 最高レベル圧縮を実行');
        const compressionResult = await this.audioCompressionService.compressAudioBuffer(audioBuffer, fileName);
        processedAudioBuffer = compressionResult.compressedBuffer;
        compressionStats = compressionResult;
        debugTimer('Step 0: 音声圧縮完了', `圧縮率: ${compressionResult.compressionRatio}%, ${Math.round(compressionResult.originalSize/1024/1024*100)/100}MB → ${Math.round(compressionResult.compressedSize/1024/1024*100)/100}MB`);
      } else {
        debugTimer('Step 0: 音声圧縮スキップ', '10MB未満のため圧縮不要');
      }
      
      // Phase1: タイムアウト警告チェック
      await shouldSendTimeoutWarning(Date.now());
      
      // 【新】2段階フロー Step 1: 音声→文字起こし
      debugTimer('Step 1: processAudioTranscription開始（音声→文字起こし）');
      logger.info('Starting transcription-only processing with Gemini...');
      
      const transcriptionResult = await this.aiService.processAudioTranscription(processedAudioBuffer, meetingInfo);
      debugTimer('Step 1: processAudioTranscription完了', `transcription length: ${transcriptionResult?.transcription?.length || 0}`);
      
      // 文字起こし結果の検証
      if (!transcriptionResult || !transcriptionResult.transcription || transcriptionResult.transcription.length < 50) {
        throw new Error('Transcription failed or too short');
      }

      // Phase2: タイムアウト警告チェック
      await shouldSendTimeoutWarning(Date.now());
      
      // 【新】2段階フロー Step 2: 文字起こし→要約
      debugTimer('Step 2: generateSummaryFromTranscription開始（文字起こし→要約）');
      logger.info('Starting summary generation from transcription...');
      
      const summaryResult = await this.aiService.generateSummaryFromTranscription(
        transcriptionResult.transcription, 
        meetingInfo
      );
      debugTimer('Step 2: generateSummaryFromTranscription完了', `summary generated: ${!!summaryResult?.structuredSummary}`);

      // 要約結果の検証
      if (!summaryResult || !summaryResult.structuredSummary) {
        throw new Error('Summary generation failed');
      }

      const structuredSummary = summaryResult.structuredSummary;

      // 3. 結果の検証
      debugTimer('Step 3: validateProcessingResult開始');
      this.validateProcessingResult({ 
        transcription: {
          transcription: transcriptionResult.transcription,
          fileName: fileName,
          timestamp: transcriptionResult.timestamp
        }, 
        structuredSummary: structuredSummary 
      });
      debugTimer('Step 3: validateProcessingResult完了');
      
      const totalTime = debugTimer('processRealAudioBuffer完了');
      
      // TC206対応: warnings配列を追加
      const warnings = [];
      
      // TC206-S3: 音声品質低下の場合
      if (qualityCheckResult && qualityCheckResult.isLowQuality) {
        warnings.push('音声ファイルの品質が低い状態でした');
        warnings.push('代替処理: 品質チェックを実施しましたが、処理を継続しました');
        warnings.push('推奨: 動画ファイルから高品質音声を再抽出することを検討してください');
      }
      
      // TC206-S2: 動画なし・音声のみの場合の警告
      // meetingInfoから動画ファイルの有無を確認
      if (meetingInfo && meetingInfo.hasVideoFile === false) {
        warnings.push('動画ファイルが存在しませんでした');
        warnings.push('代替処理: 音声ファイルのみで文字起こし・要約を実行しました');
        warnings.push('注意事項: 画面共有の内容は含まれていません');
      }
      
      return {
        status: 'success',
        transcription: {
          transcription: transcriptionResult.transcription,
          meetingInfo: transcriptionResult.meetingInfo,
          fileName: fileName,
          timestamp: transcriptionResult.timestamp,
          audioBufferSize: audioBuffer.length,
          model: transcriptionResult.model,
          processingTime: transcriptionResult.processingTime
        },
        structuredSummary: structuredSummary, // TC203で期待される構造
        analysis: structuredSummary,
        audioFileName: fileName,
        audioBufferSize: audioBuffer.length,
        processedAudioBufferSize: processedAudioBuffer.length,
        compressionStats: compressionStats, // 圧縮統計情報
        qualityCheckResult: qualityCheckResult, // 音声品質チェック結果
        warnings: warnings.length > 0 ? warnings : undefined, // TC206対応
        meetingInfo: meetingInfo,
        processedAt: new Date().toISOString(),
        totalProcessingTime: totalTime,
        // 2段階AI処理の追加情報
        flowType: '2-stage-processing', // 1回→2回のAPI呼び出し分離
        transcriptionTime: transcriptionResult.processingTime,
        summaryTime: summaryResult.processingTime,
        separatedProcessing: true,
        // Phase A+B改善情報
        phaseABImprovements: {
          maxOutputTokens: 65536,
          timeoutWarning: totalTime > 180000, // 3分に調整
          slackNotification: true,
          chunkingAvailable: true, // チャンク分割対応済み
          autoChunkingThreshold: `${audioSizeMB.toFixed(1)}MB < 20MB`
        }
      };

    } catch (error) {
      const elapsed = Date.now() - startTime;
      logger.error(`Failed to process real audio buffer after ${elapsed}ms:`, error.message);
      
      // Phase A+B: エラー時のフォールバック情報
      if (error.message.includes('TOKEN') || error.message.includes('limit')) {
        logger.error('🔴 Token limit exceeded - チャンク分割処理を推奨');
      }
      if (elapsed > 290000) {
        logger.error('🔴 Processing timeout - チャンク分割処理が必要');
      }
      
      throw error;
    }
  }

  /**
   * Phase A+B: 音声チャンク分割処理（大容量音声対応）
   */
  async processAudioInChunks(audioBuffer, fileName, meetingInfo) {
    const startTime = Date.now();
    const AudioChunkService = require('./audioChunkService');
    
    const debugTimer = (step, detail = '') => {
      const elapsed = Date.now() - startTime;
      logger.info(`🔧 ChunkedAudioProcessor [${elapsed}ms] ${step} ${detail}`);
      
      // タイムアウト警告（Phase A+B統合）
      if (elapsed > 180000) { // 3分警告
        logger.warn(`⚠️ チャンク処理時間警告: ${(elapsed/1000).toFixed(1)}s - タイムアウト接近中`);
      }
      
      return elapsed;
    };

    try {
      debugTimer('音声チャンク分割処理開始', `fileName: ${fileName}, bufferSize: ${audioBuffer.length}`);
      
      // Phase A+B: タイムアウト早期検出
      const estimatedProcessingTime = this.estimateChunkProcessingTime(audioBuffer, meetingInfo);
      if (estimatedProcessingTime > 240000) { // 4分予測
        logger.warn(`⚠️ 処理時間予測: ${estimatedProcessingTime/1000}秒 - 高速モードに切り替え`);
        meetingInfo.fastMode = true;
      }
      
      // Step 1: 音声分割
      debugTimer('Step 1: 音声分割開始');
      const chunkService = new AudioChunkService();
      const splittingResult = chunkService.splitAudioByTime(audioBuffer, null, meetingInfo);
      const { chunks, metadata } = splittingResult;
      
      // 分割妥当性検証
      const validation = chunkService.validateChunks(chunks);
      if (!validation.isValid) {
        throw new Error(`音声分割検証失敗: ${validation.errors.join(', ')}`);
      }
      
      if (validation.warnings.length > 0) {
        logger.warn('🚨 分割警告:', validation.warnings);
      }
      
      debugTimer('Step 1: 音声分割完了', `${chunks.length}チャンク生成`);
      
      // Step 2: チャンク順次処理
      debugTimer('Step 2: チャンク処理開始');
      const chunkResults = [];
      let successCount = 0;
      let failureCount = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkStartTime = Date.now();
        
        // タイムアウトチェック（Phase A+B統合）
        const totalElapsed = Date.now() - startTime;
        if (totalElapsed > 250000) { // 250秒で緊急停止
          logger.error(`🚨 緊急タイムアウト停止: チャンク${i+1}/${chunks.length}で中断`);
          break;
        }
        
        try {
          logger.info(`⚡ チャンク${i+1}/${chunks.length}処理開始: ${Math.round(chunk.startTime/60)}:${Math.round(chunk.startTime%60).toString().padStart(2,'0')}-${Math.round(chunk.endTime/60)}:${Math.round(chunk.endTime%60).toString().padStart(2,'0')}`);
          
          // 個別チャンク処理
          const chunkResult = await this.processIndividualChunk(chunk, i, meetingInfo);
          
          chunkResults.push({
            success: true,
            chunkIndex: i,
            timeRange: [chunk.startTime, chunk.endTime],
            data: chunkResult,
            processingTime: Date.now() - chunkStartTime
          });
          
          successCount++;
          logger.info(`✅ チャンク${i+1}完了: ${Date.now() - chunkStartTime}ms`);
          
        } catch (chunkError) {
          logger.error(`❌ チャンク${i+1}処理失敗:`, chunkError.message);
          
          // フォールバック結果生成
          chunkResults.push({
            success: false,
            chunkIndex: i,
            timeRange: [chunk.startTime, chunk.endTime],
            error: chunkError.message,
            fallback: this.createChunkFallback(chunk, i, chunkError)
          });
          
          failureCount++;
        }
      }
      
      debugTimer('Step 2: チャンク処理完了', `成功:${successCount}, 失敗:${failureCount}`);
      
      // Step 3: 結果統合
      debugTimer('Step 3: 結果統合開始');
      const mergedResult = await this.mergeChunkResults(chunkResults, metadata);
      debugTimer('Step 3: 結果統合完了');
      
      const totalTime = debugTimer('音声チャンク分割処理完了');
      
      return {
        ...mergedResult,
        // Phase A+B メタデータ
        chunkedProcessing: true,
        chunkMetadata: {
          totalChunks: chunks.length,
          successfulChunks: successCount,
          failedChunks: failureCount,
          completionRate: Math.round(successCount / chunks.length * 100),
          totalProcessingTime: totalTime,
          ...metadata
        },
        warnings: mergedResult.warnings || []
      };
      
    } catch (error) {
      const elapsed = Date.now() - startTime;
      logger.error(`チャンク分割処理失敗 after ${elapsed}ms:`, error.message);
      
      // 緊急フォールバック
      throw new Error(`Chunked audio processing failed: ${error.message}`);
    }
  }

  /**
   * 個別チャンク処理
   */
  async processIndividualChunk(chunk, chunkIndex, meetingInfo) {
    // 高速モード対応（Phase A+B）
    const processingOptions = {
      maxRetries: meetingInfo.fastMode ? 2 : 5,
      mimeType: 'audio/aac'
    };
    
    // チャンク用のmeetingInfo作成
    const chunkMeetingInfo = {
      ...meetingInfo,
      topic: `${meetingInfo.topic || 'Unknown'} (チャンク${chunkIndex + 1})`,
      duration: chunk.duration,
      chunkInfo: {
        index: chunkIndex,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        isFirst: chunk.isFirst,
        isLast: chunk.isLast
      }
    };
    
    // 【修正】2段階フロー強制実装：文字起こし失敗時は要約生成を停止
    try {
      // Step 1: チャンク文字起こし（必須・失敗時は即中断）
      logger.info(`Starting transcription-only processing for: ${chunkMeetingInfo.topic}`);
      const transcriptionResult = await this.aiService.processAudioTranscription(
        chunk.data, 
        chunkMeetingInfo,
        processingOptions
      );
      
      // 【強制チェック】文字起こし結果の厳密な検証
      if (!transcriptionResult || !transcriptionResult.transcription || transcriptionResult.transcription.length < 10) {
        throw new Error(`Chunk transcription failed or too short: ${transcriptionResult?.transcription?.length || 0} characters`);
      }
      
      logger.info(`Transcription successful: ${transcriptionResult.transcription.length} characters`);
      
      // Step 2: チャンク要約生成（文字起こし成功時のみ実行）
      logger.info(`Starting summary generation from transcription (${transcriptionResult.transcription.length} chars) for: ${chunkMeetingInfo.topic}`);
      const summaryResult = await this.aiService.generateSummaryFromTranscription(
        transcriptionResult.transcription,
        chunkMeetingInfo,
        processingOptions
      );
      
      // 【強制チェック】要約結果の厳密な検証
      if (!summaryResult || !summaryResult.structuredSummary) {
        throw new Error('Chunk summary generation failed - no structured summary returned');
      }
      
      logger.info('Summary generation successful');
      
      // 2段階フロー結果を統合
      return {
        transcription: transcriptionResult.transcription,
        structuredSummary: summaryResult.structuredSummary,
        processingTime: transcriptionResult.processingTime + summaryResult.processingTime,
        model: transcriptionResult.model,
        timestamp: summaryResult.timestamp,
        chunkIndex,
        flowType: '2-stage-chunk-processing'
      };
      
    } catch (error) {
      // 【修正】フォールバック削除 - 2段階フロー強制実装
      logger.error(`チャンク${chunkIndex + 1} 2段階処理失敗 - 処理中断: ${error.message}`);
      
      // 文字起こし失敗時は要約生成をスキップして明確にエラーを返す
      throw new Error(`2-stage flow failed for chunk ${chunkIndex + 1}: ${error.message}`);
    }
  }

  /**
   * チャンク処理時間推定
   */
  estimateChunkProcessingTime(audioBuffer, meetingInfo = {}) {
    const audioSizeMB = audioBuffer.length / (1024 * 1024);
    const estimatedDuration = meetingInfo.duration || (audioSizeMB * 60); // 1MB≈1分と仮定
    
    // チャンク数推定
    const estimatedChunks = Math.ceil(estimatedDuration / 600); // 10分チャンク
    
    // チャンクあたり処理時間推定（経験値ベース）
    const baseProcessingTime = 45; // 秒/チャンク
    const totalEstimate = estimatedChunks * baseProcessingTime * 1000; // ミリ秒
    
    logger.info(`📊 処理時間推定: ${Math.round(audioSizeMB)}MB → ${estimatedChunks}チャンク → ${Math.round(totalEstimate/1000)}秒`);
    
    return totalEstimate;
  }

  /**
   * チャンク失敗時のフォールバック生成
   */
  createChunkFallback(chunk, chunkIndex, error) {
    return {
      transcription: `[チャンク${chunkIndex + 1} (${Math.round(chunk.startTime/60)}:${Math.round(chunk.startTime%60).toString().padStart(2,'0')}-${Math.round(chunk.endTime/60)}:${Math.round(chunk.endTime%60).toString().padStart(2,'0')}): 処理失敗 - ${error.message}]`,
      structuredSummary: {
        meetingPurpose: 'N/A (チャンク処理失敗)',
        clientName: 'Unknown',
        attendeesAndCompanies: [],
        materials: [],
        discussionsByTopic: [],
        decisions: [],
        nextActionsWithDueDate: [],
        audioQuality: 'エラーにより処理不可'
      },
      processingTime: 0,
      chunkIndex,
      isFallback: true
    };
  }

  /**
   * Phase A+B: チャンク結果統合（基本実装）
   */
  async mergeChunkResults(chunkResults, metadata) {
    const startTime = Date.now();
    
    try {
      logger.info(`🔄 結果統合開始: ${chunkResults.length}チャンク`);
      
      // 成功したチャンクのみを抽出
      const successfulResults = chunkResults.filter(result => result.success && result.data);
      const failedResults = chunkResults.filter(result => !result.success);
      
      if (successfulResults.length === 0) {
        throw new Error('統合可能な成功チャンクが存在しません');
      }
      
      logger.info(`📊 統合対象: 成功${successfulResults.length}件、失敗${failedResults.length}件`);
      
      // Step 1: 文字起こし統合
      const mergedTranscription = this.mergeTranscriptions(successfulResults, failedResults);
      
      // Step 2: 構造化要約統合  
      const mergedSummary = this.mergeStructuredSummaries(successfulResults, metadata);
      
      // Step 3: 警告・エラー情報統合
      const warnings = this.compileWarnings(successfulResults, failedResults, metadata);
      
      const processingTime = Date.now() - startTime;
      logger.info(`✅ 結果統合完了: ${processingTime}ms`);
      
      return {
        status: 'success',
        transcription: mergedTranscription,
        structuredSummary: mergedSummary,
        analysis: mergedSummary, // 後方互換性
        audioFileName: metadata.originalFileName || 'chunked_audio',
        audioBufferSize: metadata.totalSize || 0,
        processedAudioBufferSize: metadata.totalSize || 0,
        warnings: warnings.length > 0 ? warnings : undefined,
        meetingInfo: metadata.meetingInfo || {},
        processedAt: new Date().toISOString(),
        totalProcessingTime: metadata.totalProcessingTime || 0,
        // Phase A+B 統合情報
        mergeMetadata: {
          totalChunks: chunkResults.length,
          successfulChunks: successfulResults.length,
          failedChunks: failedResults.length,
          completionRate: Math.round(successfulResults.length / chunkResults.length * 100),
          mergeProcessingTime: processingTime,
          chunkingMethod: metadata.splitMethod || 'time_based'
        }
      };
      
    } catch (error) {
      logger.error('結果統合エラー:', error);
      throw new Error(`Chunk results merge failed: ${error.message}`);
    }
  }

  /**
   * 文字起こし統合（Phase A+B基本実装）
   */
  mergeTranscriptions(successfulResults, failedResults) {
    logger.info('📝 文字起こし統合開始');
    
    const transcriptionParts = [];
    const totalChunks = successfulResults.length + failedResults.length;
    
    // チャンクインデックス順にソート
    const allResults = [...successfulResults, ...failedResults].sort(
      (a, b) => a.chunkIndex - b.chunkIndex
    );
    
    for (const result of allResults) {
      if (result.success && result.data) {
        // 【修正】2段階フロー対応: データ構造を確認
        let transcriptionText = null;
        
        // 新フロー: result.data.transcription (文字列)
        if (typeof result.data.transcription === 'string') {
          transcriptionText = result.data.transcription;
        }
        // 旧フロー: result.data.transcription.transcription (オブジェクト)
        else if (result.data.transcription?.transcription) {
          transcriptionText = result.data.transcription.transcription;
        }
        
        if (transcriptionText && transcriptionText.length > 0) {
          const timeStamp = this.formatTimeRange(result.timeRange);
          transcriptionParts.push(`\n--- ${timeStamp} ---\n${transcriptionText}`);
          logger.info(`📝 チャンク${result.chunkIndex + 1}: ${transcriptionText.length}文字取得`);
        } else {
          logger.warn(`⚠️ チャンク${result.chunkIndex + 1}: 文字起こしテキストが空`);
          const timeStamp = this.formatTimeRange(result.timeRange);
          transcriptionParts.push(`\n--- ${timeStamp} ---\n[文字起こしデータが空]`);
        }
      } else if (result.fallback?.transcription) {
        // 失敗チャンクのフォールバック
        transcriptionParts.push(`\n${result.fallback.transcription}`);
      } else {
        // 完全失敗チャンク
        const timeStamp = this.formatTimeRange(result.timeRange);
        transcriptionParts.push(`\n--- ${timeStamp} ---\n[処理失敗: ${result.error || 'Unknown error'}]`);
      }
    }
    
    const mergedText = transcriptionParts.join('\n');
    logger.info(`📝 文字起こし統合完了: ${mergedText.length}文字`);
    
    return mergedText;
  }

  /**
   * 構造化要約統合（Phase A+B基本実装）
   */
  mergeStructuredSummaries(successfulResults, metadata) {
    logger.info('📋 構造化要約統合開始');
    
    if (successfulResults.length === 0) {
      return this.createEmptySummary();
    }
    
    // 最初のチャンクから基本情報を取得
    const firstChunk = successfulResults[0].data.structuredSummary;
    
    // 全チャンクからの情報統合
    const allDiscussions = [];
    const allDecisions = [];
    const allNextActions = [];
    const allAttendees = new Set();
    
    for (const result of successfulResults) {
      const summary = result.data.structuredSummary;
      
      if (summary.discussionsByTopic) {
        // 時間情報付きでディスカッション追加
        const timeAdjustedDiscussions = summary.discussionsByTopic.map(discussion => ({
          ...discussion,
          chunkInfo: {
            chunkIndex: result.chunkIndex,
            timeRange: this.formatTimeRange(result.timeRange)
          }
        }));
        allDiscussions.push(...timeAdjustedDiscussions);
      }
      
      if (summary.decisions) {
        allDecisions.push(...summary.decisions);
      }
      
      if (summary.nextActionsWithDueDate) {
        allNextActions.push(...summary.nextActionsWithDueDate);
      }
      
      if (summary.attendeesAndCompanies) {
        summary.attendeesAndCompanies.forEach(attendee => allAttendees.add(attendee));
      }
    }
    
    const mergedSummary = {
      meetingPurpose: firstChunk.meetingPurpose || '不明',
      clientName: firstChunk.clientName || metadata.clientName || 'Unknown',
      attendeesAndCompanies: Array.from(allAttendees),
      materials: firstChunk.materials || [],
      discussionsByTopic: allDiscussions,
      decisions: allDecisions,
      nextActionsWithDueDate: allNextActions,
      audioQuality: this.aggregateAudioQuality(successfulResults)
    };
    
    logger.info(`📋 構造化要約統合完了: ${allDiscussions.length}議論、${allDecisions.length}決定、${allNextActions.length}アクション`);
    
    return mergedSummary;
  }

  /**
   * 警告情報統合
   */
  compileWarnings(successfulResults, failedResults, metadata) {
    const warnings = [];
    
    // 失敗チャンク警告
    if (failedResults.length > 0) {
      warnings.push(`${failedResults.length}/${successfulResults.length + failedResults.length}チャンクの処理に失敗しました`);
      
      const failedTimeRanges = failedResults.map(r => this.formatTimeRange(r.timeRange));
      warnings.push(`失敗時間帯: ${failedTimeRanges.join(', ')}`);
    }
    
    // 完成度警告
    const completionRate = successfulResults.length / (successfulResults.length + failedResults.length);
    if (completionRate < 0.8) {
      warnings.push(`処理完成度が${Math.round(completionRate * 100)}%です。一部情報が欠落している可能性があります`);
    }
    
    // 音声品質警告
    const qualityIssues = successfulResults.filter(r => {
      const audioQuality = r.data.structuredSummary?.audioQuality;
      if (!audioQuality) return false;
      
      // 型安全なチェック - aggregateAudioQualityと同じパターン
      let qualityStr;
      if (typeof audioQuality === 'string') {
        qualityStr = audioQuality;
      } else if (typeof audioQuality === 'object' && audioQuality !== null) {
        qualityStr = JSON.stringify(audioQuality);
      } else {
        qualityStr = String(audioQuality);
      }
      
      return qualityStr.includes('低') || qualityStr.includes('悪');
    });
    
    if (qualityIssues.length > 0) {
      warnings.push(`${qualityIssues.length}チャンクで音声品質の問題が検出されました`);
    }
    
    return warnings;
  }

  /**
   * ユーティリティ: 時間範囲フォーマット
   */
  formatTimeRange(timeRange) {
    if (!timeRange || timeRange.length !== 2) return 'Unknown';
    
    const [start, end] = timeRange;
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    return `${formatTime(start)}-${formatTime(end)}`;
  }

  /**
   * 音声品質情報統合
   */
  aggregateAudioQuality(successfulResults) {
    const qualityReports = successfulResults
      .map(r => r.data.structuredSummary?.audioQuality)
      .filter(q => q && q !== 'N/A');
    
    if (qualityReports.length === 0) return '品質情報なし';
    
    // 緊急修正: オブジェクト型の場合の対処
    const normalizedReports = qualityReports.map(q => {
      if (typeof q === 'string') {
        return q;
      } else if (typeof q === 'object' && q !== null) {
        // オブジェクトの場合は文字列化して処理
        return JSON.stringify(q);
      } else {
        return String(q || '不明');
      }
    });
    
    const goodQuality = normalizedReports.filter(q => 
      q.includes && (q.includes('良好') || q.includes('良'))
    ).length;
    const totalReports = normalizedReports.length;
    
    if (goodQuality / totalReports > 0.8) {
      return '全体的に良好';
    } else if (goodQuality / totalReports > 0.5) {
      return '部分的に問題あり';
    } else {
      return '品質に課題あり';
    }
  }

  /**
   * 空の要約構造体作成
   */
  createEmptySummary() {
    return {
      meetingPurpose: '処理失敗により不明',
      clientName: 'Unknown',
      attendeesAndCompanies: [],
      materials: [],
      discussionsByTopic: [],
      decisions: [],
      nextActionsWithDueDate: [],
      audioQuality: '処理失敗'
    };
  }

  /**
   * 実際の音声ファイルを処理
   */
  async processRealAudioFile(audioFilePath, meetingInfo) {
    try {
      // 1. 音声の文字起こし
      logger.info('Starting audio transcription with Gemini...');
      const transcriptionResult = await this.aiService.transcribeAudio(audioFilePath, meetingInfo);

      // 2. 構造化された要約を生成
      logger.info('Generating structured summary...');
      const structuredSummary = await this.generateStructuredSummary(transcriptionResult);

      // 3. 結果の検証
      this.validateProcessingResult({ transcription: transcriptionResult, analysis: structuredSummary });

      return {
        status: 'success',
        transcription: transcriptionResult,
        analysis: structuredSummary,
        audioFilePath: audioFilePath,
        meetingInfo: meetingInfo,
        processedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to process real audio file:', error.message);
      throw error;
    }
  }

  /**
   * 動画バッファから音声として文字起こし・要約処理
   * @param {Buffer} videoBuffer - 動画ファイルのBuffer
   * @param {string} videoFileName - 動画ファイル名
   * @param {Object} meetingInfo - 会議情報
   * @returns {Object} 文字起こしと要約の結果
   */
  async processVideoAsAudio(videoBuffer, videoFileName, meetingInfo) {
    try {
      logger.info(`動画バッファから音声処理開始: ${videoFileName} (${Math.round(videoBuffer.length / 1024 / 1024)}MB)`);

      // バッファサイズ確認
      const bufferSizeMB = videoBuffer.length / 1024 / 1024;
      logger.info(`Video buffer size: ${bufferSizeMB.toFixed(2)} MB`);

      // Gemini AI 20MB制限チェック
      const maxGeminiSize = 20 * 1024 * 1024;
      if (videoBuffer.length > maxGeminiSize) {
        logger.warn(`動画バッファサイズが20MB制限を超過: ${bufferSizeMB.toFixed(2)}MB > 20MB`);
        logger.warn('音声ファイルなし・大容量動画のため、文字起こし処理を中止します');
        
        // TC206-S1用のエラーメッセージ
        throw new Error(`動画ファイルが大きすぎるため、文字起こしできません（${bufferSizeMB.toFixed(2)}MB > 20MB制限）。音声ファイルを確認してください。`);
      }

      // Gemini AI で動画から音声文字起こし（動画ファイルも文字起こし可能）
      const transcription = await this.aiService.transcribeVideoBuffer(videoBuffer, videoFileName);
      
      if (!transcription || !transcription.transcription) {
        throw new Error('動画からの文字起こしに失敗しました');
      }

      logger.info(`動画文字起こし完了: ${transcription.transcription.length}文字`);

      // 要約生成
      const summary = await this.generateStructuredSummary(transcription.transcription, meetingInfo);

      const result = {
        transcription: transcription,
        structuredSummary: summary,
        processingTime: Date.now() - Date.now(),
        isFromVideo: true,
        warnings: ['音声ファイルが存在しませんでした', '代替処理: 動画ファイルから音声を抽出して文字起こしを実行しました', '処理結果: 正常に完了']
      };

      logger.info(`動画から音声処理完了: 文字起こし${transcription.transcription.length}文字, 要約生成${!!summary}`);
      return result;

    } catch (error) {
      logger.error(`動画音声処理エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 8項目の枠組みに沿った構造化要約を生成
   */
  async generateStructuredSummary(transcriptionResult) {
    try {
      await this.aiService.initializeModel();

      const structuredPrompt = `以下の会議音声の文字起こし内容を、指定された8項目の枠組みに沿って要約してください。

## 会議文字起こし内容：
${transcriptionResult.transcription}

## 要求する要約形式：
以下の8項目に沿って詳細に分析・要約してください：

**1. クライアント名**
（会議内容から推測されるクライアント名・組織名・プロジェクト名を記載。内部会議の場合は「内部会議」と記載）

**2. 会議目的**
（なぜこの会議が開催されたか、会議の主要目標は何か）

**3. 出席者名・社名**
（発言者から判別される参加者の名前・所属組織、役職が分かる場合は記載）

**4. 資料**
（会議中に言及された資料、文書、データ、画面共有された内容等）

**5. 論点・議論内容**
（重要：以下の観点で詳細に記載）
- 誰がどのような発言をしたか
- 各発言者の立場・視点
- 議論がどのように展開し、どのような論理の流れで進んだか
- 対立する意見があった場合はその内容と解決過程

**6. 結論・決定事項**
（会議で確定した事項、合意に達した内容）

**7. 宿題**
（今後調査・検討が必要な事項、持ち帰り検討項目）

**8. Next Action / Due Date**
（具体的なアクションアイテムと実行期限、担当者が分かる場合は記載）

重要事項：
- 各項目について、会議内容に基づいて具体的に記載してください
- 不明な項目については「不明」または「言及なし」と明記してください
- 推測ではなく、実際の発言内容に基づいて要約してください`;

      const result = await this.aiService.model.generateContent(structuredPrompt);
      const response = await result.response;
      const summaryText = response.text();

      // 構造化されたオブジェクトとして返す
      return {
        summary: summaryText,
        structure: 'eight_point_framework',
        keyPoints: this.extractKeyPoints(summaryText),
        meetingInfo: transcriptionResult.meetingInfo,
        timestamp: new Date().toISOString(),
        model: this.aiService.selectedModel
      };

    } catch (error) {
      logger.error('Failed to generate structured summary:', error.message);
      throw error;
    }
  }

  /**
   * 要約からキーポイントを抽出
   */
  extractKeyPoints(summaryText) {
    const keyPoints = [];
    const sections = summaryText.split(/\*\*\d+\./);
    
    sections.forEach((section, index) => {
      if (section.trim()) {
        const lines = section.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          keyPoints.push({
            section: index,
            title: lines[0].replace(/\*\*/g, '').trim(),
            content: lines.slice(1).join(' ').trim()
          });
        }
      }
    });

    return keyPoints;
  }

  /**
   * 音声ファイル形式を検証（ファイル名から）
   */
  validateAudioFileByName(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const supportedFormats = ['.mp3', '.m4a', '.wav', '.ogg', '.flac'];
    
    if (!supportedFormats.includes(ext)) {
      throw new Error(`Unsupported audio format: ${ext}. Supported formats: ${supportedFormats.join(', ')}`);
    }
    
    return true;
  }

  /**
   * 音声ファイル形式を検証
   */
  validateAudioFile(audioFilePath) {
    const ext = path.extname(audioFilePath).toLowerCase();
    const supportedFormats = ['.mp3', '.m4a', '.wav', '.ogg', '.flac'];
    
    if (!supportedFormats.includes(ext)) {
      throw new Error(`Unsupported audio format: ${ext}. Supported formats: ${supportedFormats.join(', ')}`);
    }
    
    return true;
  }

  /**
   * 音声品質をチェック（無音、極小音量、過剰ノイズを検出）
   * @param {Buffer} audioBuffer - 音声バッファ
   * @returns {Object} 品質チェック結果
   */
  async checkAudioQuality(audioBuffer) {
    try {
      const bufferSize = audioBuffer.length;
      
      // サンプリング：最初、中間、最後の部分をチェック
      const sampleSize = Math.min(1024, Math.floor(bufferSize / 10));
      const startSample = audioBuffer.slice(0, sampleSize);
      const middleSample = audioBuffer.slice(Math.floor(bufferSize / 2) - sampleSize / 2, Math.floor(bufferSize / 2) + sampleSize / 2);
      const endSample = audioBuffer.slice(bufferSize - sampleSize, bufferSize);
      
      // 音量レベル計算（RMS: Root Mean Square）
      const calculateRMS = (buffer) => {
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 2) {
          const sample = buffer.readInt16LE(i) / 32768.0; // 16-bit audio正規化
          sum += sample * sample;
        }
        return Math.sqrt(sum / (buffer.length / 2));
      };
      
      const startRMS = calculateRMS(startSample);
      const middleRMS = calculateRMS(middleSample);
      const endRMS = calculateRMS(endSample);
      const averageRMS = (startRMS + middleRMS + endRMS) / 3;
      
      // 品質判定基準
      const isSilent = averageRMS < 0.001; // ほぼ無音
      const isVeryQuiet = averageRMS < 0.01; // 極端に小さい音
      const hasHighNoise = averageRMS > 0.8; // ノイズ過多
      
      const qualityResult = {
        averageRMS,
        isSilent,
        isVeryQuiet,
        hasHighNoise,
        isLowQuality: isSilent || isVeryQuiet || hasHighNoise,
        details: {
          startRMS,
          middleRMS,
          endRMS,
          threshold: {
            silent: 0.001,
            veryQuiet: 0.01,
            highNoise: 0.8
          }
        }
      };
      
      if (qualityResult.isLowQuality) {
        logger.warn('🔊 音声品質警告:', {
          isSilent,
          isVeryQuiet,
          hasHighNoise,
          averageRMS: averageRMS.toFixed(4)
        });
      }
      
      return qualityResult;
    } catch (error) {
      logger.error('音声品質チェックエラー:', error.message);
      // エラーの場合は品質チェックをスキップして処理継続
      return {
        averageRMS: 0.5,
        isLowQuality: false,
        error: error.message
      };
    }
  }

  /**
   * 処理結果の検証
   */
  validateProcessingResult(result) {
    if (!result || !result.transcription) {
      throw new Error('Invalid processing result: missing required fields');
    }

    // 構造化要約の検証（新形式対応）
    if (!result.structuredSummary && (!result.analysis || !result.analysis.summary)) {
      throw new Error('Invalid analysis result: missing structured summary');
    }

    return true;
  }

  /**
   * 処理統計情報を取得
   */
  getProcessingStats(result) {
    return {
      audioFileName: path.basename(result.audioFilePath),
      transcriptionLength: result.transcription.transcription ? result.transcription.transcription.length : 0,
      summaryLength: result.analysis.summary ? result.analysis.summary.length : 0,
      keyPointsCount: result.analysis.keyPoints ? result.analysis.keyPoints.length : 0,
      processingTime: result.processedAt,
      model: result.transcription.model || 'unknown',
      summaryStructure: result.analysis.structure || 'unknown'
    };
  }
}

module.exports = AudioSummaryService;