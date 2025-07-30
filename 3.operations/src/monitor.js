#!/usr/bin/env node

/**
 * チャットバックアップ監視スクリプト
 * 
 * 機能:
 * - 2時間毎にバックアップ状況を確認
 * - ターミナルに状況を表示
 * - システムの健全性をチェック
 * - 問題がある場合はアラートを表示
 * 
 * 実行方法:
 * node monitor.js [--quiet] [--check-interval=120]
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class BackupMonitor {
    constructor(options = {}) {
        this.quiet = options.quiet || false;
        this.checkInterval = options.checkInterval || 120; // 2時間 (分)
        this.configPath = path.join(__dirname, '../configs/chat-backup.json');
        this.logPath = path.join(__dirname, '../logs/chat-backup.log');
        this.claudePath = path.join(__dirname, '../../0.docs/claude.md');
        
        this.isRunning = false;
        this.intervalId = null;
    }

    async checkBackupStatus() {
        try {
            const status = {
                timestamp: new Date().toISOString(),
                backupRunning: false,
                lastBackup: null,
                backupCount: 0,
                fileExists: false,
                fileSize: 0,
                logEntries: 0,
                issues: []
            };

            // 設定ファイルの確認
            try {
                const configData = await fs.readFile(this.configPath, 'utf8');
                const config = JSON.parse(configData);
                
                status.lastBackup = config.lastBackup;
                status.backupCount = config.backupCount;
                
                // 最後のバックアップが2時間以上前かチェック
                if (config.lastBackup) {
                    const lastBackupTime = new Date(config.lastBackup);
                    const now = new Date();
                    const hoursSinceLastBackup = (now - lastBackupTime) / (1000 * 60 * 60);
                    
                    if (hoursSinceLastBackup > 2.5) {
                        status.issues.push(`Last backup was ${hoursSinceLastBackup.toFixed(1)} hours ago`);
                    }
                } else {
                    status.issues.push('No backup has been performed yet');
                }
                
            } catch (error) {
                status.issues.push(`Config file not found or invalid: ${error.message}`);
            }

            // Claude.mdファイルの確認
            try {
                const stats = await fs.stat(this.claudePath);
                status.fileExists = true;
                status.fileSize = stats.size;
                
                // ファイルが空またはほとんど空の場合
                if (stats.size < 100) {
                    status.issues.push('Claude.md file is too small (< 100 bytes)');
                }
                
            } catch (error) {
                status.issues.push(`Claude.md file not accessible: ${error.message}`);
            }

            // ログファイルの確認
            try {
                const logContent = await fs.readFile(this.logPath, 'utf8');
                status.logEntries = logContent.split('\\n').filter(line => line.trim()).length;
                
                // 最近のエラーログをチェック
                const errorLines = logContent.split('\\n').filter(line => 
                    line.includes('[ERROR]') && 
                    new Date(line.match(/\\[(.*?)\\]/)?.[1] || '1970-01-01') > new Date(Date.now() - 24 * 60 * 60 * 1000)
                );
                
                if (errorLines.length > 0) {
                    status.issues.push(`${errorLines.length} error(s) in last 24 hours`);
                }
                
            } catch (error) {
                status.issues.push(`Log file not accessible: ${error.message}`);
            }

            // バックアッププロセスの実行確認
            try {
                const { stdout } = await execAsync('ps aux | grep chat-backup.js | grep -v grep');
                status.backupRunning = stdout.trim().length > 0;
            } catch (error) {
                // プロセスが見つからない場合
                status.backupRunning = false;
                status.issues.push('Backup process is not running');
            }

            return status;
            
        } catch (error) {
            return {
                timestamp: new Date().toISOString(),
                error: error.message,
                issues: [`Monitor check failed: ${error.message}`]
            };
        }
    }

    formatStatus(status) {
        const lines = [];
        
        // ヘッダー
        lines.push('');
        lines.push('═'.repeat(60));
        lines.push('   📊 CHAT BACKUP MONITOR STATUS');
        lines.push('═'.repeat(60));
        lines.push(`🕐 Check Time: ${new Date(status.timestamp).toLocaleString('ja-JP')}`);
        lines.push('');
        
        // 基本情報
        lines.push('📋 Basic Information:');
        lines.push(`   Backup Process: ${status.backupRunning ? '🟢 Running' : '🔴 Stopped'}`);
        lines.push(`   Total Backups: ${status.backupCount || 0}`);
        lines.push(`   Last Backup: ${status.lastBackup ? new Date(status.lastBackup).toLocaleString('ja-JP') : 'Never'}`);
        lines.push('');
        
        // ファイル状況
        lines.push('📁 File Status:');
        lines.push(`   Claude.md: ${status.fileExists ? '🟢 Exists' : '🔴 Missing'}`);
        if (status.fileExists) {
            lines.push(`   File Size: ${(status.fileSize / 1024).toFixed(1)} KB`);
        }
        lines.push(`   Log Entries: ${status.logEntries || 0}`);
        lines.push('');
        
        // 問題の表示
        if (status.issues && status.issues.length > 0) {
            lines.push('⚠️  Issues Found:');
            status.issues.forEach(issue => {
                lines.push(`   • ${issue}`);
            });
            lines.push('');
        } else {
            lines.push('✅ No Issues Found');
            lines.push('');
        }
        
        // 推奨アクション
        if (status.issues && status.issues.length > 0) {
            lines.push('🔧 Recommended Actions:');
            
            if (!status.backupRunning) {
                lines.push('   • Start backup process: node 3.operations/src/chat-backup.js');
            }
            
            if (status.issues.some(issue => issue.includes('hours ago'))) {
                lines.push('   • Check backup configuration and logs');
            }
            
            if (status.issues.some(issue => issue.includes('file not accessible'))) {
                lines.push('   • Verify file permissions and paths');
            }
            
            lines.push('');
        }
        
        lines.push('═'.repeat(60));
        lines.push('');
        
        return lines.join('\\n');
    }

    async displayStatus() {
        try {
            const status = await this.checkBackupStatus();
            const formatted = this.formatStatus(status);
            
            if (!this.quiet) {
                console.log(formatted);
            }
            
            // 重要な問題がある場合は必ず表示
            if (status.issues && status.issues.length > 0) {
                const criticalIssues = status.issues.filter(issue => 
                    issue.includes('not running') || 
                    issue.includes('not accessible') ||
                    issue.includes('error(s)')
                );
                
                if (criticalIssues.length > 0 && this.quiet) {
                    console.log('🚨 CRITICAL BACKUP ISSUES DETECTED:');
                    criticalIssues.forEach(issue => console.log(`   • ${issue}`));
                    console.log('   Run: node 3.operations/src/monitor.js (without --quiet) for details');
                }
            }
            
            return status;
            
        } catch (error) {
            console.error(`Monitor error: ${error.message}`);
            throw error;
        }
    }

    async showQuickStatus() {
        try {
            const status = await this.checkBackupStatus();
            
            const statusIcon = status.issues && status.issues.length > 0 ? '🔴' : '🟢';
            const backupStatus = status.backupRunning ? 'Running' : 'Stopped';
            const issueCount = status.issues ? status.issues.length : 0;
            
            console.log(`${statusIcon} Backup: ${backupStatus} | Issues: ${issueCount} | Last: ${status.lastBackup ? new Date(status.lastBackup).toLocaleTimeString('ja-JP') : 'Never'}`);
            
        } catch (error) {
            console.log(`🔴 Monitor Error: ${error.message}`);
        }
    }

    start() {
        if (this.isRunning) {
            console.log('Monitor is already running');
            return;
        }

        console.log(`🔍 Starting backup monitor (check interval: ${this.checkInterval} minutes)`);
        
        this.isRunning = true;
        
        // 即座に最初のチェックを実行
        this.displayStatus();
        
        // 定期実行を設定
        this.intervalId = setInterval(() => {
            if (this.quiet) {
                this.showQuickStatus();
            } else {
                this.displayStatus();
            }
        }, this.checkInterval * 60 * 1000);
        
        // プロセス終了時のクリーンアップ
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
    }

    stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('\\n🛑 Stopping backup monitor...');
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.isRunning = false;
        console.log('Monitor stopped');
        
        process.exit(0);
    }

    async oneTimeCheck() {
        await this.displayStatus();
    }
}

// CLI実行時の処理
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};
    
    let oneTime = false;
    
    // コマンドライン引数の解析
    args.forEach(arg => {
        if (arg === '--quiet' || arg === '-q') {
            options.quiet = true;
        } else if (arg.startsWith('--check-interval=')) {
            options.checkInterval = parseInt(arg.split('=')[1]);
        } else if (arg === '--once' || arg === '-o') {
            oneTime = true;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Usage: node monitor.js [options]

Options:
  --quiet, -q           Show minimal output
  --once, -o           Run check once and exit
  --check-interval=N   Check interval in minutes (default: 120)
  --help, -h           Show this help message

Examples:
  node monitor.js                    # Start continuous monitoring
  node monitor.js --once             # Run single check
  node monitor.js --quiet            # Minimal output mode
  node monitor.js --check-interval=60 # Check every hour
            `);
            process.exit(0);
        }
    });
    
    const monitor = new BackupMonitor(options);
    
    if (oneTime) {
        monitor.oneTimeCheck().then(() => process.exit(0));
    } else {
        monitor.start();
    }
}

module.exports = BackupMonitor;