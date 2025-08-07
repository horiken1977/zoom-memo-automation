// TC203: 8項目構造化要約テスト（メモリバッファ処理）
const SampleDataService = require('../1.src/services/sampleDataService');
const AudioSummaryService = require('../1.src/services/audioSummaryService');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  console.log('🧪 TC203: 8項目構造化要約テスト（メモリバッファ処理）開始');

  try {
    // Step 1: サービス初期化
    console.log('Step 1: SampleDataService & AudioSummaryService初期化');
    const sampleDataService = new SampleDataService();
    const audioSummaryService = new AudioSummaryService();

    // Step 2: Google Driveから音声データを直接Bufferとして取得
    console.log('Step 2: Google Driveから音声バッファを直接取得');
    const sampleBufferData = await sampleDataService.getSampleDataAsBuffer();
    console.log('✅ サンプルバッファ取得成功:', {
      fileName: sampleBufferData.fileName,
      size: `${(sampleBufferData.size / 1024).toFixed(2)} KB`,
      mimeType: sampleBufferData.mimeType
    });

    // Step 3: サンプル会議情報生成
    console.log('Step 3: サンプル会議情報生成');
    const meetingInfo = sampleDataService.generateSampleMeetingInfo(sampleBufferData.fileName);
    console.log('✅ サンプル会議情報生成成功:', meetingInfo);

    // Step 4: 8項目構造化要約実行（Bufferから直接）
    console.log('Step 4: 8項目構造化要約実行（メモリバッファから）');
    const analysisResult = await audioSummaryService.processAudioBuffer(
      sampleBufferData.audioBuffer,
      sampleBufferData.fileName,
      meetingInfo
    );
    console.log('✅ 8項目構造化要約成功:', {
      status: analysisResult.status,
      transcriptionLength: analysisResult.transcription?.transcription?.length || 0,
      summaryLength: analysisResult.analysis?.summary?.length || 0,
      keyPointsCount: analysisResult.analysis?.keyPoints?.length || 0
    });

    return res.status(200).json({
      status: 'success',
      test: 'TC203',
      message: '8項目構造化要約テスト成功（メモリバッファ処理）',
      sampleData: {
        fileName: sampleBufferData.fileName,
        size: sampleBufferData.size,
        mimeType: sampleBufferData.mimeType,
        fileId: sampleBufferData.fileId
      },
      meetingInfo: meetingInfo,
      analysisResult: analysisResult,
      timestamp: new Date().toISOString(),
      processingMode: 'memory_buffer_only'
    });

  } catch (error) {
    console.error('❌ TC203テストエラー:', error);
    
    return res.status(500).json({
      status: 'error',
      test: 'TC203',
      message: '8項目構造化要約テスト失敗（メモリバッファ処理）',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      processingMode: 'memory_buffer_only'
    });
  }
};