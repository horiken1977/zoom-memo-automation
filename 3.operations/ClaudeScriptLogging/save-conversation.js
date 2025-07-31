#!/usr/bin/env node

/**
 * 対話内容を手動でclaude.mdに記録するスクリプト
 * 使用方法: node save-conversation.js "ユーザー要求" "実装内容"
 */

const fs = require('fs-extra');
const path = require('path');

// プロジェクトルートディレクトリ（2階層上）
const projectRoot = path.join(__dirname, '..', '..');
const claudeMdPath = path.join(projectRoot, '0.docs/claude.md');

async function saveConversation(userRequest, implementation) {
  const timestamp = new Date();
  const dateStr = timestamp.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit'
  }).replace(/\//g, '/');
  const timeStr = timestamp.toTimeString().split(' ')[0].substring(0, 5);

  const entry = `

### ${dateStr} ${timeStr} - ${getSummary(implementation)}

**ユーザー要求:**
${userRequest}

**実装内容:**
${implementation}

**変更点:**
${extractChanges(implementation).map(item => `- ${item}`).join('\n')}
`;

  await fs.appendFile(claudeMdPath, entry);
  console.log('✅ claude.mdに対話記録を追加しました');
  
  // 監視スクリプトが起動していれば、自動的に設計書が更新される
  console.log('📝 claude-monitorが起動していれば、設計書が自動更新されます');
}

function getSummary(text) {
  // 最初の実装項目を要約として使用
  const match = text.match(/(?:実装|作成|追加|更新).*?[:：]\s*(.+)/);
  return match ? match[1].substring(0, 50) + '...' : '対話記録';
}

function extractChanges(text) {
  const changes = [];
  const patterns = [
    /(?:実装|作成|追加|更新|修正)しました[:：]\s*(.+)/g,
    /`([^`]+\.(js|html|json|md))`/g
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      changes.push(match[1]);
    }
  });
  
  return changes;
}

// CLIとして実行
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('使用方法: node save-conversation.js "ユーザー要求" "実装内容"');
    console.log('例: node save-conversation.js "Google Drive統合を実装して" "Google Drive APIを実装しました..."');
    process.exit(1);
  }
  
  saveConversation(args[0], args[1]).catch(console.error);
}

module.exports = { saveConversation };