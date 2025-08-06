const { google } = require('googleapis');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.auth = null;
    this.initialized = false;
  }

  /**
   * Google Drive APIの初期化
   */
  async initialize() {
    try {
      if (this.initialized) {
        return;
      }

      // サービスアカウントキーでの認証
      if (config.googleDrive.serviceAccountKey) {
        this.auth = new google.auth.GoogleAuth({
          keyFile: config.googleDrive.serviceAccountKey,
          scopes: ['https://www.googleapis.com/auth/drive']
        });
      } else if (config.googleDrive.credentials) {
        // JSON形式の認証情報
        this.auth = new google.auth.GoogleAuth({
          credentials: JSON.parse(config.googleDrive.credentials),
          scopes: ['https://www.googleapis.com/auth/drive']
        });
      } else {
        throw new Error('Google Drive credentials not configured');
      }

      this.drive = google.drive({ version: 'v3', auth: this.auth });
      this.initialized = true;
      
      logger.info('Google Drive service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Google Drive service:', error.message);
      throw error;
    }
  }

  /**
   * 指定フォルダが存在するかチェック、なければ作成
   */
  async ensureFolder(folderName, parentFolderId = null) {
    try {
      await this.initialize();

      // フォルダの検索
      const query = parentFolderId 
        ? `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
        : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name)'
      });

      if (response.data.files.length > 0) {
        return response.data.files[0].id;
      }

      // フォルダが存在しない場合は作成
      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentFolderId ? [parentFolderId] : []
      };

      const folder = await this.drive.files.create({
        resource: folderMetadata,
        fields: 'id'
      });

      logger.info(`Created Google Drive folder: ${folderName} (ID: ${folder.data.id})`);
      return folder.data.id;
    } catch (error) {
      logger.error(`Failed to ensure folder ${folderName}:`, error.message);
      throw error;
    }
  }

  /**
   * ファイルをGoogle Driveにアップロード
   */
  async uploadFile(filePath, fileName, folderId = null, description = null) {
    try {
      await this.initialize();

      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileMetadata = {
        name: fileName,
        parents: folderId ? [folderId] : [],
        description: description || `Uploaded by Zoom Memo Automation at ${new Date().toISOString()}`
      };

      const media = {
        mimeType: this.getMimeType(fileName),
        body: fsSync.createReadStream(filePath)
      };

      logger.info(`Uploading file to Google Drive: ${fileName}`);
      const startTime = Date.now();

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, size, mimeType, createdTime'
      });

      const uploadTime = Math.round((Date.now() - startTime) / 1000);
      const fileId = response.data.id;

      logger.info(`File uploaded successfully: ${fileName} (ID: ${fileId}, Time: ${uploadTime}s)`);

      return {
        fileId: fileId,
        fileName: fileName,
        size: response.data.size,
        mimeType: response.data.mimeType,
        createdTime: response.data.createdTime,
        uploadTime: uploadTime
      };
    } catch (error) {
      logger.error(`Failed to upload file ${fileName}:`, error.message);
      throw error;
    }
  }

  /**
   * ファイルの共有設定を変更して公開リンクを取得
   */
  async createShareableLink(fileId, accessType = 'reader') {
    try {
      await this.initialize();

      // ファイルを組織内で共有可能に設定
      await this.drive.permissions.create({
        fileId: fileId,
        resource: {
          role: accessType, // 'reader', 'writer', 'commenter'
          type: 'domain',
          domain: config.googleDrive.organizationDomain || undefined
        }
      });

      // 共有リンクを取得
      const file = await this.drive.files.get({
        fileId: fileId,
        fields: 'webViewLink, webContentLink'
      });

      logger.info(`Created shareable link for file ID: ${fileId}`);

      return {
        fileId: fileId,
        viewLink: file.data.webViewLink,
        downloadLink: file.data.webContentLink
      };
    } catch (error) {
      logger.error(`Failed to create shareable link for file ${fileId}:`, error.message);
      throw error;
    }
  }

  /**
   * 録画ファイルを規定フォルダに保存
   */
  async saveRecording(filePath, meetingInfo) {
    try {
      const fileName = this.generateRecordingFileName(meetingInfo);
      const description = this.generateRecordingDescription(meetingInfo);

      // 年月フォルダ構造を作成 (例: 2025/01)
      const date = new Date(meetingInfo.startTime);
      const year = date.getFullYear().toString();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');

      // ベースフォルダを確保
      const baseFolderId = await this.ensureFolder(config.googleDrive.recordingsFolder);
      
      // 年フォルダを確保
      const yearFolderId = await this.ensureFolder(year, baseFolderId);
      
      // 月フォルダを確保
      const monthFolderId = await this.ensureFolder(month, yearFolderId);

      // ファイルアップロード
      const uploadResult = await this.uploadFile(filePath, fileName, monthFolderId, description);

      // 共有リンク作成
      const shareResult = await this.createShareableLink(uploadResult.fileId);

      return {
        ...uploadResult,
        ...shareResult,
        folderPath: `${config.googleDrive.recordingsFolder}/${year}/${month}`,
        description: description
      };
    } catch (error) {
      logger.error('Failed to save recording to Google Drive:', error.message);
      throw error;
    }
  }

  /**
   * 録画ファイル名を生成
   */
  generateRecordingFileName(meetingInfo) {
    const date = new Date(meetingInfo.startTime);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
    
    // 会議名をファイル名に適した形式に変換
    const safeName = meetingInfo.topic
      .replace(/[<>:"/\\|?*]/g, '') // 無効な文字を削除
      .replace(/\s+/g, '_') // スペースをアンダースコアに
      .substring(0, 50); // 長さ制限

    const extension = path.extname(meetingInfo.originalFileName || '.mp4');
    
    return `${dateStr}_${timeStr}_${safeName}${extension}`;
  }

  /**
   * 録画の説明文を生成
   */
  generateRecordingDescription(meetingInfo) {
    return `Zoom Meeting Recording
会議名: ${meetingInfo.topic}
開催日時: ${new Date(meetingInfo.startTime).toLocaleString('ja-JP')}
時間: ${meetingInfo.duration}分
主催者: ${meetingInfo.hostName}
参加者数: ${meetingInfo.participantCount || 'N/A'}

自動保存: ${new Date().toLocaleString('ja-JP')}`;
  }

  /**
   * ファイル拡張子からMIMEタイプを判定
   */
  getMimeType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.m4a': 'audio/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 一時ファイルを保存（音声処理用）
   */
  async saveTemporaryFile(filePath, meetingId) {
    try {
      await this.initialize();

      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileName = path.basename(filePath);
      
      // Tempフォルダを確保
      const tempBaseFolderId = await this.ensureFolder('Temp');
      
      // 会議IDごとのフォルダを確保
      const meetingFolderId = await this.ensureFolder(meetingId, tempBaseFolderId);

      const fileMetadata = {
        name: fileName,
        parents: [meetingFolderId],
        description: `Temporary audio file for processing - Meeting ID: ${meetingId} - ${new Date().toISOString()}`
      };

      const media = {
        mimeType: this.getMimeType(fileName),
        body: fsSync.createReadStream(filePath)
      };

      logger.info(`Uploading temporary file to Google Drive: ${fileName} (Meeting ID: ${meetingId})`);
      const startTime = Date.now();

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, size, mimeType, createdTime'
      });

      const uploadTime = Math.round((Date.now() - startTime) / 1000);
      const fileId = response.data.id;

      logger.info(`Temporary file uploaded successfully: ${fileName} (ID: ${fileId}, Time: ${uploadTime}s)`);

      return {
        fileId: fileId,
        fileName: fileName,
        size: response.data.size,
        mimeType: response.data.mimeType,
        createdTime: response.data.createdTime,
        uploadTime: uploadTime,
        tempFolderPath: `Temp/${meetingId}`
      };
    } catch (error) {
      logger.error(`Failed to save temporary file for meeting ${meetingId}:`, error.message);
      throw error;
    }
  }

  /**
   * 一時ファイルを削除（処理完了後のクリーンアップ）
   */
  async deleteTemporaryFile(meetingId) {
    try {
      await this.initialize();

      // Tempフォルダを検索
      const tempQuery = `name='Temp' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const tempResponse = await this.drive.files.list({
        q: tempQuery,
        fields: 'files(id, name)'
      });

      if (tempResponse.data.files.length === 0) {
        logger.warn(`Temp folder not found for cleanup`);
        return { deleted: false, reason: 'Temp folder not found' };
      }

      const tempFolderId = tempResponse.data.files[0].id;

      // 会議IDフォルダを検索
      const meetingQuery = `name='${meetingId}' and '${tempFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const meetingResponse = await this.drive.files.list({
        q: meetingQuery,
        fields: 'files(id, name)'
      });

      if (meetingResponse.data.files.length === 0) {
        logger.warn(`Meeting folder ${meetingId} not found for cleanup`);
        return { deleted: false, reason: 'Meeting folder not found' };
      }

      const meetingFolderId = meetingResponse.data.files[0].id;

      // フォルダ内のすべてのファイルを削除
      const filesQuery = `'${meetingFolderId}' in parents and trashed=false`;
      const filesResponse = await this.drive.files.list({
        q: filesQuery,
        fields: 'files(id, name)'
      });

      const deletedFiles = [];
      for (const file of filesResponse.data.files) {
        await this.drive.files.delete({ fileId: file.id });
        deletedFiles.push(file.name);
        logger.info(`Deleted temporary file: ${file.name} (ID: ${file.id})`);
      }

      // 空になった会議フォルダも削除
      await this.drive.files.delete({ fileId: meetingFolderId });
      logger.info(`Deleted temporary meeting folder: ${meetingId} (ID: ${meetingFolderId})`);

      return {
        deleted: true,
        deletedFiles: deletedFiles,
        deletedFolderId: meetingFolderId
      };
    } catch (error) {
      logger.error(`Failed to delete temporary files for meeting ${meetingId}:`, error.message);
      throw error;
    }
  }

  /**
   * ヘルスチェック
   */
  async healthCheck() {
    try {
      await this.initialize();
      
      // 簡単なAPI呼び出しでテスト
      await this.drive.about.get({
        fields: 'user, storageQuota'
      });

      return {
        status: 'healthy',
        service: 'Google Drive API',
        initialized: this.initialized
      };
    } catch (error) {
      logger.error('Google Drive health check failed:', error.message);
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = GoogleDriveService;