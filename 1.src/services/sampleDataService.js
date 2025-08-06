const GoogleDriveService = require('./googleDriveService');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

class SampleDataService {
  constructor() {
    this.googleDriveService = new GoogleDriveService();
    this.sampleFolderId = config.googleDrive.recordingsFolder; // 1Q_KNzjRFzd_n5ktbouZix2Hs13qfTP7a
  }

  /**
   * Google Drive sampleフォルダからサンプルデータを取得
   */
  async getSampleData() {
    try {
      await this.googleDriveService.initialize();

      // sampleフォルダを検索
      const sampleQuery = `name='sample' and '${this.sampleFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const sampleResponse = await this.googleDriveService.drive.files.list({
        q: sampleQuery,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      if (sampleResponse.data.files.length === 0) {
        throw new Error('Sample folder not found in Google Drive');
      }

      const sampleFolderId = sampleResponse.data.files[0].id;
      logger.info(`Sample folder found: ${sampleFolderId}`);

      // sampleフォルダ内のファイルを取得
      const filesQuery = `'${sampleFolderId}' in parents and trashed=false`;
      const filesResponse = await this.googleDriveService.drive.files.list({
        q: filesQuery,
        fields: 'files(id, name, mimeType, size)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      const files = filesResponse.data.files;
      logger.info(`Found ${files.length} files in sample folder`);

      // 音声ファイル（.m4a, .mp3, .wav）を優先的に選択
      const audioFiles = files.filter(file => 
        file.mimeType && (
          file.mimeType.includes('audio/') ||
          file.name.toLowerCase().includes('.m4a') ||
          file.name.toLowerCase().includes('.mp3') ||
          file.name.toLowerCase().includes('.wav')
        )
      );

      if (audioFiles.length === 0) {
        throw new Error('No audio files found in sample folder');
      }

      // 最初の音声ファイルを選択
      const selectedFile = audioFiles[0];
      logger.info(`Selected audio file: ${selectedFile.name} (${selectedFile.id})`);

      return {
        fileId: selectedFile.id,
        fileName: selectedFile.name,
        mimeType: selectedFile.mimeType,
        size: selectedFile.size,
        sampleFolderId: sampleFolderId
      };

    } catch (error) {
      logger.error('Failed to get sample data from Google Drive:', error.message);
      throw error;
    }
  }

  /**
   * Google Driveからサンプル音声ファイルをダウンロード
   */
  async downloadSampleFile(fileId, fileName) {
    try {
      await this.googleDriveService.initialize();

      // 一時保存ディレクトリ作成
      const tempDir = '/tmp/sample-data';
      await fs.ensureDir(tempDir);
      const filePath = path.join(tempDir, fileName);

      logger.info(`Downloading sample file: ${fileName} (${fileId})`);

      // Google Drive APIでファイルをダウンロード
      const response = await this.googleDriveService.drive.files.get({
        fileId: fileId,
        alt: 'media',
        supportsAllDrives: true
      }, { responseType: 'stream' });

      // ファイルに保存
      const writeStream = fs.createWriteStream(filePath);
      response.data.pipe(writeStream);

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        response.data.on('error', reject);
      });

      // ファイルサイズ確認
      const stats = await fs.stat(filePath);
      logger.info(`Sample file downloaded: ${fileName} (${(stats.size / 1024).toFixed(2)} KB)`);

      return {
        filePath: filePath,
        fileName: fileName,
        size: stats.size,
        downloadTime: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`Failed to download sample file ${fileName}:`, error.message);
      throw error;
    }
  }

  /**
   * サンプル会議情報を生成
   */
  generateSampleMeetingInfo(fileName) {
    const now = new Date();
    const startTime = new Date(now.getTime() - 30 * 60 * 1000); // 30分前

    return {
      id: `sample-${Date.now()}`,
      uuid: `sample-uuid-${Date.now()}`,
      topic: '【サンプルデータテスト】1on1 Meeting',
      start_time: startTime.toISOString(),
      duration: 30,
      host_email: 'sample@test.com',
      hostName: 'Sample Host',
      participantCount: 2,
      originalFileName: fileName,
      recording_files: [{
        id: 'sample-file-1',
        file_type: path.extname(fileName).toUpperCase().replace('.', ''),
        download_url: 'sample-url',
        recording_type: 'shared_screen_with_speaker_view'
      }]
    };
  }

  /**
   * 一時ファイルのクリーンアップ
   */
  async cleanup() {
    try {
      const tempDir = '/tmp/sample-data';
      if (await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
        logger.info('Sample data temporary files cleaned up');
      }
    } catch (error) {
      logger.error('Failed to cleanup sample data:', error.message);
    }
  }
}

module.exports = SampleDataService;