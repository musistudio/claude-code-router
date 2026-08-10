import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCodexModelCatalogIds } from "@ccr/core/agents/codex/model-catalog";
import type { AppConfig, ProfileConfig } from "@ccr/core/contracts/app";

export type PiProfileConfigWriteResult = {
  changed: boolean;
  file: string;
  model: string;
  profileHome: string;
  providerId: string;
  sessionDir: string;
};

const privateDirMode = 0o700;
const privateFileMode = 0o600;

export function resolvePiAgentDir(configDir: string, profile: ProfileConfig): string {
  if (profile.scope === "ccr" || profile.scope === "custom") {
    const slug = sanitizePathSegment(profile.id || profile.name || "pi") || "pi";
    const baseDir = path.join(configDir, "profiles", slug);
    return path.join(profile.scope === "custom" ? path.join(baseDir, "custom") : baseDir, "pi");
  }

  const configured = profile.configFile?.trim();
  return configured ? resolveUserPath(configured) : path.join(homeDir(), ".pi", "agent");
}

export function resolvePiSessionDir(configDir: string, profile: ProfileConfig): string {
  return path.join(resolvePiAgentDir(configDir, profile), "sessions");
}

export function piWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizePathSegment(profile.id || profile.name || profile.agent) || "pi";
  return process.platform === "win32"
    ? `ccr-pi-wrapper-${slug}.cmd`
    : `ccr-pi-wrapper-${slug}`;
}

export function writePiGatewayConfig(
  configDir: string,
  config: AppConfig,
  profile: ProfileConfig,
  token: string,
  defaultModel: string
): PiProfileConfigWriteResult {
  const profileHome = resolvePiAgentDir(configDir, profile);
  const sessionDir = resolvePiSessionDir(configDir, profile);
  const file = path.join(profileHome, "models.json");
  const providerId = sanitizeProviderId(profile.providerId || "") || "claude-code-router";
  const models = piProfileModels(config, defaultModel);
  const model = models.includes(defaultModel) ? defaultModel : models[0] || defaultModel || "default";
  const content = `${JSON.stringify(piModelsJson(config, profile, providerId, token, models), null, 2)}\n`;
  const changed = writeJsonFileIfChanged(file, content);
  mkdirSync(sessionDir, { mode: privateDirMode, recursive: true });
  chmodPrivateDir(profileHome);
  chmodPrivateDir(sessionDir);
  return {
    changed,
    file,
    model,
    profileHome,
    providerId,
    sessionDir
  };
}

function piModelsJson(
  config: AppConfig,
  profile: ProfileConfig,
  providerId: string,
  token: string,
  models: string[]
): Record<string, unknown> {
  return {
    providers: {
      [providerId]: {
        api: "openai-responses",
        apiKey: token,
        authHeader: true,
        baseUrl: `${gatewayEndpoint(config).replace(/\/+$/g, "")}/v1`,
        headers: {
          "x-ccr-client": "pi",
          "x-ccr-profile": profile.id || profile.name || "pi"
        },
        models: models.map(piModelConfig)
      }
    }
  };
}

function piModelConfig(model: string): Record<string, unknown> {
  return {
    id: model,
    name: model
  };
}

function piProfileModels(config: AppConfig, defaultModel: string): string[] {
  return uniqueStrings([
    defaultModel,
    ...buildCodexModelCatalogIds(config, defaultModel)
  ].filter(Boolean));
}

function gatewayEndpoint(config: AppConfig): string {
  const host = config.gateway.host === "0.0.0.0" || config.gateway.host === "::" ? "127.0.0.1" : config.gateway.host;
  const normalizedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${normalizedHost}:${config.gateway.port}`;
}

function writeJsonFileIfChanged(file: string, content: string): boolean {
  mkdirSync(path.dirname(file), { mode: privateDirMode, recursive: true });
  chmodPrivateDir(path.dirname(file));
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (previous === content) {
    chmodPrivateFile(file);
    return false;
  }
  writeFileSync(file, content, { encoding: "utf8", mode: privateFileMode });
  chmodPrivateFile(file);
  return true;
}

function chmodPrivateDir(dir: string): void {
  if (process.platform === "win32" || !existsSync(dir)) {
    return;
  }
  try {
    chmodSync(dir, privateDirMode);
  } catch {
    // Best-effort permissions only; config writes should not fail after success.
  }
}

function chmodPrivateFile(file: string): void {
  if (process.platform === "win32" || !existsSync(file)) {
    return;
  }
  try {
    chmodSync(file, privateFileMode);
  } catch {
    // Best-effort permissions only; config writes should not fail after success.
  }
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function sanitizeProviderId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function sanitizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function resolveUserPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "~") {
    return homeDir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(homeDir(), trimmed.slice(2));
  }
  return path.resolve(trimmed || ".");
}

function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || os.homedir() || ".";
}
