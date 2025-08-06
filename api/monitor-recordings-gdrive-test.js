// TC203: 8項目構造化要約テスト（バッファ処理）
const SampleDataService = require('../1.src/services/sampleDataService');
const AudioSummaryService = require('../1.src/services/audioSummaryService');
const fs = require('fs').promises;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  console.log('🧪 TC203: 8項目構造化要約テスト（バッファ処理）開始');

  try {
    // Step 1: サービス初期化
    console.log('Step 1: SampleDataService初期化');
    const sampleDataService = new SampleDataService();
    
    console.log('Step 1b: AudioSummaryService初期化');
    const audioSummaryService = new AudioSummaryService();

    // Step 2: Google Driveサンプルデータ取得
    console.log('Step 2: getSampleData()実行');
    const sampleData = await sampleDataService.getSampleData();
    console.log('✅ サンプルデータ取得成功:', sampleData);

    // Step 3: サンプル会議情報生成
    console.log('Step 3: サンプル会議情報生成');
    const meetingInfo = sampleDataService.generateSampleMeetingInfo(sampleData.fileName);
    console.log('✅ サンプル会議情報生成成功:', meetingInfo);

    // Step 4: ファイルダウンロード
    console.log('Step 4: サンプルファイルダウンロード');
    const downloadResult = await sampleDataService.downloadSampleFile(sampleData.fileId, sampleData.fileName);
    console.log('✅ ファイルダウンロード成功:', downloadResult);

    // Step 5: ファイルをBufferに読み込み（Vercel環境対応）
    console.log('Step 5: 音声ファイルをBufferに読み込み');
    const audioBuffer = await fs.readFile(downloadResult.filePath);
    console.log('✅ Buffer読み込み成功:', `${audioBuffer.length} bytes`);

    // Step 6: 一時ファイル削除（Buffer読み込み後すぐに削除）
    console.log('Step 6: 一時ファイル削除');
    await sampleDataService.cleanup();
    console.log('✅ 一時ファイル削除完了');

    // Step 7: AudioSummaryServiceでBuffer処理＋8項目構造化要約
    console.log('Step 7: 8項目構造化要約処理開始');
    const analysisResult = await audioSummaryService.processAudioBuffer(audioBuffer, sampleData.fileName, meetingInfo);
    console.log('✅ 8項目構造化要約処理成功');

    return res.status(200).json({
      status: 'success',
      test: 'TC203-complete',
      message: '8項目構造化要約テスト成功（バッファ処理）',
      sampleData: sampleData,
      meetingInfo: meetingInfo,
      downloadResult: {
        fileName: downloadResult.fileName,
        fileSize: downloadResult.fileSize,
        bufferSize: audioBuffer.length,
        note: 'ファイルはBuffer処理後に削除済み'
      },
      analysisResult: analysisResult,
      note: 'TC203要件完了: 音声Buffer処理→Gemini文字起こし→8項目構造化要約',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ TC203テストエラー:', error);
    
    // エラー時も一時ファイル削除を試行
    try {
      const sampleDataService = new SampleDataService();
      await sampleDataService.cleanup();
      console.log('✅ エラー時一時ファイル削除完了');
    } catch (cleanupError) {
      console.error('❌ エラー時一時ファイル削除失敗:', cleanupError.message);
    }
    
    return res.status(500).json({
      status: 'error',
      test: 'TC203-complete',
      message: '8項目構造化要約テスト失敗（バッファ処理）',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
};