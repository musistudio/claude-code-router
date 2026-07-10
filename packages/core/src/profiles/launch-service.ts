import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertAvailableGatewayModels, type AppConfig, type ProfileOpenCommandResult, type ProfileOpenRequest, type ProfileOpenResult, type ProfileRuntimeEntry, type ProfileRuntimeStatus, type ProfileStopResult } from "@ccr/core/contracts/app";
import { botGatewayProfileEnv } from "@ccr/core/agents/bot-gateway/env";
import { applyClaudeAppGatewayConfig, readClaudeAppGatewayApiKeyCandidates } from "@ccr/core/agents/claude-app/gateway-service";
import { launchClaudeAppProfile, resolveClaudeAppProfileUserDataDir } from "@ccr/core/agents/claude-app/launch";
import { claudeCodeUtcTimezoneEnvOverride } from "@ccr/core/agents/claude-code/environment";
import { codexDesktopAppName, launchCodexAppProfile, launchZcodeAppProfile, refreshCodexCompatibleAppProfileFiles } from "@ccr/core/agents/codex/app-launch";
import { codexCliMiddlewareRuntimeScript } from "@ccr/core/agents/codex/cli-middleware-runtime";
import { CONFIGDIR } from "@ccr/core/config/constants";
import { gatewayService } from "@ccr/core/gateway/service";
import { TOOL_HUB_MCP_RUNTIME_FILE_NAME, bundledToolHubMcpEntryPathCandidates } from "@ccr/core/mcp/toolhub-config";
import { buildProfileLaunchPlan, findProfileForOpen, profileLaunchSpawnCommand, profileOpenCommand, resolveClaudeCodeSettingsFile, resolveProfileOpenSurface } from "@ccr/core/profiles/launch-core";
import { applyProfileConfig, cleanupGeneratedBinBackups } from "@ccr/core/profiles/service";
import { broadcastWindowsEnvironmentChanged, windowsSystemCommand } from "@ccr/core/platform/windows-system";

const ccrPathBlockStart = "# >>> Claude Code Router CLI >>>";
const ccrPathBlockEnd = "# <<< Claude Code Router CLI <<<";
export const desktopCliCommandName = "ccr-app";
const desktopCliRuntimeFileName = "ccr-cli.js";
const desktopCliCommandNameEnv = "CCR_CLI_COMMAND_NAME";
let claudeAppBotWorker: ChildProcess | undefined;
let claudeAppBotWorkerProfileId: string | undefined;

type ProfileOpenCommandOptions = {
  commandName?: string;
  ensureLauncher?: boolean;
};

type ProfileAppLaunchResult = {
  child: ChildProcess;
  claudeDesignProxy?: boolean;
  command: string;
  pidIsLauncher?: boolean;
  pid?: number;
  userDataDir: string;
};

type RunningProfileApp = ProfileRuntimeEntry & {
  child: ChildProcess;
  claudeDesignProxy?: boolean;
  command: string;
  pidIsLauncher?: boolean;
  spawnError?: string;
  stopRequested?: boolean;
  userDataDir: string;
};

process.once("exit", () => stopClaudeAppBotWorker());

export async function getProfileOpenCommand(config: AppConfig, request: ProfileOpenRequest, options: ProfileOpenCommandOptions = {}): Promise<ProfileOpenCommandResult> {
  assertAvailableGatewayModels(config);
  await applyProfileConfig(config);
  const profile = findProfileForOpen(config, request.profileId);
  const surface = resolveProfileOpenSurface(profile, request.surface);
  if (options.ensureLauncher) {
    ensureCcrCliLauncher();
  }
  return {
    command: profileOpenCommand(profile, surface, options.commandName ?? "ccr", commandProfileRef(config, profile)),
    profileId: profile.id,
    profileName: profile.name,
    surface
  };
}

export async function openProfileFromCcr(config: AppConfig, request: ProfileOpenRequest): Promise<ProfileOpenResult> {
  assertAvailableGatewayModels(config);
  await applyProfileConfig(config);
  const profile = findProfileForOpen(config, request.profileId);
  const surface = resolveProfileOpenSurface(profile, request.surface);
  if (profile.agent === "claude-code" && surface === "app") {
    return openClaudeAppProfile(config, profile);
  }
  if ((profile.agent === "codex" || profile.agent === "zcode") && surface === "app") {
    return await openCodexAppProfile(config, profile);
  }
  const plan = buildProfileLaunchPlan(CONFIGDIR, profile, surface);
  if (path.isAbsolute(plan.command) && !existsSync(plan.command)) {
    throw new Error(`Profile launcher was not found: ${plan.command}. Re-save the profile and try again.`);
  }

  const launch = profileLaunchSpawnCommand(plan);
  const child = spawn(launch.command, launch.args, {
    detached: true,
    env: {
      ...process.env,
      ...plan.env,
      ...botGatewayProfileEnv(config, profile, surface),
      ...(profile.agent === "claude-code" ? claudeCodeUtcTimezoneEnvOverride() : {})
    },
    stdio: "ignore"
  });
  const spawnError = await waitForImmediateSpawnError(child, 500);
  if (spawnError) {
    throw new Error(`Failed to open ${profile.name || profile.id}: ${spawnError}`);
  }
  child.unref();

  return {
    message: `Opened ${profile.name || profile.id}.`,
    profileId: profile.id,
    profileName: profile.name,
    surface
  };
}

async function openCodexAppProfile(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): Promise<ProfileOpenResult> {
  const appName = profile.agent === "zcode" ? "ZCode App" : codexDesktopAppName;
  const profileGatewayConfig = await ensureProfileGateway(config, profile, appName);
  const existing = runningProfileApp(profile.id, "app");
  if (existing) {
    refreshCodexCompatibleAppProfileFiles(CONFIGDIR, profile, profileGatewayConfig);
    activateProfileAppWindow(existing);
    return {
      message: `${appName} is already running with ${profile.name || profile.id}.`,
      profileId: profile.id,
      profileName: profile.name,
      surface: "app"
    };
  }
  const launch = profile.agent === "zcode"
    ? launchZcodeAppProfile(CONFIGDIR, profile, profileGatewayConfig)
    : launchCodexAppProfile(CONFIGDIR, profile, profileGatewayConfig);
  const entry = registerProfileApp(profile, "app", launch);
  const started = await waitForProfileAppStart(entry, 12000);
  if (!started) {
    cleanupProfileAppEntry(profileRuntimeKey(profile.id, "app"), entry);
    sendProfileProcessSignal(entry.pid, "SIGTERM");
    throw new Error([
      `${appName} did not open a window for ${profile.name || profile.id}.`,
      ...(entry.spawnError ? [`Error: ${entry.spawnError}`] : []),
      `Command: ${entry.command}`,
      `User data: ${entry.userDataDir}`
    ].join(" "));
  }
  activateProfileAppWindow(entry);
  return {
    message: `Opened ${appName} with ${profile.name || profile.id}.`,
    profileId: profile.id,
    profileName: profile.name,
    surface: "app"
  };
}

async function openClaudeAppProfile(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): Promise<ProfileOpenResult> {
  const profileGatewayConfig = claudeAppGatewayConfigFor(config, profile);
  const existing = runningProfileApp(profile.id, "app");
  if (existing) {
    if (!claudeAppDesignProxyRequired(profileGatewayConfig) || existing.claudeDesignProxy) {
      activateProfileAppWindow(existing);
      return {
        message: `Claude App is already running with ${profile.name || profile.id}.`,
        profileId: profile.id,
        profileName: profile.name,
        surface: "app"
      };
    }
    const stopped = await stopRunningProfileApp(profileRuntimeKey(profile.id, "app"), existing);
    if (!stopped) {
      throw new Error("Claude App is already running without the Claude Design proxy. Close Claude App and try again.");
    }
    stopClaudeAppBotWorker(profile.id);
  }

  applyClaudeAppGatewayConfig(profileGatewayConfig);
  applyClaudeAppGatewayConfig(profileGatewayConfig, {
    backup: false,
    dataDir: resolveClaudeAppProfileUserDataDir(CONFIGDIR, profile),
    refreshModelDiscoveryCache: true
  });
  await ensureGatewayConfigRunning(profileGatewayConfig, profile, "Claude App");
  const entry = registerProfileApp(profile, "app", await launchClaudeAppProfile(CONFIGDIR, profile, profileGatewayConfig));
  const started = await waitForProfileAppStart(entry, 12000);
  if (!started) {
    cleanupProfileAppEntry(profileRuntimeKey(profile.id, "app"), entry);
    sendProfileProcessSignal(entry.pid, "SIGTERM");
    throw new Error([
      `Claude App did not open a window for ${profile.name || profile.id}.`,
      ...(entry.spawnError ? [`Error: ${entry.spawnError}`] : []),
      `Command: ${entry.command}`,
      `User data: ${entry.userDataDir}`
    ].join(" "));
  }
  activateProfileAppWindow(entry);
  startClaudeAppBotWorker(config, profile);
  return {
    message: `Opened Claude App with ${profile.name || profile.id}.`,
    profileId: profile.id,
    profileName: profile.name,
    surface: "app"
  };
}

export async function ensureProfileGateway(
  config: AppConfig,
  profile: ReturnType<typeof findProfileForOpen>,
  appName: string,
  options: { reuseExisting?: boolean; startIfMissing?: boolean } = {}
): Promise<AppConfig> {
  const profileGatewayConfig = profileGatewayConfigFor(config, profile);
  const result = await ensureGatewayConfigRunning(profileGatewayConfig, profile, appName, options, config);
  return result.acceptedApiKey && result.acceptedApiKey !== result.config.APIKEY
    ? profileGatewayConfigWithToken(result.config, profile, result.acceptedApiKey)
    : result.config;
}

type EnsureGatewayConfigRunningResult = {
  acceptedApiKey?: string;
  config: AppConfig;
};

async function ensureGatewayConfigRunning(
  config: AppConfig,
  profile: ReturnType<typeof findProfileForOpen>,
  appName: string,
  options: { reuseExisting?: boolean; startIfMissing?: boolean } = {},
  candidateConfig: AppConfig = config
): Promise<EnsureGatewayConfigRunningResult> {
  const startIfMissing = options.startIfMissing !== false;
  if (options.reuseExisting) {
    const existingGateway = await probeExistingProfileGateway(config, profile, candidateConfig);
    if (existingGateway.state === "usable") {
      return { acceptedApiKey: existingGateway.apiKey, config };
    }
    if (existingGateway.state === "unavailable") {
      if (!startIfMissing) {
        throw new Error(`CCR gateway is not running at ${profileGatewayEndpoint(config)}. Start CCR Desktop or run ccr start before opening ${appName}.`);
      }
    } else {
      throw new Error(existingGatewayConflictMessage(existingGateway, appName));
    }
  }

  if (!startIfMissing) {
    throw new Error(`CCR gateway is not running at ${profileGatewayEndpoint(config)}. Start CCR Desktop or run ccr start before opening ${appName}.`);
  }

  const startedStatus = await gatewayService.start(config);
  if (startedStatus.state === "running") {
    return { config };
  }

  if (options.reuseExisting && isAddressInUseError(startedStatus.lastError)) {
    const existingGateway = await probeExistingProfileGateway(config, profile, candidateConfig);
    if (existingGateway.state === "usable") {
      return { acceptedApiKey: existingGateway.apiKey, config };
    }
    throw new Error(existingGatewayConflictMessage(existingGateway, appName));
  }

  throw new Error(startedStatus.lastError || `CCR gateway did not start for ${appName}.`);
}

type ExistingProfileGatewayProbe =
  | { endpoint: string; reason?: string; state: "unavailable" }
  | { endpoint: string; status?: number; state: "not-ccr" }
  | { endpoint: string; message?: string; status: number; state: "unauthorized" }
  | { endpoint: string; status: number; state: "unusable" }
  | { apiKey?: string; endpoint: string; state: "usable" };

type ExistingGatewayHttpProbe = {
  payload?: unknown;
  reason?: string;
  status?: number;
};

async function probeExistingProfileGateway(
  config: AppConfig,
  profile: ReturnType<typeof findProfileForOpen>,
  candidateConfig: AppConfig = config
): Promise<ExistingProfileGatewayProbe> {
  const endpoint = profileGatewayEndpoint(config);
  const root = await fetchExistingGateway(endpoint, "/");
  if (root.status === undefined) {
    return { endpoint, reason: root.reason, state: "unavailable" };
  }

  let ccrGateway = isCcrGatewayRoot(root.payload);
  if (!ccrGateway) {
    const health = await fetchExistingGateway(endpoint, "/health");
    ccrGateway = isCcrGatewayHealth(health.payload);
  }
  if (!ccrGateway) {
    return { endpoint, status: root.status, state: "not-ccr" };
  }

  let lastUnauthorized: ExistingGatewayHttpProbe | undefined;
  for (const apiKey of existingGatewayApiKeyCandidates(config, profile, candidateConfig)) {
    const headers: Record<string, string> = {
      "user-agent": "Claude Code"
    };
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
    }
    const models = await fetchExistingGateway(endpoint, "/v1/models", { headers });
    if (models.status === 200) {
      return { apiKey, endpoint, state: "usable" };
    }
    if (models.status === 401 || models.status === 403) {
      lastUnauthorized = models;
      continue;
    }
    return { endpoint, status: models.status ?? 0, state: "unusable" };
  }

  if (lastUnauthorized?.status === 401 || lastUnauthorized?.status === 403) {
    return {
      endpoint,
      message: readGatewayErrorMessage(lastUnauthorized.payload),
      status: lastUnauthorized.status,
      state: "unauthorized"
    };
  }
  return { endpoint, status: 0, state: "unusable" };
}

async function fetchExistingGateway(
  endpoint: string,
  pathname: string,
  init: RequestInit = {}
): Promise<ExistingGatewayHttpProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(new URL(pathname, endpoint).toString(), {
      ...init,
      signal: controller.signal
    });
    return {
      payload: await readResponseJson(response),
      status: response.status
    };
  } catch (error) {
    return { reason: formatError(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isCcrGatewayRoot(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return value.name === "claude-code-router" || value.plugin === "claude-code-router";
}

function isCcrGatewayHealth(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.core === "string" && typeof value.status === "string" && typeof value.timestamp === "string";
}

function readGatewayErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.error)) {
    return undefined;
  }
  return typeof value.error.message === "string" ? value.error.message : undefined;
}

function existingGatewayApiKeyCandidates(
  config: AppConfig,
  profile: ReturnType<typeof findProfileForOpen>,
  candidateConfig: AppConfig
): Array<string | undefined> {
  const values = [
    config.APIKEY,
    ...(Array.isArray(config.APIKEYS) ? config.APIKEYS.map((apiKey) => apiKey.key) : []),
    candidateConfig.APIKEY,
    ...(Array.isArray(candidateConfig.APIKEYS) ? candidateConfig.APIKEYS.map((apiKey) => apiKey.key) : []),
    ...readClaudeAppGatewayApiKeyCandidates(),
    ...readClaudeCodeApiKeyHelperCandidates(profile)
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value?.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(key);
  }
  return result.length > 0 ? result : [undefined];
}

function readClaudeCodeApiKeyHelperCandidates(profile: ReturnType<typeof findProfileForOpen>): string[] {
  const file = path.join(CONFIGDIR, "bin", claudeCodeApiKeyHelperFilename(profile));
  const files = [
    file,
    ...readBackupFiles(file)
  ];
  return uniqueStrings(files.map(readClaudeCodeApiKeyHelperToken));
}

function claudeCodeApiKeyHelperFilename(profile: ReturnType<typeof findProfileForOpen>): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent) || "claude-code";
  return process.platform === "win32"
    ? `ccr-claude-code-api-key-${slug}.cmd`
    : `ccr-claude-code-api-key-${slug}`;
}

function readBackupFiles(file: string): string[] {
  const dir = path.dirname(file);
  const prefix = `${path.basename(file)}.ccr-backup-`;
  try {
    return readdirSync(dir)
      .filter((entry) => entry.startsWith(prefix))
      .sort()
      .reverse()
      .map((entry) => path.join(dir, entry));
  } catch {
    return [];
  }
}

function readClaudeCodeApiKeyHelperToken(file: string): string {
  if (!existsSync(file)) {
    return "";
  }
  try {
    const content = readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/g)) {
      const token = parseClaudeCodeApiKeyHelperLine(line);
      if (token) {
        return token;
      }
    }
  } catch {
    return "";
  }
  return "";
}

function parseClaudeCodeApiKeyHelperLine(line: string): string {
  const trimmed = line.trim();
  const shellPrefix = "printf '%s\\n' ";
  if (trimmed.startsWith(shellPrefix)) {
    return unquoteShellValue(trimmed.slice(shellPrefix.length).trim());
  }
  if (/^echo\s+/i.test(trimmed)) {
    return trimmed.replace(/^echo\s+/i, "").trim().replace(/^"|"$/g, "");
  }
  return "";
}

function unquoteShellValue(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/'\\''/g, "'");
  }
  return value.replace(/^"|"$/g, "");
}

function existingGatewayConflictMessage(probe: ExistingProfileGatewayProbe, appName: string): string {
  if (probe.state === "unauthorized") {
    const details = probe.message ? ` ${probe.message}` : "";
    return `CCR gateway is already running at ${probe.endpoint}, but it does not accept the API key for ${appName}.${details} Restart CCR Desktop or run ccr start to refresh the gateway before opening this profile.`;
  }
  if (probe.state === "unusable") {
    return `CCR gateway is already running at ${probe.endpoint}, but it cannot serve ${appName} right now (HTTP ${probe.status}). Restart CCR Desktop or run ccr start to refresh the gateway before opening this profile.`;
  }
  if (probe.state === "not-ccr") {
    return `Port ${probe.endpoint} is already in use by a non-CCR service. Stop that process or change the CCR gateway port.`;
  }
  if (probe.state === "unavailable") {
    return `CCR gateway is not reachable at ${probe.endpoint}${probe.reason ? `: ${probe.reason}` : ""}.`;
  }
  return `CCR gateway is already running at ${probe.endpoint}.`;
}

function isAddressInUseError(message: string | undefined): boolean {
  return /\bEADDRINUSE\b/i.test(message || "");
}

function profileGatewayEndpoint(config: AppConfig): string {
  const host = probeGatewayHost(config.gateway.host);
  return `http://${formatEndpointHost(host)}:${config.gateway.port}/`;
}

function probeGatewayHost(host: string): string {
  if (!host || host === "0.0.0.0") {
    return "127.0.0.1";
  }
  if (host === "::") {
    return "::1";
  }
  return host;
}

function formatEndpointHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function profileGatewayConfigFor(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): AppConfig {
  const token = findProfileApiKey(config, profile);
  if (!token) {
    throw new Error(`No CCR API key was found for profile "${profile.name || profile.id}". Re-save the profile and try again.`);
  }
  return profileGatewayConfigWithToken(config, profile, token);
}

function profileGatewayConfigWithToken(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>, token: string): AppConfig {
  return {
    ...config,
    APIKEY: token,
    APIKEYS: [
      {
        createdAt: new Date().toISOString(),
        id: profileApiKeyId(profile),
        key: token,
        name: `Profile: ${profile.name?.trim() || profile.id || profile.agent}`
      }
    ]
  };
}

function claudeAppGatewayConfigFor(config: AppConfig, profile: ReturnType<typeof findProfileForOpen>): AppConfig {
  const profileGatewayConfig = profileGatewayConfigFor(config, profile);
  if (!claudeAppDesignProxyRequired(profileGatewayConfig)) {
    return profileGatewayConfig;
  }
  return {
    ...profileGatewayConfig,
    proxy: {
      ...profileGatewayConfig.proxy,
      enabled: true,
      mode: "transparent",
      systemProxy: false
    }
  };
}

function claudeAppDesignProxyRequired(config: AppConfig): boolean {
  return config.plugins.some((plugin) => plugin.enabled !== false && plugin.id === "claude-design");
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
    claudeDesignProxy: launch.claudeDesignProxy,
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
    if (process.platform === "win32" && entry.userDataDir) {
      setTimeout(() => {
        if (isProfileAppRunning(entry)) {
          return;
        }
        cleanupProfileAppEntry(key, entry);
      }, 1500).unref();
      return;
    }
    if (entry.pidIsLauncher && isProfileAppRunning(entry)) {
      return;
    }
    cleanupProfileAppEntry(key, entry);
  });
  launch.child.once("error", (error) => {
    entry.spawnError = formatError(error);
    cleanupProfileAppEntry(key, entry);
  });
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
  if (process.platform === "win32") {
    return windowsProfileAppMainPid(marker);
  }
  return posixProfileAppMainPid(marker);
}

function posixProfileAppMainPid(marker: string): number | undefined {
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

function windowsProfileAppMainPid(marker: string): number | undefined {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$marker = ${powershellString(marker)}`,
    `$hostPid = ${process.pid}`,
    "$selfPid = $PID",
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $_.ProcessId -ne $selfPid -and",
    "  $_.ProcessId -ne $hostPid -and",
    "  $_.CommandLine -and",
    "  (($_.CommandLine -replace '\\\\', '/').ToLowerInvariant().Contains($marker)) -and",
    "  ($_.CommandLine -notmatch '\\s--type=')",
    "} | Sort-Object ProcessId | Select-Object -First 1 -ExpandProperty ProcessId"
  ].join("\n");
  try {
    const result = spawnSync(windowsSystemCommand("powershell.exe"), [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      windowsHide: true
    });
    if (result.error || result.status !== 0) {
      return undefined;
    }
    const pid = result.stdout
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .find((value) => Number.isFinite(value) && value > 0 && value !== process.pid);
    return pid;
  } catch {
    return undefined;
  }
}

function sendProfileProcessSignal(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) {
    return;
  }
  if (process.platform === "win32") {
    const args = ["/PID", String(pid), "/T"];
    if (signal === "SIGKILL") {
      args.push("/F");
    }
    spawnSync(windowsSystemCommand("taskkill.exe"), args, {
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

async function waitForProfileAppStart(entry: Pick<RunningProfileApp, "pid" | "pidIsLauncher" | "spawnError" | "userDataDir">, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (entry.spawnError) {
      return false;
    }
    if (profileAppMainPid(entry)) {
      return true;
    }
    if (!entry.pidIsLauncher && isProcessAlive(entry.pid)) {
      return true;
    }
    if (process.platform !== "win32" && !entry.pidIsLauncher && !isProcessAlive(entry.pid)) {
      return false;
    }
    await sleep(100);
  }
  return !entry.spawnError && (Boolean(profileAppMainPid(entry)) || (!entry.pidIsLauncher && isProcessAlive(entry.pid)));
}

function waitForImmediateSpawnError(child: ChildProcess, timeoutMs: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (message: string | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      child.off("error", onError);
      child.off("spawn", onSpawn);
      resolve(message);
    };
    const onError = (error: Error) => finish(formatError(error));
    const onSpawn = () => finish(undefined);
    child.once("error", onError);
    child.once("spawn", onSpawn);
    timer = setTimeout(() => finish(undefined), timeoutMs);
    timer.unref?.();
  });
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
    CODEXL_PROFILE_SURFACE: "app",
    ...claudeCodeUtcTimezoneEnvOverride()
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

export function ensureCcrCliLauncher(): string {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { recursive: true });
  cleanupGeneratedBinBackups();
  cleanupLegacyCcrCliLauncher(binDir);

  const runtimeFile = path.join(binDir, desktopCliRuntimeFileName);
  const runtimeSource = findBundledCcrCliSource();
  writeFileIfChanged(runtimeFile, readFileSync(runtimeSource, "utf8"));
  chmodSafe(runtimeFile);
  ensureBundledToolHubMcpRuntime(path.join(binDir, TOOL_HUB_MCP_RUNTIME_FILE_NAME));

  const launcherFile = path.join(binDir, process.platform === "win32" ? `${desktopCliCommandName}.cmd` : desktopCliCommandName);
  const launcherContent = process.platform === "win32"
    ? windowsCcrLauncher(runtimeFile)
    : posixCcrLauncher(runtimeFile);
  writeFileIfChanged(launcherFile, launcherContent);
  chmodSafe(launcherFile);
  ensureCcrBinOnPath(binDir);

  return launcherFile;
}

function cleanupLegacyCcrCliLauncher(binDir: string): void {
  const legacyLauncherFile = path.join(binDir, process.platform === "win32" ? "ccr.cmd" : "ccr");
  if (!existsSync(legacyLauncherFile)) {
    return;
  }
  try {
    const source = readFileSync(legacyLauncherFile, "utf8");
    if (!isLegacyManagedCcrCliLauncher(source)) {
      return;
    }
    rmSync(legacyLauncherFile, { force: true });
  } catch (error) {
    console.warn(`[profile] Failed to remove legacy ccr launcher: ${formatError(error)}`);
  }
}

function isLegacyManagedCcrCliLauncher(source: string): boolean {
  return source.includes("CCR_CLI_NODE_PATH") &&
    source.includes(desktopCliRuntimeFileName) &&
    source.includes("ELECTRON_RUN_AS_NODE=1") &&
    source.includes("CCR_NODE_BIN");
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

function ensureBundledToolHubMcpRuntime(file: string): void {
  const source = bundledToolHubMcpEntryPathCandidates().find((candidate) => existsSync(candidate));
  if (!source) {
    return;
  }
  writeFileIfChanged(file, readFileSync(source, "utf8"));
  chmodSafe(file);
}

function posixCcrLauncher(runtimeFile: string): string {
  const nodePath = bundledNodePath();
  return [
    "#!/bin/sh",
    `${desktopCliCommandNameEnv}=${shQuote(desktopCliCommandName)}`,
    `export ${desktopCliCommandNameEnv}`,
    `CCR_CLI_NODE_PATH=${shQuote(nodePath)}`,
    'if [ -n "$NODE_PATH" ]; then',
    '  export NODE_PATH="$CCR_CLI_NODE_PATH:$NODE_PATH"',
    "else",
    '  export NODE_PATH="$CCR_CLI_NODE_PATH"',
    "fi",
    'if [ -n "$CCR_NODE_BIN" ]; then',
    `  exec "$CCR_NODE_BIN" ${shQuote(runtimeFile)} "$@"`,
    "fi",
    `ELECTRON_RUN_AS_NODE=1 exec ${shQuote(process.execPath)} ${shQuote(runtimeFile)} "$@"`
  ].join("\n") + "\n";
}

function windowsCcrLauncher(runtimeFile: string): string {
  const nodePath = bundledNodePath();
  return [
    "@echo off",
    "setlocal",
    `set "${desktopCliCommandNameEnv}=${desktopCliCommandName}"`,
    `set "CCR_CLI_RUNTIME=${cmdEnvValue(runtimeFile)}"`,
    `set "CCR_CLI_NODE_PATH=${cmdEnvValue(nodePath)}"`,
    "if defined NODE_PATH (",
    "  set \"NODE_PATH=%CCR_CLI_NODE_PATH%;%NODE_PATH%\"",
    ") else (",
    "  set \"NODE_PATH=%CCR_CLI_NODE_PATH%\"",
    ")",
    "if defined CCR_NODE_BIN (",
    '  "%CCR_NODE_BIN%" "%CCR_CLI_RUNTIME%" %*',
    "  exit /b %ERRORLEVEL%",
    ")",
    "set \"ELECTRON_RUN_AS_NODE=1\"",
    `${cmdQuote(process.execPath)} "%CCR_CLI_RUNTIME%" %*`,
    "exit /b %ERRORLEVEL%"
  ].join("\r\n") + "\r\n";
}

function bundledNodePath(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    path.join(__dirname, "..", "..", "node_modules"),
    ...(resourcesPath
      ? [
          path.join(resourcesPath, "app.asar", "node_modules"),
          path.join(resourcesPath, "app.asar.unpacked", "node_modules"),
          path.join(resourcesPath, "app", "node_modules")
        ]
      : []),
    path.join(process.cwd(), "node_modules")
  ];
  return uniqueStrings(candidates).join(path.delimiter);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
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
  const result = spawnSync(windowsSystemCommand("powershell.exe"), [
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
  broadcastWindowsEnvironmentChanged();
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
    "# Added by Claude Code Router. Enables the ccr-app command in new shells.",
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
    "# Added by Claude Code Router. Enables the ccr-app command in new shells.",
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
  return `"${cmdValue(value)}"`;
}

function cmdEnvValue(value: string): string {
  return cmdValue(value);
}

function cmdValue(value: string): string {
  return value
    .replace(/\r?\n/g, " ")
    .replace(/\^/g, "^^")
    .replace(/%/g, "%%")
    .replace(/"/g, '^"')
    .replace(/[&|<>()]/g, "^$&");
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
