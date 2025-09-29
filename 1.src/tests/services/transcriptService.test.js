/**
 * TranscriptService単体テスト
 * 
 * VTT解析、エラーハンドリング、フォールバック機構のテスト
 */

const TranscriptService = require('../../services/transcriptService');

// テスト用VTTデータ
const SAMPLE_VTT = `WEBVTT

00:00:01.000 --> 00:00:05.000
<v Speaker 1>こんにちは、今日の会議を始めます。

00:00:05.000 --> 00:00:10.000
<v Speaker 2>ありがとうございます。今日のアジェンダは3つあります。

00:00:10.000 --> 00:00:15.000
<v Speaker 1>まず最初に、先月の売上報告からお願いします。

00:00:15.000 --> 00:00:20.000
<v Speaker 2>承知しました。先月の売上は目標を10%上回りました。`;

const INVALID_VTT = `INVALID_HEADER

00:00:01.000 --> 00:00:05.000
Some text without proper format`;

describe('TranscriptService', () => {
  let transcriptService;
  
  beforeEach(() => {
    // モックAIService
    const mockAiService = {
      generateSummaryFromTranscription: jest.fn().mockResolvedValue({
        structuredSummary: {
          summary: 'テスト要約',
          keyPoints: ['ポイント1', 'ポイント2'],
          actionItems: [],
          decisions: [],
          nextSteps: []
        },
        processingTime: 1000
      })
    };
    
    // モックZoomService
    const mockZoomService = {
      downloadFileAsBuffer: jest.fn().mockResolvedValue(Buffer.from(SAMPLE_VTT))
    };
    
    transcriptService = new TranscriptService({
      aiService: mockAiService,
      zoomService: mockZoomService,
      fallbackEnabled: true
    });
  });

  describe('parseVTTFile', () => {
    test('正常なVTTファイルを正しく解析できる', async () => {
      const buffer = Buffer.from(SAMPLE_VTT);
      const result = await transcriptService.parseVTTFile(buffer);
      
      expect(result.segments).toHaveLength(4);
      expect(result.participants).toHaveLength(2);
      expect(result.metadata.totalSegments).toBe(4);
      expect(result.metadata.speakerCount).toBe(2);
      
      // 最初のセグメント確認
      expect(result.segments[0]).toEqual({
        startTime: '00:00:01.000',
        endTime: '00:00:05.000',
        speaker: 'Speaker 1',
        text: 'こんにちは、今日の会議を始めます。',
        timestamp: 1000
      });
      
      // 参加者確認
      expect(result.participants).toContainEqual({
        id: 'Speaker 1',
        name: 'Speaker 1',
        segments: 2
      });
      expect(result.participants).toContainEqual({
        id: 'Speaker 2',
        name: 'Speaker 2',
        segments: 2
      });
    });

    test('無効なVTTファイルでエラーが発生する', async () => {
      const buffer = Buffer.from(INVALID_VTT);
      
      await expect(transcriptService.parseVTTFile(buffer))
        .rejects.toThrow('Invalid VTT file: missing WEBVTT header');
    });

    test('空のVTTファイルを処理できる', async () => {
      const buffer = Buffer.from('WEBVTT\n\n');
      const result = await transcriptService.parseVTTFile(buffer);
      
      expect(result.segments).toHaveLength(0);
      expect(result.participants).toHaveLength(0);
      expect(result.metadata.totalSegments).toBe(0);
    });
  });

  describe('formatTranscriptForAI', () => {
    test('解析済みVTTを正しくフォーマットできる', async () => {
      const buffer = Buffer.from(SAMPLE_VTT);
      const parsedVTT = await transcriptService.parseVTTFile(buffer);
      const formatted = transcriptService.formatTranscriptForAI(parsedVTT);
      
      expect(formatted).toContain('会議参加者: Speaker 1, Speaker 2');
      expect(formatted).toContain('会議時間: 00:00:20.000');
      expect(formatted).toContain('発言数: 4');
      expect(formatted).toContain('こんにちは、今日の会議を始めます');
      expect(formatted).toContain('[00:01] Speaker 1:');
    });
  });

  describe('checkTranscriptAvailability', () => {
    test('Transcriptファイルが存在する場合true', async () => {
      const recording = {
        recording_files: [
          {
            file_type: 'MP4',
            file_size: 1000000
          },
          {
            file_type: 'VTT',
            file_size: 50000,
            download_url: 'https://example.com/transcript.vtt',
            file_extension: 'vtt'
          }
        ]
      };
      
      const result = await transcriptService.checkTranscriptAvailability(recording);
      
      expect(result.available).toBe(true);
      expect(result.transcriptFile).toBeDefined();
      expect(result.transcriptFile.file_type).toBe('VTT');
    });

    test('Transcriptファイルが存在しない場合false', async () => {
      const recording = {
        recording_files: [
          {
            file_type: 'MP4',
            file_size: 1000000
          },
          {
            file_type: 'M4A',
            file_size: 500000
          }
        ]
      };
      
      const result = await transcriptService.checkTranscriptAvailability(recording);
      
      expect(result.available).toBe(false);
      expect(result.error).toBe('No transcript file found in recording');
    });

    test('0バイトのTranscriptファイルは無効', async () => {
      const recording = {
        recording_files: [
          {
            file_type: 'VTT',
            file_size: 0,
            download_url: 'https://example.com/transcript.vtt'
          }
        ]
      };
      
      const result = await transcriptService.checkTranscriptAvailability(recording);
      
      expect(result.available).toBe(false);
      expect(result.error).toBe('Transcript file size is 0 or undefined');
    });
  });

  describe('handleTranscriptError', () => {
    test('Zoom APIエラーでフォールバックが必要と判定', async () => {
      const error = { code: 'ZM-401', message: 'Auth failed' };
      const result = await transcriptService.handleTranscriptError(
        error, 
        {}, 
        { topic: 'Test Meeting' }
      );
      
      expect(result.requiresFallback).toBe(true);
      expect(result.reason).toBe('transcript_auth_failed');
    });

    test('VTT解析エラーでフォールバックが必要と判定', async () => {
      const error = { code: 'TS-501', message: 'Parse failed' };
      const result = await transcriptService.handleTranscriptError(
        error,
        {},
        { topic: 'Test Meeting' }
      );
      
      expect(result.requiresFallback).toBe(true);
      expect(result.reason).toBe('vtt_parse_failed');
    });

    test('フォールバックが無効な場合requiresFallback=false', async () => {
      transcriptService.fallbackEnabled = false;
      
      const error = { code: 'ZM-401', message: 'Auth failed' };
      const result = await transcriptService.handleTranscriptError(
        error,
        {},
        { topic: 'Test Meeting' }
      );
      
      expect(result.requiresFallback).toBe(false);
      expect(result.success).toBe(false);
    });
  });

  describe('時間処理ユーティリティ', () => {
    test('timeToMilliseconds変換が正しい', () => {
      expect(transcriptService.timeToMilliseconds('00:00:01.000')).toBe(1000);
      expect(transcriptService.timeToMilliseconds('00:01:00.000')).toBe(60000);
      expect(transcriptService.timeToMilliseconds('01:00:00.000')).toBe(3600000);
      expect(transcriptService.timeToMilliseconds('00:00:00.500')).toBe(500);
    });

    test('formatTime変換が正しい', () => {
      expect(transcriptService.formatTime('00:00:01.000')).toBe('00:01');
      expect(transcriptService.formatTime('00:01:30.000')).toBe('01:30');
      expect(transcriptService.formatTime('01:15:45.000')).toBe('75:45');
    });
  });

  describe('estimateProcessingTime', () => {
    test('ファイルサイズから処理時間を推定', () => {
      expect(transcriptService.estimateProcessingTime(50000)).toBe(10);   // 50KB
      expect(transcriptService.estimateProcessingTime(100000)).toBe(10);  // 100KB
      expect(transcriptService.estimateProcessingTime(200000)).toBe(20);  // 200KB
      expect(transcriptService.estimateProcessingTime(600000)).toBe(60);  // 600KB (max)
      expect(transcriptService.estimateProcessingTime(10000)).toBe(10);   // 10KB (min)
    });
  });
});

// テスト実行用
if (require.main === module) {
  console.log('TranscriptService単体テスト準備完了');
  console.log('実行: npm test transcriptService.test.js');
}