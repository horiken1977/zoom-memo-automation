// 本番環境スルーテスト（Zoom環境接続 + End-to-Endテスト）
// 目的: Zoom API接続確認 → 録画リスト出力 → ダミーデータでのEnd-to-End処理
// 安全性: 実際のZoom録画はダウンロードせず、存在確認のみ実施

const ZoomService = require('../1.src/services/zoomService');
const SampleDataService = require('../1.src/services/sampleDataService');
const AudioSummaryService = require('../1.src/services/audioSummaryService');
const VideoStorageService = require('../1.src/services/videoStorageService');
const SlackService = require('../1.src/services/slackService');
const { ExecutionLogger, ExecutionLogManager } = require('../1.src/utils/executionLogger');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // テストケース判定
  const testCase = req.query.test || 'PT001';
  
  if (testCase === 'PT001') {
    return await runProductionThroughputTest(res);
  } else if (testCase === 'PT001a') {
    return await runZoomConnectionTest(res);  // Zoom接続のみテスト
  } else if (testCase === 'debug') {
    return await runDebugConfigTest(res);  // 環境変数確認テスト
  } else if (testCase === 'jwt') {
    return await runJWTFallbackTest(res);  // JWT認証フォールバックテスト
  } else {
    return await runProductionThroughputTest(res);
  }
};

// PT001: 本番環境完全スルーテスト
async function runProductionThroughputTest(res) {
  const startTime = Date.now();
  console.log('🚀 PT001: 本番環境スルーテスト開始', new Date().toISOString());
  
  // 実行ログ開始（ダミーの会議情報で初期化）
  let executionLogger = null;
  
  // 時間追跡システム
  const timeTracker = {
    start: startTime,
    steps: [],
    log: function(stepName) {
      const now = Date.now();
      const elapsed = now - this.start;
      const stepTime = this.steps.length > 0 ? now - this.steps[this.steps.length - 1].timestamp : 0;
      
      const step = {
        step: stepName,
        timestamp: now,
        elapsed: elapsed,
        stepDuration: stepTime
      };
      this.steps.push(step);
      
      console.log(`⏱️ [${elapsed}ms] ${stepName} (step: ${stepTime}ms)`);
      return step;
    }
  };

  try {
    // Step 1: Zoom環境接続・録画存在確認
    timeTracker.log('Step 1: Zoom API接続・録画データ確認開始');
    console.log('\\n=== Step 1: Zoom環境接続確認 ===');
    
    const zoomService = new ZoomService();
    
    // Zoom APIヘルスチェック
    console.log('Zoom API ヘルスチェック実行中...');
    const healthCheck = await zoomService.healthCheck();
    timeTracker.log('Step 1a: Zoom APIヘルスチェック完了');
    console.log('✅ Zoom API接続状況:', healthCheck);
    
    // 実行ログに記録（後でexecutionLoggerが初期化された後に記録）

    // 録画データ存在確認（過去7日間）
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];
    
    console.log(`録画データ検索中... (期間: ${fromDate} ～ ${toDate})`);
    const zoomRecordings = await zoomService.getAllRecordings(fromDate, toDate);
    timeTracker.log('Step 1b: Zoom録画データ取得完了');
    
    console.log('\\n📊 Zoom録画データ一覧:');
    console.log(`検索結果: ${zoomRecordings.length}件の録画を発見`);
    
    let zoomRecordingDetails = [];
    if (zoomRecordings.length > 0) {
      // 各録画の詳細情報を取得（実際のダウンロードは行わない）
      for (let i = 0; i < Math.min(zoomRecordings.length, 5); i++) {
        const meeting = zoomRecordings[i];
        console.log(`\\n${i + 1}. 会議: ${meeting.topic}`);
        console.log(`   - 会議ID: ${meeting.id}`);
        console.log(`   - 開始時間: ${meeting.start_time}`);
        console.log(`   - 時間: ${meeting.duration}分`);
        console.log(`   - ホスト: ${meeting.host_email}`);
        
        try {
          // 録画ファイル詳細取得（ダウンロードはしない）
          const recordingDetails = await zoomService.getMeetingRecordings(meeting.uuid);
          const processableFiles = recordingDetails.recording_files?.filter(file => 
            file.file_type === 'MP4' || file.file_type === 'M4A'
          ) || [];
          
          console.log(`   - 処理可能ファイル数: ${processableFiles.length}件`);
          processableFiles.forEach((file, index) => {
            const fileSizeMB = (file.file_size / 1024 / 1024).toFixed(2);
            console.log(`     ${index + 1}) ${file.file_type} (${fileSizeMB}MB) - ${file.recording_type}`);
          });
          
          if (processableFiles.length > 0) {
            zoomRecordingDetails.push({
              meetingId: meeting.id,
              uuid: meeting.uuid,
              topic: meeting.topic,
              startTime: meeting.start_time,
              duration: meeting.duration,
              hostEmail: meeting.host_email,
              fileCount: processableFiles.length,
              totalSize: processableFiles.reduce((sum, file) => sum + file.file_size, 0)
            });
          }
          
          // 注意: 本番稼働時のZoom録画削除処理
          // TODO: 本番稼働時は以下のコメントを外して録画削除を有効化
          // if (process.env.DELETE_ZOOM_RECORDINGS === 'true') {
          //   await zoomService.deleteRecording(meeting.uuid);
          //   console.log(`   - 録画削除: 完了`);
          // }
        } catch (error) {
          console.log(`   - ファイル詳細取得エラー: ${error.message}`);
        }
      }
    } else {
      console.log('📝 処理可能な録画データなし - ダミーデータでテスト継続');
    }

    timeTracker.log('Step 1: Zoom環境確認完了');

    // Step 2: データ取得（ダミーデータ使用）
    timeTracker.log('Step 2: テストデータ取得開始（ダミーデータ使用）');
    console.log('\\n=== Step 2: テストデータ準備 ===');
    
    const sampleDataService = new SampleDataService();
    const sampleBufferData = await sampleDataService.getSampleDataAsBuffer();
    timeTracker.log('Step 2a: サンプル音声データ取得完了');
    
    const meetingInfo = sampleDataService.generateSampleMeetingInfo(sampleBufferData.fileName);
    
    // 実行ログを開始（会議情報が取得できたタイミング）
    executionLogger = ExecutionLogManager.startExecution(meetingInfo);
    executionLogger.logInfo('PT001_TEST_START', {
      testType: 'Production Throughput Test',
      dataSource: 'Sample Data',
      zoomRecordingsFound: zoomRecordingDetails.length
    });
    
    // Step 1の結果を実行ログに記録
    executionLogger.logSuccess('ZOOM_API_CONNECTION', {
      healthStatus: healthCheck.status,
      recordingsFound: zoomRecordings.length,
      recordingDetails: zoomRecordingDetails.length
    });
    
    // 会議情報にZoom情報を追記（スルーテスト用）
    meetingInfo.zoomTestInfo = {
      zoomApiHealthy: healthCheck.status === 'healthy',
      zoomUser: healthCheck.user || 'unknown',
      availableRecordings: zoomRecordingDetails.length,
      testDataUsed: true,
      testReason: zoomRecordings.length === 0 ? 'No Zoom recordings found' : 'Using sample data for safety'
    };
    
    timeTracker.log('Step 2: テストデータ準備完了');
    console.log('✅ テストデータ準備完了:', meetingInfo.topic);
    
    // Step 2を実行ログに記録
    executionLogger.logSuccess('TEST_DATA_PREPARATION', {
      fileName: sampleBufferData.fileName,
      fileSize: sampleBufferData.size,
      meetingTopic: meetingInfo.topic
    });

    // Step 3: 音声要約処理（ダミーデータ）
    timeTracker.log('Step 3: 音声要約処理開始');
    console.log('\\n=== Step 3: 音声要約処理（スルーテスト） ===');
    
    const audioSummaryService = new AudioSummaryService();
    const analysisResult = await audioSummaryService.processAudioBuffer(
      sampleBufferData.audioBuffer, 
      sampleBufferData.fileName, 
      meetingInfo
    );
    
    timeTracker.log('Step 3: 音声要約処理完了');
    console.log('✅ 音声要約処理完了');
    console.log('   - 文字起こし文字数:', analysisResult.transcription?.length || 0);
    
    // Step 3を実行ログに記録
    executionLogger.logSuccess('AUDIO_SUMMARY_PROCESSING', {
      transcriptionLength: analysisResult.transcription?.length || 0,
      summaryGenerated: !!analysisResult.structuredSummary,
      processingMethod: 'Sample Data with Gemini AI'
    });

    // Step 4: 動画保存処理（ダミーデータ）
    timeTracker.log('Step 4: 動画保存処理開始');
    console.log('\\n=== Step 4: 動画保存処理（スルーテスト） ===');
    
    const videoStorageService = new VideoStorageService();
    const videoSaveResult = await videoStorageService.saveVideoToGoogleDrive(meetingInfo);
    
    timeTracker.log('Step 4: 動画保存処理完了');
    console.log('✅ 動画保存処理完了');
    console.log('   - 動画保存先:', videoSaveResult.folderPath);
    
    // Step 4を実行ログに記録
    executionLogger.logSuccess('VIDEO_STORAGE', {
      fileId: videoSaveResult.fileId,
      fileName: videoSaveResult.fileName,
      folderPath: videoSaveResult.folderPath,
      viewLink: videoSaveResult.viewLink
    });

    // Step 5: Slack投稿（本番チャンネル）
    timeTracker.log('Step 5: Slack投稿開始（スルーテスト通知）');
    console.log('\\n=== Step 5: Slack投稿（スルーテスト） ===');
    
    const slackService = new SlackService();
    
    // Slack投稿用データを準備（スルーテスト情報を含む）
    const slackAnalysisResult = {
      meetingInfo: meetingInfo,
      summary: analysisResult.structuredSummary,
      transcription: analysisResult.transcription,
      participants: analysisResult.structuredSummary?.attendees || [],
      actionItems: analysisResult.structuredSummary?.nextActions || [],
      decisions: analysisResult.structuredSummary?.decisions || [],
      // スルーテスト専用情報
      throughputTestInfo: {
        testType: 'Production Throughput Test (PT001)',
        executionTime: Date.now() - startTime,
        zoomApiStatus: healthCheck.status,
        zoomRecordingsFound: zoomRecordings.length,
        processedRecordings: zoomRecordingDetails.length,
        testDataUsed: true
      }
    };

    const slackResult = await slackService.sendMeetingSummary(slackAnalysisResult);
    timeTracker.log('Step 5: Slack投稿完了');
    console.log('✅ Slack投稿成功');
    console.log('   - チャンネル:', slackResult.channel);
    console.log('   - タイムスタンプ:', slackResult.ts);
    
    // Step 5を実行ログに記録
    executionLogger.logSuccess('SLACK_NOTIFICATION', {
      channel: slackResult.channel,
      messageId: slackResult.ts,
      testType: 'Production Throughput Test'
    });

    // 実行ログを完了してGoogle Driveに保存
    let logSaveResult = null;
    if (executionLogger) {
      executionLogger.logSuccess('PT001_TEST_COMPLETE', {
        totalExecutionTime: Date.now() - startTime,
        allStepsCompleted: true,
        finalStatus: 'SUCCESS'
      });
      
      try {
        logSaveResult = await executionLogger.saveToGoogleDrive();
        console.log('✅ 実行ログ保存成功:', logSaveResult.viewLink);
        timeTracker.log('Step 6: 実行ログGoogle Drive保存完了');
      } catch (logError) {
        console.error('❌ 実行ログ保存失敗:', logError.message);
        timeTracker.log('Step 6: 実行ログGoogle Drive保存エラー');
        logSaveResult = { success: false, error: logError.message };
      }
    }
    
    // 完了レスポンス
    timeTracker.log('PT001完了 - レスポンス生成');
    const totalExecutionTime = Date.now() - startTime;
    
    return res.status(200).json({
      status: 'success',
      test: 'PT001-production-throughput',
      message: '本番環境スルーテスト成功',
      executionTiming: {
        totalTime: `${totalExecutionTime}ms`,
        totalSeconds: Math.floor(totalExecutionTime / 1000),
        steps: timeTracker.steps,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString()
      },
      zoomEnvironment: {
        apiHealth: healthCheck,
        recordingsFound: zoomRecordings.length,
        recordingDetails: zoomRecordingDetails.slice(0, 3), // 最大3件まで
        searchPeriod: { from: fromDate, to: toDate }
      },
      testExecution: {
        dataSource: 'sample_data', // 安全のためサンプルデータ使用
        audioFile: {
          fileName: sampleBufferData.fileName,
          size: sampleBufferData.size,
          mimeType: sampleBufferData.mimeType
        },
        videoStorage: {
          fileId: videoSaveResult.fileId,
          fileName: videoSaveResult.fileName,
          viewLink: videoSaveResult.viewLink,
          downloadLink: videoSaveResult.downloadLink,
          folderPath: videoSaveResult.folderPath
        },
        slackNotification: {
          channel: slackResult.channel,
          messageId: slackResult.ts,
          posted: true,
          testType: 'production_throughput'
        }
      },
      executionLog: logSaveResult ? {
        saved: logSaveResult.success,
        viewLink: logSaveResult.viewLink,
        fileName: logSaveResult.logFileName,
        folderPath: logSaveResult.folderPath,
        error: logSaveResult.error
      } : null,
      note: 'PT001完了: Zoom環境確認→録画リスト取得→サンプルデータでのEnd-to-End処理→本番Slack投稿→実行ログGoogle Drive保存',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    timeTracker.log('PT001エラー発生');
    console.error('❌ PT001 本番スルーテストエラー:', error);
    
    // エラー時にも実行ログを保存
    let errorLogSaveResult = null;
    if (executionLogger) {
      executionLogger.logError('PT001_TEST_ERROR', 'E_PT001_FAILED', error.message, {
        errorStack: error.stack,
        errorAt: Date.now() - startTime
      });
      
      try {
        errorLogSaveResult = await executionLogger.saveToGoogleDrive();
        console.log('✅ エラー時実行ログ保存成功:', errorLogSaveResult.viewLink);
      } catch (logError) {
        console.error('❌ エラー時実行ログ保存失敗:', logError.message);
        errorLogSaveResult = { success: false, error: logError.message };
      }
    }
    
    const errorTime = Date.now() - startTime;
    
    return res.status(500).json({
      status: 'error',
      test: 'PT001-production-throughput',
      message: '本番環境スルーテスト失敗',
      error: error.message,
      stack: error.stack,
      executionTiming: {
        errorOccurredAt: `${errorTime}ms`,
        completedSteps: timeTracker.steps,
        startTime: new Date(startTime).toISOString(),
        errorTime: new Date().toISOString()
      },
      executionLog: errorLogSaveResult ? {
        saved: errorLogSaveResult.success,
        viewLink: errorLogSaveResult.viewLink,
        fileName: errorLogSaveResult.logFileName,
        error: errorLogSaveResult.error
      } : null,
      timestamp: new Date().toISOString()
    });
  }
}

// PT001a: Zoom接続テストのみ
async function runZoomConnectionTest(res) {
  const startTime = Date.now();
  console.log('🔍 PT001a: Zoom接続テスト開始', new Date().toISOString());
  
  try {
    const zoomService = new ZoomService();
    
    // ヘルスチェック
    console.log('Zoom API ヘルスチェック実行中...');
    const healthCheck = await zoomService.healthCheck();
    console.log('Zoom API接続状況:', healthCheck);
    
    // 録画データ確認
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];
    
    console.log(`録画データ検索中... (期間: ${fromDate} ～ ${toDate})`);
    const recordings = await zoomService.getAllRecordings(fromDate, toDate);
    console.log(`検索結果: ${recordings.length}件の録画を発見`);
    
    const totalTime = Date.now() - startTime;
    
    return res.status(200).json({
      status: 'success',
      test: 'PT001a-zoom-connection',
      message: 'Zoom接続テスト成功',
      executionTime: `${totalTime}ms`,
      zoomHealth: healthCheck,
      recordingsFound: recordings.length,
      recordingSummary: recordings.slice(0, 5).map(meeting => ({
        id: meeting.id,
        topic: meeting.topic,
        startTime: meeting.start_time,
        duration: meeting.duration,
        hostEmail: meeting.host_email
      })),
      searchPeriod: { from: fromDate, to: toDate },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ PT001a Zoom接続テストエラー:', error);
    
    const errorTime = Date.now() - startTime;
    
    return res.status(500).json({
      status: 'error',
      test: 'PT001a-zoom-connection',
      message: 'Zoom接続テスト失敗',
      error: error.message,
      executionTime: `${errorTime}ms`,
      timestamp: new Date().toISOString()
    });
  }
}

// Debug: 環境変数確認テスト
async function runDebugConfigTest(res) {
  console.log('🔍 Debug: 環境変数確認テスト開始');
  
  try {
    const config = require('../1.src/config');
    
    const debugInfo = {
      zoom: {
        accountId: config.zoom.accountId ? 'SET' : 'NOT SET',
        clientId: config.zoom.clientId ? 'SET' : 'NOT SET', 
        clientSecret: config.zoom.clientSecret ? 'SET' : 'NOT SET',
        useOAuth: config.zoom.useOAuth,
        baseUrl: config.zoom.baseUrl
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: !!process.env.VERCEL,
        VERCEL_REGION: process.env.VERCEL_REGION
      },
      rawEnvVars: {
        ZOOM_ACCOUNT_ID: process.env.ZOOM_ACCOUNT_ID ? 'SET' : 'NOT SET',
        ZOOM_CLIENT_ID: process.env.ZOOM_CLIENT_ID ? 'SET' : 'NOT SET',
        ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET ? 'SET' : 'NOT SET',
        ZOOM_USE_OAUTH: process.env.ZOOM_USE_OAUTH
      }
    };
    
    console.log('Debug情報:', JSON.stringify(debugInfo, null, 2));
    
    return res.status(200).json({
      status: 'success',
      test: 'debug-config',
      message: '環境変数確認テスト',
      config: debugInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Debug テストエラー:', error);
    
    return res.status(500).json({
      status: 'error',
      test: 'debug-config', 
      message: '環境変数確認テスト失敗',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// JWT: JWT認証フォールバックテスト
async function runJWTFallbackTest(res) {
  const startTime = Date.now();
  console.log('🔧 JWT: JWT認証フォールバックテスト開始', new Date().toISOString());
  console.log('目的: OAuth認証問題の切り分けとZoom API基本接続確認');
  
  try {
    // 一時的にJWT認証を強制使用するZoomServiceを作成
    const config = require('../1.src/config');
    const axios = require('axios');
    const crypto = require('crypto');
    
    // JWT生成（ZoomServiceのメソッドを一時的に再実装）
    const generateJWT = () => {
      const header = {
        alg: 'HS256',
        typ: 'JWT'
      };

      const payload = {
        iss: config.zoom.clientId, // Client IDをAPI Keyとして使用
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      
      const signature = crypto
        .createHmac('sha256', config.zoom.clientSecret) // Client SecretをAPI Secretとして使用
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');

      return `${encodedHeader}.${encodedPayload}.${signature}`;
    };

    console.log('JWT生成中...');
    const jwtToken = generateJWT();
    console.log('✅ JWT生成完了');

    // JWT認証でZoom API基本テスト（/users/me）
    console.log('Zoom API基本接続テスト中（JWT認証）...');
    const headers = {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    };
    
    const userResponse = await axios.get(`${config.zoom.baseUrl}/users/me`, { headers });
    console.log('✅ Zoom API基本接続成功（JWT認証）');
    console.log('ユーザー情報:', userResponse.data.email);

    // JWT認証で録画データ取得テスト
    console.log('録画データ取得テスト中（JWT認証）...');
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];
    
    const recordingsResponse = await axios.get(`${config.zoom.baseUrl}/accounts/${config.zoom.accountId}/recordings`, {
      headers,
      params: {
        from: fromDate,
        to: toDate,
        page_size: 10
      }
    });

    const recordings = recordingsResponse.data.meetings || [];
    console.log(`✅ 録画データ取得成功: ${recordings.length}件発見`);

    // 録画詳細情報を表示
    let recordingDetails = [];
    if (recordings.length > 0) {
      console.log('\\n📊 Zoom録画データ一覧（JWT認証）:');
      for (let i = 0; i < Math.min(recordings.length, 3); i++) {
        const meeting = recordings[i];
        console.log(`\\n${i + 1}. 会議: ${meeting.topic}`);
        console.log(`   - 会議ID: ${meeting.id}`);
        console.log(`   - 開始時間: ${meeting.start_time}`);
        console.log(`   - 時間: ${meeting.duration}分`);
        console.log(`   - ホスト: ${meeting.host_email}`);
        
        recordingDetails.push({
          meetingId: meeting.id,
          topic: meeting.topic,
          startTime: meeting.start_time,
          duration: meeting.duration,
          hostEmail: meeting.host_email
        });
      }
    }

    const totalTime = Date.now() - startTime;
    
    return res.status(200).json({
      status: 'success',
      test: 'jwt-fallback',
      message: 'JWT認証フォールバックテスト成功',
      executionTime: `${totalTime}ms`,
      authMethod: 'JWT (Legacy)',
      zoomApiAccess: true,
      userInfo: {
        email: userResponse.data.email,
        accountId: userResponse.data.account_id,
        type: userResponse.data.type
      },
      recordingsFound: recordings.length,
      recordingDetails: recordingDetails,
      searchPeriod: { from: fromDate, to: toDate },
      conclusion: recordings.length > 0 
        ? '✅ JWT認証で録画データアクセス成功 → OAuth設定に問題あり'
        : '✅ JWT認証成功、録画データなし → OAuth設定問題 or 録画データ不存在',
      nextSteps: [
        'Zoom App StatusをPublishedに変更',
        'OAuth Scopesを再確認',
        'Server-to-Server OAuth App設定を見直し'
      ],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ JWT認証フォールバックテストエラー:', error);
    
    const errorTime = Date.now() - startTime;
    
    let conclusion = 'JWT認証も失敗';
    let nextSteps = ['Zoom Account設定を確認', 'Client ID/Secretを再生成'];
    
    if (error.response?.status === 401) {
      conclusion = 'JWT認証失敗 → Client ID/Secretに問題';
      nextSteps = ['Zoom App Credentialsを再確認', 'Client Secret再生成を検討'];
    } else if (error.response?.status === 403) {
      conclusion = 'JWT認証成功だが権限不足 → Scopeに問題';
      nextSteps = ['Zoom App Scopesを確認', 'recording:read権限を追加'];
    }
    
    return res.status(500).json({
      status: 'error',
      test: 'jwt-fallback',
      message: 'JWT認証フォールバックテスト失敗',
      error: error.message,
      httpStatus: error.response?.status,
      errorResponse: error.response?.data,
      executionTime: `${errorTime}ms`,
      conclusion: conclusion,
      nextSteps: nextSteps,
      timestamp: new Date().toISOString()
    });
  }
}