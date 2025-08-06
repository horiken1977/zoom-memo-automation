// デバッグ用：部品化サービステスト
module.exports = async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  console.log('🐛 デバッグ用テスト開始');

  try {
    // Step 1: 基本確認
    console.log('Step 1: 基本動作確認');
    
    // Step 2: SampleDataServiceを個別テスト
    console.log('Step 2: SampleDataServiceインポートテスト');
    const SampleDataService = require('../1.src/services/sampleDataService');
    console.log('✅ SampleDataService インポート成功');
    
    // Step 3: サービス初期化テスト
    console.log('Step 3: サービス初期化テスト');
    const sampleDataService = new SampleDataService();
    console.log('✅ SampleDataService 初期化成功');

    // Step 4: 基本的なメソッド呼び出しテスト
    console.log('Step 4: サンプル会議情報生成テスト');
    const testMeetingInfo = sampleDataService.generateSampleMeetingInfo('test.m4a');
    console.log('✅ サンプル会議情報生成成功:', testMeetingInfo.topic);

    return res.status(200).json({
      status: 'success',
      message: '部品化サービステスト成功',
      tests: {
        import_test: '✅ SampleDataService インポート成功',
        initialization_test: '✅ 初期化成功',
        method_test: '✅ メソッド実行成功',
        sample_meeting_info: testMeetingInfo
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ デバッグテストエラー:', error);
    
    return res.status(500).json({
      status: 'error',
      message: 'デバッグテストでエラー発生',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
};