/**
 * TC206: 部分データ存在業務テスト（本番コードベース実装）
 * 
 * テストシナリオ（パラメータ制御）：
 * 1. 音声なし & 動画あり → 動画から音声抽出 → 文字起こし → 要約 → 保存 → Slack通知
 * 2. 音声あり & 動画なし → 音声のみで処理継続 → Slack通知（動画なし明記）
 * 3. 音声品質低下 & 動画あり → 動画から音声再抽出 → 文字起こし → 要約 → 保存 → Slack通知
 * 4. 音声品質低下 & 動画なし → エラー処理 → Slack通知（処理不可能エラー）
 * 
 * 実装方針（CLAUDE.md準拠）：
 * - 本番環境のソースコードをそのまま使用
 * - テスト条件はクエリパラメーターで制御
 * - 本番のZoomRecordingService.processRecording()を活用
 * - データ条件のみをシナリオに応じて調整
 */

const ZoomRecordingService = require('../1.src/services/zoomRecordingService');
const SlackService = require('../1.src/services/slackService');
const { ExecutionLogger, ExecutionLogManager } = require('../1.src/utils/executionLogger');
const logger = require('../1.src/utils/logger');
const config = require('../1.src/config');

/**
 * シナリオの説明を取得
 */
function getScenarioDescription(scenario) {
  const descriptions = {
    '1': '音声なし & 動画あり → 動画から音声抽出して処理',
    '2': '音声あり & 動画なし → 音声のみで処理継続',
    '3': '音声品質低下 & 動画あり → 動画から音声再抽出',
    '4': '音声品質低下 & 動画なし → エラー処理'
  };
  return descriptions[scenario] || 'Unknown scenario';
}

/**
 * テスト条件の詳細を取得
 */
function getTestConditions(scenario) {
  const conditions = {
    '1': {
      audio_exists: false,
      video_exists: true,
      audio_quality: 'N/A',
      expected_behavior: '動画から音声を抽出して処理を継続'
    },
    '2': {
      audio_exists: true,
      video_exists: false,
      audio_quality: 'Good',
      expected_behavior: '音声ファイルのみで処理を完了'
    },
    '3': {
      audio_exists: true,
      video_exists: true,
      audio_quality: 'Poor',
      expected_behavior: '動画から音声を再抽出して処理'
    },
    '4': {
      audio_exists: true,
      video_exists: false,
      audio_quality: 'Poor',
      expected_behavior: 'エラー処理（処理不可能）'
    }
  };
  return conditions[scenario] || {};
}

/**
 * シナリオに応じて録画データを加工
 * 実際の録画データをベースに、テストシナリオに応じた条件を作成
 */
function modifyRecordingForScenario(baseRecording, scenario) {
  const modifiedRecording = JSON.parse(JSON.stringify(baseRecording));
  
  // テストであることを明示
  modifiedRecording.topic = `[TC206-S${scenario}] ${modifiedRecording.topic}`;
  
  switch (scenario) {
    case '1':
      // 音声なし & 動画あり
      // 動画ファイルのみを残す（実際のURLを維持）
      const videoFiles = modifiedRecording.recording_files.filter(
        file => file.file_type === 'MP4'
      );
      if (videoFiles.length > 0) {
        // 実際の動画ファイルがある場合はそれを使用
        modifiedRecording.recording_files = videoFiles;
      } else {
        // 動画ファイルがない場合はエラー
        logger.warn('TC206シナリオ1: 実際の動画ファイルが見つかりません');
        modifiedRecording.recording_files = [];
      }
      break;
      
    case '2':
      // 音声あり & 動画なし
      // 音声ファイルのみを残す（実際のURLを維持）
      const audioFiles = modifiedRecording.recording_files.filter(
        file => ['M4A', 'MP3'].includes(file.file_type)
      );
      if (audioFiles.length > 0) {
        modifiedRecording.recording_files = audioFiles;
      } else {
        logger.warn('TC206シナリオ2: 実際の音声ファイルが見つかりません');
        modifiedRecording.recording_files = [];
      }
      break;
      
    case '3':
      // 音声品質低下 & 動画あり
      // 実際のファイルを使用し、音声ファイルに品質低下フラグを追加
      const hasVideo = modifiedRecording.recording_files.some(f => f.file_type === 'MP4');
      const hasAudio = modifiedRecording.recording_files.some(f => ['M4A', 'MP3'].includes(f.file_type));
      
      if (!hasVideo || !hasAudio) {
        logger.warn(`TC206シナリオ3: 必要なファイルが不足 (video=${hasVideo}, audio=${hasAudio})`);
      }
      
      // 音声ファイルに品質低下マーカーを追加
      modifiedRecording.recording_files.forEach(file => {
        if (['M4A', 'MP3'].includes(file.file_type)) {
          file.test_low_quality = true;
        }
      });
      break;
      
    case '4':
      // 音声品質低下 & 動画なし
      // 音声ファイルのみを残し、品質低下フラグを追加
      const audioOnlyFiles = modifiedRecording.recording_files.filter(
        file => ['M4A', 'MP3'].includes(file.file_type)
      );
      
      if (audioOnlyFiles.length > 0) {
        modifiedRecording.recording_files = audioOnlyFiles;
        // 音声ファイルに品質低下マーカーを追加
        modifiedRecording.recording_files.forEach(file => {
          file.test_low_quality = true;
        });
      } else {
        logger.warn('TC206シナリオ4: 実際の音声ファイルが見つかりません');
        modifiedRecording.recording_files = [];
      }
      break;
  }
  
  return modifiedRecording;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // TC206テストパラメータ取得
  const scenario = req.query.scenario || '1';
  const startTime = Date.now();
  const executionId = `TC206-S${scenario}-${Date.now()}`;
  
  logger.info(`🧪 TC206テスト開始 - シナリオ${scenario}`, { 
    executionId,
    scenario,
    description: getScenarioDescription(scenario),
    timestamp: new Date().toISOString() 
  });

  let executionLogger = null;
  const processedRecordings = [];
  const errors = [];
  
  try {
    // サービス初期化
    const zoomRecordingService = new ZoomRecordingService();
    const slackService = new SlackService();
    
    // Step 1: テスト用録画データ準備（シナリオに応じたモックデータ）
    logger.info(`📡 TC206シナリオ${scenario}用のテストデータ準備中...`);
    
    // テスト用の固定期間（最近の録画から1件取得）
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];
    
    // 実際の録画データを1件取得
    const realRecordings = await zoomRecordingService.getAllUsersRecordings(fromDate, toDate);
    
    if (realRecordings.length === 0) {
      logger.warn('⚠️ テスト用の録画データが見つかりません');
      return res.status(200).json({
        status: 'warning',
        testCategory: 'TC206',
        scenario,
        message: 'テスト用の録画データが見つかりません。実際の録画を作成してください。',
        timestamp: new Date().toISOString()
      });
    }
    
    // 最初の録画をテスト用に加工
    const baseRecording = realRecordings[0];
    const allRecordings = [modifyRecordingForScenario(baseRecording, scenario)];
    
    // 処理可能な録画のみフィルタ（動画または音声ファイルが存在）
    const availableRecordings = allRecordings.filter(recording => {
      const hasVideo = recording.recording_files?.some(file => file.file_type === 'MP4');
      const hasAudio = recording.recording_files?.some(file => ['M4A', 'MP3'].includes(file.file_type));
      return hasVideo || hasAudio;
    });

    logger.info(`✅ TC206シナリオ${scenario}: ${availableRecordings.length}件のテスト録画を準備完了`);
    
    if (availableRecordings.length === 0) {
      logger.info(`📭 TC206シナリオ${scenario}: テスト対象データが作成できませんでした`);
      
      return res.status(200).json({
        status: 'error',
        testCategory: 'TC206',
        scenario,
        message: 'テストデータの準備に失敗しました',
        recordings_found: 0,
        processing_time: `${Date.now() - startTime}ms`,
        timestamp: new Date().toISOString()
      });
    }

    // Step 2: テスト録画を処理（本番のprocessRecordingを使用）
    logger.info(`🎬 TC206シナリオ${scenario}: テスト処理を開始`);
    
    for (const recording of availableRecordings) {
      const recordingStartTime = Date.now();
      
      try {
        logger.info(`\\n🎯 処理開始: ${recording.topic}`);
        
        // 実行ログ開始
        const meetingInfo = zoomRecordingService.extractMeetingInfo(recording);
        const recordingExecutionId = `TC206-S${scenario}-${recording.id}-${Date.now()}`;
        executionLogger = ExecutionLogManager.startExecution(meetingInfo, recordingExecutionId);
        
        executionLogger.logInfo('TC206_TEST_START', {
          testScenario: scenario,
          scenarioDescription: getScenarioDescription(scenario),
          meetingId: recording.id,
          meetingTopic: recording.topic,
          hostEmail: recording.host_email,
          duration: recording.duration,
          recordingFiles: recording.recording_files?.length || 0
        });
        
        // Slack処理開始通知
        try {
          await slackService.sendProcessingNotification({
            topic: recording.topic,
            startTime: recording.start_time,
            duration: recording.duration
          });
        } catch (slackError) {
          logger.error('Slack開始通知失敗（処理は継続）:', slackError);
        }
        
        // 録画処理実行（動画保存、AI処理、文書保存を含む）
        const recordingResult = await zoomRecordingService.processRecording(
          recording,
          executionLogger
        );
        
        if (recordingResult.success) {
          // Slack完了通知（要約付き）
          if (recordingResult.summary) {
            try {
              await slackService.sendCompletionMessage(recordingResult.summary);
            } catch (slackError) {
              logger.error('Slack完了通知失敗:', slackError);
            }
          }
          
          // TC206では録画削除をスキップ（テストのため）
          logger.info('🔒 TC206テスト: 録画削除をスキップ');
          
          processedRecordings.push({
            id: recording.id,
            topic: recording.topic,
            success: true,
            processingTime: Date.now() - recordingStartTime,
            driveLink: recordingResult.driveLink,
            summaryGenerated: !!recordingResult.summary,
            testScenario: scenario
          });
          
          logger.info(`✅ 処理完了: ${recording.topic} (${Date.now() - recordingStartTime}ms)`);
        } else {
          throw new Error(recordingResult.error || '録画処理失敗');
        }
        
        // 実行ログ保存
        try {
          const logSaveResult = await executionLogger.saveToGoogleDrive();
          logger.info('📋 実行ログ保存完了:', logSaveResult.viewLink);
        } catch (logError) {
          logger.error('実行ログ保存失敗:', logError);
        }
        
      } catch (error) {
        logger.error(`❌ 処理失敗: ${recording.topic}`, error);
        
        errors.push({
          id: recording.id,
          topic: recording.topic,
          error: error.message,
          processingTime: Date.now() - recordingStartTime,
          testScenario: scenario
        });
        
        if (executionLogger) {
          executionLogger.logError('RECORDING_PROCESSING_FAILED', error);
        }
        
        // エラー通知
        try {
          await slackService.sendErrorNotification({
            topic: recording.topic,
            error: error.message
          });
        } catch (slackError) {
          logger.error('Slackエラー通知失敗:', slackError);
        }
      }
    }
    
    // Step 3: 処理結果サマリ
    const totalTime = Date.now() - startTime;
    
    logger.info(`🎉 TC206シナリオ${scenario}テスト完了`, {
      processed: processedRecordings.length,
      failed: errors.length,
      totalTime: `${totalTime}ms`
    });
    
    return res.status(200).json({
      status: 'success',
      testCategory: 'TC206',
      scenario,
      scenarioDescription: getScenarioDescription(scenario),
      message: `✅ TC206シナリオ${scenario}のテストが完了しました`,
      summary: {
        total_recordings: availableRecordings.length,
        processed: processedRecordings.length,
        failed: errors.length,
        processing_time: `${totalTime}ms (${(totalTime/1000).toFixed(1)}秒)`
      },
      processed_recordings: processedRecordings,
      errors: errors.length > 0 ? errors : undefined,
      test_conditions: getTestConditions(scenario),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('💥 TC206テストで重大エラー:', error);
    
    if (executionLogger) {
      executionLogger.logError('CRITICAL_ERROR', error);
      try {
        await executionLogger.saveToGoogleDrive();
      } catch (logError) {
        logger.error('エラーログ保存失敗:', logError);
      }
    }
    
    return res.status(500).json({
      status: 'error',
      testCategory: 'TC206',
      scenario,
      message: 'TC206テストで重大エラーが発生しました',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      processing_time: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString()
    });
  }
};