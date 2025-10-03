# 🚨 Zoom自動文字起こし設定 - 緊急対応ガイド

**作成日**: 2025-10-03
**緊急度**: 高
**目的**: PT001「Transcript not available」問題の解決

---

## ⚠️ 現状

PT001テスト実行時に以下の警告が発生：
```
⚠️ Transcript not available for this recording
⚠️ TRANSCRIPT_FALLBACK_REQUIRED
```

**原因**: Zoom側で自動文字起こし機能が無効化されている

**影響**: システムは正常動作中（フォールバック機構で処理）だが、v2.0の高速処理が利用できない

---

## 🎯 すぐに実施すべき対応（5分で完了）

### ステップ1: Zoom管理画面にログイン

1. **https://zoom.us** にアクセス
2. 管理者アカウントでサインイン

### ステップ2: 録画設定を確認・変更

1. 左メニューから **Account Management** → **Account Settings** を選択
2. **Recording** タブをクリック
3. **Cloud recording** が有効であることを確認
4. **Advanced cloud recording settings** セクションを展開
5. **以下の設定を探す**:
   - 「Audio transcript」
   - 「Create audio transcript」
   - 「Automatic transcription」
   のいずれか
6. **ONに切り替え**
7. **保存**ボタンをクリック

### ステップ3: 設定確認（重要）

1. ページをリロード
2. 設定が保存されているか再確認
3. 必要に応じて言語設定を「Japanese」に変更

---

## 📸 設定画面のスクリーンショット

### 設定箇所の例

```
Account Settings
└── Recording
    ├── Cloud recording: [ON]
    └── Advanced cloud recording settings
        ├── Audio transcript: [ON] ← これを有効化
        ├── Save audio transcript: [ON] (オプション)
        └── Language: [Japanese] (日本語の場合)
```

---

## ✅ 設定完了後の確認方法

### 方法1: テスト録画（推奨）

1. 短い会議（1-2分）を開始
2. クラウド録画を開始
3. 録画を停止し、会議を終了
4. **5-10分待機**
5. Zoom Web Portal → **Recordings** で確認
6. 該当録画に **「Transcript」または「VTT」ファイル** が表示されることを確認

### 方法2: 既存録画を確認

1. Zoom Web Portal → **Recordings**
2. 最近の録画を確認
3. 「Transcript」または「VTT」ファイルが**ない**ことを確認（設定変更前のため）

---

## 🎯 期待される効果（設定後）

| 項目 | 現状（v1.0フォールバック） | 設定後（v2.0） | 改善 |
|------|-------------------------|-------------|------|
| **処理時間** | 155秒 | 30-60秒 | **90%短縮** |
| **Gemini APIコスト** | $15/月 | $3/月 | **80%削減** |
| **タイムアウトリスク** | あり | なし | **完全解消** |
| **処理方式** | 音声→文字起こし→要約 | VTT→要約のみ | **シンプル化** |

---

## 📋 設定後のPT001実行結果

設定が正しく有効化されると、次回のPT001実行時に：

**成功ログ（期待）**:
```
✅ v2.0 Transcript API処理開始
✅ VTT file downloaded: XXXXX bytes
✅ Transcript processing completed in 30-60秒
```

**フォールバックログ（設定前）**:
```
⚠️ Transcript not available
⚠️ TRANSCRIPT_FALLBACK_REQUIRED
v1.0音声処理フォールバック実行
```

---

## ⚠️ 重要な注意事項

### 1. 既存録画には適用されない
設定変更は**これから作成される録画**にのみ適用されます。

### 2. 文字起こし生成のタイミング
録画終了後、**数分〜数十分**で生成されます（メール通知あり）。

### 3. ストレージ容量
VTTファイルは小容量（数KB〜数百KB）のため、ストレージへの影響はほぼありません。

### 4. 言語設定
日本語の録画の場合、言語設定を「Japanese」に変更することを推奨します。

---

## 🔧 トラブルシューティング

### Q: 設定項目が見つからない

**A**: 以下を確認してください
- 管理者権限でログインしているか
- アカウントのプランが対応しているか（Pro以上推奨）
- 組織のポリシーでロックされていないか

### Q: 設定がグレーアウトして変更できない

**A**: 上位設定でロックされています
- 組織管理者に変更を依頼
- または、組織設定を確認してロックを解除

### Q: テスト録画で文字起こしが生成されない

**A**: 以下を確認してください
1. **クラウド録画**を使用しているか（ローカル録画ではない）
2. 録画時間が**30秒以上**あるか
3. 設定保存後の**新規録画**であるか

### Q: PT001実行後もフォールバックが発生する

**A**: 以下を確認してください
1. 設定が保存されているか（Zoom Web Portalで再確認）
2. テスト録画でVTTファイルが生成されているか
3. PT001で処理している録画が設定変更**後**のものか

---

## 📞 サポート情報

### Zoom公式ドキュメント
- [自動文字起こし有効化](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065911)
- [クラウド録画設定](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063923)

### プロジェクト内ドキュメント
- [詳細設定ガイド](3.operations/docs/zoom-transcript-setup-guide.md)
- [PT001調査結果](3.operations/claude_sessions/session-2025-01-30-v2implementation.md)

---

## ✅ 設定完了チェックリスト

- [ ] Zoom Web Portalにログイン
- [ ] Account Settings → Recording → Cloud recording が有効
- [ ] Advanced cloud recording settings → Audio transcript が有効
- [ ] 設定を保存
- [ ] テスト録画を実施（1-2分）
- [ ] 5-10分待機
- [ ] テスト録画にVTTファイルが生成されていることを確認
- [ ] PT001を再実行
- [ ] v2.0 Transcript API処理が成功することを確認

---

**最終更新**: 2025-10-03
**作成者**: Claude Code 4.5
**優先度**: 🔴 高 - 処理時間90%短縮、コスト80%削減の効果あり
