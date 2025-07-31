// Step1デバッグ用API - エラー詳細確認
export default async function handler(req, res) {
  const result = {
    step: 'debug',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    vercel_region: process.env.VERCEL_REGION || 'unknown',
    logs: []
  };

  try {
    // 1. 環境変数確認
    result.logs.push('🔧 環境変数確認開始');
    const envCheck = {
      ZOOM_API_KEY: !!process.env.ZOOM_API_KEY,
      ZOOM_API_SECRET: !!process.env.ZOOM_API_SECRET,  
      ZOOM_ACCOUNT_ID: !!process.env.ZOOM_ACCOUNT_ID,
      GOOGLE_AI_API_KEY: !!process.env.GOOGLE_AI_API_KEY,
      SLACK_BOT_TOKEN: !!process.env.SLACK_BOT_TOKEN
    };
    result.environment_variables = envCheck;
    result.logs.push(`環境変数確認: ${Object.values(envCheck).every(v => v) ? '全て設定済み' : '一部未設定'}`);

    // 2. ZoomServiceモジュール読み込みテスト
    result.logs.push('📡 ZoomServiceモジュール読み込みテスト');
    let ZoomService;
    try {
      ZoomService = require('../1.src/services/zoomService');
      result.zoom_service_module_loaded = true;
      result.logs.push('✅ ZoomServiceモジュール読み込み成功');
    } catch (moduleError) {
      result.zoom_service_module_loaded = false;
      result.module_error = {
        message: moduleError.message,
        stack: moduleError.stack,
        code: moduleError.code
      };
      result.logs.push(`❌ ZoomServiceモジュール読み込み失敗: ${moduleError.message}`);
      return res.status(500).json(result);
    }

    // 3. ZoomService初期化テスト
    result.logs.push('🏗️ ZoomService初期化テスト');
    let zoomService;
    try {
      zoomService = new ZoomService();
      result.zoom_service_initialized = true;
      result.logs.push('✅ ZoomService初期化成功');
    } catch (initError) {
      result.zoom_service_initialized = false;
      result.init_error = {
        message: initError.message,
        stack: initError.stack
      };
      result.logs.push(`❌ ZoomService初期化失敗: ${initError.message}`);
      return res.status(500).json(result);
    }

    // 4. 簡単なアクセストークン取得テスト
    result.logs.push('🔐 アクセストークン取得テスト');
    try {
      // 直接OAuth2リクエストを送信してテスト
      const credentials = Buffer.from(`${process.env.ZOOM_API_KEY}:${process.env.ZOOM_API_SECRET}`).toString('base64');
      
      const tokenResponse = await fetch('https://zoom.us/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`
      });

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        result.token_test = {
          success: true,
          token_type: tokenData.token_type,
          expires_in: tokenData.expires_in
        };
        result.logs.push('✅ 直接トークン取得成功');
      } else {
        const errorText = await tokenResponse.text();
        result.token_test = {
          success: false,
          status: tokenResponse.status,
          status_text: tokenResponse.statusText,
          error: errorText
        };
        result.logs.push(`❌ 直接トークン取得失敗: ${tokenResponse.status} ${tokenResponse.statusText}`);
        result.logs.push(`レスポンス: ${errorText}`);
      }
      
    } catch (tokenError) {
      result.token_test = {
        success: false,
        error: tokenError.message
      };
      result.logs.push(`❌ トークン取得エラー: ${tokenError.message}`);
    }

    // 5. 成功結果
    result.status = 'success';
    result.message = '✅ デバッグテスト完了';
    result.logs.push('✅ デバッグテスト完了');

    return res.status(200).json(result);

  } catch (error) {
    result.status = 'error';
    result.error = {
      message: error.message,
      stack: error.stack
    };
    result.logs.push(`❌ デバッグテストエラー: ${error.message}`);
    
    return res.status(500).json(result);
  }
}