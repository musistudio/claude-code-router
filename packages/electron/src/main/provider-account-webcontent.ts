import {
  setProviderAccountWebContentFetchHandler,
  type ProviderAccountWebContentFetchHandler,
  type ProviderAccountWebContentFetchRequest
} from "@ccr/core/providers/account-webcontent";

type WebContentBrowserWindow = {
  close: () => void;
  contentView?: {
    addChildView?: (view: any) => void;
    removeChildView?: (view: any) => void;
  };
  isDestroyed?: () => boolean;
};

type WebContentView = {
  setBounds?: (bounds: { height: number; width: number; x: number; y: number }) => void;
  webContents: {
    executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
    loadURL: (url: string) => Promise<unknown>;
  };
};

type WebContentSession = {
  forceReloadProxyConfig?: () => Promise<void>;
};

export type ProviderAccountWebContentElectronDeps = {
  BrowserWindow: new (options: any) => WebContentBrowserWindow;
  WebContentsView: new (options: any) => WebContentView;
  session: {
    fromPartition: (partition: string) => WebContentSession;
  };
};

type WebContentFetchResult = {
  byteLength?: number;
  contentType?: string;
  error?: string;
  ok?: boolean;
  status?: number;
  statusText?: string;
  text?: string;
};

const browserPartition = "persist:ccr-built-in-browser";
const defaultTimeoutMs = 15_000;
const maxTimeoutMs = 60_000;
const maxResponseBytes = 2 * 1024 * 1024;
const blockedHeaderNames = new Set([
  "content-length",
  "cookie",
  "cookie2",
  "host",
  "origin"
]);

export function registerProviderAccountWebContentFetchHandler(deps: ProviderAccountWebContentElectronDeps): void {
  setProviderAccountWebContentFetchHandler(createProviderAccountWebContentFetchHandler(deps));
}

export function createProviderAccountWebContentFetchHandler(
  deps: ProviderAccountWebContentElectronDeps
): ProviderAccountWebContentFetchHandler {
  return async (request) => {
    const timeoutMs = normalizeTimeoutMs(request.timeoutMs);
    const session = deps.session.fromPartition(browserPartition);
    await session.forceReloadProxyConfig?.().catch(() => undefined);

    const window = new deps.BrowserWindow({
      height: 40,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      },
      width: 40
    });
    const view = new deps.WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: browserPartition,
        sandbox: true,
        webSecurity: true
      }
    });

    try {
      window.contentView?.addChildView?.(view);
      view.setBounds?.({ height: 40, width: 40, x: 0, y: 0 });
      await withTimeout(view.webContents.loadURL(request.requestOrigin), timeoutMs, "Timed out loading browser session request origin.");
      const result = await withTimeout(
        view.webContents.executeJavaScript(webContentFetchScript(request, timeoutMs), true),
        timeoutMs + 1000,
        "Timed out running browser session account request."
      );
      return {
        payload: parseWebContentFetchResult(result)
      };
    } finally {
      try {
        window.contentView?.removeChildView?.(view);
      } catch {
        // The hidden worker window may already be closing.
      }
      if (!window.isDestroyed?.()) {
        window.close();
      }
    }
  };
}

function webContentFetchScript(request: ProviderAccountWebContentFetchRequest, timeoutMs: number): string {
  const serializedRequest = JSON.stringify({
    bodyJson: request.method === "POST" ? JSON.stringify(request.body ?? {}) : undefined,
    credentials: normalizeRequestCredentials(request.credentials),
    endpoint: request.endpoint,
    headerTemplates: normalizeHeaderTemplates(request.headerTemplates),
    headers: normalizeRequestHeaders(request.headers),
    maxResponseBytes,
    method: request.method,
    timeoutMs
  });

  return `
    (async () => {
      const request = ${serializedRequest};
      const headers = { ...request.headers };
      const storagePattern = /\\$\\{(localStorage|sessionStorage)(?:\\.([A-Za-z_$][\\w$]*)|\\[['"]([^'"]+)['"]\\])\\}/g;
      const readStorageValue = (source, key) => {
        const storage = source === "sessionStorage" ? sessionStorage : localStorage;
        const value = storage.getItem(key);
        if (value === null) {
          throw new Error(source + " item " + JSON.stringify(key) + " is missing.");
        }
        return value;
      };
      const renderHeaderTemplate = (template) => {
        const rendered = String(template).replace(storagePattern, (_match, source, dotKey, quotedKey) => readStorageValue(source, dotKey || quotedKey));
        if (rendered.includes("\${localStorage") || rendered.includes("\${sessionStorage")) {
          throw new Error("Unsupported browser header template expression.");
        }
        return rendered;
      };
      if (request.method === "POST" && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
        headers["content-type"] = "application/json";
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        for (const [key, template] of Object.entries(request.headerTemplates || {})) {
          headers[key] = renderHeaderTemplate(template);
        }
        const response = await fetch(request.endpoint, {
          body: request.method === "POST" ? request.bodyJson : undefined,
          cache: "no-store",
          credentials: request.credentials,
          headers,
          method: request.method,
          signal: controller.signal
        });
        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();
        const byteLength = new TextEncoder().encode(text).byteLength;
        return {
          byteLength,
          contentType,
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          text: byteLength <= request.maxResponseBytes ? text : ""
        };
      } catch (error) {
        return {
          error: error && typeof error === "object" && "message" in error ? String(error.message) : String(error)
        };
      } finally {
        clearTimeout(timer);
      }
    })()
  `;
}

function normalizeRequestHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const output: Record<string, string> = {
    accept: "application/json"
  };
  for (const [key, value] of Object.entries(headers ?? {})) {
    const normalizedKey = key.trim();
    if (!normalizedKey || blockedHeaderNames.has(normalizedKey.toLowerCase())) {
      continue;
    }
    if (typeof value === "string") {
      output[normalizedKey] = value;
    }
  }
  return output;
}

function normalizeHeaderTemplates(headerTemplates: Record<string, string> | undefined): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(headerTemplates ?? {})) {
    const normalizedKey = key.trim();
    if (!normalizedKey || blockedHeaderNames.has(normalizedKey.toLowerCase())) {
      continue;
    }
    if (typeof value === "string") {
      output[normalizedKey] = value;
    }
  }
  return output;
}

function normalizeRequestCredentials(value: ProviderAccountWebContentFetchRequest["credentials"]): NonNullable<ProviderAccountWebContentFetchRequest["credentials"]> {
  return value === "omit" || value === "same-origin" || value === "include" ? value : "include";
}

function parseWebContentFetchResult(value: unknown): unknown {
  if (!isRecord(value)) {
    throw new Error("Browser session account request returned an invalid worker result.");
  }
  const result = value as WebContentFetchResult;
  if (result.error) {
    throw new Error(`Browser session account request failed: ${result.error}`);
  }
  if (Number(result.byteLength) > maxResponseBytes) {
    throw new Error(`Browser session account endpoint returned more than ${maxResponseBytes} bytes.`);
  }
  const text = typeof result.text === "string" ? result.text : "";
  if (!result.ok) {
    const errorMessage = jsonErrorMessage(text) || readableResponseSnippet(text) || result.statusText;
    throw new Error(`Account endpoint returned HTTP ${result.status ?? 0}${errorMessage ? `: ${errorMessage}` : ""}.`);
  }
  if (!responseLooksJson(result.contentType ?? "", text)) {
    throw new Error(`Account endpoint returned non-JSON response${result.contentType ? ` (${result.contentType.split(";")[0]})` : ""}.`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Account endpoint returned malformed JSON.");
  }
}

function responseLooksJson(contentType: string, text: string): boolean {
  const normalizedContentType = contentType.toLowerCase();
  if (normalizedContentType.includes("json")) {
    return true;
  }
  return /^[\s]*[\[{]/.test(text);
}

function jsonErrorMessage(text: string): string | undefined {
  if (!responseLooksJson("", text)) {
    return undefined;
  }
  try {
    const payload = JSON.parse(text) as unknown;
    if (!isRecord(payload)) {
      return undefined;
    }
    const message = readString(payload.message) || readString(payload.detail);
    if (message) {
      return message;
    }
    if (isRecord(payload.error)) {
      return readString(payload.error.message) || readString(payload.error.type);
    }
    return readString(payload.error);
  } catch {
    return undefined;
  }
}

function readableResponseSnippet(text: string): string | undefined {
  const compact = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!compact) {
    return undefined;
  }
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

function normalizeTimeoutMs(value: number | undefined): number {
  return Math.max(1, Math.min(maxTimeoutMs, Number.isFinite(value) ? Number(value) : defaultTimeoutMs));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const providerAccountWebContentInternalsForTest = {
  maxResponseBytes,
  normalizeHeaderTemplates,
  normalizeRequestHeaders,
  normalizeRequestCredentials,
  parseWebContentFetchResult,
  webContentFetchScript
};
