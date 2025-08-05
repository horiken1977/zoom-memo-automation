/**
 * サンプルデータを使用した統合テストAPI
 * 本番環境のGoogle Drive, Gemini, Slackの動作確認用
 */

const fs = require('fs-extra');
const path = require('path');
const AIService = require('../1.src/services/aiService');
const GoogleDriveService = require('../1.src/services/googleDriveService');
const SlackService = require('../1.src/services/slackService');
const logger = require('../1.src/utils/logger');

module.exports = async (req, res) => {
  // CORS対応
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowedMethods: ['POST']
    });
  }

  try {
    logger.info('=== サンプルデータ統合テスト開始 ===');
    
    const result = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      vercel_region: process.env.VERCEL_REGION || 'unknown',
      steps: {}
    };

    // Step 1: サンプルデータのメタ情報準備
    logger.info('📁 Step 1: サンプルデータ準備');
    const sampleData = {
      meetingId: 'sample-meeting-20250731',
      uuid: 'sample-uuid-1on1-kinoshita-horie',
      topic: '【テスト】1on1 Kinoshita-san & Horie (2025-07-31)',
      startTime: '2025-07-31T13:59:11Z',
      duration: 30,
      hostName: 'test@example.com',
      participants: ['Kinoshita-san', 'Horie'],
      meetingInfo: {
        id: 'sample-meeting-20250731',
        topic: '【テスト】1on1 Kinoshita-san & Horie',
        startTime: '2025-07-31T13:59:11Z',
        duration: 30,
        hostName: 'test@example.com',
        participantCount: 2,
        originalFileName: 'video1763668932.mp4'
      }
    };
    
    result.steps.prepare = {
      status: 'success',
      message: 'サンプルデータ準備完了',
      data: sampleData
    };

    // Step 2: AI要約生成（Gemini）
    logger.info('🤖 Step 2: Gemini要約生成');
    try {
      const aiService = new AIService();
      
      // サンプル文字起こしテキスト
      const sampleTranscript = `
[13:59:11] Horie: こんにちは、木下さん。今日は1on1の時間を取っていただき、ありがとうございます。

[14:00:05] Kinoshita: こちらこそ、堀江さん。最近のプロジェクトの進捗について話し合いましょう。

[14:01:20] Horie: はい。Zoom自動化プロジェクトですが、OAuth認証の実装が完了しました。新しいClient IDとSecretを使用してAPI接続ができるようになっています。

[14:02:45] Kinoshita: それは素晴らしいですね。セキュリティ面でも改善されますし、APIの制限も緩和されるはずです。次のステップは何ですか？

[14:03:30] Horie: 次は、録画の自動処理フローを本格稼働させたいと思っています。具体的には、録画データの自動取得、AIによる要約生成、Google Driveへの保存、そしてSlackへの通知まで一連の流れです。

[14:04:15] Kinoshita: なるほど。テスト環境での動作確認は順調ですか？

[14:05:00] Horie: はい、各コンポーネントは個別に動作確認済みです。今日は統合テストを実施して、全体のフローが正常に動作することを確認したいと思います。

[14:06:30] Kinoshita: 完璧ですね。本格運用に向けて、何かサポートが必要でしたらお声がけください。リソースの調整も可能です。

[14:07:15] Horie: ありがとうございます。では、来週から段階的に本格運用を開始したいと思います。まずは週次ミーティングから始めて、徐々に対象を拡大していく予定です。

[14:08:00] Kinoshita: 期待しています。何か問題が発生したら、すぐに対応しましょう。成功事例として社内展開も検討しています。

[14:08:45] Horie: 承知しました。本日はありがとうございました。

[14:09:00] Kinoshita: こちらこそ、お疲れ様でした。プロジェクトの成功を楽しみにしています。
      `.trim();

      // AI要約生成
      const transcriptionResult = {
        transcription: sampleTranscript,
        meetingInfo: sampleData.meetingInfo
      };
      
      const analysisResult = await aiService.analyzeComprehensively(transcriptionResult);
      
      result.steps.ai_summary = {
        status: 'success',
        message: 'AI要約生成成功',
        summary_length: analysisResult.summary ? analysisResult.summary.length : 0,
        has_action_items: analysisResult.actionItems && analysisResult.actionItems.length > 0,
        has_decisions: analysisResult.decisions && analysisResult.decisions.length > 0
      };
      
      // 要約結果を保存
      result.analysisResult = analysisResult;
      
    } catch (error) {
      logger.error('AI要約生成エラー:', error);
      result.steps.ai_summary = {
        status: 'error',
        message: 'AI要約生成失敗',
        error: error.message
      };
    }

    // Step 3: Google Drive保存（ダミーファイル）
    logger.info('☁️ Step 3: Google Drive保存');
    try {
      const googleDriveService = new GoogleDriveService();
      
      // テスト用ダミーファイルを作成
      const tempDir = path.join('/tmp', 'zoom-test');
      await fs.ensureDir(tempDir);
      
      const dummyVideoPath = path.join(tempDir, 'test-video.mp4');
      const dummySummaryPath = path.join(tempDir, 'test-summary.md');
      
      // ダミー動画ファイル（小さなテキストファイル）
      await fs.writeFile(dummyVideoPath, 'This is a test video file for Google Drive upload test.');
      
      // 要約ファイル
      const summaryContent = `# ${sampleData.topic}

## 会議情報
- 日時: ${new Date(sampleData.startTime).toLocaleString('ja-JP')}
- 参加者: ${sampleData.participants.join(', ')}
- 時間: ${sampleData.duration}分

## 要約
${result.analysisResult ? result.analysisResult.summary : 'AI要約生成失敗'}

---
テスト実行日時: ${new Date().toISOString()}
`;
      
      await fs.writeFile(dummySummaryPath, summaryContent);
      
      // Google Driveにアップロード
      const driveResult = await googleDriveService.uploadFile(
        dummyVideoPath,
        sampleData.meetingInfo
      );
      
      result.steps.google_drive = {
        status: 'success',
        message: 'Google Driveアップロード成功',
        file_id: driveResult.id,
        file_name: driveResult.name,
        web_view_link: driveResult.webViewLink,
        folder_path: driveResult.folderPath
      };
      
      result.driveResult = driveResult;
      
      // クリーンアップ
      await fs.remove(tempDir);
      
    } catch (error) {
      logger.error('Google Drive保存エラー:', error);
      result.steps.google_drive = {
        status: 'error',
        message: 'Google Drive保存失敗',
        error: error.message
      };
    }

    // Step 4: Slack通知
    logger.info('💬 Step 4: Slack通知');
    try {
      const slackService = new SlackService();
      
      if (result.analysisResult && result.driveResult) {
        // テスト識別子を追加
        result.analysisResult.meetingInfo.topic = '【統合テスト】' + result.analysisResult.meetingInfo.topic;
        
        const slackResult = await slackService.sendMeetingSummaryWithRecording(
          result.analysisResult,
          result.driveResult
        );
        
        result.steps.slack_notification = {
          status: 'success',
          message: 'Slack通知送信成功',
          timestamp: slackResult.ts,
          channel: slackResult.channel
        };
      } else {
        result.steps.slack_notification = {
          status: 'skipped',
          message: 'AI要約またはGoogle Drive保存が失敗したためスキップ'
        };
      }
      
    } catch (error) {
      logger.error('Slack通知エラー:', error);
      result.steps.slack_notification = {
        status: 'error',
        message: 'Slack通知失敗',
        error: error.message
      };
    }

    // 結果サマリー
    const successCount = Object.values(result.steps).filter(step => step.status === 'success').length;
    const totalSteps = Object.keys(result.steps).length;
    
    result.summary = {
      overall_status: successCount === totalSteps ? 'success' : 'partial_success',
      success_count: successCount,
      total_steps: totalSteps,
      success_rate: `${(successCount / totalSteps * 100).toFixed(1)}%`
    };

    logger.info('=== サンプルデータ統合テスト完了 ===');
    logger.info(`成功率: ${result.summary.success_rate}`);

    return res.status(200).json(result);

  } catch (error) {
    logger.error('統合テスト失敗:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};