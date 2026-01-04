// Type definitions
export * from './types';

// Output handler implementations
export { ConsoleOutputHandler } from './console-handler';
export { WebhookOutputHandler } from './webhook-handler';
export { TempFileOutputHandler } from './temp-file-handler';

// Output manager
export { outputManager, output, outputTo } from './output-manager';

/**
 * Convenience function: Create and register a Console output handler
 * @param config Console output handler configuration
 * @returns Output manager instance
 */
export function registerConsoleOutput(config?: import('./types').ConsoleOutputConfig) {
  const { ConsoleOutputHandler } = require('./console-handler');
  const handler = new ConsoleOutputHandler(config);
  const { outputManager } = require('./output-manager');
  const name = 'console_' + Date.now();
  outputManager.registerHandler(name, handler);
  return outputManager;
}

/**
 * Convenience function: Create and register a Webhook output handler
 * @param config Webhook output handler configuration
 * @returns Output manager instance
 */
export function registerWebhookOutput(config: import('./types').WebhookOutputConfig) {
  const { WebhookOutputHandler } = require('./webhook-handler');
  const handler = new WebhookOutputHandler(config);
  const { outputManager } = require('./output-manager');
  const name = 'webhook_' + Date.now();
  outputManager.registerHandler(name, handler);
  return outputManager;
}

/**
 * Convenience function: Create and register a Temp File output handler
 * @param config Temp file output handler configuration
 * @returns Output manager instance
 */
export function registerTempFileOutput(config?: import('./types').TempFileOutputConfig) {
  const { TempFileOutputHandler } = require('./temp-file-handler');
  const handler = new TempFileOutputHandler(config);
  const { outputManager } = require('./output-manager');
  const name = 'temp-file_' + Date.now();
  outputManager.registerHandler(name, handler);
  return outputManager;
}

/**
 * Convenience function: Register output handlers in batch
 * @param configs Output handler configuration array
 * @returns Output manager instance
 */
export function registerOutputHandlers(configs: import('./types').OutputHandlerConfig[]) {
  const { outputManager } = require('./output-manager');
  outputManager.registerHandlers(configs);
  return outputManager;
}
