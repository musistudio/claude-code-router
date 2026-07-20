import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  GatewayProviderProtocol,
  LocalAgentProviderCandidate,
  LocalAgentProviderImportResult,
  ProviderAccountConfig,
  ProviderModelMetadata
} from "@ccr/core/contracts/app";
import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";
import { findProviderPresetByBaseUrl } from "@ccr/core/providers/presets/index";
import {
  bearerAuthPlugin,
  cloneProviderAccountConfig,
  missingCandidate,
  modelDisplayNamesForModels,
  modelMetadataForModels,
  providerInternalNamePlaceholder,
  providerPayload,
  readJsonRecord,
  readString,
  uniqueProviderName,
  uniqueStrings
} from "@ccr/core/agents/local-providers/shared";

const kimiDefaultBaseUrl = "https://api.kimi.com/coding/v1";
const kimiPlatformBaseUrl = "https://api.moonshot.ai/v1";
const kimiOauthHost = "https://auth.kimi.com";
const kimiOauthClientId = "17e5f671-d194-4dfb-9706-5516cb48c098";
const kimiDefaultModels = ["kimi-for-coding"];
const kimiOauthRefreshTimeoutMs = 30_000;
const kimiRefreshInFlight = new Map<string, Promise<KimiTokenSet>>();

type KimiTomlSection = {
  path: string[];
  values: Record<string, unknown>;
};

type KimiConfiguredProvider = {
  apiKey?: string;
  baseUrl: string;
  candidateId: string;
  modelDisplayNames?: Record<string, string>;
  modelMetadata?: Record<string, ProviderModelMetadata>;
  models: string[];
  name: string;
  oauthHost?: string;
  oauthKey?: string;
  protocol: GatewayProviderProtocol;
  providerId: string;
  sourceFile: string;
};

export type KimiTokenSet = {
  accessToken?: string;
  expiresAt?: number;
  expiresIn?: number;
  oauthHost?: string;
  refreshToken?: string;
  scope?: string;
  sourceFile: string;
  tokenType?: string;
};

export type KimiOauthReference = {
  key?: string;
  oauthHost?: string;
};

export function kimiCandidates(): LocalAgentProviderCandidate[] {
  const configuredProviders = readKimiConfiguredProviders();
  if (configuredProviders.length === 0) {
    return [missingCandidate("kimi", "kimi-cli", "Kimi CLI", "openai_chat_completions", kimiDefaultModels)];
  }
  return configuredProviders.map((configured) => kimiCandidate(configured));
}

function kimiCandidate(configured: KimiConfiguredProvider): LocalAgentProviderCandidate {
  const usesOauth = Boolean(configured.oauthKey && !configured.apiKey);
  const auth = usesOauth ? readKimiAuth(kimiOauthReference(configured)) : undefined;
  const hasApiKey = Boolean(configured.apiKey);
  const hasUsableAccessToken = Boolean(auth?.accessToken && !kimiAccessTokenExpired(auth));
  const canRefresh = Boolean(auth?.refreshToken);
  if (hasApiKey || hasUsableAccessToken || canRefresh) {
    return {
      detail: usesOauth
        ? "Kimi CLI login detected. Click Import to add it as a gateway provider."
        : "Kimi CLI provider API key detected. Click Import to add it as a gateway provider.",
      id: configured.candidateId,
      importable: true,
      kind: "kimi",
      modelDisplayNames: configured.modelDisplayNames,
      modelMetadata: configured.modelMetadata,
      models: configured.models,
      name: configured.name,
      protocol: configured.protocol,
      sourceFile: auth?.sourceFile ?? configured.sourceFile,
      status: "available"
    };
  }
  return {
    detail: usesOauth
      ? "Kimi CLI login was detected, but no usable OAuth token was found. Run /login in Kimi CLI, then rescan."
      : "Kimi CLI provider was detected, but no usable API key was found.",
    id: configured.candidateId,
    importable: false,
    kind: "kimi",
    modelDisplayNames: configured.modelDisplayNames,
    modelMetadata: configured.modelMetadata,
    models: configured.models,
    name: configured.name,
    protocol: configured.protocol,
    sourceFile: auth?.sourceFile ?? configured.sourceFile,
    status: "locked"
  };
}

export async function importKimiProvider(
  candidate: LocalAgentProviderCandidate,
  providerNames: string[]
): Promise<LocalAgentProviderImportResult> {
  const configured = readKimiConfiguredProviders().find((item) => item.candidateId === candidate.id);
  if (!configured) {
    throw new Error("Kimi CLI provider configuration was not found.");
  }
  const usesOauth = Boolean(configured.oauthKey && !configured.apiKey);
  const oauthReference = kimiOauthReference(configured);
  const auth = usesOauth ? await resolveKimiAuth(oauthReference) : undefined;
  const token = configured.apiKey || auth?.accessToken;
  if (!token || (auth && kimiAccessTokenExpired(auth))) {
    throw new Error("Kimi CLI credential was not found or is expired.");
  }
  const nextCandidate: LocalAgentProviderCandidate = {
    ...candidate,
    modelDisplayNames: configured.modelDisplayNames,
    modelMetadata: configured.modelMetadata,
    models: configured.models,
    protocol: configured.protocol
  };
  const provider = providerPayload(
    nextCandidate,
    uniqueProviderName(providerNames, configured.name),
    configured.baseUrl,
    kimiProviderAccountConfig(configured.baseUrl)
  );
  const authSuffix = usesOauth ? "kimi-cli-oauth" : "kimi-cli-api-key";
  return {
    candidate: nextCandidate,
    provider,
    providerPlugins: [
      kimiAuthPlugin(authSuffix, token, undefined, usesOauth ? oauthReference : undefined),
      kimiAuthPlugin(`${authSuffix}-internal`, token, providerInternalNamePlaceholder, usesOauth ? oauthReference : undefined)
    ]
  };
}

export function readKimiAuth(reference?: KimiOauthReference): KimiTokenSet | undefined {
  const provider = findKimiOauthProvider(reference);
  const oauthKey = reference?.key?.trim() || provider?.oauthKey;
  if (!oauthKey) {
    return undefined;
  }
  const sourceFile = kimiCredentialFile(oauthKey);
  const record = readJsonRecord(sourceFile);
  if (!record) {
    return undefined;
  }
  const expiresAt = numberValue(record.expires_at) ?? numberValue(record.expiresAt);
  return {
    accessToken: readString(record.access_token) || readString(record.accessToken),
    expiresAt,
    expiresIn: numberValue(record.expires_in) ?? numberValue(record.expiresIn),
    oauthHost: reference?.oauthHost?.trim() || provider?.oauthHost,
    refreshToken: readString(record.refresh_token) || readString(record.refreshToken),
    scope: readString(record.scope),
    sourceFile,
    tokenType: readString(record.token_type) || readString(record.tokenType)
  };
}

export async function resolveKimiAuth(reference?: KimiOauthReference): Promise<KimiTokenSet | undefined> {
  const auth = readKimiAuth(reference);
  if (!auth?.refreshToken || (auth.accessToken && !kimiAccessTokenExpired(auth))) {
    return auth;
  }
  const key = auth.sourceFile;
  let refresh = kimiRefreshInFlight.get(key);
  if (!refresh) {
    refresh = refreshKimiAuth(auth).finally(() => {
      kimiRefreshInFlight.delete(key);
    });
    kimiRefreshInFlight.set(key, refresh);
  }
  return refresh;
}

export function kimiAccessTokenExpired(auth: KimiTokenSet): boolean {
  return auth.expiresAt !== undefined && auth.expiresAt * 1000 <= Date.now() + 60_000;
}

export function kimiIdentityHeaders(): Record<string, string> {
  const version = kimiCliVersion();
  const headers: Record<string, string> = {
    "User-Agent": `kimi-code-cli/${version}`,
    "X-Msh-Device-Model": kimiDeviceModel(),
    "X-Msh-Device-Name": asciiHeader(os.hostname()),
    "X-Msh-Os-Version": asciiHeader(os.release()),
    "X-Msh-Platform": "kimi_code_cli",
    "X-Msh-Version": version
  };
  headers["X-Msh-Device-Id"] = readOrCreateKimiDeviceId();
  return headers;
}

function readKimiConfiguredProviders(): KimiConfiguredProvider[] {
  const sourceFile = kimiConfigFile();
  if (!existsSync(sourceFile)) {
    return [];
  }
  let content: string;
  try {
    content = readFileSync(sourceFile, "utf8");
  } catch {
    return [];
  }
  const sections = parseKimiTomlSections(content);
  const providerSections = sections.filter((section) => section.path[0] === "providers" && section.path.length === 2);
  const modelSections = sections.filter((section) => section.path[0] === "models" && section.path.length === 2);
  const defaultModel = stringValue(rootTomlValues(content).default_model);

  return providerSections.flatMap((section) => {
    const providerId = section.path[1] || "kimi";
    const type = stringValue(section.values.type);
    if (type !== "kimi") {
      return [];
    }
    const env = {
      ...recordValue(section.values.env),
      ...(findTomlSection(sections, ["providers", providerId, "env"])?.values ?? {})
    };
    const oauth = {
      ...recordValue(section.values.oauth),
      ...(findTomlSection(sections, ["providers", providerId, "oauth"])?.values ?? {})
    };
    const apiKey = stringValue(section.values.api_key) || stringValue(env.KIMI_API_KEY);
    const oauthKey = stringValue(oauth.key);
    const oauthHost = process.env.KIMI_CODE_OAUTH_HOST?.trim() || process.env.KIMI_OAUTH_HOST?.trim() || stringValue(oauth.oauth_host);
    const usesOauth = Boolean(oauthKey && !apiKey);
    const configuredBaseUrl = stringValue(section.values.base_url) ||
      stringValue(env.KIMI_BASE_URL) ||
      (usesOauth ? kimiDefaultBaseUrl : kimiPlatformBaseUrl);
    const baseUrl = (
      usesOauth ? process.env.KIMI_CODE_BASE_URL?.trim() || configuredBaseUrl : configuredBaseUrl
    ).replace(/\/+$/, "");
    const catalog = kimiModelsForProvider(modelSections, providerId, defaultModel);
    const models = catalog.models.length > 0 ? catalog.models : kimiDefaultModels;
    return [{
      apiKey,
      baseUrl,
      candidateId: `kimi-cli-${sanitizeId(providerId) || "kimi"}`,
      modelDisplayNames: modelDisplayNamesForModels(catalog.modelDisplayNames, models),
      modelMetadata: modelMetadataForModels(catalog.modelMetadata, models),
      models,
      name: usesOauth ? "Kimi CLI OAuth" : providerId === "kimi" ? "Kimi CLI API" : `Kimi CLI · ${providerId}`,
      oauthHost,
      oauthKey,
      protocol: "openai_chat_completions" as const,
      providerId,
      sourceFile
    }];
  });
}

function kimiModelsForProvider(
  sections: KimiTomlSection[],
  providerId: string,
  defaultModelAlias?: string
): {
  modelDisplayNames: Record<string, string>;
  modelMetadata: Record<string, ProviderModelMetadata>;
  models: string[];
} {
  const models: string[] = [];
  const modelDisplayNames: Record<string, string> = {};
  const modelMetadata: Record<string, ProviderModelMetadata> = {};
  const ordered = [...sections].sort((left, right) => {
    const leftDefault = left.path[1] === defaultModelAlias ? 0 : 1;
    const rightDefault = right.path[1] === defaultModelAlias ? 0 : 1;
    return leftDefault - rightDefault;
  });
  for (const section of ordered) {
    if (stringValue(section.values.provider) !== providerId) {
      continue;
    }
    const model = stringValue(section.values.model) || section.path[1];
    if (!model) {
      continue;
    }
    models.push(model);
    const displayName = stringValue(section.values.display_name);
    if (displayName && displayName !== model) {
      modelDisplayNames[model] = displayName;
    }
    const contextWindow = numberValue(section.values.max_context_size);
    const defaultReasoningLevel = stringValue(section.values.default_effort);
    const supportedEfforts = stringArrayValue(section.values.support_efforts);
    if (contextWindow || defaultReasoningLevel || supportedEfforts.length > 0) {
      modelMetadata[model] = {
        ...(contextWindow ? { contextWindow, maxContextWindow: contextWindow } : {}),
        ...(defaultReasoningLevel ? { defaultReasoningLevel } : {}),
        ...(supportedEfforts.length > 0
          ? { supportedReasoningLevels: supportedEfforts.map((effort) => ({ description: effort, effort })) }
          : {})
      };
    }
  }
  return {
    modelDisplayNames,
    modelMetadata,
    models: uniqueStrings(models)
  };
}

function kimiProviderAccountConfig(baseUrl: string): ProviderAccountConfig | undefined {
  return cloneProviderAccountConfig(findProviderPresetByBaseUrl(baseUrl)?.account);
}

function kimiAuthPlugin(
  suffix: string,
  token: string,
  providerName?: string,
  oauthReference?: KimiOauthReference
): Record<string, unknown> {
  return {
    ...bearerAuthPlugin(suffix, token, {}, providerName),
    ...(oauthReference ? { kimiOauth: oauthReference } : {}),
    request: {
      headers: kimiIdentityHeaders(),
      strict: true
    }
  };
}

function kimiOauthReference(configured: KimiConfiguredProvider): KimiOauthReference {
  return {
    key: configured.oauthKey,
    ...(configured.oauthHost ? { oauthHost: configured.oauthHost } : {})
  };
}

function findKimiOauthProvider(reference?: KimiOauthReference): KimiConfiguredProvider | undefined {
  const configured = readKimiConfiguredProviders().filter((item) => Boolean(item.oauthKey && !item.apiKey));
  const key = reference?.key?.trim();
  if (!key) return configured[0];
  const oauthHost = reference?.oauthHost?.trim().replace(/\/+$/, "");
  return configured.find((item) =>
    item.oauthKey === key && (!oauthHost || item.oauthHost?.replace(/\/+$/, "") === oauthHost)
  ) ?? configured.find((item) => item.oauthKey === key);
}

async function refreshKimiAuth(auth: KimiTokenSet): Promise<KimiTokenSet> {
  if (!auth.refreshToken) {
    throw new Error("Kimi CLI refresh token was not found.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), kimiOauthRefreshTimeoutMs);
  const oauthHost = (auth.oauthHost || kimiOauthHost).replace(/\/+$/, "");
  try {
    const response = await fetchWithSystemProxy(`${oauthHost}/api/oauth/token`, {
      body: new URLSearchParams({
        client_id: kimiOauthClientId,
        grant_type: "refresh_token",
        refresh_token: auth.refreshToken
      }).toString(),
      headers: {
        ...withoutHeader(kimiIdentityHeaders(), "user-agent"),
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      method: "POST",
      signal: controller.signal
    });
    const text = await response.text();
    const payload = parseJsonRecord(text);
    if (!response.ok) {
      throw new Error(`Kimi CLI OAuth token refresh returned HTTP ${response.status}${tokenRefreshErrorMessage(payload, text)}`);
    }
    const accessToken = readString(payload?.access_token) || readString(payload?.accessToken);
    const refreshToken = readString(payload?.refresh_token) || readString(payload?.refreshToken);
    const expiresIn = numberValue(payload?.expires_in) ?? numberValue(payload?.expiresIn);
    if (!accessToken || !refreshToken || !expiresIn) {
      throw new Error("Kimi CLI OAuth token refresh returned an incomplete token response.");
    }
    const refreshed: KimiTokenSet = {
      ...auth,
      accessToken,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      expiresIn,
      refreshToken,
      scope: readString(payload?.scope) || auth.scope || "",
      tokenType: readString(payload?.token_type) || readString(payload?.tokenType) || "Bearer"
    };
    persistKimiAuth(refreshed);
    return refreshed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Kimi CLI OAuth token refresh timed out after ${kimiOauthRefreshTimeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function persistKimiAuth(auth: KimiTokenSet): void {
  if (!auth.accessToken || !auth.refreshToken) {
    return;
  }
  const payload = {
    access_token: auth.accessToken,
    refresh_token: auth.refreshToken,
    expires_at: auth.expiresAt ?? 0,
    scope: auth.scope ?? "",
    token_type: auth.tokenType ?? "Bearer",
    expires_in: auth.expiresIn ?? 0
  };
  const temporaryFile = `${auth.sourceFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryFile, auth.sourceFile);
    chmodSync(auth.sourceFile, 0o600);
  } catch {
    try {
      rmSync(temporaryFile, { force: true });
    } catch {
      // Ignore temporary-file cleanup failures.
    }
    // Best effort. The refreshed access token is still usable for this CCR run.
  }
}

function parseKimiTomlSections(content: string): KimiTomlSection[] {
  const sections: KimiTomlSection[] = [];
  let current: KimiTomlSection | undefined;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) {
      continue;
    }
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch?.[1]) {
      current = { path: parseTomlPath(sectionMatch[1]), values: {} };
      sections.push(current);
      continue;
    }
    if (!current) {
      continue;
    }
    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (assignment?.[1] && assignment[2] !== undefined) {
      current.values[assignment[1]] = parseTomlValue(assignment[2].trim());
    }
  }
  return sections;
}

function rootTomlValues(content: string): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    if (line.startsWith("[")) break;
    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (assignment?.[1] && assignment[2] !== undefined) {
      values[assignment[1]] = parseTomlValue(assignment[2].trim());
    }
  }
  return values;
}

function parseTomlPath(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (quote && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      if (!quote) quote = character;
      else if (quote === character) quote = "";
      else current += character;
      continue;
    }
    if (character === "." && !quote) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseTomlValue(value: string): unknown {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const inner = value.slice(1, -1);
    return value.startsWith('"')
      ? inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
      : inner;
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return splitTomlArray(value.slice(1, -1)).map((item) => parseTomlValue(item.trim()));
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    return Object.fromEntries(splitTomlArray(value.slice(1, -1)).flatMap((item) => {
      const assignment = item.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
      return assignment?.[1] && assignment[2] !== undefined
        ? [[assignment[1], parseTomlValue(assignment[2].trim())]]
        : [];
    }));
  }
  if (value === "true") return true;
  if (value === "false") return false;
  const numeric = Number(value.replaceAll("_", ""));
  return Number.isFinite(numeric) ? numeric : value;
}

function splitTomlArray(value: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote = "";
  let escaped = false;
  let nesting = 0;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (quote && character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? "" : quote || character;
      current += character;
      continue;
    }
    if (!quote && (character === "[" || character === "{")) {
      nesting += 1;
    } else if (!quote && (character === "]" || character === "}")) {
      nesting = Math.max(0, nesting - 1);
    }
    if (character === "," && !quote && nesting === 0) {
      if (current.trim()) items.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function stripTomlComment(value: string): string {
  let quote = "";
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? "" : quote || character;
      continue;
    }
    if (character === "#" && !quote) {
      return value.slice(0, index);
    }
  }
  return value;
}

function findTomlSection(sections: KimiTomlSection[], pathValue: string[]): KimiTomlSection | undefined {
  return sections.find((section) => section.path.length === pathValue.length && section.path.every((part, index) => part === pathValue[index]));
}

function kimiConfigFile(): string {
  return path.join(kimiStorageRoot(), "config.toml");
}

function kimiCredentialFile(oauthKey: string): string {
  const storageName = oauthKey === "kimi-code" || oauthKey === "oauth/kimi-code"
    ? "kimi-code"
    : oauthKey.startsWith("oauth/")
      ? oauthKey.slice("oauth/".length)
      : oauthKey;
  if (!storageName || storageName.includes("/") || storageName.startsWith(".")) {
    return path.join(kimiStorageRoot(), "credentials", "kimi-code.json");
  }
  return path.join(kimiStorageRoot(), "credentials", `${storageName}.json`);
}

function kimiStorageRoot(): string {
  const explicit = process.env.KIMI_CODE_HOME?.trim();
  if (explicit) {
    return resolveUserPath(explicit);
  }
  const internalHome = process.env.CCR_INTERNAL_HOME_DIR?.trim();
  return internalHome ? path.join(internalHome, ".kimi-code") : path.join(os.homedir(), ".kimi-code");
}

function kimiCliVersion(): string {
  const explicit = process.env.KIMI_CODE_VERSION?.trim();
  if (explicit) return asciiHeader(explicit, "unknown");
  for (const command of kimiCliCandidates()) {
    try {
      const value = execFileSync(command, ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2_000
      }).trim();
      if (value) return asciiHeader(value, "unknown");
    } catch {
      continue;
    }
  }
  return "unknown";
}

function kimiCliCandidates(): string[] {
  const explicit = process.env.CCR_KIMI_BIN?.trim() || process.env.KIMI_BIN?.trim();
  return uniqueStrings([
    explicit,
    path.join(kimiStorageRoot(), "bin", process.platform === "win32" ? "kimi.exe" : "kimi"),
    "kimi"
  ]);
}

function readOrCreateKimiDeviceId(): string {
  try {
    const existing = readFileSync(path.join(kimiStorageRoot(), "device_id"), "utf8").trim();
    if (existing) return existing;
  } catch {
    // Create the stable identifier below.
  }
  const deviceId = randomUUID();
  try {
    mkdirSync(kimiStorageRoot(), { mode: 0o700, recursive: true });
    writeFileSync(path.join(kimiStorageRoot(), "device_id"), deviceId, { encoding: "utf8", mode: 0o600 });
  } catch {
    // The in-memory identifier is still valid for this request.
  }
  return deviceId;
}

function kimiDeviceModel(): string {
  if (process.platform === "darwin") {
    try {
      const version = execFileSync("/usr/bin/sw_vers", ["-productVersion"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 1_000
      }).trim();
      return asciiHeader(`macOS ${version || os.release()} ${os.arch()}`);
    } catch {
      // Fall through to the generic platform descriptor.
    }
  }
  if (process.platform === "win32") {
    return asciiHeader(`Windows ${os.release()} ${os.arch()}`);
  }
  return asciiHeader(`${os.type()} ${os.release()} ${os.arch()}`);
}

function asciiHeader(value: string, fallback = "unknown"): string {
  const cleaned = value.replace(/[^\x20-\x7e]/g, "").trim();
  return cleaned || fallback;
}

function withoutHeader(headers: Record<string, string>, header: string): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([key]) => key.toLowerCase() !== header.toLowerCase()));
}

function sanitizeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function resolveUserPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) return path.join(os.homedir(), trimmed.slice(2));
  return path.resolve(trimmed);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter((item): item is string => Boolean(item)) : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseJsonRecord(text: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function tokenRefreshErrorMessage(payload: Record<string, unknown> | undefined, text: string): string {
  const message = readString(payload?.error_description) || readString(payload?.error) || readString(payload?.message) || text.trim().slice(0, 240);
  return message ? `: ${message}` : "";
}
