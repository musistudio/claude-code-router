import { EventEmitter } from "events";

export interface LangfuseConfig {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
  enabled: boolean;
  flushIntervalMs?: number;
}

interface TraceState {
  traceId: string;
  generationId: string;
  startTime: number;
  model: string;
  input: string;
  chunks: string[];
  sessionId?: string;
}

const DEFAULT_CONFIG: LangfuseConfig = {
  enabled: false,
  baseUrl: "https://cloud.langfuse.com",
  flushIntervalMs: 5000,
};

export class LangfuseTracer extends EventEmitter {
  private config: LangfuseConfig;
  private client: any = null;
  private activeTraces: Map<string, TraceState> = new Map();
  private initialized = false;

  constructor(config: Partial<LangfuseConfig> = {}, private logger?: any) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled || !this.config.publicKey || !this.config.secretKey) {
      this.logger?.info("LangfuseTracer: disabled or not configured");
      return;
    }

    try {
      const { Langfuse } = await import("langfuse");
      this.client = new Langfuse({
        publicKey: this.config.publicKey,
        secretKey: this.config.secretKey,
        baseUrl: this.config.baseUrl,
      });
      this.initialized = true;
      this.logger?.info("LangfuseTracer: initialized successfully");
    } catch (error: any) {
      this.logger?.warn(`LangfuseTracer: init failed, running without tracing: ${error.message}`);
      this.initialized = false;
    }
  }

  onPreRoute(req: { id: string; body: any; sessionId?: string }): void {
    if (!this.initialized || !this.client) return;

    try {
      const body = req.body;
      const model = body.model || "unknown";
      const input = this.extractInput(body);

      const trace = this.client.trace({
        name: "claude-code-proxy",
        sessionId: req.sessionId || "default",
        metadata: { requestId: req.id },
      });

      const generation = trace.generation({
        name: `${model}-request`,
        model,
        input,
        metadata: { requestId: req.id },
      });

      this.activeTraces.set(req.id, {
        traceId: trace.id,
        generationId: generation.id,
        startTime: Date.now(),
        model,
        input: typeof input === "string" ? input : JSON.stringify(input),
        chunks: [],
        sessionId: req.sessionId,
      });

      (req as any)._langfuseTrace = trace;
      (req as any)._langfuseGeneration = generation;
    } catch (error: any) {
      this.logger?.warn(`LangfuseTracer: onPreRoute error: ${error.message}`);
    }
  }

  onPostResponse(req: { id: string; body: any }, responseBody: any): void {
    if (!this.initialized || !this.client) return;

    try {
      const generation: any = (req as any)._langfuseGeneration;
      if (!generation) return;

      const output = this.extractOutput(responseBody);
      const usage = this.extractUsage(responseBody);
      const state = this.activeTraces.get(req.id);
      const duration = state ? Date.now() - state.startTime : 0;

      generation.end({
        output,
        usage,
        metadata: { durationMs: duration },
      });

      this.activeTraces.delete(req.id);
      this.emit("trace:completed", { requestId: req.id, duration, model: state?.model });
    } catch (error: any) {
      this.logger?.warn(`LangfuseTracer: onPostResponse error: ${error.message}`);
    }
  }

  onStreamChunk(req: { id: string }, chunk: string): void {
    if (!this.initialized) return;

    const state = this.activeTraces.get(req.id);
    if (state) {
      state.chunks.push(chunk);
    }
  }

  async shutdown(): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.flushAsync();
      await this.client.shutdown();
      this.activeTraces.clear();
      this.initialized = false;
      this.logger?.info("LangfuseTracer: shut down cleanly");
    } catch (error: any) {
      this.logger?.warn(`LangfuseTracer: shutdown error: ${error.message}`);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private extractInput(body: any): string {
    const messages = body.messages || [];
    if (messages.length === 0) return "";
    const last = messages[messages.length - 1];
    return typeof last.content === "string"
      ? last.content.slice(0, 2000)
      : JSON.stringify(last.content).slice(0, 2000);
  }

  private extractOutput(response: any): string {
    if (!response) return "";
    if (response.choices?.[0]?.message?.content) {
      return typeof response.choices[0].message.content === "string"
        ? response.choices[0].message.content.slice(0, 4000)
        : JSON.stringify(response.choices[0].message.content).slice(0, 4000);
    }
    if (response.content?.[0]?.text) {
      return response.content[0].text.slice(0, 4000);
    }
    return JSON.stringify(response).slice(0, 4000);
  }

  private extractUsage(response: any): any {
    if (response.usage) return response.usage;
    return undefined;
  }
}
