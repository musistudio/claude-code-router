import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ProxySystemStatus } from "@ccr/core/contracts/app";
import { DATADIR } from "@ccr/core/config/constants";
import { windowsSystemCommand } from "@ccr/core/platform/windows-system";

export type UpstreamProxyServer = {
  host: string;
  port: number;
  protocol: "http";
};

export type UpstreamProxyConfig = {
  http?: UpstreamProxyServer;
  https?: UpstreamProxyServer;
};

type MacProxySettings = {
  authenticated: boolean;
  enabled: boolean;
  port: number;
  server: string;
};

type MacNetworkServiceSnapshot = {
  name: string;
  secureWeb: MacProxySettings;
  socks?: MacProxySettings;
  web: MacProxySettings;
};

type MacSystemProxySnapshot = {
  createdAt: string;
  managedEndpoint: string;
  platform: "darwin";
  services: MacNetworkServiceSnapshot[];
  version: 1;
};

type WindowsProxySettings = {
  autoConfigUrl?: string;
  autoDetect?: number;
  hadAutoConfigUrl: boolean;
  hadAutoDetect: boolean;
  hadProxyEnable: boolean;
  hadProxyOverride: boolean;
  hadProxyServer: boolean;
  proxyEnable?: number;
  proxyOverride?: string;
  proxyServer?: string;
  winHttp?: WindowsWinHttpProxySettings;
};

type WindowsWinHttpProxySettings = {
  bypassList?: string;
  direct: boolean;
  proxyServer?: string;
  raw: string;
};

type WindowsSystemProxySnapshot = {
  createdAt: string;
  managedEndpoint: string;
  platform: "win32";
  settings: WindowsProxySettings;
  version: 1;
};

type SystemProxySnapshot = MacSystemProxySnapshot | WindowsSystemProxySnapshot;

type NetworkService = {
  disabled: boolean;
  name: string;
};

type ManagedProxyEndpoint = {
  host: string;
  port: number;
  url: string;
};

type WindowsRegistryValue = {
  type: string;
  value: string;
};

const networkSetup = "/usr/sbin/networksetup";
const windowsInternetSettingsKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const systemProxySnapshotFile = path.join(DATADIR, "system-proxy-snapshot.json");

class SystemProxyManager {
  private snapshot?: SystemProxySnapshot;
  private status: ProxySystemStatus = {
    state: process.platform === "darwin" || process.platform === "win32" ? "inactive" : "unsupported"
  };
  private upstreamProxy?: UpstreamProxyConfig;

  async enable(endpoint: string): Promise<{ status: ProxySystemStatus; upstreamProxy?: UpstreamProxyConfig }> {
    this.upstreamProxy = undefined;

    if (process.platform !== "darwin" && process.platform !== "win32") {
      this.status = {
        lastError: "Automatic system proxy switching is only implemented for macOS and Windows.",
        state: "unsupported"
      };
      return this.current();
    }

    try {
      const managedEndpoint = parseManagedEndpoint(endpoint);
      await this.restorePersistedSnapshotIfCurrentProxyIsManaged();
      const snapshot = process.platform === "win32"
        ? await captureWindowsSystemProxySnapshot(managedEndpoint)
        : await captureMacSystemProxySnapshot(managedEndpoint);
      const upstreamProxy = readSnapshotUpstreamProxy(snapshot, managedEndpoint);

      this.snapshot = snapshot;
      this.upstreamProxy = upstreamProxy;
      persistSnapshot(snapshot);
      await applySystemProxy(snapshot, managedEndpoint);

      this.status = {
        state: "active",
        upstream: formatUpstreamProxy(upstreamProxy)
      };
      return this.current();
    } catch (error) {
      const restoreError = await this.restoreSnapshotAfterEnableFailure();
      this.status = {
        lastError: [formatError(error), restoreError].filter(Boolean).join(" "),
        state: "error"
      };
      return this.current();
    }
  }

  async restore(): Promise<ProxySystemStatus> {
    this.upstreamProxy = undefined;

    if (process.platform !== "darwin" && process.platform !== "win32") {
      this.snapshot = undefined;
      this.status = {
        lastError: "Automatic system proxy switching is only implemented for macOS and Windows.",
        state: "unsupported"
      };
      return this.getStatus();
    }

    const activeSnapshot = this.snapshot;
    const snapshot = activeSnapshot ?? readPersistedSnapshot();
    this.snapshot = undefined;
    if (!snapshot) {
      this.status = { state: "inactive" };
      return this.getStatus();
    }
    if (!activeSnapshot && snapshot.platform !== process.platform) {
      removePersistedSnapshot();
      this.status = { state: "inactive" };
      return this.getStatus();
    }

    try {
      const shouldRestore = Boolean(activeSnapshot) || (await currentProxyUsesManagedEndpoint(snapshot));
      if (shouldRestore) {
        await restoreSystemProxy(snapshot);
      }
      removePersistedSnapshot();
      this.status = {
        state: shouldRestore ? "restored" : "inactive",
        upstream: formatUpstreamProxy(readSnapshotUpstreamProxy(snapshot, parseManagedEndpoint(snapshot.managedEndpoint)))
      };
      return this.getStatus();
    } catch (error) {
      this.status = {
        lastError: formatError(error),
        state: "error"
      };
      return this.getStatus();
    }
  }

  getStatus(): ProxySystemStatus {
    return { ...this.status };
  }

  getManagedEndpointUrl(): string | undefined {
    return this.status.state === "active" ? this.snapshot?.managedEndpoint : undefined;
  }

  getUpstreamProxy(): UpstreamProxyConfig | undefined {
    if (!this.upstreamProxy) {
      return undefined;
    }
    return {
      http: this.upstreamProxy.http ? { ...this.upstreamProxy.http } : undefined,
      https: this.upstreamProxy.https ? { ...this.upstreamProxy.https } : undefined
    };
  }

  private current(): { status: ProxySystemStatus; upstreamProxy?: UpstreamProxyConfig } {
    return {
      status: this.getStatus(),
      upstreamProxy: this.getUpstreamProxy()
    };
  }

  private async restorePersistedSnapshotIfCurrentProxyIsManaged(): Promise<void> {
    const snapshot = readPersistedSnapshot();
    if (!snapshot) {
      return;
    }

    if (snapshot.platform !== process.platform) {
      removePersistedSnapshot();
      return;
    }

    if (await currentProxyUsesManagedEndpoint(snapshot)) {
      await restoreSystemProxy(snapshot);
    }
    removePersistedSnapshot();
  }

  private async restoreSnapshotAfterEnableFailure(): Promise<string | undefined> {
    const snapshot = this.snapshot;
    this.snapshot = undefined;
    this.upstreamProxy = undefined;
    if (!snapshot) {
      return undefined;
    }

    try {
      await restoreSystemProxy(snapshot);
      removePersistedSnapshot();
      return undefined;
    } catch (error) {
      return `Failed to restore the previous system proxy: ${formatError(error)}`;
    }
  }
}

export const systemProxyManager = new SystemProxyManager();

export function formatUpstreamProxy(upstreamProxy: UpstreamProxyConfig | undefined): string | undefined {
  if (!upstreamProxy?.http && !upstreamProxy?.https) {
    return undefined;
  }

  if (upstreamProxy.http && sameProxyServer(upstreamProxy.http, upstreamProxy.https)) {
    return `HTTP/HTTPS ${formatProxyServer(upstreamProxy.http)}`;
  }

  const values: string[] = [];
  if (upstreamProxy.http) {
    values.push(`HTTP ${formatProxyServer(upstreamProxy.http)}`);
  }
  if (upstreamProxy.https && !sameProxyServer(upstreamProxy.http, upstreamProxy.https)) {
    values.push(`HTTPS ${formatProxyServer(upstreamProxy.https)}`);
  }
  return values.join(", ");
}

export async function readCurrentSystemUpstreamProxy(managedEndpointUrl: string): Promise<UpstreamProxyConfig | undefined> {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return undefined;
  }

  const managedEndpoint = parseManagedEndpoint(managedEndpointUrl);
  const snapshot = process.platform === "win32"
    ? await captureWindowsSystemProxySnapshot(managedEndpoint)
    : await captureMacSystemProxySnapshot(managedEndpoint);
  return readSnapshotUpstreamProxy(snapshot, managedEndpoint);
}

function parseManagedEndpoint(endpoint: string): ManagedProxyEndpoint {
  const parsed = new URL(endpoint);
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  if (!parsed.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid proxy endpoint: ${endpoint}`);
  }
  return {
    host: parsed.hostname,
    port,
    url: `http://${formatProxyHost(parsed.hostname)}:${port}`
  };
}

async function captureMacSystemProxySnapshot(managedEndpoint: ManagedProxyEndpoint): Promise<MacSystemProxySnapshot> {
  const services = await listNetworkServices();
  const snapshots: MacNetworkServiceSnapshot[] = [];

  for (const service of services) {
    if (service.disabled) {
      continue;
    }

    snapshots.push({
      name: service.name,
      secureWeb: await readMacProxySettings("-getsecurewebproxy", service.name),
      socks: await readMacProxySettings("-getsocksfirewallproxy", service.name),
      web: await readMacProxySettings("-getwebproxy", service.name)
    });
  }

  return {
    createdAt: new Date().toISOString(),
    managedEndpoint: managedEndpoint.url,
    platform: "darwin",
    services: snapshots,
    version: 1
  };
}

async function captureWindowsSystemProxySnapshot(managedEndpoint: ManagedProxyEndpoint): Promise<WindowsSystemProxySnapshot> {
  return {
    createdAt: new Date().toISOString(),
    managedEndpoint: managedEndpoint.url,
    platform: "win32",
    settings: await readWindowsProxySettings(),
    version: 1
  };
}

async function listNetworkServices(): Promise<NetworkService[]> {
  const output = await runNetworkSetup(["-listallnetworkservices"]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.toLowerCase().startsWith("an asterisk"))
    .map((line) => ({
      disabled: line.startsWith("*"),
      name: line.startsWith("*") ? line.slice(1).trim() : line
    }))
    .filter((service) => service.name.length > 0);
}

async function readMacProxySettings(
  command: "-getsecurewebproxy" | "-getsocksfirewallproxy" | "-getwebproxy",
  serviceName: string
): Promise<MacProxySettings> {
  const output = await runNetworkSetup([command, serviceName]);
  const enabled = readSetting(output, "Enabled").toLowerCase();
  const server = readSetting(output, "Server");
  const port = Number(readSetting(output, "Port"));
  const authenticated = readSetting(output, "Authenticated Proxy Enabled").toLowerCase();
  return {
    authenticated: authenticated === "1" || authenticated === "yes" || authenticated === "true",
    enabled: enabled === "yes" || enabled === "1" || enabled === "true",
    port: Number.isInteger(port) && port > 0 ? port : 0,
    server
  };
}

async function applyMacSystemProxy(snapshot: MacSystemProxySnapshot, managedEndpoint: ManagedProxyEndpoint): Promise<void> {
  for (const service of snapshot.services) {
    await setMacProxySettings("-setwebproxy", "-setwebproxystate", service.name, {
      authenticated: false,
      enabled: true,
      port: managedEndpoint.port,
      server: managedEndpoint.host
    });
    await setMacProxySettings("-setsecurewebproxy", "-setsecurewebproxystate", service.name, {
      authenticated: false,
      enabled: true,
      port: managedEndpoint.port,
      server: managedEndpoint.host
    });
    if (service.socks?.enabled) {
      await setMacProxySettings("-setsocksfirewallproxy", "-setsocksfirewallproxystate", service.name, {
        ...service.socks,
        enabled: false
      });
    }
  }
}

async function restoreMacSystemProxy(snapshot: MacSystemProxySnapshot): Promise<void> {
  const managedEndpoint = parseManagedEndpoint(snapshot.managedEndpoint);
  for (const service of snapshot.services) {
    await setMacProxySettings("-setwebproxy", "-setwebproxystate", service.name, sanitizeMacProxySettingsForRestore(service.web, managedEndpoint));
    await setMacProxySettings(
      "-setsecurewebproxy",
      "-setsecurewebproxystate",
      service.name,
      sanitizeMacProxySettingsForRestore(service.secureWeb, managedEndpoint)
    );
    if (service.socks) {
      await setMacProxySettings("-setsocksfirewallproxy", "-setsocksfirewallproxystate", service.name, service.socks);
    }
  }
}

async function applySystemProxy(snapshot: SystemProxySnapshot, managedEndpoint: ManagedProxyEndpoint): Promise<void> {
  if (snapshot.platform === "win32") {
    await applyWindowsSystemProxy(snapshot, managedEndpoint);
    return;
  }
  await applyMacSystemProxy(snapshot, managedEndpoint);
}

async function restoreSystemProxy(snapshot: SystemProxySnapshot): Promise<void> {
  if (snapshot.platform === "win32") {
    await restoreWindowsSystemProxy(snapshot);
    return;
  }
  await restoreMacSystemProxy(snapshot);
}

async function setMacProxySettings(
  setCommand: "-setsecurewebproxy" | "-setsocksfirewallproxy" | "-setwebproxy",
  stateCommand: "-setsecurewebproxystate" | "-setsocksfirewallproxystate" | "-setwebproxystate",
  serviceName: string,
  settings: MacProxySettings
): Promise<void> {
  if (settings.server && settings.port > 0) {
    await runNetworkSetup([
      setCommand,
      serviceName,
      settings.server,
      String(settings.port),
      settings.authenticated ? "on" : "off",
      "",
      ""
    ]);
  }
  await runNetworkSetup([stateCommand, serviceName, settings.enabled ? "on" : "off"]);
}

async function readWindowsProxySettings(): Promise<WindowsProxySettings> {
  const autoConfigUrl = await queryWindowsRegistryValue("AutoConfigURL");
  const autoDetect = await queryWindowsRegistryValue("AutoDetect");
  const proxyEnable = await queryWindowsRegistryValue("ProxyEnable");
  const proxyServer = await queryWindowsRegistryValue("ProxyServer");
  const proxyOverride = await queryWindowsRegistryValue("ProxyOverride");
  const winHttp = await readWindowsWinHttpProxySettings();
  return {
    autoConfigUrl: autoConfigUrl?.value,
    autoDetect: autoDetect ? parseWindowsRegistryDword(autoDetect.value) : undefined,
    hadAutoConfigUrl: Boolean(autoConfigUrl),
    hadAutoDetect: Boolean(autoDetect),
    hadProxyEnable: Boolean(proxyEnable),
    hadProxyOverride: Boolean(proxyOverride),
    hadProxyServer: Boolean(proxyServer),
    proxyEnable: proxyEnable ? parseWindowsRegistryDword(proxyEnable.value) : undefined,
    proxyOverride: proxyOverride?.value,
    proxyServer: proxyServer?.value,
    winHttp
  };
}

async function applyWindowsSystemProxy(snapshot: WindowsSystemProxySnapshot, managedEndpoint: ManagedProxyEndpoint): Promise<void> {
  const proxyServer = `http=${formatProxyServer(managedEndpoint)};https=${formatProxyServer(managedEndpoint)}`;
  await deleteWindowsRegistryValue("AutoConfigURL");
  await setWindowsRegistryDword("AutoDetect", 0);
  await setWindowsRegistryDword("ProxyEnable", 1);
  await setWindowsRegistryString("ProxyServer", proxyServer);
  await setWindowsRegistryString("ProxyOverride", "<local>");
  if (snapshot.settings.winHttp) {
    await applyWindowsWinHttpProxy(managedEndpoint).catch((error) => {
      console.warn(`[proxy] Failed to set Windows WinHTTP proxy: ${formatError(error)}`);
    });
  }
  await notifyWindowsSystemProxyChanged();
}

async function restoreWindowsSystemProxy(snapshot: WindowsSystemProxySnapshot): Promise<void> {
  const settings = snapshot.settings;
  if (settings.hadProxyEnable && settings.proxyEnable !== undefined) {
    await setWindowsRegistryDword("ProxyEnable", settings.proxyEnable);
  } else {
    await deleteWindowsRegistryValue("ProxyEnable");
  }

  if (settings.hadProxyServer && settings.proxyServer !== undefined) {
    await setWindowsRegistryString("ProxyServer", settings.proxyServer);
  } else {
    await deleteWindowsRegistryValue("ProxyServer");
  }

  if (settings.hadProxyOverride && settings.proxyOverride !== undefined) {
    await setWindowsRegistryString("ProxyOverride", settings.proxyOverride);
  } else {
    await deleteWindowsRegistryValue("ProxyOverride");
  }

  if (settings.hadAutoConfigUrl && settings.autoConfigUrl !== undefined) {
    await setWindowsRegistryString("AutoConfigURL", settings.autoConfigUrl);
  } else {
    await deleteWindowsRegistryValue("AutoConfigURL");
  }

  if (settings.hadAutoDetect && settings.autoDetect !== undefined) {
    await setWindowsRegistryDword("AutoDetect", settings.autoDetect);
  } else {
    await deleteWindowsRegistryValue("AutoDetect");
  }

  await restoreWindowsWinHttpProxy(settings.winHttp).catch((error) => {
    console.warn(`[proxy] Failed to restore Windows WinHTTP proxy: ${formatError(error)}`);
  });
  await notifyWindowsSystemProxyChanged();
}

function readSnapshotUpstreamProxy(snapshot: SystemProxySnapshot, managedEndpoint: ManagedProxyEndpoint): UpstreamProxyConfig | undefined {
  if (snapshot.platform === "win32") {
    return readWindowsUpstreamProxy(snapshot, managedEndpoint);
  }
  return readMacUpstreamProxy(snapshot, managedEndpoint);
}

function readMacUpstreamProxy(snapshot: MacSystemProxySnapshot, managedEndpoint: ManagedProxyEndpoint): UpstreamProxyConfig | undefined {
  const upstreamProxy: UpstreamProxyConfig = {};

  for (const service of snapshot.services) {
    if (!upstreamProxy.http && isUsableUpstreamProxy(service.web, managedEndpoint)) {
      upstreamProxy.http = {
        host: service.web.server,
        port: service.web.port,
        protocol: "http"
      };
    }
    if (!upstreamProxy.https && isUsableUpstreamProxy(service.secureWeb, managedEndpoint)) {
      upstreamProxy.https = {
        host: service.secureWeb.server,
        port: service.secureWeb.port,
        protocol: "http"
      };
    }
    if (upstreamProxy.http && upstreamProxy.https) {
      break;
    }
  }

  if (!upstreamProxy.https && upstreamProxy.http) {
    upstreamProxy.https = upstreamProxy.http;
  }
  if (!upstreamProxy.http && upstreamProxy.https) {
    upstreamProxy.http = upstreamProxy.https;
  }

  return upstreamProxy.http || upstreamProxy.https ? upstreamProxy : undefined;
}

function readWindowsUpstreamProxy(snapshot: WindowsSystemProxySnapshot, managedEndpoint: ManagedProxyEndpoint): UpstreamProxyConfig | undefined {
  if (snapshot.settings.proxyEnable === 1 && snapshot.settings.proxyServer) {
    const winInetProxy = parseWindowsProxyServer(snapshot.settings.proxyServer, managedEndpoint);
    if (winInetProxy) {
      return winInetProxy;
    }
  }
  return readWindowsWinHttpUpstreamProxy(snapshot.settings.winHttp, managedEndpoint);
}

async function currentProxyUsesManagedEndpoint(snapshot: SystemProxySnapshot): Promise<boolean> {
  if (snapshot.platform === "win32") {
    return currentWindowsProxyUsesManagedEndpoint(snapshot);
  }
  return currentMacProxyUsesManagedEndpoint(snapshot);
}

async function currentMacProxyUsesManagedEndpoint(snapshot: MacSystemProxySnapshot): Promise<boolean> {
  const managedEndpoint = parseManagedEndpoint(snapshot.managedEndpoint);
  for (const service of snapshot.services) {
    const currentWeb = await readMacProxySettings("-getwebproxy", service.name).catch(() => undefined);
    if (currentWeb && matchesManagedEndpoint(currentWeb, managedEndpoint)) {
      return true;
    }

    const currentSecureWeb = await readMacProxySettings("-getsecurewebproxy", service.name).catch(() => undefined);
    if (currentSecureWeb && matchesManagedEndpoint(currentSecureWeb, managedEndpoint)) {
      return true;
    }
  }
  return false;
}

async function currentWindowsProxyUsesManagedEndpoint(snapshot: WindowsSystemProxySnapshot): Promise<boolean> {
  const managedEndpoint = parseManagedEndpoint(snapshot.managedEndpoint);
  const current = await readWindowsProxySettings();
  if (current.proxyEnable === 1 && current.proxyServer && windowsProxyServerUsesManagedEndpoint(current.proxyServer, managedEndpoint)) {
    return true;
  }
  return windowsWinHttpProxyUsesManagedEndpoint(current.winHttp, managedEndpoint);
}

function parseWindowsProxyServer(proxyServer: string, managedEndpoint: ManagedProxyEndpoint): UpstreamProxyConfig | undefined {
  const parsed = parseWindowsProxyServerEntries(proxyServer);
  const upstreamProxy: UpstreamProxyConfig = {};
  const httpProxy = parsed.http ?? parsed.default;
  const httpsProxy = parsed.https ?? parsed.default ?? httpProxy;

  if (httpProxy && !sameProxyServer(httpProxy, managedEndpoint)) {
    upstreamProxy.http = httpProxy;
  }
  if (httpsProxy && !sameProxyServer(httpsProxy, managedEndpoint)) {
    upstreamProxy.https = httpsProxy;
  }

  if (!upstreamProxy.https && upstreamProxy.http) {
    upstreamProxy.https = upstreamProxy.http;
  }
  if (!upstreamProxy.http && upstreamProxy.https) {
    upstreamProxy.http = upstreamProxy.https;
  }

  return upstreamProxy.http || upstreamProxy.https ? upstreamProxy : undefined;
}

function windowsProxyServerUsesManagedEndpoint(proxyServer: string, managedEndpoint: ManagedProxyEndpoint): boolean {
  const entries = parseWindowsProxyServerEntries(proxyServer);
  return [entries.default, entries.http, entries.https].some((entry) => sameProxyServer(entry, managedEndpoint));
}

function parseWindowsProxyServerEntries(proxyServer: string): {
  default?: UpstreamProxyServer;
  http?: UpstreamProxyServer;
  https?: UpstreamProxyServer;
} {
  const trimmed = proxyServer.trim();
  if (!trimmed) {
    return {};
  }

  if (!trimmed.includes("=")) {
    return {
      default: parseProxyServerEndpoint(trimmed, "http")
    };
  }

  const parsed: {
    default?: UpstreamProxyServer;
    http?: UpstreamProxyServer;
    https?: UpstreamProxyServer;
  } = {};
  for (const segment of trimmed.split(";")) {
    const [rawKey, ...rawValueParts] = segment.split("=");
    const key = rawKey.trim().toLowerCase();
    const value = rawValueParts.join("=").trim();
    const endpoint = parseProxyServerEndpoint(value, "http");
    if (!endpoint) {
      continue;
    }
    if (key === "http") {
      parsed.http = endpoint;
    } else if (key === "https") {
      parsed.https = endpoint;
    }
  }
  return parsed;
}

function parseProxyServerEndpoint(value: string, defaultProtocol: UpstreamProxyServer["protocol"]): UpstreamProxyServer | undefined {
  let normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  if (/^socks(?:4|5)?:\/\//i.test(normalized)) {
    return undefined;
  }
  const explicitProtocol = /^https?:\/\//i.test(normalized) ? "http" : undefined;
  normalized = normalized.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const parsed = safeParseProxyServerUrl(normalized);
  if (!parsed?.hostname) {
    return undefined;
  }

  const port = Number(parsed.port || 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined;
  }

  return {
    host: parsed.hostname,
    port,
    protocol: explicitProtocol ?? defaultProtocol
  };
}

function safeParseProxyServerUrl(value: string): URL | undefined {
  try {
    return new URL(`http://${value}`);
  } catch {
    try {
      return new URL(`http://${value.replace(/^\[?([^\]]+)\]?:(\d+)$/, "[$1]:$2")}`);
    } catch {
      return undefined;
    }
  }
}

async function readWindowsWinHttpProxySettings(): Promise<WindowsWinHttpProxySettings | undefined> {
  try {
    return parseWindowsWinHttpProxySettings(await runCommand(windowsSystemCommand("netsh.exe"), ["winhttp", "show", "proxy"]));
  } catch (error) {
    console.warn(`[proxy] Failed to read Windows WinHTTP proxy: ${formatError(error)}`);
    return undefined;
  }
}

function parseWindowsWinHttpProxySettings(output: string): WindowsWinHttpProxySettings {
  const proxyServer = normalizeWindowsNetshValue(readWindowsNetshProxyLine(output, "Proxy Server"));
  const bypassList = normalizeWindowsNetshValue(readWindowsNetshProxyLine(output, "Bypass List"));
  const direct = /Direct access\s*\(no proxy server\)/i.test(output) ||
    /直接存取/i.test(output) ||
    /直接访问/i.test(output);
  if (!direct && !proxyServer) {
    throw new Error("Could not parse Windows WinHTTP proxy settings.");
  }
  return {
    bypassList,
    direct,
    proxyServer,
    raw: output
  };
}

function readWindowsNetshProxyLine(output: string, label: "Bypass List" | "Proxy Server"): string | undefined {
  const pattern = label === "Proxy Server"
    ? /^\s*(?:Proxy Server(?:\(s\))?|Proxy 伺服器|代理服务器)\s*:\s*(.+?)\s*$/im
    : /^\s*(?:Bypass List|略過清單|绕过列表)\s*:\s*(.+?)\s*$/im;
  return pattern.exec(output)?.[1]?.trim();
}

function normalizeWindowsNetshValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return !trimmed || /^\(none\)$/i.test(trimmed) ? undefined : trimmed;
}

async function applyWindowsWinHttpProxy(managedEndpoint: ManagedProxyEndpoint): Promise<void> {
  const proxyServer = `http=${formatProxyServer(managedEndpoint)};https=${formatProxyServer(managedEndpoint)}`;
  await runCommand(windowsSystemCommand("netsh.exe"), [
    "winhttp",
    "set",
    "proxy",
    `proxy-server=${proxyServer}`,
    "bypass-list=<local>"
  ]);
}

async function restoreWindowsWinHttpProxy(settings: WindowsWinHttpProxySettings | undefined): Promise<void> {
  if (!settings) {
    return;
  }
  if (settings.direct || !settings.proxyServer) {
    await runCommand(windowsSystemCommand("netsh.exe"), ["winhttp", "reset", "proxy"]);
    return;
  }
  await runCommand(windowsSystemCommand("netsh.exe"), [
    "winhttp",
    "set",
    "proxy",
    `proxy-server=${settings.proxyServer}`,
    ...(settings.bypassList ? [`bypass-list=${settings.bypassList}`] : [])
  ]);
}

function readWindowsWinHttpUpstreamProxy(
  settings: WindowsWinHttpProxySettings | undefined,
  managedEndpoint: ManagedProxyEndpoint
): UpstreamProxyConfig | undefined {
  if (!settings || settings.direct || !settings.proxyServer) {
    return undefined;
  }
  return parseWindowsProxyServer(settings.proxyServer, managedEndpoint);
}

function windowsWinHttpProxyUsesManagedEndpoint(
  settings: WindowsWinHttpProxySettings | undefined,
  managedEndpoint: ManagedProxyEndpoint
): boolean {
  return Boolean(settings && !settings.direct && settings.proxyServer && windowsProxyServerUsesManagedEndpoint(settings.proxyServer, managedEndpoint));
}

function isUsableUpstreamProxy(settings: MacProxySettings, managedEndpoint: ManagedProxyEndpoint): boolean {
  return settings.enabled && settings.server.length > 0 && settings.port > 0 && !matchesManagedEndpoint(settings, managedEndpoint);
}

function sanitizeMacProxySettingsForRestore(settings: MacProxySettings, managedEndpoint: ManagedProxyEndpoint): MacProxySettings {
  if (!matchesManagedEndpoint(settings, managedEndpoint)) {
    return settings;
  }
  return {
    ...settings,
    enabled: false
  };
}

function matchesManagedEndpoint(settings: MacProxySettings, managedEndpoint: ManagedProxyEndpoint): boolean {
  return settings.enabled && normalizeHost(settings.server) === normalizeHost(managedEndpoint.host) && settings.port === managedEndpoint.port;
}

function normalizeHost(host: string): string {
  const normalized = host.trim().toLowerCase();
  if (normalized === "::1" || normalized === "[::1]" || normalized === "localhost") {
    return "127.0.0.1";
  }
  return normalized;
}

function readSetting(output: string, key: string): string {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(.*)$`, "im");
  return pattern.exec(output)?.[1]?.trim() ?? "";
}

function persistSnapshot(snapshot: SystemProxySnapshot): void {
  mkdirSync(path.dirname(systemProxySnapshotFile), { recursive: true });
  writeFileSync(systemProxySnapshotFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function readPersistedSnapshot(): SystemProxySnapshot | undefined {
  if (!existsSync(systemProxySnapshotFile)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(systemProxySnapshotFile, "utf8")) as unknown;
    if (isSystemProxySnapshot(parsed)) {
      return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function removePersistedSnapshot(): void {
  rmSync(systemProxySnapshotFile, { force: true });
}

function isSystemProxySnapshot(value: unknown): value is SystemProxySnapshot {
  if (!isObject(value) || value.version !== 1 || typeof value.managedEndpoint !== "string") {
    return false;
  }
  if (value.platform === "darwin") {
    return Array.isArray(value.services);
  }
  if (value.platform === "win32") {
    return isObject(value.settings);
  }
  return false;
}

function sameProxyServer(left: UpstreamProxyServer | undefined, right: UpstreamProxyServer | ManagedProxyEndpoint | undefined): boolean {
  return Boolean(
    left &&
      right &&
      normalizeHost(left.host) === normalizeHost(right.host) &&
      left.port === right.port &&
      (!("protocol" in right) || left.protocol === right.protocol)
  );
}

function formatProxyServer(server: UpstreamProxyServer | ManagedProxyEndpoint): string {
  const endpoint = `${formatProxyHost(server.host)}:${server.port}`;
  return "protocol" in server ? `${server.protocol}://${endpoint}` : endpoint;
}

function formatProxyHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

async function queryWindowsRegistryValue(name: string): Promise<WindowsRegistryValue | undefined> {
  try {
    const output = await runCommand(windowsSystemCommand("reg.exe"), ["query", windowsInternetSettingsKey, "/v", name]);
    return parseWindowsRegistryQueryOutput(output, name);
  } catch {
    return undefined;
  }
}

function parseWindowsRegistryQueryOutput(output: string, name: string): WindowsRegistryValue | undefined {
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\S+)\s+(REG_\S+)\s+(.+?)\s*$/.exec(line);
    if (match?.[1].toLowerCase() === name.toLowerCase()) {
      return {
        type: match[2],
        value: match[3]
      };
    }
  }
  return undefined;
}

function parseWindowsRegistryDword(value: string): number | undefined {
  const trimmed = value.trim().toLowerCase();
  const parsed = trimmed.startsWith("0x") ? Number.parseInt(trimmed.slice(2), 16) : Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function setWindowsRegistryDword(name: string, value: number): Promise<void> {
  await runCommand(windowsSystemCommand("reg.exe"), [
    "add",
    windowsInternetSettingsKey,
    "/v",
    name,
    "/t",
    "REG_DWORD",
    "/d",
    String(value),
    "/f"
  ]);
}

async function setWindowsRegistryString(name: string, value: string): Promise<void> {
  await runCommand(windowsSystemCommand("reg.exe"), [
    "add",
    windowsInternetSettingsKey,
    "/v",
    name,
    "/t",
    "REG_SZ",
    "/d",
    value,
    "/f"
  ]);
}

async function deleteWindowsRegistryValue(name: string): Promise<void> {
  await runCommand(windowsSystemCommand("reg.exe"), ["delete", windowsInternetSettingsKey, "/v", name, "/f"]).catch(() => undefined);
}

async function notifyWindowsSystemProxyChanged(): Promise<void> {
  const script = [
    "$signature = '[DllImport(\"wininet.dll\", SetLastError=true)] public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);';",
    "Add-Type -MemberDefinition $signature -Namespace WinInet -Name NativeMethods;",
    "[WinInet.NativeMethods]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null;",
    "[WinInet.NativeMethods]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null;"
  ].join(" ");
  await runCommand(windowsSystemCommand("powershell.exe"), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]).catch((error) => {
    console.warn(`[proxy] Failed to notify Windows system proxy change: ${formatError(error)}`);
  });
}

function runNetworkSetup(args: string[]): Promise<string> {
  return runCommand(networkSetup, args).then((output) => {
    if (isNetworkSetupErrorOutput(output)) {
      throw new Error(output.trim());
    }
    return output;
  });
}

function runCommand(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: process.platform === "win32" }, (error, stdout, stderr) => {
      const message = stderr?.trim() || stdout?.trim();
      if (error) {
        reject(new Error(message || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

function isNetworkSetupErrorOutput(output: string | undefined): boolean {
  return Boolean(output && (/AuthorizationCreate\(\) failed/i.test(output) || /^\*\* Error:/m.test(output)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
