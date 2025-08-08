/**
 * Zoom Memo Automation - 録画別実行ログ出力システム
 * 
 * 機能:
 * - 各録画ファイルの処理実行ログを個別ファイルで出力
 * - Google Driveの動画保存フォルダ内のlogsサブフォルダに自動保存
 * - 軽量化：成功・失敗・エラーコードのみ記録（詳細ログは除外）
 * - JSON形式での構造化ログ出力
 */

const GoogleDriveService = require('../services/googleDriveService');
const { ErrorManager } = require('./errorCodes');
const logger = require('./logger');

class ExecutionLogger {
  constructor(executionId, meetingInfo) {
    this.executionId = executionId || `exec_${new Date().toISOString().replace(/[:.]/g, '')}_${meetingInfo?.id || 'unknown'}`;
    this.meetingInfo = meetingInfo;
    this.startTime = Date.now();
    this.steps = [];
    this.currentSteps = new Map(); // 進行中のステップを追跡
    this.googleDriveService = null;
  }

  /**
   * 実行ステップを記録
   * @param {string} stepName - ステップ名
   * @param {string} status - SUCCESS/ERROR/WARN/INFO
   * @param {Object} details - 詳細情報
   * @param {string} errorCode - エラーコード（任意）
   * @param {string} errorMessage - エラーメッセージ（任意）
   */
  logStep(stepName, status, details = {}, errorCode = null, errorMessage = null) {
    const now = Date.now();
    const lastStep = this.steps[this.steps.length - 1];
    const stepDuration = lastStep ? now - lastStep.endTime : now - this.startTime;
    
    const step = {
      step: stepName,
      status: status,
      startTime: lastStep ? lastStep.endTime : this.startTime,
      endTime: now,
      duration: stepDuration,
      details: details
    };
    
    // エラー情報を追加
    if (errorCode) {
      step.errorCode = errorCode;
      step.errorMessage = errorMessage;
    }
    
    this.steps.push(step);
    
    // コンソールログにも出力（軽量版）
    const elapsed = Math.floor((now - this.startTime) / 1000);
    logger.info(`[${this.executionId}] [${elapsed}s] ${stepName}: ${status}${errorCode ? ` (${errorCode})` : ''}`);
    
    return step;
  }

  /**
   * 処理成功をログ記録
   * @param {string} stepName - ステップ名
   * @param {Object} details - 詳細情報
   */
  logSuccess(stepName, details = {}) {
    return this.logStep(stepName, 'SUCCESS', details);
  }

  /**
   * 処理エラーをログ記録
   * @param {string} stepName - ステップ名
   * @param {string} errorCode - エラーコード
   * @param {string} errorMessage - エラーメッセージ
   * @param {Object} details - 詳細情報
   */
  logError(stepName, errorCode, errorMessage, details = {}) {
    return this.logStep(stepName, 'ERROR', details, errorCode, errorMessage);
  }

  /**
   * 警告をログ記録
   * @param {string} stepName - ステップ名
   * @param {string} message - 警告メッセージ
   * @param {Object} details - 詳細情報
   */
  logWarning(stepName, message, details = {}) {
    return this.logStep(stepName, 'WARN', { warning: message, ...details });
  }

  /**
   * 情報をログ記録
   * @param {string} stepName - ステップ名
   * @param {Object} details - 詳細情報
   */
  logInfo(stepName, details = {}) {
    return this.logStep(stepName, 'INFO', details);
  }

  /**
   * ステップを開始
   * @param {string} stepName - ステップ名
   * @param {Object} details - 開始時の詳細情報
   */
  startStep(stepName, details = {}) {
    const now = Date.now();
    const stepInfo = {
      stepName,
      startTime: now,
      details
    };
    
    this.currentSteps.set(stepName, stepInfo);
    
    // 開始ログを出力
    const elapsed = Math.floor((now - this.startTime) / 1000);
    logger.info(`[${this.executionId}] [${elapsed}s] ${stepName}: STARTED`);
    
    return stepInfo;
  }

  /**
   * ステップを完了
   * @param {string} stepName - ステップ名
   * @param {Object} result - 完了時の結果情報
   * @param {string} status - 完了ステータス（SUCCESS/ERROR/WARN）
   */
  completeStep(stepName, result = {}, status = 'SUCCESS') {
    const now = Date.now();
    const stepInfo = this.currentSteps.get(stepName);
    
    if (!stepInfo) {
      logger.warn(`[${this.executionId}] Step "${stepName}" was not started`);
      // startStepが呼ばれていない場合でも記録
      return this.logStep(stepName, status, result);
    }
    
    const duration = now - stepInfo.startTime;
    const details = {
      ...stepInfo.details,
      ...result,
      duration
    };
    
    // ステップ完了を記録
    const completedStep = this.logStep(stepName, status, details);
    
    // 進行中のステップから削除
    this.currentSteps.delete(stepName);
    
    return completedStep;
  }

  /**
   * ステップをエラーで完了
   * @param {string} stepName - ステップ名
   * @param {string} errorCode - エラーコード
   * @param {string} errorMessage - エラーメッセージ
   * @param {Object} details - 詳細情報
   */
  errorStep(stepName, errorCode, errorMessage, details = {}) {
    return this.completeStep(stepName, {
      ...details,
      errorCode,
      errorMessage
    }, 'ERROR');
  }

  /**
   * 実行ログをJSON形式で生成
   * @returns {Object} 構造化ログデータ
   */
  generateLogData() {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;
    
    // ステップ統計を計算
    const stepStats = {
      successSteps: this.steps.filter(s => s.status === 'SUCCESS').length,
      errorSteps: this.steps.filter(s => s.status === 'ERROR').length,
      warnSteps: this.steps.filter(s => s.status === 'WARN').length,
      infoSteps: this.steps.filter(s => s.status === 'INFO').length
    };
    
    // 全体ステータスを判定
    let overallStatus = 'SUCCESS';
    if (stepStats.errorSteps > 0) {
      overallStatus = 'ERROR';
    } else if (stepStats.warnSteps > 0) {
      overallStatus = 'WARNING';
    }
    
    return {
      executionId: this.executionId,
      meetingInfo: {
        id: this.meetingInfo.id,
        uuid: this.meetingInfo.uuid,
        topic: this.meetingInfo.topic,
        startTime: this.meetingInfo.start_time,
        duration: this.meetingInfo.duration,
        hostName: this.meetingInfo.hostName,
        participantCount: this.meetingInfo.participantCount,
        originalFileName: this.meetingInfo.originalFileName
      },
      execution: {
        startTime: new Date(this.startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        totalDuration: totalDuration,
        overallStatus: overallStatus
      },
      steps: this.steps.map(step => ({
        ...step,
        startTime: new Date(step.startTime).toISOString(),
        endTime: new Date(step.endTime).toISOString()
      })),
      summary: {
        totalSteps: this.steps.length,
        ...stepStats,
        overallStatus: overallStatus,
        totalDuration: totalDuration
      },
      metadata: {
        logVersion: '1.0',
        generatedAt: new Date().toISOString(),
        system: 'Zoom Memo Automation'
      }
    };
  }

  /**
   * ログファイル名を生成
   * @returns {string} ログファイル名
   */
  generateLogFileName() {
    const date = new Date(this.meetingInfo.start_time || new Date());
    const dateStr = date.toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
    
    // 会議名をファイル名として使用（特殊文字を除去）
    const safeTopic = this.meetingInfo.topic
      .replace(/[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '') // 英数字・ひらがな・カタカナ・漢字のみ
      .replace(/\s+/g, '_') // スペースをアンダースコアに
      .slice(0, 50); // 最大50文字
    
    return `${dateStr}_${safeTopic}_${this.meetingInfo.id}_execution.json`;
  }

  /**
   * Google Driveにログファイルを保存
   * @returns {Promise<Object>} 保存結果
   */
  async saveToGoogleDrive() {
    try {
      if (!this.googleDriveService) {
        this.googleDriveService = new GoogleDriveService();
        await this.googleDriveService.initialize();
      }

      // ログデータを生成
      const logData = this.generateLogData();
      const logFileName = this.generateLogFileName();
      const logJson = JSON.stringify(logData, null, 2);

      // 保存先フォルダパス（動画保存と同じ構造）
      const date = new Date(this.meetingInfo.start_time || new Date());
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const folderPath = `99.zoom_memo_recording/${year}/${month}/logs`;

      // logsフォルダを作成（存在しない場合）
      const logsFolderId = await this.googleDriveService.createFolderStructure(folderPath);
      
      // ログファイルをアップロード
      const uploadResult = await this.googleDriveService.uploadFile(
        Buffer.from(logJson, 'utf8'),
        logFileName,
        'application/json',
        logsFolderId,
        `実行ログファイル - ${this.meetingInfo.topic}\n\n` +
        `実行ID: ${this.executionId}\n` +
        `会議名: ${this.meetingInfo.topic}\n` +
        `開催日時: ${date.toLocaleString('ja-JP')}\n` +
        `処理結果: ${logData.summary.overallStatus}\n` +
        `処理時間: ${Math.floor(logData.summary.totalDuration / 1000)}秒\n` +
        `ステップ数: ${logData.summary.totalSteps}\n` +
        `成功: ${logData.summary.successSteps}, エラー: ${logData.summary.errorSteps}\n\n` +
        `自動生成: ${new Date().toLocaleString('ja-JP')}\n` +
        `システム: Zoom Meeting Automation`
      );

      // 共有リンクを生成
      const shareResult = await this.googleDriveService.createShareableLink(uploadResult.id);
      
      const result = {
        success: true,
        logFileName: logFileName,
        fileId: uploadResult.id,
        folderPath: folderPath,
        viewLink: shareResult.viewLink,
        downloadLink: shareResult.downloadLink,
        uploadTime: uploadResult.uploadTime,
        savedAt: new Date().toISOString()
      };

      logger.info(`[${this.executionId}] 実行ログ保存完了: ${logFileName}`);
      return result;

    } catch (error) {
      logger.error(`[${this.executionId}] 実行ログ保存失敗:`, error);
      
      // Google Driveへの保存に失敗した場合はローカルログに記録
      const logData = this.generateLogData();
      logger.info(`[${this.executionId}] ログデータ:`, JSON.stringify(logData, null, 2));
      
      return {
        success: false,
        error: error.message,
        logData: logData // フォールバック用
      };
    }
  }

  /**
   * リトライ処理をログ記録
   * @param {string} stepName - ステップ名
   * @param {number} attemptNumber - 試行回数
   * @param {number} totalAttempts - 総試行回数
   * @param {string} reason - リトライ理由
   */
  logRetry(stepName, attemptNumber, totalAttempts, reason) {
    return this.logWarning(
      `${stepName}_retry_${attemptNumber}`,
      `リトライ実行中 (${attemptNumber}/${totalAttempts})`,
      { reason, attemptNumber, totalAttempts }
    );
  }

  /**
   * パフォーマンス情報をログ記録
   * @param {string} stepName - ステップ名
   * @param {Object} performanceData - パフォーマンスデータ
   */
  logPerformance(stepName, performanceData) {
    return this.logInfo(
      `${stepName}_performance`,
      { performance: performanceData }
    );
  }
}

/**
 * 実行ログ統合管理クラス
 */
class ExecutionLogManager {
  static activeLoggers = new Map();

  /**
   * 新しい実行ログを開始
   * @param {Object} meetingInfo - 会議情報
   * @param {string} executionId - 実行ID（オプション）
   * @returns {ExecutionLogger} 実行ログインスタンス
   */
  static startExecution(meetingInfo, executionId = null) {
    const logger = new ExecutionLogger(executionId, meetingInfo);
    this.activeLoggers.set(logger.executionId, logger);
    return logger;
  }

  /**
   * 実行ログを取得
   * @param {string} executionId - 実行ID
   * @returns {ExecutionLogger|null} 実行ログインスタンス
   */
  static getLogger(executionId) {
    return this.activeLoggers.get(executionId) || null;
  }

  /**
   * 実行ログを終了・保存
   * @param {string} executionId - 実行ID
   * @returns {Promise<Object>} 保存結果
   */
  static async finishExecution(executionId) {
    const logger = this.activeLoggers.get(executionId);
    if (!logger) {
      throw new Error(`Execution logger not found: ${executionId}`);
    }

    try {
      const result = await logger.saveToGoogleDrive();
      this.activeLoggers.delete(executionId);
      return result;
    } catch (error) {
      // エラーが発生してもロガーは削除
      this.activeLoggers.delete(executionId);
      throw error;
    }
  }

  /**
   * アクティブな実行ログ一覧を取得
   * @returns {Array} アクティブな実行ID配列
   */
  static getActiveExecutions() {
    return Array.from(this.activeLoggers.keys());
  }
}

module.exports = {
  ExecutionLogger,
  ExecutionLogManager
};