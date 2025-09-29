# v2.0 依存関係マップ - Phase1分析結果

## 現在の処理フロー（v1.0）

### 1. zoomRecordingService.js - メインエントリーポイント
**主要メソッド**: `processRecording()`
- **依存**: ZoomService, AudioSummaryService, DocumentStorageService
- **処理**: 録画→動画処理→音声処理→文書保存
- **変更必要箇所**: 
  - `processAudioFile()`: 音声処理部分をTranscriptAPIに置換
  - 新しいフロー: 録画→Transcript取得→TranscriptService処理

### 2. audioSummaryService.js - 音声処理の中核
**主要メソッド**: `processRealAudioBuffer()`
- **現在の処理**: 音声バッファ→AI転写→AI要約
- **v2.0変更**: TranscriptAPI→VTT解析→AI要約のみ
- **影響度**: **最大** - 全面的な書き換えが必要

#### 変更が必要な主要メソッド:
- `processRealAudioBuffer()`: VTTファイル処理に変更
- `processAudioTranscription()`: 削除（TranscriptAPIで代替）
- `generateSummaryFromTranscription()`: 強化（VTT→テキスト→要約）

### 3. aiService.js - AI処理エンジン
**影響範囲**: 
- `processAudioTranscription()`: 削除可能（TranscriptAPIで代替）
- `generateSummaryFromTranscription()`: 強化が必要
- **依存関係**: Gemini AI APIとの連携部分

### 4. zoomService.js - Zoom API連携
**追加が必要**:
- Transcript API連携メソッド
- VTTファイル取得機能
- **新メソッド**: `getTranscriptFiles()`, `downloadTranscriptVTT()`

### 5. config/index.js - 設定管理
**追加設定**:
- Transcript API設定
- VTT処理設定
- フォールバック設定

### 6. errorCodes.js & errorHandler.js - エラー処理
**追加エラーコード**:
- Transcript API関連エラー（5つ）
- VTT解析エラー
- フォールバック処理エラー

## v2.0 新処理フロー設計

### Phase 1: TranscriptService導入
```
processRecording() 
├── processVideoFile() (変更なし)
├── checkTranscriptAvailability() (新規)
├── processWithTranscript() (新規)
│   ├── downloadTranscriptVTT()
│   ├── TranscriptService.parseVTT()
│   └── TranscriptService.generateSummary()
└── processAudioFile() (フォールバック)
```

### Phase 2: フォールバック機構
```
TranscriptService.process()
├── VTT処理 (優先)
├── エラー検出
└── AudioSummaryService (フォールバック)
```

## 依存関係マトリックス

| ファイル | 変更レベル | 新機能追加 | 既存機能削除 | TranscriptService依存 |
|---------|------------|------------|-------------|----------------------|
| zoomRecordingService.js | 中 | Transcript処理 | なし | ○ |
| audioSummaryService.js | 高 | VTT処理 | 音声転写部分 | ○ |
| aiService.js | 中 | VTT→要約強化 | 音声転写メソッド | ○ |
| zoomService.js | 中 | Transcript API | なし | ○ |
| config/index.js | 低 | API設定 | なし | ○ |
| errorCodes.js | 低 | 新エラー定義 | なし | × |
| errorHandler.js | 低 | エラー処理 | なし | × |

## 重要な設計決定

### 1. 非破壊的変更原則
- 既存のaudioSummaryService.jsは残存
- TranscriptServiceは新規追加
- フォールバック機構で安全性確保

### 2. 段階的移行戦略
- Phase1: TranscriptService単体実装
- Phase2: フォールバック機構実装  
- Phase3: A/Bテスト環境
- Phase4: 段階的本番移行

### 3. パフォーマンス目標
- 処理時間: 228.8秒 → 30-60秒 (90%短縮)
- API費用: $15/月 → $3/月 (80%削減)
- タイムアウト: 完全解消

## 次のステップ
1. TranscriptService詳細設計
2. VTT解析アルゴリズム設計
3. フォールバック判定ロジック設計