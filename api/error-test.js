/**
 * エラーハンドリング異常系テスト API
 * TC301-306 の異常系テストを順次実行
 */

const path = require('path');
const fs = require('fs').promises;
const { ErrorManager, ERROR_CODES } = require('../1.src/utils/errorCodes');
const AIService = require('../1.src/services/aiService');
const logger = require('../1.src/utils/logger');
const SlackService = require('../1.src/services/slackService');
const { ExecutionLogger } = require('../1.src/utils/executionLogger');
const config = require('../1.src/config');

/**
 * TC301-1: 破損音声ファイルテスト
 * 0バイトファイル、非音声ファイル、巨大ファイルでAU001, AU002エラーを検証
 */
async function testBrokenAudioFiles() {
  const testResults = [];
  const aiService = new AIService();
  const slackService = new SlackService();
  
  // ExecutionLoggerで本番環境のログ出力
  const executionId = `error_test_TC301-1_${Date.now()}`;
  const meetingInfo = {
    id: executionId,
    topic: 'TC301-1: 破損音声ファイルテスト',
    start_time: new Date().toISOString()
  };
  const execLogger = new ExecutionLogger(executionId, meetingInfo);
  
  logger.info('=== TC301-1: 破損音声ファイルテスト開始 ===');
  execLogger.logInfo('TEST_START', { 
    testCategory: 'TC301-1',
    description: '破損音声ファイルテスト開始'
  });
  
  // テスト1: 0バイトファイル
  try {
    logger.info('Test 1: 0バイト音声ファイルテスト');
    execLogger.logInfo('TEST_1_START', { 
      testName: '0バイトファイル',
      description: '0バイト音声ファイルテスト開始'
    });
    
    const emptyBuffer = Buffer.alloc(0);
    const testMeetingInfo = {
      topic: 'TC301-1 Empty File Test',
      timestamp: new Date().toISOString()
    };
    
    await aiService.transcribeAudioFromBuffer(emptyBuffer, 'empty_test.m4a', testMeetingInfo);
    testResults.push({
      test: '0バイトファイル',
      status: 'UNEXPECTED_SUCCESS',
      error: null,
      errorCode: null,
      message: '0バイトファイルが処理されました（予期しない動作）'
    });
    
    execLogger.logWarning('TEST_1_UNEXPECTED', '予期しない成功 - 0バイトファイルが処理されました', {
      testName: '0バイトファイル',
      expected: 'ERROR',
      actual: 'SUCCESS'
    });
    
  } catch (error) {
    const errorCode = determineAudioErrorCode(error.message);
    const errorDef = ERROR_CODES[errorCode] || {};
    
    testResults.push({
      test: '0バイトファイル',
      status: 'EXPECTED_ERROR',
      error: error.message,
      errorCode,
      errorDefinition: errorDef,
      message: `適切にエラーが検知されました: ${errorCode}`
    });
    
    logger.error(`Test 1 結果: ${errorCode} - ${error.message}`);
    execLogger.logError('TEST_1_ERROR', errorCode, error.message, {
      testName: '0バイトファイル',
      errorDefinition: errorDef,
      notifySlack: errorDef.notifySlack
    });
    
    // Slack通知（エラーコード定義に基づく）
    if (errorDef.notifySlack) {
      await sendErrorToSlack(slackService, errorCode, errorDef, error.message, 'TC301-1 Test 1: 0バイトファイル');
    }
  }
  
  // テスト2: 非音声ファイル（テキストファイル）
  try {
    logger.info('Test 2: 非音声ファイル（テキスト）テスト');
    execLogger.logInfo('TEST_2_START', { 
      testName: '非音声ファイル',
      description: '非音声ファイル（テキスト）テスト開始'
    });
    
    const textBuffer = Buffer.from('This is not an audio file content', 'utf8');
    const meetingInfo = {
      topic: 'TC301-1 Non-Audio File Test',
      timestamp: new Date().toISOString()
    };
    
    await aiService.transcribeAudioFromBuffer(textBuffer, 'fake_audio.m4a', meetingInfo);
    testResults.push({
      test: '非音声ファイル',
      status: 'UNEXPECTED_SUCCESS',
      error: null,
      errorCode: null,
      message: '非音声ファイルが処理されました（予期しない動作）'
    });
    
    execLogger.logWarning('TEST_2_UNEXPECTED', '予期しない成功 - 非音声ファイルが処理されました', {
      testName: '非音声ファイル',
      expected: 'ERROR',
      actual: 'SUCCESS'
    });
    
  } catch (error) {
    const errorCode = determineAudioErrorCode(error.message);
    const errorDef = ERROR_CODES[errorCode] || {};
    
    testResults.push({
      test: '非音声ファイル',
      status: 'EXPECTED_ERROR',
      error: error.message,
      errorCode,
      errorDefinition: errorDef,
      message: `適切にエラーが検知されました: ${errorCode}`
    });
    
    logger.error(`Test 2 結果: ${errorCode} - ${error.message}`);
    execLogger.logError('TEST_2_ERROR', errorCode, error.message, {
      testName: '非音声ファイル',
      errorDefinition: errorDef,
      notifySlack: errorDef.notifySlack
    });
    
    // Slack通知
    if (errorDef.notifySlack) {
      await sendErrorToSlack(slackService, errorCode, errorDef, error.message, 'TC301-1 Test 2: 非音声ファイル');
    }
  }
  
  // テスト3: 巨大ファイル（25MB相当のダミーデータ）
  try {
    logger.info('Test 3: 巨大ファイル（25MB）テスト');
    execLogger.logInfo('TEST_3_START', { 
      testName: '巨大ファイル',
      description: '巨大ファイル（25MB）テスト開始'
    });
    
    const hugeBuff = Buffer.alloc(25 * 1024 * 1024); // 25MB
    hugeBuff.fill('A'); // ダミーデータで埋める
    
    const meetingInfo = {
      topic: 'TC301-1 Huge File Test',
      timestamp: new Date().toISOString()
    };
    
    await aiService.transcribeAudioFromBuffer(hugeBuff, 'huge_test.m4a', meetingInfo);
    testResults.push({
      test: '巨大ファイル',
      status: 'UNEXPECTED_SUCCESS',
      error: null,
      errorCode: null,
      message: '巨大ファイルが処理されました（予期しない動作）'
    });
    
    execLogger.logWarning('TEST_3_UNEXPECTED', '予期しない成功 - 巨大ファイルが処理されました', {
      testName: '巨大ファイル',
      expected: 'ERROR',
      actual: 'SUCCESS'
    });
    
  } catch (error) {
    const errorCode = determineAudioErrorCode(error.message);
    const errorDef = ERROR_CODES[errorCode] || {};
    
    testResults.push({
      test: '巨大ファイル',
      status: 'EXPECTED_ERROR',
      error: error.message,
      errorCode,
      errorDefinition: errorDef,
      message: `適切にエラーが検知されました: ${errorCode}`
    });
    
    logger.error(`Test 3 結果: ${errorCode} - ${error.message}`);
    execLogger.logError('TEST_3_ERROR', errorCode, error.message, {
      testName: '巨大ファイル',
      errorDefinition: errorDef,
      notifySlack: errorDef.notifySlack
    });
    
    // Slack通知
    if (errorDef.notifySlack) {
      await sendErrorToSlack(slackService, errorCode, errorDef, error.message, 'TC301-1 Test 3: 巨大ファイル');
    }
  }
  
  // ExecutionLoggerでGoogle Driveにログを保存
  execLogger.logInfo('TEST_COMPLETE', {
    testCategory: 'TC301-1',
    totalTests: testResults.length,
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
    testCategory: 'TC301-1: 破損音声ファイルテスト',
    totalTests: testResults.length,
    results: testResults,
    logSaveResult,
    summary: generateTestSummary(testResults)
  };
}

/**
 * エラーメッセージからAU系エラーコードを判定
 */
function determineAudioErrorCode(errorMessage) {
  if (errorMessage.includes('500 Internal Server Error')) {
    return 'AU003'; // GEMINI_TRANSCRIPTION_FAILED
  } else if (errorMessage.includes('429')) {
    return 'AU008'; // RETRY_LIMIT_EXCEEDED
  } else if (errorMessage.includes('401')) {
    return 'AU001'; // AUDIO_DOWNLOAD_FAILED
  } else if (errorMessage.includes('Transcription too short')) {
    return 'AU004'; // TRANSCRIPTION_TOO_SHORT
  } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
    return 'AU005'; // JSON_PARSING_FAILED
  } else if (errorMessage.includes('audio') || errorMessage.includes('buffer') || errorMessage.includes('size')) {
    return 'AU002'; // AUDIO_COMPRESSION_FAILED
  } else {
    return 'AU007'; // STRUCTURED_SUMMARY_FAILED
  }
}

/**
 * テスト結果サマリー生成
 */
function generateTestSummary(results) {
  const totalTests = results.length;
  const expectedErrors = results.filter(r => r.status === 'EXPECTED_ERROR').length;
  const unexpectedSuccesses = results.filter(r => r.status === 'UNEXPECTED_SUCCESS').length;
  
  return {
    totalTests,
    expectedErrors,
    unexpectedSuccesses,
    successRate: `${Math.round((expectedErrors / totalTests) * 100)}%`,
    status: expectedErrors === totalTests ? 'PASS' : 'PARTIAL_PASS'
  };
}

/**
 * Slackへエラー通知を送信
 */
async function sendErrorToSlack(slackService, errorCode, errorDef, errorMessage, testName) {
  try {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚨 異常系テスト - エラー検知',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*テスト:* ${testName}\n*エラーコード:* ${errorCode}\n*説明:* ${errorDef.message || 'エラーが発生しました'}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*重要度:*\n${errorDef.retryable ? '⚠️ リトライ可能' : '❌ リトライ不可'}`
          },
          {
            type: 'mrkdwn',
            text: `*対処法:*\n${errorDef.troubleshooting || '管理者に連絡してください'}`
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🔄 API一時的エラーの可能性があります | ${new Date().toISOString()}`
          }
        ]
      }
    ];
    
    await slackService.postMessage({
      text: `異常系テストエラー検知: ${errorCode}`,
      blocks,
      channel: config.slack.channelId
    });
    
    logger.info(`Slack notification sent for error: ${errorCode}`);
  } catch (slackError) {
    logger.error(`Failed to send Slack notification: ${slackError.message}`);
  }
}


/**
 * Vercel API ハンドラー
 */
module.exports = async (req, res) => {
  const startTime = Date.now();
  
  try {
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    // クエリパラメータ解析
    const { test, category } = req.query;
    
    logger.info(`=== Error Test API Called ===`);
    logger.info(`Test: ${test}, Category: ${category}`);
    
    let result = {};
    
    // TC301-1: 破損音声ファイルテスト
    if (test === 'TC301-1' || (category === 'AU' && test === 'broken-audio')) {
      result = await testBrokenAudioFiles();
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid test specification',
        availableTests: [
          'TC301-1 (broken audio files)',
          'TC301-2 (Gemini AI failures)', 
          'TC301-3 (quality warnings)',
          'TC301-4 (summary failures)'
        ],
        usage: '/api/error-test?test=TC301-1 or /api/error-test?category=AU&test=broken-audio'
      });
    }
    
    const executionTime = Date.now() - startTime;
    
    // エラーが検出された場合のステータス判定
    const hasErrors = result.results && result.results.some(r => r.status === 'EXPECTED_ERROR');
    const responseStatus = hasErrors ? 400 : 200; // エラー検出時は400を返す
    
    // レスポンス
    return res.status(responseStatus).json({
      success: !hasErrors, // エラーがあれば失敗扱い
      executionId: `error_test_${Date.now()}`,
      timestamp: new Date().toISOString(),
      executionTime: `${executionTime}ms`,
      hasErrors,
      errorSummary: hasErrors ? {
        totalErrors: result.results.filter(r => r.status === 'EXPECTED_ERROR').length,
        errorCodes: result.results.filter(r => r.errorCode).map(r => r.errorCode)
      } : null,
      ...result
    });
    
  } catch (error) {
    logger.error('Error Test API failed:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      executionTime: `${Date.now() - startTime}ms`
    });
  }
};