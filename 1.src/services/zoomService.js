const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

class ZoomService {
  constructor() {
    this.baseUrl = config.zoom.baseUrl;
    this.accountId = config.zoom.accountId;
    // OAuth credentials (preferred)
    this.clientId = config.zoom.clientId;
    this.clientSecret = config.zoom.clientSecret;
    // Legacy JWT credentials (fallback)
    this.apiKey = config.zoom.apiKey;
    this.apiSecret = config.zoom.apiSecret;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * JWT トークンを生成
   */
  generateJWT() {
    try {
      const header = {
        alg: 'HS256',
        typ: 'JWT'
      };

      const payload = {
        iss: this.apiKey,
        exp: Math.floor(Date.now() / 1000) + 3600 // 1時間後に期限切れ
      };

      const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      
      const signature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');

      return `${encodedHeader}.${encodedPayload}.${signature}`;
    } catch (error) {
      logger.error('JWT generation failed:', error);
      throw error;
    }
  }

  /**
   * OAuth アクセストークンを取得
   */
  async getAccessToken() {
    try {
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        logger.info('Using cached Zoom access token');
        return this.accessToken;
      }

      // OAuth Server-to-Server認証を優先使用（設定で有効な場合のみ）
      if (config.zoom.useOAuth && this.clientId && this.clientSecret) {
        logger.info('Attempting Zoom OAuth Server-to-Server authentication...');
        logger.info(`Account ID: ${this.accountId}`);
        logger.info(`Client ID: ${this.clientId ? 'SET' : 'NOT SET'}`);
        logger.info(`Client Secret: ${this.clientSecret ? 'SET' : 'NOT SET'}`);
        
        const tokenRequest = {
          url: 'https://zoom.us/oauth/token',
          params: {
            grant_type: 'account_credentials',
            account_id: this.accountId
          },
          auth: {
            username: this.clientId,
            password: this.clientSecret
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        };
        
        logger.info('Token request config:', JSON.stringify({
          url: tokenRequest.url,
          params: tokenRequest.params,
          auth: { username: this.clientId ? 'SET' : 'NOT SET', password: 'HIDDEN' },
          headers: tokenRequest.headers
        }, null, 2));

        // Server-to-Server OAuth認証用のリクエストボディを作成
        const requestBody = new URLSearchParams({
          grant_type: 'account_credentials',
          account_id: this.accountId
        });

        logger.info('Request body:', requestBody.toString());

        const response = await axios.post(tokenRequest.url, requestBody.toString(), {
          auth: tokenRequest.auth,
          headers: tokenRequest.headers
        });

        this.accessToken = response.data.access_token;
        this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1分前に期限切れとする

        logger.info('Zoom OAuth access token obtained successfully');
        logger.info(`Token expires in: ${response.data.expires_in} seconds`);
        return this.accessToken;
      } else {
        // フォールバック: 既存のJWT認証
        logger.warn('Using legacy JWT authentication. Consider upgrading to OAuth.');
        logger.warn(`OAuth config - useOAuth: ${config.zoom.useOAuth}, clientId: ${!!this.clientId}, clientSecret: ${!!this.clientSecret}`);
        return this.generateJWT();
      }
    } catch (error) {
      logger.error('Failed to get Zoom access token:', error.response?.data || error.message);
      logger.error('HTTP Status:', error.response?.status);
      logger.error('Response Headers:', error.response?.headers);
      logger.error('Full Error Response:', JSON.stringify(error.response?.data, null, 2));
      logger.error('Request details:', {
        url: 'https://zoom.us/oauth/token',
        accountId: this.accountId,
        clientIdSet: !!this.clientId,
        clientSecretSet: !!this.clientSecret,
        requestMethod: 'POST',
        contentType: 'application/x-www-form-urlencoded'
      });
      
      // 400エラーの詳細分析
      if (error.response?.status === 400) {
        logger.error('400 Bad Request - 考えられる原因:');
        logger.error('1. grant_type パラメータが無効');
        logger.error('2. account_id が無効');
        logger.error('3. Client ID/Secret の組み合わせが無効');
        logger.error('4. Zoom Appの設定（Server-to-Server OAuth）が無効');
      }
      
      throw error;
    }
  }

  /**
   * API リクエストのヘッダーを作成
   */
  async getAuthHeaders() {
    const token = await this.getAccessToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 全録画一覧を取得
   */
  async getAllRecordings(fromDate, toDate) {
    try {
      const headers = await this.getAuthHeaders();
      const params = {
        from: fromDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        to: toDate || new Date().toISOString().split('T')[0],
        page_size: 100
      };

      // Server-to-Server OAuth用のエンドポイント
      // 参考: https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/listAllRecordings
      const response = await axios.get(`${this.baseUrl}/users/me/recordings`, {
        headers,
        params
      });

      logger.info(`Retrieved ${response.data.meetings?.length || 0} recordings`);
      return response.data.meetings || [];
    } catch (error) {
      logger.error('Failed to get recordings:', error.response?.data || error.message);
      logger.error('HTTP Status:', error.response?.status);
      logger.error('Request URL:', `${this.baseUrl}/users/me/recordings`);
      logger.error('Request params:', { fromDate, toDate });
      throw error;
    }
  }

  /**
   * 特定のミーティングの録画を取得
   */
  async getMeetingRecordings(meetingId) {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await axios.get(`${this.baseUrl}/meetings/${meetingId}/recordings`, {
        headers
      });

      return response.data;
    } catch (error) {
      logger.error(`Failed to get recordings for meeting ${meetingId}:`, error.response?.data || error.message);
      throw error;
    }
  }


  /**
   * 新しい録画を監視
   */
  async monitorNewRecordings(lastCheckDate) {
    try {
      const recordings = await this.getAllRecordings(lastCheckDate);
      const newRecordings = [];

      for (const meeting of recordings) {
        const recordingStart = new Date(meeting.start_time);
        const lastCheck = new Date(lastCheckDate);

        if (recordingStart > lastCheck) {
          // 録画ファイルの詳細を取得
          const recordingDetails = await this.getMeetingRecordings(meeting.uuid);
          
          const processableFiles = recordingDetails.recording_files?.filter(file => 
            file.file_type === 'MP4' || file.file_type === 'M4A'
          );

          if (processableFiles && processableFiles.length > 0) {
            newRecordings.push({
              meetingId: meeting.id,
              uuid: meeting.uuid,
              topic: meeting.topic,
              startTime: meeting.start_time,
              duration: meeting.duration,
              hostName: meeting.host_email,
              participants: recordingDetails.participant_audio_files || [],
              recordingFiles: processableFiles.map(file => ({
                id: file.id,
                downloadUrl: file.download_url,
                fileType: file.file_type,
                fileSize: file.file_size,
                recordingType: file.recording_type
              }))
            });
          }
        }
      }

      logger.info(`Found ${newRecordings.length} new recordings`);
      return newRecordings;
    } catch (error) {
      logger.error('Failed to monitor new recordings:', error.message);
      throw error;
    }
  }

  /**
   * 録画ファイル（音声・動画）をダウンロード
   */
  async downloadRecording(recording) {
    try {
      const fs = require('fs').promises;
      const fsSync = require('fs');
      const path = require('path');
      
      try {
        await fs.mkdir(config.recording.downloadPath, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }

      // 音声ファイルを優先してダウンロード
      const audioFile = recording.recordingFiles.find(file => 
        file.fileType === 'M4A' || file.recordingType === 'audio_only'
      );
      
      // 動画ファイルを検索（Slack共有とGoogle Drive保存用）
      const videoFile = recording.recordingFiles.find(file => 
        file.fileType === 'MP4' && (file.recordingType === 'shared_screen_with_speaker_view' || file.recordingType === 'speaker_view')
      );

      if (!audioFile && !videoFile) {
        throw new Error('No suitable audio or video file found for processing');
      }

      let audioFilePath = null;
      let videoFilePath = null;

      // 音声ファイルのダウンロード（文字起こし用）
      if (audioFile) {
        const audioFileName = `${recording.meetingId}_${audioFile.id}.${audioFile.fileType.toLowerCase()}`;
        audioFilePath = path.join(config.recording.downloadPath, audioFileName);
        await this.downloadRecordingFile(audioFile.downloadUrl, audioFilePath);
        logger.info(`Audio file downloaded: ${audioFileName}`);
      }

      // 動画ファイルのダウンロード（Google Drive保存用）
      if (videoFile) {
        const videoFileName = `${recording.meetingId}_${videoFile.id}.${videoFile.fileType.toLowerCase()}`;
        videoFilePath = path.join(config.recording.downloadPath, videoFileName);
        await this.downloadRecordingFile(videoFile.downloadUrl, videoFilePath);
        logger.info(`Video file downloaded: ${videoFileName}`);
      }

      // 音声ファイルがない場合は動画ファイルを音声ファイルとしても使用
      if (!audioFilePath && videoFilePath) {
        audioFilePath = videoFilePath;
      }

      return {
        audioFilePath: audioFilePath,
        videoFilePath: videoFilePath,
        meetingInfo: {
          id: recording.meetingId,
          topic: recording.topic,
          startTime: recording.startTime,
          duration: recording.duration,
          hostName: recording.hostName,
          participantCount: recording.participants?.length || 0,
          originalFileName: videoFile?.fileType || audioFile?.fileType
        }
      };
    } catch (error) {
      logger.error('Failed to download recording:', error.message);
      throw error;
    }
  }

  /**
   * 個別録画ファイルをダウンロード
   */
  async downloadRecordingFile(downloadUrl, filePath) {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await axios({
        method: 'GET',
        url: downloadUrl,
        headers,
        responseType: 'stream'
      });

      const fs = require('fs').promises;
      const fsSync = require('fs');
      const writer = fs.createWriteStream(filePath);
      
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          logger.fileOperation('download', filePath, true, 0);
          resolve(filePath);
        });
        writer.on('error', reject);
      });
    } catch (error) {
      logger.error('Failed to download recording file:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * ファイルをメモリバッファとしてダウンロード (Vercel対応)
   * @param {string} downloadUrl - ダウンロードURL
   * @returns {Promise<Buffer>} ファイルバッファ
   */
  async downloadFileAsBuffer(downloadUrl) {
    try {
      const headers = await this.getAuthHeaders();
      
      logger.info(`ファイルバッファダウンロード開始: ${downloadUrl}`);
      
      const response = await axios({
        method: 'GET',
        url: downloadUrl,
        headers,
        responseType: 'arraybuffer', // バイナリデータとして取得
        timeout: 120000 // 2分タイムアウト
      });
      
      const buffer = Buffer.from(response.data);
      logger.info(`ファイルバッファダウンロード完了: ${Math.round(buffer.length / 1024 / 1024)}MB`);
      
      return buffer;
      
    } catch (error) {
      logger.error('ファイルバッファダウンロード失敗:', error.response?.data || error.message);
      
      if (error.code === 'ECONNABORTED') {
        throw new Error('ファイルダウンロードタイムアウト');
      }
      
      throw error;
    }
  }

  /**
   * 録画の文字起こし用音声を取得（下位互換性のため残す）
   * @deprecated downloadRecording を使用してください
   */
  async getTranscribableAudio(recording) {
    logger.warn('getTranscribableAudio is deprecated. Use downloadRecording instead.');
    const result = await this.downloadRecording(recording);
    return {
      filePath: result.audioFilePath,
      fileType: 'audio',
      meetingInfo: result.meetingInfo
    };
  }

  /**
   * 録画ファイルを削除
   * @param {string} meetingUuid - 会議UUID
   * @param {string} recordingId - 録画ファイルID（省略時は会議の全録画削除）
   * @returns {Promise<Object>} 削除結果
   */
  async deleteRecording(meetingUuid, recordingId = null) {
    try {
      const headers = await this.getAuthHeaders();
      
      // 特定の録画ファイルを削除 or 会議の全録画を削除
      const deleteUrl = recordingId 
        ? `${this.baseUrl}/meetings/${meetingUuid}/recordings/${recordingId}`
        : `${this.baseUrl}/meetings/${meetingUuid}/recordings`;
      
      const response = await axios.delete(deleteUrl, { headers });
      
      logger.info(`Recording deleted successfully: ${meetingUuid}${recordingId ? `/${recordingId}` : ' (all files)'}`);
      
      return {
        success: true,
        meetingUuid: meetingUuid,
        recordingId: recordingId,
        deletedAt: new Date().toISOString(),
        message: 'Recording deleted successfully'
      };
      
    } catch (error) {
      logger.error(`Failed to delete recording ${meetingUuid}:`, error.message);
      
      return {
        success: false,
        meetingUuid: meetingUuid,
        recordingId: recordingId,
        error: error.message,
        errorCode: error.response?.status,
        message: 'Recording deletion failed'
      };
    }
  }

  /**
   * 会議の全録画ファイルを削除（安全な削除処理）
   * @param {Object} meetingInfo - 会議情報
   * @returns {Promise<Object>} 削除結果
   */
  async deleteMeetingRecordings(meetingInfo) {
    try {
      // テスト環境での削除スキップ確認
      if (config.productionTest.skipRecordingDeletion) {
        logger.info(`Recording deletion skipped (SKIP_RECORDING_DELETION=true): ${meetingInfo.topic}`);
        return {
          success: true,
          skipped: true,
          meetingUuid: meetingInfo.uuid,
          meetingTopic: meetingInfo.topic,
          reason: 'Deletion skipped by configuration',
          message: 'Recording deletion skipped for safety'
        };
      }

      logger.info(`Deleting recordings for meeting: ${meetingInfo.topic} (${meetingInfo.uuid})`);
      
      const deleteResult = await this.deleteRecording(meetingInfo.uuid);
      
      if (deleteResult.success) {
        logger.info(`Successfully deleted all recordings for meeting: ${meetingInfo.topic}`);
      } else {
        logger.error(`Failed to delete recordings for meeting: ${meetingInfo.topic} - ${deleteResult.error}`);
      }
      
      return {
        ...deleteResult,
        meetingTopic: meetingInfo.topic,
        meetingId: meetingInfo.meetingId
      };
      
    } catch (error) {
      logger.error(`Error in deleteMeetingRecordings for ${meetingInfo.topic}:`, error.message);
      
      return {
        success: false,
        meetingUuid: meetingInfo.uuid,
        meetingTopic: meetingInfo.topic,
        error: error.message,
        message: 'Recording deletion process failed'
      };
    }
  }

  /**
   * ヘルスチェック
   */
  async healthCheck() {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.get(`${this.baseUrl}/users/me`, { headers });
      return { status: 'healthy', user: response.data.email };
    } catch (error) {
      logger.error('Zoom API health check failed:', error.message);
      return { status: 'unhealthy', error: error.message };
    }
  }
}

module.exports = ZoomService;