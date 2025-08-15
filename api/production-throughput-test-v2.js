// PT001v2: 逐次処理フロー版本番環境スルーテスト
// アーキテクチャ改善: Video → Audio → Documents → Logs → Slack
// リトライ機能とエラー通知を統合

const ZoomRecordingService = require('../1.src/services/zoomRecordingService');
const DocumentStorageService = require('../1.src/services/documentStorageService');
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

  const testCase = req.query.test || 'PT001v2';
  
  if (testCase === 'PT001v2') {
    return await runSequentialProcessingTest(res);
  } else {
    return await runSequentialProcessingTest(res);
  }
};

// PT001v2: 逐次処理フロー完全実装
async function runSequentialProcessingTest(res) {
  const startTime = Date.now();
  const executionId = `PT001v2-${Date.now()}`;
  console.log('🚀 PT001v2: 逐次処理フロー版本番環境スルーテスト開始', { executionId, timestamp: new Date().toISOString() });
  
  let executionLogger = null;
  const errors = [];
  
  // 時間追跡システム
  const timeTracker = {
    start: startTime,
    steps: [],
    log: function(stepName, status = 'success') {
      const now = Date.now();
      const elapsed = now - this.start;
      const stepTime = this.steps.length > 0 ? now - this.steps[this.steps.length - 1].timestamp : 0;
      
      const step = {
        step: stepName,
        status: status,
        timestamp: now,
        elapsed: elapsed,
        stepDuration: stepTime
      };
      this.steps.push(step);
      
      const statusIcon = status === 'success' ? '✅' : status === 'error' ? '❌' : '⏱️';
      console.log(`${statusIcon} [${elapsed}ms] ${stepName} (step: ${stepTime}ms)`);
      return step;
    }
  };

  try {
    // ========== STEP 1: Zoom録画データ取得 ==========
    timeTracker.log('STEP 1: Zoom録画データ取得開始', 'progress');
    console.log('\n=== STEP 1: Zoom録画データ取得 ===');
    
    const zoomRecordingService = new ZoomRecordingService();
    
    const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];
    
    console.log(`📋 録画リスト取得中... (期間: ${fromDate} ～ ${toDate})`);
    
    // 一時的な実行ログ作成
    const tempMeetingInfo = {
      id: 'temp-pt001v2',
      topic: 'PT001v2 逐次処理フローテスト',
      start_time: new Date().toISOString()
    };
    const tempExecutionLogger = new ExecutionLogger(executionId, tempMeetingInfo);
    
    const availableRecordings = await zoomRecordingService.getRecordingsList(
      fromDate, 
      toDate, 
      tempExecutionLogger
    );
    
    timeTracker.log('STEP 1: Zoom録画データ取得完了');
    
    if (availableRecordings.length === 0) {
      console.log('📝 処理可能な録画データなし - テスト完了');
      
      const result = {
        success: false,
        version: 'PT001v2',
        message: '逐次処理フローテスト: 処理可能な録画データが見つかりませんでした',
        period: `${fromDate} ～ ${toDate}`,
        totalDuration: Date.now() - startTime,
        steps: timeTracker.steps
      };
      
      return res.status(200).json(result);
    }

    console.log(`✅ 処理可能な録画: ${availableRecordings.length}件`);
    const targetRecording = availableRecordings[0];
    console.log(`🎯 処理対象録画: ${targetRecording.topic}`);

    // 実際の会議情報で実行ログを初期化
    const actualMeetingInfo = zoomRecordingService.extractMeetingInfo(targetRecording);
    executionLogger = ExecutionLogManager.startExecution(actualMeetingInfo, executionId);
    
    executionLogger.logInfo('PT001v2_START', {
      testType: 'Sequential Processing Flow Test',
      recordingsFound: availableRecordings.length,
      targetRecording: targetRecording.topic
    });

    // ========== STEP 2: Video + Audio処理 ==========
    timeTracker.log('STEP 2: Video + Audio処理開始', 'progress');
    console.log('\n=== STEP 2: Video + Audio処理 (動画保存 + 音声AI処理) ===');
    
    const recordingResult = await zoomRecordingService.processRecording(
      targetRecording,
      executionLogger
    );
    
    if (!recordingResult.success) {
      throw new Error(`録画処理失敗: ${recordingResult.error}`);
    }
    
    timeTracker.log('STEP 2: Video + Audio処理完了');
    
    console.log('📊 STEP 2 結果:');
    console.log(`   - 動画保存: ${recordingResult.video?.success ? '成功' : '失敗'}`);
    console.log(`   - 音声処理: ${recordingResult.audio?.success ? '成功' : '失敗'}`);
    console.log(`   - 文字起こし: ${recordingResult.audio?.transcription?.transcription?.length || 0}文字`);

    // ========== STEP 3: 文書保存 (統合saveDocuments) ==========
    timeTracker.log('STEP 3: Google Drive文書保存開始', 'progress');
    console.log('\n=== STEP 3: Google Drive文書保存 (統合saveDocuments) ===');
    
    let documentSaveResult = null;
    try {
      const documentService = new DocumentStorageService();
      
      // 統合saveDocumentsメソッドを使用
      documentSaveResult = await documentService.saveDocuments(
        recordingResult.audio,
        recordingResult.meetingInfo, 
        process.env.GOOGLE_DRIVE_RECORDINGS_FOLDER
      );
      
      timeTracker.log('STEP 3: Google Drive文書保存完了');
      
      if (documentSaveResult && documentSaveResult.success) {
        console.log(`✅ 文書保存成功: ${documentSaveResult.totalSaved}/${documentSaveResult.totalRequested}件`);
        documentSaveResult.savedDocuments.forEach(doc => {
          console.log(`   - ${doc.type}: ${doc.fileName}`);
          console.log(`     Link: ${doc.viewLink}`);
        });
      } else {
        console.error('❌ 文書保存失敗:', documentSaveResult?.errors || 'レスポンス異常');
        errors.push({
          step: 'STEP 3: 文書保存',
          error: documentSaveResult?.errors || ['Unknown document save error']
        });
        
        // エラーを実行ログに記録
        if (executionLogger) {
          documentSaveResult?.errors?.forEach(error => {
            executionLogger.logError('DOCUMENT_SAVE_FAILED', `E_DOC_${error.type.toUpperCase()}`, error.error);
          });
        }
      }
      
    } catch (documentError) {
      timeTracker.log('STEP 3: Google Drive文書保存エラー', 'error');
      console.error('❌ 文書保存エラー:', documentError.message);
      
      documentSaveResult = { 
        success: false, 
        error: documentError.message, 
        totalSaved: 0, 
        totalFailed: 1,
        errors: [{ type: 'critical', error: documentError.message }]
      };
      
      errors.push({
        step: 'STEP 3: 文書保存',
        error: documentError.message
      });
      
      if (executionLogger) {
        executionLogger.logError('DOCUMENT_SAVE_CRITICAL', 'E_DOC_CRITICAL', documentError.message, {
          errorStack: documentError.stack
        });
      }
    }

    // ========== STEP 4: 実行ログ保存 ==========
    timeTracker.log('STEP 4: 実行ログ保存開始', 'progress');
    console.log('\n=== STEP 4: 実行ログGoogle Drive保存 ===');
    
    let logSaveResult = null;
    if (executionLogger) {
      executionLogger.logSuccess('PT001v2_BEFORE_SLACK', {
        totalExecutionTime: Date.now() - startTime,
        documentsStatus: {
          saved: documentSaveResult?.totalSaved || 0,
          failed: documentSaveResult?.totalFailed || 0
        },
        nextStep: 'Slack通知'
      });
      
      try {
        logSaveResult = await executionLogger.saveToGoogleDrive();
        console.log('✅ 実行ログ保存成功:', logSaveResult.viewLink);
        timeTracker.log('STEP 4: 実行ログ保存完了');
      } catch (logError) {
        console.error('❌ 実行ログ保存失敗:', logError.message);
        timeTracker.log('STEP 4: 実行ログ保存エラー', 'error');
        logSaveResult = { success: false, error: logError.message };
        
        errors.push({
          step: 'STEP 4: 実行ログ保存',
          error: logError.message
        });
      }
    }

    // ========== STEP 5: Slack通知 (リトライ付き) ==========
    timeTracker.log('STEP 5: Slack通知開始', 'progress');
    console.log('\n=== STEP 5: Slack通知 (リトライ付き) ===');
    
    const slackService = new SlackService();
    
    // Slack投稿用データを準備（保存されたデータと統一）
    // 重要: zoomRecordingServiceからのデータ構造に合わせて修正
    const audioData = recordingResult.audio;
    // 注意: zoomRecordingServiceは summary として返す（structuredSummaryではない）
    const structuredSummary = audioData?.summary || {};
    
    console.log('🔍 Debug: 統一データ構造確認', {
      hasStructuredSummary: !!structuredSummary,
      structuredSummaryKeys: Object.keys(structuredSummary),
      transcriptionLength: audioData?.transcription?.transcription?.length || 0,
      documentsSaved: documentSaveResult?.totalSaved || 0,
      hasAudioSummary: !!audioData?.summary,
      audioDataKeys: audioData ? Object.keys(audioData) : [],
      // 詳細デバッグ
      summaryType: typeof audioData?.summary,
      summaryContent: audioData?.summary ? JSON.stringify(audioData.summary).substring(0, 200) : 'null',
      structuredSummaryType: typeof structuredSummary,
      structuredSummaryContent: Object.keys(structuredSummary).length > 0 ? JSON.stringify(structuredSummary).substring(0, 200) : 'empty object'
    });
    
    const slackAnalysisResult = {
      meetingInfo: recordingResult.meetingInfo,
      // 統一: 構造化要約データを直接使用
      structuredSummary: structuredSummary,
      summary: structuredSummary?.overview || structuredSummary?.summary || structuredSummary,
      transcription: audioData?.transcription?.transcription || audioData?.transcription || '',
      participants: structuredSummary?.attendees || [],
      actionItems: structuredSummary?.actionItems || [],
      decisions: structuredSummary?.decisions || [],
      discussions: structuredSummary?.discussions || [], // 新しい詳細論点データ
      compressionStats: audioData?.compressionStats,
      realRecordingInfo: {
        testType: 'PT001v2: 逐次処理フロー完全版（データ統一）',
        executionTime: Date.now() - startTime,
        meetingId: recordingResult.meetingId,
        meetingTopic: recordingResult.meetingTopic,
        videoSaved: recordingResult.video?.success,
        videoLink: recordingResult.video?.shareLink,
        audioProcessed: recordingResult.audio?.success,
        transcriptionLength: audioData?.transcription?.transcription?.length || 0,
        documentsSaved: documentSaveResult?.totalSaved || 0,
        documentsLinks: documentSaveResult?.savedDocuments || [],
        errors: errors.length,
        dataUnified: true // 統一データ使用のフラグ
      }
    };
    
    // Google Driveリンク情報
    const driveResult = {
      viewLink: recordingResult.video?.shareLink,
      folderPath: recordingResult.video?.folderPath || 'Zoom録画フォルダ',
      uploadTime: Math.floor((Date.now() - startTime) / 1000),
      documentLinks: documentSaveResult?.savedDocuments || [],
      documentsCount: documentSaveResult?.totalSaved || 0,
      logLink: logSaveResult?.viewLink
    };
    
    // Slackリトライ送信メソッド
    const sendSlackWithRetries = async (maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Slack送信試行 ${attempt}/${maxRetries}`);
          const result = await slackService.sendMeetingSummaryWithRecording(slackAnalysisResult, driveResult);
          console.log(`✅ Slack送信成功 (試行${attempt})`);
          return result;
        } catch (error) {
          console.warn(`⚠️ Slack送信失敗 (試行${attempt}/${maxRetries}): ${error.message}`);
          if (attempt === maxRetries) {
            throw error;
          }
          // 指数バックオフで待機
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`待機中: ${waitTime}ms`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    };

    let slackResult;
    try {
      slackResult = await sendSlackWithRetries(3);
      timeTracker.log('STEP 5: Slack通知完了');
      console.log('✅ Slack通知成功');
      console.log('   - チャンネル:', slackResult.channel);
      console.log('   - タイムスタンプ:', slackResult.ts);
      
      // Slack成功フラグを明示的に設定
      slackResult.success = true;
      slackResult.retriesUsed = 1; // 成功したリトライ回数
      
      console.log('🔍 Debug: Slack結果確認', {
        hasTimestamp: !!slackResult.ts,
        channel: slackResult.channel,
        success: slackResult.success
      });
      
      // 要約チェック
      if (!slackAnalysisResult.summary || slackAnalysisResult.summary.length === 0) {
        console.warn('⚠️ Slack投稿で要約が空です');
        if (executionLogger) {
          executionLogger.logWarning('SLACK_EMPTY_SUMMARY', 'Slack投稿で要約が空でした', {
            summaryLength: slackAnalysisResult.summary?.length || 0,
            transcriptionLength: slackAnalysisResult.transcription?.length || 0
          });
        }
      }
      
    } catch (slackError) {
      timeTracker.log('STEP 5: Slack通知エラー', 'error');
      console.error('❌ Slack通知エラー（全リトライ失敗）:', slackError.message);
      
      errors.push({
        step: 'STEP 5: Slack通知',
        error: slackError.message
      });
      
      // Slackエラー通知を送信（別チャンネルまたは管理者向け）
      try {
        await slackService.sendErrorNotification({
          type: 'SLACK_NOTIFICATION_FAILED',
          error: slackError.message,
          meetingInfo: recordingResult.meetingInfo,
          executionId: executionId,
          context: {
            summaryLength: slackAnalysisResult.summary?.length || 0,
            transcriptionLength: slackAnalysisResult.transcription?.length || 0,
            documentsSaved: documentSaveResult?.totalSaved || 0,
            totalErrors: errors.length
          }
        });
        console.log('✅ Slackエラー通知送信完了');
      } catch (errorNotifyError) {
        console.error('❌ Slackエラー通知も失敗:', errorNotifyError.message);
      }
      
      // エラー情報を実行ログに記録
      if (executionLogger) {
        executionLogger.logError('SLACK_NOTIFICATION_FAILED', 'E_SLACK_001', slackError.message, {
          errorStack: slackError.stack,
          retriesAttempted: 3,
          slackDataSummary: {
            summaryLength: slackAnalysisResult.summary?.length || 0,
            transcriptionLength: slackAnalysisResult.transcription?.length || 0
          }
        });
      }
      
      slackResult = { success: false, error: slackError.message };
    }

    // ========== 最終結果まとめ ==========
    timeTracker.log('PT001v2完了 - レスポンス生成');
    const totalExecutionTime = Date.now() - startTime;
    
    console.log(`\n🎯 PT001v2テスト完了: ${Math.floor(totalExecutionTime / 1000)}秒`);
    console.log(`📊 実行結果サマリー:`);
    console.log(`   - 動画保存: ${recordingResult.video?.success ? '✅' : '❌'}`);
    console.log(`   - 音声処理: ${recordingResult.audio?.success ? '✅' : '❌'}`);
    console.log(`   - 文書保存: ${documentSaveResult?.success ? `✅ (${documentSaveResult.totalSaved}件)` : '❌'}`);
    console.log(`   - ログ保存: ${logSaveResult?.success ? '✅' : '❌'}`);
    console.log(`   - Slack通知: ${slackResult?.success ? '✅' : '❌'}`);
    console.log(`   - エラー数: ${errors.length}件`);
    
    if (errors.length > 0) {
      console.log('\n❌ 発生したエラー:');
      errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.step}: ${error.error}`);
      });
    }

    const success = recordingResult.success && 
                   documentSaveResult?.success && 
                   logSaveResult?.success && 
                   slackResult?.success;

    return res.status(success ? 200 : 207).json({
      status: success ? 'success' : 'partial_success',
      version: 'PT001v2',
      test: 'sequential-processing-flow',
      message: success ? '逐次処理フローテスト完全成功' : '逐次処理フローテスト部分成功',
      executionTiming: {
        totalTime: `${totalExecutionTime}ms`,
        totalSeconds: Math.floor(totalExecutionTime / 1000),
        steps: timeTracker.steps,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString()
      },
      flowResults: {
        step1_zoomRecording: {
          success: true,
          recordingsFound: availableRecordings.length
        },
        step2_videoAudioProcessing: {
          success: recordingResult.success,
          videoSaved: recordingResult.video?.success,
          audioProcessed: recordingResult.audio?.success
        },
        step3_documentSave: {
          success: documentSaveResult?.success || false,
          totalSaved: documentSaveResult?.totalSaved || 0,
          totalFailed: documentSaveResult?.totalFailed || 0,
          errors: documentSaveResult?.errors || []
        },
        step4_logSave: {
          success: logSaveResult?.success || false,
          logLink: logSaveResult?.viewLink
        },
        step5_slackNotification: {
          success: slackResult?.success || false,
          retriesUsed: slackResult?.retriesUsed || 0,
          errorNotificationSent: errors.some(e => e.step.includes('Slack'))
        }
      },
      processedRecording: {
        meetingId: recordingResult.meetingId,
        meetingTopic: recordingResult.meetingTopic || targetRecording.topic,
        videoLink: recordingResult.video?.shareLink,
        documentLinks: documentSaveResult?.savedDocuments?.map(doc => ({
          type: doc.type,
          fileName: doc.fileName,
          viewLink: doc.viewLink
        })) || [],
        transcriptionLength: recordingResult.audio?.transcription?.transcription?.length || 0
      },
      errors: errors,
      improvements: [
        '✅ 逐次処理フローによる明確なステップ分離',
        '✅ 統合saveDocumentsメソッドによる中央集約型文書保存',
        '✅ Slackリトライ機能（指数バックオフ）',
        '✅ エラー発生時のSlack通知機能',
        '✅ 各ステップの詳細なエラーログ記録',
        '✅ 部分成功時の明確な状況報告'
      ],
      architecture: 'Sequential Processing Flow (Video → Audio → Documents → Logs → Slack)',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    timeTracker.log('PT001v2エラー発生', 'error');
    console.error('❌ PT001v2 逐次処理フローテストエラー:', error);
    
    // Vercelタイムアウトエラーの検出
    const executionTime = Date.now() - startTime;
    let errorCode = 'E_PT001v2_FAILED';
    let errorType = 'SYSTEM_ERROR';
    
    if (executionTime >= 295000 || error.message.includes('timeout') || error.message.includes('Timeout')) {
      errorCode = 'E_SYSTEM_VERCEL_LIMIT';
      errorType = 'VERCEL_TIMEOUT';
      console.error('🚨 Vercel実行時間制限に抵触:', Math.floor(executionTime / 1000) + '秒');
    }
    
    // エラー時にも実行ログを保存
    let errorLogSaveResult = null;
    if (executionLogger) {
      executionLogger.logError('PT001v2_TEST_ERROR', errorCode, error.message, {
        errorStack: error.stack,
        errorAt: executionTime,
        completedSteps: timeTracker.steps.length,
        isVercelTimeout: errorCode === 'E_SYSTEM_VERCEL_LIMIT'
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
      version: 'PT001v2',
      test: 'sequential-processing-flow',
      message: '逐次処理フローテスト失敗',
      error: error.message,
      errorCode: errorCode,
      errorType: errorType,
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
      errors: errors,
      timestamp: new Date().toISOString()
    });
  }
}