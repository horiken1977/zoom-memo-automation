// PT001デバッグ用テストエンドポイント
// 目的: PT001がどの段階でエラーになっているか特定する

const ZoomService = require('../1.src/services/zoomService');
const { ExecutionLogger } = require('../1.src/utils/executionLogger');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const executionId = req.query.executionId || `DEBUG-${Date.now()}`;
  const startTime = Date.now();
  
  console.log('🔍 PT001デバッグテスト開始', { executionId, timestamp: new Date().toISOString() });
  
  const results = {
    executionId,
    startTime: new Date(startTime).toISOString(),
    steps: [],
    errors: []
  };
  
  function logStep(stepName, data = {}) {
    const step = {
      step: stepName,
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - startTime,
      data
    };
    results.steps.push(step);
    console.log(`✅ ${stepName}:`, data);
    return step;
  }
  
  function logError(stepName, error) {
    const errorData = {
      step: stepName,
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - startTime,
      error: {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5)
      }
    };
    results.errors.push(errorData);
    console.error(`❌ ${stepName}:`, error);
    return errorData;
  }
  
  try {
    // Step 1: 環境変数確認
    logStep('環境変数確認', {
      ZOOM_API_KEY: !!process.env.ZOOM_API_KEY,
      ZOOM_API_SECRET: !!process.env.ZOOM_API_SECRET,
      ZOOM_ACCOUNT_ID: !!process.env.ZOOM_ACCOUNT_ID
    });
    
    // Step 2: ZoomService初期化テスト
    let zoomService;
    try {
      zoomService = new ZoomService();
      logStep('ZoomService初期化成功');
    } catch (error) {
      logError('ZoomService初期化失敗', error);
      return res.status(500).json({
        ...results,
        success: false,
        finalError: 'ZoomService初期化失敗'
      });
    }
    
    // Step 3: Zoom APIヘルスチェック
    try {
      const healthCheck = await Promise.race([
        zoomService.healthCheck(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('ヘルスチェックタイムアウト(30秒)')), 30000)
        )
      ]);
      logStep('Zoom APIヘルスチェック成功', healthCheck);
    } catch (error) {
      logError('Zoom APIヘルスチェック失敗', error);
      return res.status(500).json({
        ...results,
        success: false,
        finalError: 'Zoom APIヘルスチェック失敗'
      });
    }
    
    // Step 4: ExecutionLogger初期化テスト
    try {
      const dummyMeetingInfo = {
        id: 'debug-meeting-id',
        topic: 'PT001デバッグテスト会議',
        start_time: new Date().toISOString()
      };
      
      const executionLogger = new ExecutionLogger(executionId, dummyMeetingInfo);
      executionLogger.startStep('デバッグテスト', '初期化テスト');
      executionLogger.completeStep('デバッグテスト', { status: 'success' });
      
      logStep('ExecutionLogger初期化成功');
    } catch (error) {
      logError('ExecutionLogger初期化失敗', error);
    }
    
    // Step 5: 録画リスト取得テスト（軽量版）
    try {
      const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 1日前
      const toDate = new Date().toISOString().split('T')[0];
      
      console.log(`録画リスト取得テスト開始: ${fromDate} ～ ${toDate}`);
      
      const recordings = await Promise.race([
        zoomService.getAllRecordings(fromDate, toDate),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('録画リスト取得タイムアウト(60秒)')), 60000)
        )
      ]);
      
      logStep('録画リスト取得成功', {
        recordingCount: recordings?.length || 0,
        dateRange: `${fromDate} ～ ${toDate}`
      });
    } catch (error) {
      logError('録画リスト取得失敗', error);
    }
    
    // 成功レスポンス
    const totalDuration = Date.now() - startTime;
    logStep('デバッグテスト完了', { totalDuration });
    
    res.status(200).json({
      ...results,
      success: true,
      totalDuration,
      message: 'PT001デバッグテスト完了'
    });
    
  } catch (error) {
    logError('予期しないエラー', error);
    
    res.status(500).json({
      ...results,
      success: false,
      totalDuration: Date.now() - startTime,
      finalError: error.message
    });
  }
};