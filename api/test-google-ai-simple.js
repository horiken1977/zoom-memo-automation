// Simplified Google AI API test endpoint
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
    steps: []
  };

  try {
    // Step 1: Check API key
    debugInfo.steps.push({
      step: 1,
      description: 'Check API key',
      api_key_exists: !!process.env.GOOGLE_AI_API_KEY,
      api_key_length: process.env.GOOGLE_AI_API_KEY ? process.env.GOOGLE_AI_API_KEY.length : 0
    });

    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(400).json({
        ...debugInfo,
        status: 'error',
        error: 'API key not found'
      });
    }

    // Step 2: Initialize client
    debugInfo.steps.push({
      step: 2,
      description: 'Initialize client',
      status: 'attempting'
    });

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    debugInfo.steps[1].status = 'success';

    // Step 3: Test with known working model
    debugInfo.steps.push({
      step: 3,
      description: 'Test with gemini-pro model',
      status: 'attempting'
    });

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent('Hello, respond with: API test successful');
    const response = result.response;
    const text = response.text();

    debugInfo.steps[2].status = 'success';
    debugInfo.steps[2].response_length = text.length;

    return res.status(200).json({
      ...debugInfo,
      status: 'success',
      message: '✅ Google AI API working with gemini-pro',
      response: text.trim()
    });

  } catch (error) {
    return res.status(500).json({
      ...debugInfo,
      status: 'error',
      error: error.message,
      error_name: error.name
    });
  }
}