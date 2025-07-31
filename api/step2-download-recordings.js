// Step 2: 録画ファイルダウンロードAPI
const ZoomService = require('../1.src/services/zoomService');

export default async function handler(req, res) {
  console.log('📥 Step 2: 録画ファイルダウンロード開始');
  
  const result = {
    step: 2,
    name: 'recording_download',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    logs: ['📥 Step 2: 録画ファイルダウンロード開始']
  };

  try {
    // リクエストボディから録画情報を取得
    let recordingData;
    if (req.method === 'POST') {
      recordingData = req.body;
    } else if (req.method === 'GET') {
      // GETの場合はStep1の結果を再取得
      console.log('📡 録画データを再取得中...');
      const zoomService = new ZoomService();
      const recordings = await zoomService.monitorNewRecordings();
      
      if (!recordings || recordings.length === 0) {
        result.status = 'error';
        result.error_type = 'no_recordings_found';
        result.message = '❌ ダウンロード対象の録画データがありません';
        result.logs.push('❌ 録画データなし - ダウンロード不可');
        return res.status(400).json(result);
      }
      
      recordingData = recordings[0]; // 最初の録画をテスト用に使用
    }

    if (!recordingData) {
      result.status = 'error';
      result.error_type = 'invalid_request';
      result.message = '❌ 録画データが指定されていません';
      result.logs.push('❌ リクエストに録画データがありません');
      return res.status(400).json(result);
    }

    result.recording_info = {
      id: recordingData.id,
      topic: recordingData.topic,
      start_time: recordingData.start_time,
      duration: recordingData.duration
    };
    result.logs.push(`🎬 対象録画: ${recordingData.topic}`);

    // Step 2-1: ZoomService初期化
    console.log('📡 ZoomService初期化中...');
    let zoomService;
    try {
      zoomService = new ZoomService();
      result.logs.push('✅ ZoomService初期化完了');
    } catch (initError) {
      result.status = 'error';
      result.error_type = 'zoom_service_initialization_failed';
      result.message = '❌ ZoomService初期化に失敗';
      result.error_details = {
        message: initError.message,
        stack: initError.stack
      };
      result.logs.push(`❌ ZoomService初期化失敗: ${initError.message}`);
      return res.status(500).json(result);
    }

    // Step 2-2: 録画ファイル情報取得
    console.log('📋 録画ファイル情報取得中...');
    let recordingFiles;
    try {
      // 録画詳細情報を取得
      const recordingDetails = await zoomService.getRecordingDetails(recordingData.uuid || recordingData.id);
      recordingFiles = recordingDetails.recording_files || [];
      
      result.recording_files_found = recordingFiles.length;
      result.available_files = recordingFiles.map(file => ({
        id: file.id,
        file_type: file.file_type,
        file_extension: file.file_extension,
        file_size: file.file_size,
        download_url: file.download_url ? 'available' : 'missing'
      }));
      
      result.logs.push(`✅ ${recordingFiles.length}個の録画ファイルを確認`);
      console.log(`録画ファイル数: ${recordingFiles.length}`);
      
    } catch (fileInfoError) {
      result.status = 'error';
      result.error_type = 'recording_file_info_failed';
      result.message = '❌ 録画ファイル情報の取得に失敗';
      
      const errorDetails = {
        message: fileInfoError.message,
        stack: fileInfoError.stack
      };
      
      if (fileInfoError.response) {
        errorDetails.http_status = fileInfoError.response.status;
        errorDetails.http_status_text = fileInfoError.response.statusText;
        errorDetails.response_data = fileInfoError.response.data;
        result.logs.push(`❌ HTTP ${fileInfoError.response.status}: ${fileInfoError.response.statusText}`);
      }
      
      result.error_details = errorDetails;
      result.logs.push(`❌ ファイル情報取得エラー: ${fileInfoError.message}`);
      return res.status(500).json(result);
    }

    if (recordingFiles.length === 0) {
      result.status = 'error';
      result.error_type = 'no_downloadable_files';
      result.message = '❌ ダウンロード可能なファイルがありません';
      result.logs.push('❌ ダウンロード可能なファイルなし');
      return res.status(404).json(result);
    }

    // Step 2-3: 実際のダウンロード実行
    console.log('⬇️ ファイルダウンロード実行中...');
    let downloadResult;
    try {
      downloadResult = await zoomService.downloadRecording(recordingData);
      
      result.download_success = true;
      result.downloaded_files = {
        audio_file: downloadResult.audioFilePath || null,
        video_file: downloadResult.videoFilePath || null,
        meeting_info: downloadResult.meetingInfo || null
      };
      
      result.logs.push('✅ ファイルダウンロード完了');
      if (downloadResult.audioFilePath) {
        result.logs.push(`🎵 音声ファイル: ${downloadResult.audioFilePath}`);
      }
      if (downloadResult.videoFilePath) {
        result.logs.push(`🎥 動画ファイル: ${downloadResult.videoFilePath}`);
      }
      
      console.log('✅ ダウンロード完了');
      
    } catch (downloadError) {
      result.status = 'error';
      result.error_type = 'file_download_failed';
      result.message = '❌ ファイルダウンロードに失敗';
      
      const downloadErrorDetails = {
        message: downloadError.message,
        stack: downloadError.stack
      };
      
      if (downloadError.response) {
        downloadErrorDetails.http_status = downloadError.response.status;
        downloadErrorDetails.http_status_text = downloadError.response.statusText;
        downloadErrorDetails.response_data = downloadError.response.data;
        result.logs.push(`❌ ダウンロード HTTP ${downloadError.response.status}: ${downloadError.response.statusText}`);
      }
      
      // ファイルシステムエラーの詳細
      if (downloadError.code) {
        downloadErrorDetails.fs_error_code = downloadError.code;
        downloadErrorDetails.fs_error_path = downloadError.path;
        result.logs.push(`❌ ファイルシステムエラー ${downloadError.code}: ${downloadError.path || ''}`);
      }
      
      result.error_details = downloadErrorDetails;
      result.logs.push(`❌ ダウンロードエラー: ${downloadError.message}`);
      return res.status(500).json(result);
    }

    // Step 2-4: 成功結果
    result.status = 'success';
    result.message = '✅ 録画ファイルのダウンロードが完了しました';
    result.logs.push('✅ Step 2完了');
    
    console.log('✅ Step 2完了');
    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Step 2 予期しないエラー:', error);
    
    result.status = 'error';
    result.error_type = 'unexpected_error';
    result.message = '❌ 予期しないエラーが発生';
    result.error = error.message;
    result.error_stack = error.stack;
    result.logs.push(`❌ 予期しないエラー: ${error.message}`);

    return res.status(500).json(result);
  }
}