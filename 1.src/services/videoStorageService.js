const GoogleDriveService = require('./googleDriveService');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

class VideoStorageService {
  constructor() {
    this.googleDriveService = new GoogleDriveService();
    this.recordingsFolder = config.googleDrive.recordingsFolder; // 1Q_KNzjRFzd_n5ktbouZix2Hs13qfTP7a
  }

  /**
   * 動画ファイルをGoogleDriveに保存し、共有リンクを取得
   * @param {string} videoFilePath - 動画ファイルのパス
   * @param {Object} meetingInfo - 会議情報
   * @returns {Object} 保存結果と共有リンク情報
   */
  async saveVideoToGoogleDrive(videoFilePath, meetingInfo) {
    try {
      logger.info(`Saving video to Google Drive: ${videoFilePath}`);

      // ファイル存在確認
      try {
        await fs.access(videoFilePath);
      } catch (error) {
        throw new Error(`Video file not found: ${videoFilePath}`);
      }

      // ファイル情報取得
      const stats = await fs.stat(videoFilePath);
      logger.info(`Video file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      // GoogleDriveService初期化
      await this.googleDriveService.initialize();

      // 年月フォルダ構造を作成・確認
      const folderStructure = await this.ensureFolderStructure(meetingInfo.start_time);

      // ファイル名生成
      const fileName = this.generateVideoFileName(meetingInfo);
      
      // ファイルの説明を生成
      const description = this.generateVideoDescription(meetingInfo);

      // Google Driveにアップロード
      const uploadResult = await this.googleDriveService.uploadFile(
        videoFilePath,
        fileName,
        folderStructure.monthFolderId,
        description
      );

      // 共有リンクを作成
      const shareResult = await this.googleDriveService.createShareableLink(uploadResult.fileId, 'reader');

      logger.info(`Video uploaded successfully: ${fileName} (${uploadResult.fileId})`);

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

      // ベースフォルダ（99.zoom_memo_recording）が存在することを確認
      const baseFolderInfo = await this.googleDriveService.drive.files.get({
        fileId: this.recordingsFolder,
        fields: 'id, name'
      });

      logger.info(`Base folder confirmed: ${baseFolderInfo.data.name} (${this.recordingsFolder})`);

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