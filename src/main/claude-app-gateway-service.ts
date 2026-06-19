import { app } from "electron";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { saveAppConfig } from "./config";
import { CONFIGDIR } from "./constants";
import type { ApiKeyConfig, AppConfig, ClaudeAppGatewayApplyResult } from "../shared/app";

const CLAUDE_APP_CONFIG_ID = "8f69f2f1-3275-4ad8-9317-4aa7e972f311";
const CLAUDE_APP_CONFIG_NAME = "Claude Code Router";
const CLAUDE_APP_CONFIG_FILE = "claude_desktop_config.json";
const CLAUDE_APP_CONFIG_LIBRARY_DIR = "configLibrary";
const CLAUDE_APP_CONFIG_META_FILE = "_meta.json";
const CLAUDE_APP_FALLBACK_MODEL = "claude-sonnet-4-5";
const CLAUDE_APP_GATEWAY_BACKUP_FILE = path.join(CONFIGDIR, "claude-app-gateway-backup.json");

type ClaudeAppGatewayConfig = {
  inferenceCredentialKind: "static";
  inferenceGatewayApiKey: string;
  inferenceGatewayAuthScheme: "x-api-key";
  inferenceGatewayBaseUrl: string;
  inferenceModels: Array<{ name: string }>;
  inferenceProvider: "gateway";
  modelDiscoveryEnabled: false;
  unstableDisableModelVerification: true;
};

type ClaudeAppApplyState = {
  apiKey: string;
  apiKeyGenerated: boolean;
  config: AppConfig;
};

type ClaudeAppGatewayPaths = {
  configLibraryFile: string;
  dataDir: string;
  libraryDir: string;
  metaFile: string;
  rootConfigFile: string;
};

type ClaudeAppGatewayFileSnapshot = {
  content?: string;
  exists: boolean;
};

type ClaudeAppGatewayBackup = {
  configLibraryFile: ClaudeAppGatewayFileSnapshot;
  createdAt: string;
  metaFile: ClaudeAppGatewayFileSnapshot;
  rootConfigFile: ClaudeAppGatewayFileSnapshot;
  version: 1;
};

type ClaudeAppGatewayApplyOptions = {
  backup?: boolean;
  dataDir?: string;
};

export type ClaudeAppGatewaySyncResult = {
  config: AppConfig;
  configChanged: boolean;
  result: ClaudeAppGatewayApplyResult;
};

export async function syncClaudeAppGatewayConfig(config: AppConfig): Promise<ClaudeAppGatewaySyncResult> {
  const applied = applyClaudeAppGatewayConfig(config);
  if (applied.config === config) {
    return {
      config,
      configChanged: false,
      result: applied.result
    };
  }

  return {
    config: await saveAppConfig(applied.config),
    configChanged: true,
    result: applied.result
  };
}

export function applyClaudeAppGatewayConfig(config: AppConfig, options: ClaudeAppGatewayApplyOptions = {}): { config: AppConfig; result: ClaudeAppGatewayApplyResult } {
  const state = ensureClaudeAppGatewayState(config);
  const paths = getClaudeAppGatewayPaths(options.dataDir);
  const endpoint = gatewayEndpoint(state.config);
  const model = inferClaudeAppGatewayModel();
  const models = buildClaudeAppGatewayModels(model);
  const gatewayConfig: ClaudeAppGatewayConfig = {
    inferenceCredentialKind: "static",
    inferenceGatewayApiKey: state.apiKey,
    inferenceGatewayAuthScheme: "x-api-key",
    inferenceGatewayBaseUrl: endpoint,
    inferenceModels: models.map((name) => ({ name })),
    inferenceProvider: "gateway",
    modelDiscoveryEnabled: false,
    unstableDisableModelVerification: true
  };

  if (options.backup !== false) {
    backupClaudeAppGatewayConfig(paths);
  }
  mkdirSync(paths.libraryDir, { mode: 0o700, recursive: true });
  writeJsonFile(paths.configLibraryFile, gatewayConfig);
  applyClaudeAppConfigMeta(paths.metaFile);
  applyClaudeAppDeploymentMode(paths.rootConfigFile);

  return {
    config: state.config,
    result: {
      apiKeyGenerated: state.apiKeyGenerated,
      configFile: paths.rootConfigFile,
      configLibraryFile: paths.configLibraryFile,
      dataDir: paths.dataDir,
      endpoint,
      message: `Claude App is configured for CCR gateway at ${endpoint}. Restart Claude App if it is already open.`,
      model,
      requiresRestart: true
    }
  };
}

export function restoreClaudeAppGatewayConfig(): void {
  const backup = readClaudeAppGatewayBackup();
  if (!backup) {
    return;
  }

  const paths = getClaudeAppGatewayPaths();
  restoreFileSnapshot(paths.rootConfigFile, backup.rootConfigFile);
  restoreFileSnapshot(paths.metaFile, backup.metaFile);
  restoreFileSnapshot(paths.configLibraryFile, backup.configLibraryFile);
  rmSync(CLAUDE_APP_GATEWAY_BACKUP_FILE, { force: true });
}

function ensureClaudeAppGatewayState(config: AppConfig): ClaudeAppApplyState {
  const currentApiKey = findReusableApiKey(config);
  const gatewayEnabledConfig = config.gateway.enabled
    ? config
    : {
        ...config,
        gateway: {
          ...config.gateway,
          enabled: true
        }
      };

  if (currentApiKey) {
    return {
      apiKey: currentApiKey,
      apiKeyGenerated: false,
      config: gatewayEnabledConfig
    };
  }

  const generatedApiKey: ApiKeyConfig = {
    createdAt: new Date().toISOString(),
    id: randomUUID(),
    key: `ccr-${randomBytes(24).toString("hex")}`,
    name: "Claude App"
  };

  return {
    apiKey: generatedApiKey.key,
    apiKeyGenerated: true,
    config: {
      ...gatewayEnabledConfig,
      APIKEY: generatedApiKey.key,
      APIKEYS: [...(Array.isArray(gatewayEnabledConfig.APIKEYS) ? gatewayEnabledConfig.APIKEYS : []), generatedApiKey]
    }
  };
}

function findReusableApiKey(config: AppConfig): string {
  const apiKeys = Array.isArray(config.APIKEYS) ? config.APIKEYS : [];
  for (const apiKey of apiKeys) {
    const key = apiKey.key.trim();
    if (key) {
      return key;
    }
  }
  return config.APIKEY.trim();
}

function getClaudeAppGatewayPaths(dataDir = getClaudeApp3pDataDir()): ClaudeAppGatewayPaths {
  const libraryDir = path.join(dataDir, CLAUDE_APP_CONFIG_LIBRARY_DIR);
  return {
    configLibraryFile: path.join(libraryDir, `${CLAUDE_APP_CONFIG_ID}.json`),
    dataDir,
    libraryDir,
    metaFile: path.join(libraryDir, CLAUDE_APP_CONFIG_META_FILE),
    rootConfigFile: path.join(dataDir, CLAUDE_APP_CONFIG_FILE)
  };
}

function getClaudeApp3pDataDir(): string {
  if (process.platform === "darwin") {
    return path.join(app.getPath("home"), "Library", "Application Support", "Claude-3p");
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath("appData"), "..", "Local");
    return path.join(localAppData, "Claude-3p");
  }
  return path.join(app.getPath("appData") || os.homedir(), "Claude-3p");
}

function backupClaudeAppGatewayConfig(paths: ClaudeAppGatewayPaths): void {
  if (existsSync(CLAUDE_APP_GATEWAY_BACKUP_FILE)) {
    return;
  }

  const backup: ClaudeAppGatewayBackup = {
    configLibraryFile: readFileSnapshot(paths.configLibraryFile),
    createdAt: new Date().toISOString(),
    metaFile: readFileSnapshot(paths.metaFile),
    rootConfigFile: readFileSnapshot(paths.rootConfigFile),
    version: 1
  };
  writeJsonFile(CLAUDE_APP_GATEWAY_BACKUP_FILE, backup);
}

function readClaudeAppGatewayBackup(): ClaudeAppGatewayBackup | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(CLAUDE_APP_GATEWAY_BACKUP_FILE, "utf8"));
    if (!isPlainRecord(parsed) || parsed.version !== 1) {
      return undefined;
    }
    const rootConfigFile = normalizeFileSnapshot(parsed.rootConfigFile);
    const metaFile = normalizeFileSnapshot(parsed.metaFile);
    const configLibraryFile = normalizeFileSnapshot(parsed.configLibraryFile);
    if (!rootConfigFile || !metaFile || !configLibraryFile) {
      return undefined;
    }
    return {
      configLibraryFile,
      createdAt: stringValue(parsed.createdAt) || new Date(0).toISOString(),
      metaFile,
      rootConfigFile,
      version: 1
    };
  } catch {
    return undefined;
  }
}

function readFileSnapshot(file: string): ClaudeAppGatewayFileSnapshot {
  if (!existsSync(file)) {
    return { exists: false };
  }
  return {
    content: readFileSync(file, "utf8"),
    exists: true
  };
}

function normalizeFileSnapshot(value: unknown): ClaudeAppGatewayFileSnapshot | undefined {
  if (!isPlainRecord(value) || typeof value.exists !== "boolean") {
    return undefined;
  }
  if (!value.exists) {
    return { exists: false };
  }
  return typeof value.content === "string"
    ? { content: value.content, exists: true }
    : undefined;
}

function restoreFileSnapshot(file: string, snapshot: ClaudeAppGatewayFileSnapshot): void {
  if (!snapshot.exists) {
    rmSync(file, { force: true });
    return;
  }

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, snapshot.content ?? "", { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // File permissions are best-effort across platforms.
  }
}

function gatewayEndpoint(config: AppConfig): string {
  const rawHost = config.gateway.host || config.HOST || "127.0.0.1";
  const host = rawHost.trim() === "0.0.0.0" || rawHost.trim() === "::" ? "127.0.0.1" : rawHost.trim() || "127.0.0.1";
  const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const port = Number.isInteger(config.gateway.port) && config.gateway.port > 0 ? config.gateway.port : config.PORT;
  return `http://${formattedHost}:${port}`;
}

function inferClaudeAppGatewayModel(): string {
  // Claude App validates gateway model routes as Anthropic-looking model IDs.
  // Keep the App picker schema-valid; CCR routes this placeholder to the
  // profile's real provider/model through Router.default at request time.
  return CLAUDE_APP_FALLBACK_MODEL;
}

function buildClaudeAppGatewayModels(selectedModel: string): string[] {
  return [selectedModel || CLAUDE_APP_FALLBACK_MODEL];
}

function applyClaudeAppConfigMeta(metaFile: string): void {
  const current = readJsonRecord(metaFile);
  const entries = normalizeMetaEntries(current?.entries).filter((entry) => entry.id !== CLAUDE_APP_CONFIG_ID);
  entries.push({ id: CLAUDE_APP_CONFIG_ID, name: CLAUDE_APP_CONFIG_NAME });

  writeJsonFile(metaFile, {
    ...(current ?? {}),
    appliedId: CLAUDE_APP_CONFIG_ID,
    entries
  });
}

function normalizeMetaEntries(value: unknown): Array<{ id: string; name: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: Array<{ id: string; name: string }> = [];
  for (const item of value) {
    if (!isPlainRecord(item)) {
      continue;
    }
    const id = stringValue(item.id);
    const name = stringValue(item.name);
    if (!id) {
      continue;
    }
    entries.push({ id, name: name || "Unnamed" });
  }
  return entries;
}

function applyClaudeAppDeploymentMode(rootConfigFile: string): void {
  const current = readJsonRecord(rootConfigFile);
  writeJsonFile(rootConfigFile, {
    ...(current ?? {}),
    deploymentMode: "3p"
  });
}

function readJsonRecord(file: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isPlainRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeJsonFile(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // File permissions are best-effort across platforms.
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
