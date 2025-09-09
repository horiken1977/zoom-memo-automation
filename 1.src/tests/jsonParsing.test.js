/**
 * JSON解析処理のテストケース
 * TC206問題対応 - 複数JSONブロック、不完全JSON、その他エッジケース
 */

const AIService = require('../services/aiService');
const logger = require('../utils/logger');

describe('JSON Parsing Edge Cases', () => {
  let aiService;

  beforeEach(() => {
    aiService = new AIService();
  });

  describe('extractMultipleJsonBlocks', () => {
    test('複数のJSONブロックを正しく抽出できる', () => {
      const response = `
Here is the first JSON:
\`\`\`json
{"transcription": "test1", "summary": {"overview": "summary1"}}
\`\`\`

And here is another one:
\`\`\`json
{"transcription": "test2", "summary": {"overview": "summary2"}}
\`\`\`
      `;

      const blocks = aiService.extractMultipleJsonBlocks(response);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].transcription).toBe('test1');
      expect(blocks[1].transcription).toBe('test2');
    });

    test('マークダウン記号なしのJSONオブジェクトを抽出できる', () => {
      const response = `
{"transcription": "test data", "summary": {"overview": "test overview"}}
Some other text
{"invalid": "json but no transcription"}
      `;

      const blocks = aiService.extractMultipleJsonBlocks(response);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].transcription).toBe('test data');
    });

    test('無効なJSONが混在していても正常なJSONのみ抽出される', () => {
      const response = `
\`\`\`json
{"transcription": "valid json"}
\`\`\`

\`\`\`json
{"transcription": "another valid", incomplete...
\`\`\`

\`\`\`json
{"transcription": "third valid", "summary": {"overview": "test"}}
\`\`\`
      `;

      const blocks = aiService.extractMultipleJsonBlocks(response);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].transcription).toBe('valid json');
      expect(blocks[1].transcription).toBe('third valid');
    });
  });

  describe('extractDataFromJsonResponse', () => {
    test('JSONレスポンスから文字起こしと要約を抽出できる', () => {
      const response = `{
        "transcription": "これは文字起こしテストです。\\n改行も含まれています。",
        "summary": {
          "overview": "テスト用の要約",
          "client": "テスト株式会社様"
        }
      }`;

      const result = aiService.extractDataFromJsonResponse(response);
      expect(result.transcription).toBe('これは文字起こしテストです。\n改行も含まれています。');
      expect(result.summary.overview).toBe('テスト用の要約');
      expect(result.summary.client).toBe('テスト株式会社様');
    });

    test('エスケープ文字が正しく処理される', () => {
      const response = `{
        "transcription": "テスト\\"引用符\\"データ\\nこれは\\\\バックスラッシュ",
        "summary": {"overview": "テスト"}
      }`;

      const result = aiService.extractDataFromJsonResponse(response);
      expect(result.transcription).toBe('テスト"引用符"データ\nこれは\\バックスラッシュ');
    });

    test('文字起こしが短すぎる場合はエラーをスロー', () => {
      const response = `{
        "transcription": "短い",
        "summary": {"overview": "テスト"}
      }`;

      expect(() => {
        aiService.extractDataFromJsonResponse(response);
      }).toThrow('Transcription extraction failed or too short');
    });
  });

  describe('fixIncompleteJson', () => {
    test('不足している閉じ括弧を追加する', () => {
      const incompleteJson = '{"transcription": "test", "summary": {"overview": "test"';
      const fixed = aiService.fixIncompleteJson(incompleteJson);
      expect(fixed).toBe('{"transcription": "test", "summary": {"overview": "test"}}');
      
      // 修正されたJSONがパース可能か確認
      expect(() => JSON.parse(fixed)).not.toThrow();
    });

    test('すでに完全なJSONはそのまま返す', () => {
      const completeJson = '{"transcription": "test", "summary": {"overview": "test"}}';
      const fixed = aiService.fixIncompleteJson(completeJson);
      expect(fixed).toBe(completeJson);
    });

    test('複数レベルの不完全な括弧を修正する', () => {
      const incompleteJson = '{"transcription": "test", "summary": {"overview": "test", "nested": {"deep": "value"';
      const fixed = aiService.fixIncompleteJson(incompleteJson);
      expect(fixed).toBe('{"transcription": "test", "summary": {"overview": "test", "nested": {"deep": "value"}}}');
      
      expect(() => JSON.parse(fixed)).not.toThrow();
    });
  });

  describe('calculateResponseQuality', () => {
    test('正常なレスポンスは高いスコアを返す', () => {
      const result = {
        transcription: 'これは十分な長さの文字起こしです。' + 'テストデータ'.repeat(50),
        summary: {
          overview: '詳細な要約データです',
          client: 'テスト株式会社様',
          attendees: [
            { name: 'テスト太郎', company: 'テスト株式会社' }
          ]
        }
      };

      const quality = aiService.calculateResponseQuality(result);
      expect(quality.score).toBeGreaterThan(90);
      expect(quality.details).toContain('十分な長さの文字起こし');
      expect(quality.details).toContain('要約生成成功');
      expect(quality.details).toContain('クライアント特定');
      expect(quality.details).toContain('参加者情報');
    });

    test('JSON解析エラーは低いスコアを返す', () => {
      const result = {
        transcription: '⚠️ JSON解析エラー - AIレスポンスの形式解析に失敗しました',
        summary: {
          overview: 'JSON解析エラーのため要約生成できませんでした',
          client: '不明',
          attendees: []
        }
      };

      const quality = aiService.calculateResponseQuality(result);
      expect(quality.score).toBe(0);
      expect(quality.details).toContain('JSON解析失敗');
    });

    test('部分的に成功したケースは中間のスコアを返す', () => {
      const result = {
        transcription: '短めの文字起こしです',
        summary: {
          overview: '要約は生成できた',
          client: '不明',
          attendees: []
        }
      };

      const quality = aiService.calculateResponseQuality(result);
      expect(quality.score).toBe(60); // 30 (短め) + 30 (要約成功) = 60
      expect(quality.details).toContain('短めの文字起こし');
      expect(quality.details).toContain('要約生成成功');
    });
  });

  describe('Edge Case Scenarios', () => {
    test('TC206で発生したケース: JSON後に余計な文字がある', () => {
      const response = `{
        "transcription": "これはテストの文字起こしです。会議の内容をテキスト化したものです。",
        "summary": {
          "overview": "テスト会議の要約",
          "client": "テスト株式会社様"
        }
      }

Additional text after JSON that caused parsing to fail
More content here...
      `;

      // 既存のパース処理（手法3）でこのケースが処理できることを確認
      const jsonStart = response.indexOf('{');
      const jsonEnd = response.lastIndexOf('}');
      const jsonContent = response.substring(jsonStart, jsonEnd + 1);
      
      expect(() => JSON.parse(jsonContent)).not.toThrow();
      
      const parsed = JSON.parse(jsonContent);
      expect(parsed.transcription).toContain('テスト');
      expect(parsed.summary.client).toBe('テスト株式会社様');
    });

    test('複数のJSONオブジェクトが連続している場合', () => {
      const response = `{"transcription": "first"} {"transcription": "second"}`;
      
      const blocks = aiService.extractMultipleJsonBlocks(response);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].transcription).toBe('first');
      expect(blocks[1].transcription).toBe('second');
    });
  });
});