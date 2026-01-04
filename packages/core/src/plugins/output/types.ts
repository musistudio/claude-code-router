/**
 * Output handler interface
 * All output handlers must implement this interface
 */
export interface OutputHandler {
  /**
   * Output handler type name
   */
  type: string;

  /**
   * Output data
   * @param data Data to output
   * @param options Output options
   * @returns Promise<boolean> Whether output was successful
   */
  output(data: any, options?: OutputOptions): Promise<boolean>;
}

/**
 * Output options
 */
export interface OutputOptions {
  /**
   * Output format
   */
  format?: 'json' | 'text' | 'markdown';

  /**
   * Whether to include timestamp
   */
  timestamp?: boolean;

  /**
   * Custom prefix
   */
  prefix?: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;

  /**
   * Timeout (milliseconds)
   */
  timeout?: number;
}

/**
 * Console output handler configuration
 */
export interface ConsoleOutputConfig {
  /**
   * Whether to use colored output
   */
  colors?: boolean;

  /**
   * Log level
   */
  level?: 'log' | 'info' | 'warn' | 'error' | 'debug';
}

/**
 * Webhook output handler configuration
 */
export interface WebhookOutputConfig {
  /**
   * Webhook URL
   */
  url: string;

  /**
   * HTTP request method
   */
  method?: 'POST' | 'PUT' | 'PATCH';

  /**
   * Request headers
   */
  headers?: Record<string, string>;

  /**
   * Authentication information
   */
  auth?: {
    type: 'bearer' | 'basic' | 'custom';
    token?: string;
    username?: string;
    password?: string;
    custom?: {
      header: string;
      value: string;
    };
  };

  /**
   * Retry configuration
   */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };

  /**
   * Whether to handle failures silently (only log, don't throw)
   */
  silent?: boolean;
}

/**
 * WebSocket output handler configuration (reserved for future use)
 */
export interface WebSocketOutputConfig {
  /**
   * WebSocket URL
   */
  url: string;

  /**
   * Reconnection configuration
   */
  reconnect?: {
    maxAttempts: number;
    intervalMs: number;
  };

  /**
   * Heartbeat configuration
   */
  heartbeat?: {
    intervalMs: number;
    message?: string;
  };
}

/**
 * Temp file output handler configuration
 */
export interface TempFileOutputConfig {
  /**
   * Subdirectory under system temp directory (default: 'claude-code-router')
   */
  subdirectory?: string;

  /**
   * File extension (default: 'json')
   */
  extension?: string;

  /**
   * Whether to include timestamp in filename (default: true)
   */
  includeTimestamp?: boolean;

  /**
   * Custom prefix for temp files (default: 'session')
   */
  prefix?: string;
}

/**
 * Output handler registration configuration
 */
export interface OutputHandlerConfig {
  /**
   * Output handler type
   */
  type: 'console' | 'webhook' | 'websocket' | 'temp-file';

  /**
   * Whether enabled
   */
  enabled?: boolean;

  /**
   * Configuration options
   */
  config?: ConsoleOutputConfig | WebhookOutputConfig | WebSocketOutputConfig | TempFileOutputConfig;
}
