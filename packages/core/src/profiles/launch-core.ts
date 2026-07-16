import path from "node:path";
import { isInheritedClaudeCodeProfile, type AppConfig, type ProfileConfig, type ProfileOpenSurface } from "@ccr/core/contracts/app";
import { claudeCodeUtcTimezoneEnvOverride } from "@ccr/core/agents/claude-code/environment";
import { resolveOpenCodeConfigFile as resolveOpenCodeProfileConfigFile } from "@ccr/core/agents/opencode/profile-config";
import { resolveZcodeConfigFile } from "@ccr/core/agents/zcode/profile-config";

export type ProfileLaunchPlan = {
  args: string[];
  command: string;
  env: Record<string, string>;
  profile: ProfileConfig;
  surface: ProfileOpenSurface;
};

export type ProfileLaunchSpawnCommand = {
  args: string[];
  command: string;
  windowsVerbatimArguments?: boolean;
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
  if (profile.agent === "zcode") {
    return ["app"];
  }
  if (profile.agent === "grok" || profile.agent === "kimi") {
    return ["cli"];
  }
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

export function defaultProfileOpenSurface(profile: Pick<ProfileConfig, "agent">): ProfileOpenSurface {
  return profile.agent === "zcode" ? "app" : "cli";
}

export function shouldAutoStartProfileGateway(
  profile: Pick<ProfileConfig, "agent">,
  surface: ProfileOpenSurface
): boolean {
  return (profile.agent === "grok" || profile.agent === "kimi") && surface === "cli";
}

export function profileOpenCommand(
  profile: ProfileConfig,
  surface: ProfileOpenSurface = defaultProfileOpenSurface(profile),
  command = "ccr",
  profileRef = profile.name?.trim() || profile.id
): string {
  const quote = process.platform === "win32" ? windowsCommandQuote : shellQuote;
  const parts = [quote(command), quote(profileRef)];
  if (surface === "app") {
    parts.push(surface);
  }
  return parts.join(" ");
}

export function buildProfileLaunchPlan(
  configDir: string,
  profile: ProfileConfig,
  surface: ProfileOpenSurface,
  extraArgs: string[] = []
): ProfileLaunchPlan {
  const resolvedSurface = resolveProfileOpenSurface(profile, surface);
  if (profile.agent === "grok") {
    return buildGrokLaunchPlan(configDir, profile, resolvedSurface, extraArgs);
  }
  if (profile.agent === "kimi") {
    return buildKimiLaunchPlan(configDir, profile, resolvedSurface, extraArgs);
  }
  if (profile.agent === "opencode") {
    return buildOpenCodeLaunchPlan(configDir, profile, resolvedSurface, extraArgs);
  }
  if (isCodexCompatibleAgent(profile.agent)) {
    return buildCodexLaunchPlan(configDir, profile, resolvedSurface, extraArgs);
  }
  return buildClaudeCodeLaunchPlan(configDir, profile, resolvedSurface, extraArgs);
}

function buildOpenCodeLaunchPlan(
  configDir: string,
  profile: ProfileConfig,
  surface: ProfileOpenSurface,
  extraArgs: string[]
): ProfileLaunchPlan {
  if (surface !== "cli") {
    throw new Error("OpenCode App profiles must be opened through CCR Desktop.");
  }
  return {
    args: extraArgs,
    command: path.join(configDir, "bin", openCodeWrapperFilename(profile)),
    env: {
      CCR_PROFILE_SURFACE: "cli",
      OPENCODE_CONFIG: resolveOpenCodeProfileConfigFile(configDir, profile)
    },
    profile,
    surface
  };
}

function buildGrokLaunchPlan(
  configDir: string,
  profile: ProfileConfig,
  surface: ProfileOpenSurface,
  extraArgs: string[]
): ProfileLaunchPlan {
  if (surface !== "cli") {
    throw new Error("Grok CLI profiles only support CLI opening.");
  }
  return {
    args: extraArgs,
    command: path.join(configDir, "bin", grokWrapperFilename(profile)),
    env: {
      CCR_PROFILE_SURFACE: "cli"
    },
    profile,
    surface
  };
}

function buildKimiLaunchPlan(
  configDir: string,
  profile: ProfileConfig,
  surface: ProfileOpenSurface,
  extraArgs: string[]
): ProfileLaunchPlan {
  if (surface !== "cli") {
    throw new Error("Kimi CLI profiles only support CLI opening.");
  }
  return {
    args: extraArgs,
    command: path.join(configDir, "bin", kimiWrapperFilename(profile)),
    env: {
      CCR_PROFILE_SURFACE: "cli"
    },
    profile,
    surface
  };
}

export function profileLaunchSpawnCommand(plan: Pick<ProfileLaunchPlan, "args" | "command">): ProfileLaunchSpawnCommand {
  if (!isWindowsCommandScript(plan.command)) {
    return {
      args: plan.args,
      command: plan.command
    };
  }
  let cmdLine = `"${plan.command}"`;
  if (plan.args && plan.args.length > 0) {
    cmdLine += " " + plan.args.join(" ");
  }
  return {
    args: ["/d", "/v:off", "/c", cmdLine],
    command: process.env.ComSpec || process.env.COMSPEC || "cmd.exe",
    windowsVerbatimArguments: true
  };
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

export function resolveClaudeCodeLaunchConfigDir(configDir: string, profile: ProfileConfig): string {
  if (isInheritedClaudeCodeProfile(profile)) {
    return path.dirname(resolveUserPath(profile.settingsFile || "~/.claude/settings.json"));
  }
  return path.dirname(resolveClaudeCodeSettingsFile(configDir, profile));
}

export function resolveCodexConfigFile(configDir: string, profile: ProfileConfig): string {
  if (profile.agent === "zcode") {
    return resolveZcodeConfigFile(profile);
  }
  if (isGeneratedProfileScope(profile.scope)) {
    return path.join(ccrManagedProfileDir(configDir, profile), codexConfigSubdir(profile.agent), "config.toml");
  }
  const codexHome = profile.codexHome?.trim();
  if (codexHome) {
    return path.join(resolveUserPath(codexHome), "config.toml");
  }
  return resolveUserPath(profile.configFile || defaultCodexConfigFile(profile.agent));
}

export function resolveOpenCodeConfigFile(configDir: string, profile: ProfileConfig): string {
  return resolveOpenCodeProfileConfigFile(configDir, profile);
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
  const launcher = path.join(configDir, "bin", claudeCodeWrapperFilename(profile));
  return {
    args: extraArgs,
    command: launcher,
    env: {
      CLAUDE_CONFIG_DIR: resolveClaudeCodeLaunchConfigDir(configDir, profile),
      CCR_PROFILE_SURFACE: surface,
      ...claudeCodeModelEnv(profile),
      ...claudeCodeUtcTimezoneEnvOverride()
    },
    profile,
    surface
  };
}

function isCodexCompatibleAgent(agent: ProfileConfig["agent"]): boolean {
  return agent === "codex" || agent === "zcode";
}

function defaultCodexConfigFile(agent: ProfileConfig["agent"]): string {
  return agent === "zcode" ? "~/.zcode/cli/config.json" : "~/.codex/config.toml";
}

function codexConfigSubdir(agent: ProfileConfig["agent"]): string {
  return agent === "zcode" ? "zcode" : "codex";
}

function claudeCodeWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizePathSegment(profile.id || profile.name || profile.agent) || "claude-code";
  return process.platform === "win32"
    ? `ccr-claude-code-wrapper-${slug}.cmd`
    : `ccr-claude-code-wrapper-${slug}`;
}

function grokWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizePathSegment(profile.id || profile.name || profile.agent) || "grok";
  return process.platform === "win32"
    ? `ccr-grok-cli-wrapper-${slug}.cmd`
    : `ccr-grok-cli-wrapper-${slug}`;
}

function kimiWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizePathSegment(profile.id || profile.name || profile.agent) || "kimi";
  return process.platform === "win32"
    ? `ccr-kimi-cli-wrapper-${slug}.cmd`
    : `ccr-kimi-cli-wrapper-${slug}`;
}

function openCodeWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizePathSegment(profile.id || profile.name || profile.agent) || "opencode";
  return process.platform === "win32"
    ? `ccr-opencode-wrapper-${slug}.cmd`
    : `ccr-opencode-wrapper-${slug}`;
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

function claudeCodeModelEnv(profile: ProfileConfig): Record<string, string> {
  const env: Record<string, string> = {};
  const model = normalizeClientModel(profile.model);
  if (model) {
    env.ANTHROPIC_MODEL = model;
    env.CCR_CLAUDE_CODE_MODEL = model;
    env.CODEXL_CLAUDE_CODE_MODEL = model;
  }
  const smallFastModel = normalizeClientModel(profile.smallFastModel);
  if (smallFastModel) {
    env.ANTHROPIC_SMALL_FAST_MODEL = smallFastModel;
  }
  return env;
}

function normalizeClientModel(value: string | undefined): string {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return "";
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : "";
  }
  return trimmed;
}

function isGeneratedProfileScope(value: ProfileConfig["scope"]): boolean {
  return value === "ccr" || value === "custom";
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

function isWindowsCommandScript(command: string): boolean {
  return process.platform === "win32" && /\.(?:bat|cmd)$/i.test(path.basename(command));
}

function windowsCommandScriptInvocation(command: string, args: string[]): string {
  return [
    "call",
    windowsCommandInvocationArg(command),
    ...args.map(windowsCommandInvocationArg)
  ].join(" ");
}

function windowsCommandInvocationArg(value: string): string {
  const normalized = value.replace(/\r?\n/g, " ");
  if (!normalized) {
    return "\"\"";
  }
  return `"${normalized.replace(/[\^"%&|<>()]/g, "^$&")}"`;
}
