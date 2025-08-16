# 外部システム・テスト固有エラーコード調査結果

## 📊 調査概要
- **調査対象**: APIファイル、テストファイル、設定ファイル
- **調査日時**: 2025-08-15  
- **目的**: 外部システムが返すエラーコードとアプリケーション固有のエラーコードの整理

## 🔍 発見されたエラーコード分類

### 1. 🧪 テスト固有エラーコード (E_系)

#### テスト実行エラー
- `E_PT001_FAILED` - PT001テスト失敗 (production-throughput-test.js:499)
- `E_PT001v2_FAILED` - PT001v2テスト失敗 (production-throughput-test-v2.js:481)

#### システム制限エラー  
- `E_SYSTEM_VERCEL_LIMIT` - Vercelタイムアウト制限 (production-throughput-test-v2.js:485)
- `VERCEL_TIMEOUT` - Vercelタイムアウト種別 (production-throughput-test-v2.js:486)

#### 機能別エラー
- `E_SLACK_001` - Slack通知失敗 (production-throughput-test.js:307, production-throughput-test-v2.js:375)
- `E_DOC_001` - 文書保存失敗 (production-throughput-test.js:382)
- `E_DOC_002` - 文書保存エラー (production-throughput-test.js:398)
- `E_DOC_CRITICAL` - 文書保存重大エラー (production-throughput-test-v2.js:195)
- `E_DOC_${error.type.toUpperCase()}` - 動的エラーコード (production-throughput-test-v2.js:172)

### 2. 🌐 外部システム由来エラーコード

#### HTTP ステータスコード
- `401` - 認証エラー (production-throughput-test.js:772, claude-webhook.js:34)
- `403` - 権限エラー (production-throughput-test.js:775)
- `404` - Not Found 
- `500` - Internal Server Error (各APIファイルで使用)
- `502`, `503`, `504` - サーバーエラー

#### Gemini AI 由来
- `"Transcription too short or missing"` - 昨日のエラーログに記録
- `"500 Internal Server Error"` - Gemini APIエラー (unified-audio-processing-test.js:228)

#### Zoom API 由来
- `timeout` / `Timeout` - タイムアウト検知条件 (production-throughput-test-v2.js:484)
- Rate limit exceeded (推測)
- Authentication failed (推測)

#### Vercel プラットフォーム由来
- 295000ms以上の実行時間でタイムアウト判定 (production-throughput-test-v2.js:484)
- `process.env.VERCEL_REGION` - Vercel環境変数

### 3. 📋 HTMLエラー一覧との比較

#### ✅ 整合性のあるエラーコード
| 実際のコード | HTMLエラー一覧 | 状況 |
|-------------|----------------|------|
| E_SYSTEM_VERCEL_LIMIT | E_SYSTEM_VERCEL_LIMIT | ✅ 整合性あり |
| E_PT001_FAILED | E_PT001_FAILED | ✅ 整合性あり |
| E_SLACK_* | E_SLACK_* | ✅ パターン一致 |

#### ❌ HTMLに未定義のエラーコード
- `E_PT001v2_FAILED` - PT001v2テスト用（新規）
- `E_DOC_CRITICAL` - 重大な文書保存エラー（新規）
- `E_DOC_${type}` - 動的エラーコード（新規）

## 🚨 昨日のエラーログ分析

### PT001v2テストエラーの詳細
```json
{
  "errorCode": "E_PT001v2_FAILED",
  "errorMessage": "録画処理失敗: 音声処理エラー: Unified audio processing failed after 5 attempts: Transcription too short or missing"
}
```

**エラーの原因分析:**
1. **根本原因**: `"Transcription too short or missing"` - Gemini AIの応答異常
2. **アプリケーション処理**: 5回リトライ後に`E_PT001v2_FAILED`として記録
3. **プラットフォーム**: Vercelタイムアウト（295秒）には到達せず（81秒で終了）

**エラーコードの流れ:**
1. Gemini AI → `"Transcription too short"` (外部システムエラー)
2. aiService.js → `AU004` (TRANSCRIPTION_TOO_SHORT) ※プレフィックス不一致
3. zoomRecordingService.js → `ZM010` (録画処理失敗)  
4. production-throughput-test-v2.js → `E_PT001v2_FAILED` (テスト固有)

## 🔄 外部システムエラーハンドリング状況

### 1. Gemini AI エラー
**検知方法:**
- レスポンス内容チェック: `"Transcription too short"`
- HTTPステータス: 500エラー
- タイムアウト: 60秒設定 (unified-audio-processing-test.js:94)

**対応:**
- 5回リトライ実装済み
- フォールバック処理あり

### 2. Zoom API エラー  
**検知方法:**
- HTTPステータス: 401, 403, 404
- レスポンス内容: Rate limit exceeded
- タイムアウト検知

**対応:**
- OAuth認証フォールバック
- レート制限リトライ

### 3. Vercel プラットフォーム制限
**検知方法:**
- 実行時間: 295秒 (production-throughput-test-v2.js:484)
- エラーメッセージ: `timeout` / `Timeout` キーワード

**対応:**
- `E_SYSTEM_VERCEL_LIMIT`による分類
- `isVercelTimeout`フラグ設定

## 📊 エラーコード統計

### カテゴリ別分布
- **アプリケーション固有**: ZM, GD, AU, SY (12個使用)
- **テスト固有**: E_PT*, E_DOC*, E_SLACK* (7個使用)  
- **外部システム**: HTTP status, Gemini messages (検知のみ)
- **プラットフォーム**: Vercel制限 (1個使用)

### 定義状況
- **errorCodes.js定義済み**: 50個 (AI→AU不整合あり)
- **HTMLエラー一覧定義済み**: 80個
- **実際に使用**: 20個 (アプリ12 + テスト8)
- **外部システム**: 定義不要（検知後にアプリエラーに変換）

## 🎯 修正・整理が必要な項目

### 1. 緊急対応（プレフィックス統一）
- aiService.js: `AU001-AU008` ← 実際のコード
- errorCodes.js: `AI001-AI010` ← 現在の定義
- **推奨**: errorCodes.jsを`AU***`に変更

### 2. HTMLエラー一覧への追加
- `E_PT001v2_FAILED` - PT001v2テスト失敗
- `E_DOC_CRITICAL` - 重大な文書保存エラー
- 動的エラーコードパターンの説明

### 3. 外部システムエラーの整理
- 各外部システムエラーの標準的な検知方法
- アプリケーションエラーコードへのマッピングルール

## 🔧 異常系テスト準備状況

### ✅ 対応済み
- Vercelタイムアウト検知・分類
- Geminiエラー検知・リトライ
- HTTPステータスコード処理

### 🔄 要対応
- AU/AIプレフィックス統一
- HTMLエラー一覧の追加・更新
- 外部システムエラーのテストケース作成

---

**調査完了時刻**: 2025-08-15T22:30:00Z  
**次のアクション**: エラーコードプレフィックス統一 → HTMLエラー一覧更新 → 異常系テスト実行