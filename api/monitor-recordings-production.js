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
  
  // Vercelタイムアウト監視設定（290秒で警告、295秒で強制終了）
  const VERCEL_TIMEOUT_WARNING = 290000; // 290秒
  const VERCEL_TIMEOUT_LIMIT = 295000;   // 295秒（余裕を持たせて5秒前）
  
  logger.info('🚀 本番環境録画監視処理開始', { 
    executionId, 
    timestamp: new Date().toISOString() 
  });

  let executionLogger = null;
  const processedRecordings = [];
  const errors = [];
  
  // Vercelタイムアウト監視関数
  const checkVercelTimeout = () => {
    const currentTime = Date.now();
    const elapsed = currentTime - startTime;
    
    if (elapsed >= VERCEL_TIMEOUT_LIMIT) {
      throw new Error(`E_SYSTEM_VERCEL_LIMIT: Vercel実行時間制限に達しました (${Math.round(elapsed/1000)}秒経過)`);
    }
    
    if (elapsed >= VERCEL_TIMEOUT_WARNING) {
      logger.warn(`⚠️ Vercelタイムアウト警告: ${Math.round(elapsed/1000)}秒経過 (制限: 300秒)`);
    }
    
    return elapsed;
  };
  
  try {
    // サービス初期化
    const zoomRecordingService = new ZoomRecordingService();
    const slackService = new SlackService();
    
    // Step 1: 新規録画チェック（組織全体）
    logger.info('📡 組織全体の新規録画を監視中...');
    
    // タイムアウト監視
    checkVercelTimeout();
    
    // 監視期間設定（日次バッチ想定: 過去24時間）
    const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];
    
    // 組織全体の録画を取得
    const allRecordings = await zoomRecordingService.getAllUsersRecordings(fromDate, toDate);
    
    // タイムアウト監視
    checkVercelTimeout();
    
    // ========== TC206テストコード開始（一時的追加） ==========
    // TC206テスト: 異常系シミュレーション（任意の録画に対して適用）
    if (req.query.tc206_test && allRecordings.length > 0) {
      logger.info(`🧪 TC206テストモード: ${req.query.tc206_test}`);
      
      // 最初の録画を対象にテスト条件を適用（どの録画でも可）
      const targetRecording = allRecordings[0];
      logger.info(`📝 TC206テスト対象録画: ${targetRecording.topic}`);
      
      // 元のファイルリストを保存（ログ用）
      const originalFiles = targetRecording.recording_files?.map(f => f.file_type) || [];
      
      switch(req.query.tc206_test) {
        case 's1': // 音声ファイルなし（動画のみ）
          targetRecording.recording_files = targetRecording.recording_files?.filter(
            file => file.file_type !== 'M4A' && file.file_type !== 'MP3'
          ) || [];
          logger.warn(`⚠️ TC206-S1: 音声ファイルを除外しました（元: ${originalFiles.join(',')} → 現: ${targetRecording.recording_files.map(f => f.file_type).join(',')}）`);
          break;
          
        case 's2': // 動画ファイルなし（音声のみ）
          targetRecording.recording_files = targetRecording.recording_files?.filter(
            file => file.file_type !== 'MP4'
          ) || [];
          logger.warn(`⚠️ TC206-S2: 動画ファイルを除外しました（元: ${originalFiles.join(',')} → 現: ${targetRecording.recording_files.map(f => f.file_type).join(',')}）`);
          break;
          
        case 's3': // 音声品質低下シミュレーション
          // 音声ファイルのサイズを極端に小さく偽装
          targetRecording.recording_files?.forEach(file => {
            if (file.file_type === 'M4A' || file.file_type === 'MP3') {
              file.original_file_size = file.file_size;
              file.file_size = 1000; // 1KBに偽装（異常に小さい）
              logger.warn(`⚠️ TC206-S3: 音声ファイルサイズを劣化させました（${file.original_file_size} → ${file.file_size}）`);
            }
          });
          break;
      }
    }
    // ========== TC206テストコード終了 ==========
    
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
        
        // タイムアウト監視
        checkVercelTimeout();
        
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
        
        // Slack処理開始通知を削除（完了時の1回のみに統一）
        
        // 録画処理実行（動画保存、AI処理、文書保存を含む）
        // タイムアウト監視
        checkVercelTimeout();
        
        const recordingResult = await zoomRecordingService.processRecording(
          recording,
          executionLogger
        );
        
        // 処理完了後もタイムアウト監視
        checkVercelTimeout();
        
        if (recordingResult.success) {
          // Slack完了通知（要約付き）
          if (recordingResult.summary) {
            try {
              // 正しい動画リンク構造を設定（TC206-S2: 動画なしの場合も考慮）
              const driveResult = {
                viewLink: recordingResult.video?.shareLink || recordingResult.driveLink || null,
                folderPath: recordingResult.video?.folderPath || recordingResult.documents?.folderPath || 'Zoom録画フォルダ',
                uploadTime: recordingResult.video?.processingTime || 0,
                documentLinks: recordingResult.documents?.links || []
              };
              
              await slackService.sendMeetingSummaryWithRecording(
                recordingResult, 
                driveResult,
                recordingResult.logResult
              );
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
    
    // Vercelタイムアウトエラーの特別処理
    const isVercelTimeout = error.message && error.message.includes('E_SYSTEM_VERCEL_LIMIT');
    const elapsed = Date.now() - startTime;
    
    if (executionLogger) {
      executionLogger.logError('CRITICAL_ERROR', error);
      try {
        await executionLogger.saveToGoogleDrive();
      } catch (logError) {
        logger.error('エラーログ保存失敗:', logError);
      }
    }
    
    // Vercelタイムアウト時はSlackにエラー通知
    if (isVercelTimeout) {
      try {
        const slackService = new SlackService();
        await slackService.sendErrorNotification({
          topic: 'Vercelタイムアウト制限',
          error: `実行時間制限(300秒)に達したため処理を中断しました`,
          details: {
            errorCode: 'E_SYSTEM_VERCEL_LIMIT',
            executionTime: `${Math.round(elapsed/1000)}秒`,
            processingStatus: processedRecordings.length > 0 ? `${processedRecordings.length}件処理済み` : '未処理',
            retryRecommendation: '数分後に再実行してください。長時間の処理が必要な場合は、録画ファイルサイズを確認してください。'
          }
        });
        logger.info('📱 Vercelタイムアウトエラー通知をSlackに送信しました');
      } catch (slackError) {
        logger.error('Slackタイムアウトエラー通知失敗:', slackError);
      }
    }
    
    return res.status(500).json({
      status: 'error',
      message: isVercelTimeout 
        ? 'Vercel実行時間制限(300秒)に達しました' 
        : '本番環境録画監視処理で重大エラーが発生しました',
      error: error.message,
      errorCode: isVercelTimeout ? 'E_SYSTEM_VERCEL_LIMIT' : 'E_SYSTEM_GENERAL',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      processing_time: `${elapsed}ms (${Math.round(elapsed/1000)}秒)`,
      processed_recordings: processedRecordings,
      timestamp: new Date().toISOString()
    });
  }
};