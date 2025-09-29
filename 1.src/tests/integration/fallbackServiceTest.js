#!/usr/bin/env node

/**
 * Phase 3 サービス読み込みテスト
 * 
 * ZoomRecordingServiceとTranscriptServiceの基本機能確認
 */

const fs = require('fs');
const path = require('path');

// 環境変数の読み込み
require('dotenv').config({ path: path.join(__dirname, '../../..', '.env.local') });

// check-envフラグを設定してバリデーションをスキップ
process.argv[1] = 'check-env';

/**
 * サービス読み込みテスト実行
 */
async function runServiceTest() {
  console.log('🔧 Phase 3 サービス読み込みテスト開始');
  
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
    // テスト1: TranscriptService読み込み確認
    // ===============================================
    console.log('🔍 テスト1: TranscriptService読み込み確認');
    
    try {
      const TranscriptService = require('../../services/transcriptService');
      
      // コンストラクタテスト
      const transcriptService = new TranscriptService({
        zoomService: null, // モック
        aiService: null,   // モック
        config: require('../../config')
      });
      
      const hasProcessTranscript = typeof transcriptService.processTranscript === 'function';
      const hasParseVTTFile = typeof transcriptService.parseVTTFile === 'function';
      const hasGenerateSummary = typeof transcriptService.generateSummaryFromTranscript === 'function';
      
      addTestResult('TranscriptService読み込み', hasProcessTranscript && hasParseVTTFile && hasGenerateSummary, {
        hasProcessTranscript,
        hasParseVTTFile,
        hasGenerateSummary,
        constructorWorks: true
      });
      
    } catch (error) {
      addTestResult('TranscriptService読み込み', false, {
        error: error.message,
        stack: error.stack
      });
    }
    
    // ===============================================
    // テスト2: ZoomRecordingService読み込み確認  
    // ===============================================
    console.log('🔍 テスト2: ZoomRecordingService読み込み確認');
    
    try {
      const ZoomRecordingService = require('../../services/zoomRecordingService');
      
      // コンストラクタテスト（環境変数バリデーションをスキップするため引数なし）
      const zoomRecordingService = new ZoomRecordingService();
      
      const hasProcessRecording = typeof zoomRecordingService.processRecording === 'function';
      const hasTryTranscriptProcessing = typeof zoomRecordingService.tryTranscriptProcessing === 'function';
      
      addTestResult('ZoomRecordingService読み込み', hasProcessRecording && hasTryTranscriptProcessing, {
        hasProcessRecording,
        hasTryTranscriptProcessing,
        constructorWorks: true
      });
      
    } catch (error) {
      addTestResult('ZoomRecordingService読み込み', false, {
        error: error.message,
        stack: error.stack
      });
    }
    
    // ===============================================
    // テスト3: エラーコード確認
    // ===============================================
    console.log('🔍 テスト3: エラーコード確認');
    
    try {
      const errorCodes = require('../../utils/errorCodes');
      
      const hasTranscriptErrors = (
        errorCodes['ZM-401'] &&
        errorCodes['ZM-402'] &&
        errorCodes['ZM-403'] &&
        errorCodes['TS-501'] &&
        errorCodes['TS-502']
      );
      
      addTestResult('エラーコード確認', hasTranscriptErrors, {
        'ZM-401': !!errorCodes['ZM-401'],
        'ZM-402': !!errorCodes['ZM-402'], 
        'ZM-403': !!errorCodes['ZM-403'],
        'TS-501': !!errorCodes['TS-501'],
        'TS-502': !!errorCodes['TS-502']
      });
      
    } catch (error) {
      addTestResult('エラーコード確認', false, {
        error: error.message
      });
    }
    
    // ===============================================
    // テスト4: VTTサンプルデータ解析テスト
    // ===============================================
    console.log('🔍 テスト4: VTTサンプルデータ解析テスト');
    
    try {
      const TranscriptService = require('../../services/transcriptService');
      const transcriptService = new TranscriptService({
        zoomService: null,
        aiService: null,
        config: require('../../config')
      });
      
      // サンプルVTTデータ
      const sampleVTT = `WEBVTT

1
00:00:00.000 --> 00:00:05.000
こんにちは、今日の会議を始めます。

2
00:00:05.000 --> 00:00:10.000
まず議題の確認をしましょう。`;
      
      const vttBuffer = Buffer.from(sampleVTT, 'utf8');
      const parsed = await transcriptService.parseVTTFile(vttBuffer);
      
      const hasSegments = parsed.segments && parsed.segments.length > 0;
      const hasText = parsed.fullText && parsed.fullText.length > 0;
      
      addTestResult('VTTサンプルデータ解析', hasSegments && hasText, {
        segmentsCount: parsed.segments ? parsed.segments.length : 0,
        textLength: parsed.fullText ? parsed.fullText.length : 0,
        sampleText: parsed.fullText ? parsed.fullText.substring(0, 50) : null
      });
      
    } catch (error) {
      addTestResult('VTTサンプルデータ解析', false, {
        error: error.message
      });
    }
    
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
    const logFileName = `fallback-service-test-${timestamp}.json`;
    const logFilePath = path.join(logDir, logFileName);
    
    const logContent = {
      testSession: {
        startTime: new Date().toISOString(),
        testType: 'fallback-service-test',
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
  runServiceTest()
    .then(result => {
      if (result.success) {
        console.log('\n✅ Phase 3 サービス読み込みテスト成功');
        process.exit(0);
      } else {
        console.error('\n❌ Phase 3 サービス読み込みテスト失敗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { runServiceTest };