import { appendFile, mkdir } from "node:fs/promises";
import { createServer as createHttpServer, type IncomingHttpHeaders } from "node:http";
import path from "node:path";

/**
 * Balance/usage endpoints the desktop app reads through the desktop API layer
 * (CODEX_API_BASE_URL). The virtual-account routes keep the workspace gate
 * hidden, but usage must stay real: the CCR-launched app attaches its real
 * ChatGPT OAuth to the loopback responder, so these paths are forwarded to the
 * real backend (same paths under its /backend-api prefix) and the app shows
 * the account's actual balance instead of a silent 404.
 */
const CODEX_USAGE_PROXY_BASE = "https://chatgpt.com/backend-api";
const CODEX_USAGE_PROXY_PREFIXES = ["/wham/usage", "/wham/settings", "/wham/rate-limit-reset-credits", "/wham/profiles"];
const HOP_BY_HOP_HEADERS = new Set(["host", "connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade"]);

export function isCodexUsageProxyPath(pathname: string): boolean {
  return CODEX_USAGE_PROXY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type CodexVirtualRoute = {
  /** Literal pathname prefix match, checked against the request pathname. */
  prefix?: string;
  /** Regular expression source matched against the request pathname. */
  pattern?: string;
  /** Extra response headers (e.g. Set-Cookie for devicecheck registration). */
  headers?: Record<string, string>;
  /** Dynamic body builder for account-scoped responses. */
  bodyFor?: (context: { accountId: string }) => unknown;
  body?: unknown;
};

const VIRTUAL_ACCOUNT_ID = "ccr-virtual-account";

/**
 * Responses served by the local net responder instead of the ChatGPT backend.
 * The 26.1002+ desktop app gates the Codex composer on workspace and usage
 * state fetched over the desktop API layer, which the stdio middleware cannot
 * reach. With CODEX_API_BASE_URL pointed at this responder (an official app
 * hook that also permits localhost), these routes keep that state healthy for
 * a virtual account. Anything not listed here is answered with a 404 and
 * recorded to the responder log so missing routes can be added deliberately.
 */
export function codexVirtualAccountRoutes(): CodexVirtualRoute[] {
  return [
    {
      // Account discovery (Kb schema in the app). A non-workspace structure
      // keeps the whole workspace-policy gate hidden; entries echo the account
      // id from the request so real bridged identities resolve too.
      prefix: "/wham/accounts/check",
      bodyFor: ({ accountId }) => ({
        accounts: [
          {
            id: accountId,
            account_user_id: `user__${accountId}`,
            account_user_role: "account-owner",
            structure: "personal",
            plan_type: "plus",
            is_zdr: false,
            is_openai_internal: false,
            can_access_with_session: true,
            enable_account_switching: false,
            is_deactivated: false,
            name: "CCR"
          }
        ],
        default_account_id: accountId,
        account_ordering: [accountId]
      })
    },
    {
      // Account inventory (AV record schema): the app resolves home access by
      // looking up the authenticated account id in the accounts map, so the
      // record is keyed by the requested account id.
      prefix: "/accounts/check/",
      bodyFor: virtualAccountInventory
    },
    {
      prefix: "/backend-api/accounts/check/",
      bodyFor: virtualAccountInventory
    },
    {
      // Workspace settings (cy schema). beta_settings is required by the app
      // schema; an empty list leaves the workspace_policy flag absent, which
      // also keeps the policy gate hidden.
      pattern: "^/accounts/[^/]+/settings$",
      body: {
        beta_settings: [],
        permissions: null,
        member_profiles_enabled: false
      }
    },
    {
      prefix: "/accounts/optimized/check",
      // This endpoint returns one account detail, unlike the versioned
      // accounts/check inventory. The composer reads account_user directly.
      bodyFor: virtualAccountDetails
    },
    {
      // DeviceCheck registration: the app posts here before attaching device
      // tokens and requires a 2xx that sets the `_devicecheck` cookie; a miss
      // poisons every request that carries a device token (including the
      // account inventory) with devicecheck_registration_http_failed.
      prefix: "/devicecheck",
      headers: { "set-cookie": "_devicecheck=ccr-virtual-device; Path=/; SameSite=Lax" },
      body: {}
    }
  ];
}

function virtualAccountInventory({ accountId }: { accountId: string }) {
  return {
    accounts: {
      [accountId]: virtualAccountDetails({ accountId })
    },
    default_account_id: accountId,
    account_ordering: [accountId]
  };
}

function virtualAccountDetails({ accountId }: { accountId: string }) {
  return {
    account: {
      account_id: accountId,
      account_user_id: `user__${accountId}`,
      account_user_role: "account-owner",
      structure: "personal",
      plan_type: "plus",
      is_zdr: false,
      is_openai_internal: false,
      account_residency_region: null,
      is_fedramp_compliant_workspace: false,
      is_deactivated: false,
      has_previously_paid_subscription: false
    },
    account_user: {
      is_trial: false,
      seat_type: "full",
      trial_state: null,
      trial_expires_at: null,
      pending_seat_upgrade_request: false
    },
    entitlement: {
      has_active_subscription: true,
      subscription_plan: "chatgptplusplan"
    },
    last_active_subscription: { subscription_id: null },
    features: [],
    can_access_with_session: true
  };
}

export function matchCodexVirtualRoute(
  pathname: string,
  routes: CodexVirtualRoute[] = codexVirtualAccountRoutes()
): CodexVirtualRoute | undefined {
  if (!pathname.startsWith("/")) return undefined;
  for (const route of routes) {
    if (route.prefix && (pathname === route.prefix || pathname.startsWith(route.prefix))) return route;
    if (route.pattern && new RegExp(route.pattern).test(pathname)) return route;
  }
  return undefined;
}

/**
 * The desktop app attaches auth only to `localhost` or `localhost:8000`
 * literally, so the responder must own the fixed dev port.
 */
export const CODEX_APP_NET_RESPONDER_PORT = 8000;

export function codexAppApiBaseUrl(port: number = CODEX_APP_NET_RESPONDER_PORT): string {
  return `http://localhost:${port}`;
}

async function appendResponderLog(logPath: string, entry: Record<string, unknown>): Promise<void> {
  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, JSON.stringify({ ts: Date.now(), ...entry }) + "\n", "utf8");
  } catch {
  }
}

/**
 * Request headers for the usage proxy hop. Hop-by-hop headers and undefined
 * values are dropped (the loopback request's Host must not leak to the real
 * backend), array values are joined per the HTTP spec, and accept-encoding is
 * forced to identity so upstream bytes pass through uncompressed and the
 * forwarded content-length stays consistent with what we re-send.
 */
function codexUsageProxyRequestHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (value === undefined) continue;
    out[lower] = Array.isArray(value) ? value.join(", ") : value;
  }
  out["accept-encoding"] = "identity";
  return out;
}

export type CodexAppNetResponder = {
  port: number;
  baseUrl: string;
  close(): void;
};

const responders = new Map<number, Promise<CodexAppNetResponder>>();

/** Share the desktop API listener across profile launches in this CCR process. */
export function ensureCodexAppNetResponder(options: {
  listenPort: number;
  logPath: string;
}): Promise<CodexAppNetResponder> {
  const existing = responders.get(options.listenPort);
  if (existing) return existing;
  const pending = startCodexAppNetResponder(options).then((responder) => ({
    ...responder,
    close() {
      if (responders.get(options.listenPort) === pending) responders.delete(options.listenPort);
      responder.close();
    }
  })).catch((error) => {
    if (responders.get(options.listenPort) === pending) responders.delete(options.listenPort);
    throw error;
  });
  responders.set(options.listenPort, pending);
  return pending;
}

/**
 * Loopback HTTP responder for the CCR-launched ChatGPT app. Pointed at via
 * the CODEX_API_BASE_URL environment variable (honored by the app's desktop
 * API URL builder), it serves the virtual-account routes locally and records
 * every other request for further route discovery. Balance/usage paths are
 * forwarded to the ChatGPT backend with the request's own auth headers.
 */
export async function startCodexAppNetResponder(options: {
  listenPort: number;
  logPath: string;
  routes?: CodexVirtualRoute[];
  /** Real backend to forward usage/balance requests to; injectable for tests. */
  proxyBase?: string;
}): Promise<CodexAppNetResponder> {
  const routes = options.routes ?? codexVirtualAccountRoutes();
  const logPath = options.logPath;
  const proxyBase = options.proxyBase ?? CODEX_USAGE_PROXY_BASE;

  const server = createHttpServer((request, response) => {
    void (async () => {
      const url = new URL(request.url || "/", "http://localhost");
      const route = matchCodexVirtualRoute(url.pathname, routes);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 1024 * 1024) break;
        chunks.push(buffer);
      }
      const requestBody = Buffer.concat(chunks).toString("utf8");
      const accountId = String(request.headers["chatgpt-account-id"] || VIRTUAL_ACCOUNT_ID);
      const proxied = !route && isCodexUsageProxyPath(url.pathname);
      if (proxied) {
        try {
          const upstream = await fetch(`${proxyBase}${url.pathname}${url.search}`, {
            method: request.method,
            headers: codexUsageProxyRequestHeaders(request.headers),
            body: request.method === "GET" || request.method === "HEAD" ? undefined : requestBody
          });
          await appendResponderLog(logPath, { event: "proxied", method: request.method, url: url.pathname, status: upstream.status });
          const outHeaders: Record<string, string> = {};
          upstream.headers.forEach((value, name) => {
            const lower = name.toLowerCase();
            if (HOP_BY_HOP_HEADERS.has(lower)) return;
            if (lower === "content-encoding" || lower === "content-length") return;
            outHeaders[name] = value;
          });
          response.writeHead(upstream.status, outHeaders);
          response.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
          await appendResponderLog(logPath, { event: "proxy-error", url: url.pathname, error: error instanceof Error ? error.message : String(error) });
          response.writeHead(502, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "ccr-net-responder", path: url.pathname, note: "usage proxy unreachable" }));
        }
        return;
      }
      await appendResponderLog(logPath, {
        event: route ? "virtual-response" : "not-found",
        method: request.method,
        host: request.headers.host,
        url: url.pathname,
        accountId,
        body: requestBody ? requestBody.slice(0, 4096) : undefined
      });
      if (route) {
        const body = JSON.stringify(route.bodyFor ? route.bodyFor({ accountId }) : route.body);
        response.writeHead(200, {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
          ...(route.headers || {})
        });
        response.end(body);
      } else {
        const body = JSON.stringify({ error: "ccr-net-responder", path: url.pathname });
        response.writeHead(404, { "content-type": "application/json" });
        response.end(body);
      }
    })().catch(() => {
      response.destroy();
    });
  });

  const boundPort = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.listenPort, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : options.listenPort);
    });
  });
  await appendResponderLog(logPath, { event: "responder-started", port: boundPort });

  return {
    port: boundPort,
    baseUrl: codexAppApiBaseUrl(boundPort),
    close() {
      server.close();
    }
  };
}
