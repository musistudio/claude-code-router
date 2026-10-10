import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { codexCliMiddlewareRuntimeScript } from "@ccr/core/agents/codex/cli-middleware-runtime.ts";
import { buildCodexModelCatalog } from "@ccr/core/agents/codex/model-catalog.ts";

test("generated Codex CLI middleware runtime is valid JavaScript", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-check-"));
  const file = path.join(dir, "ccr-codex-cli-middleware.js");
  writeFileSync(file, codexCliMiddlewareRuntimeScript());
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
});

test("#1851 Pi dispatch consumes only the profile selector and preserves the prompt", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-pi-dispatch-"));
  try {
    const runtime = writeRuntimeScript(dir);
    const output = path.join(dir, "args.json");
    const capture = path.join(dir, "capture.js");
    const fakePi = path.join(dir, process.platform === "win32" ? "pi.cmd" : "pi");
    writeFileSync(capture, 'require("node:fs").writeFileSync(process.env.CCR_PI_TEST_OUTPUT, JSON.stringify({ args: process.argv.slice(2), marker: process.env.CCR_CLI_DIRECT_PROFILE_DISPATCH }));');
    if (process.platform === "win32") writeFileSync(fakePi, `@echo off\r\n"${process.execPath}" "${capture}" %*\r\n`);
    else {
      writeFileSync(fakePi, `#!/bin/sh\nexec "${process.execPath}" "${capture}" "$@"\n`);
      chmodSync(fakePi, 0o700);
    }
    for (const [args, direct, expected] of [
      [["Pi"], true, []],
      [["pi"], true, []],
      [["Pi Work", "cli", "--", "hello world", "--continue"], true, ["hello world", "--continue"]],
      [["Pi", "--", 'quote " and & % !', "--model", "custom"], true, ['quote " and & % !', "--model", "custom"]],
      [["Pi"], false, ["Pi"]],
    ]) {
      const result = spawnSync(process.execPath, [runtime, ...args], {
        encoding: "utf8", timeout: 10000,
        env: { ...process.env, CCR_PI_WRAPPER: "1", CCR_REAL_PI_BIN: fakePi,
          CCR_REAL_CODEX_CLI_PATH: fakePi, CCR_PI_PROVIDER: "ccr", CCR_PI_MODEL: "Provider/model",
          CCR_PI_TEST_OUTPUT: output, CCR_CLI_DIRECT_PROFILE_DISPATCH: direct ? "1" : "", CCR_CODEX_DEFAULT_ARGS: "--version" },
      });
      assert.equal(result.status, 0, result.stderr);
      const captured = JSON.parse(readFileSync(output, "utf8"));
      assert.deepEqual(captured.args, ["--provider", "ccr", "--model", "Provider/model", ...expected]);
      assert.equal(captured.marker, undefined);
    }
  } finally { rmSync(dir, { force: true, recursive: true }); }
});

test("generated Codex middleware fallback retains the catalog's tool commentary instructions", () => {
  const model = "uuroute/gpt-5.5";
  const fallback = evaluateRuntimeFunction("modelCatalogConfigItem")(model, 0);
  const catalog = buildCodexModelCatalog(undefined, model);

  assert.match(fallback.base_instructions, /before.*tool call/i);
  assert.match(fallback.base_instructions, /commentary/);
  assert.match(fallback.base_instructions, /progress update/i);
  assert.equal(fallback.base_instructions, catalog.models[0].base_instructions);
});

test("generated Codex CLI middleware converts Windows SDK paths before URL scheme detection", () => {
  const fn = evaluateRuntimeFunction("botGatewaySdkImportSpecifier");
  const windowsPath = "C:\\Users\\macao\\AppData\\Local\\Programs\\Claude Code Router\\resources\\app.asar\\dist\\main\\bot-gateway-sdk\\dist\\index.js";

  assert.equal(
    fn(windowsPath),
    "file:///C:/Users/macao/AppData/Local/Programs/Claude%20Code%20Router/resources/app.asar/dist/main/bot-gateway-sdk/dist/index.js"
  );
  assert.equal(fn("file:///tmp/sdk/index.js"), "file:///tmp/sdk/index.js");
  assert.equal(fn("@the-next-ai/bot-gateway-sdk"), "@the-next-ai/bot-gateway-sdk");
});

test("generated Codex CLI middleware materializes bundled Bot Gateway stdio runner", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-bot-runner-"));
  const source = path.join(dir, "resources", "app.asar", "dist", "main", "bot-gateway-sdk", "bin", "bot-gateway-stdio.mjs");
  const configDir = path.join(dir, "config");
  mkdirSync(path.dirname(source), { recursive: true });
  writeFileSync(source, "#!/usr/bin/env node\nconsole.log('ok');\n");

  const resolveCommand = evaluateRuntimeFunction(
    "resolveBundledBotGatewayCommand",
    ["normalizeDuplicateShebangs", "materializeBotGatewayStdioRunnerPath"],
    configDir
  );
  const command = resolveCommand({ bundledStdioPath: () => source });
  const expectedRunner = path.join(configDir, "bot-gateway", "runners", "bot-gateway-stdio.mjs");

  assert.equal(command.command, process.execPath);
  assert.deepEqual(command.args, [expectedRunner]);
  assert.equal(command.cwd, path.dirname(expectedRunner));
  assert.notEqual(command.cwd, path.dirname(source));
  assert.equal(readFileSync(expectedRunner, "utf8"), "#!/usr/bin/env node\nconsole.log('ok');\n");
});

test("Codex app-server uses ChatGPT's bundled Node as a signed supervisor", { skip: process.platform !== "darwin" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-signed-supervisor-"));
  const runtimeFile = writeRuntimeScript(dir);
  const resourcesDir = path.join(dir, "ChatGPT.app", "Contents", "Resources");
  const fakeCodex = path.join(resourcesDir, "codex");
  const bundledNode = path.join(resourcesDir, "cua_node", "bin", "node");
  const observedFile = path.join(dir, "supervisor-args.txt");
  mkdirSync(path.dirname(bundledNode), { recursive: true });
  writeFileSync(fakeCodex, [
    "#!/bin/sh",
    "IFS= read -r request",
    "printf '%s\\n' '{\"id\":1,\"result\":{\"supervised\":true}}'",
    ""
  ].join("\n"));
  writeFileSync(bundledNode, [
    "#!/bin/sh",
    "printf '%s\\n' \"$@\" > \"$CCR_FAKE_SUPERVISOR_ARGS\"",
    "exec \"$CCR_TEST_NODE\" \"$@\"",
    ""
  ].join("\n"));
  chmodSync(fakeCodex, 0o700);
  chmodSync(bundledNode, 0o700);

  const result = spawnSync(process.execPath, [runtimeFile, "app-server"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_CODEX_REMOTE_FRONTEND_MODE: "app",
      CCR_FAKE_SUPERVISOR_ARGS: observedFile,
      CCR_PROFILE_SCOPE: "global",
      CCR_REAL_CODEX_CLI_PATH: fakeCodex,
      CCR_TEST_NODE: process.execPath
    },
    input: JSON.stringify({ id: 1, method: "probe/supervisor", params: {} }) + "\n"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()).result, { supervised: true });
  const observed = readFileSync(observedFile, "utf8");
  assert.match(observed, /^-e\n/);
  assert.ok(observed.includes(fakeCodex));
  assert.ok(observed.includes("app-server"));
});

test("Codex runtime ignores middleware recursion and uses the bundled real CLI fallback", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-real-cli-fallback-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "real-codex");
  writeFileSync(fakeCodex, "#!/bin/sh\nprintf 'real-codex\\n'\n");
  chmodSync(fakeCodex, 0o700);

  const result = spawnSync(process.execPath, [runtimeFile, "--version"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_BUNDLED_CODEX_CLI_PATH: fakeCodex,
      CCR_CODEX_PROFILE: "claude-code-router",
      CCR_REAL_CODEX_CLI_PATH: "",
      CODEXL_REAL_CODEX_CLI_PATH: "",
      CODEX_CLI_PATH: path.join(dir, "ccr-codex-cli-stdio-profile")
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "real-codex\n");
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

test("Codex app-server keeps a ChatGPT-shaped account for workspace routing without credentials", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-virtual-auth-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const codexHome = path.join(dir, "codex-home");
  const isolatedHome = path.join(dir, "home");
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(isolatedHome, { recursive: true });
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
      CCR_CODEX_CHATGPT_AUTH_FILE: "",
      CCR_PROFILE_SCOPE: "ccr",
      CCR_REAL_CODEX_CLI_PATH: fakeCodex,
      CODEX_HOME: codexHome,
      CODEXL_CODEX_CHATGPT_AUTH_FILE: "",
      CODEXL_CODEX_WORKSPACE_NAME: "CCR Workspace",
      HOME: isolatedHome
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
  const virtualClaims = (token) => JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString("utf8"));
  assert.equal(responses[1].result.authMethod, "chatgpt");
  assert.equal(responses[1].result.requiresOpenaiAuth, true);
  assert.deepEqual(virtualClaims(responses[1].result.authToken)["https://api.openai.com/auth"], {
    chatgpt_account_id: "ccr-virtual-account",
    chatgpt_user_id: "ccr-virtual-user",
    user_id: "ccr-virtual-user",
    chatgpt_plan_type: "plus"
  });
  assert.deepEqual(responses[2].result, {
    authMethod: "chatgpt",
    authToken: null,
    requiresOpenaiAuth: true
  });
  assert.deepEqual(responses[3].result, {
    account: { type: "chatgpt", account_id: "ccr-virtual-account", id: "ccr-virtual-account", email: "CCR Workspace", planType: "plus" },
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

test("Codex app-server bridges shared ChatGPT auth into an isolated profile without copying it", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-shared-auth-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const codexHome = path.join(dir, "codex-home");
  const sharedAuthFile = path.join(dir, "shared-auth.json");
  const token = "header.eyJodHRwczovL2FwaS5vcGVuYWkuY29tL3Byb2ZpbGUiOnsiZW1haWwiOiJzaGFyZWRAZXhhbXBsZS5jb20ifSwiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS9hdXRoIjp7ImNoYXRncHRfcGxhbl90eXBlIjoicHJvIn19.signature";
  const sharedAuth = {
    auth_mode: "chatgpt",
    tokens: { access_token: token, id_token: token, refresh_token: "shared-refresh" }
  };
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(sharedAuthFile, JSON.stringify(sharedAuth));
  writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const readline = require('node:readline');",
    "const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });",
    "input.on('line', (line) => {",
    "  const request = JSON.parse(line);",
    "  process.stdout.write(JSON.stringify({ id: request.id, result: {} }) + '\\n');",
    "});",
    ""
  ].join("\n"));
  chmodSync(fakeCodex, 0o700);

  const result = spawnSync(process.execPath, [runtimeFile, "app-server"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_CODEX_CHATGPT_AUTH_FILE: sharedAuthFile,
      CCR_CODEX_REMOTE_FRONTEND_MODE: "app",
      CCR_PROFILE_SCOPE: "ccr",
      CCR_REAL_CODEX_CLI_PATH: fakeCodex,
      CODEX_HOME: codexHome,
      CODEXL_CODEX_CHATGPT_AUTH_FILE: ""
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
    account: { type: "chatgpt", email: "shared@example.com", planType: "pro" },
    requiresOpenaiAuth: true
  });
  assert.equal(existsSync(path.join(codexHome, "auth.json")), false);
  assert.deepEqual(JSON.parse(readFileSync(sharedAuthFile, "utf8")), sharedAuth);
});

test("Codex app-server bridges the default codex ChatGPT login read-only", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-default-auth-bridge-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const codexHome = path.join(dir, "codex-home");
  const isolatedHome = path.join(dir, "home");
  const defaultCodexHome = path.join(isolatedHome, ".codex");
  const token = "header.eyJodHRwczovL2FwaS5vcGVuYWkuY29tL3Byb2ZpbGUiOnsiZW1haWwiOiJkZWZhdWx0QGV4YW1wbGUuY29tIn0sImh0dHBzOi8vYXBpLm9wZW5haS5jb20vYXV0aCI6eyJjaGF0Z3B0X3BsYW5fdHlwZSI6InBybyJ9fQ.signature";
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(defaultCodexHome, { recursive: true });
  writeFileSync(path.join(defaultCodexHome, "auth.json"), JSON.stringify({
    auth_mode: "chatgpt",
    tokens: { access_token: token, id_token: token, refresh_token: "default-refresh" }
  }));
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
      CODEX_HOME: codexHome,
      HOME: isolatedHome
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
    account: { type: "chatgpt", email: "default@example.com", planType: "pro" },
    requiresOpenaiAuth: true
  });
  assert.equal(existsSync(path.join(codexHome, "auth.json")), false);
  assert.deepEqual(JSON.parse(readFileSync(path.join(defaultCodexHome, "auth.json"), "utf8")).tokens.refresh_token, "default-refresh");
});

test("Codex app-server preserves workspace routing surfaced by newer app-servers", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-workspace-routing-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const codexHome = path.join(dir, "codex-home");
  const isolatedHome = path.join(dir, "home");
  const workspaceRouting = {
    chatgptAccountId: "acct-123",
    backendOrigin: "https://chatgpt.com",
    accountRoutingOverride: "NO_CONSTRAINT"
  };
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(isolatedHome, { recursive: true });
  writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const readline = require('node:readline');",
    "const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });",
    "input.on('line', (line) => {",
    "  const request = JSON.parse(line);",
    "  const result = request.method === 'account/read'",
    "    ? { account: { type: 'chatgpt', email: 'native@example.com', planType: 'pro' }, workspaceRouting: " + JSON.stringify(workspaceRouting) + ", requiresOpenaiAuth: true }",
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
      CODEX_HOME: codexHome,
      CODEXL_CODEX_WORKSPACE_NAME: "CCR Workspace",
      HOME: isolatedHome
    },
    input: [
      JSON.stringify({ id: 1, method: "account/read", params: {} }),
      ""
    ].join("\n")
  });

  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(responses[0].result, {
    account: { type: "chatgpt", account_id: "ccr-virtual-account", id: "ccr-virtual-account", email: "CCR Workspace", planType: "plus" },
    workspaceRouting,
    requiresOpenaiAuth: true
  });
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

test("Codex app-server preserves the requested approval reviewer without widening the sandbox", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-native-permissions-"));
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
    "  const result = request.method === 'configRequirements/read'",
    "    ? { requirements: null }",
    "    : { method: request.method, params: request.params };",
    "  process.stdout.write(JSON.stringify({ id: request.id, result }) + '\\n');",
    "});",
    ""
  ].join("\n"));
  chmodSync(fakeCodex, 0o700);

  const workspace = path.join(dir, "workspace");
  const readOnlySandbox = { type: "readOnly", networkAccess: false };
  const workspaceWriteSandbox = { type: "workspaceWrite", writableRoots: [workspace], networkAccess: false };
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
      JSON.stringify({
        id: 1,
        method: "thread/start",
        params: {
          cwd: workspace,
          permissions: {
            approvalPolicy: "on-request",
            approvalsReviewer: "auto_review",
            sandboxPolicy: readOnlySandbox
          }
        }
      }),
      JSON.stringify({
        id: 2,
        method: "turn/start",
        params: {
          threadId: "thread-1",
          input: [{ type: "text", text: "write the file" }],
          approvalPolicy: "on-request",
          approvalsReviewer: "guardian_subagent",
          sandboxPolicy: workspaceWriteSandbox
        }
      }),
      JSON.stringify({ id: 3, method: "configRequirements/read", params: {} }),
      ""
    ].join("\n")
  });

  assert.equal(result.status, 0, result.stderr);
  const responses = new Map(result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line)).map((response) => [response.id, response]));
  assert.equal(responses.get(1).result.params.approvalsReviewer, "auto_review");
  assert.deepEqual(responses.get(1).result.params.sandboxPolicy, readOnlySandbox);
  assert.equal(responses.get(2).result.params.approvalsReviewer, "guardian_subagent");
  assert.deepEqual(responses.get(2).result.params.sandboxPolicy, workspaceWriteSandbox);
  assert.equal(responses.get(3).result.requirements, null);
});

test("#1795 null upstream requirements with Fast Mode stay legacy-routing compatible", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-null-requirements-"));
  try {
    const runtimeFile = writeRuntimeScript(dir);
    const fakeCodex = path.join(dir, "fake-codex");
    writeFileSync(fakeCodex, `#!/usr/bin/env node
      const input = require('node:readline').createInterface({ input: process.stdin });
      input.on('line', line => { const request = JSON.parse(line); process.stdout.write(JSON.stringify({ id: request.id, result: { requirements: null } }) + '\\n'); });
    `);
    chmodSync(fakeCodex, 0o700);
    const result = spawnSync(process.execPath, [runtimeFile, "app-server"], {
      encoding: "utf8", timeout: 10000,
      env: { ...process.env, CODEX_HOME: dir, CCR_REAL_CODEX_CLI_PATH: fakeCodex, CCR_CODEX_REMOTE_FRONTEND_MODE: "app", CCR_CODEX_MODEL_CATALOG: JSON.stringify({ models: [{ slug: "fast-test", supports_fast_mode: true }] }) },
      input: JSON.stringify({ id: 1, method: "configRequirements/read", params: {} }) + "\n"
    });
    assert.equal(result.status, 0, result.stderr);
    const requirements = JSON.parse(result.stdout.trim()).result.requirements;
    // Once requirements becomes non-null the application key must exist (null),
    // but application.network must stay absent so the app's legacy workspace
    // routing still applies; a synthesized network object blocks the composer.
    assert.equal(requirements.featureRequirements.fast_mode, true);
    assert.equal(requirements.application, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Codex app-server preserves auto-review without an opt-in environment variable", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-native-auto-review-"));
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
    "  process.stdout.write(JSON.stringify({ id: request.id, result: request.params }) + '\\n');",
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
      JSON.stringify({
        id: 1,
        method: "turn/start",
        params: {
          threadId: "thread-1",
          input: [{ type: "text", text: "write the file" }],
          approvalPolicy: "on-request",
          approvalsReviewer: "auto_review",
          sandboxPolicy: { type: "workspaceWrite" }
        }
      }),
      ""
    ].join("\n")
  });

  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout.trim());
  assert.equal(response.result.approvalsReviewer, "auto_review");
  assert.deepEqual(response.result.sandboxPolicy, { type: "workspaceWrite" });
});

test("Codex app-server merges CCR Fast Mode catalog metadata without spoofing auth", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-native-models-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const codexHome = path.join(dir, "codex-home");
  const isolatedHome = path.join(dir, "home");
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(isolatedHome, { recursive: true });
  writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const readline = require('node:readline');",
    "const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });",
    "input.on('line', (line) => {",
    "  const request = JSON.parse(line);",
    "  let result = {};",
    "  if (request.method === 'model/list') result = { data: [{ id: 'native-model', hidden: true }], nextCursor: null };",
    "  else if (request.method === 'configRequirements/read') result = { requirements: { application: null, featureRequirements: { fast_mode: false, other_feature: false } } };",
    "  process.stdout.write(JSON.stringify({ id: request.id, result }) + '\\n');",
    "});",
    ""
  ].join("\n"));
  chmodSync(fakeCodex, 0o700);

  const result = spawnSync(process.execPath, [runtimeFile, "app-server"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_CODEX_CHATGPT_AUTH_FILE: "",
      CCR_CODEX_MODEL_CATALOG: JSON.stringify({
        models: [
          { display_name: "Native Fast", slug: "native-model", supports_fast_mode: true },
          { display_name: "Plain Model", slug: "plain-model" }
        ]
      }),
      CCR_CODEX_REMOTE_FRONTEND_MODE: "app",
      CCR_REAL_CODEX_CLI_PATH: fakeCodex,
      CODEX_HOME: codexHome,
      CODEXL_CODEX_CHATGPT_AUTH_FILE: "",
      HOME: isolatedHome
    },
    input: [
      JSON.stringify({ id: 1, method: "model/list", params: {} }),
      JSON.stringify({ id: 2, method: "getAuthStatus", params: { includeToken: true } }),
      JSON.stringify({ id: 3, method: "account/read", params: {} }),
      JSON.stringify({ id: 4, method: "configRequirements/read", params: {} }),
      ""
    ].join("\n")
  });

  assert.equal(result.status, 0, result.stderr);
  const responses = new Map(result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line)).map((response) => [response.id, response]));
  const models = responses.get(1).result.data;
  const nativeModel = models.find((model) => model.id === "native-model");
  const plainModel = models.find((model) => model.id === "plain-model");
  assert.equal(nativeModel.hidden, true);
  assert.deepEqual(nativeModel.additionalSpeedTiers, ["fast"]);
  assert.deepEqual(nativeModel.serviceTiers, [{ id: "priority", name: "Fast", description: "1.5x speed, increased usage" }]);
  assert.deepEqual(plainModel.additionalSpeedTiers, []);
  assert.deepEqual(plainModel.serviceTiers, []);
  assert.equal(responses.get(2).result.authMethod, "chatgpt");
  assert.equal(responses.get(2).result.requiresOpenaiAuth, true);
  assert.match(String(responses.get(2).result.authToken), /^[\w-]+\.[\w-]+\.ccr-virtual$/);
  assert.deepEqual(responses.get(3).result, {
    account: { type: "chatgpt", account_id: "ccr-virtual-account", id: "ccr-virtual-account", email: "codex", planType: "plus" },
    requiresOpenaiAuth: true
  });
  assert.deepEqual(responses.get(4).result.requirements, {
    application: null,
    featureRequirements: {
      fast_mode: true,
      other_feature: false
    }
  });
});

test("Codex app-server preserves catalog image and reasoning capabilities over native defaults", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-capabilities-"));
  const runtimeFile = writeRuntimeScript(dir);
  const fakeCodex = path.join(dir, "fake-codex");
  const codexHome = path.join(dir, "codex-home");
  const isolatedHome = path.join(dir, "home");
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(isolatedHome, { recursive: true });
  writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const readline = require('node:readline');",
    "const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });",
    "input.on('line', (line) => {",
    "  const request = JSON.parse(line);",
    "  const result = request.method === 'model/list'",
    "    ? { data: ['aicodemirror/gpt-6.1-sol', 'undeclared-model', 'string-model'].map(id => ({ id, hidden: true, inputModalities: ['text'], supportedReasoningEfforts: [], defaultReasoningEffort: null })), nextCursor: null }",
    "    : {};",
    "  process.stdout.write(JSON.stringify({ id: request.id, result }) + '\\n');",
    "});",
    ""
  ].join("\n"));
  chmodSync(fakeCodex, 0o700);

  const result = spawnSync(process.execPath, [runtimeFile, "app-server"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_CODEX_CHATGPT_AUTH_FILE: "",
      CCR_CODEX_MODEL_CATALOG: JSON.stringify({
        models: [{
          slug: "aicodemirror/gpt-6.1-sol",
          input_modalities: ["text", "image"],
          supported_reasoning_efforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
          default_reasoning_effort: "medium"
        }, { slug: "undeclared-model" }, "string-model"]
      }),
      CCR_CODEX_REMOTE_FRONTEND_MODE: "app",
      CCR_REAL_CODEX_CLI_PATH: fakeCodex,
      CODEX_HOME: codexHome,
      CODEXL_CODEX_CHATGPT_AUTH_FILE: "",
      HOME: isolatedHome
    },
    input: JSON.stringify({ id: 1, method: "model/list", params: {} }) + "\n"
  });

  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout.trim());
  const model = response.result.data.find((item) => item.id === "aicodemirror/gpt-6.1-sol");
  assert.deepEqual(model.inputModalities, ["text", "image"]);
  assert.deepEqual(model.input_modalities, ["text", "image"]);
  assert.deepEqual(model.supportedReasoningEfforts, ["low", "medium", "high", "xhigh", "max", "ultra"]);
  assert.deepEqual(model.supported_reasoning_efforts, ["low", "medium", "high", "xhigh", "max", "ultra"]);
  assert.equal(model.defaultReasoningEffort, "medium");
  assert.equal(model.default_reasoning_effort, "medium");
  assert.equal(model.hidden, true);
  for (const id of ["undeclared-model", "string-model"]) {
    const undeclared = response.result.data.find((item) => item.id === id);
    assert.deepEqual(undeclared.inputModalities, ["text"]);
    assert.deepEqual(undeclared.supportedReasoningEfforts, []);
    assert.equal(undeclared.defaultReasoningEffort, null);
    assert.equal(undeclared.hidden, true);
  }
});

test("catalog capability merge preserves undeclared native fields and honors explicit empty arrays", () => {
  const merge = evaluateRuntimeFunction("mergeCatalogModelListItem", ["readArrayValue"]);
  const native = {
    id: "native",
    hidden: true,
    inputModalities: ["text", "image"],
    supportedReasoningEfforts: [{ reasoningEffort: "high" }],
    defaultReasoningEffort: "high"
  };
  assert.deepEqual(merge(native, { id: "native" }), native);
  for (const catalog of [
    { inputModalities: [], supportedReasoningEfforts: [], defaultReasoningEffort: null },
    { input_modalities: [], supported_reasoning_efforts: [], default_reasoning_effort: null }
  ]) {
    const merged = merge(native, catalog);
    assert.deepEqual(merged.inputModalities, []);
    assert.deepEqual(merged.input_modalities, []);
    assert.deepEqual(merged.supportedReasoningEfforts, []);
    assert.deepEqual(merged.supported_reasoning_efforts, []);
    assert.equal(merged.defaultReasoningEffort, null);
    assert.equal(merged.hidden, true);
    assert.equal(merged.id, "native");
  }
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

function evaluateRuntimeFunction(name, dependencies = [], configDir = "") {
  const runtime = codexCliMiddlewareRuntimeScript();
  const source = [
    ...dependencies.map((dependency) => extractRuntimeFunctionSource(runtime, dependency)),
    extractRuntimeFunctionSource(runtime, name)
  ].join("\n");
  const fsRuntime = { existsSync, mkdirSync, readFileSync, writeFileSync };
  return Function("path", "pathToFileURL", "fs", "CONFIG_DIR", "MODEL_CATALOG_CAPABILITIES", `${source}; return ${name};`)(
    path,
    pathToFileURL,
    fsRuntime,
    configDir,
    new WeakMap()
  );
}

function extractRuntimeFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  const openBrace = source.indexOf("{", start);
  assert.notEqual(openBrace, -1);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Unable to extract runtime function ${name}.`);
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
