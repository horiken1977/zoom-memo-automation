#!/usr/bin/env node

const cron = require('node-cron');
const fs = require('fs-extra');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const ZoomService = require('./services/zoomService');
const AIService = require('./services/aiService');
const SlackService = require('./services/slackService');
const GoogleDriveService = require('./services/googleDriveService');
const DocumentStorageService = require('./services/documentStorageService');
const { ExecutionLogger } = require('./utils/executionLogger');

class ZoomMemoAutomation {
  constructor() {
    this.zoomService = new ZoomService();
    this.aiService = new AIService();
    this.slackService = new SlackService();
    this.googleDriveService = new GoogleDriveService();
    this.documentStorageService = new DocumentStorageService();
    
    this.lastCheckFile = path.join(__dirname, '..', '3.operations', 'configs', 'last-check.json');
    this.isProcessing = false;
    
    this.initializeSystem();
  }

  async initializeSystem() {
    try {
      logger.info('Initializing Zoom Memo Automation System...');

      // 必要なディレクトリの作成
      await this.ensureDirectories();

      // 最後のチェック時刻を読み込み
      await this.loadLastCheckTime();

      // ヘルスチェック実行
      await this.performHealthCheck();

      logger.info('System initialization completed successfully');

    } catch (error) {
      logger.error('System initialization failed:', error);
      throw error;
    }
  }

  async ensureDirectories() {
    const directories = [
      config.recording.downloadPath,
      config.recording.tempDir,
      path.dirname(this.lastCheckFile),
      path.dirname(config.logging.file)
    ];

    for (const dir of directories) {
      await fs.ensureDir(dir);
    }
  }

  async loadLastCheckTime() {
    try {
      if (await fs.pathExists(this.lastCheckFile)) {
        const data = await fs.readJson(this.lastCheckFile);
        this.lastCheckTime = new Date(data.lastCheckTime);
      } else {
        // 初回実行時は24時間前から開始
        this.lastCheckTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await this.saveLastCheckTime();
      }
      
      logger.info(`Last check time: ${this.lastCheckTime.toISOString()}`);
    } catch (error) {
      logger.error('Failed to load last check time:', error);
      this.lastCheckTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }
  }

  async saveLastCheckTime() {
    try {
      await fs.writeJson(this.lastCheckFile, {
        lastCheckTime: this.lastCheckTime.toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to save last check time:', error);
    }
  }

  async performHealthCheck() {
    logger.info('Performing system health check...');

    const healthResults = await Promise.allSettled([
      this.zoomService.healthCheck(),
      this.aiService.healthCheck(),
      this.slackService.healthCheck(),
      this.googleDriveService.healthCheck()
    ]);

    const [zoomHealth, aiHealth, slackHealth, driveHealth] = healthResults.map(result => 
      result.status === 'fulfilled' ? result.value : { status: 'unhealthy', error: result.reason.message }
    );

    logger.info('Health check results:', {
      zoom: zoomHealth.status,
      ai: aiHealth.status,
      slack: slackHealth.status,
      googleDrive: driveHealth.status
    });

    if (zoomHealth.status === 'unhealthy' || aiHealth.status === 'unhealthy' || 
        slackHealth.status === 'unhealthy' || driveHealth.status === 'unhealthy') {
      logger.warn('Some services are unhealthy. System may not function properly.');
    }

    return { zoom: zoomHealth, ai: aiHealth, slack: slackHealth, googleDrive: driveHealth };
  }

  async processNewRecordings() {
    if (this.isProcessing) {
      logger.info('Already processing recordings, skipping this cycle');
      return;
    }

    try {
      this.isProcessing = true;
      logger.info('Starting new recording check...');

      // 新しい録画を監視
      const newRecordings = await this.zoomService.monitorNewRecordings(this.lastCheckTime);

      if (newRecordings.length === 0) {
        logger.info('No new recordings found');
        return;
      }

      logger.info(`Found ${newRecordings.length} new recordings to process`);

      // 処理件数制限（テスト時のみ、本番では0=無制限）
      let recordingsToProcess = newRecordings;
      const maxRecordings = config.productionTest.maxProcessRecordings;
      
      if (maxRecordings > 0 && newRecordings.length > maxRecordings) {
        recordingsToProcess = newRecordings.slice(0, maxRecordings);
        logger.info(`Recording processing limited to ${maxRecordings} recordings (MAX_PROCESS_RECORDINGS=${maxRecordings})`);
        logger.info(`Processing ${recordingsToProcess.length} out of ${newRecordings.length} recordings`);
      } else if (maxRecordings === 0) {
        logger.info(`Processing all ${newRecordings.length} recordings (no limit set)`);
      } else {
        logger.info(`Processing all ${recordingsToProcess.length} recordings`);
      }

      // 各録画を順番に処理
      for (const recording of recordingsToProcess) {
        try {
          await this.processSingleRecording(recording);
        } catch (error) {
          logger.meetingError(recording, error);
          
          // Slackにエラー通知
          await this.slackService.sendErrorNotification(
            error, 
            `会議: ${recording.topic}\\n時刻: ${recording.startTime}`
          );
        }
      }

      // 最後のチェック時刻を更新
      this.lastCheckTime = new Date();
      await this.saveLastCheckTime();

    } catch (error) {
      logger.error('Recording processing cycle failed:', error);
      await this.slackService.sendErrorNotification(error, '録画監視プロセス');
    } finally {
      this.isProcessing = false;
    }
  }

  async processSingleRecording(recording) {
    const startTime = Date.now();
    logger.meetingStart(recording);

    // 実行ログを開始
    const executionLogger = new ExecutionLogger(`meeting_${recording.id}_${Date.now()}`, recording);
    
    try {
      executionLogger.logSuccess('MEETING_PROCESSING_START', { 
        meetingTopic: recording.topic,
        meetingId: recording.id 
      });
      // Slackに処理開始通知
      const processingMessageTs = await this.slackService.sendProcessingNotification(recording);

      // 1. 録画ファイルをダウンロード
      logger.info(`Downloading recording for meeting: ${recording.topic}`);
      executionLogger.startStep('RECORDING_DOWNLOAD');
      const recordingInfo = await this.zoomService.downloadRecording(recording);
      executionLogger.completeStep('RECORDING_DOWNLOAD', { 
        audioFilePath: recordingInfo.audioFilePath,
        videoFilePath: recordingInfo.videoFilePath 
      });

      // 2. 統合AI処理実行（文字起こし+要約を一括実行）
      logger.info(`Starting unified AI processing for: ${recording.topic}`);
      executionLogger.startStep('AI_PROCESSING');
      const aiBuffer = await fs.readFile(recordingInfo.audioFilePath);
      const analysisResult = await this.aiService.processAudioWithStructuredOutput(
        aiBuffer,
        recordingInfo.meetingInfo,
        {
          mimeType: recordingInfo.audioMimeType || 'audio/aac',
          maxRetries: 5
        }
      );
      executionLogger.completeStep('AI_PROCESSING', { 
        transcriptionLength: analysisResult.transcription?.length,
        participantCount: analysisResult.participants?.length,
        processingTime: analysisResult.processingTime 
      });

      // 3. Google Driveに録画保存
      logger.info(`Saving recording to Google Drive: ${recording.topic}`);
      executionLogger.startStep('RECORDING_SAVE');
      const driveResult = await this.googleDriveService.saveRecording(
        recordingInfo.videoFilePath || recordingInfo.audioFilePath,
        recordingInfo.meetingInfo
      );
      executionLogger.completeStep('RECORDING_SAVE', { 
        fileId: driveResult.fileId,
        fileName: driveResult.fileName,
        viewLink: driveResult.viewLink 
      });

      // 4. 要約・文字起こしをGoogle Driveに保存
      logger.info(`Saving documents to Google Drive: ${recording.topic}`);
      const documentResults = await Promise.allSettled([
        this.documentStorageService.saveSummaryToGoogleDrive(
          analysisResult,
          recordingInfo.meetingInfo,
          config.googleDrive.recordingsFolder
        ),
        this.documentStorageService.saveTranscriptionToGoogleDrive(
          analysisResult,
          recordingInfo.meetingInfo,
          config.googleDrive.recordingsFolder
        ),
        this.documentStorageService.saveStructuredSummaryToGoogleDrive(
          analysisResult,
          recordingInfo.meetingInfo,
          config.googleDrive.recordingsFolder
        )
      ]);

      // 保存結果をログ出力
      const [summaryResult, transcriptionResult, structuredResult] = documentResults;
      if (summaryResult.status === 'fulfilled') {
        logger.info(`Summary saved: ${summaryResult.value.fileName} (${summaryResult.value.fileId})`);
      } else {
        logger.error(`Summary save failed: ${summaryResult.reason.message}`);
      }
      
      if (transcriptionResult.status === 'fulfilled') {
        logger.info(`Transcription saved: ${transcriptionResult.value.fileName} (${transcriptionResult.value.fileId})`);
      } else {
        logger.error(`Transcription save failed: ${transcriptionResult.reason.message}`);
      }
      
      if (structuredResult.status === 'fulfilled') {
        logger.info(`Structured summary saved: ${structuredResult.value.fileName} (${structuredResult.value.fileId})`);
      } else {
        logger.error(`Structured summary save failed: ${structuredResult.reason.message}`);
      }

      // 5. 実行ログを保存
      logger.info(`Saving execution log for: ${recording.topic}`);
      executionLogger.startStep('EXECUTION_LOG_SAVE');
      const executionLogResult = await executionLogger.saveToGoogleDrive();
      executionLogger.completeStep('EXECUTION_LOG_SAVE', { 
        logFileId: executionLogResult.fileId,
        logFileName: executionLogResult.logFileName 
      });

      // 6. Slackに要約と録画リンクを送信（実行ログリンク付き）
      logger.info(`Sending summary and recording link to Slack: ${recording.topic}`);
      await this.slackService.sendMeetingSummaryWithRecording(analysisResult, driveResult, executionLogResult);

      // 7. Zoom録画ファイルの削除（本番のみ、テスト時はSKIP_RECORDING_DELETION=trueでスキップ）
      logger.info(`Deleting Zoom recordings: ${recording.topic}`);
      if (executionLogger) {
        executionLogger.startStep('ZOOM_RECORDING_DELETION', { 
          meetingTopic: recording.topic,
          meetingUuid: recording.uuid 
        });
      }
      
      try {
        const deletionResult = await this.zoomService.deleteMeetingRecordings(recording);
        
        if (executionLogger) {
          if (deletionResult.success) {
            executionLogger.completeStep('ZOOM_RECORDING_DELETION', deletionResult, 'SUCCESS');
          } else {
            executionLogger.errorStep('ZOOM_RECORDING_DELETION', 'E_ZOOM_DELETE_FAILED', deletionResult.error || 'Recording deletion failed', deletionResult);
          }
        }
        
        if (deletionResult.skipped) {
          logger.info(`Recording deletion skipped for safety: ${recording.topic}`);
        } else if (deletionResult.success) {
          logger.info(`Recording deleted successfully: ${recording.topic}`);
        } else {
          logger.error(`Recording deletion failed: ${recording.topic} - ${deletionResult.error}`);
        }
        
      } catch (deletionError) {
        logger.error(`Recording deletion error: ${recording.topic}`, deletionError);
        if (executionLogger) {
          executionLogger.errorStep('ZOOM_RECORDING_DELETION', 'E_ZOOM_DELETE_FAILED', deletionError.message, { 
            errorStack: deletionError.stack 
          });
        }
      }

      // 8. 一時ファイルのクリーンアップ（テスト・本番問わず実行）
      await this.cleanupTempFiles([recordingInfo.audioFilePath, recordingInfo.videoFilePath]);

      const processingTime = Math.round((Date.now() - startTime) / 1000);
      logger.meetingComplete(recording, processingTime);

    } catch (error) {
      // エラーログを記録
      if (executionLogger) {
        executionLogger.logError('MEETING_PROCESSING_ERROR', 'E_SYSTEM_UNKNOWN', error.message, { 
          errorStack: error.stack,
          meetingTopic: recording.topic 
        });
        
        // エラー時でも実行ログを保存
        try {
          await executionLogger.saveToGoogleDrive();
        } catch (logError) {
          logger.error('Failed to save execution log after error:', logError.message);
        }
      }
      
      logger.meetingError(recording, error);
      throw error;
    }
  }

  async cleanupTempFiles(filePaths) {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    
    for (const filePath of paths) {
      if (!filePath) continue;
      
      try {
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
          logger.fileOperation('delete', filePath, true, 0);
        }
      } catch (error) {
        logger.error(`Failed to cleanup temp file ${filePath}:`, error.message);
      }
    }
  }

  async startScheduledMonitoring() {
    logger.info(`Starting scheduled monitoring (interval: ${config.monitoring.checkIntervalMinutes} minutes)`);

    // 即座に最初のチェックを実行
    await this.processNewRecordings();

    // 定期実行を設定
    const cronExpression = `*/${config.monitoring.checkIntervalMinutes} * * * *`;
    
    cron.schedule(cronExpression, async () => {
      try {
        await this.processNewRecordings();
      } catch (error) {
        logger.error('Scheduled processing failed:', error);
      }
    });

    logger.info(`Scheduled monitoring started with cron: ${cronExpression}`);
  }

  async runOnce() {
    logger.info('Running one-time recording check...');
    await this.processNewRecordings();
    logger.info('One-time check completed');
  }

  async testSlackIntegration() {
    logger.info('Testing Slack integration...');
    try {
      await this.slackService.sendTestMessage();
      logger.info('Slack integration test successful');
    } catch (error) {
      logger.error('Slack integration test failed:', error);
      throw error;
    }
  }

  async stop() {
    logger.info('Stopping Zoom Memo Automation System...');
    
    // 処理中の場合は完了を待つ
    while (this.isProcessing) {
      logger.info('Waiting for current processing to complete...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.info('System stopped');
    process.exit(0);
  }
}

// CLI実行時の処理
async function main() {
  const args = process.argv.slice(2);
  const automation = new ZoomMemoAutomation();

  // プロセス終了時のクリーンアップ
  process.on('SIGINT', () => automation.stop());
  process.on('SIGTERM', () => automation.stop());

  try {
    if (args.includes('--once')) {
      // 一回だけ実行
      await automation.runOnce();
      process.exit(0);
      
    } else if (args.includes('--test-slack')) {
      // Slack統合テスト
      await automation.testSlackIntegration();
      process.exit(0);
      
    } else if (args.includes('--health-check')) {
      // ヘルスチェック
      const health = await automation.performHealthCheck();
      console.log('Health Check Results:', JSON.stringify(health, null, 2));
      process.exit(0);
      
    } else if (args.includes('--help')) {
      console.log(`
Zoom Memo Automation System

Usage: node index.js [options]

Options:
  --once         Run once and exit
  --test-slack   Test Slack integration
  --health-check Run health check and exit
  --help         Show this help message

Default: Start scheduled monitoring
      `);
      process.exit(0);
      
    } else {
      // デフォルト: 定期監視を開始
      await automation.startScheduledMonitoring();
    }

  } catch (error) {
    logger.error('Application failed:', error);
    process.exit(1);
  }
}

// モジュールとして使用される場合とCLIとして実行される場合を区別
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = ZoomMemoAutomation;