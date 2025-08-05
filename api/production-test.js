/**
 * 本番環境での安全なテスト用API
 * - 録画削除をスキップ
 * - Slack投稿をログ出力のみ
 * - 最大1件の録画のみ処理
 */

// Vercel環境変数を本番安全モード用に設定
process.env.PRODUCTION_SAFE_MODE = 'true';
process.env.SKIP_RECORDING_DELETION = 'true';
process.env.LOG_SLACK_INSTEAD_OF_SEND = 'true';
process.env.MAX_PROCESS_RECORDINGS = '1';

const ZoomMemoAutomation = require('../1.src/index');
const logger = require('../1.src/utils/logger');

module.exports = async (req, res) => {
  // CORS対応
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowedMethods: ['POST']
    });
  }

  try {
    logger.info('=== PRODUCTION SAFE TEST STARTED ===');
    logger.info('Environment variables:', {
      PRODUCTION_SAFE_MODE: process.env.PRODUCTION_SAFE_MODE,
      SKIP_RECORDING_DELETION: process.env.SKIP_RECORDING_DELETION,
      LOG_SLACK_INSTEAD_OF_SEND: process.env.LOG_SLACK_INSTEAD_OF_SEND,
      MAX_PROCESS_RECORDINGS: process.env.MAX_PROCESS_RECORDINGS,
      NODE_ENV: process.env.NODE_ENV
    });

    const automation = new ZoomMemoAutomation();
    
    // ヘルスチェック実行
    logger.info('Performing health check...');
    const healthCheck = await automation.performHealthCheck();
    
    // 新しい録画をチェックして処理
    logger.info('Starting recording processing in safe mode...');
    await automation.processNewRecordings();
    
    logger.info('=== PRODUCTION SAFE TEST COMPLETED ===');

    return res.status(200).json({
      success: true,
      message: 'Production safe test completed successfully',
      timestamp: new Date().toISOString(),
      config: {
        productionSafeMode: true,
        skipRecordingDeletion: true,
        logSlackInsteadOfSend: true,
        maxProcessRecordings: 1
      },
      healthCheck: healthCheck,
      note: 'Check logs for detailed output including Slack message content'
    });

  } catch (error) {
    logger.error('Production safe test failed:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};