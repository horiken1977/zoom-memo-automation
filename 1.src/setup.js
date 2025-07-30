#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');

class SetupWizard {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.envPath = path.join(__dirname, '..', '.env');
    this.config = {};
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async run() {
    console.log('🚀 Zoom Memo Automation セットアップウィザード\\n');
    console.log('⚠️  注意: このツールはローカル開発用の.envファイルを作成します。');
    console.log('📝 本番環境では以下の環境変数設定を使用してください:');
    console.log('   • GitHub: Repository Secrets');
    console.log('   • Vercel: Project Environment Variables\\n');
    
    try {
      await this.collectZoomConfig();
      await this.collectGoogleAIConfig(); 
      await this.collectSlackConfig();
      await this.collectAppConfig();
      await this.writeEnvFile();
      await this.createDirectories();
      await this.showCompletionMessage();
      
    } catch (error) {
      console.error('❌ セットアップに失敗しました:', error.message);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  async collectZoomConfig() {
    console.log('📹 Zoom API設定');
    console.log('Zoom Marketplace (https://marketplace.zoom.us) でアプリを作成し、以下の情報を取得してください:\\n');

    this.config.ZOOM_API_KEY = await this.question('Zoom API Key: ');
    this.config.ZOOM_API_SECRET = await this.question('Zoom API Secret: ');
    this.config.ZOOM_ACCOUNT_ID = await this.question('Zoom Account ID: ');
    
    console.log('✅ Zoom設定完了\\n');
  }

  async collectGoogleAIConfig() {
    console.log('🤖 Google AI設定');
    console.log('Google AI Studio (https://aistudio.google.com) でAPIキーを取得してください:\\n');

    this.config.GOOGLE_AI_API_KEY = await this.question('Google AI API Key: ');
    
    console.log('✅ Google AI設定完了\\n');
  }

  async collectSlackConfig() {
    console.log('💬 Slack設定');
    console.log('Slack API (https://api.slack.com/apps) でBotアプリを作成し、以下の情報を取得してください:\\n');

    this.config.SLACK_BOT_TOKEN = await this.question('Slack Bot Token (xoxb-...): ');
    this.config.SLACK_CHANNEL_ID = await this.question('Slack Channel ID (C...): ');
    this.config.SLACK_SIGNING_SECRET = await this.question('Slack Signing Secret: ');
    
    console.log('✅ Slack設定完了\\n');
  }

  async collectAppConfig() {
    console.log('⚙️  アプリケーション設定\\n');

    const port = await this.question('ポート番号 (デフォルト: 3000): ');
    this.config.PORT = port || '3000';

    const logLevel = await this.question('ログレベル (info/debug/warn/error, デフォルト: info): ');
    this.config.LOG_LEVEL = logLevel || 'info';

    const checkInterval = await this.question('チェック間隔（分, デフォルト: 30): ');
    this.config.CHECK_INTERVAL_MINUTES = checkInterval || '30';

    const recordingPath = await this.question('録画保存パス (デフォルト: ./recordings): ');
    this.config.RECORDING_DOWNLOAD_PATH = recordingPath || './recordings';

    console.log('✅ アプリケーション設定完了\\n');
  }

  async writeEnvFile() {
    console.log('📝 .envファイルを作成中...');

    const envContent = `# Zoom API Configuration
ZOOM_API_KEY=${this.config.ZOOM_API_KEY}
ZOOM_API_SECRET=${this.config.ZOOM_API_SECRET}
ZOOM_ACCOUNT_ID=${this.config.ZOOM_ACCOUNT_ID}

# Google AI Configuration
GOOGLE_AI_API_KEY=${this.config.GOOGLE_AI_API_KEY}

# Slack Configuration
SLACK_BOT_TOKEN=${this.config.SLACK_BOT_TOKEN}
SLACK_CHANNEL_ID=${this.config.SLACK_CHANNEL_ID}
SLACK_SIGNING_SECRET=${this.config.SLACK_SIGNING_SECRET}

# Application Configuration
NODE_ENV=development
PORT=${this.config.PORT}
LOG_LEVEL=${this.config.LOG_LEVEL}

# Recording Storage
RECORDING_DOWNLOAD_PATH=${this.config.RECORDING_DOWNLOAD_PATH}
TEMP_DIR=./tmp

# Monitoring Configuration
CHECK_INTERVAL_MINUTES=${this.config.CHECK_INTERVAL_MINUTES}
RETENTION_DAYS=30
`;

    await fs.writeFile(this.envPath, envContent);
    console.log('✅ .envファイル作成完了');
  }

  async createDirectories() {
    console.log('📁 必要なディレクトリを作成中...');

    const directories = [
      this.config.RECORDING_DOWNLOAD_PATH,
      './tmp',
      './3.operations/logs',
      './3.operations/configs',
      './3.operations/backups'
    ];

    for (const dir of directories) {
      await fs.ensureDir(dir);
    }

    console.log('✅ ディレクトリ作成完了');
  }

  async showCompletionMessage() {
    console.log('\\n🎉 セットアップが完了しました!\\n');
    
    console.log('次のステップ:');
    console.log('1. 依存関係をインストール:');
    console.log('   npm install');
    console.log('');
    console.log('2. システムをテスト:');
    console.log('   npm run start -- --health-check   # ヘルスチェック');
    console.log('   npm run start -- --test-slack     # Slack統合テスト');
    console.log('');
    console.log('3. システムを開始:');
    console.log('   npm start                         # 定期監視開始');
    console.log('   npm run start -- --once          # 一回だけ実行');
    console.log('');
    console.log('4. 監視・運用:');
    console.log('   npm run monitor                   # システム監視');
    console.log('   npm run backup                    # 対話記録バックアップ');
    console.log('');
    
    console.log('⚠️  重要事項:');
    console.log('- .envファイルには機密情報が含まれています。Gitにコミットしないでください');
    console.log('- Zoom、Google AI、SlackのAPI制限にご注意ください');
    console.log('- ログファイルは定期的にローテーションされます');
    console.log('');
    console.log('📚 詳細なドキュメントは 0.docs/index.html をご確認ください');
  }
}

// CLI実行
if (require.main === module) {
  const wizard = new SetupWizard();
  wizard.run().catch(console.error);
}

module.exports = SetupWizard;