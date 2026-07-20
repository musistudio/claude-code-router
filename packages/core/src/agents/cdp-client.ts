import { WebSocket } from "undici";

type CdpError = {
  code?: number;
  data?: unknown;
  message?: string;
};

type CdpMessage = {
  error?: CdpError;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
};

type CdpClientOptions = {
  connectTimeoutMs?: number;
  label?: string;
};

export class CdpClient {
  private closedSettled = false;
  private readonly closePromise: Promise<void>;
  private closeResolve!: () => void;
  private readonly handlers = new Map<string, Array<(params: unknown) => void>>();
  private nextId = 1;
  private readonly pending = new Map<number, {
    reject: (error: Error) => void;
    resolve: (value: unknown) => void;
  }>();

  private constructor(
    private readonly ws: WebSocket,
    private readonly label: string
  ) {
    this.closePromise = new Promise((resolve) => {
      this.closeResolve = resolve;
    });
    ws.addEventListener("message", (event) => this.handleMessage(event.data));
    ws.addEventListener("close", () => this.finishClose(new Error(`${this.label} CDP WebSocket closed.`)));
    ws.addEventListener("error", () => this.finishClose(new Error(`${this.label} CDP WebSocket failed.`)));
  }

  static connect(url: string, options: CdpClientOptions = {}): Promise<CdpClient> {
    const label = options.label?.trim() || "App";
    const timeoutMs = options.connectTimeoutMs ?? 5_000;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          // Ignore close failures during timeout cleanup.
        }
        reject(new Error(`Timed out connecting to ${label} CDP WebSocket.`));
      }, timeoutMs);
      ws.addEventListener("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(new CdpClient(ws, label));
      });
      ws.addEventListener("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to connect to ${label} CDP WebSocket.`));
      });
    });
  }

  close(): void {
    if (this.ws.readyState === 0 || this.ws.readyState === 1) {
      this.ws.close();
    }
    this.finishClose(new Error(`${this.label} CDP WebSocket closed.`));
  }

  on(method: string, handler: (params: unknown) => void): () => void {
    const handlers = this.handlers.get(method) || [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
    return () => {
      const current = this.handlers.get(method);
      if (!current) return;
      const next = current.filter((item) => item !== handler);
      if (next.length) this.handlers.set(method, next);
      else this.handlers.delete(method);
    };
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (this.ws.readyState !== 1 || this.closedSettled) {
      return Promise.reject(new Error(`${this.label} CDP WebSocket is not open.`));
    }
    const id = this.nextId++;
    const payload = params === undefined ? { id, method } : { id, method, params };
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
    });
  }

  waitForClose(): Promise<void> {
    return this.closePromise;
  }

  private handleMessage(data: unknown): void {
    let message: CdpMessage;
    try {
      message = JSON.parse(webSocketDataToString(data)) as CdpMessage;
    } catch {
      return;
    }
    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || `CDP command failed with code ${message.error.code || "unknown"}`));
        return;
      }
      pending.resolve(message.result);
      return;
    }
    if (!message.method) return;
    for (const handler of this.handlers.get(message.method) || []) {
      try {
        handler(message.params);
      } catch {
        // A faulty event consumer must not take down the CDP transport.
      }
    }
  }

  private finishClose(error: Error): void {
    if (this.closedSettled) return;
    this.closedSettled = true;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.closeResolve();
  }
}

function webSocketDataToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  return String(data);
}
