# Claude Script Logging

Claude Code対話記録システムのスクリプト集です。

## 概要

Claude Codeとの対話を自動的に記録し、`claude.md`に保存するシステムです。対話がクラッシュしても記録が残り、設計書への自動反映も可能です。

## ファイル構成

```
3.operations/ClaudeScriptLogging/
├── claude-record.sh      # 対話記録付きClaude起動スクリプト
├── save-conversation.js  # 手動で対話を記録するNode.jsスクリプト
├── setup-claude-alias.sh # エイリアス設定スクリプト
└── README.md            # 本ファイル
```

## 使用方法

### 1. 初期設定（一度だけ実行）

```bash
cd /path/to/zoom-memo-automation/3.operations/ClaudeScriptLogging
chmod +x *.sh
./setup-claude-alias.sh
source ~/.zshrc  # または source ~/.bashrc
```

### 2. 対話の記録

#### 方法1: 記録付きでClaude起動
```bash
claude-zoom
```
- 全ての対話が`0.docs/conversations/`に自動保存されます
- 終了時に`claude.md`に記録が追加されます

#### 方法2: 対話後に手動記録
```bash
save-chat "ユーザー要求" "実装内容"
```
例：
```bash
save-chat "Google Drive統合を実装して" "Google Drive APIを実装しました。認証、アップロード、共有リンク生成機能を追加。"
```

### 3. 自動更新監視

別ターミナルで以下を実行しておくと、`claude.md`の変更を検知して設計書を自動更新：
```bash
claude-monitor
```

## 記録される場所

- **対話ログ**: `0.docs/conversations/conversation_YYYYMMDD_HHMMSS.log`
- **要約記録**: `0.docs/claude.md`
- **設計書**: `0.docs/*.html` （自動更新対象）

## 動作の仕組み

1. `claude-record.sh`がClaude Codeの入出力を`tee`でキャプチャ
2. 対話終了時に`claude.md`に要約を追記
3. `claude-monitor`が変更を検知して設計書HTMLを更新
4. 設計書のJavaScriptが定期的に更新をチェック

## トラブルシューティング

### エイリアスが動作しない場合
```bash
# 直接実行
./3.operations/ClaudeScriptLogging/claude-record.sh
```

### パーミッションエラー
```bash
chmod +x 3.operations/ClaudeScriptLogging/*.sh
chmod +x 3.operations/ClaudeScriptLogging/*.js
```

### claude-codeコマンドが見つからない
Claude Codeがインストールされていることを確認してください。

## 注意事項

- 対話記録には機密情報が含まれる可能性があるため、適切に管理してください
- `conversations/`フォルダは定期的に整理することを推奨します
- クラウドバックアップが必要な場合は、別途同期設定を行ってください