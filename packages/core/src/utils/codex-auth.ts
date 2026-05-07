import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CODEX_AUTH_FILE = join(homedir(), ".claude-code-router", "codex_auth.json");

const OAUTH_CONFIG = {
  client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
  token_endpoint: "https://auth.openai.com/oauth/token",
};

export interface CodexTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  scope?: string;
  expires_at: number;
  account_id?: string;
  last_refresh?: number;
}

function getAuthFilePath(): string {
  return CODEX_AUTH_FILE;
}

export function loadTokens(): CodexTokens | null {
  try {
    if (!existsSync(CODEX_AUTH_FILE)) {
      return null;
    }
    const data = readFileSync(CODEX_AUTH_FILE, "utf-8");
    const tokens = JSON.parse(data);
    if (!tokens.access_token) {
      return null;
    }
    return tokens as CodexTokens;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: CodexTokens): void {
  const dir = join(homedir(), ".claude-code-router");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CODEX_AUTH_FILE, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
    encoding: "utf-8",
  });
}

export function isTokenExpired(tokens: CodexTokens, leewaySeconds = 30): boolean {
  if (!tokens.expires_at) {
    return false;
  }
  return Date.now() / 1000 + leewaySeconds >= tokens.expires_at;
}

export async function refreshTokens(
  refreshToken: string
): Promise<CodexTokens> {
  const response = await fetch(OAUTH_CONFIG.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: OAUTH_CONFIG.client_id,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
    token_type: data.token_type || "Bearer",
    scope: data.scope,
    expires_at: data.expires_at || Date.now() / 1000 + (data.expires_in || 3600),
    account_id: data.account_id,
    last_refresh: Date.now() / 1000,
  };
}

export async function getValidAccessToken(): Promise<CodexTokens> {
  let tokens = loadTokens();
  if (!tokens) {
    throw new Error(
      "No Codex OAuth tokens found. Run `ccr codex-auth` to authenticate."
    );
  }

  if (isTokenExpired(tokens)) {
    if (!tokens.refresh_token) {
      throw new Error(
        "Codex OAuth token expired and no refresh token available. Run `ccr codex-auth` to re-authenticate."
      );
    }
    tokens = await refreshTokens(tokens.refresh_token);
    saveTokens(tokens);
  }

  return tokens;
}

export { getAuthFilePath, OAUTH_CONFIG };
