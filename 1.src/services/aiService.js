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
   * 音声バッファを文字起こし（Vercel環境用）
   */
  async transcribeAudioFromBuffer(audioBuffer, fileName, meetingInfo) {
    try {
      await this.ensureModelInitialized();
      
      logger.info(`Starting transcription from buffer: ${fileName} (${audioBuffer.length} bytes)`);

      // バッファサイズの確認（Google AI APIの制限: 20MB）
      const fileSizeMB = audioBuffer.length / (1024 * 1024);
      
      if (fileSizeMB > 20) {
        logger.warn(`Buffer size (${fileSizeMB.toFixed(2)}MB) exceeds API limit. Consider compression.`);
      }

      // バッファをBase64エンコード
      const base64Audio = audioBuffer.toString('base64');

      // ファイル拡張子から MIME タイプを決定（Gemini API仕様準拠）
      const ext = path.extname(fileName).toLowerCase();
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
      const mimeType = mimeTypes[ext] || 'audio/aac';

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

      logger.info(`Transcription from buffer completed for meeting: ${meetingInfo.topic}`);

      return {
        transcription,
        meetingInfo,
        fileName: fileName,
        timestamp: new Date().toISOString(),
        audioBufferSize: audioBuffer.length,
        model: this.selectedModel
      };

    } catch (error) {
      logger.error(`Transcription from buffer failed for ${fileName}:`, error.message);
      throw error;
    }
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
      try {
        await fs.access(audioFilePath);
      } catch (error) {
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
   * 音声データから構造化された会議要約を一度に生成（統合版）
   * @param {Buffer|string} audioInput - 音声バッファまたはファイルパス
   * @param {Object} meetingInfo - 会議情報
   * @param {Object} options - オプション設定
   * @returns {Promise<Object>} 構造化された分析結果
   */
  async processAudioWithStructuredOutput(audioInput, meetingInfo, options = {}) {
    const startTime = Date.now();
    const maxRetries = options.maxRetries || 5;
    const isBuffer = Buffer.isBuffer(audioInput);
    let lastError = null;
    
    logger.info(`Starting unified audio processing for: ${meetingInfo.topic}`);
    
    // 音声データの準備
    let audioData;
    let mimeType;
    
    try {
      if (isBuffer) {
        audioData = audioInput.toString('base64');
        mimeType = options.mimeType || 'audio/aac';
        logger.info(`Processing audio from buffer: ${audioInput.length} bytes`);
      } else {
        // ファイルパスの場合
        const fileBuffer = await fs.readFile(audioInput);
        audioData = fileBuffer.toString('base64');
        mimeType = this.getMimeType(audioInput);
        logger.info(`Processing audio from file: ${audioInput} (${fileBuffer.length} bytes)`);
      }
    } catch (error) {
      throw new Error(`Failed to prepare audio data: ${error.message}`);
    }
    
    // 統合プロンプト（音声から直接8項目構造化要約を生成）
    const structuredPrompt = `# 音声会議分析システム

あなたは音声ファイルから**正確なJSON形式**で構造化議事録を生成する専門AIです。

## 重要: 出力形式
- **絶対に** JSON形式のみで回答してください
- マークダウンブロック（\`\`\`json）は不要です
- 説明文は一切不要です
- { から } まで、純粋なJSONのみを出力してください

## 分析対象
**会議情報:**
- 会議名: ${meetingInfo.topic}
- 開催日時: ${meetingInfo.startTime}
- 時間: ${meetingInfo.duration}分
- 主催者: ${meetingInfo.hostName}

## 出力JSON構造
以下の構造で正確にJSONを生成してください：

{
  "transcription": "音声の完全な文字起こし（全ての発言を含む）",
  "summary": {
    "overview": "会議の目的と結論の要約（3-5文で簡潔に）",
    "client": "相手企業名（「○○株式会社」「○○様」「○○社」など、実際の会話から抽出）",
    "attendees": [
      {
        "name": "参加者の氏名",
        "role": "役職名",
        "organization": "所属会社名"
      }
    ],
    "agenda": ["議題項目1", "議題項目2"],
    "discussions": [
      {
        "topic": "議論のテーマ",
        "content": "議論の内容要約",
        "speaker": "主な発言者",
        "timestamp": "MM:SS"
      }
    ],
    "decisions": [
      {
        "decision": "決定された事項",
        "reason": "決定に至った理由",
        "implementationDate": "実施時期"
      }
    ],
    "actionItems": [
      {
        "task": "具体的なタスク内容",
        "assignee": "担当者名",
        "dueDate": "YYYY/MM/DD",
        "priority": "high"
      }
    ],
    "nextSteps": [
      {
        "action": "次に実行すべきアクション",
        "timeline": "実施時期"
      }
    ],
    "audioQuality": {
      "clarity": "excellent",
      "issues": [],
      "transcriptionConfidence": "high"
    }
  }
}

## クライアント名抽出の重要指示
- 会話内で言及される相手企業名を**必ず**抽出してください
- 「○○様」「○○社」「○○株式会社」「○○グループ」など、実際の表現をそのまま使用
- 会議名からも企業名を推測してください（例：「毎日放送様_第5回共通言語MTG」→「毎日放送様」）
- 不明な場合のみ"不明"とする

## データ品質基準
- 全ての配列は、該当項目がない場合は空配列 [] にする
- 不明な文字列項目は "不明" にする
- 日付形式は厳密に YYYY/MM/DD または YYYY-MM-DD にする
- priorityは high/medium/low のいずれかにする

**再度強調: 返答は純粋なJSONデータのみです。説明は一切不要です。**`;

    // リトライループ
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.ensureModelInitialized();
        
        logger.info(`Unified audio processing - Attempt ${attempt}/${maxRetries} for: ${meetingInfo.topic}`);
        
        // Gemini APIに一度だけリクエスト
        const result = await this.model.generateContent([
          {
            inlineData: {
              data: audioData,
              mimeType: mimeType
            }
          },
          structuredPrompt
        ]);
        
        const response = result.response.text();
        
        // JSON形式でパース（複数のフォールバック手法）
        let parsedResult;
        try {
          // 手法1: レスポンス全体をJSONとしてパース
          parsedResult = JSON.parse(response);
        } catch (parseError1) {
          try {
            // 手法2: マークダウンブロックを除去してパース
            const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              parsedResult = JSON.parse(jsonMatch[1]);
            } else {
              throw new Error('No JSON block found');
            }
          } catch (parseError2) {
            try {
              // 手法3: { } で囲まれた部分を抽出してパース
              const jsonObjectMatch = response.match(/\{[\s\S]*\}/);
              if (jsonObjectMatch) {
                parsedResult = JSON.parse(jsonObjectMatch[0]);
              } else {
                throw new Error('No JSON object found');
              }
            } catch (parseError3) {
              // 手法4: テキストクリーニング後にパース
              try {
                const cleanedText = response
                  .replace(/```json/g, '')
                  .replace(/```/g, '')
                  .replace(/^\s*[\r\n]/gm, '')
                  .trim();
                parsedResult = JSON.parse(cleanedText);
              } catch (parseError4) {
                logger.warn(`All JSON parsing attempts failed, using fallback. Errors: ${parseError1.message}, ${parseError2.message}, ${parseError3.message}, ${parseError4.message}`);
                
                // フォールバック: テキストベースの構造化データ生成
                parsedResult = {
                  transcription: response.length > 100 ? response : `文字起こし解析失敗: ${response}`,
                  summary: this.extractSummaryFromText(response)
                };
              }
            }
          }
        }
        
        // 結果の検証と追加改善
        if (!parsedResult.transcription || parsedResult.transcription.length < 50) {
          throw new Error('Transcription too short or missing');
        }
        
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
        
        // 成功時の返却データ
        return {
          success: true,
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
          apiCallsUsed: 1 // 統合版は常に1回のAPI呼び出し
        };
        
      } catch (error) {
        lastError = error;
        logger.error(`Unified audio processing attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        // 特定のエラーハンドリング
        if (error.message.includes('500 Internal Server Error')) {
          logger.warn('Gemini API server error detected (500) - AI009');
        } else if (error.message.includes('429')) {
          logger.warn('Rate limit exceeded - AI001');
        } else if (error.message.includes('401')) {
          logger.warn('Authentication failed - AI002');
        }
        
        // リトライ前の待機
        if (attempt < maxRetries) {
          const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
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