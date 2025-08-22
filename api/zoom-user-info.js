/**
 * Zoom現在ユーザー情報確認
 * PT001問題調査用: 現在認証されているZoomユーザーとアクセス権限を確認
 */

const ZoomService = require('../1.src/services/zoomService');
const logger = require('../1.src/utils/logger');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const startTime = Date.now();
  logger.info('=== Zoom現在ユーザー情報確認開始 ===');

  try {
    const zoomService = new ZoomService();
    
    // 1. ヘルスチェック（現在ユーザー情報）
    logger.info('Step 1: Zoomヘルスチェック実行');
    const healthCheck = await zoomService.healthCheck();
    
    // 2. OAuth認証情報詳細取得
    logger.info('Step 2: OAuth認証情報確認');
    const authHeaders = await zoomService.getAuthHeaders();
    
    // 3. アカウント情報（環境変数から）
    const accountInfo = {
      accountId: process.env.ZOOM_ACCOUNT_ID || 'NOT_SET',
      clientId: process.env.ZOOM_CLIENT_ID ? 'SET' : 'NOT_SET',
      clientSecret: process.env.ZOOM_CLIENT_SECRET ? 'SET' : 'NOT_SET',
      useOAuth: process.env.ZOOM_USE_OAUTH || 'NOT_SET'
    };
    
    // 4. 直近3日間の録画データ簡易チェック
    logger.info('Step 3: 直近3日間録画データ簡易チェック');
    const fromDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];
    
    let recordingsResult;
    try {
      const recordings = await zoomService.getAllRecordings(fromDate, toDate);
      recordingsResult = {
        success: true,
        count: recordings.length,
        recordings: recordings.slice(0, 2).map(rec => ({
          id: rec.id,
          topic: rec.topic,
          host_email: rec.host_email,
          start_time: rec.start_time
        }))
      };
    } catch (recordingError) {
      recordingsResult = {
        success: false,
        error: recordingError.message
      };
    }
    
    const totalTime = Date.now() - startTime;
    
    return res.status(200).json({
      status: 'success',
      message: 'Zoom現在ユーザー情報確認完了',
      healthCheck: healthCheck,
      accountInfo: accountInfo,
      authStatus: {
        hasAuthHeaders: !!authHeaders.Authorization,
        authMethod: authHeaders.Authorization?.startsWith('Bearer') ? 'OAuth' : 'Unknown'
      },
      recordingsCheck: recordingsResult,
      executionTime: `${totalTime}ms`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Zoomユーザー情報確認エラー:', error);
    
    return res.status(500).json({
      status: 'error',
      message: 'Zoomユーザー情報確認失敗',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};