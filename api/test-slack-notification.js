// Vercel Function for testing Slack notifications
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests for sending notifications
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed', 
      message: 'Use POST to send test notification' 
    });
  }

  const testResult = {
    timestamp: new Date().toISOString(),
    test_type: 'slack_notification',
    environment: process.env.NODE_ENV || 'production'
  };

  console.log('📱 Starting Slack notification test...');

  try {
    // Check required environment variables
    if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_CHANNEL_ID) {
      return res.status(400).json({
        status: 'error',
        message: '❌ Missing Slack configuration',
        missing_vars: {
          SLACK_BOT_TOKEN: !process.env.SLACK_BOT_TOKEN,
          SLACK_CHANNEL_ID: !process.env.SLACK_CHANNEL_ID
        },
        timestamp: testResult.timestamp
      });
    }

    // Create test message
    const testMessage = {
      channel: process.env.SLACK_CHANNEL_ID,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🧪 Zoom Memo Automation - システムテスト通知"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*テスト実行時刻:* ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\n*実行環境:* Vercel Production\n*テスト種別:* API接続・通知機能テスト`
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: "*🎯 テスト結果*\nSlack API: ✅ 接続成功"
            },
            {
              type: "mrkdwn",
              text: "*📊 システム状態*\n通知機能: ✅ 正常動作"
            },
            {
              type: "mrkdwn",
              text: "*🔧 実行元*\nVercel Function API"
            },
            {
              type: "mrkdwn",
              text: "*⏰ 実行日時*\n" + new Date().toISOString()
            }
          ]
        },
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "📋 *テスト項目チェックリスト*\n• ✅ 環境変数設定確認\n• ✅ Slack API認証\n• ✅ チャンネル投稿権限\n• ✅ メッセージフォーマット\n• ✅ ブロック形式表示"
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "🤖 *Zoom Memo Automation* | 📱 詳細情報: <https://zoom-memo-automation.vercel.app/|メインサイト> | 📚 <https://github.com/horiken1977/zoom-memo-automation|GitHub>"
            }
          ]
        }
      ]
    };

    console.log('Sending test notification to Slack...');
    
    // Send message to Slack
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testMessage)
    });

    const slackData = await slackResponse.json();

    if (slackData.ok) {
      testResult.status = 'success';
      testResult.message = '✅ Slack test notification sent successfully';
      testResult.slack_response = {
        channel: slackData.channel,
        message_ts: slackData.ts,
        permalink: `https://slack.com/archives/${slackData.channel}/p${slackData.ts.replace('.', '')}`
      };
      
      console.log('✅ Slack notification sent successfully');
      res.status(200).json(testResult);

    } else {
      testResult.status = 'error';
      testResult.message = '❌ Slack notification failed';
      testResult.slack_error = {
        error: slackData.error,
        warning: slackData.warning,
        response_metadata: slackData.response_metadata
      };
      
      console.log('❌ Slack notification failed:', slackData.error);
      res.status(400).json(testResult);
    }

  } catch (error) {
    console.error('❌ Slack test error:', error);
    
    testResult.status = 'error';
    testResult.message = '❌ Slack test execution failed';
    testResult.error = error.message;
    
    res.status(500).json(testResult);
  }
}