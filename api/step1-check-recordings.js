// Step 1: Zoom録画データ確認API
export default async function handler(req, res) {
  console.log('🔍 Step 1: Zoom録画データ確認開始');
  
  const result = {
    step: 1,
    name: 'zoom_recording_check',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    vercel_region: process.env.VERCEL_REGION || 'unknown',
    node_version: process.version,
    logs: ['🔍 Step 1: Zoom録画データ確認開始']
  };

  // ZoomServiceの動的インポート
  let ZoomService;

  try {
    // Step 1-1: 環境変数確認
    console.log('🔧 環境変数確認中...');
    const requiredEnvVars = ['ZOOM_API_KEY', 'ZOOM_API_SECRET', 'ZOOM_ACCOUNT_ID'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      result.status = 'error';
      result.error_type = 'environment_variables_missing';
      result.message = `❌ 必要な環境変数が設定されていません: ${missingVars.join(', ')}`;
      result.missing_variables = missingVars;
      result.logs.push(`❌ 環境変数不足: ${missingVars.join(', ')}`);
      console.error('環境変数不足:', missingVars);
      return res.status(400).json(result);
    }
    
    result.logs.push('✅ 環境変数確認完了');
    console.log('✅ 環境変数確認完了');

    // Step 1-2: ZoomServiceモジュール読み込み
    console.log('📦 ZoomServiceモジュール読み込み中...');
    try {
      ZoomService = require('../1.src/services/zoomService');
      result.zoom_service_module_loaded = true;
      result.logs.push('✅ ZoomServiceモジュール読み込み完了');
      console.log('✅ ZoomServiceモジュール読み込み完了');
    } catch (moduleError) {
      result.status = 'error';
      result.error_type = 'zoom_service_module_load_failed';
      result.message = '❌ ZoomServiceモジュール読み込みに失敗';
      result.module_error_details = {
        message: moduleError.message,
        stack: moduleError.stack,
        code: moduleError.code,
        module_path: moduleError.requireStack || 'unknown'
      };
      result.logs.push(`❌ モジュール読み込み失敗: ${moduleError.message}`);
      console.error('ZoomServiceモジュール読み込みエラー:', moduleError);
      return res.status(500).json(result);
    }

    // Step 1-3: ZoomService初期化
    console.log('🏗️ ZoomService初期化中...');
    let zoomService;
    try {
      zoomService = new ZoomService();
      result.zoom_service_initialized = true;
      result.logs.push('✅ ZoomService初期化完了');
      console.log('✅ ZoomService初期化完了');
    } catch (initError) {
      result.status = 'error';
      result.error_type = 'zoom_service_initialization_failed';
      result.message = '❌ ZoomService初期化に失敗';
      result.init_error_details = {
        message: initError.message,
        stack: initError.stack,
        constructor_error: initError.constructor?.name || 'unknown'
      };
      result.logs.push(`❌ ZoomService初期化失敗: ${initError.message}`);
      console.error('ZoomService初期化エラー:', initError);
      return res.status(500).json(result);
    }

    // Step 1-4: Zoom API認証テスト
    console.log('🔌 Zoom API認証テスト中...');
    let authResult;
    try {
      // まず、zoomServiceにgetAccessTokenメソッドがあるか確認
      if (typeof zoomService.getAccessToken !== 'function') {
        throw new Error('getAccessToken method not found on ZoomService instance');
      }
      
      // アクセストークン取得を試行
      const accessToken = await zoomService.getAccessToken();
      authResult = {
        status: 'success',
        token_obtained: true,
        token_length: accessToken ? accessToken.length : 0
      };
      result.logs.push('✅ Zoom API認証成功');
      console.log('✅ Zoom API認証成功');
    } catch (authError) {
      result.status = 'error';
      result.error_type = 'zoom_api_authentication_failed';
      result.message = '❌ Zoom API認証に失敗';
      
      // 詳細なエラー情報をキャッチ
      const errorDetails = {
        message: authError.message,
        stack: authError.stack
      };
      
      // HTTP エラーレスポンスの詳細をキャッチ
      if (authError.response) {
        errorDetails.http_status = authError.response.status;
        errorDetails.http_status_text = authError.response.statusText;
        errorDetails.response_data = authError.response.data;
        
        console.error('Zoom API HTTP エラー:', {
          status: authError.response.status,
          statusText: authError.response.statusText,
          data: authError.response.data
        });
        
        result.logs.push(`❌ HTTP ${authError.response.status}: ${authError.response.statusText}`);
        if (authError.response.data) {
          result.logs.push(`API応答: ${JSON.stringify(authError.response.data)}`);
        }
      }
      
      // リクエスト情報
      if (authError.request) {
        errorDetails.request_url = authError.config?.url || 'unknown';
        errorDetails.request_method = authError.config?.method || 'unknown';
        console.error('Zoom API リクエストエラー:', {
          url: authError.config?.url,
          method: authError.config?.method
        });
        result.logs.push(`リクエストURL: ${authError.config?.url || 'unknown'}`);
      }
      
      result.auth_error_details = errorDetails;
      result.logs.push(`❌ 認証エラー: ${authError.message}`);
      console.error('Zoom API認証詳細エラー:', errorDetails);
      return res.status(500).json(result);
    }

    // Step 1-4: 録画データ取得
    console.log('🎬 録画データ取得中...');
    let recordings;
    try {
      recordings = await zoomService.monitorNewRecordings();
      result.logs.push('✅ 録画データ取得完了');
      console.log('✅ 録画データ取得完了');
    } catch (recordingError) {
      result.status = 'error';
      result.error_type = 'recording_data_fetch_failed';
      result.message = '❌ 録画データ取得に失敗';
      
      // 録画取得エラーの詳細情報
      const recordingErrorDetails = {
        message: recordingError.message,
        stack: recordingError.stack
      };
      
      if (recordingError.response) {
        recordingErrorDetails.http_status = recordingError.response.status;
        recordingErrorDetails.http_status_text = recordingError.response.statusText;
        recordingErrorDetails.response_data = recordingError.response.data;
        
        result.logs.push(`❌ 録画取得 HTTP ${recordingError.response.status}: ${recordingError.response.statusText}`);
        if (recordingError.response.data) {
          result.logs.push(`録画API応答: ${JSON.stringify(recordingError.response.data)}`);
        }
      }
      
      result.recording_error_details = recordingErrorDetails;
      result.logs.push(`❌ 録画データ取得エラー: ${recordingError.message}`);
      console.error('録画データ取得詳細エラー:', recordingErrorDetails);
      return res.status(500).json(result);
    }

    // Step 1-5: 結果整理
    result.status = 'success';
    result.recordings_found = recordings ? recordings.length : 0;
    result.has_recordings = recordings && recordings.length > 0;
    
    if (recordings && recordings.length > 0) {
      result.message = `✅ ${recordings.length}件の録画データを検知しました`;
      result.recordings = recordings.map(recording => ({
        id: recording.id,
        uuid: recording.uuid,
        topic: recording.topic,
        start_time: recording.start_time,
        duration: recording.duration,
        total_size: recording.total_size,
        recording_count: recording.recording_count,
        recording_files: recording.recording_files ? recording.recording_files.length : 0
      }));
      
      result.logs.push(`✅ ${recordings.length}件の録画データを検知`);
      console.log(`✅ ${recordings.length}件の録画データを検知`);
    } else {
      result.message = '📭 現在処理対象の録画データはありません';
      result.recordings = [];
      result.logs.push('📭 処理対象の録画データなし');
      console.log('📭 録画データなし');
    }

    result.logs.push('✅ Step 1完了');
    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Step 1 予期しないエラー:', error);
    
    result.status = 'error';
    result.error_type = 'unexpected_error';
    result.message = '❌ 予期しないエラーが発生';
    result.error = error.message;
    result.error_stack = error.stack;
    result.logs.push(`❌ 予期しないエラー: ${error.message}`);

    return res.status(500).json(result);
  }
}