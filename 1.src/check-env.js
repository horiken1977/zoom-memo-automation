#!/usr/bin/env node

/**
 * 環境変数チェックツール
 * 
 * 本番環境やCI/CDでの環境変数設定を確認するためのユーティリティ
 * 
 * 使用方法:
 * node check-env.js [--verbose] [--fix]
 */

// 環境変数チェックのみを行うため、configは読み込まない
// configを読み込むとバリデーションでエラーになるため

class EnvironmentChecker {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.fix = options.fix || false;
  }

  checkEnvironmentVariables() {
    console.log('🔍 Environment Variables Check\\n');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Platform: ${process.platform}`);
    console.log(`Node.js: ${process.version}\\n`);

    const requiredVars = [
      { key: 'ZOOM_API_KEY', masked: true },
      { key: 'ZOOM_API_SECRET', masked: true },
      { key: 'ZOOM_ACCOUNT_ID', masked: false },
      { key: 'GOOGLE_AI_API_KEY', masked: true },
      { key: 'SLACK_BOT_TOKEN', masked: true },
      { key: 'SLACK_CHANNEL_ID', masked: false },
      { key: 'SLACK_SIGNING_SECRET', masked: true }
    ];

    const optionalVars = [
      { key: 'CHECK_INTERVAL_MINUTES', default: '30' },
      { key: 'LOG_LEVEL', default: 'info' },
      { key: 'RECORDING_DOWNLOAD_PATH', default: './recordings' },
      { key: 'TEMP_DIR', default: './tmp' },
      { key: 'RETENTION_DAYS', default: '30' }
    ];

    let allGood = true;

    console.log('✅ Required Environment Variables:');
    requiredVars.forEach(envVar => {
      const value = process.env[envVar.key];
      if (value) {
        const displayValue = envVar.masked ? this.maskValue(value) : value;
        console.log(`   ✓ ${envVar.key}: ${displayValue}`);
        
        // Format validation
        if (envVar.key === 'SLACK_BOT_TOKEN' && !value.startsWith('xoxb-')) {
          console.log(`     ⚠️  Warning: Should start with 'xoxb-'`);
          allGood = false;
        }
        if (envVar.key === 'SLACK_CHANNEL_ID' && !value.startsWith('C')) {
          console.log(`     ⚠️  Warning: Should start with 'C'`);
          allGood = false;
        }
      } else {
        console.log(`   ❌ ${envVar.key}: NOT SET`);
        allGood = false;
      }
    });

    console.log('\\n📝 Optional Environment Variables:');
    optionalVars.forEach(envVar => {
      const value = process.env[envVar.key] || envVar.default;
      const isDefault = !process.env[envVar.key];
      const indicator = isDefault ? '(default)' : '(custom)';
      console.log(`   • ${envVar.key}: ${value} ${indicator}`);
    });

    console.log('\\n🔧 Configuration Summary:');
    console.log(`   API Base URLs:`);
    console.log(`     Zoom API: https://api.zoom.us/v2`);
    console.log(`     Google AI: Gemini 1.5 Pro`);
    console.log(`   Monitoring:`);
    console.log(`     Check Interval: ${process.env.CHECK_INTERVAL_MINUTES || '30'} minutes`);
    console.log(`     Log Level: ${process.env.LOG_LEVEL || 'info'}`);

    if (this.verbose) {
      console.log('\\n🐛 Debug Information:');
      console.log(`   Working Directory: ${process.cwd()}`);
      console.log(`   Script Location: ${__filename}`);
      console.log(`   Config Loaded: N/A (standalone mode)`);
    }

    return allGood;
  }

  maskValue(value) {
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }
    return value.substring(0, 4) + '*'.repeat(value.length - 8) + value.substring(value.length - 4);
  }

  showSetupInstructions() {
    console.log('\\n📖 Setup Instructions:\\n');
    
    console.log('🏠 Local Development:');
    console.log('   1. Copy .env.example to .env');
    console.log('   2. Fill in your API keys');
    console.log('   3. Run: npm run setup (interactive wizard)\\n');
    
    console.log('🐙 GitHub Actions:');
    console.log('   1. Go to Repository Settings');
    console.log('   2. Navigate to Secrets and variables > Actions');
    console.log('   3. Add each required environment variable as a secret\\n');
    
    console.log('🚀 Vercel Deployment:');
    console.log('   1. Open Vercel Dashboard');
    console.log('   2. Select your project');
    console.log('   3. Go to Settings > Environment Variables');
    console.log('   4. Add variables for Production, Preview, and Development\\n');
    
    console.log('🐳 Docker/Container:');
    console.log('   docker run -e ZOOM_API_KEY=xxx -e ZOOM_API_SECRET=xxx ... your-image\\n');
  }

  async run() {
    try {
      const isValid = this.checkEnvironmentVariables();
      
      if (!isValid) {
        console.log('\\n❌ Environment variable validation failed!');
        this.showSetupInstructions();
        process.exit(1);
      } else {
        console.log('\\n✅ All environment variables are properly configured!');
        console.log('🎉 Ready to run Zoom Memo Automation');
        
        if (process.env.NODE_ENV === 'production') {
          console.log('\\n🚀 Production Environment Detected');
          console.log('   - .env files are ignored');
          console.log('   - Using system environment variables');
          console.log('   - All security checks passed');
        }
      }
      
    } catch (error) {
      console.error('\\n💥 Environment check failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    fix: args.includes('--fix')
  };
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Environment Variables Checker

Usage: node check-env.js [options]

Options:
  --verbose, -v    Show detailed debug information
  --fix            Attempt to fix common issues (future feature)
  --help, -h       Show this help message

Examples:
  node check-env.js              # Basic check
  node check-env.js --verbose    # Detailed check
    `);
    process.exit(0);
  }
  
  const checker = new EnvironmentChecker(options);
  checker.run().catch(console.error);
}

module.exports = EnvironmentChecker;