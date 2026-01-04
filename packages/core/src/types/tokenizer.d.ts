/**
 * Tokenizer configuration types
 */

/**
 * Tokenizer type enum
 */
export type TokenizerType = 'tiktoken' | 'huggingface' | 'api';

/**
 * API request format type
 */
export type ApiRequestFormat = 'standard' | 'openai' | 'anthropic' | 'custom';

/**
 * Configuration for a specific tokenizer
 */
export interface TokenizerConfig {
  /** Type of tokenizer to use */
  type: TokenizerType;

  /** For tiktoken: encoding name (e.g., 'cl100k_base', 'p50k_base') */
  encoding?: string;

  /** For huggingface: model ID (e.g., 'Qwen/Qwen2.5-Coder-32B-Instruct') */
  model?: string;

  /** For API-based tokenizers: complete API URL (e.g., 'https://api.example.com/v1/tokenize') */
  url?: string;

  /** For API-based tokenizers: API key */
  apiKey?: string;

  /** For API-based tokenizers: request format (default: 'standard') */
  requestFormat?: ApiRequestFormat;

  /** For API-based tokenizers: response field path to extract token count (default: 'token_count') */
  responseField?: string;

  /** For API-based tokenizers: custom request headers */
  headers?: Record<string, string>;

  /** Fallback tokenizer type if this one fails */
  fallback?: TokenizerType;
}

/**
 * Options for TokenizerService
 */
export interface TokenizerOptions {
  /** Enable token count caching */
  cacheEnabled?: boolean;

  /** Maximum cache size */
  cacheSize?: number;

  /** Timeout for API calls (in milliseconds) */
  timeout?: number;
}

/**
 * Token count request structure (matches existing calculateTokenCount interface)
 */
export interface TokenizeRequest {
  messages: Array<{
    role: string;
    content: string | Array<{
      type: string;
      text?: string;
      input?: any;
      content?: string | any;
    }>;
  }>;
  system?: string | Array<{
    type: string;
    text?: string | string[];
  }>;
  tools?: Array<{
    name: string;
    description?: string;
    input_schema: object;
  }>;
}

/**
 * Result from token counting operation
 */
export interface TokenizerResult {
  /** Total token count */
  tokenCount: number;

  /** Name/type of tokenizer used */
  tokenizerUsed: string;

  /** Whether the result was from cache */
  cached: boolean;
}

/**
 * Abstract interface for all tokenizers
 */
export interface ITokenizer {
  /** Tokenizer type identifier */
  readonly type: string;

  /** Human-readable tokenizer name */
  readonly name: string;

  /** Initialize the tokenizer (async for loading models, etc.) */
  initialize(): Promise<void>;

  /** Count tokens for a given request */
  countTokens(request: TokenizeRequest): Promise<number>;

  /** Encode text to tokens (for simple text tokenization) */
  encodeText?(text: string): number[];

  /** Check if tokenizer is initialized */
  isInitialized(): boolean;

  /** Clean up resources */
  dispose(): void;
}

/**
 * Provider-specific tokenizer configuration
 */
export interface ProviderTokenizerConfig {
  /** Default tokenizer for all models in this provider */
  default?: TokenizerConfig;

  /** Model-specific tokenizer configurations */
  models?: Record<string, TokenizerConfig>;
}
