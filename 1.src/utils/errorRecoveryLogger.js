const fs = require('fs-extra');
const path = require('path');
const GoogleDriveService = require('../services/googleDriveService');
const logger = require('./logger');

/**
 * エラー回復用ロガー
 * Vercelのようなサーバーレス環境でも動作するよう、Google Driveを使用してログを保存
 */
class ErrorRecoveryLogger {
  constructor() {
    this.googleDriveService = new GoogleDriveService();
    this.initialized = false;
  }

  /**
   * 初期化
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await this.googleDriveService.initialize();
      this.initialized = true;
      logger.info('ErrorRecoveryLogger initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ErrorRecoveryLogger:', error.message);
      // 初期化に失敗してもロガー自体は動かす（ローカルログのみ）
    }
  }

  /**
   * Slack投稿エラー時の要約データ保存
   */
  async saveSlackPostFailure(meetingInfo, analysisResult, error, attemptDetails = {}) {
    try {
      await this.initialize();

      const timestamp = new Date().toISOString();
      const meetingId = meetingInfo.id || meetingInfo.meetingId || 'unknown';
      
      // 保存データを構築
      const failureData = {
        error: {
          timestamp: timestamp,
          type: 'slack_post_failure',
          message: error.message,
          stack: error.stack,
          attemptCount: attemptDetails.attemptCount || 1,
          finalAttempt: attemptDetails.finalAttempt || true
        },
        meeting: {
          id: meetingId,
          topic: meetingInfo.topic,
          startTime: meetingInfo.startTime,
          duration: meetingInfo.duration,
          hostName: meetingInfo.hostName
        },
        analysisResult: {
          summary: analysisResult.summary,
          participants: analysisResult.participants || [],
          actionItems: analysisResult.actionItems || [],
          decisions: analysisResult.decisions || [],
          transcription: analysisResult.transcription?.substring(0, 5000) + '...(truncated)', // 文字起こしは最初の5000文字のみ
          analysisTimestamp: analysisResult.analysis?.analyzedAt || timestamp
        },
        recovery: {
          instruction: 'このファイルの内容を使用してSlack投稿を再実行できます',
          slackChannelId: process.env.SLACK_CHANNEL_ID,
          recommendedAction: 'manual_slack_post_retry'
        }
      };

      // JSONファイルとして保存
      const fileName = `slack_failure_${meetingId}_${timestamp.replace(/[:.]/g, '-')}.json`;
      const localTempPath = path.join(process.cwd(), 'tmp', fileName);
      
      // ローカル一時ファイルとして保存
      await fs.ensureDir(path.dirname(localTempPath));
      await fs.writeJson(localTempPath, failureData, { spaces: 2 });
      
      logger.error(`Slack post failure data saved locally: ${localTempPath}`, {
        meetingId: meetingId,
        meetingTopic: meetingInfo.topic,
        errorType: error.name,
        dataSize: JSON.stringify(failureData).length
      });

      // Google Driveにも保存（可能であれば）
      if (this.initialized) {
        try {
          // エラーログ専用フォルダを確保
          const errorFolderId = await this.googleDriveService.ensureFolder('Error_Recovery_Logs');
          const slackErrorFolderId = await this.googleDriveService.ensureFolder('Slack_Post_Failures', errorFolderId);
          
          // Google Driveにアップロード
          const uploadResult = await this.googleDriveService.uploadFile(
            localTempPath,
            fileName,
            slackErrorFolderId,
            `Slack post failure recovery data for meeting: ${meetingInfo.topic} at ${timestamp}`
          );

          logger.info(`Slack post failure data also saved to Google Drive`, {
            fileId: uploadResult.fileId,
            fileName: fileName,
            folderId: slackErrorFolderId
          });

          // ローカル一時ファイルを削除
          await fs.remove(localTempPath);

          return {
            saved: true,
            location: 'google_drive',
            fileId: uploadResult.fileId,
            fileName: fileName,
            localPath: null
          };

        } catch (driveError) {
          logger.warn(`Failed to save to Google Drive, keeping local file: ${driveError.message}`);
          
          return {
            saved: true,
            location: 'local_only',
            fileId: null,
            fileName: fileName,
            localPath: localTempPath
          };
        }
      } else {
        return {
          saved: true,
          location: 'local_only',
          fileId: null,
          fileName: fileName,
          localPath: localTempPath
        };
      }

    } catch (saveError) {
      logger.error('Failed to save Slack post failure data:', saveError.message);
      return {
        saved: false,
        error: saveError.message
      };
    }
  }

  /**
   * 一般的なエラーログの保存
   */
  async saveErrorLog(errorType, errorData, context = {}) {
    try {
      await this.initialize();

      const timestamp = new Date().toISOString();
      const logData = {
        timestamp: timestamp,
        errorType: errorType,
        error: {
          message: errorData.message,
          stack: errorData.stack,
          name: errorData.name
        },
        context: context,
        environment: {
          nodeEnv: process.env.NODE_ENV,
          vercel: !!process.env.VERCEL,
          region: process.env.VERCEL_REGION
        }
      };

      const fileName = `error_${errorType}_${timestamp.replace(/[:.]/g, '-')}.json`;
      const localTempPath = path.join(process.cwd(), 'tmp', fileName);
      
      // ローカル保存
      await fs.ensureDir(path.dirname(localTempPath));
      await fs.writeJson(localTempPath, logData, { spaces: 2 });
      
      logger.error(`Error log saved: ${errorType}`, {
        fileName: fileName,
        contextKeys: Object.keys(context)
      });

      // Google Drive保存（オプション）
      if (this.initialized) {
        try {
          const errorFolderId = await this.googleDriveService.ensureFolder('Error_Recovery_Logs');
          const generalErrorFolderId = await this.googleDriveService.ensureFolder('General_Errors', errorFolderId);
          
          await this.googleDriveService.uploadFile(
            localTempPath,
            fileName,
            generalErrorFolderId,
            `Error log: ${errorType} at ${timestamp}`
          );

          await fs.remove(localTempPath);
        } catch (driveError) {
          logger.warn(`Error log saved locally only: ${driveError.message}`);
        }
      }

    } catch (saveError) {
      logger.error(`Failed to save error log for ${errorType}:`, saveError.message);
    }
  }

  /**
   * 処理ステップの失敗データ保存
   */
  async saveProcessingFailure(stepName, meetingInfo, inputData, error, partialResults = {}) {
    try {
      const failureData = {
        timestamp: new Date().toISOString(),
        failedStep: stepName,
        meeting: {
          id: meetingInfo.id || meetingInfo.meetingId,
          topic: meetingInfo.topic,
          startTime: meetingInfo.startTime
        },
        inputData: inputData,
        partialResults: partialResults,
        error: {
          message: error.message,
          stack: error.stack,
          type: error.constructor.name
        },
        recovery: {
          instruction: `Resume processing from step: ${stepName}`,
          nextSteps: this.getNextStepsForFailedStep(stepName)
        }
      };

      await this.saveErrorLog(`processing_failure_${stepName}`, error, failureData);

    } catch (saveError) {
      logger.error(`Failed to save processing failure for step ${stepName}:`, saveError.message);
    }
  }

  /**
   * 失敗したステップに応じた次のアクションを提案
   */
  getNextStepsForFailedStep(stepName) {
    const stepRecoveryMap = {
      'transcription': [
        'Check audio file format and size',
        'Retry with different Gemini model',
        'Consider audio file compression'
      ],
      'summary_generation': [
        'Retry with shorter transcription excerpt',
        'Use fallback summary template',
        'Manual summary creation'
      ],
      'google_drive_save': [
        'Check Google Drive API credentials',
        'Verify folder permissions',
        'Retry with smaller file size'
      ],
      'slack_post': [
        'Use saved analysis data for manual post',
        'Check Slack bot permissions',
        'Post to alternative channel'
      ]
    };

    return stepRecoveryMap[stepName] || ['Manual intervention required'];
  }
}

module.exports = ErrorRecoveryLogger;