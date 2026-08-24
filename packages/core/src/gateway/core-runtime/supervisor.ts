/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter as pathDelimiter, join as pathJoin, resolve as pathResolve } from "node:path";
import { CONFIGDIR } from "@ccr/core/config/constants";
import {
  deletePersistedRuntimeState,
  loadPersistedRuntimeState,
  replacePersistedRuntimeState
} from "@ccr/core/config/config-repository";
import type { AppConfig, GatewayNetworkEndpoint } from "@ccr/core/contracts/app";
import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";
import { isRecord, numberValue, stringValue } from "@ccr/core/gateway/internal/value";
import { formatError, readHeader } from "@ccr/core/gateway/http/io";
import { coreGatewayAuthHeader, coreGatewayAuthTokenEnv, gatewayEntryOverrideEnv, gatewayPackageCandidates, gatewayRuntimeMarkerFile, requireFromHere } from "@ccr/core/gateway/internal/shared";
import type { CoreGatewayHealth, ManagedGatewayRuntimeMarker } from "@ccr/core/gateway/internal/shared";
import { delay } from "@ccr/core/gateway/internal/clock";

const gatewayRuntimeStateKey = "gateway";
const gatewayConfigAcceptanceTimeoutMs = 5_000;
const gatewayStartupTimeoutMs = 15_000;
const gatewayChildOutputLimit = 4000;
const privateDirMode = 0o700;
const privateFileMode = 0o600;

const gatewayChildOutput = new WeakMap<ChildProcess, { stderr: string; stdout: string }>();

type GatewayNodeRuntime = {
  command: string;
  electronRunAsNode: boolean;
};

export type SpawnedGatewayProcess = {
  child: ChildProcess;
  configAccepted: Promise<void>;
};

export function spawnGatewayProcess(
  config: AppConfig,
  gatewayConfig: Record<string, unknown>,
  upstreamProxyUrl: string | undefined,
  runtimeId: string,
  coreAuthToken: string
): SpawnedGatewayProcess {
  const gatewayEntry = resolveGatewayEntry();
  const fetchPreloadFile = writeGatewayFetchPreloadFile();
  const nodeRuntime = resolveGatewayNodeRuntime();
  const env = createGatewayProcessEnv(config, upstreamProxyUrl, runtimeId, coreAuthToken, nodeRuntime.electronRunAsNode);
  const gatewayBootstrapEntry = resolveGatewayBootstrapEntry();
  const args = ["--require", fetchPreloadFile, gatewayBootstrapEntry];
  const child = spawn(nodeRuntime.command, args, {
    cwd: CONFIGDIR,
    env,
    serialization: "advanced",
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  captureGatewayChildOutput(child);
  if (!child.send) {
    child.kill();
    throw new Error("Gateway runtime did not create an IPC channel.");
  }
  const acceptance = monitorGatewayConfigAcceptance(child);
  void acceptance.promise.catch(() => undefined);
  try {
    child.send({
      config: gatewayConfig,
      gatewayEntry,
      protocolVersion: 1,
      type: "gateway:start"
    }, (error) => {
      if (!error) {
        return;
      }
      acceptance.reject(new Error(`Failed to send runtime config over IPC: ${formatError(error)}`));
      if (!child.killed) {
        child.kill();
      }
    });
  } catch (error) {
    acceptance.reject(new Error(`Failed to send runtime config over IPC: ${formatError(error)}`));
    if (!child.killed) {
      child.kill();
    }
  }
  return {
    child,
    configAccepted: acceptance.promise
  };
}

function monitorGatewayConfigAcceptance(child: ChildProcess): {
  promise: Promise<void>;
  reject: (error: Error) => void;
} {
  let rejectAcceptance = (_error: Error): void => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("error", onError);
      child.off("exit", onExit);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const onMessage = (message: unknown) => {
      if (isRecord(message) && message.type === "gateway:config-accepted" && message.protocolVersion === 1) {
        finish();
      }
    };
    const onError = (error: Error) => {
      finish(new Error(appendGatewayChildOutput(
        child,
        `Core gateway failed before accepting runtime config: ${formatError(error)}`
      )));
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(new Error(formatCoreGatewayChildExit(child, code, signal, "before accepting runtime config")));
    };
    const timer = setTimeout(() => {
      finish(new Error(`Core gateway did not accept runtime config within ${gatewayConfigAcceptanceTimeoutMs}ms.`));
    }, gatewayConfigAcceptanceTimeoutMs);
    rejectAcceptance = (error) => finish(error);
    child.on("message", onMessage);
    child.once("error", onError);
    child.once("exit", onExit);
  });
  return {
    promise,
    reject: (error) => rejectAcceptance(error)
  };
}

export function formatCoreGatewayChildExit(
  child: ChildProcess,
  code: number | null = child.exitCode,
  signal: NodeJS.Signals | null = child.signalCode,
  phase?: string
): string {
  const status = signal ?? code ?? (child.killed ? "killed" : "unknown status");
  const phaseSuffix = phase ? ` ${phase}` : "";
  return appendGatewayChildOutput(child, `Core gateway exited with ${status}${phaseSuffix}.`);
}

function resolveGatewayBootstrapEntry(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const entry = [
    pathJoin(__dirname, "gateway-bootstrap.js"),
    pathJoin(process.cwd(), ".test-dist", "core", "runtime", "gateway-bootstrap.js"),
    ...(resourcesPath
      ? [
          pathJoin(resourcesPath, "app.asar", "dist", "main", "gateway-bootstrap.js"),
          pathJoin(resourcesPath, "app", "dist", "main", "gateway-bootstrap.js")
        ]
      : [])
  ].find((candidate) => existsSync(candidate));
  if (!entry) {
    throw new Error("CCR gateway IPC bootstrap was not found. Run npm run build:assets.");
  }
  return entry;
}

export function resolveUpstreamHeaderSanitizerEntry(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return [
    pathJoin(__dirname, "upstream-header-sanitizer.js"),
    pathJoin(process.cwd(), ".test-dist", "core", "runtime", "upstream-header-sanitizer.js"),
    ...(resourcesPath
      ? [
          pathJoin(resourcesPath, "app.asar", "dist", "main", "upstream-header-sanitizer.js"),
          pathJoin(resourcesPath, "app", "dist", "main", "upstream-header-sanitizer.js")
        ]
      : [])
  ].find((candidate) => existsSync(candidate)) ?? pathJoin(__dirname, "upstream-header-sanitizer.js");
}

export function resolveLocalAgentAuthProviderHookEntry(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return [
    pathJoin(__dirname, "local-agent-auth-provider-hook.js"),
    pathJoin(process.cwd(), ".test-dist", "core", "runtime", "local-agent-auth-provider-hook.js"),
    ...(resourcesPath
      ? [
          pathJoin(resourcesPath, "app.asar", "dist", "main", "local-agent-auth-provider-hook.js"),
          pathJoin(resourcesPath, "app", "dist", "main", "local-agent-auth-provider-hook.js")
        ]
      : [])
  ].find((candidate) => existsSync(candidate)) ?? pathJoin(__dirname, "local-agent-auth-provider-hook.js");
}

function resolveGatewayEntry(): string {
  const override = process.env[gatewayEntryOverrideEnv]?.trim();
  if (override) {
    const entry = pathResolve(override);
    if (!existsSync(entry)) {
      throw new Error(`${gatewayEntryOverrideEnv} points to a missing gateway entry: ${entry}`);
    }
    return entry;
  }

  const bundledEntry = resolveBundledGatewayEntry();
  if (bundledEntry) {
    return bundledEntry;
  }

  for (const packageName of gatewayPackageCandidates) {
    try {
      return requireFromHere.resolve(packageName);
    } catch {
      // Try the next known package name.
    }
  }
  return requireFromHere.resolve(gatewayPackageCandidates[0]);
}

function resolveBundledGatewayEntry(): string | undefined {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return [
    pathJoin(__dirname, "next-ai-gateway.js"),
    ...(resourcesPath
      ? [
          pathJoin(resourcesPath, "app.asar", "dist", "main", "next-ai-gateway.js"),
          pathJoin(resourcesPath, "app", "dist", "main", "next-ai-gateway.js")
        ]
      : [])
  ].find((candidate) => existsSync(candidate));
}

export function resolveUndiciProxyAgentModule(): string {
  const bundled = resolveBundledUndiciProxyAgentModule();
  if (bundled) {
    return bundled;
  }

  try {
    return requireFromHere.resolve("undici");
  } catch (error) {
    throw new Error(`Unable to resolve undici ProxyAgent module for gateway proxy preload: ${formatError(error)}`);
  }
}

function resolveBundledUndiciProxyAgentModule(): string | undefined {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return [
    pathJoin(__dirname, "undici-proxy-agent.js"),
    ...(resourcesPath
      ? [
          pathJoin(resourcesPath, "app.asar", "dist", "main", "undici-proxy-agent.js"),
          pathJoin(resourcesPath, "app", "dist", "main", "undici-proxy-agent.js")
        ]
      : [])
  ].find((candidate) => existsSync(candidate));
}

function createGatewayProcessEnv(
  config: AppConfig,
  upstreamProxyUrl: string | undefined,
  runtimeId: string,
  coreAuthToken: string,
  electronRunAsNode: boolean
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AUTH_ENABLED: "true",
    AUTH_MODE: "static_api_key",
    AUTH_REQUIRED: "true",
    AUTH_STATIC_API_KEY_BEARER_ONLY: "false",
    AUTH_STATIC_API_KEY_ENV: coreGatewayAuthTokenEnv,
    AUTH_STATIC_API_KEY_HEADER: coreGatewayAuthHeader,
    CCR_GATEWAY_RUNTIME_ID: runtimeId,
    CCR_UNDICI_MODULE: resolveUndiciProxyAgentModule(),
    CCR_UPSTREAM_TIMEOUT_MS: String(gatewayUpstreamTimeoutMs(config)),
    [coreGatewayAuthTokenEnv]: coreAuthToken,
    HOST: config.gateway.coreHost,
    PORT: String(config.gateway.corePort)
  };
  if (electronRunAsNode) {
    env.ELECTRON_RUN_AS_NODE = "1";
  } else {
    delete env.ELECTRON_RUN_AS_NODE;
  }

  // The managed gateway must use the generated raw-trace policy. Inheriting
  // the upstream gateway's RAW_TRACE_* overrides could bypass CCR privacy,
  // size, spool, or sync-endpoint controls.
  for (const key of Object.keys(env)) {
    if (key.startsWith("RAW_TRACE_")) delete env[key];
  }

  const noProxy = mergeNoProxy(env.NO_PROXY || env.no_proxy, [
    "127.0.0.1",
    "localhost",
    "::1",
    config.gateway.host,
    config.gateway.coreHost
  ]);
  env.NO_PROXY = noProxy;
  env.no_proxy = noProxy;

  if (!upstreamProxyUrl) {
    return env;
  }

  env.HTTP_PROXY = upstreamProxyUrl;
  env.HTTPS_PROXY = upstreamProxyUrl;
  env.ALL_PROXY = upstreamProxyUrl;
  env.http_proxy = upstreamProxyUrl;
  env.https_proxy = upstreamProxyUrl;
  env.all_proxy = upstreamProxyUrl;
  env.CCR_UPSTREAM_PROXY_URL = upstreamProxyUrl;
  return env;
}

function gatewayUpstreamTimeoutMs(config: AppConfig): number {
  const value = Number(config.API_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

function resolveGatewayNodeRuntime(): GatewayNodeRuntime {
  const candidates = uniqueGatewayNodeRuntimeCandidates([
    ...configuredGatewayNodeRuntimeCandidates(),
    ...systemGatewayNodeRuntimeCandidates(),
    { command: process.execPath, electronRunAsNode: Boolean(process.versions.electron) }
  ]);
  const nativeProbe = resolveGatewayNativeProbeModule();
  if (nativeProbe) {
    const compatible = candidates.find((candidate) => canLoadGatewayNativeProbe(candidate, nativeProbe));
    if (compatible) return compatible;
  }
  return candidates[0] ?? { command: process.execPath, electronRunAsNode: Boolean(process.versions.electron) };
}

function configuredGatewayNodeRuntimeCandidates(): GatewayNodeRuntime[] {
  const configured = process.env.CCR_NODE_BIN?.trim();
  return configured ? [{ command: configured, electronRunAsNode: false }] : [];
}

function systemGatewayNodeRuntimeCandidates(): GatewayNodeRuntime[] {
  if (!process.versions.electron) {
    return [];
  }
  return [
    process.env.NODE_BINARY?.trim(),
    process.env.NODE?.trim(),
    resolvePathExecutable(process.platform === "win32" ? "node.exe" : "node"),
    process.platform === "darwin" ? "/opt/homebrew/bin/node" : "",
    process.platform === "darwin" ? "/usr/local/bin/node" : "",
    process.platform === "win32" ? "" : "/usr/bin/node"
  ]
    .filter((candidate): candidate is string => Boolean(candidate && executableExists(candidate)))
    .map((command) => ({ command, electronRunAsNode: false }));
}

function uniqueGatewayNodeRuntimeCandidates(candidates: GatewayNodeRuntime[]): GatewayNodeRuntime[] {
  const seen = new Set<string>();
  const unique: GatewayNodeRuntime[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.electronRunAsNode ? "electron" : "node"}\0${candidate.command}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function resolveGatewayNativeProbeModule(): string | undefined {
  try {
    return requireFromHere.resolve("better-sqlite3");
  } catch {
    return undefined;
  }
}

function canLoadGatewayNativeProbe(candidate: GatewayNodeRuntime, modulePath: string): boolean {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (candidate.electronRunAsNode) {
    env.ELECTRON_RUN_AS_NODE = "1";
  } else {
    delete env.ELECTRON_RUN_AS_NODE;
  }
  const result = spawnSync(candidate.command, ["-e", "require(process.argv[1])", modulePath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 3000,
    windowsHide: true
  });
  return result.status === 0;
}

function resolvePathExecutable(name: string): string {
  for (const directory of (process.env.PATH ?? "").split(pathDelimiter)) {
    const candidate = pathJoin(directory, name);
    if (executableExists(candidate)) {
      return candidate;
    }
  }
  return "";
}

function executableExists(candidate: string): boolean {
  if (!candidate) return false;
  if (!candidate.includes("/") && !candidate.includes("\\")) return true;
  return existsSync(candidate);
}

function captureGatewayChildOutput(child: ChildProcess): void {
  gatewayChildOutput.set(child, { stderr: "", stdout: "" });
  child.stdout?.on("data", (chunk) => appendGatewayOutput(child, "stdout", chunk));
  child.stderr?.on("data", (chunk) => appendGatewayOutput(child, "stderr", chunk));
}

function appendGatewayOutput(child: ChildProcess, stream: "stderr" | "stdout", chunk: Buffer | string): void {
  const output = gatewayChildOutput.get(child);
  if (!output) return;
  output[stream] = `${output[stream]}${chunk.toString()}`.slice(-gatewayChildOutputLimit);
}

function appendGatewayChildOutput(child: ChildProcess, message: string): string {
  const output = gatewayChildOutput.get(child);
  if (!output) return message;
  const stderr = output.stderr.trim();
  const stdout = output.stdout.trim();
  const details = [
    stderr ? `stderr:\n${stderr}` : "",
    stdout ? `stdout:\n${stdout}` : ""
  ].filter(Boolean).join("\n");
  return details ? `${message}\n${details}` : message;
}

export function writeGatewayFetchPreloadFile(configDir = CONFIGDIR): string {
  const file = pathJoin(configDir, "gateway-proxy-preload.cjs");
  mkdirSync(configDir, { mode: privateDirMode, recursive: true });
  securePathPermissions(configDir, privateDirMode);
  writeFileSync(file, gatewayFetchPreloadScript(), { encoding: "utf8", mode: privateFileMode });
  securePathPermissions(file, privateFileMode);
  return file;
}

export function writeGatewayProxyPreloadFile(): string {
  return writeGatewayFetchPreloadFile();
}

function securePathPermissions(file: string, mode: number): void {
  if (process.platform === "win32" || !existsSync(file)) {
    return;
  }
  try {
    chmodSync(file, mode);
  } catch {
    // Best effort for filesystems that do not support chmod.
  }
}

function gatewayFetchPreloadScript(): string {
  return [
    "\"use strict\";",
    "const up = process.env.CCR_UPSTREAM_PROXY_URL;",
    "const um = process.env.CCR_UNDICI_MODULE;",
    "const rawTimeout = process.env.CCR_UPSTREAM_TIMEOUT_MS;",
    "const parsedTimeout = rawTimeout === undefined || rawTimeout === '' ? NaN : Number(rawTimeout);",
    "const hasTimeout = Number.isFinite(parsedTimeout) && parsedTimeout >= 0;",
    "if ((up || hasTimeout) && um) {",
    "  const { Agent, ProxyAgent } = require(um);",
    "  const timeoutOptions = hasTimeout ? { headersTimeout: Math.trunc(parsedTimeout), bodyTimeout: Math.trunc(parsedTimeout) } : {};",
    "  const directAgent = hasTimeout ? new Agent(timeoutOptions) : undefined;",
    "  const proxyAgent = up ? new ProxyAgent(Object.assign({ uri: up }, timeoutOptions)) : undefined;",
    "  const realFetch = globalThis.fetch.bind(globalThis);",
    "  const raw = (process.env.NO_PROXY || process.env.no_proxy || '').toLowerCase();",
    "  const byp = raw.split(',').map((s) => s.trim()).filter(Boolean);",
    "  const norm = (h) => h.replace(/^\\[/, '').replace(/\\]$/, '').replace(/\\.$/, '');",
    "  const isLP = (h) => h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0:0:0:0:0:0:0:1' || h === '0.0.0.0' || h.startsWith('127.');",
    "  const requestUrl = (input) => {",
    "    try {",
    "      return typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input && input.url ? input.url : String(input));",
    "    } catch { return undefined; }",
    "  };",
    "  const shouldBypass = (input) => {",
    "    const u = requestUrl(input);",
    "    if (!u) return true;",
    "    const h = norm(u.hostname);",
    "    if (!h) return false;",
    "    if (isLP(h)) return true;",
    "    return byp.some((p) => {",
    "      if (p === '*') return true;",
    "      const s = p.split(':');",
    "      const ph = norm(s[0]);",
    "      if (s.length === 2 && s[1]) return h === ph && u.port === s[1];",
    "      if (ph.startsWith('*.')) return h.endsWith(ph.slice(1));",
    "      if (ph.startsWith('.')) return h.endsWith(ph) || h === ph.slice(1);",
    "      return h === ph;",
    "    });",
    "  };",
    "  const dispatcherFor = (input) => {",
    "    if (!proxyAgent) return directAgent;",
    "    return shouldBypass(input) ? directAgent : proxyAgent;",
    "  };",
    "  const patched = function(input, init) {",
    "    if (init && init.dispatcher) return realFetch(input, init);",
    "    const dispatcher = dispatcherFor(input);",
    "    if (!dispatcher) return realFetch(input, init);",
    "    return realFetch(input, Object.assign({}, init, { dispatcher }));",
    "  };",
    "  if (Object.getOwnPropertyDescriptor(globalThis, 'fetch')?.writable) {",
    "    globalThis.fetch = patched;",
    "  }",
    "}"
  ].join("\n");
}

export function gatewayFetchPreloadScriptForTest(): string {
  return gatewayFetchPreloadScript();
}

function mergeNoProxy(current: string | undefined, values: string[]): string {
  const merged = new Set<string>();
  for (const value of [...(current || "").split(","), ...values]) {
    const trimmed = value.trim();
    if (trimmed) {
      merged.add(trimmed);
    }
  }
  return [...merged].join(",");
}

export function endpoint(host: string, port: number): string {
  const unwrappedHost = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
  const connectHost = !unwrappedHost || unwrappedHost === "0.0.0.0"
    ? "127.0.0.1"
    : unwrappedHost === "::"
      ? "::1"
      : unwrappedHost;
  const endpointHost = connectHost.includes(":") ? `[${connectHost}]` : connectHost;
  return `http://${endpointHost}:${port}`;
}

export function gatewayNetworkEndpoints(host: string, port: number): GatewayNetworkEndpoint[] {
  const normalizedHost = normalizeBindHost(host);
  const lanAddresses = physicalLanAddresses();
  const addresses = isWildcardBindHost(normalizedHost)
    ? lanAddresses
    : lanAddresses.filter((entry) => entry.address === normalizedHost);

  return addresses.map((entry) => ({
    address: entry.address,
    endpoint: endpoint(entry.address, port),
    interfaceName: entry.interfaceName
  }));
}

function physicalLanAddresses(): Array<{ address: string; interfaceName: string }> {
  const seen = new Set<string>();
  const result: Array<{ address: string; interfaceName: string }> = [];

  for (const [interfaceName, entries] of Object.entries(networkInterfaces())) {
    if (!entries || isVirtualNetworkInterface(interfaceName)) {
      continue;
    }

    for (const entry of entries) {
      if (entry.internal || entry.family !== "IPv4" || !isPrivateIpv4(entry.address)) {
        continue;
      }

      const key = `${interfaceName}:${entry.address}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push({ address: entry.address, interfaceName });
    }
  }

  return result.sort((left, right) =>
    left.interfaceName.localeCompare(right.interfaceName) ||
    left.address.localeCompare(right.address, undefined, { numeric: true })
  );
}

function normalizeBindHost(host: string): string {
  return host.trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function isWildcardBindHost(host: string): boolean {
  return host === "" || host === "0.0.0.0" || host === "::" || host === "::0";
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  return parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

function isVirtualNetworkInterface(interfaceName: string): boolean {
  const normalized = interfaceName.toLowerCase();
  return [
    /^lo\d*$/,
    /^awdl\d*$/,
    /^llw\d*$/,
    /^utun\d*$/,
    /^gif\d*$/,
    /^stf\d*$/,
    /^bridge\d*$/,
    /^br-/,
    /^docker/,
    /^veth/,
    /^vmnet/,
    /^vbox/,
    /^tun\d*$/,
    /^tap\d*$/,
    /^wg\d*$/,
    /\bloopback\b/,
    /\bvirtual\b/,
    /\bvirtualbox\b/,
    /\bvmware\b/,
    /\bhyper-v\b/,
    /\bvethernet\b/,
    /\bwsl\b/,
    /\btunnel\b/,
    /\btailscale\b/,
    /\bzerotier\b/,
    /\bwireguard\b/,
    /\bhamachi\b/,
    /\bparallels\b/,
    /\bvpn\b/
  ].some((pattern) => pattern.test(normalized));
}

export async function stopPreviousManagedCoreGateway(coreEndpoint: string): Promise<void> {
  const marker = await readManagedCoreGatewayMarker();
  const markerRuntimeId = stringValue(marker?.runtimeId);
  const pid = numberValue(marker?.pid);
  if (!markerRuntimeId || !pid) {
    await removeManagedCoreGatewayMarker();
    return;
  }

  if (!isProcessAlive(pid)) {
    await removeManagedCoreGatewayMarker();
    return;
  }

  const health = await readCoreGatewayHealth(coreEndpoint);
  if (health?.runtimeId !== markerRuntimeId) {
    await removeManagedCoreGatewayMarker();
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    await removeManagedCoreGatewayMarker();
    return;
  }

  if (await waitForCoreGatewayStop(coreEndpoint)) {
    await removeManagedCoreGatewayMarker();
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Process may have exited between the health check and SIGKILL.
  }
  await waitForCoreGatewayStop(coreEndpoint);
  await removeManagedCoreGatewayMarker();
}

async function readManagedCoreGatewayMarker(): Promise<ManagedGatewayRuntimeMarker | undefined> {
  const persisted = await loadPersistedRuntimeState(gatewayRuntimeStateKey);
  if (isRecord(persisted)) {
    return persisted;
  }

  const file = managedCoreGatewayMarkerPath();
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function writeManagedCoreGatewayMarker(child: ChildProcess, runtimeId: string): Promise<void> {
  if (!child.pid) {
    throw new Error("Managed gateway process did not expose a PID.");
  }
  await replacePersistedRuntimeState(gatewayRuntimeStateKey, {
    gatewayEntry: resolveGatewayEntry(),
    pid: child.pid,
    runtimeId,
    startedAt: new Date().toISOString()
  });
}

export async function removeManagedCoreGatewayMarker(): Promise<void> {
  await deletePersistedRuntimeState(gatewayRuntimeStateKey);
  try {
    rmSync(managedCoreGatewayMarkerPath(), { force: true });
  } catch (error) {
    console.warn(`[gateway] Failed to remove gateway runtime marker: ${formatError(error)}`);
  }
}

function managedCoreGatewayMarkerPath(): string {
  return pathJoin(CONFIGDIR, gatewayRuntimeMarkerFile);
}

export async function waitForCoreGatewayStop(coreEndpoint: string): Promise<boolean> {
  for (let index = 0; index < 20; index += 1) {
    if (!(await isCoreGatewayHealthy(coreEndpoint))) {
      return true;
    }
    await delay(100);
  }
  return false;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function assertLoopbackCoreHost(host: string): void {
  const error = loopbackCoreHostError(host);
  if (error) {
    throw new Error(error);
  }
}

export function loopbackCoreHostError(host: string): string | undefined {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1"
    ? undefined
    : "Core gateway host must be 127.0.0.1 or ::1.";
}

export function generateCoreGatewayAuthToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function isCoreGatewayHealthy(coreEndpoint: string): Promise<boolean> {
  const health = await readCoreGatewayHealth(coreEndpoint);
  return health?.status === "ok";
}

export async function waitForManagedCoreGatewayReady(
  coreEndpoint: string,
  runtimeId: string,
  child: ChildProcess
): Promise<void> {
  const deadline = Date.now() + gatewayStartupTimeoutMs;
  let lastHealth: CoreGatewayHealth | undefined;
  while (Date.now() < deadline) {
    assertGatewayChildRunning(child);
    lastHealth = await readCoreGatewayHealth(coreEndpoint);
    assertGatewayChildRunning(child);
    if (lastHealth?.status === "ok") {
      if (lastHealth.runtimeId === runtimeId) {
        return;
      }
      if (lastHealth.runtimeId) {
        throw new Error(
          `Core gateway endpoint ${coreEndpoint} is owned by a different runtime (${lastHealth.runtimeId}).`
        );
      }
    }
    await delay(100);
  }
  const healthDetail = lastHealth
    ? ` Last health response: ${JSON.stringify(lastHealth)}.`
    : "";
  throw new Error(
    `Core gateway runtime ${runtimeId} did not become healthy within ${gatewayStartupTimeoutMs}ms.${healthDetail}`
  );
}

function assertGatewayChildRunning(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null || child.killed) {
    throw new Error(`Core gateway exited during startup with ${child.signalCode ?? child.exitCode ?? "unknown status"}.`);
  }
}

async function readCoreGatewayHealth(coreEndpoint: string): Promise<CoreGatewayHealth | undefined> {
  if (!coreEndpoint) {
    return undefined;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 500);
  try {
    const healthUrl = new URL("/health", coreEndpoint);
    const response = await fetchWithSystemProxy(healthUrl, { signal: controller.signal });
    if (!response.ok) {
      return undefined;
    }
    const body = await response.json().catch(() => undefined);
    if (!isRecord(body)) {
      return undefined;
    }
    return {
      runtimeId: stringValue(body.runtimeId),
      status: stringValue(body.status)
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export function shouldRunUnifiedServer(config: AppConfig): boolean {
  return config.gateway.enabled || config.proxy.enabled;
}

export function shouldRunGatewayRuntime(config: AppConfig): boolean {
  return config.gateway.enabled ||
    config.mediaTools.enabled ||
    (config.proxy.enabled && config.proxy.mode === "gateway");
}

export function shouldServeGatewayRequest(config: AppConfig, request: IncomingMessage): boolean {
  if (config.gateway.enabled) {
    return true;
  }
  return config.proxy.enabled && config.proxy.mode === "gateway" && readHeader(request.headers["x-ccr-proxy-mode"]) === "gateway";
}

export function applyCors(response: ServerResponse, config?: AppConfig): void {
  const origin = config ? endpoint(config.gateway.host, config.gateway.port) : "*";
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, Last-Event-ID, Anthropic-Version, Anthropic-Beta, Mcp-Session-Id, MCP-Protocol-Version");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}
