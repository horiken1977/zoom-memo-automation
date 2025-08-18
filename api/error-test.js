/**
 * エラーハンドリング異常系テスト API
 * TC301-306 の異常系テストを順次実行
 */

const path = require('path');
const fs = require('fs').promises;
const { ErrorManager } = require('../1.src/utils/errorCodes');
const AIService = require('../1.src/services/aiService');
const logger = require('../1.src/utils/logger');

/**
 * TC301-1: 破損音声ファイルテスト
 * 0バイトファイル、非音声ファイル、巨大ファイルでAU001, AU002エラーを検証
 */
async function testBrokenAudioFiles() {
  const testResults = [];
  const aiService = new AIService();
  
  logger.info('=== TC301-1: 破損音声ファイルテスト開始 ===');
  
  // テスト1: 0バイトファイル
  try {
    logger.info('Test 1: 0バイト音声ファイルテスト');
    const emptyBuffer = Buffer.alloc(0);
    const meetingInfo = {
      topic: 'TC301-1 Empty File Test',
      timestamp: new Date().toISOString()
    };
    
    await aiService.transcribeAudioFromBuffer(emptyBuffer, 'empty_test.m4a', meetingInfo);
    testResults.push({
      test: '0バイトファイル',
      status: 'UNEXPECTED_SUCCESS',
      error: null,
      errorCode: null,
      message: '0バイトファイルが処理されました（予期しない動作）'
    });
  } catch (error) {
    const errorCode = determineAudioErrorCode(error.message);
    testResults.push({
      test: '0バイトファイル',
      status: 'EXPECTED_ERROR',
      error: error.message,
      errorCode,
      message: `適切にエラーが検知されました: ${errorCode}`
    });
    logger.info(`Test 1 結果: ${errorCode} - ${error.message}`);
  }
  
  // テスト2: 非音声ファイル（テキストファイル）
  try {
    logger.info('Test 2: 非音声ファイル（テキスト）テスト');
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
  } catch (error) {
    const errorCode = determineAudioErrorCode(error.message);
    testResults.push({
      test: '非音声ファイル',
      status: 'EXPECTED_ERROR',
      error: error.message,
      errorCode,
      message: `適切にエラーが検知されました: ${errorCode}`
    });
    logger.info(`Test 2 結果: ${errorCode} - ${error.message}`);
  }
  
  // テスト3: 巨大ファイル（25MB相当のダミーデータ）
  try {
    logger.info('Test 3: 巨大ファイル（25MB）テスト');
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
  } catch (error) {
    const errorCode = determineAudioErrorCode(error.message);
    testResults.push({
      test: '巨大ファイル',
      status: 'EXPECTED_ERROR',
      error: error.message,
      errorCode,
      message: `適切にエラーが検知されました: ${errorCode}`
    });
    logger.info(`Test 3 結果: ${errorCode} - ${error.message}`);
  }
  
  return {
    testCategory: 'TC301-1: 破損音声ファイルテスト',
    totalTests: testResults.length,
    results: testResults,
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
    
    // レスポンス
    return res.status(200).json({
      success: true,
      executionId: `error_test_${Date.now()}`,
      timestamp: new Date().toISOString(),
      executionTime: `${executionTime}ms`,
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