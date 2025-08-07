// デバッグ専用軽量テスト - エラー詳細確認用
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const step = req.query.step || 'config';
  const startTime = Date.now();
  
  try {
    if (step === 'config') {
      console.log('🔍 Step: config確認');
      const config = require('../1.src/config');
      
      return res.status(200).json({
        status: 'success',
        step: 'config',
        result: {
          hasSlackConfig: !!config.slack,
          hasGoogleDriveConfig: !!config.googleDrive,
          hasDevelopmentConfig: !!config.development,
          nodeEnv: process.env.NODE_ENV,
          timestamp: new Date().toISOString(),
          executionTime: `${Date.now() - startTime}ms`
        }
      });
    }
    
    if (step === 'services') {
      console.log('🔍 Step: サービス初期化確認');
      const SampleDataService = require('../1.src/services/sampleDataService');
      const sampleDataService = new SampleDataService();
      
      return res.status(200).json({
        status: 'success',
        step: 'services',
        result: {
          sampleDataServiceCreated: !!sampleDataService,
          hasGoogleDriveService: !!sampleDataService.googleDriveService,
          sampleFolderId: sampleDataService.sampleFolderId,
          timestamp: new Date().toISOString(),
          executionTime: `${Date.now() - startTime}ms`
        }
      });
    }
    
    if (step === 'gdrive-init') {
      console.log('🔍 Step: Google Drive初期化確認');
      const GoogleDriveService = require('../1.src/services/googleDriveService');
      const gdriveService = new GoogleDriveService();
      
      console.log('Google Drive初期化開始...');
      await gdriveService.initialize();
      console.log('Google Drive初期化完了');
      
      return res.status(200).json({
        status: 'success',
        step: 'gdrive-init',
        result: {
          initialized: true,
          hasAuth: !!gdriveService.auth,
          hasDrive: !!gdriveService.drive,
          timestamp: new Date().toISOString(),
          executionTime: `${Date.now() - startTime}ms`
        }
      });
    }

    if (step === 'gdrive-list') {
      console.log('🔍 Step: Google Drive sample folder検索');
      const config = require('../1.src/config');
      const GoogleDriveService = require('../1.src/services/googleDriveService');
      const gdriveService = new GoogleDriveService();
      
      await gdriveService.initialize();
      const sampleFolderId = config.googleDrive.recordingsFolder;
      
      console.log('Sample folder検索開始...', sampleFolderId);
      const sampleQuery = `name='sample' and '${sampleFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const sampleResponse = await gdriveService.drive.files.list({
        q: sampleQuery,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });
      console.log('Sample folder検索完了');
      
      return res.status(200).json({
        status: 'success',
        step: 'gdrive-list',
        result: {
          parentFolderId: sampleFolderId,
          foundFolders: sampleResponse.data.files.length,
          folders: sampleResponse.data.files,
          timestamp: new Date().toISOString(),
          executionTime: `${Date.now() - startTime}ms`
        }
      });
    }

    if (step === 'gdrive-files') {
      console.log('🔍 Step: Sample folder内ファイル一覧');
      const config = require('../1.src/config');
      const GoogleDriveService = require('../1.src/services/googleDriveService');
      const gdriveService = new GoogleDriveService();
      
      await gdriveService.initialize();
      const sampleFolderId = '1JYgvxz3vKqBoz23vyYkxKvByHFlTViaM'; // 固定値で直接指定
      
      console.log('Sample folder内ファイル検索開始...', sampleFolderId);
      const filesQuery = `'${sampleFolderId}' in parents and trashed=false`;
      const filesResponse = await gdriveService.drive.files.list({
        q: filesQuery,
        fields: 'files(id, name, mimeType, size)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });
      console.log('Sample folder内ファイル検索完了');
      
      return res.status(200).json({
        status: 'success',
        step: 'gdrive-files',
        result: {
          sampleFolderId: sampleFolderId,
          foundFiles: filesResponse.data.files.length,
          files: filesResponse.data.files,
          audioFiles: filesResponse.data.files.filter(file => 
            file.mimeType && file.mimeType.startsWith('audio/')
          ),
          timestamp: new Date().toISOString(),
          executionTime: `${Date.now() - startTime}ms`
        }
      });
    }

    if (step === 'gdrive-download') {
      console.log('🔍 Step: Sample audioファイル小サイズダウンロードテスト');
      const GoogleDriveService = require('../1.src/services/googleDriveService');
      const gdriveService = new GoogleDriveService();
      
      await gdriveService.initialize();
      
      // 最小のファイルを選択してダウンロードテスト（まず1KB程度の範囲取得）
      const testFileId = '1j-yX9BRITl0TwBeZ4kMQN6k7klq9UunK'; // audio1763668932.m4aの実際のfileId
      
      console.log('小サイズダウンロード開始...', testFileId);
      const downloadResponse = await gdriveService.drive.files.get({
        fileId: testFileId,
        alt: 'media',
        supportsAllDrives: true,
        headers: {
          'Range': 'bytes=0-1023' // 最初の1KBのみ取得
        }
      });
      console.log('小サイズダウンロード完了');
      
      return res.status(200).json({
        status: 'success',  
        step: 'gdrive-download',
        result: {
          fileId: testFileId,
          downloadedBytes: downloadResponse.data.length,
          contentType: downloadResponse.headers['content-type'],
          hasData: !!downloadResponse.data,
          timestamp: new Date().toISOString(),
          executionTime: `${Date.now() - startTime}ms`
        }
      });
    }

    if (step === 'sample-service') {
      console.log('🔍 Step: SampleDataService.getSampleDataAsBuffer()実行テスト');
      const SampleDataService = require('../1.src/services/sampleDataService');
      
      console.log('SampleDataService初期化...');
      const sampleDataService = new SampleDataService();
      
      console.log('getSampleDataAsBuffer()実行開始...');
      const result = await sampleDataService.getSampleDataAsBuffer();
      console.log('getSampleDataAsBuffer()実行完了');
      
      return res.status(200).json({
        status: 'success',
        step: 'sample-service',
        result: {
          fileName: result.fileName,
          size: result.size,
          mimeType: result.mimeType,
          fileId: result.fileId,
          hasAudioBuffer: !!result.audioBuffer,
          bufferLength: result.audioBuffer ? result.audioBuffer.length : 0,
          timestamp: new Date().toISOString(),
          executionTime: `${Date.now() - startTime}ms`
        }
      });
    }

    if (step === 'audio-service-init') {
      console.log('🔍 Step: AudioSummaryService初期化テスト');
      const AudioSummaryService = require('../1.src/services/audioSummaryService');
      
      console.log('AudioSummaryService初期化...');
      const audioSummaryService = new AudioSummaryService();
      console.log('AudioSummaryService初期化完了');
      
      return res.status(200).json({
        status: 'success',
        step: 'audio-service-init',
        result: {
          serviceCreated: !!audioSummaryService,
          hasAiService: !!audioSummaryService.aiService,
          timestamp: new Date().toISOString(),
          executionTime: `${Date.now() - startTime}ms`
        }
      });
    }

    if (step === 'ai-service-init') {
      console.log('🔍 Step: AIService（Gemini）初期化テスト');
      const AIService = require('../1.src/services/aiService');
      
      console.log('AIService初期化...');
      const aiService = new AIService();
      
      console.log('AIService.initializeModel()実行...');
      await aiService.initializeModel();
      console.log('AIService初期化完了');
      
      return res.status(200).json({
        status: 'success',
        step: 'ai-service-init',
        result: {
          serviceCreated: !!aiService,
          hasModel: !!aiService.model,
          modelName: aiService.model ? aiService.model.model : 'unknown',
          timestamp: new Date().toISOString(),
          executionTime: `${Date.now() - startTime}ms`
        }
      });
    }

    if (step === 'gemini-transcribe-test') {
      console.log('🔍 Step: Gemini文字起こし最小テスト（小サイズBuffer）');
      const AIService = require('../1.src/services/aiService');
      const SampleDataService = require('../1.src/services/sampleDataService');
      
      // 小サイズのテストデータを準備
      console.log('小サイズテストデータ準備...');
      const sampleDataService = new SampleDataService();
      const sampleData = await sampleDataService.getSampleDataAsBuffer();
      
      // バッファを最初の100KB（約10秒程度の音声）に制限してテスト
      const testBuffer = sampleData.audioBuffer.slice(0, 100 * 1024);
      console.log('テストバッファ作成完了:', testBuffer.length, 'bytes');
      
      console.log('AIService初期化...');
      const aiService = new AIService();
      await aiService.initializeModel();
      
      console.log('Gemini文字起こしテスト実行...');
      const transcription = await aiService.transcribeAudioFromBuffer(
        testBuffer, 
        sampleData.fileName
      );
      console.log('Gemini文字起こし完了');
      
      return res.status(200).json({
        status: 'success',
        step: 'gemini-transcribe-test',
        result: {
          originalFileSize: sampleData.size,
          testBufferSize: testBuffer.length,
          transcriptionLength: transcription ? transcription.length : 0,
          transcriptionPreview: transcription ? transcription.substring(0, 200) + '...' : 'empty',
          timestamp: new Date().toISOString(),
          executionTime: `${Date.now() - startTime}ms`
        }
      });
    }

    return res.status(400).json({
      status: 'error',
      message: 'Invalid step parameter',
      availableSteps: ['config', 'services', 'gdrive-init', 'gdrive-list', 'gdrive-files', 'gdrive-download', 'sample-service', 'audio-service-init', 'ai-service-init', 'gemini-transcribe-test']
    });
    
  } catch (error) {
    console.error(`❌ Debug step ${step} failed:`, error);
    return res.status(500).json({
      status: 'error',
      step: step,
      error: error.message,
      stack: error.stack,
      executionTime: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString()
    });
  }
};