import { rmSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import path from "node:path";
import { WebSocket } from "undici";

type ClaudeAppCdpLogger = Pick<Console, "info" | "warn">;

type ClaudeAppDesignCdpOptions = {
  cdpPort?: number;
  designUrl?: string;
  logger?: ClaudeAppCdpLogger;
};

type DevToolsTarget = {
  id?: string;
  title?: string;
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
};

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

type FetchRequestPausedParams = {
  request?: {
    url?: string;
  };
  requestId?: string;
};

const claudeAppDevToolsActivePortFile = "DevToolsActivePort";
const claudeAppDesignCdpConnectTimeoutMs = 15_000;
const claudeAppDesignCdpKeepAliveMs = 45_000;
const claudeAppDesignCdpPollIntervalMs = 250;

export function shouldEnableClaudeAppDesignCdp(): boolean {
  return process.env.CCR_CLAUDE_APP_DESIGN_CDP?.trim().toLowerCase() === "true";
}

export async function reserveClaudeAppCdpPort(logger: ClaudeAppCdpLogger = console): Promise<number | undefined> {
  if (!shouldEnableClaudeAppDesignCdp()) {
    return undefined;
  }
  const configured = Number(process.env.CCR_CLAUDE_APP_CDP_PORT);
  if (Number.isInteger(configured) && configured > 0 && configured <= 65535) {
    return configured;
  }
  try {
    return await reserveLoopbackPort();
  } catch (error) {
    logger.warn(`[profile] Failed to reserve Claude App CDP port: ${nodeErrorMessage(error)}`);
    return undefined;
  }
}

export function prepareClaudeAppCdpUserDataDir(userDataDir: string): void {
  rmSync(path.join(userDataDir, claudeAppDevToolsActivePortFile), { force: true });
}

export function scheduleClaudeAppDesignCdp(options: ClaudeAppDesignCdpOptions): void {
  if (!shouldEnableClaudeAppDesignCdp()) {
    return;
  }
  const logger = options.logger || console;
  const designUrl = normalizeClaudeAppDesignUrl(options.designUrl);
  if (!options.cdpPort || !designUrl) {
    return;
  }
  void forceOpenClaudeAppDesignViaCdp({
    cdpPort: options.cdpPort,
    designUrl,
    logger
  }).catch((error) => {
    logger.warn(`[profile] Failed to force-open Claude Design via CDP: ${nodeErrorMessage(error)}`);
  });
}

async function forceOpenClaudeAppDesignViaCdp(options: Required<ClaudeAppDesignCdpOptions>): Promise<void> {
  const target = await waitForClaudeAppPageTarget(options.cdpPort, claudeAppDesignCdpConnectTimeoutMs);
  if (!target.webSocketDebuggerUrl) {
    throw new Error(`Claude App CDP page target was not available on port ${options.cdpPort}.`);
  }

  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    client.on("Fetch.requestPaused", (params) => {
      void handleFetchRequestPaused(client, params as FetchRequestPausedParams, options.logger);
    });

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Fetch.enable", {
      patterns: [
        {
          requestStage: "Request",
          urlPattern: "app://localhost/v1/privacy-consents*"
        }
      ]
    });
    await client.send("Page.setBypassCSP", { enabled: true });
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: claudeAppDesignFeatureScript()
    });
    await client.send("Runtime.evaluate", {
      awaitPromise: false,
      expression: claudeAppDesignFeatureScript()
    });
    await client.send("Page.navigate", {
      url: claudeAppDesktopDesignUrl(options.designUrl)
    });
    await sleep(1_200);
    await client.send("Runtime.evaluate", {
      awaitPromise: false,
      expression: claudeAppDesignFrameScript(options.designUrl)
    });
    options.logger.info(`[profile] Force-opened Claude Design via CDP at ${options.designUrl}.`);
    await sleep(claudeAppDesignCdpKeepAliveMs);
  } finally {
    client.close();
  }
}

async function handleFetchRequestPaused(client: CdpClient, params: FetchRequestPausedParams, logger: ClaudeAppCdpLogger): Promise<void> {
  const requestId = params.requestId;
  if (!requestId) {
    return;
  }
  const url = params.request?.url || "";
  try {
    if (url.startsWith("app://localhost/v1/privacy-consents")) {
      await client.send("Fetch.fulfillRequest", {
        body: Buffer.from(JSON.stringify({
          consents: {},
          ok: true,
          values: {}
        })).toString("base64"),
        responseCode: 200,
        responseHeaders: [
          { name: "content-type", value: "application/json; charset=utf-8" },
          { name: "cache-control", value: "no-store" }
        ],
        requestId
      });
      return;
    }
    await client.send("Fetch.continueRequest", { requestId });
  } catch (error) {
    logger.warn(`[profile] Failed to handle Claude App CDP request ${url}: ${nodeErrorMessage(error)}`);
  }
}

async function waitForClaudeAppPageTarget(port: number, timeoutMs: number): Promise<DevToolsTarget> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const targets = await cdpJson<DevToolsTarget[]>(port, "/json/list");
      const target = targets.find(isClaudeAppPageTarget) ||
        targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
      if (target) {
        return target;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(claudeAppDesignCdpPollIntervalMs);
  }
  throw new Error(`Claude App CDP page target was not available on port ${port}${lastError ? `: ${nodeErrorMessage(lastError)}` : ""}`);
}

function isClaudeAppPageTarget(target: DevToolsTarget): boolean {
  if (target.type !== "page" || !target.webSocketDebuggerUrl) {
    return false;
  }
  const url = target.url || "";
  return url.startsWith("app://localhost/") || url.startsWith("app://-/") || /claude/i.test(target.title || "");
}

async function cdpJson<T>(port: number, endpoint: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
    signal: AbortSignal.timeout(1_000)
  });
  if (!response.ok) {
    throw new Error(`CDP ${endpoint} returned HTTP ${response.status}`);
  }
  return await response.json() as T;
}

function claudeAppDesktopDesignUrl(designUrl: string): string {
  return `app://localhost/desktop-design?path=${encodeURIComponent(designUrl)}`;
}

function claudeAppDesignFeatureScript(): string {
  return `(() => {
    const forced = { claudeDesignWindow: { status: "supported" } };
    function merge(value) {
      return Object.assign({}, value || {}, forced);
    }
    let bootFeatures = merge(globalThis.desktopBootFeatures);
    try {
      Object.defineProperty(globalThis, "desktopBootFeatures", {
        configurable: true,
        get() {
          return bootFeatures;
        },
        set(value) {
          bootFeatures = merge(value);
        }
      });
    } catch (_) {
      globalThis.desktopBootFeatures = bootFeatures;
    }
    function patchAppFeatures(container) {
      if (!container) {
        return;
      }
      const existing = container.AppFeatures || {};
      if (existing.__ccrClaudeDesignPatched) {
        return;
      }
      const previous = existing.getSupportedFeatures;
      container.AppFeatures = Object.assign({}, existing, {
        __ccrClaudeDesignPatched: true,
        getSupportedFeatures() {
          if (typeof previous === "function") {
            return Promise.resolve(previous.call(existing)).then(merge, () => merge());
          }
          return Promise.resolve(merge());
        }
      });
    }
    globalThis["claude.settings"] = globalThis["claude.settings"] || {};
    patchAppFeatures(globalThis["claude.settings"]);
    globalThis.claude = globalThis.claude || {};
    globalThis.claude.settings = globalThis.claude.settings || {};
    patchAppFeatures(globalThis.claude.settings);
  })();`;
}

function claudeAppDesignFrameScript(designUrl: string): string {
  const target = JSON.stringify(designUrl);
  return `(() => {
    const target = ${target};
    function forceFrame() {
      const frames = Array.from(document.querySelectorAll("iframe"));
      const designFrame = frames.find((frame) => /design|desktop-design|omelette/i.test(frame.getAttribute("src") || frame.id || frame.className || ""));
      const frame = designFrame || frames[0];
      if (frame && frame.src !== target) {
        frame.src = target;
      }
    }
    forceFrame();
    globalThis.__ccrClaudeDesignFrameTimer = globalThis.__ccrClaudeDesignFrameTimer || setInterval(forceFrame, 500);
  })();`;
}

function normalizeClaudeAppDesignUrl(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    if (!isLocalHttpUrl(url)) {
      return "";
    }
    url.pathname = normalizeDesignPath(url.pathname);
    url.searchParams.set("__ccr_design_iframe", "1");
    return url.toString();
  } catch {
    return "";
  }
}

function isLocalHttpUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  const hostname = url.hostname.toLowerCase();
  return hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]";
}

function normalizeDesignPath(value: string): string {
  if (!value || value === "/") {
    return "/design";
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address() as AddressInfo | null;
      const port = address?.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!port) {
          reject(new Error("No loopback port was assigned."));
          return;
        }
        resolve(port);
      });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  private readonly handlers = new Map<string, Array<(params: unknown) => void>>();
  private nextId = 1;
  private readonly pending = new Map<number, {
    reject: (error: Error) => void;
    resolve: (value: unknown) => void;
  }>();

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => this.handleMessage(event.data));
    ws.addEventListener("close", () => this.rejectPending(new Error("CDP WebSocket closed.")));
    ws.addEventListener("error", () => this.rejectPending(new Error("CDP WebSocket failed.")));
  }

  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          ws.close();
        } catch {
          // Ignore close failures during timeout cleanup.
        }
        reject(new Error("Timed out connecting to Claude App CDP WebSocket."));
      }, 5_000);
      ws.addEventListener("open", () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(new CdpClient(ws));
      });
      ws.addEventListener("error", () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(new Error("Failed to connect to Claude App CDP WebSocket."));
      });
    });
  }

  close(): void {
    if (this.ws.readyState === 0 || this.ws.readyState === 1) {
      this.ws.close();
    }
  }

  on(method: string, handler: (params: unknown) => void): void {
    const handlers = this.handlers.get(method) || [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (this.ws.readyState !== 1) {
      return Promise.reject(new Error("CDP WebSocket is not open."));
    }
    const id = this.nextId++;
    const payload = params === undefined ? { id, method } : { id, method, params };
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
    });
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
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || `CDP command failed with code ${message.error.code || "unknown"}`));
        return;
      }
      pending.resolve(message.result);
      return;
    }
    if (message.method) {
      for (const handler of this.handlers.get(message.method) || []) {
        handler(message.params);
      }
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function webSocketDataToString(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  return String(data);
}

function nodeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
