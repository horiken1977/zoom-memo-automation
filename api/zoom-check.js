// 最小限のZoom録画監視テスト（本番環境）
export default async function handler(req, res) {
  console.log('🔍 Zoom録画監視開始');
  
  try {
    // ZoomServiceを直接インポート
    const ZoomService = require('../1.src/services/zoomService');
    
    console.log('📡 ZoomService初期化');
    const zoomService = new ZoomService();
    
    console.log('🎬 録画監視実行');
    const recordings = await zoomService.monitorNewRecordings();
    
    const result = {
      timestamp: new Date().toISOString(),
      environment: 'production',
      monitoring_interval: '2 hours',
      recordings_found: recordings ? recordings.length : 0,
      message: recordings && recordings.length > 0 
        ? `✅ ${recordings.length}件の録画データを検知`
        : '📭 現在処理対象の録画データはありません',
      recordings: recordings || [],
      logs: [
        '🔍 Zoom録画監視開始',
        '📡 ZoomService初期化完了',
        '🎬 録画監視実行',
        recordings && recordings.length > 0 
          ? `✅ ${recordings.length}件の録画データを検知`
          : '📭 現在処理対象の録画データはありません',
        '✓ 監視機能は正常に動作しています'
      ]
    };
    
    console.log(result.message);
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
    console.error('スタック:', error.stack);
    
    return res.status(500).json({
      error: 'Zoom monitoring failed',
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}