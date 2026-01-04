import { OutputHandler, OutputOptions, WebhookOutputConfig } from './types';

/**
 * Webhook output handler
 * Supports sending data to HTTP endpoints with retry and authentication
 */
export class WebhookOutputHandler implements OutputHandler {
  type = 'webhook' as const;
  private config: WebhookOutputConfig;
  private defaultTimeout = 30000; // 30 second default timeout

  constructor(config: WebhookOutputConfig) {
    if (!config.url) {
      throw new Error('Webhook URL is required');
    }
    this.config = {
      method: 'POST',
      retry: {
        maxAttempts: 3,
        backoffMs: 1000
      },
      silent: false,
      ...config
    };
  }

  /**
   * Build request headers
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.config.headers || {})
    };

    // Add authentication headers
    if (this.config.auth) {
      switch (this.config.auth.type) {
        case 'bearer':
          if (this.config.auth.token) {
            headers['Authorization'] = `Bearer ${this.config.auth.token}`;
          }
          break;

        case 'basic':
          if (this.config.auth.username && this.config.auth.password) {
            const credentials = Buffer.from(
              `${this.config.auth.username}:${this.config.auth.password}`
            ).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
          }
          break;

        case 'custom':
          if (this.config.auth.custom) {
            headers[this.config.auth.custom.header] = this.config.auth.custom.value;
          }
          break;
      }
    }

    return headers;
  }

  /**
   * Build request body
   */
  private buildBody(data: any, options: OutputOptions): any {
    const { format = 'json', timestamp = true, prefix, metadata } = options || {};

    const body: any = {
      data
    };

    if (timestamp) {
      body.timestamp = new Date().toISOString();
    }

    if (prefix) {
      body.prefix = prefix;
    }

    if (metadata && Object.keys(metadata).length > 0) {
      body.metadata = metadata;
    }

    return body;
  }

  /**
   * Send HTTP request
   */
  private async sendRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: any,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Delay function (for retry backoff)
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send request with retry
   */
  private async sendWithRetry(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: any,
    timeout: number,
    retry: { maxAttempts: number; backoffMs: number }
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      try {
        return await this.sendRequest(url, method, headers, body, timeout);
      } catch (error) {
        lastError = error as Error;

        // If this is the last attempt, throw error directly
        if (attempt === retry.maxAttempts) {
          break;
        }

        // Calculate backoff time (exponential backoff)
        const backoffTime = retry.backoffMs * Math.pow(2, attempt - 1);

        console.warn(
          `[WebhookOutputHandler] Request failed (attempt ${attempt}/${retry.maxAttempts}), ` +
          `retrying in ${backoffTime}ms...`,
          (error as Error).message
        );

        await this.delay(backoffTime);
      }
    }

    throw lastError;
  }

  /**
   * Output data to Webhook
   */
  async output(data: any, options: OutputOptions = {}): Promise<boolean> {
    const timeout = options.timeout || this.defaultTimeout;

    try {
      const headers = this.buildHeaders();
      const body = this.buildBody(data, options);

      const response = await this.sendWithRetry(
        this.config.url,
        this.config.method!,
        headers,
        body,
        timeout,
        this.config.retry!
      );

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.config.silent) {
        console.error(`[WebhookOutputHandler] Failed to send data: ${errorMessage}`);
        return false;
      }

      throw new Error(`Webhook output failed: ${errorMessage}`);
    }
  }
}
