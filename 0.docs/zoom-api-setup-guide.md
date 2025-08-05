# Zoom Server-to-Server OAuth アプリ作成手順書
---
## 概要
この手順書では、Zoom録画自動処理システムに必要なServer-to-Server OAuth アプリの作成方法を説明します。  
**重要**: この作業は**Zoom管理者権限**を持つアカウントで実行する必要があります。

## 前提条件
- Zoomの管理者アカウントへのアクセス権限
- Zoom Business、Business Plus、またはEnterpriseプラン
- 組織全体の録画データへのアクセス権限
---
## 手順
---
### 1. Zoom App Marketplaceにアクセス
1. ブラウザで [https://marketplace.zoom.us/](https://marketplace.zoom.us/) にアクセス
2. 右上の「Sign In」をクリック
3. **管理者アカウント**でログイン
---
### 2. 新しいアプリの作成
1. ログイン後、右上の「Develop」→「Build App」をクリック
2. 「Choose your app type」画面で「**Server-to-Server OAuth**」を選択
3. 「Create」ボタンをクリック
---
### 3. アプリ情報の入力
#### App Name（アプリ名）
```
Zoom録画自動処理システム
```
または英語名：
```
Zoom Recording Automation System
```

#### Short Description（簡単な説明）
```
社内会議の録画データを自動的に処理し、文字起こしと要約を生成してSlackに共有するシステム
```

#### Company Name（会社名）
```
[貴社名を入力]
```
---
### 4. App Credentials（認証情報）の取得
「App Credentials」タブで以下の情報をメモしてください：

- **Account ID**: `xxxxxxxxxxxxxxxxxx`
- **Client ID**: `xxxxxxxxxxxxxxxxxx`
- **Client Secret**: `xxxxxxxxxxxxxxxxxx`（「View」をクリックして表示）

⚠️ **重要**: これらの情報は機密情報です。安全に管理してください。
---
### 5. Scopes（権限）の設定
「Scopes」タブで以下の権限を追加してください：
---
#### 必須スコープ
1. **Recording（録画）関連**
   - ✅ `cloud_recording:read:list_user_recordings:admin`
   - ✅ `cloud_recording:read:list_recording_files:admin`
   - ✅ `recording:read:admin`
---
2. **User（ユーザー）関連**
   - ✅ `user:read:list_users:admin`
   - ✅ `user:read:user:admin`
---
3. **Meeting（会議）関連**
   - ✅ `meeting:read:list_meetings:admin`
   - ✅ `meeting:read:meeting:admin`
---
#### スコープ追加手順
1. 「+ Add Scopes」ボタンをクリック
2. 検索ボックスで上記のスコープ名を入力
3. 該当するスコープにチェックを入れる
4. 「Done」をクリック
5. すべてのスコープを追加後、「Continue」をクリック
---
### 6. Activation（アクティベーション）
1. 「Activation」タブに移動
2. 「Activate your app」ボタンをクリック
3. 確認画面で「Activate」をクリック
---
### 7. 取得した情報の共有

以下の情報をシステム管理者に安全な方法で共有してください：

```
ZOOM_ACCOUNT_ID=[取得したAccount ID]
ZOOM_API_KEY=[取得したClient ID]
ZOOM_API_SECRET=[取得したClient Secret]
```
---
## 設定確認事項

### ✅ チェックリスト
- [ ] Server-to-Server OAuthアプリを作成した
- [ ] アプリ名と説明を入力した
- [ ] 必要なすべてのスコープを追加した
- [ ] アプリをアクティベートした
- [ ] Account ID、Client ID、Client Secretを取得した

### ⚠️ 注意事項
1. **Client Secret**は一度しか表示されません。必ずコピーして安全に保管してください
2. アプリの作成は組織につき1つで十分です
3. 権限は必要最小限に設定しています

## トラブルシューティング

### Q: 特定のスコープが見つからない
A: アカウントのプランによって利用可能なスコープが異なります。管理者権限とプランを確認してください。

### Q: アプリがアクティベートできない
A: すべての必須項目が入力されているか確認してください。特にスコープの設定を確認してください。

### Q: 「Invalid access token」エラーが発生する
A: 以下を確認してください：
- アプリがアクティベートされているか
- 正しいAccount ID、Client ID、Client Secretを使用しているか
- 必要なスコープがすべて追加されているか

## 次のステップ

取得した認証情報をシステムの環境変数に設定します：
1. Vercelの環境変数設定
2. ローカル開発環境の.envファイル更新

## お問い合わせ

設定に関してご不明な点がございましたら、システム管理者までお問い合わせください。

---
最終更新日: 2025-07-31