const { WebClient } = require('@slack/web-api');
const config = require('../config');
const logger = require('../utils/logger');
const ErrorRecoveryLogger = require('../utils/errorRecoveryLogger');

class SlackService {
  constructor() {
    this.client = new WebClient(config.slack.botToken);
    this.channelId = config.slack.channelId;
    this.errorRecoveryLogger = new ErrorRecoveryLogger();
  }

  /**
   * 会議要約をSlackに送信（従来版・互換性維持）
   */
  async sendMeetingSummary(analysisResult) {
    try {
      // Slack通知が無効化されている場合、または本番安全モードの場合はログ出力のみ
      if (config.development.disableSlackNotifications || config.productionTest.logSlackInsteadOfSend) {
        const logData = {
          type: 'SLACK_MEETING_SUMMARY',
          timestamp: new Date().toISOString(),
          meetingInfo: analysisResult.meetingInfo,
          summary: analysisResult.summary,
          participants: analysisResult.participants,
          actionItems: analysisResult.actionItems,
          decisions: analysisResult.decisions,
          blocks: this.buildSummaryBlocks(analysisResult)
        };
        
        logger.info('=== SLACK MESSAGE LOG (PRODUCTION SAFE MODE) ===');
        logger.info(JSON.stringify(logData, null, 2));
        logger.info('=== END SLACK MESSAGE LOG ===');
        
        return { 
          ts: 'logged_only',
          message: 'Slack message logged instead of sent (production safe mode)',
          logData: logData
        };
      }

      logger.info(`Sending meeting summary to Slack: ${analysisResult.meetingInfo.topic}`);

      // Slack ブロック形式で整理されたメッセージを作成
      const blocks = this.buildSummaryBlocks(analysisResult);

      // Slack投稿前に要約の完全性を検証
      const summaryValidation = this.validateSummaryContent(analysisResult, blocks);
      if (!summaryValidation.isComplete) {
        logger.warn('Summary content may be truncated:', summaryValidation.warnings);
      }

      const result = await this.client.chat.postMessage({
        channel: this.channelId,
        blocks: blocks,
        text: `会議要約: ${analysisResult.meetingInfo.topic}`, // フォールバック用テキスト
        unfurl_links: false,
        unfurl_media: false
      });

      logger.info(`Meeting summary sent to Slack successfully: ${result.ts}`);
      
      // 要約が不完全な場合は警告ログ
      if (!summaryValidation.isComplete) {
        logger.warn(`Summary truncation detected for meeting: ${analysisResult.meetingInfo.topic}`, summaryValidation.warnings);
      }

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
    const { meetingInfo, summary, participants, decisions } = analysisResult;
    
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
          text: `*🕐 開催日時:*\\n${this.formatMeetingStartTime(meetingInfo)}`
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

    // アクションアイテム（宿題セクション）は削除

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
   * 要約内容の完全性を検証
   */
  validateSummaryContent(analysisResult, blocks) {
    const warnings = [];
    let isComplete = true;

    try {
      // 元の要約の長さをチェック
      const originalSummary = analysisResult.summary || '';
      if (originalSummary.length === 0) {
        warnings.push('Original summary is empty');
        isComplete = false;
      }

      // Slackブロック内の要約テキストを取得
      const summaryBlock = blocks.find(block => 
        block.type === 'section' && 
        block.text && 
        block.text.text && 
        block.text.text.includes('*📄 要約*')
      );

      if (summaryBlock) {
        const slackSummaryText = summaryBlock.text.text.replace(/\*📄 要約\*\\n/, '');
        
        // 元の要約と比べて著しく短い場合は警告
        if (originalSummary.length > 500 && slackSummaryText.length < originalSummary.length * 0.3) {
          warnings.push(`Summary severely truncated: ${slackSummaryText.length}/${originalSummary.length} characters`);
          isComplete = false;
        }

        // 「...」で終わっている場合は不完全
        if (slackSummaryText.includes('...') || slackSummaryText.includes('。…')) {
          warnings.push('Summary contains truncation indicators');
          isComplete = false;
        }
      } else {
        warnings.push('Summary block not found in Slack message');
        isComplete = false;
      }

    } catch (error) {
      warnings.push(`Validation error: ${error.message}`);
      isComplete = false;
    }

    return { isComplete, warnings };
  }

  /**
   * 会議開始時刻を適切にフォーマット
   */
  formatMeetingStartTime(meetingInfo) {
    try {
      // 複数の可能な日付フィールドを確認
      const timeSource = meetingInfo.startTime || meetingInfo.start_time || meetingInfo.recordingStart;
      
      if (!timeSource) {
        return '不明';
      }
      
      const date = new Date(timeSource);
      if (isNaN(date.getTime())) {
        // 日付が無効な場合、元の文字列をそのまま返す
        return timeSource.toString();
      }
      
      return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Tokyo'
      });
    } catch (error) {
      logger.warn('Failed to format meeting start time:', error.message);
      return '日時不明';
    }
  }

  /**
   * 要約から重要な部分を抽出
   */
  extractShortSummary(summary) {
    try {
      // Slack制限: 単一text要素は3000文字まで、マージン考慮して2700文字（エンドマーカー用に余裕を持たせる）
      const SLACK_TEXT_LIMIT = 2700;
      const END_MARKER = '\n\n---\n📋 要約ここまで ✅';
      
      // 全体の要約を可能な限り表示（短縮しすぎない）
      if (summary.length <= SLACK_TEXT_LIMIT) {
        return summary + END_MARKER; // 制限内なら全文表示＋エンドマーカー
      }

      // 制限を超える場合のみ、文章の区切りで切り詰め
      const availableSpace = SLACK_TEXT_LIMIT - END_MARKER.length;
      const truncated = summary.substring(0, availableSpace);
      const lastPeriod = Math.max(
        truncated.lastIndexOf('。'),
        truncated.lastIndexOf('．'),
        truncated.lastIndexOf('\n\n'),
        truncated.lastIndexOf('\n###')
      );
      
      // 70%以上の位置で適切な区切りが見つかれば、そこで切る
      if (lastPeriod > availableSpace * 0.7) {
        return truncated.substring(0, lastPeriod + 1) + '\n\n---\n📋 要約途中で切断 ⚠️\n*完全版は添付の実行ログファイルをご確認ください*';
      }
      
      // 適切な区切りが見つからない場合、制限ギリギリで切る
      return truncated + '\n\n---\n📋 要約途中で切断 ⚠️\n*完全版は添付の実行ログファイルをご確認ください*';
      
    } catch (error) {
      logger.warn('Failed to extract short summary:', error.message);
      return summary + '\n\n---\n📋 要約ここまで ✅'; // エラー時も安全にエンドマーカー追加
    }
  }

  /**
   * 文字起こしファイルを送信
   */
  async sendTranscriptionFile(analysisResult) {
    try {
      // Slack通知が無効化されている場合はログ出力のみ
      if (config.development.disableSlackNotifications) {
        logger.info(`Slack notifications disabled - would send transcription file for: ${analysisResult.meetingInfo.topic}`);
        return;
      }

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
      // Slack通知が無効化されている場合はログ出力のみ
      if (config.development.disableSlackNotifications) {
        logger.info(`Slack notifications disabled - would send error notification: ${error.message}`);
        return { message: 'Error notification disabled in development mode' };
      }

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
      // Slack通知が無効化されている場合はログ出力のみ
      if (config.development.disableSlackNotifications) {
        logger.info(`Slack notifications disabled - would send processing notification: ${meetingInfo.topic}`);
        return 'disabled';
      }

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
      // Slack通知が無効化されている場合はログ出力のみ
      if (config.development.disableSlackNotifications) {
        logger.info('Slack notifications disabled - would send test message');
        return { 
          ts: 'disabled',
          message: 'Test message disabled in development mode'
        };
      }

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
   * 会議要約と録画リンクをSlackに送信（エラー回復機能付き）
   */
  async sendMeetingSummaryWithRecording(analysisResult, driveResult, executionLogResult = null) {
    const maxRetries = 3;
    let lastError = null;

    // Slack通知が無効化されている場合はログ出力のみ
    if (config.development.disableSlackNotifications) {
      logger.info(`Slack notifications disabled - would send meeting summary with recording: ${analysisResult.meetingInfo.topic}`);
      logger.info(`Recording would be shared at: ${driveResult.viewLink}`);
      return { 
        ts: 'disabled',
        message: 'Meeting summary with recording disabled in development mode'
      };
    }

    // 3回リトライで Slack 投稿を試行
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Attempting to send meeting summary to Slack (${attempt}/${maxRetries}): ${analysisResult.meetingInfo.topic}`);

        // Slack ブロック形式で整理されたメッセージを作成（録画リンク付き）
        const blocks = this.buildSummaryBlocksWithRecording(analysisResult, driveResult, executionLogResult);

        const result = await this.client.chat.postMessage({
          channel: this.channelId,
          blocks: blocks,
          text: `会議要約と録画: ${analysisResult.meetingInfo.topic}`, // フォールバック用テキスト
          unfurl_links: false,
          unfurl_media: false
        });

        logger.info(`Meeting summary with recording link sent to Slack successfully on attempt ${attempt}: ${result.ts}`);

        // ファイルとして文字起こし全文も送信（必要に応じて）
        if (analysisResult.transcription && analysisResult.transcription.length > 0) {
          try {
            await this.sendTranscriptionFile(analysisResult);
          } catch (fileError) {
            logger.warn(`Failed to send transcription file, but main message succeeded: ${fileError.message}`);
          }
        }

        return result;

      } catch (error) {
        lastError = error;
        logger.warn(`Slack post attempt ${attempt}/${maxRetries} failed for ${analysisResult.meetingInfo.topic}: ${error.message}`);
        
        // 最後の試行でない場合は短い待機
        if (attempt < maxRetries) {
          const waitTime = 2000 * attempt; // 2秒、4秒、6秒
          logger.info(`Waiting ${waitTime}ms before Slack retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // 全ての試行が失敗した場合、要約データを保存
    logger.error(`All ${maxRetries} Slack post attempts failed for ${analysisResult.meetingInfo.topic}. Saving data for recovery.`);
    
    try {
      const saveResult = await this.errorRecoveryLogger.saveSlackPostFailure(
        analysisResult.meetingInfo,
        analysisResult,
        lastError,
        { attemptCount: maxRetries, finalAttempt: true }
      );
      
      logger.info(`Meeting summary data saved for manual recovery`, {
        saved: saveResult.saved,
        location: saveResult.location,
        fileName: saveResult.fileName,
        fileId: saveResult.fileId
      });

      // Slack投稿は失敗したが、データは保存されたことを示すエラー
      const dataPreservedError = new Error(`Slack post failed after ${maxRetries} attempts, but meeting data has been preserved for manual recovery. Last error: ${lastError.message}`);
      dataPreservedError.dataPreserved = true;
      dataPreservedError.recoveryInfo = saveResult;
      
      throw dataPreservedError;
      
    } catch (saveError) {
      logger.error(`Failed to save meeting data for recovery: ${saveError.message}`);
      
      // データ保存も失敗した場合は、元のエラーをそのまま投げる
      throw lastError;
    }
  }

  /**
   * 録画リンク付き要約用のSlackブロックを構築
   */
  buildSummaryBlocksWithRecording(analysisResult, driveResult, executionLogResult = null) {
    const { meetingInfo, summary, participants, decisions } = analysisResult;
    
    const blocks = [];

    // ヘッダー（録画リンク付き）
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `📋 ${meetingInfo.topic}`
      }
    });

    // 録画リンクセクション（実行ログリンク付き）
    let linkText = `🎥 *録画ファイル:* <${driveResult.viewLink || 'リンク取得中'}|Google Driveで視聴>\n📁 *保存場所:* ${driveResult.folderPath || 'Zoom録画フォルダ'}\n⏱️ *開催日時:* ${this.formatMeetingStartTime(meetingInfo)}\n🕐 *時間:* ${meetingInfo.duration}分`;
    
    // 実行ログリンクを追加
    if (executionLogResult && executionLogResult.success && executionLogResult.viewLink) {
      linkText += `\n📋 *実行ログ:* <${executionLogResult.viewLink}|処理詳細を確認>`;
    }
    
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: linkText
      }
    });

    blocks.push({ type: "divider" });

    // 要約セクション
    if (summary) {
      const shortSummary = this.extractShortSummary(summary);
      if (shortSummary) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📝 会議要約*\n${shortSummary}`
          }
        });
      }
    }

    // 参加者情報
    if (participants && participants.length > 0) {
      const participantList = participants.map(p => 
        `• ${p.name}${p.role ? ` (${p.role})` : ''}`
      ).join('\n');
      
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*👥 参加者*\n${participantList}`
        }
      });
    }

    // 決定事項
    if (decisions && decisions.length > 0) {
      const decisionList = decisions.map((decision, index) => 
        `${index + 1}. ${decision.decision}`
      ).join('\n');
      
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*✅ 決定事項*\n${decisionList}`
        }
      });
    }

    // アクションアイテム（宿題セクション）は削除

    // フッター
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `🤖 自動生成 | 📅 ${new Date().toLocaleString('ja-JP')} | 📊 処理時間: ${driveResult.uploadTime || 0}秒`
        }
      ]
    });

    return blocks;
  }

  /**
   * 汎用的なSlack通知送信（本番安全モード対応）
   */
  async sendNotification(message) {
    try {
      // 本番安全モードの場合はログ出力のみ
      if (config.productionTest.logSlackInsteadOfSend) {
        const logData = {
          type: 'SLACK_NOTIFICATION',
          timestamp: new Date().toISOString(),
          message: message
        };
        
        logger.info('=== SLACK NOTIFICATION LOG (PRODUCTION SAFE MODE) ===');
        logger.info(JSON.stringify(logData, null, 2));
        logger.info('=== END SLACK NOTIFICATION LOG ===');
        
        return { 
          success: true,
          ts: 'logged_only',
          message: 'Notification logged instead of sent (production safe mode)',
          logData: logData
        };
      }

      // 開発モードでの無効化チェック
      if (config.development.disableSlackNotifications) {
        logger.info('Slack notifications disabled in development mode');
        return { 
          success: true,
          ts: 'disabled',
          message: 'Slack notifications disabled in development mode'
        };
      }

      // 実際にSlackに送信
      const result = await this.client.chat.postMessage({
        channel: this.channelId,
        ...message
      });

      logger.info('Notification sent to Slack successfully');
      return { 
        success: true,
        ts: result.ts,
        channel: result.channel
      };

    } catch (error) {
      logger.error('Failed to send notification to Slack:', error.message);
      return {
        success: false,
        error: error.message
      };
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