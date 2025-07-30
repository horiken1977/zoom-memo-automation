require('dotenv').config();

const config = {
  // Server Configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Zoom API Configuration
  zoom: {
    apiKey: process.env.ZOOM_API_KEY,
    apiSecret: process.env.ZOOM_API_SECRET,
    accountId: process.env.ZOOM_ACCOUNT_ID,
    baseUrl: 'https://api.zoom.us/v2'
  },
  
  // Google AI Configuration
  googleAI: {
    apiKey: process.env.GOOGLE_AI_API_KEY,
    model: 'gemini-1.5-pro-latest'
  },
  
  // Slack Configuration
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    channelId: process.env.SLACK_CHANNEL_ID,
    signingSecret: process.env.SLACK_SIGNING_SECRET
  },
  
  // Application Settings
  recording: {
    downloadPath: process.env.RECORDING_DOWNLOAD_PATH || './recordings',
    tempDir: process.env.TEMP_DIR || './tmp',
    supportedFormats: ['mp4', 'm4a', 'mp3', 'wav']
  },
  
  // Monitoring Settings
  monitoring: {
    checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 30,
    retentionDays: parseInt(process.env.RETENTION_DAYS) || 30
  },
  
  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: '3.operations/logs/app.log'
  },
  
  // AI Prompt Templates
  prompts: {
    transcription: {
      systemPrompt: `あなたは会議の音声を正確に文字起こしするAIアシスタントです。
以下の要求に従って処理してください：
1. 話者の識別（可能な場合）
2. 正確な文字起こし
3. 日本語での出力
4. タイムスタンプの記録（可能な場合）`,
      
      userPrompt: `この音声ファイルを文字起こししてください。話者が複数いる場合は区別して記録してください。`
    },
    
    summary: {
      systemPrompt: `あなたは会議の要約を作成する専門AIアシスタントです。
以下の形式で会議内容を整理してください：

## 会議要約

### 基本情報
- 会議目的：
- 開催日時：
- 出席者：

### 使用資料・参考文書
- 

### 議論内容
（対話形式で、誰が何を発言したかを明確に記載）

### 決定事項
1. 
2. 

### 宿題・課題
1. 
2. 

### Next Action & Due Date
| アクション | 担当者 | 期限 |
|-----------|--------|------|
|           |        |      |

正確で構造化された要約を作成してください。`,
      
      userPrompt: `以下の会議の文字起こしを基に、上記の形式で要約を作成してください：

{transcription}`
    }
  }
};

// Validation
function validateConfig() {
  const requiredEnvVars = [
    'ZOOM_API_KEY',
    'ZOOM_API_SECRET', 
    'ZOOM_ACCOUNT_ID',
    'GOOGLE_AI_API_KEY',
    'SLACK_BOT_TOKEN',
    'SLACK_CHANNEL_ID'
  ];
  
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Only validate in production
if (config.nodeEnv === 'production') {
  validateConfig();
}

module.exports = config;