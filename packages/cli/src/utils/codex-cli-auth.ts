import { createHash, randomBytes } from "crypto";
import { join } from "path";
import { homedir } from "os";
import { readFileSync, writeFileSync } from "fs";

const CODEX_AUTH_FILE = join(homedir(), ".claude-code-router", "codex_auth.json");
const CODEX_VERIFIER_FILE = join(homedir(), ".claude-code-router", "codex_verifier.tmp");

const OAUTH_CONFIG = {
  client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
  authorization_endpoint: "https://auth.openai.com/oauth/authorize",
  token_endpoint: "https://auth.openai.com/oauth/token",
  redirect_uri: "http://localhost:1455/auth/callback",
  scope: "openid profile email offline_access",
};

function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function generateCodeVerifier(): string {
  const bytes = randomBytes(32);
  return base64URLEncode(bytes);
}

function generateCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest();
  return base64URLEncode(hash);
}

function generateState(): string {
  return randomBytes(16).toString("hex");
}

function buildAuthorizeUrl(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.client_id,
    redirect_uri: OAUTH_CONFIG.redirect_uri,
    response_type: "code",
    scope: OAUTH_CONFIG.scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${OAUTH_CONFIG.authorization_endpoint}?${params.toString()}`;
}

export async function runCodexAuth(): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  const authorizeUrl = buildAuthorizeUrl(codeChallenge, state);

  console.log("Open this URL in your browser and complete sign-in:\n");
  console.log(authorizeUrl);
  console.log();

  // Save code_verifier and state for server to use during callback
  const verifierData = { code_verifier: codeVerifier, state };
  console.log("Saving code_verifier to:", CODEX_VERIFIER_FILE);
  writeFileSync(CODEX_VERIFIER_FILE, JSON.stringify(verifierData, null, 2), {
    mode: 0o600,
    encoding: "utf-8",
  });

  console.log("After completing sign-in, you will be redirected to the server.");
  console.log("The tokens will be saved automatically.");
  console.log();
  console.log("Press Enter when you have completed authentication...");

  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise<void>((resolve) => {
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });

  // Verify tokens were saved
  try {
    const tokens = JSON.parse(readFileSync(CODEX_AUTH_FILE, "utf-8"));
    console.log("\nAuthentication successful!");
    console.log(`Access token expires: ${new Date(tokens.expires_at * 1000).toLocaleString()}`);
  } catch {
    console.log("\nNo tokens found. Authentication may have failed or not completed.");
    console.log("Please try again and ensure you completed the sign-in process.");
  }
}
