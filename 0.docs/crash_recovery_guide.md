# 🚨 VSCodeクラッシュ時の復元ガイド

## 1. 即座の復元手順（クラッシュ後）

### ステップ1: Claude Codeで以下を実行
```
MCPのCipherを用いて、今までの対話記録を確認し、VSCodeがクラッシュする直前までの作業内容、プロジェクトの目的、次にやるべきことなどを復元してください
```

### ステップ2: CLAUDE.mdの強制実行プロトコル
Claude Codeは自動的に以下を実行します：
1. git status/log確認
2. 前回変更差分確認  
3. TodoWriteでタスク復元
4. 動作確認テスト実行

## 2. 自動保存の設定（予防策）

### A. 手動セッション保存（推奨）
```bash
# 重要な作業の区切りで実行
./3.operations/src/save_claude_session.sh
```

### B. 定期自動保存設定（cron）
```bash
# crontab -e で以下を追加
*/30 * * * * /Users/aa479881/Library/CloudStorage/GoogleDrive-horie.kenichi@grtx.jp/共有ドライブ/103_全社共有用/社内DX/zoom-memo-automation/zoom-memo-automation/3.operations/src/save_claude_session.sh
```

### C. Git Hookによる自動保存
```bash
# .git/hooks/pre-commit に追加
#!/bin/bash
./3.operations/src/save_claude_session.sh
```

## 3. Cipher MCPサーバーの確認

### 設定ファイル確認
```bash
cat ~/.claude/config.json
```

### Cipherが動作しているか確認
```bash
ps aux | grep cipher
```

### Cipher再起動（必要時）
```bash
pkill cipher
/opt/homebrew/bin/cipher --mode mcp &
```

## 4. 復元時のチェックリスト

### ✅ 必須確認項目
- [ ] git status確認
- [ ] 最新コミット確認
- [ ] 未保存の変更確認
- [ ] テストスクリプトの存在確認
- [ ] 環境変数の確認（Vercel）

### 📋 復元すべき情報
1. **作業内容**: 何をしていたか
2. **問題点**: 何が課題だったか
3. **次の作業**: 何をすべきか
4. **テスト状況**: どのテストが成功/失敗か
5. **変更内容**: どのファイルを変更したか

## 5. セッション情報の保存場所

```
3.operations/
├── claude_sessions/
│   ├── latest_session.md  # 最新セッション（シンボリックリンク）
│   └── session_*.md        # タイムスタンプ付きセッション
└── src/
    └── save_claude_session.sh  # 保存スクリプト
```

## 6. トラブルシューティング

### Cipherが動作しない場合
1. Claude Codeを再起動
2. config.jsonを確認
3. Cipherを手動起動

### セッション復元できない場合
1. git logから最近の作業を推測
2. CLAUDE.mdの最終更新日時確認
3. Vercelログから実行履歴確認

## 7. 重要な注意事項

⚠️ **VSCodeがクラッシュしても慌てない**
- Gitにコミット済みの内容は安全
- CLAUDE.mdに基本方針が記載済み
- このガイドで必ず復元可能

💡 **予防が最重要**
- 重要な作業後は必ずセッション保存
- 定期的なgit commit
- TodoWriteでタスク管理

---
最終更新: 2025-08-15
作成: Claude Code自動生成