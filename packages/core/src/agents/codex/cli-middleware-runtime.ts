export function codexCliMiddlewareRuntimeScript(): string {
  return String.raw`#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { pathToFileURL } = require("node:url");

const VERSION = "3.0.0";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const PROTOCOL_VERSION = "2025-06-18";
const BOT_SESSION_ENTRY_VERSION = 3;
const OPENCODE_BOT_SESSION_STORE_VERSION = 3;
const BOT_RUNTIME_STATE_VERSION = 1;
const REQUEST_TIMEOUT_MS = numberEnv("CCR_CODEX_APP_REQUEST_TIMEOUT_MS", 10 * 60 * 1000);
const TURN_IDLE_TIMEOUT_MS = numberEnv("CCR_CODEX_CLAUDE_TURN_IDLE_TIMEOUT_MS", 10 * 60 * 1000);
const CONFIG_DIR = resolveConfigDir();
const LOG_PATH = process.env.CCR_CODEX_CLI_MIDDLEWARE_LOG || "";
const CLAUDE_CODE_MCP_CONFIG_ENV = "CCR_CLAUDE_CODE_MCP_CONFIG";
const CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV = "CODEXL_CLAUDE_CODE_MCP_CONFIG";
const CLAUDE_CODE_CHINA_TIME_ZONES = new Set([
  "asia/chongqing",
  "asia/chungking",
  "asia/harbin",
  "asia/kashgar",
  "asia/shanghai",
  "asia/urumqi",
  "china standard time",
  "prc"
]);
const ACCOUNT_REMOTE_PLUGIN_MARKETPLACE_KINDS = new Set([
  "created-by-me-remote",
  "shared-with-me",
  "workspace-directory"
]);
let BOT_BRIDGE_INSTANCE = null;

function claudeCodeUtcTimezoneEnvOverride() {
  return isClaudeCodeChinaTimeZone(currentTimeZone()) ? { TZ: "UTC" } : {};
}

function currentTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

function isClaudeCodeChinaTimeZone(timeZone) {
  const normalized = String(timeZone || "").trim().toLowerCase();
  return Boolean(normalized && CLAUDE_CODE_CHINA_TIME_ZONES.has(normalized));
}

function resolveConfigDir() {
  const configured = nonEmptyEnv("CODEXL_HOME") || nonEmptyEnv("CCR_CONFIG_DIR");
  if (configured) {
    return expandHome(configured);
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Roaming");
    const current = path.join(appData, "claude-code-router");
    const legacy = path.join(appData, "Claude Code Router");
    return fs.existsSync(current) || !fs.existsSync(legacy) ? current : legacy;
  }
  return path.join(os.homedir(), ".claude-code-router");
}

function botBridge() {
  if (!BOT_BRIDGE_INSTANCE) {
    BOT_BRIDGE_INSTANCE = createBotGatewayBridge();
  }
  return BOT_BRIDGE_INSTANCE;
}

async function main() {
  const args = directProfileDispatchArgs(process.argv.slice(2));
  if (process.env.CCR_OPENCODE_BOT_WORKER === "1" || args[0] === "opencode-bot-worker") {
    await runOpenCodeBotWorker(args);
    return;
  }
  if (process.env.CCR_CLAUDE_CODE_BOT_WORKER === "1" || args[0] === "claude-bot-worker") {
    await runClaudeCodeBotWorker(args);
    return;
  }
  if (process.env.CCR_CODEX_BOT_WORKER === "1" || args[0] === "codex-bot-worker") {
    await runCodexBotWorker(args);
    return;
  }
  if (process.env.CCR_CLAUDE_CODE_WRAPPER === "1") {
    await runClaudeCodeCliWrapper(args);
    return;
  }
  if (shouldRunClaudeCodeAppServer(args)) {
    await runClaudeCodeAppServer(args);
    return;
  }
  await runCodexCliMiddleware(args.length === 0 ? defaultCodexArgs() : args);
}

function directProfileDispatchArgs(args) {
  if (process.env.CCR_CLI_DIRECT_PROFILE_DISPATCH !== "1") {
    return args;
  }
  const forwarded = args.slice(1);
  if (forwarded[0] === "cli" || forwarded[0] === "--cli") {
    forwarded.shift();
  }
  if (forwarded[0] === "--") {
    forwarded.shift();
  }
  return forwarded;
}

async function runClaudeCodeCliWrapper(args) {
  const realCli = expandHome(nonEmptyEnv("CCR_REAL_CLAUDE_CODE_BIN") || nonEmptyEnv("CCR_CLAUDE_CODE_BIN") || nonEmptyEnv("CODEXL_CLAUDE_CODE_BIN") || "claude");
  const realArgs = claudeCodeCliWrapperArgs(args);
  log("claude_code_wrapper_start", { realCli, args, realArgs });
  const captureStdout = shouldCaptureClaudeCodeCliStdout(args);
  const remoteSync = createRemoteSyncClient({
    args,
    cwd: process.cwd(),
    mode: "claude-cli",
    title: nonEmptyEnv("CCR_REMOTE_SYNC_PROFILE_NAME") || "Claude Code"
  });
  const injectRemoteStdin = boolEnv("CCR_REMOTE_SYNC_INJECT_STDIN");
  const child = spawnAgentCli(realCli, realArgs, {
    env: {
      ...withoutKeys(process.env, ["CCR_CLAUDE_CODE_WRAPPER", "CCR_REAL_CLAUDE_CODE_BIN"]),
      ...claudeCodeUtcTimezoneEnvOverride()
    },
    stdio: [injectRemoteStdin ? "pipe" : "inherit", captureStdout ? "pipe" : "inherit", "inherit"]
  });
  if (injectRemoteStdin && child.stdin) {
    process.stdin.pipe(child.stdin);
  }
  remoteSync.start((event) => {
    const text = remoteEventText(event);
    if (!text) return;
    if (injectRemoteStdin && child.stdin && !child.killed) {
      child.stdin.write(text + "\n");
      return;
    }
    if (boolEnv("CCR_REMOTE_SYNC_NOTIFY_INBOUND") || !process.env.CCR_REMOTE_SYNC_NOTIFY_INBOUND) {
      process.stdout.write("\n[CCR remote] " + text + "\n");
    }
  });
  child.on("error", (error) => {
    log("claude_code_wrapper_spawn_error", { error: formatError(error) });
    process.stderr.write("Failed to start " + realCli + ": " + formatError(error) + "\n");
    remoteSync.postEvent("claude.spawn.error", { error: formatError(error) }, { direction: "system" });
  });
  let pending = "";
  if (captureStdout && child.stdout) {
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      pending += chunk.toString("utf8");
      const lines = pending.split(/\r?\n/g);
      pending = lines.pop() || "";
      for (const line of lines) {
        botBridge().handleClaudeCliLine(line);
        remoteSync.postEvent("claude.stdout", { line }, { text: line });
      }
    });
  }
  const code = await waitForChild(child);
  if (captureStdout && pending.trim()) {
    botBridge().handleClaudeCliLine(pending);
    remoteSync.postEvent("claude.stdout", { line: pending }, { text: pending });
  }
  await remoteSync.postEvent("claude.exit", { code }, { direction: "system" });
  remoteSync.stop();
  log("claude_code_wrapper_exit", { code });
  process.exitCode = code;
}

function claudeCodeCliWrapperArgs(args) {
  const modelArgs = claudeCodeArgsWithModel(args);
  return claudeCodeArgsWithMcpConfig(modelArgs, process.env);
}

function claudeCodeArgsWithModel(args) {
  const model = nonEmptyEnv("CCR_CLAUDE_CODE_MODEL") || nonEmptyEnv("CODEXL_CLAUDE_CODE_MODEL") || nonEmptyEnv("ANTHROPIC_MODEL");
  if (!model || claudeCodeArgsHaveModel(args) || claudeCodeArgsShouldSkipModelInjection(args)) {
    return args;
  }
  return ["--model", model, ...args];
}

function claudeCodeArgsWithMcpConfig(args, env) {
  const mcpConfig = nonEmptyEnvFrom(env, CLAUDE_CODE_MCP_CONFIG_ENV) || nonEmptyEnvFrom(env, CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV);
  if (!mcpConfig || claudeCodeArgsHaveMcpConfig(args) || claudeCodeArgsShouldSkipModelInjection(args)) {
    return args;
  }
  return ["--mcp-config", mcpConfig, ...args];
}

function claudeCodeArgsHaveModel(args) {
  for (const arg of args) {
    if (arg === "--model" || arg === "-m" || arg.startsWith("--model=")) {
      return true;
    }
  }
  return false;
}

function claudeCodeArgsHaveMcpConfig(args) {
  for (const arg of args) {
    if (arg === "--mcp-config" || arg.startsWith("--mcp-config=")) {
      return true;
    }
  }
  return false;
}

function claudeCodeArgsShouldSkipModelInjection(args) {
  if (args.some((arg) => arg === "--help" || arg === "-h" || arg === "--version" || arg === "-v")) {
    return true;
  }
  const command = firstClaudeCodePositionalArg(args);
  return Boolean(command && new Set([
    "config",
    "doctor",
    "help",
    "install",
    "login",
    "logout",
    "mcp",
    "update",
    "upgrade",
    "version"
  ]).has(command.toLowerCase()));
}

function firstClaudeCodePositionalArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      return undefined;
    }
    if (!arg.startsWith("-")) {
      return arg;
    }
    if (claudeCodeOptionTakesValue(arg) && !arg.includes("=")) {
      index += 1;
    }
  }
  return undefined;
}

function claudeCodeOptionTakesValue(arg) {
  return new Set([
    "--add-dir",
    "--append-system-prompt",
    "--config",
    "--continue",
    "--debug-to",
    "--fallback-model",
    "--model",
    "--mcp-config",
    "--output-format",
    "--permission-mode",
    "--resume",
    "--settings",
    "--system-prompt",
    "-c",
    "-m",
    "-p",
    "-r"
  ]).has(arg);
}

function shouldCaptureClaudeCodeCliStdout(args) {
  if (boolEnv("CCR_CLAUDE_CODE_CAPTURE_STDOUT") || boolEnv("CODEXL_CLAUDE_CODE_CAPTURE_STDOUT")) {
    return true;
  }
  if (botGatewayCliCaptureEnabled()) {
    return true;
  }
  return claudeCodeArgsUsePrintMode(args);
}

function botGatewayCliCaptureEnabled() {
  const enabled = boolEnv("CCR_BOT_GATEWAY_ENABLED") || boolEnv("CODEXL_BOT_GATEWAY_ENABLED");
  const platform = normalizeBotGatewayPlatform(nonEmptyEnv("CCR_BOT_GATEWAY_PLATFORM") || nonEmptyEnv("CODEXL_BOT_GATEWAY_PLATFORM") || "none");
  return enabled && platform !== "none";
}

function claudeCodeArgsUsePrintMode(args) {
  return args.some((arg) => arg === "--print" || arg === "-p");
}

function defaultCodexArgs() {
  return normalizeProfileSurface(nonEmptyEnv("CCR_PROFILE_SURFACE") || nonEmptyEnv("CODEXL_PROFILE_SURFACE")) === "cli"
    ? []
    : ["app-server", "--analytics-default-enabled"];
}

async function runCodexCliMiddleware(args) {
  const runtimeAgent = codexRuntimeAgent();
  const realCli = expandHome(codexRuntimeRealCli(runtimeAgent));
  const profile = agentEnv(runtimeAgent, "PROFILE");
  const modelProvider = agentEnv(runtimeAgent, "MODEL_PROVIDER") || profile;
  const configFormat = normalizeConfigFormat(agentEnv(runtimeAgent, "PROFILE_CONFIG_FORMAT"));
  const realArgs = realCliArgs(profile, modelProvider, configFormat, args);
  log("codex_cli_start", { realCli, realArgs, runtimeAgent });

  if (shouldRunDirectCodexCli(args)) {
    await runDirectCodexCli(realCli, realArgs);
    return;
  }

  const cleanupAuthBootstrap = createEphemeralCodexApiKeyBootstrap(runtimeAgent);
  const child = spawnAgentCli(realCli, realArgs, {
    env: childEnvForAgent(runtimeAgent),
    stdio: ["pipe", "pipe", "inherit"]
  });
  child.on("error", (error) => {
    cleanupAuthBootstrap();
    log("codex_cli_spawn_error", { error: formatError(error) });
    process.stderr.write("Failed to start " + realCli + ": " + formatError(error) + "\n");
  });

  const requestMap = new Map();
  const current = { cwd: "" };
  const chatGptAuth = loadChatGptAuth();
  const stdinRl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  stdinRl.on("line", (line) => {
    const custom = customAppServerLineResponse(line);
    if (custom) {
      writeLine(process.stdout, custom);
      return;
    }
    const rewritten = rewriteCodexStdinLine(line);
    trackRequestLine(rewritten, requestMap, current);
    if (!child.stdin.destroyed) child.stdin.write(rewritten + "\n");
  });
  stdinRl.on("close", () => {
    if (!child.stdin.destroyed) child.stdin.end();
  });

  const stdoutRl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity, terminal: false });
  stdoutRl.on("line", (line) => {
    cleanupAuthBootstrap();
    const rewritten = rewriteCodexStdoutLine(line, requestMap, chatGptAuth);
    botBridge().handleJsonRpcLine(rewritten);
    if (!shouldSuppressBotBridgeLine(rewritten)) {
      process.stdout.write(rewritten + "\n");
    }
  });

  const exit = await waitForChildResult(child);
  cleanupAuthBootstrap();
  log("codex_cli_exit", { code: exit.code, signal: exit.signal, exitCode: exit.exitCode });
  process.exitCode = exit.exitCode;
}

function createEphemeralCodexApiKeyBootstrap(runtimeAgent) {
  if (runtimeAgent !== "codex") return () => {};
  const scope = nonEmptyEnv("CCR_PROFILE_SCOPE");
  if (scope !== "ccr" && scope !== "custom") return () => {};
  const authFile = path.join(codexRuntimeHome(), "auth.json");
  if (fs.existsSync(authFile)) return () => {};
  const temporary = authFile + ".tmp-" + process.pid;
  let active = false;
  try {
    fs.mkdirSync(path.dirname(authFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(temporary, JSON.stringify({
      auth_mode: "apikey",
      OPENAI_API_KEY: "ccr-local-profile"
    }, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(temporary, authFile);
    active = true;
    log("codex_auth_bootstrap_created", { authFile });
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {
    }
    log("codex_auth_bootstrap_create_error", { authFile, error: formatError(error) });
  }

  return () => {
    if (!active) return;
    try {
      if (!fs.existsSync(authFile)) {
        active = false;
        return;
      }
      const value = readJsonFile(authFile);
      const keys = value && typeof value === "object" ? Object.keys(value).sort() : [];
      if (
        keys.length === 2 &&
        keys[0] === "OPENAI_API_KEY" &&
        keys[1] === "auth_mode" &&
        value.auth_mode === "apikey" &&
        value.OPENAI_API_KEY === "ccr-local-profile"
      ) {
        fs.unlinkSync(authFile);
        active = false;
        log("codex_auth_bootstrap_removed", { authFile });
        return;
      }
      active = false;
      log("codex_auth_bootstrap_preserved_changed_file", { authFile });
    } catch (error) {
      log("codex_auth_bootstrap_remove_error", { authFile, error: formatError(error) });
    }
  };
}

async function runDirectCodexCli(realCli, realArgs) {
  const runtimeAgent = codexRuntimeAgent();
  const child = spawnAgentCli(realCli, realArgs, {
    env: childEnvForAgent(runtimeAgent),
    stdio: "inherit"
  });
  child.on("error", (error) => {
    log("codex_cli_spawn_error", { error: formatError(error) });
    process.stderr.write("Failed to start " + realCli + ": " + formatError(error) + "\n");
  });
  const exit = await waitForChildResult(child);
  log("codex_cli_exit", { code: exit.code, signal: exit.signal, exitCode: exit.exitCode });
  process.exitCode = exit.exitCode;
}

function shouldRunDirectCodexCli(args) {
  return codexPositionalArgs(args)[0] !== "app-server";
}

function spawnAgentCli(command, args, options) {
  if (process.platform !== "win32") {
    return childProcess.spawn(command, args, options);
  }

  const commandFile = resolveWindowsCommandFile(command, options && options.env);
  if (commandFile && /\.(?:com|exe)$/i.test(commandFile)) {
    return childProcess.spawn(commandFile, args, options);
  }

  const shellCommand = [escapeWindowsCmdCommand(commandFile || command)]
    .concat(args.map(escapeWindowsCmdArgument))
    .join(" ");
  return childProcess.spawn(
    process.env.ComSpec || process.env.COMSPEC || "cmd.exe",
    ["/d", "/s", "/c", '"' + shellCommand + '"'],
    { ...options, windowsVerbatimArguments: true }
  );
}

function resolveWindowsCommandFile(command, env) {
  const value = String(command || "").trim().replace(/^"|"$/g, "");
  if (!value) return "";
  const commandExt = path.extname(value);
  const pathExt = String((env && (env.PATHEXT || env.Pathext)) || process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);
  const extensions = commandExt ? [""] : ["", ...pathExt];
  const hasPath = path.isAbsolute(value) || value.includes("\\") || value.includes("/");
  const directories = hasPath
    ? [""]
    : String((env && (env.PATH || env.Path)) || process.env.PATH || "")
      .split(path.delimiter)
      .map((directory) => directory.replace(/^"|"$/g, ""))
      .filter(Boolean);

  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = directory ? path.join(directory, value + extension) : value + extension;
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
      }
    }
  }
  return "";
}

const WINDOWS_CMD_META_CHARS = /([()\][%!^"\`<>&|;, *?])/g;

function escapeWindowsCmdCommand(value) {
  return String(value).replace(WINDOWS_CMD_META_CHARS, "^$1");
}

function escapeWindowsCmdArgument(value) {
  let escaped = String(value);
  escaped = escaped.replace(/(?=(\\+?)?)\1"/g, "$1$1\\\"");
  escaped = escaped.replace(/(?=(\\+?)?)\1$/g, "$1$1");
  escaped = '"' + escaped + '"';
  return escaped.replace(WINDOWS_CMD_META_CHARS, "^$1");
}

function realCliArgs(profile, modelProvider, configFormat, args) {
  const realArgs = [];
  if (profile) {
    if (configFormat === "separate_profile_files") {
      if (codexArgsAcceptProfileFlag(args)) {
        realArgs.push("--profile", profile);
      }
    } else {
      realArgs.push("-c", cliConfigString("profile", profile));
    }
  }
  if (modelProvider) {
    realArgs.push("-c", cliConfigString("model_provider", modelProvider));
  }
  realArgs.push(...args);
  return realArgs;
}

function codexArgsAcceptProfileFlag(args) {
  const positionals = codexPositionalArgs(args);
  const command = positionals[0];
  if (!command) return true;
  if (["exec", "e", "review", "resume", "fork", "mcp", "sandbox"].includes(command)) return true;
  if (command === "debug") return positionals[1] === "prompt-input";
  if (["login", "logout", "plugin", "mcp-server", "app-server", "remote-control", "app", "completion", "update", "doctor", "apply", "a", "cloud", "exec-server", "features", "help"].includes(command)) return false;
  return true;
}

function codexPositionalArgs(args) {
  const positionals = [];
  let skipNext = false;
  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--") break;
    if (codexOptionTakesValue(arg)) {
      if (!arg.includes("=")) skipNext = true;
      continue;
    }
    if (arg.startsWith("-")) continue;
    positionals.push(arg);
    if (positionals.length >= 2) break;
  }
  return positionals;
}

function codexOptionTakesValue(arg) {
  const option = arg.split("=")[0];
  return ["-c", "--config", "--enable", "--disable", "--remote", "--remote-auth-token-env", "-i", "--image", "-m", "--model", "--local-provider", "-p", "--profile", "-s", "--sandbox", "-C", "--cd", "--add-dir", "-a", "--ask-for-approval"].includes(option);
}

function cliConfigString(key, value) {
  return key + "=\"" + tomlEscape(value) + "\"";
}

function rewriteCodexStdoutLine(line, requestMap, chatGptAuth) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return line;
  }
  const id = jsonRpcIdKey(value.id);
  if (!id || !requestMap.has(id)) return line;
  const request = requestMap.get(id);
  requestMap.delete(id);
  if (value.error) {
    if (request.method === "model/list" || request.method === "plugin/list") {
      log("app_server_list_error", { method: request.method, error: value.error });
    }
    return line;
  }
  if (request.method === "account/read") {
    value.result = codexAppAccountRead(chatGptAuth);
  } else if (request.method === "getAuthStatus") {
    value.result = codexAppAuthStatus(chatGptAuth, request.includeToken);
  } else if (request.method === "thread/list") {
    value = mergeForeignThreadList(value, request.params);
  } else if (request.method === "model/list") {
    log("app_server_model_list_response", {
      count: extractModelListItems(value.result).length,
      nextCursor: value.result && value.result.nextCursor
    });
    return line;
  } else if (request.method === "plugin/list") {
    const marketplaces = value.result && Array.isArray(value.result.marketplaces) ? value.result.marketplaces : [];
    log("app_server_plugin_list_response", {
      marketplaceCount: marketplaces.length,
      marketplaces: marketplaces.map((marketplace) => ({
        name: marketplace && marketplace.name,
        path: marketplace && marketplace.path,
        pluginCount: marketplace && Array.isArray(marketplace.plugins) ? marketplace.plugins.length : 0
      }))
    });
    return line;
  } else {
    return line;
  }
  return JSON.stringify(value);
}

function rewriteCodexStdinLine(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return line;
  }
  if (value && value.type === "fetch") {
    return rewriteCodexFetchLine(line, value);
  }
  if (!value || typeof value !== "object" || typeof value.method !== "string") {
    return line;
  }
  if (value.method === "model/list" || value.method === "plugin/list") {
    log("app_server_list_request", { method: value.method, params: value.params || {} });
  }
  let changed = false;
  if (normalizeCliAppServerRequest(value)) {
    changed = true;
    log("codex_app_server_request_normalized", { method: value.method, id: jsonRpcIdKey(value.id) });
  }
  if (value.params && normalizeCodexToolSchemas(value.params, "", 0)) {
    changed = true;
    log("codex_stdin_tool_schema_rewrite", { method: value.method, id: jsonRpcIdKey(value.id) });
  }
  if (!changed) {
    return line;
  }
  return JSON.stringify(value);
}

function normalizeCliAppServerRequest(request) {
  const method = typeof request.method === "string" ? request.method : "";
  if (!["thread/start", "thread/resume", "turn/start"].includes(method)) return false;
  const before = JSON.stringify(request.params === undefined ? null : request.params);
  request.params = cliAppServerMethodParams(method, request.params);
  return JSON.stringify(request.params) !== before;
}

function cliAppServerMethodParams(method, params) {
  if (method === "thread/start") return cliThreadStartParams(params);
  if (method === "thread/resume") return cliThreadResumeParams(params);
  if (method === "turn/start") return cliTurnStartParamsForAppServer(params);
  return params;
}

function cliThreadStartParams(params) {
  const source = isPlainObject(params) ? params : {};
  const output = {};
  for (const key of [
    "cwd",
    "serviceTier",
    "config",
    "threadSource",
    "model",
    "modelProvider",
    "reasoningEffort",
    "workspaceKind",
    "workspaceRoots",
    "projectlessOutputDirectory",
    "sandbox",
    "baseInstructions",
    "developerInstructions",
    "personality",
    "ephemeral",
    "persistExtendedHistory"
  ]) {
    copyJsonField(source, output, key);
  }
  copyJsonField(source, output, "additionalDeveloperInstructions", "developerInstructions");
  ensureCliProjectlessOutputDirectory(source, output);
  copyPermissionFields(source, output);
  copyCollaborationModelFields(source, output);
  if (output.threadSource === undefined) output.threadSource = "user";
  if (output.serviceName === undefined) output.serviceName = "ccr_codex_cli_middleware";
  if (output.ephemeral === undefined) output.ephemeral = false;
  if (output.personality === undefined) output.personality = "pragmatic";
  return output;
}

function cliThreadResumeParams(params) {
  const source = isPlainObject(params) ? params : {};
  const output = {};
  copyJsonField(source, output, "threadId");
  if (output.threadId === undefined) copyJsonField(source, output, "conversationId", "threadId");
  for (const key of [
    "cwd",
    "path",
    "history",
    "serviceTier",
    "config",
    "model",
    "modelProvider",
    "reasoningEffort",
    "workspaceKind",
    "workspaceRoots",
    "projectlessOutputDirectory",
    "sandbox",
    "baseInstructions",
    "developerInstructions",
    "personality",
    "excludeTurns",
    "persistExtendedHistory"
  ]) {
    copyJsonField(source, output, key);
  }
  copyPermissionFields(source, output);
  copyCollaborationModelFields(source, output);
  return output;
}

function cliTurnStartParamsForAppServer(params) {
  const source = isPlainObject(params) ? params : {};
  const output = {};
  for (const key of [
    "threadId",
    "cwd",
    "input",
    "attachments",
    "commentAttachments",
    "serviceTier",
    "model",
    "effort",
    "reasoningEffort",
    "workspaceKind",
    "projectlessOutputDirectory"
  ]) {
    copyJsonField(source, output, key);
  }
  copyPermissionFields(source, output);
  copyCollaborationModelFields(source, output);
  return output;
}

function ensureCliProjectlessOutputDirectory(source, target) {
  if (source.workspaceKind !== "projectless") return;
  const outputDirectory = stringValue(target.projectlessOutputDirectory) ||
    stringValue(source.projectlessOutputDirectory) ||
    stringValue(source.outputDirectory) ||
    stringValue(source.cwd) ||
    firstArrayString(source.workspaceRoots);
  if (!outputDirectory) return;
  target.projectlessOutputDirectory = outputDirectory;
  if (target.cwd === undefined) target.cwd = outputDirectory;
  appendDeveloperInstruction(
    target,
    "When using local files for this projectless thread, write scratch files, drafts, generated assets, and other outputs under " +
      outputDirectory +
      ". Do not write directly in the home directory unless the user explicitly asks."
  );
}

function appendDeveloperInstruction(target, instruction) {
  const existing = typeof target.developerInstructions === "string" ? target.developerInstructions.trim() : "";
  target.developerInstructions = existing ? existing + "\n\n" + instruction : instruction;
}

function copyPermissionFields(source, target) {
  if (isPlainObject(source.permissions)) {
    copyJsonField(source.permissions, target, "approvalPolicy");
    copyJsonField(source.permissions, target, "sandboxPolicy");
    copyJsonField(source.permissions, target, "approvalsReviewer");
  }
  copyJsonField(source, target, "approvalPolicy");
  copyJsonField(source, target, "sandboxPolicy");
  copyJsonField(source, target, "approvalsReviewer");
}

function copyCollaborationModelFields(source, target) {
  const settings = source.collaborationMode && isPlainObject(source.collaborationMode.settings)
    ? source.collaborationMode.settings
    : undefined;
  if (!settings) return;
  if (target.model === undefined) copyJsonField(settings, target, "model");
  if (target.reasoningEffort === undefined) {
    if (!copyJsonField(settings, target, "reasoning_effort", "reasoningEffort")) {
      copyJsonField(settings, target, "reasoningEffort");
    }
  }
}

function copyJsonField(source, target, sourceKey, targetKey) {
  const value = source[sourceKey];
  if (value === undefined || value === null) return false;
  target[targetKey || sourceKey] = value;
  return true;
}

function firstArrayString(value) {
  return Array.isArray(value) ? value.map(stringValue).find(Boolean) : undefined;
}

function rewriteCodexFetchLine(line, value) {
  const rewritten = rewriteCodexFetchBody(value);
  if (!rewritten) return line;
  log("codex_fetch_tool_schema_rewrite", {
    method: String(value.method || ""),
    requestId: jsonRpcIdKey(value.requestId || value.id),
    url: String(value.url || "")
  });
  return JSON.stringify(value);
}

function rewriteCodexFetchBody(value) {
  for (const key of ["body", "bodyText", "data", "payload"]) {
    if (rewriteCodexFetchJsonField(value, key)) return true;
  }
  if (typeof value.bodyBase64 === "string" && value.bodyBase64.trim()) {
    try {
      const text = Buffer.from(value.bodyBase64, "base64").toString("utf8");
      if (!codexBodyMayContainToolSchemaAliases(text)) return false;
      const body = JSON.parse(text);
      if (!normalizeCodexToolSchemas(body, "", 0)) return false;
      value.bodyBase64 = Buffer.from(JSON.stringify(body), "utf8").toString("base64");
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function rewriteCodexFetchJsonField(value, key) {
  const body = value[key];
  if (typeof body === "string") {
    if (!codexBodyMayContainToolSchemaAliases(body)) return false;
    try {
      const parsed = JSON.parse(body);
      if (!normalizeCodexToolSchemas(parsed, "", 0)) return false;
      value[key] = JSON.stringify(parsed);
      return true;
    } catch {
      return false;
    }
  }
  if (!body || typeof body !== "object" || !codexValueMayContainToolSchemaAliases(body)) {
    return false;
  }
  return normalizeCodexToolSchemas(body, "", 0);
}

function codexBodyMayContainToolSchemaAliases(value) {
  return /"input_schema"|"dynamic_tools"|"dynamicTools"|"experimental_supported_tools"|"experimentalSupportedTools"|"defer_loading"|"expose_to_context"/.test(value);
}

function codexValueMayContainToolSchemaAliases(value) {
  try {
    return codexBodyMayContainToolSchemaAliases(JSON.stringify(value));
  } catch {
    return false;
  }
}

function normalizeCodexToolSchemas(value, parentKey, depth) {
  if (depth > 40 || !value || typeof value !== "object") return false;
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (normalizeCodexToolSchemas(item, parentKey, depth + 1)) changed = true;
    }
    return changed;
  }
  if (normalizeCodexToolSchemaObject(value, parentKey)) changed = true;
  for (const [key, child] of Object.entries(value)) {
    if (normalizeCodexToolSchemas(child, key, depth + 1)) changed = true;
  }
  return changed;
}

function normalizeCodexToolSchemaObject(value, parentKey) {
  if (!looksLikeCodexToolSpec(value, parentKey)) return false;
  let changed = false;
  const inputSchema = normalizeCodexInputSchema(value.inputSchema) ||
    normalizeCodexInputSchema(value.input_schema) ||
    normalizeCodexInputSchema(value.parameters) ||
    normalizeCodexInputSchema(value.schema) ||
    normalizeCodexInputSchema(value.inputConfig && value.inputConfig.inputSchema) ||
    normalizeCodexInputSchema(value.function && value.function.parameters);
  if (!isPlainObject(value.inputSchema)) {
    value.inputSchema = inputSchema || { type: "object", properties: {} };
    changed = true;
  }
  if (!isPlainObject(value.outputSchema)) {
    const outputSchema = normalizeCodexInputSchema(value.output_schema);
    if (outputSchema) {
      value.outputSchema = outputSchema;
      changed = true;
    }
  }
  if (value.deferLoading === undefined && value.defer_loading !== undefined) {
    value.deferLoading = Boolean(value.defer_loading);
    changed = true;
  }
  if (value.exposeToContext === undefined && value.expose_to_context !== undefined) {
    value.exposeToContext = Boolean(value.expose_to_context);
    changed = true;
  }
  return changed;
}

function looksLikeCodexToolSpec(value, parentKey) {
  const parent = String(parentKey || "");
  if (["dynamic_tools", "dynamicTools", "experimental_supported_tools", "experimentalSupportedTools"].includes(parent)) {
    return true;
  }
  if (parent === "tools" && hasCodexToolIdentity(value)) {
    return Boolean(
      value.inputSchema ||
      value.input_schema ||
      value.parameters ||
      value.schema ||
      (value.inputConfig && value.inputConfig.inputSchema) ||
      (value.function && value.function.parameters)
    );
  }
  return hasCodexToolIdentity(value) && Boolean(value.input_schema || value.parameters || value.schema);
}

function hasCodexToolIdentity(value) {
  return stringValue(value.name) ||
    stringValue(value.namespace) ||
    stringValue(value.toolName) ||
    stringValue(value.canonicalName) ||
    stringValue(value.alias) ||
    Boolean(value.function && stringValue(value.function.name));
}

function normalizeCodexInputSchema(value) {
  let parsed = value;
  if (typeof value === "string" && value.trim()) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!isPlainObject(parsed)) return undefined;
  return {
    type: parsed.type || "object",
    properties: isPlainObject(parsed.properties) ? parsed.properties : {},
    ...parsed
  };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function trackRequestLine(line, requestMap, current) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return;
  }
  const id = jsonRpcIdKey(value.id);
  const method = typeof value.method === "string" ? value.method : undefined;
  if (!id || !method) return;
  const cwd = requestWorkspaceCwd(value, method);
  if (cwd) current.cwd = cwd;
  if (!["account/read", "getAuthStatus", "thread/list", "config/read", "model/list", "plugin/list"].includes(method)) return;
  const params = clone(value.params || {});
  if (method === "thread/list" && current.cwd && !params.codexlWorkspaceCwd) {
    params.codexlWorkspaceCwd = current.cwd;
  }
  requestMap.set(id, {
    includeToken: Boolean(value.params && value.params.includeToken),
    method,
    params
  });
}

function customAppServerLineResponse(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (value && typeof value.method === "string") {
    log("app_server_request", {
      id: jsonRpcIdKey(value.id),
      method: value.method,
      params: value.params || {}
    });
  }
  if (value && value.type === "fetch" && String(value.method || "").toUpperCase() === "POST" && fetchUrlIsTranscribe(value.url)) {
    return {
      requestId: value.requestId || value.id || uuid(),
      status: 501,
      ok: false,
      body: JSON.stringify({ error: "Transcribe is not available in CCR middleware." }),
      headers: { "content-type": "application/json" }
    };
  }
  if (value && value.method === "plugin/list" && jsonRpcIdKey(value.id) && accountRemoteOnlyPluginList(value.params)) {
    log("app_server_account_remote_plugin_list_empty", {
      marketplaceKinds: value.params.marketplaceKinds
    });
    return {
      id: value.id,
      result: { marketplaces: [], marketplaceLoadErrors: [], featuredPluginIds: [] }
    };
  }
  return undefined;
}

function accountRemoteOnlyPluginList(params) {
  const kinds = params && Array.isArray(params.marketplaceKinds)
    ? params.marketplaceKinds.map((kind) => String(kind || "")).filter(Boolean)
    : [];
  return kinds.length > 0 && kinds.every((kind) => ACCOUNT_REMOTE_PLUGIN_MARKETPLACE_KINDS.has(kind));
}

function fetchUrlIsTranscribe(url) {
  const text = String(url || "").trim();
  if (text === "/transcribe") return true;
  try {
    return new URL(text).pathname === "/transcribe";
  } catch {
    return false;
  }
}

function shouldSuppressBotBridgeLine(_line) {
  return false;
}

async function runClaudeCodeAppServer(args) {
  const options = parseAppServerOptions(args);
  const server = new ClaudeCodeAppServer(options);
  await server.run();
}

async function runClaudeCodeBotWorker(args) {
  const options = parseAppServerOptions(args);
  const lock = acquireBotWorkerLock("claude");
  if (!lock) return;
  try {
    const server = new ClaudeCodeAppServer(options);
    server.ensureBotBridgeRegistered();
    log("claude_bot_worker_start", {
      workspaceName: options.workspaceName,
      pid: process.pid,
      lockPath: lock.path,
      claudeConfigDir: nonEmptyEnv("CLAUDE_CONFIG_DIR"),
      claudeUserDataDir: currentClaudeAppUserDataDir(),
      model: nonEmptyEnv("CCR_CLAUDE_CODE_MODEL") || nonEmptyEnv("CODEXL_CLAUDE_CODE_MODEL") || agentEnv(codexRuntimeAgent(), "MODEL") || ""
    });
    await waitForTerminationSignal();
    await botBridge().stop();
    log("claude_bot_worker_stop", { pid: process.pid });
  } finally {
    releaseBotWorkerLock(lock);
  }
}

async function runOpenCodeBotWorker(args) {
  const options = parseOpenCodeBotWorkerOptions(args);
  const lock = acquireBotWorkerLock("opencode");
  if (!lock) return;
  try {
    const worker = new OpenCodeBotWorker(options);
    worker.ensureBotBridgeRegistered();
    log("opencode_bot_worker_start", {
      workspaceName: options.workspaceName,
      pid: process.pid,
      lockPath: lock.path,
      cwd: worker.defaultCwd,
      command: worker.command
    });
    await waitForTerminationSignal();
    await botBridge().stop();
    log("opencode_bot_worker_stop", { pid: process.pid });
  } finally {
    releaseBotWorkerLock(lock);
  }
}

async function runCodexBotWorker(args) {
  const options = parseCodexBotWorkerOptions(args);
  const agent = codexRuntimeAgent();
  const lock = acquireBotWorkerLock(agent);
  if (!lock) return;
  try {
    const worker = new CodexBotWorker(options);
    worker.ensureBotBridgeRegistered();
    log(agent + "_bot_worker_start", {
      workspaceName: options.workspaceName,
      pid: process.pid,
      lockPath: lock.path,
      cwd: worker.defaultCwd,
      command: worker.command
    });
    await waitForTerminationSignal();
    await botBridge().stop();
    log(agent + "_bot_worker_stop", { pid: process.pid });
  } finally {
    releaseBotWorkerLock(lock);
  }
}

class OpenCodeBotWorker {
  constructor(options) {
    this.workspaceName = options.workspaceName || "OpenCode";
    this.command = expandHome(nonEmptyEnv("CCR_OPENCODE_BIN") || nonEmptyEnv("OPENCODE_BIN") || "opencode");
    this.defaultCwd = resolveOpenCodeBotCwd(
      nonEmptyEnv("CCR_OPENCODE_BOT_CWD"),
      nonEmptyEnv("CCR_BOT_GATEWAY_CWD")
    );
    this.store = null;
    this.turnStates = new Map();
    this.restoredPendingTurns = false;
  }

  ensureBotBridgeRegistered() {
    const bridge = botBridge();
    bridge.setInboundHandler((event, queued, eventId, activeBridge) => this.handleInbound(event, queued, eventId, activeBridge));
    this.restorePendingTurns(bridge);
  }

  async handleInbound(event, _queued, eventId, bridge) {
    let text = botEventText(event);
    if (!text) {
      log("bot_gateway_inbound_skip", { eventId, reason: "empty_text", agent: "opencode" });
      return;
    }
    const commandReply = await this.handleCommand(event, text, bridge);
    if (commandReply && typeof commandReply === "object" && commandReply.forwardText) {
      text = commandReply.forwardText;
    } else if (commandReply !== null) {
      await bridge.sendReplyToEvent(event, commandReply, "ccr:opencode:command:" + eventId);
      log("bot_gateway_command_replied", { eventId, agent: "opencode", textLen: commandReply.length });
      return;
    }

    const position = this.enqueueTurn(event, eventId, bridge, text);
    if (position > 0) {
      await bridge.sendReplyToEvent(event, "Queued behind the active turn (position " + position + "). Use /session status or /session cancel.", "ccr:opencode:queued:" + eventId);
    }
  }

  enqueueTurn(event, eventId, bridge, text) {
    const key = botConversationKey(event);
    const state = this.turnStates.get(key) || { active: null, pending: [] };
    const job = { id: eventId || stableBotKey(botEventDedupeKey(event)), event, eventId, text, key, createdAt: Date.now(), bridge };
    state.pending.push(job);
    this.turnStates.set(key, state);
    this.persistPendingTurn(job);
    const position = (state.active ? 1 : 0) + state.pending.length - 1;
    log("opencode_bot_turn_queued", { eventId, position });
    void this.drainTurnQueue(key, state);
    return position;
  }

  async drainTurnQueue(key, state) {
    if (state.draining) return;
    state.draining = true;
    try {
      while (state.pending.length) {
        const job = state.pending.shift();
        state.active = { job, child: null, startedAt: Date.now(), cancelRequested: false };
        try {
          await this.runTurn(job.event, job.eventId, job.bridge, job.text, key, state.active);
        } catch (error) {
          try {
            await job.bridge.sendReplyToEvent(job.event, "Agent turn failed: " + conciseError(error), "ccr:opencode:error:" + job.eventId);
          } catch (replyError) {
            log("opencode_bot_turn_error_reply_failed", { eventId: job.eventId, error: formatError(error), replyError: formatError(replyError) });
          }
          log("opencode_bot_turn_failed", { eventId: job.eventId, error: formatError(error) });
        } finally {
          this.removePendingTurn(job.id);
          state.active = null;
        }
      }
    } finally {
      state.draining = false;
      if (!state.active && !state.pending.length) this.turnStates.delete(key);
    }
  }

  async runTurn(event, eventId, bridge, text, key, activeTurn) {
    let entry = this.conversationEntry(key);
    if (entry && entry.sessionId && bridge.config.sessionIdleMinutes > 0 && Date.now() - Number(entry.updatedAt || 0) >= bridge.config.sessionIdleMinutes * 60_000) {
      entry = { ...entry, sessionId: "", title: "", updatedAt: Date.now() };
      this.setConversationEntry(key, entry);
    }
    const cwd = resolveOpenCodeBotCwd(entry && entry.projectDirectory, this.defaultCwd);
    let prompt = await botPromptWithAttachments(event, text, bridge.config, path.join(bridge.config.stateDir || cwd, "attachments"));
    if (!bridge.config.shellEnabled) {
      prompt = "Bot policy: shell and terminal tools are disabled. Do not invoke shell commands; use non-shell tools only.\n\n" + prompt;
    }
    if (entry && Array.isArray(entry.memory) && entry.memory.length) {
      prompt = "Persistent session context:\n" + entry.memory.map((item) => "- " + item).join("\n") + "\n\nUser message:\n" + prompt;
    }
    const args = ["run", "--format", "json", "--dir", cwd];
    if (entry && entry.model) args.push("--model", entry.model);
    if (entry && entry.effort) args.push("--variant", entry.effort);
    if (entry && entry.mode) args.push("--agent", entry.mode);
    if (entry && entry.sessionId) {
      args.push("--session", entry.sessionId);
    } else {
      args.push("--title", stringValue(entry && entry.title) || "Bot: " + this.workspaceName);
    }
    if (boolEnv("CCR_OPENCODE_BOT_AUTO_APPROVE")) args.push("--auto");
    args.push("--", prompt);

    const streamId = "opencode-" + stableBotKey(eventId).slice(-16);
    let streamedText = "";
    let lastStreamAt = 0;
    const result = await runOpenCodeBotCli(this.command, args, cwd, {
      timeoutMs: bridge.config.maxTurnTimeMs,
      onSpawn: (child) => { activeTurn.child = child; },
      onJson: (value) => {
        const parsedEvent = parseOpenCodeRunOutput(JSON.stringify(value));
        if (!parsedEvent.text || parsedEvent.text === streamedText) return;
        streamedText = parsedEvent.text;
        if (Date.now() - lastStreamAt < 700) return;
        lastStreamAt = Date.now();
        void bridge.sendStreamToEvent(event, streamId, streamedText, false, "ccr:opencode:stream:" + eventId).catch((error) => bridge.logError("stream_failed", error));
      }
    });
    const parsed = parseOpenCodeRunOutput(result.stdout);
    const sessionId = parsed.sessionId || (entry && entry.sessionId) || "";
    if (sessionId) {
      this.setConversationEntry(key, {
        ...(entry || {}),
        sessionId,
        projectDirectory: cwd,
        title: (entry && entry.title) || "Bot: " + this.workspaceName,
        updatedAt: Date.now()
      });
    }
    const errorText = parsed.error || result.error || (result.exitCode !== 0
      ? result.stderr || "OpenCode exited with code " + result.exitCode
      : "");
    const responseText = errorText
      ? "Agent turn failed: " + errorText
      : parsed.text || parsed.fallbackText || "OpenCode completed the turn without a text response.";
    if (bridge.config.streamReplies && !errorText) {
      await bridge.sendStreamToEvent(event, streamId, responseText, true, "ccr:opencode:stream:" + eventId).catch(() => undefined);
    } else {
      await bridge.sendReplyToEvent(event, responseText, "ccr:opencode:" + eventId + ":" + (sessionId || uuid()));
    }
    await sendBotTextArtifacts(event, bridge, responseText, cwd, "ccr:opencode:artifact:" + eventId);
    log("bot_gateway_inbound_replied", {
      eventId,
      agent: "opencode",
      sessionId,
      exitCode: result.exitCode,
      textLen: responseText.length
    });
  }

  async handleCommand(event, text, bridge) {
    const command = parseBotCommand(text);
    if (!command) return null;
    const key = botConversationKey(event);
    try {
      if (command.name === "unknown") return "Unknown Bot command. Send /project or /session to see available commands.";
      if (command.domain === "project") {
        if (command.name === "help") return projectCommandHelpText("OpenCode");
        if (command.name === "current") return this.renderCurrentProject(key);
        const sessions = await this.listSessions();
        const projects = agentProjectsFromDirectories(
          [this.defaultCwd, ...sessions.map((session) => session.directory)],
          this.defaultCwd
        );
        for (const project of projects) project.name = this.projectLabel(project.directory, project.name);
        if (command.name === "ls") {
          return renderAgentProjectList("OpenCode", projects, this.projectDirectory(key), { args: command.args });
        }
        if (command.name === "search") {
          return renderAgentProjectList("OpenCode", projects, this.projectDirectory(key), { query: command.args });
        }
        if (command.name === "rename") {
          if (!command.args) return "Usage: /project name <label>.";
          this.loadStore().projectAliases[comparableProjectDirectory(this.projectDirectory(key))] = command.args.slice(0, 80);
          this.saveStore();
          return "Project label updated to " + command.args.slice(0, 80) + ".";
        }
        if (command.name === "select") {
          if (!command.args) return "Usage: /project use <project-number>. Send /project list to list projects.";
          const project = resolveAgentProject(command.args, projects);
          if (!project) return "Project '" + command.args + "' was not found. Send /project list to list projects.";
          this.setConversationEntry(key, {
            sessionId: "",
            projectDirectory: project.directory,
            title: "",
            updatedAt: Date.now()
          });
          return "Selected project " + project.name + "\npath: " + project.directory + "\nUse /session list or /session new to choose a session.";
        }
      }
      if (command.domain === "session") {
        if (command.name === "help") return sessionCommandHelpText("OpenCode");
        if (command.name === "status") return this.renderTurnStatus(key);
        if (command.name === "cancel") return this.cancelTurns(key);
        if (["approve", "deny", "answer"].includes(command.name)) return "No permission request is waiting for this conversation.";
        if (command.name === "current") return this.renderCurrentSession(key);
        if (command.name === "reset" || command.name === "new") {
          const directory = this.projectDirectory(key);
          this.setConversationEntry(key, {
            sessionId: "",
            projectDirectory: directory,
            title: command.name === "new" ? command.args : "",
            updatedAt: Date.now()
          });
          return command.name === "new"
            ? "Ready. The next message will create a new OpenCode session in project " + projectNameFromDirectory(directory) + "."
            : "Session selection cleared. The next message will create a new OpenCode session in the current project.";
        }
        const directory = this.projectDirectory(key);
        const includeArchived = command.name === "ls" && command.args.toLowerCase() === "archived";
        const sessions = (await this.listSessions(includeArchived)).filter((session) => sameProjectDirectory(session.directory, directory));
        if (command.name === "ls") {
          return renderOpenCodeSessionList(sessions, this.conversationEntry(key), directory, { args: includeArchived ? "1" : command.args });
        }
        if (command.name === "search") {
          return renderOpenCodeSessionList(sessions, this.conversationEntry(key), directory, { query: command.args });
        }
        if (command.name === "select") {
          if (!command.args) return "Usage: /session use <session-number>. Send /session list to list sessions.";
          const session = resolveOpenCodeSession(command.args, sessions);
          if (!session) return "Session '" + command.args + "' was not found in the current project. Send /session list to list sessions.";
          this.setConversationEntry(key, {
            sessionId: session.id,
            projectDirectory: resolveOpenCodeBotCwd(session.directory, directory),
            title: session.title,
            updatedAt: session.updatedAt || Date.now()
          });
          return "Selected session " + shortSessionId(session.id) + ": " + session.title + "\nNext message will continue in this OpenCode session.";
        }
        if (command.name === "rename") return this.renameCurrentSession(key, command.args);
        if (["archive", "restore", "delete"].includes(command.name)) return this.mutateSession(command.name, command.args, sessions, key);
        if (command.name === "history") return this.renderSessionHistory(key, command.args);
        if (command.name === "model") return this.updateSessionSetting(key, "model", command.args);
        if (command.name === "effort") return this.updateSessionSetting(key, "effort", command.args);
        if (command.name === "mode") return this.updateSessionSetting(key, "mode", command.args);
        if (command.name === "models") return this.renderModels(command.args);
        if (command.name === "usage") return this.renderSessionUsage(key);
        if (command.name === "memory") return this.updateSessionMemory(key, command.args);
        if (command.name === "skills") return renderAgentSkills(directory, "opencode");
        if (command.name === "skill") return forwardSkillCommand(command.args);
        if (command.name === "shortcut") return this.handleSessionShortcut(key, command.args);
        if (command.name === "doctor") return renderBotDiagnostics(bridge.diagnostics());
        if (command.name === "deliveries") return renderBotDeliveries(bridge.diagnostics());
      }
      return null;
    } catch (error) {
      return "OpenCode bot command failed: " + conciseError(error);
    }
  }

  async listSessions(includeArchived = false) {
    const result = await runOpenCodeBotCli(this.command, ["session", "list", "--format", "json", "-n", "100"], this.defaultCwd);
    if (result.exitCode !== 0) {
      throw new Error(result.error || result.stderr || "OpenCode session list exited with code " + result.exitCode);
    }
    const store = this.loadStore();
    return parseOpenCodeSessionList(result.stdout)
      .map((session) => ({ ...session, title: store.sessionAliases[session.id] || session.title, archived: store.archivedSessionIds.includes(session.id) }))
      .filter((session) => includeArchived ? session.archived : !session.archived);
  }

  loadStore() {
    if (this.store) return this.store;
    const value = readJsonFile(openCodeBotSessionStorePath());
    const conversations = value && typeof value === "object" &&
      Number(value.version || 0) >= 2 &&
      value.conversations && typeof value.conversations === "object"
      ? value.conversations
      : {};
    const pendingTurns = value && Array.isArray(value.pendingTurns) ? value.pendingTurns.filter((item) => item && typeof item === "object") : [];
    const projectAliases = value && value.projectAliases && typeof value.projectAliases === "object" ? value.projectAliases : {};
    const sessionAliases = value && value.sessionAliases && typeof value.sessionAliases === "object" ? value.sessionAliases : {};
    const archivedSessionIds = value && Array.isArray(value.archivedSessionIds) ? value.archivedSessionIds.filter((item) => typeof item === "string") : [];
    this.store = { version: OPENCODE_BOT_SESSION_STORE_VERSION, conversations, pendingTurns, projectAliases, sessionAliases, archivedSessionIds };
    return this.store;
  }

  saveStore() {
    const file = openCodeBotSessionStorePath();
    const temporary = file + "." + process.pid + ".tmp";
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(this.loadStore(), null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  conversationEntry(key) {
    const entry = this.loadStore().conversations[key];
    if (!entry || typeof entry !== "object") return null;
    const projectDirectory = stringValue(entry.projectDirectory) || stringValue(entry.directory);
    if (!projectDirectory) return null;
    try {
      return fs.statSync(expandHome(projectDirectory)).isDirectory()
        ? { ...entry, projectDirectory }
        : null;
    } catch {
      return null;
    }
  }

  setConversationEntry(key, entry) {
    this.loadStore().conversations[key] = entry;
    this.saveStore();
  }

  projectDirectory(key) {
    const entry = this.conversationEntry(key);
    return resolveOpenCodeBotCwd(entry && entry.projectDirectory, this.defaultCwd);
  }

  renderCurrentProject(key) {
    const directory = this.projectDirectory(key);
    return [
      "Current OpenCode project:",
      projectNameFromDirectory(directory),
      "path: " + directory
    ].join("\n");
  }

  renderCurrentSession(key) {
    const entry = this.conversationEntry(key);
    const directory = this.projectDirectory(key);
    if (!entry || !stringValue(entry.sessionId)) {
      return "No selected OpenCode session in project " + projectNameFromDirectory(directory) + ". Use /session list, /session use <n>, or send any message to create one.";
    }
    return [
      "Current OpenCode session:",
      shortSessionId(entry.sessionId) + " " + (entry.title || "OpenCode session"),
      "project: " + projectNameFromDirectory(directory),
      "path: " + directory
    ].join("\n");
  }

  projectLabel(directory, fallback) {
    return this.loadStore().projectAliases[comparableProjectDirectory(directory)] || fallback;
  }

  renameCurrentSession(key, label) {
    const entry = this.conversationEntry(key);
    if (!entry || !entry.sessionId) return "No session is selected.";
    const name = String(label || "").trim().slice(0, 100);
    if (!name) return "Usage: /session name <label>.";
    this.loadStore().sessionAliases[entry.sessionId] = name;
    this.setConversationEntry(key, { ...entry, title: name, updatedAt: Date.now() });
    return "Session renamed to " + name + ".";
  }

  async mutateSession(action, args, visibleSessions, key) {
    const parsed = parseConfirmedTarget(args);
    const all = action === "restore" ? await this.listSessions(true) : visibleSessions;
    const session = resolveOpenCodeSession(parsed.target, all);
    if (!session) return "Session '" + parsed.target + "' was not found.";
    const store = this.loadStore();
    if (action === "archive") {
      if (!store.archivedSessionIds.includes(session.id)) store.archivedSessionIds.push(session.id);
      if (this.conversationEntry(key) && this.conversationEntry(key).sessionId === session.id) {
        this.setConversationEntry(key, { sessionId: "", projectDirectory: this.projectDirectory(key), title: "", updatedAt: Date.now() });
      } else this.saveStore();
      return "Session archived: " + session.title + ". Use /session list archived to view archived sessions.";
    }
    if (action === "restore") {
      store.archivedSessionIds = store.archivedSessionIds.filter((id) => id !== session.id);
      this.saveStore();
      return "Session restored: " + session.title + ".";
    }
    if (!parsed.confirmed) return "Deletion is permanent. Send /session delete " + parsed.target + " confirm.";
    const result = await runOpenCodeBotCli(this.command, ["session", "delete", session.id], this.defaultCwd, { timeoutMs: 60_000 });
    if (result.exitCode !== 0) return "Session deletion failed: " + (result.error || result.stderr || "exit " + result.exitCode);
    delete store.sessionAliases[session.id];
    store.archivedSessionIds = store.archivedSessionIds.filter((id) => id !== session.id);
    this.saveStore();
    return "Session deleted: " + session.title + ".";
  }

  async renderSessionHistory(key, args) {
    const entry = this.conversationEntry(key);
    if (!entry || !entry.sessionId) return "No session is selected.";
    const result = await runOpenCodeBotCli(this.command, ["export", entry.sessionId], this.projectDirectory(key), { timeoutMs: 60_000 });
    if (result.exitCode !== 0) return "Unable to read session history: " + (result.error || result.stderr);
    return renderExportedHistory(result.stdout, args);
  }

  updateSessionSetting(key, setting, args) {
    const entry = this.conversationEntry(key) || { sessionId: "", projectDirectory: this.projectDirectory(key), title: "" };
    const value = String(args || "").trim();
    if (!value) return "Current " + setting + ": " + (entry[setting] || "default") + ".";
    const allowed = setting === "effort" ? new Set(["low", "medium", "high", "xhigh", "max", "reset"]) : null;
    if (allowed && !allowed.has(value)) return "Supported effort values: low, medium, high, xhigh, max, reset.";
    entry[setting] = value === "reset" ? "" : value;
    entry.updatedAt = Date.now();
    this.setConversationEntry(key, entry);
    return setting + " set to " + (entry[setting] || "default") + ".";
  }

  async renderModels(query) {
    const args = ["models"];
    if (String(query || "").trim()) args.push(String(query).trim());
    const result = await runOpenCodeBotCli(this.command, args, this.defaultCwd, { timeoutMs: 60_000 });
    if (result.exitCode !== 0) return "Unable to list models: " + (result.error || result.stderr);
    return splitBotMessage(result.stdout, 3500)[0] || "No models were returned.";
  }

  async renderSessionUsage(key) {
    const entry = this.conversationEntry(key);
    if (!entry || !entry.sessionId) return "No session is selected.";
    const result = await runOpenCodeBotCli(this.command, ["export", entry.sessionId], this.projectDirectory(key), { timeoutMs: 60_000 });
    if (result.exitCode !== 0) return "Unable to read usage: " + (result.error || result.stderr);
    return renderExportedUsage(result.stdout);
  }

  updateSessionMemory(key, args) {
    const entry = this.conversationEntry(key) || { sessionId: "", projectDirectory: this.projectDirectory(key), title: "" };
    const command = parseSubcommand(args);
    const memory = Array.isArray(entry.memory) ? entry.memory : [];
    if (!command.name || command.name === "list") return memory.length ? "Session memory:\n" + memory.map((item, index) => (index + 1) + ". " + item).join("\n") : "Session memory is empty.";
    if (command.name === "clear") entry.memory = [];
    else if (command.name === "add" && command.args) entry.memory = [...memory, command.args.slice(0, 2000)].slice(-20);
    else return "Usage: /session memory list | add <text> | clear.";
    entry.updatedAt = Date.now();
    this.setConversationEntry(key, entry);
    return command.name === "clear" ? "Session memory cleared." : "Session memory added.";
  }

  handleSessionShortcut(key, args) {
    const entry = this.conversationEntry(key) || { sessionId: "", projectDirectory: this.projectDirectory(key), title: "" };
    const shortcuts = entry.shortcuts && typeof entry.shortcuts === "object" ? entry.shortcuts : {};
    const command = parseSubcommand(args);
    if (!command.name || command.name === "list") {
      const names = Object.keys(shortcuts).sort();
      return names.length ? "Session shortcuts:\n" + names.map((name) => "- " + name + ": " + shortcuts[name]).join("\n") : "No session shortcuts are configured.";
    }
    if (command.name === "add") {
      const definition = parseSubcommand(command.args);
      if (!definition.name || !definition.args) return "Usage: /session shortcut add <name> <prompt>.";
      shortcuts[definition.name] = definition.args.slice(0, 2000);
      entry.shortcuts = shortcuts;
      this.setConversationEntry(key, { ...entry, updatedAt: Date.now() });
      return "Shortcut saved: " + definition.name + ".";
    }
    if (command.name === "remove") {
      delete shortcuts[String(command.args || "").trim().toLowerCase()];
      entry.shortcuts = shortcuts;
      this.setConversationEntry(key, { ...entry, updatedAt: Date.now() });
      return "Shortcut removed.";
    }
    if (command.name === "run") {
      const invocation = parseSubcommand(command.args);
      const prompt = shortcuts[invocation.name];
      return prompt ? { forwardText: prompt + (invocation.args ? "\n\n" + invocation.args : "") } : "Shortcut '" + invocation.name + "' was not found.";
    }
    return "Usage: /session shortcut list | add <name> <prompt> | remove <name> | run <name> [input].";
  }

  renderTurnStatus(key) {
    const state = this.turnStates.get(key);
    if (!state || (!state.active && !state.pending.length)) return "No Agent turn is running or queued for this conversation.";
    const lines = [];
    if (state.active) lines.push("Running for " + formatDuration(Date.now() - state.active.startedAt) + ": " + promptTitle(state.active.job.text));
    lines.push("Queued turns: " + state.pending.length);
    lines.push("Use /session cancel to stop the active turn and clear this conversation's queue.");
    return lines.join("\n");
  }

  cancelTurns(key) {
    const state = this.turnStates.get(key);
    if (!state || (!state.active && !state.pending.length)) return "No Agent turn is running or queued for this conversation.";
    const cleared = state.pending.splice(0);
    for (const job of cleared) this.removePendingTurn(job.id);
    if (state.active) {
      state.active.cancelRequested = true;
      interruptChildProcess(state.active.child);
    }
    return "Cancellation requested. Cleared " + cleared.length + " queued turn" + (cleared.length === 1 ? "" : "s") + ".";
  }

  persistPendingTurn(job) {
    const store = this.loadStore();
    if (!store.pendingTurns.some((item) => item.id === job.id)) {
      store.pendingTurns.push({ id: job.id, event: job.event, eventId: job.eventId, text: job.text, key: job.key, createdAt: job.createdAt });
      store.pendingTurns = store.pendingTurns.slice(-100);
      this.saveStore();
    }
  }

  removePendingTurn(id) {
    const store = this.loadStore();
    const next = store.pendingTurns.filter((item) => item.id !== id);
    if (next.length !== store.pendingTurns.length) {
      store.pendingTurns = next;
      this.saveStore();
    }
  }

  restorePendingTurns(bridge) {
    if (this.restoredPendingTurns) return;
    this.restoredPendingTurns = true;
    for (const item of this.loadStore().pendingTurns.slice()) {
      if (!item.event || !item.text) continue;
      const key = item.key || botConversationKey(item.event);
      const state = this.turnStates.get(key) || { active: null, pending: [] };
      state.pending.push({ ...item, key, bridge });
      this.turnStates.set(key, state);
      void this.drainTurnQueue(key, state);
    }
  }
}

class CodexBotWorker extends OpenCodeBotWorker {
  constructor(options) {
    super(options);
    this.agent = codexRuntimeAgent();
    this.agentLabel = this.agent === "zcode" ? "ZCode" : "Codex";
    this.workspaceName = options.workspaceName || this.agentLabel;
    this.command = expandHome(codexRuntimeRealCli(this.agent));
    this.defaultCwd = resolveOpenCodeBotCwd(nonEmptyEnv("CCR_BOT_GATEWAY_CWD"), os.homedir());
    this.store = null;
  }

  async handleCommand(event, text, bridge) {
    const parsed = parseBotCommand(text);
    if (parsed && parsed.domain === "session" && parsed.name === "skills") {
      return renderAgentSkills(this.projectDirectory(botConversationKey(event)), this.agent);
    }
    const response = await super.handleCommand(event, text, bridge);
    return typeof response === "string" ? response.replace(/OpenCode/g, this.agentLabel) : response;
  }

  async runTurn(event, eventId, bridge, text, key, activeTurn) {
    let entry = this.conversationEntry(key);
    if (entry && entry.sessionId && bridge.config.sessionIdleMinutes > 0 && Date.now() - Number(entry.updatedAt || 0) >= bridge.config.sessionIdleMinutes * 60_000) {
      entry = { ...entry, sessionId: "", title: "", updatedAt: Date.now() };
      this.setConversationEntry(key, entry);
    }
    const cwd = resolveOpenCodeBotCwd(entry && entry.projectDirectory, this.defaultCwd);
    const input = await botInputForEvent(event, text, bridge.config, path.join(bridge.config.stateDir || cwd, "attachments"));
    let prompt = botPromptFromInput(input);
    if (!bridge.config.shellEnabled) {
      prompt = "Bot policy: shell and terminal tools are disabled. Do not invoke shell commands; use non-shell tools only.\n\n" + prompt;
    }
    if (entry && entry.mode === "plan") {
      prompt = "Session mode: plan only. Analyze and propose a plan without modifying files.\n\n" + prompt;
    }
    if (entry && Array.isArray(entry.memory) && entry.memory.length) {
      prompt = "Persistent session context:\n" + entry.memory.map((item) => "- " + item).join("\n") + "\n\nUser message:\n" + prompt;
    }
    const args = ["exec"];
    if (entry && entry.sessionId) args.push("resume");
    args.push("--json", "--skip-git-repo-check");
    for (const imagePath of botImagePathsFromInput(input)) args.push("--image", imagePath);
    if (entry && entry.model) args.push("--model", entry.model);
    if (entry && entry.effort) args.push("-c", "model_reasoning_effort=" + JSON.stringify(entry.effort));
    const sandboxMode = bridge.config.shellEnabled ? "workspace-write" : "read-only";
    if (entry && entry.sessionId) args.push("-c", "sandbox_mode=" + JSON.stringify(sandboxMode));
    else args.push("--sandbox", sandboxMode);
    if (entry && entry.sessionId) args.push(entry.sessionId);
    args.push(prompt);

    const streamId = this.agent + "-" + stableBotKey(eventId).slice(-16);
    const streamParts = new Map();
    let lastStreamAt = 0;
    const result = await runCodexBotCli(this.command, args, cwd, this.agent, {
      timeoutMs: bridge.config.maxTurnTimeMs,
      onSpawn: (child) => { activeTurn.child = child; },
      onJson: (value) => {
        rememberCodexBotOutput(value, streamParts);
        const streamedText = Array.from(streamParts.values()).join("\n").trim();
        if (!streamedText || Date.now() - lastStreamAt < 700) return;
        lastStreamAt = Date.now();
        void bridge.sendStreamToEvent(event, streamId, streamedText, false, "ccr:" + this.agent + ":stream:" + eventId).catch((error) => bridge.logError("stream_failed", error));
      }
    });
    const parsed = parseCodexBotOutput(result.stdout);
    const sessionId = parsed.sessionId || entry && entry.sessionId || "";
    if (sessionId) {
      this.setConversationEntry(key, {
        ...(entry || {}),
        sessionId,
        projectDirectory: cwd,
        title: entry && entry.title || "Bot: " + this.workspaceName,
        updatedAt: Date.now()
      });
    }
    const errorText = parsed.error || result.error || (result.exitCode !== 0 ? result.stderr || this.agentLabel + " exited with code " + result.exitCode : "");
    const responseText = errorText
      ? "Agent turn failed: " + errorText
      : parsed.text || parsed.fallbackText || this.agentLabel + " completed the turn without a text response.";
    if (bridge.config.streamReplies && !errorText) {
      await bridge.sendStreamToEvent(event, streamId, responseText, true, "ccr:" + this.agent + ":stream:" + eventId).catch(() => undefined);
    } else {
      await bridge.sendReplyToEvent(event, responseText, "ccr:" + this.agent + ":" + eventId + ":" + (sessionId || uuid()));
    }
    await sendBotTextArtifacts(event, bridge, responseText, cwd, "ccr:" + this.agent + ":artifact:" + eventId);
    log("bot_gateway_inbound_replied", { eventId, agent: this.agent, sessionId, exitCode: result.exitCode, textLen: responseText.length });
  }

  async listSessions(includeArchived = false) {
    const store = this.loadStore();
    return scanCodexBotSessions(codexRuntimeHome())
      .map((session) => ({
        ...session,
        title: store.sessionAliases[session.id] || session.title,
        archived: store.archivedSessionIds.includes(session.id)
      }))
      .filter((session) => includeArchived ? session.archived : !session.archived);
  }

  loadStore() {
    if (this.store) return this.store;
    const value = readJsonFile(codexBotSessionStorePath(this.agent));
    const conversations = value && typeof value === "object" && value.conversations && typeof value.conversations === "object" ? value.conversations : {};
    const pendingTurns = value && Array.isArray(value.pendingTurns) ? value.pendingTurns.filter((item) => item && typeof item === "object") : [];
    const projectAliases = value && value.projectAliases && typeof value.projectAliases === "object" ? value.projectAliases : {};
    const sessionAliases = value && value.sessionAliases && typeof value.sessionAliases === "object" ? value.sessionAliases : {};
    const archivedSessionIds = value && Array.isArray(value.archivedSessionIds) ? value.archivedSessionIds.filter((item) => typeof item === "string") : [];
    this.store = { version: OPENCODE_BOT_SESSION_STORE_VERSION, conversations, pendingTurns, projectAliases, sessionAliases, archivedSessionIds };
    return this.store;
  }

  saveStore() {
    writeJsonAtomic(codexBotSessionStorePath(this.agent), this.loadStore());
  }

  async mutateSession(action, args, visibleSessions, key) {
    const parsed = parseConfirmedTarget(args);
    const all = action === "restore" ? await this.listSessions(true) : visibleSessions;
    const session = resolveOpenCodeSession(parsed.target, all);
    if (!session) return "Session '" + parsed.target + "' was not found.";
    const store = this.loadStore();
    if (action === "archive") {
      if (!store.archivedSessionIds.includes(session.id)) store.archivedSessionIds.push(session.id);
      if (this.conversationEntry(key) && this.conversationEntry(key).sessionId === session.id) {
        this.setConversationEntry(key, { sessionId: "", projectDirectory: this.projectDirectory(key), title: "", updatedAt: Date.now() });
      } else this.saveStore();
      return "Session archived: " + session.title + ". Use /session list archived to view archived sessions.";
    }
    if (action === "restore") {
      store.archivedSessionIds = store.archivedSessionIds.filter((id) => id !== session.id);
      this.saveStore();
      return "Session restored: " + session.title + ".";
    }
    if (!parsed.confirmed) return "Deletion is permanent. Send /session delete " + parsed.target + " confirm.";
    try {
      fs.unlinkSync(session.file);
    } catch (error) {
      return "Session deletion failed: " + conciseError(error);
    }
    delete store.sessionAliases[session.id];
    store.archivedSessionIds = store.archivedSessionIds.filter((id) => id !== session.id);
    this.saveStore();
    return "Session deleted: " + session.title + ".";
  }

  async renderSessionHistory(key, args) {
    const entry = this.conversationEntry(key);
    if (!entry || !entry.sessionId) return "No session is selected.";
    const session = (await this.listSessions(true)).find((item) => item.id === entry.sessionId);
    if (!session || !session.file) return "Unable to read session history.";
    return renderCodexBotHistory(session.file, args);
  }

  async renderSessionUsage(key) {
    const entry = this.conversationEntry(key);
    if (!entry || !entry.sessionId) return "No session is selected.";
    const session = (await this.listSessions(true)).find((item) => item.id === entry.sessionId);
    if (!session || !session.file) return "Usage data is unavailable for this session.";
    const values = readJsonLines(session.file, 2000);
    return renderExportedUsage(JSON.stringify(values));
  }

  async renderModels(query) {
    const file = this.agent === "zcode"
      ? nonEmptyEnv("CCR_ZCODE_MODEL_CATALOG_FILE") || nonEmptyEnv("CODEXL_ZCODE_MODEL_CATALOG_FILE")
      : nonEmptyEnv("CCR_CODEX_MODEL_CATALOG_FILE") || nonEmptyEnv("CODEXL_CODEX_MODEL_CATALOG_FILE");
    const ids = Array.from(collectCodexModelIds(readJsonFile(file), new Set())).sort();
    const search = String(query || "").trim().toLowerCase();
    const filtered = search ? ids.filter((id) => id.toLowerCase().includes(search)) : ids;
    return filtered.length ? this.agentLabel + " models:\n" + filtered.slice(0, 100).map((id) => "- " + id).join("\n") : "No matching models were found.";
  }
}

function parseCodexBotWorkerOptions(args) {
  let workspaceName = nonEmptyEnv("CCR_CODEX_WORKSPACE_NAME") || nonEmptyEnv("CODEXL_CODEX_WORKSPACE_NAME") || nonEmptyEnv("CODEXL_ZCODE_WORKSPACE_NAME") || "Codex";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--workspace-name" && args[i + 1]) {
      workspaceName = args[i + 1];
      i += 1;
    }
  }
  return { workspaceName };
}

function codexBotSessionStorePath(agent) {
  const stateDir = nonEmptyEnv("CCR_BOT_GATEWAY_STATE_DIR") || nonEmptyEnv("CODEXL_BOT_GATEWAY_STATE_DIR") || nonEmptyEnv("BOT_GATEWAY_STATE_DIR") || path.join(CONFIG_DIR, "bot-gateway", safePathSegment(nonEmptyEnv("CCR_BOT_PROFILE_ID") || "default"));
  return path.join(expandHome(stateDir), safePathSegment(agent) + "-bot-sessions.json");
}

async function runCodexBotCli(command, args, cwd, agent, options = {}) {
  const env = childEnvForAgent(agent);
  delete env.CCR_CODEX_BOT_WORKER;
  delete env.CCR_CLI_DIRECT_PROFILE_DISPATCH;
  delete env.ELECTRON_RUN_AS_NODE;
  let child;
  try {
    child = spawnAgentCli(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: "", error: conciseError(error) };
  }
  if (typeof options.onSpawn === "function") options.onSpawn(child);
  let stdout = "";
  let stderr = "";
  let pendingJson = "";
  let spawnError = "";
  const append = (current, chunk) => {
    const next = current + chunk.toString("utf8");
    return next.length > 4 * 1024 * 1024 ? next.slice(-4 * 1024 * 1024) : next;
  };
  child.stdout.on("data", (chunk) => {
    stdout = append(stdout, chunk);
    if (typeof options.onJson !== "function") return;
    pendingJson += chunk.toString("utf8");
    const lines = pendingJson.split(/\r?\n/g);
    pendingJson = lines.pop() || "";
    for (const line of lines) {
      try { options.onJson(JSON.parse(line)); } catch { /* Ignore diagnostics. */ }
    }
  });
  child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
  child.once("error", (error) => { spawnError = conciseError(error); });
  let timedOut = false;
  let forceKillTimer = null;
  const timeoutMs = Number(options.timeoutMs) || 10 * 60 * 1000;
  const timer = setTimeout(() => {
    timedOut = true;
    interruptChildProcess(child);
    forceKillTimer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* Already exited. */ } }, 5000);
  }, timeoutMs);
  const result = await waitForChildResult(child);
  clearTimeout(timer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  return { exitCode: result.exitCode, stdout: stdout.trim(), stderr: stderr.trim(), error: timedOut ? "Agent timed out after " + timeoutMs + "ms" : spawnError };
}

function rememberCodexBotOutput(value, parts) {
  if (!value || typeof value !== "object") return;
  const item = value.item && typeof value.item === "object" ? value.item : value;
  const type = String(item.type || value.type || "").toLowerCase();
  if (!type.includes("agent_message") && !(type.includes("message") && String(item.role || "").toLowerCase() === "assistant")) return;
  const text = stringValue(item.text) || textFromContent(item.content);
  if (text) parts.set(stringValue(item.id) || "message-" + parts.size, text);
}

function parseCodexBotOutput(output) {
  let sessionId = "";
  let error = "";
  const parts = new Map();
  const fallback = [];
  for (const rawLine of String(output || "").split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (!line) continue;
    let value;
    try { value = JSON.parse(line); } catch { fallback.push(line); continue; }
    sessionId = valueStringAtPaths(value, ["/thread_id", "/threadId", "/session_id", "/sessionId", "/payload/id"]) || sessionId;
    rememberCodexBotOutput(value, parts);
    const type = String(value.type || "").toLowerCase();
    if (type.includes("error") || type === "turn.failed") error = valueStringAtPaths(value, ["/message", "/error/message", "/error"]) || error;
  }
  return { sessionId, error, text: Array.from(parts.values()).join("\n").trim(), fallbackText: fallback.join("\n").trim() };
}

function scanCodexBotSessions(home) {
  const root = path.join(expandHome(home), "sessions");
  const files = [];
  const visit = (directory, depth) => {
    if (depth > 6 || files.length >= 500) return;
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file, depth + 1);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(file);
    }
  };
  visit(root, 0);
  return files.map(parseCodexBotSessionFile).filter(Boolean).sort((left, right) => right.updatedAt - left.updatedAt);
}

function parseCodexBotSessionFile(file) {
  const values = readJsonLines(file, -80);
  if (!values.length) return null;
  let id = "";
  let directory = "";
  let title = "";
  let timestamp = "";
  for (const value of values) {
    const payload = value && value.payload && typeof value.payload === "object" ? value.payload : value;
    id = id || valueStringAtPaths(payload, ["/id", "/session_id", "/sessionId"]);
    directory = directory || valueStringAtPaths(payload, ["/cwd", "/directory", "/path"]);
    timestamp = timestamp || valueStringAtPaths(payload, ["/timestamp", "/created_at", "/createdAt"]);
    if (!title) {
      const role = String(payload && payload.role || "").toLowerCase();
      if (role === "user") title = (textFromContent(payload.content) || stringValue(payload.text)).slice(0, 100);
    }
  }
  if (!id) id = path.basename(file, ".jsonl").replace(/^rollout-/, "");
  let updatedAt = Date.parse(timestamp) || 0;
  try { updatedAt = Math.max(updatedAt, fs.statSync(file).mtimeMs); } catch { /* Keep parsed time. */ }
  return { id, title: title || "Untitled", directory: directory || os.homedir(), updatedAt, file };
}

function readJsonLines(file, limit) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch { return []; }
  const lines = text.split(/\r?\n/g).filter(Boolean);
  const count = Number(limit) || lines.length;
  const selected = count < 0 ? lines.slice(0, Math.abs(count)) : lines.slice(Math.max(0, lines.length - count));
  return selected.map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function renderCodexBotHistory(file, countArg) {
  const messages = [];
  for (const value of readJsonLines(file, 2000)) {
    const payload = value && value.payload && typeof value.payload === "object" ? value.payload : value;
    const role = String(payload && payload.role || "").toLowerCase();
    if (role !== "user" && role !== "assistant") continue;
    const text = textFromContent(payload.content) || stringValue(payload.text);
    if (text) messages.push({ role: role === "user" ? "User" : "Agent", text });
  }
  const requested = Number(countArg);
  const count = Number.isInteger(requested) ? Math.min(30, Math.max(1, requested)) : 10;
  const recent = messages.slice(-count);
  return recent.length ? "Recent session history:\n" + recent.map((item) => item.role + ": " + item.text.slice(0, 500)).join("\n\n") : "Session history is empty.";
}

function collectCodexModelIds(value, output, depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) return output;
  if (!Array.isArray(value)) {
    const id = stringValue(value.id) || stringValue(value.slug) || stringValue(value.model);
    if (id && id.length < 200) output.add(id);
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) collectCodexModelIds(child, output, depth + 1);
  return output;
}

function parseOpenCodeBotWorkerOptions(args) {
  let workspaceName = nonEmptyEnv("CCR_OPENCODE_WORKSPACE_NAME") || "OpenCode";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--workspace-name" && args[i + 1]) {
      workspaceName = args[i + 1];
      i += 1;
    }
  }
  return { workspaceName };
}

function openCodeBotSessionStorePath() {
  const stateDir = nonEmptyEnv("CCR_BOT_GATEWAY_STATE_DIR") ||
    nonEmptyEnv("CODEXL_BOT_GATEWAY_STATE_DIR") ||
    nonEmptyEnv("BOT_GATEWAY_STATE_DIR") ||
    path.join(CONFIG_DIR, "bot-gateway", safePathSegment(nonEmptyEnv("CCR_BOT_PROFILE_ID") || "default"));
  return path.join(expandHome(stateDir), "opencode-bot-sessions.json");
}

function resolveOpenCodeBotCwd() {
  const candidates = Array.from(arguments).concat([openCodeDesktopDefaultCwd(), os.homedir(), process.cwd()]);
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = expandHome(candidate);
    try {
      if (fs.statSync(resolved).isDirectory()) return resolved;
    } catch {
      // Try the next configured directory.
    }
  }
  return process.cwd();
}

function openCodeDesktopDefaultCwd() {
  return path.parse(os.homedir()).root || process.cwd();
}

async function runOpenCodeBotCli(command, args, cwd, options = {}) {
  const env = withoutKeys(process.env, [
    "CCR_OPENCODE_BOT_WORKER",
    "CCR_CLI_DIRECT_PROFILE_DISPATCH",
    "ELECTRON_RUN_AS_NODE"
  ]);
  env.OPENCODE_CLIENT = "cli";
  if (process.platform !== "win32") env.PWD = cwd;
  let child;
  try {
    child = spawnAgentCli(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: "", error: conciseError(error) };
  }
  if (typeof options.onSpawn === "function") options.onSpawn(child);

  let stdout = "";
  let stderr = "";
  let spawnError = "";
  const append = (current, chunk) => {
    const next = current + chunk.toString("utf8");
    return next.length > 4 * 1024 * 1024 ? next.slice(-4 * 1024 * 1024) : next;
  };
  let pendingJson = "";
  child.stdout.on("data", (chunk) => {
    stdout = append(stdout, chunk);
    if (typeof options.onJson !== "function") return;
    pendingJson += chunk.toString("utf8");
    const lines = pendingJson.split(/\r?\n/g);
    pendingJson = lines.pop() || "";
    for (const line of lines) {
      try { options.onJson(JSON.parse(line)); } catch { /* Ignore diagnostics. */ }
    }
  });
  child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
  child.once("error", (error) => { spawnError = conciseError(error); });

  let timedOut = false;
  let forceKillTimer = null;
  const timeoutMs = Number(options.timeoutMs) || numberEnv("CCR_OPENCODE_BOT_TURN_TIMEOUT_MS", 10 * 60 * 1000);
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGTERM");
    } catch {
      // The process may have already exited.
    }
    forceKillTimer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // The process may have already exited.
      }
    }, 5000);
  }, timeoutMs);
  const result = await waitForChildResult(child);
  clearTimeout(timer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  return {
    exitCode: result.exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    error: timedOut ? "OpenCode timed out after " + timeoutMs + "ms" : spawnError
  };
}

function parseOpenCodeRunOutput(output) {
  let sessionId = "";
  let error = "";
  const textParts = new Map();
  const fallback = [];
  let unnamedPart = 0;
  for (const rawLine of String(output || "").split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (!line) continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      fallback.push(line);
      continue;
    }
    if (!value || typeof value !== "object") continue;
    sessionId = valueStringAtPaths(value, ["/sessionID", "/sessionId", "/session/id", "/part/sessionID"]) || sessionId;
    const type = stringValue(value.type) || "";
    if (type === "text") {
      const part = value.part && typeof value.part === "object" ? value.part : value;
      const text = stringValue(part.text) || stringValue(value.text);
      if (text) {
        const partId = stringValue(part.id) || "part-" + (++unnamedPart);
        textParts.set(partId, text);
      }
    } else if (type === "error") {
      error = openCodeEventError(value) || error;
    }
  }
  return {
    sessionId,
    error,
    text: Array.from(textParts.values()).join("\n").trim(),
    fallbackText: fallback.join("\n").trim()
  };
}

function openCodeEventError(value) {
  return valueStringAtPaths(value, [
    "/error/data/message",
    "/error/message",
    "/error/data/name",
    "/error/name",
    "/message"
  ]) || stringValue(value && value.error) || "OpenCode returned an error";
}

function parseOpenCodeSessionList(output) {
  const text = String(output || "").trim();
  if (!text) return [];
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    const lines = text.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (Array.isArray(parsed)) {
          value = parsed;
          break;
        }
      } catch {
        // Ignore non-JSON diagnostic lines.
      }
    }
  }
  const values = Array.isArray(value)
    ? value
    : value && Array.isArray(value.sessions)
      ? value.sessions
      : value && Array.isArray(value.data)
        ? value.data
        : [];
  return values.map(normalizeOpenCodeSession).filter(Boolean).sort((left, right) => right.updatedAt - left.updatedAt);
}

function normalizeOpenCodeSession(value) {
  if (!value || typeof value !== "object") return null;
  const id = valueStringAtPaths(value, ["/id", "/sessionID", "/sessionId"]);
  if (!id) return null;
  const title = valueStringAtPaths(value, ["/title", "/name", "/summary/title"]) || "Untitled";
  const directory = valueStringAtPaths(value, ["/directory", "/cwd", "/path"]);
  const rawUpdatedAt = valueAtPointer(value, "/time/updated") ?? value.updatedAt ?? value.updated_at ?? valueAtPointer(value, "/time/created");
  const numericUpdatedAt = Number(rawUpdatedAt);
  const parsedUpdatedAt = typeof rawUpdatedAt === "string" ? Date.parse(rawUpdatedAt) : 0;
  return {
    id,
    title,
    directory,
    updatedAt: Number.isFinite(numericUpdatedAt) && numericUpdatedAt > 0
      ? numericUpdatedAt
      : Number.isFinite(parsedUpdatedAt) ? parsedUpdatedAt : 0
  };
}

function resolveOpenCodeSession(query, sessions) {
  const text = String(query || "").trim();
  const index = Number(text);
  if (Number.isInteger(index) && index >= 1 && index <= sessions.length) return sessions[index - 1];
  const lower = text.toLowerCase();
  const matches = sessions.filter((session) =>
    session.id.toLowerCase() === lower ||
    session.id.toLowerCase().startsWith(lower) ||
    session.title.toLowerCase().includes(lower)
  );
  if (!matches.length) return null;
  matches.sort((left, right) => {
    const leftExact = left.id.toLowerCase() === lower ? 0 : left.id.toLowerCase().startsWith(lower) ? 1 : 2;
    const rightExact = right.id.toLowerCase() === lower ? 0 : right.id.toLowerCase().startsWith(lower) ? 1 : 2;
    return leftExact - rightExact || right.updatedAt - left.updatedAt;
  });
  return matches[0];
}

function renderOpenCodeSessionList(sessions, current, directory, options = {}) {
  const page = botListPage(sessions, options.args, options.query, (session) => session.title + " " + session.id);
  sessions = page.items;
  if (!sessions.length) {
    return "No OpenCode sessions found in project " + projectNameFromDirectory(directory) + ". Send any message to create one.";
  }
  const lines = ["OpenCode sessions in " + projectNameFromDirectory(directory) + ":", "page " + page.page + "/" + page.pages];
  for (let i = 0; i < sessions.length; i += 1) {
    const session = sessions[i];
    const selected = current && current.sessionId === session.id ? " [selected]" : "";
    lines.push("[" + (page.offset + i + 1) + "] " + shortSessionId(session.id) + " " + session.title + selected);
  }
  lines.push("Commands: /session use <n>, /session new, /session current, /session reset");
  if (page.pages > 1) lines.push("Use /session list <page> to see more.");
  return lines.join("\n");
}

function agentProjectsFromDirectories(directories, fallbackDirectory) {
  const projects = [];
  for (const value of directories) {
    const raw = stringValue(value);
    if (!raw) continue;
    const directory = path.resolve(expandHome(raw));
    try {
      if (!fs.statSync(directory).isDirectory()) continue;
    } catch {
      continue;
    }
    if (projects.some((project) => sameProjectDirectory(project.directory, directory))) continue;
    projects.push({ directory, name: projectNameFromDirectory(directory) });
  }
  if (!projects.length && fallbackDirectory) {
    const directory = path.resolve(expandHome(fallbackDirectory));
    projects.push({ directory, name: projectNameFromDirectory(directory) });
  }
  return projects;
}

function sameProjectDirectory(left, right) {
  const leftPath = stringValue(left);
  const rightPath = stringValue(right);
  if (!leftPath || !rightPath) return false;
  return comparableProjectDirectory(leftPath) === comparableProjectDirectory(rightPath);
}

function comparableProjectDirectory(value) {
  const resolved = path.resolve(expandHome(stringValue(value) || process.cwd()));
  try {
    return normalizeComparablePath(fs.realpathSync(resolved));
  } catch {
    return normalizeComparablePath(resolved);
  }
}

function resolveExistingProjectDirectory(value, fallbackDirectory) {
  for (const candidate of [value, fallbackDirectory, process.cwd()]) {
    const raw = stringValue(candidate);
    if (!raw) continue;
    const directory = path.resolve(expandHome(raw));
    try {
      if (fs.statSync(directory).isDirectory()) return directory;
    } catch {
      // Try the next project candidate.
    }
  }
  return path.resolve(expandHome(stringValue(fallbackDirectory) || process.cwd()));
}

function projectNameFromDirectory(directory) {
  const resolved = path.resolve(expandHome(stringValue(directory) || process.cwd()));
  return path.basename(resolved) || resolved;
}

function resolveAgentProject(query, projects) {
  const value = String(query || "").trim();
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= projects.length) {
    return projects[numeric - 1];
  }
  const lower = value.toLowerCase();
  const matches = projects.filter((project) =>
    project.name.toLowerCase() === lower ||
    comparableProjectDirectory(project.directory) === comparableProjectDirectory(value)
  );
  return matches.length === 1 ? matches[0] : null;
}

function renderAgentProjectList(agentName, projects, currentDirectory, options = {}) {
  const page = botListPage(projects, options.args, options.query, (project) => project.name + " " + project.directory);
  projects = page.items;
  if (!projects.length) return "No " + agentName + " projects found.";
  const lines = [agentName + " projects:", "page " + page.page + "/" + page.pages];
  for (let i = 0; i < projects.length; i += 1) {
    const project = projects[i];
    const selected = sameProjectDirectory(project.directory, currentDirectory) ? " [selected]" : "";
    lines.push("[" + (page.offset + i + 1) + "] " + project.name + selected);
    lines.push("    path: " + project.directory);
  }
  lines.push("Commands: /project use <n>, /project current");
  if (page.pages > 1) lines.push("Use /project list <page> to see more.");
  return lines.join("\n");
}

function botListPage(values, args, query, label) {
  const pageSize = 8;
  const search = String(query || "").trim().toLowerCase();
  const filtered = search ? values.filter((item) => String(label(item) || "").toLowerCase().includes(search)) : values;
  const requested = Number(String(args || "").trim());
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Number.isInteger(requested) ? Math.min(pages, Math.max(1, requested)) : 1;
  const offset = (page - 1) * pageSize;
  return { items: filtered.slice(offset, page * pageSize), page, pages, total: filtered.length, offset };
}

function parseSubcommand(value) {
  const input = String(value || "").trim();
  const space = input.search(/\s/);
  return space < 0
    ? { name: input.toLowerCase(), args: "" }
    : { name: input.slice(0, space).toLowerCase(), args: input.slice(space + 1).trim() };
}

function forwardSkillCommand(args) {
  const command = parseSubcommand(args);
  if (!command.name) return "Usage: /session skill <name> [task].";
  if (!/^[A-Za-z0-9_.-]+$/.test(command.name)) return "Skill names may contain letters, numbers, dots, underscores, and hyphens.";
  return { forwardText: "/" + command.name + (command.args ? " " + command.args : "") };
}

function parseConfirmedTarget(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  const confirmed = parts.at(-1) && parts.at(-1).toLowerCase() === "confirm";
  if (confirmed) parts.pop();
  return { target: parts.join(" "), confirmed };
}

function renderExportedHistory(output, countArg) {
  let value;
  try { value = JSON.parse(String(output || "")); } catch { return splitBotMessage(String(output || ""), 3500)[0] || "Session history is empty."; }
  const messages = [];
  collectHistoryMessages(value, messages, new Set());
  const requested = Number(countArg);
  const count = Number.isInteger(requested) ? Math.min(30, Math.max(1, requested)) : 10;
  const recent = messages.slice(-count);
  return recent.length
    ? "Recent session history:\n" + recent.map((item) => item.role + ": " + item.text.slice(0, 500)).join("\n\n")
    : "Session history is empty.";
}

function collectHistoryMessages(value, output, seen) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (!Array.isArray(value)) {
    const role = stringValue(value.role) || stringValue(value.type);
    const text = stringValue(value.text) || stringValue(value.content) || stringValue(value.message);
    if (role && text && ["user", "assistant", "agent", "text"].some((item) => role.toLowerCase().includes(item))) {
      output.push({ role: role.toLowerCase().includes("user") ? "User" : "Agent", text });
    }
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) collectHistoryMessages(child, output, seen);
}

function renderExportedUsage(output) {
  let value;
  try { value = JSON.parse(String(output || "")); } catch { return "Usage data is unavailable for this session."; }
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  collectUsageValues(value, totals, new Set());
  return [
    "Session usage:",
    "input tokens: " + totals.input,
    "output tokens: " + totals.output,
    "cache read: " + totals.cacheRead,
    "cache write: " + totals.cacheWrite,
    "cost: " + (totals.cost ? "$" + totals.cost.toFixed(4) : "unavailable")
  ].join("\n");
}

function collectUsageValues(value, totals, seen) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (!Array.isArray(value)) {
    for (const [key, raw] of Object.entries(value)) {
      const number = Number(raw);
      if (!Number.isFinite(number)) continue;
      const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
      if (normalized === "inputtokens") totals.input += number;
      else if (normalized === "outputtokens") totals.output += number;
      else if (normalized.includes("cacheread")) totals.cacheRead += number;
      else if (normalized.includes("cachewrite")) totals.cacheWrite += number;
      else if (normalized === "cost" || normalized === "costusd") totals.cost += number;
    }
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) collectUsageValues(child, totals, seen);
}

function renderAgentSkills(directory, agent) {
  const roots = agent === "opencode"
    ? [path.join(directory, ".opencode", "skills"), path.join(os.homedir(), ".config", "opencode", "skills")]
    : agent === "codex" || agent === "zcode"
      ? [path.join(directory, ".agents", "skills"), path.join(codexRuntimeHome(), "skills"), path.join(os.homedir(), ".codex", "skills")]
      : [path.join(directory, ".claude", "skills"), path.join(os.homedir(), ".claude", "skills")];
  const skills = [];
  for (const root of roots) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if ((entry.isDirectory() || entry.name.endsWith(".md")) && !skills.includes(entry.name.replace(/\.md$/i, ""))) skills.push(entry.name.replace(/\.md$/i, ""));
    }
  }
  return skills.length ? "Available skills:\n" + skills.sort().map((item) => "- " + item).join("\n") : "No project or user skills were found.";
}

function renderBotDiagnostics(value) {
  return [
    "Bot diagnostics:",
    "connection: " + (value.state || "unknown"),
    "platform: " + (value.platform || "unknown"),
    "last event: " + (value.lastEventAt || "none"),
    "last delivery: " + (value.lastDeliveryAt || "none") + (value.lastDeliveryStatus ? " (" + value.lastDeliveryStatus + ")" : ""),
    "pending deliveries: " + Number(value.outboxCount || 0),
    "processed events: " + Number(value.processedEventCount || 0),
    "last error: " + (value.lastError || "none")
  ].join("\n");
}

function renderBotDeliveries(value) {
  const deliveries = Array.isArray(value.recentDeliveries) ? value.recentDeliveries : [];
  if (!deliveries.length) return "No recent Bot deliveries.";
  return "Recent Bot deliveries:\n" + deliveries.slice(-10).reverse().map((item) =>
    new Date(item.deliveredAt).toISOString() + " " + item.kind + " " + item.status
  ).join("\n");
}

function conciseError(error) {
  return error && typeof error.message === "string" && error.message.trim()
    ? error.message.trim()
    : String(error || "Unknown error");
}

function acquireBotWorkerLock(agent) {
  const lockPath = botWorkerLockPath(agent);
  const token = uuid();
  const payload = {
    pid: process.pid,
    token,
    startedAt: Date.now()
  };
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), { flag: "wx" });
      const lock = { path: lockPath, token };
      process.once("exit", () => releaseBotWorkerLock(lock));
      return lock;
    } catch (error) {
      if (!error || error.code !== "EEXIST") throw error;
      const existing = readJsonFile(lockPath) || {};
      const existingPid = Number(existing.pid);
      if (existingPid && existingPid !== process.pid && processIsRunning(existingPid)) {
        log(agent + "_bot_worker_lock_held", { lockPath, pid: process.pid, ownerPid: existingPid });
        return null;
      }
      try {
        fs.unlinkSync(lockPath);
        log(agent + "_bot_worker_stale_lock_removed", { lockPath, pid: process.pid, ownerPid: existingPid || null });
      } catch (unlinkError) {
        log(agent + "_bot_worker_lock_remove_failed", { lockPath, pid: process.pid, error: formatError(unlinkError) });
        return null;
      }
    }
  }
  log(agent + "_bot_worker_lock_failed", { lockPath, pid: process.pid });
  return null;
}

function releaseBotWorkerLock(lock) {
  if (!lock || !lock.path) return;
  try {
    const existing = readJsonFile(lock.path) || {};
    if (existing.token && existing.token !== lock.token) return;
    fs.unlinkSync(lock.path);
  } catch {
    // The lock may have already been removed during shutdown.
  }
}

function botWorkerLockPath(agent) {
  const stateDir = nonEmptyEnv("CCR_BOT_GATEWAY_STATE_DIR") ||
    nonEmptyEnv("CODEXL_BOT_GATEWAY_STATE_DIR") ||
    nonEmptyEnv("BOT_GATEWAY_STATE_DIR") ||
    path.join(CONFIG_DIR, "bot-gateway", safePathSegment(nonEmptyEnv("CCR_BOT_PROFILE_ID") || "default"));
  return path.join(expandHome(stateDir), safePathSegment(agent) + "-bot-worker.lock");
}

function processIsRunning(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && error.code === "EPERM");
  }
}

function waitForTerminationSignal() {
  return new Promise((resolve) => {
    const timer = setInterval(() => {}, 2147483647);
    const done = () => {
      clearInterval(timer);
      process.off("SIGINT", done);
      process.off("SIGTERM", done);
      process.off("SIGHUP", done);
      resolve();
    };
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
    process.once("SIGHUP", done);
  });
}

function parseAppServerOptions(args) {
  const runtimeAgent = codexRuntimeAgent();
  let workspaceName = agentEnv(runtimeAgent, "WORKSPACE_NAME") ||
    (runtimeAgent === "codex" ? nonEmptyEnv("CODEXL_CODEX_INSTANCE_NAME") : "") ||
    (runtimeAgent === "zcode" ? "ZCode" : "Claude Code");
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--workspace-name" && args[i + 1]) {
      workspaceName = args[i + 1];
      i += 1;
    }
  }
  return { workspaceName };
}

function shouldRunClaudeCodeAppServer(args) {
  const mode = normalizeRemoteFrontendMode(agentEnv(codexRuntimeAgent(), "REMOTE_FRONTEND_MODE", "CORE_MODE"));
  const nextArgs = args.length === 0 ? ["app-server"] : args;
  return mode === "claude-code" && nextArgs[0] === "app-server";
}

class ClaudeCodeAppServer {
  constructor(options) {
    this.workspaceName = options.workspaceName || "Claude Code";
    this.threads = new Map();
    this.active = new Map();
    this.appResponses = new Map();
    this.botBridgeRegistered = false;
    this.botSessionStore = { version: BOT_SESSION_ENTRY_VERSION, conversations: {}, pendingTurns: [], projectAliases: {} };
    this.botSessionStoreLoaded = false;
    this.botThreadKeys = new Map();
    this.botThreads = new Map();
    this.botTurnStates = new Map();
    this.botPendingApprovals = new Map();
    this.botSessionApprovals = new Set();
    this.restoredBotPendingTurns = false;
    this.configValues = {};
    this.pollingEvents = false;
    this.stdin = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  }

  async run() {
    log("claude_app_server_start", { workspaceName: this.workspaceName, pid: process.pid });
    const workers = [];
    for await (const line of this.stdin) {
      const worker = this.handleLine(line);
      if (worker) workers.push(worker);
    }
    await Promise.allSettled(workers);
    log("claude_app_server_stop", { pid: process.pid });
  }

  handleLine(line) {
    let request;
    try {
      request = JSON.parse(line);
    } catch (error) {
      log("claude_app_invalid_json", { error: formatError(error) });
      return undefined;
    }
    if (!request || typeof request !== "object") return undefined;
    if (!request.method) {
      const key = jsonRpcIdKey(request.id);
      if (key) {
        this.appResponses.set(key, request.result === undefined ? { error: request.error } : request.result);
      }
      return undefined;
    }
    if (request.method === "notifications/initialized" || request.method === "initialized") return undefined;
    try {
      return this.handleRequest(request);
    } catch (error) {
      writeError(request.id, -32000, formatError(error));
      return undefined;
    }
  }

  handleRequest(request) {
    const id = request.id;
    const method = request.method;
    const params = request.params || {};
    log("claude_app_request", { method, id: jsonRpcIdKey(id) });
    if (!isClaudeOwnedMethod(method)) {
      const result = standaloneCodexAppResult(method, params);
      if (result !== undefined) {
        writeResponse(id, result);
      } else {
        writeError(id, -32601, "Claude Code app-server does not support method: " + method);
      }
      return undefined;
    }
    switch (method) {
      case "initialize":
        writeResponse(id, {
          protocolVersion: String(params.protocolVersion || PROTOCOL_VERSION),
          capabilities: { experimentalApi: true },
          serverInfo: { name: "ccr-claude-code-app-server", version: VERSION },
          userAgent: "ccr-claude-code-app-server/" + VERSION,
          codexHome: codexRuntimeHome(),
          platformFamily: process.platform === "win32" ? "windows" : "unix",
          platformOs: process.platform
        });
        this.ensureBotBridgeRegistered();
        return undefined;
      case "thread/start": {
        const thread = this.createThread(params);
        writeResponse(id, threadRuntimeResponse(thread, false));
        writeNotification("thread/started", { thread: threadJson(thread, false) });
        return undefined;
      }
      case "thread/resume": {
        const thread = this.getOrCreateThread(params);
        writeResponse(id, threadRuntimeResponse(thread, !params.excludeTurns));
        writeNotification("thread/started", { thread: threadJson(thread, false) });
        return undefined;
      }
      case "thread/read": {
        const thread = this.requireThread(params.threadId);
        writeResponse(id, { thread: threadJson(thread, Boolean(params.includeTurns)) });
        return undefined;
      }
      case "thread/list":
      case "thread/search": {
        writeResponse(id, this.threadList(params));
        return undefined;
      }
      case "thread/loaded/list": {
        writeResponse(id, { data: Array.from(this.threads.keys()), nextCursor: null });
        return undefined;
      }
      case "thread/turns/list":
      case "turn/list": {
        const thread = this.requireThread(requiredThreadId(params));
        let turns = thread.turns.slice();
        if (params.sortDirection !== "asc") turns.reverse();
        if (Number.isFinite(params.limit)) turns = turns.slice(0, params.limit);
        writeResponse(id, { data: turns.map((turn) => turnJson(turn, true)), nextCursor: null, backwardsCursor: null });
        return undefined;
      }
      case "thread/turns/items/list": {
        const thread = this.requireThread(requiredThreadId(params));
        let turns = thread.turns.filter((turn) => !params.turnId || turn.id === params.turnId);
        if (params.sortDirection !== "asc") turns.reverse();
        let items = turns.flatMap((turn) => turnItems(turn));
        if (Number.isFinite(params.limit)) items = items.slice(0, params.limit);
        writeResponse(id, { data: items, nextCursor: null, backwardsCursor: null });
        return undefined;
      }
      case "thread/archive":
      case "thread/unarchive": {
        const thread = this.requireThread(params.threadId);
        thread.archived = method === "thread/archive";
        thread.updatedAt = nowSeconds();
        writeResponse(id, {});
        writeNotification(thread.archived ? "thread/archived" : "thread/unarchived", { threadId: thread.id });
        return undefined;
      }
      case "thread/unsubscribe":
        writeResponse(id, { status: "notSubscribed" });
        return undefined;
      case "thread/name/set": {
        const thread = this.requireThread(params.threadId);
        thread.name = typeof params.name === "string" ? params.name : null;
        thread.updatedAt = nowSeconds();
        writeResponse(id, {});
        writeNotification("thread/name/updated", { threadId: thread.id, name: thread.name });
        return undefined;
      }
      case "thread/metadata/update": {
        const thread = this.requireThread(params.threadId);
        applyThreadMetadata(thread, params);
        writeResponse(id, { thread: threadJson(thread, Boolean(params.includeTurns)) });
        writeNotification("thread/stream/state", threadStreamState(thread));
        return undefined;
      }
      case "thread/pin":
      case "thread/unpin":
        writeResponse(id, { threadId: params.threadId, pinned: method === "thread/pin" });
        return undefined;
      case "thread/pinned/list":
      case "thread/pins/list":
        writeResponse(id, { threadIds: [], data: [], nextCursor: null });
        return undefined;
      case "thread/memoryMode/get":
      case "thread/memory/get":
        writeResponse(id, { threadId: params.threadId, memoryMode: null });
        return undefined;
      case "thread/memoryMode/set":
      case "thread/memory/set":
        writeResponse(id, { threadId: params.threadId, memoryMode: params.memoryMode || params.mode || null });
        return undefined;
      case "thread/memoryMode/clear":
      case "thread/memory/clear":
      case "thread/prewarm/clear":
      case "thread/prewarm/clearAll":
        writeResponse(id, {});
        return undefined;
      case "thread/prewarm":
      case "thread/prewarm/start": {
        const thread = this.createThread(params);
        writeResponse(id, { ...threadRuntimeResponse(thread, false), prewarmed: true });
        writeNotification("thread/started", { thread: threadJson(thread, false) });
        return undefined;
      }
      case "thread/goal/get":
        writeResponse(id, { goal: null });
        return undefined;
      case "thread/goal/set":
        writeResponse(id, { goal: params.goal || null });
        return undefined;
      case "thread/goal/clear":
        writeResponse(id, { goal: null });
        return undefined;
      case "turn/start": {
        const prepared = this.startTurn(params);
        writeResponse(id, { turn: turnJson(prepared.turn, false) });
        for (const notification of prepared.notifications) writeRaw(notification);
        return this.runTurn(prepared.work);
      }
      case "turn/interrupt": {
        const key = activeKey(params.threadId, params.turnId);
        const entry = this.active.get(key) || findActiveForThread(this.active, params.threadId);
        if (entry) {
          entry.child.kill("SIGTERM");
          this.active.delete(entry.key);
          const thread = this.threads.get(entry.threadId);
          const turn = thread && thread.turns.find((item) => item.id === entry.turnId);
          if (turn) {
            turn.status = "interrupted";
            turn.completedAt = nowSeconds();
            turn.durationMs = Math.max(0, (turn.completedAt - turn.startedAt) * 1000);
          }
        }
        writeResponse(id, {});
        return undefined;
      }
      case "turn/steer": {
        const entry = findActiveForThread(this.active, params.threadId);
        if (!entry || !entry.child.stdin) throw new Error("No active turn for thread " + params.threadId);
        entry.child.stdin.write(JSON.stringify(claudeInputMessage(params.input || params.message || params)) + "\n");
        writeResponse(id, {});
        return undefined;
      }
      case "model/list":
        writeResponse(id, modelList(params));
        return undefined;
      case "modelProvider/capabilities/read":
        writeResponse(id, { namespaceTools: false, imageGeneration: false, webSearch: false });
        return undefined;
      case "account/read":
        writeResponse(id, mockAccountRead());
        return undefined;
      case "getAuthStatus":
        writeResponse(id, mockAuthStatus(Boolean(params.includeToken)));
        return undefined;
      case "permissionProfile/list":
      case "skills/list":
      case "plugin/list":
      case "app/list":
      case "mcpServerStatus/list":
      case "experimentalFeature/list":
        writeResponse(id, { data: [], nextCursor: null });
        return undefined;
      case "hooks/list":
        writeResponse(id, { data: [] });
        return undefined;
      case "collaborationMode/list":
        writeResponse(id, collaborationModes());
        return undefined;
      case "config/read":
        writeResponse(id, configRead(params, this.configValues));
        return undefined;
      case "config/value/write":
      case "config/batchWrite":
        applyConfigWrite(method, params, this.configValues);
        writeResponse(id, configWriteResponse(params));
        return undefined;
      case "configRequirements/read":
        writeResponse(id, { requirements: null });
        return undefined;
      case "config/mcpServer/reload":
      case "memory/reset":
        writeResponse(id, {});
        return undefined;
      default:
        writeError(id, -32601, "Claude Code app-server does not support method: " + method);
        return undefined;
    }
  }

  async handleBotInbound(event, _queued, eventId, bridge) {
    let text = botEventText(event) || botInteractionText(event);
    if (!text) {
      log("bot_gateway_inbound_skip", { eventId, reason: "empty_text" });
      return;
    }
    const commandReply = this.handleBotCommand(event, text, bridge);
    if (commandReply && typeof commandReply === "object" && commandReply.forwardText) {
      text = commandReply.forwardText;
    } else if (commandReply !== null) {
      await bridge.sendReplyToEvent(event, commandReply, "ccr:claude-code:command:" + eventId);
      log("bot_gateway_command_replied", { eventId, textLen: commandReply.length });
      return;
    }
    const position = this.enqueueBotTurn(event, eventId, bridge, text);
    if (position > 0) {
      await bridge.sendReplyToEvent(event, "Queued behind the active turn (position " + position + "). Use /session status or /session cancel.", "ccr:claude-code:queued:" + eventId);
    }
  }

  enqueueBotTurn(event, eventId, bridge, text) {
    const key = botConversationKey(event);
    const state = this.botTurnStates.get(key) || { active: null, pending: [] };
    const job = { id: eventId || stableBotKey(botEventDedupeKey(event)), event, eventId, text, key, createdAt: Date.now(), bridge };
    state.pending.push(job);
    this.botTurnStates.set(key, state);
    this.persistBotPendingTurn(job);
    const position = (state.active ? 1 : 0) + state.pending.length - 1;
    void this.drainBotTurnQueue(key, state);
    return position;
  }

  async drainBotTurnQueue(key, state) {
    if (state.draining) return;
    state.draining = true;
    try {
      while (state.pending.length) {
        const job = state.pending.shift();
        state.active = { job, threadId: "", turnId: "", startedAt: Date.now(), cancelRequested: false };
        try {
          await this.runBotTurn(job, state.active);
        } catch (error) {
          try {
            await job.bridge.sendReplyToEvent(job.event, "Agent turn failed: " + conciseError(error), "ccr:claude-code:error:" + job.eventId);
          } catch (replyError) {
            log("claude_bot_turn_error_reply_failed", { eventId: job.eventId, error: formatError(error), replyError: formatError(replyError) });
          }
        } finally {
          this.removeBotPendingTurn(job.id);
          state.active = null;
        }
      }
    } finally {
      state.draining = false;
      if (!state.active && !state.pending.length) this.botTurnStates.delete(key);
    }
  }

  async runBotTurn(job, activeTurn) {
    const { event, eventId, bridge, text, key } = job;
    this.expireIdleBotSession(key, bridge.config.sessionIdleMinutes);
    const thread = this.botThreadForEvent(event, text);
    const entry = this.loadBotSessionStore().conversations[key];
    let input = await botInputForEvent(event, text, bridge.config, thread.claudeAppSessionFile ? path.join(path.dirname(thread.claudeAppSessionFile), thread.claudeAppSessionId || "", "uploads") : path.join(thread.cwd, ".ccr-bot-uploads"));
    if (entry && Array.isArray(entry.memory) && entry.memory.length) {
      input = [{ type: "text", text: "Persistent session context:\n" + entry.memory.map((item) => "- " + item).join("\n") }, ...input];
    }
    const prepared = this.startTurn({
      cwd: thread.cwd,
      input,
      threadId: thread.id
    });
    prepared.work.botContext = { event, eventId, bridge, conversationKey: key };
    prepared.work.botStream = { id: "claude-" + prepared.turn.id, lastSentAt: 0, pending: "", timer: null };
    activeTurn.work = prepared.work;
    activeTurn.threadId = thread.id;
    activeTurn.turnId = prepared.turn.id;
    for (const notification of prepared.notifications) writeRaw(notification);
    bridge.suppressTurn(prepared.turn.id);
    try {
      await this.runTurn(prepared.work);
    } finally {
      bridge.unsuppressTurn(prepared.turn.id);
    }

    const completed = thread.turns.find((turn) => turn.id === prepared.turn.id) || prepared.turn;
    const responseText = completed.error
      ? "Agent turn failed: " + completed.error
      : (completed.agentText || "").trim() || "Claude Code completed the turn without a text response.";
    if (bridge.config.streamReplies && !completed.error) {
      await bridge.sendStreamToEvent(event, "claude-" + prepared.turn.id, responseText, true, "ccr:claude-code:stream:" + eventId).catch(() => undefined);
    } else {
      await bridge.sendReplyToEvent(event, responseText, "ccr:claude-code:" + eventId + ":" + prepared.turn.id);
    }
    await sendBotTurnArtifacts(event, bridge, completed, thread.cwd, "ccr:claude-code:artifact:" + eventId);
    log("bot_gateway_inbound_replied", { eventId, threadId: thread.id, turnId: prepared.turn.id, textLen: responseText.length });
  }

  handleBotCommand(event, text, bridge) {
    const command = parseBotCommand(text);
    if (!command) return null;
    const key = botConversationKey(event);
    try {
      if (command.name === "unknown") return "Unknown Bot command. Send /project or /session to see available commands.";
      if (command.domain === "project") {
        if (command.name === "help") return projectCommandHelpText("Claude App");
        if (command.name === "current") return this.renderCurrentBotProject(key);
        const sessions = claudeAppLocalAgentSessions();
        const projects = claudeAppProjects(sessions, this.defaultBotProjectDirectory());
        for (const project of projects) project.name = this.botProjectLabel(project.directory, project.name);
        if (command.name === "ls") {
          return renderAgentProjectList("Claude App", projects, this.selectedBotProjectDirectory(key), { args: command.args });
        }
        if (command.name === "search") {
          return renderAgentProjectList("Claude App", projects, this.selectedBotProjectDirectory(key), { query: command.args });
        }
        if (command.name === "rename") {
          if (!command.args) return "Usage: /project name <label>.";
          this.loadBotSessionStore().projectAliases[comparableProjectDirectory(this.selectedBotProjectDirectory(key))] = command.args.slice(0, 80);
          this.saveBotSessionStore();
          return "Project label updated to " + command.args.slice(0, 80) + ".";
        }
        if (command.name === "select") {
          if (!command.args) return "Usage: /project use <project-number>. Send /project list to list projects.";
          const project = resolveAgentProject(command.args, projects);
          if (!project) return "Project '" + command.args + "' was not found. Send /project list to list projects.";
          this.setBotProjectForConversation(key, project.directory);
          return "Selected project " + project.name + "\npath: " + project.directory + "\nUse /session list or /session new to choose a session.";
        }
      }
      if (command.domain === "session") {
        if (command.name === "help") return sessionCommandHelpText("Claude App");
        if (command.name === "status") return this.renderBotTurnStatus(key);
        if (command.name === "cancel") return this.cancelBotTurns(key);
        if (["approve", "deny", "answer"].includes(command.name)) return this.resolveBotApproval(key, command.name, command.args);
        if (command.name === "ls") return this.renderBotSessionList(key, command.args);
        if (command.name === "search") return this.renderBotSessionList(key, "", command.args);
        if (command.name === "current") return this.renderCurrentBotSession(key);
        if (command.name === "reset") {
          const directory = this.selectedBotProjectDirectory(key);
          this.setBotProjectForConversation(key, directory);
          return "Session selection cleared. The next message will create a new Claude App session in the current project.";
        }
        if (command.name === "new") {
          const directory = this.selectedBotProjectDirectory(key);
          this.setBotProjectForConversation(key, directory);
          const seed = command.args || "New Claude App bot session";
          const thread = this.botThreadForEvent(event, seed);
          return "Created session " + shortSessionId(thread.claudeAppSessionId || thread.sessionId || thread.id) + ": " + (thread.preview || "New Claude App session") + "\nProject: " + projectNameFromDirectory(thread.cwd) + "\nNext message will continue in this Claude App session.";
        }
        if (command.name === "select") {
          if (!command.args) return "Usage: /session use <session-number>. Send /session list to list sessions.";
          const directory = this.selectedBotProjectDirectory(key);
          const sessions = claudeAppLocalAgentSessions().filter((session) =>
            sameProjectDirectory(claudeAppSessionProjectDirectory(session), directory)
          );
          const session = resolveClaudeAppLocalAgentSession(command.args, sessions);
          if (!session) return "Session '" + command.args + "' was not found in the current project. Send /session list to list sessions.";
          const thread = this.bindBotConversationToClaudeAppSession(key, session);
          return "Selected session " + shortSessionId(session.sessionId) + ": " + botSessionTitle(session) + "\nNext message will continue in this Claude App session.";
        }
        if (command.name === "rename") return this.renameBotSession(key, command.args);
        if (["archive", "restore", "delete"].includes(command.name)) return this.mutateClaudeBotSession(key, command.name, command.args);
        if (command.name === "history") return this.renderClaudeBotHistory(key, command.args);
        if (command.name === "model") return this.updateClaudeBotSetting(key, "model", command.args);
        if (command.name === "effort") return this.updateClaudeBotSetting(key, "effort", command.args);
        if (command.name === "mode") return this.updateClaudeBotSetting(key, "mode", command.args);
        if (command.name === "models") return this.renderClaudeBotModels();
        if (command.name === "usage") return this.renderClaudeBotUsage(key);
        if (command.name === "memory") return this.updateClaudeBotMemory(key, command.args);
        if (command.name === "skills") return renderAgentSkills(this.selectedBotProjectDirectory(key), "claude");
        if (command.name === "skill") return forwardSkillCommand(command.args);
        if (command.name === "shortcut") return this.handleClaudeBotShortcut(key, command.args);
        if (command.name === "doctor") return renderBotDiagnostics(bridge.diagnostics());
        if (command.name === "deliveries") return renderBotDeliveries(bridge.diagnostics());
      }
      return null;
    } catch (error) {
      return formatError(error);
    }
  }

  ensureBotBridgeRegistered() {
    if (this.botBridgeRegistered) return;
    this.botBridgeRegistered = true;
    const bridge = botBridge();
    bridge.setInboundHandler((event, queued, eventId, activeBridge) => this.handleBotInbound(event, queued, eventId, activeBridge));
    this.restoreBotPendingTurns(bridge);
  }

  botThreadForEvent(event, text) {
    const key = botConversationKey(event);
    const mappedThreadId = this.botThreads.get(key);
    if (mappedThreadId && this.threads.has(mappedThreadId)) {
      return this.threads.get(mappedThreadId);
    }
    const restoredThread = this.restoreBotThreadForConversation(key);
    if (restoredThread) {
      if (!restoredThread.preview) restoredThread.preview = text.slice(0, 160);
      return restoredThread;
    }
    const projectDirectory = this.selectedBotProjectDirectory(key);
    const appThread = this.createBotThreadForNewClaudeAppSession(key, text, projectDirectory);
    if (appThread) return appThread;
    const thread = this.createThread({ cwd: projectDirectory, workspaceKind: "local" });
    if (!thread.preview) thread.preview = text.slice(0, 160);
    this.botThreads.set(key, thread.id);
    this.botThreadKeys.set(thread.id, key);
    this.persistBotThread(thread.id);
    return thread;
  }

  bindBotConversationToClaudeAppSession(key, session) {
    const oldThreadId = this.botThreads.get(key);
    if (oldThreadId) this.botThreadKeys.delete(oldThreadId);
    const thread = this.createThread({
      cwd: claudeAppSessionProjectDirectory(session),
      model: session.model || undefined,
      workspaceKind: "local",
      claudeConfigDir: session.claudeConfigDir || null
    });
    thread.sessionId = session.sessionId || thread.id;
    thread.claudeSessionId = session.cliSessionId || null;
    thread.claudeConfigDir = session.claudeConfigDir || null;
    thread.claudeAppSessionId = session.sessionId || null;
    thread.claudeAppSessionFile = session.file || "";
    thread.preview = botSessionTitle(session);
    thread.name = botSessionTitle(session);
    thread.updatedAt = Math.floor((session.lastActivityAt || Date.now()) / 1000);
    this.botThreads.set(key, thread.id);
    this.botThreadKeys.set(thread.id, key);
    this.persistBotThread(thread.id);
    return thread;
  }

  defaultBotProjectDirectory() {
    const configured = nonEmptyEnv("CCR_BOT_GATEWAY_CWD");
    if (configured) return resolveExistingProjectDirectory(configured, process.cwd());
    const latest = latestClaudeAppLocalAgentSession();
    return latest ? claudeAppSessionProjectDirectory(latest) : process.cwd();
  }

  selectedBotProjectDirectory(key) {
    const threadId = this.botThreads.get(key);
    const thread = threadId ? this.threads.get(threadId) : null;
    if (thread && thread.cwd) return resolveExistingProjectDirectory(thread.cwd, this.defaultBotProjectDirectory());
    const entry = this.loadBotSessionStore().conversations[key];
    return resolveExistingProjectDirectory(
      entry && (entry.projectDirectory || entry.cwd),
      this.defaultBotProjectDirectory()
    );
  }

  setBotProjectForConversation(key, directory) {
    const threadId = this.botThreads.get(key);
    if (threadId) this.botThreadKeys.delete(threadId);
    this.botThreads.delete(key);
    const projectDirectory = resolveExistingProjectDirectory(directory, this.defaultBotProjectDirectory());
    const store = this.loadBotSessionStore();
    store.conversations[key] = {
      entryVersion: BOT_SESSION_ENTRY_VERSION,
      projectDirectory,
      cwd: projectDirectory,
      updatedAt: Date.now(),
      updatedAtSeconds: nowSeconds()
    };
    this.saveBotSessionStore();
  }

  renderCurrentBotProject(key) {
    const directory = this.selectedBotProjectDirectory(key);
    return [
      "Current Claude App project:",
      projectNameFromDirectory(directory),
      "path: " + directory
    ].join("\n");
  }

  botProjectLabel(directory, fallback) {
    return this.loadBotSessionStore().projectAliases[comparableProjectDirectory(directory)] || fallback;
  }

  renderBotSessionList(key, args = "", query = "") {
    const directory = this.selectedBotProjectDirectory(key);
    const includeArchived = String(args).trim().toLowerCase() === "archived";
    let sessions = claudeAppLocalAgentSessions({ includeArchived }).filter((session) =>
      sameProjectDirectory(claudeAppSessionProjectDirectory(session), directory)
    );
    const page = botListPage(sessions, includeArchived ? "1" : args, query, (session) => botSessionTitle(session) + " " + session.sessionId);
    sessions = page.items;
    if (!sessions.length) return "No Claude App sessions found in project " + projectNameFromDirectory(directory) + ". Send any message to create one.";
    const current = this.currentBotSessionInfo(key);
    const lines = ["Claude App sessions in " + projectNameFromDirectory(directory) + ":", "page " + page.page + "/" + page.pages];
    for (let i = 0; i < sessions.length; i += 1) {
      const session = sessions[i];
      const selected = current && current.sessionId === session.sessionId ? " [selected]" : "";
      lines.push("[" + (page.offset + i + 1) + "] " + shortSessionId(session.sessionId) + " " + botSessionTitle(session) + selected + (session.archived ? " [archived]" : ""));
    }
    lines.push("Commands: /session use <n>, /session new, /session current, /session reset");
    if (page.pages > 1) lines.push("Use /session list <page> to see more.");
    return lines.join("\n");
  }

  renderCurrentBotSession(key) {
    const current = this.currentBotSessionInfo(key);
    const directory = this.selectedBotProjectDirectory(key);
    if (!current) return "No selected Claude App session in project " + projectNameFromDirectory(directory) + ". Use /session list, /session use <n>, or send any message to create one.";
    const title = current.title || current.sessionId || "Claude App session";
    return [
      "Current Claude App session:",
      shortSessionId(current.sessionId || current.threadId || "") + " " + title,
      "project: " + projectNameFromDirectory(directory),
      "path: " + directory
    ].join("\n");
  }

  currentBotSessionInfo(key) {
    const threadId = this.botThreads.get(key);
    const thread = threadId ? this.threads.get(threadId) : null;
    if (thread) {
      return {
        sessionId: thread.claudeAppSessionId || thread.sessionId,
        threadId: thread.id,
        title: thread.name || thread.preview,
        cwd: thread.cwd
      };
    }
    const entry = this.loadBotSessionStore().conversations[key];
    if (!entry || typeof entry !== "object") return null;
    if (Number(entry.entryVersion || 0) < 2) return null;
    if (!entry.claudeAppSessionId && !entry.claudeSessionId && !entry.sessionId) return null;
    return {
      sessionId: entry.claudeAppSessionId || entry.sessionId || "",
      threadId: entry.threadId || "",
      title: entry.preview || "",
      cwd: entry.cwd || ""
    };
  }

  renameBotSession(key, label) {
    const current = this.currentBotSessionInfo(key);
    const name = String(label || "").trim().slice(0, 100);
    if (!current) return "No session is selected.";
    if (!name) return "Usage: /session name <label>.";
    const session = claudeAppLocalAgentSessions({ includeArchived: true }).find((item) => item.sessionId === current.sessionId);
    if (session) updateClaudeSessionFile(session.file, { title: name });
    const threadId = this.botThreads.get(key);
    const thread = threadId ? this.threads.get(threadId) : null;
    if (thread) {
      thread.name = name;
      thread.preview = name;
      this.persistBotThread(thread.id);
    } else {
      const entry = this.loadBotSessionStore().conversations[key];
      if (entry) {
        entry.preview = name;
        entry.updatedAt = Date.now();
        this.saveBotSessionStore();
      }
    }
    return "Session renamed to " + name + ".";
  }

  mutateClaudeBotSession(key, action, args) {
    const directory = this.selectedBotProjectDirectory(key);
    const sessions = claudeAppLocalAgentSessions({ includeArchived: true }).filter((session) => sameProjectDirectory(claudeAppSessionProjectDirectory(session), directory));
    const parsed = parseConfirmedTarget(args);
    const session = resolveClaudeAppLocalAgentSession(parsed.target, sessions);
    if (!session) return "Session '" + parsed.target + "' was not found in the current project.";
    if (action === "archive" || action === "restore") {
      updateClaudeSessionFile(session.file, { isArchived: action === "archive", archived: action === "archive", lastActivityAt: Date.now() });
      if (action === "archive" && this.currentBotSessionInfo(key) && this.currentBotSessionInfo(key).sessionId === session.sessionId) {
        this.setBotProjectForConversation(key, directory);
      }
      return "Session " + (action === "archive" ? "archived" : "restored") + ": " + botSessionTitle(session) + ".";
    }
    if (!parsed.confirmed) return "Deletion is permanent. Send /session delete " + parsed.target + " confirm.";
    try {
      fs.rmSync(session.file, { force: true });
      const sessionDir = path.join(path.dirname(session.file), session.sessionId);
      if (pathIsInside(sessionDir, path.dirname(session.file))) fs.rmSync(sessionDir, { force: true, recursive: true });
    } catch (error) {
      return "Session deletion failed: " + conciseError(error);
    }
    if (this.currentBotSessionInfo(key) && this.currentBotSessionInfo(key).sessionId === session.sessionId) this.setBotProjectForConversation(key, directory);
    return "Session deleted: " + botSessionTitle(session) + ".";
  }

  renderClaudeBotHistory(key, countArg) {
    const threadId = this.botThreads.get(key);
    const thread = threadId ? this.threads.get(threadId) : null;
    if (!thread) return "No loaded session history is available. Select or send a message to the session first.";
    const requested = Number(countArg);
    const count = Number.isInteger(requested) ? Math.min(30, Math.max(1, requested)) : 10;
    const turns = thread.turns.slice(-count);
    if (!turns.length) return "Session history is empty.";
    return "Recent session history:\n" + turns.map((turn) => {
      const user = turn.input.map((item) => promptTextForItem(item)).join(" ").slice(0, 500);
      return "User: " + user + "\nAgent: " + String(turn.agentText || turn.error || "(no response)").slice(0, 1000);
    }).join("\n\n");
  }

  updateClaudeBotSetting(key, setting, args) {
    const value = String(args || "").trim();
    const entry = this.loadBotSessionStore().conversations[key] || { entryVersion: BOT_SESSION_ENTRY_VERSION, projectDirectory: this.selectedBotProjectDirectory(key), cwd: this.selectedBotProjectDirectory(key) };
    const threadId = this.botThreads.get(key);
    const thread = threadId ? this.threads.get(threadId) : null;
    const current = setting === "mode"
      ? entry.permissionMode || thread && thread.permissionMode
      : setting === "effort"
        ? entry.effort || thread && thread.reasoningEffort
        : entry[setting] || thread && thread[setting];
    if (!value) return "Current " + setting + ": " + (current || "default") + ".";
    if (setting === "effort" && !["low", "medium", "high", "xhigh", "max", "reset"].includes(value)) return "Supported effort values: low, medium, high, xhigh, max, reset.";
    if (setting === "mode" && !["manual", "acceptEdits", "plan", "auto", "dontAsk", "reset"].includes(value)) return "Supported modes: manual, acceptEdits, plan, auto, dontAsk, reset.";
    const next = value === "reset" ? "" : value;
    if (setting === "mode") entry.permissionMode = next;
    else entry[setting] = next;
    entry.updatedAt = Date.now();
    this.loadBotSessionStore().conversations[key] = entry;
    if (thread) {
      if (setting === "mode") thread.permissionMode = next;
      else if (setting === "effort") thread.reasoningEffort = next;
      else thread[setting] = next;
      this.persistBotThread(thread.id);
    } else this.saveBotSessionStore();
    return setting + " set to " + (next || "default") + ".";
  }

  renderClaudeBotModels() {
    const result = modelList({});
    const items = Array.isArray(result && result.data) ? result.data : [];
    return items.length ? "Available models:\n" + items.slice(0, 30).map((item) => "- " + (item.model || item.id || item.name)).join("\n") : "No models were returned by the current profile.";
  }

  renderClaudeBotUsage(key) {
    const threadId = this.botThreads.get(key);
    const thread = threadId ? this.threads.get(threadId) : null;
    const usage = thread && thread.latestTokenUsageInfo;
    if (!usage) return "No usage data is available for the selected session yet.";
    return "Latest session usage:\nmodel: " + (usage.model || thread.model || "default") + "\n" + JSON.stringify(usage.usage, null, 2);
  }

  updateClaudeBotMemory(key, args) {
    const entry = this.loadBotSessionStore().conversations[key] || { entryVersion: BOT_SESSION_ENTRY_VERSION, projectDirectory: this.selectedBotProjectDirectory(key), cwd: this.selectedBotProjectDirectory(key) };
    const command = parseSubcommand(args);
    const memory = Array.isArray(entry.memory) ? entry.memory : [];
    if (!command.name || command.name === "list") return memory.length ? "Session memory:\n" + memory.map((item, index) => (index + 1) + ". " + item).join("\n") : "Session memory is empty.";
    if (command.name === "clear") entry.memory = [];
    else if (command.name === "add" && command.args) entry.memory = [...memory, command.args.slice(0, 2000)].slice(-20);
    else return "Usage: /session memory list | add <text> | clear.";
    entry.updatedAt = Date.now();
    this.loadBotSessionStore().conversations[key] = entry;
    this.saveBotSessionStore();
    return command.name === "clear" ? "Session memory cleared." : "Session memory added.";
  }

  handleClaudeBotShortcut(key, args) {
    const store = this.loadBotSessionStore();
    const entry = store.conversations[key] || { entryVersion: BOT_SESSION_ENTRY_VERSION, projectDirectory: this.selectedBotProjectDirectory(key), cwd: this.selectedBotProjectDirectory(key) };
    const shortcuts = entry.shortcuts && typeof entry.shortcuts === "object" ? entry.shortcuts : {};
    const command = parseSubcommand(args);
    if (!command.name || command.name === "list") {
      const names = Object.keys(shortcuts).sort();
      return names.length ? "Session shortcuts:\n" + names.map((name) => "- " + name + ": " + shortcuts[name]).join("\n") : "No session shortcuts are configured.";
    }
    if (command.name === "add") {
      const definition = parseSubcommand(command.args);
      if (!definition.name || !definition.args) return "Usage: /session shortcut add <name> <prompt>.";
      shortcuts[definition.name] = definition.args.slice(0, 2000);
      entry.shortcuts = shortcuts;
      entry.updatedAt = Date.now();
      store.conversations[key] = entry;
      this.saveBotSessionStore();
      return "Shortcut saved: " + definition.name + ".";
    }
    if (command.name === "remove") {
      delete shortcuts[String(command.args || "").trim().toLowerCase()];
      entry.shortcuts = shortcuts;
      entry.updatedAt = Date.now();
      store.conversations[key] = entry;
      this.saveBotSessionStore();
      return "Shortcut removed.";
    }
    if (command.name === "run") {
      const invocation = parseSubcommand(command.args);
      const prompt = shortcuts[invocation.name];
      return prompt ? { forwardText: prompt + (invocation.args ? "\n\n" + invocation.args : "") } : "Shortcut '" + invocation.name + "' was not found.";
    }
    return "Usage: /session shortcut list | add <name> <prompt> | remove <name> | run <name> [input].";
  }

  restoreBotThreadForConversation(key) {
    const entry = this.loadBotSessionStore().conversations[key];
    if (!entry || typeof entry !== "object") return null;
    if (Number(entry.entryVersion || 0) < 2) {
      log("bot_gateway_session_legacy_skip", {
        conversationKeyPrefix: key.slice(0, 80),
        threadId: entry.threadId || "",
        entryVersion: Number(entry.entryVersion || 0)
      });
      return null;
    }
    if (!entry.claudeSessionId && !entry.claudeAppSessionId) return null;
    const appSession = readClaudeAppLocalAgentSession(entry.claudeAppSessionFile || "");
    if (!botSessionEntryMatchesCurrentProfile(entry, appSession)) {
      log("bot_gateway_session_scope_skip", {
        conversationKeyPrefix: key.slice(0, 80),
        threadId: entry.threadId || "",
        claudeConfigDir: entry.claudeConfigDir || appSession.claudeConfigDir || "",
        claudeAppSessionFile: entry.claudeAppSessionFile || "",
        expectedUserDataDir: currentClaudeAppUserDataDir()
      });
      return null;
    }
    const thread = this.createThread({
      cwd: entry.cwd || process.cwd(),
      model: entry.model || undefined,
      workspaceKind: "local",
      claudeConfigDir: entry.claudeConfigDir || null
    });
    this.replaceThreadId(thread, entry.threadId || thread.id);
    thread.sessionId = entry.sessionId || thread.id;
    thread.claudeSessionId = entry.claudeSessionId || appSession.cliSessionId || null;
    thread.claudeConfigDir = entry.claudeConfigDir || appSession.claudeConfigDir || null;
    thread.claudeAppSessionId = entry.claudeAppSessionId || null;
    thread.claudeAppSessionFile = entry.claudeAppSessionFile || "";
    thread.preview = entry.preview || "";
    thread.reasoningEffort = entry.effort || entry.reasoningEffort || null;
    thread.permissionMode = entry.permissionMode || "";
    thread.updatedAt = entry.updatedAtSeconds || nowSeconds();
    this.botThreads.set(key, thread.id);
    this.botThreadKeys.set(thread.id, key);
    log("bot_gateway_session_restored", {
      conversationKeyPrefix: key.slice(0, 80),
      threadId: thread.id,
      claudeSessionIdPrefix: thread.claudeSessionId ? thread.claudeSessionId.slice(0, 8) : ""
    });
    return thread;
  }

  createBotThreadForNewClaudeAppSession(key, text, projectDirectory) {
    const session = createClaudeAppLocalAgentSession(text, projectDirectory);
    if (!session) return null;
    const thread = this.createThread({
      cwd: session.cwd || process.cwd(),
      model: session.model || undefined,
      workspaceKind: "local",
      claudeConfigDir: session.claudeConfigDir || null
    });
    thread.sessionId = session.sessionId || thread.id;
    thread.claudeSessionId = null;
    thread.claudeConfigDir = session.claudeConfigDir || null;
    thread.claudeAppSessionId = session.sessionId || null;
    thread.claudeAppSessionFile = session.file || "";
    const entry = this.loadBotSessionStore().conversations[key] || {};
    if (entry.model) thread.model = entry.model;
    if (entry.effort) thread.reasoningEffort = entry.effort;
    if (entry.permissionMode) thread.permissionMode = entry.permissionMode;
    thread.preview = session.title || text.slice(0, 160);
    thread.name = session.title || this.workspaceName;
    thread.updatedAt = Math.floor((session.lastActivityAt || Date.now()) / 1000);
    this.botThreads.set(key, thread.id);
    this.botThreadKeys.set(thread.id, key);
    this.persistBotThread(thread.id);
    log("bot_gateway_session_created", {
      conversationKeyPrefix: key.slice(0, 80),
      threadId: thread.id,
      appSessionId: thread.claudeAppSessionId,
      cwd: thread.cwd
    });
    return thread;
  }

  replaceThreadId(thread, id) {
    const nextId = String(id || "").trim();
    if (!nextId || thread.id === nextId) return;
    this.threads.delete(thread.id);
    thread.id = nextId;
    this.threads.set(thread.id, thread);
  }

  loadBotSessionStore() {
    if (this.botSessionStoreLoaded) return this.botSessionStore;
    this.botSessionStoreLoaded = true;
    try {
      this.botSessionStore = normalizeBotSessionStore(JSON.parse(fs.readFileSync(botSessionStorePath(), "utf8")));
    } catch {
      this.botSessionStore = { version: BOT_SESSION_ENTRY_VERSION, conversations: {}, pendingTurns: [], projectAliases: {} };
    }
    return this.botSessionStore;
  }

  saveBotSessionStore() {
    const file = botSessionStorePath();
    writeJsonAtomic(file, this.botSessionStore);
  }

  persistBotPendingTurn(job) {
    const store = this.loadBotSessionStore();
    if (!Array.isArray(store.pendingTurns)) store.pendingTurns = [];
    if (!store.pendingTurns.some((item) => item.id === job.id)) {
      store.pendingTurns.push({ id: job.id, event: job.event, eventId: job.eventId, text: job.text, key: job.key, createdAt: job.createdAt });
      store.pendingTurns = store.pendingTurns.slice(-100);
      this.saveBotSessionStore();
    }
  }

  removeBotPendingTurn(id) {
    const store = this.loadBotSessionStore();
    if (!Array.isArray(store.pendingTurns)) return;
    const next = store.pendingTurns.filter((item) => item.id !== id);
    if (next.length !== store.pendingTurns.length) {
      store.pendingTurns = next;
      this.saveBotSessionStore();
    }
  }

  restoreBotPendingTurns(bridge) {
    if (this.restoredBotPendingTurns) return;
    this.restoredBotPendingTurns = true;
    const pending = this.loadBotSessionStore().pendingTurns;
    for (const item of Array.isArray(pending) ? pending.slice() : []) {
      if (!item.event || !item.text) continue;
      const key = item.key || botConversationKey(item.event);
      const state = this.botTurnStates.get(key) || { active: null, pending: [] };
      state.pending.push({ ...item, key, bridge });
      this.botTurnStates.set(key, state);
      void this.drainBotTurnQueue(key, state);
    }
  }

  renderBotTurnStatus(key) {
    const state = this.botTurnStates.get(key);
    const approval = this.botPendingApprovals.get(key);
    if ((!state || (!state.active && !state.pending.length)) && !approval) return "No Agent turn is running or queued for this conversation.";
    const lines = [];
    if (state && state.active) lines.push("Running for " + formatDuration(Date.now() - state.active.startedAt) + ": " + promptTitle(state.active.job.text));
    if (approval) lines.push("Waiting for permission: " + approval.label);
    lines.push("Queued turns: " + (state ? state.pending.length : 0));
    lines.push("Use /session cancel to stop the active turn and clear this conversation's queue.");
    return lines.join("\n");
  }

  cancelBotTurns(key) {
    const state = this.botTurnStates.get(key);
    if (!state || (!state.active && !state.pending.length)) return "No Agent turn is running or queued for this conversation.";
    const cleared = state.pending.splice(0);
    for (const job of cleared) this.removeBotPendingTurn(job.id);
    if (state.active) {
      state.active.cancelRequested = true;
      if (state.active.work) state.active.work.cancelRequested = true;
      const active = findActiveForThread(this.active, state.active.threadId);
      interruptChildProcess(active && active.child);
    }
    const approval = this.botPendingApprovals.get(key);
    if (approval) {
      this.botPendingApprovals.delete(key);
      approval.resolve({ decision: "deny", reason: "Turn canceled" });
    }
    return "Cancellation requested. Cleared " + cleared.length + " queued turn" + (cleared.length === 1 ? "" : "s") + ".";
  }

  expireIdleBotSession(key, idleMinutes) {
    const minutes = Number(idleMinutes) || 0;
    if (minutes <= 0) return;
    const entry = this.loadBotSessionStore().conversations[key];
    if (!entry || !entry.updatedAt || Date.now() - Number(entry.updatedAt) < minutes * 60_000) return;
    this.setBotProjectForConversation(key, entry.projectDirectory || entry.cwd || this.defaultBotProjectDirectory());
  }

  resolveBotApproval(key, action, args) {
    const pending = this.botPendingApprovals.get(key);
    if (!pending) return "No permission request is waiting for this conversation.";
    this.botPendingApprovals.delete(key);
    const input = String(args || "").trim();
    if (action === "answer") {
      pending.resolve({ action: "accept", content: input, value: input });
      return "Answer sent to the Agent.";
    }
    const sessionScope = input.toLowerCase() === "session";
    if (action === "approve" && sessionScope) this.botSessionApprovals.add(key);
    pending.resolve({ decision: action === "approve" ? "allow" : "deny", scope: sessionScope ? "session" : "once" });
    return action === "approve" ? "Permission approved." : "Permission denied.";
  }

  persistBotThread(threadId) {
    const key = this.botThreadKeys.get(threadId);
    if (!key) return;
    const thread = this.threads.get(threadId);
    if (!thread) return;
    const store = this.loadBotSessionStore();
    const existing = store.conversations[key] && typeof store.conversations[key] === "object" ? store.conversations[key] : {};
    store.conversations[key] = {
      ...existing,
      entryVersion: BOT_SESSION_ENTRY_VERSION,
      threadId: thread.id,
      sessionId: thread.sessionId || thread.id,
      claudeSessionId: thread.claudeSessionId || null,
      claudeAppSessionId: thread.claudeAppSessionId || null,
      claudeAppSessionFile: thread.claudeAppSessionFile || null,
      claudeConfigDir: thread.claudeConfigDir || null,
      projectDirectory: thread.cwd || process.cwd(),
      cwd: thread.cwd || process.cwd(),
      model: thread.model || "",
      effort: thread.reasoningEffort || "",
      permissionMode: thread.permissionMode || "",
      preview: thread.preview || "",
      updatedAt: Date.now(),
      updatedAtSeconds: thread.updatedAt || nowSeconds()
    };
    this.saveBotSessionStore();
  }

  rememberClaudeSession(message, work) {
    const sessionId = claudeSessionIdFromMessage(message);
    if (!sessionId) return;
    const thread = this.threads.get(work.threadId);
    if (!thread || thread.claudeSessionId === sessionId) return;
    thread.claudeSessionId = sessionId;
    log("claude_session_remembered", { threadId: work.threadId, turnId: work.turnId, sessionIdPrefix: sessionId.slice(0, 8) });
    updateClaudeAppLocalAgentSession(thread, { cliSessionId: sessionId, lastActivityAt: Date.now() });
    this.persistBotThread(work.threadId);
  }

  createThread(params) {
    const id = uuid();
    const cwd = normalizeCwd(params.cwd);
    const now = nowSeconds();
    const thread = {
      id,
      sessionId: id,
      claudeSessionId: null,
      claudeConfigDir: params.claudeConfigDir || null,
      claudeAppSessionId: params.claudeAppSessionId || null,
      claudeAppSessionFile: params.claudeAppSessionFile || null,
      path: null,
      preview: "",
      cwd,
      gitInfo: {},
      workspaceKind: params.workspaceKind || "local",
      workspaceRoots: normalizeWorkspaceRoots(params.workspaceRoots || params.workspace_roots, cwd),
      workspaceBrowserRoot: params.workspaceBrowserRoot || params.workspaceRoot || cwd,
      projectlessOutputDirectory: params.projectlessOutputDirectory || null,
      baseInstructions: params.baseInstructions || null,
      developerInstructions: combinedDeveloperInstructions(params),
      personality: params.personality ?? null,
      persistExtendedHistory: params.persistExtendedHistory ?? null,
      model: params.model || agentEnv(codexRuntimeAgent(), "MODEL") || DEFAULT_MODEL,
      reasoningEffort: params.reasoningEffort ?? params.reasoning_effort ?? null,
      serviceTier: params.serviceTier ?? params.service_tier ?? null,
      collaborationMode: params.collaborationMode || { mode: "default", model: params.model || DEFAULT_MODEL, reasoning_effort: null },
      createdAt: now,
      updatedAt: now,
      archived: false,
      name: this.workspaceName,
      approvalPolicy: params.approvalPolicy || params.approval_policy || "default",
      approvalsReviewer: params.approvalsReviewer || params.approvals_reviewer || "auto_review",
      turns: [],
      goal: null,
      latestTokenUsageInfo: null
    };
    this.threads.set(id, thread);
    return thread;
  }

  getOrCreateThread(params) {
    const requested = params.threadId || params.thread_id;
    if (requested && this.threads.has(requested)) return this.threads.get(requested);
    if (requested) {
      const thread = this.createThread({ ...params, cwd: params.cwd || process.cwd() });
      thread.id = requested;
      thread.sessionId = requested;
      thread.claudeSessionId = requested;
      this.threads.delete(Array.from(this.threads.keys()).find((key) => this.threads.get(key) === thread));
      this.threads.set(requested, thread);
      return thread;
    }
    return this.createThread(params);
  }

  requireThread(threadId) {
    const id = String(threadId || "");
    const thread = this.threads.get(id);
    if (!thread) throw new Error("thread not found: " + id);
    return thread;
  }

  threadList(params) {
    let data = Array.from(this.threads.values())
      .filter((thread) => Boolean(thread.archived) === Boolean(params.archived))
      .map((thread) => threadJson(thread, false));
    const search = String(params.search || params.query || "").toLowerCase().trim();
    if (search) {
      data = data.filter((thread) => JSON.stringify(thread).toLowerCase().includes(search));
    }
    data.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (Number.isFinite(params.limit)) data = data.slice(0, params.limit);
    return { data, nextCursor: null, backwardsCursor: null };
  }

  startTurn(params) {
    const thread = this.requireThread(params.threadId);
    applyThreadMetadata(thread, params);
    const input = Array.isArray(params.input) ? clone(params.input) : [];
    const prompt = promptFromInput(input, params);
    const now = nowSeconds();
    if (!thread.preview) thread.preview = prompt.slice(0, 160);
    const turn = {
      id: "turn-" + uuid(),
      input,
      toolItems: [],
      agentText: "",
      status: "inProgress",
      error: null,
      startedAt: now,
      completedAt: null,
      durationMs: null,
      approvalPolicy: thread.approvalPolicy,
      approvalsReviewer: thread.approvalsReviewer,
      reasoningEffort: thread.reasoningEffort,
      serviceTier: thread.serviceTier,
      collaborationMode: thread.collaborationMode
    };
    thread.turns.push(turn);
    thread.updatedAt = now;
    const work = {
      threadId: thread.id,
      turnId: turn.id,
      agentItemId: agentItemIdForTurn(turn.id),
      cwd: thread.cwd,
      prompt,
      input,
      resumeExisting: Boolean(thread.claudeSessionId),
      claudeSessionId: thread.claudeSessionId,
      claudeConfigDir: thread.claudeConfigDir,
      model: thread.model,
      reasoningEffort: thread.reasoningEffort,
      permissionMode: thread.permissionMode || ""
    };
    const userItem = userItemJson(turn);
    const notifications = [
      { method: "thread/started", params: { thread: threadJson(thread, false) } },
      { method: "turn/started", params: { threadId: thread.id, turn: turnJson(turn, false) } },
      { method: "item/started", params: { threadId: thread.id, turnId: turn.id, item: userItem, startedAtMs: Date.now() } },
      { method: "thread/stream/state", params: threadStreamState(thread) }
    ];
    return { thread, turn, work, notifications };
  }

  async runTurn(work) {
    const thread = this.threads.get(work.threadId);
    const turn = thread && thread.turns.find((item) => item.id === work.turnId);
    if (!thread || !turn) return;
    const started = Date.now();
    const command = claudeCommand(work);
    log("claude_turn_spawn", {
      threadId: work.threadId,
      turnId: work.turnId,
      command: command.command,
      args: command.args,
      cwd: work.cwd,
      claudeConfigDir: work.claudeConfigDir || "",
      expectedUserDataDir: currentClaudeAppUserDataDir()
    });
    const child = childProcess.spawn(command.command, command.args, {
      cwd: work.cwd,
      env: command.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32"
    });
    let childSpawnError = null;
    child.on("error", (error) => {
      childSpawnError = error;
      log("claude_spawn_error", { threadId: work.threadId, turnId: work.turnId, error: formatError(error) });
    });
    const key = activeKey(work.threadId, work.turnId);
    this.active.set(key, { key, threadId: work.threadId, turnId: work.turnId, child });
    try {
      child.stdin.write(JSON.stringify({ type: "control_request", request_id: uuid(), request: { subtype: "initialize" } }) + "\n");
      child.stdin.write(JSON.stringify(claudeInputMessage(work.input.length ? work.input : [{ type: "text", text: work.prompt }], work.claudeSessionId || "")) + "\n");
    } catch (error) {
      childSpawnError = error;
      log("claude_stdin_error", { threadId: work.threadId, turnId: work.turnId, error: formatError(error) });
    }

    const stream = {
      emitted: "",
      pending: "",
      agentStarted: false,
      resultText: "",
      resultError: null,
      resultSeenAt: 0,
      onResult: null,
      latestUsage: null,
      tools: new Map(),
      toolIndex: new Map(),
      toolDelta: new Map()
    };
    const resultSeen = new Promise((resolve) => {
      stream.onResult = resolve;
    });
    let stderr = "";
    let lastEventAt = Date.now();
    const stdoutRl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity, terminal: false });
    stdoutRl.on("line", (line) => {
      lastEventAt = Date.now();
      this.handleClaudeOutputLine(line, work, stream, child);
    });
    const stderrRl = readline.createInterface({ input: child.stderr, crlfDelay: Infinity, terminal: false });
    stderrRl.on("line", (line) => {
      stderr += line + "\n";
      log("claude_stderr", { threadId: work.threadId, turnId: work.turnId, line: line.slice(0, 500) });
    });

    const idle = setInterval(() => {
      if (Date.now() - lastEventAt > TURN_IDLE_TIMEOUT_MS && !child.killed) {
        log("claude_turn_idle_timeout", { threadId: work.threadId, turnId: work.turnId });
        child.kill("SIGTERM");
      } else if (!child.killed) {
        writeNotification("thread/stream/state", threadStreamState(thread));
      }
    }, 1000);
    const wallTimeoutMs = work.botContext && work.botContext.bridge
      ? Number(work.botContext.bridge.config.maxTurnTimeMs) || TURN_IDLE_TIMEOUT_MS
      : TURN_IDLE_TIMEOUT_MS;
    const wallTimeout = setTimeout(() => {
      work.timedOut = true;
      log("claude_turn_wall_timeout", { threadId: work.threadId, turnId: work.turnId, wallTimeoutMs });
      interruptChildProcess(child);
    }, wallTimeoutMs);
    if (typeof wallTimeout.unref === "function") wallTimeout.unref();

    const childDone = waitForChild(child).then((code) => ({ kind: "exit", code }));
    const resultDone = resultSeen.then(() => sleep(250).then(() => ({ kind: "result", code: 0 })));
    const done = await Promise.race([childDone, resultDone]);
    if (done.kind === "result" && !child.killed) {
      log("claude_turn_finish_after_result", {
        threadId: work.threadId,
        turnId: work.turnId,
        resultSeenAt: stream.resultSeenAt
      });
      try {
        child.kill("SIGTERM");
      } catch {
        // The process may have already exited after emitting result.
      }
    }
    const code = done.code;
    clearInterval(idle);
    clearTimeout(wallTimeout);
    if (work.botStream && work.botStream.timer) clearTimeout(work.botStream.timer);
    stdoutRl.close();
    stderrRl.close();
    this.active.delete(key);
    const text = stream.resultText || stream.emitted || stream.pending;
    turn.agentText = text;
    turn.error = work.cancelRequested
      ? "Turn canceled."
      : work.timedOut
        ? "Turn timed out after " + formatDuration(wallTimeoutMs) + "."
        : stream.resultError || (childSpawnError ? formatError(childSpawnError) : code === 0 ? null : stderr.trim() || "Claude Code exited with code " + code);
    turn.status = work.cancelRequested ? "interrupted" : turn.error ? "failed" : "completed";
    turn.completedAt = nowSeconds();
    turn.durationMs = Date.now() - started;
    turn.toolItems = Array.from(stream.tools.values()).map((tool) => toolItemJson(work.threadId, work.cwd, tool));
    thread.updatedAt = turn.completedAt;
    thread.latestTokenUsageInfo = stream.latestUsage;
    updateClaudeAppLocalAgentSession(thread, {
      lastActivityAt: Date.now(),
      title: thread.name || thread.preview || promptTitle(thread.preview || work.prompt)
    });
    this.persistBotThread(work.threadId);
    if (!stream.agentStarted && text) {
      writeNotification("item/completed", {
        threadId: thread.id,
        turnId: turn.id,
        item: agentItemJson(turn),
        completedAtMs: Date.now()
      });
    }
    writeNotification("turn/completed", { threadId: thread.id, turn: turnJson(turn, false) });
    writeNotification("thread/stream/state", threadStreamState(thread));
    log("claude_turn_exit", { threadId: work.threadId, turnId: work.turnId, code, error: turn.error });
  }

  handleClaudeOutputLine(line, work, stream, child) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    this.rememberClaudeSession(message, work);
    rememberUsage(message, work, stream);
    if (message.type === "control_request") {
      this.handleControlRequest(message, work, child);
      return;
    }
    if (message.type === "stream_event" && message.event) {
      handleClaudeStreamEvent(message.event, work, stream);
      return;
    }
    if (message.type === "assistant" && message.message && message.message.content) {
      handleClaudeContent(message.message.content, work, stream);
      return;
    }
    if (message.type === "user" && message.message && message.message.content) {
      handleClaudeToolResults(message.message.content, work, stream);
      return;
    }
    if (message.type === "result") {
      stream.resultText = stringValue(message.result) || stream.resultText;
      stream.resultError = message.is_error ? stringValue(message.result) || "Claude Code returned an error" : stream.resultError;
      if (!stream.resultSeenAt) {
        stream.resultSeenAt = Date.now();
        if (typeof stream.onResult === "function") stream.onResult(stream.resultSeenAt);
      }
    }
  }

  handleControlRequest(message, work, child) {
    const subtype = stringValue(message.subtype) || stringValue(message.request && (message.request.subtype || message.request.type)) || "";
    if (subtype === "initialize") {
      child.stdin.write(JSON.stringify({ type: "control_response", response: { subtype: "success", request_id: controlRequestId(message), response: {} } }) + "\n");
      return;
    }
    const requestId = controlRequestId(message);
    const method = subtype.toLowerCase().includes("elicitation") ? "mcpServer/elicitation/request" : "item/permissions/requestApproval";
    const params = method === "item/permissions/requestApproval"
      ? permissionRequestParams(work, requestId, message)
      : elicitationRequestParams(work, requestId, message);
    if (work.botContext) {
      this.requestBotControl(work, requestId, method, params).then((approval) => {
        const response = method === "item/permissions/requestApproval"
          ? claudeControlPermissionResponse(message, requestId, approval)
          : claudeControlElicitationResponse(requestId, approval);
        child.stdin.write(JSON.stringify(response) + "\n");
      }).catch((error) => {
        child.stdin.write(JSON.stringify({ type: "control_response", response: { subtype: "error", request_id: requestId, error: formatError(error) } }) + "\n");
      });
      return;
    }
    writeRaw({ id: requestId, method, params });
    waitForAppResponse(this.appResponses, requestId, REQUEST_TIMEOUT_MS).then((approval) => {
      const response = method === "item/permissions/requestApproval"
        ? claudeControlPermissionResponse(message, requestId, approval)
        : claudeControlElicitationResponse(requestId, approval);
      child.stdin.write(JSON.stringify(response) + "\n");
    }).catch((error) => {
      child.stdin.write(JSON.stringify({ type: "control_response", response: { subtype: "error", request_id: requestId, error: formatError(error) } }) + "\n");
    });
  }

  async requestBotControl(work, requestId, method, params) {
    const context = work.botContext;
    const key = context.conversationKey;
    if (method === "item/permissions/requestApproval" && !context.bridge.config.shellEnabled && isShellPermissionRequest(params)) {
      return { decision: "deny", reason: "Agent shell tools are disabled in Bot Settings." };
    }
    if (method === "item/permissions/requestApproval" && this.botSessionApprovals.has(key)) {
      return { decision: "allow", scope: "session" };
    }
    if (this.botPendingApprovals.has(key)) throw new Error("Another Agent request is already waiting for this conversation.");
    const isPermission = method === "item/permissions/requestApproval";
    const label = isPermission ? String(params.reason || "Agent permission") : String(params.message || "Agent input request");
    const fallbackText = isPermission
      ? label + "\nReply /session approve, /session approve session, or /session deny."
      : label + "\nReply /session answer <text> or /session deny.";
    const actions = isPermission
      ? [
          { type: "button", label: "Approve once", value: "/session approve" },
          { type: "button", label: "Approve for session", value: "/session approve session" },
          { type: "button", label: "Deny", value: "/session deny" }
        ]
      : [{ type: "button", label: "Deny", value: "/session deny" }];
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.botPendingApprovals.get(key) && this.botPendingApprovals.get(key).requestId === requestId) {
          this.botPendingApprovals.delete(key);
        }
        reject(new Error("Bot approval timed out."));
      }, Math.min(REQUEST_TIMEOUT_MS, context.bridge.config.maxTurnTimeMs));
      if (typeof timeout.unref === "function") timeout.unref();
      this.botPendingApprovals.set(key, {
        requestId,
        label,
        kind: isPermission ? "permission" : "elicitation",
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject
      });
    });
    await context.bridge.sendCardToEvent(context.event, {
      title: isPermission ? "Agent permission required" : "Agent needs input",
      body: label,
      fields: [
        { label: "Project", value: projectNameFromDirectory(work.cwd) },
        { label: "Session", value: shortSessionId(work.threadId) }
      ],
      actions
    }, fallbackText, "ccr:claude-code:control:" + requestId);
    return promise;
  }
}

function handleClaudeStreamEvent(event, work, stream) {
  const type = event.type;
  if (type === "content_block_start" && event.content_block) {
    const block = event.content_block;
    if (Number.isFinite(event.index) && block.id) stream.toolIndex.set(event.index, block.id);
    handleClaudeContentBlock(block, work, stream);
  } else if (type === "content_block_delta" && event.delta) {
    const delta = event.delta;
    if (delta.type === "text_delta" && typeof delta.text === "string") {
      emitAgentDelta(work, stream, delta.text);
    } else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
      emitReasoningDelta(work, stream, delta.thinking);
    } else if (delta.type === "input_json_delta" && Number.isFinite(event.index) && typeof delta.partial_json === "string") {
      const toolId = stream.toolIndex.get(event.index);
      if (toolId) stream.toolDelta.set(toolId, (stream.toolDelta.get(toolId) || "") + delta.partial_json);
    }
  } else if (type === "content_block_stop" && Number.isFinite(event.index)) {
    const toolId = stream.toolIndex.get(event.index);
    const partial = toolId && stream.toolDelta.get(toolId);
    const tool = toolId && stream.tools.get(toolId);
    if (tool && partial) {
      tool.arguments = parseToolArguments(partial);
      writeNotification("item/updated", { threadId: work.threadId, turnId: work.turnId, item: toolItemJson(work.threadId, work.cwd, tool), updatedAtMs: Date.now() });
    }
  }
}

function handleClaudeContent(content, work, stream) {
  const text = textFromContent(content);
  if (text && !contentContainsToolUse(content)) {
    emitAgentSnapshot(work, stream, text);
  }
  for (const block of asArray(content)) {
    handleClaudeContentBlock(block, work, stream);
  }
}

function handleClaudeToolResults(content, work, stream) {
  for (const block of asArray(content)) {
    if (String(block && block.type || "").includes("tool_result")) {
      const toolId = block.tool_use_id || block.id || "unknown";
      const tool = stream.tools.get(toolId) || { id: toolId, name: "tool", arguments: {}, status: "inProgress", result: "" };
      tool.status = block.is_error ? "failed" : "completed";
      tool.result = textFromContent(block.content) || JSON.stringify(block.content || block);
      stream.tools.set(toolId, tool);
      writeNotification("item/completed", { threadId: work.threadId, turnId: work.turnId, item: toolItemJson(work.threadId, work.cwd, tool), completedAtMs: Date.now() });
    }
  }
}

function claudeSessionIdFromMessage(message) {
  return (
    objectSessionId(message) ||
    objectSessionId(message && message.message) ||
    objectSessionId(message && message.event) ||
    objectSessionId(message && message.result) ||
    objectSessionId(message && message.response) ||
    ""
  );
}

function objectSessionId(value) {
  if (!value || typeof value !== "object") return "";
  return stringValue(value.session_id) || stringValue(value.sessionId);
}

function handleClaudeContentBlock(block, work, stream) {
  const type = block && block.type;
  if (type === "text" && typeof block.text === "string") {
    emitAgentSnapshot(work, stream, block.text);
  } else if ((type === "thinking" || type === "thinking_delta") && typeof (block.thinking || block.text) === "string") {
    emitReasoningDelta(work, stream, block.thinking || block.text);
  } else if (["tool_use", "server_tool_use", "mcp_tool_use"].includes(type)) {
    const id = block.id || uuid();
    const tool = {
      id,
      name: block.name || "tool",
      arguments: block.input || {},
      status: "inProgress",
      result: ""
    };
    stream.tools.set(id, tool);
    queueBotProgress(work, "Using " + tool.name + "…");
    writeNotification("item/started", { threadId: work.threadId, turnId: work.turnId, item: toolItemJson(work.threadId, work.cwd, tool), startedAtMs: Date.now() });
  } else if (String(type || "").includes("tool_result")) {
    handleClaudeToolResults([block], work, stream);
  }
}

function emitAgentDelta(work, stream, text) {
  if (!stream.agentStarted) {
    stream.agentStarted = true;
    writeNotification("item/started", {
      threadId: work.threadId,
      turnId: work.turnId,
      item: { id: work.agentItemId, type: "agentMessage", text: "", status: "inProgress" },
      startedAtMs: Date.now()
    });
  }
  stream.emitted += text;
  queueBotStreamUpdate(work, stream.emitted);
  writeNotification("item/updated", {
    threadId: work.threadId,
    turnId: work.turnId,
    item: { id: work.agentItemId, type: "agentMessage", text: stream.emitted, status: "inProgress" },
    delta: text,
    updatedAtMs: Date.now()
  });
}

function queueBotProgress(work, text) {
  if (!work.botContext || !work.botContext.bridge.config.streamReplies) return;
  const current = work.botStream && work.botStream.pending || "";
  if (!current) queueBotStreamUpdate(work, text);
}

function queueBotStreamUpdate(work, text) {
  if (!work.botContext || !work.botStream || !work.botContext.bridge.config.streamReplies) return;
  work.botStream.pending = String(text || "").slice(-12000);
  const send = () => {
    work.botStream.timer = null;
    const value = work.botStream.pending;
    if (!value) return;
    work.botStream.lastSentAt = Date.now();
    void work.botContext.bridge.sendStreamToEvent(
      work.botContext.event,
      work.botStream.id,
      value,
      false,
      "ccr:claude-code:stream:" + work.botContext.eventId
    ).catch((error) => work.botContext.bridge.logError("stream_failed", error));
  };
  const delay = Math.max(0, 700 - (Date.now() - work.botStream.lastSentAt));
  if (delay === 0) {
    send();
  } else if (!work.botStream.timer) {
    work.botStream.timer = setTimeout(send, delay);
  }
}

function emitAgentSnapshot(work, stream, text) {
  if (!stream.agentStarted && !stream.emitted) {
    stream.pending = text;
    return;
  }
  const delta = text.startsWith(stream.emitted) ? text.slice(stream.emitted.length) : text;
  if (delta) emitAgentDelta(work, stream, delta);
}

function emitReasoningDelta(work, stream, text) {
  const item = { id: "reasoning-" + work.turnId, type: "reasoning", text, status: "inProgress" };
  writeNotification("item/updated", { threadId: work.threadId, turnId: work.turnId, item, delta: text, updatedAtMs: Date.now() });
}

function claudeCommand(work) {
  const command = nonEmptyEnv("CCR_CLAUDE_CODE_BIN") || nonEmptyEnv("CODEXL_CLAUDE_CODE_BIN") || "claude";
  if (work.claudeConfigDir) {
    ensureClaudeSessionConfig(work.claudeConfigDir);
  }
  const args = [
    "--print",
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--verbose",
    "--include-partial-messages"
  ];
  const model = nonEmptyEnv("CCR_CLAUDE_CODE_MODEL") || nonEmptyEnv("CODEXL_CLAUDE_CODE_MODEL") || work.model;
  if (model) args.push("--model", model);
  if (work.reasoningEffort) args.push("--effort", work.reasoningEffort);
  if (work.permissionMode) args.push("--permission-mode", work.permissionMode);
  if (work.resumeExisting && work.claudeSessionId) args.push("--resume", work.claudeSessionId);
  const extra = splitShellLike(nonEmptyEnv("CCR_CLAUDE_CODE_EXTRA_ARGS") || nonEmptyEnv("CODEXL_CLAUDE_CODE_EXTRA_ARGS") || "");
  args.push(...extra);
  const settingsEnv = work.claudeConfigDir ? claudeSettingsEnv(work.claudeConfigDir) : {};
  const env = withoutKeys({
    ...process.env,
    ...settingsEnv,
    ...claudeCodeUtcTimezoneEnvOverride(),
    CODEX_SESSION_ID: work.threadId,
    CODEX_THREAD_ID: work.threadId,
    CODEX_TURN_ID: work.turnId
  }, ["CCR_CLAUDE_CODE_BOT_WORKER", "ELECTRON_RUN_AS_NODE"]);
  if (work.claudeConfigDir) {
    env.CLAUDE_CONFIG_DIR = work.claudeConfigDir;
  }
  return {
    command,
    args: claudeCodeArgsWithMcpConfig(args, env),
    env
  };
}

function claudeInputMessage(input, sessionId = "") {
  return {
    type: "user",
    session_id: sessionId || "",
    message: { role: "user", content: claudeContentFromInput(input) },
    parent_tool_use_id: null
  };
}

function claudeContentFromInput(input) {
  const items = Array.isArray(input) ? input : [input];
  const content = [];
  for (const item of items) {
    if (typeof item === "string") {
      content.push({ type: "text", text: item });
    } else if (item && item.type === "text" && typeof item.text === "string") {
      content.push({ type: "text", text: item.text });
    } else if (item && (item.type === "image" || item.type === "localImage")) {
      const image = imageContent(item);
      content.push(image || { type: "text", text: promptTextForItem(item) });
    } else if (item) {
      content.push({ type: "text", text: promptTextForItem(item) });
    }
  }
  return content.length ? content : [{ type: "text", text: "" }];
}

function imageContent(item) {
  const url = item.url || item.uri || item.href || item.src;
  if (url) return { type: "image", source: { type: "url", url } };
  const filePath = item.path || item.filePath || item.file_path;
  const data = item.data || item.dataBase64 || item.base64 || (filePath && safeReadBase64(filePath));
  if (!data) return undefined;
  return { type: "image", source: { type: "base64", media_type: item.mimeType || item.mediaType || mimeTypeForPath(filePath), data } };
}

function isClaudeOwnedMethod(method) {
  return [
    "initialize", "thread/start", "thread/resume", "thread/read", "thread/list", "thread/search", "thread/loaded/list",
    "thread/turns/list", "turn/list", "thread/turns/items/list", "thread/archive", "thread/unarchive", "thread/unsubscribe",
    "thread/name/set", "thread/metadata/update", "thread/pin", "thread/unpin", "thread/pinned/list", "thread/pins/list",
    "thread/memoryMode/get", "thread/memoryMode/set", "thread/memoryMode/clear", "thread/memory/get", "thread/memory/set",
    "thread/memory/clear", "thread/prewarm", "thread/prewarm/start", "thread/prewarm/clear", "thread/prewarm/clearAll",
    "thread/goal/get", "thread/goal/set", "thread/goal/clear", "turn/start", "turn/interrupt", "turn/steer",
    "account/read", "getAuthStatus", "config/read", "config/value/write", "config/batchWrite", "model/list",
    "modelProvider/capabilities/read", "permissionProfile/list", "skills/list", "plugin/list", "app/list", "mcpServerStatus/list",
    "experimentalFeature/list", "hooks/list", "collaborationMode/list", "configRequirements/read", "config/mcpServer/reload", "memory/reset"
  ].includes(method);
}

function standaloneCodexAppResult(method, params) {
  if (method === "fs/readFile") {
    const file = String(params.path || "");
    return { dataBase64: safeReadBase64(file) || "" };
  }
  if (["extension/list", "extensions/list", "skills/list", "plugin/list", "app/list", "mcpServerStatus/list", "permissionProfile/list", "experimentalFeature/list"].includes(method)) {
    return { data: [], marketplaces: method === "plugin/list" ? [] : undefined, nextCursor: null };
  }
  if (method === "hooks/list") return { data: [] };
  if (method === "collaborationMode/list") return collaborationModes();
  if (method === "model/list") return modelList(params);
  if (method === "modelProvider/capabilities/read") return { namespaceTools: false, imageGeneration: false, webSearch: false };
  if (method === "configRequirements/read") return { requirements: null };
  if (method === "remoteControl/status/read") return { enabled: false, status: "unavailable" };
  if (method === "config/value/write" || method === "config/batchWrite") return configWriteResponse(params);
  if (method.startsWith("plugin/") || method.startsWith("marketplace/") || method.startsWith("mcpServer/") || method === "memory/reset" || method === "config/mcpServer/reload") return {};
  return undefined;
}

function threadJson(thread, includeTurns) {
  return {
    id: thread.id,
    threadId: thread.id,
    conversationId: thread.id,
    sessionId: thread.sessionId,
    claudeSessionId: thread.claudeSessionId,
    path: thread.path,
    preview: thread.preview,
    cwd: thread.cwd,
    gitInfo: thread.gitInfo,
    workspaceKind: thread.workspaceKind,
    workspaceRoots: thread.workspaceRoots,
    workspaceBrowserRoot: thread.workspaceBrowserRoot,
    projectlessOutputDirectory: thread.projectlessOutputDirectory,
    model: thread.model,
    reasoningEffort: thread.reasoningEffort,
    serviceTier: thread.serviceTier,
    collaborationMode: thread.collaborationMode,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    archived: thread.archived,
    name: thread.name,
    title: thread.name || thread.preview || "Claude Code",
    approvalPolicy: thread.approvalPolicy,
    approvalsReviewer: thread.approvalsReviewer,
    latestTokenUsageInfo: thread.latestTokenUsageInfo,
    turns: includeTurns ? thread.turns.map((turn) => turnJson(turn, true)) : []
  };
}

function turnJson(turn, includeItems) {
  return {
    id: turn.id,
    turnId: turn.id,
    status: turn.status,
    input: turn.input,
    items: includeItems ? turnItems(turn) : [],
    agentText: turn.agentText,
    error: turn.error,
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    durationMs: turn.durationMs,
    approvalPolicy: turn.approvalPolicy,
    approvalsReviewer: turn.approvalsReviewer,
    reasoningEffort: turn.reasoningEffort,
    serviceTier: turn.serviceTier,
    collaborationMode: turn.collaborationMode
  };
}

function turnItems(turn) {
  const items = [userItemJson(turn)];
  items.push(...turn.toolItems);
  if (turn.agentText) items.push(agentItemJson(turn));
  return items;
}

function userItemJson(turn) {
  return { id: "user-" + turn.id, type: "userMessage", input: turn.input, status: "completed" };
}

function agentItemJson(turn) {
  return { id: agentItemIdForTurn(turn.id), type: "agentMessage", text: turn.agentText, status: turn.status === "completed" ? "completed" : turn.status };
}

function toolItemJson(threadId, cwd, tool) {
  return {
    id: tool.id,
    type: "mcpToolCall",
    name: tool.name,
    toolName: tool.name,
    input: tool.arguments || {},
    arguments: tool.arguments || {},
    result: tool.result || null,
    status: tool.status || "inProgress",
    threadId,
    cwd
  };
}

function threadRuntimeResponse(thread, includeTurns) {
  return { thread: threadJson(thread, includeTurns), conversationId: thread.id, threadId: thread.id };
}

function threadStreamState(thread) {
  return { threadId: thread.id, thread: threadJson(thread, true), state: "loaded" };
}

function applyThreadMetadata(thread, params) {
  if (typeof params.cwd === "string" && params.cwd.trim()) thread.cwd = normalizeCwd(params.cwd);
  if (typeof params.model === "string" && params.model.trim()) thread.model = params.model.trim();
  if (params.reasoningEffort !== undefined) thread.reasoningEffort = params.reasoningEffort;
  if (params.serviceTier !== undefined) thread.serviceTier = params.serviceTier;
  if (params.collaborationMode !== undefined) thread.collaborationMode = params.collaborationMode;
  if (params.approvalPolicy) thread.approvalPolicy = params.approvalPolicy;
  if (params.approvalsReviewer) thread.approvalsReviewer = params.approvalsReviewer;
  if (params.name !== undefined || params.title !== undefined) thread.name = params.name || params.title || null;
  thread.updatedAt = nowSeconds();
}

function requiredThreadId(params) {
  return params.threadId || params.thread_id || params.conversationId || params.conversation_id;
}

function promptFromInput(input, params) {
  const parts = [];
  for (const item of input) {
    const text = promptTextForItem(item);
    if (text) parts.push(text);
  }
  if (params.prompt) parts.push(String(params.prompt));
  return parts.join("\n\n").trim() || JSON.stringify(input);
}

function promptTextForItem(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  if (typeof item.text === "string") return item.text;
  if (typeof item.content === "string") return item.content;
  if (item.type === "mention") return "@" + (item.name || item.path || "mention");
  try {
    return JSON.stringify(item);
  } catch {
    return String(item);
  }
}

function collaborationModes() {
  return { data: [
    { mode: "plan", model: DEFAULT_MODEL, reasoning_effort: null },
    { mode: "default", model: DEFAULT_MODEL, reasoning_effort: null }
  ] };
}

function modelList(params, existingResult) {
  const runtimeAgent = codexRuntimeAgent();
  const isClaudeCodeRuntime = normalizeRemoteFrontendMode(agentEnv(runtimeAgent, "REMOTE_FRONTEND_MODE", "CORE_MODE")) === "claude-code";
  const configured = normalizeModelSelector(agentEnv(runtimeAgent, "MODEL") || nonEmptyEnv("CODEXL_CLAUDE_CODE_MODEL"));
  const selected = configured || (isClaudeCodeRuntime ? DEFAULT_MODEL : "");
  const fallbackIds = isClaudeCodeRuntime
    ? [configured].filter(Boolean)
    : [configured].filter((model) => model && !isClaudeCodeOnlyModel(model));
  const models = mergeModelListItems(extractModelListItems(existingResult), [...catalogModelIds(), ...fallbackIds], selected);
  const offset = Number(params.cursor || 0) || 0;
  const limit = Number(params.limit || models.length) || models.length;
  const data = models.slice(offset, offset + limit);
  return {
    ...(existingResult && typeof existingResult === "object" && !Array.isArray(existingResult) ? existingResult : {}),
    data,
    models: data,
    nextCursor: offset + limit < models.length ? String(offset + limit) : null
  };
}

function catalogModelIds() {
  const values = parseModelCatalogEnv();
  return values.map(normalizeModelSelector).filter(Boolean);
}

function parseModelCatalogEnv() {
  const file = modelCatalogFileEnv();
  if (file) {
    const parsed = readJsonFile(file);
    if (parsed) {
      return modelIdsFromJson(parsed);
    }
    log("model_catalog_parse_error", { source: "file", file });
  }
  const encoded = agentEnv(codexRuntimeAgent(), "MODEL_CATALOG_B64");
  if (encoded) {
    try {
      return modelIdsFromJson(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")));
    } catch (error) {
      log("model_catalog_parse_error", { source: "base64", error: formatError(error) });
    }
  }
  const raw = agentEnv(codexRuntimeAgent(), "MODEL_CATALOG");
  if (raw) {
    try {
      return modelIdsFromJson(JSON.parse(raw));
    } catch (error) {
      log("model_catalog_parse_error", { source: "json", error: formatError(error) });
    }
  }
  return [];
}

function modelIdsFromJson(value) {
  const output = [];
  collectModelIdsFromJson(value, output);
  return output;
}

function collectModelIdsFromJson(value, output) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectModelIdFromJsonItem(item, output);
    }
    return;
  }
  if (value && typeof value === "object") {
    let foundList = false;
    for (const key of ["models", "data", "items", "results", "model_list"]) {
      if (Array.isArray(value[key])) {
        foundList = true;
        collectModelIdsFromJson(value[key], output);
      }
    }
    if (!foundList) {
      collectModelIdFromJsonItem(value, output);
    }
  }
}

function collectModelIdFromJsonItem(item, output) {
  if (typeof item === "string") {
    output.push(item);
    return;
  }
  if (item && typeof item === "object") {
    const id = firstString(item, ["/model", "/id", "/slug", "/display_name", "/displayName", "/name", "/label"]);
    if (id) output.push(id);
  }
}

function mergeModelListItems(existingItems, catalogIds, selectedModel) {
  const seen = new Set();
  const output = [];
  for (const item of existingItems) {
    const id = normalizeModelSelector(modelItemId(item));
    if (!id || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    output.push(typeof item === "object" && item !== null ? { ...item, id: item.id || id, model: item.model || id } : codexModelItem(id, selectedModel));
  }
  for (const rawId of catalogIds) {
    const id = normalizeModelSelector(rawId);
    if (!id || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    output.push(codexModelItem(id, selectedModel));
  }
  return output;
}

function extractModelListItems(result) {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== "object") return [];
  for (const key of ["models", "data", "items"]) {
    if (Array.isArray(result[key])) return result[key];
  }
  return [];
}

function modelItemId(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  return firstString(item, ["/model", "/id", "/slug", "/name", "/label"]) || "";
}

function codexModelItem(model, selectedModel) {
  const provider = modelProviderFromSelector(model) || agentEnv(codexRuntimeAgent(), "MODEL_PROVIDER") || "claude-code-router";
  const displayName = modelDisplayName(model);
  return {
    id: model,
    model,
    name: model,
    label: model,
    provider,
    providerName: provider,
    modelProvider: provider,
    displayName,
    description: "CCR model",
    hidden: false,
    isDefault: model === selectedModel,
    contextWindow: 0,
    inputModalities: ["text", "image"],
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    supportsPersonality: false,
    additionalSpeedTiers: [],
    serviceTiers: [],
    defaultServiceTier: null,
    upgrade: null,
    upgradeInfo: null,
    availabilityNux: null
  };
}

function normalizeModelSelector(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? provider + "/" + model : "";
  }
  return trimmed;
}

function modelProviderFromSelector(model) {
  const slashIndex = model.indexOf("/");
  return slashIndex > 0 && slashIndex < model.length - 1 ? model.slice(0, slashIndex) : "";
}

function modelDisplayName(model) {
  const slashIndex = model.indexOf("/");
  return slashIndex > 0 && slashIndex < model.length - 1 ? model.slice(slashIndex + 1) : model;
}

function isClaudeCodeOnlyModel(model) {
  const normalized = String(model || "").trim().toLowerCase();
  return normalized === DEFAULT_MODEL ||
    normalized === "claude-opus-4-5" ||
    normalized === "claude-haiku-4-5";
}

function configRead(params, values) {
  const cwd = params.cwd || process.cwd();
  const runtimeAgent = codexRuntimeAgent();
  return {
    config: {
      ...values,
      cwd,
      model: agentEnv(runtimeAgent, "MODEL") || DEFAULT_MODEL,
      model_catalog_json: JSON.stringify(modelCatalogConfigValue()),
      model_provider: agentEnv(runtimeAgent, "MODEL_PROVIDER") || "claude-code",
      approval_policy: "default"
      // sandbox_mode intentionally omitted: let Codex read it from its own
      // config.toml (e.g. [windows] sandbox) instead of forcing workspace-write.
      // Forcing workspace-write triggers codex-windows-sandbox-setup.exe on every
      // command, which fails on systems where the COM+ catalog is unavailable
      // (see openai/codex#29332), surfacing as repeated error dialogs.
    }
  };
}

function modelCatalogConfigValue() {
  const file = modelCatalogFileEnv();
  if (file) {
    const parsed = readJsonFile(file);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    log("model_catalog_parse_error", { source: "file-config", file });
  }
  const encoded = agentEnv(codexRuntimeAgent(), "MODEL_CATALOG_B64");
  if (encoded) {
    try {
      const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      if (parsed && typeof parsed === "object") return parsed;
    } catch (error) {
      log("model_catalog_parse_error", { source: "base64-config", error: formatError(error) });
    }
  }
  return { models: catalogModelIds().map((model, index) => modelCatalogConfigItem(model, index)) };
}

function modelCatalogFileEnv() {
  const runtimeAgent = codexRuntimeAgent();
  return agentEnv(runtimeAgent, "MODEL_CATALOG_FILE") ||
    agentEnv(runtimeAgent, "MODEL_CATALOG_PATH");
}

function modelCatalogConfigItem(model, priority) {
  return {
    slug: model,
    display_name: model,
    description: "CCR gateway model " + model,
    default_reasoning_level: null,
    supported_reasoning_levels: [],
    shell_type: "shell_command",
    visibility: "list",
    supported_in_api: true,
    priority,
    additional_speed_tiers: [],
    service_tiers: [],
    availability_nux: null,
    upgrade: null,
    base_instructions: "You are Codex, a coding agent.",
    supports_reasoning_summaries: false,
    default_reasoning_summary: "none",
    support_verbosity: true,
    default_verbosity: "low",
    apply_patch_tool_type: null,
    web_search_tool_type: "text",
    truncation_policy: { mode: "tokens", limit: 10000 },
    supports_parallel_tool_calls: false,
    supports_image_detail_original: false,
    context_window: 128000,
    max_context_window: 128000,
    effective_context_window_percent: 95,
    experimental_supported_tools: [],
    input_modalities: ["text"],
    supports_search_tool: false
  };
}

function applyConfigWrite(method, params, values) {
  if (method === "config/value/write" && params.key) values[params.key] = params.value;
  const entries = Array.isArray(params.values) ? params.values : Array.isArray(params.items) ? params.items : [];
  for (const entry of entries) {
    if (entry && entry.key) values[entry.key] = entry.value;
  }
}

function configWriteResponse(params) {
  return { config: params.config || null, ok: true };
}

function loadChatGptAuth() {
  const workspaceName = nonEmptyEnv("CCR_CODEX_WORKSPACE_NAME") ||
    nonEmptyEnv("CODEXL_CODEX_WORKSPACE_NAME") ||
    nonEmptyEnv("CODEXL_CODEX_INSTANCE_NAME") ||
    agentEnv("codex", "PROFILE");
  const fallback = {
    authToken: "",
    email: "",
    planType: "",
    workspaceName
  };
  const value = readJsonFile(path.join(codexRuntimeHome(), "auth.json"));
  if (!value || !isPlainObject(value)) return fallback;
  if (typeof value.auth_mode === "string" && value.auth_mode !== "chatgpt") return fallback;
  if (!isPlainObject(value.tokens)) return fallback;

  const authToken = stringValue(value.tokens.access_token);
  const idToken = stringValue(value.tokens.id_token);
  const claims = jwtPayloadClaims(authToken) || jwtPayloadClaims(idToken) || {};
  const profileClaims = isPlainObject(claims["https://api.openai.com/profile"])
    ? claims["https://api.openai.com/profile"]
    : {};
  const authClaims = isPlainObject(claims["https://api.openai.com/auth"])
    ? claims["https://api.openai.com/auth"]
    : {};
  return {
    authToken,
    email: stringValue(profileClaims.email) || stringValue(claims.email) || stringValue(value.email),
    planType: stringValue(authClaims.chatgpt_plan_type) || stringValue(claims.chatgpt_plan_type),
    workspaceName
  };
}

function jwtPayloadClaims(token) {
  if (!token) return undefined;
  const payload = String(token).split(".")[1];
  if (!payload) return undefined;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const value = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return isPlainObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function codexAppAccountRead(auth) {
  return {
    account: {
      type: "chatgpt",
      email: auth.email || auth.workspaceName || "codex",
      planType: auth.planType || "unknown"
    },
    requiresOpenaiAuth: true
  };
}

function codexAppAuthStatus(auth, includeToken) {
  const result = {
    authMethod: "chatgpt",
    requiresOpenaiAuth: true
  };
  if (includeToken) result.authToken = auth.authToken || null;
  return result;
}

function mockAccountRead() {
  return {
    account: { type: "amazonBedrock", credentialSource: "codexManaged" },
    requiresOpenaiAuth: false
  };
}

function mockAuthStatus(includeToken) {
  const result = { authMethod: "amazonBedrock", authToken: null, requiresOpenaiAuth: false };
  if (includeToken) result.authToken = "ccr-local-profile";
  return result;
}

function mergeForeignThreadList(value, _params) {
  return value;
}

function rememberUsage(message, work, stream) {
  const usage = message.usage || (message.message && message.message.usage);
  if (!usage) return;
  stream.latestUsage = { model: work.model || DEFAULT_MODEL, usage };
  writeNotification("thread/tokenUsage/updated", {
    threadId: work.threadId,
    conversationId: work.threadId,
    latestTokenUsageInfo: stream.latestUsage
  });
}

function permissionRequestParams(work, requestId, message) {
  const toolName = firstString(message, ["/request/tool_name", "/request/toolName", "/request/name", "/tool_name", "/toolName", "/name"]) || "tool";
  const serverName = firstString(message, ["/request/server_name", "/request/serverName", "/params/serverName"]);
  const label = serverName ? serverName + "/" + toolName : toolName;
  return {
    threadId: work.threadId,
    turnId: work.turnId,
    itemId: firstString(message, ["/request/tool_use_id", "/request/toolUseId", "/params/tool_use_id"]) || requestId,
    toolName,
    cwd: work.cwd,
    reason: "Claude Code wants to use " + label + ".",
    permissions: { network: { enabled: true }, fileSystem: { read: [work.cwd], write: [work.cwd] } }
  };
}

function isShellPermissionRequest(params) {
  const name = String(params && params.toolName || "").trim().toLowerCase();
  return ["bash", "shell", "shell_command", "terminal", "execute_command", "run_command"].includes(name);
}

function elicitationRequestParams(work, requestId, message) {
  return {
    threadId: work.threadId,
    turnId: work.turnId,
    itemId: requestId,
    mode: firstString(message, ["/request/mode", "/params/mode"]) || "form",
    message: firstString(message, ["/request/message", "/params/message", "/message"]) || "Codex requests input from an MCP server.",
    requestedSchema: pointer(message, "/request/requestedSchema") || pointer(message, "/params/requestedSchema") || { type: "object", properties: {} }
  };
}

function claudeControlPermissionResponse(message, requestId, approval) {
  const allows = permissionResponseAllows(approval);
  const response = allows
    ? { behavior: "allow", updatedInput: pointer(message, "/request/input") || pointer(message, "/params/input") || {} }
    : { behavior: "deny", message: "Denied in ChatGPT" };
  const toolUseId = firstString(message, ["/request/tool_use_id", "/request/toolUseId", "/params/tool_use_id"]);
  if (toolUseId) response.toolUseID = toolUseId;
  return { type: "control_response", response: { subtype: "success", request_id: requestId, response } };
}

function claudeControlElicitationResponse(requestId, value) {
  return { type: "control_response", response: { subtype: "success", request_id: requestId, response: value || {} } };
}

async function waitForAppResponse(map, requestId, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (map.has(requestId)) {
      const value = map.get(requestId);
      map.delete(requestId);
      return value;
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for ChatGPT response: " + requestId);
}

function permissionResponseAllows(value) {
  if (!value) return false;
  if (value.approved === true || value.allow === true || value.allowed === true || value.decision === "allow") return true;
  if (value.approved === false || value.allow === false || value.allowed === false || value.decision === "deny") return false;
  if (typeof value === "boolean") return value;
  return Boolean(value);
}

function writeResponse(id, result) {
  writeRaw({ id, result });
}

function writeError(id, code, message) {
  writeRaw({ id, error: { code, message } });
}

function writeNotification(method, params) {
  writeRaw({ method, params });
}

function writeRaw(value) {
  botBridge().handleJsonRpcValue(value);
  writeLine(process.stdout, value);
}

function writeLine(stream, value) {
  stream.write(JSON.stringify(value) + "\n");
}

function createRemoteSyncClient(options) {
  const endpoint = normalizeRemoteSyncEndpoint(nonEmptyEnv("CCR_REMOTE_SYNC_ENDPOINT"));
  const enabled = endpoint && !["0", "false", "no", "off"].includes(String(process.env.CCR_REMOTE_SYNC_ENABLED || "1").trim().toLowerCase());
  if (!enabled || typeof fetch !== "function") {
    return {
      postEvent: async () => {},
      start() {},
      stop() {}
    };
  }
  return new RemoteSyncClient({
    args: options.args || [],
    cwd: options.cwd || process.cwd(),
    endpoint,
    mode: options.mode || "agent",
    title: options.title || "CCR Remote",
    profileId: nonEmptyEnv("CCR_REMOTE_SYNC_PROFILE_ID"),
    profileName: nonEmptyEnv("CCR_REMOTE_SYNC_PROFILE_NAME")
  });
}

class RemoteSyncClient {
  constructor(options) {
    this.options = options;
    this.active = false;
    this.apiKey = "";
    this.lastInboundSeq = 0;
    this.pollTimer = null;
    this.ready = null;
    this.seenInbound = new Set();
    this.sessionId = nonEmptyEnv("CCR_REMOTE_SYNC_SESSION_ID") || "ccr-" + safePathSegment(options.profileId || options.profileName || options.mode) + "-" + uuid();
  }

  start(onInbound) {
    if (this.active) return;
    this.active = true;
    this.ready = this.open().catch((error) => {
      this.active = false;
      log("remote_sync_start_failed", { error: formatError(error) });
    });
    this.ready.then(() => {
      if (this.active) this.pollInbound(onInbound);
    }).catch(() => {});
  }

  stop() {
    this.active = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async open() {
    this.apiKey = await readRemoteSyncApiKey();
    const response = await this.request("POST", "/sessions", {
      id: this.sessionId,
      title: this.options.title,
      metadata: {
        args: this.options.args,
        cwd: this.options.cwd,
        mode: this.options.mode,
        pid: process.pid,
        profileId: this.options.profileId,
        profileName: this.options.profileName,
        startedAt: new Date().toISOString()
      }
    });
    const session = response && response.session;
    if (session && session.id) this.sessionId = session.id;
    log("remote_sync_started", { sessionId: this.sessionId, endpoint: this.options.endpoint });
  }

  postEvent(type, payload, options) {
    if (!this.active) return Promise.resolve();
    const eventOptions = options || {};
    return Promise.resolve(this.ready)
      .then(() => {
        if (!this.active || !this.sessionId) return undefined;
        return this.request("POST", "/sessions/" + encodeURIComponent(this.sessionId) + "/events", {
          direction: eventOptions.direction || "local",
          payload: payload || {},
          source: "ccr-claude-wrapper",
          text: eventOptions.text,
          type
        });
      })
      .catch((error) => {
        log("remote_sync_event_failed", { type, error: formatError(error) });
      });
  }

  pollInbound(onInbound) {
    if (!this.active) return;
    this.request("GET", "/sessions/" + encodeURIComponent(this.sessionId) + "/inbound?after=" + this.lastInboundSeq)
      .then((response) => {
        const events = Array.isArray(response && response.events) ? response.events : [];
        for (const event of events) {
          if (!event || !Number.isFinite(event.seq)) continue;
          this.lastInboundSeq = Math.max(this.lastInboundSeq, event.seq);
          const key = event.id || event.dedupeKey || String(event.seq);
          if (this.seenInbound.has(key)) continue;
          this.seenInbound.add(key);
          while (this.seenInbound.size > 500) {
            const oldest = this.seenInbound.values().next().value;
            if (!oldest) break;
            this.seenInbound.delete(oldest);
          }
          try {
            onInbound(event);
          } catch (error) {
            log("remote_sync_inbound_handler_failed", { error: formatError(error) });
          }
        }
      })
      .catch((error) => {
        log("remote_sync_poll_failed", { error: formatError(error) });
      })
      .finally(() => {
        if (!this.active) return;
        this.pollTimer = setTimeout(() => this.pollInbound(onInbound), numberEnv("CCR_REMOTE_SYNC_POLL_INTERVAL_MS", 2000));
      });
  }

  async request(method, suffix, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), numberEnv("CCR_REMOTE_SYNC_REQUEST_TIMEOUT_MS", 5000));
    const headers = { "accept": "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.apiKey) headers.authorization = "Bearer " + this.apiKey;
    try {
      const response = await fetch(remoteSyncUrl(this.options.endpoint, suffix), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error("HTTP " + response.status + " from CCR remote sync");
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readRemoteSyncApiKey() {
  const direct = nonEmptyEnv("CCR_REMOTE_SYNC_API_KEY");
  if (direct) return direct;
  const helper = nonEmptyEnv("CCR_REMOTE_SYNC_API_KEY_HELPER");
  if (!helper) return "";
  return new Promise((resolve) => {
    childProcess.execFile(expandHome(helper), {
      shell: process.platform === "win32",
      timeout: 3000,
      windowsHide: true
    }, (error, stdout) => {
      if (error) {
        log("remote_sync_api_key_helper_failed", { error: formatError(error) });
        resolve("");
        return;
      }
      resolve(String(stdout || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "");
    });
  });
}

function normalizeRemoteSyncEndpoint(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  return trimmed || "";
}

function remoteSyncUrl(endpoint, suffix) {
  return endpoint + (String(suffix || "").startsWith("/") ? suffix : "/" + suffix);
}

function remoteEventText(event) {
  if (!event || typeof event !== "object") return "";
  if (typeof event.text === "string" && event.text.trim()) return event.text.trim();
  const payload = event.payload;
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (payload && typeof payload === "object") {
    if (typeof payload.text === "string" && payload.text.trim()) return payload.text.trim();
    if (typeof payload.content === "string" && payload.content.trim()) return payload.content.trim();
    if (typeof payload.message === "string" && payload.message.trim()) return payload.message.trim();
  }
  return "";
}

function createBotGatewayBridge() {
  const config = readBotGatewayBridgeConfig();
  if (!config.enabled) {
    return {
      handleClaudeCliLine() {},
      handleJsonRpcLine() {},
      handleJsonRpcValue() {},
      sendReplyToEvent: async () => {},
      setInboundHandler() {},
      stop: async () => {},
      suppressTurn() {},
      unsuppressTurn() {}
    };
  }
  const bridge = new BotGatewayBridge(config);
  process.once("exit", () => bridge.stop());
  return bridge;
}

function readBotGatewayBridgeConfig() {
  const enabled = boolEnv("CCR_BOT_GATEWAY_ENABLED") || boolEnv("CODEXL_BOT_GATEWAY_ENABLED");
  const platform = normalizeBotGatewayPlatform(nonEmptyEnv("CCR_BOT_GATEWAY_PLATFORM") || nonEmptyEnv("CODEXL_BOT_GATEWAY_PLATFORM") || "none");
  const handoffEnabled = boolEnv("CCR_BOT_HANDOFF_ENABLED") || boolEnv("CODEXL_BOT_HANDOFF_ENABLED");
  return {
    acknowledgeEvents: boolEnv("CCR_BOT_GATEWAY_ACK_EVENTS"),
    args: jsonArrayEnv("CCR_BOT_GATEWAY_ARGS_JSON"),
    authType: normalizeBotGatewayAuthType(platform, nonEmptyEnv("CCR_BOT_GATEWAY_AUTH_TYPE") || ""),
    autoStartIntegration: boolEnv("CCR_BOT_GATEWAY_AUTO_START_INTEGRATION"),
    command: nonEmptyEnv("CCR_BOT_GATEWAY_COMMAND") || "",
    conversationRef: jsonObjectEnv("CCR_BOT_GATEWAY_CONVERSATION_REF_JSON"),
    createIntegration: boolEnv("CCR_BOT_GATEWAY_CREATE_INTEGRATION"),
    credentials: sanitizeBotGatewayRecord(jsonObjectEnv("CCR_BOT_GATEWAY_CREDENTIALS_JSON") || {}),
    cwd: nonEmptyEnv("CCR_BOT_GATEWAY_CWD") || "",
    enabled: enabled && platform !== "none",
    forwardAllAgentMessages: boolEnv("CCR_BOT_GATEWAY_FORWARD_ALL_AGENT_MESSAGES") || boolEnv("CODEXL_BOT_GATEWAY_FORWARD_ALL_CODEX_MESSAGES"),
    handoff: {
      enabled: handoffEnabled,
      idleSeconds: numberEnv("CCR_BOT_HANDOFF_IDLE_SECONDS", numberEnv("CODEXL_BOT_HANDOFF_IDLE_SECONDS", 30)),
      phoneBluetoothTargets: listEnv("CCR_BOT_HANDOFF_PHONE_BLUETOOTH_TARGETS") || listEnv("CODEXL_BOT_HANDOFF_PHONE_BLUETOOTH_TARGETS"),
      phoneWifiTargets: listEnv("CCR_BOT_HANDOFF_PHONE_WIFI_TARGETS") || listEnv("CODEXL_BOT_HANDOFF_PHONE_WIFI_TARGETS"),
      screenLock: boolEnv("CCR_BOT_HANDOFF_SCREEN_LOCK") || boolEnv("CODEXL_BOT_HANDOFF_SCREEN_LOCK"),
      userIdle: boolEnv("CCR_BOT_HANDOFF_USER_IDLE") || boolEnv("CODEXL_BOT_HANDOFF_USER_IDLE")
    },
    integrationConfig: websocketBotGatewayIntegrationConfig(platform, jsonObjectEnv("CCR_BOT_GATEWAY_CONFIG_JSON") || {}),
    integrationId: nonEmptyEnv("CCR_BOT_GATEWAY_INTEGRATION_ID") || nonEmptyEnv("CODEXL_BOT_GATEWAY_INTEGRATION_ID") || "",
    language: normalizeBotLanguage(nonEmptyEnv("CCR_BOT_GATEWAY_LANGUAGE") || "auto"),
    maxAttachmentBytes: numberEnv("CCR_BOT_GATEWAY_MAX_ATTACHMENT_BYTES", 20 * 1024 * 1024),
    maxTurnTimeMs: numberEnv("CCR_BOT_GATEWAY_MAX_TURN_TIME_MS", 10 * 60 * 1000),
    mediaEnabled: boolEnv("CCR_BOT_GATEWAY_MEDIA_ENABLED"),
    messageChunkChars: numberEnv("CCR_BOT_GATEWAY_MESSAGE_CHUNK_CHARS", 3500),
    platform,
    pollIntervalMs: numberEnv("CCR_BOT_GATEWAY_POLL_INTERVAL_MS", 2000),
    profileId: nonEmptyEnv("CCR_BOT_PROFILE_ID") || agentEnv(codexRuntimeAgent(), "PROFILE") || "default",
    profileName: nonEmptyEnv("CCR_BOT_PROFILE_NAME") || agentEnv(codexRuntimeAgent(), "WORKSPACE_NAME") || "CCR",
    requestTimeoutMs: numberEnv("CCR_BOT_GATEWAY_REQUEST_TIMEOUT_MS", 600000),
    sessionIdleMinutes: numberEnv("CCR_BOT_GATEWAY_SESSION_IDLE_MINUTES", 0),
    shellEnabled: boolEnv("CCR_BOT_GATEWAY_SHELL_ENABLED"),
    sourceDir: nonEmptyEnv("CCR_BOT_GATEWAY_SOURCE_DIR") || "",
    startupTimeoutMs: numberEnv("CCR_BOT_GATEWAY_STARTUP_TIMEOUT_MS", 10000),
    stateDir: nonEmptyEnv("CCR_BOT_GATEWAY_STATE_DIR") || nonEmptyEnv("CODEXL_BOT_GATEWAY_STATE_DIR") || nonEmptyEnv("BOT_GATEWAY_STATE_DIR") || "",
    streamReplies: boolEnv("CCR_BOT_GATEWAY_STREAM_REPLIES"),
    tenantId: nonEmptyEnv("CCR_BOT_GATEWAY_TENANT_ID") || nonEmptyEnv("CODEXL_BOT_GATEWAY_TENANT_ID") || "ccr"
  };
}

function normalizeBotLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh_cn") return "zh-CN";
  if (normalized === "en" || normalized === "en-us" || normalized === "en_us") return "en";
  return "auto";
}

function normalizeBotGatewayPlatform(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "off" || normalized === "disabled") return "none";
  if (normalized === "lark") return "feishu";
  if (normalized === "dingding") return "dingtalk";
  if (["wechat", "weixin", "wx", "weixin-ilink", "weixin_ilink", "ilink"].includes(normalized)) return "weixin-ilink";
  if (["wecom", "wework", "wechat-work", "work-weixin", "enterprise-wechat"].includes(normalized)) return "wecom";
  return normalized;
}

function normalizeBotGatewayAuthType(platform, value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  if (!platform || platform === "none") return "";
  if (!normalized || normalized === "default" || normalized === "auto" || normalized === "webhook" || normalized === "webhook_secret" || normalized === "outgoing_webhook") {
    return defaultBotGatewayAuthType(platform);
  }
  if (normalized === "appsecret") return "app_secret";
  if (normalized === "bottoken" || normalized === "token") return "bot_token";
  if (normalized === "oauth" || normalized === "oauth_2") return "oauth2";
  if (["qr", "qr_login", "qrcode", "qr_code"].includes(normalized)) return "qr_login";
  return normalized;
}

function defaultBotGatewayAuthType(platform) {
  if (platform === "weixin-ilink") return "qr_login";
  if (platform === "feishu" || platform === "dingtalk" || platform === "wecom") return "app_secret";
  if (platform === "slack" || platform === "discord" || platform === "telegram" || platform === "line") return "bot_token";
  if (platform === "imessage") return "local";
  return "";
}

function websocketBotGatewayIntegrationConfig(platform, value) {
  const config = sanitizeBotGatewayRecord(value);
  delete config.transport;
  delete config.sendMode;
  const transport = botGatewayWebSocketTransport(platform);
  return transport ? { ...config, transport } : config;
}

function botGatewayWebSocketTransport(platform) {
  if (!platform || platform === "none") return "";
  return platform === "slack" ? "socket" : "websocket";
}

function sanitizeBotGatewayRecord(value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, rawValue] of Object.entries(value)) {
    if (!key.trim() || isWebhookRelatedBotGatewayKey(key)) continue;
    result[key] = rawValue;
  }
  return result;
}

function isWebhookRelatedBotGatewayKey(key) {
  const normalized = key.trim().toLowerCase().replace(/[_-]+/g, "");
  return normalized.includes("webhook") || normalized === "sendmode";
}

class BotGatewayBridge {
  constructor(config) {
    this.config = config;
    this.child = null;
    this.client = null;
    this.runtimeState = loadBotRuntimeState(config);
    this.forwarded = new Set(Object.keys(this.runtimeState.forwarded || {}));
    this.inboundHandler = null;
    this.inboundEvents = new Set(Object.keys(this.runtimeState.processedEvents || {}));
    this.latestEvent = null;
    this.messageCounter = 0;
    this.pollTimer = null;
    this.startPromise = null;
    this.flushingOutbox = null;
    this.suppressedTurnIds = new Set();
    this.claudeCliCapture = { finalText: "", resultCount: 0, text: "" };
    this.turnCaptures = new Map();
  }

  setInboundHandler(handler) {
    this.inboundHandler = typeof handler === "function" ? handler : null;
    if (this.inboundHandler) {
      this.ensureStarted().catch((error) => this.logError("start_failed", error));
    }
  }

  suppressTurn(turnId) {
    if (turnId) this.suppressedTurnIds.add(String(turnId));
  }

  unsuppressTurn(turnId) {
    if (turnId) this.suppressedTurnIds.delete(String(turnId));
  }

  async stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    const client = this.client;
    this.client = null;
    this.startPromise = null;
    this.updateDiagnostics({ state: "stopped", stoppedAt: new Date().toISOString() });
    await closeBotGatewayClient(client);
  }

  handleClaudeCliLine(line) {
    if (!line || !this.config.enabled) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    if (message.type === "stream_event" && message.event) {
      this.captureClaudeStreamEvent(message.event);
      return;
    }
    if (message.type === "assistant" && message.message && message.message.content) {
      const text = textFromContent(message.message.content);
      if (text) this.claudeCliCapture.finalText = text;
      return;
    }
    if (message.type === "result") {
      const errorText = message.is_error ? stringValue(message.result) || "Claude Code returned an error" : "";
      const text = errorText
        ? "Agent turn failed: " + errorText
        : this.claudeCliCapture.finalText || stringValue(message.result) || this.claudeCliCapture.text;
      this.completeClaudeCliCapture(text, Boolean(errorText));
      return;
    }
    const result = stringValue(message.result);
    if (result && !message.method && !message.params) {
      this.completeClaudeCliCapture(result, false);
    }
  }

  captureClaudeStreamEvent(event) {
    if (!event || typeof event !== "object") return;
    if (event.type === "content_block_delta" && event.delta && event.delta.type === "text_delta" && typeof event.delta.text === "string") {
      this.claudeCliCapture.text += event.delta.text;
      return;
    }
    if (event.type === "content_block_start" && event.content_block) {
      const text = textFromContent([event.content_block]);
      if (text) this.claudeCliCapture.finalText = text;
    }
  }

  completeClaudeCliCapture(text, isError) {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return;
    this.claudeCliCapture.resultCount += 1;
    const key = [
      isError ? "claude-cli-error" : "claude-cli",
      process.pid,
      this.claudeCliCapture.resultCount,
      trimmed.length
    ].join(":");
    this.forwardAgentText(key, trimmed, {});
    this.claudeCliCapture.finalText = "";
    this.claudeCliCapture.text = "";
  }

  handleJsonRpcLine(line) {
    if (!line || !this.config.enabled) return;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      return;
    }
    this.handleJsonRpcValue(value);
  }

  handleJsonRpcValue(value) {
    if (!this.config.enabled || !value || typeof value !== "object") return;
    const method = typeof value.method === "string" ? value.method : "";
    const params = value.params && typeof value.params === "object" ? value.params : {};
    if (method === "item/completed") {
      this.handleCompletedItem(params);
    } else if (method === "item/agentMessage/delta") {
      this.handleAgentMessageDelta(params);
    } else if (method === "turn/completed") {
      this.handleTurnCompleted(params);
    }
  }

  handleCompletedItem(params) {
    const item = params.item && typeof params.item === "object" ? params.item : null;
    if (!isAgentMessageItem(item)) return;
    const text = agentMessageItemText(item).trim();
    if (!text) return;
    const capture = this.turnCapture(params);
    if (capture) capture.finalText = text;
    const key = ["item", params.threadId, params.turnId, item.id, text.length].map((part) => String(part || "")).join(":");
    this.forwardAgentText(key, text, params);
  }

  handleAgentMessageDelta(params) {
    const delta = typeof params.delta === "string" ? params.delta : typeof params.text === "string" ? params.text : "";
    if (!delta) return;
    const capture = this.turnCapture(params);
    if (capture) capture.text += delta;
  }

  handleTurnCompleted(params) {
    const turn = params.turn && typeof params.turn === "object" ? params.turn : null;
    const captureKey = turnCaptureKey(params);
    const errorText = turnErrorText(turn);
    if (errorText) {
      const key = ["turn-error", params.threadId || (turn && turn.threadId), turn && turn.id, errorText.length].map((part) => String(part || "")).join(":");
      this.forwardAgentText(key, "Agent turn failed: " + errorText, params);
      if (captureKey) this.turnCaptures.delete(captureKey);
      return;
    }
    const capture = captureKey ? this.turnCaptures.get(captureKey) : null;
    const text = capture ? (capture.finalText || capture.text || "").trim() : "";
    if (text) {
      const key = ["turn", params.threadId || (turn && turn.threadId), turn && turn.id, text.length].map((part) => String(part || "")).join(":");
      this.forwardAgentText(key, text, params);
    }
    if (captureKey) this.turnCaptures.delete(captureKey);
  }

  turnCapture(params) {
    const key = turnCaptureKey(params);
    if (!key) return null;
    let capture = this.turnCaptures.get(key);
    if (!capture) {
      capture = { finalText: "", text: "" };
      this.turnCaptures.set(key, capture);
    }
    return capture;
  }

  forwardAgentText(key, text, params) {
    if (this.forwarded.has(key)) return;
    const turnId = params && (params.turnId || params.turn_id || (params.turn && params.turn.id));
    if (turnId && this.suppressedTurnIds.has(String(turnId))) {
      log("bot_gateway_forward_skip", { key, reason: "bot_inbound_turn" });
      return;
    }
    const decision = this.forwardDecision();
    if (!decision.shouldForward) {
      log("bot_gateway_forward_skip", { key, reason: decision.reason });
      return;
    }
    this.forwarded.add(key);
    this.ensureStarted()
      .then(() => this.sendText(key, text, params, decision))
      .catch((error) => {
        this.forwarded.delete(key);
        this.logError("forward_failed", error);
      });
  }

  forwardDecision() {
    if (this.config.forwardAllAgentMessages) {
      return { shouldForward: true, reason: "forward_all" };
    }
    if (!this.config.handoff.enabled) {
      return { shouldForward: false, reason: "forwarding_disabled" };
    }
    const presence = evaluateHandoffPresence(this.config.handoff);
    return {
      shouldForward: presence.away,
      reason: presence.away ? presence.reasons.join(", ") : presence.evidence.join(", ")
    };
  }

  async sendText(key, text, params, decision) {
    const conversationRef = this.resolveConversationRef();
    if (!conversationRef) {
      throw new Error("No Bot Gateway conversationRef is configured and no inbound bot event context is available.");
    }
    const outbound = {
      tenantId: this.resolveTenantId(),
      integrationId: this.resolveIntegrationId(),
      conversationRef,
      intent: {
        type: "text",
        text
      },
      idempotencyKey: "ccr:handoff:" + this.config.profileId + ":" + stableBotKey(key)
    };
    await this.sendDurable(outbound, { kind: "handoff", sourceKey: key });
    this.rememberForwarded(key);
    log("bot_gateway_forward_sent", {
      key,
      reason: decision.reason,
      textLen: text.length,
      threadId: params.threadId || "",
      turnId: params.turnId || ""
    });
  }

  async sendReplyToEvent(event, text, key) {
    if (!text || !String(text).trim()) return;
    await this.ensureStarted();
    text = localizeBotReply(String(text), botLanguageForEvent(this.config.language, event));
    const conversationRef = conversationRefFromEvent(event) || this.config.conversationRef;
    if (!conversationRef) {
      throw new Error("No Bot Gateway conversationRef is available for inbound bot response.");
    }
    const chunks = splitBotMessage(String(text), this.config.messageChunkChars);
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const outbound = this.outboundForEvent(event, conversationRef, botTextIntent(chunk), key + ":part:" + (index + 1));
      await this.sendDurable(outbound, { kind: "reply", sourceKey: key });
    }
  }

  async sendCardToEvent(event, card, fallbackText, key) {
    await this.ensureStarted();
    const conversationRef = conversationRefFromEvent(event) || this.config.conversationRef;
    if (!conversationRef) throw new Error("No Bot Gateway conversationRef is available for card response.");
    const language = botLanguageForEvent(this.config.language, event);
    const localizedFallback = localizeBotReply(fallbackText, language);
    const localizedCard = language === "zh-CN" ? localizeBotCard(card) : card;
    const outbound = this.outboundForEvent(event, conversationRef, { type: "card", card: localizedCard, fallbackText: localizedFallback }, key);
    await this.sendDurable(outbound, { kind: "card", sourceKey: key });
  }

  async sendMediaToEvent(event, media, caption, key) {
    if (!this.config.mediaEnabled) return;
    await this.ensureStarted();
    const conversationRef = conversationRefFromEvent(event) || this.config.conversationRef;
    if (!conversationRef) throw new Error("No Bot Gateway conversationRef is available for media response.");
    const fallbackText = caption || media.filename || media.url || "Attachment";
    const outbound = this.outboundForEvent(event, conversationRef, { type: "media", media, caption, fallbackText }, key);
    await this.sendDurable(outbound, { kind: "media", sourceKey: key });
  }

  async sendStreamToEvent(event, streamId, text, final, key) {
    if (!this.config.streamReplies || !text) return;
    await this.ensureStarted();
    const conversationRef = conversationRefFromEvent(event) || this.config.conversationRef;
    if (!conversationRef) return;
    const outbound = this.outboundForEvent(event, conversationRef, {
      type: "stream_text",
      streamId,
      text,
      final: Boolean(final),
      fallbackText: text
    }, key + ":" + (final ? "final" : stableBotKey(text.slice(-160))));
    await this.sendDurable(outbound, { kind: "stream", sourceKey: key });
  }

  outboundForEvent(event, conversationRef, intent, key) {
    return {
      tenantId: eventString(event, "tenantId") || this.config.tenantId || "ccr",
      integrationId: eventString(event, "integrationId") || this.config.integrationId,
      conversationRef,
      intent,
      idempotencyKey: stableBotKey(key)
    };
  }

  async sendDurable(outbound, metadata) {
    const id = outbound.idempotencyKey || stableBotKey(JSON.stringify(outbound));
    let entry = this.runtimeState.outbox.find((item) => item.id === id);
    if (!entry) {
      entry = { id, outbound, metadata, attempts: 0, createdAt: Date.now(), nextAttemptAt: 0 };
      this.runtimeState.outbox.push(entry);
      this.saveRuntimeState();
    }
    return this.deliverOutboxEntry(entry);
  }

  async deliverOutboxEntry(entry) {
    entry.attempts += 1;
    entry.lastAttemptAt = Date.now();
    this.saveRuntimeState();
    try {
      const response = await withTimeout(this.client.send(entry.outbound), this.config.requestTimeoutMs, "Bot Gateway request timed out: outbound.send");
      const result = response && response.result && typeof response.result === "object" ? response.result : response || {};
      this.runtimeState.outbox = this.runtimeState.outbox.filter((item) => item.id !== entry.id);
      this.runtimeState.deliveries.push({
        id: entry.id,
        kind: entry.metadata && entry.metadata.kind || "message",
        status: stringValue(result.status) || "sent",
        platformMessageId: stringValue(result.platformMessageId),
        deliveredAt: Date.now()
      });
      this.runtimeState.deliveries = this.runtimeState.deliveries.slice(-100);
      this.updateDiagnostics({ lastDeliveryAt: new Date().toISOString(), lastDeliveryStatus: stringValue(result.status) || "sent" }, false);
      this.saveRuntimeState();
      return response;
    } catch (error) {
      entry.lastError = formatError(error);
      entry.nextAttemptAt = Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(entry.attempts, 6));
      this.updateDiagnostics({ lastError: entry.lastError, lastErrorAt: new Date().toISOString() }, false);
      this.saveRuntimeState();
      throw error;
    }
  }

  async flushOutbox() {
    if (this.flushingOutbox) return this.flushingOutbox;
    this.flushingOutbox = (async () => {
      const now = Date.now();
      for (const entry of this.runtimeState.outbox.slice()) {
        if (entry.nextAttemptAt && entry.nextAttemptAt > now) continue;
        try {
          await this.deliverOutboxEntry(entry);
        } catch {
          // Retain the entry for the next retry window.
        }
      }
    })().finally(() => { this.flushingOutbox = null; });
    return this.flushingOutbox;
  }

  resolveTenantId() {
    return eventString(this.latestEvent, "tenantId") || this.config.tenantId || "ccr";
  }

  resolveIntegrationId() {
    return eventString(this.latestEvent, "integrationId") || this.config.integrationId;
  }

  resolveConversationRef() {
    if (this.config.conversationRef) return this.config.conversationRef;
    const event = this.latestEvent;
    return conversationRefFromEvent(event);
  }

  async ensureStarted() {
    if (this.client) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.start().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async start() {
    const sdk = await loadBotGatewaySdk();
    const env = Object.assign({}, process.env, {
      BOT_GATEWAY_STATE_DIR: this.config.stateDir || path.join(CONFIG_DIR, "bot-gateway", safePathSegment(this.config.profileId)),
      CODEXL_HOME: CONFIG_DIR
    });
    const clientOptions = botGatewaySdkClientOptions(this.config, env, sdk);
    this.client = sdk.createBotGatewayClient(clientOptions);
    await withTimeout(this.client.health(), this.config.startupTimeoutMs, "Bot Gateway health check timed out.");
    this.updateDiagnostics({ state: "connected", connectedAt: new Date().toISOString(), lastError: "" });
    await this.ensureIntegration();
    await this.flushOutbox();
    await this.pollEvents();
    this.pollTimer = setInterval(() => {
      this.flushOutbox().catch((error) => this.logError("outbox_flush_failed", error));
      this.pollEvents().catch((error) => this.logError("poll_failed", error));
    }, Math.max(500, this.config.pollIntervalMs));
    log("bot_gateway_started", { platform: this.config.platform, sdkTransport: clientOptions.transport, command: clientOptions.command || "sdk-bundled" });
  }

  async ensureIntegration() {
    if (!this.config.integrationId) return;
    if (this.config.createIntegration && this.config.authType !== "qr_login") {
      await botGatewayClientRequest(this.client, "integrations.create", {
        id: this.config.integrationId,
        tenantId: this.config.tenantId,
        platform: this.config.platform,
        authType: this.config.authType,
        credentials: this.config.credentials,
        config: this.config.integrationConfig
      }, this.config.requestTimeoutMs);
    }
    if (this.config.autoStartIntegration) {
      await botGatewayClientRequest(this.client, "integrations.start", {
        integrationId: this.config.integrationId
      }, this.config.requestTimeoutMs).catch((error) => {
        log("bot_gateway_integration_start_skip", { error: formatError(error) });
      });
    }
  }

  async pollEvents() {
    if (!this.client) return;
    if (this.pollingEvents) return;
    this.pollingEvents = true;
    try {
      const result = await withTimeout(this.client.events(20), this.config.requestTimeoutMs, "Bot Gateway request timed out: events.list");
      const events = Array.isArray(result && result.events) ? result.events : [];
      for (const queued of events) {
        const event = queued && queued.event && typeof queued.event === "object" ? queued.event : null;
        if (!event || !this.matchesEvent(event)) continue;
        if (event.actor && event.actor.isBot === true) continue;
        this.latestEvent = event;
        this.updateDiagnostics({ lastEventAt: new Date().toISOString(), lastEventType: eventString(event, "type") }, false);
        const eventId = eventIdFromQueued(queued, event);
        if (this.inboundHandler) {
          await this.dispatchInboundEvent(queued, event, eventId);
        } else {
          await this.ackEvent(eventId);
        }
      }
    } finally {
      this.pollingEvents = false;
    }
  }

  async dispatchInboundEvent(queued, event, eventId) {
    const key = eventId || botEventDedupeKey(event);
    if (this.inboundEvents.has(key)) {
      await this.ackEvent(eventId);
      return;
    }
    this.inboundEvents.add(key);
    try {
      await this.inboundHandler(event, queued, eventId || key, this);
      this.rememberProcessedEvent(key);
      await this.ackEvent(eventId);
    } catch (error) {
      this.inboundEvents.delete(key);
      throw error;
    }
  }

  async ackEvent(eventId) {
    if (!this.config.acknowledgeEvents || !eventId) return;
    await withTimeout(this.client.ackEvent(eventId), this.config.requestTimeoutMs, "Bot Gateway request timed out: events.ack").catch((error) => {
      log("bot_gateway_ack_failed", { eventId, error: formatError(error) });
    });
  }

  matchesEvent(event) {
    if (this.config.integrationId && event.integrationId !== this.config.integrationId) return false;
    if (this.config.platform && this.config.platform !== "none" && event.platform !== this.config.platform) return false;
    if (this.config.tenantId && event.tenantId !== this.config.tenantId) return false;
    return true;
  }

  rememberProcessedEvent(key) {
    this.runtimeState.processedEvents[key] = Date.now();
    pruneTimestampRecord(this.runtimeState.processedEvents, 2000, 7 * 24 * 60 * 60 * 1000);
    this.saveRuntimeState();
  }

  rememberForwarded(key) {
    this.runtimeState.forwarded[key] = Date.now();
    pruneTimestampRecord(this.runtimeState.forwarded, 1000, 24 * 60 * 60 * 1000);
    this.forwarded = new Set(Object.keys(this.runtimeState.forwarded));
    this.saveRuntimeState();
  }

  diagnostics() {
    return {
      ...this.runtimeState.diagnostics,
      outboxCount: this.runtimeState.outbox.length,
      recentDeliveries: this.runtimeState.deliveries.slice(-10),
      processedEventCount: Object.keys(this.runtimeState.processedEvents).length,
      platform: this.config.platform,
      integrationId: this.config.integrationId
    };
  }

  updateDiagnostics(patch, save = true) {
    this.runtimeState.diagnostics = { ...this.runtimeState.diagnostics, ...patch, updatedAt: new Date().toISOString() };
    if (save) this.saveRuntimeState();
  }

  saveRuntimeState() {
    writeJsonAtomic(botRuntimeStatePath(this.config), this.runtimeState);
  }

  logError(event, error) {
    this.updateDiagnostics({ lastError: formatError(error), lastErrorAt: new Date().toISOString(), lastErrorEvent: event });
    log("bot_gateway_" + event, { error: formatError(error) });
  }
}

let BOT_GATEWAY_SDK_PROMISE = null;

async function loadBotGatewaySdk() {
  if (!BOT_GATEWAY_SDK_PROMISE) {
    BOT_GATEWAY_SDK_PROMISE = importBotGatewaySdk();
  }
  return BOT_GATEWAY_SDK_PROMISE;
}

async function importBotGatewaySdk() {
  const candidates = [];
  const configured = nonEmptyEnv("CCR_BOT_GATEWAY_SDK_MODULE");
  if (configured) {
    candidates.push(configured);
  }
  const bundled = bundledBotGatewaySdkModule();
  if (bundled) {
    candidates.push(bundled);
  }
  candidates.push("@the-next-ai/bot-gateway-sdk");
  const errors = [];
  for (const candidate of candidates) {
    try {
      const sdk = await import(botGatewaySdkImportSpecifier(candidate));
      if (sdk && typeof sdk.createBotGatewayClient === "function") {
        return sdk;
      }
      errors.push(candidate + ": missing createBotGatewayClient export");
    } catch (error) {
      errors.push(candidate + ": " + formatError(error));
    }
  }
  throw new Error("Unable to load @the-next-ai/bot-gateway-sdk. " + errors.join("; "));
}

function bundledBotGatewaySdkModule() {
  const resourcesPath = process["resourcesPath"];
  const candidates = [
    path.join(__dirname, "bot-gateway-sdk", "dist", "index.js"),
    ...(resourcesPath
      ? [
          path.join(resourcesPath, "app.asar", "dist", "main", "bot-gateway-sdk", "dist", "index.js"),
          path.join(resourcesPath, "app", "dist", "main", "bot-gateway-sdk", "dist", "index.js")
        ]
      : [])
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function botGatewaySdkImportSpecifier(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "@the-next-ai/bot-gateway-sdk";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  if (path.isAbsolute(trimmed)) return pathToFileURL(trimmed).href;
  return trimmed;
}

function botGatewaySdkClientOptions(config, env, sdk) {
  const command = resolveBotGatewayCommand(config) || resolveBundledBotGatewayCommand(sdk);
  return {
    transport: "stdio",
    ...(command || {}),
    env
  };
}

function resolveBotGatewayCommand(config) {
  if (config.command) {
    return {
      command: expandHome(config.command),
      args: config.args,
      cwd: config.cwd || process.cwd()
    };
  }
  return undefined;
}

function resolveBundledBotGatewayCommand(sdk) {
  if (!sdk || typeof sdk.bundledStdioPath !== "function") {
    return undefined;
  }
  const bundledPath = sdk.bundledStdioPath();
  return {
    command: process.execPath,
    args: [sanitizedBotGatewayStdioRunnerPath(bundledPath)],
    cwd: path.dirname(bundledPath)
  };
}

function sanitizedBotGatewayStdioRunnerPath(sourcePath) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const normalized = normalizeDuplicateShebangs(source);
  if (normalized === source) {
    return sourcePath;
  }

  const targetDir = path.join(CONFIG_DIR, "bot-gateway", "runners");
  const targetPath = path.join(targetDir, "bot-gateway-stdio.mjs");
  fs.mkdirSync(targetDir, { recursive: true });
  if (!fs.existsSync(targetPath) || fs.readFileSync(targetPath, "utf8") !== normalized) {
    fs.writeFileSync(targetPath, normalized);
  }
  return targetPath;
}

function normalizeDuplicateShebangs(source) {
  const lines = source.split("\n");
  if (!lines[0] || !lines[0].startsWith("#!")) {
    return source;
  }
  let index = 1;
  while (lines[index] && lines[index].startsWith("#!")) {
    index += 1;
  }
  return [lines[0], ...lines.slice(index)].join("\n");
}

function botGatewayClientRequest(client, method, params, timeoutMs) {
  if (!client || typeof client.request !== "function") {
    return Promise.reject(new Error("Bot Gateway SDK client does not expose request()."));
  }
  return withTimeout(client.request(method, params), timeoutMs, "Bot Gateway request timed out: " + method);
}

async function closeBotGatewayClient(client) {
  if (!client || typeof client !== "object") return;
  for (const method of ["close", "dispose", "stop"]) {
    if (typeof client[method] !== "function") continue;
    try {
      await Promise.resolve(client[method]());
    } catch (error) {
      log("bot_gateway_client_close_failed", { method, error: formatError(error) });
    }
    return;
  }
}

function withTimeout(promise, timeoutMs, message) {
  const timeout = Math.max(1000, timeoutMs || 30000);
  let timer = null;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeout);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function evaluateHandoffPresence(config) {
  if (!config.enabled) {
    return { away: false, reasons: [], evidence: ["handoff disabled"] };
  }
  const reasons = [];
  const evidence = [];
  if (config.screenLock) {
    const locked = detectScreenLocked();
    if (locked !== true) {
      return { away: false, reasons, evidence: [locked === false ? "screen unlocked" : "screen lock unknown"] };
    }
    reasons.push("screen locked");
  }
  if (config.userIdle) {
    const seconds = detectUserIdleSeconds();
    if (!Number.isFinite(seconds)) {
      evidence.push("idle time unknown");
    } else if (seconds >= config.idleSeconds) {
      reasons.push("idle for " + seconds + "s");
    } else {
      return { away: false, reasons, evidence: ["idle for " + seconds + "s"] };
    }
  }
  if (config.phoneWifiTargets.length || config.phoneBluetoothTargets.length) {
    evidence.push("phone target checks are configured but not available in CCR middleware");
  }
  return { away: reasons.length > 0, reasons, evidence };
}

function detectScreenLocked() {
  if (process.platform !== "darwin") return null;
  const output = commandOutput("/usr/sbin/ioreg", ["-r", "-k", "CGSSessionScreenIsLocked"]) || commandOutput("/usr/sbin/ioreg", ["-n", "Root", "-d1"]);
  if (!output) return null;
  for (const line of output.split(/\r?\n/g)) {
    if (!line.includes("CGSSessionScreenIsLocked") && !line.includes("IOConsoleLocked")) continue;
    const lower = line.toLowerCase();
    if (lower.includes("yes") || lower.includes("true") || lower.includes("= 1")) return true;
    if (lower.includes("no") || lower.includes("false") || lower.includes("= 0")) return false;
  }
  return false;
}

function detectUserIdleSeconds() {
  if (process.platform !== "darwin") return null;
  const output = commandOutput("/usr/sbin/ioreg", ["-c", "IOHIDSystem"]);
  if (!output) return null;
  for (const line of output.split(/\r?\n/g)) {
    if (!line.includes("HIDIdleTime")) continue;
    const raw = String(line.split("=")[1] || "").trim();
    const digits = raw.match(/^\d+/);
    if (!digits) return null;
    return Math.floor(Number(digits[0]) / 1000000000);
  }
  return null;
}

function commandOutput(command, args) {
  try {
    const result = childProcess.spawnSync(command, args, { encoding: "utf8", timeout: 2000 });
    return result.status === 0 ? result.stdout : "";
  } catch {
    return "";
  }
}

function isAgentMessageItem(item) {
  if (!item || typeof item !== "object") return false;
  return item.type === "agentMessage" || item.type === "agent_message" || item.type === "assistantMessage" || item.type === "assistant_message";
}

function agentMessageItemText(item) {
  if (!item || typeof item !== "object") return "";
  if (typeof item.text === "string") return item.text;
  if (typeof item.content === "string") return item.content;
  if (typeof item.message === "string") return item.message;
  return "";
}

function turnCaptureKey(params) {
  const threadId = params.threadId || params.thread_id || (params.thread && params.thread.id);
  const turnId = params.turnId || params.turn_id || (params.turn && params.turn.id);
  if (!threadId || !turnId) return "";
  return String(threadId) + ":" + String(turnId);
}

function turnErrorText(turn) {
  if (!turn) return "";
  if (typeof turn.error === "string" && turn.error.trim()) return turn.error.trim();
  if (turn.error && typeof turn.error === "object") {
    if (typeof turn.error.message === "string") return turn.error.message.trim();
    if (typeof turn.error.details === "string") return turn.error.details.trim();
  }
  return "";
}

function botSessionStorePath() {
  const stateDir = nonEmptyEnv("CCR_BOT_GATEWAY_STATE_DIR") ||
    nonEmptyEnv("CODEXL_BOT_GATEWAY_STATE_DIR") ||
    nonEmptyEnv("BOT_GATEWAY_STATE_DIR") ||
    path.join(CONFIG_DIR, "bot-gateway", safePathSegment(nonEmptyEnv("CCR_BOT_PROFILE_ID") || "default"));
  return path.join(expandHome(stateDir), "claude-bot-sessions.json");
}

function botRuntimeStatePath(config) {
  const stateDir = stringValue(config && config.stateDir) ||
    nonEmptyEnv("CCR_BOT_GATEWAY_STATE_DIR") ||
    nonEmptyEnv("BOT_GATEWAY_STATE_DIR") ||
    path.join(CONFIG_DIR, "bot-gateway", safePathSegment(config && config.profileId || "default"));
  return path.join(expandHome(stateDir), "bot-runtime-state.json");
}

function loadBotRuntimeState(config) {
  const value = readJsonFile(botRuntimeStatePath(config));
  const state = value && typeof value === "object" ? value : {};
  const processedEvents = state.processedEvents && typeof state.processedEvents === "object" ? state.processedEvents : {};
  const forwarded = state.forwarded && typeof state.forwarded === "object" ? state.forwarded : {};
  pruneTimestampRecord(processedEvents, 2000, 7 * 24 * 60 * 60 * 1000);
  pruneTimestampRecord(forwarded, 1000, 24 * 60 * 60 * 1000);
  return {
    version: BOT_RUNTIME_STATE_VERSION,
    processedEvents,
    forwarded,
    outbox: Array.isArray(state.outbox) ? state.outbox.filter((item) => item && typeof item === "object" && item.id && item.outbound).slice(-500) : [],
    deliveries: Array.isArray(state.deliveries) ? state.deliveries.slice(-100) : [],
    diagnostics: state.diagnostics && typeof state.diagnostics === "object" ? state.diagnostics : { state: "starting" }
  };
}

function pruneTimestampRecord(record, maxEntries, maxAgeMs) {
  const now = Date.now();
  const entries = Object.entries(record || {})
    .filter(([, value]) => Number.isFinite(Number(value)) && now - Number(value) <= maxAgeMs)
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, maxEntries);
  for (const key of Object.keys(record || {})) delete record[key];
  for (const [key, value] of entries) record[key] = Number(value);
}

function writeJsonAtomic(file, value) {
  const temporary = file + "." + process.pid + ".tmp";
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function stableBotKey(value) {
  return "ccr:" + crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 32);
}

function splitBotMessage(value, maxChars) {
  const text = String(value || "").trim();
  const limit = Math.max(500, Number(maxChars) || 3500);
  if (!text || text.length <= limit) return text ? [text] : [];
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit + 1);
    const newline = window.lastIndexOf("\n");
    const space = window.lastIndexOf(" ");
    const cut = Math.max(newline >= limit * 0.55 ? newline : 0, space >= limit * 0.7 ? space : 0) || limit;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function botTextIntent(text) {
  const value = String(text || "");
  const markdown = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|\x60{3}|>\s)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*/m.test(value);
  return markdown
    ? { type: "markdown", markdown: value, fallbackText: value }
    : { type: "text", text: value };
}

function botLanguageForEvent(configured, event) {
  if (configured === "en" || configured === "zh-CN") return configured;
  const locale = valueStringAtPaths(event, ["/actor/locale", "/raw/locale", "/raw/language", "/raw/user/locale"]) || process.env.LANG || "";
  return /^zh(?:[-_]|$)/i.test(locale) ? "zh-CN" : "en";
}

function localizeBotReply(text, language) {
  if (language !== "zh-CN") return text;
  const replacements = [
    ["Unknown Bot command. Send /project or /session to see available commands.", "未知的 Bot 命令。发送 /project 或 /session 查看可用命令。"],
    ["CCR App project commands", "CCR App 项目命令"],
    ["CCR App session commands", "CCR App 会话命令"],
    ["Projects are managed separately with /project. The relay is available only while this App is opened through CCR.", "项目通过 /project 单独管理。只有通过 CCR 打开此 App 时，消息接力才在线。"],
    ["Sessions are managed separately with /session. The relay is available only while this App is opened through CCR.", "会话通过 /session 单独管理。只有通过 CCR 打开此 App 时，消息接力才在线。"],
    [" - list Agent projects", " - 列出 Agent 项目"],
    [" - search Agent projects", " - 搜索 Agent 项目"],
    [" - show the selected project", " - 显示当前项目"],
    [" - select a listed project", " - 选择列表中的项目"],
    [" - set a Bot display label for the current project", " - 设置当前项目的 Bot 显示名称"],
    [" - list sessions in the current project", " - 列出当前项目中的会话"],
    [" - search sessions in the current project", " - 搜索当前项目中的会话"],
    [" - show the selected session", " - 显示当前会话"],
    [" - show the active turn and queue", " - 显示正在运行和排队的任务"],
    [" - stop the active turn and clear queued turns", " - 停止当前任务并清空队列"],
    [" - approve a pending Agent permission", " - 允许待处理的 Agent 权限"],
    [" - deny a pending Agent permission or input request", " - 拒绝待处理的权限或输入请求"],
    [" - answer a pending Agent input request", " - 回答待处理的 Agent 输入请求"],
    [" - start a session in the current project", " - 在当前项目中新建会话"],
    [" - continue a listed session", " - 继续列表中的会话"],
    [" - clear the selected session", " - 清除当前会话选择"],
    [" - rename the selected session", " - 重命名当前会话"],
    [" - show recent turns", " - 显示最近的对话"],
    [" - show or change model/provider", " - 查看或切换模型/Provider"],
    [" - show the latest token and cost data", " - 显示最近的 Token 与费用数据"],
    [" - manage persistent session context", " - 管理持久会话上下文"],
    [" - list project and user skills", " - 列出项目和用户 Skills"],
    [" - invoke an Agent-native skill", " - 调用 Agent 原生 Skill"],
    [" - manage conversation shortcuts", " - 管理会话快捷指令"],
    [" - show Bot connection and delivery diagnostics", " - 显示 Bot 连接和投递诊断"],
    [" - show recent outbound delivery results", " - 显示最近的出站投递结果"],
    ["No Agent turn is running or queued for this conversation.", "当前会话没有正在运行或排队的 Agent 任务。"],
    ["No permission request is waiting for this conversation.", "当前会话没有待处理的权限请求。"],
    ["Permission approved.", "已允许本次权限请求。"],
    ["Permission denied.", "已拒绝本次权限请求。"],
    ["Answer sent to the Agent.", "已将回答发送给 Agent。"],
    ["Bot diagnostics:", "Bot 诊断："],
    ["Recent Bot deliveries:", "最近的 Bot 投递："],
    ["No recent Bot deliveries.", "暂无最近的 Bot 投递记录。"],
    ["Current Claude App project:", "当前 Claude App 项目："],
    ["Current OpenCode project:", "当前 OpenCode 项目："],
    ["Current Claude App session:", "当前 Claude App 会话："],
    ["Current OpenCode session:", "当前 OpenCode 会话："],
    ["Available models:", "可用模型："],
    ["Available skills:", "可用 Skills："],
    ["Session memory:", "会话记忆："],
    ["Session memory is empty.", "会话记忆为空。"],
    ["Session memory cleared.", "会话记忆已清空。"],
    ["Session memory added.", "已添加会话记忆。"],
    ["Recent session history:", "最近会话历史："],
    ["Session history is empty.", "会话历史为空。"],
    ["Queued turns:", "排队任务："],
    ["Running for ", "已运行 "],
    ["Waiting for permission:", "等待权限确认："],
    ["Agent turn failed:", "Agent 运行失败："]
  ];
  let output = String(text || "");
  for (const [source, target] of replacements) output = output.split(source).join(target);
  return output;
}

function localizeBotCard(card) {
  const labelMap = {
    "Agent permission required": "Agent 需要权限",
    "Agent needs input": "Agent 需要输入",
    "Approve once": "允许一次",
    "Approve for session": "本会话始终允许",
    "Deny": "拒绝",
    "Project": "项目",
    "Session": "会话"
  };
  return {
    ...card,
    title: labelMap[card.title] || card.title,
    fields: Array.isArray(card.fields) ? card.fields.map((field) => ({ ...field, label: labelMap[field.label] || field.label })) : card.fields,
    actions: Array.isArray(card.actions) ? card.actions.map((action) => ({ ...action, label: labelMap[action.label] || action.label })) : card.actions
  };
}

function normalizeBotSessionStore(value) {
  const conversations = value && typeof value === "object" && value.conversations && typeof value.conversations === "object"
    ? value.conversations
    : {};
  const pendingTurns = value && typeof value === "object" && Array.isArray(value.pendingTurns)
    ? value.pendingTurns.filter((item) => item && typeof item === "object")
    : [];
  const projectAliases = value && typeof value === "object" && value.projectAliases && typeof value.projectAliases === "object"
    ? value.projectAliases
    : {};
  return { version: BOT_SESSION_ENTRY_VERSION, conversations, pendingTurns, projectAliases };
}

function parseBotCommand(text) {
  const input = String(text || "").trim();
  if (!input || !input.startsWith("/")) return null;
  const trimmed = input.slice(1).trim();
  const space = trimmed.search(/\s/);
  const rawName = space >= 0 ? trimmed.slice(0, space) : trimmed;
  const domain = rawName.toLowerCase();
  const args = space >= 0 ? trimmed.slice(space + 1).trim() : "";
  if (domain !== "project" && domain !== "session") return { name: "unknown", args: trimmed };
  const actionSpace = args.search(/\s/);
  const action = (actionSpace >= 0 ? args.slice(0, actionSpace) : args).toLowerCase();
  const actionArgs = actionSpace >= 0 ? args.slice(actionSpace + 1).trim() : "";
  if (!action || ["help", "?"].includes(action)) return { domain, name: "help", args: "" };
  if (["list", "ls"].includes(action)) return { domain, name: "ls", args: actionArgs };
  if (["find", "search"].includes(action)) return { domain, name: "search", args: actionArgs };
  if (action === "current") return { domain, name: "current", args: actionArgs };
  if (domain === "session" && action === "status") return { domain, name: "status", args: actionArgs };
  if (domain === "session" && ["cancel", "stop"].includes(action)) return { domain, name: "cancel", args: actionArgs };
  if (domain === "session" && action === "approve") return { domain, name: "approve", args: actionArgs };
  if (domain === "session" && action === "deny") return { domain, name: "deny", args: actionArgs };
  if (domain === "session" && action === "answer") return { domain, name: "answer", args: actionArgs };
  if (domain === "project" && ["name", "rename"].includes(action)) return { domain, name: "rename", args: actionArgs };
  if (domain === "session" && ["name", "rename"].includes(action)) return { domain, name: "rename", args: actionArgs };
  if (domain === "session" && ["archive", "restore", "delete", "history", "model", "models", "effort", "mode", "usage", "memory", "skills", "skill", "shortcut", "doctor", "deliveries"].includes(action)) {
    return { domain, name: action, args: actionArgs };
  }
  if (["use", "select"].includes(action)) return { domain, name: "select", args: actionArgs };
  if (domain === "session" && ["new", "create"].includes(action)) return { domain, name: "new", args: actionArgs };
  if (domain === "session" && action === "reset") return { domain, name: "reset", args: actionArgs };
  return { domain, name: "unknown", args };
}

function projectCommandHelpText(agentName) {
  return [
    "CCR App project commands (" + agentName + "):",
    "/project list - list Agent projects",
    "/project find <text> - search Agent projects",
    "/project current - show the selected project",
    "/project use <n> - select a listed project",
    "/project name <label> - set a Bot display label for the current project",
    "",
    "Sessions are managed separately with /session. The relay is available only while this App is opened through CCR."
  ].join("\n");
}

function sessionCommandHelpText(agentName) {
  return [
    "CCR App session commands (" + agentName + "):",
    "/session list - list sessions in the current project",
    "/session find <text> - search sessions in the current project",
    "/session current - show the selected session",
    "/session status - show the active turn and queue",
    "/session cancel - stop the active turn and clear queued turns",
    "/session approve [session] - approve a pending Agent permission",
    "/session deny - deny a pending Agent permission or input request",
    "/session answer <text> - answer a pending Agent input request",
    "/session new [title] - start a session in the current project",
    "/session use <n> - continue a listed session",
    "/session reset - clear the selected session",
    "/session name <label> - rename the selected session",
    "/session archive <n> | restore <n> | delete <n> confirm",
    "/session history [count] - show recent turns",
    "/session model [selector|reset] - show or change model/provider",
    "/session effort [low|medium|high|xhigh|max|reset]",
    "/session mode [manual|acceptEdits|plan|auto|dontAsk|reset]",
    "/session usage - show the latest token and cost data",
    "/session memory [list|add <text>|clear] - manage persistent session context",
    "/session skills - list project and user skills",
    "/session skill <name> [task] - invoke an Agent-native skill",
    "/session shortcut list|add|remove|run - manage conversation shortcuts",
    "/session doctor - show Bot connection and delivery diagnostics",
    "/session deliveries - show recent outbound delivery results",
    "",
    "Projects are managed separately with /project. The relay is available only while this App is opened through CCR."
  ].join("\n");
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  if (seconds < 60) return seconds + "s";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes + "m " + rest + "s";
}

function interruptChildProcess(child) {
  if (!child || child.killed) return false;
  try {
    if (process.platform !== "win32" && child.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
    } else {
      child.kill("SIGTERM");
    }
    const timer = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        try {
          if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch { /* Process already exited. */ }
      }
    }, 5000);
    if (typeof timer.unref === "function") timer.unref();
    return true;
  } catch {
    return false;
  }
}

function latestClaudeAppLocalAgentSession() {
  return claudeAppLocalAgentSessions()[0] || null;
}

function claudeAppSessionProjectDirectory(session) {
  const metadata = session && session.metadata && typeof session.metadata === "object" ? session.metadata : {};
  const selectedFolders = Array.isArray(metadata.userSelectedFolders) ? metadata.userSelectedFolders : [];
  const selected = selectedFolders.find((item) => stringValue(item));
  return resolveExistingProjectDirectory(selected || (session && session.cwd), process.cwd());
}

function claudeAppProjects(sessions, fallbackDirectory) {
  return agentProjectsFromDirectories(
    [fallbackDirectory, ...sessions.map((session) => claudeAppSessionProjectDirectory(session))],
    fallbackDirectory
  );
}

function claudeAppLocalAgentSessions(options = {}) {
  const baseDir = currentClaudeAppUserDataDir();
  if (!baseDir) return [];
  const root = path.join(baseDir, "local-agent-mode-sessions");
  const files = listClaudeAppSessionFiles(root, 6);
  const sessions = [];
  for (const file of files) {
    let value;
    try {
      value = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const archived = value.isArchived === true || value.archived === true;
    if (archived && !options.includeArchived) continue;
    const cliSessionId = stringValue(value.cliSessionId) || stringValue(value.cli_session_id);
    if (!cliSessionId) continue;
    const sessionId = stringValue(value.sessionId) || path.basename(file, ".json");
    const lastActivityAt = numberValue(value.lastActivityAt) || numberValue(value.updatedAt) || numberValue(value.createdAt) || fileMtimeMs(file);
    const item = {
      file,
      sessionId,
      cliSessionId,
      cwd: stringValue(value.cwd) || process.cwd(),
      model: stringValue(value.model) || "",
      title: stringValue(value.title) || "",
      initialMessage: stringValue(value.initialMessage) || "",
      lastActivityAt,
      claudeConfigDir: claudeAppSessionConfigDir(file, value),
      metadata: value,
      archived
    };
    sessions.push(item);
  }
  sessions.sort((left, right) => (right.lastActivityAt || 0) - (left.lastActivityAt || 0));
  return sessions;
}

function updateClaudeSessionFile(file, patch) {
  const value = readJsonFile(file);
  if (!value || typeof value !== "object") return false;
  writeJsonAtomic(file, { ...value, ...patch });
  return true;
}

function currentClaudeAppUserDataDir() {
  return expandHome(nonEmptyEnv("CCR_CLAUDE_APP_USER_DATA_PATH") || nonEmptyEnv("CLAUDE_USER_DATA_DIR") || "");
}

function botSessionEntryMatchesCurrentProfile(entry, appSession) {
  const expectedUserDataDir = currentClaudeAppUserDataDir();
  if (!expectedUserDataDir) return true;
  const candidates = [
    entry && entry.claudeConfigDir,
    entry && entry.claudeAppSessionFile,
    entry && entry.cwd,
    appSession && appSession.claudeConfigDir
  ];
  return candidates.some((candidate) => pathIsInside(candidate, expectedUserDataDir));
}

function pathIsInside(candidate, parentDir) {
  const child = expandHome(String(candidate || ""));
  const parent = expandHome(String(parentDir || ""));
  if (!child || !parent) return false;
  const childPath = normalizeComparablePath(path.resolve(child));
  const parentPath = normalizeComparablePath(path.resolve(parent));
  if (childPath === parentPath) return true;
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizeComparablePath(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function resolveClaudeAppLocalAgentSession(selector, availableSessions) {
  const query = String(selector || "").trim();
  if (!query) return null;
  const sessions = Array.isArray(availableSessions) ? availableSessions : claudeAppLocalAgentSessions();
  const numeric = Number(query);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= sessions.length) {
    return sessions[numeric - 1];
  }
  const lower = query.toLowerCase();
  let matches = sessions.filter((session) =>
    String(session.sessionId || "").toLowerCase() === lower ||
    String(session.sessionId || "").toLowerCase().startsWith(lower) ||
    String(session.cliSessionId || "").toLowerCase() === lower ||
    String(session.cliSessionId || "").toLowerCase().startsWith(lower) ||
    botSessionTitle(session).toLowerCase().includes(lower)
  );
  if (!matches.length) return null;
  matches.sort((left, right) =>
    scoreBotSessionMatch(left, lower) - scoreBotSessionMatch(right, lower) ||
    (right.lastActivityAt || 0) - (left.lastActivityAt || 0)
  );
  return matches[0];
}

function scoreBotSessionMatch(session, query) {
  const id = String(session.sessionId || "").toLowerCase();
  const cli = String(session.cliSessionId || "").toLowerCase();
  const title = botSessionTitle(session).toLowerCase();
  if (id === query || cli === query) return 0;
  if (id.startsWith(query) || cli.startsWith(query)) return 1;
  if (title === query) return 2;
  return 3;
}

function botSessionTitle(session) {
  return stringValue(session && session.title) ||
    stringValue(session && session.initialMessage) ||
    "Untitled";
}

function shortSessionId(value) {
  const text = String(value || "").trim();
  if (!text) return "(none)";
  if (text.startsWith("local_")) return text.slice(0, 14);
  return text.slice(0, 8);
}

function createClaudeAppLocalAgentSession(text, projectDirectory) {
  const baseDir = nonEmptyEnv("CCR_CLAUDE_APP_USER_DATA_PATH") || nonEmptyEnv("CLAUDE_USER_DATA_DIR");
  if (!baseDir) return null;
  const root = path.join(expandHome(baseDir), "local-agent-mode-sessions");
  const template = latestClaudeAppLocalAgentSession();
  const parentDir = template && template.file ? path.dirname(template.file) : defaultClaudeAppLocalAgentParentDir(root);
  const sessionId = "local_" + uuid();
  const sessionDir = path.join(parentDir, sessionId);
  const outputDirectory = path.join(sessionDir, "outputs");
  const cwd = resolveExistingProjectDirectory(projectDirectory, outputDirectory);
  const claudeConfigDir = path.join(sessionDir, ".claude");
  const file = path.join(parentDir, sessionId + ".json");
  const now = Date.now();
  const title = promptTitle(text);
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.mkdirSync(path.join(sessionDir, "uploads"), { recursive: true });
  fs.mkdirSync(claudeConfigDir, { recursive: true });
  copyClaudeConfigTemplate(claudeConfigDir, template);
  const metadata = {
    ...claudeAppSessionTemplateFields(template && template.metadata),
    sessionId,
    processName: "ccr-bot-" + sessionId.slice(6, 14),
    cliSessionId: "",
    cwd,
    userSelectedFolders: [cwd],
    createdAt: now,
    lastActivityAt: now,
    model: nonEmptyEnv("CCR_CLAUDE_CODE_MODEL") || nonEmptyEnv("CODEXL_CLAUDE_CODE_MODEL") || agentEnv(codexRuntimeAgent(), "MODEL") || DEFAULT_MODEL,
    isArchived: false,
    title,
    vmProcessName: "ccr-bot-" + sessionId.slice(6, 14),
    hostLoopMode: true,
    initialMessage: text
  };
  fs.mkdirSync(parentDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(metadata, null, 2));
  return { file, sessionId, cwd, claudeConfigDir, title, lastActivityAt: now };
}

function defaultClaudeAppLocalAgentParentDir(root) {
  const config = readJsonFile(path.join(nonEmptyEnv("CLAUDE_CONFIG_DIR") || path.join(os.homedir(), ".claude"), ".claude.json")) || {};
  const account = config.oauthAccount && typeof config.oauthAccount === "object" ? config.oauthAccount : {};
  const accountPrefix = uuidPrefix(stringValue(account.accountUuid)) || "ccr";
  const orgPrefix = uuidPrefix(stringValue(account.organizationUuid)) || "00000000";
  return path.join(root, accountPrefix, orgPrefix);
}

function claudeAppSessionTemplateFields(value) {
  if (!value || typeof value !== "object") return {};
  const output = {};
  for (const key of [
    "slashCommands",
    "enabledMcpTools",
    "remoteMcpServersConfig",
    "egressAllowedDomains",
    "orgCliExecPolicies",
    "memoryEnabled",
    "skillsEnabled",
    "pluginsEnabled",
    "systemPrompt",
    "systemPromptRendererAppends",
    "accountName",
    "emailAddress"
  ]) {
    if (value[key] !== undefined) output[key] = clone(value[key]);
  }
  return output;
}

function copyClaudeConfigTemplate(claudeConfigDir, template) {
  const targetDir = expandHome(claudeConfigDir);
  fs.mkdirSync(targetDir, { recursive: true });
  copyClaudeConfigFile(targetDir, ".claude.json", claudeConfigSourceDirs(template, "session-first"));
  copyClaudeConfigFile(targetDir, "settings.json", claudeConfigSourceDirs(template, "base-first"));
  if (!fs.existsSync(path.join(targetDir, ".claude.json"))) {
    fs.writeFileSync(path.join(targetDir, ".claude.json"), JSON.stringify({ firstStartTime: new Date().toISOString() }, null, 2));
  }
}

function ensureClaudeSessionConfig(claudeConfigDir) {
  const targetDir = expandHome(claudeConfigDir);
  if (!targetDir) return;
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    copyClaudeConfigFile(targetDir, "settings.json", claudeConfigSourceDirs(null, "base-first"));
    if (!fs.existsSync(path.join(targetDir, ".claude.json"))) {
      copyClaudeConfigFile(targetDir, ".claude.json", claudeConfigSourceDirs(null, "base-first"));
    }
  } catch (error) {
    log("claude_session_config_ensure_failed", { claudeConfigDir: targetDir, error: formatError(error) });
  }
}

function copyClaudeConfigFile(targetDir, filename, sourceDirs) {
  const target = path.join(targetDir, filename);
  if (fs.existsSync(target)) return false;
  for (const sourceDir of sourceDirs) {
    const source = path.join(sourceDir, filename);
    if (source === target) continue;
    try {
      if (!fs.existsSync(source)) continue;
      fs.copyFileSync(source, target);
      log("claude_session_config_copied", { filename, sourceDir, targetDir });
      return true;
    } catch (error) {
      log("claude_session_config_copy_failed", { filename, sourceDir, targetDir, error: formatError(error) });
    }
  }
  return false;
}

function claudeConfigSourceDirs(template, order) {
  const base = [
    nonEmptyEnv("CCR_CLAUDE_BASE_CONFIG_DIR"),
    nonEmptyEnv("CLAUDE_CONFIG_DIR"),
    path.join(os.homedir(), ".claude")
  ];
  const session = [
    template && template.claudeConfigDir ? template.claudeConfigDir : "",
    inferBaseClaudeConfigDirFromSession(template && template.claudeConfigDir ? template.claudeConfigDir : "")
  ];
  return uniqueExistingDirs(order === "session-first" ? [...session, ...base] : [...base, ...session]);
}

function inferBaseClaudeConfigDirFromSession(value) {
  const text = String(value || "");
  const marker = path.sep + ".claude-code-router" + path.sep;
  const index = text.indexOf(marker);
  return index > 0 ? text.slice(0, index) : "";
}

function uniqueExistingDirs(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const dir = expandHome(value || "");
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    if (fs.existsSync(dir)) output.push(dir);
  }
  return output;
}

function claudeSettingsEnv(claudeConfigDir) {
  const settings = readJsonFile(path.join(claudeConfigDir, "settings.json"));
  const raw = settings && typeof settings === "object" && settings.env && typeof settings.env === "object" ? settings.env : null;
  if (!raw) return {};
  const env = {};
  for (const [key, value] of Object.entries(raw)) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

function readClaudeAppLocalAgentSession(file) {
  const metadata = readJsonFile(file);
  if (!metadata || typeof metadata !== "object") return {};
  return {
    cliSessionId: stringValue(metadata.cliSessionId) || stringValue(metadata.cli_session_id) || "",
    claudeConfigDir: claudeAppSessionConfigDir(file, metadata)
  };
}

function updateClaudeAppLocalAgentSession(thread, updates) {
  const file = thread && thread.claudeAppSessionFile;
  if (!file) return;
  const metadata = readJsonFile(file);
  if (!metadata || typeof metadata !== "object") return;
  if (updates.cliSessionId) metadata.cliSessionId = updates.cliSessionId;
  if (updates.lastActivityAt) metadata.lastActivityAt = updates.lastActivityAt;
  if (updates.title && !metadata.title) metadata.title = updates.title;
  try {
    fs.writeFileSync(file, JSON.stringify(metadata, null, 2));
  } catch (error) {
    log("claude_app_session_update_failed", { file, error: formatError(error) });
  }
}

function promptTitle(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "Bot message";
  return value.length > 48 ? value.slice(0, 48) : value;
}

function uuidPrefix(value) {
  const text = stringValue(value);
  if (!text) return "";
  return text.split("-")[0] || "";
}

function readJsonFile(file) {
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(expandHome(file), "utf8"));
  } catch {
    return null;
  }
}

function listClaudeAppSessionFiles(root, maxDepth) {
  const files = [];
  const visit = (dir, depth) => {
    if (depth < 0) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, depth - 1);
      } else if (entry.isFile() && entry.name.startsWith("local_") && entry.name.endsWith(".json")) {
        files.push(fullPath);
      }
    }
  };
  visit(root, maxDepth);
  return files;
}

function claudeAppSessionConfigDir(file, value) {
  const candidates = [];
  const cwd = stringValue(value && value.cwd);
  if (cwd) candidates.push(path.join(path.dirname(expandHome(cwd)), ".claude"));
  const sessionId = stringValue(value && value.sessionId) || path.basename(file, ".json");
  if (sessionId) candidates.push(path.join(path.dirname(file), sessionId, ".claude"));
  candidates.push(path.join(path.dirname(file), ".claude"));
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function fileMtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function botEventText(event) {
  const direct = valueStringAtPaths(event, [
    "/message/text",
    "/message/content",
    "/raw/message/text",
    "/raw/message/content",
    "/raw/text/content",
    "/raw/content/text",
    "/raw/content",
    "/text",
    "/content"
  ]);
  if (direct) return direct;
  return valueStringAtPaths(event, [
    "/message/transcript",
    "/message/transcription",
    "/message/voiceText",
    "/message/voice_text",
    "/message/audioText",
    "/message/audio_text",
    "/raw/transcript",
    "/raw/transcription",
    "/raw/voiceText",
    "/raw/voice_text",
    "/raw/audioText",
    "/raw/audio_text"
  ]) || "";
}

function botInteractionText(event) {
  if (!event || !String(event.type || "").includes("interaction")) return "";
  return valueStringAtPaths(event, [
    "/raw/value",
    "/raw/action/value",
    "/raw/actions/0/value",
    "/raw/data/value",
    "/message/richText/value"
  ]);
}

function botEventAttachments(event) {
  const candidates = [
    valueAtPointer(event, "/message/attachments"),
    valueAtPointer(event, "/raw/attachments"),
    valueAtPointer(event, "/raw/message/attachments")
  ];
  const values = candidates.find(Array.isArray) || [];
  return values.filter((item) => item && typeof item === "object").map((item, index) => ({
    id: stringValue(item.id) || "attachment-" + (index + 1),
    type: stringValue(item.type) || "unknown",
    url: stringValue(item.url) || stringValue(item.href) || stringValue(item.downloadUrl),
    name: stringValue(item.name) || stringValue(item.filename) || "attachment-" + (index + 1),
    mimeType: stringValue(item.mimeType) || stringValue(item.contentType),
    sizeBytes: Number(item.sizeBytes || item.size || 0) || 0,
    raw: item.raw
  }));
}

async function botInputForEvent(event, text, config, destinationDir) {
  const input = [{ type: "text", text }];
  if (!config.mediaEnabled) return input;
  const attachments = botEventAttachments(event);
  for (const attachment of attachments) {
    if (attachment.sizeBytes > config.maxAttachmentBytes) {
      input.push({ type: "text", text: "Attachment skipped because it exceeds the configured size limit: " + attachment.name });
      continue;
    }
    const file = await materializeBotAttachment(attachment, destinationDir, config.maxAttachmentBytes);
    if (file) {
      if (attachment.type === "image" || String(attachment.mimeType).startsWith("image/")) {
        input.push({ type: "image", path: file, mimeType: attachment.mimeType || mimeTypeForPath(file) });
      } else {
        input.push({ type: "text", text: "User attachment available at: " + file + (attachment.mimeType ? " (" + attachment.mimeType + ")" : "") });
      }
    } else if (attachment.url) {
      input.push({ type: "text", text: "User attachment: " + attachment.name + "\nURL: " + attachment.url });
    }
  }
  return input;
}

async function botPromptWithAttachments(event, text, config, destinationDir) {
  const input = await botInputForEvent(event, text, config, destinationDir);
  return botPromptFromInput(input);
}

function botPromptFromInput(input) {
  const lines = [];
  for (const item of Array.isArray(input) ? input : []) {
    if (item.type === "text") lines.push(item.text);
    else if (item.path) lines.push("User image attachment: " + item.path);
    else if (item.url) lines.push("User image attachment: " + item.url);
  }
  return lines.filter(Boolean).join("\n\n");
}

function botImagePathsFromInput(input) {
  return (Array.isArray(input) ? input : [])
    .filter((item) => item && (item.type === "image" || item.type === "localImage") && item.path)
    .map((item) => String(item.path));
}

async function materializeBotAttachment(attachment, destinationDir, maxBytes) {
  if (!attachment.url || !/^https?:\/\//i.test(attachment.url)) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(attachment.url, { signal: controller.signal });
    if (!response.ok) return "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxBytes) return "";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) return "";
    const filename = safeAttachmentFilename(attachment.name || attachment.id);
    const directory = path.resolve(expandHome(destinationDir));
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, Date.now() + "-" + filename);
    fs.writeFileSync(file, buffer, { mode: 0o600 });
    return file;
  } catch (error) {
    log("bot_attachment_download_failed", { name: attachment.name, error: formatError(error) });
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function safeAttachmentFilename(value) {
  const basename = path.basename(String(value || "attachment")).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return basename || "attachment";
}

async function sendBotTurnArtifacts(event, bridge, turn, cwd, keyPrefix) {
  const results = Array.isArray(turn && turn.toolItems) ? turn.toolItems.map((item) => String(item.result || "")) : [];
  return sendBotTextArtifacts(event, bridge, [String(turn && turn.agentText || ""), ...results].join("\n"), cwd, keyPrefix);
}

async function sendBotTextArtifacts(event, bridge, text, cwd, keyPrefix) {
  if (!bridge.config.mediaEnabled) return;
  const files = localArtifactPaths(text, cwd).slice(0, 8);
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > bridge.config.maxAttachmentBytes) continue;
    await bridge.sendMediaToEvent(event, {
      url: pathToFileURL(file).href,
      filename: path.basename(file),
      mimeType: mimeTypeForPath(file),
      sizeBytes: stat.size,
      raw: { path: file }
    }, path.basename(file), keyPrefix + ":" + index);
  }
}

function localArtifactPaths(text, cwd) {
  const matches = [];
  const value = String(text || "");
  const patterns = [/\]\((\/[^)]+)\)/g, /\x60(\/[^\x60]+)\x60/g, /(?:^|\s)(\/[^\s"'<>]+\.[A-Za-z0-9]{1,10})(?=\s|$)/gm];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(value))) {
      let file = match[1].trim();
      try { file = decodeURIComponent(file); } catch { /* Keep the original path. */ }
      try {
        const resolved = fs.realpathSync(file);
        if (!pathIsInside(resolved, cwd) || !fs.statSync(resolved).isFile()) continue;
        if (!matches.includes(resolved)) matches.push(resolved);
      } catch { /* Ignore non-local paths. */ }
    }
  }
  return matches;
}

function conversationRefFromEvent(event) {
  if (!event || !event.conversation || typeof event.conversation !== "object") return null;
  const conversation = event.conversation;
  const platformConversationId = eventString(conversation, "id") || eventString(conversation, "platformConversationId");
  const gatewayConversationId = eventString(conversation, "gatewayConversationId");
  if (!platformConversationId && !gatewayConversationId) return null;
  const rawType = eventString(conversation, "type");
  const type = ["dm", "group", "channel", "thread"].includes(rawType) ? rawType : "dm";
  const ref = {
    ...(gatewayConversationId ? { gatewayConversationId } : {}),
    ...(platformConversationId ? { platformConversationId } : {}),
    type
  };
  const threadId = event.message && typeof event.message === "object" ? eventString(event.message, "threadId") : "";
  if (threadId) ref.threadId = threadId;
  const contextToken = valueStringAtPaths(event, ["/raw/context_token", "/raw/sessionWebhook", "/raw/contextToken"]);
  if (contextToken) ref.contextToken = contextToken;
  return ref;
}

function eventIdFromQueued(queued, event) {
  return eventString(queued, "id") ||
    eventString(event, "id") ||
    valueStringAtPaths(event, ["/message/id", "/message/messageId", "/raw/message/id", "/raw/messageId", "/raw/msgId"]);
}

function botEventDedupeKey(event) {
  const conversation = event && event.conversation && typeof event.conversation === "object" ? event.conversation : {};
  return [
    eventString(event, "tenantId"),
    eventString(event, "integrationId"),
    eventString(conversation, "id") || eventString(conversation, "gatewayConversationId"),
    valueStringAtPaths(event, ["/message/id", "/message/messageId", "/raw/message/id", "/raw/messageId", "/raw/msgId"]),
    botEventText(event),
    valueStringAtPaths(event, ["/message/createdAt", "/message/timestamp", "/raw/createAt", "/raw/timestamp"])
  ].join(":");
}

function botConversationKey(event) {
  const conversation = event && event.conversation && typeof event.conversation === "object" ? event.conversation : {};
  return [
    eventString(event, "tenantId"),
    eventString(event, "integrationId"),
    eventString(conversation, "id") || eventString(conversation, "gatewayConversationId") || "default",
    event.message && typeof event.message === "object" ? eventString(event.message, "threadId") : ""
  ].join(":");
}

function valueStringAtPaths(value, paths) {
  for (const path of paths) {
    const candidate = valueAtPointer(value, path);
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (Number.isFinite(candidate) || typeof candidate === "boolean") return String(candidate);
  }
  return "";
}

function valueAtPointer(value, pointer) {
  if (!value || typeof pointer !== "string" || !pointer.startsWith("/")) return undefined;
  let current = value;
  for (const rawPart of pointer.slice(1).split("/")) {
    if (current === null || current === undefined) return undefined;
    const part = rawPart.replace(/~1/g, "/").replace(/~0/g, "~");
    current = current[part];
  }
  return current;
}

function eventString(value, key) {
  return value && typeof value[key] === "string" ? value[key].trim() : "";
}

function jsonObjectEnv(name) {
  const text = nonEmptyEnv(name);
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function jsonArrayEnv(name) {
  const text = nonEmptyEnv(name);
  if (!text) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function listEnv(name) {
  const value = process.env[name];
  if (!value) return [];
  return value.split(/\r?\n|,/g).map((item) => item.trim()).filter(Boolean);
}

function boolEnv(name) {
  const value = process.env[name];
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function safePathSegment(value) {
  const segment = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  return segment || "default";
}

function waitForChild(child) {
  return waitForChildResult(child).then((result) => result.exitCode);
}

function waitForChildResult(child) {
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({
      code,
      signal,
      exitCode: code ?? signalExitCode(signal)
    }));
    child.on("error", () => resolve({ code: 1, signal: null, exitCode: 1 }));
  });
}

function signalExitCode(signal) {
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  if (signal === "SIGKILL") return 137;
  return 1;
}

function activeKey(threadId, turnId) {
  return String(threadId || "") + "\0" + String(turnId || "");
}

function latestThread(threads) {
  let latest = null;
  for (const thread of threads.values()) {
    if (!latest || (thread.updatedAt || 0) > (latest.updatedAt || 0)) {
      latest = thread;
    }
  }
  return latest;
}

function findActiveForThread(active, threadId) {
  for (const [key, value] of active) {
    if (value.threadId === threadId) return { ...value, key };
  }
  return undefined;
}

function normalizeWorkspaceRoots(value, cwd) {
  const roots = Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
  return roots.length ? roots : [cwd];
}

function combinedDeveloperInstructions(params) {
  return params.developerInstructions || params.developer_instructions || null;
}

function normalizeCwd(value) {
  return expandHome(String(value || process.cwd()));
}

function requestWorkspaceCwd(value, method) {
  const params = value.params || {};
  if (["config/read", "thread/resume", "turn/start"].includes(method) && typeof params.cwd === "string") return params.cwd.trim();
  if (method === "hooks/list" && Array.isArray(params.cwds) && params.cwds.length === 1) return String(params.cwds[0]).trim();
  return "";
}

function contentContainsToolUse(content) {
  return asArray(content).some((item) => ["tool_use", "server_tool_use", "mcp_tool_use"].includes(item && item.type));
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(textFromContent).filter(Boolean).join("");
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.content === "string") return content.content;
    if (content.content) return textFromContent(content.content);
  }
  return "";
}

function asArray(value) {
  return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
}

function parseToolArguments(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { partial_json: value };
  }
}

function firstString(value, pointers) {
  for (const p of pointers) {
    const item = pointer(value, p);
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  return undefined;
}

function pointer(value, p) {
  const parts = p.split("/").slice(1).map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current = value;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function controlRequestId(message) {
  return stringValue(message.request_id) || stringValue(message.id) || uuid();
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function jsonRpcIdKey(id) {
  if (typeof id === "string") return id;
  if (typeof id === "number" || typeof id === "boolean") return String(id);
  return undefined;
}

function safeReadBase64(file) {
  try {
    return fs.readFileSync(expandHome(file)).toString("base64");
  } catch {
    return "";
  }
}

function mimeTypeForPath(file) {
  const ext = String(file || "").toLowerCase().split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

function splitShellLike(value) {
  if (!value.trim()) return [];
  const result = [];
  let current = "";
  let quote = "";
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (ch === quote) quote = "";
      else current += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        result.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) result.push(current);
  return result;
}

function agentItemIdForTurn(turnId) {
  return "agent-" + turnId;
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withoutKeys(env, keys) {
  const next = { ...env };
  for (const key of keys) delete next[key];
  return next;
}

function childEnvForAgent(agent) {
  const next = withoutKeys(process.env, ["CODEX_CLI_PATH", "ZCODE_CLI_PATH", "CCR_REAL_CODEX_CLI_PATH", "CODEXL_REAL_CODEX_CLI_PATH", "CCR_REAL_ZCODE_CLI_PATH", "CODEXL_REAL_ZCODE_CLI_PATH"]);
  const blockedPrefixes = agent === "zcode" ? ["CCR_CODEX_", "CODEXL_CODEX_"] : ["CCR_ZCODE_", "CODEXL_ZCODE_"];
  for (const key of Object.keys(next)) {
    if (blockedPrefixes.some((prefix) => key.startsWith(prefix))) {
      delete next[key];
    }
  }
  if (agent === "zcode") {
    delete next.CODEX_HOME;
    delete next.CODEX_ELECTRON_USER_DATA_PATH;
  } else {
    delete next.ZCODE_HOME;
    delete next.ZCODE_STORAGE_DIR;
    delete next.ZCODE_ELECTRON_USER_DATA_PATH;
  }
  return next;
}

function nonEmptyEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function nonEmptyEnvFrom(env, name) {
  const value = env?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function codexRuntimeAgent() {
  return nonEmptyEnv("CCR_ZCODE_PROFILE") ||
    nonEmptyEnv("CODEXL_ZCODE_PROFILE") ||
    nonEmptyEnv("CCR_REAL_ZCODE_CLI_PATH") ||
    nonEmptyEnv("CODEXL_REAL_ZCODE_CLI_PATH") ||
    nonEmptyEnv("ZCODE_CLI_PATH") ||
    nonEmptyEnv("ZCODE_STORAGE_DIR") ||
    nonEmptyEnv("ZCODE_HOME")
    ? "zcode"
    : "codex";
}

function codexRuntimeRealCli(agent) {
  if (agent === "zcode") {
    return nonEmptyEnv("CCR_REAL_ZCODE_CLI_PATH") ||
      nonEmptyEnv("CODEXL_REAL_ZCODE_CLI_PATH") ||
      nonEmptyEnv("ZCODE_CLI_PATH") ||
      "zcode";
  }
  return nonEmptyEnv("CCR_REAL_CODEX_CLI_PATH") ||
    nonEmptyEnv("CODEXL_REAL_CODEX_CLI_PATH") ||
    nonEmptyEnv("CODEX_CLI_PATH") ||
    "codex";
}

function codexRuntimeHome() {
  const agent = codexRuntimeAgent();
  if (agent === "zcode") {
    return process.env.ZCODE_STORAGE_DIR || process.env.ZCODE_HOME || path.join(os.homedir(), ".zcode");
  }
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function agentEnv(agent, primarySuffix, secondarySuffix) {
  const suffixes = [primarySuffix, secondarySuffix].filter(Boolean);
  const prefixes = agent === "zcode"
    ? ["CCR_ZCODE_", "CODEXL_ZCODE_"]
    : ["CCR_CODEX_", "CODEXL_CODEX_"];
  for (const suffix of suffixes) {
    for (const prefix of prefixes) {
      const value = nonEmptyEnv(prefix + suffix);
      if (value) return value;
    }
  }
  return "";
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeConfigFormat(value) {
  return "separate_profile_files";
}

function normalizeRemoteFrontendMode(value) {
  const normalized = String(value || "").replace(/_/g, "-").toLowerCase();
  return normalized === "cli" || normalized === "claude-code" ? normalized : "app";
}

function normalizeProfileSurface(value) {
  const normalized = String(value || "").replace(/_/g, "-").toLowerCase();
  return normalized === "cli" || normalized === "app" ? normalized : "auto";
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function tomlEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

function formatError(error) {
  return error && error.stack ? error.stack : error && error.message ? error.message : String(error);
}

function log(event, fields) {
  if (!LOG_PATH) return;
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify({ tsMs: Date.now(), event, ...fields }) + "\n");
  } catch {
  }
}

main().catch((error) => {
  log("fatal", { error: formatError(error) });
  process.stderr.write(formatError(error) + "\n");
  process.exitCode = 1;
});
`;
}
