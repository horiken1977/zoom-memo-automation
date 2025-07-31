/**
 * Claude対話をWebhook経由で受け取り、自動的にドキュメントを更新するAPI
 * Vercel Functionsとして動作
 */

const ClaudeDocUpdater = require('../1.src/utils/claudeDocUpdater');

module.exports = async (req, res) => {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userMessage, assistantResponse, timestamp } = req.body;

    if (!userMessage || !assistantResponse) {
      return res.status(400).json({ 
        error: 'Missing required fields: userMessage, assistantResponse' 
      });
    }

    // 認証チェック（必要に応じて実装）
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.CLAUDE_WEBHOOK_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ドキュメント更新
    const updater = new ClaudeDocUpdater();
    const changes = await updater.appendConversation(
      userMessage, 
      assistantResponse, 
      timestamp ? new Date(timestamp) : new Date()
    );

    res.status(200).json({
      success: true,
      message: 'Conversation recorded and documents updated',
      changes: changes
    });

  } catch (error) {
    console.error('Claude webhook error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};