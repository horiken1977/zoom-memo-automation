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
   * 実行ステップを記録（日本語説明付き構造化ログ）
   * @param {string} stepName - ステップ名
   * @param {string} status - SUCCESS/ERROR/WARN/INFO
   * @param {Object} details - 詳細情報
   * @param {string} errorCode - エラーコード（任意）
   * @param {string} errorMessage - エラーメッセージ（任意）
   * @param {string} sourceInfo - ソース情報（JSファイル名.メソッド名）
   * @param {string} description - 日本語での処理内容説明
   */
  logStep(stepName, status, details = {}, errorCode = null, errorMessage = null, sourceInfo = null, description = null) {
    const now = Date.now();
    const lastStep = this.steps[this.steps.length - 1];
    const stepDuration = lastStep ? now - lastStep.endTime : now - this.startTime;
    
    const step = {
      step: stepName,
      status: status,
      startTime: lastStep ? lastStep.endTime : this.startTime,
      endTime: now,
      duration: stepDuration,
      details: details,
      // 日本語情報追加
      description: description || this.getStepDescription(stepName, status),
      sourceInfo: sourceInfo || this.inferSourceInfo(stepName)
    };
    
    // エラー情報を追加
    if (errorCode) {
      step.errorCode = errorCode;
      step.errorMessage = errorMessage;
    }
    
    this.steps.push(step);
    
    // コンソールログにも日本語で出力
    const elapsed = Math.floor((now - this.startTime) / 1000);
    const statusIcon = this.getStatusIcon(status);
    const logMessage = description || this.getStepDescription(stepName, status);
    logger.info(`${statusIcon} [${this.executionId}] [${elapsed}s] ${logMessage}${sourceInfo ? ` (${sourceInfo})` : ''}${errorCode ? ` エラー: ${errorCode}` : ''}`);
    
    return step;
  }

  /**
   * ステップの日本語説明を生成
   */
  getStepDescription(stepName, status) {
    const descriptions = {
      // Zoom関連
      'ZOOM_RECORDINGS_LIST': 'Zoom録画リスト取得',
      'ZOOM_ALL_USERS_SEARCH': '全ユーザー録画検索',
      'PT001_REAL_RECORDING_START': 'PT001実録画処理開始',
      
      // 処理フロー
      'VIDEO_PROCESSING': '動画ファイル処理（ダウンロード→Google Drive保存）',
      'AUDIO_PROCESSING': '音声ファイル処理（ダウンロード→AI文字起こし・要約）',
      'RECORDING_COMPLETE_PROCESSING': '録画処理完了',
      
      // Slack通知
      'SLACK_NOTIFICATION': 'Slack通知送信',
      
      // ログ保存
      'PT001_TEST_COMPLETE': 'PT001テスト完了',
      'EXECUTION_LOG_SAVE': '実行ログGoogle Drive保存',
      
      // エラー処理
      'ERROR_RECOVERY': 'エラー回復処理',
      'RETRY_PROCESSING': 'リトライ処理実行'
    };

    const baseDescription = descriptions[stepName] || stepName;
    
    switch (status) {
      case 'SUCCESS':
        return `✅ ${baseDescription} - 正常完了`;
      case 'ERROR':
        return `❌ ${baseDescription} - エラー発生`;
      case 'WARN':
        return `⚠️ ${baseDescription} - 警告`;
      case 'INFO':
        return `ℹ️ ${baseDescription} - 情報`;
      default:
        return `${baseDescription}`;
    }
  }

  /**
   * ステータスアイコンを取得
   */
  getStatusIcon(status) {
    const icons = {
      'SUCCESS': '✅',
      'ERROR': '❌',
      'WARN': '⚠️',
      'INFO': 'ℹ️'
    };
    return icons[status] || '🔧';
  }

  /**
   * ソース情報を推測
   */
  inferSourceInfo(stepName) {
    const sourceMapping = {
      // Zoom関連
      'ZOOM_RECORDINGS_LIST': 'zoomRecordingService.js.getRecordingsList',
      'ZOOM_ALL_USERS_SEARCH': 'zoomRecordingService.js.getAllUsersRecordings',
      
      // 処理フロー
      'VIDEO_PROCESSING': 'zoomRecordingService.js.processVideoFile',
      'AUDIO_PROCESSING': 'zoomRecordingService.js.processAudioFile',
      'RECORDING_COMPLETE_PROCESSING': 'zoomRecordingService.js.processRecording',
      
      // Slack
      'SLACK_NOTIFICATION': 'slackService.js.sendMeetingSummary',
      
      // ログ
      'PT001_TEST_COMPLETE': 'production-throughput-test.js.runProductionThroughputTest',
      'EXECUTION_LOG_SAVE': 'executionLogger.js.saveToGoogleDrive'
    };

    return sourceMapping[stepName] || null;
  }

  /**
   * 処理成功をログ記録
   * @param {string} stepName - ステップ名
   * @param {Object} details - 詳細情報
   * @param {string} sourceInfo - ソース情報（任意）
   * @param {string} description - 処理説明（任意）
   */
  logSuccess(stepName, details = {}, sourceInfo = null, description = null) {
    return this.logStep(stepName, 'SUCCESS', details, null, null, sourceInfo, description);
  }

  /**
   * 処理エラーをログ記録
   * @param {string} stepName - ステップ名
   * @param {string} errorCode - エラーコード
   * @param {string} errorMessage - エラーメッセージ
   * @param {Object} details - 詳細情報
   * @param {string} sourceInfo - ソース情報（エラー時は詳細に記録）
   */
  logError(stepName, errorCode, errorMessage, details = {}, sourceInfo = null) {
    return this.logStep(stepName, 'ERROR', details, errorCode, errorMessage, sourceInfo);
  }

  /**
   * 警告をログ記録
   * @param {string} stepName - ステップ名
   * @param {string} message - 警告メッセージ
   * @param {Object} details - 詳細情報
   * @param {string} sourceInfo - ソース情報（任意）
   */
  logWarning(stepName, message, details = {}, sourceInfo = null) {
    return this.logStep(stepName, 'WARN', { warning: message, ...details }, null, null, sourceInfo);
  }

  /**
   * 情報をログ記録
   * @param {string} stepName - ステップ名
   * @param {Object} details - 詳細情報
   * @param {string} sourceInfo - ソース情報（任意）
   */
  logInfo(stepName, details = {}, sourceInfo = null) {
    return this.logStep(stepName, 'INFO', details, null, null, sourceInfo);
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
   * @param {string} sourceInfo - ソース情報（任意）
   */
  completeStep(stepName, result = {}, status = 'SUCCESS', sourceInfo = null) {
    const now = Date.now();
    const stepInfo = this.currentSteps.get(stepName);
    
    if (!stepInfo) {
      logger.warn(`⚠️ [${this.executionId}] ステップ "${stepName}" が開始されていません`);
      // startStepが呼ばれていない場合でも記録
      return this.logStep(stepName, status, result, null, null, sourceInfo);
    }
    
    const duration = now - stepInfo.startTime;
    const details = {
      ...stepInfo.details,
      ...result,
      duration
    };
    
    // ステップ完了を記録
    const completedStep = this.logStep(stepName, status, details, null, null, sourceInfo);
    
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
   * @param {string} sourceInfo - エラー発生箇所の詳細ソース情報
   */
  errorStep(stepName, errorCode, errorMessage, details = {}, sourceInfo = null) {
    return this.completeStep(stepName, {
      ...details,
      errorCode,
      errorMessage
    }, 'ERROR', sourceInfo);
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
   * 会議情報からクライアント名を抽出（VideoStorageServiceと同じロジック）
   */
  extractClientName() {
    // 1. 会議名からクライアント名を抽出
    if (this.meetingInfo.topic) {
      // パターン1: 「○○様_」形式
      const pattern1 = this.meetingInfo.topic.match(/^([一-龯ァ-ヶー\w]+様)_/);
      if (pattern1) {
        return pattern1[1];
      }
      
      // パターン2: 「株式会社○○_」形式
      const pattern2 = this.meetingInfo.topic.match(/^(株式会社[一-龯ァ-ヶー\w]+)_/);
      if (pattern2) {
        return pattern2[1];
      }
      
      // パターン3: 「○○株式会社_」形式
      const pattern3 = this.meetingInfo.topic.match(/^([一-龯ァ-ヶー\w]+株式会社)_/);
      if (pattern3) {
        return pattern3[1];
      }
      
      // パターン4: 「○○社_」形式
      const pattern4 = this.meetingInfo.topic.match(/^([一-龯ァ-ヶー\w]+社)_/);
      if (pattern4) {
        return pattern4[1];
      }
      
      // パターン5: 「○○グループ_」形式
      const pattern5 = this.meetingInfo.topic.match(/^([一-龯ァ-ヶー\w]+グループ)_/);
      if (pattern5) {
        return pattern5[1];
      }
      
      // パターン6: 「○○_」形式（汎用）
      const pattern6 = this.meetingInfo.topic.match(/^([一-龯ァ-ヶー\w]{2,15})_/);
      if (pattern6) {
        const candidate = pattern6[1];
        // 一般的な単語を除外
        const excludeWords = ['会議', '定例', '打合せ', '打ち合わせ', 'MTG', 'ミーティング', '相談', '説明会'];
        if (!excludeWords.includes(candidate)) {
          return candidate + '様';
        }
      }
    }
    
    // 2. AIで抽出されたクライアント名がある場合（summary情報から）
    if (this.meetingInfo.summary && this.meetingInfo.summary.client && this.meetingInfo.summary.client !== '不明') {
      return this.meetingInfo.summary.client;
    }
    
    // 3. フォールバック: 年月フォルダ
    const date = new Date(this.meetingInfo.start_time || new Date());
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
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

      // 保存先フォルダパス（直下にlogs）
      const date = new Date(this.meetingInfo.start_time || new Date());
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      
      // エラーテストの場合は専用フォルダ、通常処理はクライアント名ベース
      let folderPath;
      if (this.executionId.includes('error_test') || this.executionId.includes('TC301')) {
        folderPath = `99.zoom_memo_recording/${year}/${month}/logs/error_tests`;
      } else {
        const clientName = this.extractClientName();
        folderPath = `99.zoom_memo_recording/${year}/${month}/logs`;
      }

      // logsフォルダを作成（存在しない場合）
      const logsFolderId = await this.googleDriveService.createFolderStructure(folderPath);
      
      // ログファイルをバッファからアップロード
      const logBuffer = Buffer.from(logJson, 'utf8');
      const description = `実行ログファイル - ${this.meetingInfo.topic}\n\n` +
        `実行ID: ${this.executionId}\n` +
        `会議名: ${this.meetingInfo.topic}\n` +
        `開催日時: ${date.toLocaleString('ja-JP')}\n` +
        `処理結果: ${logData.summary.overallStatus}\n` +
        `処理時間: ${Math.floor(logData.summary.totalDuration / 1000)}秒\n` +
        `ステップ数: ${logData.summary.totalSteps}\n` +
        `成功: ${logData.summary.successSteps}, エラー: ${logData.summary.errorSteps}\n\n` +
        `自動生成: ${new Date().toLocaleString('ja-JP')}\n` +
        `システム: Zoom Meeting Automation`;
        
      const uploadResult = await this.googleDriveService.uploadFromBuffer(
        logBuffer,
        logFileName,
        logsFolderId,
        'application/json',
        description
      );

      // 共有リンクを生成
      const shareResult = await this.googleDriveService.createShareableLink(uploadResult.fileId);
      
      const result = {
        success: true,
        logFileName: logFileName,
        fileId: uploadResult.fileId,
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