// Debug endpoint for Google AI API issues
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

  const debugInfo = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    debug_steps: []
  };

  try {
    // Step 1: Check environment variable
    debugInfo.debug_steps.push({
      step: 1,
      description: 'Check GOOGLE_AI_API_KEY environment variable',
      api_key_exists: !!process.env.GOOGLE_AI_API_KEY,
      api_key_length: process.env.GOOGLE_AI_API_KEY ? process.env.GOOGLE_AI_API_KEY.length : 0,
      api_key_prefix: process.env.GOOGLE_AI_API_KEY ? process.env.GOOGLE_AI_API_KEY.substring(0, 10) + '...' : 'NOT_SET'
    });

    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(400).json({
        ...debugInfo,
        error: 'GOOGLE_AI_API_KEY environment variable is not set'
      });
    }

    // Step 2: Initialize GoogleGenerativeAI
    debugInfo.debug_steps.push({
      step: 2,
      description: 'Initialize GoogleGenerativeAI client',
      status: 'attempting'
    });

    let genAI;
    try {
      genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
      debugInfo.debug_steps[1].status = 'success';
      debugInfo.debug_steps[1].message = 'GoogleGenerativeAI client initialized successfully';
    } catch (error) {
      debugInfo.debug_steps[1].status = 'error';
      debugInfo.debug_steps[1].error = error.message;
      return res.status(500).json({
        ...debugInfo,
        error: 'Failed to initialize GoogleGenerativeAI client'
      });
    }

    // Step 3: Get model
    debugInfo.debug_steps.push({
      step: 3,
      description: 'Get Gemini model',
      model_name: 'gemini-1.5-pro-latest',
      status: 'attempting'
    });

    let model;
    try {
      model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
      debugInfo.debug_steps[2].status = 'success';
      debugInfo.debug_steps[2].message = 'Model instance created successfully';
    } catch (error) {
      debugInfo.debug_steps[2].status = 'error';
      debugInfo.debug_steps[2].error = error.message;
      return res.status(500).json({
        ...debugInfo,
        error: 'Failed to get Gemini model'
      });
    }

    // Step 4: Test simple content generation
    debugInfo.debug_steps.push({
      step: 4,
      description: 'Test content generation',
      prompt: 'Hello, respond with: API test successful',
      status: 'attempting'
    });

    try {
      const testPrompt = 'Hello, respond with: API test successful';
      const result = await model.generateContent(testPrompt);
      const response = await result.response;
      const text = response.text();

      debugInfo.debug_steps[3].status = 'success';
      debugInfo.debug_steps[3].response = {
        text: text.trim(),
        length: text.length
      };
      debugInfo.debug_steps[3].message = 'Content generation successful';

      // Success response
      return res.status(200).json({
        ...debugInfo,
        status: 'success',
        message: '✅ Google AI API is working correctly',
        final_response: text.trim()
      });

    } catch (error) {
      debugInfo.debug_steps[3].status = 'error';
      debugInfo.debug_steps[3].error = {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 5) // First 5 lines of stack trace
      };

      // Check for specific error types
      let errorCategory = 'unknown';
      let suggestion = 'Check API key and try again';

      if (error.message.includes('API_KEY_INVALID')) {
        errorCategory = 'invalid_api_key';
        suggestion = 'The API key appears to be invalid. Please verify the key in Google AI Studio.';
      } else if (error.message.includes('PERMISSION_DENIED')) {
        errorCategory = 'permission_denied';
        suggestion = 'Permission denied. Check if the API key has proper permissions.';
      } else if (error.message.includes('QUOTA_EXCEEDED')) {
        errorCategory = 'quota_exceeded';
        suggestion = 'API quota exceeded. Check your usage limits in Google Cloud Console.';
      } else if (error.message.includes('MODEL_NOT_FOUND')) {
        errorCategory = 'model_not_found';
        suggestion = 'The specified model was not found. Try using "gemini-pro" instead.';
      }

      debugInfo.error_analysis = {
        category: errorCategory,
        suggestion: suggestion
      };

      return res.status(500).json({
        ...debugInfo,
        status: 'error',
        message: '❌ Google AI API test failed',
        error: error.message
      });
    }

  } catch (error) {
    console.error('Debug endpoint error:', error);
    return res.status(500).json({
      ...debugInfo,
      status: 'error',
      message: '❌ Debug endpoint execution failed',
      error: error.message
    });
  }
}