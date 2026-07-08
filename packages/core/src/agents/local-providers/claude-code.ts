import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import type {
  LocalAgentProviderCandidate,
  LocalAgentProviderImportResult,
  ProviderAccountConfig,
  ProviderAccountMappingConfig
} from "@ccr/core/contracts/app";
import {
  bearerAuthPlugin,
  findOauthTokenSet,
  isRecord,
  missingCandidate,
  providerInternalNamePlaceholder,
  providerPayload,
  readJsonRecord,
  uniqueProviderName,
  uniqueStrings,
  type OAuthTokenSet
} from "@ccr/core/agents/local-providers/shared";

const claudeCodeKeychainService = "Claude Code-credentials";

const claudeDefaultModels = ["claude-sonnet-4-20250514"];

const percentLimitMapping = (id: string, label: string, path: string, window: string) => ({
  id,
  kind: "quota" as const,
  label,
  limit: 100,
  remaining: `100 - ${path}.utilization`,
  resetAt: `${path}.resets_at`,
  unit: "%",
  used: `${path}.utilization`,
  window
});

const claudeCodeAccountMapping: ProviderAccountMappingConfig = {
  meters: [
    percentLimitMapping("claude_five_hour_quota", "5h quota", "$.five_hour", "5h"),
    percentLimitMapping("claude_seven_day_quota", "7d quota", "$.seven_day", "7d"),
    percentLimitMapping("claude_oauth_apps_quota", "OAuth apps quota", "$.seven_day_oauth_apps", "7d"),
    percentLimitMapping("claude_opus_quota", "Opus quota", "$.seven_day_opus", "7d"),
    percentLimitMapping("claude_sonnet_quota", "Sonnet quota", "$.seven_day_sonnet", "7d"),
    {
      id: "claude_extra_usage",
      kind: "quota",
      label: "Extra usage",
      limit: 100,
      remaining: "100 - $.extra_usage.utilization",
      unit: "%",
      used: "$.extra_usage.utilization",
      window: "monthly"
    },
    {
      id: "claude_extra_usage_credits",
      kind: "balance",
      label: "Extra usage credits",
      limit: "$.extra_usage.monthly_limit",
      unit: "credits",
      used: "$.extra_usage.used_credits",
      window: "monthly"
    }
  ]
};

export function claudeCodeCandidate(): LocalAgentProviderCandidate {
  const oauth = readClaudeCodeOauth();
  if (oauth?.accessToken) {
    return {
      detail: "Claude Code login detected. Click Import to add it as a gateway provider.",
      id: "claude-code-api",
      importable: true,
      kind: "claude-code",
      models: claudeDefaultModels,
      name: "Claude Code API",
      protocol: "anthropic_messages",
      sourceFile: oauth.sourceFile,
      status: "available"
    };
  }
  if (oauth?.refreshToken) {
    return {
      detail: "Claude Code login was detected, but no usable access token was found.",
      id: "claude-code-api",
      importable: false,
      kind: "claude-code",
      models: claudeDefaultModels,
      name: "Claude Code API",
      protocol: "anthropic_messages",
      sourceFile: oauth.sourceFile,
      status: "locked"
    };
  }
  return missingCandidate("claude-code", "claude-code-api", "Claude Code API", "anthropic_messages", claudeDefaultModels);
}

export function importClaudeCodeProvider(candidate: LocalAgentProviderCandidate, providerNames: string[]): LocalAgentProviderImportResult {
  const oauth = readClaudeCodeOauth();
  const token = oauth?.accessToken;
  if (!token) {
    throw new Error("Claude Code access token was not found.");
  }
  const provider = providerPayload(
    candidate,
    uniqueProviderName(providerNames, "Claude Code API"),
    "https://api.anthropic.com",
    claudeCodeProviderAccountConfig()
  );
  const auth = bearerAuthPlugin("claude-code-oauth", token, {
    "anthropic-beta": "oauth-2025-04-20"
  });
  const internalAuth = bearerAuthPlugin("claude-code-oauth-internal", token, {
    "anthropic-beta": "oauth-2025-04-20"
  }, providerInternalNamePlaceholder);
  return {
    candidate,
    provider,
    providerPlugins: [auth, internalAuth]
  };
}

function claudeCodeProviderAccountConfig(): ProviderAccountConfig {
  return {
    connectors: [
      {
        auth: "provider-api-key",
        endpoint: "https://api.anthropic.com/api/oauth/usage",
        headers: {
          "Content-Type": "application/json",
          "anthropic-beta": "oauth-2025-04-20"
        },
        mapping: claudeCodeAccountMapping,
        type: "http-json"
      }
    ],
    enabled: true
  };
}

function readClaudeCodeOauth(): OAuthTokenSet | undefined {
  for (const sourceFile of claudeCredentialFiles()) {
    const record = readJsonRecord(sourceFile);
    if (!record) {
      continue;
    }
    const credential = findOauthTokenSet(record);
    return {
      accessToken: credential?.accessToken,
      refreshToken: credential?.refreshToken,
      sourceFile
    };
  }

  const keychainRecord = readClaudeCodeKeychainRecord();
  if (keychainRecord) {
    const credential = findOauthTokenSet(keychainRecord);
    if (credential) {
      return {
        accessToken: credential.accessToken,
        refreshToken: credential.refreshToken,
        sourceFile: `keychain:${claudeCodeKeychainService}`
      };
    }
  }

  return undefined;
}

function claudeCredentialFiles(): string[] {
  return uniqueStrings([
    path.join(os.homedir(), ".claude", ".credentials.json"),
    path.join(os.homedir(), ".claude", "credentials.json"),
    path.join(os.homedir(), ".config", "claude", "credentials.json")
  ]);
}

// Newer macOS builds of the Claude Code CLI store credentials in the
// Keychain instead of ~/.claude/.credentials.json. Reading it triggers the
// standard macOS keychain access prompt (Allow / Always Allow); the user
// declining or the item not existing both surface as a non-zero exit here.
function readClaudeCodeKeychainRecord(): Record<string, unknown> | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }
  try {
    const output = execFileSync(
      "security",
      ["find-generic-password", "-s", claudeCodeKeychainService, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const parsed = JSON.parse(output.trim()) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
