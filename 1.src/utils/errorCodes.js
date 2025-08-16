/**
 * Zoom Memo Automation - 標準エラーコード体系
 * 
 * 設計方針:
 * - 全エラーが対処必須（重要度分類なし）
 * - リトライ可能性を重視（ネットワーク・API負荷対策）
 * - Slack通知でログリンク付き通知
 * - 将来拡張用コード範囲確保済み
 * 
 * コード体系:
 * ZM: Zoom API, GD: Google Drive, AU: Audio Processing, SL: Slack API, SY: System
 * MS: Microsoft系(確保), NT: Notification系(確保)
 */

const ERROR_CODES = {
  // ========================================
  // Zoom API Errors (ZM001-ZM010)
  // ========================================
  ZM001: {
    code: 'ZM001',
    message: 'Zoom API認証失敗',
    messageEn: 'Zoom API authentication failed',
    retryable: false,
    notifySlack: true,
    troubleshooting: 'ZOOM_API_KEY、ZOOM_API_SECRET、ZOOM_ACCOUNT_IDを確認してください'
  },
  
  ZM002: {
    code: 'ZM002', 
    message: 'Zoom APIレート制限超過',
    messageEn: 'Zoom API rate limit exceeded',
    retryable: true,
    notifySlack: true,
    troubleshooting: 'APIリクエスト頻度を下げるか、しばらく待ってからリトライしてください'
  },
  
  ZM003: {
    code: 'ZM003',
    message: 'Zoom録画データ取得失敗',
    messageEn: 'Failed to fetch Zoom recording data',
    retryable: true,
    notifySlack: true,
    troubleshooting: '録画ファイルの存在とアクセス権限を確認してください'
  },
  
  ZM004: {
    code: 'ZM004',
    message: 'Zoom録画ファイルが存在しない',
    messageEn: 'Zoom recording file not found',
    retryable: false,
    notifySlack: true,
    troubleshooting: '録画が正常に完了しているか、削除されていないか確認してください'
  },
  
  ZM005: {
    code: 'ZM005',
    message: 'Zoom録画ファイルの形式未対応',
    messageEn: 'Unsupported Zoom recording file format',
    retryable: false,
    notifySlack: true,
    troubleshooting: 'サポート形式: MP4, M4A, MP3, WAV'
  },
  
  ZM006: {
    code: 'ZM006',
    message: 'Zoom APIレスポンス不正',
    messageEn: 'Invalid Zoom API response',
    retryable: true,
    notifySlack: true,
    troubleshooting: 'ZoomのAPIステータスを確認してください'
  },
  
  ZM007: {
    code: 'ZM007',
    message: 'Zoom API接続タイムアウト',
    messageEn: 'Zoom API connection timeout',
    retryable: true,
    notifySlack: false, // 一時的なネットワーク問題のため通知なし
    troubleshooting: 'ネットワーク状況を確認してください。自動でリトライします'
  },
  
  ZM008: {
    code: 'ZM008',
    message: 'Zoomアカウント権限不足',
    messageEn: 'Insufficient Zoom account permissions',
    retryable: false,
    notifySlack: true,
    troubleshooting: 'Zoomアカウントの録画アクセス権限を確認してください'
  },
  
  ZM009: {
    code: 'ZM009',
    message: 'Zoom録画データサイズ制限超過',
    messageEn: 'Zoom recording data size limit exceeded',
    retryable: false,
    notifySlack: true,
    troubleshooting: '録画ファイルサイズを確認し、分割処理を検討してください'
  },
  
  ZM010: {
    code: 'ZM010',
    message: 'Zoom録画ダウンロード失敗',
    messageEn: 'Failed to download Zoom recording',
    retryable: true,
    notifySlack: true,
    troubleshooting: 'ネットワーク状況と録画ファイルの可用性を確認してください'
  },

  // ========================================
  // Google Drive API Errors (GD001-GD010)
  // ========================================
  GD001: {
    code: 'GD001',
    message: 'Google Drive API認証失敗',
    messageEn: 'Google Drive API authentication failed',
    retryable: false,
    notifySlack: true,
    troubleshooting: 'GOOGLE_DRIVE_CREDENTIALSを確認してください'
  },
  
  GD002: {
    code: 'GD002',
    message: 'Google Drive容量制限超過',
    messageEn: 'Google Drive storage quota exceeded',
    retryable: false,
    notifySlack: true,
    troubleshooting: 'Google Driveの容量を確認し、不要ファイルを削除してください'
  },
  
  GD003: {
    code: 'GD003',
    message: 'Google Driveファイルアップロード失敗',
    messageEn: 'Failed to upload file to Google Drive',
    retryable: true,
    notifySlack: true,
    troubleshooting: 'ネットワーク状況とGoogle Drive APIステータスを確認してください'
  },
  
  GD004: {
    code: 'GD004',
    message: 'Google Driveフォルダ作成失敗',
    messageEn: 'Failed to create Google Drive folder',
    retryable: true,
    notifySlack: true,
    troubleshooting: '親フォルダの存在と権限を確認してください'
  },
  
  GD005: {
    code: 'GD005',
    message: 'Google Drive共有リンク生成失敗',
    messageEn: 'Failed to create Google Drive share link',
    retryable: true,
    notifySlack: false, // 共有リンクは必須ではないため
    troubleshooting: 'ファイルの共有設定を確認してください'
  },
  
  GD006: {
    code: 'GD006',
    message: 'Google Driveファイル検索失敗',
    messageEn: 'Failed to search files in Google Drive',
    retryable: true,
    notifySlack: false,
    troubleshooting: 'フォルダIDとファイル名を確認してください'
  },
  
  GD007: {
    code: 'GD007',
    message: 'Google Drive権限設定失敗',
    messageEn: 'Failed to set Google Drive permissions',
    retryable: true,
    notifySlack: false,
    troubleshooting: 'サービスアカウントの権限設定を確認してください'
  },
  
  GD008: {
    code: 'GD008',
    message: 'Google Drive APIレート制限超過',
    messageEn: 'Google Drive API rate limit exceeded',
    retryable: true,
    notifySlack: true,
    troubleshooting: 'APIリクエスト頻度を下げてリトライしてください'
  },
  
  GD009: {
    code: 'GD009',
    message: 'Google Drive API接続タイムアウト',
    messageEn: 'Google Drive API connection timeout',
    retryable: true,
    notifySlack: false,
    troubleshooting: 'ネットワーク状況を確認してください。自動でリトライします'
  },
  
  GD010: {
    code: 'GD010',
    message: 'Google Driveファイル削除失敗',
    messageEn: 'Failed to delete file from Google Drive',
    retryable: true,
    notifySlack: false,
    troubleshooting: 'ファイルの存在と削除権限を確認してください'
  },

  // ========================================
  // Audio Processing Errors (AU001-AU010)
  // ========================================
  AU001: {
    code: 'AU001',
    message: '音声ファイルダウンロード失敗',
    messageEn: 'Audio file download failed',
    retryable: true,
    notifySlack: true,
    troubleshooting: 'ネットワーク状況と音声ファイルの可用性を確認してください'
  },
  
  AU002: {
    code: 'AU002',
    message: '音声圧縮処理失敗',
    messageEn: 'Audio compression failed',
    retryable: true,
    notifySlack: true,
    troubleshooting: 'ファイル形式確認、メモリ不足チェック'
  },
  
  AU003: {
    code: 'AU003',
    message: 'Gemini文字起こし失敗',
    messageEn: 'Gemini transcription failed',
    retryable: true,
    notifySlack: true,
    troubleshooting: '音声ファイルの形式・品質を確認してください'
  },
  
  AU004: {
    code: 'AU004',
    message: '文字起こし結果が短すぎる',
    messageEn: 'Transcription result too short',
    retryable: true,
    notifySlack: true,
    troubleshooting: '音声品質確認、無音部分の確認、マイク設定確認'
  },
  
  AU005: {
    code: 'AU005',
    message: 'JSON解析失敗',
    messageEn: 'JSON parsing failed',
    retryable: true,
    notifySlack: true,
    troubleshooting: 'プロンプト簡略化、モデル変更、リトライ間隔調整'
  },
  
  AU006: {
    code: 'AU006',
    message: '音声品質警告',
    messageEn: 'Audio quality warning',
    retryable: false,
    notifySlack: false,
    troubleshooting: '録画環境改善の提案、品質レポート生成'
  },
  
  AU007: {
    code: 'AU007',
    message: '構造化要約生成失敗',
    messageEn: 'Structured summary generation failed',
    retryable: true,
    notifySlack: true,
    troubleshooting: 'フォールバック要約実行、プロンプト調整'
  },
  
  AU008: {
    code: 'AU008',
    message: 'リトライ回数上限到達',
    messageEn: 'Retry limit exceeded',
    retryable: false,
    notifySlack: true,
    troubleshooting: '手動再実行、音声ファイル個別確認'
  },
  
  AU009: {
    code: 'AU009',
    message: 'Gemini API接続エラー',
    messageEn: 'Gemini API connection error',
    retryable: true,
    notifySlack: false,
    troubleshooting: 'ネットワーク状況を確認してください。自動でリトライします'
  },
  
  AU010: {
    code: 'AU010',
    message: 'Geminiモデル変更必要',
    messageEn: 'Gemini model change required',
    retryable: true,
    notifySlack: false,
    troubleshooting: 'フォールバックモデルに自動切り替えしています'
  },

  // ========================================
  // Slack API Errors (SL001-SL010)
  // ========================================
  SL001: {
    code: 'SL001',
    message: 'Slack Bot認証失敗',
    messageEn: 'Slack Bot authentication failed',
    retryable: false,
    notifySlack: false, // Slack通知自体が失敗するため
    troubleshooting: 'SLACK_BOT_TOKENを確認してください'
  },
  
  SL002: {
    code: 'SL002',
    message: 'Slackチャンネルアクセス拒否',
    messageEn: 'Slack channel access denied',
    retryable: false,
    notifySlack: false,
    troubleshooting: 'Botのチャンネルアクセス権限を確認してください'
  },
  
  SL003: {
    code: 'SL003',
    message: 'Slackメッセージ投稿失敗',
    messageEn: 'Failed to post Slack message',
    retryable: true,
    notifySlack: false,
    troubleshooting: 'メッセージ形式とBot権限を確認してください'
  },
  
  SL004: {
    code: 'SL004',
    message: 'Slack APIレート制限超過',
    messageEn: 'Slack API rate limit exceeded',
    retryable: true,
    notifySlack: false,
    troubleshooting: 'しばらく待ってからリトライしてください'
  },
  
  SL005: {
    code: 'SL005',
    message: 'Slackチャンネルが存在しない',
    messageEn: 'Slack channel not found',
    retryable: false,
    notifySlack: false,
    troubleshooting: 'SLACK_CHANNEL_IDを確認してください'
  },
  
  SL006: {
    code: 'SL006',
    message: 'Slack Bot権限不足',
    messageEn: 'Insufficient Slack Bot permissions',
    retryable: false,
    notifySlack: false,
    troubleshooting: 'Bot Scopesを確認してください: chat:write, files:write'
  },
  
  SL007: {
    code: 'SL007',
    message: 'Slack API接続タイムアウト',
    messageEn: 'Slack API connection timeout',
    retryable: true,
    notifySlack: false,
    troubleshooting: 'ネットワーク状況を確認してください。自動でリトライします'
  },
  
  SL008: {
    code: 'SL008',
    message: 'Slackメッセージ形式エラー',
    messageEn: 'Slack message format error',
    retryable: false,
    notifySlack: false,
    troubleshooting: 'メッセージの構造とブロック形式を確認してください'
  },
  
  SL009: {
    code: 'SL009',
    message: 'Slackファイルアップロード失敗',
    messageEn: 'Failed to upload file to Slack',
    retryable: true,
    notifySlack: false,
    troubleshooting: 'ファイルサイズと形式を確認してください'
  },
  
  SL010: {
    code: 'SL010',
    message: 'Slack通知設定無効',
    messageEn: 'Slack notifications disabled',
    retryable: false,
    notifySlack: false,
    troubleshooting: 'DISABLE_SLACK_NOTIFICATIONS設定を確認してください'
  },

  // ========================================
  // System Internal Errors (SY001-SY010)
  // ========================================
  SY001: {
    code: 'SY001',
    message: 'システムメモリ不足',
    messageEn: 'System memory insufficient',
    retryable: false,
    notifySlack: true,
    troubleshooting: 'Vercelのメモリ制限を確認し、ファイルサイズを小さくしてください'
  },
  
  SY002: {
    code: 'SY002',
    message: 'システム処理タイムアウト',
    messageEn: 'System processing timeout',
    retryable: true,
    notifySlack: true,
    troubleshooting: 'Vercel maxDuration設定を確認してください（現在300秒）'
  },
  
  SY003: {
    code: 'SY003',
    message: '環境変数未設定',
    messageEn: 'Environment variable not set',
    retryable: false,
    notifySlack: true,
    troubleshooting: '必要な環境変数がVercelに設定されているか確認してください'
  },
  
  SY004: {
    code: 'SY004',
    message: '設定ファイル読み込み失敗',
    messageEn: 'Failed to load configuration file',
    retryable: false,
    notifySlack: true,
    troubleshooting: '設定ファイルの存在と形式を確認してください'
  },
  
  SY005: {
    code: 'SY005',
    message: '一時ファイル作成失敗',
    messageEn: 'Failed to create temporary file',
    retryable: true,
    notifySlack: false,
    troubleshooting: 'メモリバッファ処理に切り替えています'
  },
  
  SY006: {
    code: 'SY006',
    message: 'JSON解析エラー',
    messageEn: 'JSON parsing error',
    retryable: false,
    notifySlack: true,
    troubleshooting: 'データ形式を確認してください'
  },
  
  SY007: {
    code: 'SY007',
    message: '日付フォーマットエラー',
    messageEn: 'Date format error',
    retryable: false,
    notifySlack: false,
    troubleshooting: '日付形式を確認してください: YYYY-MM-DD HH:mm:ss'
  },
  
  SY008: {
    code: 'SY008',
    message: 'バリデーションエラー',
    messageEn: 'Validation error',
    retryable: false,
    notifySlack: true,
    troubleshooting: '入力データの形式と必須項目を確認してください'
  },
  
  SY009: {
    code: 'SY009',
    message: '未知のエラー',
    messageEn: 'Unknown error',
    retryable: true,
    notifySlack: true,
    troubleshooting: 'ログを確認し、詳細情報を調査してください'
  },
  
  SY010: {
    code: 'SY010',
    message: '依存サービス停止',
    messageEn: 'Dependent service unavailable',
    retryable: true,
    notifySlack: true,
    troubleshooting: '外部サービスのステータスを確認してください'
  }
};

/**
 * エラー管理クラス
 */
class ErrorManager {
  /**
   * エラーコード定義を取得
   * @param {string} code - エラーコード
   * @returns {Object} エラー定義
   */
  static getError(code) {
    return ERROR_CODES[code] || ERROR_CODES.SY009; // 未知のエラー
  }
  
  /**
   * エラーオブジェクト作成
   * @param {string} code - エラーコード
   * @param {Object} context - コンテキスト情報
   * @returns {Object} エラーオブジェクト
   */
  static createError(code, context = {}) {
    const errorDef = this.getError(code);
    return {
      ...errorDef,
      context,
      timestamp: new Date().toISOString(),
      executionId: context.executionId || 'unknown'
    };
  }
  
  /**
   * リトライ対象エラーかチェック
   * @param {string} code - エラーコード
   * @returns {boolean} リトライ可能性
   */
  static isRetryable(code) {
    const error = this.getError(code);
    return error.retryable;
  }
  
  /**
   * Slack通知対象エラーかチェック
   * @param {string} code - エラーコード  
   * @returns {boolean} Slack通知要否
   */
  static shouldNotifySlack(code) {
    const error = this.getError(code);
    return error.notifySlack;
  }
  
  /**
   * リトライ対象のエラーコード一覧を取得
   * @returns {Array} リトライ対象エラーコード配列
   */
  static getRetryableErrors() {
    return Object.keys(ERROR_CODES).filter(code => ERROR_CODES[code].retryable);
  }
  
  /**
   * Slack通知対象のエラーコード一覧を取得
   * @returns {Array} Slack通知対象エラーコード配列
   */
  static getSlackNotificationErrors() {
    return Object.keys(ERROR_CODES).filter(code => ERROR_CODES[code].notifySlack);
  }
}

module.exports = {
  ERROR_CODES,
  ErrorManager
};