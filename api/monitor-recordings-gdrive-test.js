// GoogleDriveサンプルデータテスト用API - 部品化された本番環境テスト
const SampleDataService = require('../1.src/services/sampleDataService');
const AudioSummaryService = require('../1.src/services/audioSummaryService');
const VideoStorageService = require('../1.src/services/videoStorageService');
const MeetingNotificationService = require('../1.src/services/meetingNotificationService');

module.exports = async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const startTime = Date.now();
  
  console.log('🔍 GoogleDriveサンプルデータテスト開始');
  console.log(`環境: ${process.env.NODE_ENV || 'production'}`);
  console.log(`リージョン: ${process.env.VERCEL_REGION || 'unknown'}`);

  try {
    // 部品化されたサービス初期化
    console.log('🔧 サービス初期化中...');
    const sampleDataService = new SampleDataService();
    const audioSummaryService = new AudioSummaryService();
    const videoStorageService = new VideoStorageService();
    const notificationService = new MeetingNotificationService();
    console.log('✅ 全サービス初期化完了');

    // Google Driveからサンプルデータを取得
    console.log('📡 Google Driveからサンプルデータを取得中...');
    let sampleData;
    try {
      sampleData = await sampleDataService.getSampleData();
      console.log(`✅ サンプルファイル発見: ${sampleData.fileName} (${sampleData.fileId})`);
    } catch (sampleError) {
      console.error('❌ サンプルデータ取得エラー:', sampleError.message);
      return res.status(500).json({
        status: 'error',
        message: 'Google Driveサンプルデータ取得に失敗',
        error: sampleError.message,
        step: 'sample_data_retrieval',
        timestamp: new Date().toISOString()
      });
    }

    // サンプル会議情報を生成
    const meetingInfo = sampleDataService.generateSampleMeetingInfo(sampleData.fileName);
    
    const recordings = [meetingInfo];

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
        console.log(`💬 Slack開始通知送信: ${recording.topic}`);
        await notificationService.sendProcessingStartNotification(recording);

        // 1. Google Driveからサンプル音声データをダウンロード
        console.log(`📥 Google Driveからサンプルデータダウンロード: ${recording.topic}`);
        const downloadResult = await sampleDataService.downloadSampleFile(sampleData.fileId, sampleData.fileName);
        
        // 2. 音声ファイルをGeminiで8項目要約処理
        console.log(`🤖 音声ファイル処理開始: ${recording.topic}`);
        const analysisResult = await audioSummaryService.processAudioFile(downloadResult.filePath, recording);

        // 3. 動画ファイルをGoogle Driveに保存し共有リンク取得
        console.log(`☁️ Google Drive保存: ${recording.topic}`);
        const driveResult = await videoStorageService.saveVideoToGoogleDrive(downloadResult.filePath, recording);

        // 4. 8項目構造化要約と動画リンクをSlackに送信
        console.log(`💬 Slack通知送信: ${recording.topic}`);
        await notificationService.sendStructuredMeetingSummary(analysisResult, driveResult);

        // 5. 一時ファイル削除
        console.log(`🗑️ 一時ファイル削除: ${recording.topic}`);
        await sampleDataService.cleanup();

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
        await notificationService.sendProcessingErrorNotification(recording, recordingError);

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
      const notificationService = new MeetingNotificationService();
      const errorMeetingInfo = { topic: 'システムエラー', start_time: new Date().toISOString() };
      await notificationService.sendProcessingErrorNotification(errorMeetingInfo, error);
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