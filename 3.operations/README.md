# 運用ツール（Operations）

このディレクトリには、開発・運用を支援するツール群が格納されています。

## 📁 ディレクトリ構造

```
3.operations/
├── src/                    # 運用スクリプト
│   └── save-conversation.js  # Cipher連携対話記録保存
└── README.md              # このファイル
```

## 🔧 ツール一覧

### 1. save-conversation.js - Cipher連携対話記録保存

Claude Codeとの対話記録を自動的に保存・管理するスクリプト。

#### 機能
- Cipherメモリへの対話記録保存
- CLAUDE.mdファイルの自動更新
- タイムスタンプ付き履歴管理

#### 使用方法

```bash
# 直接実行
node 3.operations/src/save-conversation.js

# npm scriptとして実行（package.jsonに追加後）
npm run save-conversation
```

#### Cipher設定

MCPサーバとしてCipherが設定されている必要があります：

```json
// ~/.claude/config.json
{
  "mcpServers": {
    "cipher": {
      "command": "/opt/homebrew/bin/cipher",
      "args": ["--mode", "mcp"]
    }
  }
}
```

#### リカバリ方法

IDEクラッシュやPC再起動時の復旧：

1. Cipherプロセス確認
```bash
ps aux | grep cipher
```

2. Cipher再起動
```bash
/opt/homebrew/bin/cipher --mode mcp
```

3. 対話記録の再保存
```bash
node 3.operations/src/save-conversation.js
```

## 🔄 自動化設定

### package.jsonへの追加

```json
{
  "scripts": {
    "save-conversation": "node 3.operations/src/save-conversation.js",
    "cipher:start": "/opt/homebrew/bin/cipher --mode mcp",
    "cipher:test": "echo 'Test message' | /opt/homebrew/bin/cipher"
  }
}
```

### Git Hookでの自動実行

`.git/hooks/post-commit`に以下を追加：

```bash
#!/bin/sh
node 3.operations/src/save-conversation.js
```

## 📝 対話記録フォーマット

保存される対話記録は以下の形式：

```markdown
### YYYY-MM-DD 対話記録

#### 実施内容
- 実施項目1
- 実施項目2

#### 問題と解決
- 問題: 詳細
- 解決: アプローチ

#### Cipher自動保存
- 保存時刻: ISO8601形式
- セッションID: タイムスタンプ
```

## 🔐 セキュリティ注意事項

- APIキーや認証情報は保存しない
- 個人情報は匿名化する
- 機密情報は別途管理

## 🚀 今後の拡張予定

- [ ] Cipher APIモード対応
- [ ] 対話記録の検索機能
- [ ] 自動バックアップ機能
- [ ] ダッシュボード連携

---

最終更新: 2025-08-07
作成: Claude Code & Operations Team