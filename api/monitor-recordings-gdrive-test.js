// TC202: 統合サンプルデータテスト - tc202-simple-testと同じ構造
const SampleDataService = require('../1.src/services/sampleDataService');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  console.log('🧪 TC202: 統合サンプルデータテスト開始');

  try {
    // Step 1: サービス初期化
    console.log('Step 1: SampleDataService初期化');
    const sampleDataService = new SampleDataService();

    // Step 2: Google Driveサンプルデータ取得（実際のAPIコール）
    console.log('Step 2: getSampleData()実行');
    const sampleData = await sampleDataService.getSampleData();
    console.log('✅ サンプルデータ取得成功:', sampleData);

    return res.status(200).json({
      status: 'success',
      test: 'TC202-integrated',
      message: '統合サンプルデータ取得テスト成功',
      sampleData: sampleData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ TC202統合テストエラー:', error);
    
    return res.status(500).json({
      status: 'error',
      test: 'TC202-integrated',
      message: '統合サンプルデータ取得テスト失敗',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
};