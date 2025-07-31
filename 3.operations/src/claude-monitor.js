#!/usr/bin/env node

/**
 * Claude対話記録を監視し、変更があった場合に設計書を自動更新するスクリプト
 */

const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs-extra');
const ClaudeDocUpdater = require('../../1.src/utils/claudeDocUpdater');
const logger = require('../../1.src/utils/logger');

class ClaudeMonitor {
  constructor() {
    this.updater = new ClaudeDocUpdater();
    this.claudeMdPath = path.join(__dirname, '../../0.docs/claude.md');
    this.lastProcessedSize = 0;
    this.isProcessing = false;
  }

  /**
   * 監視を開始
   */
  async start() {
    logger.info('Starting Claude document monitor...');

    // 初期ファイルサイズを記録
    try {
      const stats = await fs.stat(this.claudeMdPath);
      this.lastProcessedSize = stats.size;
    } catch (error) {
      logger.warn('Claude.md not found, will be created on first update');
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
        logger.info('Already processing, skipping...');
        return;
      }

      try {
        this.isProcessing = true;
        logger.info('Claude.md changed, processing updates...');
        
        await this.processChanges();
        
      } catch (error) {
        logger.error('Error processing changes:', error);
      } finally {
        this.isProcessing = false;
      }
    });

    // ファイル追加時の処理
    watcher.on('add', async (filePath) => {
      logger.info('Claude.md created');
      this.lastProcessedSize = 0;
    });

    // エラーハンドリング
    watcher.on('error', error => {
      logger.error('Watcher error:', error);
    });

    logger.info(`Monitoring ${this.claudeMdPath} for changes...`);
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
        logger.info('No new content to process');
        return;
      }

      // 最新の対話記録を解析
      const newContent = content.substring(this.lastProcessedSize);
      const changes = await this.analyzeNewContent(newContent);

      if (changes.length > 0) {
        logger.info(`Found ${changes.length} changes to apply`);
        await this.applyChangesToDocs(changes);
      }

      this.lastProcessedSize = stats.size;

    } catch (error) {
      logger.error('Failed to process changes:', error);
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

    // テスト仕様書の更新
    await this.updateTestSpecification(changes.filter(c => 
      c.type === 'implementation'
    ));

    logger.info('Design documents updated successfully');
  }

  /**
   * 機能設計書を更新
   */
  async updateFunctionalDesign(changes) {
    if (changes.length === 0) return;

    const htmlPath = path.join(__dirname, '../../0.docs/functional-design.html');
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
    logger.info('Functional design updated');
  }

  /**
   * 環境設計書を更新
   */
  async updateEnvironmentDesign(changes) {
    if (changes.length === 0) return;

    const htmlPath = path.join(__dirname, '../../0.docs/environment-design.html');
    let html = await fs.readFile(htmlPath, 'utf-8');

    // API統合ステータスを更新
    changes.forEach(change => {
      if (change.description.includes('Google Drive')) {
        html = html.replace(
          /Google Drive Platform.*?status-\w+/,
          'Google Drive Platform <span class="status-badge status-completed'
        );
      }
    });

    // 最終更新日時
    const now = new Date().toLocaleString('ja-JP');
    html = html.replace(
      /<span id="lastUpdated">.*?<\/span>/,
      `<span id="lastUpdated">${now}</span>`
    );

    await fs.writeFile(htmlPath, html);
    logger.info('Environment design updated');
  }

  /**
   * テスト仕様書を更新
   */
  async updateTestSpecification(changes) {
    if (changes.length === 0) return;

    const htmlPath = path.join(__dirname, '../../0.docs/test-specification.html');
    let html = await fs.readFile(htmlPath, 'utf-8');

    // テストケースのステータスを更新
    changes.forEach(change => {
      // 実装された機能に対応するテストケースを完了にする
      if (change.description.includes('Zoom') && change.description.includes('録画')) {
        html = html.replace(
          /TC001:.*?status-\w+/,
          'TC001: Zoom Cloud Recording監視テスト</h3>\n                <div class="test-matrix">'
        );
      }
    });

    await fs.writeFile(htmlPath, html);
    logger.info('Test specification updated');
  }
}

// スクリプトとして実行された場合
if (require.main === module) {
  const monitor = new ClaudeMonitor();
  
  // プロセス終了時のクリーンアップ
  process.on('SIGINT', () => {
    logger.info('Stopping Claude monitor...');
    process.exit(0);
  });

  // 監視開始
  monitor.start().catch(error => {
    logger.error('Failed to start monitor:', error);
    process.exit(1);
  });
}

module.exports = ClaudeMonitor;