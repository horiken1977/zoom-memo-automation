# 🤖 Zoom Memo Automation

Zoomクラウド録画を自動で監視し、Google AIで文字起こし・要約を行い、Slackに通知するシステムです。

## 🌟 機能

### 1. 📹 Zoomクラウド録画監視
- 新規録画の自動検知
- 録画ファイルの自動ダウンロード
- 音声・動画ファイルの処理

### 2. 🤖 AI文字起こし・要約
- Google AI (Gemini) による高精度文字起こし
- 自動要約生成（会議目的、出席者、議論内容、決定事項、NextAction）
- 話者の識別と発言時間の分析

### 3. 💬 Slack自動通知
- 構造化された会議要約の送信
- アクションアイテム・決定事項の整理
- 文字起こし全文ファイルの添付

### 4. 📊 監視・運用
- リアルタイム監視ダッシュボード
- 自動エラー通知
- ログ管理・分析

## 🚀 クイックスタート

### 1. インストール

```bash
# 依存関係をインストール  
npm install
```

### 2. 設定

```bash
# セットアップウィザードを実行
npm run setup
```

または手動で `.env` ファイルを作成：

```bash
cp .env.example .env
# .env ファイルを編集して必要な情報を入力
```

### 3. API設定

#### Zoom API
1. [Zoom Marketplace](https://marketplace.zoom.us) にアクセス
2. 「Develop > Build App」から Server-to-Server OAuth アプリを作成
3. API Key, API Secret, Account ID を取得

#### Google AI API  
1. [Google AI Studio](https://aistudio.google.com) にアクセス
2. APIキーを生成

#### Slack API
1. [Slack API](https://api.slack.com/apps) でBotアプリを作成
2. Bot Token, Channel ID, Signing Secret を取得
3. 必要な権限を付与：
   - `chat:write`
   - `files:write`
   - `channels:read`

### 4. 動作確認

```bash
# ヘルスチェック
npm run start -- --health-check

# Slack統合テスト
npm run start -- --test-slack

# 一回だけ実行（テスト用）
npm run start -- --once
```

### 5. システム開始

```bash
# 定期監視開始
npm start

# バックグラウンド実行（本番環境）
nohup npm start > system.log 2>&1 &
```

## 📖 詳細ドキュメント

- **[開発ダッシュボード](0.docs/index.html)** - プロジェクト進捗・全体概要
- **[機能設計書](0.docs/functional-design.html)** - 詳細機能仕様
- **[環境設計書](0.docs/environment-design.html)** - システム構成・デプロイ
- **[テスト仕様書](0.docs/test-specification.html)** - テスト計画・自動化
- **[対話記録](0.docs/claude.md)** - 開発履歴・変更記録

## 🛠️ 使用方法

### コマンドライン

```bash
# 基本コマンド
npm start                          # 定期監視開始
npm run start -- --once           # 一回だけ実行
npm run start -- --test-slack     # Slack統合テスト
npm run start -- --health-check   # システムヘルスチェック

# 監視・運用
npm run monitor                    # システム監視
npm run backup                     # 対話記録バックアップ

# 開発・テスト
npm run dev                        # 開発モード（nodemon）
npm test                          # テスト実行
```

## 🏗️ システム構成

```
zoom-memo-automation/
├── 0.docs/                 # ドキュメント・ダッシュボード
├── 1.src/                  # アプリケーションソース
│   ├── config/            # 設定管理
│   ├── services/          # 各種サービス（Zoom, AI, Slack）
│   ├── utils/             # ユーティリティ（ログ等）
│   ├── index.js           # メインアプリケーション
│   └── setup.js           # セットアップウィザード
├── 2.tests/                # テスト関連
├── 3.operations/           # 運用・監視
│   ├── src/               # 運用スクリプト
│   ├── configs/           # 設定ファイル
│   ├── logs/              # ログファイル
│   └── backups/           # バックアップ
└── recordings/             # 録画ファイル保存
```

## ⚙️ 設定項目

### 主要な環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `ZOOM_API_KEY` | Zoom API キー | ✅ |
| `ZOOM_API_SECRET` | Zoom API シークレット | ✅ |
| `ZOOM_ACCOUNT_ID` | Zoom アカウント ID | ✅ |
| `GOOGLE_AI_API_KEY` | Google AI API キー | ✅ |
| `SLACK_BOT_TOKEN` | Slack Bot トークン | ✅ |
| `SLACK_CHANNEL_ID` | Slack チャンネル ID | ✅ |
| `CHECK_INTERVAL_MINUTES` | チェック間隔（分） | - |
| `LOG_LEVEL` | ログレベル | - |

## 🚨 トラブルシューティング

### よくある問題

#### 1. API認証エラー
```bash
# 設定確認
npm run start -- --health-check
```

#### 2. Slack通知が届かない
```bash
# Slack統合テスト
npm run start -- --test-slack
```

#### 3. ログ確認
```bash
# アプリケーションログ
tail -f 3.operations/logs/app.log
```

## 📊 監視

```bash
# リアルタイム監視
npm run monitor

# 一回だけチェック
npm run monitor -- --once
```

---

🤖 **Powered by Claude Code** | 📝 **Auto-generated Documentation** | 🚀 **GRTX Internal Tools**