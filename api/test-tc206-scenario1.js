/**
 * TC206 シナリオ1 テスト実行API
 * 
 * ⭐ CLAUDE.mdテスト原則準拠 ⭐
 * - 本番コード（monitor-recordings-production.js）をそのまま使用
 * - パラメーター制御でテスト条件を設定
 * - テスト専用コードは作成しない
 */

const handler = require('./monitor-recordings-production');

module.exports = async function testTC206Scenario1(req, res) {
  // TC206専用のテストパラメーターを設定
  const testParams = {
    // Zoom録画検索期間を限定（TC206テストデータ期間）
    testMode: 'TC206-S1',
    searchDateFrom: '2024-08-01',  // TC206テストデータ期間
    searchDateTo: '2024-08-31',
    
    // テスト対象フィルタ（TC206プリフィックスを含む録画のみ）
    topicFilter: '[TC206-S1]',
    
    // 本番影響防止設定
    skipRecordingDeletion: true,  // テスト時は録画削除しない
    testExecutionId: `TC206-S1-${Date.now()}`
  };
  
  // 本番コードにテストパラメーターを注入
  req.testParams = testParams;
  req.query = { ...req.query, ...testParams };
  
  // 本番コードを実行（パラメーター制御でTC206動作）
  return handler(req, res);
};