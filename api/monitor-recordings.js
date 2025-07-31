// 本番環境用 Zoom録画監視API - 実際の監視機能
const ZoomService = require('../1.src/services/zoomService');
const AIService = require('../1.src/services/aiService');
const SlackService = require('../1.src/services/slackService');
const GoogleDriveService = require('../1.src/services/googleDriveService');

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const startTime = Date.now();
  
  console.log('🔍 Zoom録画監視処理開始');
  console.log(`環境: ${process.env.NODE_ENV || 'production'}`);
  console.log(`リージョン: ${process.env.VERCEL_REGION || 'unknown'}`);

  try {
    // サービス初期化
    const zoomService = new ZoomService();
    const aiService = new AIService();
    const slackService = new SlackService();
    const googleDriveService = new GoogleDriveService();

    // 新しい録画を監視
    console.log('📡 新しい録画データを監視中...');
    const recordings = await zoomService.monitorNewRecordings();

    if (!recordings || recordings.length === 0) {
      console.log('📭 現在処理対象の録画データはありません');
      
      return res.status(200).json({
        status: 'success',
        message: '📭 現在処理対象の録画データはありません',
        recordings_found: 0,
        monitoring_interval: '2 hours',
        next_check: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        logs: [
          '🔍 Zoom録画監視処理開始',
          '📡 新しい録画データを監視',
          '📭 現在処理対象の録画データはありません',
          '✓ 監視機能は正常に動作しています',
          'ℹ️ 新しい録画が作成されると自動的に処理されます'
        ],
        timestamp: new Date().toISOString(),
        processing_time: `${Date.now() - startTime}ms`
      });
    }

    console.log(`✅ ${recordings.length}件の録画データを検知しました`);

    const processedRecordings = [];
    
    // 各録画を順次処理
    for (const recording of recordings) {
      console.log(`🎬 処理開始: ${recording.topic}`);
      
      try {
        // Slack処理開始通知
        await slackService.sendProcessingNotification(recording);

        // 1. 録画ダウンロード
        console.log(`📥 録画ダウンロード: ${recording.topic}`);
        const recordingInfo = await zoomService.downloadRecording(recording);

        // 2. AI文字起こし
        console.log(`🤖 文字起こし実行: ${recording.topic}`);
        const transcriptionResult = await aiService.transcribeAudio(
          recordingInfo.audioFilePath, 
          recordingInfo.meetingInfo
        );

        // 3. AI要約生成
        console.log(`📝 要約生成: ${recording.topic}`);
        const analysisResult = await aiService.analyzeComprehensively(transcriptionResult);

        // 4. Google Drive保存
        console.log(`☁️ Google Drive保存: ${recording.topic}`);
        const driveResult = await googleDriveService.saveRecording(
          recordingInfo.videoFilePath || recordingInfo.audioFilePath,
          recordingInfo.meetingInfo
        );

        // 5. Slack通知
        console.log(`💬 Slack通知送信: ${recording.topic}`);
        await slackService.sendMeetingSummaryWithRecording(analysisResult, driveResult);

        // 6. 一時ファイル削除
        console.log(`🗑️ 一時ファイル削除: ${recording.topic}`);
        // ファイル削除処理をここに追加

        processedRecordings.push({
          id: recording.id,
          topic: recording.topic,
          status: 'completed',
          start_time: recording.start_time,
          duration: recording.duration
        });

        console.log(`✅ 処理完了: ${recording.topic}`);

      } catch (recordingError) {
        console.error(`❌ 録画処理エラー [${recording.topic}]:`, recordingError.message);
        
        // エラー通知
        await slackService.sendErrorNotification(
          recordingError, 
          `録画処理: ${recording.topic}`
        );

        processedRecordings.push({
          id: recording.id,
          topic: recording.topic,
          status: 'error',
          error: recordingError.message
        });
      }
    }

    console.log('🎉 全録画処理完了');

    return res.status(200).json({
      status: 'success',
      message: `✅ ${recordings.length}件の録画を処理しました`,
      recordings_found: recordings.length,
      processed_recordings: processedRecordings,
      monitoring_interval: '2 hours',
      next_check: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      logs: [
        '🔍 Zoom録画監視処理開始',
        `✅ ${recordings.length}件の録画データを検知`,
        ...processedRecordings.map(r => 
          r.status === 'completed' 
            ? `✅ 処理完了: ${r.topic}`
            : `❌ 処理エラー: ${r.topic}`
        ),
        '🎉 全録画処理完了'
      ],
      timestamp: new Date().toISOString(),
      processing_time: `${Date.now() - startTime}ms`
    });

  } catch (error) {
    console.error('❌ 録画監視処理でエラー:', error.message);
    
    // エラー通知を送信
    try {
      const slackService = new SlackService();
      await slackService.sendErrorNotification(error, 'Zoom録画監視処理');
    } catch (slackError) {
      console.error('Slack通知送信エラー:', slackError.message);
    }

    return res.status(500).json({
      status: 'error',
      message: '❌ 録画監視処理でエラーが発生',
      error: error.message,
      logs: [
        '❌ 録画監視処理でエラーが発生',
        `エラー内容: ${error.message}`,
        'システム管理者に連絡してください'
      ],
      timestamp: new Date().toISOString(),
      processing_time: `${Date.now() - startTime}ms`
    });
  }
}