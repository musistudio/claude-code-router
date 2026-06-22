import path from "node:path";
import type { AppConfig, ProfileConfig, ProfileOpenSurface } from "../shared/app";

export type ProfileLaunchPlan = {
  args: string[];
  command: string;
  env: Record<string, string>;
  profile: ProfileConfig;
  surface: ProfileOpenSurface;
};

export function findProfileForOpen(config: Pick<AppConfig, "profile">, profileRef: string): ProfileConfig {
  const needle = profileRef.trim();
  if (!needle) {
    throw new Error("Profile name is required.");
  }

  const profiles = config.profile.profiles.filter((profile) => profile.enabled);
  const exactId = profiles.find((profile) => profile.id === needle);
  if (exactId) {
    return exactId;
  }

  const normalizedNeedle = normalizeLookupValue(needle);
  const matches = profiles.filter((profile) =>
    normalizeLookupValue(profile.name) === normalizedNeedle ||
    normalizeLookupValue(profile.id) === normalizedNeedle ||
    sanitizePathSegment(profile.name) === normalizedNeedle ||
    sanitizePathSegment(profile.id) === normalizedNeedle
  );
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw new Error(`Profile "${needle}" is ambiguous. Use the profile ID instead.`);
  }
  throw new Error(`Profile "${needle}" was not found or is disabled.`);
}

export function profileOpenSurfaces(profile: ProfileConfig): ProfileOpenSurface[] {
  const surface = normalizeProfileSurface(profile.surface);
  if (surface === "cli") {
    return ["cli"];
  }
  if (surface === "app") {
    return ["app"];
  }
  return ["cli", "app"];
}

export function resolveProfileOpenSurface(profile: ProfileConfig, surface?: ProfileOpenSurface): ProfileOpenSurface {
  const surfaces = profileOpenSurfaces(profile);
  if (surface) {
    if (!surfaces.includes(surface)) {
      throw new Error(`${profile.name || profile.id} does not support ${surface.toUpperCase()} opening.`);
    }
    return surface;
  }
  return surfaces[0];
}

export function profileOpenCommand(
  profile: ProfileConfig,
  surface: ProfileOpenSurface = "cli",
  command = "ccr",
  profileRef = profile.name?.trim() || profile.id
): string {
  const quote = process.platform === "win32" ? windowsCommandQuote : shellQuote;
  return [quote(command), quote(profileRef), ...(surface === "app" ? ["--app"] : [])].join(" ");
}

export function buildProfileLaunchPlan(
  configDir: string,
  profile: ProfileConfig,
  surface: ProfileOpenSurface,
  extraArgs: string[] = []
): ProfileLaunchPlan {
  const resolvedSurface = resolveProfileOpenSurface(profile, surface);
  if (profile.agent === "codex") {
    return buildCodexLaunchPlan(configDir, profile, resolvedSurface, extraArgs);
  }
  return buildClaudeCodeLaunchPlan(configDir, profile, resolvedSurface, extraArgs);
}

export function ccrManagedProfileDir(configDir: string, profile: ProfileConfig): string {
  const slug = sanitizePathSegment(profile.id || profile.name || profile.agent);
  const baseDir = path.join(configDir, "profiles", slug || "profile");
  return profile.scope === "custom" ? path.join(baseDir, "custom") : baseDir;
}

export function resolveClaudeCodeSettingsFile(configDir: string, profile: ProfileConfig): string {
  if (isGeneratedProfileScope(profile.scope)) {
    return path.join(ccrManagedProfileDir(configDir, profile), "claude", "settings.json");
  }
  return resolveUserPath(profile.settingsFile || "~/.claude/settings.json");
}

export function resolveCodexConfigFile(configDir: string, profile: ProfileConfig): string {
  if (isGeneratedProfileScope(profile.scope)) {
    return path.join(ccrManagedProfileDir(configDir, profile), "codex", "config.toml");
  }
  const codexHome = profile.codexHome?.trim();
  if (codexHome) {
    return path.join(resolveUserPath(codexHome), "config.toml");
  }
  return resolveUserPath(profile.configFile || "~/.codex/config.toml");
}

function buildCodexLaunchPlan(
  configDir: string,
  profile: ProfileConfig,
  surface: ProfileOpenSurface,
  extraArgs: string[]
): ProfileLaunchPlan {
  const providerId = sanitizeCodexProviderId(profile.providerId || "") || "claude-code-router";
  const launcher = path.join(configDir, "bin", codexMiddlewareFilename(profile, providerId));
  return {
    args: surface === "app" && extraArgs.length === 0 ? ["app"] : extraArgs,
    command: launcher,
    env: {
      CCR_PROFILE_SURFACE: surface
    },
    profile,
    surface
  };
}

function buildClaudeCodeLaunchPlan(
  configDir: string,
  profile: ProfileConfig,
  surface: ProfileOpenSurface,
  extraArgs: string[]
): ProfileLaunchPlan {
  if (surface === "app") {
    throw new Error("Claude App opening is available from the CCR desktop app.");
  }
  const settingsFile = resolveClaudeCodeSettingsFile(configDir, profile);
  const launcher = path.join(configDir, "bin", claudeCodeWrapperFilename(profile));
  return {
    args: extraArgs,
    command: launcher,
    env: {
      CLAUDE_CONFIG_DIR: path.dirname(settingsFile),
      CCR_PROFILE_SURFACE: surface
    },
    profile,
    surface
  };
}

function claudeCodeWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizePathSegment(profile.id || profile.name || profile.agent) || "claude-code";
  return process.platform === "win32"
    ? `ccr-claude-code-wrapper-${slug}.cmd`
    : `ccr-claude-code-wrapper-${slug}`;
}

function codexMiddlewareFilename(profile: ProfileConfig, providerId: string): string {
  const slug = sanitizeCodexProviderId(profile.id || profile.name || providerId) || "codex";
  return process.platform === "win32"
    ? `ccr-codex-cli-stdio-${slug}.cmd`
    : `ccr-codex-cli-stdio-${slug}`;
}

function normalizeProfileSurface(value: ProfileConfig["surface"]): "auto" | "cli" | "app" {
  return value === "cli" || value === "app" ? value : "auto";
}

function isGeneratedProfileScope(value: ProfileConfig["scope"]): boolean {
  return value === "ccr" || value === "custom";
}

function resolveUserPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "~") {
    return homeDir();
  }
  if (trimmed.startsWith("~/")) {
    return path.join(homeDir(), trimmed.slice(2));
  }
  return path.resolve(trimmed || ".");
}

function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || ".";
}

function sanitizeCodexProviderId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function sanitizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, "'\\''")}'`;
}

function windowsCommandQuote(value: string): string {
  const normalized = value.replace(/\r?\n/g, " ");
  return /^[A-Za-z0-9_.:/\\-]+$/.test(normalized)
    ? normalized
    : `"${normalized.replace(/"/g, '\\"')}"`;
}
