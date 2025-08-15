# 要約アーキテクチャ統一化 - 段階的移行計画

## 影響範囲調査結果
- formatSummaryText: 3箇所（documentStorageService.js内のみ）
- extractShortSummary: 4箇所（slackService.js内のみ）  
- saveDocuments: 2箇所（documentStorageService.js内のみ）
- 要約データ参照: 110箇所（広範囲）

## リスク評価
- **高リスク**: 要約データ構造の変更（110箇所に影響）
- **中リスク**: formatSummaryText廃止（Drive保存形式変更）
- **低リスク**: extractShortSummary最適化（Slack表示のみ）

## 段階的移行戦略

### Phase 1: AI生成要約の詳細化（低リスク）
1. aiService.jsの7項目構造化要約を詳細化
   - discussionsByTopicに発言者詳細追加
   - 背景・論理展開・結論を含める
2. 既存のデータフローは維持

### Phase 2: DocumentStorage簡略化（中リスク）
1. formatSummaryTextメソッドを段階的に簡略化
   - AI生成データをそのまま使用
   - フォーマット処理のみ残す
2. saveDocumentsメソッドの最適化

### Phase 3: Slack表示の統一（低リスク）
1. slackServiceでAI生成の詳細要約を直接表示
2. extractShortSummaryを文字数制限対応のみに特化

### Phase 4: 完全統合（高リスク）
1. すべてのコンポーネントで同一の要約データを使用
2. 冗長な処理の完全削除

## ロールバック手順
```bash
git reset --hard backup-architecture-refactor-20250815-094924
git push --force origin main
```

## テスト戦略
1. 各Phase後にSL302テスト実施
2. Drive保存とSlack表示の差分確認
3. 文字起こし→要約の一貫性検証