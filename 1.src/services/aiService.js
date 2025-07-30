const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(config.googleAI.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: config.googleAI.model });
  }

  /**
   * 音声ファイルを文字起こし
   */
  async transcribeAudio(audioFilePath, meetingInfo) {
    try {
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

      const response = await result.response;
      const transcription = response.text();

      logger.info(`Transcription completed for meeting: ${meetingInfo.topic}`);

      return {
        transcription,
        meetingInfo,
        filePath: audioFilePath,
        timestamp: new Date().toISOString(),
        audioLength: stats.size,
        model: config.googleAI.model
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
      logger.info(`Generating summary for meeting: ${transcriptionResult.meetingInfo.topic}`);

      const prompt = config.prompts.summary.userPrompt.replace(
        '{transcription}', 
        transcriptionResult.transcription
      );

      const result = await this.model.generateContent([
        config.prompts.summary.systemPrompt,
        prompt
      ]);

      const response = await result.response;
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
      const result = await this.model.generateContent([
        customPrompt,
        content
      ]);

      const response = await result.response;
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
      const response = await result.response;
      
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
      const response = await result.response;
      
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
      const response = await result.response;
      
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
      const testPrompt = "Hello, please respond with 'AI service is healthy'";
      const result = await this.model.generateContent(testPrompt);
      const response = await result.response;
      
      return {
        status: 'healthy',
        model: config.googleAI.model,
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