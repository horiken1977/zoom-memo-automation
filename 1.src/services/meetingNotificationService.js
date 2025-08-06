const SlackService = require('./slackService');
const logger = require('../utils/logger');

class MeetingNotificationService {
  constructor() {
    this.slackService = new SlackService();
  }

  /**
   * 8項目の構造化要約と動画共有リンクをSlackに投稿
   * @param {Object} analysisResult - 音声要約結果（8項目構造化）
   * @param {Object} driveResult - GoogleDrive保存結果
   * @returns {Object} Slack投稿結果
   */
  async sendStructuredMeetingSummary(analysisResult, driveResult) {
    try {
      logger.info('Sending structured meeting summary to Slack...');

      // 8項目構造化メッセージを作成
      const slackMessage = this.buildStructuredSlackMessage(analysisResult, driveResult);

      // Slackに送信
      const slackResult = await this.slackService.sendMessage(slackMessage);

      logger.info('Structured meeting summary sent to Slack successfully');

      return {
        status: 'success',
        slackMessageId: slackResult.ts,
        channel: slackResult.channel,
        sentAt: new Date().toISOString(),
        messagePreview: this.getMessagePreview(slackMessage)
      };

    } catch (error) {
      logger.error('Failed to send structured meeting summary to Slack:', error.message);
      throw error;
    }
  }

  /**
   * 8項目構造化されたSlackメッセージを構築
   */
  buildStructuredSlackMessage(analysisResult, driveResult) {
    const meetingInfo = analysisResult.meetingInfo || {};
    const summary = analysisResult.analysis?.summary || 'Summary not available';
    
    // 日時フォーマット
    const startTime = meetingInfo.start_time ? 
      new Date(meetingInfo.start_time).toLocaleString('ja-JP') : 
      '不明';

    // 基本ヘッダー部分
    let message = `:memo: **会議要約レポート**\n\n`;
    message += `**会議名**: ${meetingInfo.topic || '不明'}\n`;
    message += `**開催日時**: ${startTime}\n`;
    message += `**時間**: ${meetingInfo.duration || '不明'}分\n\n`;

    // 動画リンク部分
    if (driveResult && driveResult.viewLink) {
      message += `:movie_camera: **録画動画**\n`;
      message += `<${driveResult.viewLink}|:arrow_forward: 録画を再生> (Google Drive)\n`;
      message += `ファイル名: ${driveResult.fileName || '不明'}\n`;
      if (driveResult.size) {
        const sizeMB = (driveResult.size / 1024 / 1024).toFixed(2);
        message += `ファイルサイズ: ${sizeMB}MB\n`;
      }
      message += `\n`;
    }

    // 8項目構造化要約部分
    message += `:page_with_curl: **詳細要約**\n`;
    message += '```\n';
    message += summary;
    message += '\n```\n\n';

    // フッター情報
    message += `_自動生成: ${new Date().toLocaleString('ja-JP')}_\n`;
    message += `_処理モデル: ${analysisResult.analysis?.model || 'unknown'}_`;

    return {
      text: message,
      channel: this.slackService.channelId,
      username: 'Meeting Memo Bot',
      icon_emoji: ':memo:',
      unfurl_links: false,
      unfurl_media: false
    };
  }

  /**
   * 処理開始通知を送信
   */
  async sendProcessingStartNotification(meetingInfo) {
    try {
      logger.info('Sending processing start notification to Slack...');

      const startTime = meetingInfo.start_time ? 
        new Date(meetingInfo.start_time).toLocaleString('ja-JP') : 
        '不明';

      const message = {
        text: `:hourglass_flowing_sand: **会議処理開始**\n\n` +
              `**会議名**: ${meetingInfo.topic || '不明'}\n` +
              `**開催日時**: ${startTime}\n` +
              `**時間**: ${meetingInfo.duration || '不明'}分\n\n` +
              `音声の文字起こしと要約を実行中です...\n` +
              `完了までしばらくお待ちください。`,
        channel: this.slackService.channelId,
        username: 'Meeting Memo Bot',
        icon_emoji: ':robot_face:'
      };

      const slackResult = await this.slackService.sendMessage(message);
      logger.info('Processing start notification sent successfully');

      return slackResult;

    } catch (error) {
      logger.error('Failed to send processing start notification:', error.message);
      throw error;
    }
  }

  /**
   * エラー通知を送信
   */
  async sendProcessingErrorNotification(meetingInfo, error) {
    try {
      logger.info('Sending processing error notification to Slack...');

      const startTime = meetingInfo.start_time ? 
        new Date(meetingInfo.start_time).toLocaleString('ja-JP') : 
        '不明';

      const message = {
        text: `:warning: **会議処理エラー**\n\n` +
              `**会議名**: ${meetingInfo.topic || '不明'}\n` +
              `**開催日時**: ${startTime}\n\n` +
              `**エラー内容**: ${error.message}\n\n` +
              `システム管理者にご連絡ください。`,
        channel: this.slackService.channelId,
        username: 'Meeting Memo Bot',
        icon_emoji: ':warning:'
      };

      const slackResult = await this.slackService.sendMessage(message);
      logger.info('Processing error notification sent successfully');

      return slackResult;

    } catch (slackError) {
      logger.error('Failed to send processing error notification:', slackError.message);
      throw slackError;
    }
  }

  /**
   * メッセージプレビューを取得（ログ用）
   */
  getMessagePreview(slackMessage) {
    const text = slackMessage.text || '';
    const preview = text.substring(0, 100);
    return preview.length < text.length ? preview + '...' : preview;
  }

  /**
   * 通知結果を検証
   */
  validateNotificationResult(result) {
    if (!result || !result.slackMessageId) {
      throw new Error('Invalid notification result: missing message ID');
    }
    return true;
  }

  /**
   * 通知統計情報を取得
   */
  getNotificationStats(result, analysisResult, driveResult) {
    return {
      messageId: result.slackMessageId,
      channel: result.channel,
      sentAt: result.sentAt,
      meetingTopic: analysisResult.meetingInfo?.topic || 'unknown',
      summaryLength: analysisResult.analysis?.summary?.length || 0,
      videoFileSize: driveResult?.size || 0,
      processingModel: analysisResult.analysis?.model || 'unknown'
    };
  }
}

module.exports = MeetingNotificationService;