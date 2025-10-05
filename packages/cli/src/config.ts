/**
 * Configuration schema for Claude Code Router
 */
export interface ConfigSchema {
  /**
   * Enable logging
   * @default true
   */
  LOG?: boolean;

  /**
   * Log level for debugging
   * @default "debug"
   */
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';

  /**
   * Path to Claude Code executable
   * @default ""
   */
  CLAUDE_PATH?: string;

  /**
   * Host address for the server
   * @default "0.0.0.0"
   */
  HOST?: string;

  /**
   * Port number for the server
   * @default 3456
   */
  PORT?: number;

  /**
   * API key for authentication
   * @default "sk-123"
   */
  APIKEY?: string;

  /**
   * API timeout in milliseconds
   * @default "600000"
   */
  API_TIMEOUT_MS?: string | number;

  /**
   * Proxy URL if needed
   * @default ""
   */
  PROXY_URL?: string;

  /**
   * Transformers configuration
   */
  transformers?: Array<{
    /**
     * Path to the transformer file
     */
    path: string;

    /**
     * Options for the transformer
     */
    options?: Record<string, any>;
  }>;

  /**
   * Providers configuration
   */
  Providers?: Array<{
    /**
     * Name of the provider
     */
    name: string;

    /**
     * API base URL for the provider
     */
    api_base_url: string;

    /**
     * API key for the provider
     */
    api_key: string;

    /**
     * List of supported models
     */
    models: string[];

    /**
     * Transformer configuration for the provider
     */
    transformer?: {
      /**
       * List of transformers to use
       */
      use?: Array<string | [string, Record<string, any>]>;

      /**
       * Model-specific transformer configuration
       */
      [model: string]: {
        use?: Array<string | [string, Record<string, any>]>;
      };
    };
  }>;

  /**
   * Status line configuration
   */
  StatusLine?: {
    /**
     * Whether status line is enabled
     * @default true
     */
    enabled?: boolean;

    /**
     * Current style of the status line
     * @default "default"
     */
    currentStyle?: string;

    /**
     * Style definitions
     */
    [styleName: string]: {
      modules: Array<{
        type: 'workDir' | 'gitBranch' | 'model' | 'usage' | 'script';
        icon: string;
        text: string;
        color: string;
        background?: string;
        scriptPath?: string;
      }>;
    };
  };

  /**
   * Router configuration
   */
  Router?: {
    /**
     * Default routing rule
     * @default "iflow,qwen3-coder-plus"
     */
    default?: string;

    /**
     * Background task routing rule
     * @default "bigmodelanthropic,glm-4.5-air"
     */
    background?: string;

    /**
     * Thinking/analysis task routing rule
     * @default "iflow,qwen3-235B-A22B-Thinking-2507"
     */
    think?: string;

    /**
     * Long context task routing rule
     * @default "qwen-cli,qwen3-coder-plus"
     */
    longContext?: string;

    /**
     * Threshold for long context in characters
     * @default 200000
     */
    longContextThreshold?: number;

    /**
     * Web search task routing rule
     * @default "gemini-cli,gemini-2.5-flash"
     */
    webSearch?: string;

    /**
     * Image processing task routing rule
     * @default "iflow,qwen3-vl-plus"
     */
    image?: string;
  };

  /**
   * Custom router file path
   * @default ""
   */
  CUSTOM_ROUTER_PATH?: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ConfigSchema = {
  LOG: true,
  LOG_LEVEL: 'debug',
  CLAUDE_PATH: '',
  HOST: '0.0.0.0',
  PORT: 3456,
  APIKEY: 'sk-123',
  API_TIMEOUT_MS: '600000',
  PROXY_URL: '',
  transformers: [],
  Providers: [],
  StatusLine: {
    enabled: true,
    currentStyle: 'default'
  },
  Router: {
    longContextThreshold: 200000
  },
  CUSTOM_ROUTER_PATH: ''
};