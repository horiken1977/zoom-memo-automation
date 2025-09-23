const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(config.googleAI.apiKey);
    this.model = null;
    this.selectedModel = null;
    this.availableModels = null;
    // 【Step1追加】文字起こし専用軽量モデル
    this.transcriptionModel = null;
    this.selectedTranscriptionModel = null;
  }

  /**
   * 利用可能なモデルを取得して最適なモデルを自動選択
   */
  async initializeModel() {
    try {
      // 既に初期化済みの場合はスキップ
      if (this.model && this.selectedModel) {
        return this.selectedModel;
      }

      // 手動でモデルが指定されている場合
      if (config.googleAI.model !== 'auto') {
        this.selectedModel = config.googleAI.model;
        this.model = this.genAI.getGenerativeModel({ model: this.selectedModel });
        logger.info(`Using manually specified model: ${this.selectedModel}`);
        return this.selectedModel;
      }

      // 自動選択モード：利用可能なモデルをリスト取得
      logger.info('Auto-selecting best available Gemini model...');
      
      try {
        // List available models
        const models = await this.genAI.listModels();
        this.availableModels = models.map(model => model.name.replace('models/', ''));
        
        logger.info(`Available models: ${this.availableModels.join(', ')}`);
        
        // 優先順位に基づいて最適なモデルを選択（動作確認済みモデルを最優先）
        const preferredModels = [
          'gemini-2.5-pro',     // ✅ 動作確認済み
          'gemini-2.0-flash',   // ✅ 動作確認済み
          'gemini-1.5-flash',   // ✅ 動作確認済み
          'gemini-pro-latest', 
          'gemini-pro',
          'gemini-1.0-pro-latest',
          'gemini-1.0-pro'
          // gemini-1.5-pro系はRate Limit問題のため除外
        ];

        for (const preferredModel of preferredModels) {
          if (this.availableModels.includes(preferredModel)) {
            this.selectedModel = preferredModel;
            break;
          }
        }

        // 見つからない場合は最初の利用可能なモデルを使用
        if (!this.selectedModel && this.availableModels.length > 0) {
          this.selectedModel = this.availableModels[0];
        }

      } catch (listError) {
        logger.warn('Failed to list models, using fallback selection:', listError.message);
        
        // モデルリスト取得に失敗した場合は、フォールバック順で試行
        for (const fallbackModel of config.googleAI.fallbackModels) {
          try {
            const testModel = this.genAI.getGenerativeModel({ model: fallbackModel });
            // より詳細なテストプロンプトでモデルが利用可能か確認
            await testModel.generateContent('こんにちは。システムテストです。');
            this.selectedModel = fallbackModel;
            break;
          } catch (error) {
            logger.debug(`Model ${fallbackModel} not available:`, error.message);
            continue;
          }
        }
      }

      if (!this.selectedModel) {
        throw new Error('No available Gemini model found');
      }

      this.model = this.genAI.getGenerativeModel({ model: this.selectedModel });
      logger.info(`Selected Gemini model: ${this.selectedModel}`);
      
      return this.selectedModel;

    } catch (error) {
      logger.error('Failed to initialize Gemini model:', error.message);
      throw error;
    }
  }

  /**
   * モデルが初期化されていることを確認
   */
  async ensureModelInitialized() {
    if (!this.model) {
      await this.initializeModel();
    }
    return this.model;
  }

  /**
   * 文字起こし専用軽量モデルの初期化
   */
  /**
   * 文字起こし専用軽量モデルの初期化
   */
  async ensureTranscriptionModelInitialized(forceReinit = false) {
    if (!this.transcriptionModel || forceReinit) {
      // 【Phase1】400エラー対策 - より多様なモデルを試行
      const transcriptionModels = [
        'gemini-1.5-flash-8b',   // 最軽量版（新追加）
        'gemini-1.5-flash',      // 軽量・高速（推奨）
        'gemini-1.0-pro',        // 最軽量（代替）
        'gemini-2.0-flash',      // 代替案
        'gemini-1.5-pro',        // より安定（フォールバック）
        'gemini-2.5-pro'         // 最終手段
      ];
      
      // エラーカウンタ初期化
      if (!this.transcriptionErrorCount) {
        this.transcriptionErrorCount = 0;
      }
      
      // 400エラー多発時は異なるモデルを試行
      if (this.transcriptionErrorCount > 3 && !forceReinit) {
        logger.warn(`文字起こしエラー多発(${this.transcriptionErrorCount}回), モデル再選択`);
        // 前回使用モデルをスキップ
        const currentModel = this.selectedTranscriptionModel;
        const filteredModels = transcriptionModels.filter(m => m !== currentModel);
        
        for (const modelName of filteredModels) {
          try {
            const testModel = this.genAI.getGenerativeModel({ model: modelName });
            // 軽量テストで利用可能性確認
            await testModel.generateContent('test');
            this.transcriptionModel = testModel;
            this.selectedTranscriptionModel = modelName;
            this.transcriptionErrorCount = 0; // リセット
            logger.info(`文字起こしモデル切り替え成功: ${currentModel} → ${modelName}`);
            break;
          } catch (error) {
            logger.debug(`文字起こしモデル ${modelName} 利用不可:`, error.message);
            continue;
          }
        }
      } else {
        // 通常の初期化
        for (const modelName of transcriptionModels) {
          try {
            const testModel = this.genAI.getGenerativeModel({ model: modelName });
            // 軽量テストで利用可能性確認
            await testModel.generateContent('テスト');
            this.transcriptionModel = testModel;
            this.selectedTranscriptionModel = modelName;
            logger.info(`文字起こし専用軽量モデル選択: ${modelName}`);
            break;
          } catch (error) {
            logger.debug(`文字起こしモデル ${modelName} 利用不可:`, error.message);
            continue;
          }
        }
      }
      
      if (!this.transcriptionModel) {
        // フォールバック: 通常モデルを使用
        await this.ensureModelInitialized();
        this.transcriptionModel = this.model;
        this.selectedTranscriptionModel = this.selectedModel;
        logger.warn('文字起こし専用モデル取得失敗、通常モデルを使用');
      }
    }
    return this.transcriptionModel;
  }


  /**
   * 音声データを圧縮（Gemini API制限対応）
   * @param {Buffer} audioBuffer - 音声バッファ
   * @param {string} targetSize - 目標サイズ（MB）
   * @returns {Promise<Buffer>} 圧縮された音声バッファ
   */
  async compressAudioBuffer(audioBuffer, targetSize = 15) {
    const originalSizeMB = audioBuffer.length / (1024 * 1024);
    
    if (originalSizeMB <= targetSize) {
      logger.info(`Audio size OK: ${originalSizeMB.toFixed(2)}MB (target: ${targetSize}MB)`);
      return audioBuffer;
    }
    
    logger.info(`Audio compression needed: ${originalSizeMB.toFixed(2)}MB -> target: ${targetSize}MB`);
    
    try {
      // 圧縮比率計算（目標サイズの80%に設定してマージン確保）
      const compressionRatio = (targetSize * 0.8) / originalSizeMB;
      logger.info(`Compression ratio: ${compressionRatio.toFixed(3)}`);
      
      // 簡易的な圧縮：データの間引きによる圧縮
      // より高品質な圧縮が必要な場合は外部ライブラリ（ffmpeg等）を使用
      const targetLength = Math.floor(audioBuffer.length * compressionRatio);
      const step = Math.floor(audioBuffer.length / targetLength);
      
      const compressedBuffer = Buffer.alloc(targetLength);
      let compressedIndex = 0;
      
      for (let i = 0; i < audioBuffer.length && compressedIndex < targetLength; i += step) {
        compressedBuffer[compressedIndex] = audioBuffer[i];
        compressedIndex++;
      }
      
      const compressedSizeMB = compressedBuffer.length / (1024 * 1024);
      logger.info(`Audio compression completed: ${originalSizeMB.toFixed(2)}MB -> ${compressedSizeMB.toFixed(2)}MB (${((1 - compressionRatio) * 100).toFixed(1)}% reduction)`);
      
      return compressedBuffer;
      
    } catch (error) {
      logger.warn(`Audio compression failed: ${error.message}, using original buffer`);
      return audioBuffer;
    }
  }

  /**
   * 動画バッファから文字起こし（20MB制限対応）
   * @param {Buffer} videoBuffer - 動画ファイルのBuffer
   * @param {string} fileName - ファイル名
   * @returns {Promise<Object>} 文字起こし結果
   */
  async transcribeVideoBuffer(videoBuffer, fileName) {
    try {
      await this.initializeModel();
      
      const bufferSizeMB = videoBuffer.length / 1024 / 1024;
      logger.info(`動画バッファ文字起こし開始: ${fileName} (${bufferSizeMB.toFixed(2)}MB)`);
      
      // Gemini 20MB制限チェックと圧縮処理
      let processBuffer = videoBuffer;
      const maxSize = 20 * 1024 * 1024;
      if (videoBuffer.length > maxSize) {
        logger.info(`動画ファイル圧縮実行: ${bufferSizeMB.toFixed(2)}MB -> 18MB`);
        processBuffer = await this.compressAudioBuffer(videoBuffer, 18);
      }
      
      // 動画形式を推定（拡張子から）
      const mimeType = this.getVideoMimeType(fileName);
      
      const prompt = `この動画ファイルの音声を文字起こししてください。
      
以下の形式でJSONとして返してください：
{
  "transcription": "文字起こし内容",
  "confidence": "信頼度",
  "language": "検出言語"
}

要件：
- 音声の内容をそのまま正確に文字起こししてください
- 話者が複数いる場合は区別してください
- 「えー」「あのー」などの言葉も含めてください
- JSONフォーマットを守ってください`;

      const imagePart = {
        inlineData: {
          data: processBuffer.toString('base64'),
          mimeType: mimeType
        }
      };

      const result = await this.model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();

      // JSON抽出・パース
      const transcriptionData = this.extractJSON(text);
      
      if (!transcriptionData.transcription) {
        throw new Error('文字起こし結果が取得できませんでした');
      }

      logger.info(`動画文字起こし完了: ${transcriptionData.transcription.length}文字`);
      
      return transcriptionData;

    } catch (error) {
      logger.error(`動画文字起こしエラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 動画ファイルのMIMEタイプを取得
   * @param {string} fileName - ファイル名
   * @returns {string} MIMEタイプ
   */
  getVideoMimeType(fileName) {
    const extension = fileName.toLowerCase().split('.').pop();
    
    switch (extension) {
      case 'mp4':
        return 'video/mp4';
      case 'avi':
        return 'video/x-msvideo';
      case 'mov':
        return 'video/quicktime';
      case 'mkv':
        return 'video/x-matroska';
      case 'webm':
        return 'video/webm';
      default:
        return 'video/mp4'; // デフォルト
    }
  }

  /**
   * 音声ファイルを文字起こし
   */
  async transcribeAudio(audioFilePath, meetingInfo) {
    const startTime = Date.now();
    
    try {
      // モデルの初期化を確認
      await this.ensureModelInitialized();
      
      logger.info(`Starting transcription for: ${audioFilePath}`);

      // ファイルの存在確認
      try {
        await fs.access(audioFilePath);
      } catch (error) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      // ファイルサイズの確認とデータ読み込み
      const stats = await fs.stat(audioFilePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      logger.info(`Audio file size: ${fileSizeMB.toFixed(2)}MB`);
      
      // 音声ファイルを読み込み
      const audioBuffer = await fs.readFile(audioFilePath);
      
      // 大容量ファイルの圧縮処理（Google AI APIの制限: 20MB）
      const processedBuffer = await this.compressAudioBuffer(audioBuffer, 18);
      const base64Audio = processedBuffer.toString('base64');

      // ファイル拡張子から MIME タイプを決定（Gemini API仕様準拠）
      const ext = path.extname(audioFilePath).toLowerCase();
      const mimeTypes = {
        // 音声ファイル
        '.mp3': 'audio/mp3',
        '.wav': 'audio/wav',
        '.m4a': 'audio/aac',      // M4AはAACとして処理
        '.aac': 'audio/aac',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
        '.aiff': 'audio/aiff',
        // 動画ファイル
        '.mp4': 'video/mp4',
        '.mov': 'video/mov',
        '.avi': 'video/avi',
        '.mpeg': 'video/mpeg'
      };
      const mimeType = mimeTypes[ext] || 'audio/aac'; // デフォルトをAACに変更

      // 処理時間の監視開始
      const midTime = Date.now();
      const setupDuration = midTime - startTime;
      logger.info(`Audio setup completed in ${setupDuration}ms`);

      // Google AI API に送信
      const prompt = this.buildTranscriptionPrompt(meetingInfo);
      
      const result = await this.model.generateContent({
        contents: [{
          parts: [
            {
              inlineData: {
                data: base64Audio,
                mimeType: mimeType
              }
            },
            { text: prompt }
          ]
        }],
        generationConfig: {
          maxOutputTokens: 65536,  // Gemini 2.5 Proの最大出力トークン数
          temperature: 0.7,
          topP: 0.95,
          topK: 40
        }
      });

      const response = result.response;
      const transcription = response.text();

      // 処理時間の測定と警告
      const endTime = Date.now();
      const totalDuration = endTime - startTime;
      const apiDuration = endTime - midTime;
      
      logger.info(`Transcription API completed in ${apiDuration}ms`);
      logger.info(`Total transcription time: ${totalDuration}ms`);
      
      // 290秒（5分弱）を超えた場合の警告
      if (totalDuration > 290000) {
        logger.warn(`⚠️ Transcription processing time warning: ${(totalDuration/1000).toFixed(1)}s - approaching Vercel timeout limit`);
      }

      logger.info(`Transcription completed for meeting: ${meetingInfo.topic}`);

      return {
        transcription,
        meetingInfo,
        filePath: audioFilePath,
        timestamp: new Date().toISOString(),
        audioLength: stats.size,
        model: this.selectedModel,
        processingTime: totalDuration,
        setupTime: setupDuration,
        apiTime: apiDuration
      };

    } catch (error) {
      const errorTime = Date.now();
      const totalDuration = errorTime - startTime;
      
      logger.error(`Transcription failed for ${audioFilePath} after ${totalDuration}ms:`, error.message);
      
      // トークン制限やタイムアウトエラーの詳細ログ
      if (error.message.includes('TOKEN') || error.message.includes('limit')) {
        logger.error('🔴 Token limit exceeded - consider implementing chunk processing');
      }
      if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
        logger.error('🔴 API timeout - file may be too large for single processing');
      }
      
      throw error;
    }
  }

  /**
   * 文字起こし用のプロンプトを構築
   */
  buildTranscriptionPrompt(meetingInfo) {
    return `${config.prompts.transcription.systemPrompt}

会議情報:
- タイトル: ${meetingInfo.topic}
- 開催日時: ${meetingInfo.startTime}
- 時間: ${meetingInfo.duration}分
- 主催者: ${meetingInfo.hostName}

${config.prompts.transcription.userPrompt}

出力形式:
## 文字起こし結果

### 基本情報
- 会議名: ${meetingInfo.topic}
- 日時: ${meetingInfo.startTime}
- 時間: ${meetingInfo.duration}分
- 主催者: ${meetingInfo.hostName}

### 発言内容
（話者を特定できる場合は「話者A:」「話者B:」のように区別して記載）

[ここに文字起こし内容]

### 音声品質・備考
（音声の明瞭度、雑音の有無、聞き取りが困難だった箇所など）`;
  }

  /**
   * 文字起こし結果から要約を生成
   */
  async generateSummary(transcriptionResult) {
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // モデルの初期化を確認
        await this.ensureModelInitialized();
        
        logger.info(`Generating summary for meeting: ${transcriptionResult.meetingInfo.topic} (attempt ${attempt}/${maxRetries})`);

        const prompt = config.prompts.summary.userPrompt.replace(
          '{transcription}', 
          transcriptionResult.transcription
        );

        const result = await this.model.generateContent([
          config.prompts.summary.systemPrompt,
          prompt
        ]);

        const response = result.response;
        const summary = response.text();

        logger.info(`Summary generated for meeting: ${transcriptionResult.meetingInfo.topic}`);

        return {
          summary,
          transcription: transcriptionResult.transcription,
          meetingInfo: transcriptionResult.meetingInfo,
          model: this.selectedModel,
          timestamp: new Date().toISOString(),
          originalFile: transcriptionResult.filePath,
          attemptsUsed: attempt
        };

      } catch (error) {
        lastError = error;
        logger.warn(`Summary generation attempt ${attempt}/${maxRetries} failed for ${transcriptionResult.meetingInfo.topic}: ${error.message}`);
        
        // 最後の試行でない場合は待機
        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          logger.info(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // 全ての試行が失敗した場合
    logger.error(`All ${maxRetries} summary generation attempts failed for ${transcriptionResult.meetingInfo.topic}`, {
      finalError: lastError.message,
      transcriptionLength: transcriptionResult.transcription?.length || 0
    });
    
    throw new Error(`Summary generation failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
  }

  /**
   * カスタムプロンプトで処理
   */
  async processWithCustomPrompt(content, customPrompt) {
    try {
      // モデルの初期化を確認
      await this.ensureModelInitialized();
      
      const result = await this.model.generateContent([
        customPrompt,
        content
      ]);

      const response = result.response;
      return response.text();

    } catch (error) {
      logger.error(`Custom prompt processing failed:`, error.message);
      throw error;
    }
  }

  /**
   * 参加者情報を抽出
   */
  async extractParticipants(transcription) {
    try {
      // モデルの初期化を確認
      await this.ensureModelInitialized();
      
      const prompt = `以下の会議の文字起こしから参加者情報を抽出してください。

出力形式（JSON）:
{
  "participants": [
    {
      "name": "参加者名",
      "role": "役職・役割",
      "speakingTime": "発言時間の割合（%）",
      "mainTopics": ["主な発言内容のトピック"]
    }
  ]
}

文字起こし:
${transcription}`;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      
      // JSONをパース
      const participantsData = JSON.parse(response.text());
      
      return participantsData.participants || [];

    } catch (error) {
      logger.error('Failed to extract participants:', error.message);
      return [];
    }
  }

  /**
   * アクションアイテムを抽出
   */
  async extractActionItems(transcription) {
    try {
      // モデルの初期化を確認
      await this.ensureModelInitialized();
      
      const prompt = `以下の会議の文字起こしからアクションアイテム（宿題・次のアクション）を抽出してください。

出力形式（JSON）:
{
  "actionItems": [
    {
      "task": "具体的なタスク内容",
      "assignee": "担当者名",
      "dueDate": "期限（YYYY-MM-DD形式、不明な場合は null）",
      "priority": "high/medium/low",
      "context": "そのタスクが出た文脈・背景"
    }
  ]
}

文字起こし:
${transcription}`;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      
      const actionData = JSON.parse(response.text());
      
      return actionData.actionItems || [];

    } catch (error) {
      logger.error('Failed to extract action items:', error.message);
      return [];
    }
  }

  /**
   * 決定事項を抽出
   */
  async extractDecisions(transcription) {
    try {
      // モデルの初期化を確認
      await this.ensureModelInitialized();
      
      const prompt = `以下の会議の文字起こしから決定事項を抽出してください。

出力形式（JSON）:
{
  "decisions": [
    {
      "decision": "決定事項の内容",
      "context": "決定に至った経緯・理由",
      "impact": "影響・重要度",
      "implementationDate": "実施時期（不明な場合は null）"
    }
  ]
}

文字起こし:
${transcription}`;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      
      const decisionData = JSON.parse(response.text());
      
      return decisionData.decisions || [];

    } catch (error) {
      logger.error('Failed to extract decisions:', error.message);
      return [];
    }
  }

  /**
   * 包括的な会議分析
   */
  async analyzeComprehensively(transcriptionResult) {
    const maxRetries = 5;
    let lastError = null;
    
    logger.info(`Starting comprehensive analysis for: ${transcriptionResult.meetingInfo.topic}`);

    // 5周フォールバック実行
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Comprehensive analysis attempt ${attempt}/${maxRetries} for: ${transcriptionResult.meetingInfo.topic}`);
        
        const transcription = transcriptionResult.transcription;

        // 並行して各種分析を実行
        const [
          summary,
          participants,
          actionItems,
          decisions
        ] = await Promise.all([
          this.generateSummary(transcriptionResult),
          this.extractParticipants(transcription),
          this.extractActionItems(transcription),
          this.extractDecisions(transcription)
        ]);

        logger.info(`Comprehensive analysis completed successfully on attempt ${attempt}/${maxRetries} for: ${transcriptionResult.meetingInfo.topic}`);

        return {
          meetingInfo: transcriptionResult.meetingInfo,
          transcription,
          summary: summary.summary,
          participants,
          actionItems,
          decisions,
          analysis: {
            totalParticipants: participants.length,
            totalActionItems: actionItems.length,
            totalDecisions: decisions.length,
            analyzedAt: new Date().toISOString(),
            attemptsUsed: attempt
          },
          originalFile: transcriptionResult.filePath
        };

      } catch (error) {
        lastError = error;
        logger.warn(`Comprehensive analysis attempt ${attempt}/${maxRetries} failed for ${transcriptionResult.meetingInfo.topic}: ${error.message}`);
        
        // 最後の試行でない場合は待機
        if (attempt < maxRetries) {
          const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 15000); // 長めの待機時間
          logger.info(`Waiting ${waitTime}ms before comprehensive analysis retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // 全ての試行が失敗した場合
    logger.error(`All ${maxRetries} comprehensive analysis attempts failed for ${transcriptionResult.meetingInfo.topic}`, {
      finalError: lastError.message,
      meetingTopic: transcriptionResult.meetingInfo.topic
    });
    
    throw new Error(`Comprehensive analysis failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
  }

  /**
   * ファイル拡張子からMIMEタイプを取得
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.mp3': 'audio/mp3',
      '.wav': 'audio/wav',
      '.m4a': 'audio/aac',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac',
      '.aiff': 'audio/aiff',
      '.mp4': 'video/mp4',
      '.mov': 'video/mov',
      '.avi': 'video/avi',
      '.mpeg': 'video/mpeg'
    };
    return mimeTypes[ext] || 'audio/aac';
  }

  /**
   * 会議名からクライアント名を抽出
   */
  extractClientFromMeetingName(meetingTopic) {
    if (!meetingTopic) return '不明';
    
    // パターン1: 「○○様_」形式（最も確実）
    const pattern1 = meetingTopic.match(/^([一-龯ァ-ヶー\w]+様)_/);
    if (pattern1) {
      return pattern1[1];
    }
    
    // パターン2: 「株式会社○○_」形式
    const pattern2 = meetingTopic.match(/^(株式会社[一-龯ァ-ヶー\w]+)_/);
    if (pattern2) {
      return pattern2[1];
    }
    
    // パターン3: 「○○株式会社_」形式
    const pattern3 = meetingTopic.match(/^([一-龯ァ-ヶー\w]+株式会社)_/);
    if (pattern3) {
      return pattern3[1];
    }
    
    // パターン4: 「○○社_」形式
    const pattern4 = meetingTopic.match(/^([一-龯ァ-ヶー\w]+社)_/);
    if (pattern4) {
      return pattern4[1];
    }
    
    // パターン5: 「○○グループ_」形式
    const pattern5 = meetingTopic.match(/^([一-龯ァ-ヶー\w]+グループ)_/);
    if (pattern5) {
      return pattern5[1];
    }
    
    // パターン6: 「○○_」形式（汎用、企業名の可能性が高い場合）
    const pattern6 = meetingTopic.match(/^([一-龯ァ-ヶー\w]{2,10})_/);
    if (pattern6) {
      const candidate = pattern6[1];
      // 一般的な単語を除外
      const excludeWords = ['会議', '定例', '打合せ', '打ち合わせ', 'MTG', 'ミーティング', '相談', '説明会'];
      if (!excludeWords.includes(candidate)) {
        return candidate + '様'; // 敬称を付加
      }
    }
    
    return '不明';
  }

  /**
   * 複数JSONブロック抽出処理
   * AIが複数のJSONブロックを返すケースに対応
   */
  extractMultipleJsonBlocks(response) {
    const jsonBlocks = [];
    const logger = require('../utils/logger');
    
    try {
      // パターン1: 複数の```json```ブロック
      const markdownMatches = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/g);
      if (markdownMatches) {
        for (const match of markdownMatches) {
          const content = match.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
          try {
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed === 'object') {
              jsonBlocks.push(parsed);
            }
          } catch (e) {
            // このブロックは無視して次へ
          }
        }
      }
      
      // パターン2: 複数の{...}オブジェクト
      if (jsonBlocks.length === 0) {
        const objectMatches = response.match(/{[\s\S]*?}/g);
        if (objectMatches) {
          for (const match of objectMatches) {
            try {
              const parsed = JSON.parse(match);
              if (parsed && typeof parsed === 'object' && (parsed.transcription || parsed.summary)) {
                jsonBlocks.push(parsed);
              }
            } catch (e) {
              // このブロックは無視して次へ
            }
          }
        }
      }
      
      logger.info(`extractMultipleJsonBlocks: Found ${jsonBlocks.length} valid JSON blocks`);
      return jsonBlocks;
      
    } catch (error) {
      logger.error('extractMultipleJsonBlocks failed:', error.message);
      return [];
    }
  }

  /**
   * 改良されたfallback処理 - JSONレスポンスから適切にデータを抽出
   */
  extractDataFromJsonResponse(response) {
    const logger = require('../utils/logger');
    
    try {
      // JSONっぽい文字列から転写と要約を抽出
      let transcription = '';
      let summary = null;
      
      // transcriptionを抽出
      const transcriptionMatch = response.match(/["']transcription["']\s*:\s*["']([\s\S]*?)["']/);
      if (transcriptionMatch) {
        transcription = transcriptionMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .trim();
      }
      
      // summaryオブジェクトを抽出
      const summaryMatch = response.match(/["']summary["']\s*:\s*({[\s\S]*?})(?=\s*[,}]|$)/);
      if (summaryMatch) {
        try {
          // 不完全なJSONを修正してパース
          let summaryJson = summaryMatch[1];
          // 末尾の不完全な部分を修正
          summaryJson = this.fixIncompleteJson(summaryJson);
          summary = JSON.parse(summaryJson);
        } catch (e) {
          logger.warn('Summary JSON parsing failed, using text extraction');
          summary = this.extractSummaryFromText(response);
        }
      }
      
      if (!transcription || transcription.length < 50) {
        throw new Error('Transcription extraction failed or too short');
      }
      
      if (!summary) {
        summary = this.extractSummaryFromText(response);
      }
      
      logger.info(`extractDataFromJsonResponse: Extracted transcription (${transcription.length} chars) and summary`);
      
      return {
        transcription: transcription,
        summary: summary
      };
      
    } catch (error) {
      logger.error('extractDataFromJsonResponse failed:', error.message);
      throw error;
    }
  }

  /**
   * 不完全なJSONを修正
   */
  fixIncompleteJson(jsonStr) {
    let fixed = jsonStr.trim();
    
    // 末尾が不完全な場合の修正
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    
    if (openBraces > closeBraces) {
      // 不足する}を追加
      fixed += '}'.repeat(openBraces - closeBraces);
    }
    
    return fixed;
  }

  /**
   * テキストから構造化要約を抽出（JSONパース失敗時のフォールバック）
   */
  extractSummaryFromText(text) {
    // クライアント名の抽出を試行
    let clientName = '不明';
    
    // パターン1: 「○○様」形式
    const clientPattern1 = text.match(/([一-龯ァ-ヶー\w]+)様/);
    if (clientPattern1) {
      clientName = clientPattern1[1] + '様';
    } else {
      // パターン2: 「株式会社○○」形式
      const clientPattern2 = text.match(/(株式会社[一-龯ァ-ヶー\w]+)/);
      if (clientPattern2) {
        clientName = clientPattern2[1];
      } else {
        // パターン3: 「○○株式会社」形式
        const clientPattern3 = text.match(/([一-龯ァ-ヶー\w]+株式会社)/);
        if (clientPattern3) {
          clientName = clientPattern3[1];
        } else {
          // パターン4: 「○○社」形式
          const clientPattern4 = text.match(/([一-龯ァ-ヶー\w]+)社/);
          if (clientPattern4) {
            clientName = clientPattern4[1] + '社';
          }
        }
      }
    }
    
    return {
      overview: text.substring(0, 500) + '...',
      client: clientName,
      attendees: [],
      agenda: [],
      discussions: [],
      decisions: [],
      actionItems: [],
      nextSteps: [],
      audioQuality: {
        clarity: 'unknown',
        issues: ['JSON形式での解析失敗', 'フォールバック処理で基本情報のみ抽出'],
        transcriptionConfidence: 'medium'
      }
    };
  }

  /**
   * 【新】2段階フロー: 第1段階 - 音声から文字起こしのみ
   * @param {Buffer|string} audioInput - 音声バッファまたはファイルパス
   * @param {Object} meetingInfo - 会議情報
   * @param {Object} options - オプション設定
   * @returns {Promise<Object>} 文字起こし結果
   */
  async processAudioTranscription(audioInput, meetingInfo, options = {}) {
    const startTime = Date.now();
    const maxRetries = options.maxRetries || 5;
    const isBuffer = Buffer.isBuffer(audioInput);
    let lastError = null;
    let consecutiveBadRequests = 0; // 【Phase1】400エラーカウンタ
    
    logger.info(`Starting transcription-only processing for: ${meetingInfo.topic}`);
    
    // 音声データの準備と圧縮処理
    let audioData;
    let mimeType;
    let compressionInfo = { applied: false };
    
    try {
      if (isBuffer) {
        // バッファの圧縮処理
        const compressedBuffer = await this.compressAudioBuffer(audioInput, 18);
        audioData = compressedBuffer.toString('base64');
        mimeType = options.mimeType || 'audio/aac';
        compressionInfo = {
          applied: compressedBuffer.length !== audioInput.length,
          originalSize: `${(audioInput.length / 1024 / 1024).toFixed(2)}MB`,
          processedSize: `${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB`
        };
        logger.info(`Processing audio from buffer: ${compressionInfo.originalSize} -> ${compressionInfo.processedSize}`);
      } else {
        // ファイルパスの場合
        const fileBuffer = await fs.readFile(audioInput);
        const compressedBuffer = await this.compressAudioBuffer(fileBuffer, 18);
        audioData = compressedBuffer.toString('base64');
        mimeType = this.getMimeType(audioInput);
        compressionInfo = {
          applied: compressedBuffer.length !== fileBuffer.length,
          originalSize: `${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`,
          processedSize: `${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB`
        };
        logger.info(`Processing audio from file: ${compressionInfo.originalSize} -> ${compressionInfo.processedSize}`);
      }

      // 文字起こし専用プロンプト
      const transcriptionPrompt = this.buildTranscriptionOnlyPrompt(meetingInfo);

      // リトライループ
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // 【Phase1】400エラー対策 - モデル初期化時にエラー履歴考慮
          const forceReinit = consecutiveBadRequests >= 2; // 2回連続400エラーで強制切り替え
          await this.ensureTranscriptionModelInitialized(forceReinit);
          
          logger.info(`Transcription attempt ${attempt}/${maxRetries} for: ${meetingInfo.topic}`);

          const result = await this.transcriptionModel.generateContent([
            transcriptionPrompt,
            {
              inlineData: {
                data: audioData,
                mimeType: mimeType
              }
            }
          ], {
            generationConfig: {
              maxOutputTokens: 65536,
              temperature: 0.1,
              topP: 0.8,
              topK: 40
            }
          });
          
          const response = result.response.text();
          
          // 文字起こしテキストの抽出と検証
          const transcriptionText = this.extractTranscriptionText(response);
          
          if (!transcriptionText || transcriptionText.length < 50) {
            throw new Error('Transcription too short or missing');
          }

          const processingTime = Date.now() - startTime;
          logger.info(`Transcription successful on attempt ${attempt} (${processingTime}ms): ${transcriptionText.length} characters`);
          
          // 成功時はエラーカウンタリセット
          this.transcriptionErrorCount = 0;
          consecutiveBadRequests = 0;
          
          return {
            transcription: transcriptionText,
            processingTime,
            compressionInfo,
            meetingInfo,
            model: this.selectedTranscriptionModel, // 軽量モデル名を返す
            timestamp: new Date().toISOString()
          };
          
        } catch (attemptError) {
          lastError = attemptError;
          
          // 【Phase1】400エラー検出と対策
          if (attemptError.message.includes('400 Bad Request')) {
            consecutiveBadRequests++;
            this.transcriptionErrorCount = (this.transcriptionErrorCount || 0) + 1;
            
            logger.warn(`400 Bad Request検出 (連続${consecutiveBadRequests}回, 累計${this.transcriptionErrorCount}回)`);
            
            // 音声データ再処理
            if (consecutiveBadRequests >= 2 && isBuffer) {
              logger.warn('音声データ再圧縮実施（より強力な圧縮）');
              const recompressedBuffer = await this.compressAudioBuffer(audioInput, 10); // 10MBに制限
              audioData = recompressedBuffer.toString('base64');
              compressionInfo.processedSize = `${(recompressedBuffer.length / 1024 / 1024).toFixed(2)}MB`;
            }
            
            // MIMEタイプ変更試行
            if (consecutiveBadRequests >= 3) {
              const altMimeTypes = ['audio/mp4', 'audio/mpeg', 'audio/wav'];
              mimeType = altMimeTypes[attempt % altMimeTypes.length];
              logger.warn(`MIMEタイプ変更: ${mimeType}`);
            }
          } else {
            consecutiveBadRequests = 0; // 400以外のエラーでリセット
          }
          
          logger.warn(`Transcription attempt ${attempt}/${maxRetries} failed: ${attemptError.message}`);
          
          if (attempt < maxRetries) {
            // 【Phase1】400エラー時は待機時間延長
            const waitTime = attemptError.message.includes('400 Bad Request') 
              ? Math.min(3000 * attempt, 15000) // 400エラー時は長めに待機
              : Math.min(2000 * attempt, 10000);
            logger.info(`Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      
      throw new Error(`Transcription failed after ${maxRetries} attempts: ${lastError?.message}`);
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`Transcription processing failed after ${processingTime}ms:`, error.message);
      throw error;
    }
  }

  /**
   * 【新】2段階フロー: 第2段階 - 文字起こしから要約生成
   * @param {string} transcriptionText - 文字起こしテキスト
   * @param {Object} meetingInfo - 会議情報
   * @param {Object} options - オプション設定
   * @returns {Promise<Object>} 構造化要約結果
   */
  async generateSummaryFromTranscription(transcriptionText, meetingInfo, options = {}) {
    const startTime = Date.now();
    const maxRetries = options.maxRetries || 5;
    let lastError = null;
    
    logger.info(`Starting summary generation from transcription (${transcriptionText.length} chars) for: ${meetingInfo.topic}`);
    
    // 文字起こしテキストの最小長チェック
    if (!transcriptionText || transcriptionText.length < 100) {
      throw new Error(`Transcription too short for summary generation: ${transcriptionText.length} characters`);
    }

    // 要約専用プロンプト（文字起こしテキストを入力として使用）
    const summaryPrompt = this.buildSummaryFromTranscriptionPrompt(transcriptionText, meetingInfo);

    // リトライループ
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.ensureModelInitialized();
        logger.info(`Summary generation attempt ${attempt}/${maxRetries} for: ${meetingInfo.topic}`);

        const result = await this.model.generateContent([summaryPrompt], {
          generationConfig: {
            maxOutputTokens: 65536,
            temperature: 0.1,
            topP: 0.8,
            topK: 40
          }
        });
        
        const response = result.response.text();
        
        // 要約JSONの解析
        const summaryResult = this.parseSummaryResponse(response);
        
        if (!summaryResult || !summaryResult.meetingPurpose) {
          throw new Error('Summary parsing failed or missing required fields');
        }

        const processingTime = Date.now() - startTime;
        logger.info(`Summary generation successful on attempt ${attempt} (${processingTime}ms)`);
        
        return {
          structuredSummary: summaryResult,
          processingTime,
          meetingInfo,
          model: this.selectedModel,
          timestamp: new Date().toISOString()
        };
        
      } catch (attemptError) {
        lastError = attemptError;
        logger.warn(`Summary generation attempt ${attempt}/${maxRetries} failed: ${attemptError.message}`);
        
        if (attempt < maxRetries) {
          const waitTime = Math.min(2000 * attempt, 10000);
          logger.info(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    throw new Error(`Summary generation failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * 【更新】音声データから構造化された会議要約を生成（2段階フロー対応）
   * @param {Buffer|string} audioInput - 音声バッファまたはファイルパス
   * @param {Object} meetingInfo - 会議情報
   * @param {Object} options - オプション設定
   * @returns {Promise<Object>} 構造化された分析結果
   */
  async processAudioWithStructuredOutput(audioInput, meetingInfo, options = {}) {
    const startTime = Date.now();
    
    logger.info(`Starting 2-stage audio processing for: ${meetingInfo.topic}`);
    
    try {
      // 【第1段階】音声から文字起こし
      logger.info('🔸 Stage 1: Transcription from audio');
      const transcriptionResult = await this.processAudioTranscription(audioInput, meetingInfo, options);
      
      // 【第2段階】文字起こしから要約生成
      logger.info('🔸 Stage 2: Summary from transcription');
      const summaryResult = await this.generateSummaryFromTranscription(
        transcriptionResult.transcription, 
        meetingInfo, 
        options
      );
      
      // 【結果統合】後方互換性のため既存の戻り値構造に合わせる
      const totalProcessingTime = Date.now() - startTime;
      logger.info(`2-stage processing completed (${totalProcessingTime}ms): ${transcriptionResult.transcription.length} chars transcription + structured summary`);
      
      return {
        success: true,
        qualityScore: 85, // 2段階フローなので高品質
        meetingInfo: transcriptionResult.meetingInfo,
        transcription: transcriptionResult.transcription,
        structuredSummary: summaryResult.structuredSummary,
        
        // 後方互換性のための既存フィールド
        summary: summaryResult.structuredSummary.overview || '',
        participants: summaryResult.structuredSummary.attendees || [],
        actionItems: summaryResult.structuredSummary.actionItems || [],
        decisions: summaryResult.structuredSummary.decisions || [],
        
        // メタ情報
        model: transcriptionResult.model,
        timestamp: transcriptionResult.timestamp,
        processingTime: totalProcessingTime,
        compressionInfo: transcriptionResult.compressionInfo,
        
        // 2段階フロー情報
        twoStageProcessing: true,
        transcriptionTime: transcriptionResult.processingTime,
        summaryTime: summaryResult.processingTime
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`2-stage audio processing failed after ${processingTime}ms:`, error.message);
      throw error;
    }
  }

  /**
   * 文字起こし専用プロンプトを構築
   */
  buildTranscriptionOnlyPrompt(meetingInfo) {
    return `あなたは会議の音声文字起こし専門家です。音声ファイルから正確で詳細な文字起こしを生成してください。

**会議情報:**
- 会議名: ${meetingInfo.topic}
- 開催日時: ${meetingInfo.startTime}
- 時間: ${meetingInfo.duration}分
- 主催者: ${meetingInfo.hostName}

**文字起こしルール:**
1. 話者は「話者A」「話者B」のように区別してください
2. 発言のタイムスタンプを [MM:SS] 形式で含めてください
3. 音声が不明瞭な箇所は [聞き取り困難] と記載
4. 重要な間、笑い声、咳なども [間] [笑い] [咳] として記録
5. 全ての発言を漏れなく文字起こししてください

**出力形式:**
プレーンテキスト形式で、以下のような構造で出力してください：

[00:00] 話者A: 会議を開始します。今日は...
[00:15] 話者B: はい、よろしくお願いします...
[00:32] 話者A: まず最初に...

音声品質に関する情報や聞き取り困難だった部分があれば最後に記載してください。`;
  }

  /**
   * 文字起こしから要約生成用プロンプトを構築
   */
  buildSummaryFromTranscriptionPrompt(transcriptionText, meetingInfo) {
    return `あなたは会議要約の専門家です。以下の文字起こしテキストから構造化された会議要約を生成してください。

**会議情報:**
- 会議名: ${meetingInfo.topic}
- 開催日時: ${meetingInfo.startTime}
- 時間: ${meetingInfo.duration}分
- 主催者: ${meetingInfo.hostName}

**文字起こしテキスト:**
${transcriptionText}

**出力JSON構造:**
以下の構造で正確にJSONを生成してください：

{
  "meetingPurpose": "この会議の目的（概要や結論ではなく、なぜこの会議を開催したのかの目的のみ）",
  "clientName": "相手企業名（「○○株式会社」「○○様」「○○社」など、実際の会話から抽出）",
  "attendeesAndCompanies": [
    {
      "name": "参加者の氏名",
      "company": "所属会社名",
      "role": "役職名"
    }
  ],
  "materials": [
    {
      "materialName": "資料名",
      "description": "資料の内容・説明",
      "mentionedBy": "言及した発言者",
      "timestamp": "MM:SS"
    }
  ],
  "discussionsByTopic": [
    {
      "topicTitle": "論点・議論テーマ（具体的で詳細な論点名）",
      "timeRange": {
        "startTime": "MM:SS",
        "endTime": "MM:SS"
      },
      "discussionFlow": {
        "backgroundContext": "この論点が出た背景・きっかけ",
        "keyArguments": [
          {
            "speaker": "発言者名",
            "company": "所属会社",
            "timestamp": "MM:SS",
            "argument": "発言内容・主張",
            "reasoning": "その主張の根拠・理由",
            "reactionFromOthers": "他の参加者からの反応・反論"
          }
        ],
        "logicalProgression": "議論がどのような論理展開で進行したか（発言→反応→反論→合意/対立の流れ）",
        "decisionProcess": "どのような過程で決定に至ったか、または未解決で終わったか"
      },
      "outcome": "この論点の結論・合意事項・未解決事項"
    }
  ],
  "decisions": [
    {
      "decision": "決定された事項",
      "decidedBy": "決定者・決定過程",
      "reason": "決定に至った理由",
      "implementationDate": "実施時期（YYYY/MM/DD）",
      "relatedTopic": "関連する論点"
    }
  ],
  "nextActionsWithDueDate": [
    {
      "action": "具体的なNext Action",
      "assignee": "担当者名",
      "dueDate": "YYYY/MM/DD",
      "priority": "high/medium/low",
      "relatedDecision": "関連する決定事項"
    }
  ],
  "audioQuality": {
    "clarity": "excellent/good/fair/poor",
    "issues": ["音声品質の問題があれば記載"],
    "transcriptionConfidence": "high/medium/low"
  }
}

**重要な指示:**
- 文字起こしテキストの内容のみに基づいて要約を作成してください
- 推測や想像で情報を追加しないでください
- 時間表記は文字起こしの [MM:SS] 形式に従ってください`;
  }

  /**
   * 文字起こしテキストを抽出
   */
  extractTranscriptionText(response) {
    // シンプルにレスポンス全体を文字起こしとして扱う
    // マークダウンブロックがあれば除去
    let transcription = response;
    
    // ```で囲まれた部分があれば除去
    transcription = transcription.replace(/```[^`]*```/g, '');
    
    // 不要な前置きテキストを除去
    transcription = transcription.replace(/^[^[]*(?=\[)/, ''); // [MM:SS]より前のテキストを除去
    
    return transcription.trim();
  }

  /**
   * 要約レスポンスを解析
   */
  parseSummaryResponse(response) {
    // 既存のJSON解析ロジックを再利用
    try {
      // 手法1: レスポンス全体をJSONとしてパース
      const parsed = JSON.parse(response);
      logger.info('Summary JSON parsing success with direct parse');
      return parsed;
    } catch (parseError1) {
      try {
        // 手法2: マークダウンブロックを除去してパース
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[1].trim());
          logger.info('Summary JSON parsing success with markdown block removal');
          return parsed;
        } else {
          throw new Error('No JSON markdown block found');
        }
      } catch (parseError2) {
        // 手法3: 最初の { から最後の } までを抽出してパース
        const jsonStart = response.indexOf('{');
        const jsonEnd = response.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          const jsonContent = response.substring(jsonStart, jsonEnd + 1);
          const parsed = JSON.parse(jsonContent);
          logger.info('Summary JSON parsing success with bracket extraction');
          return parsed;
        } else {
          throw new Error('Summary JSON parsing failed - no valid JSON structure found');
        }
      }
    }
  }
}

module.exports = AIService;
