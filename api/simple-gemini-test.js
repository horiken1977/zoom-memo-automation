// Minimal Google AI API test to isolate the problem
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
    tests: []
  };

  try {
    // Test 1: Check API key
    results.tests.push({
      test: 'API Key Check',
      api_key_exists: !!process.env.GOOGLE_AI_API_KEY,
      api_key_length: process.env.GOOGLE_AI_API_KEY ? process.env.GOOGLE_AI_API_KEY.length : 0
    });

    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(400).json({
        ...results,
        error: 'Google AI API key not found'
      });
    }

    // Test 2: Initialize client
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    results.tests.push({
      test: 'Client Initialization',
      status: 'success'
    });

    // Test 3: Try different models one by one
    const modelsToTest = [
      'gemini-pro',
      'gemini-1.5-pro',
      'gemini-1.0-pro'
    ];

    let workingModel = null;
    const modelResults = [];

    for (const modelName of modelsToTest) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Say "test successful"');
        const response = await result.response;
        const text = response.text();

        modelResults.push({
          model: modelName,
          status: 'success',
          response: text.trim()
        });
        
        if (!workingModel) {
          workingModel = modelName;
        }
      } catch (error) {
        modelResults.push({
          model: modelName,
          status: 'error',
          error: error.message
        });
      }
    }

    results.tests.push({
      test: 'Model Testing',
      models: modelResults,
      working_model: workingModel
    });

    // Test 4: List available models (if possible)
    try {
      const models = await genAI.listModels();
      const availableModels = models.map(model => model.name.replace('models/', ''));
      
      results.tests.push({
        test: 'List Available Models',
        status: 'success',
        available_models: availableModels,
        count: availableModels.length
      });
    } catch (error) {
      results.tests.push({
        test: 'List Available Models',
        status: 'error',
        error: error.message
      });
    }

    return res.status(200).json({
      ...results,
      status: workingModel ? 'success' : 'partial_failure',
      message: workingModel ? 
        `✅ Google AI API working with model: ${workingModel}` : 
        '❌ No working Google AI models found'
    });

  } catch (error) {
    console.error('Simple Gemini test error:', error);
    return res.status(500).json({
      ...results,
      status: 'error',
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3)
    });
  }
}