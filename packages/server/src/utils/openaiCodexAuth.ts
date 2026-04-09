import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_ISSUER = "https://auth.openai.com";
const DEFAULT_AUTH_PATH = join(homedir(), ".codex", "auth.json");
const CHATGPT_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const CODEX_ORIGINATOR = "codex_cli_rs";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const DEVICE_CODE_TTL_MS = 15 * 60 * 1000;

interface CodexAuthFile {
  OPENAI_API_KEY?: string | null;
  auth_mode?: string | null;
  last_refresh?: string | null;
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    account_id?: string;
  };
}

interface DeviceCodeStartResponse {
  device_auth_id: string;
  user_code: string;
  interval: string | number;
}

interface DeviceCodePollSuccessResponse {
  authorization_code: string;
  code_challenge: string;
  code_verifier: string;
}

interface TokenExchangeResponse {
  id_token: string;
  access_token: string;
  refresh_token: string;
}

type DeviceLoginState = "pending" | "completed" | "error" | "expired" | "cancelled";

interface DeviceLoginSessionInternal {
  sessionId: string;
  authPath: string;
  issuer: string;
  deviceAuthId: string;
  userCode: string;
  verificationUrl: string;
  intervalSeconds: number;
  createdAt: number;
  state: DeviceLoginState;
  error?: string;
}

export interface OpenAICodexAuthStatus {
  authenticated: boolean;
  authPath: string;
  authMode?: string | null;
  lastRefresh?: string | null;
  email?: string | null;
  planType?: string | null;
  accountId?: string | null;
}

export interface OpenAICodexDeviceSessionPublic {
  sessionId: string;
  authPath: string;
  verificationUrl: string;
  userCode: string;
  intervalSeconds: number;
  expiresAt: string;
  state: DeviceLoginState;
  error?: string;
}

const deviceLoginSessions = new Map<string, DeviceLoginSessionInternal>();

const OPENAI_CODEX_MODEL_ALIASES: Array<[string, string[]]> = [
  ["gpt-5.4", ["gpt-5.2-codex", "gpt-5.1-codex-max", "gpt-5-codex"]],
  ["gpt-5.4-mini", ["gpt-5-codex-mini", "gpt-5.1-codex-mini"]],
  ["gpt-5.3-codex", ["gpt-5.1-codex-max", "gpt-5.1-codex", "gpt-5.2-codex"]],
  ["gpt-5.3-codex-spark", ["gpt-5.1-codex-mini", "gpt-5-codex-mini"]],
];

export function getDefaultCodexAuthPath(): string {
  return DEFAULT_AUTH_PATH;
}

export function withOpenAICodexModelAliases(models: string[]): string[] {
  const mergedModels = [...models];
  for (const [aliasModel, candidates] of OPENAI_CODEX_MODEL_ALIASES) {
    if (mergedModels.includes(aliasModel)) {
      continue;
    }
    if (candidates.some((candidate) => mergedModels.includes(candidate))) {
      mergedModels.unshift(aliasModel);
    }
  }
  return Array.from(new Set(mergedModels));
}

export function getResolvedAuthPath(authPath?: string): string {
  if (!authPath) {
    return DEFAULT_AUTH_PATH;
  }

  if (authPath === "~") {
    return homedir();
  }

  if (authPath.startsWith("~/")) {
    return join(homedir(), authPath.slice(2));
  }

  return authPath;
}

export async function getOpenAICodexAuthStatus(
  authPath?: string
): Promise<OpenAICodexAuthStatus> {
  const resolvedAuthPath = getResolvedAuthPath(authPath);

  try {
    const authFile = await readAuthFile(resolvedAuthPath);
    const idClaims = authFile.tokens?.id_token
      ? parseJwtPayload(authFile.tokens.id_token)
      : null;
    const authClaims =
      idClaims &&
      typeof idClaims["https://api.openai.com/auth"] === "object" &&
      idClaims["https://api.openai.com/auth"] !== null
        ? (idClaims["https://api.openai.com/auth"] as Record<string, unknown>)
        : null;
    const profileClaims =
      idClaims &&
      typeof idClaims["https://api.openai.com/profile"] === "object" &&
      idClaims["https://api.openai.com/profile"] !== null
        ? (idClaims["https://api.openai.com/profile"] as Record<string, unknown>)
        : null;

    return {
      authenticated: Boolean(
        authFile.tokens?.access_token || authFile.OPENAI_API_KEY
      ),
      authPath: resolvedAuthPath,
      authMode: authFile.auth_mode,
      lastRefresh: authFile.last_refresh,
      email:
        asOptionalString(profileClaims?.email) ||
        asOptionalString(idClaims?.email) ||
        null,
      planType: asOptionalString(authClaims?.chatgpt_plan_type) || null,
      accountId:
        asOptionalString(authClaims?.chatgpt_account_id) ||
        authFile.tokens?.account_id ||
        null,
    };
  } catch {
    return {
      authenticated: false,
      authPath: resolvedAuthPath,
    };
  }
}

export async function startOpenAICodexDeviceLogin(
  authPath?: string,
  issuer = DEFAULT_ISSUER
): Promise<OpenAICodexDeviceSessionPublic> {
  const resolvedAuthPath = getResolvedAuthPath(authPath);
  const authBaseUrl = `${issuer.replace(/\/$/, "")}/api/accounts`;
  const response = await fetch(`${authBaseUrl}/deviceauth/usercode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to start OpenAI/Codex login (${response.status}): ${errorText}`
    );
  }

  const payload = (await response.json()) as DeviceCodeStartResponse;
  const intervalSeconds = normalizeIntervalSeconds(payload.interval);
  const sessionId = randomUUID();

  const session: DeviceLoginSessionInternal = {
    sessionId,
    authPath: resolvedAuthPath,
    issuer: issuer.replace(/\/$/, ""),
    deviceAuthId: payload.device_auth_id,
    userCode: payload.user_code,
    verificationUrl: `${issuer.replace(/\/$/, "")}/codex/device`,
    intervalSeconds,
    createdAt: Date.now(),
    state: "pending",
  };

  deviceLoginSessions.set(sessionId, session);
  return toPublicSession(session);
}

export async function pollOpenAICodexDeviceLogin(
  sessionId: string
): Promise<OpenAICodexDeviceSessionPublic> {
  const session = deviceLoginSessions.get(sessionId);
  if (!session) {
    throw new Error("OpenAI/Codex login session not found.");
  }

  if (session.state !== "pending") {
    return toPublicSession(session);
  }

  if (session.createdAt + DEVICE_CODE_TTL_MS <= Date.now()) {
    session.state = "expired";
    session.error = "The OpenAI/Codex login code expired. Start a new login.";
    return toPublicSession(session);
  }

  const authBaseUrl = `${session.issuer}/api/accounts`;
  const response = await fetch(`${authBaseUrl}/deviceauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      device_auth_id: session.deviceAuthId,
      user_code: session.userCode,
    }),
  });

  if (response.status === 403 || response.status === 404) {
    return toPublicSession(session);
  }

  if (!response.ok) {
    session.state = "error";
    session.error = `Device auth failed with status ${response.status}`;
    return toPublicSession(session);
  }

  try {
    const payload = (await response.json()) as DeviceCodePollSuccessResponse;
    const tokens = await exchangeAuthorizationCode(
      session.issuer,
      payload.authorization_code,
      payload.code_verifier
    );
    await persistAuthFile(session.authPath, tokens);
    session.state = "completed";
    session.error = undefined;
    return toPublicSession(session);
  } catch (error) {
    session.state = "error";
    session.error = (error as Error).message;
    return toPublicSession(session);
  }
}

export function cancelOpenAICodexDeviceLogin(
  sessionId: string
): OpenAICodexDeviceSessionPublic {
  const session = deviceLoginSessions.get(sessionId);
  if (!session) {
    throw new Error("OpenAI/Codex login session not found.");
  }

  session.state = "cancelled";
  session.error = "The login request was cancelled.";
  return toPublicSession(session);
}

export async function fetchOpenAICodexModels(authPath?: string): Promise<string[]> {
  const { accessToken, accountId } = await resolveChatGPTCodexAuth(authPath);
  const response = await fetch(`${CHATGPT_CODEX_BASE_URL}/models`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(accountId ? { "chatgpt-account-id": accountId } : {}),
      originator: CODEX_ORIGINATOR,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch OpenAI models (${response.status}): ${errorText}`
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ id?: string }>;
  };

  return (payload.data || [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string")
    .sort();
}

async function resolveOpenAIAccessToken(authPath?: string): Promise<string> {
  const resolvedAuthPath = getResolvedAuthPath(authPath);
  const authFile = await readAuthFile(resolvedAuthPath);

  if (
    authFile.tokens?.access_token &&
    !shouldRefreshAccessToken(authFile.tokens.access_token)
  ) {
    return authFile.tokens.access_token;
  }

  if (authFile.tokens?.refresh_token) {
    const refreshed = await refreshAuthFile(resolvedAuthPath, authFile);
    if (refreshed.tokens?.access_token) {
      return refreshed.tokens.access_token;
    }
  }

  if (authFile.OPENAI_API_KEY) {
    return authFile.OPENAI_API_KEY;
  }

  throw new Error(
    `No usable OpenAI/Codex access token found in "${resolvedAuthPath}".`
  );
}

async function resolveChatGPTCodexAuth(
  authPath?: string
): Promise<{ accessToken: string; accountId?: string }> {
  const resolvedAuthPath = getResolvedAuthPath(authPath);
  const authFile = await readAuthFile(resolvedAuthPath);

  return {
    accessToken: await resolveOpenAIAccessToken(authPath),
    accountId:
      authFile.tokens?.account_id ||
      (authFile.tokens?.id_token
        ? extractAccountId(authFile.tokens.id_token)
        : undefined),
  };
}

async function refreshAuthFile(
  authPath: string,
  authFile: CodexAuthFile
): Promise<CodexAuthFile> {
  const refreshToken = authFile.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error("No refresh token is available.");
  }

  const response = await fetch(`${DEFAULT_ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to refresh OpenAI/Codex token (${response.status}): ${errorText}`
    );
  }

  const payload = (await response.json()) as Partial<TokenExchangeResponse>;
  const nextAuthFile: CodexAuthFile = {
    ...authFile,
    auth_mode: authFile.auth_mode || "chatgpt",
    last_refresh: new Date().toISOString(),
    tokens: {
      ...authFile.tokens,
      access_token: payload.access_token || authFile.tokens?.access_token,
      refresh_token: payload.refresh_token || authFile.tokens?.refresh_token,
      id_token: payload.id_token || authFile.tokens?.id_token,
    },
  };

  await writeAuthFile(authPath, nextAuthFile);
  return nextAuthFile;
}

async function exchangeAuthorizationCode(
  issuer: string,
  authorizationCode: string,
  codeVerifier: string
): Promise<TokenExchangeResponse> {
  const response = await fetch(`${issuer}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: `${issuer}/deviceauth/callback`,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Token exchange failed (${response.status}): ${errorText}`
    );
  }

  return (await response.json()) as TokenExchangeResponse;
}

async function persistAuthFile(
  authPath: string,
  tokens: TokenExchangeResponse
): Promise<void> {
  const nextAuthFile: CodexAuthFile = {
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    last_refresh: new Date().toISOString(),
    tokens: {
      id_token: tokens.id_token,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      account_id: extractAccountId(tokens.id_token),
    },
  };

  await writeAuthFile(authPath, nextAuthFile);
}

async function readAuthFile(authPath: string): Promise<CodexAuthFile> {
  const content = await readFile(authPath, "utf8");
  return JSON.parse(content) as CodexAuthFile;
}

async function writeAuthFile(
  authPath: string,
  authFile: CodexAuthFile
): Promise<void> {
  await mkdir(dirname(authPath), { recursive: true });
  await writeFile(authPath, JSON.stringify(authFile, null, 2), { mode: 0o600 });
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function extractAccountId(idToken: string): string | undefined {
  const claims = parseJwtPayload(idToken);
  const authClaims =
    claims &&
    typeof claims["https://api.openai.com/auth"] === "object" &&
    claims["https://api.openai.com/auth"] !== null
      ? (claims["https://api.openai.com/auth"] as Record<string, unknown>)
      : null;

  return asOptionalString(authClaims?.chatgpt_account_id);
}

function shouldRefreshAccessToken(accessToken: string): boolean {
  const claims = parseJwtPayload(accessToken);
  const exp =
    claims && typeof claims.exp === "number"
      ? claims.exp * 1000
      : null;

  if (!exp) {
    return false;
  }

  return exp - Date.now() <= ACCESS_TOKEN_REFRESH_SKEW_MS;
}

function normalizeIntervalSeconds(interval: string | number): number {
  if (typeof interval === "number" && Number.isFinite(interval) && interval > 0) {
    return interval;
  }

  if (typeof interval === "string") {
    const parsed = Number.parseInt(interval, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 5;
}

function toPublicSession(
  session: DeviceLoginSessionInternal
): OpenAICodexDeviceSessionPublic {
  return {
    sessionId: session.sessionId,
    authPath: session.authPath,
    verificationUrl: session.verificationUrl,
    userCode: session.userCode,
    intervalSeconds: session.intervalSeconds,
    expiresAt: new Date(session.createdAt + DEVICE_CODE_TTL_MS).toISOString(),
    state: session.state,
    error: session.error,
  };
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
