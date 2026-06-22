import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig, ProfileOpenCommandResult, ProfileOpenRequest, ProfileOpenResult, ProfileRuntimeEntry, ProfileRuntimeStatus, ProfileStopResult } from "../shared/app";
import { botGatewayProfileEnv } from "./bot-gateway-env";
import { applyClaudeAppGatewayConfig } from "./claude-app-gateway-service";
import { launchClaudeAppProfile, resolveClaudeAppProfileUserDataDir } from "./claude-app-launch";
import { launchCodexAppProfile } from "./codex-app-launch";
import { codexCliMiddlewareRuntimeScript } from "./codex-cli-middleware-runtime";
import { CONFIGDIR } from "./constants";
import { gatewayService } from "./gateway/service";
import { buildProfileLaunchPlan, findProfileForOpen, profileOpenCommand, resolveClaudeCodeSettingsFile, resolveProfileOpenSurface } from "./profile-launch-core";
import { applyProfileConfig } from "./profile-service";

const ccrPathBlockStart = "# >>> Claude Code Router CLI >>>";
const ccrPathBlockEnd = "# <<< Claude Code Router CLI <<<";
let claudeAppBotWorker: ChildProcess | undefined;
let claudeAppBotWorkerProfileId: string | undefined;

type ProfileAppLaunchResult = {
  child: ChildProcess;
  command: string;
  pidIsLauncher?: boolean;
  pid?: number;
  userDataDir: string;
};

type RunningProfileApp = ProfileRuntimeEntry & {
  child: ChildProcess;
  command: string;
  pidIsLauncher?: boolean;
  stopRequested?: boolean;
  userDataDir: string;
};

process.once("exit", () => stopClaudeAppBotWorker());

export async function getProfileOpenCommand(config: AppConfig, request: ProfileOpenRequest): Promise<ProfileOpenCommandResult> {
  await applyProfileConfig(config);
  const profile = findProfileForOpen(config, request.profileId);
  const surface = resolveProfileOpenSurface(profile, request.surface);
  ensureCcrCliLauncher();
  return {
    command: profileOpenCommand(profile, surface, "ccr", commandProfileRef(config, profile)),
    profileId: profile.id,
    profileName: profile.name,
    surface
  };
}

export async function openProfileFromCcr(config: AppConfig, request: ProfileOpenRequest): Promise<ProfileOpenResult> {
  await applyProfileConfig(config);
  const profile = findProfileForOpen(config, request.profileId);
  const surface = resolveProfileOpenSurface(profile, request.surface);
  if (profile.agent === "claude-code" && surface === "app") {
    return openClaudeAppProfile(config, profile);
  }
  if (profile.agent === "codex" && surface === "app") {
    return await openCodexAppProfile(config, profile);
  }
  const plan = buildProfileLaunchPlan(CONFIGDIR, profile, surface);
  if (path.isAbsolute(plan.command) && !existsSync(plan.command)) {
    throw new Error(`Profile launcher was not found: ${plan.command}. Re-save the profile and try again.`);
  }

  const child = spawn(plan.command, plan.args, {
    detached: true,
    env: {
      ...process.env,
      ...plan.env,
      ...botGatewayProfileEnv(config, profile, surface)
    },
    stdio: "ignore"
  });
  child.unref();

  return {
    message: `Opened ${profile.name || profile.id}.`,
    profileId: profile.id,
    profileName: profile.name,
    surface
  };
}

async function openCodexAppProfile(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): Promise<ProfileOpenResult> {
  const existing = runningProfileApp(profile.id, "app");
  if (existing) {
    activateProfileAppWindow(existing);
    return {
      message: `Codex App is already running with ${profile.name || profile.id}.`,
      profileId: profile.id,
      profileName: profile.name,
      surface: "app"
    };
  }
  const entry = registerProfileApp(profile, "app", launchCodexAppProfile(CONFIGDIR, profile, config));
  const started = await waitForProfileAppStart(entry, 12000);
  if (!started) {
    cleanupProfileAppEntry(profileRuntimeKey(profile.id, "app"), entry);
    sendProfileProcessSignal(entry.pid, "SIGTERM");
    throw new Error([
      `Codex App did not open a window for ${profile.name || profile.id}.`,
      `Command: ${entry.command}`,
      `User data: ${entry.userDataDir}`
    ].join(" "));
  }
  activateProfileAppWindow(entry);
  return {
    message: `Opened Codex App with ${profile.name || profile.id}.`,
    profileId: profile.id,
    profileName: profile.name,
    surface: "app"
  };
}

async function openClaudeAppProfile(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): Promise<ProfileOpenResult> {
  const existing = runningProfileApp(profile.id, "app");
  if (existing) {
    activateProfileAppWindow(existing);
    return {
      message: `Claude App is already running with ${profile.name || profile.id}.`,
      profileId: profile.id,
      profileName: profile.name,
      surface: "app"
    };
  }

  const token = findProfileApiKey(config, profile);
  if (!token) {
    throw new Error(`No CCR API key was found for profile "${profile.name || profile.id}". Re-save the profile and try again.`);
  }

  const profileGatewayConfig = {
    ...config,
    APIKEY: token,
    APIKEYS: [
      {
        createdAt: new Date().toISOString(),
        id: profileApiKeyId(profile),
        key: token,
        name: `Profile: ${profile.name?.trim() || profile.id || profile.agent}`
      }
    ],
    Router: {
      ...config.Router,
      ...(profile.model.trim() ? { default: profile.model.trim() } : {})
    }
  };
  applyClaudeAppGatewayConfig(profileGatewayConfig);
  applyClaudeAppGatewayConfig(profileGatewayConfig, {
    backup: false,
    dataDir: resolveClaudeAppProfileUserDataDir(CONFIGDIR, profile)
  });
  const gatewayStatus = gatewayService.getStatus();
  if (gatewayStatus.state === "running") {
    gatewayService.updateConfig(profileGatewayConfig);
  } else {
    const startedStatus = await gatewayService.start(profileGatewayConfig);
    if (startedStatus.state !== "running") {
      throw new Error(startedStatus.lastError || "CCR gateway did not start.");
    }
  }
  activateProfileAppWindow(registerProfileApp(profile, "app", launchClaudeAppProfile(CONFIGDIR, profile, config)));
  startClaudeAppBotWorker(config, profile);
  return {
    message: `Opened Claude App with ${profile.name || profile.id}.`,
    profileId: profile.id,
    profileName: profile.name,
    surface: "app"
  };
}

export function getProfileRuntimeStatus(): ProfileRuntimeStatus {
  cleanupExitedProfileApps();
  return {
    profiles: [...runningProfileApps.values()]
      .filter((entry) => !entry.stopRequested)
      .map((entry) => ({
        agent: entry.agent,
        pid: entry.pid,
        profileId: entry.profileId,
        profileName: entry.profileName,
        startedAt: entry.startedAt,
        state: entry.state,
        surface: entry.surface
      }))
  };
}

export async function stopProfileFromCcr(config: AppConfig, request: ProfileOpenRequest): Promise<ProfileStopResult> {
  const profile = findProfileForOpen(config, request.profileId);
  const surface = resolveProfileOpenSurface(profile, request.surface);
  if (surface !== "app") {
    throw new Error(`${profile.name || profile.id} does not support stopping ${surface.toUpperCase()} from CCR.`);
  }

  const key = profileRuntimeKey(profile.id, surface);
  const entry = runningProfileApps.get(key);
  if (!entry) {
    return {
      message: `No running app was found for ${profile.name || profile.id}.`,
      profileId: profile.id,
      profileName: profile.name,
      stopped: false,
      surface
    };
  }

  const stopped = await stopRunningProfileApp(key, entry);
  if (stopped && profile.agent === "claude-code") {
    stopClaudeAppBotWorker(profile.id);
  }
  return {
    message: stopped
      ? `Stopped ${profile.name || profile.id}.`
      : `Stop requested for ${profile.name || profile.id}. It may take a moment to close.`,
    profileId: profile.id,
    profileName: profile.name,
    stopped,
    surface
  };
}

const runningProfileApps = new Map<string, RunningProfileApp>();

function registerProfileApp(
  profile: ReturnType<typeof findProfileForOpen>,
  surface: ProfileOpenRequest["surface"],
  launch: ProfileAppLaunchResult
): RunningProfileApp {
  const key = profileRuntimeKey(profile.id, surface);
  const existing = runningProfileApps.get(key);
  if (existing && isProcessAlive(existing.pid)) {
    sendProfileProcessSignal(existing.pid, "SIGTERM");
  }

  const entry: RunningProfileApp = {
    agent: profile.agent,
    child: launch.child,
    command: launch.command,
    pid: launch.pid,
    pidIsLauncher: launch.pidIsLauncher,
    profileId: profile.id,
    profileName: profile.name,
    startedAt: new Date().toISOString(),
    state: "running",
    surface,
    userDataDir: launch.userDataDir
  };
  runningProfileApps.set(key, entry);

  launch.child.once("exit", () => {
    if (entry.pidIsLauncher && isProfileAppRunning(entry)) {
      return;
    }
    cleanupProfileAppEntry(key, entry);
  });
  launch.child.once("error", () => cleanupProfileAppEntry(key, entry));
  return entry;
}

function activateProfileAppWindow(entry: Pick<RunningProfileApp, "pid" | "userDataDir">): void {
  if (process.platform !== "darwin") {
    return;
  }
  for (const delayMs of [250, 1200]) {
    setTimeout(() => {
      const pid = profileAppMainPid(entry) ?? entry.pid;
      if (!isProcessAlive(pid)) {
        return;
      }
      try {
        const child = spawn("/usr/bin/osascript", [
          "-e",
          `tell application "System Events" to set frontmost of the first process whose unix id is ${pid} to true`
        ], {
          detached: true,
          stdio: "ignore"
        });
        child.unref();
      } catch {
        // Activation is best-effort; the app process itself has already been started.
      }
    }, delayMs).unref();
  }
}

function runningProfileApp(profileId: string, surface: ProfileOpenRequest["surface"]): RunningProfileApp | undefined {
  const key = profileRuntimeKey(profileId, surface);
  const entry = runningProfileApps.get(key);
  if (!entry) {
    return undefined;
  }
  if (isProfileAppRunning(entry)) {
    entry.stopRequested = false;
    return entry;
  }
  cleanupProfileAppEntry(key, entry);
  return undefined;
}

function cleanupExitedProfileApps(): void {
  for (const [key, entry] of runningProfileApps) {
    if (!isProfileAppRunning(entry)) {
      cleanupProfileAppEntry(key, entry);
    }
  }
}

function cleanupProfileAppEntry(key: string, entry: RunningProfileApp): void {
  if (runningProfileApps.get(key) !== entry) {
    return;
  }
  runningProfileApps.delete(key);
  if (entry.stopRequested && entry.agent === "claude-code") {
    stopClaudeAppBotWorker(entry.profileId);
  }
}

async function stopRunningProfileApp(key: string, entry: RunningProfileApp): Promise<boolean> {
  if (!isProfileAppRunning(entry)) {
    runningProfileApps.delete(key);
    return false;
  }

  entry.stopRequested = true;
  sendProfileProcessSignal(profileAppMainPid(entry) ?? entry.pid, "SIGTERM");
  if (await waitForProfileAppExit(entry, 5000)) {
    runningProfileApps.delete(key);
    return true;
  }

  return false;
}

function profileRuntimeKey(profileId: string, surface: ProfileOpenRequest["surface"]): string {
  return `${surface}:${profileId}`;
}

function isProcessAlive(pid: number | undefined): boolean {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return nodeErrorCode(error) === "EPERM";
  }
}

function isProfileAppRunning(entry: Pick<RunningProfileApp, "pid" | "pidIsLauncher" | "userDataDir">): boolean {
  if (profileAppMainPid(entry)) {
    return true;
  }
  return !entry.pidIsLauncher && isProcessAlive(entry.pid);
}

function profileAppMainPid(entry: Pick<RunningProfileApp, "userDataDir">): number | undefined {
  if (!entry.userDataDir) {
    return undefined;
  }
  const marker = normalizeProcessPath(entry.userDataDir);
  try {
    const result = spawnSync("ps", ["-Ao", "pid=,command="], {
      encoding: "utf8"
    });
    if (result.error || result.status !== 0) {
      return undefined;
    }
    for (const line of result.stdout.split(/\r?\n/)) {
      const match = line.match(/^\s*(\d+)\s+(.+)$/);
      if (!match) {
        continue;
      }
      const pid = Number(match[1]);
      const command = match[2];
      if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) {
        continue;
      }
      if (path.basename(command.trim().split(/\s+/)[0] || "") === "open") {
        continue;
      }
      if (command.includes(" --type=")) {
        continue;
      }
      if (normalizeProcessPath(command).includes(marker)) {
        return pid;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function normalizeProcessPath(value: string): string {
  return process.platform === "win32" ? value.replace(/\\/g, "/").toLowerCase() : value;
}

function sendProfileProcessSignal(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid)], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }

  try {
    process.kill(pid, signal);
  } catch {
    // The app process may have already exited.
  }
}

async function waitForProcessExit(pid: number | undefined, timeoutMs: number): Promise<boolean> {
  if (!pid) {
    return true;
  }
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    await sleep(100);
  }
  return !isProcessAlive(pid);
}

async function waitForProfileAppStart(entry: Pick<RunningProfileApp, "pid" | "pidIsLauncher" | "userDataDir">, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (profileAppMainPid(entry)) {
      return true;
    }
    if (!entry.pidIsLauncher && isProcessAlive(entry.pid)) {
      return true;
    }
    if (!entry.pidIsLauncher && !isProcessAlive(entry.pid)) {
      return false;
    }
    await sleep(100);
  }
  return Boolean(profileAppMainPid(entry)) || (!entry.pidIsLauncher && isProcessAlive(entry.pid));
}

async function waitForProfileAppExit(entry: Pick<RunningProfileApp, "pid" | "pidIsLauncher" | "userDataDir">, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProfileAppRunning(entry)) {
      return true;
    }
    await sleep(100);
  }
  return !isProfileAppRunning(entry);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function startClaudeAppBotWorker(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): void {
  const botEnv = botGatewayProfileEnv(config, profile, "app");
  stopClaudeAppBotWorker();
  if (botEnv.CCR_BOT_GATEWAY_ENABLED !== "true") {
    return;
  }

  const runtimeFile = path.join(CONFIGDIR, "bin", "ccr-codex-cli-middleware.js");
  ensureClaudeBotWorkerRuntime(runtimeFile);

  const settingsFile = resolveClaudeCodeSettingsFile(CONFIGDIR, profile);
  const settingsEnv = readClaudeCodeSettingsEnv(settingsFile);
  const claudeAppUserDataDir = resolveClaudeAppProfileUserDataDir(CONFIGDIR, profile);
  const nodeLaunch = nodeRuntimeLaunch();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...stringRecord(profile.env),
    ...settingsEnv,
    ...botEnv,
    ...(nodeLaunch.electronRunAsNode ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    CCR_CLAUDE_BASE_CONFIG_DIR: path.dirname(settingsFile),
    CLAUDE_CONFIG_DIR: path.dirname(settingsFile),
    CLAUDE_USER_DATA_DIR: claudeAppUserDataDir,
    CCR_CLAUDE_APP_USER_DATA_PATH: claudeAppUserDataDir,
    CCR_CLAUDE_CODE_BOT_WORKER: "1",
    CCR_CLAUDE_CODE_MODEL: profile.model.trim(),
    CCR_CODEX_MODEL: profile.model.trim(),
    CCR_CODEX_WORKSPACE_NAME: profile.name || profile.id,
    CCR_PROFILE_SURFACE: "app",
    CODEXL_CODEX_WORKSPACE_NAME: profile.name || profile.id,
    CODEXL_PROFILE_SURFACE: "app"
  };
  delete env.ELECTRON_NO_ATTACH_CONSOLE;

  const child = spawn(nodeLaunch.command, [runtimeFile, "claude-bot-worker", "--workspace-name", profile.name || profile.id], {
    detached: false,
    env,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true
  });
  claudeAppBotWorker = child;
  claudeAppBotWorkerProfileId = profile.id;
  child.stderr?.on("data", (chunk) => {
    console.warn(`[profile] Claude App bot worker stderr: ${chunk.toString("utf8").trim()}`);
  });
  child.once("exit", (code, signal) => {
    if (claudeAppBotWorker === child) {
      claudeAppBotWorker = undefined;
      claudeAppBotWorkerProfileId = undefined;
    }
    if (code && code !== 0) {
      console.warn(`[profile] Claude App bot worker exited: code=${code}${signal ? ` signal=${signal}` : ""}`);
    }
  });
  child.once("error", (error) => {
    if (claudeAppBotWorker === child) {
      claudeAppBotWorker = undefined;
      claudeAppBotWorkerProfileId = undefined;
    }
    console.warn(`[profile] Claude App bot worker failed: ${formatError(error)}`);
  });
}

function readClaudeCodeSettingsEnv(settingsFile: string): Record<string, string> {
  if (!existsSync(settingsFile)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(settingsFile, "utf8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.env)) {
      return {};
    }
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.env)) {
      if (isEnvName(key) && typeof value === "string") {
        env[key] = value;
      }
    }
    return env;
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnvName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function ensureClaudeBotWorkerRuntime(runtimeFile: string): void {
  const content = codexCliMiddlewareRuntimeScript();
  const existing = existsSync(runtimeFile) ? readFileSync(runtimeFile, "utf8") : "";
  if (existing !== content) {
    mkdirSync(path.dirname(runtimeFile), { recursive: true });
    writeFileSync(runtimeFile, content);
    if (process.platform !== "win32") {
      chmodSync(runtimeFile, 0o755);
    }
  }
  if (!content.includes("CCR_CLAUDE_CODE_BOT_WORKER") || !content.includes("claude-bot-worker")) {
    throw new Error("Claude bot worker runtime does not contain the bot worker entrypoint.");
  }
}

function stopClaudeAppBotWorker(profileId?: string): void {
  if (profileId && claudeAppBotWorkerProfileId && claudeAppBotWorkerProfileId !== profileId) {
    return;
  }
  const child = claudeAppBotWorker;
  claudeAppBotWorker = undefined;
  claudeAppBotWorkerProfileId = undefined;
  if (!child || child.killed) {
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // The worker may have already exited.
  }
}

function nodeRuntimeLaunch(): { command: string; electronRunAsNode: boolean } {
  const configured = process.env.CCR_NODE_BIN?.trim();
  if (configured) {
    return { command: configured, electronRunAsNode: false };
  }
  return {
    command: process.execPath,
    electronRunAsNode: Boolean(process.versions.electron)
  };
}

function commandProfileRef(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): string {
  const name = profile.name?.trim();
  if (!name) {
    return profile.id;
  }
  const normalizedName = name.toLowerCase();
  const duplicateName = config.profile.profiles.some((item) =>
    item.enabled &&
    item.id !== profile.id &&
    item.name.trim().toLowerCase() === normalizedName
  );
  return duplicateName ? profile.id : name;
}

function ensureCcrCliLauncher(): string {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { recursive: true });

  const runtimeFile = path.join(binDir, "ccr-cli.js");
  const runtimeSource = findBundledCcrCliSource();
  writeFileIfChanged(runtimeFile, readFileSync(runtimeSource, "utf8"));
  chmodSafe(runtimeFile);

  const launcherFile = path.join(binDir, process.platform === "win32" ? "ccr.cmd" : "ccr");
  const launcherContent = process.platform === "win32"
    ? windowsCcrLauncher(runtimeFile)
    : posixCcrLauncher(runtimeFile);
  writeFileIfChanged(launcherFile, launcherContent);
  chmodSafe(launcherFile);
  ensureCcrBinOnPath(binDir);

  return launcherFile;
}

function findBundledCcrCliSource(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    path.join(__dirname, "cli.js"),
    ...(resourcesPath
      ? [
          path.join(resourcesPath, "app.asar", "dist", "main", "cli.js"),
          path.join(resourcesPath, "app", "dist", "main", "cli.js")
        ]
      : []),
    path.join(process.cwd(), "dist", "main", "cli.js")
  ];
  const source = candidates.find((candidate) => existsSync(candidate));
  if (!source) {
    throw new Error(`CCR CLI runtime was not found. Rebuild or reinstall CCR and try again. Checked: ${candidates.join(", ")}`);
  }
  return source;
}

function posixCcrLauncher(runtimeFile: string): string {
  return [
    "#!/bin/sh",
    'if [ -n "$CCR_NODE_BIN" ]; then',
    `  exec "$CCR_NODE_BIN" ${shQuote(runtimeFile)} "$@"`,
    "fi",
    "if command -v node >/dev/null 2>&1; then",
    `  exec node ${shQuote(runtimeFile)} "$@"`,
    "fi",
    `ELECTRON_RUN_AS_NODE=1 exec ${shQuote(process.execPath)} ${shQuote(runtimeFile)} "$@"`
  ].join("\n") + "\n";
}

function windowsCcrLauncher(runtimeFile: string): string {
  return [
    "@echo off",
    "setlocal",
    `set "CCR_CLI_RUNTIME=${cmdEnvValue(runtimeFile)}"`,
    "if defined CCR_NODE_BIN (",
    '  "%CCR_NODE_BIN%" "%CCR_CLI_RUNTIME%" %*',
    "  exit /b %ERRORLEVEL%",
    ")",
    "where node >nul 2>nul",
    "if %ERRORLEVEL%==0 (",
    '  node "%CCR_CLI_RUNTIME%" %*',
    "  exit /b %ERRORLEVEL%",
    ")",
    "set \"ELECTRON_RUN_AS_NODE=1\"",
    `${cmdQuote(process.execPath)} "%CCR_CLI_RUNTIME%" %*`,
    "exit /b %ERRORLEVEL%"
  ].join("\r\n") + "\r\n";
}

function writeFileIfChanged(file: string, content: string): void {
  if (existsSync(file) && readFileSync(file, "utf8") === content) {
    return;
  }
  writeFileSync(file, content, "utf8");
}

function ensureCcrBinOnPath(binDir: string): void {
  prependProcessPath(binDir);
  try {
    if (process.platform === "win32") {
      ensureWindowsUserPath(binDir);
      return;
    }
    ensurePosixShellPath(binDir);
  } catch (error) {
    console.warn(`[profile] Failed to persist ccr PATH: ${formatError(error)}`);
  }
}

function prependProcessPath(binDir: string): void {
  const pathKey = process.platform === "win32"
    ? Object.keys(process.env).find((key) => key.toLowerCase() === "path") || "Path"
    : "PATH";
  const delimiter = path.delimiter;
  const currentPath = process.env[pathKey] || "";
  const segments = currentPath.split(delimiter).filter(Boolean);
  if (pathSegmentsInclude(segments, binDir)) {
    return;
  }
  process.env[pathKey] = [binDir, ...segments].join(delimiter);
}

function ensureWindowsUserPath(binDir: string): void {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$bin = ${powershellString(binDir)}`,
    "$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')",
    "$segments = @()",
    "if (-not [string]::IsNullOrWhiteSpace($userPath)) {",
    "  $segments = $userPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }",
    "}",
    "$expandedBin = [Environment]::ExpandEnvironmentVariables($bin).TrimEnd('\\\\')",
    "$expandedSegments = $segments | ForEach-Object { [Environment]::ExpandEnvironmentVariables($_).TrimEnd('\\\\') }",
    "if ($expandedSegments -notcontains $expandedBin) {",
    "  [Environment]::SetEnvironmentVariable('Path', ((@($bin) + $segments) -join ';'), 'User')",
    "}"
  ].join("\n");
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `powershell.exe exited with ${result.status}`).trim());
  }
}

function ensurePosixShellPath(binDir: string): void {
  const shellName = path.basename(process.env.SHELL || "").toLowerCase();
  if (shellName.includes("fish")) {
    ensureFishPathBlock(path.join(os.homedir(), ".config", "fish", "conf.d", "ccr.fish"), binDir);
    return;
  }
  ensureShellRcPathBlock(preferredShellRcFile(shellName), binDir);
}

function preferredShellRcFile(shellName = path.basename(process.env.SHELL || "").toLowerCase()): string {
  const home = os.homedir();
  if (shellName.includes("zsh")) {
    return path.join(home, ".zshrc");
  }
  if (shellName.includes("bash")) {
    if (process.platform === "darwin") {
      const bashProfile = path.join(home, ".bash_profile");
      return existsSync(bashProfile) ? bashProfile : path.join(home, ".bashrc");
    }
    return path.join(home, ".bashrc");
  }
  return path.join(home, ".profile");
}

function pathSegmentsInclude(segments: string[], target: string): boolean {
  if (process.platform === "win32") {
    const normalizedTarget = normalizeWindowsPathSegment(target);
    return segments.some((segment) => normalizeWindowsPathSegment(segment) === normalizedTarget);
  }
  return segments.includes(target);
}

function normalizeWindowsPathSegment(value: string): string {
  return value.trim().replace(/[\\/]+$/g, "").toLowerCase();
}

function ensureShellRcPathBlock(rcFile: string, binDir: string): void {
  mkdirSync(path.dirname(rcFile), { recursive: true });
  const source = existsSync(rcFile) ? readFileSync(rcFile, "utf8") : "";
  const block = shellRcPathBlock();
  const managedPattern = new RegExp(
    `\\n?${escapeRegExp(ccrPathBlockStart)}[\\s\\S]*?${escapeRegExp(ccrPathBlockEnd)}\\n?`,
    "m"
  );
  if (managedPattern.test(source)) {
    const next = ensureTrailingNewline(source.replace(managedPattern, `\n${block}\n`)).replace(/^\n+/, "");
    writeFileIfChanged(rcFile, next);
    return;
  }
  if (shellRcAlreadyAddsCcrBin(source, binDir)) {
    return;
  }

  const separator = source.trim() ? (source.endsWith("\n") ? "\n" : "\n\n") : "";
  writeFileIfChanged(rcFile, `${source}${separator}${block}\n`);
}

function shellRcPathBlock(): string {
  const binDir = "$HOME/.claude-code-router/bin";
  return [
    ccrPathBlockStart,
    "# Added by Claude Code Router. Enables the ccr command in new shells.",
    'case ":$PATH:" in',
    `  *":${binDir}:"*) ;;`,
    `  *) export PATH="${binDir}:$PATH" ;;`,
    "esac",
    ccrPathBlockEnd
  ].join("\n");
}

function ensureFishPathBlock(file: string, binDir: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const source = existsSync(file) ? readFileSync(file, "utf8") : "";
  const block = fishPathBlock();
  const managedPattern = new RegExp(
    `\\n?${escapeRegExp(ccrPathBlockStart)}[\\s\\S]*?${escapeRegExp(ccrPathBlockEnd)}\\n?`,
    "m"
  );
  if (managedPattern.test(source)) {
    const next = ensureTrailingNewline(source.replace(managedPattern, `\n${block}\n`)).replace(/^\n+/, "");
    writeFileIfChanged(file, next);
    return;
  }
  if (shellRcAlreadyAddsCcrBin(source, binDir)) {
    return;
  }

  const separator = source.trim() ? (source.endsWith("\n") ? "\n" : "\n\n") : "";
  writeFileIfChanged(file, `${source}${separator}${block}\n`);
}

function fishPathBlock(): string {
  return [
    ccrPathBlockStart,
    "# Added by Claude Code Router. Enables the ccr command in new shells.",
    'set -l ccr_bin "$HOME/.claude-code-router/bin"',
    "if not contains $ccr_bin $PATH",
    "    set -gx PATH $ccr_bin $PATH",
    "end",
    ccrPathBlockEnd
  ].join("\n");
}

function shellRcAlreadyAddsCcrBin(source: string, binDir: string): boolean {
  return source.includes("$HOME/.claude-code-router/bin") ||
    source.includes("~/.claude-code-router/bin") ||
    source.includes(binDir);
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function chmodSafe(file: string): void {
  if (process.platform === "win32") {
    return;
  }
  try {
    chmodSync(file, 0o755);
  } catch {
    // The launcher can still be shown; execution will surface the filesystem error.
  }
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function cmdQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function cmdEnvValue(value: string): string {
  return value.replace(/%/g, "%%").replace(/"/g, '""');
}

function powershellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringRecord(value: Record<string, string> | undefined): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string"));
}

function findProfileApiKey(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): string {
  const keyId = profileApiKeyId(profile);
  const key = config.APIKEYS.find((apiKey) => apiKey.id === keyId)?.key.trim();
  return key || config.APIKEYS.find((apiKey) => apiKey.key.trim())?.key.trim() || config.APIKEY.trim();
}

function profileApiKeyId(profile: ReturnType<typeof findProfileForOpen>): string {
  return `profile:${sanitizeProfilePathSegment(profile.id || profile.name || profile.agent) || "profile"}`;
}

function sanitizeProfilePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}
