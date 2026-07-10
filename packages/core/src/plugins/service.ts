import { mkdirSync } from "node:fs";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  type AppConfig,
  type GatewayPluginAppConfig,
  type GatewayPluginConfig,
  type GatewayPluginPermission,
  type GatewayPluginProxyRouteConfig,
  type GatewayProviderConfig,
  type InstalledBrowserApp,
  type ProviderAccountMeter,
  type ProviderAccountPluginConnectorConfig,
  type ProviderAccountSnapshot
} from "@ccr/core/contracts/app";
import { backendService, type RegisteredHttpBackend, type SqliteStore, type SqliteStoreOptions } from "@ccr/core/plugins/backend-service";
import { CONFIGDIR, DATADIR } from "@ccr/core/config/constants";

type MaybePromise<T> = T | Promise<T>;
type PluginLogger = {
  debug: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

export type GatewayPluginRouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  context: GatewayPluginRouteContext
) => MaybePromise<void>;

export type GatewayPluginRouteRegistration = {
  auth?: "gateway" | "none";
  handler: GatewayPluginRouteHandler;
  id?: string;
  method?: string;
  methods?: string[];
  path?: string;
  pathPrefix?: string;
};

export type GatewayPluginProxyRouteRegistration = Omit<GatewayPluginProxyRouteConfig, "upstream"> & {
  upstream: string | URL | (() => string | URL);
};

export type GatewayPluginHttpBackendRegistration = {
  handler: GatewayPluginRouteHandler;
  host?: string;
  id?: string;
  port?: number;
};

export type GatewayPluginProviderAccountRequest = {
  config: AppConfig;
  connector: ProviderAccountPluginConnectorConfig;
  now: string;
  provider: GatewayProviderConfig;
};

export type GatewayPluginProviderAccountConnector = {
  id: string;
  resolve: (request: GatewayPluginProviderAccountRequest) => MaybePromise<ProviderAccountMeter[] | ProviderAccountSnapshot | undefined>;
};

export type GatewayPluginStopReason = "disabled" | "reload" | "stop";

export type GatewayPluginStopEvent = {
  reason: GatewayPluginStopReason;
};

type GatewayPluginStopHandler = (event?: GatewayPluginStopEvent) => MaybePromise<void>;

export type GatewayPluginRegistration = {
  apps?: GatewayPluginAppConfig[];
  coreGateway?: {
    config?: Record<string, unknown>;
    providerPlugins?: unknown[];
    virtualModelProfiles?: unknown[];
  };
  gatewayRoutes?: GatewayPluginRouteRegistration[];
  onStop?: GatewayPluginStopHandler;
  providerAccountConnectors?: GatewayPluginProviderAccountConnector[];
  proxyRoutes?: GatewayPluginProxyRouteRegistration[];
  stop?: GatewayPluginStopHandler;
  virtualModelProfiles?: unknown[];
};

export type GatewayPluginContext = {
  config: AppConfig;
  logger: PluginLogger;
  paths: {
    configDir: string;
    dataDir: string;
    pluginDataDir: string;
  };
  pluginConfig: unknown;
  pluginId: string;
  permissions: GatewayPluginPermission[];
  openSqliteStore: (options?: PluginSqliteStoreOptions) => Promise<PluginSqliteStore>;
  registerCoreGatewayProviderPlugin: (providerPlugin: unknown) => void;
  registerCoreGatewayVirtualModelProfile: (profile: unknown) => void;
  registerApp: (app: GatewayPluginAppConfig) => void;
  registerGatewayRoute: (route: GatewayPluginRouteRegistration) => void;
  registerHttpBackend: (backend: GatewayPluginHttpBackendRegistration) => Promise<RegisteredHttpBackend>;
  registerProviderAccountConnector: (connector: GatewayPluginProviderAccountConnector) => void;
  registerProxyRoute: (route: GatewayPluginProxyRouteRegistration) => void;
};

export type GatewayPluginRouteContext = Pick<
  GatewayPluginContext,
  "config" | "logger" | "openSqliteStore" | "paths" | "permissions" | "pluginConfig" | "pluginId"
> & {
  readBody: (request: IncomingMessage) => Promise<Buffer>;
  readJson: (request: IncomingMessage) => Promise<unknown>;
  sendJson: (response: ServerResponse, statusCode: number, body: unknown) => void;
};

export type PluginSqliteStoreOptions = SqliteStoreOptions;
export type PluginSqliteStore = SqliteStore;

export type GatewayPluginRouteMatch = RegisteredGatewayRoute;

export type GatewayPluginProxyRouteMatch = {
  headers?: Record<string, string>;
  id: string;
  preserveHost: boolean;
  pluginId: string;
  targetUrl: URL;
  upstreamUrl: URL;
};

type RegisteredGatewayRoute = Required<Pick<GatewayPluginRouteRegistration, "handler" | "id">> & {
  auth: "gateway" | "none";
  methods?: string[];
  path?: string;
  pathPrefix?: string;
  pluginId: string;
};

type RegisteredProxyRoute = Omit<GatewayPluginProxyRouteRegistration, "host" | "id" | "paths"> & {
  host: string;
  id: string;
  paths?: string[];
  pluginId: string;
};

type LoadedPlugin = {
  activate?: (context: GatewayPluginContext) => MaybePromise<GatewayPluginRegistration | void>;
  setup?: (context: GatewayPluginContext) => MaybePromise<GatewayPluginRegistration | void>;
  stop?: GatewayPluginStopHandler;
};

type StopHook = {
  pluginId: string;
  stop: GatewayPluginStopHandler;
};

type PluginPermissionAccess = {
  explicit: boolean;
  permissions: Set<GatewayPluginPermission>;
  pluginId: string;
};

const requireFromHere = createRequire(__filename);

class GatewayPluginService {
  private config?: AppConfig;
  private coreGatewayConfig: Record<string, unknown> = {};
  private coreProviderPlugins: unknown[] = [];
  private apps: InstalledBrowserApp[] = [];
  private gatewayRoutes: RegisteredGatewayRoute[] = [];
  private proxyRoutes: RegisteredProxyRoute[] = [];
  private providerAccountConnectors = new Map<string, GatewayPluginProviderAccountConnector>();
  private resourceOwnerIds = new Set<string>();
  private running = false;
  private stopHooks: StopHook[] = [];
  private virtualModelProfiles: unknown[] = [];

  async start(config: AppConfig): Promise<void> {
    await this.stop({ nextConfig: config });
    this.config = config;
    this.running = true;

    for (const pluginConfig of config.plugins ?? []) {
      if (pluginConfig.enabled === false) {
        continue;
      }
      this.resourceOwnerIds.add(pluginConfig.id);
      await this.loadConfiguredPlugin(pluginConfig);
    }
  }

  async stop(options: { nextConfig?: AppConfig } = {}): Promise<void> {
    const stopHooks = [...this.stopHooks].reverse();
    const nextEnabledPluginIds = options.nextConfig ? enabledPluginIds(options.nextConfig) : undefined;
    this.stopHooks = [];

    for (const stopHook of stopHooks) {
      try {
        await stopHook.stop({ reason: stopReasonForPlugin(stopHook.pluginId, nextEnabledPluginIds) });
      } catch (error) {
        console.warn(`[plugin] Stop hook failed: ${formatError(error)}`);
      }
    }

    const resourceOwnerIds = [...this.resourceOwnerIds].reverse();
    this.resourceOwnerIds.clear();
    for (const ownerId of resourceOwnerIds) {
      await backendService.stopOwner(ownerId);
    }

    this.config = undefined;
    this.apps = [];
    this.coreGatewayConfig = {};
    this.coreProviderPlugins = [];
    this.gatewayRoutes = [];
    this.proxyRoutes = [];
    this.providerAccountConnectors.clear();
    this.running = false;
    this.virtualModelProfiles = [];
  }

  hasGatewayRoutes(): boolean {
    return this.gatewayRoutes.length > 0;
  }

  getCoreGatewayConfig(): Record<string, unknown> {
    return { ...this.coreGatewayConfig };
  }

  getCoreProviderPlugins(): unknown[] {
    return [...this.coreProviderPlugins];
  }

  getVirtualModelProfiles(): unknown[] {
    return [...this.virtualModelProfiles];
  }

  getApps(): InstalledBrowserApp[] {
    return this.apps.map((app) => ({ ...app }));
  }

  getProviderAccountConnector(pluginId: string, connectorId: string): GatewayPluginProviderAccountConnector | undefined {
    return this.providerAccountConnectors.get(providerAccountConnectorKey(pluginId, connectorId));
  }

  getProxyRouteHosts(): string[] {
    return [...new Set(this.proxyRoutes.map((route) => route.host))];
  }

  getProxyRouteTargets(): Array<{ host: string; paths?: string[] }> {
    return this.proxyRoutes.map((route) => ({
      host: route.host,
      paths: route.paths ? [...route.paths] : undefined
    }));
  }

  matchGatewayRoute(method: string | undefined, requestPath: string): GatewayPluginRouteMatch | undefined {
    const normalizedMethod = (method || "GET").toUpperCase();
    return this.gatewayRoutes.find((route) => {
      if (route.methods?.length && !route.methods.includes(normalizedMethod)) {
        return false;
      }
      if (route.path && requestPath === route.path) {
        return true;
      }
      if (route.pathPrefix && matchesPathPrefix(route.pathPrefix, requestPath)) {
        return true;
      }
      return false;
    });
  }

  async handleGatewayRoute(route: GatewayPluginRouteMatch, request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.config) {
      throw new Error("Gateway plugin service is not configured.");
    }
    await route.handler(request, response, this.createRouteContext(route.pluginId));
  }

  resolveProxyRoute(targetUrl: URL): GatewayPluginProxyRouteMatch | undefined {
    let bestMatch: { matchedPathPrefix: string; route: RegisteredProxyRoute } | undefined;
    for (const route of this.proxyRoutes) {
      const matchedPathPrefix = matchProxyRoute(route, targetUrl);
      if (matchedPathPrefix === undefined) {
        continue;
      }

      if (!bestMatch || matchedPathPrefix.length > bestMatch.matchedPathPrefix.length) {
        bestMatch = { matchedPathPrefix, route };
      }
    }
    if (!bestMatch) {
      return undefined;
    }

    return {
      headers: bestMatch.route.headers,
      id: bestMatch.route.id,
      pluginId: bestMatch.route.pluginId,
      preserveHost: bestMatch.route.preserveHost === true,
      targetUrl,
      upstreamUrl: buildPluginProxyUpstreamUrl(bestMatch.route, targetUrl, bestMatch.matchedPathPrefix)
    };
  }

  private async loadConfiguredPlugin(pluginConfig: GatewayPluginConfig): Promise<void> {
    const permissions = pluginPermissionAccess(pluginConfig);
    this.registerConfiguredCoreGateway(pluginConfig, permissions);
    this.registerConfiguredApps(pluginConfig, permissions);
    if ((pluginConfig.proxy?.routes ?? []).length > 0) {
      this.requirePluginPermission(permissions, "proxy-routes", "register configured proxy routes");
    }
    for (const route of pluginConfig.proxy?.routes ?? []) {
      this.registerProxyRoute(pluginConfig.id, route);
    }

    const modulePath = pluginConfig.module;
    if (!modulePath) {
      return;
    }

    this.requirePluginPermission(permissions, "trusted-code", "load and execute plugin JavaScript");
    const loadedPlugin = await loadPluginModule(modulePath);
    const plugin = normalizeLoadedPlugin(loadedPlugin);
    const context = this.createPluginContext(pluginConfig, permissions);
    const registration = plugin.setup
      ? await plugin.setup(context)
      : plugin.activate
        ? await plugin.activate(context)
        : undefined;

    if (registration) {
      this.applyPluginRegistration(pluginConfig.id, registration, permissions);
    }
    if (plugin.stop) {
      this.stopHooks.push({
        pluginId: pluginConfig.id,
        stop: (event) => plugin.stop?.(event)
      });
    }
  }

  private applyPluginRegistration(pluginId: string, registration: GatewayPluginRegistration, permissions: PluginPermissionAccess): void {
    if ((registration.apps ?? []).length > 0) {
      this.requirePluginPermission(permissions, "apps", "register browser apps");
    }
    for (const app of registration.apps ?? []) {
      this.registerApp(pluginId, app);
    }
    if ((registration.gatewayRoutes ?? []).length > 0) {
      this.requirePluginPermission(permissions, "gateway-routes", "register gateway routes");
    }
    for (const route of registration.gatewayRoutes ?? []) {
      this.registerGatewayRoute(pluginId, route);
    }
    if ((registration.proxyRoutes ?? []).length > 0) {
      this.requirePluginPermission(permissions, "proxy-routes", "register proxy routes");
    }
    for (const route of registration.proxyRoutes ?? []) {
      this.registerProxyRoute(pluginId, route);
    }
    if ((registration.providerAccountConnectors ?? []).length > 0) {
      this.requirePluginPermission(permissions, "provider-account-connectors", "register provider account connectors");
    }
    for (const connector of registration.providerAccountConnectors ?? []) {
      this.registerProviderAccountConnector(pluginId, connector);
    }
    if ((registration.coreGateway?.providerPlugins ?? []).length > 0) {
      this.requirePluginPermission(permissions, "core-provider-plugins", "register core provider plugins");
    }
    for (const providerPlugin of registration.coreGateway?.providerPlugins ?? []) {
      this.coreProviderPlugins.push(providerPlugin);
    }
    if (((registration.coreGateway?.virtualModelProfiles ?? []).length + (registration.virtualModelProfiles ?? []).length) > 0) {
      this.requirePluginPermission(permissions, "virtual-model-profiles", "register virtual model profiles");
    }
    for (const profile of [
      ...(registration.coreGateway?.virtualModelProfiles ?? []),
      ...(registration.virtualModelProfiles ?? [])
    ]) {
      this.virtualModelProfiles.push(profile);
    }
    if (registration.coreGateway?.config) {
      this.requirePluginPermission(permissions, "core-gateway-config", "register core gateway config");
      this.coreGatewayConfig = {
        ...this.coreGatewayConfig,
        ...registration.coreGateway.config
      };
    }
    if (registration.stop) {
      this.stopHooks.push({ pluginId, stop: registration.stop });
    }
    if (registration.onStop) {
      this.stopHooks.push({ pluginId, stop: registration.onStop });
    }
  }

  private registerConfiguredApps(pluginConfig: GatewayPluginConfig, permissions: PluginPermissionAccess): void {
    if ((pluginConfig.apps ?? []).length > 0) {
      this.requirePluginPermission(permissions, "apps", "register configured browser apps");
    }
    for (const app of pluginConfig.apps ?? []) {
      this.registerApp(pluginConfig.id, app);
    }
  }

  private registerApp(pluginId: string, app: GatewayPluginAppConfig): void {
    const normalized = normalizePluginApp(pluginId, app, this.apps.length + 1);
    if (!normalized) {
      return;
    }
    this.apps = this.apps.filter((item) => !(item.pluginId === pluginId && item.id === normalized.id));
    this.apps.push(normalized);
  }

  private registerConfiguredCoreGateway(pluginConfig: GatewayPluginConfig, permissions: PluginPermissionAccess): void {
    if ((pluginConfig.coreGateway?.providerPlugins ?? []).length > 0) {
      this.requirePluginPermission(permissions, "core-provider-plugins", "register configured core provider plugins");
    }
    for (const providerPlugin of pluginConfig.coreGateway?.providerPlugins ?? []) {
      this.coreProviderPlugins.push(providerPlugin);
    }
    if ((pluginConfig.coreGateway?.virtualModelProfiles ?? []).length > 0) {
      this.requirePluginPermission(permissions, "virtual-model-profiles", "register configured virtual model profiles");
    }
    for (const profile of pluginConfig.coreGateway?.virtualModelProfiles ?? []) {
      this.virtualModelProfiles.push(profile);
    }
    if (pluginConfig.coreGateway?.config) {
      this.requirePluginPermission(permissions, "core-gateway-config", "register configured core gateway config");
      this.coreGatewayConfig = {
        ...this.coreGatewayConfig,
        ...pluginConfig.coreGateway.config
      };
    }
  }

  private registerGatewayRoute(pluginId: string, route: GatewayPluginRouteRegistration): void {
    if (!route.path && !route.pathPrefix) {
      throw new Error(`Plugin ${pluginId} registered a gateway route without path or pathPrefix.`);
    }

    this.gatewayRoutes.push({
      auth: route.auth ?? "gateway",
      handler: route.handler,
      id: route.id || `${pluginId}:gateway:${this.gatewayRoutes.length + 1}`,
      methods: normalizeMethods(route),
      path: normalizeRoutePath(route.path),
      pathPrefix: normalizeRoutePath(route.pathPrefix),
      pluginId
    });
  }

  private registerProxyRoute(pluginId: string, route: GatewayPluginProxyRouteRegistration): void {
    const host = route.host.trim().toLowerCase();
    if (!host) {
      throw new Error(`Plugin ${pluginId} registered a proxy route without host.`);
    }

    this.proxyRoutes.push({
      ...route,
      host,
      id: route.id || `${pluginId}:proxy:${this.proxyRoutes.length + 1}`,
      paths: route.paths?.map(normalizeRoutePath).filter((path): path is string => Boolean(path)),
      pluginId
    });
  }

  private createPluginContext(pluginConfig: GatewayPluginConfig, permissions: PluginPermissionAccess): GatewayPluginContext {
    const pluginDataDir = path.join(DATADIR, "plugins", sanitizeFileSegment(pluginConfig.id));
    mkdirSync(pluginDataDir, { recursive: true });
    const logger = createPluginLogger(pluginConfig.id);
    const pluginPermissions = pluginPermissionList(permissions);

    return {
      config: this.config ?? ({} as AppConfig),
      logger,
      paths: {
        configDir: CONFIGDIR,
        dataDir: DATADIR,
        pluginDataDir
      },
      pluginConfig: pluginConfig.config,
      pluginId: pluginConfig.id,
      permissions: pluginPermissions,
      openSqliteStore: (options) => {
        this.requirePluginPermission(permissions, "sqlite-store", "open a SQLite store");
        return this.openSqliteStore(pluginConfig.id, pluginDataDir, options);
      },
      registerCoreGatewayProviderPlugin: (providerPlugin) => {
        this.requirePluginPermission(permissions, "core-provider-plugins", "register core provider plugins");
        this.coreProviderPlugins.push(providerPlugin);
      },
      registerCoreGatewayVirtualModelProfile: (profile) => {
        this.requirePluginPermission(permissions, "virtual-model-profiles", "register virtual model profiles");
        this.virtualModelProfiles.push(profile);
      },
      registerApp: (app) => {
        this.requirePluginPermission(permissions, "apps", "register browser apps");
        this.registerApp(pluginConfig.id, app);
      },
      registerGatewayRoute: (route) => {
        this.requirePluginPermission(permissions, "gateway-routes", "register gateway routes");
        this.registerGatewayRoute(pluginConfig.id, route);
      },
      registerHttpBackend: (backend) => {
        this.requirePluginPermission(permissions, "http-backends", "register HTTP backends");
        return this.registerHttpBackend(pluginConfig.id, pluginDataDir, logger, permissions, backend);
      },
      registerProviderAccountConnector: (connector) => {
        this.requirePluginPermission(permissions, "provider-account-connectors", "register provider account connectors");
        this.registerProviderAccountConnector(pluginConfig.id, connector);
      },
      registerProxyRoute: (route) => {
        this.requirePluginPermission(permissions, "proxy-routes", "register proxy routes");
        this.registerProxyRoute(pluginConfig.id, route);
      }
    };
  }

  private registerProviderAccountConnector(pluginId: string, connector: GatewayPluginProviderAccountConnector): void {
    const id = connector.id.trim();
    if (!id || typeof connector.resolve !== "function") {
      throw new Error(`Plugin ${pluginId} registered an invalid provider account connector.`);
    }
    this.providerAccountConnectors.set(providerAccountConnectorKey(pluginId, id), {
      ...connector,
      id
    });
  }

  private createRouteContext(pluginId: string): GatewayPluginRouteContext {
    const pluginConfig = this.config?.plugins.find((plugin) => plugin.id === pluginId);
    const permissions = pluginPermissionAccess(pluginConfig ?? { id: pluginId });
    const pluginPermissions = pluginPermissionList(permissions);
    const pluginDataDir = path.join(DATADIR, "plugins", sanitizeFileSegment(pluginId));
    const logger = createPluginLogger(pluginId);
    return {
      config: this.config ?? ({} as AppConfig),
      logger,
      paths: {
        configDir: CONFIGDIR,
        dataDir: DATADIR,
        pluginDataDir
      },
      permissions: pluginPermissions,
      pluginConfig: pluginConfig?.config,
      pluginId,
      openSqliteStore: (options) => {
        this.requirePluginPermission(permissions, "sqlite-store", "open a SQLite store");
        return this.openSqliteStore(pluginId, pluginDataDir, options);
      },
      readBody,
      readJson,
      sendJson
    };
  }

  private async registerHttpBackend(
    pluginId: string,
    pluginDataDir: string,
    logger: PluginLogger,
    permissions: PluginPermissionAccess,
    backend: GatewayPluginHttpBackendRegistration
  ): Promise<RegisteredHttpBackend> {
    const pluginPermissions = pluginPermissionList(permissions);
    return backendService.registerHttpBackend(pluginId, {
      host: backend.host,
      id: backend.id,
      port: backend.port,
      handler: (request, response) =>
        backend.handler(request, response, {
          config: this.config ?? ({} as AppConfig),
          logger,
          paths: {
            configDir: CONFIGDIR,
            dataDir: DATADIR,
            pluginDataDir
          },
          permissions: pluginPermissions,
          pluginConfig: this.config?.plugins.find((plugin) => plugin.id === pluginId)?.config,
          pluginId,
          openSqliteStore: (options) => {
            this.requirePluginPermission(permissions, "sqlite-store", "open a SQLite store");
            return this.openSqliteStore(pluginId, pluginDataDir, options);
          },
          readBody,
          readJson,
          sendJson
        })
    });
  }

  private async openSqliteStore(
    pluginId: string,
    pluginDataDir: string,
    options: PluginSqliteStoreOptions = {}
  ): Promise<PluginSqliteStore> {
    return backendService.openSqliteStore(pluginId, pluginDataDir, options);
  }

  private requirePluginPermission(
    access: PluginPermissionAccess,
    permission: GatewayPluginPermission,
    action: string
  ): void {
    if (!access.explicit) {
      throw new Error(`Plugin ${access.pluginId} must explicitly declare permissions to ${action}.`);
    }
    if (access.permissions.has(permission)) {
      return;
    }
    throw new Error(`Plugin ${access.pluginId} requires permission "${permission}" to ${action}.`);
  }
}

export const pluginService = new GatewayPluginService();

function pluginPermissionAccess(pluginConfig: Pick<GatewayPluginConfig, "id" | "permissions">): PluginPermissionAccess {
  return {
    explicit: pluginConfig.permissions !== undefined,
    permissions: new Set(pluginConfig.permissions ?? []),
    pluginId: pluginConfig.id
  };
}

function pluginPermissionList(access: PluginPermissionAccess): GatewayPluginPermission[] {
  return [...access.permissions];
}

async function loadPluginModule(modulePath: string): Promise<unknown> {
  const resolved = resolvePluginModule(modulePath);
  delete requireFromHere.cache[resolved];
  const cacheBust = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return import(`${pathToFileURL(resolved).href}?v=${cacheBust}`);
}

function resolvePluginModule(modulePath: string): string {
  const resolved = requireFromHere.resolve(resolveLocalModulePath(modulePath, "Plugin module"));
  assertJavaScriptModulePath(resolved, "Plugin module");
  return resolved;
}

function resolveLocalModulePath(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} path is required.`);
  }

  const expanded = expandHome(trimmed);
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  if (isProtocolSpecifier(expanded)) {
    throw new Error(`${label} must be a local JavaScript file path, not a URL or protocol specifier.`);
  }
  if (!expanded.startsWith(".")) {
    throw new Error(`${label} must be an explicit local JavaScript path. Package specifiers are not loaded from configuration.`);
  }

  const resolved = path.resolve(CONFIGDIR, expanded);
  if (!isPathInside(resolved, CONFIGDIR)) {
    throw new Error(`${label} relative paths must stay inside the CCR config directory.`);
  }
  return resolved;
}

function assertJavaScriptModulePath(resolved: string, label: string): void {
  const extension = path.extname(resolved).toLowerCase();
  if (![".cjs", ".js", ".mjs"].includes(extension)) {
    throw new Error(`${label} must resolve to a JavaScript module file.`);
  }
}

function isProtocolSpecifier(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

function isPathInside(file: string, root: string): boolean {
  const relative = path.relative(root, file);
  return relative === "" || (Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeLoadedPlugin(moduleValue: unknown): LoadedPlugin {
  const record = isRecord(moduleValue) ? moduleValue : {};
  const candidate = record.default ?? record.plugin ?? moduleValue;
  if (typeof candidate === "function") {
    return { setup: candidate as LoadedPlugin["setup"] };
  }
  if (isRecord(candidate)) {
    return candidate as LoadedPlugin;
  }
  throw new Error("Plugin module must export a function, default plugin, or plugin object.");
}

function matchProxyRoute(route: RegisteredProxyRoute, targetUrl: URL): string | undefined {
  if (!matchesHost(route.host, targetUrl.hostname)) {
    return undefined;
  }
  if (!route.paths?.length) {
    return "";
  }
  let matchedPathPrefix: string | undefined;
  for (const pathPrefix of route.paths) {
    const normalizedPathPrefix = normalizeRoutePath(pathPrefix) ?? "/";
    if (!matchesPathPrefix(normalizedPathPrefix, targetUrl.pathname)) {
      continue;
    }
    if (!matchedPathPrefix || normalizedPathPrefix.length > matchedPathPrefix.length) {
      matchedPathPrefix = normalizedPathPrefix;
    }
  }
  return matchedPathPrefix;
}

function buildPluginProxyUpstreamUrl(route: RegisteredProxyRoute, targetUrl: URL, matchedPathPrefix: string): URL {
  const upstreamValue = typeof route.upstream === "function" ? route.upstream() : route.upstream;
  const upstreamUrl = new URL(upstreamValue.toString());
  const basePath = upstreamUrl.pathname === "/" ? "" : upstreamUrl.pathname.replace(/\/+$/, "");
  let forwardedPath = targetUrl.pathname;
  const stripPrefix = resolveStripPathPrefix(route.stripPathPrefix, matchedPathPrefix);

  if (stripPrefix && matchesPathPrefix(stripPrefix, forwardedPath)) {
    forwardedPath = forwardedPath.slice(stripPrefix.length) || "/";
    if (!forwardedPath.startsWith("/")) {
      forwardedPath = `/${forwardedPath}`;
    }
  }
  if (route.rewritePathPrefix !== undefined) {
    const rewritePrefix = normalizeRoutePath(route.rewritePathPrefix) ?? "/";
    const suffix = matchedPathPrefix && matchesPathPrefix(matchedPathPrefix, targetUrl.pathname)
      ? targetUrl.pathname.slice(matchedPathPrefix.length)
      : targetUrl.pathname;
    forwardedPath = joinUrlPaths(rewritePrefix, suffix || "/");
  }

  upstreamUrl.pathname = joinUrlPaths(basePath, forwardedPath);
  upstreamUrl.search = targetUrl.search;
  return upstreamUrl;
}

function resolveStripPathPrefix(value: boolean | string | undefined, matchedPathPrefix: string): string | undefined {
  if (value === true) {
    return matchedPathPrefix || undefined;
  }
  if (typeof value === "string") {
    return normalizeRoutePath(value);
  }
  return undefined;
}

function normalizePluginApp(pluginId: string, app: GatewayPluginAppConfig, index: number): InstalledBrowserApp | undefined {
  const name = app.name?.trim();
  const url = normalizePluginAppUrl(app.url);
  if (!name || !url) {
    return undefined;
  }

  return {
    ...(app.description?.trim() ? { description: app.description.trim() } : {}),
    ...(app.icon?.trim() ? { icon: app.icon.trim() } : {}),
    id: app.id?.trim() || sanitizeFileSegment(`${name}-${url}`) || `app-${index}`,
    name,
    pluginId,
    url
  };
}

function normalizePluginAppUrl(value: string | undefined): string {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return new URL(trimmed).toString();
  }
  if (trimmed.startsWith("//")) {
    throw new Error("Plugin app URL cannot be protocol-relative.");
  }
  if (isProtocolSpecifier(trimmed)) {
    throw new Error("Plugin app URL must be an http(s) URL or a CCR gateway path.");
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeMethods(route: GatewayPluginRouteRegistration): string[] | undefined {
  const methods = [...(route.methods ?? []), ...(route.method ? [route.method] : [])]
    .map((method) => method.trim().toUpperCase())
    .filter(Boolean);
  return methods.length ? [...new Set(methods)] : undefined;
}

function normalizeRoutePath(value: string | undefined): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
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

function matchesPathPrefix(prefix: string, requestPath: string): boolean {
  const normalizedPrefix = normalizeRoutePath(prefix) ?? "/";
  const normalizedPath = normalizeRoutePath(requestPath) ?? "/";
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix.replace(/\/+$/, "")}/`);
}

function joinUrlPaths(prefix: string, suffix: string): string {
  const normalizedPrefix = prefix === "/" ? "" : prefix.replace(/\/+$/, "");
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${normalizedPrefix}${normalizedSuffix}` || "/";
}

function createPluginLogger(pluginId: string): PluginLogger {
  const prefix = `[plugin:${pluginId}]`;
  return {
    debug: (...args) => console.debug(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args)
  };
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(`${JSON.stringify(body)}\n`);
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return readBody(request).then((body) => JSON.parse(body.toString("utf8") || "{}") as unknown);
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.once("end", () => resolve(Buffer.concat(chunks)));
    request.once("error", reject);
  });
}

function expandHome(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "plugin";
}

function providerAccountConnectorKey(pluginId: string, connectorId: string): string {
  return `${pluginId.trim()}:${connectorId.trim()}`;
}

function enabledPluginIds(config: AppConfig): Set<string> {
  return new Set((config.plugins ?? [])
    .filter((plugin) => plugin.enabled !== false)
    .map((plugin) => plugin.id));
}

function stopReasonForPlugin(pluginId: string, nextEnabledPluginIds: Set<string> | undefined): GatewayPluginStopReason {
  if (!nextEnabledPluginIds) {
    return "stop";
  }
  return nextEnabledPluginIds.has(pluginId) ? "reload" : "disabled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
