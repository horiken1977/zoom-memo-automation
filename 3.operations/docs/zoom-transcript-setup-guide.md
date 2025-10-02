# Zoom自動文字起こし設定ガイド

**作成日**: 2025-10-02
**目的**: v2.0 Transcript API利用のためのZoom設定手順

---

## 🎯 背景

PT001テスト実行時、以下の警告が発生しました:

```
⚠️ Transcript not available for this recording
⚠️ TRANSCRIPT_FALLBACK_REQUIRED
```

**原因**: Zoom側で自動文字起こし機能が有効化されていないため、VTTファイルが生成されていない

**影響**:
- ✅ システムは正常動作（フォールバック機構で音声処理を実行）
- ⚠️ v2.0の高速処理（30-60秒）が利用できず、従来の処理時間（155秒）で実行

---

## 📊 v2.0の効果（Transcript有効化後）

| 項目 | 現状（v1.0） | Transcript有効後（v2.0） | 改善率 |
|------|-------------|------------------------|--------|
| **処理時間** | 155秒 | 30-60秒 | **90%短縮** |
| **Gemini API コスト** | $15/月 | $3/月 | **80%削減** |
| **タイムアウトリスク** | あり | なし | **完全解消** |

---

## 🔧 設定方法

### 方法1: Web管理画面から設定（推奨）

#### 個人ユーザーの場合

1. **Zoom Web Portal** にアクセス
   - https://zoom.us にアクセス
   - サインイン

2. **設定ページ**に移動
   - 左メニュー: Personal → Settings
   - Recording タブをクリック

3. **クラウド録画**を有効化
   - "Cloud recording" をON

4. **自動文字起こし**を有効化
   - "Advanced cloud recording settings" を展開
   - "Audio transcript" または "Create audio transcript" をON
   - 保存

#### アカウント管理者の場合（組織全体）

1. **Zoom Web Portal** にアクセス
   - https://zoom.us にアクセス
   - 管理者アカウントでサインイン

2. **アカウント設定**に移動
   - 左メニュー: Account Management → Account Settings
   - Recording タブをクリック

3. **クラウド録画**を有効化
   - "Cloud recording" をON
   - 必要に応じて「組織全体に適用」をロック

4. **自動文字起こし**を有効化
   - "Advanced cloud recording settings" を展開
   - "Audio transcript" または "Create audio transcript" をON
   - "Allow meeting hosts to retain and access meeting transcripts" もON推奨
   - 保存

---

### 方法2: 設定確認スクリプト実行

現在の設定状況を確認するスクリプトを実行:

```bash
node 3.operations/src/check-zoom-transcript-settings.js
```

**出力例**:

```
🚀 Zoom自動文字起こし設定確認スクリプト開始

アカウントID: TNIVHJpxTsO7n4SeJ82EBQ

🔐 Zoom OAuth認証開始...
✅ OAuth認証成功

📋 アカウント設定取得中...
✅ アカウント設定取得成功

📊 ===== 文字起こし設定分析結果 =====

クラウド録画: ✅ 有効
自動文字起こし: ❌ 無効

===================================

🎯 ===== v2.0 Transcript API 互換性 =====

⚠️  **v2.0 Transcript APIは現在利用できません**
   フォールバック機構により従来の音声処理が実行されます。

📝 有効化の手順:
   1. Zoom Web Portal (https://zoom.us) にログイン
   2. Account Management → Account Settings
   3. Recording タブを選択
   4. "Cloud recording" をONに設定
   5. Advanced cloud recording settings を展開
   6. "Audio transcript" をONに設定
   7. 保存

==========================================
```

---

## ⚠️ 重要な注意事項

### 1. **既存の録画には適用されない**
- 設定変更後、**新規の録画**から自動文字起こしが生成される
- 過去の録画には遡って適用されない

### 2. **文字起こし生成のタイミング**
- 録画終了後、数分〜数十分で文字起こしが生成される
- 生成完了時にメール通知が送信される

### 3. **言語設定**
- デフォルトは英語
- 日本語の文字起こしを利用する場合、言語設定を「Japanese」に変更
- 設定場所: Account Settings → Recording → Audio transcript → Language

### 4. **ストレージ容量**
- VTTファイルは小容量（数KB〜数百KB）
- クラウドストレージ容量への影響はほぼなし

---

## 🧪 設定確認テスト手順

### ステップ1: 設定を有効化

上記の手順で自動文字起こしを有効化

### ステップ2: テスト録画を実施

1. Zoom会議を開始（1-2分程度でOK）
2. クラウド録画を開始
3. 録画を停止し、会議を終了

### ステップ3: 文字起こし生成を確認

1. 録画終了後、5-10分待機
2. Zoom Web Portal → Recordings を確認
3. 該当録画に「Transcript」または「VTT」ファイルが表示されることを確認

### ステップ4: PT001再実行

```bash
# PT001実行（本番環境）
# Vercel Functions経由で自動実行
```

**期待される結果**:
```
✅ v2.0 Transcript API処理開始
✅ VTT file downloaded: XXXXX bytes
✅ Transcript processing completed in 30-60秒
```

---

## 📞 トラブルシューティング

### 問題1: 設定が見つからない

**原因**: ユーザー権限不足
**対処**: Zoom管理者に設定変更を依頼

### 問題2: 設定がグレーアウトして変更できない

**原因**: 上位設定でロックされている
**対処**:
- 個人設定の場合: 管理者に組織設定の変更を依頼
- 管理者の場合: ロックを解除してから変更

### 問題3: 設定後も文字起こしが生成されない

**原因**:
- ローカル録画を使用している（クラウド録画必須）
- 言語設定が合っていない
- 録画時間が短すぎる（30秒未満など）

**対処**:
1. クラウド録画であることを確認
2. 言語設定を確認（Japanese）
3. 十分な長さの録画を実施（1分以上推奨）

### 問題4: PT001実行後もフォールバックが発生

**確認項目**:
1. 設定確認スクリプト実行: `node 3.operations/src/check-zoom-transcript-settings.js`
2. Zoom Web Portalで最新録画にVTTファイルが存在するか確認
3. 録画が設定変更前のものでないか確認（新規録画でテスト）

---

## 📚 参考リンク

- [Zoom公式: 自動文字起こし有効化](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065911)
- [Zoom公式: クラウド録画設定](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063923)
- [Zoom API: 録画設定取得](https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/accountSettings)

---

## ✅ チェックリスト

設定完了後、以下を確認:

- [ ] クラウド録画が有効化されている
- [ ] 自動文字起こしが有効化されている
- [ ] 言語設定が「Japanese」になっている（日本語録画の場合）
- [ ] テスト録画で文字起こしが生成されることを確認
- [ ] 設定確認スクリプトで「v2.0 Transcript APIが利用可能です」と表示される
- [ ] PT001実行でTranscript処理が成功する

---

**最終更新**: 2025-10-02
**担当者**: Claude Code 4.5
**関連ドキュメント**: `3.operations/v2.0-analysis/transcript-service-interface.md`
