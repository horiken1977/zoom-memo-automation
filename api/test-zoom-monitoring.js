// Zoom録画監視テスト（簡易版）
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const axios = require('axios');
    
    console.log('🔍 Zoom録画監視テスト開始');
    
    // Zoom API認証情報確認
    const apiKey = process.env.ZOOM_API_KEY;
    const apiSecret = process.env.ZOOM_API_SECRET;
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    
    if (!apiKey || !apiSecret || !accountId) {
      return res.status(500).json({
        error: 'Zoom API認証情報が不足しています',
        missingVars: {
          ZOOM_API_KEY: !apiKey,
          ZOOM_API_SECRET: !apiSecret,
          ZOOM_ACCOUNT_ID: !accountId
        }
      });
    }
    
    // OAuth2 Server-to-Server認証でアクセストークン取得
    const tokenResponse = await axios.post('https://zoom.us/oauth/token', 
      `grant_type=account_credentials&account_id=${accountId}`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const accessToken = tokenResponse.data.access_token;
    console.log('✅ Zoom認証成功');
    
    // 過去24時間の録画を取得
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 1);
    const toDate = new Date();
    
    const recordingResponse = await axios.get(
      `https://api.zoom.us/v2/accounts/${accountId}/recordings`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          from: fromDate.toISOString().split('T')[0],
          to: toDate.toISOString().split('T')[0]
        }
      }
    );
    
    const recordings = recordingResponse.data.meetings || [];
    
    console.log(`📊 監視結果: ${recordings.length}件の録画を発見`);
    
    const result = {
      timestamp: new Date().toISOString(),
      environment: 'production',
      monitoringInterval: '120 minutes (2 hours)',
      monitoringPeriod: {
        from: fromDate.toISOString(),
        to: toDate.toISOString()
      },
      recordingsFound: recordings.length,
      recordings: recordings.map(meeting => ({
        id: meeting.id,
        topic: meeting.topic,
        start_time: meeting.start_time,
        duration: meeting.duration,
        total_size: meeting.total_size,
        recording_count: meeting.recording_count
      })),
      logs: [
        '🔍 Zoom録画監視テスト開始',
        '✅ Zoom API認証成功',
        `📊 監視期間: ${fromDate.toISOString().split('T')[0]} ～ ${toDate.toISOString().split('T')[0]}`,
        recordings.length > 0 
          ? `✅ ${recordings.length}件の録画データを検知しました`
          : '📭 現在処理対象の録画データはありません',
        recordings.length === 0 
          ? 'ℹ️ 新しい録画が作成されると自動的に処理されます'
          : null,
        '🔍 Zoom録画監視テスト完了'
      ].filter(Boolean)
    };
    
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('❌ Zoom録画監視テストでエラー:', error.message);
    
    return res.status(500).json({
      error: 'Zoom recording monitoring test failed',
      message: error.message,
      details: error.response?.data || null,
      timestamp: new Date().toISOString(),
      logs: [
        '❌ Zoom録画監視テストでエラーが発生',
        `エラー内容: ${error.message}`,
        error.response?.data ? `API応答: ${JSON.stringify(error.response.data)}` : null,
        'API認証またはネットワーク接続を確認してください'
      ].filter(Boolean)
    });
  }
}