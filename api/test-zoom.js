/**
 * Zoom統合テストエンドポイント
 * 認証テストと録画リスト取得を統合
 */

export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  const { test } = req.query;
  
  // テストタイプの判定
  if (test === 'auth') {
    return await testAuth(req, res);
  } else if (test === 'recordings') {
    return await testRecordings(req, res);
  } else {
    return res.status(200).json({
      success: true,
      message: 'Zoom統合テストエンドポイント',
      endpoints: {
        '/api/test-zoom?test=auth': '認証テスト',
        '/api/test-zoom?test=recordings': '録画リスト取得テスト'
      }
    });
  }
}

// 認証テスト関数
async function testAuth(req, res) {
  console.log('=== Zoom認証テスト開始 ===');
  
  try {
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_API_KEY;
    const clientSecret = process.env.ZOOM_API_SECRET;
    
    const envCheck = {
      ZOOM_ACCOUNT_ID: accountId ? `設定済み (${accountId.substring(0, 4)}...)` : '❌ 未設定',
      ZOOM_API_KEY: clientId ? `設定済み (${clientId.substring(0, 4)}...)` : '❌ 未設定',
      ZOOM_API_SECRET: clientSecret ? '設定済み' : '❌ 未設定'
    };
    
    console.log('環境変数チェック:', envCheck);
    
    if (!accountId || !clientId || !clientSecret) {
      return res.status(500).json({
        success: false,
        error: '環境変数が設定されていません',
        envCheck,
        required: ['ZOOM_ACCOUNT_ID', 'ZOOM_API_KEY', 'ZOOM_API_SECRET']
      });
    }
    
    console.log('OAuthトークン取得開始...');
    
    const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      console.error('トークン取得エラー:', tokenData);
      return res.status(tokenResponse.status).json({
        success: false,
        error: 'OAuth認証に失敗しました',
        details: tokenData,
        status: tokenResponse.status,
        possibleCauses: [
          'Client ID/Secretが間違っている',
          'Account IDが間違っている',
          'アプリがアクティベートされていない',
          'Server-to-Server OAuthアプリではない'
        ]
      });
    }
    
    console.log('トークン取得成功');
    
    return res.status(200).json({
      success: true,
      message: 'Zoom認証テスト成功',
      results: {
        tokenGenerated: true,
        tokenLength: tokenData.access_token.length,
        tokenType: tokenData.token_type,
        expiresIn: tokenData.expires_in,
        scope: tokenData.scope
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('認証テストエラー:', error);
    return res.status(500).json({
      success: false,
      error: 'テスト実行中にエラーが発生しました',
      message: error.message
    });
  }
}

// 録画リスト取得テスト関数
async function testRecordings(req, res) {
  console.log('=== Zoom録画一覧取得テスト開始 ===');
  
  try {
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_API_KEY;
    const clientSecret = process.env.ZOOM_API_SECRET;
    
    if (!accountId || !clientId || !clientSecret) {
      return res.status(500).json({
        success: false,
        error: '環境変数が設定されていません',
        required: ['ZOOM_ACCOUNT_ID', 'ZOOM_API_KEY', 'ZOOM_API_SECRET']
      });
    }
    
    console.log('OAuthトークン取得中...');
    
    const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).json({
        success: false,
        error: 'OAuth認証に失敗しました',
        details: tokenData
      });
    }
    
    console.log('トークン取得成功');
    
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];
    
    console.log(`取得期間: ${fromStr} 〜 ${toStr}`);
    
    const usersUrl = 'https://api.zoom.us/v2/users?page_size=300&status=active';
    
    const usersResponse = await fetch(usersUrl, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });
    
    const usersData = await usersResponse.json();
    
    if (!usersResponse.ok) {
      console.error('ユーザー一覧取得エラー:', usersData);
      return res.status(200).json({
        success: false,
        error: 'ユーザー一覧の取得に失敗しました',
        details: usersData
      });
    }
    
    console.log(`取得したユーザー数: ${usersData.users ? usersData.users.length : 0}`);
    
    let allRecordings = [];
    
    if (usersData.users && usersData.users.length > 0) {
      for (const user of usersData.users.slice(0, 5)) {
        try {
          const recordingsUrl = `https://api.zoom.us/v2/users/${user.id}/recordings?from=${fromStr}&to=${toStr}`;
          
          const recordingsResponse = await fetch(recordingsUrl, {
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`
            }
          });
          
          const recordingsData = await recordingsResponse.json();
          
          if (recordingsResponse.ok && recordingsData.meetings) {
            allRecordings = allRecordings.concat(recordingsData.meetings);
            console.log(`${user.email}: ${recordingsData.meetings.length}件の録画`);
          }
        } catch (err) {
          console.error(`${user.email}: エラー`, err.message);
        }
      }
    }
    
    const summary = {
      success: true,
      period: {
        from: fromStr,
        to: toStr
      },
      userCount: usersData.users ? usersData.users.length : 0,
      checkedUsers: Math.min(5, usersData.users ? usersData.users.length : 0),
      totalMeetings: allRecordings.length,
      meetings: allRecordings.slice(0, 10).map(meeting => ({
        topic: meeting.topic,
        startTime: meeting.start_time,
        duration: meeting.duration,
        hostEmail: meeting.host_email,
        recordingCount: meeting.recording_files ? meeting.recording_files.length : 0
      }))
    };
    
    return res.status(200).json({
      ...summary,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('録画一覧取得エラー:', error);
    return res.status(500).json({
      success: false,
      error: 'テスト実行中にエラーが発生しました',
      message: error.message
    });
  }
}