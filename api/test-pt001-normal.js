/**
 * PT001: 正常系スルーテスト（本番環境・CLAUDE.md準拠）
 * 
 * 実行方法：
 * - curl "https://your-domain.vercel.app/api/test-pt001-normal"
 * 
 * テスト条件（環境変数で制御）：
 * - MAX_PROCESS_RECORDINGS=1 （1件のみ処理）
 * - SKIP_RECORDING_DELETION=true （録画削除なし）
 * 
 * 検証内容：
 * - TC206統合後の正常系処理フロー確認
 * - 動画保存 → AI処理 → 文書保存 → Slack通知の完全性
 * - 新しいバッファリング・圧縮機能の動作確認
 */

const handler = require('./monitor-recordings-production');

module.exports = async function testPT001Normal(req, res) {
  // 環境変数でテスト条件を制御（CLAUDE.md準拠）
  const originalSkipDeletion = process.env.SKIP_RECORDING_DELETION;
  
  // PT001テスト用環境変数を一時的に設定（録画削除なし）
  process.env.SKIP_RECORDING_DELETION = 'true';
  
  try {
    // 本番APIをそのまま実行
    return await handler(req, res);
  } finally {
    // 環境変数を元に戻す
    if (originalSkipDeletion !== undefined) {
      process.env.SKIP_RECORDING_DELETION = originalSkipDeletion;
    } else {
      delete process.env.SKIP_RECORDING_DELETION;
    }
  }
};