declare module "@musistudio/llms" {
  import { FastifyInstance } from "fastify";
  import { FastifyBaseLogger } from "fastify";

  export interface ServerConfig {
    jsonPath?: string;
    initialConfig?: any;
    logger?: any;
  }

  /**
   * Plugin configuration from config file
   */
  export interface PluginConfig {
    name: string;
    enabled?: boolean;
    options?: Record<string, any>;
  }

  export interface Server {
    app: FastifyInstance;
    logger: FastifyBaseLogger;
    start(): Promise<void>;
  }

  const Server: {
    new (config: ServerConfig): Server;
  };

  export default Server;

  // Export cache
  export interface Usage {
    input_tokens: number;
    output_tokens: number;
  }

  export const sessionUsageCache: any;

  // Export router
  export interface RouterContext {
    configService: any;
    event?: any;
  }

  export const router: (req: any, res: any, context: RouterContext) => Promise<void>;

  // Export utilities
  export const calculateTokenCount: (messages: any[], system: any, tools: any[]) => number;
  export const searchProjectBySession: (sessionId: string) => Promise<string | null>;

  // Export services
  export class ConfigService {
    constructor(options?: any);
    get<T = any>(key: string): T | undefined;
    get<T = any>(key: string, defaultValue: T): T;
    getAll(): any;
    has(key: string): boolean;
    set(key: string, value: any): void;
    reload(): void;
  }

  export class ProviderService {
    constructor(configService: any, transformerService: any, logger: any);
  }

  export class TransformerService {
    constructor(configService: any, logger: any);
    initialize(): Promise<void>;
  }

  // Tokenizer types
  export type TokenizerType = 'tiktoken' | 'huggingface' | 'api';
  export type ApiRequestFormat = 'standard' | 'openai' | 'anthropic' | 'custom';

  export interface TokenizerConfig {
    type: TokenizerType;
    encoding?: string;
    model?: string;
    url?: string;
    apiKey?: string;
    requestFormat?: ApiRequestFormat;
    responseField?: string;
    headers?: Record<string, string>;
    fallback?: TokenizerType;
  }

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

  export interface TokenizerResult {
    tokenCount: number;
    tokenizerUsed: string;
    cached: boolean;
  }

  export class TokenizerService {
    countTokens(request: TokenizeRequest, config?: TokenizerConfig): Promise<TokenizerResult>;
    getTokenizerConfigForModel(providerName: string, modelName: string): TokenizerConfig | undefined;
    clearCache(): void;
    dispose(): void;
  }

  // Token speed statistics types
  export interface TokenStats {
    requestId: string;
    startTime: number;
    firstTokenTime?: number;
    lastTokenTime: number;
    tokenCount: number;
    tokensPerSecond: number;
    timeToFirstToken?: number;
    contentBlocks: {
      index: number;
      tokenCount: number;
      speed: number;
    }[];
  }

  export function getTokenSpeedStats(): {
    current: TokenStats | null;
    global: {
      totalRequests: number;
      totalTokens: number;
      totalTime: number;
      avgTokensPerSecond: number;
      minTokensPerSecond: number;
      maxTokensPerSecond: number;
      avgTimeToFirstToken: number;
      allSpeeds: number[];
    };
    lastUpdate: number;
  };

  export function getGlobalTokenSpeedStats(): {
    totalRequests: number;
    totalTokens: number;
    totalTime: number;
    avgTokensPerSecond: number;
    minTokensPerSecond: number;
    maxTokensPerSecond: number;
    avgTimeToFirstToken: number;
    allSpeeds: number[];
  };
}
