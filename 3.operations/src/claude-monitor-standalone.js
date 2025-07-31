#!/usr/bin/env node

/**
 * Claude対話記録を監視し、変更があった場合に設計書を自動更新するスクリプト
 * 環境変数チェックなしのスタンドアロン版
 */

const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs-extra');

class ClaudeMonitorStandalone {
  constructor() {
    this.projectRoot = path.join(__dirname, '..', '..');
    this.claudeMdPath = path.join(this.projectRoot, '0.docs/claude.md');
    this.lastProcessedSize = 0;
    this.isProcessing = false;
  }

  /**
   * 監視を開始
   */
  async start() {
    console.log('🔍 Starting Claude document monitor...');
    console.log(`📁 Monitoring: ${this.claudeMdPath}`);

    // 初期ファイルサイズを記録
    try {
      const stats = await fs.stat(this.claudeMdPath);
      this.lastProcessedSize = stats.size;
      console.log(`📏 Initial file size: ${stats.size} bytes`);
    } catch (error) {
      console.warn('⚠️  Claude.md not found, will be created on first update');
    }

    // ファイル監視の設定
    const watcher = chokidar.watch(this.claudeMdPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    // ファイル変更時の処理
    watcher.on('change', async (filePath) => {
      if (this.isProcessing) {
        console.log('⏳ Already processing, skipping...');
        return;
      }

      try {
        this.isProcessing = true;
        console.log('🔄 Claude.md changed, processing updates...');
        
        await this.processChanges();
        
      } catch (error) {
        console.error('❌ Error processing changes:', error.message);
      } finally {
        this.isProcessing = false;
      }
    });

    // ファイル追加時の処理
    watcher.on('add', async (filePath) => {
      console.log('📝 Claude.md created');
      this.lastProcessedSize = 0;
    });

    // エラーハンドリング
    watcher.on('error', error => {
      console.error('❌ Watcher error:', error.message);
    });

    console.log('✅ Monitoring started. Press Ctrl+C to stop.');
  }

  /**
   * ファイルの変更を処理
   */
  async processChanges() {
    try {
      const content = await fs.readFile(this.claudeMdPath, 'utf-8');
      const stats = await fs.stat(this.claudeMdPath);

      // 新しく追加された部分だけを処理
      if (stats.size <= this.lastProcessedSize) {
        console.log('ℹ️  No new content to process');
        return;
      }

      // 最新の対話記録を解析
      const newContent = content.substring(this.lastProcessedSize);
      const changes = await this.analyzeNewContent(newContent);

      if (changes.length > 0) {
        console.log(`🔧 Found ${changes.length} changes to apply`);
        await this.applyChangesToDocs(changes);
      } else {
        console.log('ℹ️  No significant changes detected');
      }

      this.lastProcessedSize = stats.size;

    } catch (error) {
      console.error('❌ Failed to process changes:', error.message);
    }
  }

  /**
   * 新しいコンテンツを解析
   */
  async analyzeNewContent(content) {
    const changes = [];
    
    // 実装済み機能の検出
    const implementedPattern = /(?:実装|作成|追加|更新)(?:しました|完了)[:：]\s*(.+)/g;
    let match;
    while ((match = implementedPattern.exec(content)) !== null) {
      changes.push({
        type: 'implementation',
        description: match[1].trim(),
        status: 'completed'
      });
    }

    // API統合の検出
    const apiPattern = /(Google Drive|Slack|Zoom|Gemini)\s*API/gi;
    while ((match = apiPattern.exec(content)) !== null) {
      changes.push({
        type: 'api_integration',
        description: `${match[1]} API統合`,
        status: 'completed'
      });
    }

    // ファイル更新の検出
    const filePattern = /`([^`]+\.(js|html|json|md))`/g;
    while ((match = filePattern.exec(content)) !== null) {
      changes.push({
        type: 'file_update',
        description: `ファイル: ${match[1]}`,
        status: 'updated'
      });
    }

    return changes;
  }

  /**
   * 変更を設計書に適用
   */
  async applyChangesToDocs(changes) {
    // 機能設計書の更新
    await this.updateFunctionalDesign(changes.filter(c => 
      c.type === 'implementation' || c.type === 'file_update'
    ));

    // 環境設計書の更新  
    await this.updateEnvironmentDesign(changes.filter(c => 
      c.type === 'api_integration'
    ));

    console.log('✅ Design documents updated successfully');
  }

  /**
   * 機能設計書を更新 
   */
  async updateFunctionalDesign(changes) {
    if (changes.length === 0) return;

    const htmlPath = path.join(this.projectRoot, '0.docs/functional-design.html');
    try {
      let html = await fs.readFile(htmlPath, 'utf-8');

      // 最終更新日時を更新
      const now = new Date().toLocaleString('ja-JP');
      html = html.replace(
        /<span id="lastUpdated">.*?<\/span>/,
        `<span id="lastUpdated">${now}</span>`
      );

      // 自動更新ステータスを有効に
      html = html.replace(
        /自動更新: <span id="autoUpdate">.*?<\/span>/,
        `自動更新: <span id="autoUpdate">有効 (${now})</span>`
      );

      await fs.writeFile(htmlPath, html);
      console.log('📋 Functional design updated');
    } catch (error) {
      console.error('❌ Failed to update functional design:', error.message);
    }
  }

  /**
   * 環境設計書を更新
   */
  async updateEnvironmentDesign(changes) {
    if (changes.length === 0) return;

    const htmlPath = path.join(this.projectRoot, '0.docs/environment-design.html');
    try {
      let html = await fs.readFile(htmlPath, 'utf-8');

      // 最終更新日時を更新
      const now = new Date().toLocaleString('ja-JP');
      html = html.replace(
        /<span id="lastUpdated">.*?<\/span>/,
        `<span id="lastUpdated">${now}</span>`
      );

      await fs.writeFile(htmlPath, html);
      console.log('🏗️  Environment design updated');
    } catch (error) {
      console.error('❌ Failed to update environment design:', error.message);
    }
  }
}

// スクリプトとして実行された場合
if (require.main === module) {
  const monitor = new ClaudeMonitorStandalone();
  
  // プロセス終了時のクリーンアップ
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping Claude monitor...');
    process.exit(0);
  });

  // 監視開始
  monitor.start().catch(error => {
    console.error('❌ Failed to start monitor:', error.message);
    process.exit(1);
  });
}

module.exports = ClaudeMonitorStandalone;