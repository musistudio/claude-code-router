import {
  ITokenizer,
  TokenizeRequest,
  TokenizerConfig,
  ApiRequestFormat,
} from "../types/tokenizer";

/**
 * Options for API tokenizer
 */
interface ApiTokenizerOptions {
  timeout?: number;
}

/**
 * API-based tokenizer implementation
 * Calls provider's tokenization API to get token counts
 * Supports flexible configuration for different API formats
 */
export class ApiTokenizer implements ITokenizer {
  readonly type = "api";
  readonly name: string;
  private config: Required<Pick<TokenizerConfig, 'url' | 'apiKey' | 'requestFormat' | 'responseField'>> & {
    headers: Record<string, string>;
  };
  private logger: any;
  private options: ApiTokenizerOptions;

  constructor(
    config: TokenizerConfig,
    logger: any,
    options: ApiTokenizerOptions = {}
  ) {
    if (!config.url || !config.apiKey) {
      throw new Error("API tokenizer requires url and apiKey");
    }

    this.config = {
      url: config.url,
      apiKey: config.apiKey,
      requestFormat: config.requestFormat || "standard",
      responseField: config.responseField || "token_count",
      headers: config.headers || {},
    };
    this.logger = logger;
    this.options = options;

    try {
      const url = new URL(config.url);
      this.name = `api-${url.hostname}`;
    } catch {
      this.name = `api-${config.url}`;
    }
  }

  async initialize(): Promise<void> {
    // API tokenizers don't need initialization
    // Just verify the URL is valid
    try {
      new URL(this.config.url);
    } catch (error) {
      throw new Error(`Invalid API URL: ${this.config.url}`);
    }
  }

  async countTokens(request: TokenizeRequest): Promise<number> {
    try {
      // Prepare request body based on format
      const requestBody = this.formatRequestBody(request);

      // Prepare headers
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      };

      // Make API call
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.options.timeout || 30000
      );

      const response = await fetch(this.config.url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `API tokenizer request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Extract token count from response
      const tokenCount = this.extractTokenCount(data);

      return tokenCount;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw new Error("API tokenizer request timed out");
      }
      throw error;
    }
  }

  isInitialized(): boolean {
    return true;
  }

  dispose(): void {
    // Nothing to dispose for API tokenizer
  }

  /**
   * Format request body based on requestFormat
   */
  private formatRequestBody(request: TokenizeRequest): any {
    switch (this.config.requestFormat) {
      case "standard":
        // Standard format: send the entire request
        return request;

      case "openai":
        // OpenAI format: extract text content and format as OpenAI request
        return {
          model: "gpt-3.5-turbo", // Placeholder, some APIs require this
          messages: this.extractMessagesAsOpenAIFormat(request),
        };

      case "anthropic":
        // Anthropic format: extract messages and tools
        return {
          messages: request.messages || [],
          system: request.system,
          tools: request.tools,
        };

      case "custom":
        // Custom format: send concatenated text
        return {
          text: this.extractConcatenatedText(request),
        };

      default:
        return request;
    }
  }

  /**
   * Extract messages in OpenAI format
   */
  private extractMessagesAsOpenAIFormat(request: TokenizeRequest): any[] {
    if (!request.messages) return [];

    return request.messages.map((msg) => ({
      role: msg.role,
      content: this.extractTextFromMessage(msg),
    }));
  }

  /**
   * Extract text from a message
   */
  private extractTextFromMessage(message: any): string {
    if (typeof message.content === "string") {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .map((part: any) => {
          if (part.type === "text" && part.text) {
            return part.text;
          } else if (part.type === "tool_use" && part.input) {
            return JSON.stringify(part.input);
          } else if (part.type === "tool_result") {
            return typeof part.content === "string"
              ? part.content
              : JSON.stringify(part.content);
          }
          return "";
        })
        .join(" ");
    }

    return "";
  }

  /**
   * Extract all text from request
   */
  private extractConcatenatedText(request: TokenizeRequest): string {
    const parts: string[] = [];

    // Extract messages
    if (request.messages) {
      request.messages.forEach((msg) => {
        parts.push(this.extractTextFromMessage(msg));
      });
    }

    // Extract system
    if (typeof request.system === "string") {
      parts.push(request.system);
    } else if (Array.isArray(request.system)) {
      request.system.forEach((item: any) => {
        if (item.type === "text") {
          if (typeof item.text === "string") {
            parts.push(item.text);
          } else if (Array.isArray(item.text)) {
            item.text.forEach((textPart: any) => {
              if (textPart) parts.push(textPart);
            });
          }
        }
      });
    }

    // Extract tools
    if (request.tools) {
      request.tools.forEach((tool) => {
        if (tool.name) parts.push(tool.name);
        if (tool.description) parts.push(tool.description);
        if (tool.input_schema) parts.push(JSON.stringify(tool.input_schema));
      });
    }

    return parts.join(" ");
  }

  /**
   * Extract token count from response using the configured field path
   */
  private extractTokenCount(data: any): number {
    try {
      const fieldPath = this.config.responseField;
      const parts = fieldPath.split(".");

      let value: any = data;
      for (const part of parts) {
        if (value === undefined || value === null) {
          throw new Error(`Field path '${fieldPath}' not found in response`);
        }
        value = value[part];
      }

      if (typeof value !== "number") {
        throw new Error(
          `Expected number at field path '${fieldPath}', got ${typeof value}`
        );
      }

      return value;
    } catch (error: any) {
      this.logger?.error(
        `Failed to extract token count from API response: ${error.message}. Response: ${JSON.stringify(data)}`
      );
      throw new Error(
        `Invalid response from API tokenizer: ${error.message}`
      );
    }
  }
}
