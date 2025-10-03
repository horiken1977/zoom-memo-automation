// Vercel Function for production health check and API testing
const { GoogleGenerativeAI } = require('@google/generative-ai');
const GoogleDriveService = require('../1.src/services/googleDriveService');
const config = require('../1.src/config');

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Transcript設定確認モード (v2.0 Transcript API compatibility check)
  if (req.query.mode === 'transcript') {
    console.log('🔍 Transcript mode activated');
    return await handleTranscriptCheck(req, res);
  }

  const testResults = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    vercel_region: process.env.VERCEL_REGION || 'unknown',
    tests: {}
  };

  console.log('🧪 Starting production API health check...');

  try {
    // Test 1: Environment Variables Check
    console.log('1️⃣ Checking environment variables...');
    const envCheck = {
      ZOOM_API_KEY: !!process.env.ZOOM_API_KEY,
      ZOOM_API_SECRET: !!process.env.ZOOM_API_SECRET,
      ZOOM_ACCOUNT_ID: !!process.env.ZOOM_ACCOUNT_ID,
      GOOGLE_AI_API_KEY: !!process.env.GOOGLE_AI_API_KEY,
      SLACK_BOT_TOKEN: !!process.env.SLACK_BOT_TOKEN,
      SLACK_CHANNEL_ID: !!process.env.SLACK_CHANNEL_ID,
      SLACK_SIGNING_SECRET: !!process.env.SLACK_SIGNING_SECRET,
      GOOGLE_DRIVE_CREDENTIALS: !!process.env.GOOGLE_DRIVE_CREDENTIALS,
      GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY: !!process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY
    };

    const allEnvSet = Object.values(envCheck).every(check => check === true);
    testResults.tests.environment = {
      status: allEnvSet ? 'success' : 'error',
      message: allEnvSet ? '✅ All environment variables set' : '❌ Missing environment variables',
      checks: envCheck
    };

    // Test 2: Zoom API Connection
    console.log('2️⃣ Testing Zoom API connection...');
    try {
      if (!process.env.ZOOM_API_KEY || !process.env.ZOOM_API_SECRET || !process.env.ZOOM_ACCOUNT_ID) {
        throw new Error('Missing Zoom API credentials');
      }

      const credentials = Buffer.from(`${process.env.ZOOM_API_KEY}:${process.env.ZOOM_API_SECRET}`).toString('base64');
      
      const tokenResponse = await fetch('https://zoom.us/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`
      });

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        testResults.tests.zoom = {
          status: 'success',
          message: '✅ Zoom API authentication successful',
          token_type: tokenData.token_type,
          expires_in: tokenData.expires_in
        };
        console.log('   ✅ Zoom API connection successful');
      } else {
        const errorText = await tokenResponse.text();
        testResults.tests.zoom = {
          status: 'error',
          message: '❌ Zoom API authentication failed',
          status_code: tokenResponse.status,
          error: errorText
        };
        console.log('   ❌ Zoom API connection failed:', tokenResponse.status);
      }
    } catch (error) {
      testResults.tests.zoom = {
        status: 'error',
        message: '❌ Zoom API connection error',
        error: error.message
      };
      console.log('   ❌ Zoom API error:', error.message);
    }

    // Test 3: Google AI API Connection
    console.log('3️⃣ Testing Google AI API connection...');
    try {
      if (!process.env.GOOGLE_AI_API_KEY) {
        throw new Error('Missing Google AI API key');
      }

      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
      
      // Auto-select best available model
      let model;
      let selectedModel;
      
      try {
        // Try to list available models first
        const models = await genAI.listModels();
        const availableModels = models.map(model => model.name.replace('models/', ''));
        
        // Preferred models in order of preference (Gemini 2.x priority)
        const preferredModels = [
          'gemini-2.5-pro',
          'gemini-2.0-flash',
          'gemini-1.5-flash',
          'gemini-1.5-pro-latest',
          'gemini-1.5-pro',
          'gemini-pro-latest', 
          'gemini-pro',
          'gemini-1.0-pro-latest',
          'gemini-1.0-pro'
        ];

        for (const preferredModel of preferredModels) {
          if (availableModels.includes(preferredModel)) {
            selectedModel = preferredModel;
            break;
          }
        }

        if (!selectedModel && availableModels.length > 0) {
          selectedModel = availableModels[0];
        }
      } catch (listError) {
        // Fallback to predefined models if listing fails (Gemini 2.x priority)
        const fallbackModels = ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
        
        for (const fallbackModel of fallbackModels) {
          try {
            const testModel = genAI.getGenerativeModel({ model: fallbackModel });
            await testModel.generateContent('test');
            selectedModel = fallbackModel;
            break;
          } catch (error) {
            continue;
          }
        }
      }

      if (!selectedModel) {
        throw new Error('No available Gemini model found');
      }

      model = genAI.getGenerativeModel({ model: selectedModel });
      
      const testPrompt = "Hello! Please respond with exactly: 'Google AI API connection test successful'";
      const result = await model.generateContent(testPrompt);
      const response = await result.response;
      const text = response.text();

      testResults.tests.google_ai = {
        status: 'success',
        message: '✅ Google AI API connection successful',
        selected_model: selectedModel,
        test_response: text.trim(),
        response_length: text.length
      };
      console.log('   ✅ Google AI API connection successful');
    } catch (error) {
      testResults.tests.google_ai = {
        status: 'error',
        message: '❌ Google AI API connection failed',
        error: error.message
      };
      console.log('   ❌ Google AI API error:', error.message);
    }

    // Test 4: Slack API Connection
    console.log('4️⃣ Testing Slack API connection...');
    try {
      if (!process.env.SLACK_BOT_TOKEN) {
        throw new Error('Missing Slack bot token');
      }

      const slackResponse = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      const slackData = await slackResponse.json();
      
      if (slackData.ok) {
        testResults.tests.slack = {
          status: 'success',
          message: '✅ Slack API connection successful',
          user: slackData.user,
          team: slackData.team,
          url: slackData.url
        };
        console.log('   ✅ Slack API connection successful');
      } else {
        testResults.tests.slack = {
          status: 'error',
          message: '❌ Slack API authentication failed',
          error: slackData.error
        };
        console.log('   ❌ Slack API authentication failed:', slackData.error);
      }
    } catch (error) {
      testResults.tests.slack = {
        status: 'error',
        message: '❌ Slack API connection error',
        error: error.message
      };
      console.log('   ❌ Slack API error:', error.message);
    }

    // Test 5: Google Drive API Connection
    console.log('5️⃣ Testing Google Drive API connection...');
    try {
      const googleDriveService = new GoogleDriveService();
      const driveResult = await googleDriveService.healthCheck();

      if (driveResult.status === 'healthy') {
        // テスト用フォルダアクセス確認
        const testFolderId = config.googleDrive.recordingsFolder;
        try {
          const folderInfo = await googleDriveService.drive.files.get({
            fileId: testFolderId,
            fields: 'id, name, mimeType, webViewLink, owners, permissions',
            supportsAllDrives: true
          });
          
          testResults.tests.google_drive = {
            status: 'success',
            message: '✅ Google Drive API connection successful',
            user: driveResult.user || 'Service Account',
            storage: driveResult.storageQuota || 'Unknown',
            testFolder: {
              id: folderInfo.data.id,
              name: folderInfo.data.name,
              accessible: true
            }
          };
          console.log('   ✅ Google Drive API connection and folder access successful');
        } catch (folderError) {
          testResults.tests.google_drive = {
            status: 'partial_success',
            message: '✅ Google Drive API connected, ❌ Test folder access failed',
            user: driveResult.user || 'Service Account', 
            storage: driveResult.storageQuota || 'Unknown',
            testFolder: {
              id: testFolderId,
              name: 'Access Failed',
              accessible: false,
              error: folderError.message
            }
          };
          console.log('   ⚠️ Google Drive API connected but folder access failed:', folderError.message);
          
          // フォルダ一覧を確認
          try {
            const fileList = await googleDriveService.drive.files.list({
              q: "mimeType='application/vnd.google-apps.folder'",
              fields: 'files(id, name)',
              pageSize: 10,
              supportsAllDrives: true,
              includeItemsFromAllDrives: true
            });
            console.log('   📁 Accessible folders:', fileList.data.files.map(f => `${f.name} (${f.id})`).join(', '));
          } catch (listError) {
            console.log('   ❌ Failed to list folders:', listError.message);
          }
        }
      } else {
        testResults.tests.google_drive = {
          status: 'error',
          message: '❌ Google Drive API connection failed',
          error: driveResult.error
        };
        console.log('   ❌ Google Drive API connection failed:', driveResult.error);
      }
    } catch (error) {
      testResults.tests.google_drive = {
        status: 'error',
        message: '❌ Google Drive API connection error',
        error: error.message
      };
      console.log('   ❌ Google Drive API error:', error.message);
    }

    // Calculate overall status
    const apiTests = [testResults.tests.zoom, testResults.tests.google_ai, testResults.tests.slack, testResults.tests.google_drive];
    const successfulTests = apiTests.filter(test => test.status === 'success').length;
    const totalTests = apiTests.length + 1; // +1 for environment test

    testResults.summary = {
      overall_status: allEnvSet && successfulTests === apiTests.length ? 'success' : 'partial_failure',
      total_tests: totalTests,
      successful_tests: successfulTests + (allEnvSet ? 1 : 0),
      failed_tests: totalTests - (successfulTests + (allEnvSet ? 1 : 0)),
      success_rate: `${(((successfulTests + (allEnvSet ? 1 : 0)) / totalTests) * 100).toFixed(1)}%`
    };

    console.log('🏁 Health check completed:', testResults.summary);

    // Return appropriate status code
    const statusCode = testResults.summary.overall_status === 'success' ? 200 : 
                      testResults.summary.successful_tests > 0 ? 206 : 500;

    res.status(statusCode).json(testResults);

  } catch (error) {
    console.error('❌ Health check failed:', error);
    
    testResults.summary = {
      overall_status: 'error',
      message: '❌ Health check execution failed',
      error: error.message
    };

    res.status(500).json(testResults);
  }
}

// Transcript設定確認ハンドラー
async function handleTranscriptCheck(req, res) {
  try {
    console.log('🚀 Zoom自動文字起こし設定確認開始');

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