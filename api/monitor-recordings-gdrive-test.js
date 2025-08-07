// TC203: 8項目構造化要約テスト（メモリバッファ処理）
// TC204: VideoStorageService動画処理テスト
// TC205: End-to-End統合テスト（データ取得→要約→保存→Slack投稿）
const SampleDataService = require('../1.src/services/sampleDataService');
const AudioSummaryService = require('../1.src/services/audioSummaryService');
const VideoStorageService = require('../1.src/services/videoStorageService');
const SlackService = require('../1.src/services/slackService');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // テストケース判定：クエリパラメータでTC203/TC204/TC205を切り替え
  const testCase = req.query.test || 'TC203';
  
  if (testCase === 'timeout') {
    // タイムアウト検証用：指定秒数待機
    return await runTimeoutTest(res, req);
  } else if (testCase === 'TC204') {
    return await runTC204Test(res);
  } else if (testCase === 'TC205') {
    return await runTC205Test(res);
  } else if (testCase === 'TC205a') {
    return await runTC205aTest(res);  // 環境確認のみ
  } else if (testCase === 'TC205b') {
    return await runTC205bTest(res);  // Slack投稿のみテスト
  } else {
    return await runTC203Test(res);
  }
};

// タイムアウト検証テスト
async function runTimeoutTest(res, req) {
  const targetSeconds = parseInt(req.query.wait || '90'); // デフォルト90秒
  const startTime = Date.now();
  
  console.log(`⏰ タイムアウト検証開始: ${targetSeconds}秒待機予定`, new Date().toISOString());
  console.log('📊 Vercel設定: maxDuration=300秒（vercel.json）');
  
  // 10秒ごとに生存確認
  const intervalId = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`⌛ [生存確認] ${elapsed}秒経過 - まだ生きてます...`, new Date().toISOString());
  }, 10000);
  
  try {
    // 指定秒数待機
    await new Promise(resolve => setTimeout(resolve, targetSeconds * 1000));
    
    clearInterval(intervalId);
    const totalTime = Date.now() - startTime;
    const totalSeconds = Math.floor(totalTime / 1000);
    
    console.log(`✅ タイムアウト検証成功: ${totalSeconds}秒実行`);
    
    return res.status(200).json({
      status: 'success',
      message: `タイムアウト検証成功: ${totalSeconds}秒実行`,
      targetSeconds: targetSeconds,
      actualSeconds: totalSeconds,
      actualMs: totalTime,
      vercelConfig: {
        maxDuration: 300,
        note: 'vercel.json設定値'
      },
      conclusion: totalSeconds >= 60 ? '60秒以上の実行が可能' : '60秒未満で完了',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    clearInterval(intervalId);
    const errorTime = Date.now() - startTime;
    const errorSeconds = Math.floor(errorTime / 1000);
    
    console.error(`❌ タイムアウト検証エラー: ${errorSeconds}秒でエラー`, error.message);
    
    return res.status(500).json({
      status: 'error',
      message: 'タイムアウト検証中にエラー',
      error: error.message,
      errorAtSeconds: errorSeconds,
      errorAtMs: errorTime,
      targetSeconds: targetSeconds,
      timestamp: new Date().toISOString()
    });
  }
}

// TC203: 8項目構造化要約テスト（メモリバッファ処理）
async function runTC203Test(res) {
  const startTime = Date.now();
  console.log('🧪 TC203: 8項目構造化要約テスト（メモリバッファ処理）開始', new Date().toISOString());
  console.log('📊 Vercel設定: maxDuration=300秒（vercel.json）');

  // 10秒ごとに生存確認ログを出力する非同期タスク
  const intervalId = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`⌛ [生存確認] ${elapsed}秒経過 - 処理継続中...`, new Date().toISOString());
  }, 10000);

  // 詳細タイミング追跡
  const debugTimer = {
    start: startTime,
    log: function(step, detail = '') {
      const elapsed = Date.now() - this.start;
      const seconds = Math.floor(elapsed / 1000);
      console.log(`⏱️ [${elapsed}ms = ${seconds}秒] ${step} ${detail}`);
      return elapsed;
    }
  };

  try {
    // Step 1: サービス初期化
    debugTimer.log('Step 1: SampleDataService初期化開始');
    const sampleDataService = new SampleDataService();
    debugTimer.log('Step 1: SampleDataService初期化完了');
    
    debugTimer.log('Step 1b: AudioSummaryService初期化開始');
    const audioSummaryService = new AudioSummaryService();
    debugTimer.log('Step 1b: AudioSummaryService初期化完了');

    // Step 2: Google Driveから音声データを直接Bufferとして取得（メモリ処理）
    debugTimer.log('Step 2: getSampleDataAsBuffer()実行開始（メモリバッファ処理）');
    const sampleBufferData = await sampleDataService.getSampleDataAsBuffer();
    debugTimer.log('Step 2: getSampleDataAsBuffer()完了', `size: ${(sampleBufferData.size / 1024).toFixed(2)} KB`);
    console.log('✅ サンプルバッファ取得成功:', {
      fileName: sampleBufferData.fileName,
      size: `${(sampleBufferData.size / 1024).toFixed(2)} KB`,
      mimeType: sampleBufferData.mimeType
    });

    // Step 3: サンプル会議情報生成
    debugTimer.log('Step 3: サンプル会議情報生成開始');
    const meetingInfo = sampleDataService.generateSampleMeetingInfo(sampleBufferData.fileName);
    debugTimer.log('Step 3: サンプル会議情報生成完了');
    console.log('✅ サンプル会議情報生成成功:', meetingInfo.topic);

    // Step 4: AudioSummaryServiceでBuffer処理＋8項目構造化要約（ファイル作成なし）
    debugTimer.log('Step 4: processAudioBuffer()開始（メモリバッファ処理）');
    
    const analysisResult = await audioSummaryService.processAudioBuffer(
      sampleBufferData.audioBuffer, 
      sampleBufferData.fileName, 
      meetingInfo
    );
    debugTimer.log('Step 4: processAudioBuffer()完了');
    console.log('✅ 8項目構造化要約処理成功');

    clearInterval(intervalId); // 生存確認タイマー停止
    const totalTestTime = debugTimer.log('TC203テスト完了');
    const totalSeconds = Math.floor(totalTestTime / 1000);
    console.log(`✅ TC203総実行時間: ${totalSeconds}秒（${totalTestTime}ms）`);

    return res.status(200).json({
      status: 'success',
      test: 'TC203-complete',
      message: '8項目構造化要約テスト成功（メモリバッファ処理）',
      executionTime: {
        totalMs: totalTestTime,
        totalSeconds: totalSeconds,
        note: `Vercel設定maxDuration=300秒, 実際の実行時間=${totalSeconds}秒`
      },
      sampleData: {
        fileName: sampleBufferData.fileName,
        size: sampleBufferData.size,
        mimeType: sampleBufferData.mimeType,
        fileId: sampleBufferData.fileId
      },
      meetingInfo: meetingInfo,
      bufferProcessing: {
        bufferSize: sampleBufferData.audioBuffer.length,
        processingMode: 'memory_only',
        note: 'ファイル作成なし・完全メモリ処理'
      },
      analysisResult: analysisResult,
      note: 'TC203要件完了: Google Drive→メモリバッファ→Gemini文字起こし→8項目構造化要約',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    clearInterval(intervalId); // 生存確認タイマー停止
    const errorTime = Date.now() - startTime;
    const errorSeconds = Math.floor(errorTime / 1000);
    console.error('❌ TC203テストエラー:', error);
    console.error(`❌ エラー発生時の経過時間: ${errorSeconds}秒（${errorTime}ms）`);
    
    return res.status(500).json({
      status: 'error',
      test: 'TC203-complete',
      message: '8項目構造化要約テスト失敗（メモリバッファ処理）',
      error: error.message,
      stack: error.stack,
      executionTime: {
        errorAtMs: errorTime,
        errorAtSeconds: errorSeconds,
        note: `エラー発生時刻: ${errorSeconds}秒経過時点`
      },
      timestamp: new Date().toISOString(),
      processingMode: 'memory_only'
    });
  }
}

// TC204: VideoStorageService動画処理テスト
async function runTC204Test(res) {
  console.log('🧪 TC204: VideoStorageService動画処理テスト開始');

  try {
    // Step 1: VideoStorageService初期化
    console.log('Step 1: VideoStorageService初期化');
    const videoStorageService = new VideoStorageService();
    
    console.log('Step 1b: SampleDataService初期化（会議情報生成用）');
    const sampleDataService = new SampleDataService();

    // Step 2: Google Driveサンプルフォルダから動画データを取得
    console.log('Step 2: getSampleVideoData()実行');
    const videoData = await videoStorageService.getSampleVideoData();
    console.log('✅ サンプル動画データ取得成功:', {
      fileName: videoData.fileName,
      size: `${(videoData.size / 1024 / 1024).toFixed(2)} MB`,
      mimeType: videoData.mimeType,
      fileId: videoData.fileId
    });

    // Step 3: サンプル会議情報生成
    console.log('Step 3: サンプル会議情報生成');
    const meetingInfo = sampleDataService.generateSampleMeetingInfo(videoData.fileName);
    console.log('✅ サンプル会議情報生成成功:', meetingInfo);

    // Step 4: 動画ファイルをGoogle Driveに保存＋共有リンク作成
    console.log('Step 4: saveVideoToGoogleDrive()実行（動画保存＋共有リンク作成）');
    const saveResult = await videoStorageService.saveVideoToGoogleDrive(meetingInfo);
    console.log('✅ 動画保存＋共有リンク作成成功');

    return res.status(200).json({
      status: 'success',
      test: 'TC204-complete',
      message: 'VideoStorageService動画処理テスト成功',
      videoData: {
        fileName: videoData.fileName,
        size: videoData.size,
        mimeType: videoData.mimeType,
        fileId: videoData.fileId
      },
      meetingInfo: meetingInfo,
      saveResult: {
        savedFileId: saveResult.fileId,
        savedFileName: saveResult.fileName,
        savedSize: saveResult.size,
        viewLink: saveResult.viewLink,
        downloadLink: saveResult.downloadLink,
        folderPath: saveResult.folderPath,
        description: saveResult.description,
        uploadTime: saveResult.uploadTime,
        savedAt: saveResult.savedAt
      },
      note: 'TC204要件完了: GoogleDriveサンプル動画取得→保存→共有リンク作成',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ TC204テストエラー:', error);
    
    return res.status(500).json({
      status: 'error',
      test: 'TC204-complete',
      message: 'VideoStorageService動画処理テスト失敗',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}

// TC205: End-to-End統合テスト（データ取得→要約→保存→Slack投稿）
async function runTC205Test(res) {
  const startTime = Date.now();
  console.log('🚀 TC205: End-to-End統合テスト開始', new Date().toISOString());
  
  // タイムアウトデバッグ用の時間追跡
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
  
  // 環境情報を確認
  const config = require('../1.src/config');
  timeTracker.log('環境情報確認完了');
  console.log('環境情報:', {
    NODE_ENV: process.env.NODE_ENV,
    disableSlackNotifications: config.development.disableSlackNotifications,
    logSlackInsteadOfSend: config.productionTest.logSlackInsteadOfSend,
    slackChannelId: config.slack.channelId ? 'SET' : 'NOT SET'
  });

  try {
    // Step 1: 全サービス初期化
    timeTracker.log('Step 1: 全サービス初期化開始');
    console.log('Step 1: 全サービス初期化');
    const sampleDataService = new SampleDataService();
    const audioSummaryService = new AudioSummaryService();
    const videoStorageService = new VideoStorageService();
    const slackService = new SlackService();
    
    timeTracker.log('Step 1: 全サービス初期化完了');
    console.log('✅ 全サービス初期化完了');

    // Step 2: TC202相当 - サンプルデータ取得（音声ファイル）
    timeTracker.log('Step 2: サンプルデータ取得開始');
    console.log('\n=== TC202相当: サンプルデータ取得 ===');
    const sampleBufferData = await sampleDataService.getSampleDataAsBuffer();
    timeTracker.log('Step 2: 音声データ取得完了');
    console.log('✅ 音声データ取得成功:', {
      fileName: sampleBufferData.fileName,
      size: `${(sampleBufferData.size / 1024).toFixed(2)} KB`,
      mimeType: sampleBufferData.mimeType
    });

    // 会議情報生成
    const meetingInfo = sampleDataService.generateSampleMeetingInfo(sampleBufferData.fileName);
    timeTracker.log('Step 2: 会議情報生成完了');
    console.log('✅ 会議情報生成成功:', meetingInfo.topic);

    // Step 3: TC203相当 - 8項目構造化要約（順次処理）
    timeTracker.log('Step 3: 音声要約処理開始');
    console.log('\n=== Step 3: 音声要約処理 ===');
    const analysisResult = await audioSummaryService.processAudioBuffer(
      sampleBufferData.audioBuffer, 
      sampleBufferData.fileName, 
      meetingInfo
    );
    
    timeTracker.log('Step 3: 音声要約処理完了');
    console.log('✅ 音声要約処理完了');
    console.log('   - 文字起こし文字数:', analysisResult.transcription.length);

    // Step 4: TC204相当 - 動画保存・共有リンク作成（順次処理）
    timeTracker.log('Step 4: 動画保存処理開始');
    console.log('\n=== Step 4: 動画保存処理 ===');
    const videoSaveResult = await videoStorageService.saveVideoToGoogleDrive(meetingInfo);
    
    timeTracker.log('Step 4: 動画保存処理完了');
    console.log('✅ 動画保存処理完了');
    console.log('   - 動画保存先:', videoSaveResult.folderPath);

    // Step 5: TC205新規 - Slack投稿
    timeTracker.log('Step 5: Slack投稿準備開始');
    console.log('\n=== TC205: Slack構造化投稿 ===');
    
    // SlackServiceが期待する形式にデータを整形
    const slackAnalysisResult = {
      meetingInfo: meetingInfo,
      summary: analysisResult.structuredSummary,
      transcription: analysisResult.transcription,
      participants: analysisResult.structuredSummary.attendees || [],
      actionItems: analysisResult.structuredSummary.nextActions || [],
      decisions: analysisResult.structuredSummary.decisions || []
    };

    timeTracker.log('Step 5: Slack投稿実行開始');
    // Slack投稿実行（TC006成功版のsendMeetingSummaryメソッドを使用）
    const slackResult = await slackService.sendMeetingSummary(slackAnalysisResult);
    timeTracker.log('Step 5: Slack投稿完了');
    console.log('✅ Slack投稿成功');
    console.log('   - チャンネル:', slackResult.channel);
    console.log('   - タイムスタンプ:', slackResult.ts);

    // 完全な統合結果を返す
    timeTracker.log('TC205完了 - レスポンス生成');
    const totalExecutionTime = Date.now() - startTime;
    
    return res.status(200).json({
      status: 'success',
      test: 'TC205-complete',
      message: 'End-to-End統合テスト成功',
      executionTiming: {
        totalTime: `${totalExecutionTime}ms`,
        steps: timeTracker.steps,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString()
      },
      workflow: {
        step1_dataFetch: {
          fileName: sampleBufferData.fileName,
          size: sampleBufferData.size,
          mimeType: sampleBufferData.mimeType
        },
        step2_summary: {
          transcriptionLength: analysisResult.transcription.length,
          summaryItems: Object.keys(analysisResult.structuredSummary),
          clientName: analysisResult.structuredSummary.clientName,
          nextActions: analysisResult.structuredSummary.nextActions
        },
        step3_storage: {
          fileId: videoSaveResult.fileId,
          fileName: videoSaveResult.fileName,
          viewLink: videoSaveResult.viewLink,
          downloadLink: videoSaveResult.downloadLink,
          folderPath: videoSaveResult.folderPath
        },
        step4_slack: {
          channel: slackResult.channel || config.slack.channelId,
          messageId: slackResult.ts,
          threadId: slackResult.thread_ts || null,
          posted: true,
          method: 'sendMeetingSummary',
          videoLinkIncluded: false,
          note: '順次処理版（音声要約→動画保存→Slack投稿）'
        }
      },
      note: 'TC205完了: データ取得→音声要約→動画保存→Slack投稿の順次処理統合フロー成功',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    timeTracker.log('TC205エラー発生');
    console.error('❌ TC205 End-to-Endテストエラー:', error);
    
    // エラー箇所の特定
    let failedStep = 'unknown';
    if (error.message.includes('Sample')) failedStep = 'data_fetch';
    else if (error.message.includes('transcription') || error.message.includes('summary')) failedStep = 'summary';
    else if (error.message.includes('Drive') || error.message.includes('folder')) failedStep = 'storage';
    else if (error.message.includes('Slack') || error.message.includes('channel')) failedStep = 'slack';
    
    const errorTime = Date.now() - startTime;
    
    return res.status(500).json({
      status: 'error',
      test: 'TC205-complete',
      message: 'End-to-End統合テスト失敗',
      failedStep: failedStep,
      error: error.message,
      stack: error.stack,
      executionTiming: {
        errorOccurredAt: `${errorTime}ms`,
        completedSteps: timeTracker.steps,
        startTime: new Date(startTime).toISOString(),
        errorTime: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }
}

// TC205a: 環境確認テスト
async function runTC205aTest(res) {
  console.log('🔍 TC205a: 環境確認テスト');
  
  const config = require('../1.src/config');
  const envInfo = {
    NODE_ENV: process.env.NODE_ENV,
    disableSlackNotifications: config.development.disableSlackNotifications,
    logSlackInsteadOfSend: config.productionTest.logSlackInsteadOfSend,
    slackChannelId: config.slack.channelId ? 'SET' : 'NOT SET',
    slackBotToken: config.slack.botToken ? 'SET' : 'NOT SET'
  };
  
  console.log('環境情報:', envInfo);
  
  return res.status(200).json({
    status: 'success',
    test: 'TC205a-environment-check',
    environment: envInfo,
    expectedSlackBehavior: !config.development.disableSlackNotifications && !config.productionTest.logSlackInsteadOfSend 
      ? 'WILL_POST_TO_SLACK' 
      : 'WILL_NOT_POST_TO_SLACK',
    timestamp: new Date().toISOString()
  });
}

// TC205b: Slack投稿のみテスト
async function runTC205bTest(res) {
  console.log('📤 TC205b: Slack投稿のみテスト');
  
  const config = require('../1.src/config');
  const SlackService = require('../1.src/services/slackService');
  
  try {
    const slackService = new SlackService();
    
    // 最小限のテストデータ
    const testData = {
      meetingInfo: {
        topic: 'TC205b テスト投稿',
        startTime: new Date().toISOString(),
        duration: 5,
        hostName: 'Test User'
      },
      summary: 'TC205b Slack投稿テストです',
      participants: [],
      actionItems: [],
      decisions: []
    };

    console.log('Slack投稿実行中...');
    const result = await slackService.sendMeetingSummary(testData);
    console.log('Slack投稿完了');
    
    return res.status(200).json({
      status: 'success',
      test: 'TC205b-slack-only',
      slackResult: {
        ts: result.ts,
        channel: result.channel,
        posted: true
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Slack投稿エラー:', error.message);
    return res.status(500).json({
      status: 'error',
      test: 'TC205b-slack-only',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}