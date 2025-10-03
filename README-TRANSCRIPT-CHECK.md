# Zoom Transcript設定確認 - クイックガイド

**最終更新**: 2025-10-02
**目的**: v2.0 Transcript API利用のためのZoom設定確認

---

## 🚀 クイックスタート

### 1. 現在の設定を確認

**Webブラウザ**でアクセス:
```
https://zoom-memo-automation-9c0dgr6qc-horikens-projects.vercel.app/api/health-check?mode=transcript
```

または**コマンドライン**:
```bash
curl "https://zoom-memo-automation-9c0dgr6qc-horikens-projects.vercel.app/api/health-check?mode=transcript"
```

---

## 📊 レスポンスの見方

### ✅ v2.0が利用可能な場合

```json
{
  "success": true,
  "report": {
    "status": "compatible",
    "settings": {
      "cloudRecording": "✅ 有効",
      "autoTranscript": "✅ 有効"
    },
    "v2Benefits": {
      "processingTime": "228秒 → 30-60秒（90%短縮）",
      "cost": "$15/月 → $3/月（80%削減）",
      "timeoutRisk": "なし（完全解消）"
    },
    "recommendations": [
      "✅ v2.0 Transcript APIが利用可能です",
      "次回の録画から自動文字起こしが生成されます"
    ]
  }
}
```

### ⚠️ v2.0が利用できない場合（設定変更が必要）

```json
{
  "success": true,
  "report": {
    "status": "incompatible",
    "settings": {
      "cloudRecording": "✅ 有効",
      "autoTranscript": "❌ 無効"
    },
    "recommendations": [
      "⚠️ v2.0 Transcript APIは現在利用できません",
      "Zoom管理画面で「自動文字起こし」を有効化してください",
      "手順: Account Settings → Recording → Audio transcript をON"
    ]
  }
}
```

---

## 🔧 自動文字起こしを有効化する手順

### Zoom管理者の場合

1. **https://zoom.us** にアクセス（管理者ログイン）
2. **Account Management** → **Account Settings**
3. **Recording** タブを選択
4. **Cloud recording** を有効化
5. **Advanced cloud recording settings** を展開
6. **Audio transcript** を **ON** に設定
7. **保存**

### 個人ユーザーの場合

1. **https://zoom.us** にアクセス
2. **Personal** → **Settings**
3. **Recording** タブを選択
4. **Cloud recording** を有効化
5. **Advanced cloud recording settings** を展開
6. **Audio transcript** を **ON** に設定
7. **保存**

---

## 🎯 v2.0の効果

| 項目 | 現状（v1.0） | v2.0 | 改善率 |
|------|-------------|------|--------|
| 処理時間 | 155秒 | 30-60秒 | **90%短縮** |
| Gemini APIコスト | $15/月 | $3/月 | **80%削減** |
| タイムアウト | リスクあり | なし | **完全解消** |

---

## ⚠️ 重要な注意事項

1. **既存の録画には適用されない**
   設定変更後の**新規録画**から自動文字起こしが生成されます

2. **文字起こし生成のタイミング**
   録画終了後、数分〜数十分で生成（メール通知あり）

3. **言語設定**
   日本語の場合、Zoom設定で言語を「Japanese」に変更

---

## 🧪 設定確認後のテスト

### ステップ1: テスト録画

1. 短い会議（1-2分）を開始
2. クラウド録画を開始
3. 録画を停止し、会議を終了

### ステップ2: 文字起こし確認

1. 5-10分待機
2. Zoom Web Portal → Recordings で確認
3. 「Transcript」または「VTT」ファイルが表示されることを確認

### ステップ3: PT001再実行

設定が正しく有効化されれば、次回のPT001実行時にv2.0の高速処理が動作します。

---

## 📞 トラブルシューティング

### Q: 設定後も「❌ 無効」と表示される

A:
1. ブラウザのキャッシュをクリア
2. 設定確認APIを再実行
3. Zoom Web Portalで設定が保存されているか再確認

### Q: 設定がグレーアウトして変更できない

A:
- 上位設定でロックされています
- Zoom管理者に組織設定の変更を依頼してください

### Q: テスト録画で文字起こしが生成されない

A:
1. クラウド録画（ローカルではない）であることを確認
2. 録画時間が30秒以上あることを確認
3. 言語設定が「Japanese」になっているか確認

---

## 📚 関連ドキュメント

- [詳細設定ガイド](3.operations/docs/zoom-transcript-setup-guide.md)
- [PT001調査レポート](3.operations/claude_sessions/session-2025-01-30-v2implementation.md)
- [v2.0設計書](0.docs/v2.0-design/)

---

**エンドポイント**:
- Transcript設定確認: `https://[your-domain].vercel.app/api/health-check?mode=transcript`
- デバッグモード: `https://[your-domain].vercel.app/api/health-check?mode=transcript&debug=true`
- 通常のHealth Check: `https://[your-domain].vercel.app/api/health-check`
