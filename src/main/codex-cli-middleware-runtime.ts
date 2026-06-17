export function codexCliMiddlewareRuntimeScript(): string {
  return String.raw`#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

const VERSION = "3.0.0";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const PROTOCOL_VERSION = "2025-06-18";
const REQUEST_TIMEOUT_MS = numberEnv("CCR_CODEX_APP_REQUEST_TIMEOUT_MS", 10 * 60 * 1000);
const TURN_IDLE_TIMEOUT_MS = numberEnv("CCR_CODEX_CLAUDE_TURN_IDLE_TIMEOUT_MS", 10 * 60 * 1000);
const CONFIG_DIR = path.join(os.homedir(), ".claude-code-router");
const LOG_PATH = process.env.CCR_CODEX_CLI_MIDDLEWARE_LOG || path.join(CONFIG_DIR, "codex-cli-middleware.log");

async function main() {
  const args = process.argv.slice(2);
  if (shouldRunClaudeCodeAppServer(args)) {
    await runClaudeCodeAppServer(args);
    return;
  }
  await runCodexCliMiddleware(args.length === 0 ? ["app-server", "--analytics-default-enabled"] : args);
}

async function runCodexCliMiddleware(args) {
  const realCli = expandHome(nonEmptyEnv("CCR_REAL_CODEX_CLI_PATH") || nonEmptyEnv("CODEXL_REAL_CODEX_CLI_PATH") || nonEmptyEnv("CODEX_CLI_PATH") || "codex");
  const profile = nonEmptyEnv("CCR_CODEX_PROFILE") || nonEmptyEnv("CODEXL_CODEX_PROFILE");
  const modelProvider = nonEmptyEnv("CCR_CODEX_MODEL_PROVIDER") || nonEmptyEnv("CODEXL_CODEX_MODEL_PROVIDER") || profile;
  const configFormat = normalizeConfigFormat(nonEmptyEnv("CCR_CODEX_PROFILE_CONFIG_FORMAT") || nonEmptyEnv("CODEXL_CODEX_PROFILE_CONFIG_FORMAT"));
  const realArgs = realCliArgs(profile, modelProvider, configFormat, args);
  log("codex_cli_start", { realCli, realArgs });
  const child = childProcess.spawn(realCli, realArgs, {
    env: withoutKeys(process.env, ["CODEX_CLI_PATH", "CCR_REAL_CODEX_CLI_PATH", "CODEXL_REAL_CODEX_CLI_PATH"]),
    stdio: ["pipe", "pipe", "inherit"]
  });
  child.on("error", (error) => {
    log("codex_cli_spawn_error", { error: formatError(error) });
  });

  const requestMap = new Map();
  const current = { cwd: "" };
  const stdinRl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  stdinRl.on("line", (line) => {
    const custom = customAppServerLineResponse(line);
    if (custom) {
      writeLine(process.stdout, custom);
      return;
    }
    trackRequestLine(line, requestMap, current);
    child.stdin.write(line + "\n");
  });
  stdinRl.on("close", () => child.stdin.end());

  const stdoutRl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity, terminal: false });
  stdoutRl.on("line", (line) => {
    const rewritten = rewriteCodexStdoutLine(line, requestMap);
    if (!shouldSuppressBotBridgeLine(rewritten)) {
      process.stdout.write(rewritten + "\n");
    }
  });

  const code = await waitForChild(child);
  log("codex_cli_exit", { code });
  process.exitCode = code;
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

function rewriteCodexStdoutLine(line, requestMap) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return line;
  }
  const id = typeof value.id === "string" ? value.id : undefined;
  if (!id || !requestMap.has(id)) return line;
  const request = requestMap.get(id);
  requestMap.delete(id);
  if (value.error) return line;
  if (request.method === "account/read") {
    value.result = mockAccountRead();
  } else if (request.method === "getAuthStatus") {
    value.result = mockAuthStatus(request.includeToken);
  } else if (request.method === "thread/list") {
    value = mergeForeignThreadList(value, request.params);
  }
  return JSON.stringify(value);
}

function trackRequestLine(line, requestMap, current) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return;
  }
  const id = typeof value.id === "string" ? value.id : undefined;
  const method = typeof value.method === "string" ? value.method : undefined;
  if (!id || !method) return;
  const cwd = requestWorkspaceCwd(value, method);
  if (cwd) current.cwd = cwd;
  if (!["account/read", "getAuthStatus", "thread/list", "config/read", "model/list"].includes(method)) return;
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
  if (value && value.type === "fetch" && String(value.method || "").toUpperCase() === "POST" && fetchUrlIsTranscribe(value.url)) {
    return {
      requestId: value.requestId || value.id || uuid(),
      status: 501,
      ok: false,
      body: JSON.stringify({ error: "Transcribe is not available in CCR middleware." }),
      headers: { "content-type": "application/json" }
    };
  }
  return undefined;
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

function parseAppServerOptions(args) {
  let workspaceName = nonEmptyEnv("CCR_CODEX_WORKSPACE_NAME") || nonEmptyEnv("CODEXL_CODEX_WORKSPACE_NAME") || nonEmptyEnv("CODEXL_CODEX_INSTANCE_NAME") || "Claude Code";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--workspace-name" && args[i + 1]) {
      workspaceName = args[i + 1];
      i += 1;
    }
  }
  return { workspaceName };
}

function shouldRunClaudeCodeAppServer(args) {
  const mode = normalizeRemoteFrontendMode(nonEmptyEnv("CCR_CODEX_REMOTE_FRONTEND_MODE") || nonEmptyEnv("CODEXL_CODEX_CORE_MODE"));
  const nextArgs = args.length === 0 ? ["app-server"] : args;
  return mode === "claude-code" && nextArgs[0] === "app-server";
}

class ClaudeCodeAppServer {
  constructor(options) {
    this.workspaceName = options.workspaceName || "Claude Code";
    this.threads = new Map();
    this.active = new Map();
    this.appResponses = new Map();
    this.configValues = {};
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
          codexHome: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
          platformFamily: process.platform === "win32" ? "windows" : "unix",
          platformOs: process.platform
        });
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

  createThread(params) {
    const id = uuid();
    const cwd = normalizeCwd(params.cwd);
    const now = nowSeconds();
    const thread = {
      id,
      sessionId: id,
      claudeSessionId: id,
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
      model: params.model || nonEmptyEnv("CCR_CODEX_MODEL") || DEFAULT_MODEL,
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
      resumeExisting: thread.turns.length > 1,
      model: thread.model
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
    log("claude_turn_spawn", { threadId: work.threadId, turnId: work.turnId, command: command.command, args: command.args });
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
      child.stdin.write(JSON.stringify(claudeInputMessage(work.input.length ? work.input : [{ type: "text", text: work.prompt }])) + "\n");
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
      latestUsage: null,
      tools: new Map(),
      toolIndex: new Map(),
      toolDelta: new Map()
    };
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

    const code = await waitForChild(child);
    clearInterval(idle);
    this.active.delete(key);
    const text = stream.resultText || stream.emitted || stream.pending;
    turn.agentText = text;
    turn.error = stream.resultError || (childSpawnError ? formatError(childSpawnError) : code === 0 ? null : stderr.trim() || "Claude Code exited with code " + code);
    turn.status = turn.error ? "failed" : "completed";
    turn.completedAt = nowSeconds();
    turn.durationMs = Date.now() - started;
    turn.toolItems = Array.from(stream.tools.values()).map((tool) => toolItemJson(work.threadId, work.cwd, tool));
    thread.updatedAt = turn.completedAt;
    thread.latestTokenUsageInfo = stream.latestUsage;
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
  writeNotification("item/updated", {
    threadId: work.threadId,
    turnId: work.turnId,
    item: { id: work.agentItemId, type: "agentMessage", text: stream.emitted, status: "inProgress" },
    delta: text,
    updatedAtMs: Date.now()
  });
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
  const args = [
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--verbose"
  ];
  const model = nonEmptyEnv("CCR_CLAUDE_CODE_MODEL") || nonEmptyEnv("CODEXL_CLAUDE_CODE_MODEL") || work.model;
  if (model) args.push("--model", model);
  if (work.resumeExisting) args.push("--resume", work.threadId);
  const extra = splitShellLike(nonEmptyEnv("CCR_CLAUDE_CODE_EXTRA_ARGS") || nonEmptyEnv("CODEXL_CLAUDE_CODE_EXTRA_ARGS") || "");
  args.push(...extra);
  return {
    command,
    args,
    env: {
      ...process.env,
      CODEX_SESSION_ID: work.threadId,
      CODEX_THREAD_ID: work.threadId,
      CODEX_TURN_ID: work.turnId
    }
  };
}

function claudeInputMessage(input) {
  return {
    type: "user",
    session_id: "",
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

function modelList(params) {
  const configured = nonEmptyEnv("CCR_CODEX_MODEL") || nonEmptyEnv("CODEXL_CLAUDE_CODE_MODEL") || DEFAULT_MODEL;
  const models = Array.from(new Set([configured, DEFAULT_MODEL, "claude-opus-4-5", "claude-haiku-4-5"].filter(Boolean))).map((model) => ({
    id: model,
    model,
    name: model,
    label: model,
    provider: "claude-code"
  }));
  const offset = Number(params.cursor || 0) || 0;
  const limit = Number(params.limit || models.length) || models.length;
  const data = models.slice(offset, offset + limit);
  return { data, models: data, nextCursor: offset + limit < models.length ? String(offset + limit) : null };
}

function configRead(params, values) {
  const cwd = params.cwd || process.cwd();
  return {
    config: {
      ...values,
      cwd,
      model: nonEmptyEnv("CCR_CODEX_MODEL") || DEFAULT_MODEL,
      model_provider: nonEmptyEnv("CCR_CODEX_MODEL_PROVIDER") || "claude-code",
      approval_policy: "default",
      sandbox_mode: "workspace-write"
    }
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

function mockAccountRead() {
  const email = nonEmptyEnv("CCR_CODEX_WORKSPACE_NAME") || nonEmptyEnv("CODEXL_CODEX_WORKSPACE_NAME") || "Claude Code";
  return { account: { type: "chatgpt", email, planType: "unknown" }, requiresOpenaiAuth: false };
}

function mockAuthStatus(includeToken) {
  const result = { authMethod: "chatgpt", account: mockAccountRead().account, requiresOpenaiAuth: false };
  if (includeToken) result.authToken = null;
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
    cwd: work.cwd,
    reason: "Claude Code wants to use " + label + ".",
    permissions: { network: { enabled: true }, fileSystem: { read: [work.cwd], write: [work.cwd] } }
  };
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
    : { behavior: "deny", message: "Denied in Codex App" };
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
  throw new Error("Timed out waiting for Codex App response: " + requestId);
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
  writeLine(process.stdout, value);
}

function writeLine(stream, value) {
  stream.write(JSON.stringify(value) + "\n");
}

function waitForChild(child) {
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve(code ?? (signal === "SIGINT" ? 130 : 1)));
    child.on("error", () => resolve(1));
  });
}

function activeKey(threadId, turnId) {
  return String(threadId || "") + "\0" + String(turnId || "");
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

function nonEmptyEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeConfigFormat(value) {
  return String(value || "").replace(/-/g, "_").toLowerCase() === "separate_profile_files" ? "separate_profile_files" : "legacy";
}

function normalizeRemoteFrontendMode(value) {
  const normalized = String(value || "").replace(/_/g, "-").toLowerCase();
  return normalized === "cli" || normalized === "claude-code" ? normalized : "app";
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
