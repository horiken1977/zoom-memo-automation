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
      return elapsed;
    };

    try {
      debugTimer('processRealAudioBuffer開始', `fileName: ${fileName}, bufferSize: ${audioBuffer.length}`);
      
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
      
      // 1. 統合AI処理（文字起こし＋構造化要約を1回のAPI呼び出しで実行、5回リトライ付き）
      debugTimer('Step 1: processAudioWithStructuredOutput開始（統合AI処理）');
      logger.info('Starting unified audio processing with Gemini (transcription + structured summary)...');
      
      const unifiedResult = await this.aiService.processAudioWithStructuredOutput(processedAudioBuffer, fileName, meetingInfo);
      debugTimer('Step 1: processAudioWithStructuredOutput完了', `transcription length: ${unifiedResult?.transcription?.length || 0}, summary generated: ${!!unifiedResult?.structuredSummary}`);
      
      // 統合結果から個別データを抽出（後方互換性のため）
      const transcriptionResult = {
        transcription: unifiedResult.transcription,
        meetingInfo: unifiedResult.meetingInfo,
        fileName: fileName,
        timestamp: unifiedResult.timestamp,
        audioBufferSize: unifiedResult.audioBufferSize,
        model: unifiedResult.model,
        attempt: unifiedResult.attempt
      };
      
      const structuredSummary = unifiedResult.structuredSummary;

      // 2. 結果の検証
      debugTimer('Step 2: validateProcessingResult開始');
      this.validateProcessingResult({ transcription: transcriptionResult, structuredSummary: structuredSummary });
      debugTimer('Step 2: validateProcessingResult完了');
      
      const totalTime = debugTimer('processRealAudioBuffer完了');
      
      return {
        status: 'success',
        transcription: transcriptionResult,
        structuredSummary: structuredSummary, // TC203で期待される構造
        analysis: structuredSummary,
        audioFileName: fileName,
        audioBufferSize: audioBuffer.length,
        processedAudioBufferSize: processedAudioBuffer.length,
        compressionStats: compressionStats, // 圧縮統計情報
        qualityCheckResult: qualityCheckResult, // 音声品質チェック結果
        meetingInfo: meetingInfo,
        processedAt: new Date().toISOString(),
        totalProcessingTime: totalTime,
        // 統合AI処理の追加情報
        apiCallReduction: '50%', // 2回→1回のAPI呼び出し削減
        retryCapability: '5回リトライ対応',
        unifiedProcessing: true
      };

    } catch (error) {
      logger.error('Failed to process real audio buffer:', error.message);
      throw error;
    }
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