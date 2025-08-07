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

    return res.status(400).json({
      status: 'error',
      message: 'Invalid step parameter',
      availableSteps: ['config', 'services', 'gdrive-init', 'gdrive-list']
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