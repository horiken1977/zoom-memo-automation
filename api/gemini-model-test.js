// Test the latest Gemini models with new API key
const { GoogleGenerativeAI } = require('@google/generative-ai');

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const results = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    api_key_info: {
      exists: !!process.env.GOOGLE_AI_API_KEY,
      length: process.env.GOOGLE_AI_API_KEY ? process.env.GOOGLE_AI_API_KEY.length : 0,
      prefix: process.env.GOOGLE_AI_API_KEY ? process.env.GOOGLE_AI_API_KEY.substring(0, 10) + '...' : 'NOT_SET'
    },
    model_tests: []
  };

  try {
    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(400).json({
        ...results,
        error: 'Google AI API key not found'
      });
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

    // Test current available models (as of 2025)
    const modelsToTest = [
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest', 
      'gemini-1.5-pro',
      'gemini-1.5-pro-latest',
      'gemini-pro',
      'gemini-pro-vision'
    ];

    let workingModel = null;
    let successCount = 0;

    for (const modelName of modelsToTest) {
      const testResult = {
        model: modelName,
        timestamp: new Date().toISOString()
      };

      try {
        console.log(`Testing model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const prompt = 'Hello! Please respond with exactly "API test successful" to confirm this model is working.';
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        testResult.status = 'success';
        testResult.response = text.trim();
        testResult.response_length = text.length;
        
        if (!workingModel) {
          workingModel = modelName;
        }
        successCount++;

        console.log(`✅ ${modelName}: Success`);

      } catch (error) {
        testResult.status = 'error';
        testResult.error = error.message;
        testResult.error_code = error.status || 'unknown';
        
        console.log(`❌ ${modelName}: ${error.message}`);
      }

      results.model_tests.push(testResult);
    }

    // Try to list models if possible
    try {
      console.log('Attempting to list available models...');
      const models = await genAI.listModels();
      results.available_models = {
        status: 'success',
        count: models.length,
        models: models.map(model => ({
          name: model.name.replace('models/', ''),
          displayName: model.displayName,
          description: model.description
        }))
      };
      console.log(`✅ Found ${models.length} available models`);
    } catch (error) {
      results.available_models = {
        status: 'error',
        error: error.message
      };
      console.log(`❌ List models failed: ${error.message}`);
    }

    // Summary
    results.summary = {
      total_models_tested: modelsToTest.length,
      successful_models: successCount,
      failed_models: modelsToTest.length - successCount,
      success_rate: `${((successCount / modelsToTest.length) * 100).toFixed(1)}%`,
      working_model: workingModel,
      overall_status: successCount > 0 ? 'success' : 'failure'
    };

    const statusCode = successCount > 0 ? 200 : 500;
    const message = workingModel ? 
      `✅ Google AI API working! Best model: ${workingModel}` : 
      '❌ No working Google AI models found';

    return res.status(statusCode).json({
      ...results,
      status: results.summary.overall_status,
      message: message
    });

  } catch (error) {
    console.error('Gemini model test error:', error);
    return res.status(500).json({
      ...results,
      status: 'error',
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 5)
    });
  }
}