import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { codexCliMiddlewareRuntimeScript } from "@ccr/core/agents/codex/cli-middleware-runtime.ts";

test("generated Codex CLI middleware runtime is valid JavaScript", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-check-"));
  const file = path.join(dir, "ccr-codex-cli-middleware.js");
  writeFileSync(file, codexCliMiddlewareRuntimeScript());
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
});

test("Codex CLI middleware launches Windows cmd shims", { skip: process.platform !== "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-windows-cmd-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCliScript = path.join(dir, "fake-codex.js");
  const fakeCli = path.join(dir, "fake-codex.cmd");
  writeFileSync(fakeCliScript, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  writeFileSync(fakeCli, [
    "@echo off",
    `"${process.execPath}" "%~dp0fake-codex.js" %*`,
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n"));

  const result = spawnSync(process.execPath, [runtimeFile, "--version"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_CODEX_MODEL_PROVIDER: "claude-code-router",
      CCR_CODEX_PROFILE: "claude-code-router",
      CCR_REAL_CODEX_CLI_PATH: fakeCli
    }
  });

  assert.equal(result.status, 0, result.stderr);
  const forwardedArgs = JSON.parse(result.stdout);
  assert.equal(forwardedArgs.at(-1), "--version");
  assert.equal(forwardedArgs.includes("claude-code-router"), true);
});

test("Windows direct profile dispatch strips the profile command arguments", { skip: process.platform !== "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-windows-dispatch-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCliScript = path.join(dir, "fake-claude.js");
  const fakeCli = path.join(dir, "fake-claude.cmd");
  writeFileSync(fakeCliScript, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  writeFileSync(fakeCli, [
    "@echo off",
    `"${process.execPath}" "%~dp0fake-claude.js" %*`,
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n"));

  const result = spawnSync(process.execPath, [runtimeFile, "Claude Code", "cli", "--", "--version"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_CLAUDE_CODE_WRAPPER: "1",
      CCR_CLI_DIRECT_PROFILE_DISPATCH: "1",
      CCR_REAL_CLAUDE_CODE_BIN: fakeCli,
      CCR_REMOTE_SYNC_ENABLED: "0"
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ["--version"]);
});

test("Codex app-server exposes a ChatGPT-shaped workspace identity without credentials", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-virtual-auth-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const codexHome = path.join(dir, "codex-home");
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const readline = require('node:readline');",
    "const sawBootstrap = fs.existsSync(path.join(process.env.CODEX_HOME, 'auth.json'));",
    "const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });",
    "input.on('line', (line) => {",
    "  const request = JSON.parse(line);",
    "  const result = request.method === 'probe/auth-bootstrap'",
    "    ? { sawBootstrap }",
    "    : request.method === 'account/read'",
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
      CODEX_HOME: codexHome,
      CODEXL_CODEX_WORKSPACE_NAME: "CCR Workspace"
    },
    input: [
      JSON.stringify({ id: 0, method: "probe/auth-bootstrap", params: {} }),
      JSON.stringify({ id: 1, method: "getAuthStatus", params: { includeToken: true, refreshToken: false } }),
      JSON.stringify({ id: 2, method: "getAuthStatus", params: { includeToken: false, refreshToken: false } }),
      JSON.stringify({ id: 3, method: "account/read", params: {} }),
      ""
    ].join("\n")
  });

  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(responses[0].result, { sawBootstrap: true });
  assert.deepEqual(responses[1].result, {
    authMethod: "chatgpt",
    authToken: null,
    requiresOpenaiAuth: true
  });
  assert.deepEqual(responses[2].result, {
    authMethod: "chatgpt",
    requiresOpenaiAuth: true
  });
  assert.deepEqual(responses[3].result, {
    account: { type: "chatgpt", email: "CCR Workspace", planType: "unknown" },
    requiresOpenaiAuth: true
  });
  assert.equal(existsSync(path.join(codexHome, "auth.json")), false);
});

test("Codex app-server reads but never overwrites an existing ChatGPT auth file", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-preserve-auth-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const codexHome = path.join(dir, "codex-home");
  const authFile = path.join(codexHome, "auth.json");
  const token = "header.eyJodHRwczovL2FwaS5vcGVuYWkuY29tL3Byb2ZpbGUiOnsiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0sImh0dHBzOi8vYXBpLm9wZW5haS5jb20vYXV0aCI6eyJjaGF0Z3B0X3BsYW5fdHlwZSI6InBsdXMifX0.signature";
  const existingAuth = {
    auth_mode: "chatgpt",
    tokens: { access_token: token, id_token: token, refresh_token: "preserve-me" }
  };
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(authFile, JSON.stringify(existingAuth));
  writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const readline = require('node:readline');",
    "const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });",
    "input.on('line', (line) => {",
    "  const request = JSON.parse(line);",
    "  const result = request.method === 'account/read'",
    "    ? { account: null, requiresOpenaiAuth: false }",
    "    : { authMethod: null, authToken: null, requiresOpenaiAuth: false };",
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
      JSON.stringify({ id: 2, method: "account/read", params: {} }),
      ""
    ].join("\n")
  });

  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(responses[0].result, {
    authMethod: "chatgpt",
    authToken: token,
    requiresOpenaiAuth: true
  });
  assert.deepEqual(responses[1].result, {
    account: { type: "chatgpt", email: "user@example.com", planType: "plus" },
    requiresOpenaiAuth: true
  });
  assert.deepEqual(JSON.parse(readFileSync(authFile, "utf8")), existingAuth);
});

test("Codex app-server delegates public Git marketplaces and leaves account-private marketplaces empty", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-official-plugins-"));
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
    "  const kind = request.params.marketplaceKinds[0];",
    "  process.stdout.write(JSON.stringify({ id: request.id, result: { marketplaces: [{ name: kind, path: '/native/' + kind }], marketplaceLoadErrors: [], featuredPluginIds: [] } }) + '\\n');",
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
  assert.equal(responses.get(1).result.marketplaces[0].name, "local");
  assert.equal(responses.get(1).result.marketplaces[0].path, "/native/local");
  assert.deepEqual(responses.get(2).result, {
    marketplaces: [],
    marketplaceLoadErrors: [],
    featuredPluginIds: []
  });
});

test("Codex app-server delegates the native model catalog unchanged", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-native-models-"));
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
    "  process.stdout.write(JSON.stringify({ id: request.id, result: { data: [{ id: 'native-model', hidden: true }], nextCursor: null } }) + '\\n');",
    "});",
    ""
  ].join("\n"));
  chmodSync(fakeCodex, 0o700);

  const result = spawnSync(process.execPath, [runtimeFile, "app-server"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_CODEX_MODEL_CATALOG: JSON.stringify({ models: [{ slug: "must-not-be-merged" }] }),
      CCR_CODEX_REMOTE_FRONTEND_MODE: "app",
      CCR_REAL_CODEX_CLI_PATH: fakeCodex,
      CODEX_HOME: codexHome
    },
    input: JSON.stringify({ id: 1, method: "model/list", params: {} }) + "\n"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()).result, {
    data: [{ id: "native-model", hidden: true }],
    nextCursor: null
  });
});

test("Claude Code wrapper leaves the scoped profile model as an environment default", { skip: process.platform === "win32" }, () => {
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
  assert.deepEqual(observed.argv, ["-p", "hi"]);
  assert.equal(observed.env.ANTHROPIC_MODEL, "Fusion/kimisearch");
  assert.equal(observed.env.CCR_CLAUDE_CODE_MODEL, "Fusion/kimisearch");
});

test("Claude Code wrapper preserves an explicit model argument", { skip: process.platform === "win32" }, () => {
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

test("OpenCode bot worker keeps commands responsive while preserving per-conversation turn order", { skip: process.platform === "win32" }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-opencode-bot-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeOpenCode = path.join(dir, "fake-opencode");
  const fakeSdk = path.join(dir, "fake-bot-gateway-sdk.mjs");
  const callsFile = path.join(dir, "opencode-calls.jsonl");
  const repliesFile = path.join(dir, "bot-replies.jsonl");
  const stateDir = path.join(dir, "bot-state");
  const otherProject = path.join(dir, "other-project");
  const configFile = path.join(dir, "opencode.json");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(otherProject, { recursive: true });
  writeFileSync(path.join(stateDir, "opencode-bot-sessions.json"), JSON.stringify({
    version: 1,
    conversations: {
      "ccr:bot-test:conversation-1:": {
        sessionId: "ses_stale_directory",
        directory: "/stale/project",
        title: "Stale session"
      }
    }
  }));
  writeFileSync(configFile, "{}\n");
  writeFileSync(fakeOpenCode, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const argv = process.argv.slice(2);",
    "fs.appendFileSync(process.env.CCR_FAKE_OPENCODE_CALLS, JSON.stringify({",
    "  argv,",
    "  cwd: process.cwd(),",
    "  pwd: process.env.PWD || '',",
    "  config: process.env.OPENCODE_CONFIG || '',",
    "  configContent: process.env.OPENCODE_CONFIG_CONTENT || '',",
    "  client: process.env.OPENCODE_CLIENT || '',",
    "  workerMarker: process.env.CCR_OPENCODE_BOT_WORKER || ''",
    "}) + '\\n');",
    "if (argv[0] === 'session') {",
    "  process.stdout.write(JSON.stringify([",
    "    { id: 'ses_existing', title: 'Existing session', directory: process.cwd(), time: { updated: Date.now() } },",
    "    { id: 'ses_other', title: 'Other session', directory: process.env.CCR_FAKE_OTHER_PROJECT, time: { updated: Date.now() - 1 } }",
    "  ]) + '\\n');",
    "} else {",
    "  const prompt = argv[argv.length - 1];",
    "  const reply = () => process.stdout.write(JSON.stringify({",
    "    type: 'text',",
    "    sessionID: 'ses_bot_1',",
    "    part: { id: 'part-' + prompt, type: 'text', text: 'reply:' + prompt, time: { end: Date.now() } }",
    "  }) + '\\n');",
    "  if (prompt === 'first') setTimeout(reply, 1000); else reply();",
    "}",
    ""
  ].join("\n"));
  chmodSync(fakeOpenCode, 0o700);
  writeFileSync(fakeSdk, [
    "import fs from 'node:fs';",
    "let delivered = false;",
    "export function createBotGatewayClient() {",
    "  return {",
    "    health: async () => ({}),",
    "    events: async () => {",
    "      if (delivered) return { events: [] };",
    "      delivered = true;",
    "      const event = (id, text) => ({",
    "        id,",
    "        event: {",
    "          id, tenantId: 'ccr', integrationId: 'bot-test', platform: 'slack',",
    "          actor: { isBot: false },",
    "          conversation: { id: 'conversation-1', type: 'dm' },",
    "          message: { id: 'message-' + id, text }",
    "        }",
    "      });",
    "      return { events: [",
    "        event('event-1', 'first'),",
    "        event('event-natural-help', 'help'),",
    "        event('event-old-task', '/task'),",
    "        event('event-project-help', '/project'),",
    "        event('event-project-list', '/project list'),",
    "        event('event-session-help', '/session'),",
    "        event('event-session-list', '/session list'),",
    "        event('event-2', 'second')",
    "      ] };",
    "    },",
    "    send: async (payload) => fs.appendFileSync(process.env.CCR_FAKE_BOT_REPLIES, JSON.stringify(payload) + '\\n'),",
    "    ackEvent: async () => ({}),",
    "    close: async () => ({})",
    "  };",
    "}",
    ""
  ].join("\n"));

  let stderr = "";
  const child = spawn(process.execPath, [runtimeFile, "opencode-bot-worker", "--workspace-name", "OpenCode Test"], {
    env: {
      ...process.env,
      CCR_OPENCODE_BOT_WORKER: "1",
      CCR_OPENCODE_BOT_CWD: dir,
      CCR_OPENCODE_BIN: fakeOpenCode,
      CCR_BOT_GATEWAY_ENABLED: "true",
      CCR_BOT_GATEWAY_PLATFORM: "slack",
      CCR_BOT_GATEWAY_INTEGRATION_ID: "bot-test",
      CCR_BOT_GATEWAY_TENANT_ID: "ccr",
      CCR_BOT_GATEWAY_ACK_EVENTS: "true",
      CCR_BOT_GATEWAY_POLL_INTERVAL_MS: "50",
      CCR_BOT_GATEWAY_REQUEST_TIMEOUT_MS: "2000",
      CCR_BOT_GATEWAY_SHELL_ENABLED: "true",
      CCR_BOT_GATEWAY_STARTUP_TIMEOUT_MS: "2000",
      CCR_BOT_GATEWAY_SDK_MODULE: fakeSdk,
      CCR_BOT_GATEWAY_STATE_DIR: stateDir,
      CCR_FAKE_OPENCODE_CALLS: callsFile,
      CCR_FAKE_OTHER_PROJECT: otherProject,
      CCR_FAKE_BOT_REPLIES: repliesFile,
      OPENCODE_CONFIG: configFile,
      OPENCODE_CONFIG_CONTENT: "{\"provider\":{}}"
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  try {
    // Three natural-language turns produce two queue-position notices while
    // the first delayed turn is running, in addition to the command replies.
    const replies = await waitForJsonLines(repliesFile, 10, 7000, () => stderr);
    const calls = await waitForJsonLines(callsFile, 5, 2000, () => stderr);
    const replyTexts = replies.map((reply) => reply.intent.text);
    assert.ok(replyTexts.includes("Unknown Bot command. Send /project or /session to see available commands."));
    assert.ok(replyTexts.some((text) => /^CCR App project commands \(OpenCode\):/.test(text)));
    assert.ok(replyTexts.some((text) => /^OpenCode projects:/.test(text)));
    assert.ok(replyTexts.some((text) => /^CCR App session commands \(OpenCode\):/.test(text)));
    assert.ok(replyTexts.some((text) => /^OpenCode sessions in /.test(text)));
    assert.ok(replyTexts.some((text) => text.includes(otherProject)));
    assert.ok(!replyTexts.some((text) => text.includes("Other session")));
    assert.deepEqual(replyTexts.filter((text) => text.startsWith("reply:")), ["reply:first", "reply:help", "reply:second"]);
    const runCalls = calls.filter((call) => call.argv[0] === "run");
    assert.deepEqual(runCalls[0].argv.slice(0, 7), ["run", "--format", "json", "--dir", dir, "--title", "Bot: OpenCode Test"]);
    assert.ok(!runCalls[0].argv.includes("--auto"));
    assert.equal(runCalls[0].argv.at(-1), "first");
    assert.deepEqual(runCalls[1].argv.slice(0, 7), ["run", "--format", "json", "--dir", dir, "--session", "ses_bot_1"]);
    assert.equal(runCalls[1].argv.at(-1), "help");
    assert.deepEqual(runCalls[2].argv.slice(0, 7), ["run", "--format", "json", "--dir", dir, "--session", "ses_bot_1"]);
    assert.equal(runCalls[2].argv.at(-1), "second");
    assert.equal(realpathSync(runCalls[0].cwd), realpathSync(dir));
    assert.equal(runCalls[0].pwd, dir);
    assert.equal(runCalls[0].config, configFile);
    assert.equal(runCalls[0].configContent, "{\"provider\":{}}");
    assert.equal(runCalls[0].client, "cli");
    assert.equal(runCalls[0].workerMarker, "");
    const store = JSON.parse(readFileSync(path.join(stateDir, "opencode-bot-sessions.json"), "utf8"));
    assert.equal(store.version, 3);
    assert.equal(Object.values(store.conversations)[0].sessionId, "ses_bot_1");
    assert.equal(Object.values(store.conversations)[0].projectDirectory, dir);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await waitForChildExit(child, 3000);
  }
});

test("OpenCode bot worker streams without duplicate final text replies or implicit auto approval", { skip: process.platform === "win32" }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-opencode-bot-stream-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeOpenCode = path.join(dir, "fake-opencode");
  const fakeSdk = path.join(dir, "fake-bot-gateway-sdk.mjs");
  const callsFile = path.join(dir, "opencode-calls.jsonl");
  const repliesFile = path.join(dir, "bot-replies.jsonl");
  const stateDir = path.join(dir, "bot-state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(fakeOpenCode, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const argv = process.argv.slice(2);",
    "fs.appendFileSync(process.env.CCR_FAKE_OPENCODE_CALLS, JSON.stringify({ argv, cwd: process.cwd() }) + '\\n');",
    "process.stdout.write(JSON.stringify({ type: 'text', sessionID: 'ses_stream', part: { id: 'part-1', type: 'text', text: 'reply:stream me' } }) + '\\n');",
    ""
  ].join("\n"));
  chmodSync(fakeOpenCode, 0o700);
  writeFileSync(fakeSdk, [
    "import fs from 'node:fs';",
    "let delivered = false;",
    "export function createBotGatewayClient() {",
    "  return {",
    "    health: async () => ({}),",
    "    events: async () => {",
    "      if (delivered) return { events: [] };",
    "      delivered = true;",
    "      return { events: [{ id: 'event-stream', event: {",
    "        id: 'event-stream', tenantId: 'ccr', integrationId: 'bot-test', platform: 'slack', actor: { isBot: false },",
    "        conversation: { id: 'conversation-1', type: 'dm' }, message: { id: 'message-stream', text: 'stream me' }",
    "      } }] };",
    "    },",
    "    send: async (payload) => fs.appendFileSync(process.env.CCR_FAKE_BOT_REPLIES, JSON.stringify(payload) + '\\n'),",
    "    ackEvent: async () => ({}),",
    "    close: async () => ({})",
    "  };",
    "}",
    ""
  ].join("\n"));

  let stderr = "";
  const child = spawn(process.execPath, [runtimeFile, "opencode-bot-worker", "--workspace-name", "OpenCode Test"], {
    env: {
      ...process.env,
      CCR_OPENCODE_BOT_WORKER: "1",
      CCR_OPENCODE_BOT_CWD: dir,
      CCR_OPENCODE_BIN: fakeOpenCode,
      CCR_BOT_GATEWAY_ENABLED: "true",
      CCR_BOT_GATEWAY_PLATFORM: "slack",
      CCR_BOT_GATEWAY_INTEGRATION_ID: "bot-test",
      CCR_BOT_GATEWAY_TENANT_ID: "ccr",
      CCR_BOT_GATEWAY_ACK_EVENTS: "true",
      CCR_BOT_GATEWAY_POLL_INTERVAL_MS: "50",
      CCR_BOT_GATEWAY_REQUEST_TIMEOUT_MS: "2000",
      CCR_BOT_GATEWAY_SHELL_ENABLED: "true",
      CCR_BOT_GATEWAY_STARTUP_TIMEOUT_MS: "2000",
      CCR_BOT_GATEWAY_STREAM_REPLIES: "true",
      CCR_BOT_GATEWAY_SDK_MODULE: fakeSdk,
      CCR_BOT_GATEWAY_STATE_DIR: stateDir,
      CCR_FAKE_OPENCODE_CALLS: callsFile,
      CCR_FAKE_BOT_REPLIES: repliesFile
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  try {
    const replies = await waitForJsonLines(repliesFile, 2, 7000, () => stderr);
    const calls = await waitForJsonLines(callsFile, 1, 2000, () => stderr);
    assert.equal(calls[0].argv.includes("--auto"), false);
    assert.equal(replies.every((reply) => reply.intent.type === "stream_text"), true);
    assert.equal(replies.some((reply) => reply.intent.type === "text" && reply.intent.text === "reply:stream me"), false);
    assert.equal(replies.filter((reply) => reply.intent.final === true).length, 1);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await waitForChildExit(child, 3000);
  }
});

test("Codex App bot worker uses native projects and sessions without enabling shell tools", { skip: process.platform === "win32" }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-codex-bot-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const fakeSdk = path.join(dir, "fake-bot-gateway-sdk.mjs");
  const callsFile = path.join(dir, "codex-calls.jsonl");
  const repliesFile = path.join(dir, "bot-replies.jsonl");
  const stateDir = path.join(dir, "bot-state");
  const codexHome = path.join(dir, "codex-home");
  const sessionsDir = path.join(codexHome, "sessions", "2026", "07", "14");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });
  writeFileSync(path.join(sessionsDir, "rollout-ses_existing.jsonl"), [
    JSON.stringify({ type: "session_meta", payload: { id: "ses_existing", cwd: dir, timestamp: "2026-07-14T00:00:00.000Z" } }),
    JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Existing Codex session" }] } }),
    ""
  ].join("\n"));
  writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const argv = process.argv.slice(2);",
    "fs.appendFileSync(process.env.CCR_FAKE_CODEX_CALLS, JSON.stringify({ argv, cwd: process.cwd() }) + '\\n');",
    "const prompt = argv[argv.length - 1];",
    "const reply = () => {",
    "  process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'ses_codex' }) + '\\n');",
    "  process.stdout.write(JSON.stringify({ type: 'item.completed', item: { id: 'answer-' + prompt, type: 'agent_message', text: 'reply:' + prompt } }) + '\\n');",
    "};",
    "if (prompt === 'first') setTimeout(reply, 500); else reply();",
    ""
  ].join("\n"));
  chmodSync(fakeCodex, 0o700);
  writeFileSync(fakeSdk, [
    "import fs from 'node:fs';",
    "let delivered = false;",
    "export function createBotGatewayClient() {",
    "  return {",
    "    health: async () => ({}),",
    "    events: async () => {",
    "      if (delivered) return { events: [] };",
    "      delivered = true;",
    "      const event = (id, text) => ({ id, event: {",
    "        id, tenantId: 'ccr', integrationId: 'bot-test', platform: 'slack', actor: { isBot: false },",
    "        conversation: { id: 'conversation-1', type: 'dm' }, message: { id: 'message-' + id, text }",
    "      } });",
    "      return { events: [",
    "        event('project-list', '/project list'),",
    "        event('project-use', '/project use 1'),",
    "        event('session-list', '/session list'),",
    "        event('session-use', '/session use 1'),",
    "        event('first', 'first'),",
    "        event('second', 'second')",
    "      ] };",
    "    },",
    "    send: async (payload) => fs.appendFileSync(process.env.CCR_FAKE_BOT_REPLIES, JSON.stringify(payload) + '\\n'),",
    "    ackEvent: async () => ({}),",
    "    close: async () => ({})",
    "  };",
    "}",
    ""
  ].join("\n"));

  let stderr = "";
  const child = spawn(process.execPath, [runtimeFile, "codex-bot-worker", "--workspace-name", "Codex Test"], {
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      CCR_CODEX_BOT_WORKER: "1",
      CCR_CODEX_PROFILE: "claude-code-router",
      CCR_REAL_CODEX_CLI_PATH: fakeCodex,
      CCR_BOT_GATEWAY_CWD: dir,
      CCR_BOT_GATEWAY_ENABLED: "true",
      CCR_BOT_GATEWAY_PLATFORM: "slack",
      CCR_BOT_GATEWAY_INTEGRATION_ID: "bot-test",
      CCR_BOT_GATEWAY_TENANT_ID: "ccr",
      CCR_BOT_GATEWAY_ACK_EVENTS: "true",
      CCR_BOT_GATEWAY_POLL_INTERVAL_MS: "50",
      CCR_BOT_GATEWAY_REQUEST_TIMEOUT_MS: "2000",
      CCR_BOT_GATEWAY_STARTUP_TIMEOUT_MS: "2000",
      CCR_BOT_GATEWAY_SDK_MODULE: fakeSdk,
      CCR_BOT_GATEWAY_STATE_DIR: stateDir,
      CCR_FAKE_CODEX_CALLS: callsFile,
      CCR_FAKE_BOT_REPLIES: repliesFile
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  try {
    const replies = await waitForJsonLines(repliesFile, 7, 7000, () => stderr);
    const calls = await waitForJsonLines(callsFile, 2, 2000, () => stderr);
    const replyTexts = replies.map((reply) => reply.intent.text);
    assert.ok(replyTexts.some((text) => text.startsWith("Codex projects:")));
    assert.ok(replyTexts.some((text) => text.startsWith("Selected project")));
    assert.ok(replyTexts.some((text) => text.startsWith("Codex sessions in") && text.includes("Existing Codex session")));
    assert.ok(replyTexts.some((text) => text.startsWith("Selected session ses_exis")));
    const agentReplies = replyTexts.filter((text) => text.startsWith("reply:"));
    assert.equal(agentReplies.length, 2);
    assert.ok(agentReplies[0].endsWith("first"));
    assert.ok(agentReplies[1].endsWith("second"));
    for (const call of calls) {
      assert.equal(call.argv[0], "exec");
      assert.ok(call.argv.includes("resume"));
      assert.ok(call.argv.includes('sandbox_mode="read-only"'));
      assert.equal(realpathSync(call.cwd), realpathSync(dir));
    }
    const store = JSON.parse(readFileSync(path.join(stateDir, "codex-bot-sessions.json"), "utf8"));
    assert.equal(Object.values(store.conversations)[0].sessionId, "ses_codex");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await waitForChildExit(child, 3000);
  }
});

test("Codex App bot worker passes image attachments to exec and avoids duplicate stream replies", { skip: process.platform === "win32" }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-codex-bot-image-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const fakeSdk = path.join(dir, "fake-bot-gateway-sdk.mjs");
  const callsFile = path.join(dir, "codex-calls.jsonl");
  const repliesFile = path.join(dir, "bot-replies.jsonl");
  const stateDir = path.join(dir, "bot-state");
  const codexHome = path.join(dir, "codex-home");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const argv = process.argv.slice(2);",
    "fs.appendFileSync(process.env.CCR_FAKE_CODEX_CALLS, JSON.stringify({ argv, cwd: process.cwd() }) + '\\n');",
    "process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'ses_image' }) + '\\n');",
    "process.stdout.write(JSON.stringify({ type: 'item.completed', item: { id: 'answer-image', type: 'agent_message', text: 'reply:describe image' } }) + '\\n');",
    ""
  ].join("\n"));
  chmodSync(fakeCodex, 0o700);
  writeFileSync(fakeSdk, [
    "import fs from 'node:fs';",
    "let delivered = false;",
    "globalThis.fetch = async () => new Response(Buffer.from([1, 2, 3]), { status: 200, headers: { 'content-length': '3' } });",
    "export function createBotGatewayClient() {",
    "  return {",
    "    health: async () => ({}),",
    "    events: async () => {",
    "      if (delivered) return { events: [] };",
    "      delivered = true;",
    "      return { events: [{ id: 'event-image', event: {",
    "        id: 'event-image', tenantId: 'ccr', integrationId: 'bot-test', platform: 'slack', actor: { isBot: false },",
    "        conversation: { id: 'conversation-1', type: 'dm' },",
    "        message: { id: 'message-image', text: 'describe image', attachments: [{ id: 'att-1', type: 'image', url: 'https://attachments.local/screenshot.png', name: 'screenshot.png', mimeType: 'image/png', sizeBytes: 3 }] }",
    "      } }] };",
    "    },",
    "    send: async (payload) => fs.appendFileSync(process.env.CCR_FAKE_BOT_REPLIES, JSON.stringify(payload) + '\\n'),",
    "    ackEvent: async () => ({}),",
    "    close: async () => ({})",
    "  };",
    "}",
    ""
  ].join("\n"));

  let stderr = "";
  const child = spawn(process.execPath, [runtimeFile, "codex-bot-worker", "--workspace-name", "Codex Test"], {
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      CCR_CODEX_BOT_WORKER: "1",
      CCR_CODEX_PROFILE: "claude-code-router",
      CCR_REAL_CODEX_CLI_PATH: fakeCodex,
      CCR_BOT_GATEWAY_CWD: dir,
      CCR_BOT_GATEWAY_ENABLED: "true",
      CCR_BOT_GATEWAY_MEDIA_ENABLED: "true",
      CCR_BOT_GATEWAY_PLATFORM: "slack",
      CCR_BOT_GATEWAY_INTEGRATION_ID: "bot-test",
      CCR_BOT_GATEWAY_TENANT_ID: "ccr",
      CCR_BOT_GATEWAY_ACK_EVENTS: "true",
      CCR_BOT_GATEWAY_POLL_INTERVAL_MS: "50",
      CCR_BOT_GATEWAY_REQUEST_TIMEOUT_MS: "2000",
      CCR_BOT_GATEWAY_STARTUP_TIMEOUT_MS: "2000",
      CCR_BOT_GATEWAY_STREAM_REPLIES: "true",
      CCR_BOT_GATEWAY_SDK_MODULE: fakeSdk,
      CCR_BOT_GATEWAY_STATE_DIR: stateDir,
      CCR_FAKE_CODEX_CALLS: callsFile,
      CCR_FAKE_BOT_REPLIES: repliesFile
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  try {
    const replies = await waitForJsonLines(repliesFile, 2, 7000, () => stderr);
    const calls = await waitForJsonLines(callsFile, 1, 2000, () => stderr);
    const imageFlagIndex = calls[0].argv.indexOf("--image");
    assert.notEqual(imageFlagIndex, -1);
    assert.match(calls[0].argv[imageFlagIndex + 1], /screenshot\.png$/);
    assert.equal(replies.every((reply) => reply.intent.type === "stream_text"), true);
    assert.equal(replies.some((reply) => reply.intent.type === "text" && reply.intent.text === "reply:describe image"), false);
    assert.equal(replies.filter((reply) => reply.intent.final === true).length, 1);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await waitForChildExit(child, 3000);
  }
});

test("Claude App bot worker keeps project and session selection as separate levels", { skip: process.platform === "win32" }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-claude-bot-projects-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeSdk = path.join(dir, "fake-bot-gateway-sdk.mjs");
  const repliesFile = path.join(dir, "bot-replies.jsonl");
  const stateDir = path.join(dir, "bot-state");
  const userDataDir = path.join(dir, "claude-user-data");
  const sessionsDir = path.join(userDataDir, "local-agent-mode-sessions", "account", "organization");
  const projectA = path.join(dir, "project-a");
  const projectB = path.join(dir, "project-b");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(projectA, { recursive: true });
  mkdirSync(projectB, { recursive: true });
  const writeSession = (id, title, cwd, lastActivityAt) => {
    writeFileSync(path.join(sessionsDir, `${id}.json`), JSON.stringify({
      sessionId: id,
      cliSessionId: `cli-${id}`,
      cwd,
      userSelectedFolders: [cwd],
      title,
      lastActivityAt,
      isArchived: false
    }));
  };
  writeSession("local_a", "Session A", projectA, 300);
  writeSession("local_b", "Session B", projectB, 200);
  writeFileSync(fakeSdk, [
    "import fs from 'node:fs';",
    "let delivered = false;",
    "export function createBotGatewayClient() {",
    "  return {",
    "    health: async () => ({}),",
    "    events: async () => {",
    "      if (delivered) return { events: [] };",
    "      delivered = true;",
    "      const event = (id, text) => ({",
    "        id,",
    "        event: {",
    "          id, tenantId: 'ccr', integrationId: 'bot-test', platform: 'slack',",
    "          actor: { isBot: false },",
    "          conversation: { id: 'conversation-1', type: 'dm' },",
    "          message: { id: 'message-' + id, text }",
    "        }",
    "      });",
    "      return { events: [",
    "        event('project-list', '/project list'),",
    "        event('project-use', '/project use 2'),",
    "        event('session-list', '/session list'),",
    "        event('session-use', '/session use 1'),",
    "        event('session-current', '/session current'),",
    "        event('session-reset', '/session reset'),",
    "        event('session-current-reset', '/session current'),",
    "        event('old-task', '/task')",
    "      ] };",
    "    },",
    "    send: async (payload) => fs.appendFileSync(process.env.CCR_FAKE_BOT_REPLIES, JSON.stringify(payload) + '\\n'),",
    "    ackEvent: async () => ({}),",
    "    close: async () => ({})",
    "  };",
    "}",
    ""
  ].join("\n"));

  let stderr = "";
  const child = spawn(process.execPath, [runtimeFile, "claude-bot-worker", "--workspace-name", "Claude Test"], {
    env: {
      ...process.env,
      CCR_CLAUDE_CODE_BOT_WORKER: "1",
      CCR_CLAUDE_APP_USER_DATA_PATH: userDataDir,
      CLAUDE_USER_DATA_DIR: userDataDir,
      CCR_BOT_GATEWAY_ENABLED: "true",
      CCR_BOT_GATEWAY_PLATFORM: "slack",
      CCR_BOT_GATEWAY_INTEGRATION_ID: "bot-test",
      CCR_BOT_GATEWAY_TENANT_ID: "ccr",
      CCR_BOT_GATEWAY_ACK_EVENTS: "true",
      CCR_BOT_GATEWAY_POLL_INTERVAL_MS: "50",
      CCR_BOT_GATEWAY_REQUEST_TIMEOUT_MS: "2000",
      CCR_BOT_GATEWAY_STARTUP_TIMEOUT_MS: "2000",
      CCR_BOT_GATEWAY_SDK_MODULE: fakeSdk,
      CCR_BOT_GATEWAY_STATE_DIR: stateDir,
      CCR_FAKE_BOT_REPLIES: repliesFile
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  try {
    const replies = await waitForJsonLines(repliesFile, 8, 7000, () => stderr);
    const replyTexts = replies.map((reply) => reply.intent.text);
    assert.ok(replyTexts.some((text) => text.startsWith("Claude App projects:") && text.includes(projectA) && text.includes(projectB)));
    assert.ok(replyTexts.some((text) => text.startsWith("Selected project project-b")));
    assert.ok(replyTexts.some((text) => text.startsWith("Claude App sessions in project-b:") && text.includes("Session B")));
    assert.ok(!replyTexts.some((text) => text.startsWith("Claude App sessions in project-b:") && text.includes("Session A")));
    assert.ok(replyTexts.some((text) => text.startsWith("Selected session local_b: Session B")));
    assert.ok(replyTexts.some((text) => text.startsWith("Current Claude App session:") && text.includes("Session B")));
    assert.ok(replyTexts.some((text) => text.startsWith("No selected Claude App session in project project-b.")));
    assert.ok(replyTexts.includes("Unknown Bot command. Send /project or /session to see available commands."));
    const store = JSON.parse(readFileSync(path.join(stateDir, "claude-bot-sessions.json"), "utf8"));
    const entry = Object.values(store.conversations)[0];
    assert.equal(store.version, 3);
    assert.equal(realpathSync(entry.projectDirectory), realpathSync(projectB));
    assert.equal(entry.sessionId, undefined);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await waitForChildExit(child, 3000);
  }
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

async function waitForJsonLines(file, count, timeoutMs, diagnostic) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const lines = readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean);
      if (lines.length >= count) return lines.map((line) => JSON.parse(line));
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${count} JSON lines in ${file}. ${diagnostic()}`);
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
