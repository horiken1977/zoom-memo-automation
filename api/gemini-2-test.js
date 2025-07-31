// Test Gemini 2.0 models including latest 2.5 Pro
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
      length: process.env.GOOGLE_AI_API_KEY ? process.env.GOOGLE_AI_API_KEY.length : 0
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

    // Test Gemini 2.0 and 2.5 models
    const gemini2ModelsToTest = [
      'gemini-2.0-flash-exp',
      'gemini-2.5-pro',
      'gemini-2.5-pro-latest',
      'gemini-2.0-flash',
      'gemini-2.0-pro',
      'gemini-exp-1206',
      'gemini-exp-1121'
    ];

    let workingModel = null;
    let successCount = 0;

    for (const modelName of gemini2ModelsToTest) {
      const testResult = {
        model: modelName,
        timestamp: new Date().toISOString()
      };

      try {
        console.log(`Testing Gemini 2.x model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const prompt = 'Please respond with "Gemini 2.x model test successful" to confirm this model is working.';
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

        console.log(`✅ ${modelName}: Success - ${text.trim()}`);

      } catch (error) {
        testResult.status = 'error';
        testResult.error = error.message;
        testResult.error_code = error.status || 'unknown';
        
        console.log(`❌ ${modelName}: ${error.message}`);
      }

      results.model_tests.push(testResult);
    }

    // Also test successful 1.5 models for comparison
    const gemini15ModelsToTest = [
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest'
    ];

    for (const modelName of gemini15ModelsToTest) {
      const testResult = {
        model: modelName,
        timestamp: new Date().toISOString(),
        category: 'gemini-1.5-comparison'
      };

      try {
        console.log(`Testing Gemini 1.5 model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const prompt = 'Please respond with "Gemini 1.5 model test successful" to confirm this model is working.';
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

        console.log(`✅ ${modelName}: Success - ${text.trim()}`);

      } catch (error) {
        testResult.status = 'error';
        testResult.error = error.message;
        testResult.error_code = error.status || 'unknown';
        
        console.log(`❌ ${modelName}: ${error.message}`);
      }

      results.model_tests.push(testResult);
    }

    // Summary
    const totalModels = gemini2ModelsToTest.length + gemini15ModelsToTest.length;
    results.summary = {
      total_models_tested: totalModels,
      gemini_2x_tested: gemini2ModelsToTest.length,
      gemini_15_tested: gemini15ModelsToTest.length,
      successful_models: successCount,
      failed_models: totalModels - successCount,
      success_rate: `${((successCount / totalModels) * 100).toFixed(1)}%`,
      working_model: workingModel,
      overall_status: successCount > 0 ? 'success' : 'failure'
    };

    const statusCode = successCount > 0 ? 200 : 500;
    const message = workingModel ? 
      `✅ Google AI API working! Best available model: ${workingModel}` : 
      '❌ No working Google AI models found';

    return res.status(statusCode).json({
      ...results,
      status: results.summary.overall_status,
      message: message
    });

  } catch (error) {
    console.error('Gemini 2.x model test error:', error);
    return res.status(500).json({
      ...results,
      status: 'error',
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 5)
    });
  }
}