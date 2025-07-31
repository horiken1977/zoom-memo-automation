// Load .env file only in development environment
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

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
    model: process.env.GOOGLE_AI_MODEL || 'auto', // 'auto' for automatic latest model selection
    fallbackModels: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'] // Updated with Gemini 2.x priority
  },

  // Google Drive Configuration
  googleDrive: {
    serviceAccountKey: process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY, // Path to service account key file
    credentials: process.env.GOOGLE_DRIVE_CREDENTIALS, // JSON string of service account credentials
    organizationDomain: process.env.GOOGLE_DRIVE_ORG_DOMAIN, // Organization domain for sharing
    recordingsFolder: process.env.GOOGLE_DRIVE_RECORDINGS_FOLDER || 'Zoom_Recordings', // Base folder name
    maxFileSize: parseInt(process.env.GOOGLE_DRIVE_MAX_FILE_SIZE) || 5 * 1024 * 1024 * 1024 // 5GB default
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
    checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 120, // Default 2 hours for testing
    retentionDays: parseInt(process.env.RETENTION_DAYS) || 30
  },
  
  // Development Settings
  development: {
    disableSlackNotifications: process.env.DISABLE_SLACK_NOTIFICATIONS === 'true' || process.env.NODE_ENV === 'development',
    enableTestMode: process.env.ENABLE_TEST_MODE === 'true',
    dryRun: process.env.DRY_RUN === 'true'
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

// Environment variable validation
function validateConfig() {
  const requiredEnvVars = [
    { key: 'ZOOM_API_KEY', description: 'Zoom API Key from Zoom Marketplace' },
    { key: 'ZOOM_API_SECRET', description: 'Zoom API Secret from Zoom Marketplace' },
    { key: 'ZOOM_ACCOUNT_ID', description: 'Zoom Account ID from Zoom Marketplace' },
    { key: 'GOOGLE_AI_API_KEY', description: 'Google AI API Key from Google AI Studio' },
    { key: 'SLACK_BOT_TOKEN', description: 'Slack Bot Token (starts with xoxb-)' },
    { key: 'SLACK_CHANNEL_ID', description: 'Slack Channel ID (starts with C)' }
  ];
  
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar.key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(envVar => {
      console.error(`   • ${envVar.key}: ${envVar.description}`);
    });
    console.error('\n📖 Setup Guide:');
    console.error('   Local: Copy .env.example to .env and fill in values');
    console.error('   GitHub: Add to Repository Secrets');
    console.error('   Vercel: Add to Project Environment Variables');
    
    throw new Error(`Missing ${missing.length} required environment variable(s)`);
  }
  
  // Additional validation for specific formats
  const validationErrors = [];
  
  if (process.env.SLACK_BOT_TOKEN && !process.env.SLACK_BOT_TOKEN.startsWith('xoxb-')) {
    validationErrors.push('SLACK_BOT_TOKEN must start with "xoxb-"');
  }
  
  if (process.env.SLACK_CHANNEL_ID && !process.env.SLACK_CHANNEL_ID.startsWith('C')) {
    validationErrors.push('SLACK_CHANNEL_ID must start with "C"');
  }
  
  if (validationErrors.length > 0) {
    console.error('❌ Environment variable format errors:');
    validationErrors.forEach(error => console.error(`   • ${error}`));
    throw new Error(`Invalid environment variable format(s)`);
  }
}

// Skip validation for environment check tool
if (process.argv[1] && !process.argv[1].includes('check-env')) {
  // Always validate required environment variables for normal operation
  validateConfig();
}

module.exports = config;