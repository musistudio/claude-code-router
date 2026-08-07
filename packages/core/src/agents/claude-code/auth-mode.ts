import { spawnSync } from "node:child_process";

export const CLAUDE_CODE_AUTH_MODE_ENV = "CCR_CLAUDE_CODE_AUTH_MODE";

export type ClaudeCodeGatewayAuthMode = "api-key-helper" | "wif";
export type ClaudeCodeGatewayAuthModePreference = ClaudeCodeGatewayAuthMode | "auto";

type ClaudeCodeAuthProfile = {
  env?: Record<string, string>;
};

const claudeCodeWifMinimumVersion = [2, 1, 200] as const;

export function resolveClaudeCodeGatewayAuthMode(profile: ClaudeCodeAuthProfile): ClaudeCodeGatewayAuthMode {
  const preference = claudeCodeGatewayAuthModePreference(profile);
  if (preference === "wif" || preference === "api-key-helper") {
    return preference;
  }

  const version = detectClaudeCodeCliVersion(profile);
  return version && compareVersions(version, claudeCodeWifMinimumVersion) >= 0
    ? "wif"
    : "api-key-helper";
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

function detectClaudeCodeCliVersion(profile: ClaudeCodeAuthProfile): [number, number, number] | undefined {
  const command = profile.env?.CCR_CLAUDE_CODE_BIN?.trim() || "claude";
  try {
    const result = spawnSync(command, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 1500,
      windowsHide: true
    });
    if (result.error) {
      return undefined;
    }
    return parseVersion(`${result.stdout || ""}\n${result.stderr || ""}`);
  } catch {
    return undefined;
  }
}

function parseVersion(value: string): [number, number, number] | undefined {
  const match = value.match(/\b(\d+)\.(\d+)(?:\.(\d+))?\b/);
  if (!match) {
    return undefined;
  }
  return [
    Number.parseInt(match[1] ?? "0", 10),
    Number.parseInt(match[2] ?? "0", 10),
    Number.parseInt(match[3] ?? "0", 10)
  ];
}

function compareVersions(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}
