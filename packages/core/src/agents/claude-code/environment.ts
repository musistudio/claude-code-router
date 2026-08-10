export const CLAUDE_CODE_MCP_CONFIG_ENV = "CCR_CLAUDE_CODE_MCP_CONFIG";
export const CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV = "CODEXL_CLAUDE_CODE_MCP_CONFIG";
export const CLAUDE_CODE_MODEL_ENV = "ANTHROPIC_MODEL";
export const CCR_CLAUDE_CODE_MODEL_ENV = "CCR_CLAUDE_CODE_MODEL";
export const CODEXL_CLAUDE_CODE_MODEL_ENV = "CODEXL_CLAUDE_CODE_MODEL";
export const CLAUDE_CODE_DEFAULT_FABLE_MODEL_ENV = "ANTHROPIC_DEFAULT_FABLE_MODEL";
export const CLAUDE_CODE_DEFAULT_OPUS_MODEL_ENV = "ANTHROPIC_DEFAULT_OPUS_MODEL";
export const CLAUDE_CODE_DEFAULT_SONNET_MODEL_ENV = "ANTHROPIC_DEFAULT_SONNET_MODEL";
export const CLAUDE_CODE_DEFAULT_HAIKU_MODEL_ENV = "ANTHROPIC_DEFAULT_HAIKU_MODEL";
export const CLAUDE_CODE_LEGACY_SMALL_FAST_MODEL_ENV = "ANTHROPIC_SMALL_FAST_MODEL";
export const CLAUDE_CODE_MANAGED_MODEL_ENV_KEYS = [
  CLAUDE_CODE_MODEL_ENV,
  CCR_CLAUDE_CODE_MODEL_ENV,
  CODEXL_CLAUDE_CODE_MODEL_ENV,
  CLAUDE_CODE_DEFAULT_FABLE_MODEL_ENV,
  CLAUDE_CODE_DEFAULT_OPUS_MODEL_ENV,
  CLAUDE_CODE_DEFAULT_SONNET_MODEL_ENV,
  CLAUDE_CODE_DEFAULT_HAIKU_MODEL_ENV,
  CLAUDE_CODE_LEGACY_SMALL_FAST_MODEL_ENV
] as const;

export type ClaudeCodeModelSelection = {
  fableModel?: string;
  haikuModel?: string;
  model?: string;
  opusModel?: string;
  smallFastModel?: string;
  sonnetModel?: string;
};

const chinaTimeZones = new Set([
  "asia/chongqing",
  "asia/chungking",
  "asia/harbin",
  "asia/kashgar",
  "asia/shanghai",
  "asia/urumqi",
  "china standard time",
  "prc"
]);

export function claudeCodeMcpConfigEnv(configFile: string | undefined): Record<string, string> {
  return configFile
    ? {
        [CLAUDE_CODE_MCP_CONFIG_ENV]: configFile,
        [CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV]: configFile
      }
    : {};
}

export function claudeCodeModelEnv(selection: ClaudeCodeModelSelection): Record<string, string> {
  const env: Record<string, string> = {};
  const model = normalizeClaudeCodeClientModel(selection.model);
  if (model) {
    env[CLAUDE_CODE_MODEL_ENV] = model;
    env[CCR_CLAUDE_CODE_MODEL_ENV] = model;
    env[CODEXL_CLAUDE_CODE_MODEL_ENV] = model;
  }

  assignModelAliasEnv(env, CLAUDE_CODE_DEFAULT_FABLE_MODEL_ENV, selection.fableModel);
  assignModelAliasEnv(env, CLAUDE_CODE_DEFAULT_OPUS_MODEL_ENV, selection.opusModel);
  assignModelAliasEnv(env, CLAUDE_CODE_DEFAULT_SONNET_MODEL_ENV, selection.sonnetModel);
  assignModelAliasEnv(env, CLAUDE_CODE_DEFAULT_HAIKU_MODEL_ENV, selection.haikuModel || selection.smallFastModel);
  return env;
}

export function clearClaudeCodeManagedModelEnv(env: Record<string, unknown>): void {
  for (const key of CLAUDE_CODE_MANAGED_MODEL_ENV_KEYS) {
    delete env[key];
  }
}

export function isClaudeCodeManagedModelEnvKey(key: string): boolean {
  return (CLAUDE_CODE_MANAGED_MODEL_ENV_KEYS as readonly string[]).includes(key);
}

export function normalizeClaudeCodeClientModel(value: string | undefined): string {
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

export function claudeCodeUtcTimezoneEnvOverride(timeZone = currentTimeZone()): Record<string, string> {
  return isChinaTimeZone(timeZone) ? { TZ: "UTC" } : {};
}

export function currentTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function isChinaTimeZone(timeZone: string | undefined): boolean {
  const normalized = timeZone?.trim().toLowerCase();
  return Boolean(normalized && chinaTimeZones.has(normalized));
}

function assignModelAliasEnv(env: Record<string, string>, key: string, value: string | undefined): void {
  const model = normalizeClaudeCodeClientModel(value);
  if (model) {
    env[key] = model;
  }
}
