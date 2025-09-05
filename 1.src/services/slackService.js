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
      // テスト・本番問わず常にSlack送信を実行

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
          text: `🤖 自動生成 | 📅 ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} | 🎬 Zoom Recording Auto-Summary`
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
            text: `🔄 *会議の処理を開始しました*\\n*会議名:* ${meetingInfo.topic}\\n*開始時刻:* ${new Date(meetingInfo.startTime).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`
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
   * 会議要約と録画リンクをSlackに送信（エラー回復機能付き）
   */
  async sendMeetingSummaryWithRecording(analysisResult, driveResult, executionLogResult = null) {
    const maxRetries = 3;
    let lastError = null;

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
    const { meetingInfo, summary, participants, decisions, actionItems } = analysisResult;
    
    const blocks = [];

    // ヘッダー（録画リンク付き）
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `📋 ${meetingInfo.topic}`
      }
    });

    // 録画・文書リンクセクション（強化版）
    let linkText = `🎥 *録画ファイル:* <${driveResult.viewLink || 'リンク取得中'}|Google Driveで視聴>\n📁 *保存場所:* ${driveResult.folderPath || 'Zoom録画フォルダ'}\n⏱️ *開催日時:* ${this.formatMeetingStartTime(meetingInfo)}\n🕐 *時間:* ${meetingInfo.duration}分`;
    
    // 文書リンクを追加
    if (driveResult.documentLinks && driveResult.documentLinks.length > 0) {
      linkText += `\n\n📄 *生成された文書:*`;
      driveResult.documentLinks.forEach(doc => {
        const typeEmoji = doc.type === 'transcription' ? '📝' : 
                         doc.type === 'summary' ? '📋' : 
                         doc.type === 'structured' ? '📊' : '📄';
        const typeName = doc.type === 'transcription' ? '文字起こし' : 
                        doc.type === 'summary' ? '要約' : 
                        doc.type === 'structured' ? '構造化要約' : doc.type;
        linkText += `\n${typeEmoji} <${doc.viewLink}|${typeName}>`;
      });
    }
    
    // 実行ログリンクを追加
    if (executionLogResult && executionLogResult.success && executionLogResult.viewLink) {
      linkText += `\n📋 *実行ログ:* <${executionLogResult.viewLink}|処理詳細を確認>`;
    } else if (driveResult.logLink) {
      linkText += `\n📋 *実行ログ:* <${driveResult.logLink}|処理詳細を確認>`;
    }
    
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: linkText
      }
    });

    blocks.push({ type: "divider" });

    // 8項目構造化要約の表示（改善版）
    
    // 1. 会議目的（7項目構造対応）
    let meetingPurpose = analysisResult.structuredSummary?.meetingPurpose || 
                        analysisResult.summary?.meetingPurpose || 
                        analysisResult.analysis?.meetingPurpose;
    
    // 後方互換性（従来の概要形式）- データ型安全性確保
    if (!meetingPurpose && summary) {
      if (typeof summary === 'string') {
        // 文字列の場合は適切な長さで切り詰めて表示
        meetingPurpose = this.extractShortSummary(summary);
      } else if (summary.overview) {
        meetingPurpose = summary.overview;
      } else if (summary.summary) {
        // オブジェクトの場合は適切な長さで切り詰めて表示
        meetingPurpose = this.extractShortSummary(summary.summary);
      } else if (summary.meetingPurpose) {
        // 構造化要約の場合のフォールバック
        meetingPurpose = summary.meetingPurpose;
      }
    }
    
    if (meetingPurpose) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🎯 会議目的*\n${meetingPurpose}`
        }
      });
    }

    // 2. クライアント名（7項目構造対応）
    const clientName = analysisResult.structuredSummary?.clientName || 
                      analysisResult.summary?.clientName || 
                      analysisResult.analysis?.clientName ||
                      // 後方互換性
                      analysisResult.structuredSummary?.client || 
                      analysisResult.summary?.client || 
                      analysisResult.analysis?.client || 
                      this.extractClientFromMeetingName(meetingInfo.topic);
    
    if (clientName && clientName !== '不明') {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🏢 クライアント*\n${clientName}`
        }
      });
    }

    // 3. 出席者・会社名（7項目構造対応）
    let attendeesInfo = analysisResult.structuredSummary?.attendeesAndCompanies || 
                       analysisResult.summary?.attendeesAndCompanies || 
                       analysisResult.analysis?.attendeesAndCompanies || 
                       participants || [];
    
    if (attendeesInfo && attendeesInfo.length > 0) {
      const participantList = attendeesInfo.map(p => {
        if (typeof p === 'string') {
          return `• ${p}`;
        } else {
          let participantStr = `• ${p.name || p}`;
          if (p.company || p.organization) participantStr += ` (${p.company || p.organization})`;
          if (p.role) participantStr += ` - ${p.role}`;
          return participantStr;
        }
      }).join('\n');
      
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*👥 出席者・会社名*\n${participantList}`
        }
      });
    }

    // 4. 議論内容・論点（7項目構造対応）
    const discussions = analysisResult.structuredSummary?.discussionsByTopic || 
                       analysisResult.summary?.discussionsByTopic || 
                       analysisResult.analysis?.discussionsByTopic ||
                       // 後方互換性
                       analysisResult.structuredSummary?.discussions || 
                       analysisResult.summary?.discussions || 
                       analysisResult.analysis?.discussions || [];
    
    if (discussions && discussions.length > 0) {
      const discussionList = discussions.slice(0, 3).map((discussion, index) => {
        if (typeof discussion === 'string') {
          return `${index + 1}. ${discussion}`;
        } else {
          // 一時的コメントアウト: 簡潔版
          // let topicText = discussion.topicTitle || discussion.topic || discussion.content || discussion;
          // if (discussion.timeRange) {
          //   topicText += ` (${discussion.timeRange.startTime || ''}-${discussion.timeRange.endTime || ''})`;
          // }
          // return `${index + 1}. ${topicText}`;
          
          // 詳細版: AIServiceの7項目構造に対応した詳細表示
          let detailedText = `${index + 1}. **${discussion.topicTitle || discussion.topic || '論点'}**`;
          
          if (discussion.timeRange) {
            detailedText += `\n⏱️ 時間: ${discussion.timeRange.startTime || ''} ～ ${discussion.timeRange.endTime || ''}`;
          }
          
          // AIServiceのdiscussionFlow構造に対応
          if (discussion.discussionFlow) {
            if (discussion.discussionFlow.backgroundContext) {
              detailedText += `\n📝 背景: ${discussion.discussionFlow.backgroundContext}`;
            }
            
            if (discussion.discussionFlow.keyArguments && discussion.discussionFlow.keyArguments.length > 0) {
              detailedText += `\n👥 主要発言:`;
              discussion.discussionFlow.keyArguments.slice(0, 3).forEach((arg) => {
                if (arg.speaker) {
                  detailedText += `\n• **${arg.speaker}** (${arg.company || '不明'}) [${arg.timestamp || ''}]:`;
                  detailedText += `\n  主張: ${arg.argument ? arg.argument.substring(0, 150) : ''}${arg.argument && arg.argument.length > 150 ? '...' : ''}`;
                  if (arg.reasoning) {
                    detailedText += `\n  根拠: ${arg.reasoning.substring(0, 100)}${arg.reasoning.length > 100 ? '...' : ''}`;
                  }
                  if (arg.reactionFromOthers) {
                    detailedText += `\n  反応: ${arg.reactionFromOthers.substring(0, 80)}${arg.reactionFromOthers.length > 80 ? '...' : ''}`;
                  }
                }
              });
            }
            
            if (discussion.discussionFlow.logicalProgression) {
              detailedText += `\n🔄 論理展開: ${discussion.discussionFlow.logicalProgression.substring(0, 200)}${discussion.discussionFlow.logicalProgression.length > 200 ? '...' : ''}`;
            }
            
            if (discussion.discussionFlow.decisionProcess) {
              detailedText += `\n🎯 決定過程: ${discussion.discussionFlow.decisionProcess.substring(0, 150)}${discussion.discussionFlow.decisionProcess.length > 150 ? '...' : ''}`;
            }
          }
          
          // 後方互換性: 旧構造のspeakers/background/conclusionも参照
          else {
            if (discussion.background) {
              detailedText += `\n📝 背景: ${discussion.background}`;
            }
            
            if (discussion.speakers && discussion.speakers.length > 0) {
              detailedText += `\n👥 主要発言者:`;
              discussion.speakers.slice(0, 2).forEach((speaker) => {
                if (speaker.name && speaker.statement) {
                  detailedText += `\n• **${speaker.name}**: ${speaker.statement.substring(0, 100)}${speaker.statement.length > 100 ? '...' : ''}`;
                }
              });
            }
            
            if (discussion.conclusion) {
              detailedText += `\n✅ 結論: ${discussion.conclusion}`;
            }
          }
          
          // outcomeは新旧共通
          if (discussion.outcome) {
            detailedText += `\n✅ 結論: ${discussion.outcome}`;
          }
          
          return detailedText;
        }
      }).join('\n\n');
      
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*💭 論点・議論内容（時系列順）*\n${discussionList}${discussions.length > 3 ? '\n...（他にもあり）' : ''}`
        }
      });
    }

    // 5. 決定事項・結論
    if (decisions && decisions.length > 0) {
      const decisionList = decisions.map((decision, index) => {
        if (typeof decision === 'string') {
          return `${index + 1}. ${decision}`;
        } else {
          return `${index + 1}. ${decision.decision || decision.content || decision}`;
        }
      }).join('\n');
      
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*✅ 決定事項・結論*\n${decisionList}`
        }
      });
    }

    // 6. Next Action・Due Date（7項目構造対応）
    const nextActions = analysisResult.structuredSummary?.nextActionsWithDueDate || 
                       analysisResult.summary?.nextActionsWithDueDate || 
                       analysisResult.analysis?.nextActionsWithDueDate ||
                       // 後方互換性
                       analysisResult.structuredSummary?.homework || 
                       analysisResult.summary?.homework || 
                       analysisResult.analysis?.homework || [];
    
    if (nextActions && nextActions.length > 0) {
      const nextActionsList = nextActions.map((item, index) => {
        if (typeof item === 'string') {
          return `${index + 1}. ${item}`;
        } else {
          let actionText = `${index + 1}. ${item.action || item.task || item.content || item}`;
          if (item.assignee) actionText += ` (担当: ${item.assignee})`;
          if (item.dueDate) actionText += ` [期限: ${item.dueDate}]`;
          return actionText;
        }
      }).join('\n');
      
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📋 Next Action・Due Date*\n${nextActionsList}`
        }
      });
    }

    // 7. 資料（7項目構造対応）
    const materials = analysisResult.structuredSummary?.materials || 
                     analysisResult.summary?.materials || 
                     analysisResult.analysis?.materials || [];
    
    if (materials && materials.length > 0) {
      const materialsList = materials.map((material, index) => {
        if (typeof material === 'string') {
          return `${index + 1}. ${material}`;
        } else {
          let materialText = `${index + 1}. ${material.materialName || material.name || material.title || material}`;
          if (material.timestamp) materialText += ` (${material.timestamp})`;
          return materialText;
        }
      }).join('\n');
      
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📄 資料*\n${materialsList}`
        }
      });
    }
    
    // 従来のactionItemsとの重複排除（後方互換性）
    if (actionItems && actionItems.length > 0 && !nextActions.length) {
      const actionList = actionItems.map((action, index) => {
        if (typeof action === 'string') {
          return `${index + 1}. ${action}`;
        } else {
          let actionStr = `${index + 1}. ${action.task || action.action || action}`;
          if (action.assignee) actionStr += ` (担当: ${action.assignee})`;
          if (action.dueDate) actionStr += ` [期限: ${action.dueDate}]`;
          return actionStr;
        }
      }).join('\n');
      
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*⚡ Next Action (従来形式)*\n${actionList}`
        }
      });
    }

    // 処理統計情報
    const compressionStats = analysisResult.compressionStats;
    const realRecordingInfo = analysisResult.realRecordingInfo;
    
    if (realRecordingInfo || compressionStats) {
      let statsText = '';
      
      if (realRecordingInfo) {
        statsText += `📊 *処理統計:*\n`;
        statsText += `• 文字起こし: ${realRecordingInfo.transcriptionLength || 0}文字\n`;
        statsText += `• 処理時間: ${Math.floor((realRecordingInfo.executionTime || 0) / 1000)}秒\n`;
        statsText += `• 文書保存: ${realRecordingInfo.documentsSaved || 0}件\n`;
        if (realRecordingInfo.errors > 0) {
          statsText += `• エラー: ${realRecordingInfo.errors}件\n`;
        }
      }
      
      if (compressionStats) {
        statsText += `🗜️ *音声圧縮:* ${compressionStats.compressionRatio}% (${Math.round(compressionStats.originalSize/1024/1024*100)/100}MB→${Math.round(compressionStats.compressedSize/1024/1024*100)/100}MB)\n`;
      }
      
      if (statsText) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: statsText.trim()
          }
        });
      }
    }

    // フッター
    const footerText = realRecordingInfo?.testType || 'Zoom Meeting Automation';
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `🤖 ${footerText} | 📅 ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} | 📊 処理時間: ${driveResult.uploadTime || 0}秒`
        }
      ]
    });

    return blocks;
  }

  /**
   * 会議名からクライアント名を抽出（SlackService内部用）
   */
  extractClientFromMeetingName(meetingTopic) {
    if (!meetingTopic) return '不明';
    
    // パターン1: 「○○様_」形式
    const pattern1 = meetingTopic.match(/^([一-龯ァ-ヶー\\w]+様)_/);
    if (pattern1) return pattern1[1];
    
    // パターン2: 「株式会社○○_」形式
    const pattern2 = meetingTopic.match(/^(株式会社[一-龯ァ-ヶー\\w]+)_/);
    if (pattern2) return pattern2[1];
    
    // パターン3: 「○○株式会社_」形式
    const pattern3 = meetingTopic.match(/^([一-龯ァ-ヶー\\w]+株式会社)_/);
    if (pattern3) return pattern3[1];
    
    return '不明';
  }

  /**
   * 汎用的なSlack通知送信
   */
  async sendNotification(message) {
    try {
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
   * エラー通知を送信（管理者向け）
   * @param {Object} errorInfo - エラー情報
   * @param {string} errorInfo.type - エラータイプ
   * @param {string} errorInfo.error - エラーメッセージ
   * @param {Object} errorInfo.meetingInfo - 会議情報
   * @param {string} errorInfo.executionId - 実行ID
   * @param {Object} errorInfo.context - 追加コンテキスト
   */
  async sendErrorNotification(errorInfo) {
    try {
      logger.info(`Sending error notification to Slack: ${errorInfo.type}`);

      // エラーコード分析と対処法の特定
      const { ErrorManager } = require('../utils/errorCodes');
      let errorCode = 'E_SYSTEM_UNKNOWN'; // デフォルト
      let troubleshooting = 'ログを確認し、詳細情報を調査してください';

      // エラーメッセージからエラーコードを推定
      if (errorInfo.error) {
        if (errorInfo.error.includes('[503 Service Unavailable]') || errorInfo.error.includes('model is overloaded')) {
          errorCode = 'E_GEMINI_SERVICE_OVERLOAD';
        } else if (errorInfo.error.includes('[429 Too Many Requests]') || errorInfo.error.includes('quota')) {
          errorCode = 'E_GEMINI_QUOTA';
        } else if (errorInfo.error.includes('[500 Internal Server Error]')) {
          errorCode = 'E_GEMINI_INTERNAL_ERROR';
        } else if (errorInfo.error.includes('[401') || errorInfo.error.includes('[403')) {
          errorCode = 'E_GEMINI_PROCESSING';
        } else if (errorInfo.error.includes('Gemini')) {
          errorCode = 'E_GEMINI_GENERAL';
        } else if (errorInfo.error.includes('音声処理エラー')) {
          errorCode = 'RECORDING_PROCESSING_FAILED';
        }
      }

      // エラーコードから対処法を取得
      const errorDef = ErrorManager.getError(errorCode);
      if (errorDef && errorDef.troubleshooting) {
        troubleshooting = errorDef.troubleshooting;
      }

      // 特定のエラーに対する追加の対処法情報
      let actionableSteps = '';
      if (errorCode === 'E_GEMINI_SERVICE_OVERLOAD') {
        actionableSteps = `
📋 *サービス一時過負荷の対処法:*
• 1-2分待ってから再実行してください
• Geminiサービスが一時的に混雑しています
• 処理は自動的にリトライされます（最大5回）
• 時間を置いてから再度お試しください`;
      } else if (errorCode === 'E_GEMINI_QUOTA') {
        actionableSteps = `
📋 *API制限超過の対処法:*
• 現在Free Tierプラン（1分間2リクエスト）を利用中
• 1-2分待ってから再実行してください
• 頻繁に制限に達する場合は有料プランへのアップグレードをご検討ください
• API利用状況: https://ai.google.dev/pricing`;
      } else if (errorCode === 'E_GEMINI_INTERNAL_ERROR') {
        actionableSteps = `
📋 *サーバー内部エラーの対処法:*
• Geminiサービス側の一時的な問題です
• 5-10分待ってから再実行してください
• 問題が継続する場合はGoogleのステータスページを確認`;
      } else if (errorCode === 'E_GEMINI_PROCESSING') {
        actionableSteps = `
📋 *API認証エラーの対処法:*
• GOOGLE_AI_API_KEYの確認
• APIキーの有効性チェック
• プロジェクトのアクセス権限確認
• Google AI Studio: https://ai.google.dev/`;
      } else if (errorCode === 'RECORDING_PROCESSING_FAILED') {
        actionableSteps = `
📋 *録画処理失敗の対処法:*
• 録画ファイルの形式確認（MP4, M4A, MP3, WAV）
• 音声ファイルの長さ確認（最低10秒以上）
• ネットワーク状況の確認
• 手動でのPT001テスト実行推奨`;
      }

      // エラー通知専用のブロック形式メッセージを作成
      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 システムエラー通知',
            emoji: true
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*エラーコード:*\n\`${errorCode}\``
            },
            {
              type: 'mrkdwn',
              text: `*発生時刻:*\n${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} (JST)`
            },
            {
              type: 'mrkdwn',
              text: `*実行ID:*\n${errorInfo.executionId || 'N/A'}`
            },
            {
              type: 'mrkdwn',
              text: `*会議名:*\n${errorInfo.topic || errorInfo.meetingInfo?.topic || 'N/A'}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*エラー内容:*\n\`\`\`${errorInfo.error.substring(0, 400)}${errorInfo.error.length > 400 ? '...' : ''}\`\`\``
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*💡 対処法:*\n${troubleshooting}`
          }
        }
      ];

      // 特定エラーの具体的対処法を追加
      if (actionableSteps) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: actionableSteps
          }
        });
      }

      // コンテキスト情報がある場合は追加
      if (errorInfo.context && Object.keys(errorInfo.context).length > 0) {
        const contextText = Object.entries(errorInfo.context)
          .map(([key, value]) => `• ${key}: ${value}`)
          .join('\n');
        
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*追加情報:*\n${contextText}`
          }
        });
      }

      // フッター情報
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🤖 Zoom Meeting Automation - Error Notification`
          }
        ]
      });

      // エラー通知を送信（通常のチャンネルに送信、または管理者チャンネルがあれば変更可能）
      const result = await this.client.chat.postMessage({
        channel: this.channelId, // TODO: 管理者専用チャンネルがあれば変更
        blocks: blocks,
        text: `🚨 システムエラー: ${errorInfo.type}` // フォールバック用テキスト
      });

      logger.info('Error notification sent to Slack successfully');
      return { 
        success: true,
        ts: result.ts,
        channel: result.channel,
        type: 'error_notification'
      };

    } catch (error) {
      logger.error('Failed to send error notification to Slack:', error.message);
      return {
        success: false,
        error: error.message,
        type: 'error_notification_failed'
      };
    }
  }

  /**
   * Slack投稿でエラーが発生した場合の緊急ログ記録
   * @param {Object} originalData - 投稿しようとしていたデータ
   * @param {string} slackError - Slackエラーメッセージ
   */
  async logSlackFailure(originalData, slackError) {
    try {
      const emergencyLog = {
        timestamp: new Date().toISOString(),
        type: 'SLACK_SEND_FAILURE_EMERGENCY_LOG',
        slackError: slackError,
        originalMeetingTopic: originalData.meetingInfo?.topic,
        summaryLength: originalData.summary?.length || 0,
        transcriptionLength: originalData.transcription?.length || 0,
        hasDocumentLinks: !!originalData.documentLinks,
        executionId: originalData.executionId
      };

      // 緊急ログをコンソールに出力
      logger.error('=== SLACK FAILURE EMERGENCY LOG ===');
      logger.error(JSON.stringify(emergencyLog, null, 2));
      logger.error('=== END EMERGENCY LOG ===');

      return emergencyLog;

    } catch (logError) {
      logger.error('Failed to create emergency log:', logError.message);
      return null;
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

  /**
   * 汎用的なSlackメッセージ送信関数
   * @param {Object} messageOptions - メッセージオプション
   * @param {string} messageOptions.text - メッセージテキスト
   * @param {Array} messageOptions.blocks - Slackブロック
   * @param {string} messageOptions.channel - チャンネルID（省略時はデフォルト）
   * @returns {Promise<Object>} 送信結果
   */
  async postMessage(messageOptions) {
    try {
      const result = await this.client.chat.postMessage({
        channel: messageOptions.channel || this.channelId,
        text: messageOptions.text,
        blocks: messageOptions.blocks
      });

      logger.info(`Slack message sent successfully: ${messageOptions.text?.substring(0, 50)}...`);
      return result;

    } catch (error) {
      logger.error('Failed to send Slack message:', error.message);
      throw error;
    }
  }
}

module.exports = SlackService;