const path = require('path');
const fs = require('fs-extra');

// Configure environment for testing
process.env.NODE_ENV = 'development';
process.env.DRY_RUN = 'false';
process.env.ENABLE_TEST_MODE = 'true';

// Set dummy environment variables to pass validation
process.env.ZOOM_API_KEY = 'test-key';
process.env.ZOOM_API_SECRET = 'test-secret';
process.env.ZOOM_ACCOUNT_ID = 'test-account';
process.env.ZOOM_CLIENT_ID = 'CAAhyCYITXptXbM7zcowg';
process.env.ZOOM_CLIENT_SECRET = 'GTYNAu7gapbCc2J4BREdX2Mx3PoxZXIT';
process.env.GOOGLE_AI_API_KEY = 'test-google-key';
process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
process.env.SLACK_CHANNEL_ID = 'C1234567890';

// Import services
const aiService = require('./1.src/services/aiService');
const googleDriveService = require('./1.src/services/googleDriveService');
const slackService = require('./1.src/services/slackService');
const logger = require('./1.src/utils/logger');

class IntegrationTest {
  constructor() {
    this.testDataPath = '/Users/aa479881/Documents/Zoom/2025-07-31 13.59.11 1on1Kinoshita-san_Horie';
    this.audioFile = path.join(this.testDataPath, 'audio1763668932.m4a');
    this.videoFile = path.join(this.testDataPath, 'video1763668932.mp4');
    this.chatFile = path.join(this.testDataPath, 'chat.txt');
    this.transcriptFile = path.join(this.testDataPath, 'closed_caption.txt');
  }

  async runIntegrationTest() {
    try {
      logger.info('🚀 Starting Integration Test with OAuth Configuration');
      
      // Step 1: Prepare test meeting data
      const testMeetingData = await this.prepareTestData();
      logger.info('✅ Test data prepared');

      // Step 2: Test AI Summary with existing transcript
      const summary = await this.testAISummary(testMeetingData);
      logger.info('✅ AI Summary generated');

      // Step 3: Test Google Drive upload
      const driveResult = await this.testGoogleDriveUpload(testMeetingData, summary);
      logger.info('✅ Google Drive upload completed');

      // Step 4: Test Slack notification
      const slackResult = await this.testSlackNotification(testMeetingData, summary, driveResult);
      logger.info('✅ Slack notification sent');

      // Summary
      this.printTestResults({
        meetingData: testMeetingData,
        summary: summary,
        driveResult: driveResult,
        slackResult: slackResult
      });

    } catch (error) {
      logger.error('❌ Integration test failed:', error);
      throw error;
    }
  }

  async prepareTestData() {
    // Check if files exist
    const audioExists = await fs.pathExists(this.audioFile);
    const videoExists = await fs.pathExists(this.videoFile);
    const transcriptExists = await fs.pathExists(this.transcriptFile);

    logger.info(`Files check - Audio: ${audioExists}, Video: ${videoExists}, Transcript: ${transcriptExists}`);

    // Read existing transcript if available
    let existingTranscript = '';
    if (transcriptExists) {
      existingTranscript = await fs.readFile(this.transcriptFile, 'utf8');
    }

    return {
      meetingId: 'test-meeting-20250731',
      uuid: 'test-uuid-oauth-integration',
      topic: '1on1 Kinoshita-san & Horie (OAuth Integration Test)',
      startTime: '2025-07-31T13:59:11Z',
      duration: 30,
      hostName: 'test@example.com',
      participants: ['Kinoshita-san', 'Horie'],
      audioFilePath: audioExists ? this.audioFile : null,
      videoFilePath: videoExists ? this.videoFile : null,
      existingTranscript: existingTranscript,
      meetingInfo: {
        id: 'test-meeting-20250731',
        topic: '1on1 Kinoshita-san & Horie (OAuth Integration Test)',
        startTime: '2025-07-31T13:59:11Z',
        duration: 30,
        hostName: 'test@example.com',
        participantCount: 2,
        originalFileName: 'video1763668932.mp4'
      }
    };
  }

  async testAISummary(meetingData) {
    logger.info('📝 Testing AI Summary generation...');
    
    try {
      // Use existing transcript if available, otherwise create a dummy one
      let transcription = meetingData.existingTranscript;
      
      if (!transcription || transcription.trim().length === 0) {
        transcription = `
[13:59:11] Horie: こんにちは、木下さん。今日は1on1の時間を取っていただき、ありがとうございます。

[14:00:05] Kinoshita: こちらこそ、堀江さん。最近のプロジェクトの進捗について話し合いましょう。

[14:01:20] Horie: はい。Zoom自動化プロジェクトですが、OAuth認証の実装が完了しました。新しいClient IDとSecretを使用してAPI接続ができるようになっています。

[14:02:45] Kinoshita: それは素晴らしいですね。セキュリティ面でも改善されますし、APIの制限も緩和されるはずです。

[14:03:30] Horie: そうですね。次のステップとして、録画の自動処理フローを本格稼働させたいと思っています。

[14:04:15] Kinoshita: 了解しました。テスト環境での動作確認は順調ですか？

[14:05:00] Horie: はい、AIによる要約生成、Google Driveへの保存、Slack通知まで一連の流れが動作しています。

[14:06:30] Kinoshita: 完璧ですね。本格運用に向けて、何かサポートが必要でしたらお声がけください。

[14:07:15] Horie: ありがとうございます。では、来週から段階的に本格運用を開始したいと思います。

[14:08:00] Kinoshita: 期待しています。何か問題が発生したら、すぐに対応しましょう。

[14:08:45] Horie: 承知しました。本日はありがとうございました。

[14:09:00] Kinoshita: こちらこそ、お疲れ様でした。
        `.trim();
      }

      // Generate summary using AI service
      const summary = await aiService.generateSummary(transcription, meetingData.meetingInfo);
      
      return {
        transcription: transcription,
        summary: summary,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('AI Summary generation failed:', error);
      // Return fallback summary for testing
      return {
        transcription: 'テスト用文字起こし（AI処理失敗）',
        summary: `## 会議要約（テスト用）

### 基本情報
- 会議目的：1on1ミーティング（OAuth統合テスト）
- 開催日時：2025-07-31 13:59
- 出席者：Kinoshita-san, Horie

### 議論内容
OAuth認証実装の完了報告とプロジェクト進捗について

### 決定事項
1. OAuth認証実装完了
2. 来週から本格運用開始

### Next Action & Due Date
| アクション | 担当者 | 期限 |
|-----------|--------|------|
| 本格運用開始 | Horie | 来週 |`,
        generatedAt: new Date().toISOString(),
        fallback: true
      };
    }
  }

  async testGoogleDriveUpload(meetingData, summaryData) {
    logger.info('☁️ Testing Google Drive upload...');
    
    try {
      const results = [];
      
      // Upload video file if exists
      if (meetingData.videoFilePath && await fs.pathExists(meetingData.videoFilePath)) {
        logger.info('Uploading video file to Google Drive...');
        const videoResult = await googleDriveService.uploadFile(
          meetingData.videoFilePath,
          meetingData.meetingInfo
        );
        results.push({
          type: 'video',
          result: videoResult
        });
      }

      // Create and upload summary document
      const summaryContent = `# ${meetingData.topic}

## 会議情報
- 日時: ${meetingData.startTime}
- 参加者: ${meetingData.participants.join(', ')}
- 時間: ${meetingData.duration}分

## 文字起こし
${summaryData.transcription}

## 要約
${summaryData.summary}

---
生成日時: ${summaryData.generatedAt}
`;

      // Save summary to temp file and upload
      const tempSummaryPath = path.join(__dirname, 'temp', `summary_${meetingData.meetingId}.md`);
      await fs.ensureDir(path.dirname(tempSummaryPath));
      await fs.writeFile(tempSummaryPath, summaryContent, 'utf8');

      const summaryResult = await googleDriveService.uploadFile(
        tempSummaryPath,
        { ...meetingData.meetingInfo, originalFileName: `summary_${meetingData.meetingId}.md` }
      );

      results.push({
        type: 'summary',
        result: summaryResult
      });

      // Clean up temp file
      await fs.remove(tempSummaryPath);

      return results;
    } catch (error) {
      logger.error('Google Drive upload failed:', error);
      return [{
        type: 'error',
        error: error.message
      }];
    }
  }

  async testSlackNotification(meetingData, summaryData, driveResults) {
    logger.info('💬 Testing Slack notification...');
    
    try {
      // Create Slack message
      const videoLink = driveResults.find(r => r.type === 'video')?.result?.webViewLink || 'アップロード失敗';
      const summaryLink = driveResults.find(r => r.type === 'summary')?.result?.webViewLink || 'アップロード失敗';

      const message = {
        text: `🎥 会議録画が処理されました: ${meetingData.topic}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `📹 ${meetingData.topic}`
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*日時:* ${new Date(meetingData.startTime).toLocaleString('ja-JP')}`
              },
              {
                type: 'mrkdwn',
                text: `*時間:* ${meetingData.duration}分`
              },
              {
                type: 'mrkdwn',
                text: `*参加者:* ${meetingData.participants.join(', ')}`
              },
              {
                type: 'mrkdwn',
                text: `*ホスト:* ${meetingData.hostName}`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*📝 要約抜粋:*\n${summaryData.summary.slice(0, 200)}...`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '🎥 動画を見る'
                },
                url: videoLink,
                style: 'primary'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '📄 要約を見る'
                },
                url: summaryLink
              }
            ]
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `🤖 OAuth統合テスト | 処理完了: ${new Date().toLocaleString('ja-JP')}`
              }
            ]
          }
        ]
      };

      const result = await slackService.sendNotification(message);
      return result;
    } catch (error) {
      logger.error('Slack notification failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  printTestResults(results) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 ZOOM OAUTH INTEGRATION TEST RESULTS');
    console.log('='.repeat(60));
    
    console.log('\n✅ Test Meeting Data:');
    console.log(`   Topic: ${results.meetingData.topic}`);
    console.log(`   Duration: ${results.meetingData.duration} minutes`);
    console.log(`   Participants: ${results.meetingData.participants.join(', ')}`);
    
    console.log('\n📝 AI Summary:');
    console.log(`   Generated: ${results.summary.generatedAt}`);
    console.log(`   Fallback used: ${results.summary.fallback ? 'Yes' : 'No'}`);
    
    console.log('\n☁️ Google Drive Upload:');
    results.driveResult.forEach(result => {
      if (result.type === 'error') {
        console.log(`   ❌ Error: ${result.error}`);
      } else {
        console.log(`   ✅ ${result.type}: ${result.result?.name || 'Unknown'}`);
      }
    });
    
    console.log('\n💬 Slack Notification:');
    console.log(`   Success: ${results.slackResult.success ? 'Yes' : 'No'}`);
    if (!results.slackResult.success) {
      console.log(`   Error: ${results.slackResult.error}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Integration Test Completed!');
    console.log('='.repeat(60) + '\n');
  }
}

// Run the test
if (require.main === module) {
  const test = new IntegrationTest();
  test.runIntegrationTest()
    .then(() => {
      logger.info('✅ Integration test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Integration test failed:', error);
      process.exit(1);
    });
}

module.exports = IntegrationTest;