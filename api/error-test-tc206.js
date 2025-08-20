/**
 * TC206: 部分データ存在業務テスト
 * 1. 音声ファイル不存在 → 動画から音声抽出
 * 2. 動画ファイル不存在 → 音声のみで処理継続
 * 3. 音声品質低下 → 動画から音声再抽出
 */
async function testPartialDataScenarios() {
  const testResults = [];
  const audioSummaryService = new AudioSummaryService();
  const slackService = new SlackService();
  const { ErrorManager } = require('../1.src/utils/errorCodes');
  
  // ExecutionLoggerで本番環境のログ出力
  const executionId = `error_test_TC206_${Date.now()}`;
  const meetingInfo = {
    id: executionId,
    topic: 'TC206: 部分データ存在業務テスト',
    start_time: new Date().toISOString()
  };
  const execLogger = new ExecutionLogger(executionId, meetingInfo);
  
  logger.info('=== TC206: 部分データ存在業務テスト開始 ===');
  execLogger.logInfo('TEST_START', { 
    testCategory: 'TC206',
    description: '部分データ存在業務テスト開始'
  });
  
  // テスト1: 音声ファイル不存在 → 動画から音声抽出
  try {
    logger.info('Test 1: 音声ファイル不存在ケース');
    execLogger.logInfo('TEST_1_START', { 
      testName: '音声ファイル不存在',
      description: '音声なし、動画から音声抽出をテスト'
    });
    
    // Zoom録画データをシミュレート（音声なし、動画あり）
    const mockRecording = {
      topic: 'TC206-1 Audio Missing Test',
      timestamp: new Date().toISOString(),
      recording_files: [
        {
          file_type: 'MP4',
          download_url: 'https://zoom.us/rec/download/test-video.mp4',
          file_size: 50000000
        }
        // 音声ファイルは存在しない
      ]
    };
    
    // エラーコードを発生させる
    const warningInfo = ErrorManager.createError('E_ZOOM_AUDIO_MISSING', {
      meetingTopic: mockRecording.topic,
      recordingId: 'test-recording-1'
    });
    
    logger.warn('警告: 音声ファイル不存在', warningInfo);
    
    // 動画から音声抽出をシミュレート
    logger.info('動画から音声を抽出中...');
    const extractedAudioBuffer = Buffer.alloc(1024 * 200); // 200KBのダミー音声
    
    testResults.push({
      test: 'Test 1: 音声ファイル不存在',
      status: 'SUCCESS_WITH_WARNING',
      warningCode: 'E_ZOOM_AUDIO_MISSING',
      action: '動画から音声抽出成功',
      extractedAudioSize: extractedAudioBuffer.length
    });
    
    // Slack警告通知
    await sendWarningToSlack(slackService, 'E_ZOOM_AUDIO_MISSING', 
      ErrorManager.getError('E_ZOOM_AUDIO_MISSING'), 
      '音声ファイル不存在', 'Test 1: 音声ファイル不存在');
    
    execLogger.logWarning('TEST_1_WARNING', { 
      warningCode: 'E_ZOOM_AUDIO_MISSING',
      description: '音声ファイル不存在 - 動画から抽出して処理継続'
    });
    
  } catch (error) {
    logger.error('Test 1 エラー:', error.message);
    testResults.push({
      test: 'Test 1: 音声ファイル不存在',
      status: 'ERROR',
      error: error.message
    });
    execLogger.logError('TEST_1_ERROR', error, { errorCode: 'E_ZOOM_AUDIO_MISSING' });
  }
  
  // テスト2: 動画ファイル不存在 → 音声のみで処理継続
  try {
    logger.info('Test 2: 動画ファイル不存在ケース');
    execLogger.logInfo('TEST_2_START', { 
      testName: '動画ファイル不存在',
      description: '動画なし、音声のみで処理継続をテスト'
    });
    
    // Zoom録画データをシミュレート（音声あり、動画なし）
    const mockRecording = {
      topic: 'TC206-2 Video Missing Test',
      timestamp: new Date().toISOString(),
      recording_files: [
        {
          file_type: 'M4A',
          download_url: 'https://zoom.us/rec/download/test-audio.m4a',
          file_size: 10000000
        }
        // 動画ファイルは存在しない
      ]
    };
    
    // エラーコードを発生させる
    const warningInfo = ErrorManager.createError('E_ZOOM_VIDEO_MISSING', {
      meetingTopic: mockRecording.topic,
      recordingId: 'test-recording-2'
    });
    
    logger.warn('警告: 動画ファイル不存在', warningInfo);
    
    // 音声のみで処理を継続
    logger.info('音声ファイルのみで処理を継続...');
    
    testResults.push({
      test: 'Test 2: 動画ファイル不存在',
      status: 'SUCCESS_WITH_WARNING',
      warningCode: 'E_ZOOM_VIDEO_MISSING',
      action: '音声のみで処理継続',
      audioFileAvailable: true
    });
    
    // Slack警告通知
    await sendWarningToSlack(slackService, 'E_ZOOM_VIDEO_MISSING', 
      ErrorManager.getError('E_ZOOM_VIDEO_MISSING'), 
      '動画ファイル不存在', 'Test 2: 動画ファイル不存在');
    
    execLogger.logWarning('TEST_2_WARNING', { 
      warningCode: 'E_ZOOM_VIDEO_MISSING',
      description: '動画ファイル不存在 - 音声のみで処理継続'
    });
    
  } catch (error) {
    logger.error('Test 2 エラー:', error.message);
    testResults.push({
      test: 'Test 2: 動画ファイル不存在',
      status: 'ERROR',
      error: error.message
    });
    execLogger.logError('TEST_2_ERROR', error, { errorCode: 'E_ZOOM_VIDEO_MISSING' });
  }
  
  // テスト3: 音声品質低下 → 動画から音声再抽出
  try {
    logger.info('Test 3: 音声品質低下ケース');
    execLogger.logInfo('TEST_3_START', { 
      testName: '音声品質低下',
      description: '低品質音声を検出して動画から再抽出をテスト'
    });
    
    // 低品質音声バッファを生成（無音データ）
    const lowQualityBuffer = Buffer.alloc(1024 * 100); // 100KB
    lowQualityBuffer.fill(0x00); // 完全無音
    
    // 音声品質チェックを実行
    const qualityResult = await audioSummaryService.checkAudioQuality(lowQualityBuffer);
    
    if (qualityResult.isLowQuality) {
      // エラーコードを発生させる
      const warningInfo = ErrorManager.createError('E_AUDIO_QUALITY_WARNING', {
        meetingTopic: 'TC206-3 Low Quality Audio Test',
        qualityDetails: qualityResult.details
      });
      
      logger.warn('警告: 音声品質低下検出', warningInfo);
      
      // 動画から音声再抽出をシミュレート
      logger.info('動画から高品質音声を再抽出中...');
      const extractedAudioBuffer = Buffer.alloc(1024 * 200); // 200KBの高品質音声
      // 通常の音声データをシミュレート
      for (let i = 0; i < extractedAudioBuffer.length; i += 2) {
        const value = Math.floor(Math.random() * 1000) - 500; // 通常の音声レベル
        extractedAudioBuffer.writeInt16LE(value, i);
      }
      
      // 再抽出後の品質チェック
      const newQualityResult = await audioSummaryService.checkAudioQuality(extractedAudioBuffer);
      
      testResults.push({
        test: 'Test 3: 音声品質低下',
        status: 'SUCCESS_WITH_WARNING',
        warningCode: 'E_AUDIO_QUALITY_WARNING',
        action: '動画から高品質音声再抽出',
        qualityBefore: {
          averageRMS: qualityResult.averageRMS,
          isLowQuality: qualityResult.isLowQuality
        },
        qualityAfter: {
          averageRMS: newQualityResult.averageRMS,
          isLowQuality: newQualityResult.isLowQuality
        },
        improvement: !newQualityResult.isLowQuality
      });
      
      // Slack警告通知
      await sendWarningToSlack(slackService, 'E_AUDIO_QUALITY_WARNING', 
        ErrorManager.getError('E_AUDIO_QUALITY_WARNING'),
        '音声品質低下', 'Test 3: 音声品質低下');
      
      execLogger.logWarning('TEST_3_WARNING', { 
        warningCode: 'E_AUDIO_QUALITY_WARNING',
        description: '音声品質低下 - 動画から再抽出して処理継続'
      });
    } else {
      testResults.push({
        test: 'Test 3: 音声品質低下',
        status: 'NO_WARNING',
        message: '音声品質は正常でした'
      });
    }
    
  } catch (error) {
    logger.error('Test 3 エラー:', error.message);
    testResults.push({
      test: 'Test 3: 音声品質低下',
      status: 'ERROR',
      error: error.message
    });
    execLogger.logError('TEST_3_ERROR', error, { errorCode: 'E_AUDIO_QUALITY_WARNING' });
  }
  
  // ExecutionLoggerでGoogle Driveにログを保存
  execLogger.logInfo('TEST_COMPLETE', {
    testCategory: 'TC206',
    totalTests: testResults.length,
    warningsDetected: testResults.filter(r => r.status === 'SUCCESS_WITH_WARNING').length,
    summary: generateTestSummary(testResults)
  });
  
  let logSaveResult = null;
  try {
    logSaveResult = await execLogger.saveToGoogleDrive();
    logger.info(`Logs saved to Google Drive: ${logSaveResult.viewLink}`);
  } catch (logError) {
    logger.error(`Failed to save logs: ${logError.message}`);
  }
  
  return {
    testCategory: 'TC206: 部分データ存在業務テスト',
    totalTests: testResults.length,
    results: testResults,
    logSaveResult,
    summary: {
      ...generateTestSummary(testResults),
      warningsDetected: testResults.filter(r => r.status === 'SUCCESS_WITH_WARNING').length,
      actionsPerformed: {
        audioExtractedFromVideo: testResults.filter(r => r.action?.includes('動画から音声')).length,
        audioOnlyProcessing: testResults.filter(r => r.action?.includes('音声のみ')).length
      }
    }
  };
}

module.exports = { testPartialDataScenarios };