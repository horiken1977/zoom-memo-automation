# TranscriptService インターフェース設計書

## 概要
ZoomのTranscript APIから取得したVTTファイルを解析し、構造化された要約を生成するサービス

## クラス設計

### TranscriptService
```javascript
class TranscriptService {
  constructor(options = {}) {
    this.aiService = options.aiService || new AIService();
    this.zoomService = options.zoomService || new ZoomService();
    this.fallbackEnabled = options.fallbackEnabled !== false;
  }
}
```

## 主要メソッド仕様

### 1. メイン処理メソッド

#### `processTranscript(recording, meetingInfo)`
```javascript
/**
 * Zoom Transcript APIを使用してVTTファイルから要約を生成
 * @param {Object} recording - Zoom録画情報
 * @param {Object} meetingInfo - 会議情報  
 * @returns {Promise<Object>} 処理結果
 */
async processTranscript(recording, meetingInfo) {
  // 1. Transcript availability check
  // 2. VTT file download  
  // 3. VTT parsing
  // 4. Text structure analysis
  // 5. AI summary generation
  // 6. Result formatting
}
```

**戻り値構造**:
```javascript
{
  success: true,
  method: 'transcript-api',
  transcript: {
    participants: [...],
    segments: [...],
    fullText: "...",
    processingTime: 1500
  },
  structuredSummary: {
    summary: "...",
    keyPoints: [...],
    actionItems: [...],
    decisions: [...],
    nextSteps: [...]
  },
  processingStats: {
    vttSize: 12345,
    parseTime: 500,
    summaryTime: 1000,
    totalTime: 1500
  }
}
```

### 2. VTT処理メソッド

#### `parseVTTFile(vttBuffer)`
```javascript
/**
 * VTTファイルを解析して構造化データに変換
 * @param {Buffer} vttBuffer - VTTファイルのバッファ
 * @returns {Object} 解析結果
 */
async parseVTTFile(vttBuffer) {
  // VTT形式:
  // WEBVTT
  // 
  // 00:00:01.000 --> 00:00:05.000
  // <v Speaker 1>こんにちは、今日の会議を始めます。
  // 
  // 00:00:05.000 --> 00:00:10.000  
  // <v Speaker 2>ありがとうございます。
}
```

**戻り値**:
```javascript
{
  participants: [
    { id: "Speaker 1", name: "Speaker 1", segments: 15 },
    { id: "Speaker 2", name: "Speaker 2", segments: 23 }
  ],
  segments: [
    {
      startTime: "00:00:01.000",
      endTime: "00:00:05.000", 
      speaker: "Speaker 1",
      text: "こんにちは、今日の会議を始めます。",
      timestamp: 1000
    }
  ],
  fullText: "...",
  metadata: {
    duration: "01:30:00",
    totalSegments: 150,
    speakerCount: 3
  }
}
```

#### `formatTranscriptForAI(parsedVTT)`
```javascript
/**
 * 解析済みVTTデータをAI処理用テキストに変換
 * @param {Object} parsedVTT - parseVTTFileの結果
 * @returns {string} AI処理用フォーマット済みテキスト
 */
formatTranscriptForAI(parsedVTT) {
  // 出力例:
  // [00:01] Speaker 1: こんにちは、今日の会議を始めます
  // [00:05] Speaker 2: ありがとうございます
  // [00:10] Speaker 1: 今日のアジェンダは...
}
```

### 3. 可用性チェックメソッド

#### `checkTranscriptAvailability(recording)`
```javascript
/**
 * 録画にTranscriptが利用可能かチェック
 * @param {Object} recording - Zoom録画情報
 * @returns {Promise<Object>} 可用性情報
 */
async checkTranscriptAvailability(recording) {
  // Zoom APIでTranscript情報を確認
  // recording_files内の transcript ファイルを検索
}
```

**戻り値**:
```javascript
{
  available: true,
  transcriptFile: {
    id: "transcript-123",
    file_type: "TRANSCRIPT", 
    file_size: 12345,
    download_url: "https://...",
    file_extension: "VTT"
  },
  estimatedProcessingTime: 30 // 秒
}
```

### 4. エラーハンドリング・フォールバック

#### `handleTranscriptError(error, recording, meetingInfo)`
```javascript
/**
 * Transcript処理エラー時のフォールバック判定
 * @param {Error} error - 発生したエラー 
 * @param {Object} recording - 録画情報
 * @param {Object} meetingInfo - 会議情報
 * @returns {Promise<Object>} フォールバック結果
 */
async handleTranscriptError(error, recording, meetingInfo) {
  // エラータイプ判定
  // - Transcript not available -> 音声処理フォールバック
  // - VTT parse error -> 音声処理フォールバック  
  // - AI processing error -> リトライまたはフォールバック
}
```

## エラーコード定義

### 新規エラーコード（5つ）
```javascript
// zoomService.js関連
'ZM-401': 'Zoom Transcript API authentication failed',
'ZM-402': 'Transcript not available for this recording', 
'ZM-403': 'Transcript download failed',

// transcriptService.js関連  
'TS-501': 'VTT file parsing failed',
'TS-502': 'Transcript processing timeout'
```

## パフォーマンス仕様

### 処理時間目標
- VTT取得: 5-10秒
- VTT解析: 1-3秒  
- AI要約生成: 15-30秒
- **合計: 30-60秒** (vs v1.0: 228.8秒)

### メモリ使用量
- VTTファイル: 通常50-200KB
- メモリ効率: 音声ファイル不要のため大幅削減

## 実装優先度

### Phase 1 (即座実装)
1. `parseVTTFile()` - VTT解析の中核
2. `formatTranscriptForAI()` - AI連携
3. `processTranscript()` - メイン処理

### Phase 2 (フォールバック)
1. `checkTranscriptAvailability()` - 可用性チェック
2. `handleTranscriptError()` - エラー処理
3. AudioSummaryServiceとの連携

### Phase 3 (最適化)
1. キャッシュ機構
2. 並列処理最適化
3. エラー分析・改善

## フォールバック戦略

### フォールバック判定条件
1. Transcript API認証失敗
2. Transcriptファイル不存在
3. VTT解析失敗
4. 処理タイムアウト

### フォールバック処理
```javascript
if (transcriptResult.requiresFallback) {
  logger.info('Transcript処理失敗 - 音声処理フォールバック開始');
  return await audioSummaryService.processRealAudioBuffer(
    audioBuffer, fileName, meetingInfo
  );
}
```

## テスト仕様

### 単体テスト
- VTT解析精度テスト
- エラーハンドリングテスト
- フォールバック動作テスト

### 統合テスト  
- 実際のZoom録画でのE2Eテスト
- パフォーマンス測定
- A/Bテスト準備

この設計により、v1.0からv2.0への安全で効率的な移行を実現します。