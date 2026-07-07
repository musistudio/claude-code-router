import { randomUUID } from "node:crypto";
import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { BrowserWindow, session, shell } from "electron";
import type {
  ChromeLoginImportCookie,
  ChromeLoginImportJob,
  ChromeLoginImportLocalStorage,
  ChromeLoginImportRequest,
  ChromeLoginImportResult,
  ChromeLoginImportTarget
} from "@ccr/core/contracts/app";

type ServerInfo = {
  server: Server;
  url: string;
};

type StoredChromeLoginImportJob = ChromeLoginImportJob;

type CookieSetDetails = Parameters<Electron.Cookies["set"]>[0];

const browserPartition = "persist:ccr-built-in-browser";
const webSearchPartition = "persist:ccr-browser-web-search-mcp";
const importJobTtlMs = 5 * 60_000;
const maxImportRequestBytes = 16 * 1024 * 1024;
const maxStoredErrors = 20;
const localStorageWriteTimeoutMs = 15_000;

class ChromeLoginImportService {
  private readonly jobs = new Map<string, StoredChromeLoginImportJob>();
  private serverInfo?: ServerInfo;
  private serverStartPromise?: Promise<ServerInfo>;

  async createJob(request: ChromeLoginImportRequest): Promise<ChromeLoginImportJob> {
    const domains = uniqueStrings(request.domains.map(normalizeImportDomain).filter((item): item is string => Boolean(item)));
    if (domains.length === 0) {
      throw new Error("At least one Chrome import domain is required.");
    }

    const target = normalizeImportTarget(request.target);
    const serverInfo = await this.ensureServer();
    const id = randomUUID();
    const now = Date.now();
    const job: StoredChromeLoginImportJob = {
      confirmUrl: `${serverInfo.url}/chrome-import/jobs/${id}/confirm`,
      createdAt: now,
      domains,
      endpointUrl: serverInfo.url,
      expiresAt: now + importJobTtlMs,
      id,
      importUrl: `${serverInfo.url}/chrome-import/jobs/${id}`,
      status: "pending",
      target
    };
    this.jobs.set(id, job);
    this.pruneJobs();
    if (request.openConfirmationPage) {
      await this.openConfirmationPage(job.id);
    }
    return cloneJob(job);
  }

  getJob(id: string): ChromeLoginImportJob | undefined {
    const job = this.jobs.get(id);
    if (!job) {
      return undefined;
    }
    this.refreshExpiredJob(job);
    return cloneJob(job);
  }

  async openConfirmationPage(id: string): Promise<ChromeLoginImportJob> {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error("Chrome login import job was not found.");
    }
    this.refreshExpiredJob(job);
    if (job.status !== "pending") {
      throw new Error(`Chrome login import job is ${job.status}.`);
    }
    await shell.openExternal(job.confirmUrl);
    return cloneJob(job);
  }

  private async ensureServer(): Promise<ServerInfo> {
    if (this.serverInfo) {
      return this.serverInfo;
    }
    if (this.serverStartPromise) {
      return this.serverStartPromise;
    }

    this.serverStartPromise = new Promise<ServerInfo>((resolve, reject) => {
      const server = http.createServer((request, response) => {
        void this.handleRequest(request, response).catch((error) => {
          sendJson(response, 500, { error: { message: formatError(error) } });
        });
      });
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("Chrome login import server failed to start."));
          return;
        }
        const info = {
          server,
          url: `http://127.0.0.1:${address.port}`
        };
        this.serverInfo = info;
        resolve(info);
      });
    }).finally(() => {
      this.serverStartPromise = undefined;
    });
    return this.serverStartPromise;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    setCorsHeaders(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const path = request.url ? new URL(request.url, "http://127.0.0.1").pathname : "/";
    const match = path.match(/^\/chrome-import\/jobs\/([^/]+)(?:\/(confirm|cookies))?$/);
    if (!match) {
      sendJson(response, 404, { error: { message: "Chrome login import endpoint not found." } });
      return;
    }

    const id = decodeURIComponent(match[1]);
    const job = this.jobs.get(id);
    if (!job) {
      sendJson(response, 404, { error: { message: "Chrome login import job was not found." } });
      return;
    }
    this.refreshExpiredJob(job);
    if (job.status === "expired") {
      sendJson(response, 410, { error: { message: "Chrome login import job expired." }, job: cloneJob(job) });
      return;
    }

    const action = match[2];
    if (request.method === "GET" && action === "confirm") {
      sendHtml(response, 200, confirmationPageHtml(job));
      return;
    }

    if (request.method === "GET" && !action) {
      sendJson(response, 200, { job: cloneJob(job) });
      return;
    }

    if (request.method === "POST" && action === "cookies") {
      if (job.status !== "pending") {
        sendJson(response, 409, {
          error: {
            message: `Chrome login import job is ${job.status}.`
          },
          job: cloneJob(job)
        });
        return;
      }
      const payload = await readJsonRequest(request);
      const result = await this.importLoginState(job, payload);
      sendJson(response, 200, { job: cloneJob(job), result });
      return;
    }

    sendJson(response, 405, { error: { message: "Unsupported Chrome login import method." } });
  }

  private async importLoginState(job: StoredChromeLoginImportJob, payload: unknown): Promise<ChromeLoginImportResult> {
    const importPayload = readImportPayload(payload);
    const partitions = targetPartitions(job.target);
    const result: ChromeLoginImportResult = {
      completedAt: Date.now(),
      cookieImported: 0,
      cookieSkipped: 0,
      domains: [...job.domains],
      imported: 0,
      localStorageImported: 0,
      localStorageSkipped: 0,
      partitions,
      skipped: 0
    };
    const errors: string[] = [];

    for (const cookie of importPayload.cookies) {
      const normalized = normalizeChromeCookie(cookie, job.domains);
      if (!normalized) {
        result.cookieSkipped += 1;
        continue;
      }

      try {
        await Promise.all(partitions.map((partition) => session.fromPartition(partition).cookies.set(normalized)));
        result.cookieImported += 1;
      } catch (error) {
        result.cookieSkipped += 1;
        if (errors.length < maxStoredErrors) {
          errors.push(`${normalized.domain || new URL(normalized.url).hostname}:${normalized.name}: ${formatError(error)}`);
        }
      }
    }

    await Promise.all(partitions.map((partition) => session.fromPartition(partition).cookies.flushStore()));

    for (const localStorageEntry of importPayload.localStorage) {
      const normalized = normalizeLocalStorageEntry(localStorageEntry, job.domains);
      if (!normalized) {
        result.localStorageSkipped += 1;
        continue;
      }

      const itemCount = Object.keys(normalized.items).length;
      if (itemCount === 0) {
        result.localStorageSkipped += 1;
        continue;
      }

      try {
        await Promise.all(partitions.map((partition) => writeLocalStorage(partition, normalized.origin, normalized.items)));
        result.localStorageImported += itemCount;
      } catch (error) {
        result.localStorageSkipped += itemCount;
        if (errors.length < maxStoredErrors) {
          errors.push(`${normalized.origin}: localStorage: ${formatError(error)}`);
        }
      }
    }

    result.imported = result.cookieImported + result.localStorageImported;
    result.skipped = result.cookieSkipped + result.localStorageSkipped;
    if (errors.length > 0) {
      result.errors = errors;
    }
    job.result = result;
    job.status = result.imported > 0 || result.skipped > 0 ? "completed" : "failed";
    return result;
  }

  private refreshExpiredJob(job: StoredChromeLoginImportJob): void {
    if (job.status === "pending" && Date.now() > job.expiresAt) {
      job.status = "expired";
    }
  }

  private pruneJobs(): void {
    const cutoff = Date.now() - importJobTtlMs;
    for (const [id, job] of this.jobs) {
      this.refreshExpiredJob(job);
      if (job.expiresAt < cutoff) {
        this.jobs.delete(id);
      }
    }
  }
}

export const chromeLoginImportService = new ChromeLoginImportService();

function targetPartitions(target: ChromeLoginImportTarget): string[] {
  return target === "browser-and-web-search"
    ? [browserPartition, webSearchPartition]
    : [browserPartition];
}

function normalizeChromeCookie(cookie: ChromeLoginImportCookie, allowedDomains: string[]): CookieSetDetails | undefined {
  if (!isRecord(cookie) || typeof cookie.name !== "string" || typeof cookie.value !== "string") {
    return undefined;
  }
  if (cookie.partitionKey !== undefined) {
    return undefined;
  }

  const rawDomain = readString(cookie.domain).toLowerCase();
  const cookieHost = normalizeCookieHost(rawDomain);
  if (!cookieHost || !allowedDomains.some((domain) => cookieDomainMatches(cookieHost, domain))) {
    return undefined;
  }

  const path = normalizeCookiePath(cookie.path);
  const expirationDate = typeof cookie.expirationDate === "number" && Number.isFinite(cookie.expirationDate)
    ? cookie.expirationDate
    : undefined;
  if (expirationDate !== undefined && expirationDate <= Date.now() / 1000) {
    return undefined;
  }

  const secure = cookie.secure === true;
  const details: CookieSetDetails = {
    httpOnly: cookie.httpOnly === true,
    name: cookie.name,
    path,
    secure,
    url: cookieUrl(cookieHost, path, secure),
    value: cookie.value
  };
  if (cookie.hostOnly !== true) {
    details.domain = rawDomain || cookieHost;
  }
  if (expirationDate !== undefined && cookie.session !== true) {
    details.expirationDate = expirationDate;
  }
  const sameSite = normalizeSameSite(cookie.sameSite);
  if (sameSite) {
    details.sameSite = sameSite;
  }
  return details;
}

function normalizeLocalStorageEntry(
  entry: ChromeLoginImportLocalStorage,
  allowedDomains: string[]
): ChromeLoginImportLocalStorage | undefined {
  if (!isRecord(entry) || !isRecord(entry.items)) {
    return undefined;
  }

  let origin: URL;
  try {
    origin = new URL(readString(entry.origin));
  } catch {
    return undefined;
  }

  if (!["http:", "https:"].includes(origin.protocol)) {
    return undefined;
  }
  if (!allowedDomains.some((domain) => cookieDomainMatches(origin.hostname.toLowerCase(), domain))) {
    return undefined;
  }

  const items: Record<string, string> = {};
  for (const [key, value] of Object.entries(entry.items)) {
    if (typeof key === "string" && typeof value === "string") {
      items[key] = value;
    }
  }
  return {
    items,
    origin: origin.origin
  };
}

async function writeLocalStorage(partition: string, origin: string, items: Record<string, string>): Promise<void> {
  const window = new BrowserWindow({
    height: 480,
    paintWhenInitiallyHidden: true,
    show: false,
    skipTaskbar: true,
    title: "CCR Chrome Login Import",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition,
      sandbox: true,
      webSecurity: true
    },
    width: 640
  });
  try {
    await withTimeout(window.webContents.loadURL(`${origin}/`), localStorageWriteTimeoutMs, "Timed out loading localStorage origin.");
    const loadedOrigin = new URL(window.webContents.getURL()).origin;
    if (loadedOrigin !== origin) {
      throw new Error(`Origin redirected to ${loadedOrigin}.`);
    }
    const entries = Object.entries(items);
    await window.webContents.executeJavaScript(
      `(() => {
        const entries = ${JSON.stringify(entries)};
        for (const [key, value] of entries) {
          window.localStorage.setItem(key, value);
        }
        return entries.length;
      })()`,
      true
    );
  } finally {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  }
}

function normalizeImportTarget(value: unknown): ChromeLoginImportTarget {
  return value === "browser-and-web-search" ? "browser-and-web-search" : "browser";
}

function normalizeImportDomain(value: unknown): string | undefined {
  const raw = readString(value).toLowerCase();
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return normalizeCookieHost(parsed.hostname);
  } catch {
    return normalizeCookieHost(raw.replace(/^\*\./, "").split("/")[0] || "");
  }
}

function normalizeCookieHost(value: string): string | undefined {
  const host = value.trim().replace(/^\./, "").toLowerCase();
  if (!host || host.includes("*") || host.includes("/") || host.includes(" ")) {
    return undefined;
  }
  return host;
}

function normalizeCookiePath(value: unknown): string {
  const path = readString(value);
  return path.startsWith("/") ? path : "/";
}

function cookieUrl(host: string, path: string, secure: boolean): string {
  const normalizedPath = path.startsWith("/") ? path : "/";
  return `${secure ? "https" : "http"}://${host}${normalizedPath}`;
}

function cookieDomainMatches(cookieHost: string, allowedDomain: string): boolean {
  return cookieHost === allowedDomain || cookieHost.endsWith(`.${allowedDomain}`);
}

function normalizeSameSite(value: unknown): CookieSetDetails["sameSite"] | undefined {
  return value === "lax" || value === "strict" || value === "no_restriction" || value === "unspecified"
    ? value
    : undefined;
}

function readImportPayload(payload: unknown): {
  cookies: ChromeLoginImportCookie[];
  localStorage: ChromeLoginImportLocalStorage[];
} {
  if (!isRecord(payload)) {
    throw new Error("Chrome login import payload must be an object.");
  }
  const cookies = Array.isArray(payload.cookies)
    ? payload.cookies.filter(isRecord) as ChromeLoginImportCookie[]
    : [];
  const localStorage = Array.isArray(payload.localStorage)
    ? payload.localStorage.filter(isRecord) as ChromeLoginImportLocalStorage[]
    : [];
  if (cookies.length === 0 && localStorage.length === 0) {
    throw new Error("Chrome login import payload must include cookies or localStorage.");
  }
  return { cookies, localStorage };
}

function cloneJob(job: StoredChromeLoginImportJob): ChromeLoginImportJob {
  return {
    ...job,
    domains: [...job.domains],
    ...(job.result
      ? {
          result: {
            ...job.result,
            domains: [...job.result.domains],
            ...(job.result.errors ? { errors: [...job.result.errors] } : {}),
            partitions: [...job.result.partitions]
          }
        }
      : {})
  };
}

async function readJsonRequest(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxImportRequestBytes) {
      throw new Error("Chrome login import payload is too large.");
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  if (!response.headersSent) {
    response.writeHead(statusCode, { "content-type": "application/json" });
  }
  response.end(`${JSON.stringify(body)}\n`);
}

function sendHtml(response: ServerResponse, statusCode: number, body: string): void {
  if (!response.headersSent) {
    response.writeHead(statusCode, {
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src http://127.0.0.1:* http://localhost:*",
      "content-type": "text/html; charset=utf-8"
    });
  }
  response.end(body);
}

function confirmationPageHtml(job: StoredChromeLoginImportJob): string {
  const domains = job.domains.map((domain) => `<li>${escapeHtml(domain)}</li>`).join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CCR Chrome Login Import</title>
    <style>
      :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { align-items: center; background: Canvas; color: CanvasText; display: flex; justify-content: center; margin: 0; min-height: 100vh; padding: 24px; }
      main { border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius: 10px; box-shadow: 0 18px 44px color-mix(in srgb, CanvasText 10%, transparent); display: grid; gap: 16px; max-width: 560px; padding: 22px; width: min(560px, 100%); }
      h1 { font-size: 20px; line-height: 1.2; margin: 0; }
      p { color: color-mix(in srgb, CanvasText 72%, transparent); font-size: 13px; line-height: 1.45; margin: 0; }
      ul { display: grid; gap: 6px; margin: 0; padding-left: 20px; }
      li { font-size: 13px; }
      button { background: #0f766e; border: 1px solid #0f766e; border-radius: 8px; color: white; cursor: pointer; font: inherit; font-weight: 750; height: 38px; padding: 0 14px; }
      button:disabled { cursor: default; opacity: 0.52; }
      .status { border-radius: 8px; color: color-mix(in srgb, CanvasText 68%, transparent); font-size: 12px; line-height: 1.4; min-height: 18px; overflow-wrap: anywhere; }
      .status.error { color: #b91c1c; }
      .status.ok { color: #15803d; }
    </style>
  </head>
  <body>
    <main
      id="ccr-chrome-login-import"
      data-import-url="${escapeHtml(job.importUrl)}"
      data-job-id="${escapeHtml(job.id)}"
      data-domains="${escapeHtml(job.domains.join(","))}"
    >
      <h1>Import Chrome Login State into CCR</h1>
      <p>CCR is requesting permission to import cookies and localStorage for these domains into the in-app browser.</p>
      <ul>${domains}</ul>
      <button id="ccr-confirm-import" disabled type="button">Waiting for CCR Chrome extension</button>
      <div id="ccr-import-status" class="status" role="status">Install or enable the CCR Login Import extension in Chrome to continue.</div>
    </main>
  </body>
</html>`;
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-headers", "content-type, x-ccr-login-import");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-origin", "*");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
