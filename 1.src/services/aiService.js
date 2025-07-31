const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs-extra');
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
        
        // 優先順位に基づいて最適なモデルを選択
        const preferredModels = [
          'gemini-1.5-pro-latest',
          'gemini-1.5-pro',
          'gemini-pro-latest', 
          'gemini-pro',
          'gemini-1.0-pro-latest',
          'gemini-1.0-pro'
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
            // 簡単なテストを実行してモデルが利用可能か確認
            await testModel.generateContent('test');
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
   * 音声ファイルを文字起こし
   */
  async transcribeAudio(audioFilePath, meetingInfo) {
    try {
      // モデルの初期化を確認
      await this.ensureModelInitialized();
      
      logger.info(`Starting transcription for: ${audioFilePath}`);

      // ファイルの存在確認
      const exists = await fs.pathExists(audioFilePath);
      if (!exists) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      // ファイルサイズの確認（Google AI APIの制限: 20MB）
      const stats = await fs.stat(audioFilePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      if (fileSizeMB > 20) {
        logger.warn(`File size (${fileSizeMB.toFixed(2)}MB) exceeds API limit. Consider compression.`);
        // 必要に応じてファイル圧縮処理を追加
      }

      // 音声ファイルをBase64エンコード
      const audioData = await fs.readFile(audioFilePath);
      const base64Audio = audioData.toString('base64');

      // ファイル拡張子から MIME タイプを決定
      const ext = path.extname(audioFilePath).toLowerCase();
      const mimeTypes = {
        '.mp3': 'audio/mpeg',
        '.mp4': 'video/mp4',
        '.m4a': 'audio/mp4',
        '.wav': 'audio/wav'
      };
      const mimeType = mimeTypes[ext] || 'audio/mpeg';

      // Google AI API に送信
      const prompt = this.buildTranscriptionPrompt(meetingInfo);
      
      const result = await this.model.generateContent([
        {
          inlineData: {
            data: base64Audio,
            mimeType: mimeType
          }
        },
        prompt
      ]);

      const response = result.response;
      const transcription = response.text();

      logger.info(`Transcription completed for meeting: ${meetingInfo.topic}`);

      return {
        transcription,
        meetingInfo,
        filePath: audioFilePath,
        timestamp: new Date().toISOString(),
        audioLength: stats.size,
        model: this.selectedModel
      };

    } catch (error) {
      logger.error(`Transcription failed for ${audioFilePath}:`, error.message);
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
    try {
      // モデルの初期化を確認
      await this.ensureModelInitialized();
      
      logger.info(`Generating summary for meeting: ${transcriptionResult.meetingInfo.topic}`);

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
        timestamp: new Date().toISOString(),
        originalFile: transcriptionResult.filePath
      };

    } catch (error) {
      logger.error(`Summary generation failed:`, error.message);
      throw error;
    }
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
    try {
      logger.info('Starting comprehensive meeting analysis...');

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
          analyzedAt: new Date().toISOString()
        },
        originalFile: transcriptionResult.filePath
      };

    } catch (error) {
      logger.error('Comprehensive analysis failed:', error.message);
      throw error;
    }
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