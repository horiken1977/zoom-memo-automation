const GoogleDriveService = require('./googleDriveService');
const logger = require('../utils/logger');

/**
 * 文書保存サービス（要約・文字起こし）
 * 動画保存とログ保存の仕組みを流用してクライアント名ベースフォルダに保存
 */
class DocumentStorageService {
  constructor() {
    this.googleDriveService = new GoogleDriveService();
  }

  /**
   * 会議情報からクライアント名を抽出（VideoStorageServiceと同じロジック）
   */
  extractClientName(meetingInfo) {
    // 1. 会議名からクライアント名を抽出
    if (meetingInfo.topic) {
      // パターン1: 「○○様_」形式
      const pattern1 = meetingInfo.topic.match(/^([一-龯ァ-ヶー\w]+様)_/);
      if (pattern1) {
        return pattern1[1];
      }
      
      // パターン2: 「株式会社○○_」形式
      const pattern2 = meetingInfo.topic.match(/^(株式会社[一-龯ァ-ヶー\w]+)_/);
      if (pattern2) {
        return pattern2[1];
      }
      
      // パターン3: 「○○株式会社_」形式
      const pattern3 = meetingInfo.topic.match(/^([一-龯ァ-ヶー\w]+株式会社)_/);
      if (pattern3) {
        return pattern3[1];
      }
      
      // パターン4: 「○○社_」形式
      const pattern4 = meetingInfo.topic.match(/^([一-龯ァ-ヶー\w]+社)_/);
      if (pattern4) {
        return pattern4[1];
      }
      
      // パターン5: 「○○グループ_」形式
      const pattern5 = meetingInfo.topic.match(/^([一-龯ァ-ヶー\w]+グループ)_/);
      if (pattern5) {
        return pattern5[1];
      }
      
      // パターン6: 「○○_」形式（汎用）
      const pattern6 = meetingInfo.topic.match(/^([一-龯ァ-ヶー\w]{2,15})_/);
      if (pattern6) {
        const candidate = pattern6[1];
        // 一般的な単語を除外
        const excludeWords = ['会議', '定例', '打合せ', '打ち合わせ', 'MTG', 'ミーティング', '相談', '説明会'];
        if (!excludeWords.includes(candidate)) {
          return candidate + '様';
        }
      }
    }
    
    // 2. AIで抽出されたクライアント名がある場合（構造化要約結果から）
    if (meetingInfo.summary && meetingInfo.summary.client && meetingInfo.summary.client !== '不明') {
      return meetingInfo.summary.client;
    }
    
    // 3. フォールバック: 年月フォルダ
    const date = new Date(meetingInfo.startTime || new Date());
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * 要約・文字起こしファイルの保存先フォルダ構造を確保
   */
  async ensureDocumentFolderStructure(meetingInfo, recordingsBaseFolder) {
    try {
      await this.googleDriveService.initialize();

      // クライアント名を抽出
      const clientName = this.extractClientName(meetingInfo);
      logger.info(`Document storage - Extracted client name: ${clientName}`);

      // ベースフォルダの確認
      let baseFolderInfo;
      try {
        baseFolderInfo = await this.googleDriveService.drive.files.get({
          fileId: recordingsBaseFolder,
          fields: 'id, name',
          supportsAllDrives: true
        });
        logger.info(`Base folder confirmed: ${baseFolderInfo.data.name} (${recordingsBaseFolder})`);
      } catch (error) {
        throw new Error(`Recording base folder not found: ${recordingsBaseFolder}`);
      }

      // クライアント名フォルダを確保
      const clientFolderId = await this.googleDriveService.ensureFolder(clientName, recordingsBaseFolder);
      logger.info(`Client folder ensured: ${clientName} (${clientFolderId})`);
      
      // 年月サブフォルダを作成
      const date = new Date(meetingInfo.startTime || new Date());
      const year = date.getFullYear().toString();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const yearMonth = `${year}-${month}`;
      
      const yearMonthFolderId = await this.googleDriveService.ensureFolder(yearMonth, clientFolderId);
      logger.info(`Year-month subfolder ensured: ${yearMonth} (${yearMonthFolderId})`);

      // documentsサブフォルダを作成
      const documentsFolderId = await this.googleDriveService.ensureFolder('documents', yearMonthFolderId);
      logger.info(`Documents subfolder ensured: documents (${documentsFolderId})`);

      return {
        baseFolderId: recordingsBaseFolder,
        clientFolderId: clientFolderId,
        yearMonthFolderId: yearMonthFolderId,
        documentsFolderId: documentsFolderId,
        folderPath: `${baseFolderInfo.data.name}/${clientName}/${yearMonth}/documents`,
        clientName: clientName
      };

    } catch (error) {
      logger.error('Failed to ensure document folder structure:', error.message);
      throw error;
    }
  }

  /**
   * ファイル名を生成（日付_時刻_会議名_種別）
   */
  generateDocumentFileName(meetingInfo, docType) {
    const date = new Date(meetingInfo.startTime || new Date());
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
    
    // 会議名をファイル名に適した形式に変換
    const safeName = meetingInfo.topic
      .replace(/[<>:"/\\|?*]/g, '') // 無効な文字を削除
      .replace(/\s+/g, '_') // スペースをアンダースコアに
      .substring(0, 40); // 長さ制限

    const typeMap = {
      'summary': '要約',
      'transcription': '文字起こし',
      'structured': '構造化要約'
    };
    
    const typeName = typeMap[docType] || docType;
    return `${dateStr}_${timeStr}_${safeName}_${typeName}.txt`;
  }

  /**
   * 文書の説明文を生成
   */
  generateDocumentDescription(meetingInfo, docType, additionalInfo = {}) {
    const typeMap = {
      'summary': '会議要約',
      'transcription': '文字起こし',
      'structured': '構造化要約'
    };
    
    const docTypeName = typeMap[docType] || docType;
    
    return `Zoom Meeting ${docTypeName}

会議名: ${meetingInfo.topic}
開催日時: ${new Date(meetingInfo.startTime).toLocaleString('ja-JP')}
時間: ${meetingInfo.duration}分
主催者: ${meetingInfo.hostName || 'N/A'}
参加者数: ${additionalInfo.participantCount || 'N/A'}
Meeting ID: ${meetingInfo.id}

${additionalInfo.aiModel ? `AI処理モデル: ${additionalInfo.aiModel}` : ''}
${additionalInfo.processingTime ? `処理時間: ${Math.round(additionalInfo.processingTime/1000)}秒` : ''}
${additionalInfo.transcriptionLength ? `文字起こし長: ${additionalInfo.transcriptionLength}文字` : ''}

自動生成: ${new Date().toLocaleString('ja-JP')}
システム: Zoom Meeting Automation`;
  }

  /**
   * 要約をGoogle Driveに保存
   */
  async saveSummaryToGoogleDrive(summaryData, meetingInfo, recordingsBaseFolder) {
    try {
      logger.info(`Starting summary save to Google Drive for: ${meetingInfo.topic}`);

      // フォルダ構造を確保
      const folderStructure = await this.ensureDocumentFolderStructure(meetingInfo, recordingsBaseFolder);

      // ファイル名生成
      const fileName = this.generateDocumentFileName(meetingInfo, 'summary');
      
      // 要約テキストを整形
      console.log('🔍 DocumentStorage Debug: summaryData受信確認', {
        summaryDataType: typeof summaryData,
        summaryDataKeys: summaryData ? Object.keys(summaryData) : [],
        hasOverview: !!summaryData?.overview,
        overviewLength: summaryData?.overview?.length || 0,
        overviewPreview: summaryData?.overview?.substring(0, 100) || 'なし',
        hasDiscussions: !!summaryData?.discussions,
        discussionsCount: summaryData?.discussions?.length || 0
      });
      
      const summaryText = this.formatSummaryText(summaryData, meetingInfo);
      
      console.log('🔍 DocumentStorage Debug: formatSummaryText結果', {
        summaryTextLength: summaryText.length,
        summaryTextPreview: summaryText.substring(0, 200),
        isEmpty: summaryText.length === 0
      });
      
      // ファイルの説明を生成
      const description = this.generateDocumentDescription(meetingInfo, 'summary', {
        aiModel: summaryData.model,
        processingTime: summaryData.processingTime,
        participantCount: summaryData.participants?.length
      });

      // バッファから直接Google Driveにアップロード
      const summaryBuffer = Buffer.from(summaryText, 'utf8');
      const uploadResult = await this.googleDriveService.uploadFromBuffer(
        summaryBuffer,
        fileName,
        folderStructure.documentsFolderId,
        'text/plain',
        description
      );

      // 共有リンクを作成
      const shareResult = await this.googleDriveService.createShareableLink(uploadResult.fileId, 'reader');

      logger.info(`Summary uploaded successfully: ${fileName} (${uploadResult.fileId})`);

      return {
        success: true,
        type: 'summary',
        fileId: uploadResult.fileId,
        fileName: fileName,
        size: summaryBuffer.length,
        viewLink: shareResult.viewLink,
        downloadLink: shareResult.downloadLink,
        folderPath: folderStructure.folderPath,
        description: description,
        uploadTime: uploadResult.uploadTime,
        savedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to save summary to Google Drive:', error.message);
      throw error;
    }
  }

  /**
   * 文字起こしをGoogle Driveに保存
   */
  async saveTranscriptionToGoogleDrive(transcriptionData, meetingInfo, recordingsBaseFolder) {
    try {
      logger.info(`Starting transcription save to Google Drive for: ${meetingInfo.topic}`);

      // フォルダ構造を確保
      const folderStructure = await this.ensureDocumentFolderStructure(meetingInfo, recordingsBaseFolder);

      // ファイル名生成
      const fileName = this.generateDocumentFileName(meetingInfo, 'transcription');
      
      // 文字起こしテキストを整形
      const transcriptionText = this.formatTranscriptionText(transcriptionData, meetingInfo);
      
      // ファイルの説明を生成
      const description = this.generateDocumentDescription(meetingInfo, 'transcription', {
        aiModel: transcriptionData.model,
        processingTime: transcriptionData.processingTime,
        transcriptionLength: transcriptionData.transcription?.length
      });

      // バッファから直接Google Driveにアップロード
      const transcriptionBuffer = Buffer.from(transcriptionText, 'utf8');
      const uploadResult = await this.googleDriveService.uploadFromBuffer(
        transcriptionBuffer,
        fileName,
        folderStructure.documentsFolderId,
        'text/plain',
        description
      );

      // 共有リンクを作成
      const shareResult = await this.googleDriveService.createShareableLink(uploadResult.fileId, 'reader');

      logger.info(`Transcription uploaded successfully: ${fileName} (${uploadResult.fileId})`);

      return {
        success: true,
        type: 'transcription',
        fileId: uploadResult.fileId,
        fileName: fileName,
        size: transcriptionBuffer.length,
        viewLink: shareResult.viewLink,
        downloadLink: shareResult.downloadLink,
        folderPath: folderStructure.folderPath,
        description: description,
        uploadTime: uploadResult.uploadTime,
        savedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to save transcription to Google Drive:', error.message);
      throw error;
    }
  }

  /**
   * 構造化要約をGoogle Driveに保存（JSON形式）
   */
  async saveStructuredSummaryToGoogleDrive(structuredData, meetingInfo, recordingsBaseFolder) {
    try {
      logger.info(`Starting structured summary save to Google Drive for: ${meetingInfo.topic}`);

      // フォルダ構造を確保
      const folderStructure = await this.ensureDocumentFolderStructure(meetingInfo, recordingsBaseFolder);

      // ファイル名生成（JSON形式）
      const fileName = this.generateDocumentFileName(meetingInfo, 'structured').replace('.txt', '.json');
      
      // 構造化データをJSONとして整形
      const structuredJson = JSON.stringify(structuredData, null, 2);
      
      // ファイルの説明を生成
      const description = this.generateDocumentDescription(meetingInfo, 'structured', {
        aiModel: structuredData.model,
        processingTime: structuredData.processingTime,
        transcriptionLength: structuredData.transcription?.length,
        participantCount: structuredData.participants?.length
      });

      // バッファから直接Google Driveにアップロード
      const structuredBuffer = Buffer.from(structuredJson, 'utf8');
      const uploadResult = await this.googleDriveService.uploadFromBuffer(
        structuredBuffer,
        fileName,
        folderStructure.documentsFolderId,
        'application/json',
        description
      );

      // 共有リンクを作成
      const shareResult = await this.googleDriveService.createShareableLink(uploadResult.fileId, 'reader');

      logger.info(`Structured summary uploaded successfully: ${fileName} (${uploadResult.fileId})`);

      return {
        success: true,
        type: 'structured',
        fileId: uploadResult.fileId,
        fileName: fileName,
        size: structuredBuffer.length,
        viewLink: shareResult.viewLink,
        downloadLink: shareResult.downloadLink,
        folderPath: folderStructure.folderPath,
        description: description,
        uploadTime: uploadResult.uploadTime,
        savedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to save structured summary to Google Drive:', error.message);
      throw error;
    }
  }

  /**
   * 要約テキストを読みやすい形式に整形
   */
  formatSummaryText(summaryData, meetingInfo) {
    // データ型と構造の安全性チェック
    if (!summaryData || typeof summaryData !== 'object') {
      return `# ${meetingInfo.topic} - 会議要約\n\nエラー: 要約データが無効です。\n\n生成日時: ${new Date().toLocaleString('ja-JP')}`;
    }
    
    return `# ${meetingInfo.topic} - 会議要約

## 基本情報
- 会議名: ${meetingInfo.topic}
- 開催日時: ${new Date(meetingInfo.startTime).toLocaleString('ja-JP')}
- 時間: ${meetingInfo.duration}分
- 主催者: ${meetingInfo.hostName || 'N/A'}
- 参加者数: ${summaryData.participants?.length || 'N/A'}名

## 会議目的
${summaryData.meetingPurpose || summaryData.overview || 'N/A'}

## クライアント名
${summaryData.clientName || summaryData.client || 'N/A'}

## 出席者・会社名
${summaryData.attendeesAndCompanies?.map(p => `- ${p.name || p} (${p.company || '不明'}) ${p.role ? ` - ${p.role}` : ''}`).join('\n') || summaryData.participants?.map(p => `- ${p.name || p}`).join('\n') || '情報なし'}

## 資料
${summaryData.materials?.map(m => `- ${m.materialName || m} ${m.timestamp ? `[${m.timestamp}]` : ''}${m.description ? `\n  説明: ${m.description}` : ''}${m.mentionedBy ? `\n  言及者: ${m.mentionedBy}` : ''}`).join('\n') || '資料の言及なし'}

## 論点および議論内容
${(summaryData.discussionsByTopic || summaryData.discussions)?.map(d => `### ${d.topicTitle || d.topic || '論点'}
**時間**: ${d.timeRange?.startTime || '不明'} ～ ${d.timeRange?.endTime || '不明'}

**背景・きっかけ**:
${d.discussionFlow?.backgroundContext || '記録なし'}

**発言者別の主張・論理展開**:
${d.discussionFlow?.keyArguments?.map(arg => `
- **${arg.speaker || '不明'}** (${arg.company || '不明'}) [${arg.timestamp || '時間不明'}]
  主張: ${arg.argument || '記録なし'}
  根拠: ${arg.reasoning || '記録なし'}  
  他者の反応: ${arg.reactionFromOthers || '記録なし'}
`).join('\n') || '発言記録なし'}

**議論の論理展開**:
${d.discussionFlow?.logicalProgression || '記録なし'}

**決定プロセス**:
${d.discussionFlow?.decisionProcess || '記録なし'}

**結論・合意事項**:
${d.outcome || '未解決'}

---
`).join('\n') || '論点なし'}

## 決定事項
${summaryData.decisions?.map(d => `- ${d.decision || d}
  決定者: ${d.decidedBy || '不明'}
  理由: ${d.reason || '記録なし'}
  実施時期: ${d.implementationDate || '未定'}
  関連論点: ${d.relatedTopic || '不明'}`).join('\n') || '決定事項なし'}

## Next Action および Due Date
${(summaryData.nextActionsWithDueDate || summaryData.homework || summaryData.actionItems)?.map(a => `- ${a.action || a.task || a.content || a}
  担当者: ${a.assignee || '未定'}
  期限: ${a.dueDate || '未定'}
  優先度: ${a.priority || '中'}
  関連決定: ${a.relatedDecision || '不明'}`).join('\n') || 'Next Actionなし'}

## 生成情報
- AIモデル: ${summaryData.model || 'N/A'}
- 処理時間: ${summaryData.processingTime ? Math.round(summaryData.processingTime/1000) + '秒' : 'N/A'}
- 生成日時: ${new Date().toLocaleString('ja-JP')}

---
このファイルはZoom Meeting Automationにより自動生成されました。`;
  }

  /**
   * 文字起こしテキストを読みやすい形式に整形
   */
  formatTranscriptionText(transcriptionData, meetingInfo) {
    return `# ${meetingInfo.topic} - 文字起こし

## 基本情報
- 会議名: ${meetingInfo.topic}
- 開催日時: ${new Date(meetingInfo.startTime).toLocaleString('ja-JP')}
- 時間: ${meetingInfo.duration}分
- 主催者: ${meetingInfo.hostName || 'N/A'}
- 文字数: ${transcriptionData.transcription?.length || 0}文字

## 文字起こし内容

${transcriptionData.transcription || 'N/A'}

## 音声品質情報
${transcriptionData.audioQuality ? `
- 音質: ${transcriptionData.audioQuality.clarity || 'N/A'}
- 信頼度: ${transcriptionData.audioQuality.transcriptionConfidence || 'N/A'}
- 問題点: ${transcriptionData.audioQuality.issues?.join(', ') || 'なし'}
` : '情報なし'}

## 生成情報
- AIモデル: ${transcriptionData.model || 'N/A'}
- 処理時間: ${transcriptionData.processingTime ? Math.round(transcriptionData.processingTime/1000) + '秒' : 'N/A'}
- 生成日時: ${new Date().toLocaleString('ja-JP')}

---
このファイルはZoom Meeting Automationにより自動生成されました。`;
  }

  /**
   * 統合ドキュメント保存メソッド（中央集約型）
   * リトライ機能付きで文字起こし・要約・構造化データを一括保存
   * @param {Object} audioResult - 音声処理結果
   * @param {Object} meetingInfo - 会議情報
   * @param {string} recordingsBaseFolder - 保存先ベースフォルダID
   * @returns {Object} 保存結果
   */
  async saveDocuments(audioResult, meetingInfo, recordingsBaseFolder) {
    const maxRetries = 3;
    const savedDocuments = [];
    const errors = [];
    let lastError = null;

    logger.info(`Starting unified document save for: ${meetingInfo.topic}`);

    // 保存するドキュメントタイプを定義
    const documentsToSave = [];
    
    // 1. 文字起こしデータがある場合
    if (audioResult.transcription) {
      documentsToSave.push({
        type: 'transcription',
        data: audioResult.transcription,
        method: 'saveTranscriptionToGoogleDrive'
      });
    }

    // 2. 要約データがある場合（複数の可能な構造に対応）
    if (audioResult.structuredSummary || audioResult.analysis || audioResult.summary) {
      // 重要: audioResult.summaryが直接構造化要約オブジェクトの場合を優先
      const summaryData = audioResult.summary || audioResult.structuredSummary || audioResult.analysis;
      console.log('🔍 saveDocuments Debug: 要約データ確認', {
        hasSummary: !!audioResult.summary,
        hasStructuredSummary: !!audioResult.structuredSummary,
        summaryType: typeof summaryData,
        summaryKeys: summaryData ? Object.keys(summaryData) : [],
        overviewExists: !!summaryData?.overview
      });
      
      documentsToSave.push({
        type: 'summary',
        data: summaryData,
        method: 'saveSummaryToGoogleDrive'
      });
    }

    // 3. 構造化データがある場合
    if (audioResult.structuredSummary) {
      documentsToSave.push({
        type: 'structured',
        data: audioResult.structuredSummary,
        method: 'saveStructuredSummaryToGoogleDrive'
      });
    }

    logger.info(`Planning to save ${documentsToSave.length} document types: ${documentsToSave.map(d => d.type).join(', ')}`);

    // 各ドキュメントタイプを順次保存（リトライ付き）
    for (const document of documentsToSave) {
      let saveSuccess = false;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          logger.info(`Saving ${document.type} - Attempt ${attempt}/${maxRetries}`);
          
          let saveResult;
          switch (document.method) {
            case 'saveTranscriptionToGoogleDrive':
              saveResult = await this.saveTranscriptionToGoogleDrive(document.data, meetingInfo, recordingsBaseFolder);
              break;
            case 'saveSummaryToGoogleDrive':
              saveResult = await this.saveSummaryToGoogleDrive(document.data, meetingInfo, recordingsBaseFolder);
              break;
            case 'saveStructuredSummaryToGoogleDrive':
              saveResult = await this.saveStructuredSummaryToGoogleDrive(document.data, meetingInfo, recordingsBaseFolder);
              break;
            default:
              throw new Error(`Unknown save method: ${document.method}`);
          }

          savedDocuments.push(saveResult);
          logger.info(`Successfully saved ${document.type} on attempt ${attempt}`);
          saveSuccess = true;
          break;

        } catch (error) {
          lastError = error;
          logger.warn(`Failed to save ${document.type} on attempt ${attempt}/${maxRetries}: ${error.message}`);
          
          // 最後の試行でない場合は待機
          if (attempt < maxRetries) {
            const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            logger.info(`Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }

      if (!saveSuccess) {
        const errorInfo = {
          type: document.type,
          error: lastError.message,
          allAttemptsFailed: true
        };
        errors.push(errorInfo);
        logger.error(`All ${maxRetries} attempts failed for ${document.type}: ${lastError.message}`);
      }
    }

    // 結果の集計
    const result = {
      success: savedDocuments.length > 0,
      totalRequested: documentsToSave.length,
      totalSaved: savedDocuments.length,
      totalFailed: errors.length,
      savedDocuments: savedDocuments,
      errors: errors,
      timestamp: new Date().toISOString()
    };

    if (errors.length > 0) {
      logger.warn(`Document save completed with ${errors.length} errors out of ${documentsToSave.length} total attempts`);
    } else {
      logger.info(`All ${savedDocuments.length} documents saved successfully`);
    }

    return result;
  }
}

module.exports = DocumentStorageService;