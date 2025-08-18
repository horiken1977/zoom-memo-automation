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
    // OAuth Configuration (Server-to-Server OAuth)
    // 注意: ZOOM_API_KEY と ZOOM_API_SECRET を OAuth の Client ID/Secret として使用
    clientId: process.env.ZOOM_API_KEY,  // OAuth Client ID として API Key を使用
    clientSecret: process.env.ZOOM_API_SECRET,  // OAuth Client Secret として API Secret を使用
    redirectUri: process.env.ZOOM_REDIRECT_URI || 'http://localhost:3000/auth/zoom/callback',
    baseUrl: 'https://api.zoom.us/v2',
    oauthUrl: 'https://zoom.us/oauth',
    useOAuth: process.env.ZOOM_USE_OAUTH !== 'false' // デフォルトでOAuth使用
  },
  
  // Google AI Configuration
  googleAI: {
    apiKey: process.env.GOOGLE_AI_API_KEY,
    model: process.env.GOOGLE_AI_MODEL || 'gemini-2.5-pro', // 最新の2.5-proを使用
    fallbackModels: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro'] // Rate limit対策でgemini-1.5-pro除外
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

  // Production Test Settings (安全なテスト用)
  productionTest: {
    enableSafeMode: process.env.PRODUCTION_SAFE_MODE === 'true',
    skipRecordingDeletion: process.env.SKIP_RECORDING_DELETION === 'true',
    logSlackInsteadOfSend: process.env.LOG_SLACK_INSTEAD_OF_SEND === 'true',
    maxProcessRecordings: parseInt(process.env.MAX_PROCESS_RECORDINGS) || 5 // テスト時の最大処理件数制限（本番では0=無制限）
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

### クライアント名
（会議内容から推測されるクライアント名・組織名・プロジェクト名を記載。不明な場合は「内部会議」と記載）

### 基本情報
- 会議目的：
- 開催日時：
- 出席者：

### 使用資料・参考文書
- 

### 議論内容
**重要：以下の観点で詳細かつ論理的に記載してください**
- **論点の背景**: なぜその議論が生まれたか
- **発言者の立場・視点**: 各参加者の役割や専門分野からの意見
- **論理的な流れ**: 議論がどのように展開し、結論に至ったか
- **対立点・合意点**: 意見の相違があった場合の詳細
- **根拠・データ**: 発言の裏付けとなる情報
- **判断基準**: 決定に至る際の評価軸

例：
**A氏（営業）**: 「顧客満足度向上のため、サポート体制強化が必要」と提案。根拠として先月のNPS調査で競合他社を下回った点を挙げた。

**B氏（開発）**: 「技術的制約から即座の改善は困難」と反論。現行システムのアーキテクチャ上の課題（レスポンス時間、スケーラビリティ）を詳述。

**議論の展開**: A氏の提案に対し、B氏は技術面での課題を指摘。C氏が仲裁役として段階的実装を提案し、最終的に3フェーズでの改善計画で合意に至った。

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

正確で構造化された要約を作成してください。特に議論内容は、単なる発言の羅列ではなく、議論の論理的な流れと背景を含めて詳細に記述してください。`,
      
      userPrompt: `以下の会議の文字起こしを基に、上記の形式で要約を作成してください：

{transcription}`
    }
  }
};

// Environment variable validation
function validateConfig() {
  const requiredEnvVars = [
    { key: 'ZOOM_API_KEY', description: 'Zoom OAuth Client ID from Server-to-Server OAuth App' },
    { key: 'ZOOM_API_SECRET', description: 'Zoom OAuth Client Secret from Server-to-Server OAuth App' },
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