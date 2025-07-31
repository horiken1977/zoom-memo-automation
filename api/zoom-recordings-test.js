// Zoom録画監視テスト用APIエンドポイント

// モジュールの動的インポート
let ZoomService, logger;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 動的インポート
    if (!ZoomService) {
      ZoomService = require('../1.src/services/zoomService');
    }
    if (!logger) {
      logger = require('../1.src/utils/logger');
    }
    
    logger.info('🔍 Zoom録画監視テスト開始');
    
    const zoomService = new ZoomService();
    
    // 過去24時間以内の録画を監視
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 1);
    const toDate = new Date();
    
    logger.info(`監視期間: ${fromDate.toISOString()} ~ ${toDate.toISOString()}`);
    
    // 新しい録画を監視
    const recordings = await zoomService.monitorNewRecordings();
    
    const result = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      monitoringPeriod: {
        from: fromDate.toISOString(),
        to: toDate.toISOString()
      },
      recordingsFound: recordings ? recordings.length : 0,
      recordings: recordings || [],
      logs: []
    };
    
    // ログメッセージを生成
    if (recordings && recordings.length > 0) {
      logger.info(`✅ ${recordings.length}件の録画を検知しました`);
      result.logs.push(`✅ ${recordings.length}件の録画を検知しました`);
      
      recordings.forEach((recording, index) => {
        const logMsg = `  ${index + 1}. ${recording.topic} (${recording.start_time}) - ${recording.total_size}MB`;
        logger.info(logMsg);
        result.logs.push(logMsg);
      });
    } else {
      logger.info('📭 現在処理対象の録画データはありません');
      result.logs.push('📭 現在処理対象の録画データはありません');
      result.logs.push('✓ 監視は正常に動作しています');
      result.logs.push('ℹ️ 新しい録画が作成されると自動的に処理されます');
    }
    
    logger.info('🔍 Zoom録画監視テスト完了');
    result.logs.push('🔍 Zoom録画監視テスト完了');
    
    return res.status(200).json(result);
    
  } catch (error) {
    logger.error('❌ Zoom録画監視テストでエラーが発生:', error);
    
    return res.status(500).json({
      error: 'Zoom recording monitoring test failed',
      message: error.message,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      logs: [
        '❌ Zoom録画監視テストでエラーが発生',
        `エラー内容: ${error.message}`,
        'API認証またはネットワーク接続を確認してください'
      ]
    });
  }
}