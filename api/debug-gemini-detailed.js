// Gemini 2.5-pro 詳細エラー調査API
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../1.src/config');
const fs = require('fs-extra');
const path = require('path');

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
    console.log('🔍 Gemini 2.5-pro 詳細エラー調査開始');
    
    const results = {
      timestamp: new Date().toISOString(),
      steps: {}
    };
    
    // Step 1: 基本設定確認
    results.steps.config = {
      apiKey: config.googleAI.apiKey ? 'あり' : 'なし',
      model: config.googleAI.model,
      fallbackModels: config.googleAI.fallbackModels
    };
    
    // Step 2: GoogleGenerativeAI インスタンス作成
    const genAI = new GoogleGenerativeAI(config.googleAI.apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    
    // Step 3: 単純なテキストプロンプトテスト
    console.log('📝 単純なテキストプロンプトテスト');
    try {
      const simplePrompt = "こんにちは。今日は良い天気ですね。";
      const simpleResult = await model.generateContent(simplePrompt);
      results.steps.simple_text = {
        status: 'success',
        prompt: simplePrompt,
        response: simpleResult.response.text().substring(0, 200) + '...'
      };
      console.log('✅ 単純テキスト成功');
    } catch (simpleError) {
      results.steps.simple_text = {
        status: 'error',
        error: simpleError.message,
        stack: simpleError.stack?.substring(0, 500),
        details: simpleError.details || 'no details'
      };
      console.error('❌ 単純テキストエラー:', simpleError);
    }
    
    // Step 4: 複雑なプロンプトテスト（文字起こし形式）
    console.log('📝 文字起こし形式プロンプトテスト');
    try {
      const transcriptionPrompt = `あなたは会議の音声を正確に文字起こしするAIアシスタントです。
以下の要求に従って処理してください：
1. 話者の識別（可能な場合）
2. 正確な文字起こし
3. 日本語での出力
4. タイムスタンプの記録（可能な場合）

会議情報:
- タイトル: テスト会議
- 開催日時: 2025-08-05T06:00:00Z
- 時間: 30分
- 主催者: テストユーザー

この音声ファイルを文字起こししてください。話者が複数いる場合は区別して記録してください。

[サンプル会議内容]
"こんにちは、お疲れ様です。今日は30分程度で進捗の確認をしたいと思います。プロジェクトの状況はいかがですか？"`;

      const transcriptionResult = await model.generateContent(transcriptionPrompt);
      results.steps.transcription_prompt = {
        status: 'success',
        prompt_length: transcriptionPrompt.length,
        response: transcriptionResult.response.text().substring(0, 300) + '...'
      };
      console.log('✅ 文字起こし形式成功');
    } catch (transcriptionError) {
      results.steps.transcription_prompt = {
        status: 'error',
        error: transcriptionError.message,
        stack: transcriptionError.stack?.substring(0, 500),
        details: transcriptionError.details || 'no details'
      };
      console.error('❌ 文字起こし形式エラー:', transcriptionError);
    }
    
    // Step 5: ダミー音声ファイルでのテスト
    console.log('🎵 ダミー音声ファイルテスト');
    try {
      // 小さなダミーファイルを作成
      const tempDir = '/tmp/gemini-test';
      await fs.ensureDir(tempDir);
      const dummyAudioPath = path.join(tempDir, 'test.m4a');
      
      // 非常に小さなダミーデータ（音声っぽい内容）
      const dummyAudioData = Buffer.from('dummy audio content for testing gemini api');
      await fs.writeFile(dummyAudioPath, dummyAudioData);
      
      // Base64エンコード
      const audioData = await fs.readFile(dummyAudioPath);
      const base64Audio = audioData.toString('base64');
      
      const audioPrompt = "この音声ファイルの内容を文字起こししてください。";
      
      const audioResult = await model.generateContent([
        {
          inlineData: {
            data: base64Audio,
            mimeType: 'audio/mp4'
          }
        },
        audioPrompt
      ]);
      
      results.steps.audio_file = {
        status: 'success',
        file_size: audioData.length,
        response: audioResult.response.text().substring(0, 300) + '...'
      };
      
      // クリーンアップ
      await fs.remove(tempDir);
      console.log('✅ 音声ファイルテスト成功');
      
    } catch (audioError) {
      results.steps.audio_file = {
        status: 'error',
        error: audioError.message,
        stack: audioError.stack?.substring(0, 500),
        details: audioError.details || 'no details',
        error_type: audioError.constructor.name
      };
      console.error('❌ 音声ファイルテストエラー:', audioError);
    }
    
    // Step 6: 要約生成テスト
    console.log('📄 要約生成テスト');
    try {
      const summarySystemPrompt = `あなたは会議の要約を作成する専門AIアシスタントです。
以下の形式で会議内容を整理してください：

## 会議要約

### 基本情報
- 会議目的：
- 開催日時：
- 出席者：

### 議論内容
（対話形式で、誰が何を発言したかを明確に記載）

### 決定事項
1. 
2. 

### 宿題・課題
1. 
2. 

正確で構造化された要約を作成してください。`;

      const summaryUserPrompt = `以下の会議の文字起こしを基に、上記の形式で要約を作成してください：

[会議開始 14:00]
Horie: こんにちは、木下さん。今日はお忙しい中お時間をいただき、ありがとうございます。

Kinoshita: こちらこそ、堀江さん。最近のプロジェクトの進捗はいかがですか？

Horie: Zoom自動化システムの開発が順調に進んでいます。OAuth認証の実装が完了し、録画の自動処理フローも整いました。

[会議終了 14:30]`;

      const summaryResult = await model.generateContent([
        summarySystemPrompt,
        summaryUserPrompt
      ]);
      
      results.steps.summary_generation = {
        status: 'success',
        system_prompt_length: summarySystemPrompt.length,
        user_prompt_length: summaryUserPrompt.length,
        response: summaryResult.response.text().substring(0, 400) + '...'
      };
      console.log('✅ 要約生成成功');
      
    } catch (summaryError) {
      results.steps.summary_generation = {
        status: 'error',
        error: summaryError.message,
        stack: summaryError.stack?.substring(0, 500),
        details: summaryError.details || 'no details'
      };
      console.error('❌ 要約生成エラー:', summaryError);
    }
    
    // 結果サマリー
    const successCount = Object.values(results.steps).filter(step => step.status === 'success').length;
    const totalSteps = Object.keys(results.steps).length;
    
    results.summary = {
      success_count: successCount,
      total_steps: totalSteps,
      success_rate: `${(successCount / totalSteps * 100).toFixed(1)}%`,
      failed_steps: Object.keys(results.steps).filter(key => results.steps[key].status === 'error')
    };
    
    console.log('🎉 Gemini 2.5-pro 詳細エラー調査完了');
    console.log(`成功率: ${results.summary.success_rate}`);
    
    return res.status(200).json({
      status: 'success',
      message: 'Gemini 2.5-pro 詳細エラー調査完了',
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 調査処理エラー:', error);
    
    return res.status(500).json({
      status: 'error',
      message: '調査処理でエラーが発生',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}