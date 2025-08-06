// TC202→TC203 統合テスト: サンプルデータ取得→8項目構造化要約
const SampleDataService = require('../1.src/services/sampleDataService');
const AudioSummaryService = require('../1.src/services/audioSummaryService');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  console.log('🧪 TC202→TC203 統合テスト開始');

  try {
    // Step 1: サービス初期化
    console.log('Step 1: SampleDataService & AudioSummaryService初期化');
    const sampleDataService = new SampleDataService();
    const audioSummaryService = new AudioSummaryService();

    // Step 2: Google Driveサンプルデータ取得（実際のAPIコール）
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

    // Step 5: 8項目構造化要約実行
    console.log('Step 5: 8項目構造化要約実行');
    const analysisResult = await audioSummaryService.processAudioFile(downloadResult.filePath, meetingInfo);
    console.log('✅ 8項目構造化要約成功:', analysisResult);

    // Step 6: 一時ファイル削除
    console.log('Step 6: 一時ファイル削除');
    await sampleDataService.cleanup();
    console.log('✅ 一時ファイル削除完了');

    return res.status(200).json({
      status: 'success',
      test: 'TC202→TC203',
      message: '統合テスト成功: サンプルデータ取得→8項目構造化要約',
      sampleData: sampleData,
      meetingInfo: meetingInfo,
      downloadResult: downloadResult,
      analysisResult: analysisResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ TC202→TC203統合テストエラー:', error);
    
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
      test: 'TC202→TC203',
      message: '統合テスト失敗: サンプルデータ取得→8項目構造化要約',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
};