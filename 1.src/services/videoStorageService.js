const GoogleDriveService = require('./googleDriveService');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

class VideoStorageService {
  constructor() {
    this.googleDriveService = new GoogleDriveService();
    this.recordingsFolder = config.googleDrive.recordingsFolder; // 1Q_KNzjRFzd_n5ktbouZix2Hs13qfTP7a
  }

  /**
   * Google Drive sampleフォルダから動画データを取得
   */
  async getSampleVideoData() {
    try {
      await this.googleDriveService.initialize();

      // sampleフォルダを検索
      const sampleQuery = `name='sample' and '${this.recordingsFolder}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
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
      logger.info(`Sample folder found for video: ${sampleFolderId}`);

      // sampleフォルダ内のファイルを取得
      const filesQuery = `'${sampleFolderId}' in parents and trashed=false`;
      const filesResponse = await this.googleDriveService.drive.files.list({
        q: filesQuery,
        fields: 'files(id, name, mimeType, size)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      const files = filesResponse.data.files;
      logger.info(`Found ${files.length} files in sample folder for video`);

      // 動画ファイル（.mp4, .avi, .mov）を選択
      const videoFiles = files.filter(file => 
        file.mimeType && (
          file.mimeType.includes('video/') ||
          file.name.toLowerCase().includes('.mp4') ||
          file.name.toLowerCase().includes('.avi') ||
          file.name.toLowerCase().includes('.mov')
        )
      );

      if (videoFiles.length === 0) {
        throw new Error('No video files found in sample folder');
      }

      // 最初の動画ファイルを選択
      const selectedFile = videoFiles[0];
      logger.info(`Selected video file: ${selectedFile.name} (${selectedFile.id})`);

      return {
        fileId: selectedFile.id,
        fileName: selectedFile.name,
        mimeType: selectedFile.mimeType,
        size: selectedFile.size,
        sampleFolderId: sampleFolderId
      };

    } catch (error) {
      logger.error('Failed to get sample video data from Google Drive:', error.message);
      throw error;
    }
  }

  /**
   * Google Driveからサンプル動画ファイルをダウンロード
   */
  async downloadSampleVideoFile(fileId, fileName) {
    try {
      await this.googleDriveService.initialize();

      // 一時保存ディレクトリ作成
      const tempDir = '/tmp/sample-video';
      try {
        await fs.mkdir(tempDir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      const filePath = path.join(tempDir, fileName);

      logger.info(`Downloading sample video file: ${fileName} (${fileId})`);

      // Google Drive APIでファイルをダウンロード
      const response = await this.googleDriveService.drive.files.get({
        fileId: fileId,
        alt: 'media',
        supportsAllDrives: true
      }, { responseType: 'stream' });

      // ファイルストリームを保存
      const writer = fsSync.createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          logger.info(`Sample video file downloaded: ${filePath}`);
          resolve({
            filePath: filePath,
            fileName: fileName,
            fileId: fileId,
            tempDir: tempDir
          });
        });

        writer.on('error', reject);
      });

    } catch (error) {
      logger.error('Failed to download sample video file:', error.message);
      throw error;
    }
  }

  /**
   * 動画ファイルをGoogleDriveに保存し、共有リンクを取得
   * @param {Object} meetingInfo - 会議情報
   * @returns {Object} 保存結果と共有リンク情報
   */
  async saveVideoToGoogleDrive(meetingInfo) {
    try {
      logger.info(`Starting video processing for Google Drive storage`);

      // Step 1: サンプル動画データを取得
      const videoData = await this.getSampleVideoData();
      logger.info(`Video data retrieved: ${videoData.fileName} (${videoData.size} bytes)`);

      // Step 2: サンプル動画ファイルをダウンロード
      const downloadResult = await this.downloadSampleVideoFile(videoData.fileId, videoData.fileName);
      logger.info(`Video file downloaded: ${downloadResult.filePath}`);

      // Step 3: ファイル情報取得
      const stats = await fs.stat(downloadResult.filePath);
      logger.info(`Video file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      // Step 4: GoogleDriveService初期化
      await this.googleDriveService.initialize();

      // Step 5: 年月フォルダ構造を作成・確認
      const folderStructure = await this.ensureFolderStructure(meetingInfo.start_time);

      // Step 6: ファイル名生成
      const fileName = this.generateVideoFileName(meetingInfo);
      
      // Step 7: ファイルの説明を生成
      const description = this.generateVideoDescription(meetingInfo);

      // Step 8: Google Driveにアップロード
      const uploadResult = await this.googleDriveService.uploadFile(
        downloadResult.filePath,
        fileName,
        folderStructure.monthFolderId,
        description
      );

      // 共有リンクを作成
      const shareResult = await this.googleDriveService.createShareableLink(uploadResult.fileId, 'reader');

      logger.info(`Video uploaded successfully: ${fileName} (${uploadResult.fileId})`);

      // Step 9: 一時ファイル削除
      try {
        await fs.unlink(downloadResult.filePath);
        await fs.rmdir(downloadResult.tempDir);
        logger.info(`Temporary video files cleaned up: ${downloadResult.tempDir}`);
      } catch (cleanupError) {
        logger.warn(`Failed to cleanup temporary video files: ${cleanupError.message}`);
      }

      return {
        status: 'success',
        fileId: uploadResult.fileId,
        fileName: fileName,
        size: uploadResult.size,
        viewLink: shareResult.viewLink,
        downloadLink: shareResult.downloadLink,
        folderPath: folderStructure.folderPath,
        description: description,
        uploadTime: uploadResult.uploadTime,
        createdTime: uploadResult.createdTime,
        mimeType: uploadResult.mimeType,
        originalVideoData: videoData,
        savedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to save video to Google Drive:', error.message);
      throw error;
    }
  }

  /**
   * 年月フォルダ構造を作成・確認
   */
  async ensureFolderStructure(startTime) {
    try {
      const date = new Date(startTime);
      const year = date.getFullYear().toString();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');

      logger.info(`Looking for base folder: ${this.recordingsFolder}`);

      // ベースフォルダの存在確認（SampleDataServiceと同じパターン）
      let baseFolderInfo;
      try {
        baseFolderInfo = await this.googleDriveService.drive.files.get({
          fileId: this.recordingsFolder,
          fields: 'id, name',
          supportsAllDrives: true
        });
        logger.info(`Base folder confirmed: ${baseFolderInfo.data.name} (${this.recordingsFolder})`);
      } catch (error) {
        logger.error(`Base folder not found by ID: ${this.recordingsFolder}, error: ${error.message}`);
        
        // フォルダIDが無効な場合、フォルダ名で検索（フォールバック）
        const folderQuery = `name='${this.recordingsFolder}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const folderResponse = await this.googleDriveService.drive.files.list({
          q: folderQuery,
          fields: 'files(id, name)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true
        });
        
        if (folderResponse.data.files.length === 0) {
          throw new Error(`Recording folder not found: ${this.recordingsFolder}`);
        }
        
        this.recordingsFolder = folderResponse.data.files[0].id;
        baseFolderInfo = { data: folderResponse.data.files[0] };
        logger.info(`Base folder found by name: ${baseFolderInfo.data.name} (${this.recordingsFolder})`);
      }

      // 年フォルダを確保
      const yearFolderId = await this.googleDriveService.ensureFolder(year, this.recordingsFolder);
      
      // 月フォルダを確保
      const monthFolderId = await this.googleDriveService.ensureFolder(month, yearFolderId);

      return {
        baseFolderId: this.recordingsFolder,
        yearFolderId: yearFolderId,
        monthFolderId: monthFolderId,
        folderPath: `${baseFolderInfo.data.name}/${year}/${month}`
      };

    } catch (error) {
      logger.error('Failed to ensure folder structure:', error.message);
      throw error;
    }
  }

  /**
   * 動画ファイル名を生成
   */
  generateVideoFileName(meetingInfo) {
    const date = new Date(meetingInfo.start_time);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
    
    // 会議名をファイル名に適した形式に変換
    const safeName = meetingInfo.topic
      .replace(/[<>:"/\\|?*]/g, '') // 無効な文字を削除
      .replace(/\s+/g, '_') // スペースをアンダースコアに
      .substring(0, 50); // 長さ制限

    // 拡張子を確定
    const extension = meetingInfo.originalFileName ? 
      path.extname(meetingInfo.originalFileName) : 
      '.mp4'; // デフォルトはmp4
    
    return `${dateStr}_${timeStr}_${safeName}${extension}`;
  }

  /**
   * 動画の説明文を生成
   */
  generateVideoDescription(meetingInfo) {
    return `Zoom Meeting Recording

会議名: ${meetingInfo.topic}
開催日時: ${new Date(meetingInfo.start_time).toLocaleString('ja-JP')}
時間: ${meetingInfo.duration}分
主催者: ${meetingInfo.hostName || meetingInfo.host_email}
参加者数: ${meetingInfo.participantCount || 'N/A'}
Meeting ID: ${meetingInfo.id}
UUID: ${meetingInfo.uuid || 'N/A'}

自動保存: ${new Date().toLocaleString('ja-JP')}
システム: Zoom Meeting Automation`;
  }

  /**
   * 保存結果の検証
   */
  validateSaveResult(result) {
    const requiredFields = ['fileId', 'fileName', 'viewLink', 'downloadLink'];
    
    for (const field of requiredFields) {
      if (!result[field]) {
        throw new Error(`Save result missing required field: ${field}`);
      }
    }

    // URLの形式チェック
    if (!result.viewLink.includes('drive.google.com')) {
      throw new Error('Invalid view link format');
    }

    return true;
  }

  /**
   * ファイル形式を検証
   */
  validateVideoFile(videoFilePath) {
    const ext = path.extname(videoFilePath).toLowerCase();
    const supportedFormats = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
    
    if (!supportedFormats.includes(ext)) {
      throw new Error(`Unsupported video format: ${ext}. Supported formats: ${supportedFormats.join(', ')}`);
    }
    
    return true;
  }

  /**
   * 実際のZoom録画バッファをGoogle Driveに保存（本番用）
   * @param {Buffer} videoBuffer - Zoom録画バッファデータ
   * @param {string} fileName - 保存ファイル名  
   * @param {Object} meetingInfo - 会議情報
   * @returns {Promise<Object>} 保存結果
   */
  async saveZoomVideoBuffer(videoBuffer, fileName, meetingInfo) {
    try {
      logger.info(`実Zoom録画保存開始: ${fileName} (${Math.round(videoBuffer.length / 1024 / 1024)}MB)`);

      // GoogleDriveService初期化
      await this.googleDriveService.initialize();

      // 年月フォルダ構造を作成・確認
      const folderStructure = await this.ensureFolderStructure(meetingInfo.start_time);

      // ファイル名生成
      const finalFileName = this.generateVideoFileName(meetingInfo);
      
      // ファイルの説明を生成
      const description = this.generateVideoDescription(meetingInfo);

      // バッファから直接Google Driveにアップロード
      const uploadResult = await this.googleDriveService.uploadFromBuffer(
        videoBuffer,
        finalFileName,
        folderStructure.monthFolderId,
        'video/mp4',
        description
      );

      // 共有リンクを作成
      const shareResult = await this.googleDriveService.createShareableLink(uploadResult.fileId, 'reader');

      logger.info(`実Zoom録画アップロード成功: ${finalFileName} (${uploadResult.fileId})`);

      return {
        success: true,
        fileId: uploadResult.fileId,
        fileName: finalFileName,
        size: videoBuffer.length,
        viewLink: shareResult.viewLink,
        downloadLink: shareResult.downloadLink,
        folderPath: folderStructure.folderPath,
        description: description,
        uploadTime: uploadResult.uploadTime,
        createdTime: uploadResult.createdTime,
        mimeType: uploadResult.mimeType,
        originalFileName: fileName,
        savedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('実Zoom録画保存エラー:', error.message);
      throw error;
    }
  }

  /**
   * 保存統計情報を取得
   */
  getSaveStats(result) {
    return {
      fileName: result.fileName,
      fileSize: result.size,
      fileSizeMB: result.size ? (result.size / 1024 / 1024).toFixed(2) : 'unknown',
      uploadTime: result.uploadTime,
      folderPath: result.folderPath,
      savedAt: result.savedAt,
      fileId: result.fileId
    };
  }
}

module.exports = VideoStorageService;