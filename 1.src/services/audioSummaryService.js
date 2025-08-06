const AIService = require('./aiService');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class AudioSummaryService {
  constructor() {
    this.aiService = new AIService();
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
   * 処理結果の検証
   */
  validateProcessingResult(result) {
    if (!result || !result.analysis || !result.transcription) {
      throw new Error('Invalid processing result: missing required fields');
    }

    if (!result.analysis.summary) {
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