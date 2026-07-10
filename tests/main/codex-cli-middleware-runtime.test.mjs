import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { codexCliMiddlewareRuntimeScript } from "../../packages/core/src/agents/codex/cli-middleware-runtime.ts";

test("generated Codex CLI middleware runtime is valid JavaScript", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-check-"));
  const file = path.join(dir, "ccr-codex-cli-middleware.js");
  writeFileSync(file, codexCliMiddlewareRuntimeScript());
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
});

test("Codex app-server exposes a local virtual identity without ChatGPT credentials", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-virtual-auth-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const codexHome = path.join(dir, "codex-home");
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const readline = require('node:readline');",
    "const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });",
    "input.on('line', (line) => {",
    "  const request = JSON.parse(line);",
    "  const result = request.method === 'account/read'",
    "    ? { account: { type: 'chatgpt', email: 'real@example.com', planType: 'pro' }, requiresOpenaiAuth: true }",
    "    : { authMethod: 'chatgpt', authToken: 'real-chatgpt-token', requiresOpenaiAuth: true };",
    "  process.stdout.write(JSON.stringify({ id: request.id, result }) + '\\n');",
    "});",
    ""
  ].join("\n"));
  chmodSync(fakeCodex, 0o700);

  const result = spawnSync(process.execPath, [runtimeFile, "app-server"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_CODEX_REMOTE_FRONTEND_MODE: "app",
      CCR_PROFILE_SCOPE: "ccr",
      CCR_REAL_CODEX_CLI_PATH: fakeCodex,
      CODEX_HOME: codexHome
    },
    input: [
      JSON.stringify({ id: 1, method: "getAuthStatus", params: { includeToken: true, refreshToken: false } }),
      JSON.stringify({ id: 2, method: "getAuthStatus", params: { includeToken: false, refreshToken: false } }),
      JSON.stringify({ id: 3, method: "account/read", params: {} }),
      ""
    ].join("\n")
  });

  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(responses[0].result, {
    authMethod: "amazonBedrock",
    authToken: "ccr-local-profile",
    requiresOpenaiAuth: false
  });
  assert.deepEqual(responses[1].result, {
    authMethod: "amazonBedrock",
    authToken: null,
    requiresOpenaiAuth: false
  });
  assert.deepEqual(responses[2].result, {
    account: { type: "amazonBedrock", credentialSource: "codexManaged" },
    requiresOpenaiAuth: false
  });
  assert.deepEqual(JSON.parse(readFileSync(path.join(codexHome, "auth.json"), "utf8")), {
    auth_mode: "apikey",
    OPENAI_API_KEY: "ccr-local-profile"
  });
});

test("Codex app-server never overwrites an existing auth file", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-preserve-auth-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const codexHome = path.join(dir, "codex-home");
  const authFile = path.join(codexHome, "auth.json");
  const existingAuth = { auth_mode: "chatgpt", tokens: { placeholder: "preserve-me" } };
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(authFile, JSON.stringify(existingAuth));
  writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const readline = require('node:readline');",
    "const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });",
    "input.on('line', (line) => {",
    "  const request = JSON.parse(line);",
    "  process.stdout.write(JSON.stringify({ id: request.id, result: { authMethod: 'chatgpt', authToken: null, requiresOpenaiAuth: false } }) + '\\n');",
    "});",
    ""
  ].join("\n"));
  chmodSync(fakeCodex, 0o700);

  const result = spawnSync(process.execPath, [runtimeFile, "app-server"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_CODEX_REMOTE_FRONTEND_MODE: "app",
      CCR_PROFILE_SCOPE: "ccr",
      CCR_REAL_CODEX_CLI_PATH: fakeCodex,
      CODEX_HOME: codexHome
    },
    input: JSON.stringify({ id: 1, method: "getAuthStatus", params: { includeToken: false, refreshToken: false } }) + "\n"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(authFile, "utf8")), existingAuth);
});

test("Codex app-server delegates plugin listings to Codex's official marketplace sync", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-official-plugins-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const codexHome = path.join(dir, "codex-home");
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const readline = require('node:readline');",
    "const marketplace = path.join(process.env.CODEX_HOME, '.tmp', 'plugins', '.agents', 'plugins', 'marketplace.json');",
    "setTimeout(() => { fs.mkdirSync(path.dirname(marketplace), { recursive: true }); fs.writeFileSync(marketplace, '{}'); }, 100);",
    "const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });",
    "input.on('line', (line) => {",
    "  const request = JSON.parse(line);",
    "  process.stdout.write(JSON.stringify({ id: request.id, result: { marketplaces: [{ name: 'openai-curated', path: '/remote-git-snapshot/.agents/plugins/marketplace.json', interface: { displayName: 'Codex official' }, plugins: [] }], marketplaceLoadErrors: [], featuredPluginIds: [] } }) + '\\n');",
    "});",
    ""
  ].join("\n"));
  chmodSync(fakeCodex, 0o700);

  const result = spawnSync(process.execPath, [runtimeFile, "app-server"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_CODEX_REMOTE_FRONTEND_MODE: "app",
      CCR_PROFILE_SCOPE: "ccr",
      CCR_REAL_CODEX_CLI_PATH: fakeCodex,
      CODEX_HOME: codexHome
    },
    input: [
      JSON.stringify({ id: 1, method: "plugin/list", params: { marketplaceKinds: ["local", "vertical"] } }),
      JSON.stringify({ id: 2, method: "plugin/list", params: { marketplaceKinds: ["created-by-me-remote"] } }),
      ""
    ].join("\n")
  });

  assert.equal(result.status, 0, result.stderr);
  const responses = new Map(result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line)).map((response) => [response.id, response]));
  assert.equal(responses.get(1).result.marketplaces[0].name, "openai-curated");
  assert.equal(responses.get(1).result.marketplaces[0].path, "/remote-git-snapshot/.agents/plugins/marketplace.json");
  assert.deepEqual(responses.get(1).result.marketplaces[0].interface, { displayName: "Codex official" });
  assert.deepEqual(responses.get(2).result, { marketplaces: [], marketplaceLoadErrors: [], featuredPluginIds: [] });
});

test("Claude Code wrapper injects the scoped profile model into real CLI args", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-wrapper-"));
  const runtimeFile = writeRuntimeScript(dir);
  const { fakeCli, outputFile } = writeFakeClaudeCli(dir);

  execFileSync(process.execPath, [runtimeFile, "-p", "hi"], {
    env: {
      ...process.env,
      ANTHROPIC_MODEL: "Fusion/kimisearch",
      CCR_CLAUDE_CODE_MODEL: "Fusion/kimisearch",
      CCR_CLAUDE_CODE_WRAPPER: "1",
      CCR_FAKE_CLAUDE_OUT: outputFile,
      CCR_REAL_CLAUDE_CODE_BIN: fakeCli,
      CCR_REMOTE_SYNC_ENABLED: "0"
    },
    stdio: "pipe"
  });

  const observed = JSON.parse(readFileSync(outputFile, "utf8"));
  assert.deepEqual(observed.argv, ["--model", "Fusion/kimisearch", "-p", "hi"]);
  assert.equal(observed.env.ANTHROPIC_MODEL, "Fusion/kimisearch");
  assert.equal(observed.env.CCR_CLAUDE_CODE_MODEL, "Fusion/kimisearch");
});

test("Claude Code wrapper does not duplicate an explicit model argument", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-wrapper-"));
  const runtimeFile = writeRuntimeScript(dir);
  const { fakeCli, outputFile } = writeFakeClaudeCli(dir);

  execFileSync(process.execPath, [runtimeFile, "--model", "Provider/manual", "-p", "hi"], {
    env: {
      ...process.env,
      ANTHROPIC_MODEL: "Fusion/kimisearch",
      CCR_CLAUDE_CODE_MODEL: "Fusion/kimisearch",
      CCR_CLAUDE_CODE_WRAPPER: "1",
      CCR_FAKE_CLAUDE_OUT: outputFile,
      CCR_REAL_CLAUDE_CODE_BIN: fakeCli,
      CCR_REMOTE_SYNC_ENABLED: "0"
    },
    stdio: "pipe"
  });

  const observed = JSON.parse(readFileSync(outputFile, "utf8"));
  assert.deepEqual(observed.argv, ["--model", "Provider/manual", "-p", "hi"]);
});

test("Claude Code wrapper injects the ToolHub MCP config into real CLI args", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-wrapper-"));
  const runtimeFile = writeRuntimeScript(dir);
  const { fakeCli, outputFile } = writeFakeClaudeCli(dir);
  const mcpConfigFile = path.join(dir, "toolhub-mcp.json");

  execFileSync(process.execPath, [runtimeFile, "-p", "hi"], {
    env: {
      ...process.env,
      CCR_CLAUDE_CODE_MCP_CONFIG: mcpConfigFile,
      CCR_CLAUDE_CODE_WRAPPER: "1",
      CCR_FAKE_CLAUDE_OUT: outputFile,
      CCR_REAL_CLAUDE_CODE_BIN: fakeCli,
      CCR_REMOTE_SYNC_ENABLED: "0"
    },
    stdio: "pipe"
  });

  const observed = JSON.parse(readFileSync(outputFile, "utf8"));
  assert.deepEqual(observed.argv, ["--mcp-config", mcpConfigFile, "-p", "hi"]);
  assert.equal(observed.env.CCR_CLAUDE_CODE_MCP_CONFIG, mcpConfigFile);
});

test("Claude Code wrapper does not duplicate an explicit MCP config argument", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-wrapper-"));
  const runtimeFile = writeRuntimeScript(dir);
  const { fakeCli, outputFile } = writeFakeClaudeCli(dir);
  const envMcpConfigFile = path.join(dir, "toolhub-mcp.json");
  const explicitMcpConfigFile = path.join(dir, "manual-mcp.json");

  execFileSync(process.execPath, [runtimeFile, "--mcp-config", explicitMcpConfigFile, "-p", "hi"], {
    env: {
      ...process.env,
      CCR_CLAUDE_CODE_MCP_CONFIG: envMcpConfigFile,
      CCR_CLAUDE_CODE_WRAPPER: "1",
      CCR_FAKE_CLAUDE_OUT: outputFile,
      CCR_REAL_CLAUDE_CODE_BIN: fakeCli,
      CCR_REMOTE_SYNC_ENABLED: "0"
    },
    stdio: "pipe"
  });

  const observed = JSON.parse(readFileSync(outputFile, "utf8"));
  assert.deepEqual(observed.argv, ["--mcp-config", explicitMcpConfigFile, "-p", "hi"]);
});

function writeRuntimeScript(dir) {
  const file = path.join(dir, "ccr-codex-cli-middleware.js");
  writeFileSync(file, codexCliMiddlewareRuntimeScript());
  chmodSync(file, 0o700);
  return file;
}

function writeFakeClaudeCli(dir) {
  const fakeCli = path.join(dir, "fake-claude");
  const outputFile = path.join(dir, "fake-claude-output.json");
  writeFileSync(fakeCli, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "fs.writeFileSync(process.env.CCR_FAKE_CLAUDE_OUT, JSON.stringify({",
    "  argv: process.argv.slice(2),",
    "  env: {",
    "    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || '',",
    "    CCR_CLAUDE_CODE_MODEL: process.env.CCR_CLAUDE_CODE_MODEL || '',",
    "    CCR_CLAUDE_CODE_MCP_CONFIG: process.env.CCR_CLAUDE_CODE_MCP_CONFIG || ''",
    "  }",
    "}));",
    ""
  ].join("\n"));
  chmodSync(fakeCli, 0o700);
  return { fakeCli, outputFile };
}
