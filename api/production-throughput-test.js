// 本番環境スルーテスト（Zoom実録画データ完全処理テスト）
// 目的: Zoom実録画 → 動画Google Drive保存 → 音声AI処理 → Slack通知の完全フロー
// 変更: ZoomRecordingServiceで実際のZoom録画データを処理（SampleData使用廃止）

const ZoomRecordingService = require('../1.src/services/zoomRecordingService');
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
  const executionId = `PT001-${Date.now()}`;
  console.log('🚀 PT001: 本番環境実録画処理テスト開始', { executionId, timestamp: new Date().toISOString() });
  
  // 実行ログ開始（後で実際の会議情報で初期化）
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
    // Step 1: ZoomRecordingService初期化・録画リスト取得
    timeTracker.log('Step 1: ZoomRecordingService初期化・録画リスト取得開始');
    console.log('\\n=== Step 1: Zoom実録画データ取得 ===');
    
    const zoomRecordingService = new ZoomRecordingService();
    
    // 録画データ取得（過去7日間）
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];
    
    console.log(`📋 録画リスト取得中... (期間: ${fromDate} ～ ${toDate})`);
    
    // 一時的な実行ログ作成（録画リスト取得用）
    const tempMeetingInfo = {
      id: 'temp-pt001',
      topic: 'PT001 Zoom録画リスト取得',
      start_time: new Date().toISOString()
    };
    const tempExecutionLogger = new ExecutionLogger(executionId, tempMeetingInfo);
    
    const availableRecordings = await zoomRecordingService.getRecordingsList(
      fromDate, 
      toDate, 
      tempExecutionLogger
    );
    timeTracker.log('Step 1a: Zoom録画リスト取得完了');
    
    console.log('\\n📊 取得結果:');
    console.log(`✅ 処理可能な録画: ${availableRecordings.length}件`);
    
    if (availableRecordings.length > 0) {
      console.log('\\n📋 録画一覧:');
      availableRecordings.slice(0, 3).forEach((recording, index) => {
        console.log(`\\n${index + 1}. 会議: ${recording.topic}`);
        console.log(`   - 会議ID: ${recording.id}`);
        console.log(`   - 開始時間: ${recording.start_time}`);
        console.log(`   - 時間: ${recording.duration}分`);
        console.log(`   - ホスト: ${recording.host_email}`);
        
        const videoFiles = recording.recording_files?.filter(file => file.file_type === 'MP4') || [];
        const audioFiles = recording.recording_files?.filter(file => ['M4A', 'MP3'].includes(file.file_type)) || [];
        
        console.log(`   - 動画ファイル: ${videoFiles.length}件`);
        console.log(`   - 音声ファイル: ${audioFiles.length}件`);
        
        const totalSize = recording.recording_files?.reduce((sum, file) => sum + file.file_size, 0) || 0;
        console.log(`   - 合計サイズ: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
      });
    } else {
      console.log('📝 処理可能な録画データなし');
      
      // 録画がない場合の対応
      const result = {
        success: false,
        message: 'PT001テスト: 処理可能な録画データが見つかりませんでした',
        period: `${fromDate} ～ ${toDate}`,
        totalDuration: Date.now() - startTime,
        steps: timeTracker.steps
      };
      
      return res.status(200).json(result);
    }

    timeTracker.log('Step 1: Zoom録画リスト取得完了');

    // Step 2: 実録画データ処理
    timeTracker.log('Step 2: Zoom実録画データ処理開始');
    console.log('\\n=== Step 2: Zoom実録画データ完全処理 ===');
    
    // 最初の録画を処理対象とする（テスト用）
    const targetRecording = availableRecordings[0];
    console.log(`🎯 処理対象録画: ${targetRecording.topic}`);
    
    // 実際の会議情報で実行ログを開始
    const actualMeetingInfo = zoomRecordingService.extractMeetingInfo(targetRecording);
    executionLogger = ExecutionLogManager.startExecution(actualMeetingInfo, executionId);
    
    executionLogger.logInfo('PT001_REAL_RECORDING_START', {
      testType: 'Production Throughput Test - Real Recording',
      meetingId: targetRecording.id,
      meetingTopic: targetRecording.topic,
      availableRecordings: availableRecordings.length
    });
    
    console.log('\\n📋 処理詳細:');
    console.log(`   - 会議名: ${targetRecording.topic}`);
    console.log(`   - 開始時間: ${targetRecording.start_time}`);
    console.log(`   - 時間: ${targetRecording.duration}分`);
    
    // 実録画データ処理実行
    const recordingResult = await zoomRecordingService.processRecording(
      targetRecording,
      executionLogger
    );
    
    timeTracker.log('Step 2: 実録画データ処理完了');
    console.log('✅ Zoom実録画処理完了:', recordingResult.success ? '成功' : '失敗');
    
    if (!recordingResult.success) {
      throw new Error(`録画処理失敗: ${recordingResult.error}`);
    }
    
    console.log('\\n📊 処理結果:');
    console.log(`   - 動画保存: ${recordingResult.video?.success ? '成功' : '失敗'}`);
    console.log(`   - 動画リンク: ${recordingResult.video?.shareLink || 'なし'}`);
    console.log(`   - 音声処理: ${recordingResult.audio?.success ? '成功' : '失敗'}`);
    console.log(`   - 要約生成: ${recordingResult.audio?.summary ? '成功' : '失敗'}`);
    console.log(`   - 文字起こし: ${recordingResult.audio?.transcription?.length || 0}文字`);

    // Step 3: Slack通知
    timeTracker.log('Step 3: Slack通知開始');
    console.log('\\n=== Step 3: Slack通知（実録画処理結果） ===');
    
    const slackService = new SlackService();
    
    // Slack投稿用データを準備（実録画処理結果）
    const slackAnalysisResult = {
      meetingInfo: recordingResult.meetingInfo,
      summary: recordingResult.audio?.summary,
      transcription: recordingResult.audio?.transcription,
      participants: recordingResult.audio?.summary?.attendees || [],
      actionItems: recordingResult.audio?.summary?.nextActions || [],
      decisions: recordingResult.audio?.summary?.decisions || [],
      // 実録画処理専用情報
      realRecordingInfo: {
        testType: 'PT001: 実録画データ完全処理テスト',
        executionTime: Date.now() - startTime,
        meetingId: recordingResult.meetingId,
        meetingTopic: recordingResult.meetingTopic,
        videoSaved: recordingResult.video?.success,
        videoLink: recordingResult.video?.shareLink,
        audioProcessed: recordingResult.audio?.success,
        transcriptionLength: recordingResult.audio?.transcription?.length || 0
      }
    };

    const slackResult = await slackService.sendMeetingSummary(slackAnalysisResult);
    timeTracker.log('Step 3: Slack通知完了');
    console.log('✅ Slack通知成功');
    console.log('   - チャンネル:', slackResult.channel);
    console.log('   - タイムスタンプ:', slackResult.ts);

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
        recordingsFound: availableRecordings.length,
        recordingDetails: availableRecordings.slice(0, 3).map(rec => ({
          meetingId: rec.id,
          topic: rec.topic,
          startTime: rec.start_time,
          duration: rec.duration,
          hostEmail: rec.host_email
        })),
        searchPeriod: { from: fromDate, to: toDate }
      },
      testExecution: {
        dataSource: 'real_zoom_recording', // 実際のZoom録画データ使用
        processedRecording: {
          meetingId: recordingResult.meetingId,
          meetingTopic: recordingResult.meetingTopic || targetRecording.topic,
          videoSaved: recordingResult.video?.success,
          videoLink: recordingResult.video?.shareLink,
          audioProcessed: recordingResult.audio?.success,
          transcriptionLength: recordingResult.audio?.transcription?.length || 0
        },
        slackNotification: {
          channel: slackResult.channel,
          messageId: slackResult.ts,
          posted: true,
          testType: 'production_throughput_real_recording'
        }
      },
      executionLog: logSaveResult ? {
        saved: logSaveResult.success,
        viewLink: logSaveResult.viewLink,
        fileName: logSaveResult.logFileName,
        folderPath: logSaveResult.folderPath,
        error: logSaveResult.error
      } : null,
      note: 'PT001完了: Zoom実録画リスト取得→実録画データ処理→動画Google Drive保存→音声AI処理→Slack通知→実行ログGoogle Drive保存',
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