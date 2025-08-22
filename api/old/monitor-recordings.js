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
    
    // 各録画を並列処理
    const recordingPromises = recordings.map(async (recording) => {
      console.log(`🎬 並列処理開始: ${recording.topic}`);
      
      try {
        // Slack処理開始通知
        await slackService.sendProcessingNotification(recording);

        // 1. 録画ダウンロード
        console.log(`📥 録画ダウンロード: ${recording.topic}`);
        const recordingInfo = await zoomService.downloadRecording(recording);

        // 2. 並列処理開始
        console.log(`🔄 並列処理開始: 動画保存 & 音声処理 - ${recording.topic}`);
        
        const [driveResult, analysisResult] = await Promise.all([
          // Thread A: 動画保存処理
          (async () => {
            console.log(`☁️ [Thread A] Google Drive動画保存: ${recording.topic}`);
            return await googleDriveService.saveRecording(
              recordingInfo.videoFilePath || recordingInfo.audioFilePath,
              recordingInfo.meetingInfo
            );
          })(),
          
          // Thread B: 音声処理 → AI要約 → Slack投稿
          (async () => {
            try {
              // 2.1 音声ファイルを一時保存
              console.log(`📤 [Thread B] 音声ファイル一時保存: ${recording.topic}`);
              await googleDriveService.saveTemporaryFile(
                recordingInfo.audioFilePath,
                recording.id
              );

              // 2.2 AI文字起こし
              console.log(`🤖 [Thread B] 文字起こし実行: ${recording.topic}`);
              const transcriptionResult = await aiService.transcribeAudio(
                recordingInfo.audioFilePath, 
                recordingInfo.meetingInfo
              );

              // 2.3 AI要約生成
              console.log(`📝 [Thread B] 要約生成: ${recording.topic}`);
              const analysisResult = await aiService.analyzeComprehensively(transcriptionResult);

              // 2.4 一時音声ファイル削除
              console.log(`🗑️ [Thread B] 一時ファイル削除: ${recording.topic}`);
              await googleDriveService.deleteTemporaryFile(recording.id);

              return analysisResult;
            } catch (audioError) {
              console.error(`❌ [Thread B] 音声処理エラー: ${recording.topic}`, audioError.message);
              // 一時ファイルのクリーンアップを試行
              try {
                await googleDriveService.deleteTemporaryFile(recording.id);
              } catch (cleanupError) {
                console.error(`⚠️ 一時ファイルクリーンアップエラー: ${cleanupError.message}`);
              }
              throw audioError;
            }
          })()
        ]);

        // 3. Slack通知（両処理完了後）
        console.log(`💬 Slack通知送信: ${recording.topic}`);
        await slackService.sendMeetingSummaryWithRecording(analysisResult, driveResult);

        // 4. ローカル一時ファイル削除
        console.log(`🗑️ ローカル一時ファイル削除: ${recording.topic}`);
        // ローカルファイル削除処理をここに追加

        console.log(`✅ 並列処理完了: ${recording.topic}`);
        
        return {
          id: recording.id,
          topic: recording.topic,
          status: 'completed',
          start_time: recording.startTime || recording.start_time,
          duration: recording.duration,
          processing_type: 'parallel'
        };

      } catch (recordingError) {
        console.error(`❌ 録画並列処理エラー [${recording.topic}]:`, recordingError.message);
        
        // エラー通知
        await slackService.sendErrorNotification(
          recordingError, 
          `録画並列処理: ${recording.topic}`
        );

        return {
          id: recording.id,
          topic: recording.topic,
          status: 'error',
          error: recordingError.message,
          processing_type: 'parallel'
        };
      }
    });

    // 全ての並列処理の完了を待機
    console.log(`⏳ ${recordings.length}件の録画の並列処理を待機中...`);
    const results = await Promise.all(recordingPromises);
    processedRecordings.push(...results);

    console.log('🎉 全録画処理完了');

    return res.status(200).json({
      status: 'success',
      message: `✅ ${recordings.length}件の録画を並列処理しました`,
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