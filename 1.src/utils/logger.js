const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');
const config = require('../config');

// ログディレクトリを確保
const logDir = path.dirname(config.logging.file);
fs.ensureDirSync(logDir);

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
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
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
  ]
});

// 開発環境ではコンソール出力も追加
if (config.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] ${level}: ${message}`;
      })
    )
  }));
}

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