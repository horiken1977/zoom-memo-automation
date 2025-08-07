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
  
  if (testCase === 'TC204') {
    return await runTC204Test(res);
  } else if (testCase === 'TC205') {
    return await runTC205Test(res);
  } else {
    return await runTC203Test(res);
  }
};

// TC203: 8項目構造化要約テスト（メモリバッファ処理）
async function runTC203Test(res) {
  console.log('🧪 TC203: 8項目構造化要約テスト（メモリバッファ処理）開始');

  try {
    // Step 1: サービス初期化
    console.log('Step 1: SampleDataService初期化');
    const sampleDataService = new SampleDataService();
    
    console.log('Step 1b: AudioSummaryService初期化');
    const audioSummaryService = new AudioSummaryService();

    // Step 2: Google Driveから音声データを直接Bufferとして取得（メモリ処理）
    console.log('Step 2: getSampleDataAsBuffer()実行（メモリバッファ処理）');
    const sampleBufferData = await sampleDataService.getSampleDataAsBuffer();
    console.log('✅ サンプルバッファ取得成功:', {
      fileName: sampleBufferData.fileName,
      size: `${(sampleBufferData.size / 1024).toFixed(2)} KB`,
      mimeType: sampleBufferData.mimeType
    });

    // Step 3: サンプル会議情報生成
    console.log('Step 3: サンプル会議情報生成');
    const meetingInfo = sampleDataService.generateSampleMeetingInfo(sampleBufferData.fileName);
    console.log('✅ サンプル会議情報生成成功:', meetingInfo);

    // Step 4: AudioSummaryServiceでBuffer処理＋8項目構造化要約（ファイル作成なし）
    console.log('Step 4: 8項目構造化要約処理開始（メモリバッファ処理）');
    const analysisResult = await audioSummaryService.processAudioBuffer(
      sampleBufferData.audioBuffer, 
      sampleBufferData.fileName, 
      meetingInfo
    );
    console.log('✅ 8項目構造化要約処理成功');

    return res.status(200).json({
      status: 'success',
      test: 'TC203-complete',
      message: '8項目構造化要約テスト成功（メモリバッファ処理）',
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
    console.error('❌ TC203テストエラー:', error);
    
    return res.status(500).json({
      status: 'error',
      test: 'TC203-complete',
      message: '8項目構造化要約テスト失敗（メモリバッファ処理）',
      error: error.message,
      stack: error.stack,
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
  console.log('🚀 TC205: End-to-End統合テスト開始');

  try {
    // Step 1: 全サービス初期化
    console.log('Step 1: 全サービス初期化');
    const sampleDataService = new SampleDataService();
    const audioSummaryService = new AudioSummaryService();
    const videoStorageService = new VideoStorageService();
    const slackService = new SlackService();
    
    console.log('✅ 全サービス初期化完了');

    // Step 2: TC202相当 - サンプルデータ取得（音声ファイル）
    console.log('\n=== TC202相当: サンプルデータ取得 ===');
    const sampleBufferData = await sampleDataService.getSampleDataAsBuffer();
    console.log('✅ 音声データ取得成功:', {
      fileName: sampleBufferData.fileName,
      size: `${(sampleBufferData.size / 1024).toFixed(2)} KB`,
      mimeType: sampleBufferData.mimeType
    });

    // 会議情報生成
    const meetingInfo = sampleDataService.generateSampleMeetingInfo(sampleBufferData.fileName);
    console.log('✅ 会議情報生成成功:', meetingInfo.topic);

    // Step 3: TC203相当 - 8項目構造化要約
    console.log('\n=== TC203相当: 8項目構造化要約 ===');
    const analysisResult = await audioSummaryService.processAudioBuffer(
      sampleBufferData.audioBuffer, 
      sampleBufferData.fileName, 
      meetingInfo
    );
    console.log('✅ 8項目構造化要約成功');
    console.log('   - 文字起こし文字数:', analysisResult.transcription.length);
    console.log('   - 要約項目数:', Object.keys(analysisResult.structuredSummary).length);

    // Step 4: TC204相当 - 動画保存・共有リンク作成
    console.log('\n=== TC204相当: 動画保存・共有リンク作成 ===');
    const videoSaveResult = await videoStorageService.saveVideoToGoogleDrive(meetingInfo);
    console.log('✅ 動画保存・共有リンク作成成功');
    console.log('   - 保存先:', videoSaveResult.folderPath);
    console.log('   - ファイルID:', videoSaveResult.fileId);

    // Step 5: TC205新規 - Slack投稿
    console.log('\n=== TC205: Slack構造化投稿 ===');
    
    // 要約とリンクを統合したメッセージ作成
    const slackMessage = {
      meetingInfo: meetingInfo,
      summary: analysisResult.structuredSummary,
      transcription: analysisResult.transcription,
      videoLink: videoSaveResult.viewLink,
      downloadLink: videoSaveResult.downloadLink,
      folderPath: videoSaveResult.folderPath
    };

    // Slack投稿実行
    const slackResult = await slackService.postMeetingSummary(slackMessage);
    console.log('✅ Slack投稿成功');
    console.log('   - チャンネル:', slackResult.channel);
    console.log('   - タイムスタンプ:', slackResult.ts);

    // 完全な統合結果を返す
    return res.status(200).json({
      status: 'success',
      test: 'TC205-complete',
      message: 'End-to-End統合テスト成功',
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
          channel: slackResult.channel,
          messageId: slackResult.ts,
          threadId: slackResult.thread_ts,
          posted: true
        }
      },
      note: 'TC205完了: データ取得→要約→保存→Slack投稿の完全統合フロー成功',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ TC205 End-to-Endテストエラー:', error);
    
    // エラー箇所の特定
    let failedStep = 'unknown';
    if (error.message.includes('Sample')) failedStep = 'data_fetch';
    else if (error.message.includes('transcription') || error.message.includes('summary')) failedStep = 'summary';
    else if (error.message.includes('Drive') || error.message.includes('folder')) failedStep = 'storage';
    else if (error.message.includes('Slack') || error.message.includes('channel')) failedStep = 'slack';
    
    return res.status(500).json({
      status: 'error',
      test: 'TC205-complete',
      message: 'End-to-End統合テスト失敗',
      failedStep: failedStep,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}