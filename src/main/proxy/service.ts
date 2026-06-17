import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { BrowserWindow, dialog, shell } from "electron";
import { chmodSync, writeFileSync } from "node:fs";
import http, { type ClientRequest, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import https from "node:https";
import net, { type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import tls from "node:tls";
import { brotliDecompressSync, gunzipSync, inflateRawSync, inflateSync } from "node:zlib";
import type {
  AppConfig,
  ProxyForwardMode,
  ProxyCertificateInstallResult,
  ProxyCertificateStatus,
  ProxyMode,
  ProxyNetworkBody,
  ProxyNetworkExchange,
  ProxyNetworkSnapshot,
  ProxyRouteTarget,
  ProxyStatus
} from "../../shared/app";
import { PROXY_CA_CERT_FILE } from "../constants";
import { pluginService, type GatewayPluginProxyRouteMatch } from "../plugins/service";
import {
  createCertificateForHost,
  ensureProxyCertificateAuthority,
  proxyCertificateAuthorityKeyMatches,
  proxyCertificateAuthorityExists,
  proxyCaCertFile,
  readProxyCertificateFingerprintSha256,
  readProxyCertificateSerialNumber,
  readProxyCertificateAuthority,
  type CertificateAuthority
} from "./certificates";
import { formatUpstreamProxy, readCurrentSystemUpstreamProxy, systemProxyManager, type UpstreamProxyConfig, type UpstreamProxyServer } from "./system-proxy";

type MitmServer = {
  host: string;
  port: number;
  server: https.Server;
};

type AttachedServer = {
  onConnect: (request: IncomingMessage, clientSocket: Socket, head: Buffer) => void;
  server: Server;
};

type CapturedHeaders = Record<string, string | string[]>;

type ProxyNetworkCaptureRecord = {
  client: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  host: string;
  id: string;
  method: string;
  mode: ProxyForwardMode;
  path: string;
  protocol: "http" | "https";
  requestHeaders: CapturedHeaders;
  requestSampler: NetworkBodySampler;
  responseHeaders?: CapturedHeaders;
  responseSampler: NetworkBodySampler;
  routedToGateway: boolean;
  startedAt: string;
  startedAtMs: number;
  state: "complete" | "error" | "pending";
  statusCode?: number;
  upstreamUrl: string;
  url: string;
};

type ActiveProxyNetworkCapture = {
  appendRequestBody: (chunk: Buffer | string) => void;
  appendResponseBody: (chunk: Buffer | string) => void;
  complete: () => void;
  completeIfPending: () => void;
  fail: (message: string, statusCode?: number) => void;
  setResponse: (statusCode: number, headers: CapturedHeaders | IncomingHttpHeaders) => void;
};

const requestHopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

const responseHopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

const maxNetworkCaptureBodyBytes = 256 * 1024;
const maxNetworkCaptureEntries = 200;
const defaultSystemProxyRestoreTimeoutMs = 10_000;
const upstreamProxyConnectTimeoutMs = 30_000;
const upstreamRequestIdleTimeoutMs = 120_000;

class ProxyService {
  private authority?: CertificateAuthority;
  private attachedServer?: AttachedServer;
  private config?: AppConfig;
  private networkCaptureEnabled = false;
  private networkCaptures: ProxyNetworkCaptureRecord[] = [];
  private secureServers = new Map<string, Promise<MitmServer>>();
  private server?: Server;
  private status: ProxyStatus = {
    caCertFile: proxyCaCertFile(),
    endpoint: "",
    mode: "gateway",
    port: 0,
    state: "stopped",
    systemProxy: systemProxyManager.getStatus(),
    targetHosts: []
  };
  private upstreamProxy?: UpstreamProxyConfig;

  async start(config: AppConfig): Promise<ProxyStatus> {
    await this.stop();
    this.config = config;
    this.networkCaptureEnabled = config.proxy.captureNetwork;
    this.status = createProxyStatus(config, proxyEndpoint(config), config.proxy.port);

    if (!config.proxy.enabled) {
      return this.getStatus();
    }

    try {
      await this.requireTrustedCertificate();
      ensureProxyCertificateAuthority();
      this.authority = readProxyCertificateAuthority();
      this.server = http.createServer((request, response) => {
        void this.handleProxyRequest(request, response, "http:").catch((error) => {
          sendProxyError(response, 502, formatError(error));
        });
      });
      this.server.on("connect", (request, clientSocket, head) => {
        const socket = clientSocket as Socket;
        void this.handleConnect(request, socket, head).catch((error) => {
          handleConnectError(request, socket, error);
        });
      });

      await listen(this.server, config.proxy.port, config.proxy.host);
      this.status = {
        ...this.status,
        lastError: undefined,
        lastStartedAt: new Date().toISOString(),
        state: "running"
      };
      if (config.proxy.systemProxy) {
        await this.activateSystemProxy();
      }
      return this.getStatus();
    } catch (error) {
      await this.stop();
      this.status = {
        ...this.status,
        lastError: formatError(error),
        state: "error"
      };
      return this.getStatus();
    }
  }

  async attach(config: AppConfig, server: Server): Promise<ProxyStatus> {
    await this.stop();
    this.config = config;
    this.networkCaptureEnabled = config.proxy.captureNetwork;
    this.status = createProxyStatus(config, sharedProxyEndpoint(config), config.gateway.port);

    if (!config.proxy.enabled) {
      return this.getStatus();
    }

    try {
      await this.requireTrustedCertificate();
      ensureProxyCertificateAuthority();
      this.authority = readProxyCertificateAuthority();
      const onConnect = (request: IncomingMessage, clientSocket: Socket, head: Buffer) => {
        const socket = clientSocket as Socket;
        void this.handleConnect(request, socket, head).catch((error) => {
          handleConnectError(request, socket, error);
        });
      };
      server.on("connect", onConnect);
      this.attachedServer = { onConnect, server };
      this.status = {
        ...this.status,
        lastError: undefined,
        lastStartedAt: new Date().toISOString(),
        state: "running"
      };
      if (config.proxy.systemProxy) {
        await this.activateSystemProxy();
      }
      return this.getStatus();
    } catch (error) {
      await this.stop();
      this.status = {
        ...this.status,
        lastError: formatError(error),
        state: "error"
      };
      return this.getStatus();
    }
  }

  async stop(systemProxyRestoreTimeoutMs = defaultSystemProxyRestoreTimeoutMs): Promise<void> {
    this.upstreamProxy = undefined;

    const systemProxyStatus = await withTimeout(systemProxyManager.restore(), systemProxyRestoreTimeoutMs, {
      lastError: "Timed out while restoring the previous system proxy. Check macOS Network proxy settings if traffic does not recover.",
      state: "error"
    });

    const attachedServer = this.attachedServer;
    this.attachedServer = undefined;
    if (attachedServer) {
      attachedServer.server.off("connect", attachedServer.onConnect);
    }

    const server = this.server;
    this.server = undefined;
    if (server) {
      await closeServer(server);
    }

    const localServers = await Promise.allSettled(this.secureServers.values());
    this.secureServers.clear();
    await Promise.all(
      localServers.map((result) => {
        if (result.status === "fulfilled") {
          return closeServer(result.value.server);
        }
        return Promise.resolve();
      })
    );

    this.authority = undefined;
    this.status = {
      ...this.status,
      lastError: systemProxyStatus.state === "error" ? systemProxyStatus.lastError : this.status.lastError,
      state: "stopped",
      systemProxy: systemProxyStatus
    };
  }

  getStatus(): ProxyStatus {
    return { ...this.status, systemProxy: { ...this.status.systemProxy }, targetHosts: [...this.status.targetHosts] };
  }

  updateConfig(config: AppConfig): void {
    this.config = config;
    this.networkCaptureEnabled = config.proxy.captureNetwork;
  }

  isNetworkCaptureEnabled(): boolean {
    return this.networkCaptureEnabled;
  }

  getNetworkCaptures(): ProxyNetworkSnapshot {
    return {
      capturedAt: new Date().toISOString(),
      captureEnabled: this.networkCaptureEnabled,
      items: this.networkCaptures.map(toProxyNetworkExchange),
      maxBodyBytes: maxNetworkCaptureBodyBytes,
      maxEntries: maxNetworkCaptureEntries
    };
  }

  clearNetworkCaptures(): ProxyNetworkSnapshot {
    this.networkCaptures = [];
    return this.getNetworkCaptures();
  }

  setNetworkCaptureEnabled(enabled: boolean): ProxyNetworkSnapshot {
    this.networkCaptureEnabled = enabled;
    if (this.config) {
      this.config = {
        ...this.config,
        proxy: {
          ...this.config.proxy,
          captureNetwork: enabled
        }
      };
    }
    return this.getNetworkCaptures();
  }

  async ensureSystemProxyActive(): Promise<ProxyStatus> {
    if (!this.config?.proxy.enabled || !this.config.proxy.systemProxy || this.status.state !== "running") {
      return this.getStatus();
    }

    if (this.status.systemProxy.state === "active") {
      return this.getStatus();
    }

    try {
      await this.activateSystemProxy();
      return this.getStatus();
    } catch (error) {
      this.status = {
        ...this.status,
        lastError: formatError(error),
        systemProxy: {
          lastError: formatError(error),
          state: "error"
        }
      };
      return this.getStatus();
    }
  }

  getUpstreamProxy(): UpstreamProxyConfig | undefined {
    return cloneUpstreamProxy(this.upstreamProxy);
  }

  getUpstreamProxyUrl(protocol: "http" | "https" = "https"): string | undefined {
    const upstreamProxy = selectUpstreamProxy(this.upstreamProxy, protocol);
    if (!upstreamProxy) {
      return undefined;
    }
    return `http://${formatProxyHost(upstreamProxy.host)}:${upstreamProxy.port}`;
  }

  async refreshUpstreamProxyFromCurrentSystem(): Promise<void> {
    if (this.upstreamProxy || this.status.state !== "running" || !this.status.endpoint) {
      return;
    }

    const upstreamProxy = await readCurrentSystemUpstreamProxy(this.status.endpoint);
    if (!upstreamProxy) {
      return;
    }

    this.upstreamProxy = upstreamProxy;
    this.status = {
      ...this.status,
      systemProxy: {
        ...this.status.systemProxy,
        upstream: formatUpstreamProxy(upstreamProxy)
      }
    };
  }

  shouldHandleHttpRequest(request: IncomingMessage): boolean {
    return Boolean(this.config?.proxy.enabled && isAbsoluteProxyUrl(request.url));
  }

  async handleHttpRequest(request: IncomingMessage, response: ServerResponse, defaultProtocol: "http:" | "https:" = "http:"): Promise<void> {
    await this.handleProxyRequest(request, response, defaultProtocol);
  }

  async installCertificate(): Promise<ProxyCertificateInstallResult> {
    ensureProxyCertificateAuthority();
    if (process.platform === "darwin") {
      const approved = await requestMacosCertificateInstallPermission();
      if (!approved) {
        const status = await this.getCertificateStatus();
        return {
          caCertFile: proxyCaCertFile(),
          manualCommand: macosManualCertificateInstallCommand(),
          message: "Certificate installation was cancelled. Install the CA into the macOS System keychain to use HTTPS proxying.",
          ok: false,
          status
        };
      }

      try {
        await execFilePromise("/usr/bin/osascript", [
          "-e",
          `do shell script ${quoteAppleScriptString(macosSystemCertificateInstallScript())} with administrator privileges`
        ]);
      } catch (error) {
        let terminalMessage = "";
        try {
          const installerFile = await openMacosTerminalCertificateInstaller();
          terminalMessage = ` Opened Terminal installer: ${installerFile}`;
        } catch (terminalError) {
          shell.showItemInFolder(PROXY_CA_CERT_FILE);
          terminalMessage = ` Could not open Terminal installer: ${formatError(terminalError)}`;
        }
        const status = await this.getCertificateStatus();
        return {
          caCertFile: proxyCaCertFile(),
          manualCommand: macosManualCertificateInstallCommand(),
          message: `macOS did not allow CCR to request administrator authorization: ${formatError(error)}.${terminalMessage}`,
          ok: false,
          status
        };
      }

      const status = await this.getCertificateStatus();
      return {
        caCertFile: proxyCaCertFile(),
        message: "Certificate installed into the macOS System keychain.",
        ok: true,
        status
      };
    }

    if (process.platform === "win32") {
      await execFilePromise("certutil", ["-user", "-addstore", "Root", PROXY_CA_CERT_FILE]);
      const status = await this.getCertificateStatus();
      return {
        caCertFile: proxyCaCertFile(),
        message: "Certificate installed into the current user's Root store.",
        ok: true,
        status
      };
    }

    const status = await this.getCertificateStatus();
    return {
      caCertFile: proxyCaCertFile(),
      message: "Automatic certificate install is not supported on this platform. Import the CA file into the system trust store manually.",
      ok: false,
      status
    };
  }

  async getCertificateStatus(): Promise<ProxyCertificateStatus> {
    const base = {
      caCertFile: proxyCaCertFile(),
      caFingerprintSha256: readProxyCertificateFingerprintSha256(),
      platform: process.platform
    };

    if (!proxyCertificateAuthorityExists()) {
      return {
        ...base,
        canInstall: process.platform === "darwin" || process.platform === "win32",
        message: "Proxy CA certificate is not installed. Install the CA certificate before enabling proxy mode.",
        state: "missing",
        trusted: false
      };
    }

    if (!proxyCertificateAuthorityKeyMatches()) {
      return {
        ...base,
        canInstall: process.platform === "darwin" || process.platform === "win32",
        message:
          "Proxy CA certificate and private key do not match. Recreate the proxy CA certificate, trust the new CA, then restart proxy mode.",
        state: "unknown",
        trusted: false
      };
    }

    if (process.platform === "darwin") {
      try {
        const systemKeychainMatch = await macosKeychainContainsCertificateFingerprint(
          base.caFingerprintSha256,
          "/Library/Keychains/System.keychain"
        );
        if (systemKeychainMatch) {
          return {
            ...base,
            canInstall: true,
            message: "Proxy CA certificate is installed in the macOS System keychain.",
            state: "trusted",
            trusted: true
          };
        }

        const loginKeychainMatch = await macosKeychainContainsCertificateFingerprint(
          base.caFingerprintSha256,
          path.join(os.homedir(), "Library", "Keychains", "login.keychain-db")
        );
        if (loginKeychainMatch) {
          return {
            ...base,
            canInstall: true,
            message:
              "Proxy CA certificate is installed only in the login keychain. Install it into the macOS System keychain so Chrome can trust HTTPS proxy certificates.",
            state: "untrusted",
            trusted: false
          };
        }

        return {
          ...base,
          canInstall: true,
          message:
            "Proxy CA certificate is not installed in the macOS System keychain. Install and trust this exact CA certificate before enabling HTTPS proxying.",
          state: "untrusted",
          trusted: false
        };
      } catch (error) {
        return {
          ...base,
          canInstall: true,
          message: `Proxy CA certificate is not trusted: ${formatError(error)}`,
          state: "untrusted",
          trusted: false
        };
      }
    }

    if (process.platform === "win32") {
      const serialNumber = readProxyCertificateSerialNumber();
      if (!serialNumber) {
        return {
          ...base,
          canInstall: true,
          message: "Proxy CA certificate could not be read. Reinstall the CA certificate.",
          state: "unknown",
          trusted: false
        };
      }
      try {
        await execFilePromise("certutil", ["-user", "-verifystore", "Root", serialNumber]);
        return {
          ...base,
          canInstall: true,
          message: "Proxy CA certificate is trusted by the system trust store.",
          state: "trusted",
          trusted: true
        };
      } catch (error) {
        return {
          ...base,
          canInstall: true,
          message: `Proxy CA certificate is not trusted: ${formatError(error)}`,
          state: "untrusted",
          trusted: false
        };
      }
    }

    return {
      ...base,
      canInstall: false,
      message: "Automatic certificate trust detection is not supported on this platform. Import the CA certificate manually before enabling proxy mode.",
      state: "unsupported",
      trusted: false
    };
  }

  private async requireTrustedCertificate(): Promise<void> {
    const status = await this.getCertificateStatus();
    if (!status.trusted) {
      throw new Error(status.message);
    }
  }

  private async handleConnect(request: IncomingMessage, clientSocket: Socket, head: Buffer): Promise<void> {
    const target = parseConnectTarget(request.url);
    const mitmServer = await this.getMitmServer(target.hostname);
    const localSocket = net.connect(mitmServer.port, "127.0.0.1");
    localSocket.once("connect", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\nProxy-agent: CCR-MITM\r\n\r\n");
      if (head.length > 0) {
        localSocket.write(head);
      }
      localSocket.pipe(clientSocket);
      clientSocket.pipe(localSocket);
    });
    localSocket.once("error", (error) => {
      handleConnectError(request, clientSocket, error);
    });
    clientSocket.once("error", () => {
      localSocket.destroy();
    });
    clientSocket.once("end", () => {
      localSocket.end();
    });
    localSocket.once("end", () => {
      clientSocket.end();
    });
  }

  private async getMitmServer(hostname: string): Promise<MitmServer> {
    const key = hostname.toLowerCase();
    const cached = this.secureServers.get(key);
    if (cached) {
      return cached;
    }

    const promise = this.createMitmServer(key).catch((error) => {
      this.secureServers.delete(key);
      throw error;
    });
    this.secureServers.set(key, promise);
    return promise;
  }

  private async createMitmServer(hostname: string): Promise<MitmServer> {
    const authority = this.authority ?? readProxyCertificateAuthority();
    const certificate = createCertificateForHost(hostname, authority);
    const server = https.createServer(
      {
        ALPNProtocols: ["http/1.1"],
        cert: certificate.cert,
        key: certificate.key
      },
      (request, response) => {
        void this.handleProxyRequest(request, response, "https:").catch((error) => {
          sendProxyError(response, 502, formatError(error));
        });
      }
    );
    await listen(server, 0, "127.0.0.1");
    const address = server.address();
    if (!address || typeof address === "string") {
      await closeServer(server);
      throw new Error(`Failed to start MITM server for ${hostname}`);
    }
    return {
      host: hostname,
      port: address.port,
      server
    };
  }

  private async handleProxyRequest(request: IncomingMessage, response: ServerResponse, defaultProtocol: "http:" | "https:"): Promise<void> {
    if (!this.config) {
      sendProxyError(response, 503, "Proxy service is not configured.");
      return;
    }

    const requestId = randomUUID();
    const targetUrl = resolveRequestUrl(request, defaultProtocol);
    const pluginRoute = pluginService.resolveProxyRoute(targetUrl);
    if (!pluginRoute && isCursorAgentProxyRequest(targetUrl)) {
      console.warn(`[proxy] Cursor Agent request did not match a plugin proxy route: ${request.method || "GET"} ${targetUrl.host}${targetUrl.pathname}`);
    }
    const routedToGateway = !pluginRoute && shouldRouteToGateway(this.config, targetUrl);
    const upstreamUrl = pluginRoute?.upstreamUrl ?? (routedToGateway ? buildGatewayUrl(this.config, targetUrl) : targetUrl);
    const mode: ProxyForwardMode = pluginRoute ? "plugin" : routedToGateway ? "gateway" : "transparent";
    const capture = this.networkCaptureEnabled
      ? this.beginNetworkCapture({
          mode,
          request,
          requestId,
          routedToGateway,
          targetUrl,
          upstreamUrl
        })
      : createNoopNetworkCapture();

    request.once("error", (error) => {
      capture.fail(`Client request stream failed: ${formatError(error)}`);
    });

    await forwardRequest({
      capture,
      config: this.config,
      mode,
      pluginRoute,
      request,
      response,
      routedToGateway,
      targetUrl,
      upstreamUrl,
      upstreamProxy: this.upstreamProxy
    }).finally(() => {
      capture.completeIfPending();
    });
  }

  private beginNetworkCapture({
    mode,
    request,
    requestId,
    routedToGateway,
    targetUrl,
    upstreamUrl
  }: {
    mode: ProxyForwardMode;
    request: IncomingMessage;
    requestId: string;
    routedToGateway: boolean;
    targetUrl: URL;
    upstreamUrl: URL;
  }): ActiveProxyNetworkCapture {
    const startedAtMs = Date.now();
    const record: ProxyNetworkCaptureRecord = {
      client: inferProxyClient(request.headers),
      host: targetUrl.host,
      id: requestId,
      method: request.method ?? "GET",
      mode,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      protocol: targetUrl.protocol === "https:" ? "https" : "http",
      requestHeaders: cloneHeaders(request.headers),
      requestSampler: new NetworkBodySampler(maxNetworkCaptureBodyBytes),
      responseSampler: new NetworkBodySampler(maxNetworkCaptureBodyBytes),
      routedToGateway,
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs,
      state: "pending",
      upstreamUrl: upstreamUrl.toString(),
      url: targetUrl.toString()
    };

    this.networkCaptures.unshift(record);
    if (this.networkCaptures.length > maxNetworkCaptureEntries) {
      this.networkCaptures.length = maxNetworkCaptureEntries;
    }

    const finish = (state: "complete" | "error", message?: string, statusCode?: number) => {
      if (record.state !== "pending") {
        return;
      }
      const completedAtMs = Date.now();
      record.completedAt = new Date(completedAtMs).toISOString();
      record.durationMs = completedAtMs - record.startedAtMs;
      record.state = state;
      if (message) {
        record.error = message;
      }
      if (statusCode !== undefined && record.statusCode === undefined) {
        record.statusCode = statusCode;
      }
    };

    return {
      appendRequestBody: (chunk) => record.requestSampler.append(chunk),
      appendResponseBody: (chunk) => record.responseSampler.append(chunk),
      complete: () => finish("complete"),
      completeIfPending: () => finish("complete"),
      fail: (message, statusCode) => finish("error", message, statusCode),
      setResponse: (statusCode, headers) => {
        record.statusCode = statusCode;
        record.responseHeaders = cloneHeaders(headers);
      }
    };
  }

  private async activateSystemProxy(): Promise<void> {
    const result = await systemProxyManager.enable(this.status.endpoint);
    this.upstreamProxy = result.upstreamProxy;
    const effectiveUpstream = formatUpstreamProxy(this.upstreamProxy);
    this.status = {
      ...this.status,
      systemProxy: effectiveUpstream && effectiveUpstream !== result.status.upstream
        ? { ...result.status, upstream: effectiveUpstream }
        : result.status
    };
  }
}

export const proxyService = new ProxyService();

function createNoopNetworkCapture(): ActiveProxyNetworkCapture {
  return {
    appendRequestBody: () => undefined,
    appendResponseBody: () => undefined,
    complete: () => undefined,
    completeIfPending: () => undefined,
    fail: () => undefined,
    setResponse: () => undefined
  };
}

function forwardRequest({
  capture,
  config,
  mode,
  pluginRoute,
  request,
  response,
  routedToGateway,
  targetUrl,
  upstreamProxy,
  upstreamUrl
}: {
  capture: ActiveProxyNetworkCapture;
  config: AppConfig;
  mode: ProxyForwardMode;
  pluginRoute?: GatewayPluginProxyRouteMatch;
  request: IncomingMessage;
  response: ServerResponse;
  routedToGateway: boolean;
  targetUrl: URL;
  upstreamProxy?: UpstreamProxyConfig;
  upstreamUrl: URL;
}): Promise<void> {
  const proxyServer = selectUpstreamProxyForUrl(upstreamProxy, upstreamUrl);
  if (!proxyServer) {
    return forwardDirectRequest({
      config,
      capture,
      mode,
      pluginRoute,
      request,
      response,
      routedToGateway,
      targetUrl,
      upstreamUrl
    });
  }

  if (upstreamUrl.protocol === "https:") {
    return forwardHttpsRequestViaHttpProxy({
      config,
      capture,
      mode,
      pluginRoute,
      proxyServer,
      request,
      response,
      routedToGateway,
      targetUrl,
      upstreamUrl
    });
  }

  return forwardHttpRequestViaHttpProxy({
    config,
    capture,
    mode,
    pluginRoute,
    proxyServer,
    request,
    response,
    routedToGateway,
    targetUrl,
    upstreamUrl
  });
}

function forwardDirectRequest({
  capture,
  config,
  mode,
  pluginRoute,
  request,
  response,
  routedToGateway,
  targetUrl,
  upstreamUrl
}: {
  capture: ActiveProxyNetworkCapture;
  config: AppConfig;
  mode: ProxyForwardMode;
  pluginRoute?: GatewayPluginProxyRouteMatch;
  request: IncomingMessage;
  response: ServerResponse;
  routedToGateway: boolean;
  targetUrl: URL;
  upstreamUrl: URL;
}): Promise<void> {
  return new Promise((resolve) => {
    const transport = upstreamUrl.protocol === "https:" ? https : http;
    const upstreamRequest = transport.request(
      {
        headers: createForwardHeaders(request.headers, upstreamUrl, routedToGateway, config, { pluginRoute, targetUrl }),
        hostname: upstreamUrl.hostname,
        method: request.method,
        path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
        port: upstreamUrl.port || (upstreamUrl.protocol === "https:" ? 443 : 80),
        protocol: upstreamUrl.protocol
      },
      (upstreamResponse) => {
        const statusCode = upstreamResponse.statusCode ?? 502;
        const responseHeaders = filterResponseHeaders(upstreamResponse.headers);
        capture.setResponse(statusCode, responseHeaders);
        response.writeHead(statusCode, responseHeaders);
        upstreamResponse.on("data", capture.appendResponseBody);
        upstreamResponse.pipe(response);
        upstreamResponse.once("end", () => {
          capture.complete();
          resolve();
        });
        upstreamResponse.once("error", (error) => {
          if (!response.headersSent) {
            const message = formatError(error);
            captureProxyError(capture, 502, message);
            sendProxyError(response, 502, message);
          } else {
            response.destroy(error);
          }
          capture.fail(formatError(error), response.statusCode || statusCode);
          resolve();
        });
      }
    );

    upstreamRequest.once("error", (error) => {
      const message = `Proxy ${mode} request failed: ${formatError(error)}`;
      if (!response.headersSent) {
        captureProxyError(capture, 502, message);
        sendProxyError(response, 502, message);
      } else {
        response.destroy(error);
      }
      capture.fail(message, response.statusCode || 502);
      resolve();
    });
    setClientRequestTimeout(upstreamRequest, upstreamRequestIdleTimeoutMs, `Proxy ${mode} request timed out.`);
    pipeCapturedRequestBody(request, upstreamRequest, capture);
  });
}

function forwardHttpRequestViaHttpProxy({
  capture,
  config,
  mode,
  pluginRoute,
  proxyServer,
  request,
  response,
  routedToGateway,
  targetUrl,
  upstreamUrl
}: {
  capture: ActiveProxyNetworkCapture;
  config: AppConfig;
  mode: ProxyForwardMode;
  pluginRoute?: GatewayPluginProxyRouteMatch;
  proxyServer: UpstreamProxyServer;
  request: IncomingMessage;
  response: ServerResponse;
  routedToGateway: boolean;
  targetUrl: URL;
  upstreamUrl: URL;
}): Promise<void> {
  return new Promise((resolve) => {
    const upstreamRequest = http.request(
      {
        agent: false,
        headers: createForwardHeaders(request.headers, upstreamUrl, routedToGateway, config, { pluginRoute, targetUrl }),
        hostname: proxyServer.host,
        method: request.method,
        path: upstreamUrl.toString(),
        port: proxyServer.port,
        protocol: "http:"
      },
      (upstreamResponse) => {
        const statusCode = upstreamResponse.statusCode ?? 502;
        const responseHeaders = filterResponseHeaders(upstreamResponse.headers);
        capture.setResponse(statusCode, responseHeaders);
        response.writeHead(statusCode, responseHeaders);
        upstreamResponse.on("data", capture.appendResponseBody);
        upstreamResponse.pipe(response);
        upstreamResponse.once("end", () => {
          capture.complete();
          resolve();
        });
        upstreamResponse.once("error", (error) => {
          if (!response.headersSent) {
            const message = formatError(error);
            captureProxyError(capture, 502, message);
            sendProxyError(response, 502, message);
          } else {
            response.destroy(error);
          }
          capture.fail(formatError(error), response.statusCode || statusCode);
          resolve();
        });
      }
    );

    upstreamRequest.once("error", (error) => {
      const message =
        `Proxy ${mode} HTTP request via upstream proxy ${formatUpstreamProxyServer(proxyServer)} ` +
        `to ${upstreamUrl.toString()} failed: ${formatError(error)}`;
      if (!response.headersSent) {
        captureProxyError(capture, 502, message);
        sendProxyError(response, 502, message);
      } else {
        response.destroy(error);
      }
      capture.fail(message, response.statusCode || 502);
      resolve();
    });
    setClientRequestTimeout(
      upstreamRequest,
      upstreamRequestIdleTimeoutMs,
      `Proxy ${mode} HTTP request via upstream proxy ${formatUpstreamProxyServer(proxyServer)} to ${upstreamUrl.toString()} timed out.`
    );
    pipeCapturedRequestBody(request, upstreamRequest, capture);
  });
}

function forwardHttpsRequestViaHttpProxy({
  capture,
  config,
  mode,
  pluginRoute,
  proxyServer,
  request,
  response,
  routedToGateway,
  targetUrl,
  upstreamUrl
}: {
  capture: ActiveProxyNetworkCapture;
  config: AppConfig;
  mode: ProxyForwardMode;
  pluginRoute?: GatewayPluginProxyRouteMatch;
  proxyServer: UpstreamProxyServer;
  request: IncomingMessage;
  response: ServerResponse;
  routedToGateway: boolean;
  targetUrl: URL;
  upstreamUrl: URL;
}): Promise<void> {
  return new Promise((resolve) => {
    const targetPort = Number(upstreamUrl.port || 443);
    const connectRequest = http.request({
      agent: false,
      headers: {
        host: `${upstreamUrl.hostname}:${targetPort}`,
        "proxy-connection": "keep-alive"
      },
      hostname: proxyServer.host,
      method: "CONNECT",
      path: `${upstreamUrl.hostname}:${targetPort}`,
      port: proxyServer.port,
      protocol: "http:"
    });

    connectRequest.once("connect", (connectResponse, socket, head) => {
      if ((connectResponse.statusCode ?? 502) < 200 || (connectResponse.statusCode ?? 502) >= 300) {
        socket.destroy();
        const message =
          `Upstream proxy ${formatUpstreamProxyServer(proxyServer)} CONNECT ${upstreamUrl.hostname}:${targetPort} ` +
          `failed with status ${connectResponse.statusCode ?? 502}.`;
        if (!response.headersSent) {
          captureProxyError(capture, 502, message);
          sendProxyError(response, 502, message);
        }
        capture.fail(message, response.statusCode || 502);
        resolve();
        return;
      }

      if (head.length > 0) {
        socket.unshift(head);
      }

      const tunnelAgent = createHttpsTunnelAgent(socket, upstreamUrl.hostname);
      const upstreamRequest = https.request(
        {
          agent: tunnelAgent,
          headers: createForwardHeaders(request.headers, upstreamUrl, routedToGateway, config, { pluginRoute, targetUrl }),
          hostname: upstreamUrl.hostname,
          method: request.method,
          path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
          port: targetPort,
          protocol: "https:",
          servername: upstreamUrl.hostname
        },
        (upstreamResponse) => {
          const statusCode = upstreamResponse.statusCode ?? 502;
          const responseHeaders = filterResponseHeaders(upstreamResponse.headers);
          capture.setResponse(statusCode, responseHeaders);
          response.writeHead(statusCode, responseHeaders);
          upstreamResponse.on("data", capture.appendResponseBody);
          upstreamResponse.pipe(response);
          upstreamResponse.once("end", () => {
            capture.complete();
            tunnelAgent.destroy();
            resolve();
          });
          upstreamResponse.once("error", (error) => {
            if (!response.headersSent) {
              const message = formatError(error);
              captureProxyError(capture, 502, message);
              sendProxyError(response, 502, message);
            } else {
              response.destroy(error);
            }
            capture.fail(formatError(error), response.statusCode || statusCode);
            tunnelAgent.destroy();
            resolve();
          });
        }
      );

      upstreamRequest.once("error", (error) => {
        const message =
          `Proxy ${mode} HTTPS request via upstream proxy ${formatUpstreamProxyServer(proxyServer)} ` +
          `to ${upstreamUrl.toString()} failed: ${formatError(error)}`;
        if (!response.headersSent) {
          captureProxyError(capture, 502, message);
          sendProxyError(response, 502, message);
        } else {
          response.destroy(error);
        }
        capture.fail(message, response.statusCode || 502);
        tunnelAgent.destroy();
        resolve();
      });
      setClientRequestTimeout(
        upstreamRequest,
        upstreamRequestIdleTimeoutMs,
        `Proxy ${mode} HTTPS request via upstream proxy ${formatUpstreamProxyServer(proxyServer)} to ${upstreamUrl.toString()} timed out.`
      );
      pipeCapturedRequestBody(request, upstreamRequest, capture);
    });

    connectRequest.once("error", (error) => {
      const message = `Upstream proxy ${formatUpstreamProxyServer(proxyServer)} connection to ${upstreamUrl.hostname}:${targetPort} failed: ${formatError(error)}`;
      if (!response.headersSent) {
        captureProxyError(capture, 502, message);
        sendProxyError(response, 502, message);
      } else {
        response.destroy(error);
      }
      capture.fail(message, response.statusCode || 502);
      resolve();
    });
    setClientRequestTimeout(
      connectRequest,
      upstreamProxyConnectTimeoutMs,
      `Upstream proxy ${formatUpstreamProxyServer(proxyServer)} CONNECT ${upstreamUrl.hostname}:${targetPort} timed out.`
    );
    connectRequest.end();
  });
}

function pipeCapturedRequestBody(request: IncomingMessage, upstreamRequest: ClientRequest, capture: ActiveProxyNetworkCapture): void {
  const requestBody = new PassThrough();
  requestBody.on("data", capture.appendRequestBody);
  requestBody.once("error", (error) => {
    capture.fail(`Request body capture failed: ${formatError(error)}`);
    upstreamRequest.destroy(error);
  });
  request.pipe(requestBody).pipe(upstreamRequest);
}

function setClientRequestTimeout(request: ClientRequest, timeoutMs: number, message: string): void {
  request.setTimeout(timeoutMs, () => {
    request.destroy(new Error(message));
  });
}

function createForwardHeaders(
  headers: IncomingHttpHeaders,
  upstreamUrl: URL,
  routedToGateway: boolean,
  config: AppConfig,
  route?: {
    pluginRoute?: GatewayPluginProxyRouteMatch;
    targetUrl?: URL;
  }
): Record<string, string> {
  const forwarded: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase();
    if (requestHopByHopHeaders.has(normalized) || value === undefined) {
      continue;
    }
    forwarded[normalized] = Array.isArray(value) ? value.join(",") : String(value);
  }

  const pluginRoute = route?.pluginRoute;
  if (pluginRoute) {
    forwarded.host = pluginRoute.preserveHost ? (route.targetUrl?.host ?? readHeader(headers.host) ?? upstreamUrl.host) : upstreamUrl.host;
    forwarded["x-ccr-proxy-mode"] = "plugin";
    forwarded["x-ccr-plugin-id"] = pluginRoute.pluginId;
    forwarded["x-ccr-plugin-route-id"] = pluginRoute.id;
    forwarded["x-ccr-original-host"] = readHeader(headers.host) ?? "";
    forwarded["x-ccr-original-url"] = pluginRoute.targetUrl.toString();
    for (const [key, value] of Object.entries(pluginRoute.headers ?? {})) {
      forwarded[key.toLowerCase()] = value;
    }
  } else if (routedToGateway) {
    forwarded.host = upstreamUrl.host;
    forwarded["x-ccr-proxy-mode"] = "gateway";
    forwarded["x-ccr-original-host"] = readHeader(headers.host) ?? "";
    delete forwarded.authorization;
    delete forwarded["x-api-key"];
    const apiKey = primaryApiKey(config);
    if (apiKey) {
      forwarded.authorization = `Bearer ${apiKey}`;
      forwarded["x-api-key"] = apiKey;
    }
  } else {
    forwarded.host = upstreamUrl.host;
    forwarded["x-ccr-proxy-mode"] = "transparent";
  }
  return forwarded;
}

function primaryApiKey(config: AppConfig): string | undefined {
  const values = [
    ...(Array.isArray(config.APIKEYS) ? config.APIKEYS.map((item) => item.key) : []),
    config.APIKEY
  ];
  return values.map((value) => value?.trim()).find(Boolean);
}

function filterResponseHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const filtered: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!responseHopByHopHeaders.has(key.toLowerCase()) && value !== undefined) {
      filtered[key] = Array.isArray(value) ? value.map(String) : String(value);
    }
  }
  return filtered;
}

function shouldRouteToGateway(config: AppConfig, url: URL): boolean {
  if (config.proxy.mode !== "gateway") {
    return false;
  }
  return config.proxy.targets.some((target) => matchesTarget(target, url));
}

function isCursorAgentProxyRequest(url: URL): boolean {
  return (
    /^\/(?:aiserver|agent)\.v\d+\.[^/]+\/[^/]+$/i.test(url.pathname) &&
    /(?:agent|chat|composer|completion|complete|edit|generate|inline|intent|prompt|stream|terminal|tool)/i.test(url.pathname) &&
    /(^|\.)cursor(?:\.sh|\.com|api\.com)$/i.test(url.hostname)
  );
}

function matchesTarget(target: ProxyRouteTarget, url: URL): boolean {
  if (!matchesHost(target.host, url.hostname)) {
    return false;
  }
  if (!target.paths?.length) {
    return true;
  }
  return target.paths.some((pathPrefix) => {
    const prefix = pathPrefix.startsWith("/") ? pathPrefix : `/${pathPrefix}`;
    return url.pathname === prefix || url.pathname.startsWith(`${prefix}/`);
  });
}

function matchesHost(pattern: string, hostname: string): boolean {
  const normalizedPattern = pattern.toLowerCase();
  const normalizedHost = hostname.toLowerCase();
  if (normalizedPattern === normalizedHost) {
    return true;
  }
  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(1);
    return normalizedHost.endsWith(suffix) && normalizedHost !== suffix.slice(1);
  }
  if (normalizedPattern.startsWith(".")) {
    return normalizedHost.endsWith(normalizedPattern);
  }
  return false;
}

function buildGatewayUrl(config: AppConfig, targetUrl: URL): URL {
  const gatewayHost = config.gateway.host === "0.0.0.0" ? "127.0.0.1" : config.gateway.host;
  return new URL(`${targetUrl.pathname}${targetUrl.search}`, `http://${gatewayHost}:${config.gateway.port}`);
}

function resolveRequestUrl(request: IncomingMessage, defaultProtocol: "http:" | "https:"): URL {
  const rawUrl = request.url || "/";
  if (/^https?:\/\//i.test(rawUrl)) {
    return new URL(rawUrl);
  }

  const host = readHeader(request.headers.host);
  if (!host) {
    throw new Error("Proxy request is missing Host header.");
  }
  return new URL(`${defaultProtocol}//${host}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`);
}

function parseConnectTarget(value: string | undefined): { hostname: string; port: number } {
  if (!value) {
    throw new Error("CONNECT target is missing.");
  }
  const parsed = new URL(`http://${value}`);
  return {
    hostname: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 443
  };
}

function proxyEndpoint(config: AppConfig): string {
  const host = config.proxy.host === "0.0.0.0" ? "127.0.0.1" : config.proxy.host;
  return `http://${host}:${config.proxy.port}`;
}

function sharedProxyEndpoint(config: AppConfig): string {
  const host = config.gateway.host === "0.0.0.0" ? "127.0.0.1" : config.gateway.host;
  return `http://${host}:${config.gateway.port}`;
}

function createProxyStatus(config: AppConfig, endpoint: string, port: number): ProxyStatus {
  const targetHosts = [
    ...config.proxy.targets.map((target) => target.host),
    ...pluginService.getProxyRouteHosts()
  ];
  return {
    caCertFile: proxyCaCertFile(),
    endpoint,
    mode: config.proxy.mode,
    port,
    state: config.proxy.enabled ? "starting" : "stopped",
    systemProxy: systemProxyManager.getStatus(),
    targetHosts: [...new Set(targetHosts)]
  };
}

function isAbsoluteProxyUrl(value: string | undefined): boolean {
  return /^https?:\/\//i.test(value || "");
}

function cloneUpstreamProxy(upstreamProxy: UpstreamProxyConfig | undefined): UpstreamProxyConfig | undefined {
  if (!upstreamProxy?.http && !upstreamProxy?.https) {
    return undefined;
  }
  return {
    http: upstreamProxy.http ? { ...upstreamProxy.http } : undefined,
    https: upstreamProxy.https ? { ...upstreamProxy.https } : undefined
  };
}

function selectUpstreamProxy(upstreamProxy: UpstreamProxyConfig | undefined, protocol: "http" | "https"): UpstreamProxyServer | undefined {
  if (protocol === "https") {
    return upstreamProxy?.https ?? upstreamProxy?.http;
  }
  return upstreamProxy?.http ?? upstreamProxy?.https;
}

function selectUpstreamProxyForUrl(upstreamProxy: UpstreamProxyConfig | undefined, upstreamUrl: URL): UpstreamProxyServer | undefined {
  if (shouldBypassUpstreamProxy(upstreamUrl)) {
    return undefined;
  }

  if (upstreamUrl.protocol === "https:") {
    return selectUpstreamProxy(upstreamProxy, "https");
  }
  if (upstreamUrl.protocol === "http:") {
    return selectUpstreamProxy(upstreamProxy, "http");
  }
  return undefined;
}

function shouldBypassUpstreamProxy(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local");
}

function formatProxyHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function formatUpstreamProxyServer(proxyServer: UpstreamProxyServer): string {
  return `http://${formatProxyHost(proxyServer.host)}:${proxyServer.port}`;
}

function createHttpsTunnelAgent(socket: Socket, servername: string): https.Agent {
  const agent = new https.Agent({
    keepAlive: false,
    maxCachedSessions: 0,
    maxSockets: 1
  });
  agent.createConnection = () => tls.connect({
    ALPNProtocols: ["http/1.1"],
    servername,
    socket
  });
  return agent;
}

function listen(server: Server | https.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server | https.Server): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve();
    };

    try {
      server.closeIdleConnections?.();
      timeout = setTimeout(() => {
        server.closeAllConnections?.();
        finish();
      }, 800);
      server.close(() => finish());
    } catch {
      finish();
    }
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutValue: T): Promise<T> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(timeoutValue), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve(timeoutValue);
      });
  });
}

function execFilePromise(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || stdout?.trim() || error.message));
        return;
      }
      resolve();
    });
  });
}

async function requestMacosCertificateInstallPermission(): Promise<boolean> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options = {
    buttons: ["Continue", "Cancel"],
    cancelId: 1,
    defaultId: 0,
    detail:
      "macOS will ask for administrator credentials. This is required so Chrome can trust HTTPS certificates generated by CCR proxy mode.",
    message: "Install CCR Proxy CA into the macOS System keychain?",
    noLink: true,
    type: "warning" as const
  };
  const result = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
  return result.response === 0;
}

function execFileText(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || stdout?.trim() || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function macosKeychainContainsCertificateFingerprint(fingerprint: string | undefined, keychainPath: string): Promise<boolean> {
  if (!fingerprint) {
    return false;
  }

  try {
    const output = await execFileText("/usr/bin/security", ["find-certificate", "-a", "-Z", keychainPath]);
    return normalizeFingerprint(output).includes(normalizeFingerprint(fingerprint));
  } catch {
    return false;
  }
}

function normalizeFingerprint(value: string): string {
  return value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

function macosSystemCertificateInstallScript(): string {
  return [
    "set -e",
    "/usr/bin/security delete-certificate -c 'Claude Code Router CA' /Library/Keychains/System.keychain >/dev/null 2>&1 || true",
    `/usr/bin/security add-trusted-cert -d -r trustRoot -p ssl -k /Library/Keychains/System.keychain ${quoteShellArg(PROXY_CA_CERT_FILE)}`
  ].join("; ");
}

function macosManualCertificateInstallCommand(): string {
  return [
    "sudo /usr/bin/security delete-certificate -c 'Claude Code Router CA' /Library/Keychains/System.keychain || true",
    `sudo /usr/bin/security add-trusted-cert -d -r trustRoot -p ssl -k /Library/Keychains/System.keychain ${quoteShellArg(PROXY_CA_CERT_FILE)}`
  ].join("\n");
}

async function openMacosTerminalCertificateInstaller(): Promise<string> {
  const installerFile = path.join(os.tmpdir(), `ccr-install-proxy-ca-${randomUUID()}.command`);
  writeFileSync(installerFile, `${macosTerminalCertificateInstallScript()}\n`, "utf8");
  chmodSync(installerFile, 0o700);
  const errorMessage = await shell.openPath(installerFile);
  if (errorMessage) {
    throw new Error(errorMessage);
  }
  return installerFile;
}

function macosTerminalCertificateInstallScript(): string {
  return [
    "#!/bin/zsh",
    "set -e",
    "echo 'Installing CCR Proxy CA into the macOS System keychain.'",
    "echo 'Terminal will ask for your macOS password if sudo is required.'",
    "echo ''",
    "sudo /usr/bin/security delete-certificate -c 'Claude Code Router CA' /Library/Keychains/System.keychain >/dev/null 2>&1 || true",
    `sudo /usr/bin/security add-trusted-cert -d -r trustRoot -p ssl -k /Library/Keychains/System.keychain ${quoteShellArg(PROXY_CA_CERT_FILE)}`,
    "echo ''",
    "echo 'Done. Return to CCR, click Check Trust, then restart proxy mode and Chrome.'",
    "printf 'Press Return to close this window...'",
    "read reply"
  ].join("\n");
}

function quoteAppleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

class NetworkBodySampler {
  private capturedBytes = 0;
  private readonly chunks: Buffer[] = [];
  sizeBytes = 0;
  truncated = false;

  constructor(private readonly maxBytes: number) {}

  append(chunk: Buffer | string): void {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.sizeBytes += buffer.length;
    const remaining = this.maxBytes - this.capturedBytes;
    if (remaining <= 0) {
      this.truncated = true;
      return;
    }

    const captured = buffer.length > remaining ? buffer.subarray(0, remaining) : buffer;
    this.chunks.push(captured);
    this.capturedBytes += captured.length;
    if (captured.length < buffer.length) {
      this.truncated = true;
    }
  }

  read(): Buffer {
    return Buffer.concat(this.chunks, this.capturedBytes);
  }
}

function toProxyNetworkExchange(record: ProxyNetworkCaptureRecord): ProxyNetworkExchange {
  return {
    client: record.client,
    completedAt: record.completedAt,
    durationMs: record.durationMs,
    error: record.error,
    host: record.host,
    id: record.id,
    method: record.method,
    mode: record.mode,
    path: record.path,
    protocol: record.protocol,
    requestBody: createCapturedBody(record.requestSampler, record.requestHeaders),
    requestHeaders: { ...record.requestHeaders },
    responseBody:
      record.responseHeaders || record.responseSampler.sizeBytes > 0
        ? createCapturedBody(record.responseSampler, record.responseHeaders ?? {})
        : undefined,
    responseHeaders: record.responseHeaders ? { ...record.responseHeaders } : undefined,
    routedToGateway: record.routedToGateway,
    startedAt: record.startedAt,
    state: record.state,
    statusCode: record.statusCode,
    upstreamUrl: record.upstreamUrl,
    url: record.url
  };
}

function inferProxyClient(headers: IncomingHttpHeaders): string {
  const explicitClient =
    readHeader(headers["x-ccr-client"]) ??
    readHeader(headers["x-client-name"]) ??
    readHeader(headers["x-forwarded-client-cert"]);
  if (explicitClient) {
    return explicitClient;
  }

  const userAgent = readHeader(headers["user-agent"]);
  if (!userAgent) {
    return "System";
  }

  const normalized = userAgent.toLowerCase();
  if (normalized.includes("codex")) {
    return "Codex (Service)";
  }
  if (normalized.includes("@anthropic-ai/claude-code") || normalized.includes("claude-code") || normalized.includes("claude code")) {
    return "Claude Code";
  }
  if (normalized.includes("chrome")) {
    return "Google Chrome";
  }
  if (normalized.includes("safari") && !normalized.includes("chrome")) {
    return "Safari";
  }
  if (normalized.includes("firefox")) {
    return "Firefox";
  }
  if (normalized.includes("curl")) {
    return "curl";
  }
  if (normalized.includes("node") || normalized.includes("undici")) {
    return "Node.js";
  }
  return userAgent.split(/[/(]/)[0]?.trim() || "Client";
}

function cloneHeaders(headers: CapturedHeaders | IncomingHttpHeaders): CapturedHeaders {
  const result: CapturedHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    result[key.toLowerCase()] = Array.isArray(value) ? value.map(String) : String(value);
  }
  return result;
}

function createCapturedBody(sampler: NetworkBodySampler, headers: CapturedHeaders): ProxyNetworkBody {
  const raw = sampler.read();
  const contentType = readCapturedHeader(headers, "content-type");
  const contentEncoding = readCapturedHeader(headers, "content-encoding")?.toLowerCase();
  let body = raw;
  let decodedFrom: string | undefined;
  let error: string | undefined;

  if (raw.length > 0 && contentEncoding && contentEncoding !== "identity") {
    if (sampler.truncated) {
      error = `Body was truncated before ${contentEncoding} decoding.`;
    } else {
      try {
        body = decodeBodyEncoding(raw, contentEncoding);
        decodedFrom = contentEncoding;
      } catch (decodeError) {
        error = `Failed to decode ${contentEncoding}: ${formatError(decodeError)}`;
      }
    }
  }

  const display = bodyToDisplayText(body, contentType);
  return {
    contentType,
    decodedFrom,
    encoding: display.encoding,
    error,
    sizeBytes: sampler.sizeBytes,
    text: display.text,
    truncated: sampler.truncated
  };
}

function decodeBodyEncoding(body: Buffer, encoding: string): Buffer {
  return encoding
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .reverse()
    .reduce((current, item) => decodeSingleBodyEncoding(current, item), body);
}

function decodeSingleBodyEncoding(body: Buffer, encoding: string): Buffer {
  if (encoding === "gzip" || encoding === "x-gzip") {
    return gunzipSync(body);
  }
  if (encoding === "br") {
    return brotliDecompressSync(body);
  }
  if (encoding === "deflate") {
    try {
      return inflateSync(body);
    } catch {
      return inflateRawSync(body);
    }
  }
  return body;
}

function bodyToDisplayText(body: Buffer, contentType: string | undefined): { encoding: "base64" | "utf8"; text: string } {
  if (body.length === 0) {
    return { encoding: "utf8", text: "" };
  }

  const text = body.toString("utf8");
  if (isTextContentType(contentType) || looksLikeText(text)) {
    return { encoding: "utf8", text };
  }

  return { encoding: "base64", text: body.toString("base64") };
}

function isTextContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes("json") ||
    normalized.includes("text/") ||
    normalized.includes("xml") ||
    normalized.includes("javascript") ||
    normalized.includes("x-www-form-urlencoded") ||
    normalized.includes("event-stream")
  );
}

function looksLikeText(value: string): boolean {
  if (!value) {
    return true;
  }

  let suspicious = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0xfffd || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      suspicious += 1;
    }
  }
  return suspicious / value.length < 0.08;
}

function readCapturedHeader(headers: CapturedHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return value?.trim() || undefined;
}

function captureProxyError(capture: ActiveProxyNetworkCapture, statusCode: number, message: string): void {
  const body = proxyErrorBody(message);
  capture.setResponse(statusCode, { "content-type": "application/json" });
  capture.appendResponseBody(Buffer.from(body, "utf8"));
  capture.fail(message, statusCode);
}

function proxyErrorBody(message: string): string {
  return `${JSON.stringify({ error: { message } })}\n`;
}

function sendProxyError(response: ServerResponse, statusCode: number, message: string): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(proxyErrorBody(message));
}

function closeConnectSocket(socket: Socket, statusCode: number, message: string): void {
  if (socket.destroyed) {
    return;
  }
  const body = `${message}\n`;
  socket.end(
    `HTTP/1.1 ${statusCode} ${http.STATUS_CODES[statusCode] ?? "Proxy Error"}\r\n` +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      "Connection: close\r\n" +
      `\r\n${body}`
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function handleConnectError(request: IncomingMessage, socket: Socket, error: unknown): void {
  const message = formatError(error);
  console.warn(`[proxy] CONNECT ${request.url || "<unknown>"} failed: ${message}`);
  closeConnectSocket(socket, 502, message);
}
