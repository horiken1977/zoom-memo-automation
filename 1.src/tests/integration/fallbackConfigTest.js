#!/usr/bin/env node

/**
 * Phase 3 設定確認テスト
 * 
 * 環境変数バリデーションをスキップして設定確認のみ実施
 */

const fs = require('fs');
const path = require('path');

// 環境変数の読み込み
require('dotenv').config({ path: path.join(__dirname, '../../..', '.env.local') });

// check-envフラグを設定してバリデーションをスキップ
process.argv[1] = 'check-env';

/**
 * 設定確認テスト実行
 */
async function runConfigTest() {
  console.log('⚙️ Phase 3 設定確認テスト開始');
  
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
    // テスト1: 基本設定読み込み確認
    // ===============================================
    console.log('🔍 テスト1: 基本設定読み込み確認');
    
    try {
      const config = require('../../config');
      
      const hasTranscriptAPI = (
        typeof config.transcriptAPI === 'object' &&
        typeof config.transcriptAPI.enabled === 'boolean' &&
        typeof config.transcriptAPI.timeout === 'number' &&
        typeof config.transcriptAPI.fallbackEnabled === 'boolean'
      );
      
      addTestResult('基本設定読み込み', hasTranscriptAPI, {
        transcriptAPI: config.transcriptAPI
      });
      
    } catch (error) {
      addTestResult('基本設定読み込み', false, {
        error: error.message
      });
    }
    
    // ===============================================
    // テスト2: 環境変数確認
    // ===============================================
    console.log('🔍 テスト2: 環境変数確認');
    
    const envVars = {
      hasZoomApiKey: !!process.env.ZOOM_API_KEY,
      hasZoomApiSecret: !!process.env.ZOOM_API_SECRET,
      hasGoogleAiKey: !!process.env.GOOGLE_AI_API_KEY,
      hasSlackToken: !!process.env.SLACK_BOT_TOKEN
    };
    
    const envValid = Object.values(envVars).every(v => v);
    
    addTestResult('環境変数確認', envValid, envVars);
    
    // ===============================================
    // テスト3: ファイル存在確認
    // ===============================================
    console.log('🔍 テスト3: ファイル存在確認');
    
    const filesToCheck = [
      '1.src/services/zoomRecordingService.js',
      '1.src/services/transcriptService.js',
      '1.src/services/zoomService.js',
      '1.src/utils/errorCodes.js'
    ];
    
    const fileResults = {};
    let allFilesExist = true;
    
    for (const file of filesToCheck) {
      const exists = fs.existsSync(path.join(__dirname, '../../..', file));
      fileResults[file] = exists;
      if (!exists) allFilesExist = false;
    }
    
    addTestResult('ファイル存在確認', allFilesExist, fileResults);
    
    // ===============================================
    // 最終結果
    // ===============================================
    const allTestsPassed = results.failed === 0;
    
    console.log('\n📊 テスト結果サマリー:');
    console.log(`   総テスト数: ${results.passed + results.failed}`);
    console.log(`   成功: ${results.passed}`);
    console.log(`   失敗: ${results.failed}`);
    console.log(`   結果: ${allTestsPassed ? '✅ 成功' : '❌ 失敗'}`);
    
    // ログファイル保存
    const logDir = path.join(__dirname, '../../../3.operations/test-logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const logFileName = `fallback-config-test-${timestamp}.json`;
    const logFilePath = path.join(logDir, logFileName);
    
    const logContent = {
      testSession: {
        startTime: new Date().toISOString(),
        testType: 'fallback-config-test',
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
  runConfigTest()
    .then(result => {
      if (result.success) {
        console.log('\n✅ Phase 3 設定確認テスト成功');
        process.exit(0);
      } else {
        console.error('\n❌ Phase 3 設定確認テスト失敗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { runConfigTest };