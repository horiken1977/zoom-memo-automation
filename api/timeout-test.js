// Vercel環境でのタイムアウト設定確認テスト
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const targetSeconds = parseInt(req.query.wait || '90'); // デフォルト90秒待機
  const startTime = Date.now();
  
  console.log(`⏰ タイムアウトテスト開始: ${targetSeconds}秒待機予定`, new Date().toISOString());
  
  try {
    // 10秒ごとにログ出力しながら指定秒数待機
    for (let i = 0; i < targetSeconds; i += 10) {
      const elapsed = Date.now() - startTime;
      console.log(`⌛ ${Math.floor(elapsed/1000)}秒経過 - 継続中...`, new Date().toISOString());
      
      // 10秒待機（最後のループでは残り時間のみ）
      const waitTime = Math.min(10000, (targetSeconds * 1000) - elapsed);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // 途中でタイムアウトした場合の検出
      const currentElapsed = Date.now() - startTime;
      if (currentElapsed >= targetSeconds * 1000) {
        break;
      }
    }
    
    const finalElapsed = Date.now() - startTime;
    console.log(`✅ タイムアウトテスト完了: ${Math.floor(finalElapsed/1000)}秒実行`, new Date().toISOString());
    
    return res.status(200).json({
      status: 'success',
      message: `タイムアウトテスト成功: ${Math.floor(finalElapsed/1000)}秒実行`,
      targetSeconds: targetSeconds,
      actualSeconds: Math.floor(finalElapsed/1000),
      actualMs: finalElapsed,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date().toISOString(),
      vercelConfig: {
        maxDuration: 300,
        note: 'vercel.json設定値'
      }
    });
    
  } catch (error) {
    const errorElapsed = Date.now() - startTime;
    console.error(`❌ タイムアウトテスト中にエラー: ${Math.floor(errorElapsed/1000)}秒経過`, error.message);
    
    return res.status(500).json({
      status: 'error',
      message: 'タイムアウトテスト中にエラー発生',
      error: error.message,
      elapsedSeconds: Math.floor(errorElapsed/1000),
      elapsedMs: errorElapsed,
      targetSeconds: targetSeconds,
      timestamp: new Date().toISOString()
    });
  }
};