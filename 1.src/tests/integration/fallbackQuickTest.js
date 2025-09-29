#!/usr/bin/env node

/**
 * Phase 3 フォールバック機構簡易テスト
 * 
 * 実際のAPIにアクセスせずに統合確認のみ実施
 */

const fs = require('fs');
const path = require('path');

// 環境変数の読み込み
require('dotenv').config({ path: path.join(__dirname, '../../..', '.env.local') });

/**
 * 簡易テスト実行
 */
async function runQuickFallbackTest() {
  console.log('🧪 Phase 3 フォールバック機構簡易テスト開始');
  
  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };
  
  function addTestResult(testName, passed, details = null) {
    if (passed) {
      results.passed++;
      console.log(`✅ テスト成功: ${testName}`);
      if (details) console.log('   詳細:', JSON.stringify(details, null, 2));
    } else {
      results.failed++;
      results.errors.push({ testName, details });
      console.log(`❌ テスト失敗: ${testName}`);
      if (details) console.log('   エラー:', JSON.stringify(details, null, 2));
    }
  }
  
  try {
    // ===============================================
    // テスト1: ZoomRecordingService読み込み確認
    // ===============================================
    console.log('🔍 テスト1: ZoomRecordingService読み込み確認');
    
    try {
      const ZoomRecordingService = require('../../services/zoomRecordingService');
      const hasProcessRecording = typeof ZoomRecordingService.prototype.processRecording === 'function';
      const hasTryTranscriptProcessing = typeof ZoomRecordingService.prototype.tryTranscriptProcessing === 'function';
      
      addTestResult('ZoomRecordingService読み込み', hasProcessRecording && hasTryTranscriptProcessing, {
        hasProcessRecording,
        hasTryTranscriptProcessing
      });
      
    } catch (error) {
      addTestResult('ZoomRecordingService読み込み', false, {
        error: error.message
      });
    }
    
    // ===============================================
    // テスト2: TranscriptService読み込み確認
    // ===============================================
    console.log('🔍 テスト2: TranscriptService読み込み確認');
    
    try {
      const TranscriptService = require('../../services/transcriptService');
      const hasProcessTranscript = typeof TranscriptService.prototype.processTranscript === 'function';
      const hasParseVTTFile = typeof TranscriptService.prototype.parseVTTFile === 'function';
      
      addTestResult('TranscriptService読み込み', hasProcessTranscript && hasParseVTTFile, {
        hasProcessTranscript,
        hasParseVTTFile
      });
      
    } catch (error) {
      addTestResult('TranscriptService読み込み', false, {
        error: error.message
      });
    }
    
    // ===============================================
    // テスト3: 設定値確認
    // ===============================================
    console.log('🔍 テスト3: 設定値確認');
    
    try {
      const config = require('../../config');
      
      const configValid = (
        typeof config.transcriptAPI === 'object' &&
        typeof config.transcriptAPI.enabled === 'boolean' &&
        typeof config.transcriptAPI.timeout === 'number' &&
        typeof config.transcriptAPI.fallbackEnabled === 'boolean'
      );
      
      addTestResult('設定値確認', configValid, {
        transcriptAPI: config.transcriptAPI,
        configValid: configValid
      });
      
    } catch (error) {
      addTestResult('設定値確認', false, {
        error: error.message
      });
    }
    
    // ===============================================
    // テスト4: 環境変数確認
    // ===============================================
    console.log('🔍 テスト4: 環境変数確認');
    
    const envValid = (
      !!process.env.ZOOM_API_KEY &&
      !!process.env.ZOOM_API_SECRET &&
      !!process.env.GOOGLE_AI_API_KEY &&
      !!process.env.SLACK_BOT_TOKEN
    );
    
    addTestResult('環境変数確認', envValid, {
      hasZoomApiKey: !!process.env.ZOOM_API_KEY,
      hasZoomApiSecret: !!process.env.ZOOM_API_SECRET,
      hasGoogleAiKey: !!process.env.GOOGLE_AI_API_KEY,
      hasSlackToken: !!process.env.SLACK_BOT_TOKEN
    });
    
    // ===============================================
    // 最終結果
    // ===============================================
    const allTestsPassed = results.failed === 0;
    
    console.log('\n📊 テスト結果サマリー:');
    console.log(`   総テスト数: ${results.passed + results.failed}`);
    console.log(`   成功: ${results.passed}`);
    console.log(`   失敗: ${results.failed}`);
    console.log(`   結果: ${allTestsPassed ? '✅ 成功' : '❌ 失敗'}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ エラー詳細:');
      results.errors.forEach(error => {
        console.log(`   - ${error.testName}: ${JSON.stringify(error.details, null, 2)}`);
      });
    }
    
    // ログファイル保存
    const logDir = path.join(__dirname, '../../../3.operations/test-logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const logFileName = `fallback-quick-test-${timestamp}.json`;
    const logFilePath = path.join(logDir, logFileName);
    
    const logContent = {
      testSession: {
        startTime: new Date().toISOString(),
        testType: 'fallback-quick-test',
        totalTests: results.passed + results.failed,
        passed: results.passed,
        failed: results.failed,
        success: allTestsPassed
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        workingDirectory: process.cwd()
      },
      testResults: results
    };
    
    fs.writeFileSync(logFilePath, JSON.stringify(logContent, null, 2));
    
    console.log(`\n📝 ログファイル保存: ${logFilePath}`);
    
    return {
      success: allTestsPassed,
      testsRun: results.passed + results.failed,
      testsPassed: results.passed,
      testsFailed: results.failed,
      logFile: logFilePath
    };
    
  } catch (error) {
    console.error('❌ テスト実行エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 直接実行の場合
if (require.main === module) {
  runQuickFallbackTest()
    .then(result => {
      if (result.success) {
        console.log('\n✅ Phase 3 フォールバック機構簡易テスト成功');
        process.exit(0);
      } else {
        console.error('\n❌ Phase 3 フォールバック機構簡易テスト失敗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { runQuickFallbackTest };