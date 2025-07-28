// Re-export from the new logger module for backward compatibility
export { logger as log, loggers } from './logger';

// Legacy log function wrapper for backward compatibility
export function legacyLog(...args: any[]) {
  const { logger } = require('./logger');
  
  const message = Array.isArray(args)
    ? args
        .map((arg) =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        )
        .join(' ')
    : '';
  
  logger.info(message);
}
