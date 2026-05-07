import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AddressInfo } from "net";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "fs";

const CODEX_AUTH_FILE = join(homedir(), ".claude-code-router", "codex_auth.json");
const CODEX_VERIFIER_FILE = join(homedir(), ".claude-code-router", "codex_verifier.tmp");
const OAUTH_CONFIG = {
  client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
  token_endpoint: "https://auth.openai.com/oauth/token",
  scope: "openid profile email offline_access",
  redirect_uri: "http://localhost:1455/auth/callback",
};

function saveTokens(data: any): void {
  const dir = join(homedir(), ".claude-code-router");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const now = Date.now() / 1000;
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
    token_type: data.token_type || "Bearer",
    scope: data.scope,
    expires_at: data.expires_at || now + (data.expires_in || 3600),
    account_id: data.account_id,
    last_refresh: now,
  };

  writeFileSync(CODEX_AUTH_FILE, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
    encoding: "utf-8",
  });
}

export async function registerCodexAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/auth/callback", async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as any;
    const { code, state, error, error_description } = query;

    if (error) {
      reply.type("text/html").send(`
        <html>
          <head><title>Authentication Failed</title></head>
          <body>
            <h1>Authentication Failed</h1>
            <p><strong>Error:</strong> ${error}</p>
            ${error_description ? `<p><strong>Description:</strong> ${error_description}</p>` : ""}
            <p>You can close this window and return to your terminal.</p>
          </body>
        </html>
      `);
      return;
    }

    if (!code || !state) {
      reply.type("text/html").send(`
        <html>
          <head><title>Invalid Callback</title></head>
          <body>
            <h1>Invalid Callback</h1>
            <p>Missing required parameters: code or state</p>
            <p>You can close this window and return to your terminal.</p>
          </body>
        </html>
      `);
      return;
    }

    // Read code_verifier from temp file
    if (!existsSync(CODEX_VERIFIER_FILE)) {
      reply.type("text/html").send(`
        <html>
          <head><title>Authentication Failed</title></head>
          <body>
            <h1>Authentication Failed</h1>
            <p>Code verifier not found. Please run <code>ccr codex-auth</code> again and complete authentication within 5 minutes.</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);
      return;
    }

    let verifierData: { code_verifier: string; state: string };
    try {
      verifierData = JSON.parse(readFileSync(CODEX_VERIFIER_FILE, "utf-8"));
    } catch {
      reply.type("text/html").send(`
        <html>
          <head><title>Authentication Failed</title></head>
          <body>
            <h1>Authentication Failed</h1>
            <p>Invalid code verifier data. Please run <code>ccr codex-auth</code> again.</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);
      return;
    }

    // Validate state
    if (verifierData.state !== state) {
      reply.type("text/html").send(`
        <html>
          <head><title>Authentication Failed</title></head>
          <body>
            <h1>Authentication Failed</h1>
            <p>State mismatch. The callback may not match the current authorization request. Please run <code>ccr codex-auth</code> again.</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);
      return;
    }

    try {
      const tokenParams = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: OAUTH_CONFIG.client_id,
        code,
        redirect_uri: OAUTH_CONFIG.redirect_uri,
        code_verifier: verifierData.code_verifier,
      });

      app.log.info({ params: tokenParams.toString() }, "Codex OAuth token exchange request");

      const response = await fetch(OAUTH_CONFIG.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams,
      });

      const responseText = await response.text();
      app.log.info({ status: response.status, body: responseText }, "Codex OAuth token exchange response");

      if (!response.ok) {
        throw new Error(`Token exchange failed (${response.status}): ${responseText}`);
      }

      const tokenData = JSON.parse(responseText);
      saveTokens(tokenData);

      // Clean up verifier file
      try {
        unlinkSync(CODEX_VERIFIER_FILE);
      } catch {
        // Ignore cleanup errors
      }

      const expiresAt = new Date(tokenData.expires_at ? tokenData.expires_at * 1000 : Date.now() + 3600 * 1000);

      reply.type("text/html").send(`
        <html>
          <head><title>Authentication Successful</title></head>
          <body>
            <h1>Authentication Successful</h1>
            <p>Your Codex OAuth tokens have been saved.</p>
            <p><strong>Access token expires:</strong> ${expiresAt.toLocaleString()}</p>
            <p>You can close this window and return to your terminal.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      app.log.error({ err: error }, "Codex OAuth token exchange failed");
      reply.type("text/html").send(`
        <html>
          <head><title>Authentication Failed</title></head>
          <body>
            <h1>Authentication Failed</h1>
            <p><strong>Error:</strong> ${error.message}</p>
            <p>Please try again by running <code>ccr codex-auth</code> in your terminal.</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);
    }
  });
}
