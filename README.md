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

### 2. API設定（事前準備）

APIキーとアクセストークンを取得してください。**これらの機密情報は環境変数として設定し、コードには含めません。**

#### Zoom API
1. [Zoom Marketplace](https://marketplace.zoom.us) にアクセス
2. 「Develop > Build App」から Server-to-Server OAuth アプリを作成
3. 以下の情報を取得：
   - `ZOOM_API_KEY`
   - `ZOOM_API_SECRET` 
   - `ZOOM_ACCOUNT_ID`

#### Google AI API  
1. [Google AI Studio](https://aistudio.google.com) にアクセス
2. APIキーを生成：
   - `GOOGLE_AI_API_KEY`

#### Slack API
1. [Slack API](https://api.slack.com/apps) でBotアプリを作成
2. 以下の情報を取得：
   - `SLACK_BOT_TOKEN` (xoxb-で始まるトークン)
   - `SLACK_CHANNEL_ID` (Cで始まるチャンネルID)
   - `SLACK_SIGNING_SECRET`
3. 必要な権限を付与：
   - `chat:write`
   - `files:write`
   - `channels:read`

### 3. 環境変数の設定

**重要**: APIキーやトークンは絶対にコードにハードコーディングせず、環境変数で管理してください。

#### ローカル開発環境
```bash
# .envファイルを作成（ローカル開発のみ）
cp .env.example .env
# .envファイルを編集して取得したAPIキーを設定

# または対話式セットアップ
npm run setup
```

#### GitHub環境（GitHub Actions用）
1. GitHubリポジトリの「Settings」→「Secrets and variables」→「Actions」へ移動
2. 「New repository secret」で以下の環境変数を追加：
   - `ZOOM_API_KEY`
   - `ZOOM_API_SECRET`
   - `ZOOM_ACCOUNT_ID`
   - `GOOGLE_AI_API_KEY`
   - `SLACK_BOT_TOKEN`
   - `SLACK_CHANNEL_ID`
   - `SLACK_SIGNING_SECRET`

#### Vercel環境（本番デプロイ用）
1. Vercelダッシュボードでプロジェクトを選択
2. 「Settings」→「Environment Variables」へ移動
3. 上記と同じ環境変数を追加（Production、Preview、Development環境それぞれに設定）

#### Docker/コンテナ環境
```bash
# 環境変数ファイルを作成
docker run -d \
  -e ZOOM_API_KEY=your_key \
  -e ZOOM_API_SECRET=your_secret \
  -e ZOOM_ACCOUNT_ID=your_account_id \
  -e GOOGLE_AI_API_KEY=your_key \
  -e SLACK_BOT_TOKEN=your_token \
  -e SLACK_CHANNEL_ID=your_channel_id \
  -e SLACK_SIGNING_SECRET=your_secret \
  zoom-memo-automation
```

### 4. 動作確認

環境変数設定後、システムをテストしてください：

```bash
# ヘルスチェック（全APIの接続確認）
npm run start -- --health-check

# Slack統合テスト（通知テスト）
npm run start -- --test-slack

# 一回だけ実行（録画処理テスト）
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

### 環境変数一覧

**セキュリティ重要**: 以下の環境変数は必ずGitHub SecretsやVercel Environment Variablesで管理してください。

| 変数名 | 説明 | 必須 | 設定場所 |
|--------|------|------|----------|
| `ZOOM_API_KEY` | Zoom API キー | ✅ | GitHub Secrets / Vercel |
| `ZOOM_API_SECRET` | Zoom API シークレット | ✅ | GitHub Secrets / Vercel |
| `ZOOM_ACCOUNT_ID` | Zoom アカウント ID | ✅ | GitHub Secrets / Vercel |
| `GOOGLE_AI_API_KEY` | Google AI API キー | ✅ | GitHub Secrets / Vercel |
| `SLACK_BOT_TOKEN` | Slack Bot トークン | ✅ | GitHub Secrets / Vercel |
| `SLACK_CHANNEL_ID` | Slack チャンネル ID | ✅ | GitHub Secrets / Vercel |
| `SLACK_SIGNING_SECRET` | Slack署名シークレット | ✅ | GitHub Secrets / Vercel |
| `CHECK_INTERVAL_MINUTES` | チェック間隔（分） | - | 設定ファイル |
| `LOG_LEVEL` | ログレベル | - | 設定ファイル |

### デプロイ時の注意事項

#### GitHub Actions
- リポジトリ設定でSecretsを追加
- ワークフローファイルで `secrets.VARIABLE_NAME` として参照

#### Vercel
- プロジェクト設定で環境変数を追加
- Production/Preview/Development環境それぞれに設定
- 自動デプロイ時に環境変数が反映される

## 🔒 セキュリティ重要事項

### 環境変数管理の重要性

**⚠️ 絶対に守ってください**：
- APIキーやトークンをコードに直接記述しない
- `.env`ファイルを`.gitignore`に追加（既に設定済み）
- 本番環境ではGitHub SecretsやVercel Environment Variablesを使用
- 開発チーム内でもAPIキーの共有は最小限に

### 権限管理

- **Zoom API**: 必要最小限の権限のみ付与
- **Google AI API**: 使用量制限を設定
- **Slack Bot**: 必要なチャンネルのみアクセス可能

### ログ・データ管理

- 録画ファイルは処理後自動削除
- ログファイルに機密情報を出力しない
- 文字起こし結果の保存期間を設定

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