# クイックテストガイド

このガイドでは、Zoom Memo Automationシステムの動作確認を素早く行う方法を説明します。

## 🚀 5分でできる基本動作確認

### Step 1: 環境変数チェック（1分）
```bash
# 環境変数が正しく設定されているか確認
npm run check-env:verbose
```

**確認ポイント:**
- ✅ 全ての環境変数に値が設定されている
- ✅ エラーメッセージが表示されない

### Step 2: API接続テスト（2分）
```bash
# 全てのAPIへの接続を確認
npm run start -- --health-check
```

**確認ポイント:**
- ✅ Zoom API: Connected
- ✅ Google AI: Connected  
- ✅ Slack: Connected

### Step 3: Slack通知テスト（2分）
```bash
# Slackにテストメッセージを送信
npm run start -- --test-slack
```

**確認ポイント:**
- ✅ Slackチャンネルにテストメッセージが届く
- ✅ メッセージのフォーマットが正しい

## 📋 詳細テスト手順

### 1. Zoom録画処理テスト（実録画が必要）

#### 準備
1. Zoomで短い会議（1-2分）を録画
2. クラウド録画として保存
3. 録画処理が完了するまで待つ（通常5-10分）

#### 実行
```bash
# 一回だけ実行して新しい録画を処理
npm run start -- --once
```

#### 確認項目
- [ ] 新しい録画が検出される
- [ ] 録画ファイルがダウンロードされる
- [ ] 文字起こしが開始される
- [ ] 要約が生成される
- [ ] Slackに通知が送信される

### 2. 定期監視テスト

```bash
# 5分間隔で監視（テスト用）
CHECK_INTERVAL_MINUTES=5 npm start
```

**10分間実行して確認:**
- [ ] 5分後に2回目のチェックが実行される
- [ ] 既存の録画を重複処理しない
- [ ] ログに定期実行が記録される

### 3. エラー処理テスト

#### 無効なAPIキーテスト
```bash
# 一時的に無効なキーでテスト
ZOOM_API_KEY=invalid npm run start -- --health-check
```

**確認:**
- [ ] エラーが適切に表示される
- [ ] システムがクラッシュしない

## 🔍 Vercel環境の確認

### 1. デプロイ状態の確認
1. https://vercel.com/horikens-projects/zoom-memo-automation にアクセス
2. 最新のデプロイが「Ready」になっているか確認

### 2. ドキュメントサイトの確認
以下のURLにアクセスして表示を確認:
- https://zoom-memo-automation.vercel.app/
- https://zoom-memo-automation.vercel.app/dashboard
- https://zoom-memo-automation.vercel.app/functional-design

### 3. 環境変数の確認
Vercelダッシュボード → Settings → Environment Variables で以下を確認:
- [ ] ZOOM_API_KEY（設定済み）
- [ ] GOOGLE_AI_API_KEY（設定済み）
- [ ] SLACK_BOT_TOKEN（設定済み）
- [ ] その他の必須環境変数

## ⚡ トラブルシューティング

### 問題: Slack通知が届かない
```bash
# Slackチャンネル情報を確認
node -e "console.log('Channel ID:', process.env.SLACK_CHANNEL_ID)"
```

### 問題: Zoom APIエラー
```bash
# Zoom API認証を個別にテスト
node -e "
const zoom = require('./1.src/services/zoomService');
new zoom().authenticate()
  .then(() => console.log('OK'))
  .catch(e => console.error(e));
"
```

### 問題: 文字起こしが失敗する
```bash
# Google AI APIを個別にテスト
node -e "
const ai = require('./1.src/services/aiService');
new ai().testConnection()
  .then(() => console.log('OK'))
  .catch(e => console.error(e));
"
```

## 📝 テスト結果の記録

テスト完了後、以下の情報を記録してください:

```
実施日時: 2025/7/XX XX:XX
実施者: [あなたの名前]

基本動作確認:
- 環境変数チェック: [OK/NG]
- API接続テスト: [OK/NG]
- Slack通知テスト: [OK/NG]

詳細テスト:
- Zoom録画処理: [OK/NG/未実施]
- 定期監視: [OK/NG/未実施]
- エラー処理: [OK/NG/未実施]

Vercel環境:
- デプロイ状態: [OK/NG]
- ドキュメントサイト: [OK/NG]

問題・改善点:
[ここに記載]
```

---

💡 **ヒント**: まずは「5分でできる基本動作確認」を実施し、問題がなければ詳細テストに進んでください。