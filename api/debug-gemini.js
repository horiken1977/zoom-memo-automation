// Gemini API デバッグ用API
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../1.src/config');

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    console.log('🔍 Gemini API デバッグ開始');
    
    const results = {};
    
    // 1. 環境変数チェック
    results.environment = {
      apiKey: process.env.GOOGLE_AI_API_KEY ? 'あり' : 'なし',
      model: config.googleAI.model,
      fallbackModels: config.googleAI.fallbackModels
    };
    
    // 2. GoogleGenerativeAI インスタンス作成
    const genAI = new GoogleGenerativeAI(config.googleAI.apiKey);
    results.instance = 'created';
    
    // 3. モデルリスト取得テスト
    try {
      console.log('📋 利用可能モデル取得中...');
      const models = await genAI.listModels();
      results.availableModels = models.map(model => ({
        name: model.name.replace('models/', ''),
        displayName: model.displayName,
        supportedGenerationMethods: model.supportedGenerationMethods
      }));
      console.log(`✅ ${results.availableModels.length}個のモデルを取得`);
    } catch (listError) {
      console.error('❌ モデルリスト取得エラー:', listError);
      results.availableModels = `エラー: ${listError.message}`;
    }
    
    // 4. 各モデルでのテスト
    const testModels = ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    results.modelTests = {};
    
    for (const modelName of testModels) {
      try {
        console.log(`🧪 ${modelName} テスト中...`);
        
        const model = genAI.getGenerativeModel({ model: modelName });
        
        // 短いプロンプトではなく、より詳細なプロンプトでテスト
        const testPrompt = "こんにちは。今日の天気について簡単に教えてください。";  
        const result = await model.generateContent(testPrompt);
        const response = result.response;
        
        results.modelTests[modelName] = {
          status: 'success',
          response: response.text().substring(0, 200) + '...',
          responseLength: response.text().length
        };
        
        console.log(`✅ ${modelName} テスト成功`);
        
      } catch (modelError) {
        console.error(`❌ ${modelName} テストエラー:`, modelError);
        results.modelTests[modelName] = {
          status: 'error',
          error: modelError.message,
          statusCode: modelError.status || 'unknown',
          details: modelError.details || 'no details'
        };
      }
    }
    
    // 5. 文字起こし形式のテスト（音声なしでテキストのみ）
    try {
      console.log('📝 文字起こし形式プロンプトテスト');
      
      // 動作するモデルを見つける
      let workingModel = null;
      for (const [modelName, testResult] of Object.entries(results.modelTests)) {
        if (testResult.status === 'success') {
          workingModel = genAI.getGenerativeModel({ model: modelName });
          results.workingModel = modelName;
          break;
        }
      }
      
      if (workingModel) {
        const transcriptionPrompt = `以下のサンプル会議内容を文字起こし形式で整理してください：

会議情報:
- タイトル: 1on1ミーティング
- 開催日時: 2025-08-05
- 時間: 30分
- 主催者: テストユーザー

サンプル内容:
"こんにちは、お疲れ様です。今日は30分程度で進捗の確認をしたいと思います。プロジェクトの状況はいかがですか？"

出力形式で整理してください。`;

        const transcriptionResult = await workingModel.generateContent(transcriptionPrompt);
        results.transcriptionTest = {
          status: 'success',
          response: transcriptionResult.response.text().substring(0, 500) + '...'
        };
        
      } else {
        results.transcriptionTest = {
          status: 'skipped',
          reason: '動作するモデルが見つからない'
        };
      }
      
    } catch (transcriptionError) {
      console.error('❌ 文字起こしテストエラー:', transcriptionError);
      results.transcriptionTest = {
        status: 'error',
        error: transcriptionError.message
      };
    }
    
    console.log('🎉 Gemini API デバッグ完了');
    
    return res.status(200).json({
      status: 'success',
      message: 'Gemini API デバッグ完了',
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ デバッグ処理エラー:', error);
    
    return res.status(500).json({
      status: 'error',
      message: 'デバッグ処理でエラーが発生',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}