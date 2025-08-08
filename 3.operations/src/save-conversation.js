#!/usr/bin/env node

/**
 * Cipher連携による対話記録自動保存スクリプト
 * 
 * 使用方法:
 * 1. node 3.operations/src/save-conversation.js
 * 2. または npm script として実行
 * 
 * 機能:
 * - Claude Codeとの対話をCipherのメモリに保存
 * - CLAUDE.mdファイルの自動更新
 * - 開発ドキュメントへの反映
 */

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class ConversationSaver {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '../..');
    this.claudeMdPath = path.join(this.projectRoot, 'CLAUDE.md');
    this.docsPath = path.join(this.projectRoot, '0.docs');
  }

  /**
   * Cipherに対話記録を保存
   */
  async saveToipher(conversationSummary) {
    return new Promise((resolve, reject) => {
      const prompt = `
        Save the following Zoom Memo Automation project conversation:
        Date: ${new Date().toISOString()}
        Summary: ${conversationSummary}
        Project: zoom-memo-automation
        Topics: Zoom OAuth, JWT authentication, PT001 testing, Vercel deployment
      `;

      exec(`echo '${prompt}' | /opt/homebrew/bin/cipher`, (error, stdout, stderr) => {
        if (error) {
          console.error('Cipher保存エラー:', error);
          reject(error);
        } else {
          console.log('Cipher保存成功:', stdout);
          resolve(stdout);
        }
      });
    });
  }

  /**
   * CLAUDE.mdファイルを更新
   */
  async updateClaudeMd(content) {
    try {
      const currentContent = await fs.readFile(this.claudeMdPath, 'utf-8');
      
      // 最新の対話記録セクションを探す
      const sectionMarker = '## 📝 最新の対話記録と問題解決状況';
      const sectionIndex = currentContent.indexOf(sectionMarker);
      
      if (sectionIndex === -1) {
        // セクションが存在しない場合は追加
        const newContent = currentContent + '\n\n' + content;
        await fs.writeFile(this.claudeMdPath, newContent);
      } else {
        // 既存セクションを更新
        const beforeSection = currentContent.substring(0, sectionIndex);
        const newContent = beforeSection + content;
        await fs.writeFile(this.claudeMdPath, newContent);
      }
      
      console.log('✅ CLAUDE.md更新完了');
    } catch (error) {
      console.error('❌ CLAUDE.md更新エラー:', error);
      throw error;
    }
  }

  /**
   * 今日の対話記録を生成
   */
  generateTodaysSummary() {
    const today = new Date().toISOString().split('T')[0];
    
    return `## 📝 最新の対話記録と問題解決状況

### ${today} 対話記録

#### 実施内容
- TC205テスト成功確認（228.8秒）
- PT001本番スルーテスト実装
- Zoom OAuth/JWT認証問題の診断
- JWT認証フォールバックテスト実装

#### Zoom認証問題の解決状況
- OAuth: 400 Bad Request → App設定問題
- JWT: 401 Invalid access token → Credentials無効
- 次のアクション: Zoom Marketplace設定確認

#### Cipher自動保存
- 保存時刻: ${new Date().toISOString()}
- セッションID: ${Date.now()}

---

最終更新: ${new Date().toISOString()}
自動保存: Cipher連携スクリプト
`;
  }

  /**
   * メイン実行
   */
  async run() {
    try {
      console.log('🔄 対話記録保存開始...');
      
      // 1. 今日の対話サマリーを生成
      const summary = this.generateTodaysSummary();
      
      // 2. Cipherに保存
      console.log('📝 Cipherに保存中...');
      await this.saveToipher('Zoom認証問題診断とPT001テスト実装');
      
      // 3. CLAUDE.mdを更新
      console.log('📄 CLAUDE.md更新中...');
      await this.updateClaudeMd(summary);
      
      console.log('✅ 対話記録保存完了！');
      
    } catch (error) {
      console.error('❌ 保存処理エラー:', error);
      process.exit(1);
    }
  }
}

// 実行
if (require.main === module) {
  const saver = new ConversationSaver();
  saver.run();
}

module.exports = ConversationSaver;