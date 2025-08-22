/**
 * Zoom録画データ存在確認テスト
 * TC206デバッグ用: 実際のZoom録画データが取得できるかテスト
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
  logger.info('=== Zoom録画データ存在確認テスト開始 ===');

  try {
    const zoomService = new ZoomService();
    
    // 複数の期間でテスト
    const testPeriods = [
      { days: 7, name: '過去7日間' },
      { days: 30, name: '過去30日間' },
      { days: 90, name: '過去90日間' }
    ];
    
    const results = [];
    
    for (const period of testPeriods) {
      logger.info(`🔍 ${period.name}の録画データを検索中...`);
      
      const fromDate = new Date(Date.now() - period.days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const toDate = new Date().toISOString().split('T')[0];
      
      const recordings = await zoomService.getAllRecordings(fromDate, toDate);
      
      logger.info(`📊 ${period.name}: ${recordings.length}件の録画発見`);
      
      const periodResult = {
        period: period.name,
        days: period.days,
        fromDate: fromDate,
        toDate: toDate,
        recordingCount: recordings.length,
        recordings: recordings.slice(0, 3).map(rec => ({
          id: rec.id,
          topic: rec.topic,
          start_time: rec.start_time,
          duration: rec.duration,
          fileCount: rec.recording_files?.length || 0,
          fileTypes: rec.recording_files?.map(f => f.file_type).join(', ') || 'none'
        }))
      };
      
      results.push(periodResult);
      
      // 録画が見つかった場合は詳細を表示
      if (recordings.length > 0) {
        logger.info(`✅ 最新録画: ${recordings[0].topic} (${recordings[0].start_time})`);
        logger.info(`📁 ファイル種別: ${recordings[0].recording_files?.map(f => f.file_type).join(', ') || 'none'}`);
        break; // 最初に見つかった期間で終了
      }
    }
    
    const totalTime = Date.now() - startTime;
    
    return res.status(200).json({
      status: 'success',
      message: 'Zoom録画データ存在確認完了',
      results: results,
      summary: {
        totalRecordings: results.reduce((sum, r) => sum + r.recordingCount, 0),
        periodsChecked: results.length,
        hasRecordings: results.some(r => r.recordingCount > 0)
      },
      executionTime: `${totalTime}ms (${(totalTime/1000).toFixed(1)}秒)`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Zoom録画データ確認エラー:', error);
    
    return res.status(500).json({
      status: 'error',
      message: 'Zoom録画データ確認失敗',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
};