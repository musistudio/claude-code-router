import { ConfigService } from "./config";
import {
  ITokenizer,
  TokenizeRequest,
  TokenizerConfig,
  TokenizerResult,
  TokenizerOptions,
} from "../types/tokenizer";
import { TiktokenTokenizer } from "../tokenizer/tiktoken-tokenizer";
import { HuggingFaceTokenizer } from "../tokenizer/huggingface-tokenizer";
import { ApiTokenizer } from "../tokenizer/api-tokenizer";

/**
 * TokenizerService - Manages tokenization for different model types
 *
 * Supports three types of tokenizers:
 * - tiktoken: Fast, OpenAI-compatible tokenizer (default)
 * - huggingface: Local model-based tokenizer for open-source models
 * - api: API-based tokenizer for closed-source models
 *
 * Features:
 * - Automatic fallback to tiktoken on errors
 * - Config-driven tokenizer selection
 * - Per-provider and per-model configuration
 */
export class TokenizerService {
  private tokenizers: Map<string, ITokenizer> = new Map();
  private configService: ConfigService;
  private logger: any;
  private options: TokenizerOptions;

  // Fallback tokenizer (default to tiktoken)
  private fallbackTokenizer?: ITokenizer;

  constructor(
    configService: ConfigService,
    logger: any,
    options: TokenizerOptions = {}
  ) {
    this.configService = configService;
    this.logger = logger;
    this.options = {
      timeout: options.timeout ?? 30000,
      ...options,
    };
  }

  async initialize(): Promise<void> {
    try {
      // Initialize fallback tokenizer (tiktoken with cl100k_base)
      this.fallbackTokenizer = new TiktokenTokenizer("cl100k_base");
      await this.fallbackTokenizer.initialize();
      this.tokenizers.set("fallback", this.fallbackTokenizer);

      this.logger?.info("TokenizerService initialized successfully");
    } catch (error: any) {
      this.logger?.error(
        `TokenizerService initialization error: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Get or create a tokenizer for specific configuration
   */
  async getTokenizer(config: TokenizerConfig): Promise<ITokenizer> {
    const cacheKey = this.getCacheKey(config);

    // Check cache first
    if (this.tokenizers.has(cacheKey)) {
      return this.tokenizers.get(cacheKey)!;
    }

    let tokenizer: ITokenizer;

    try {
      switch (config.type) {
        case "tiktoken":
          tokenizer = new TiktokenTokenizer(
            config.encoding || "cl100k_base"
          );
          break;

        case "huggingface":
          this.logger?.info(`Initializing HuggingFace tokenizer for model: ${config.model}`);
          tokenizer = new HuggingFaceTokenizer(
            config.model!,
            this.logger,
            { timeout: this.options.timeout }
          );
          break;

        case "api":
          tokenizer = new ApiTokenizer(
            config,
            this.logger,
            { timeout: this.options.timeout }
          );
          break;

        default:
          throw new Error(`Unknown tokenizer type: ${config.type}`);
      }

      this.logger?.info(`Calling initialize() on ${config.type} tokenizer...`);
      await tokenizer.initialize();
      this.tokenizers.set(cacheKey, tokenizer);

      this.logger?.info(
        `Tokenizer initialized successfully: ${config.type} (${cacheKey})`
      );

      return tokenizer;
    } catch (error: any) {
      this.logger?.error(
        `Failed to initialize ${config.type} tokenizer: ${error.message}`
      );
      this.logger?.error(`Error stack: ${error.stack}`);

      // Return fallback tokenizer
      if (!this.fallbackTokenizer) {
        await this.initialize();
      }
      return this.fallbackTokenizer!;
    }
  }

  /**
   * Count tokens for a request using the specified tokenizer configuration
   */
  async countTokens(
    request: TokenizeRequest,
    config?: TokenizerConfig
  ): Promise<TokenizerResult> {
    // Get appropriate tokenizer
    const tokenizer = config
      ? await this.getTokenizer(config)
      : this.fallbackTokenizer!;

    // Count tokens
    const tokenCount = await tokenizer.countTokens(request);

    return {
      tokenCount,
      tokenizerUsed: tokenizer.name,
      cached: false,
    };
  }

  /**
   * Get tokenizer configuration for a specific model/provider
   */
  getTokenizerConfigForModel(
    providerName: string,
    modelName: string
  ): TokenizerConfig | undefined {
    const providers = this.configService.get<any[]>("providers") || [];
    const provider = providers.find((p) => p.name === providerName);

    if (!provider?.tokenizer) {
      return undefined;
    }

    // Check model-specific config first
    if (provider.tokenizer.models?.[modelName]) {
      return provider.tokenizer.models[modelName];
    }

    // Fall back to default config
    return provider.tokenizer.default;
  }

  /**
   * Dispose all tokenizers
   */
  dispose(): void {
    this.tokenizers.forEach((tokenizer) => {
      try {
        tokenizer.dispose();
      } catch (error) {
        this.logger?.error(`Error disposing tokenizer: ${error}`);
      }
    });
    this.tokenizers.clear();
  }

  /**
   * Generate cache key from tokenizer config
   */
  private getCacheKey(config: TokenizerConfig): string {
    switch (config.type) {
      case "tiktoken":
        return `tiktoken:${config.encoding || "cl100k_base"}`;
      case "huggingface":
        return `hf:${config.model}`;
      case "api":
        return `api:${config.url}`;
      default:
        return `unknown:${JSON.stringify(config)}`;
    }
  }
}
