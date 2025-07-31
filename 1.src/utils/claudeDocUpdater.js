const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

/**
 * Claude対話記録を自動的に分析し、設計書を更新するユーティリティ
 */
class ClaudeDocUpdater {
  constructor() {
    this.docsPath = path.join(__dirname, '../../0.docs');
    this.claudeMdPath = path.join(this.docsPath, 'claude.md');
    this.functionalDesignPath = path.join(this.docsPath, 'functional-design.html');
    this.environmentDesignPath = path.join(this.docsPath, 'environment-design.html');
    this.testSpecPath = path.join(this.docsPath, 'test-specification.html');
    
    this.changeLog = [];
  }

  /**
   * Claude.mdファイルに新しい対話記録を追加
   */
  async appendConversation(userMessage, assistantResponse, timestamp = new Date()) {
    try {
      const dateStr = timestamp.toISOString().split('T')[0];
      const timeStr = timestamp.toTimeString().split(' ')[0];
      
      // 対話内容から重要な変更を抽出
      const changes = this.extractChanges(assistantResponse);
      
      const conversationEntry = `

### ${dateStr} ${timeStr} - ${changes.summary || '対話記録'}

**ユーザー要求:**
${userMessage}

**実装内容:**
${assistantResponse}

**変更点:**
${changes.items.map(item => `- ${item}`).join('\n')}
`;

      // claude.mdに追記
      await fs.appendFile(this.claudeMdPath, conversationEntry);
      logger.info('Claude.md updated with new conversation');

      // 変更があれば設計書を更新
      if (changes.items.length > 0) {
        await this.updateDesignDocs(changes);
      }

      return changes;
    } catch (error) {
      logger.error('Failed to append conversation:', error);
      throw error;
    }
  }

  /**
   * アシスタントの応答から重要な変更を抽出
   */
  extractChanges(response) {
    const changes = {
      summary: '',
      items: [],
      functions: [],
      apis: [],
      configs: []
    };

    // 機能追加・変更の検出
    const functionPatterns = [
      /実装しました[：:]\s*(.+)/g,
      /追加しました[：:]\s*(.+)/g,
      /作成しました[：:]\s*(.+)/g,
      /更新しました[：:]\s*(.+)/g,
      /修正しました[：:]\s*(.+)/g
    ];

    functionPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(response)) !== null) {
        changes.items.push(match[1].trim());
      }
    });

    // API関連の変更検出
    if (response.includes('Google Drive') || response.includes('Drive API')) {
      changes.apis.push('Google Drive API統合');
    }
    if (response.includes('Gemini') || response.includes('Google AI')) {
      changes.apis.push('Google Gemini API');
    }
    if (response.includes('Slack')) {
      changes.apis.push('Slack API統合');
    }

    // ファイル作成・更新の検出
    const filePattern = /`([^`]+\.(js|html|json|md))`/g;
    let fileMatch;
    while ((fileMatch = filePattern.exec(response)) !== null) {
      changes.functions.push(`ファイル更新: ${fileMatch[1]}`);
    }

    // サマリーの生成
    if (changes.items.length > 0) {
      changes.summary = changes.items[0].substring(0, 50) + '...';
    }

    return changes;
  }

  /**
   * 設計書HTMLファイルを更新
   */
  async updateDesignDocs(changes) {
    try {
      // 機能設計書の更新
      if (changes.functions.length > 0) {
        await this.updateFunctionalDesign(changes);
      }

      // 環境設計書の更新
      if (changes.apis.length > 0 || changes.configs.length > 0) {
        await this.updateEnvironmentDesign(changes);
      }

      logger.info('Design documents updated based on conversation');
    } catch (error) {
      logger.error('Failed to update design documents:', error);
    }
  }

  /**
   * 機能設計書を更新
   */
  async updateFunctionalDesign(changes) {
    try {
      let html = await fs.readFile(this.functionalDesignPath, 'utf-8');
      
      // 最終更新日時を更新
      const now = new Date().toLocaleString('ja-JP');
      html = html.replace(
        /最終更新: <span id="lastUpdated">.*?<\/span>/,
        `最終更新: <span id="lastUpdated">${now}</span>`
      );

      // 変更履歴セクションを追加（存在しない場合）
      if (!html.includes('変更履歴')) {
        const changeLogSection = `
        <div class="section">
            <h2>変更履歴</h2>
            <div class="change-log">
                <table>
                    <tr>
                        <th>日時</th>
                        <th>変更内容</th>
                        <th>種別</th>
                    </tr>
                    ${changes.items.map(item => `
                    <tr>
                        <td>${new Date().toLocaleString('ja-JP')}</td>
                        <td>${item}</td>
                        <td><span class="status-badge status-completed">実装</span></td>
                    </tr>`).join('')}
                </table>
            </div>
        </div>`;
        
        html = html.replace('</body>', changeLogSection + '\n</body>');
      }

      await fs.writeFile(this.functionalDesignPath, html);
    } catch (error) {
      logger.error('Failed to update functional design:', error);
    }
  }

  /**
   * 環境設計書を更新
   */
  async updateEnvironmentDesign(changes) {
    try {
      let html = await fs.readFile(this.environmentDesignPath, 'utf-8');
      
      // API統合状況を更新
      changes.apis.forEach(api => {
        if (api.includes('Google Drive')) {
          html = html.replace(
            /<h3>Google Drive Platform.*?<span class="status-badge.*?">.*?<\/span><\/h3>/,
            '<h3>Google Drive Platform <span class="status-badge status-completed">設定済み</span></h3>'
          );
        }
      });

      // 最終更新日時を更新
      const now = new Date().toLocaleString('ja-JP');
      html = html.replace(
        /最終更新: <span id="lastUpdated">.*?<\/span>/,
        `最終更新: <span id="lastUpdated">${now}</span>`
      );

      await fs.writeFile(this.environmentDesignPath, html);
    } catch (error) {
      logger.error('Failed to update environment design:', error);
    }
  }

  /**
   * 定期的に対話ログをチェックして更新
   */
  async startAutoUpdate(intervalMinutes = 5) {
    logger.info(`Starting Claude doc auto-updater (interval: ${intervalMinutes} minutes)`);
    
    // 初回実行
    await this.checkForUpdates();
    
    // 定期実行
    setInterval(async () => {
      await this.checkForUpdates();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * 更新チェック
   */
  async checkForUpdates() {
    try {
      // Claude.mdファイルの最終更新時刻をチェック
      const stats = await fs.stat(this.claudeMdPath);
      const lastModified = stats.mtime;
      
      logger.info(`Checking for Claude.md updates (last modified: ${lastModified})`);
      
      // 必要に応じて設計書を再生成
      // ここでは実装の詳細は省略
      
    } catch (error) {
      logger.error('Update check failed:', error);
    }
  }
}

module.exports = ClaudeDocUpdater;