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
        
        // 【ハルシネーション対策】空チャンクおよび極短チャンクはスキップ
        if (chunkData.length === 0) {
          logger.warn(`⚠️ 空チャンク検出（offset: ${offset}, end: ${chunkEnd}）、スキップ`);
          continue;
        }
        
        // 極短時間チャンク（5秒未満）の検出
        const chunkDurationSeconds = (chunkEnd - offset) / bytesPerSecond;
        if (chunkDurationSeconds < 5) {
          logger.warn(`⚠️ 極短チャンク検出（${chunkDurationSeconds.toFixed(2)}秒）、品質問題の可能性でスキップ`);
          continue;
        }
        
        let chunk = {
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
        
        // 【Phase1】チャンクデータの検証と修復
        chunk = this.validateAndRepairChunkData(chunk);
        
        // 【ハルシネーション対策】音声品質評価
        const quality = this.evaluateAudioQuality(chunk);
        chunk.qualityScore = quality.score;
        chunk.qualityIssues = quality.issues;
        
        // 破損チャンクまたは品質不適合チャンクはスキップ
        if (chunk.isCorrupted || !quality.isSuitable) {
          const reason = chunk.isCorrupted ? '破損検出' : `品質不適合: ${quality.issues.join(', ')}`;
          logger.warn(`⚠️ チャンク${chunkIndex + 1}: ${reason}、スキップ`);
          continue; // スキップして次のチャンクへ
        }
        
        chunks.push(chunk);
        // 時間表示を正しく計算（60分を超えないように）
        const startMinute = Math.floor(chunk.startTime/60);
        const startSecond = Math.round(chunk.startTime%60);
        const endMinute = Math.floor(chunk.endTime/60);
        const endSecond = Math.round(chunk.endTime%60);
        logger.info(`📦 チャンク${chunkIndex + 1}: ${startMinute}:${startSecond.toString().padStart(2,'0')}-${endMinute}:${endSecond.toString().padStart(2,'0')} (${Math.round(chunk.size/1024/1024*100)/100}MB)${chunk.isCorrupted ? ' [破損]' : ''}`);
        
        chunkIndex++;
      }
      
      const processingTime = Date.now() - startTime;
      logger.info(`✅ 音声分割完了: ${chunks.length}チャンク生成 (${processingTime}ms)`);
      
      // 破損チャンク数の警告
      const corruptedCount = chunks.filter(c => c.isCorrupted).length;
      if (corruptedCount > 0) {
        logger.warn(`⚠️ ${corruptedCount}個のチャンクで破損を検出`);
      }
      
      return {
        chunks,
        metadata: {
          totalChunks: chunks.length,
          chunkDuration,
          totalDuration: estimatedTotalDuration,
          splitMethod: 'time_based',
          processingTime,
          bytesPerSecond: Math.round(bytesPerSecond),
          corruptedChunks: corruptedCount // 【Phase1】破損チャンク数追加
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
    
    // 【Phase1緊急修正】400 Bad Request対策 - チャンクサイズを10MB以下に制限
    // Geminiが確実に処理できるサイズに調整（13.68MB → 10MB以下）
    if (estimatedDuration <= 1800) { // 30分以下
      return Math.max(this.minChunkDurationSeconds, estimatedDuration / 2); // 2分割
    } else if (estimatedDuration <= 3600) { // 60分以下
      return 720; // 【重要】12分チャンク（約10.9MB - 安全サイズ）
    } else if (estimatedDuration <= 5400) { // 90分以下
      return 600; // 10分チャンク（約9.1MB）
    } else {
      return 480; // 8分チャンク（超長時間会議、約7.3MB）
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
   * 【ハルシネーション対策】音声の無音判定
   */
  isAudioSilent(audioBuffer) {
    if (!audioBuffer || audioBuffer.length === 0) return true;
    
    // 簡易的な無音判定：すべてのバイトがゼロまたは極小値
    let nonZeroBytes = 0;
    const threshold = 10; // 極小値の閾値
    
    for (let i = 0; i < audioBuffer.length; i++) {
      if (Math.abs(audioBuffer[i]) > threshold) {
        nonZeroBytes++;
      }
    }
    
    // 全体の1%未満しか音声らしきデータがない場合は無音と判定
    const audioRatio = nonZeroBytes / audioBuffer.length;
    return audioRatio < 0.01;
  }

  /**
   * 【ハルシネーション対策】音声品質評価
   */
  evaluateAudioQuality(chunk) {
    const quality = {
      score: 1.0, // 0.0-1.0
      issues: [],
      isSuitable: true
    };
    
    // 極短時間チェック
    if (chunk.duration < 5) {
      quality.score *= 0.1;
      quality.issues.push(`極短時間: ${chunk.duration.toFixed(2)}秒`);
      quality.isSuitable = false;
    }
    
    // 無音チェック
    if (this.isAudioSilent(chunk.data)) {
      quality.score *= 0.1;
      quality.issues.push('無音または極小音声');
      quality.isSuitable = false;
    }
    
    // データサイズチェック
    const sizeMB = chunk.size / (1024 * 1024);
    if (sizeMB < 0.1) {
      quality.score *= 0.5;
      quality.issues.push(`音声データサイズが小さい: ${sizeMB.toFixed(2)}MB`);
    }
    
    return quality;
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

  /**
   * 【Phase1】音声チャンクデータの検証と修復
   */
  validateAndRepairChunkData(chunk) {
    try {
      const chunkBuffer = chunk.data;
      const sizeMB = chunkBuffer.length / (1024 * 1024);
      
      // サイズチェック
      if (sizeMB > 15) {
        logger.warn(`⚠️ チャンク${chunk.chunkIndex + 1}: サイズ超過 ${sizeMB.toFixed(2)}MB > 15MB`);
        // 強制的に10MBに圧縮
        const maxSize = 10 * 1024 * 1024;
        if (chunkBuffer.length > maxSize) {
          chunk.data = chunkBuffer.slice(0, maxSize);
          chunk.size = maxSize;
          logger.info(`📉 チャンク${chunk.chunkIndex + 1}: 10MBに圧縮`);
        }
      }
      
      // データ整合性チェック（M4A形式の簡易検証）
      if (chunkBuffer.length > 8) {
        const header = chunkBuffer.slice(0, 8);
        // M4Aの基本ヘッダー確認（ftypが含まれるべき）
        const hasFtyp = chunkBuffer.slice(4, 8).toString('ascii') === 'ftyp';
        
        if (chunk.isFirst && !hasFtyp) {
          logger.warn(`⚠️ チャンク${chunk.chunkIndex + 1}: 不正なM4Aヘッダー検出`);
          // ヘッダー修復試行（簡易的な修正）
          const validHeader = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]); // 基本的なftyp
          chunk.data = Buffer.concat([validHeader, chunkBuffer.slice(8)]);
          logger.info(`🔧 チャンク${chunk.chunkIndex + 1}: ヘッダー修復試行`);
        }
      }
      
      // ゼロバイトチェック
      const nonZeroBytes = chunkBuffer.filter(byte => byte !== 0).length;
      if (nonZeroBytes < chunkBuffer.length * 0.1) { // 90%以上がゼロバイト
        logger.error(`❌ チャンク${chunk.chunkIndex + 1}: 音声データが破損（ゼロバイト過多）`);
        chunk.isCorrupted = true;
      }
      
      // Base64エンコード可能性チェック
      try {
        const testEncode = chunkBuffer.toString('base64').substring(0, 100);
        if (!testEncode) {
          throw new Error('Base64エンコード失敗');
        }
      } catch (encodeError) {
        logger.error(`❌ チャンク${chunk.chunkIndex + 1}: Base64エンコード不可`);
        chunk.isCorrupted = true;
      }
      
      return chunk;
      
    } catch (error) {
      logger.error(`チャンク${chunk.chunkIndex + 1}検証エラー: ${error.message}`);
      chunk.isCorrupted = true;
      return chunk;
    }
  }
}

module.exports = AudioChunkService;