# Zoom Marketplace 詳細設定手順書

## 🎯 目的
Zoom録画ファイルの自動取得・処理のためのServer-to-Server OAuth認証設定

## 📋 前提条件
- **Zoom管理者権限**（必須）
- Zoom Business/Enterprise プラン
- Zoom Marketplaceへのアクセス権限

---

## 🔧 詳細設定手順

### ステップ1: Zoom Marketplaceへのアクセス

1. **URL**: https://marketplace.zoom.us/
2. **ログイン**: 管理者アカウントでサインイン
3. **確認事項**: 
   - ログイン後、画面右上にアカウント名が表示されるか確認
   - 「Admin」や「Owner」のロールが表示されているか確認

---

### ステップ2: 既存アプリの確認と削除

#### 既存アプリの確認
1. 「Manage」→「Created Apps」をクリック
2. 既存のアプリ一覧を確認
3. 「Zoom Recording Automation」や類似名のアプリがあるか確認

#### 不要なアプリの削除（必要な場合）
1. 該当アプリをクリック
2. 「Deactivate」ボタンをクリック
3. 「Delete」ボタンをクリック

---

### ステップ3: 新規Server-to-Server OAuthアプリ作成

#### 3.1 アプリタイプ選択
1. 「Develop」→「Build App」をクリック
2. **重要**: 「Server-to-Server OAuth」を選択
   - ❌ JWT（非推奨・廃止予定）
   - ❌ OAuth（ユーザー認証用）
   - ✅ **Server-to-Server OAuth**（システム間認証用）

#### 3.2 基本情報入力
```
App Name: Zoom Recording Automation System
Short Description: Automated recording processing and transcription system
Company Name: [貴社名]
Developer Name: [開発者名]
Developer Email: [メールアドレス]
```

---

### ステップ4: App Credentials（認証情報）の取得と保存

#### 4.1 認証情報の確認
「App Credentials」タブで以下を取得：

| 項目 | 説明 | 環境変数名 |
|------|------|------------|
| **Account ID** | アカウント識別子 | `ZOOM_ACCOUNT_ID` |
| **Client ID** | アプリケーション識別子 | `ZOOM_API_KEY` |
| **Client Secret** | 秘密鍵（表示ボタンクリック） | `ZOOM_API_SECRET` |

#### 4.2 安全な保存方法
```bash
# 一時的にメモ帳などにコピー
ZOOM_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxx
ZOOM_API_KEY=xxxxxxxxxxxxxxxxxxxxx
ZOOM_API_SECRET=xxxxxxxxxxxxxxxxxxxxx
```

⚠️ **セキュリティ注意事項**:
- Client Secretは再表示不可
- メールやチャットでの共有禁止
- 暗号化された経路で共有

---

### ステップ5: Scopes（権限）の詳細設定

#### 5.1 必須スコープ一覧

##### 録画関連（Recording）
```
✅ cloud_recording:read:list_user_recordings:admin
   → 全ユーザーの録画一覧取得
✅ cloud_recording:read:list_recording_files:admin
   → 録画ファイルの詳細取得
✅ cloud_recording:read:recording:admin
   → 録画データのダウンロード
✅ recording:read:admin
   → 録画メタデータの読み取り
```

##### ユーザー関連（User）
```
✅ user:read:list_users:admin
   → ユーザー一覧の取得
✅ user:read:user:admin
   → ユーザー詳細情報の取得
```

##### 会議関連（Meeting）
```
✅ meeting:read:list_meetings:admin
   → 会議一覧の取得
✅ meeting:read:meeting:admin
   → 会議詳細情報の取得
```

#### 5.2 スコープ追加手順
1. 「Scopes」タブをクリック
2. 「+ Add Scopes」ボタンをクリック
3. 検索ボックスに以下を入力して追加：
   - 「cloud_recording」で検索 → 4つ選択
   - 「user:read」で検索 → 2つ選択
   - 「meeting:read」で検索 → 2つ選択
4. 「Done」をクリック
5. 「Continue」をクリック

---

### ステップ6: アプリのアクティベーション

#### 6.1 設定確認
「Review」タブで以下を確認：
- ✅ App Name が正しい
- ✅ すべてのスコープが追加されている
- ✅ Contact Information が入力されている

#### 6.2 アクティベート実行
1. 「Activation」タブをクリック
2. 「Activate your app」ボタンをクリック
3. 確認ダイアログで「Activate」をクリック
4. **成功メッセージ**を確認

---

### ステップ7: Vercel環境変数の設定

#### 7.1 Vercelダッシュボードへアクセス
1. https://vercel.com/dashboard
2. プロジェクト「zoom-memo-automation」を選択
3. 「Settings」→「Environment Variables」

#### 7.2 環境変数の追加/更新
以下の変数を設定：

```
ZOOM_ACCOUNT_ID = [取得したAccount ID]
ZOOM_API_KEY = [取得したClient ID]
ZOOM_API_SECRET = [取得したClient Secret]
```

#### 7.3 デプロイの再実行
1. 「Deployments」タブ
2. 最新のデプロイメントの「...」メニュー
3. 「Redeploy」をクリック

---

## 🔍 設定確認テスト

### テスト1: 認証テスト
```bash
curl https://zoom-memo-automation.vercel.app/api/test-zoom-auth
```

期待される結果：
```json
{
  "success": true,
  "message": "OAuth token generated successfully",
  "tokenLength": 1214
}
```

### テスト2: 録画一覧取得テスト
```bash
curl https://zoom-memo-automation.vercel.app/api/test-recordings
```

期待される結果：
```json
{
  "success": true,
  "recordings": [...]
}
```

---

## ❌ トラブルシューティング

### エラー: 400 Bad Request
**原因**: OAuth設定の不備
**対処法**:
1. Client ID/Secretが正しいか確認
2. アプリがアクティベートされているか確認
3. Account IDが正しいか確認

### エラー: 401 Invalid access token
**原因**: 認証情報の不一致
**対処法**:
1. 環境変数が正しく設定されているか確認
2. アプリを再アクティベート
3. Client Secretを再生成（最終手段）

### エラー: 403 Forbidden
**原因**: スコープ不足
**対処法**:
1. 必要なスコープがすべて追加されているか確認
2. アプリを再アクティベート
3. 管理者権限があるか確認

### エラー: 404 Not Found
**原因**: APIエンドポイントの誤り
**対処法**:
1. APIバージョン（v2）を確認
2. URLパスが正しいか確認

---

## 📝 チェックリスト

### 設定前の確認
- [ ] Zoom管理者アカウントでログインしている
- [ ] 既存の不要なアプリを削除した
- [ ] Server-to-Server OAuthを選択した

### 認証情報
- [ ] Account IDを取得した
- [ ] Client IDを取得した
- [ ] Client Secretを取得した
- [ ] 安全な場所に保存した

### スコープ設定
- [ ] 録画関連スコープ（4つ）を追加した
- [ ] ユーザー関連スコープ（2つ）を追加した
- [ ] 会議関連スコープ（2つ）を追加した

### アクティベーション
- [ ] アプリをアクティベートした
- [ ] 成功メッセージを確認した

### 環境変数設定
- [ ] Vercelに環境変数を設定した
- [ ] アプリを再デプロイした
- [ ] テストAPIで動作確認した

---

## 📞 サポート連絡先

設定でお困りの場合は、以下の情報と共にご連絡ください：
- エラーメッセージの全文
- 実行したコマンドやURL
- Zoom Marketplaceのスクリーンショット

---

最終更新: 2025-08-08
作成者: Claude Code