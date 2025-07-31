#!/usr/bin/env node

/**
 * 設計書HTMLに自動更新機能を実装するスクリプト
 */

const fs = require('fs-extra');
const path = require('path');

async function updateDesignDocs() {
  const docsPath = path.join(__dirname, '../../0.docs');
  
  // 自動更新用のJavaScriptコード
  const autoUpdateScript = `
    <script>
        // 最終更新日時を設定
        document.getElementById('lastUpdated').textContent = new Date().toLocaleString('ja-JP');
        
        // Claude対話記録から自動更新
        async function checkForUpdates() {
            try {
                // Claude.mdファイルの内容を取得（実際の実装では、APIを通じて取得）
                const response = await fetch('/api/claude-status');
                if (response.ok) {
                    const data = await response.json();
                    
                    // 自動更新ステータスを表示
                    const autoUpdateEl = document.getElementById('autoUpdate');
                    if (autoUpdateEl) {
                        autoUpdateEl.textContent = '有効 (最終確認: ' + new Date().toLocaleTimeString('ja-JP') + ')';
                    }
                    
                    // 新しい変更があれば画面を更新
                    if (data.hasUpdates) {
                        console.log('新しい更新を検出しました。ページを再読み込みします。');
                        setTimeout(() => location.reload(), 2000);
                    }
                }
            } catch (error) {
                console.error('自動更新チェックエラー:', error);
            }
        }
        
        // 5分ごとに更新をチェック
        setInterval(checkForUpdates, 5 * 60 * 1000);
        
        // 初回チェック
        checkForUpdates();
    </script>
`;

  // 各HTMLファイルを更新
  const htmlFiles = [
    'functional-design.html',
    'environment-design.html', 
    'test-specification.html'
  ];

  for (const file of htmlFiles) {
    const filePath = path.join(docsPath, file);
    
    try {
      let html = await fs.readFile(filePath, 'utf-8');
      
      // 既存の簡易スクリプトを置き換え
      if (html.includes('// 実装予定: claude.mdファイルを解析')) {
        // 機能設計書の場合
        html = html.replace(
          /<script>[\s\S]*?\/\/ 実装予定: claude\.mdファイルを解析[\s\S]*?<\/script>/,
          autoUpdateScript
        );
      } else if (!html.includes('checkForUpdates')) {
        // スクリプトがない場合は追加
        html = html.replace('</body>', autoUpdateScript + '\n</body>');
      }
      
      await fs.writeFile(filePath, html);
      console.log(`✅ ${file} を更新しました`);
      
    } catch (error) {
      console.error(`❌ ${file} の更新に失敗:`, error.message);
    }
  }
}

// APIステータスエンドポイントも作成
async function createStatusAPI() {
  const apiPath = path.join(__dirname, '../../api/claude-status.js');
  
  const apiCode = `/**
 * Claude対話記録の更新状態を返すAPI
 */
const fs = require('fs').promises;
const path = require('path');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const claudeMdPath = path.join(__dirname, '../0.docs/claude.md');
    const stats = await fs.stat(claudeMdPath);
    
    // 最終更新から5分以内なら「更新あり」とする
    const hasUpdates = (Date.now() - stats.mtime.getTime()) < 5 * 60 * 1000;
    
    res.status(200).json({
      hasUpdates,
      lastModified: stats.mtime,
      size: stats.size
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      hasUpdates: false
    });
  }
};`;

  await fs.writeFile(apiPath, apiCode);
  console.log('✅ API endpoint claude-status.js を作成しました');
}

// 実行
async function main() {
  console.log('🔄 設計書の自動更新機能を実装しています...');
  
  await updateDesignDocs();
  await createStatusAPI();
  
  console.log('✅ 完了しました！');
  console.log('\n📝 使用方法:');
  console.log('1. npm run claude-monitor - Claude.mdの変更を監視');
  console.log('2. 設計書HTMLを開くと、自動的に更新をチェックします');
  console.log('3. /api/claude-webhook - 外部からの対話記録を受信');
}

main().catch(console.error);