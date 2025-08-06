// TC202→TC203 統合テスト: 段階的テスト - まずTC202のみ
const SampleDataService = require('../1.src/services/sampleDataService');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  console.log('🧪 TC202 段階的テスト開始');

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
      test: 'TC202-stage1',
      message: 'TC202段階的テスト成功: サンプルデータ取得のみ',
      sampleData: sampleData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ TC202段階的テストエラー:', error);
    
    return res.status(500).json({
      status: 'error',
      test: 'TC202-stage1',
      message: 'TC202段階的テスト失敗: サンプルデータ取得のみ',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
};