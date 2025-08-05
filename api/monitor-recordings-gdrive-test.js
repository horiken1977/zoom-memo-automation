// GoogleDriveサンプルデータテスト用API - 本番環境のAI/Slack機能テスト
const AIService = require('../1.src/services/aiService');
const SlackService = require('../1.src/services/slackService');
const GoogleDriveService = require('../1.src/services/googleDriveService');
const fs = require('fs-extra');
const path = require('path');
const https = require('https');

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
  
  console.log('🔍 GoogleDriveサンプルデータテスト開始');
  console.log(`環境: ${process.env.NODE_ENV || 'production'}`);
  console.log(`リージョン: ${process.env.VERCEL_REGION || 'unknown'}`);

  try {
    // サービス初期化
    const aiService = new AIService();
    const slackService = new SlackService();
    const googleDriveService = new GoogleDriveService();

    // サンプルデータを使用（Zoom APIの代わり）
    console.log('📡 サンプルデータを準備中...');
    const recordings = [{
      id: 'sample-test-20250805',
      uuid: 'sample-uuid-test',
      topic: '【GoogleDriveテスト】1on1 Kinoshita-san & Horie',
      start_time: '2025-07-31T13:59:11Z',
      duration: 30,
      host_email: 'test@example.com',
      recording_files: [{
        id: 'sample-file-1',
        file_type: 'MP4',
        download_url: 'dummy-url',
        recording_type: 'shared_screen_with_speaker_view'
      }]
    }];

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

        // 1. Google Driveからサンプル録画データをダウンロード
        console.log(`📥 Google Driveからサンプルデータダウンロード: ${recording.topic}`);
        
        // Google Drive内のサンプルファイル情報
        // URL: https://drive.google.com/drive/folders/1U05EhOhWn91JMUINgF9de3kakdo9E_uX
        const googleDriveFileId = '1JVrMYl5XNHj6xjS-V5sCqAjfAjEhRNNg'; // audio1763668932.m4a のファイルID
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${googleDriveFileId}`;
        
        const sampleDataPath = '/tmp/sample-zoom-data';
        await fs.ensureDir(sampleDataPath);
        const audioDestPath = path.join(sampleDataPath, 'audio_sample.m4a');
        
        // Google Driveからファイルをダウンロード
        try {
          console.log(`⬇️ ダウンロード開始: ${downloadUrl}`);
          
          await new Promise((resolve, reject) => {
            const file = fs.createWriteStream(audioDestPath);
            
            https.get(downloadUrl, (response) => {
              // リダイレクトの処理
              if (response.statusCode === 302 || response.statusCode === 303) {
                https.get(response.headers.location, (redirectResponse) => {
                  redirectResponse.pipe(file);
                  file.on('finish', () => {
                    file.close();
                    console.log(`✅ ダウンロード完了: audio_sample.m4a`);
                    resolve();
                  });
                }).on('error', reject);
              } else {
                response.pipe(file);
                file.on('finish', () => {
                  file.close();
                  console.log(`✅ ダウンロード完了: audio_sample.m4a`);
                  resolve();
                });
              }
            }).on('error', reject);
          });
          
        } catch (downloadError) {
          console.error('❌ Google Driveダウンロードエラー:', downloadError.message);
          console.log('⚠️ ダミーファイルを作成します');
          await fs.writeFile(audioDestPath, 'dummy audio content for testing');
        }
        
        const recordingInfo = {
          audioFilePath: audioDestPath,
          videoFilePath: audioDestPath, // 同じファイルを使用
          meetingInfo: {
            id: recording.id,
            topic: recording.topic,
            startTime: recording.start_time,
            duration: recording.duration,
            hostName: recording.host_email,
            participantCount: 2,
            originalFileName: 'test_sample.m4a'
          }
        };

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
        try {
          await fs.remove(sampleDataPath);
          console.log('✅ 一時ファイル削除完了');
        } catch (cleanupError) {
          console.error('⚠️ 一時ファイル削除エラー:', cleanupError.message);
        }

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