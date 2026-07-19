#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { botGatewayProfileEnv } from "@ccr/core/agents/bot-gateway/env";
import { applyClaudeAppGatewayConfig } from "@ccr/core/agents/claude-app/gateway-service";
import { launchClaudeAppProfile, resolveClaudeAppProfileUserDataDir } from "@ccr/core/agents/claude-app/launch";
import { codexDesktopAppName, launchZcodeAppProfile } from "@ccr/core/agents/codex/app-launch";
import { loadAppConfig } from "@ccr/core/config/config";
import { CONFIGDIR } from "@ccr/core/config/constants";
import { applyProfileConfig, applyProfileRuntimeConfig } from "@ccr/core/profiles/service";
import { ensureProfileGateway, ProfileGatewayUnavailableError } from "@ccr/core/profiles/launch-service";
import { buildProfileLaunchPlan, defaultProfileOpenSurface, findProfileForOpen, profileLaunchSpawnCommand, resolveProfileOpenSurface, shouldAutoStartProfileGateway } from "@ccr/core/profiles/launch-core";
import { openSystemExternal, startWebManagementServer } from "@ccr/core/web/management-server";
import { assertAvailableGatewayModels, type AppConfig, type GatewayStatus, type ProfileConfig, type ProfileOpenResult, type ProfileOpenSurface } from "@ccr/core/contracts/app";

type ProfileCliOptions = {
  agentArgs: string[];
  command: "profile";
  help: boolean;
  profileRef: string;
  surface?: ProfileOpenSurface;
};

type WebCliOptions = {
  command: "start" | "ui" | "web";
  daemonChild: boolean;
  ensureGatewayRunning: boolean;
  help: boolean;
  host?: string;
  open: boolean;
  port?: number;
  profileManaged: boolean;
  startGateway: boolean;
};

type StopCliOptions = {
  command: "stop";
  help: boolean;
};

type CliOptions = ProfileCliOptions | StopCliOptions | WebCliOptions;

type ServiceState = {
  host?: string;
  pid: number;
  profileManaged: boolean;
  serviceToken?: string;
  startedAt: string;
  startGateway: boolean;
  url: string;
};

const serviceStateFileName = "service.json";
const serviceStartLockFileName = "service-start.lock";
const profileGatewayLeaseDirName = "profile-gateway-leases";
const serviceInstanceTokenEnv = "CCR_SERVICE_INSTANCE_TOKEN";
const serviceRpcTimeoutMs = 2_000;
const serviceStartTimeoutMs = 30_000;
const serviceStopTimeoutMs = 10_000;
const profileGatewayIdleGraceMs = 2_000;
const profileGatewayLeasePollMs = 500;
const webAuthHeader = "x-ccr-web-auth";
const webAuthQueryParam = "ccr_web_token";
const defaultCliCommandName = "ccr";
const prepareProfileOnlyEnv = "CCR_CLI_PREPARE_PROFILE_ONLY";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "start") {
    if (options.help) {
      printStartHelp(0);
      return;
    }
    await startService(options);
    return;
  }
  if (options.command === "ui") {
    if (options.help) {
      printUiHelp(0);
      return;
    }
    await openManagementUi(options);
    return;
  }
  if (options.command === "stop") {
    if (options.help) {
      printStopHelp(0);
      return;
    }
    await stopService();
    return;
  }
  if (options.command === "web") {
    if (options.help) {
      printWebHelp(0);
      return;
    }
    await runWebServer(options);
    return;
  }

  const profileOptions = options as ProfileCliOptions;
  if (profileOptions.help || !profileOptions.profileRef) {
    printHelp(profileOptions.help ? 0 : 2);
    return;
  }

  const configDir = CONFIGDIR;
  const config = await loadAppConfig();
  assertAvailableGatewayModels(config);
  await applyProfileConfig(config);
  const profile = findProfileForOpen(config, profileOptions.profileRef);
  const surface = profileOptions.surface ?? defaultProfileOpenSurface(profile);
  const resolvedSurface = resolveProfileOpenSurface(profile, surface);
  if (profile.agent === "zcode" && profileOptions.agentArgs.length > 0) {
    throw new Error("ZCode profiles can only open the app; agent arguments are not supported.");
  }
  if (profile.agent === "claude-code" && resolvedSurface === "app" && profileOptions.agentArgs.length > 0) {
    throw new Error("Claude App profiles do not support agent arguments.");
  }
  if (profile.agent === "codex" && resolvedSurface === "app" && profileOptions.agentArgs.length === 0) {
    const state = await startService({
      command: "start",
      daemonChild: false,
      ensureGatewayRunning: true,
      help: false,
      open: false,
      profileManaged: false,
      startGateway: true
    });
    const opened = await callServiceRpc<ProfileOpenResult>(state, "openProfile", [{ profileId: profile.id, surface: "app" }], 30_000);
    process.stdout.write(`${opened.message}\n`);
    return;
  }

  const autoStartProfileGateway = shouldAutoStartProfileGateway(profile, resolvedSurface);
  let profileGatewayLease = autoStartProfileGateway ? acquireManagedProfileGatewayLease() : undefined;
  try {
    let launchConfig: AppConfig;
    try {
      launchConfig = await ensureProfileGateway(config, profile, resolvedSurface === "app" ? profileAppName(profile) : profile.name || profile.id || "profile", {
        reuseExisting: true,
        startIfMissing: false
      });
    } catch (error) {
      if (!autoStartProfileGateway || !(error instanceof ProfileGatewayUnavailableError)) {
        throw error;
      }
      profileGatewayLease ??= createProfileGatewayLease();
      await startService({
        command: "start",
        daemonChild: false,
        ensureGatewayRunning: true,
        help: false,
        open: false,
        profileManaged: true,
        startGateway: true
      });
      launchConfig = await ensureProfileGateway(config, profile, profile.name || profile.id || "profile", {
        reuseExisting: true,
        startIfMissing: false
      });
    }

    if (resolvedSurface === "cli") {
      const runtimeResult = applyProfileRuntimeConfig(launchConfig, profile, launchConfig.APIKEY);
      if (!runtimeResult.ok) {
        throw new Error(runtimeResult.message);
      }
    }
    if (resolvedSurface === "cli" && process.env[prepareProfileOnlyEnv] === "1") {
    return;
  }
  if (profile.agent === "claude-code" && resolvedSurface === "app") {
      applyClaudeAppGatewayConfig(launchConfig);
      applyClaudeAppGatewayConfig(launchConfig, {
        backup: false,
        dataDir: resolveClaudeAppProfileUserDataDir(configDir, profile),
        refreshModelDiscoveryCache: true
      });
      const launch = await launchClaudeAppProfile(configDir, profile, launchConfig);
      const spawnError = await waitForImmediateSpawnError(launch.child, 500);
      if (spawnError) {
        throw new Error(`Failed to open Claude App: ${spawnError}`);
      }
      process.stdout.write(`Opened Claude App with ${profile.name || profile.id}.\n`);
      return;
    }
    if (profile.agent === "zcode" && resolvedSurface === "app" && profileOptions.agentArgs.length === 0) {
      const launch = launchZcodeAppProfile(configDir, profile, launchConfig);
      const spawnError = await waitForImmediateSpawnError(launch.child, 500);
      if (spawnError) {
        throw new Error(`Failed to open ZCode App: ${spawnError}`);
      }
      process.stdout.write(`Opened ZCode App with ${profile.name || profile.id}.\n`);
      return;
    }

    const plan = buildProfileLaunchPlan(configDir, profile, resolvedSurface, profileOptions.agentArgs);

    if (path.isAbsolute(plan.command) && !existsSync(plan.command)) {
      throw new Error(`Profile launcher was not found: ${plan.command}. Open CCR once or re-save the profile.`);
    }

    const childEnv = {
      ...process.env,
      ...plan.env,
      ...botGatewayProfileEnv(launchConfig, profile, resolvedSurface)
    };
    delete childEnv.ELECTRON_RUN_AS_NODE;

    const launch = profileLaunchSpawnCommand(plan);
    const child = spawn(launch.command, launch.args, {
      env: childEnv,
      stdio: "inherit",
      windowsVerbatimArguments: !!launch.windowsVerbatimArguments
    });
    const code = await waitForChild(child);
    process.exitCode = code;
  } finally {
    profileGatewayLease?.release();
  }
}

function parseArgs(args: string[]): CliOptions {
  if (args[0] === "start") {
    return parseWebArgs(args.slice(1), "start");
  }
  if (args[0] === "ui") {
    return parseWebArgs(args.slice(1), "ui", true);
  }
  if (args[0] === "stop") {
    return parseStopArgs(args.slice(1));
  }
  if (args[0] === "serve" || args[0] === "web") {
    return parseWebArgs(args.slice(1), "web");
  }

  const options: ProfileCliOptions = {
    agentArgs: [],
    command: "profile",
    help: false,
    profileRef: ""
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      options.agentArgs.push(...args.slice(index + 1));
      break;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--app") {
      options.surface = "app";
      continue;
    }
    if (arg === "--cli") {
      options.surface = "cli";
      continue;
    }
    if (options.profileRef && !options.surface && (arg === "cli" || arg === "app")) {
      options.surface = arg;
      continue;
    }
    if (!options.profileRef) {
      options.profileRef = arg;
      continue;
    }
    options.agentArgs.push(arg);
  }
  return options;
}

function profileAppName(profile: Pick<ProfileConfig, "agent">): string {
  if (profile.agent === "claude-code") {
    return "Claude App";
  }
  if (profile.agent === "zcode") {
    return "ZCode App";
  }
  return codexDesktopAppName;
}

function parseStopArgs(args: string[]): StopCliOptions {
  const options: StopCliOptions = {
    command: "stop",
    help: false
  };
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown stop option: ${arg}`);
  }
  return options;
}

function parseWebArgs(args: string[], command: WebCliOptions["command"], defaultOpen = false): WebCliOptions {
  const options: WebCliOptions = {
    command,
    daemonChild: false,
    ensureGatewayRunning: false,
    help: false,
    open: defaultOpen,
    profileManaged: false,
    startGateway: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--open") {
      options.open = true;
      continue;
    }
    if (arg === "--no-open") {
      options.open = false;
      continue;
    }
    if (arg === "--gateway") {
      options.startGateway = true;
      continue;
    }
    if (arg === "--no-gateway") {
      options.startGateway = false;
      continue;
    }
    if (arg === "--daemon-child") {
      options.daemonChild = true;
      continue;
    }
    if (arg === "--profile-managed") {
      options.profileManaged = true;
      continue;
    }
    if (arg === "--host") {
      index += 1;
      options.host = requiredArg(args[index], "--host");
      continue;
    }
    if (arg.startsWith("--host=")) {
      options.host = requiredArg(arg.slice("--host=".length), "--host");
      continue;
    }
    if (arg === "--port") {
      index += 1;
      options.port = parsePort(requiredArg(args[index], "--port"));
      continue;
    }
    if (arg.startsWith("--port=")) {
      options.port = parsePort(requiredArg(arg.slice("--port=".length), "--port"));
      continue;
    }
    throw new Error(`Unknown web option: ${arg}`);
  }
  return options;
}

async function startService(options: WebCliOptions): Promise<ServiceState> {
  const releaseStartLock = await acquireServiceStartLock();
  try {
    const current = readServiceState();
    const currentVerification = current ? await verifyServiceState(current) : undefined;
    if (current && currentVerification?.ok) {
      return reuseRunningService(current, options);
    }
    if (current) {
      clearServiceState(current.pid);
    }

    const serviceToken = generateServiceToken();
    const childArgs = [
      currentCliScript(),
      "serve",
      "--daemon-child",
      ...(options.profileManaged ? ["--profile-managed"] : []),
      ...(options.host ? ["--host", options.host] : []),
      ...(options.port ? ["--port", String(options.port)] : []),
      "--no-open",
      ...(options.startGateway ? [] : ["--no-gateway"])
    ];
    const child = spawn(process.execPath, childArgs, {
      detached: true,
      env: serviceChildEnv(serviceToken),
      stdio: "ignore",
      windowsHide: true
    });
    const spawnError = await waitForImmediateSpawnError(child, 1000);
    if (spawnError) {
      throw new Error(`Failed to start CCR service: ${spawnError}`);
    }
    child.unref();

    const state = await waitForServiceState(child.pid, serviceStartTimeoutMs);
    if (!state) {
      throw new Error(`CCR service did not report ready within ${serviceStartTimeoutMs}ms.`);
    }
    process.stdout.write(`CCR service started at ${state.url} (pid ${state.pid}).\n`);
    if (options.open) {
      await openManagementUrl(state.url);
    }
    return state;
  } finally {
    releaseStartLock();
  }
}

async function reuseRunningService(current: ServiceState, options: WebCliOptions): Promise<ServiceState> {
  let state = current;
  if (options.startGateway && (!state.startGateway || options.ensureGatewayRunning)) {
    const gatewayStatus = await callServiceRpc<GatewayStatus>(state, "startGateway");
    if (gatewayStatus.state !== "running") {
      throw new Error(gatewayStatus.lastError || "CCR service did not start the gateway.");
    }
    state = { ...state, startGateway: true };
  }
  if (!options.profileManaged && state.profileManaged) {
    state = { ...state, profileManaged: false };
  }
  if (state !== current) {
    writeServiceState(state);
  }
  process.stdout.write(`CCR service is already running at ${state.url} (pid ${state.pid}).\n`);
  if (options.open) {
    await openManagementUrl(state.url);
  }
  return state;
}

async function openManagementUi(options: WebCliOptions): Promise<void> {
  await startService({
    ...options,
    command: "start"
  });
}

async function openManagementUrl(url: string): Promise<void> {
  try {
    await openSystemExternal(url);
    process.stdout.write(`Opened CCR management UI at ${url}\n`);
  } catch (error) {
    process.stderr.write(`Failed to open browser: ${formatError(error)}\n`);
    process.stdout.write(`CCR management UI is available at ${url}\n`);
  }
}

function serviceChildEnv(serviceToken: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  env[serviceInstanceTokenEnv] = serviceToken;
  if (process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = "1";
  } else {
    delete env.ELECTRON_RUN_AS_NODE;
  }
  return env;
}

async function runWebServer(options: WebCliOptions): Promise<void> {
  const runtime = await startWebManagementServer({
    host: options.host,
    open: options.open,
    port: options.port,
    startGateway: options.startGateway
  });
  if (options.daemonChild) {
    const serviceToken = process.env[serviceInstanceTokenEnv]?.trim() || undefined;
    writeServiceState({
      host: options.host,
      pid: process.pid,
      profileManaged: options.profileManaged,
      ...(serviceToken ? { serviceToken } : {}),
      startedAt: new Date().toISOString(),
      startGateway: options.startGateway,
      url: runtime.url
    });
  }
  process.stdout.write(`CCR web management is running at ${runtime.url}\n`);

  let closing = false;
  let profileLeaseMonitor: NodeJS.Timeout | undefined;
  let profileGatewayIdleSince: number | undefined;
  const shutdown = (signal: NodeJS.Signals) => {
    if (closing) {
      return;
    }
    closing = true;
    if (profileLeaseMonitor) {
      clearInterval(profileLeaseMonitor);
    }
    void runtime.close().finally(() => {
      if (options.daemonChild) {
        clearServiceState(process.pid);
      }
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  if (options.daemonChild && options.profileManaged) {
    profileLeaseMonitor = setInterval(() => {
      const state = readServiceState();
      if (!state || state.pid !== process.pid || !state.profileManaged) {
        if (profileLeaseMonitor) {
          clearInterval(profileLeaseMonitor);
          profileLeaseMonitor = undefined;
        }
        return;
      }
      if (activeProfileGatewayLeaseCount() > 0) {
        profileGatewayIdleSince = undefined;
        return;
      }
      profileGatewayIdleSince ??= Date.now();
      if (Date.now() - profileGatewayIdleSince >= profileGatewayIdleGraceMs) {
        shutdown("SIGTERM");
      }
    }, profileGatewayLeasePollMs);
    profileLeaseMonitor.unref?.();
  }
  await new Promise(() => undefined);
}

async function stopService(): Promise<void> {
  const state = readServiceState();
  if (!state) {
    process.stdout.write("CCR service is not running.\n");
    return;
  }
  const verification = await verifyServiceState(state);
  if (!verification.ok) {
    clearServiceState(state.pid);
    process.stdout.write("CCR service is not running.\n");
    return;
  }

  await callServiceRpc(state, "quitApp");
  const stopped = verification.trustedPid
    ? await waitForProcessExit(state.pid, serviceStopTimeoutMs)
    : await waitForServiceUnavailable(state, serviceStopTimeoutMs);
  if (!stopped) {
    throw new Error(`CCR service did not stop within ${serviceStopTimeoutMs}ms.`);
  }
  clearServiceState(state.pid);
  process.stdout.write("CCR service stopped.\n");
}

function printHelp(exitCode: number): void {
  const command = cliCommandName();
  const output = [
    "Usage:",
    `  ${command} start [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]`,
    `  ${command} ui [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]`,
    `  ${command} serve [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]`,
    `  ${command} stop`,
    `  ${command} <profile-name-or-id> [cli|app] [-- <agent args>]`,
    "",
    "Notes:",
    `  ${command} web is an alias for ${command} serve.`,
    "  --cli and --app are alternatives to the positional profile surface.",
    "  Put agent-specific arguments after --.",
    "",
    "Examples:",
    `  ${command} start`,
    `  ${command} ui`,
    `  ${command} serve --no-open`,
    `  ${command} stop`,
    `  ${command} Codex`,
    `  ${command} default-codex -- --model gpt-5-codex`,
    `  ${command} default-codex app`
  ].join("\n");
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${output}\n`);
  process.exitCode = exitCode;
}

function printStartHelp(exitCode: number): void {
  const command = cliCommandName();
  const output = [
    "Usage:",
    `  ${command} start [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]`,
    "",
    "Options:",
    "  --host <host>    Management server host. Defaults to CCR_WEB_HOST or 127.0.0.1.",
    "  --port <port>    Management server port. Defaults to CCR_WEB_PORT or 3458.",
    "  --open           Open the management page in the default browser.",
    "  --no-open        Do not open the management page.",
    "  --gateway        Start the configured model gateway (default).",
    "  --no-gateway     Start only the web management server.",
    "",
    "Environment:",
    "  CCR_WEB_HOST        Default management server host.",
    "  CCR_WEB_PORT        Default management server port.",
    "  CCR_WEB_AUTH_TOKEN  Use this token for management UI and RPC authentication."
  ].join("\n");
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${output}\n`);
  process.exitCode = exitCode;
}

function printUiHelp(exitCode: number): void {
  const command = cliCommandName();
  const output = [
    "Usage:",
    `  ${command} ui [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]`,
    "",
    "Starts the background CCR service if needed and opens the management UI in the default browser.",
    "",
    "Options:",
    "  --host <host>    Management server host. Defaults to CCR_WEB_HOST or 127.0.0.1.",
    "  --port <port>    Management server port. Defaults to CCR_WEB_PORT or 3458.",
    "  --open           Open the management page (default).",
    "  --no-open        Start or find the service and print the management URL without opening a browser.",
    "  --gateway        Start the configured model gateway (default).",
    "  --no-gateway     Start only the web management server when the service is not already running.",
    "",
    "Environment:",
    "  CCR_WEB_HOST        Default management server host.",
    "  CCR_WEB_PORT        Default management server port.",
    "  CCR_WEB_AUTH_TOKEN  Use this token for management UI and RPC authentication."
  ].join("\n");
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${output}\n`);
  process.exitCode = exitCode;
}

function printStopHelp(exitCode: number): void {
  const command = cliCommandName();
  const output = [
    "Usage:",
    `  ${command} stop`,
    "",
    `Stops the background CCR service started by \`${command} start\`.`
  ].join("\n");
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${output}\n`);
  process.exitCode = exitCode;
}

function printWebHelp(exitCode: number): void {
  const command = cliCommandName();
  const output = [
    "Usage:",
    `  ${command} serve [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]`,
    "",
    `Runs in the foreground. ${command} web is an alias.`,
    "",
    "Options:",
    "  --host <host>    Management server host. Defaults to CCR_WEB_HOST or 127.0.0.1.",
    "  --port <port>    Management server port. Defaults to CCR_WEB_PORT or 3458.",
    "  --open           Open the management page in the default browser.",
    "  --no-open        Do not open the management page (default).",
    "  --gateway        Start the configured model gateway (default).",
    "  --no-gateway     Start only the web management server.",
    "",
    "Environment:",
    "  CCR_WEB_HOST        Default management server host.",
    "  CCR_WEB_PORT        Default management server port.",
    "  CCR_WEB_AUTH_TOKEN  Use this token for management UI and RPC authentication."
  ].join("\n");
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${output}\n`);
  process.exitCode = exitCode;
}

function cliCommandName(): string {
  const configured = process.env.CCR_CLI_COMMAND_NAME?.trim();
  return configured && /^[A-Za-z0-9._-]+$/.test(configured)
    ? configured
    : defaultCliCommandName;
}

function readServiceState(): ServiceState | undefined {
  const file = serviceStateFile();
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<ServiceState>;
    const pid = Number(parsed.pid);
    if (!Number.isInteger(pid) || pid <= 0 || typeof parsed.url !== "string") {
      return undefined;
    }
    return {
      host: parsed.host,
      pid,
      profileManaged: parsed.profileManaged === true,
      serviceToken: typeof parsed.serviceToken === "string" && parsed.serviceToken.trim() ? parsed.serviceToken.trim() : undefined,
      startedAt: parsed.startedAt || "",
      startGateway: parsed.startGateway !== false,
      url: parsed.url
    };
  } catch {
    return undefined;
  }
}

function writeServiceState(state: ServiceState): void {
  const file = serviceStateFile();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function clearServiceState(pid?: number): void {
  const state = readServiceState();
  if (pid !== undefined && state && state.pid !== pid) {
    return;
  }
  try {
    unlinkSync(serviceStateFile());
  } catch {
    // Stale state cleanup is best effort.
  }
}

function serviceStateFile(): string {
  return path.join(CONFIGDIR, serviceStateFileName);
}

type ProfileGatewayLease = {
  release: () => void;
};

function acquireManagedProfileGatewayLease(): ProfileGatewayLease | undefined {
  const state = readServiceState();
  return state?.profileManaged && isProcessRunning(state.pid)
    ? createProfileGatewayLease()
    : undefined;
}

function createProfileGatewayLease(): ProfileGatewayLease {
  const dir = profileGatewayLeaseDir();
  mkdirSync(dir, { mode: 0o700, recursive: true });
  const file = path.join(dir, `${process.pid}-${randomBytes(12).toString("hex")}.json`);
  writeFileSync(file, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
  let released = false;
  return {
    release: () => {
      if (released) {
        return;
      }
      released = true;
      try {
        unlinkSync(file);
      } catch {
        // The service also removes stale leases after an abnormal client exit.
      }
    }
  };
}

function activeProfileGatewayLeaseCount(): number {
  let entries: string[];
  try {
    entries = readdirSync(profileGatewayLeaseDir());
  } catch {
    return 0;
  }
  let active = 0;
  for (const entry of entries) {
    const file = path.join(profileGatewayLeaseDir(), entry);
    const lease = readJsonRecord(file);
    const pid = Number(lease?.pid);
    if (!Number.isInteger(pid) || pid <= 0 || !isProcessRunning(pid)) {
      try {
        unlinkSync(file);
      } catch {
        // Stale lease cleanup is best effort.
      }
      continue;
    }
    active += 1;
  }
  return active;
}

function profileGatewayLeaseDir(): string {
  return path.join(CONFIGDIR, profileGatewayLeaseDirName);
}

async function acquireServiceStartLock(): Promise<() => void> {
  const file = path.join(CONFIGDIR, serviceStartLockFileName);
  const token = randomBytes(16).toString("hex");
  const deadline = Date.now() + serviceStartTimeoutMs + 5_000;
  mkdirSync(path.dirname(file), { recursive: true });

  while (Date.now() < deadline) {
    try {
      writeFileSync(file, `${JSON.stringify({ pid: process.pid, token })}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600
      });
      return () => {
        const lock = readJsonRecord(file);
        if (lock?.token !== token) {
          return;
        }
        try {
          unlinkSync(file);
        } catch {
          // Lock release is best effort; stale owners are cleaned below.
        }
      };
    } catch (error) {
      const code = errorCode(error);
      if (code !== "EEXIST") {
        throw error;
      }
      const lock = readJsonRecord(file);
      const ownerPid = Number(lock?.pid);
      if (!Number.isInteger(ownerPid) || ownerPid <= 0 || !isProcessRunning(ownerPid)) {
        try {
          unlinkSync(file);
        } catch {
          // Another starter may have replaced the lock; retry normally.
        }
        continue;
      }
      await delay(100);
    }
  }
  throw new Error(`Timed out waiting for the CCR service startup lock after ${serviceStartTimeoutMs + 5_000}ms.`);
}

function readJsonRecord(file: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function currentCliScript(): string {
  return __filename;
}

async function waitForServiceState(pid: number | undefined, timeoutMs: number): Promise<ServiceState | undefined> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = readServiceState();
    if (state && (!pid || state.pid === pid) && (await verifyServiceState(state)).ok) {
      return state;
    }
    await delay(150);
  }
  return undefined;
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await delay(150);
  }
  return !isProcessRunning(pid);
}

function isProcessRunning(pid: number | undefined): boolean {
  if (!pid || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    return code === "EPERM";
  }
}

type ServiceStateVerification =
  | { ok: true; trustedPid: boolean }
  | { ok: false };

type ServiceIdentity = {
  pid?: unknown;
  serviceTokenConfigured?: unknown;
  serviceTokenMatches?: unknown;
};

async function verifyServiceState(state: ServiceState): Promise<ServiceStateVerification> {
  if (!isProcessRunning(state.pid)) {
    return { ok: false };
  }

  if (state.serviceToken) {
    const identity = await callServiceRpc<ServiceIdentity>(state, "getServiceIdentity", [state.serviceToken]).catch(() => undefined);
    if (identity?.serviceTokenMatches === true && Number(identity.pid) === state.pid) {
      return { ok: true, trustedPid: true };
    }
    return { ok: false };
  }

  const appInfo = await callServiceRpc<{ name?: unknown }>(state, "getAppInfo").catch(() => undefined);
  return appInfo?.name === "Claude Code Router"
    ? { ok: true, trustedPid: false }
    : { ok: false };
}

async function waitForServiceUnavailable(state: ServiceState, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const appInfo = await callServiceRpc<{ name?: unknown }>(state, "getAppInfo").catch(() => undefined);
    if (appInfo?.name !== "Claude Code Router") {
      return true;
    }
    await delay(150);
  }
  const appInfo = await callServiceRpc<{ name?: unknown }>(state, "getAppInfo").catch(() => undefined);
  return appInfo?.name !== "Claude Code Router";
}

async function callServiceRpc<T>(state: ServiceState, method: string, args: unknown[] = [], timeoutMs = serviceRpcTimeoutMs): Promise<T> {
  const endpoint = serviceRpcEndpoint(state.url);
  const authToken = serviceAuthToken(state.url);
  if (!endpoint || !authToken) {
    throw new Error("CCR service state does not include a usable management URL.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify({ args, method }),
      headers: {
        "content-type": "application/json",
        [webAuthHeader]: authToken
      },
      method: "POST",
      signal: controller.signal
    });
    const payload = await response.json().catch(() => undefined) as { ok?: boolean; value?: T } | undefined;
    if (!response.ok || !payload?.ok) {
      throw new Error(`CCR service RPC ${method} failed with HTTP ${response.status}`);
    }
    return payload.value as T;
  } finally {
    clearTimeout(timer);
  }
}

function serviceRpcEndpoint(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}/api/ccr/rpc`;
  } catch {
    return undefined;
  }
}

function serviceAuthToken(url: string): string {
  try {
    return new URL(url).searchParams.get(webAuthQueryParam)?.trim() ?? "";
  } catch {
    return "";
  }
}

function generateServiceToken(): string {
  return randomBytes(32).toString("base64url");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredArg(value: string | undefined, option: string): string {
  if (!value?.trim()) {
    throw new Error(`${option} requires a value.`);
  }
  return value.trim();
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function waitForChild(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve(code ?? (signal === "SIGINT" ? 130 : 1)));
    child.on("error", (error) => {
      process.stderr.write(`${formatError(error)}\n`);
      resolve(1);
    });
  });
}

function waitForImmediateSpawnError(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<string | undefined> {
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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  process.stderr.write(`${formatError(error)}\n`);
  process.exitCode = 1;
});
