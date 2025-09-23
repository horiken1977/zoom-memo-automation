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
          await this.ensureModelInitialized();
          logger.info(`Transcription attempt ${attempt}/${maxRetries} for: ${meetingInfo.topic}`);

          const result = await this.model.generateContent([
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
          
          return {
            transcription: transcriptionText,
            processingTime,
            compressionInfo,
            meetingInfo,
            model: this.selectedModel,
            timestamp: new Date().toISOString()
          };
          
        } catch (attemptError) {
          lastError = attemptError;
          logger.warn(`Transcription attempt ${attempt}/${maxRetries} failed: ${attemptError.message}`);
          
          if (attempt < maxRetries) {
            const waitTime = Math.min(2000 * attempt, 10000);
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

  // 既存メソッドは維持...
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
        logger.info(`Processing audio from file: ${audioInput} (${compressionInfo.originalSize} -> ${compressionInfo.processedSize})`);
      }
    } catch (error) {
      throw new Error(`Failed to prepare audio data: ${error.message}`);
    }
    
    // 統合プロンプト（音声から直接8項目構造化要約を生成）
    const structuredPrompt = `# 音声会議分析システム

あなたは音声ファイルから**正確なJSON形式**で構造化議事録を生成する専門AIです。

## 重要: 出力形式 - 以下を厳密に守ってください
- **絶対に** JSON形式のみで回答してください
- マークダウンブロック（\`\`\`json）は使用禁止です
- 説明文、前書き、後書きは一切不要です
- コメントや追加説明は書かないでください
- 必ず { から始まり } で終わる、純粋なJSONのみを出力してください
- 回答の最初の文字は必ず { です
- 回答の最後の文字は必ず } です

## 分析対象
**会議情報:**
- 会議名: ${meetingInfo.topic}
- 開催日時: ${meetingInfo.startTime}
- 時間: ${meetingInfo.duration}分
- 主催者: ${meetingInfo.hostName}

## 出力JSON構造
以下の7項目構造で正確にJSONを生成してください：

{
  "transcription": "音声の完全な文字起こし（全ての発言を含む）",
  "summary": {
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
}

## 7項目分析の重要指示

### 1. 会議目的の抽出方法
- 会議冒頭での「今日は〜のために」「〜を目的として」等の発言を特定
- 会議名からの推測ではなく、実際の発言から目的を抽出
- 概要や結論ではなく、純粋な「目的」のみを記録

### 2. クライアント名の抽出方法  
- 会話内で言及される相手企業名を**必ず**抽出
- 「○○様」「○○社」「○○株式会社」「○○グループ」など実際の表現をそのまま使用
- 会議名からも企業名を推測（例：「毎日放送様_第5回共通言語MTG」→「毎日放送様」）

### 3. 出席者・会社名の記録方法
- 自己紹介や発言時に言及された所属会社を正確に記録
- 「話者A」ではなく可能な限り実名を特定
- 会社名は略称ではなく正式名称で記録

### 4. 資料の特定方法
- 「資料を見てください」「スライドの〜」「配布した〜」等の言及を特定
- 画面共有や提示された資料名を正確に記録
- 資料について議論された内容も併記

### 5. 論点・議論内容の分析方法
- **時間軸での論点分離**: 各論点の開始・終了時間（MM:SS）を記録
- **発言者別の主張**: 誰が何をどのタイミングで発言したか
- **論理展開の追跡**: 発言→反応→反論→合意/対立の具体的な流れ
- **決定プロセス**: どのような議論を経て何が決まったか

### 6. 決定事項の記録方法
- 「決まりました」「〜にしましょう」「承認します」等の決定発言を特定
- 決定に至った議論の流れを関連論点として記録
- 実施時期が言及された場合は正確な日付で記録

### 7. Next Action・Due Dateの特定方法
- 「〜してください」「〜までに」「次回までに」等のアクション指示を特定
- 担当者の明確な指名があった場合は正確に記録
- 期限が曖昧な場合も「次回会議まで」等の表現をそのまま記録

## データ品質基準
- 時間形式: MM:SS（例：05:30 = 5分30秒）
- 日付形式: YYYY/MM/DD
- 該当項目がない場合は空配列 [] 
- 不明な項目は "不明" ではなく実際の会話から推測
- **表面的な要約ではなく、具体的な発言内容と論理展開を詳細に記録**

## 議論分析の品質要件
- **発言の因果関係**: AがこのことばをきっかけにBがこの発言をしたという連鎖を記録
- **対立構造**: 誰と誰がどの点で意見が分かれたかを明確に区別  
- **合意形成**: どのような過程で合意に至ったか、誰の提案が採用されたか
- **未解決事項**: 結論に至らなかった論点と継続検討事項を明記

**再度強調: 返答は純粋なJSONデータのみです。説明は一切不要です。**`;

    // リトライループ
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.ensureModelInitialized();
        
        logger.info(`Unified audio processing - Attempt ${attempt}/${maxRetries} for: ${meetingInfo.topic}`);
        
        // Gemini APIに一度だけリクエスト（maxOutputTokens追加）
        const result = await this.model.generateContent({
          contents: [{
            parts: [
              {
                inlineData: {
                  data: audioData,
                  mimeType: mimeType
                }
              },
              { text: structuredPrompt }
            ]
          }],
          generationConfig: {
            maxOutputTokens: 65536,  // Gemini 2.5 Proの最大出力トークン数
            temperature: 0.7,
            topP: 0.95,
            topK: 40
          }
        });
        
        const response = result.response.text();
        
        // JSON形式でパース（複数のフォールバック手法）
        let parsedResult;
        try {
          // 手法1: レスポンス全体をJSONとしてパース
          parsedResult = JSON.parse(response);
          logger.info('JSON parsing success with method 1 (direct parse)');
        } catch (parseError1) {
          try {
            // 手法2: マークダウンブロックを除去してパース（より強力な正規表現）
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              parsedResult = JSON.parse(jsonMatch[1].trim());
              logger.info('JSON parsing success with method 2 (markdown block removal)');
            } else {
              throw new Error('No JSON markdown block found');
            }
          } catch (parseError2) {
            try {
              // 手法3: 最初の { から最後の } までを抽出してパース
              const jsonStart = response.indexOf('{');
              const jsonEnd = response.lastIndexOf('}');
              if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                const jsonContent = response.substring(jsonStart, jsonEnd + 1);
                parsedResult = JSON.parse(jsonContent);
                logger.info('JSON parsing success with method 3 (bracket extraction)');
              } else {
                throw new Error('No JSON object boundaries found');
              }
            } catch (parseError3) {
              try {
                // 手法4: マークダウン記号と余計なテキストを除去
                const cleanedText = response
                  .replace(/```json/gi, '')
                  .replace(/```/g, '')
                  .replace(/^[^{]*{/s, '{')  // 最初の { より前のテキストを除去
                  .replace(/}[^}]*$/s, '}') // 最後の } より後のテキストを除去
                  .trim();
                parsedResult = JSON.parse(cleanedText);
                logger.info('JSON parsing success with method 4 (text cleaning)');
              } catch (parseError4) {
                try {
                  // 手法5: 行頭の ```json と行末の ``` を除去する強力なクリーニング
                  const lines = response.split('\n');
                  const filteredLines = lines.filter(line => 
                    !line.trim().startsWith('```') && 
                    line.trim() !== '```json' &&
                    line.trim() !== '```'
                  );
                  const cleanedResponse = filteredLines.join('\n').trim();
                  parsedResult = JSON.parse(cleanedResponse);
                  logger.info('JSON parsing success with method 5 (line-by-line cleaning)');
                } catch (parseError5) {
                  try {
                    // 手法6: 複数JSONブロック対応 - 最初の完全なJSONオブジェクトを抽出
                    const jsonBlocks = this.extractMultipleJsonBlocks(response);
                    if (jsonBlocks.length > 0) {
                      parsedResult = jsonBlocks[0]; // 最初のJSONブロックを使用
                      logger.info(`JSON parsing success with method 6 (multiple JSON blocks extraction) - found ${jsonBlocks.length} blocks`);
                    } else {
                      throw new Error('No valid JSON blocks found');
                    }
                  } catch (parseError6) {
                    try {
                      // 手法7: 改良されたfallback処理 - JSONレスポンスから適切にデータを抽出
                      parsedResult = this.extractDataFromJsonResponse(response);
                      logger.info('JSON parsing success with method 7 (improved fallback extraction)');
                    } catch (parseError7) {
                      logger.warn(`All JSON parsing attempts failed, using minimal fallback. Errors: Direct(${parseError1.message}), Markdown(${parseError2.message}), Bracket(${parseError3.message}), Cleaning(${parseError4.message}), LineFilter(${parseError5.message}), MultiBlock(${parseError6.message}), ImprovedFallback(${parseError7.message})`);
                      
                      // 最小限fallback: 解析失敗を明示
                      parsedResult = {
                        transcription: '⚠️ JSON解析エラー - AIレスポンスの形式解析に失敗しました',
                        summary: {
                          overview: 'JSON解析エラーのため要約生成できませんでした',
                          client: '不明',
                          attendees: [],
                          agenda: [],
                          discussions: [],
                          decisions: [],
                          actionItems: [],
                          nextSteps: [],
                          audioQuality: { clarity: 'unknown', issues: ['JSON解析失敗'], transcriptionConfidence: 'low' }
                        }
                      };
                      logger.error('Using minimal fallback due to complete JSON parsing failure');
                    }
                  }
                }
              }
            }
          }
        }
        
        // 結果の検証と追加改善
        if (!parsedResult.transcription || parsedResult.transcription.length < 50) {
          // JSON解析エラーの場合は例外をスローせず警告ログのみ
          if (parsedResult.transcription && parsedResult.transcription.includes('⚠️ JSON解析エラー')) {
            logger.warn('JSON parsing failed - using error transcription');
          } else {
            throw new Error('Transcription too short or missing');
          }
        }
        
        // パース結果の詳細ログ（デバッグ用）
        logger.info(`JSON parsing result validation: transcription=${parsedResult.transcription ? parsedResult.transcription.length : 0} chars, summary=${parsedResult.summary ? 'present' : 'missing'}`);
        
        // クライアント名が「不明」の場合、会議名から抽出を試行
        if (parsedResult.summary && (!parsedResult.summary.client || parsedResult.summary.client === '不明')) {
          const clientFromMeetingName = this.extractClientFromMeetingName(meetingInfo.topic);
          if (clientFromMeetingName !== '不明') {
            parsedResult.summary.client = clientFromMeetingName;
            logger.info(`Client name extracted from meeting topic: ${clientFromMeetingName}`);
          }
        }
        
        const processingTime = Date.now() - startTime;
        logger.info(`Unified audio processing successful on attempt ${attempt} (${processingTime}ms)`);
        
        // Phase 1: 個別プロパティ内のJSON混在データ清浄化
        parsedResult = this.cleanJsonMixedContent(parsedResult);
        logger.info('JSON mixed content cleaning completed for all properties');
        
        // Phase 3: 品質監視と自動再処理
        const qualityReport = this.detectAndEvaluateContentQuality(parsedResult);
        logger.info(`Content quality evaluation: ${qualityReport.overallScore}/100 (Issues: ${qualityReport.issues.length})`);
        
        // 品質問題がある場合の自動再処理
        if (qualityReport.needsReprocessing) {
          logger.warn(`Quality issues detected, initiating auto-reprocessing...`);
          const reprocessResult = await this.autoReprocessContent(parsedResult, qualityReport);
          
          if (reprocessResult.success) {
            parsedResult = reprocessResult.reprocessedData;
            logger.info(`Auto-reprocessing completed: ${reprocessResult.improvementsMade.join(', ')}`);
          } else {
            logger.warn(`Auto-reprocessing did not significantly improve quality`);
          }
        }
        
        // 最終的な品質チェック
        const qualityScore = this.calculateResponseQuality(parsedResult);
        logger.info(`Final response quality score: ${qualityScore.score}/100 (${qualityScore.details})`);
        
        // 成功時の返却データ
        return {
          success: true,
          qualityScore: qualityScore,
          meetingInfo: meetingInfo,
          transcription: parsedResult.transcription,
          structuredSummary: parsedResult.summary,
          
          // 後方互換性のための既存フィールド
          summary: parsedResult.summary.overview || '',
          participants: parsedResult.summary.attendees || [],
          actionItems: parsedResult.summary.actionItems || [],
          decisions: parsedResult.summary.decisions || [],
          
          // メタ情報
          model: this.selectedModel,
          timestamp: new Date().toISOString(),
          processingTime: processingTime,
          attemptsUsed: attempt,
          audioQuality: parsedResult.summary.audioQuality,
          apiCallsUsed: 1, // 統合版は常に1回のAPI呼び出し
          
          // 圧縮情報
          compression: compressionInfo
        };
        
      } catch (error) {
        lastError = error;
        logger.error(`Unified audio processing attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        // 音声処理エラーコード体系に基づく詳細分析
        let errorCode = 'E_GEMINI_PROCESSING'; // デフォルト: APIキー認証エラー
        
        // エラーコード判定（実際のGemini APIエラーパターンに基づく）
        if (error.message.includes('Audio content is too short') || error.message.includes('Minimum 10 seconds') || error.message.includes('duration: 3 seconds')) {
          errorCode = 'E_GEMINI_INSUFFICIENT_CONTENT'; // 音声コンテンツ不足
          logger.warn(`Audio processing error: ${errorCode} - Audio content insufficient (under 10 seconds)`);
        } else if (error.message.includes('[503 Service Unavailable]') || error.message.includes('model is overloaded')) {
          errorCode = 'E_GEMINI_SERVICE_OVERLOAD'; // サービス過負荷（503エラー専用）
          logger.warn(`Audio processing error: ${errorCode} - Service temporarily overloaded (503)`);
        } else if (error.message.includes('[429 Too Many Requests]') || error.message.includes('Resource has been exhausted') || error.message.includes('quota')) {
          errorCode = 'E_GEMINI_QUOTA'; // APIクォータ制限超過
          logger.warn(`Audio processing error: ${errorCode} - API quota/rate limit exceeded`);
        } else if (error.message.includes('[500 Internal Server Error]')) {
          errorCode = 'E_GEMINI_INTERNAL_ERROR'; // サーバー内部エラー
          logger.warn(`Audio processing error: ${errorCode} - Server internal error (500)`);
        } else if (error.message.includes('[401') || error.message.includes('[403') || error.message.includes('PERMISSION_DENIED')) {
          errorCode = 'E_GEMINI_PROCESSING'; // 明示的な認証エラー
          logger.warn(`Audio processing error: ${errorCode} - Authentication failed (401/403)`);
        } else if (error.message.includes('[400 Bad Request]') || error.message.includes('INVALID_ARGUMENT')) {
          errorCode = 'E_GEMINI_INVALID_FORMAT'; // 入力形式エラー
          logger.warn(`Audio processing error: ${errorCode} - Invalid input format (400)`);
        } else if (error.message.includes('JSON') || error.message.includes('parse')) {
          errorCode = 'E_GEMINI_RESPONSE_INVALID'; // 応答解析エラー
          logger.warn(`Audio processing error: ${errorCode} - Response parsing failure`);
        } else if (error.message.includes('audio') || error.message.includes('buffer')) {
          errorCode = 'E_AUDIO_COMPRESSION'; // 音声圧縮エラー
          logger.warn(`Audio processing error: ${errorCode} - Audio buffer processing failed`);
        } else if (error.message.includes('GoogleGenerativeAI Error')) {
          errorCode = 'E_GEMINI_GENERAL'; // Gemini API一般エラー
          logger.warn(`Audio processing error: ${errorCode} - General Gemini API error`);
        } else {
          errorCode = 'E_GEMINI_UNKNOWN'; // 不明なエラー
          logger.warn(`Audio processing error: ${errorCode} - Unknown error type`);
        }
        
        // エラーコードをログに記録
        logger.error(`Audio Error Code: ${errorCode} - ${error.message}`);
        
        // リトライ前の待機（エラーコード別の動的待機時間）
        if (attempt < maxRetries) {
          let waitTime;
          
          // エラーコード別の待機時間決定（Free Tier制限対応）
          if (errorCode === 'E_GEMINI_QUOTA') {
            // API配当制限エラー: APIから推奨された待機時間を採用
            const retryDelayMatch = error.message.match(/retryDelay":"(\d+)s"/);
            if (retryDelayMatch) {
              const recommendedDelay = parseInt(retryDelayMatch[1]) * 1000; // 秒をミリ秒に変換
              waitTime = Math.max(recommendedDelay, 35000); // 最低35秒（Free Tier: 2リクエスト/分を守る）
              logger.info(`Using API-recommended delay for quota limit: ${waitTime}ms (${waitTime/1000}s)`);
            } else {
              // APIからの推奨待機時間が不明な場合のデフォルト（Free Tier対応）
              waitTime = 35000 + (attempt * 10000); // 35秒、45秒、55秒...と増加
              logger.info(`Using Free Tier safe delay for quota limit: ${waitTime}ms (${waitTime/1000}s)`);
            }
          } else if (errorCode === 'E_GEMINI_SERVICE_OVERLOAD' || errorCode === 'E_GEMINI_INTERNAL_ERROR') {
            // サービス過負荷または内部エラー: Free Tier安全な待機時間
            // 1分間に2リクエストの制限を守るため、最低35秒待機
            waitTime = Math.max(35000, 35000 + (attempt - 1) * 10000); // 35秒、45秒、55秒...
            logger.info(`Using Free Tier safe backoff for service overload/internal error: ${waitTime}ms (${waitTime/1000}s)`);
          } else if (errorCode === 'E_GEMINI_PROCESSING') {
            // API認証・処理エラーまたはサービス過負荷: Free Tier安全な待機時間
            // 1分間に2リクエストの制限を守るため、最低35秒待機
            waitTime = Math.max(35000, 35000 + (attempt - 1) * 10000); // 35秒、45秒、55秒...
            logger.info(`Using Free Tier safe backoff for processing/overload error: ${waitTime}ms (${waitTime/1000}s)`);
          } else {
            // その他のエラー: Free Tier対応の待機時間
            waitTime = Math.max(35000, 30000 + (attempt * 5000)); // 最低35秒
            logger.info(`Using Free Tier safe standard backoff: ${waitTime}ms (${waitTime/1000}s)`);
          }
          
          logger.info(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // 最終失敗
    const totalTime = Date.now() - startTime;
    logger.error(`All ${maxRetries} unified audio processing attempts failed for ${meetingInfo.topic} (${totalTime}ms)`);
    throw new Error(`Unified audio processing failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * JSON混在コンテンツを清浄化する（Phase 1実装）
   * 個別プロパティ内のJSONフラグメントや混在データを除去
   */
  cleanJsonMixedContent(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const cleanedData = JSON.parse(JSON.stringify(data)); // ディープコピー

    // 再帰的にオブジェクト内の全文字列プロパティを清浄化
    const cleanObject = (obj, path = '') => {
      for (const key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        
        const currentPath = path ? `${path}.${key}` : key;
        const value = obj[key];
        
        if (typeof value === 'string') {
          // JSON混在パターンの検出と清浄化
          const originalLength = value.length;
          let cleanedValue = value;
          
          // パターン1: JSONオブジェクト形式の除去 {"key":"value"}
          if (cleanedValue.includes('{') && cleanedValue.includes('}')) {
            // JSONブロックを検出して除去（ただし、文章の一部として使われる{}は保持）
            cleanedValue = cleanedValue.replace(/\{[^{}]*"[^"]+"\s*:\s*[^{}]*\}/g, '');
            
            // 複数階層のネストされたJSONも除去
            let prevLength;
            do {
              prevLength = cleanedValue.length;
              cleanedValue = cleanedValue.replace(/\{[^{}]*\{[^{}]*\}[^{}]*\}/g, '');
            } while (cleanedValue.length < prevLength && cleanedValue.includes('{'));
          }
          
          // パターン2: JSON配列形式の除去 ["item1","item2"]
          if (cleanedValue.includes('[') && cleanedValue.includes(']')) {
            cleanedValue = cleanedValue.replace(/\[[^\[\]]*"[^"]+"[^\[\]]*\]/g, '');
          }
          
          // パターン3: エスケープされたJSON文字列の除去
          cleanedValue = cleanedValue.replace(/\\"/g, '"');
          
          // パターン4: 残存するJSON構文の除去
          cleanedValue = cleanedValue
            .replace(/"\s*:\s*"/g, ': ')
            .replace(/"\s*,\s*"/g, ', ')
            .replace(/\[\s*"/g, '')
            .replace(/"\s*\]/g, '')
            .replace(/\{\s*"/g, '')
            .replace(/"\s*\}/g, '');
          
          // パターン5: 連続する空白・改行の正規化
          cleanedValue = cleanedValue
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .replace(/\s\s+/g, ' ')
            .trim();
          
          // 清浄化結果の検証
          if (cleanedValue !== value) {
            const cleanedLength = cleanedValue.length;
            const reduction = originalLength - cleanedLength;
            logger.debug(`Cleaned property '${currentPath}': removed ${reduction} chars of JSON content`);
            
            // 空文字になった場合のフォールバック
            if (cleanedValue.length === 0 && originalLength > 0) {
              logger.warn(`Property '${currentPath}' became empty after cleaning, using fallback`);
              cleanedValue = 'データ処理中にエラーが発生しました';
            }
          }
          
          obj[key] = cleanedValue;
        } else if (typeof value === 'object' && value !== null) {
          // 再帰的に子オブジェクト/配列も処理
          if (Array.isArray(value)) {
            value.forEach((item, index) => {
              if (typeof item === 'object' && item !== null) {
                cleanObject(item, `${currentPath}[${index}]`);
              } else if (typeof item === 'string') {
                // 配列内の文字列要素も清浄化
                const cleanedItem = this.cleanStringValue(item);
                if (cleanedItem !== item) {
                  value[index] = cleanedItem;
                  logger.debug(`Cleaned array item at '${currentPath}[${index}]'`);
                }
              }
            });
          } else {
            cleanObject(value, currentPath);
          }
        }
      }
    };

    // 特に重要なフィールドを優先的に清浄化
    const criticalFields = [
      'transcription',
      'summary.overview', 
      'summary.meetingPurpose',
      'structuredSummary.overview',
      'structuredSummary.meetingPurpose'
    ];
    
    criticalFields.forEach(fieldPath => {
      const parts = fieldPath.split('.');
      let target = cleanedData;
      let parent = null;
      let lastKey = null;
      
      for (let i = 0; i < parts.length; i++) {
        if (target && typeof target === 'object') {
          parent = target;
          lastKey = parts[i];
          target = target[parts[i]];
        } else {
          break;
        }
      }
      
      if (parent && lastKey && typeof target === 'string') {
        const cleaned = this.cleanStringValue(target);
        if (cleaned !== target) {
          parent[lastKey] = cleaned;
          logger.info(`Critical field '${fieldPath}' cleaned: ${target.length} -> ${cleaned.length} chars`);
        }
      }
    });

    // 全体的な清浄化処理
    cleanObject(cleanedData);
    
    return cleanedData;
  }

  /**
   * 文字列値のJSON混在コンテンツを清浄化（ヘルパーメソッド）
   */
  cleanStringValue(value) {
    if (typeof value !== 'string') return value;
    
    let cleaned = value;
    
    // JSONパターンの段階的除去
    cleaned = cleaned
      // Step 1: 明確なJSONブロックを除去
      .replace(/\{[^{}]*"[^"]+"\s*:\s*[^{}]*\}/g, '')
      // Step 2: ネストされたJSONを除去
      .replace(/\{[^{}]*\{[^{}]*\}[^{}]*\}/g, '')
      // Step 3: JSON配列を除去
      .replace(/\[[^\[\]]*"[^"]+"[^\[\]]*\]/g, '')
      // Step 4: エスケープ文字を正規化
      .replace(/\\"/g, '"')
      // Step 5: JSON構文の残骸を除去
      .replace(/"\s*:\s*"/g, ': ')
      .replace(/"\s*,\s*"/g, ', ')
      // Step 6: 空白の正規化
      .replace(/\s\s+/g, ' ')
      .trim();
    
    return cleaned;
  }

  /**
   * Phase 3: 品質監視・自動再処理機能
   * JSON混在コンテンツの検出と品質評価
   */
  detectAndEvaluateContentQuality(data) {
    const qualityReport = {
      overallScore: 100,
      issues: [],
      jsonMixedDetected: false,
      needsReprocessing: false,
      details: {
        transcriptionQuality: 100,
        summaryQuality: 100,
        structuralIntegrity: 100
      }
    };
    
    // JSON混在パターンの検出
    const checkJsonMixed = (value, fieldName) => {
      if (typeof value !== 'string') return true;
      
      // JSONパターンの特定
      const jsonPatterns = [
        /\{[^{}]*"[^"]+"\s*:\s*[^{}]*\}/,  // 基本的なJSONオブジェクト
        /\[[^\[\]]*"[^"]+"[^\[\]]*\]/,     // JSON配列
        /"transcription":\s*"[^"]*"/,      // 特定JSONフィールド
        /\{[^{}]*\{[^{}]*\}[^{}]*\}/        // ネストされたJSON
      ];
      
      for (const pattern of jsonPatterns) {
        if (pattern.test(value)) {
          qualityReport.issues.push({
            type: 'JSON_MIXED_CONTENT',
            field: fieldName,
            severity: 'HIGH',
            description: `JSON混在コンテンツが検出されました: ${fieldName}`,
            pattern: pattern.toString(),
            sampleContent: value.substring(0, 100) + '...'
          });
          
          qualityReport.jsonMixedDetected = true;
          qualityReport.overallScore -= 25; // 重大な品質問題
          
          if (fieldName === 'transcription') {
            qualityReport.details.transcriptionQuality = 30;
          } else if (fieldName.includes('summary') || fieldName.includes('overview')) {
            qualityReport.details.summaryQuality = 20;
          }
          
          return false;
        }
      }
      return true;
    };
    
    // 再帰的な品質チェック
    const checkObjectRecursively = (obj, path = '') => {
      for (const key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        
        const currentPath = path ? `${path}.${key}` : key;
        const value = obj[key];
        
        if (typeof value === 'string') {
          checkJsonMixed(value, currentPath);
          
          // 空文字チェック
          if (value.length === 0) {
            qualityReport.issues.push({
              type: 'EMPTY_CONTENT',
              field: currentPath,
              severity: 'MEDIUM',
              description: `空のコンテンツ: ${currentPath}`
            });
            qualityReport.overallScore -= 10;
          }
          
          // 異常に短いコンテンツチェック
          if (key === 'transcription' && value.length < 50) {
            qualityReport.issues.push({
              type: 'INSUFFICIENT_CONTENT',
              field: currentPath,
              severity: 'HIGH',
              description: `文字起こしが不十分: ${value.length}文字`
            });
            qualityReport.details.transcriptionQuality = 40;
            qualityReport.overallScore -= 20;
          }
          
        } else if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((item, index) => {
              if (typeof item === 'object' && item !== null) {
                checkObjectRecursively(item, `${currentPath}[${index}]`);
              } else if (typeof item === 'string') {
                checkJsonMixed(item, `${currentPath}[${index}]`);
              }
            });
          } else {
            checkObjectRecursively(value, currentPath);
          }
        }
      }
    };
    
    // 品質チェック実行
    checkObjectRecursively(data);
    
    // 再処理必要性の判定
    qualityReport.needsReprocessing = (
      qualityReport.jsonMixedDetected ||
      qualityReport.overallScore < 70 ||
      qualityReport.issues.some(issue => issue.severity === 'HIGH')
    );
    
    // 品質スコアの下限制限
    qualityReport.overallScore = Math.max(0, qualityReport.overallScore);
    
    return qualityReport;
  }
  
  /**
   * Phase 3: 自動再処理機能
   * 品質問題が発見された場合の自動修正
   */
  async autoReprocessContent(originalData, qualityReport) {
    logger.warn(`Auto-reprocessing triggered due to quality issues. Score: ${qualityReport.overallScore}/100`);
    
    let reprocessedData = JSON.parse(JSON.stringify(originalData)); // ディープコピー
    let improvementsMade = [];
    
    // JSON混在問題の修正
    qualityReport.issues.forEach(issue => {
      if (issue.type === 'JSON_MIXED_CONTENT') {
        const fieldPath = issue.field;
        const pathParts = fieldPath.split('.');
        
        let target = reprocessedData;
        let parent = null;
        let lastKey = null;
        
        // フィールドパスを辿って対象を特定
        for (let i = 0; i < pathParts.length; i++) {
          if (target && typeof target === 'object') {
            parent = target;
            lastKey = pathParts[i];
            target = target[pathParts[i]];
          } else {
            break;
          }
        }
        
        if (parent && lastKey && typeof target === 'string') {
          const cleanedContent = this.cleanStringValue(target);
          if (cleanedContent !== target) {
            parent[lastKey] = cleanedContent;
            improvementsMade.push(`Fixed JSON mixed content in ${fieldPath}`);
            logger.info(`Auto-reprocessing: Cleaned ${fieldPath} (${target.length} -> ${cleanedContent.length} chars)`);
          }
        }
      }
    });
    
    // 空コンテンツの修正
    qualityReport.issues.forEach(issue => {
      if (issue.type === 'EMPTY_CONTENT') {
        const fieldPath = issue.field;
        const pathParts = fieldPath.split('.');
        
        let target = reprocessedData;
        let parent = null;
        let lastKey = null;
        
        for (let i = 0; i < pathParts.length; i++) {
          if (target && typeof target === 'object') {
            parent = target;
            lastKey = pathParts[i];
            target = target[pathParts[i]];
          } else {
            break;
          }
        }
        
        if (parent && lastKey && target === '') {
          parent[lastKey] = 'データ処理中に問題が発生しました';
          improvementsMade.push(`Fixed empty content in ${fieldPath}`);
          logger.info(`Auto-reprocessing: Added fallback content to ${fieldPath}`);
        }
      }
    });
    
    // 再処理結果の品質再評価
    const reprocessedQuality = this.detectAndEvaluateContentQuality(reprocessedData);
    
    const reprocessingResult = {
      success: reprocessedQuality.overallScore > qualityReport.overallScore,
      originalScore: qualityReport.overallScore,
      improvedScore: reprocessedQuality.overallScore,
      improvementsMade: improvementsMade,
      reprocessedData: reprocessedData,
      finalQuality: reprocessedQuality
    };
    
    if (reprocessingResult.success) {
      logger.info(`Auto-reprocessing successful: ${qualityReport.overallScore} -> ${reprocessedQuality.overallScore} points`);
    } else {
      logger.warn(`Auto-reprocessing completed but quality not significantly improved`);
    }
    
    return reprocessingResult;
  }
  
  /**
   * レスポンス品質評価
   */
  calculateResponseQuality(result) {
    let score = 0;
    const details = [];
    
    // 文字起こしの品質チェック
    if (result.transcription) {
      if (result.transcription.includes('⚠️ JSON解析エラー')) {
        score += 0;
        details.push('JSON解析失敗');
      } else if (result.transcription.length > 1000) {
        score += 50;
        details.push('十分な長さの文字起こし');
      } else if (result.transcription.length > 100) {
        score += 30;
        details.push('短めの文字起こし');
      } else {
        score += 10;
        details.push('非常に短い文字起こし');
      }
    }
    
    // 要約の品質チェック
    if (result.summary) {
      if (result.summary.overview && result.summary.overview !== 'JSON解析エラーのため要約生成できませんでした') {
        score += 30;
        details.push('要約生成成功');
      }
      if (result.summary.client && result.summary.client !== '不明') {
        score += 10;
        details.push('クライアント特定');
      }
      if (result.summary.attendees && result.summary.attendees.length > 0) {
        score += 10;
        details.push('参加者情報');
      }
    }
    
    return {
      score: Math.min(score, 100),
      details: details.join(', ') || '評価項目なし'
    };
  }

  /**
   * ヘルスチェック
   */
  async healthCheck() {
    try {
      // モデルの初期化を確認
      await this.ensureModelInitialized();
      
      const testPrompt = "Hello, please respond with 'AI service is healthy'";
      const result = await this.model.generateContent(testPrompt);
      const response = result.response;
      
      return {
        status: 'healthy',
        model: this.selectedModel,
        response: response.text()
      };
    } catch (error) {
      logger.error('AI service health check failed:', error.message);
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = AIService;