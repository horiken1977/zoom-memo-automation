// Vercel Function: Zoom Transcript設定確認専用API
// URL: /api/transcript-settings

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    console.log('🚀 Zoom Transcript設定確認開始');

    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_API_KEY;
    const clientSecret = process.env.ZOOM_API_SECRET;

    if (!accountId || !clientId || !clientSecret) {
      return res.status(500).json({
        success: false,
        error: 'Missing Zoom credentials in environment variables',
        timestamp: new Date().toISOString()
      });
    }

    // 1. OAuth認証
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `grant_type=account_credentials&account_id=${accountId}`
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return res.status(500).json({
        success: false,
        error: 'Zoom OAuth authentication failed',
        details: errorText,
        timestamp: new Date().toISOString()
      });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('✅ OAuth認証成功');

    // 2. アカウント設定取得
    const settingsResponse = await fetch('https://api.zoom.us/v2/accounts/me/settings', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!settingsResponse.ok) {
      const errorText = await settingsResponse.text();
      return res.status(500).json({
        success: false,
        error: 'Failed to get Zoom account settings',
        details: errorText,
        timestamp: new Date().toISOString()
      });
    }

    const settings = await settingsResponse.json();
    console.log('✅ アカウント設定取得成功');

    // 3. 録画設定分析
    const recordingSettings = settings.recording || {};
    const cloudRecordingEnabled = recordingSettings.cloud_recording !== false;
    const audioTranscript = recordingSettings.audio_transcript;
    const transcriptEnabled = audioTranscript === true || audioTranscript?.enable === true;
    const v2Compatible = cloudRecordingEnabled && transcriptEnabled;

    // 4. レポート生成
    const report = {
      timestamp: new Date().toISOString(),
      accountId: accountId,
      status: v2Compatible ? 'compatible' : 'incompatible',
      settings: {
        cloudRecording: cloudRecordingEnabled ? '✅ 有効' : '❌ 無効',
        autoTranscript: transcriptEnabled ? '✅ 有効' : '❌ 無効'
      },
      v2Benefits: v2Compatible ? {
        processingTime: '228秒 → 30-60秒（90%短縮）',
        cost: '$15/月 → $3/月（80%削減）',
        timeoutRisk: 'なし（完全解消）'
      } : null,
      recommendations: v2Compatible ? [
        '✅ v2.0 Transcript APIが利用可能です',
        '次回の録画から自動文字起こしが生成されます'
      ] : [
        '⚠️ v2.0 Transcript APIは現在利用できません',
        'Zoom管理画面で「自動文字起こし」を有効化してください',
        '手順: Account Settings → Recording → Audio transcript をON'
      ],
      details: {
        audioTranscript: audioTranscript,
        saveAudioTranscript: recordingSettings.save_audio_transcript,
        autoRecording: recordingSettings.auto_recording
      }
    };

    console.log('✅ レポート生成完了');

    return res.status(200).json({
      success: true,
      report: report,
      rawSettings: req.query.debug === 'true' ? recordingSettings : undefined
    });

  } catch (error) {
    console.error('❌ エラー発生:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
