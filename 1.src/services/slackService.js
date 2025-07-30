const { WebClient } = require('@slack/web-api');
const config = require('../config');
const logger = require('../utils/logger');

class SlackService {
  constructor() {
    this.client = new WebClient(config.slack.botToken);
    this.channelId = config.slack.channelId;
  }

  /**
   * 会議要約をSlackに送信
   */
  async sendMeetingSummary(analysisResult) {
    try {
      logger.info(`Sending meeting summary to Slack: ${analysisResult.meetingInfo.topic}`);

      // Slack ブロック形式で整理されたメッセージを作成
      const blocks = this.buildSummaryBlocks(analysisResult);

      const result = await this.client.chat.postMessage({
        channel: this.channelId,
        blocks: blocks,
        text: `会議要約: ${analysisResult.meetingInfo.topic}`, // フォールバック用テキスト
        unfurl_links: false,
        unfurl_media: false
      });

      logger.info(`Meeting summary sent to Slack successfully: ${result.ts}`);

      // ファイルとして文字起こし全文も送信（必要に応じて）
      if (analysisResult.transcription && analysisResult.transcription.length > 0) {
        await this.sendTranscriptionFile(analysisResult);
      }

      return result;

    } catch (error) {
      logger.error('Failed to send meeting summary to Slack:', error.message);
      throw error;
    }
  }

  /**
   * 要約用のSlackブロックを構築
   */
  buildSummaryBlocks(analysisResult) {
    const { meetingInfo, summary, participants, actionItems, decisions } = analysisResult;
    
    const blocks = [];

    // ヘッダー
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `📝 ${meetingInfo.topic}`
      }
    });

    // 基本情報
    blocks.push({
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*🕐 開催日時:*\\n${new Date(meetingInfo.startTime).toLocaleString('ja-JP')}`
        },
        {
          type: "mrkdwn",
          text: `*⏱️ 時間:*\\n${meetingInfo.duration}分`
        },
        {
          type: "mrkdwn",
          text: `*👤 主催者:*\\n${meetingInfo.hostName}`
        },
        {
          type: "mrkdwn",
          text: `*👥 参加者数:*\\n${participants.length}名`
        }
      ]
    });

    // 区切り線
    blocks.push({ type: "divider" });

    // 参加者情報
    if (participants.length > 0) {
      const participantText = participants
        .map(p => `• ${p.name}${p.role ? ` (${p.role})` : ''}`)
        .join('\\n');

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*👥 参加者*\\n${participantText}`
        }
      });
    }

    // 決定事項
    if (decisions.length > 0) {
      const decisionText = decisions
        .map((d, index) => `${index + 1}. ${d.decision}${d.implementationDate ? ` (実施: ${d.implementationDate})` : ''}`)
        .join('\\n');

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*✅ 決定事項*\\n${decisionText}`
        }
      });
    }

    // アクションアイテム
    if (actionItems.length > 0) {
      const actionText = actionItems
        .map((item, index) => {
          const priority = item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢';
          const dueDate = item.dueDate ? ` (期限: ${item.dueDate})` : '';
          return `${index + 1}. ${priority} ${item.task}\\n   👤 ${item.assignee || '未指定'}${dueDate}`;
        })
        .join('\\n\\n');

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📋 Next Actions*\\n${actionText}`
        }
      });
    }

    // 要約（短縮版）
    if (summary) {
      const shortSummary = this.extractShortSummary(summary);
      if (shortSummary) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📄 要約*\\n${shortSummary}`
          }
        });
      }
    }

    // フッター
    blocks.push({ type: "divider" });
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `🤖 自動生成 | 📅 ${new Date().toLocaleString('ja-JP')} | 🎬 Zoom Recording Auto-Summary`
        }
      ]
    });

    return blocks;
  }

  /**
   * 要約から重要な部分を抽出
   */
  extractShortSummary(summary) {
    try {
      // 議論内容の部分を抽出（最大300文字）
      const discussionMatch = summary.match(/### 議論内容\s*([\s\S]*?)(?=###|$)/);
      if (discussionMatch) {
        let discussion = discussionMatch[1].trim();
        if (discussion.length > 300) {
          discussion = discussion.substring(0, 300) + '...';
        }
        return discussion;
      }

      // フォールバック: 全体から最初の300文字
      if (summary.length > 300) {
        return summary.substring(0, 300) + '...';
      }
      
      return summary;
    } catch (error) {
      logger.warn('Failed to extract short summary:', error.message);
      return null;
    }
  }

  /**
   * 文字起こしファイルを送信
   */
  async sendTranscriptionFile(analysisResult) {
    try {
      const filename = `${analysisResult.meetingInfo.topic}_${new Date(analysisResult.meetingInfo.startTime).toISOString().split('T')[0]}.txt`;
      
      const fileContent = `会議文字起こし
==================

会議名: ${analysisResult.meetingInfo.topic}
日時: ${new Date(analysisResult.meetingInfo.startTime).toLocaleString('ja-JP')}
時間: ${analysisResult.meetingInfo.duration}分
主催者: ${analysisResult.meetingInfo.hostName}

文字起こし内容:
${analysisResult.transcription}

---
自動生成: ${new Date().toLocaleString('ja-JP')}`;

      await this.client.files.upload({
        channels: this.channelId,
        content: fileContent,
        filename: filename,
        filetype: 'text',
        title: `📝 ${analysisResult.meetingInfo.topic} - 文字起こし全文`,
        initial_comment: '文字起こしの全文です。詳細はこちらをご確認ください。'
      });

      logger.info('Transcription file uploaded to Slack successfully');

    } catch (error) {
      logger.error('Failed to upload transcription file to Slack:', error.message);
      // ファイル送信の失敗は致命的ではないのでthrowしない
    }
  }

  /**
   * エラー通知を送信
   */
  async sendErrorNotification(error, context = '') {
    try {
      const blocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🚨 処理エラーが発生しました"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*エラー内容:*\\n\`\`\`${error.message}\`\`\``
          }
        }
      ];

      if (context) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*コンテキスト:*\\n${context}`
          }
        });
      }

      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `🕐 ${new Date().toLocaleString('ja-JP')}`
          }
        ]
      });

      await this.client.chat.postMessage({
        channel: this.channelId,
        blocks: blocks,
        text: `エラー: ${error.message}`
      });

    } catch (slackError) {
      logger.error('Failed to send error notification to Slack:', slackError.message);
    }
  }

  /**
   * 処理開始通知
   */
  async sendProcessingNotification(meetingInfo) {
    try {
      const blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔄 *会議の処理を開始しました*\\n*会議名:* ${meetingInfo.topic}\\n*開始時刻:* ${new Date(meetingInfo.startTime).toLocaleString('ja-JP')}`
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "文字起こしと要約の生成中です。完了まで数分お待ちください..."
            }
          ]
        }
      ];

      const result = await this.client.chat.postMessage({
        channel: this.channelId,
        blocks: blocks,
        text: `処理開始: ${meetingInfo.topic}`
      });

      return result.ts; // メッセージのタイムスタンプを返す（後で更新可能）

    } catch (error) {
      logger.error('Failed to send processing notification:', error.message);
      return null;
    }
  }

  /**
   * テストメッセージを送信
   */
  async sendTestMessage() {
    try {
      const result = await this.client.chat.postMessage({
        channel: this.channelId,
        text: '🤖 Zoom Memo Automation システムのテストメッセージです。',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "🤖 *Zoom Memo Automation*\\n\\nシステムが正常に動作しています。\\n\\n✅ Slack連携確認完了"
            }
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `テスト実行時刻: ${new Date().toLocaleString('ja-JP')}`
              }
            ]
          }
        ]
      });

      logger.info('Test message sent to Slack successfully');
      return result;

    } catch (error) {
      logger.error('Failed to send test message to Slack:', error.message);
      throw error;
    }
  }

  /**
   * ヘルスチェック
   */
  async healthCheck() {
    try {
      // Bot の情報を取得してテスト
      const authResult = await this.client.auth.test();
      
      // チャンネル情報を取得
      const channelInfo = await this.client.conversations.info({
        channel: this.channelId
      });

      return {
        status: 'healthy',
        botUser: authResult.user,
        team: authResult.team,
        channel: channelInfo.channel.name
      };

    } catch (error) {
      logger.error('Slack service health check failed:', error.message);
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = SlackService;