import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { LLMProvider } from "@/types/llm";
import { version as ccrVersion } from "../../package.json";

const DEFAULT_CODEX_AUTH_PATH = join(homedir(), ".codex", "auth.json");
const DEFAULT_CHATGPT_CODEX_RESPONSES_URL =
  "https://chatgpt.com/backend-api/codex/responses";
const OPENAI_CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_CODEX_OAUTH_REFRESH_URL =
  process.env.CODEX_REFRESH_TOKEN_URL_OVERRIDE ||
  "https://auth.openai.com/oauth/token";
const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const CODEX_ORIGINATOR = "codex_cli_rs";

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

interface ResolveProviderAuthOptions {
  forceRefresh?: boolean;
}

export interface ResolvedProviderRequestConfig {
  headers: Record<string, string>;
  url?: string;
}

export function isOpenAICodexOAuthProvider(
  provider: LLMProvider
): provider is LLMProvider & {
  auth: { type: "openai_codex_oauth"; codex_auth_path?: string };
} {
  return provider.auth?.type === "openai_codex_oauth";
}

export async function resolveProviderRequestConfig(
  provider: LLMProvider,
  options: ResolveProviderAuthOptions = {}
): Promise<ResolvedProviderRequestConfig> {
  if (!isOpenAICodexOAuthProvider(provider)) {
    if (!provider.apiKey?.trim()) {
      throw new Error(`Provider "${provider.name}" is missing an API key.`);
    }

    return {
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
      },
    };
  }

  const authPath = expandHomeDir(provider.auth.codex_auth_path) || DEFAULT_CODEX_AUTH_PATH;
  let authFile = await readCodexAuthFile(authPath);

  if (
    options.forceRefresh ||
    !authFile.tokens?.access_token ||
    shouldRefreshAccessToken(authFile.tokens.access_token)
  ) {
    authFile = await refreshCodexAuthFile(authPath, authFile);
  }

  const accessToken = authFile.tokens?.access_token;
  if (!accessToken) {
    if (authFile.OPENAI_API_KEY?.trim()) {
      return {
        headers: {
          Authorization: `Bearer ${authFile.OPENAI_API_KEY}`,
        },
      };
    }

    throw new Error(
      `Codex auth file "${authPath}" does not contain a usable access token.`
    );
  }

  const accountId =
    authFile.tokens?.account_id || parseChatGPTAccountId(authFile.tokens?.id_token);

  return {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(accountId ? { "chatgpt-account-id": accountId } : {}),
      originator: CODEX_ORIGINATOR,
      "User-Agent": buildCodexUserAgent(),
    },
    url: shouldUseChatGPTCodexBackend(provider.baseUrl)
      ? DEFAULT_CHATGPT_CODEX_RESPONSES_URL
      : undefined,
  };
}

function expandHomeDir(filePath?: string): string | undefined {
  if (!filePath) {
    return undefined;
  }

  if (filePath === "~") {
    return homedir();
  }

  if (filePath.startsWith("~/")) {
    return join(homedir(), filePath.slice(2));
  }

  return filePath;
}

async function readCodexAuthFile(authPath: string): Promise<CodexAuthFile> {
  const content = await readFile(authPath, "utf8");
  return JSON.parse(content) as CodexAuthFile;
}

function shouldRefreshAccessToken(accessToken: string): boolean {
  const expiresAt = parseJwtExpiration(accessToken);
  if (!expiresAt) {
    return false;
  }

  return expiresAt - Date.now() <= ACCESS_TOKEN_REFRESH_SKEW_MS;
}

function parseJwtExpiration(token: string): number | null {
  const payload = parseJwtPayload(token);
  return typeof payload?.exp === "number" ? payload.exp * 1000 : null;
}

function parseJwtPayload(token?: string): Record<string, unknown> | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseChatGPTAccountId(idToken?: string): string | undefined {
  const payload = parseJwtPayload(idToken);
  const auth =
    payload &&
    typeof payload["https://api.openai.com/auth"] === "object" &&
    payload["https://api.openai.com/auth"] !== null
      ? (payload["https://api.openai.com/auth"] as Record<string, unknown>)
      : null;

  const accountId = auth?.chatgpt_account_id;
  return typeof accountId === "string" && accountId.length > 0
    ? accountId
    : undefined;
}

function shouldUseChatGPTCodexBackend(baseUrl: string): boolean {
  return /^https:\/\/api\.openai\.com\/v1\/responses\/?$/i.test(baseUrl.trim());
}

function buildCodexUserAgent(): string {
  return `${CODEX_ORIGINATOR}/${ccrVersion} (CCR OpenAI/Codex OAuth)`;
}

async function refreshCodexAuthFile(
  authPath: string,
  authFile: CodexAuthFile
): Promise<CodexAuthFile> {
  const refreshToken = authFile.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error(
      `Codex auth file "${authPath}" does not contain a refresh token.`
    );
  }

  const response = await fetch(OPENAI_CODEX_OAUTH_REFRESH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: OPENAI_CODEX_OAUTH_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to refresh Codex OAuth token (${response.status}): ${errorText}`
    );
  }

  const refreshResponse = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
  };

  const nextAuthFile: CodexAuthFile = {
    ...authFile,
    auth_mode: authFile.auth_mode || "chatgpt",
    last_refresh: new Date().toISOString(),
    tokens: {
      ...authFile.tokens,
      access_token:
        refreshResponse.access_token || authFile.tokens?.access_token,
      refresh_token:
        refreshResponse.refresh_token || authFile.tokens?.refresh_token,
      id_token: refreshResponse.id_token || authFile.tokens?.id_token,
    },
  };

  await mkdir(dirname(authPath), { recursive: true });
  await writeFile(authPath, JSON.stringify(nextAuthFile, null, 2), {
    mode: 0o600,
  });

  return nextAuthFile;
}
