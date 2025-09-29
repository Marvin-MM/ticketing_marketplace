import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'gray',
};

winston.addColors(colors);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Create daily rotate file transport for errors
const errorFileTransport = new DailyRotateFile({
  filename: path.join(config.logging.filePath, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  level: 'error',
  format: logFormat,
});

// Create daily rotate file transport for all logs
const combinedFileTransport = new DailyRotateFile({
  filename: path.join(config.logging.filePath, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
});

// Create transports array
const transports = [];

// Add file transports in production
if (config.app.isProduction) {
  transports.push(errorFileTransport);
  transports.push(combinedFileTransport);
}

// Add console transport in development
if (!config.app.isProduction) {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.logging.level,
    })
  );
} else {
  // Minimal console output in production
  transports.push(
    new winston.transports.Console({
      format: logFormat,
      level: 'error',
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level || 'info',
  levels,
  transports,
  exitOnError: false,
});

// Create stream for Morgan HTTP logging
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

// Export logger functions with context
export default {
  error: (message, meta) => logger.error(message, meta),
  warn: (message, meta) => logger.warn(message, meta),
  info: (message, meta) => logger.info(message, meta),
  http: (message, meta) => logger.http(message, meta),
  verbose: (message, meta) => logger.verbose(message, meta),
  debug: (message, meta) => logger.debug(message, meta),
  silly: (message, meta) => logger.silly(message, meta),
  stream: logger.stream,
  
  // Utility function for logging with context
  log: (level, message, context = {}) => {
    logger.log(level, message, context);
  },
  
  // Audit log helper
  audit: (action, entity, entityId, userId, changes = null) => {
    logger.info('AUDIT', {
      action,
      entity,
      entityId,
      userId,
      changes,
      timestamp: new Date().toISOString(),
    });
  },
  
  // Performance log helper
  performance: (operation, duration, metadata = {}) => {
    logger.info('PERFORMANCE', {
      operation,
      duration,
      ...metadata,
      timestamp: new Date().toISOString(),
    });
  },
  
  // Security log helper
  security: (event, userId, ipAddress, userAgent, metadata = {}) => {
    logger.warn('SECURITY', {
      event,
      userId,
      ipAddress,
      userAgent,
      ...metadata,
      timestamp: new Date().toISOString(),
    });
  },
};