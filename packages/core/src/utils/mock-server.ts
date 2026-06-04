/**
 * Mock Server - Mock模式
 *
 * Returns pre-configured responses for testing without hitting real APIs.
 * Supports:
 * - Static response mapping
 * - Delayed responses (simulate latency)
 * - Error simulation
 * - Record/replay mode
 *
 * Design: Zero external dependencies. In-memory response store.
 */

import { createHash } from "crypto";

export interface MockConfig {
  enabled: boolean;
  /** Mode: 'static' | 'record' | 'replay' */
  mode: 'static' | 'record' | 'replay';
  /** Static response mappings */
  responses: MockResponse[];
  /** Default delay in ms (simulate network latency) */
  defaultDelayMs: number;
  /** Default error rate (0-1, simulate failures) */
  errorRate: number;
  /** Path to recorded responses file */
  recordingPath?: string;
}

const DEFAULT_CONFIG: MockConfig = {
  enabled: false,
  mode: 'static',
  responses: [],
  defaultDelayMs: 0,
  errorRate: 0,
};

export interface MockResponse {
  /** Match pattern (regex string or exact match) */
  matchPattern: string;
  /** Match field: 'model' | 'prompt' | 'any' */
  matchField: 'model' | 'prompt' | 'any';
  /** Response body */
  responseBody: any;
  /** Response status code */
  statusCode: number;
  /** Delay in ms (overrides default) */
  delayMs?: number;
  /** Whether to return as stream */
  streaming?: boolean;
}

export interface RecordedInteraction {
  requestFingerprint: string;
  requestBody: any;
  responseBody: any;
  statusCode: number;
  timestamp: number;
  latencyMs: number;
}

export class MockServer {
  private config: MockConfig;
  private logger?: any;
  private recordings: RecordedInteraction[] = [];
  private recordingIndex: Map<string, RecordedInteraction> = new Map();

  constructor(config: Partial<MockConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Check if a request should be mocked.
   */
  shouldMock(body: any): boolean {
    if (!this.config.enabled) return false;

    if (this.config.mode === 'static') {
      return this.config.responses.length > 0;
    }

    if (this.config.mode === 'replay') {
      const fingerprint = this.computeFingerprint(body);
      return this.recordingIndex.has(fingerprint);
    }

    return true; // record mode always processes
  }

  /**
   * Get a mock response for a request.
   */
  async getResponse(body: any): Promise<{ response: any; statusCode: number; delayMs: number } | null> {
    if (!this.config.enabled) return null;

    // Simulate error rate
    if (this.config.errorRate > 0 && Math.random() < this.config.errorRate) {
      return {
        response: {
          type: 'error',
          error: {
            type: 'mock_error',
            message: 'Simulated error (mock mode)',
          },
        },
        statusCode: 500,
        delayMs: 0,
      };
    }

    if (this.config.mode === 'static') {
      return this.getStaticResponse(body);
    }

    if (this.config.mode === 'replay') {
      return this.getReplayResponse(body);
    }

    return null;
  }

  /**
   * Record a request/response pair (for record mode).
   */
  record(body: any, response: any, statusCode: number, latencyMs: number): void {
    if (this.config.mode !== 'record') return;

    const interaction: RecordedInteraction = {
      requestFingerprint: this.computeFingerprint(body),
      requestBody: body,
      responseBody: response,
      statusCode,
      timestamp: Date.now(),
      latencyMs,
    };

    this.recordings.push(interaction);
    this.recordingIndex.set(interaction.requestFingerprint, interaction);

    this.logger?.debug(`Mock: recorded interaction (total=${this.recordings.length})`);
  }

  /**
   * Get all recordings (for saving to file).
   */
  getRecordings(): RecordedInteraction[] {
    return [...this.recordings];
  }

  /**
   * Load recordings from data.
   */
  loadRecordings(data: RecordedInteraction[]): void {
    this.recordings = data;
    this.recordingIndex.clear();
    for (const item of data) {
      this.recordingIndex.set(item.requestFingerprint, item);
    }
    this.logger?.info(`Mock: loaded ${data.length} recorded interactions`);
  }

  /**
   * Get mock stats.
   */
  getStats(): { mode: string; responses: number; recordings: number } {
    return {
      mode: this.config.mode,
      responses: this.config.responses.length,
      recordings: this.recordings.length,
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<MockConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private getStaticResponse(body: any): { response: any; statusCode: number; delayMs: number } | null {
    for (const mockResp of this.config.responses) {
      const matches = this.matchesPattern(body, mockResp);
      if (matches) {
        return {
          response: mockResp.responseBody,
          statusCode: mockResp.statusCode,
          delayMs: mockResp.delayMs ?? this.config.defaultDelayMs,
        };
      }
    }

    // Default mock response
    if (this.config.responses.length === 0) {
      return {
        response: this.buildDefaultMockResponse(body),
        statusCode: 200,
        delayMs: this.config.defaultDelayMs,
      };
    }

    return null;
  }

  private getReplayResponse(body: any): { response: any; statusCode: number; delayMs: number } | null {
    const fingerprint = this.computeFingerprint(body);
    const recorded = this.recordingIndex.get(fingerprint);

    if (recorded) {
      return {
        response: recorded.responseBody,
        statusCode: recorded.statusCode,
        delayMs: recorded.latencyMs,
      };
    }

    return null;
  }

  private matchesPattern(body: any, mockResp: MockResponse): boolean {
    try {
      const regex = new RegExp(mockResp.matchPattern, 'i');

      switch (mockResp.matchField) {
        case 'model':
          return regex.test(body.model || '');
        case 'prompt': {
          const lastUserMsg = body.messages?.filter((m: any) => m.role === 'user').pop();
          const text = typeof lastUserMsg?.content === 'string'
            ? lastUserMsg.content
            : JSON.stringify(lastUserMsg?.content || '');
          return regex.test(text);
        }
        case 'any':
          return regex.test(JSON.stringify(body));
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  private buildDefaultMockResponse(body: any): any {
    return {
      id: `mock-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model: body.model || 'mock-model',
      content: [
        {
          type: 'text',
          text: '[MOCK RESPONSE] This is a mock response from the proxy mock server. No real API call was made.',
        },
      ],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
    };
  }

  private computeFingerprint(body: any): string {
    const sanitized = { ...body };
    delete sanitized.stream;
    delete sanitized.metadata;
    const payload = JSON.stringify(sanitized);
    return createHash('sha256').update(payload).digest('hex').slice(0, 32);
  }
}

let globalMock: MockServer | null = null;

export function getMockServer(config?: Partial<MockConfig>, logger?: any): MockServer {
  if (!globalMock) {
    globalMock = new MockServer(config, logger);
  } else if (config) {
    globalMock.updateConfig(config);
  }
  return globalMock;
}
