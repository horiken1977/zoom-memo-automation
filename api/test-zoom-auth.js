/**
 * Zoom認証テストエンドポイント
 * Server-to-Server OAuth認証の動作確認用
 */

export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  console.log('=== Zoom認証テスト開始 ===');
  
  try {
    // 1. 環境変数の確認
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_API_KEY;
    const clientSecret = process.env.ZOOM_API_SECRET;
    
    const envCheck = {
      ZOOM_ACCOUNT_ID: accountId ? `設定済み (${accountId.substring(0, 4)}...)` : '❌ 未設定',
      ZOOM_API_KEY: clientId ? `設定済み (${clientId.substring(0, 4)}...)` : '❌ 未設定',
      ZOOM_API_SECRET: clientSecret ? '設定済み' : '❌ 未設定'
    };
    
    console.log('環境変数チェック:', envCheck);
    
    // 環境変数が不足している場合
    if (!accountId || !clientId || !clientSecret) {
      return res.status(500).json({
        success: false,
        error: '環境変数が設定されていません',
        envCheck,
        required: [
          'ZOOM_ACCOUNT_ID',
          'ZOOM_API_KEY',
          'ZOOM_API_SECRET'
        ]
      });
    }
    
    // 2. OAuth トークンの取得
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
    
    // 3. トークンを使用してユーザー情報を取得（動作確認）
    console.log('ユーザー情報取得テスト...');
    
    const userResponse = await fetch('https://api.zoom.us/v2/users/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });
    
    const userData = await userResponse.json();
    
    if (!userResponse.ok) {
      console.error('ユーザー情報取得エラー:', userData);
      return res.status(200).json({
        success: true,
        message: 'トークン取得成功、但しユーザー情報取得に失敗',
        tokenSuccess: true,
        tokenLength: tokenData.access_token.length,
        userError: userData,
        note: 'Server-to-Server OAuthでは/users/meは使用できません。これは正常です。'
      });
    }
    
    // 4. 録画一覧取得テスト（実際のAPIテスト）
    console.log('録画一覧取得テスト...');
    
    const from = new Date();
    from.setDate(from.getDate() - 30); // 過去30日
    const to = new Date();
    
    const recordingsUrl = `https://api.zoom.us/v2/users/me/recordings?from=${from.toISOString().split('T')[0]}&to=${to.toISOString().split('T')[0]}`;
    
    const recordingsResponse = await fetch(recordingsUrl, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });
    
    const recordingsData = await recordingsResponse.json();
    
    // 成功レスポンス
    return res.status(200).json({
      success: true,
      message: 'Zoom認証テスト成功',
      results: {
        tokenGenerated: true,
        tokenLength: tokenData.access_token.length,
        tokenType: tokenData.token_type,
        expiresIn: tokenData.expires_in,
        scope: tokenData.scope,
        recordingsTest: {
          success: recordingsResponse.ok,
          status: recordingsResponse.status,
          hasRecordings: recordingsData.meetings ? recordingsData.meetings.length > 0 : false,
          recordingCount: recordingsData.meetings ? recordingsData.meetings.length : 0
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('認証テストエラー:', error);
    return res.status(500).json({
      success: false,
      error: 'テスト実行中にエラーが発生しました',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}