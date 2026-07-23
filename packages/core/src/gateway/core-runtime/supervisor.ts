/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join as pathJoin, resolve as pathResolve } from "node:path";
import type { AppConfig, GatewayNetworkEndpoint } from "@ccr/core/contracts/app";
import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";
import { isRecord, numberValue, stringValue } from "@ccr/core/gateway/internal/value";
import { formatError, readHeader } from "@ccr/core/gateway/http/io";
import { coreGatewayAuthHeader, coreGatewayAuthTokenEnv, gatewayEntryOverrideEnv, gatewayPackageCandidates, gatewayRuntimeMarkerFile, requireFromHere } from "@ccr/core/gateway/internal/shared";
import type { CoreGatewayHealth, ManagedGatewayRuntimeMarker } from "@ccr/core/gateway/internal/shared";
import { delay } from "@ccr/core/gateway/internal/clock";


export function spawnGatewayProcess(config: AppConfig, upstreamProxyUrl: string | undefined, runtimeId: string, coreAuthToken: string): ChildProcess {
  const gatewayEntry = resolveGatewayEntry();
  const proxyPreloadFile = upstreamProxyUrl ? writeGatewayProxyPreloadFile(config, upstreamProxyUrl) : undefined;
  const env = createGatewayProcessEnv(config, upstreamProxyUrl, runtimeId, coreAuthToken);
  const args = proxyPreloadFile ? ["--require", proxyPreloadFile, gatewayEntry] : [gatewayEntry];
  return spawn(process.execPath, args, {
    cwd: dirname(config.gateway.generatedConfigFile),
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
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


function createGatewayProcessEnv(config: AppConfig, upstreamProxyUrl: string | undefined, runtimeId: string, coreAuthToken: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AUTH_ENABLED: "true",
    AUTH_MODE: "static_api_key",
    AUTH_REQUIRED: "true",
    AUTH_STATIC_API_KEY_BEARER_ONLY: "false",
    AUTH_STATIC_API_KEY_ENV: coreGatewayAuthTokenEnv,
    AUTH_STATIC_API_KEY_HEADER: coreGatewayAuthHeader,
    CCR_GATEWAY_RUNTIME_ID: runtimeId,
    [coreGatewayAuthTokenEnv]: coreAuthToken,
    ELECTRON_RUN_AS_NODE: "1",
    GATEWAY_CONFIG_PATH: config.gateway.generatedConfigFile,
    HOST: config.gateway.coreHost,
    PORT: String(config.gateway.corePort)
  };

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
  env.CCR_UNDICI_MODULE = resolveUndiciProxyAgentModule();
  return env;
}


export function writeGatewayProxyPreloadFile(config: AppConfig, upstreamProxyUrl: string): string {
  const file = pathJoin(dirname(config.gateway.generatedConfigFile), "gateway-proxy-preload.cjs");
  writeFileSync(
    file,
    [
      "\"use strict\";",
      "const up = process.env.CCR_UPSTREAM_PROXY_URL;",
      "const um = process.env.CCR_UNDICI_MODULE;",
      "if (up && um) {",
      "  const { ProxyAgent } = require(um);",
      "  const agent = new ProxyAgent(up);",
      "  const realFetch = globalThis.fetch.bind(globalThis);",
      "  const raw = (process.env.NO_PROXY || process.env.no_proxy || '').toLowerCase();",
      "  const byp = raw.split(',').map((s) => s.trim()).filter(Boolean);",
      "  const norm = (h) => h.replace(/^\\[/, '').replace(/\\]$/, '').replace(/\\.$/, '');",
      "  const isLP = (h) => h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0:0:0:0:0:0:0:1' || h === '0.0.0.0' || h.startsWith('127.');",
      "  const shouldBypass = (input) => {",
      "    let h;",
      "    try {",
      "      const u = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input && input.url ? input.url : String(input));",
      "      h = norm(u.hostname);",
      "    } catch { return true; }",
      "    if (!h) return false;",
      "    if (isLP(h)) return true;",
      "    return byp.some((p) => {",
      "      if (p === '*') return true;",
      "      const s = p.split(':');",
      "      const ph = norm(s[0]);",
      "      if (s.length === 2 && s[1]) {",
      "        if (h !== ph) return false;",
      "        try { return new URL(input).port === s[1]; } catch { return false; }",
      "      }",
      "      if (ph.startsWith('*.')) return h.endsWith(ph.slice(1));",
      "      if (ph.startsWith('.')) return h.endsWith(ph) || h === ph.slice(1);",
      "      return h === ph;",
      "    });",
      "  };",
      "  const patched = function(input, init) {",
      "    if (init && init.dispatcher) return realFetch(input, init);",
      "    if (shouldBypass(input)) return realFetch(input, init);",
      "    return realFetch(input, Object.assign({}, init, { dispatcher: agent }));",
      "  };",
      "  if (Object.getOwnPropertyDescriptor(globalThis, 'fetch')?.writable) {",
      "    globalThis.fetch = patched;",
      "  }",
      "}"
    ].join("\n"),
    "utf8"
  );
  return file;
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
  const endpointHost = host === "0.0.0.0" ? "127.0.0.1" : host;
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


function isLoopbackBindHost(host: string): boolean {
  const normalized = normalizeBindHost(host).replace(/\.$/, "");
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized);
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


export async function stopPreviousManagedCoreGateway(config: AppConfig, coreEndpoint: string): Promise<void> {
  const marker = readManagedCoreGatewayMarker(config);
  const markerRuntimeId = stringValue(marker?.runtimeId);
  const pid = numberValue(marker?.pid);
  if (!markerRuntimeId || !pid) {
    return;
  }

  const health = await readCoreGatewayHealth(coreEndpoint);
  if (health?.runtimeId !== markerRuntimeId) {
    return;
  }

  if (!isProcessAlive(pid)) {
    removeManagedCoreGatewayMarker(config);
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    removeManagedCoreGatewayMarker(config);
    return;
  }

  if (await waitForCoreGatewayStop(coreEndpoint)) {
    removeManagedCoreGatewayMarker(config);
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Process may have exited between the health check and SIGKILL.
  }
  await waitForCoreGatewayStop(coreEndpoint);
  removeManagedCoreGatewayMarker(config);
}


function readManagedCoreGatewayMarker(config: AppConfig): ManagedGatewayRuntimeMarker | undefined {
  const file = managedCoreGatewayMarkerPath(config);
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


export function writeManagedCoreGatewayMarker(config: AppConfig, child: ChildProcess, runtimeId: string): void {
  if (!child.pid) {
    return;
  }
  try {
    writeFileSync(
      managedCoreGatewayMarkerPath(config),
      `${JSON.stringify(
        {
          generatedConfigFile: config.gateway.generatedConfigFile,
          gatewayEntry: resolveGatewayEntry(),
          pid: child.pid,
          runtimeId,
          startedAt: new Date().toISOString()
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  } catch (error) {
    console.warn(`[gateway] Failed to write gateway runtime marker: ${formatError(error)}`);
  }
}


export function removeManagedCoreGatewayMarker(config: AppConfig | undefined): void {
  if (!config) {
    return;
  }
  try {
    rmSync(managedCoreGatewayMarkerPath(config), { force: true });
  } catch (error) {
    console.warn(`[gateway] Failed to remove gateway runtime marker: ${formatError(error)}`);
  }
}


function managedCoreGatewayMarkerPath(config: AppConfig): string {
  return pathJoin(dirname(config.gateway.generatedConfigFile), gatewayRuntimeMarkerFile);
}


async function waitForCoreGatewayStop(coreEndpoint: string): Promise<boolean> {
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
