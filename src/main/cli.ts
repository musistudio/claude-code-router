#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants as fsConstants, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertAvailableGatewayModels, type ProfileConfig, type ProfileOpenSurface } from "../shared/app";
import { botGatewayProfileEnv } from "./bot-gateway-env";
import { applyClaudeAppGatewayConfig } from "./claude-app-gateway-service";
import { launchClaudeAppProfile, resolveClaudeAppProfileUserDataDir } from "./claude-app-launch";
import { launchCodexAppProfile, launchZcodeAppProfile } from "./codex-app-launch";
import { loadAppConfig } from "./config";
import { CONFIGDIR } from "./constants";
import { applyProfileConfig, applyProfileRuntimeConfig } from "./profile-service";
import { ensureProfileGateway } from "./profile-launch-service";
import { buildProfileLaunchPlan, defaultProfileOpenSurface, findProfileForOpen, profileLaunchSpawnCommand, resolveProfileOpenSurface } from "./profile-launch-core";
import { startWebManagementServer } from "./web-management-server";

type ProfileCliOptions = {
  agentArgs: string[];
  command: "profile";
  help: boolean;
  profileRef: string;
  surface?: ProfileOpenSurface;
};

type WebCliOptions = {
  command: "start" | "web";
  daemonChild: boolean;
  help: boolean;
  host?: string;
  open: boolean;
  port?: number;
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
  startedAt: string;
  startGateway: boolean;
  url: string;
};

const serviceStateFileName = "service.json";
const serviceStartTimeoutMs = 30_000;
const serviceStopTimeoutMs = 10_000;

async function main(): Promise<void> {
  const delegatedExitCode = delegateManagedDesktopCliToExternalCli();
  if (delegatedExitCode !== undefined) {
    process.exitCode = delegatedExitCode;
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  if (options.command === "start") {
    if (options.help) {
      printStartHelp(0);
      return;
    }
    await startService(options);
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

  const launchConfig = await ensureProfileGateway(config, profile, resolvedSurface === "app" ? profileAppName(profile) : profile.name || profile.id || "profile", {
    reuseExisting: true,
    startIfMissing: false
  });
  if (resolvedSurface === "cli") {
    const runtimeResult = applyProfileRuntimeConfig(launchConfig, profile, launchConfig.APIKEY);
    if (!runtimeResult.ok) {
      throw new Error(runtimeResult.message);
    }
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
  if ((profile.agent === "codex" || profile.agent === "zcode") && resolvedSurface === "app" && profileOptions.agentArgs.length === 0) {
    if (profile.agent === "zcode") {
      const launch = launchZcodeAppProfile(configDir, profile, launchConfig);
      const spawnError = await waitForImmediateSpawnError(launch.child, 500);
      if (spawnError) {
        throw new Error(`Failed to open ZCode App: ${spawnError}`);
      }
      process.stdout.write(`Opened ZCode App with ${profile.name || profile.id}.\n`);
    } else {
      const launch = launchCodexAppProfile(configDir, profile, launchConfig);
      const spawnError = await waitForImmediateSpawnError(launch.child, 500);
      if (spawnError) {
        throw new Error(`Failed to open Codex App: ${spawnError}`);
      }
      process.stdout.write(`Opened Codex App with ${profile.name || profile.id}.\n`);
    }
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
}

function parseArgs(args: string[]): CliOptions {
  if (args[0] === "start") {
    return parseWebArgs(args.slice(1), "start");
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
  return "Codex App";
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

function parseWebArgs(args: string[], command: WebCliOptions["command"]): WebCliOptions {
  const options: WebCliOptions = {
    command,
    daemonChild: false,
    help: false,
    open: false,
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

async function startService(options: WebCliOptions): Promise<void> {
  const current = readServiceState();
  if (current && isProcessRunning(current.pid)) {
    process.stdout.write(`CCR service is already running at ${current.url} (pid ${current.pid}).\n`);
    return;
  }
  clearServiceState();

  const childArgs = [
    currentCliScript(),
    "serve",
    "--daemon-child",
    ...(options.host ? ["--host", options.host] : []),
    ...(options.port ? ["--port", String(options.port)] : []),
    ...(options.open ? ["--open"] : ["--no-open"]),
    ...(options.startGateway ? [] : ["--no-gateway"])
  ];
  const child = spawn(process.execPath, childArgs, {
    detached: true,
    env: serviceChildEnv(),
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
}

function serviceChildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
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
    writeServiceState({
      host: options.host,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      startGateway: options.startGateway,
      url: runtime.url
    });
  }
  process.stdout.write(`CCR web management is running at ${runtime.url}\n`);

  let closing = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (closing) {
      return;
    }
    closing = true;
    void runtime.close().finally(() => {
      if (options.daemonChild) {
        clearServiceState(process.pid);
      }
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await new Promise(() => undefined);
}

async function stopService(): Promise<void> {
  const state = readServiceState();
  if (!state) {
    process.stdout.write("CCR service is not running.\n");
    return;
  }
  if (!isProcessRunning(state.pid)) {
    clearServiceState(state.pid);
    process.stdout.write("CCR service is not running.\n");
    return;
  }
  process.kill(state.pid, "SIGTERM");
  const stopped = await waitForProcessExit(state.pid, serviceStopTimeoutMs);
  if (!stopped && isProcessRunning(state.pid)) {
    throw new Error(`CCR service pid ${state.pid} did not stop within ${serviceStopTimeoutMs}ms.`);
  }
  clearServiceState(state.pid);
  process.stdout.write("CCR service stopped.\n");
}

function printHelp(exitCode: number): void {
  const output = [
    "Usage:",
    "  ccr start [--host <host>] [--port <port>] [--open] [--no-gateway]",
    "  ccr stop",
    "  ccr <profile-name-or-id> [cli|app] [-- <agent args>]",
    "",
    "Examples:",
    "  ccr start",
    "  ccr stop",
    "  ccr Codex",
    "  ccr default-codex -- --model gpt-5-codex",
    "  ccr default-codex app"
  ].join("\n");
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${output}\n`);
  process.exitCode = exitCode;
}

function printStartHelp(exitCode: number): void {
  const output = [
    "Usage:",
    "  ccr start [--host <host>] [--port <port>] [--open] [--no-gateway]",
    "",
    "Options:",
    "  --host <host>    Management server host. Defaults to 127.0.0.1.",
    "  --port <port>    Management server port. Defaults to 3458.",
    "  --open           Open the management page in the default browser.",
    "  --no-open        Do not open the management page.",
    "  --no-gateway     Start only the web management server."
  ].join("\n");
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${output}\n`);
  process.exitCode = exitCode;
}

function printStopHelp(exitCode: number): void {
  const output = [
    "Usage:",
    "  ccr stop",
    "",
    "Stops the background CCR service started by `ccr start`."
  ].join("\n");
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${output}\n`);
  process.exitCode = exitCode;
}

function printWebHelp(exitCode: number): void {
  const output = [
    "Usage:",
    "  ccr serve [--host <host>] [--port <port>] [--open] [--no-gateway]",
    "",
    "Options:",
    "  --host <host>    Management server host. Defaults to 127.0.0.1.",
    "  --port <port>    Management server port. Defaults to 3458.",
    "  --open           Open the management page in the default browser.",
    "  --no-gateway     Start only the web management server."
  ].join("\n");
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${output}\n`);
  process.exitCode = exitCode;
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

function currentCliScript(): string {
  return __filename;
}

function delegateManagedDesktopCliToExternalCli(): number | undefined {
  if (!isManagedDesktopCliRuntime()) {
    return undefined;
  }
  if (process.env.CCR_MANAGED_CLI_NO_DELEGATE === "1" || process.env.CCR_MANAGED_CLI_DELEGATED === "1") {
    return undefined;
  }

  const externalCcr = findExternalCcrCommand();
  if (!externalCcr) {
    return undefined;
  }

  const launch = profileLaunchSpawnCommand({
    args: process.argv.slice(2),
    command: externalCcr
  });
  const result = spawnSync(launch.command, launch.args, {
    env: {
      ...process.env,
      CCR_MANAGED_CLI_DELEGATED: "1"
    },
    stdio: "inherit",
    windowsVerbatimArguments: !!launch.windowsVerbatimArguments
  });
  if (result.error) {
    return undefined;
  }
  if (typeof result.status === "number") {
    return result.status;
  }
  return result.signal === "SIGINT" ? 130 : 1;
}

function isManagedDesktopCliRuntime(): boolean {
  const script = process.argv[1] || __filename;
  return samePath(path.resolve(script), path.join(CONFIGDIR, "bin", "ccr-cli.js"));
}

function findExternalCcrCommand(): string | undefined {
  const pathKey = process.platform === "win32"
    ? Object.keys(process.env).find((key) => key.toLowerCase() === "path") || "Path"
    : "PATH";
  const pathValue = process.env[pathKey] || "";
  const managedBinDir = path.resolve(CONFIGDIR, "bin");
  const names = process.platform === "win32"
    ? ["ccr.cmd", "ccr.exe", "ccr.bat", "ccr"]
    : ["ccr"];

  for (const rawSegment of pathValue.split(path.delimiter)) {
    const dir = path.resolve(rawSegment || ".");
    if (samePath(dir, managedBinDir)) {
      continue;
    }
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function isExecutableFile(file: string): boolean {
  try {
    const stats = statSync(file);
    if (!stats.isFile() && !stats.isSymbolicLink()) {
      return false;
    }
    if (process.platform === "win32") {
      return true;
    }
    accessSync(file, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = path.normalize(left);
  const normalizedRight = path.normalize(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

async function waitForServiceState(pid: number | undefined, timeoutMs: number): Promise<ServiceState | undefined> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = readServiceState();
    if (state && (!pid || state.pid === pid) && isProcessRunning(state.pid)) {
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
