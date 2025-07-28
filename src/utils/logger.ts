import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import os from 'os';
import fs from 'fs';

const LOG_DIR = path.join(os.homedir(), '.claude-code-router', 'logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Custom format for better readability
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level.toUpperCase()}] ${message}`;
  
  // Add metadata if present
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

// Create transports
const transports: winston.transport[] = [
  // Console transport for development
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
    level: process.env.LOG_LEVEL || 'info',
  }),
];

// File transports for production
if (process.env.NODE_ENV !== 'test') {
  // General log file with rotation
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'ccr-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp(),
        customFormat
      ),
    })
  );

  // Error log file
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        customFormat
      ),
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    customFormat
  ),
  transports,
  exitOnError: false,
});

// Create child loggers for different components
export const createLogger = (component: string) => {
  return logger.child({ component });
};

// Logging utilities
export const loggers = {
  server: createLogger('server'),
  router: createLogger('router'),
  config: createLogger('config'),
  api: createLogger('api'),
  transformer: createLogger('transformer'),
};

// Stream for Morgan HTTP logging (if needed)
export const stream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// Helper functions for structured logging
export function logRequest(req: any, res: any, responseTime: number) {
  const { method, url, headers } = req;
  const { statusCode } = res;
  
  const logData = {
    method,
    url,
    statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: headers['user-agent'],
  };

  if (statusCode >= 400) {
    logger.warn('Request failed', logData);
  } else {
    logger.info('Request completed', logData);
  }
}

export function logApiCall(provider: string, model: string, details: any) {
  loggers.api.info('API call', {
    provider,
    model,
    ...details,
  });
}

export function logError(error: Error, context?: any) {
  logger.error(error.message, {
    stack: error.stack,
    name: error.name,
    ...context,
  });
}

// Debug mode helper
export function enableDebugMode() {
  logger.level = 'debug';
  logger.debug('Debug mode enabled');
}

export function disableDebugMode() {
  logger.level = 'info';
  logger.info('Debug mode disabled');
}