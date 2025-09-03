/**
 * 本番環境用 Zoom録画監視API（PT001ベース）
 * 
 * 機能：
 * - 組織全体のZoom録画を監視（ZoomRecordingService使用）
 * - 新規録画を自動的に処理
 * - 動画保存、AI処理、Slack通知、録画削除まで完全自動化
 * 
 * 改善履歴（PT001から継承）：
 * - 統合AI処理システム（API呼び出し80-97%削減）
 * - 音声圧縮システム（AudioCompressionService）
 * - 文書保存システム（DocumentStorageService）
 * - クライアント名ベースフォルダ構造
 * - パフォーマンス最適化（処理時間50-80%短縮）
 */

const ZoomRecordingService = require('../1.src/services/zoomRecordingService');
const SlackService = require('../1.src/services/slackService');
const { ExecutionLogger, ExecutionLogManager } = require('../1.src/utils/executionLogger');
const logger = require('../1.src/utils/logger');
const config = require('../1.src/config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const startTime = Date.now();
  const executionId = `PROD-${Date.now()}`;
  
  logger.info('🚀 本番環境録画監視処理開始', { 
    executionId, 
    timestamp: new Date().toISOString() 
  });

  let executionLogger = null;
  const processedRecordings = [];
  const errors = [];
  
  try {
    // サービス初期化
    const zoomRecordingService = new ZoomRecordingService();
    const slackService = new SlackService();
    
    // Step 1: 新規録画チェック（組織全体）
    logger.info('📡 組織全体の新規録画を監視中...');
    
    // 監視期間設定（日次バッチ想定: 過去24時間）
    const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];
    
    // 組織全体の録画を取得
    const allRecordings = await zoomRecordingService.getAllUsersRecordings(fromDate, toDate);
    
    // 処理可能な録画のみフィルタ（動画または音声ファイルが存在）
    const availableRecordings = allRecordings.filter(recording => {
      const hasVideo = recording.recording_files?.some(file => file.file_type === 'MP4');
      const hasAudio = recording.recording_files?.some(file => ['M4A', 'MP3'].includes(file.file_type));
      return hasVideo || hasAudio;
    });

    logger.info(`✅ ${availableRecordings.length}件の処理可能な録画を検出`);
    
    if (availableRecordings.length === 0) {
      logger.info('📭 現在処理対象の録画データはありません');
      
      return res.status(200).json({
        status: 'success',
        message: '📭 現在処理対象の録画データはありません',
        recordings_found: 0,
        search_period: { from: fromDate, to: toDate },
        monitoring_interval: '24 hours',
        next_check: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        processing_time: `${Date.now() - startTime}ms`,
        timestamp: new Date().toISOString()
      });
    }

    // Step 2: タイムアウト防止のため1件ずつ処理（処理後に再検索）
    logger.info(`🎬 録画処理開始: ${availableRecordings.length}件検出`);
    
    // 1件のみ処理（タイムアウト防止）
    if (availableRecordings.length > 0) {
      const recording = availableRecordings[0]; // 最初の1件のみ処理
      const recordingStartTime = Date.now();
      
      logger.info(`📋 1件処理モード: ${recording.topic} (残り${availableRecordings.length - 1}件は次回実行で処理)`);
      
      try {
        logger.info(`\\n🎯 処理開始: ${recording.topic}`);
        
        // 実行ログ開始
        const meetingInfo = zoomRecordingService.extractMeetingInfo(recording);
        const recordingExecutionId = `PROD-${recording.id}-${Date.now()}`;
        executionLogger = ExecutionLogManager.startExecution(meetingInfo, recordingExecutionId);
        
        executionLogger.logInfo('PRODUCTION_RECORDING_START', {
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
          
          // 録画削除（本番環境で有効な場合）
          if (!config.productionTest?.skipRecordingDeletion) {
            try {
              const deleteResult = await zoomRecordingService.zoomService.deleteMeetingRecordings({
                uuid: recording.uuid,
                id: recording.id,
                topic: recording.topic
              });
              
              executionLogger.logInfo('RECORDING_DELETED', deleteResult);
              logger.info('🗑️ 録画削除完了:', recording.topic);
            } catch (deleteError) {
              logger.error('録画削除失敗（処理は成功扱い）:', deleteError);
              executionLogger.logWarning('RECORDING_DELETE_FAILED', { 
                error: deleteError.message 
              });
            }
          }
          
          processedRecordings.push({
            id: recording.id,
            topic: recording.topic,
            success: true,
            processingTime: Date.now() - recordingStartTime,
            driveLink: recordingResult.driveLink,
            summaryGenerated: !!recordingResult.summary
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
          processingTime: Date.now() - recordingStartTime
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
      
      // 実行ログ保存
      if (executionLogger) {
        try {
          const logSaveResult = await executionLogger.saveToGoogleDrive();
          logger.info('📋 実行ログ保存完了:', logSaveResult.viewLink);
        } catch (logError) {
          logger.error('実行ログ保存失敗:', logError);
        }
      }
    }
    
    // Step 3: 継続検索（残り録画確認）
    const remainingRecordings = await zoomRecordingService.getAllUsersRecordings(fromDate, toDate);
    const stillAvailable = remainingRecordings.filter(recording => {
      const hasVideo = recording.recording_files?.some(file => file.file_type === 'MP4');
      const hasAudio = recording.recording_files?.some(file => ['M4A', 'MP3'].includes(file.file_type));
      return hasVideo || hasAudio;
    });
    
    // Step 4: 処理結果サマリと継続処理案内
    const totalTime = Date.now() - startTime;
    const result = {
      status: 'success',
      message: processedRecordings.length > 0 
        ? `✅ 1件処理完了。残り${stillAvailable.length}件`
        : `📭 処理対象なし`,
      summary: {
        total_recordings: availableRecordings.length,
        processed: processedRecordings.length,
        failed: errors.length,
        success_rate: `${Math.round(processedRecordings.length / availableRecordings.length * 100)}%`
      },
      search_period: { from: fromDate, to: toDate },
      processing_time: `${totalTime}ms (${(totalTime/1000).toFixed(1)}秒)`,
      processed_recordings: processedRecordings,
      errors: errors.length > 0 ? errors : undefined,
      remaining_recordings: {
        count: stillAvailable.length,
        action: stillAvailable.length > 0 ? '次回実行で継続処理します' : '全録画処理完了'
      },
      timestamp: new Date().toISOString()
    };
    
    if (stillAvailable.length > 0) {
      logger.info(`🔄 継続処理必要: 残り${stillAvailable.length}件の録画があります`);
    }
    
    logger.info('🎉 本番環境録画監視処理完了', result.summary);
    
    return res.status(200).json(result);
    
  } catch (error) {
    logger.error('💥 本番環境録画監視処理で重大エラー:', error);
    
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
      message: '本番環境録画監視処理で重大エラーが発生しました',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      processing_time: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString()
    });
  }
};