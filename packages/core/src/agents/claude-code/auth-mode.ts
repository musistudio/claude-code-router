export const CLAUDE_CODE_AUTH_MODE_ENV = "CCR_CLAUDE_CODE_AUTH_MODE";

export type ClaudeCodeGatewayAuthMode = "api-key-helper" | "wif";
export type ClaudeCodeGatewayAuthModePreference = ClaudeCodeGatewayAuthMode | "auto";

type ClaudeCodeAuthProfile = {
  env?: Record<string, string>;
};

export function resolveClaudeCodeGatewayAuthMode(profile: ClaudeCodeAuthProfile): ClaudeCodeGatewayAuthMode {
  const preference = claudeCodeGatewayAuthModePreference(profile);
  if (preference === "wif" || preference === "api-key-helper") {
    return preference;
  }

  // A CLI version does not establish that federation mode is configured.
  return "api-key-helper";
}

export function claudeCodeGatewayAuthModePreference(profile: ClaudeCodeAuthProfile): ClaudeCodeGatewayAuthModePreference {
  return normalizeClaudeCodeGatewayAuthMode(
    profile.env?.[CLAUDE_CODE_AUTH_MODE_ENV] ||
    process.env[CLAUDE_CODE_AUTH_MODE_ENV]
  );
}

export function normalizeClaudeCodeGatewayAuthMode(value: string | undefined): ClaudeCodeGatewayAuthModePreference {
  const normalized = value?.trim().toLowerCase().replace(/_/g, "-") || "";
  if (normalized === "wif" || normalized === "workload-identity" || normalized === "workload-identity-federation") {
    return "wif";
  }
  if (normalized === "helper" || normalized === "api-key-helper" || normalized === "apikey-helper" || normalized === "legacy") {
    return "api-key-helper";
  }
  return "auto";
}
