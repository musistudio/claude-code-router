import { rmSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import path from "node:path";
import { CdpClient } from "@ccr/core/agents/cdp-client";

type ClaudeAppCdpLogger = Pick<Console, "info" | "warn">;

type ClaudeAppDesignCdpOptions = {
  cdpPort?: number;
  designUrl?: string;
  enabled?: boolean;
  logger?: ClaudeAppCdpLogger;
};

type DevToolsTarget = {
  id?: string;
  title?: string;
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
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

export function shouldEnableClaudeAppDesignCdp(_enabledByConfig = false): boolean {
  const configured = process.env.CCR_CLAUDE_APP_DESIGN_CDP?.trim().toLowerCase();
  return configured === "true" || configured === "1" || configured === "on";
}

export async function reserveClaudeAppCdpPort(logger: ClaudeAppCdpLogger = console, enabledByConfig = false): Promise<number | undefined> {
  if (!shouldEnableClaudeAppDesignCdp(enabledByConfig)) {
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
  if (!shouldEnableClaudeAppDesignCdp(options.enabled === true)) {
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

async function forceOpenClaudeAppDesignViaCdp(options: {
  cdpPort: number;
  designUrl: string;
  logger: ClaudeAppCdpLogger;
}): Promise<void> {
  const target = await waitForClaudeAppPageTarget(options.cdpPort, claudeAppDesignCdpConnectTimeoutMs);
  if (!target.webSocketDebuggerUrl) {
    throw new Error(`Claude App CDP page target was not available on port ${options.cdpPort}.`);
  }

  const client = await CdpClient.connect(target.webSocketDebuggerUrl, { label: "Claude App" });
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
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    url.pathname = normalizeDesignPath(url.pathname);
    url.searchParams.set("__ccr_design_iframe", "1");
    return url.toString();
  } catch {
    return "";
  }
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

function nodeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
