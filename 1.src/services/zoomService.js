const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

class ZoomService {
  constructor() {
    this.baseUrl = config.zoom.baseUrl;
    this.accountId = config.zoom.accountId;
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
        return this.accessToken;
      }

      const response = await axios.post('https://zoom.us/oauth/token', null, {
        params: {
          grant_type: 'account_credentials',
          account_id: this.accountId
        },
        auth: {
          username: this.apiKey,
          password: this.apiSecret
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1分前に期限切れとする

      logger.info('Zoom access token obtained successfully');
      return this.accessToken;
    } catch (error) {
      logger.error('Failed to get Zoom access token:', error.response?.data || error.message);
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

      const response = await axios.get(`${this.baseUrl}/accounts/${this.accountId}/recordings`, {
        headers,
        params
      });

      logger.info(`Retrieved ${response.data.meetings?.length || 0} recordings`);
      return response.data.meetings || [];
    } catch (error) {
      logger.error('Failed to get recordings:', error.response?.data || error.message);
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
      const fs = require('fs-extra');
      const path = require('path');
      
      await fs.ensureDir(config.recording.downloadPath);

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

      const fs = require('fs-extra');
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