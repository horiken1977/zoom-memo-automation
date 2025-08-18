/**
 * Zoom Memo Automation - 統合エラーハンドリング
 * 
 * 機能:
 * - エラーコード体系と実行ログの統合
 * - リトライ処理の自動実行
 * - Slack通知（ログリンク付き）
 * - エラー発生時の適切な処理流れの管理
 */

const { ErrorManager } = require('./errorCodes');
const { ExecutionLogger } = require('./executionLogger');
const SlackService = require('../services/slackService');
const logger = require('./logger');

class IntegratedErrorHandler {
  constructor(executionLogger = null) {
    this.executionLogger = executionLogger;
    this.slackService = new SlackService();
    this.retryDelays = [60000, 120000, 240000, 480000, 960000]; // 1分, 2分, 4分, 8分, 16分
  }

  /**
   * エラーを処理（リトライ・通知を含む）
   * @param {string} errorCode - エラーコード
   * @param {string} stepName - ステップ名
   * @param {Object} context - コンテキスト情報
   * @param {Function} retryFunction - リトライする関数
   * @param {number} maxRetries - 最大リトライ回数（デフォルト5）
   * @returns {Promise<any>} 処理結果
   */
  async handleError(errorCode, stepName, context = {}, retryFunction = null, maxRetries = 5) {
    const error = ErrorManager.createError(errorCode, context);
    
    // 実行ログに記録
    if (this.executionLogger) {
      this.executionLogger.logError(stepName, errorCode, error.message, context);
    }

    // エラーログ出力
    logger.error(`[${stepName}] ${error.message} (${errorCode})`, context);

    // リトライ処理
    if (error.retryable && retryFunction && maxRetries > 0) {
      return await this.executeWithRetry(
        retryFunction,
        stepName,
        errorCode,
        maxRetries,
        context
      );
    }

    // 非リトライエラーまたは最終リトライ失敗の場合
    if (error.notifySlack) {
      await this.notifySlack(error, stepName, context);
    }

    // エラーを再throw
    const enrichedError = new Error(error.message);
    enrichedError.code = errorCode;
    enrichedError.retryable = error.retryable;
    enrichedError.context = context;
    throw enrichedError;
  }

  /**
   * 指数バックオフでリトライ実行
   * @param {Function} func - 実行する関数
   * @param {string} stepName - ステップ名
   * @param {string} originalErrorCode - 元のエラーコード
   * @param {number} maxRetries - 最大リトライ回数
   * @param {Object} context - コンテキスト情報
   * @returns {Promise<any>} 処理結果
   */
  async executeWithRetry(func, stepName, originalErrorCode, maxRetries, context = {}) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // リトライログ記録
        if (this.executionLogger && attempt > 1) {
          this.executionLogger.logRetry(
            stepName,
            attempt,
            maxRetries,
            `前回エラー: ${originalErrorCode}`
          );
        }

        // 待機時間計算（指数バックオフ）
        if (attempt > 1) {
          const delay = this.retryDelays[attempt - 2] || this.retryDelays[this.retryDelays.length - 1];
          logger.info(`[${stepName}] リトライ ${attempt}/${maxRetries} - ${delay/1000}秒待機中...`);
          await this.sleep(delay);
        }

        // 関数実行
        const result = await func();
        
        // 成功ログ記録
        if (this.executionLogger && attempt > 1) {
          this.executionLogger.logSuccess(
            `${stepName}_retry_success`,
            { attemptNumber: attempt, retriedAfterError: originalErrorCode }
          );
        }
        
        logger.info(`[${stepName}] リトライ成功 (試行${attempt}/${maxRetries})`);
        return result;

      } catch (error) {
        logger.warn(`[${stepName}] 試行${attempt}/${maxRetries}失敗:`, error.message);

        // 最後の試行で失敗した場合
        if (attempt === maxRetries) {
          // 最終リトライ失敗ログ
          if (this.executionLogger) {
            this.executionLogger.logError(
              `${stepName}_retry_final_failure`,
              error.code || 'E_SYSTEM_UNKNOWN',
              `${maxRetries}回のリトライ後も失敗: ${error.message}`,
              { originalError: originalErrorCode, attempts: maxRetries }
            );
          }

          // Slack通知（最終失敗時）
          const finalError = ErrorManager.createError(error.code || 'E_SYSTEM_UNKNOWN', {
            ...context,
            retryAttempts: maxRetries,
            originalError: originalErrorCode
          });
          
          if (finalError.notifySlack) {
            await this.notifySlack(finalError, `${stepName}_retry_exhausted`, context);
          }

          throw error;
        }
      }
    }
  }

  /**
   * 成功処理（ログ記録とパフォーマンス測定）
   * @param {string} stepName - ステップ名
   * @param {Object} result - 処理結果
   * @param {Object} performanceData - パフォーマンスデータ
   */
  logSuccess(stepName, result = {}, performanceData = {}) {
    if (this.executionLogger) {
      this.executionLogger.logSuccess(stepName, {
        result: result,
        performance: performanceData
      });
    }
    
    logger.info(`[${stepName}] 処理成功`, performanceData);
  }

  /**
   * 警告処理（ログ記録）
   * @param {string} stepName - ステップ名
   * @param {string} message - 警告メッセージ
   * @param {Object} context - コンテキスト情報
   */
  logWarning(stepName, message, context = {}) {
    if (this.executionLogger) {
      this.executionLogger.logWarning(stepName, message, context);
    }
    
    logger.warn(`[${stepName}] ${message}`, context);
  }

  /**
   * 情報処理（ログ記録）
   * @param {string} stepName - ステップ名
   * @param {Object} info - 情報データ
   */
  logInfo(stepName, info = {}) {
    if (this.executionLogger) {
      this.executionLogger.logInfo(stepName, info);
    }
    
    logger.info(`[${stepName}]`, info);
  }

  /**
   * Slack通知（エラー情報とログリンク付き）
   * @param {Object} error - エラーオブジェクト
   * @param {string} stepName - ステップ名
   * @param {Object} context - コンテキスト情報
   */
  async notifySlack(error, stepName, context = {}) {
    try {
      // 実行ログのリンクを生成（可能な場合）
      let logLink = null;
      if (this.executionLogger) {
        try {
          // ログを一時保存してリンクを取得
          const logResult = await this.executionLogger.saveToGoogleDrive();
          if (logResult.success) {
            logLink = logResult.viewLink;
          }
        } catch (logError) {
          logger.warn('実行ログリンクの生成に失敗:', logError.message);
        }
      }

      // Slack通知メッセージを構築
      const message = this.buildSlackMessage(error, stepName, context, logLink);
      
      // Slack送信
      await this.slackService.sendMessage(message);
      
      logger.info(`Slack通知送信完了: ${error.code} - ${stepName}`);

    } catch (slackError) {
      logger.error('Slack通知送信失敗:', slackError.message);
      // Slack通知失敗は処理を止めない
    }
  }

  /**
   * Slack通知メッセージを構築
   * @param {Object} error - エラーオブジェクト
   * @param {string} stepName - ステップ名
   * @param {Object} context - コンテキスト情報
   * @param {string} logLink - ログファイルリンク
   * @returns {Object} Slackメッセージオブジェクト
   */
  buildSlackMessage(error, stepName, context, logLink) {
    const emoji = error.retryable ? '⚠️' : '🚨';
    const urgency = error.retryable ? 'リトライ対象エラー' : '即座対応必要';
    
    let blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Zoom自動要約システムエラー`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*エラーコード:* ${error.code}`
          },
          {
            type: 'mrkdwn',
            text: `*緊急度:* ${urgency}`
          },
          {
            type: 'mrkdwn',
            text: `*処理ステップ:* ${stepName}`
          },
          {
            type: 'mrkdwn',
            text: `*発生時刻:* ${new Date(error.timestamp).toLocaleString('ja-JP')}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*エラー内容:*\n${error.message}\n\n*対処方法:*\n${error.troubleshooting}`
        }
      }
    ];

    // 会議情報があれば追加
    if (context.meetingInfo) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*会議情報:*\n• 会議名: ${context.meetingInfo.topic || '不明'}\n• 会議ID: ${context.meetingInfo.id || '不明'}\n• 開催日時: ${context.meetingInfo.start_time ? new Date(context.meetingInfo.start_time).toLocaleString('ja-JP') : '不明'}`
        }
      });
    }

    // ログリンクがあれば追加
    if (logLink) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*実行ログ:* <${logLink}|詳細ログを確認>`
        }
      });
    }

    // リトライ情報があれば追加
    if (context.retryAttempts) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `リトライ試行回数: ${context.retryAttempts}回 | 元エラー: ${context.originalError || '不明'}`
          }
        ]
      });
    }

    return {
      blocks: blocks,
      text: `${emoji} ${error.code}: ${error.message}` // フォールバック用
    };
  }

  /**
   * 指定時間待機
   * @param {number} ms - 待機時間（ミリ秒）
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 実行ログインスタンスを設定
   * @param {ExecutionLogger} executionLogger - 実行ログインスタンス
   */
  setExecutionLogger(executionLogger) {
    this.executionLogger = executionLogger;
  }
}

module.exports = {
  IntegratedErrorHandler
};