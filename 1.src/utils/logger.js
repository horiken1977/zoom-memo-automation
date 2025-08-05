const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');
const config = require('../config');

// ログディレクトリを確保（Vercel等のサーバーレス環境では無効化）
const logDir = path.dirname(config.logging.file);
let canWriteFiles = true;

// Vercel環境や読み取り専用環境でのディレクトリ作成を安全に処理
try {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    // Vercel環境ではファイル書き込みをスキップ
    canWriteFiles = false;
  } else {
    fs.ensureDirSync(logDir);
  }
} catch (error) {
  console.warn('⚠️ ログディレクトリの作成に失敗しました。コンソール出力のみに切り替えます:', error.message);
  canWriteFiles = false;
}

// カスタムログフォーマット
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` | Meta: ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\\nStack: ${stack}`;
    }
    
    return log;
  })
);

// Winstonロガーの作成
const transports = [];

// ファイル書き込みが可能な環境でのみファイルトランスポートを追加
if (canWriteFiles) {
  transports.push(
    // ファイル出力  
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // エラーログ専用ファイル
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 3
    })
  );
}

// コンソールトランスポートを追加（本番環境でもファイル書き込み不可の場合は必須）
if (!canWriteFiles || config.nodeEnv !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level}: ${message}`;
        })
      )
    })
  );
}

const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: transports
});

// Note: Console transport is now handled in the main transport configuration above

// 追加のヘルパーメソッド
logger.meetingStart = (meetingInfo) => {
  logger.info('Meeting processing started', {
    meetingId: meetingInfo.id,
    topic: meetingInfo.topic,
    startTime: meetingInfo.startTime,
    duration: meetingInfo.duration
  });
};

logger.meetingComplete = (meetingInfo, processingTime) => {
  logger.info('Meeting processing completed', {
    meetingId: meetingInfo.id,
    topic: meetingInfo.topic,
    processingTimeSeconds: processingTime
  });
};

logger.meetingError = (meetingInfo, error) => {
  logger.error('Meeting processing failed', {
    meetingId: meetingInfo?.id,
    topic: meetingInfo?.topic,
    error: error.message,
    stack: error.stack
  });
};

logger.apiCall = (service, method, status, responseTime) => {
  logger.info('API call completed', {
    service,
    method,
    status,
    responseTimeMs: responseTime
  });
};

logger.fileOperation = (operation, filePath, success, size) => {
  logger.info('File operation completed', {
    operation,
    filePath,
    success,
    fileSizeBytes: size
  });
};

module.exports = logger;