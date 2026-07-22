import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claudeCodeCandidate, importClaudeCodeProvider } from "@ccr/core/agents/local-providers/claude-code.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";

test("Claude Code local provider prefers macOS Keychain credentials over stale file credentials", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityOutput({
        claudeAiOauth: {
          accessToken: "keychain-access-token",
          refreshToken: "keychain-refresh-token"
        }
      }, async () => {
        writeClaudeCredentials(home, {
          access_token: "stale-file-access-token",
          refresh_token: "stale-file-refresh-token"
        });

        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, "keychain:Claude Code-credentials");

        const result = importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer keychain-access-token");
        assert.equal(result.providerPlugins[1].auth.headers.authorization, "Bearer keychain-access-token");
      });
    });
  });
});

test("Claude Code local provider falls back to file credentials when Keychain is unavailable", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityFailure(async () => {
        const credentialFile = writeClaudeCredentials(home, {
          accessToken: "file-access-token",
          refreshToken: "file-refresh-token"
        });

        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, credentialFile);

        const result = importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer file-access-token");
      });
    });
  });
});

test("Core gateway config replaces imported Claude Code OAuth token with live macOS Keychain token", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityOutput({
        access_token: "keychain-runtime-token",
        refresh_token: "keychain-refresh-token"
      }, async () => {
        const config = createDefaultAppConfig({ generatedConfigFile: path.join(home, "config.json") });
        config.providerPlugins = [
          {
            auth: {
              headers: {
                authorization: "Bearer imported-stale-token",
                "anthropic-beta": "oauth-2025-04-20"
              },
              removeHeaders: ["x-api-key"],
              strict: true
            },
            key: "ccr-local-agent-claude-code-api-claude-code-oauth",
            providerName: "Claude Code API"
          }
        ];
        config.Providers = [
          {
            api_base_url: "https://api.anthropic.com",
            id: "claude-code-api",
            models: ["claude-sonnet-5"],
            name: "Claude Code API",
            type: "anthropic_messages"
          }
        ];

        const compiled = await compileCoreGatewayConfig(config, "raw-trace-token", "billing-usage-token", "core-auth-token");
        const plugin = compiled.providerPlugins.find((item) => item.key === "ccr-local-agent-claude-code-api-claude-code-oauth");

        assert.equal(plugin.auth.headers.authorization, "Bearer keychain-runtime-token");
        assert.deepEqual(plugin.auth.headers["anthropic-beta"], {
          default: "oauth-2025-04-20",
          from: "request.headers.anthropic-beta"
        });
      });
    });
  });
});

async function withClaudeCodeHome(run) {
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-claude-code-provider-"));
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  try {
    await run(home);
  } finally {
    restoreEnv("HOME", previousHome);
    rmSync(home, { force: true, recursive: true });
  }
}

async function withPlatform(platform, run) {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform
  });
  try {
    await run();
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
}

async function withFakeSecurityOutput(output, run) {
  await withFakeSecurityScript(`cat <<'CCR_KEYCHAIN_JSON'\n${JSON.stringify(output)}\nCCR_KEYCHAIN_JSON\n`, run);
}

async function withFakeSecurityFailure(run) {
  await withFakeSecurityScript("exit 44\n", run);
}

async function withFakeSecurityScript(body, run) {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "ccr-security-bin-"));
  const securityPath = path.join(binDir, "security");
  const previousPath = process.env.PATH;
  writeFileSync(securityPath, `#!/bin/sh\n${body}`);
  chmodSync(securityPath, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
  try {
    await run();
  } finally {
    restoreEnv("PATH", previousPath);
    rmSync(binDir, { force: true, recursive: true });
  }
}

function writeClaudeCredentials(home, credentials) {
  const directory = path.join(home, ".claude");
  const credentialFile = path.join(directory, ".credentials.json");
  mkdirSync(directory, { recursive: true });
  writeFileSync(credentialFile, JSON.stringify(credentials, null, 2));
  return credentialFile;
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
