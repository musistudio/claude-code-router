import { GITHUB_API_BASE_URL, githubHeaders } from "./api-config";
import { promises as fs } from "node:fs";
import { join } from "node:path";

export interface CopilotTokenResponse {
  expires_at: number;
  refresh_in: number;
  token: string;
}

export interface CopilotTokenData {
  githubToken: string;
  copilotToken: string;
  expiresAt: number;
  refreshIn: number;
  accountType: string;
}

const TOKEN_PATH = join(process.env.HOME!, ".claude-code-router", "copilot-token.json");

export async function loadCopilotToken(): Promise<CopilotTokenData | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, "utf8");
    return JSON.parse(content) as CopilotTokenData;
  } catch {
    return null;
  }
}

export async function saveCopilotToken(data: CopilotTokenData): Promise<void> {
  await fs.mkdir(join(process.env.HOME!, ".claude-code-router"), {
    recursive: true,
  });
  await fs.writeFile(TOKEN_PATH, JSON.stringify(data, null, 2));
}

export async function getCopilotToken(
  githubToken: string
): Promise<CopilotTokenResponse> {
  const response = await fetch(
    `${GITHUB_API_BASE_URL}/copilot_internal/v2/token`,
    {
      headers: githubHeaders(githubToken),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get Copilot token: ${response.status}`);
  }

  return response.json();
}

export function isTokenExpiringSoon(
  expiresAt: number,
  bufferSeconds: number = 60
): boolean {
  const now = Date.now() / 1000;
  return expiresAt - now < bufferSeconds;
}
