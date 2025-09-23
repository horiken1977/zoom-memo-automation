const logger = require('../utils/logger');

/**
 * 音声チャンク分割サービス
 * 大容量音声ファイルを効率的に分割してタイムアウト問題を解決
 */
class AudioChunkService {
  constructor() {
    this.defaultChunkDurationSeconds = 600; // 10分チャンク
    this.maxChunkSizeBytes = 18 * 1024 * 1024; // 18MB (Gemini 20MB制限の安全マージン)
    this.minChunkDurationSeconds = 300; // 最小5分チャンク
  }

  /**
   * 音声を時間ベースで分割（Phase A+B基本実装）
   */
  splitAudioByTime(audioBuffer, chunkDurationSeconds = null, meetingInfo = {}) {
    try {
      const startTime = Date.now();
      
      // 動的チャンク時間決定
      const chunkDuration = chunkDurationSeconds || this.calculateOptimalChunkDuration(audioBuffer, meetingInfo);
      
      // 音声の推定時間を計算
      const estimatedTotalDuration = this.estimateDurationFromBuffer(audioBuffer, meetingInfo);
      const bytesPerSecond = audioBuffer.length / estimatedTotalDuration;
      const chunkSizeBytes = Math.floor(bytesPerSecond * chunkDuration);
      
      logger.info(`🔪 音声分割開始: ${Math.round(audioBuffer.length/1024/1024)}MB → ${chunkDuration}秒チャンク (推定${Math.ceil(estimatedTotalDuration / chunkDuration)}個)`);
      
      const chunks = [];
      let chunkIndex = 0;
      
      for (let offset = 0; offset < audioBuffer.length; offset += chunkSizeBytes) {
        const chunkEnd = Math.min(offset + chunkSizeBytes, audioBuffer.length);
        const chunkData = audioBuffer.slice(offset, chunkEnd);
        
        const chunk = {
          data: chunkData,
          startTime: offset / bytesPerSecond,
          endTime: chunkEnd / bytesPerSecond,
          chunkIndex: chunkIndex,
          size: chunkData.length,
          duration: (chunkEnd - offset) / bytesPerSecond,
          // Phase A+B用メタデータ
          isFirst: chunkIndex === 0,
          isLast: chunkEnd >= audioBuffer.length,
          splitMethod: 'time_based'
        };
        
        chunks.push(chunk);
        logger.info(`📦 チャンク${chunkIndex + 1}: ${Math.round(chunk.startTime/60)}:${Math.round(chunk.startTime%60).toString().padStart(2,'0')}-${Math.round(chunk.endTime/60)}:${Math.round(chunk.endTime%60).toString().padStart(2,'0')} (${Math.round(chunk.size/1024/1024*100)/100}MB)`);
        
        chunkIndex++;
      }
      
      const processingTime = Date.now() - startTime;
      logger.info(`✅ 音声分割完了: ${chunks.length}チャンク生成 (${processingTime}ms)`);
      
      return {
        chunks,
        metadata: {
          totalChunks: chunks.length,
          chunkDuration,
          totalDuration: estimatedTotalDuration,
          splitMethod: 'time_based',
          processingTime,
          bytesPerSecond: Math.round(bytesPerSecond)
        }
      };
      
    } catch (error) {
      logger.error('音声分割エラー:', error);
      throw new Error(`Audio splitting failed: ${error.message}`);
    }
  }

  /**
   * 最適なチャンク時間を計算
   */
  calculateOptimalChunkDuration(audioBuffer, meetingInfo = {}) {
    const estimatedDuration = this.estimateDurationFromBuffer(audioBuffer, meetingInfo);
    const audioSizeMB = audioBuffer.length / (1024 * 1024);
    
    // 【Step1最適化】軽量モデル対応でチャンク時間を大幅拡大（処理回数削減）
    if (estimatedDuration <= 1800) { // 30分以下
      return Math.max(this.minChunkDurationSeconds, estimatedDuration / 2); // 2分割
    } else if (estimatedDuration <= 3600) { // 60分以下
      return 900; // 【重要】15分チャンク（軽量モデル対応）
    } else if (estimatedDuration <= 5400) { // 90分以下
      return 900; // 15分チャンク維持
    } else {
      return 720; // 12分チャンク（超長時間会議）
    }
  }

  /**
   * 音声バッファから推定時間を計算
   */
  estimateDurationFromBuffer(audioBuffer, meetingInfo = {}) {
    // 【デバッグ】meetingInfo.duration確認
    logger.info(`🔍 AudioChunk: meetingInfo.duration=${meetingInfo.duration}, bufferSize=${Math.round(audioBuffer.length/1024/1024)}MB`);
    
    // meetingInfoから時間が取得できる場合はそれを使用（分→秒変換）
    if (meetingInfo.duration && meetingInfo.duration > 0) {
      const durationInSeconds = meetingInfo.duration * 60; // 分→秒変換
      logger.info(`🔍 AudioChunk: meetingInfo.duration使用: ${meetingInfo.duration}分(${durationInSeconds}秒)`);
      return durationInSeconds;
    }
    
    // ファイルサイズからの推定（M4A: 約1MB/分、品質により変動）
    const audioSizeMB = audioBuffer.length / (1024 * 1024);
    
    // 音声フォーマット別の推定レート（**修正**: より正確な値に調整）
    const estimationRates = {
      'm4a': 0.8,   // **修正**: 0.9 → 0.8 (より保守的)
      'mp3': 1.0,   // **修正**: 1.2 → 1.0
      'wav': 10.0,
      'default': 0.9  // **修正**: 1.0 → 0.9 (デフォルトも保守的に)
    };
    
    // フォーマット検出
    const format = this.detectAudioFormatFromBuffer(audioBuffer);
    const rate = estimationRates[format] || estimationRates.default;
    
    const estimatedMinutes = audioSizeMB / rate;
    const estimatedSeconds = Math.max(300, estimatedMinutes * 60); // 最低5分
    
    // **追加**: 異常値チェックと警告
    if (estimatedSeconds < 600) { // 10分未満
      logger.warn(`⚠️ 短時間推定: ${audioSizeMB.toFixed(1)}MB → ${Math.round(estimatedSeconds/60)}分 (要確認)`);
    }
    
    if (audioSizeMB > 30 && estimatedSeconds < 1800) { // 30MB超で30分未満
      logger.warn(`⚠️ 異常な時間推定: ${audioSizeMB.toFixed(1)}MB → ${Math.round(estimatedSeconds/60)}分 (計算確認が必要)`);
      // **フォールバック**: 大容量ファイルの場合、より保守的な推定
      const fallbackSeconds = Math.max(estimatedSeconds, audioSizeMB * 60); // 1MB=1分として計算
      logger.info(`🔄 フォールバック推定適用: ${Math.round(fallbackSeconds/60)}分`);
      return fallbackSeconds;
    }
    
    logger.info(`📊 時間推定: ${audioSizeMB.toFixed(1)}MB (${format}) → ${Math.round(estimatedSeconds/60)}分${Math.round(estimatedSeconds%60)}秒`);
    
    return estimatedSeconds;
  }

  /**
   * バッファから音声フォーマット検出（簡易版）
   */
  detectAudioFormatFromBuffer(audioBuffer) {
    if (audioBuffer.length < 4) return 'unknown';
    
    const header = audioBuffer.slice(0, 12);
    
    // M4A (MPEG-4 Audio)
    if (header.includes(Buffer.from('ftyp'))) {
      return 'm4a';
    }
    
    // MP3
    if (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0) {
      return 'mp3';
    }
    
    // WAV
    if (header.includes(Buffer.from('RIFF')) && header.includes(Buffer.from('WAVE'))) {
      return 'wav';
    }
    
    return 'm4a'; // デフォルト（Zoomは通常M4A）
  }

  /**
   * チャンク処理の妥当性検証
   */
  validateChunks(chunks) {
    const validation = {
      isValid: true,
      warnings: [],
      errors: []
    };

    // 基本検証
    if (!chunks || chunks.length === 0) {
      validation.isValid = false;
      validation.errors.push('チャンクが生成されていません');
      return validation;
    }

    // サイズ検証
    for (const chunk of chunks) {
      if (chunk.size > this.maxChunkSizeBytes) {
        validation.warnings.push(`チャンク${chunk.chunkIndex + 1}: サイズ超過 (${Math.round(chunk.size/1024/1024)}MB > ${Math.round(this.maxChunkSizeBytes/1024/1024)}MB)`);
      }
      
      if (chunk.duration < this.minChunkDurationSeconds) {
        validation.warnings.push(`チャンク${chunk.chunkIndex + 1}: 時間不足 (${Math.round(chunk.duration)}秒 < ${this.minChunkDurationSeconds}秒)`);
      }
    }

    // 継続性検証
    for (let i = 1; i < chunks.length; i++) {
      if (Math.abs(chunks[i].startTime - chunks[i-1].endTime) > 1) { // 1秒以上の隙間
        validation.warnings.push(`チャンク${i}と${i+1}の間に隙間が検出されました`);
      }
    }

    return validation;
  }
}

module.exports = AudioChunkService;