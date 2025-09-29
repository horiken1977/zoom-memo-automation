/**
 * TranscriptService - Zoom Transcript API連携サービス
 * 
 * VTTファイルから文字起こしを解析し、構造化された要約を生成する
 * v2.0実装の中核コンポーネント
 * 
 * @module services/transcriptService
 * @since 2025-09-27
 */

const logger = require('../utils/logger');
const { ErrorManager } = require('../utils/errorCodes');

class TranscriptService {
  /**
   * コンストラクタ
   * @param {Object} options - 設定オプション
   * @param {Object} options.aiService - AIサービスインスタンス
   * @param {Object} options.zoomService - Zoomサービスインスタンス
   * @param {boolean} options.fallbackEnabled - フォールバック機能の有効/無効
   */
  constructor(options = {}) {
    this.aiService = options.aiService || null;
    this.zoomService = options.zoomService || null;
    this.fallbackEnabled = options.fallbackEnabled !== false;
    
    // 依存サービスの遅延初期化
    if (!this.aiService) {
      const AIService = require('./aiService');
      this.aiService = new AIService();
    }
    
    if (!this.zoomService) {
      const ZoomService = require('./zoomService');
      this.zoomService = new ZoomService();
    }
    
    // パフォーマンス測定用
    this.performanceMetrics = {
      vttDownloadTime: 0,
      vttParseTime: 0,
      aiProcessingTime: 0,
      totalTime: 0
    };
    
    logger.info('TranscriptService initialized with fallback:', this.fallbackEnabled);
  }

  /**
   * メイン処理 - Transcript APIを使用して録画を処理
   * @param {Object} recording - Zoom録画情報
   * @param {Object} meetingInfo - 会議情報
   * @returns {Promise<Object>} 処理結果
   */
  async processTranscript(recording, meetingInfo) {
    const startTime = Date.now();
    
    try {
      logger.info(`Starting transcript processing for meeting: ${meetingInfo.topic}`);
      
      // 1. Transcript利用可能性チェック
      const availability = await this.checkTranscriptAvailability(recording);
      
      if (!availability.available) {
        logger.warn('Transcript not available for this recording');
        return {
          success: false,
          requiresFallback: true,
          reason: 'transcript_not_available',
          error: availability.error
        };
      }
      
      // 2. VTTファイルダウンロード
      const vttStartTime = Date.now();
      const vttBuffer = await this.downloadVTTFile(availability.transcriptFile);
      this.performanceMetrics.vttDownloadTime = Date.now() - vttStartTime;
      
      logger.info(`VTT file downloaded: ${vttBuffer.length} bytes in ${this.performanceMetrics.vttDownloadTime}ms`);
      
      // 3. VTT解析
      const parseStartTime = Date.now();
      const parsedVTT = await this.parseVTTFile(vttBuffer);
      this.performanceMetrics.vttParseTime = Date.now() - parseStartTime;
      
      logger.info(`VTT parsed: ${parsedVTT.segments.length} segments in ${this.performanceMetrics.vttParseTime}ms`);
      
      // 4. AI用テキストフォーマット
      const formattedText = this.formatTranscriptForAI(parsedVTT);
      
      // 5. AI要約生成
      const aiStartTime = Date.now();
      const summaryResult = await this.generateSummaryFromTranscript(formattedText, meetingInfo, parsedVTT);
      this.performanceMetrics.aiProcessingTime = Date.now() - aiStartTime;
      
      // 6. 結果フォーマット
      this.performanceMetrics.totalTime = Date.now() - startTime;
      
      const result = {
        success: true,
        method: 'transcript-api',
        transcript: {
          participants: parsedVTT.participants,
          segments: parsedVTT.segments,
          fullText: parsedVTT.fullText,
          metadata: parsedVTT.metadata,
          processingTime: this.performanceMetrics.vttParseTime
        },
        structuredSummary: summaryResult.structuredSummary,
        processingStats: {
          vttSize: vttBuffer.length,
          vttDownloadTime: this.performanceMetrics.vttDownloadTime,
          parseTime: this.performanceMetrics.vttParseTime,
          summaryTime: this.performanceMetrics.aiProcessingTime,
          totalTime: this.performanceMetrics.totalTime
        },
        meetingInfo: meetingInfo
      };
      
      logger.info(`Transcript processing completed in ${this.performanceMetrics.totalTime}ms`);
      
      return result;
      
    } catch (error) {
      logger.error('Error in transcript processing:', error);
      
      // エラーハンドリング・フォールバック判定
      return await this.handleTranscriptError(error, recording, meetingInfo);
    }
  }

  /**
   * Transcript利用可能性チェック
   * @param {Object} recording - Zoom録画情報
   * @returns {Promise<Object>} 可用性情報
   */
  async checkTranscriptAvailability(recording) {
    try {
      // recording_files内でTRANSCRIPTまたはVTTファイルを検索
      const transcriptFile = recording.recording_files?.find(file => 
        file.file_type === 'TRANSCRIPT' || 
        file.file_type === 'VTT' ||
        file.file_extension === 'vtt' ||
        (file.file_name && file.file_name.toLowerCase().endsWith('.vtt'))
      );
      
      if (!transcriptFile) {
        return {
          available: false,
          error: 'No transcript file found in recording'
        };
      }
      
      // ファイルサイズチェック（0バイトファイル除外）
      if (!transcriptFile.file_size || transcriptFile.file_size === 0) {
        return {
          available: false,
          error: 'Transcript file size is 0 or undefined'
        };
      }
      
      return {
        available: true,
        transcriptFile: {
          id: transcriptFile.id,
          file_type: transcriptFile.file_type,
          file_size: transcriptFile.file_size,
          download_url: transcriptFile.download_url,
          file_extension: transcriptFile.file_extension || 'vtt'
        },
        estimatedProcessingTime: this.estimateProcessingTime(transcriptFile.file_size)
      };
      
    } catch (error) {
      logger.error('Error checking transcript availability:', error);
      return {
        available: false,
        error: error.message
      };
    }
  }

  /**
   * VTTファイルのダウンロード
   * @param {Object} transcriptFile - Transcriptファイル情報
   * @returns {Promise<Buffer>} VTTファイルのバッファ
   */
  async downloadVTTFile(transcriptFile) {
    try {
      if (!transcriptFile.download_url) {
        throw new Error('No download URL for transcript file');
      }
      
      // ZoomServiceのdownloadFileAsBufferメソッドを活用
      const buffer = await this.zoomService.downloadFileAsBuffer(transcriptFile.download_url);
      
      return buffer;
      
    } catch (error) {
      logger.error('Error downloading VTT file:', error);
      throw ErrorManager.createError('ZM-403', { error: error.message });
    }
  }

  /**
   * VTTファイル解析 - 最重要メソッド
   * @param {Buffer} vttBuffer - VTTファイルのバッファ
   * @returns {Object} 解析済み構造化データ
   */
  async parseVTTFile(vttBuffer) {
    try {
      const vttContent = vttBuffer.toString('utf8');
      
      // VTTヘッダー確認
      if (!vttContent.startsWith('WEBVTT')) {
        throw new Error('Invalid VTT file: missing WEBVTT header');
      }
      
      // セグメントの解析
      const segments = [];
      const participants = new Map();
      let fullText = '';
      
      // VTTコンテンツを行で分割し、空行でセグメントを区切る
      const blocks = vttContent.split(/\n\n+/);
      
      for (const block of blocks) {
        if (!block || block === 'WEBVTT') continue;
        
        const lines = block.trim().split('\n');
        if (lines.length < 2) continue;
        
        // タイムスタンプの解析
        const timeMatch = lines[0].match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
        
        if (timeMatch) {
          const startTime = timeMatch[1];
          const endTime = timeMatch[2];
          
          // テキスト内容の抽出（タイムスタンプ以降の行）
          const textLines = lines.slice(1).join(' ');
          
          // スピーカー抽出（<v Speaker>形式）
          const speakerMatch = textLines.match(/<v\s+([^>]+)>/);
          let speaker = 'Unknown';
          let text = textLines;
          
          if (speakerMatch) {
            speaker = speakerMatch[1].trim();
            // スピーカータグを除去
            text = textLines.replace(/<v\s+[^>]+>/, '').trim();
          }
          
          // セグメント追加
          segments.push({
            startTime,
            endTime,
            speaker,
            text,
            timestamp: this.timeToMilliseconds(startTime)
          });
          
          // 参加者情報を更新
          if (!participants.has(speaker)) {
            participants.set(speaker, { 
              id: speaker, 
              name: speaker, 
              segments: 0 
            });
          }
          participants.get(speaker).segments++;
          
          // フルテキストに追加
          fullText += `[${this.formatTime(startTime)}] ${speaker}: ${text}\n`;
        }
      }
      
      // 会議の総時間計算
      const duration = segments.length > 0 
        ? segments[segments.length - 1].endTime 
        : '00:00:00.000';
      
      return {
        participants: Array.from(participants.values()),
        segments,
        fullText: fullText.trim(),
        metadata: {
          duration,
          totalSegments: segments.length,
          speakerCount: participants.size
        }
      };
      
    } catch (error) {
      logger.error('Error parsing VTT file:', error);
      throw ErrorManager.createError('TS-501', { error: error.message });
    }
  }

  /**
   * 解析済みVTTをAI処理用にフォーマット
   * @param {Object} parsedVTT - parseVTTFileの結果
   * @returns {string} AI処理用フォーマット済みテキスト
   */
  formatTranscriptForAI(parsedVTT) {
    // AI処理用に最適化されたフォーマット
    let formattedText = `会議参加者: ${parsedVTT.participants.map(p => p.name).join(', ')}\n`;
    formattedText += `会議時間: ${parsedVTT.metadata.duration}\n`;
    formattedText += `発言数: ${parsedVTT.metadata.totalSegments}\n\n`;
    formattedText += '=== 会議内容 ===\n\n';
    
    // セグメントをスピーカーごとにグループ化して読みやすくする
    let currentSpeaker = null;
    let speakerBlock = [];
    
    for (const segment of parsedVTT.segments) {
      if (segment.speaker !== currentSpeaker) {
        if (speakerBlock.length > 0) {
          formattedText += `\n[${this.formatTime(speakerBlock[0].startTime)}] ${currentSpeaker}:\n`;
          formattedText += speakerBlock.map(s => s.text).join(' ') + '\n';
        }
        currentSpeaker = segment.speaker;
        speakerBlock = [segment];
      } else {
        speakerBlock.push(segment);
      }
    }
    
    // 最後のブロックを追加
    if (speakerBlock.length > 0) {
      formattedText += `\n[${this.formatTime(speakerBlock[0].startTime)}] ${currentSpeaker}:\n`;
      formattedText += speakerBlock.map(s => s.text).join(' ') + '\n';
    }
    
    return formattedText;
  }

  /**
   * Transcriptから要約を生成
   * @param {string} formattedText - フォーマット済みテキスト
   * @param {Object} meetingInfo - 会議情報
   * @param {Object} parsedVTT - 解析済みVTTデータ
   * @returns {Promise<Object>} 要約結果
   */
  async generateSummaryFromTranscript(formattedText, meetingInfo, parsedVTT) {
    try {
      // AIServiceのgenerateSummaryFromTranscriptionメソッドを活用
      const summaryResult = await this.aiService.generateSummaryFromTranscription(
        formattedText,
        {
          ...meetingInfo,
          participantCount: parsedVTT.metadata.speakerCount,
          duration: parsedVTT.metadata.duration,
          transcriptSource: 'zoom-transcript-api'
        }
      );
      
      return summaryResult;
      
    } catch (error) {
      logger.error('Error generating summary from transcript:', error);
      throw error;
    }
  }

  /**
   * エラーハンドリング・フォールバック判定
   * @param {Error} error - 発生したエラー
   * @param {Object} recording - 録画情報
   * @param {Object} meetingInfo - 会議情報
   * @returns {Promise<Object>} フォールバック結果
   */
  async handleTranscriptError(error, recording, meetingInfo) {
    const errorCode = error.code || 'UNKNOWN';
    
    // エラータイプによるフォールバック判定
    const requiresFallback = (
      errorCode.startsWith('ZM-4') ||     // Zoom API エラー
      errorCode.startsWith('TS-5') ||     // Transcript処理エラー
      error.message.includes('not available') ||
      error.message.includes('parsing failed')
    );
    
    if (!this.fallbackEnabled) {
      return {
        success: false,
        requiresFallback: false,
        error: error.message,
        errorCode
      };
    }
    
    return {
      success: false,
      requiresFallback,
      reason: this.getErrorReason(errorCode),
      error: error.message,
      errorCode,
      fallbackInfo: {
        method: 'audio-processing',
        estimatedTime: 180000  // 3分
      }
    };
  }

  /**
   * エラー理由の取得
   * @param {string} errorCode - エラーコード
   * @returns {string} エラー理由
   */
  getErrorReason(errorCode) {
    const reasons = {
      'ZM-401': 'transcript_auth_failed',
      'ZM-402': 'transcript_not_available',
      'ZM-403': 'transcript_download_failed',
      'TS-501': 'vtt_parse_failed',
      'TS-502': 'transcript_timeout',
      'UNKNOWN': 'unknown_error'
    };
    
    return reasons[errorCode] || 'unknown_error';
  }

  /**
   * 処理時間の推定
   * @param {number} fileSize - ファイルサイズ（バイト）
   * @returns {number} 推定処理時間（秒）
   */
  estimateProcessingTime(fileSize) {
    // VTTファイルサイズに基づく推定（通常50-200KB）
    const sizeMB = fileSize / (1024 * 1024);
    
    // 推定: 100KBあたり10秒
    const estimatedSeconds = (fileSize / 100000) * 10;
    
    // 最小10秒、最大60秒
    return Math.max(10, Math.min(60, estimatedSeconds));
  }

  /**
   * 時間文字列をミリ秒に変換
   * @param {string} timeStr - 時間文字列（00:00:00.000形式）
   * @returns {number} ミリ秒
   */
  timeToMilliseconds(timeStr) {
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const secondsParts = parts[2].split('.');
    const seconds = parseInt(secondsParts[0], 10) || 0;
    const milliseconds = parseInt(secondsParts[1], 10) || 0;
    
    return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
  }

  /**
   * 時間フォーマット（表示用）
   * @param {string} timeStr - 時間文字列
   * @returns {string} フォーマット済み時間（MM:SS形式）
   */
  formatTime(timeStr) {
    const parts = timeStr.split(':');
    const minutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}

module.exports = TranscriptService;