import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";
import { promises as fs } from "fs";
import {
  ITokenizer,
  TokenizeRequest,
} from "../types/tokenizer";
import { Tokenizer } from "@huggingface/tokenizers";

/**
 * Options for HuggingFace tokenizer
 */
interface HFTokenizerOptions {
  timeout?: number;
  cacheDir?: string;
}

/**
 * HuggingFace tokenizer implementation
 * Uses @huggingface/tokenizers library for lightweight tokenization
 */
export class HuggingFaceTokenizer implements ITokenizer {
  readonly type = "huggingface";
  readonly name: string;
  private readonly modelId: string;
  private readonly logger: any;
  private readonly options: HFTokenizerOptions;
  private tokenizer: any = null;
  private readonly cacheDir: string;
  private readonly safeModelName: string;

  constructor(modelId: string, logger: any, options: HFTokenizerOptions = {}) {
    this.modelId = modelId;
    this.logger = logger;
    this.options = options;
    this.cacheDir = options.cacheDir || join(homedir(), ".claude-code-router", ".huggingface");
    // Cache safe model name to avoid repeated regex operations
    this.safeModelName = modelId.replace(/\//g, "_").replace(/[^a-zA-Z0-9_-]/g, "_");
    this.name = `huggingface-${modelId.split("/").pop()}`;
  }

  /**
   * Get cache file paths for tokenizer files
   */
  private getCachePaths() {
    const modelDir = join(this.cacheDir, this.safeModelName);
    return {
      modelDir,
      tokenizerJson: join(modelDir, "tokenizer.json"),
      tokenizerConfig: join(modelDir, "tokenizer_config.json"),
    };
  }

  /**
   * Ensure directory exists
   */
  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load tokenizer files from local cache
   */
  private async loadFromCache(): Promise<{ tokenizerJson: any; tokenizerConfig: any } | null> {
    try {
      const paths = this.getCachePaths();

      if (!existsSync(paths.tokenizerJson) || !existsSync(paths.tokenizerConfig)) {
        return null;
      }

      const [tokenizerJsonContent, tokenizerConfigContent] = await Promise.all([
        fs.readFile(paths.tokenizerJson, "utf-8"),
        fs.readFile(paths.tokenizerConfig, "utf-8"),
      ]);

      return {
        tokenizerJson: JSON.parse(tokenizerJsonContent),
        tokenizerConfig: JSON.parse(tokenizerConfigContent),
      };
    } catch (error: any) {
      this.logger?.warn(`Failed to load from cache: ${error.message}`);
      return null;
    }
  }

  /**
   * Download tokenizer files from Hugging Face Hub and save to cache
   */
  private async downloadAndCache(): Promise<{ tokenizerJson: any; tokenizerConfig: any }> {
    const paths = this.getCachePaths();
    const urls = {
      json: `https://huggingface.co/${this.modelId}/resolve/main/tokenizer.json`,
      config: `https://huggingface.co/${this.modelId}/resolve/main/tokenizer_config.json`,
    };

    this.logger?.info(`Downloading tokenizer files for ${this.modelId}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout || 30000);

    try {
      const [jsonRes, configRes] = await Promise.all([
        fetch(urls.json, { signal: controller.signal }),
        fetch(urls.config, { signal: controller.signal }),
      ]);

      if (!jsonRes.ok) {
        throw new Error(`Failed to fetch tokenizer.json: ${jsonRes.statusText}`);
      }

      const [tokenizerJson, tokenizerConfig] = await Promise.all([
        jsonRes.json(),
        configRes.ok ? configRes.json() : Promise.resolve({}),
      ]);

      this.ensureDir(paths.modelDir);
      await Promise.all([
        fs.writeFile(paths.tokenizerJson, JSON.stringify(tokenizerJson, null, 2)),
        fs.writeFile(paths.tokenizerConfig, JSON.stringify(tokenizerConfig, null, 2)),
      ]);

      return { tokenizerJson, tokenizerConfig };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async initialize(): Promise<void> {
    try {
      this.logger?.info(`Initializing HuggingFace tokenizer: ${this.modelId}`);

      const paths = this.getCachePaths();
      this.ensureDir(this.cacheDir);

      const tokenizerData = await this.loadFromCache() || await this.downloadAndCache();
      this.tokenizer = new Tokenizer(tokenizerData.tokenizerJson, tokenizerData.tokenizerConfig);

      this.logger?.info(`Tokenizer initialized: ${this.name}`);
    } catch (error: any) {
      this.logger?.error(`Failed to initialize tokenizer: ${error.message}`);
      throw new Error(`Failed to initialize HuggingFace tokenizer for ${this.modelId}: ${error.message}`);
    }
  }

  async countTokens(request: TokenizeRequest): Promise<number> {
    if (!this.tokenizer) {
      throw new Error("Tokenizer not initialized");
    }

    try {
      const text = this.extractTextFromRequest(request);
      return this.tokenizer.encode(text).ids.length;
    } catch (error: any) {
      this.logger?.error(`Error counting tokens: ${error.message}`);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.tokenizer !== null;
  }

  /**
   * Encode text to tokens (for simple text tokenization)
   */
  encodeText(text: string): number[] {
    if (!this.tokenizer) {
      throw new Error("Tokenizer not initialized");
    }
    return this.tokenizer.encode(text).ids;
  }

  dispose(): void {
    this.tokenizer = null;
  }

  /**
   * Extract text from tokenize request
   */
  private extractTextFromRequest(request: TokenizeRequest): string {
    const parts: string[] = [];
    const { messages, system, tools } = request;

    // Extract messages
    if (Array.isArray(messages)) {
      for (const message of messages) {
        if (typeof message.content === "string") {
          parts.push(message.content);
        } else if (Array.isArray(message.content)) {
          for (const contentPart of message.content) {
            if (contentPart.type === "text" && contentPart.text) {
              parts.push(contentPart.text);
            } else if (contentPart.type === "tool_use" && contentPart.input) {
              parts.push(JSON.stringify(contentPart.input));
            } else if (contentPart.type === "tool_result") {
              parts.push(
                typeof contentPart.content === "string"
                  ? contentPart.content
                  : JSON.stringify(contentPart.content)
              );
            }
          }
        }
      }
    }

    // Extract system
    if (typeof system === "string") {
      parts.push(system);
    } else if (Array.isArray(system)) {
      for (const item of system) {
        if (item.type === "text") {
          if (typeof item.text === "string") {
            parts.push(item.text);
          } else if (Array.isArray(item.text)) {
            for (const textPart of item.text) {
              if (textPart) parts.push(textPart);
            }
          }
        }
      }
    }

    // Extract tools
    if (tools) {
      for (const tool of tools) {
        if (tool.name) parts.push(tool.name);
        if (tool.description) parts.push(tool.description);
        if (tool.input_schema) parts.push(JSON.stringify(tool.input_schema));
      }
    }

    return parts.join(" ");
  }
}
