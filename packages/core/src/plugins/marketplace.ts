import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATADIR } from "@ccr/core/config/constants";
import { GATEWAY_PLUGIN_PERMISSION_IDS, type GatewayPluginAppConfig, type GatewayPluginPermission, type PluginDependency, type PluginMarketplaceEntry } from "@ccr/core/contracts/app";
import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";

type MarketplaceCache = {
  entries: PluginMarketplaceEntry[];
  expiresAt: number;
  url: string;
};

const defaultMarketplaceUrl = "https://raw.githubusercontent.com/musistudio/claude-code-router/main/marketplace/plugins.json";
const marketplaceCacheDir = path.join(DATADIR, "plugin-marketplace");
const marketplaceModuleCacheDir = path.join(marketplaceCacheDir, "modules");
const marketplaceManifestCacheFile = path.join(marketplaceCacheDir, "plugins.json");
const marketplaceFetchTimeoutMs = 10_000;
const marketplaceCacheTtlMs = 5 * 60 * 1000;
const maxMarketplaceManifestBytes = 1024 * 1024;
const maxMarketplaceModuleBytes = 8 * 1024 * 1024;
const gatewayPluginPermissionIdSet = new Set<string>(GATEWAY_PLUGIN_PERMISSION_IDS);

let marketplaceCache: MarketplaceCache | undefined;
let marketplaceRequest: Promise<PluginMarketplaceEntry[]> | undefined;

export async function getPluginMarketplace(): Promise<PluginMarketplaceEntry[]> {
  const url = marketplaceUrl();
  const now = Date.now();
  if (marketplaceCache && marketplaceCache.url === url && marketplaceCache.expiresAt > now) {
    return marketplaceCache.entries.map(cloneMarketplaceEntry);
  }

  if (!marketplaceRequest) {
    marketplaceRequest = fetchPluginMarketplace(url)
      .then((entries) => {
        marketplaceCache = {
          entries,
          expiresAt: Date.now() + marketplaceCacheTtlMs,
          url
        };
        return entries;
      })
      .finally(() => {
        marketplaceRequest = undefined;
      });
  }

  const entries = await marketplaceRequest;
  return entries.map(cloneMarketplaceEntry);
}

function marketplaceUrl(): string {
  return process.env.CCR_PLUGIN_MARKETPLACE_URL?.trim() || defaultMarketplaceUrl;
}

async function fetchPluginMarketplace(url: string): Promise<PluginMarketplaceEntry[]> {
  try {
    const source = await fetchText(url, maxMarketplaceManifestBytes);
    ensureMarketplaceCacheDir();
    writeFileSync(marketplaceManifestCacheFile, source, "utf8");
    return normalizeMarketplaceManifest(JSON.parse(source) as unknown, url);
  } catch (error) {
    console.warn(`[plugin-marketplace] Failed to fetch marketplace from ${url}: ${formatError(error)}`);
    return readCachedMarketplace(url);
  }
}

async function readCachedMarketplace(url: string): Promise<PluginMarketplaceEntry[]> {
  if (!existsSync(marketplaceManifestCacheFile)) {
    return [];
  }

  try {
    const source = readFileSync(marketplaceManifestCacheFile, "utf8");
    return normalizeMarketplaceManifest(JSON.parse(source) as unknown, url, { offline: true });
  } catch (error) {
    console.warn(`[plugin-marketplace] Failed to read cached marketplace: ${formatError(error)}`);
    return [];
  }
}

async function normalizeMarketplaceManifest(
  value: unknown,
  manifestUrl: string,
  options: { offline?: boolean } = {}
): Promise<PluginMarketplaceEntry[]> {
  const items = marketplaceItems(value);
  const entries: PluginMarketplaceEntry[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    let entry: PluginMarketplaceEntry | undefined;
    try {
      entry = await normalizeMarketplaceEntry(item, manifestUrl, options);
    } catch (error) {
      console.warn(`[plugin-marketplace] Failed to load marketplace entry: ${formatError(error)}`);
      continue;
    }
    if (!entry || seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    entries.push(entry);
  }

  return entries;
}

function marketplaceItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return [];
  }
  for (const key of ["plugins", "entries", "marketplace"]) {
    const items = value[key];
    if (Array.isArray(items)) {
      return items;
    }
  }
  return [];
}

async function normalizeMarketplaceEntry(
  value: unknown,
  manifestUrl: string,
  options: { offline?: boolean }
): Promise<PluginMarketplaceEntry | undefined> {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = pluginIdValue(readString(value.id) || readString(value.key));
  const name = readString(value.name) || readString(value.title) || id;
  const description = readString(value.description) || "";
  const moduleValue = readString(value.moduleUrl) || readString(value.module) || readString(value.modulePath) || readString(value.path);
  if (!id || !name || !moduleValue) {
    return undefined;
  }

  const moduleUrl = resolveRemoteMarketplaceUrl(moduleValue, manifestUrl);
  const modulePath = await cachedMarketplaceModulePath(id, moduleUrl, options);
  if (!modulePath) {
    return undefined;
  }

  return {
    apps: parsePluginApps(value.apps),
    capabilities: readStringArray(value.capabilities),
    dependencies: await parsePluginDependencies(value.dependencies ?? value.pluginDependencies, manifestUrl, options),
    description,
    id,
    modulePath,
    name,
    permissions: parsePluginPermissions(value.permissions)
  };
}

async function parsePluginDependencies(
  value: unknown,
  manifestUrl: string,
  options: { offline?: boolean }
): Promise<PluginDependency[]> {
  const rawItems = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.entries(value).map(([id, item]) => isRecord(item) ? { id, ...item } : { id, module: item })
      : [];
  const dependencies: PluginDependency[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    const dependency = await parsePluginDependency(item, manifestUrl, options);
    if (!dependency || seen.has(dependency.id)) {
      continue;
    }
    seen.add(dependency.id);
    dependencies.push(dependency);
  }

  return dependencies;
}

async function parsePluginDependency(
  value: unknown,
  manifestUrl: string,
  options: { offline?: boolean }
): Promise<PluginDependency | undefined> {
  if (typeof value === "string") {
    const id = pluginIdValue(value);
    return id ? { id } : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const id = pluginIdValue(readString(value.id) || readString(value.key) || readString(value.name));
  if (!id) {
    return undefined;
  }

  const moduleValue = readString(value.moduleUrl) || readString(value.module) || readString(value.modulePath) || readString(value.path);
  const modulePath = moduleValue
    ? await cachedMarketplaceModulePath(id, resolveRemoteMarketplaceUrl(moduleValue, manifestUrl), options)
    : undefined;
  const name = readString(value.name);
  return {
    id,
    ...(modulePath ? { modulePath } : {}),
    ...(name ? { name } : {}),
    permissions: parsePluginPermissions(value.permissions)
  };
}

async function cachedMarketplaceModulePath(
  id: string,
  moduleUrl: string,
  options: { offline?: boolean }
): Promise<string | undefined> {
  const url = new URL(moduleUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Marketplace module must be an HTTP(S) URL: ${moduleUrl}`);
  }

  const extension = path.extname(url.pathname).toLowerCase();
  if (![".cjs", ".js", ".mjs"].includes(extension)) {
    throw new Error(`Marketplace module must be a JavaScript file: ${moduleUrl}`);
  }

  const file = path.join(marketplaceModuleCacheDir, `${sanitizeFileSegment(id)}-${hashString(moduleUrl)}${extension}`);
  if (existsSync(file)) {
    return file;
  }
  if (options.offline) {
    console.warn(`[plugin-marketplace] Cached module is missing while offline: ${moduleUrl}`);
    return undefined;
  }

  const source = await fetchText(moduleUrl, maxMarketplaceModuleBytes);
  ensureMarketplaceCacheDir();
  writeFileSync(file, source, "utf8");
  return file;
}

async function fetchText(url: string, maxBytes: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), marketplaceFetchTimeoutMs);
  try {
    const response = await fetchWithSystemProxy(url, {
      cache: "no-store",
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "ClaudeCodeRouter Plugin Marketplace"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`Response is too large: ${contentLength} bytes`);
    }

    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error(`Response is too large: ${Buffer.byteLength(text, "utf8")} bytes`);
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveRemoteMarketplaceUrl(value: string, manifestUrl: string): string {
  try {
    return new URL(value).toString();
  } catch {
    return new URL(value, manifestUrl).toString();
  }
}

function parsePluginApps(value: unknown): GatewayPluginAppConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const apps = value.map(parsePluginApp).filter((item): item is GatewayPluginAppConfig => Boolean(item));
  return apps.length ? apps : undefined;
}

function parsePluginApp(value: unknown): GatewayPluginAppConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = readString(value.name) || readString(value.title);
  const url = readString(value.url) || readString(value.href) || readString(value.target);
  if (!name || !url) {
    return undefined;
  }

  const description = readString(value.description);
  const icon = readString(value.icon);
  const id = pluginIdValue(readString(value.id) || name);
  return {
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    ...(id ? { id } : {}),
    name,
    url
  };
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(readString).filter((item): item is string => Boolean(item))
    : [];
}

function parsePluginPermissions(value: unknown): GatewayPluginPermission[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const permissions: GatewayPluginPermission[] = [];
  const seen = new Set<GatewayPluginPermission>();
  const add = (rawValue: unknown): void => {
    const permission = normalizePluginPermission(rawValue);
    if (!permission || seen.has(permission)) {
      return;
    }
    seen.add(permission);
    permissions.push(permission);
  };

  if (typeof value === "string") {
    add(value);
  } else if (Array.isArray(value)) {
    value.forEach(add);
  } else if (isRecord(value)) {
    for (const [key, enabled] of Object.entries(value)) {
      if (enabled === false) {
        continue;
      }
      if (isAllPluginPermissionsKey(key)) {
        GATEWAY_PLUGIN_PERMISSION_IDS.forEach(add);
      } else {
        add(key);
      }
    }
  }

  return permissions;
}

function normalizePluginPermission(value: unknown): GatewayPluginPermission | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const mapped = pluginPermissionAlias(normalized);
  return gatewayPluginPermissionIdSet.has(mapped) ? mapped as GatewayPluginPermission : undefined;
}

function pluginPermissionAlias(value: string): string {
  switch (value) {
    case "app":
    case "browser-app":
    case "browser-apps":
      return "apps";
    case "gateway-route":
    case "route":
    case "routes":
      return "gateway-routes";
    case "proxy":
    case "proxy-route":
      return "proxy-routes";
    case "backend":
    case "backends":
    case "http-backend":
      return "http-backends";
    case "provider-account":
    case "provider-account-connector":
      return "provider-account-connectors";
    case "core-gateway":
      return "core-gateway-config";
    case "provider-plugin":
    case "provider-plugins":
    case "core-provider-plugin":
      return "core-provider-plugins";
    case "fusion-profile":
    case "fusion-profiles":
    case "virtual-model":
    case "virtual-models":
    case "virtual-model-profile":
      return "virtual-model-profiles";
    case "sqlite":
    case "data-store":
    case "store":
      return "sqlite-store";
    case "launcher":
    case "mac-launcher":
      return "system-launcher";
    default:
      return value;
  }
}

function isAllPluginPermissionsKey(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "*" || normalized === "all";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pluginIdValue(value: string | undefined): string {
  return value?.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "";
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "plugin";
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function cloneMarketplaceEntry(entry: PluginMarketplaceEntry): PluginMarketplaceEntry {
  return {
    ...entry,
    apps: entry.apps?.map((app) => ({ ...app })),
    capabilities: [...entry.capabilities],
    dependencies: entry.dependencies.map((dependency) => ({
      ...dependency,
      permissions: dependency.permissions ? [...dependency.permissions] : undefined
    })),
    permissions: entry.permissions ? [...entry.permissions] : undefined
  };
}

function ensureMarketplaceCacheDir(): void {
  mkdirSync(marketplaceModuleCacheDir, { recursive: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
