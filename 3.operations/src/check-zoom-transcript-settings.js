/**
 * Zoom自動文字起こし設定確認スクリプト
 *
 * 目的: Zoomアカウントの文字起こし設定を確認し、v2.0 Transcript API利用の可否を判定
 * 作成日: 2025-10-02
 */

const axios = require('axios');
const config = require('../../1.src/config');

class ZoomSettingsChecker {
  constructor() {
    this.accountId = config.zoom.accountId;
    this.clientId = config.zoom.clientId;
    this.clientSecret = config.zoom.clientSecret;
    this.accessToken = null;
  }

  /**
   * OAuth Server-to-Server認証でアクセストークンを取得
   */
  async getAccessToken() {
    try {
      console.log('🔐 Zoom OAuth認証開始...');

      const response = await axios.post(
        'https://zoom.us/oauth/token',
        new URLSearchParams({
          grant_type: 'account_credentials',
          account_id: this.accountId
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
          }
        }
      );

      this.accessToken = response.data.access_token;
      console.log('✅ OAuth認証成功\n');
      return this.accessToken;

    } catch (error) {
      console.error('❌ OAuth認証失敗:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * アカウント設定を取得
   */
  async getAccountSettings() {
    try {
      console.log('📋 アカウント設定取得中...');

      const response = await axios.get(
        'https://api.zoom.us/v2/accounts/me/settings',
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;

    } catch (error) {
      console.error('❌ アカウント設定取得失敗:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 録画設定を取得
   */
  async getRecordingSettings() {
    try {
      console.log('🎥 録画設定取得中...');

      const response = await axios.get(
        'https://api.zoom.us/v2/accounts/me/settings',
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            option: 'recording'
          }
        }
      );

      return response.data;

    } catch (error) {
      console.error('❌ 録画設定取得失敗:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 文字起こし設定を分析
   */
  analyzeTranscriptSettings(settings) {
    console.log('\n📊 ===== 文字起こし設定分析結果 =====\n');

    const recordingSettings = settings.recording || {};

    // クラウド録画が有効か
    const cloudRecordingEnabled = recordingSettings.cloud_recording !== false;
    console.log(`クラウド録画: ${cloudRecordingEnabled ? '✅ 有効' : '❌ 無効'}`);

    // 自動文字起こし設定確認
    const audioTranscript = recordingSettings.audio_transcript;
    const transcriptEnabled = audioTranscript === true || audioTranscript?.enable === true;

    console.log(`自動文字起こし: ${transcriptEnabled ? '✅ 有効' : '❌ 無効'}`);

    if (typeof audioTranscript === 'object') {
      console.log('  詳細設定:');
      console.log(`    - 有効化: ${audioTranscript.enable ? 'はい' : 'いいえ'}`);
      console.log(`    - ロック: ${audioTranscript.locked ? 'はい（変更不可）' : 'いいえ（変更可能）'}`);
    }

    // その他の関連設定
    if (recordingSettings.save_audio_transcript !== undefined) {
      console.log(`文字起こし保存: ${recordingSettings.save_audio_transcript ? '✅ 有効' : '❌ 無効'}`);
    }

    if (recordingSettings.auto_recording !== undefined) {
      console.log(`自動録画: ${recordingSettings.auto_recording}`);
    }

    console.log('\n===================================\n');

    return {
      cloudRecordingEnabled,
      transcriptEnabled,
      v2Compatible: cloudRecordingEnabled && transcriptEnabled
    };
  }

  /**
   * v2.0互換性レポート
   */
  printV2CompatibilityReport(analysis) {
    console.log('🎯 ===== v2.0 Transcript API 互換性 =====\n');

    if (analysis.v2Compatible) {
      console.log('✅ **v2.0 Transcript APIが利用可能です**');
      console.log('   次回の録画から自動文字起こしが生成されます。');
      console.log('   期待される効果:');
      console.log('   - 処理時間: 228秒 → 30-60秒（90%短縮）');
      console.log('   - コスト: $15/月 → $3/月（80%削減）');
    } else {
      console.log('⚠️  **v2.0 Transcript APIは現在利用できません**');
      console.log('   フォールバック機構により従来の音声処理が実行されます。');
      console.log('\n📝 有効化の手順:');
      console.log('   1. Zoom Web Portal (https://zoom.us) にログイン');
      console.log('   2. Account Management → Account Settings');
      console.log('   3. Recording タブを選択');
      console.log('   4. "Cloud recording" をONに設定');
      console.log('   5. Advanced cloud recording settings を展開');
      console.log('   6. "Audio transcript" または "Create audio transcript" をONに設定');
      console.log('   7. 保存');
    }

    console.log('\n==========================================\n');
  }

  /**
   * メイン実行
   */
  async run() {
    try {
      console.log('🚀 Zoom自動文字起こし設定確認スクリプト開始\n');
      console.log(`アカウントID: ${this.accountId}\n`);

      // 1. 認証
      await this.getAccessToken();

      // 2. 設定取得
      const settings = await this.getAccountSettings();
      console.log('✅ アカウント設定取得成功\n');

      // 3. 録画設定取得（詳細）
      let recordingSettings;
      try {
        recordingSettings = await this.getRecordingSettings();
        console.log('✅ 録画設定取得成功\n');
      } catch (error) {
        console.log('⚠️  録画設定詳細取得失敗（基本設定のみで分析します）\n');
        recordingSettings = settings;
      }

      // 4. 分析
      const analysis = this.analyzeTranscriptSettings(recordingSettings);

      // 5. レポート出力
      this.printV2CompatibilityReport(analysis);

      // 6. 詳細JSON出力（デバッグ用）
      console.log('📄 詳細設定（JSON）:');
      console.log(JSON.stringify(recordingSettings.recording, null, 2));

      console.log('\n✅ 確認完了');
      return analysis;

    } catch (error) {
      console.error('\n❌ エラーが発生しました:', error.message);
      throw error;
    }
  }
}

// スクリプト実行
if (require.main === module) {
  const checker = new ZoomSettingsChecker();
  checker.run()
    .then(analysis => {
      process.exit(analysis.v2Compatible ? 0 : 1);
    })
    .catch(error => {
      console.error('実行エラー:', error);
      process.exit(2);
    });
}

module.exports = ZoomSettingsChecker;
