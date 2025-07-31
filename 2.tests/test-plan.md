# Zoom Memo Automation テスト計画書

## 1. テスト概要

### 目的
Vercel環境にデプロイされたZoom Memo Automationシステムが正常に動作することを確認する。

### テスト環境
- **本番環境**: Vercel (https://zoom-memo-automation.vercel.app/)
- **ローカル環境**: Node.js 18.x
- **外部サービス**: Zoom API, Google AI API, Slack API

### テスト実施期間
2025年7月31日〜

## 2. 単体テスト (Unit Test)

各コンポーネントが個別に正しく動作することを確認します。

### 2.1 環境変数チェック

#### テスト項目
```bash
# ローカル環境で実行
npm run check-env:verbose
```

#### 期待結果
- ✅ 全ての必須環境変数が設定されている
- ✅ 環境変数の形式が正しい（例：SLACK_BOT_TOKENが"xoxb-"で始まる）

### 2.2 Zoom API接続テスト

#### テスト内容
```javascript
// 1.src/services/zoomService.js の authenticate() メソッドをテスト
node -e "
const ZoomService = require('./1.src/services/zoomService');
const service = new ZoomService();
service.authenticate()
  .then(() => console.log('✅ Zoom API認証成功'))
  .catch(err => console.error('❌ Zoom API認証失敗:', err.message));
"
```

#### 期待結果
- ✅ OAuth2.0トークンが正常に取得できる
- ✅ トークンの有効期限が1時間以上

### 2.3 Google AI API接続テスト

#### テスト内容
```javascript
// Google AI APIのモデル情報取得テスト
node -e "
const AIService = require('./1.src/services/aiService');
const service = new AIService();
service.testConnection()
  .then(() => console.log('✅ Google AI API接続成功'))
  .catch(err => console.error('❌ Google AI API接続失敗:', err.message));
"
```

#### 期待結果
- ✅ Gemini 1.5 Proモデルにアクセスできる
- ✅ APIキーが有効である

### 2.4 Slack API接続テスト

#### テスト内容
```bash
# Slack統合テスト
npm run start -- --test-slack
```

#### 期待結果
- ✅ Slackチャンネルにテストメッセージが投稿される
- ✅ Bot権限が正しく設定されている

## 3. 結合テスト (Integration Test)

複数のコンポーネントが連携して動作することを確認します。

### 3.1 ヘルスチェックテスト

#### テスト内容
```bash
# 全サービスの接続確認
npm run start -- --health-check
```

#### 期待結果
- ✅ Zoom API: 接続成功
- ✅ Google AI API: 接続成功
- ✅ Slack API: 接続成功
- ✅ ファイルシステム: 書き込み権限あり

### 3.2 文字起こしテスト（サンプルファイル）

#### 準備
1. テスト用の短い音声ファイル（1-2分）を用意
2. `recordings/test/` フォルダに配置

#### テスト内容
```javascript
// 音声ファイルの文字起こしテスト
node -e "
const AIService = require('./1.src/services/aiService');
const fs = require('fs');
const path = require('path');

const service = new AIService();
const testFile = path.join(__dirname, 'recordings/test/sample.mp3');

if (fs.existsSync(testFile)) {
  service.transcribeAudio(testFile)
    .then(result => {
      console.log('✅ 文字起こし成功');
      console.log('文字数:', result.transcription.length);
    })
    .catch(err => console.error('❌ 文字起こし失敗:', err));
} else {
  console.log('⚠️ テストファイルが見つかりません');
}
"
```

#### 期待結果
- ✅ 音声ファイルが正常に処理される
- ✅ 日本語の文字起こしが生成される
- ✅ エラーが発生しない

### 3.3 要約生成テスト

#### テスト内容
```javascript
// テキストから要約生成
node -e "
const AIService = require('./1.src/services/aiService');
const service = new AIService();

const testTranscription = \`
山田：今日は新製品の開発会議を始めます。まず、開発スケジュールについて話し合いましょう。
田中：了解です。現在の進捗は予定通り70%完了しています。
山田：素晴らしい。リリース予定日は変更なしで大丈夫ですか？
田中：はい、8月15日のリリースに向けて順調に進んでいます。
山田：分かりました。では、次回は8月5日に最終確認を行いましょう。
\`;

service.generateSummary({ transcription: testTranscription })
  .then(summary => {
    console.log('✅ 要約生成成功');
    console.log(summary);
  })
  .catch(err => console.error('❌ 要約生成失敗:', err));
"
```

#### 期待結果
- ✅ 構造化された要約が生成される
- ✅ 会議目的、出席者、決定事項が含まれる
- ✅ NextActionと期限が抽出される

## 4. スルーテスト (End-to-End Test)

実際の使用シナリオに基づいて、システム全体の動作を確認します。

### 4.1 手動録画処理テスト

#### 前提条件
- Zoomアカウントに少なくとも1つのクラウド録画が存在する

#### テスト手順
1. **単一実行モードで起動**
   ```bash
   npm run start -- --once
   ```

2. **処理の流れを確認**
   - Zoom APIから録画リストを取得
   - 新しい録画があれば処理開始
   - 録画ファイルのダウンロード
   - 文字起こし処理
   - 要約生成
   - Slack通知送信

#### 期待結果
- ✅ 録画が検出される
- ✅ ダウンロードが完了する
- ✅ 文字起こしが生成される
- ✅ 要約がSlackに送信される
- ✅ エラーなく完了する

### 4.2 定期監視テスト

#### テスト手順
1. **監視モードで起動（5分間隔）**
   ```bash
   CHECK_INTERVAL_MINUTES=5 npm start
   ```

2. **10分間実行して動作確認**
   - 初回チェック実行
   - 5分後に2回目のチェック実行
   - ログを確認

3. **Ctrl+Cで停止**

#### 期待結果
- ✅ 5分ごとにチェックが実行される
- ✅ 重複処理が発生しない
- ✅ メモリリークがない
- ✅ 正常に停止できる

### 4.3 エラーハンドリングテスト

#### テスト内容
1. **無効な環境変数でテスト**
   ```bash
   ZOOM_API_KEY=invalid npm run start -- --health-check
   ```

2. **ネットワークエラーのシミュレーション**
   - Wi-Fiを一時的に切断して実行

#### 期待結果
- ✅ エラーが適切にログ出力される
- ✅ システムがクラッシュしない
- ✅ エラー内容がわかりやすい

## 5. Vercel環境固有のテスト

### 5.1 環境変数確認

#### テスト内容
Vercelダッシュボードで以下を確認：
1. Settings → Environment Variables
2. 全ての必須環境変数が設定されている
3. Production環境で有効になっている

### 5.2 ログ確認

#### テスト内容
Vercelダッシュボードで以下を確認：
1. Functions → Logs
2. エラーログが出ていない
3. デプロイが成功している

### 5.3 ドキュメントサイト確認

#### テスト内容
1. https://zoom-memo-automation.vercel.app/ にアクセス
2. 各ドキュメントページが表示される
3. リンクが正しく動作する

#### 期待結果
- ✅ トップページが表示される
- ✅ ダッシュボード、機能設計書などにアクセスできる
- ✅ 404エラーが発生しない

## 6. テスト実行チェックリスト

### Phase 1: 単体テスト（所要時間: 30分）
- [ ] 環境変数チェック
- [ ] Zoom API接続テスト
- [ ] Google AI API接続テスト
- [ ] Slack API接続テスト

### Phase 2: 結合テスト（所要時間: 45分）
- [ ] ヘルスチェックテスト
- [ ] 文字起こしテスト
- [ ] 要約生成テスト

### Phase 3: スルーテスト（所要時間: 60分）
- [ ] 手動録画処理テスト
- [ ] 定期監視テスト
- [ ] エラーハンドリングテスト

### Phase 4: Vercel環境テスト（所要時間: 15分）
- [ ] 環境変数確認
- [ ] ログ確認
- [ ] ドキュメントサイト確認

## 7. トラブルシューティング

### よくある問題と対処法

#### 1. API認証エラー
```
Error: Zoom API authentication failed
```
**対処法**: 環境変数を再確認、APIキーの有効期限をチェック

#### 2. Slack通知が届かない
```
Error: channel_not_found
```
**対処法**: SLACK_CHANNEL_IDが正しいか確認、Botがチャンネルに追加されているか確認

#### 3. 文字起こしエラー
```
Error: Audio file too large
```
**対処法**: ファイルサイズ制限（300MB）を確認、音声形式が対応しているか確認

## 8. テスト結果記録

### テスト実施記録テンプレート

```markdown
## テスト実施記録

**実施日**: 2025年7月XX日
**実施者**: [担当者名]
**環境**: [ローカル/Vercel]

### 単体テスト結果
- 環境変数チェック: [OK/NG]
- Zoom API: [OK/NG]
- Google AI API: [OK/NG]
- Slack API: [OK/NG]

### 結合テスト結果
- ヘルスチェック: [OK/NG]
- 文字起こし: [OK/NG]
- 要約生成: [OK/NG]

### スルーテスト結果
- 手動処理: [OK/NG]
- 定期監視: [OK/NG]
- エラーハンドリング: [OK/NG]

### 発見した問題
1. [問題の内容]
2. [問題の内容]

### 改善提案
1. [提案内容]
2. [提案内容]
```

---

このテスト計画に従って、システムの動作確認を実施してください。