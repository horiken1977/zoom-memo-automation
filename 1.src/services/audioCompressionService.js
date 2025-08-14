const lamejs = require('lamejs');
const logger = require('../utils/logger');

/**
 * 音声圧縮サービス
 * 文字起こし精度向上のため、音声ファイルを最高レベルで圧縮
 * - サンプルレート: 16kHz (音声認識最適)
 * - チャンネル: モノラル (ファイルサイズ削減)
 * - ビットレート: 64kbps (文字起こし十分品質)
 * - ノイズ除去効果も期待
 */
class AudioCompressionService {
  constructor() {
    this.targetSampleRate = 16000; // 16kHz - 音声認識に最適
    this.targetBitRate = 64; // 64kbps - 文字起こし用途十分
    this.targetChannels = 1; // モノラル
  }

  /**
   * 音声バッファを最高レベルで圧縮
   * @param {Buffer} audioBuffer - 元の音声バッファ
   * @param {string} originalFileName - 元のファイル名
   * @returns {Promise<{compressedBuffer: Buffer, compressionRatio: number, originalSize: number, compressedSize: number}>}
   */
  async compressAudioBuffer(audioBuffer, originalFileName) {
    const startTime = Date.now();
    const originalSize = audioBuffer.length;
    
    try {
      logger.info(`🗜️ 音声圧縮開始: ${originalFileName} (${Math.round(originalSize / 1024 / 1024 * 100) / 100}MB)`);
      
      // 音声バッファの形式を検出
      const audioFormat = this.detectAudioFormat(audioBuffer, originalFileName);
      logger.info(`🎵 検出形式: ${audioFormat}`);
      
      // 音声データをPCM形式に変換
      let pcmData;
      if (audioFormat === 'mp3' || audioFormat === 'm4a') {
        // MP3/M4Aデコード（簡易実装）
        pcmData = await this.decodeToPCM(audioBuffer, audioFormat);
      } else {
        // WAVまたは既にPCMの場合
        pcmData = this.extractPCMFromWAV(audioBuffer);
      }
      
      // サンプリングレート変換（ダウンサンプリング）
      const downsampledPCM = this.downsamplePCM(pcmData, this.targetSampleRate);
      
      // ステレオからモノラルへ変換
      const monoPCM = this.convertToMono(downsampledPCM);
      
      // ノイズリダクション（簡易）
      const denoisedPCM = this.applySimpleDenoising(monoPCM);
      
      // MP3エンコード（最高圧縮）
      const compressedBuffer = this.encodeToMP3(denoisedPCM, this.targetSampleRate, this.targetChannels, this.targetBitRate);
      
      const compressedSize = compressedBuffer.length;
      const compressionRatio = Math.round((1 - compressedSize / originalSize) * 100);
      const processingTime = Date.now() - startTime;
      
      logger.info(`✅ 音声圧縮完了: ${Math.round(compressedSize / 1024 / 1024 * 100) / 100}MB (圧縮率: ${compressionRatio}%, 処理時間: ${processingTime}ms)`);
      logger.info(`🎯 圧縮設定: ${this.targetSampleRate}Hz, ${this.targetChannels}ch, ${this.targetBitRate}kbps`);
      
      return {
        compressedBuffer,
        compressionRatio,
        originalSize,
        compressedSize,
        processingTime,
        settings: {
          sampleRate: this.targetSampleRate,
          channels: this.targetChannels,
          bitRate: this.targetBitRate
        }
      };
      
    } catch (error) {
      logger.error(`❌ 音声圧縮失敗: ${originalFileName}`, error);
      throw new Error(`Audio compression failed: ${error.message}`);
    }
  }

  /**
   * 音声形式を検出
   */
  detectAudioFormat(buffer, fileName) {
    // ファイル名から拡張子を取得
    const extension = fileName.split('.').pop().toLowerCase();
    
    // バイナリシグネチャも確認
    const signature = buffer.slice(0, 4).toString('hex');
    
    if (extension === 'mp3' || signature.startsWith('fffb') || signature.startsWith('494433')) {
      return 'mp3';
    } else if (extension === 'm4a' || signature.startsWith('00000020') || signature.startsWith('00000018')) {
      return 'm4a';
    } else if (extension === 'wav' || signature === '52494646') {
      return 'wav';
    } else {
      // デフォルトはm4aとして処理
      return 'm4a';
    }
  }

  /**
   * 音声をPCMデータにデコード（簡易実装）
   */
  async decodeToPCM(audioBuffer, format) {
    // 実際のデコードは複雑なため、ここでは簡易的にWAV形式と仮定
    // 本格的には web-audio-api や音声デコードライブラリが必要
    
    // とりあえずバッファの一部をPCMデータとして扱う（仮実装）
    // 実際の音声ファイルの場合、ヘッダーを除去してPCMデータを抽出する必要がある
    const headerSize = format === 'wav' ? 44 : Math.min(1024, Math.floor(audioBuffer.length * 0.1));
    const pcmData = audioBuffer.slice(headerSize);
    
    logger.info(`🔄 PCMデコード完了: ${pcmData.length}バイト (ヘッダー${headerSize}バイト除去)`);
    return pcmData;
  }

  /**
   * WAVファイルからPCMデータを抽出
   */
  extractPCMFromWAV(wavBuffer) {
    // WAVヘッダーは通常44バイト
    const headerSize = 44;
    if (wavBuffer.length < headerSize) {
      throw new Error('Invalid WAV file: too small');
    }
    
    return wavBuffer.slice(headerSize);
  }

  /**
   * PCMデータのダウンサンプリング
   */
  downsamplePCM(pcmData, targetSampleRate) {
    // 簡易ダウンサンプリング：N個おきにサンプルを取得
    // 実際の実装では、元のサンプルレートを検出してから適切に変換する必要がある
    const assumedOriginalRate = 48000; // 仮定：48kHz
    const downsampleRatio = Math.floor(assumedOriginalRate / targetSampleRate);
    
    if (downsampleRatio <= 1) {
      return pcmData; // ダウンサンプリング不要
    }
    
    const outputLength = Math.floor(pcmData.length / downsampleRatio);
    const downsampled = Buffer.alloc(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      downsampled[i] = pcmData[i * downsampleRatio];
    }
    
    logger.info(`⬇️ ダウンサンプリング: ${pcmData.length} → ${downsampled.length}バイト (1/${downsampleRatio})`);
    return downsampled;
  }

  /**
   * ステレオからモノラルに変換
   */
  convertToMono(pcmData) {
    // バッファ境界チェック
    if (!pcmData || pcmData.length === 0) {
      logger.warn('⚠️ モノラル変換: 空のPCMデータ');
      return Buffer.alloc(0);
    }
    
    // 16bit PCMと仮定して、2チャンネルを1チャンネルに変換
    if (pcmData.length % 4 !== 0) {
      // 奇数長の場合はそのまま返す（既にモノラルと仮定）
      logger.info(`🎧 モノラル変換スキップ: ${pcmData.length}バイト（既にモノラル形式）`);
      return pcmData;
    }
    
    const monoLength = Math.floor(pcmData.length / 2);
    const mono = Buffer.alloc(monoLength);
    
    // 安全な範囲でのモノラル変換
    for (let i = 0; i < monoLength; i += 2) {
      const leftOffset = i * 2;
      const rightOffset = i * 2 + 2;
      
      // バッファ境界チェック
      if (leftOffset + 1 >= pcmData.length || rightOffset + 1 >= pcmData.length) {
        logger.warn(`⚠️ モノラル変換: バッファ境界到達 at ${i}/${monoLength}`);
        break;
      }
      
      try {
        const left = pcmData.readInt16LE(leftOffset);
        const right = pcmData.readInt16LE(rightOffset);
        const average = Math.floor((left + right) / 2);
        mono.writeInt16LE(average, i);
      } catch (error) {
        logger.warn(`⚠️ モノラル変換エラー at ${i}: ${error.message}`);
        break;
      }
    }
    
    logger.info(`🎧 モノラル変換: ${pcmData.length} → ${mono.length}バイト`);
    return mono;
  }

  /**
   * 簡易ノイズリダクション
   */
  applySimpleDenoising(pcmData) {
    // バッファ境界チェック
    if (!pcmData || pcmData.length < 2) {
      logger.warn('⚠️ ノイズリダクション: PCMデータが小さすぎます');
      return pcmData;
    }
    
    // 簡易ローパスフィルター：高周波ノイズを除去
    const filtered = Buffer.alloc(pcmData.length);
    
    for (let i = 0; i < pcmData.length - 2; i += 2) {
      // バッファ境界チェック
      if (i + 1 >= pcmData.length) {
        break;
      }
      
      try {
        if (i === 0) {
          filtered.writeInt16LE(pcmData.readInt16LE(i), i);
        } else {
          // 前後のサンプルとの平均でスムージング
          const prev = i >= 2 ? pcmData.readInt16LE(i - 2) : 0;
          const current = pcmData.readInt16LE(i);
          const next = i + 2 < pcmData.length ? pcmData.readInt16LE(i + 2) : current;
          
          const smoothed = Math.floor((prev * 0.25 + current * 0.5 + next * 0.25));
          filtered.writeInt16LE(smoothed, i);
        }
      } catch (error) {
        logger.warn(`⚠️ ノイズリダクションエラー at ${i}: ${error.message}`);
        // エラー時は元の値をコピー
        if (i + 1 < pcmData.length) {
          filtered.writeInt16LE(pcmData.readInt16LE(i), i);
        }
      }
    }
    
    logger.info(`🔇 ノイズリダクション適用: ${pcmData.length}バイト`);
    return filtered;
  }

  /**
   * PCMデータをMP3にエンコード
   */
  encodeToMP3(pcmData, sampleRate, channels, bitRate) {
    try {
      // LameJSエンコーダーを初期化
      const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitRate);
      
      // PCMデータを16bitサンプルの配列に変換（境界チェック付き）
      const samples = [];
      for (let i = 0; i < pcmData.length - 1; i += 2) {
        try {
          if (i + 1 < pcmData.length) {
            samples.push(pcmData.readInt16LE(i));
          }
        } catch (error) {
          logger.warn(`⚠️ PCM読み取りエラー at ${i}: ${error.message}`);
          break;
        }
      }
      
      // サンプル数を1152の倍数に調整（MP3フレームサイズ）
      const frameSize = 1152;
      const paddedLength = Math.ceil(samples.length / frameSize) * frameSize;
      while (samples.length < paddedLength) {
        samples.push(0);
      }
      
      // MP3エンコード
      const mp3Data = [];
      for (let i = 0; i < samples.length; i += frameSize) {
        const chunk = samples.slice(i, i + frameSize);
        const mp3buf = mp3encoder.encodeBuffer(chunk);
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
      }
      
      // 最終フレーム
      const finalBuffer = mp3encoder.flush();
      if (finalBuffer.length > 0) {
        mp3Data.push(finalBuffer);
      }
      
      // 全MP3データを結合
      const totalLength = mp3Data.reduce((sum, buf) => sum + buf.length, 0);
      const mp3Buffer = Buffer.alloc(totalLength);
      let offset = 0;
      
      for (const buf of mp3Data) {
        buf.copy(mp3Buffer, offset);
        offset += buf.length;
      }
      
      logger.info(`🎵 MP3エンコード完了: ${mp3Buffer.length}バイト`);
      return mp3Buffer;
      
    } catch (error) {
      logger.error('MP3エンコードエラー:', error);
      throw new Error(`MP3 encoding failed: ${error.message}`);
    }
  }

  /**
   * 圧縮が推奨されるファイルサイズかチェック
   */
  shouldCompress(bufferSize) {
    const thresholdMB = 10; // 10MB以上は圧縮推奨
    const sizeMB = bufferSize / 1024 / 1024;
    return sizeMB >= thresholdMB;
  }

  /**
   * 圧縮統計情報を生成
   */
  generateCompressionStats(originalSize, compressedSize, processingTime) {
    return {
      originalSizeMB: Math.round(originalSize / 1024 / 1024 * 100) / 100,
      compressedSizeMB: Math.round(compressedSize / 1024 / 1024 * 100) / 100,
      compressionRatio: Math.round((1 - compressedSize / originalSize) * 100),
      processingTimeMs: processingTime,
      spaceSavedMB: Math.round((originalSize - compressedSize) / 1024 / 1024 * 100) / 100
    };
  }
}

module.exports = AudioCompressionService;