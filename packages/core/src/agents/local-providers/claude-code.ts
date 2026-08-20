import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
  isRecord,
  missingCandidate,
  providerInternalNamePlaceholder,
  providerPayload,
  readJsonRecord,
  readOauthTokenSetFields,
  uniqueProviderName,
  uniqueStrings,
  type OAuthTokenSet
} from "@ccr/core/agents/local-providers/shared";

const claudeDefaultModels = ["claude-sonnet-5"];
const claudeCodeKeychainServiceBase = "Claude Code-credentials";
const claudeCodeKeychainAccountPattern = /^[a-zA-Z0-9._-]+$/;
const claudeCodeKeychainServicePattern = /^Claude Code(?:-[a-z]+-oauth)?-credentials(?:-[0-9a-f]{8})?$/;
// `security` exit code for errSecItemNotFound.
const keychainItemNotFoundStatus = 44;

type ClaudeCodeKeychainCandidate = { account?: string; service: string };

export type ClaudeCodeLoginScan = {
  /** Reads that failed, with the `security` stderr that explains why. */
  errors: string[];
  /** Locations that parsed successfully. */
  inspected: string[];
  oauth?: OAuthTokenSet;
  /** Locations that parsed but carry no OAuth token. */
  tokenless: string[];
};

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
    percentLimitMapping("claude_seven_day_quota", "7d quota", "$.seven_day", "weekly"),
    percentLimitMapping("claude_oauth_apps_quota", "OAuth apps quota", "$.seven_day_oauth_apps", "weekly"),
    percentLimitMapping("claude_opus_quota", "Opus quota", "$.seven_day_opus", "weekly"),
    percentLimitMapping("claude_sonnet_quota", "Sonnet quota", "$.seven_day_sonnet", "weekly"),
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
  const scan = scanClaudeCodeLogin();
  const oauth = scan.oauth;
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
  const detail = claudeCodeScanDiagnostic(scan);
  if (detail) {
    return {
      detail,
      id: "claude-code-api",
      importable: false,
      kind: "claude-code",
      models: claudeDefaultModels,
      name: "Claude Code API",
      protocol: "anthropic_messages",
      sourceFile: scan.inspected[0],
      status: "locked"
    };
  }
  return missingCandidate("claude-code", "claude-code-api", "Claude Code API", "anthropic_messages", claudeDefaultModels);
}

// Distinguishes "found login state but no token" and "could not read the store"
// from "no login at all", so the Add Provider list can say why an import is
// unavailable instead of silently omitting the candidate.
function claudeCodeScanDiagnostic(scan: ClaudeCodeLoginScan): string | undefined {
  if (scan.tokenless.length > 0) {
    return `Claude Code login state was found but contains no OAuth token (${scan.tokenless.join("; ")}). Run \`claude /login\`, then retry.`;
  }
  if (scan.errors.length > 0) {
    return `Claude Code login state could not be read: ${scan.errors.join("; ")}`;
  }
  return undefined;
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

export function readClaudeCodeOauth(): OAuthTokenSet | undefined {
  return scanClaudeCodeLogin().oauth;
}

export function scanClaudeCodeLogin(): ClaudeCodeLoginScan {
  const scan: ClaudeCodeLoginScan = { errors: [], inspected: [], tokenless: [] };
  const keychainOauth = scanClaudeCodeKeychain(scan);
  if (keychainOauth) {
    scan.oauth = keychainOauth;
    return scan;
  }

  for (const sourceFile of claudeCredentialFiles()) {
    const record = readJsonRecord(sourceFile);
    if (!record) {
      continue;
    }
    scan.inspected.push(sourceFile);
    // Root-level fields only, same reasoning as the keychain path below: Claude
    // Code writes this file with the identical record shape, mcpOAuth included.
    const credential = readOauthTokenSetFields(record.claudeAiOauth) ?? readOauthTokenSetFields(record);
    if (!credential?.accessToken && !credential?.refreshToken) {
      scan.tokenless.push(`${sourceFile} (keys: ${Object.keys(record).join(", ")})`);
      continue;
    }
    scan.oauth = {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      sourceFile
    };
    return scan;
  }

  return scan;
}

function claudeCredentialFiles(): string[] {
  return uniqueStrings([
    path.join(claudeCodeStorageDir(), ".credentials.json"),
    path.join(os.homedir(), ".claude", ".credentials.json"),
    path.join(os.homedir(), ".claude", "credentials.json"),
    path.join(os.homedir(), ".config", "claude", "credentials.json")
  ]);
}

// Claude Code's plaintext fallback lives in its secure-storage config dir,
// which CLAUDE_SECURESTORAGE_CONFIG_DIR / CLAUDE_CONFIG_DIR can relocate.
function claudeCodeStorageDir(): string {
  const secureStorageDir = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  const dir = secureStorageDir !== undefined
    ? secureStorageDir || path.join(os.homedir(), ".claude")
    : process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  return dir.normalize("NFC");
}

// Claude Code >= 2.1 derives the keychain service name from its config dir:
//   `Claude Code${oauthSuffix}-credentials${configSuffix}`
// `configSuffix` is empty for a default config dir and
// `-${sha256(NFC(configDir)).slice(0, 8)}` once CLAUDE_CONFIG_DIR or
// CLAUDE_SECURESTORAGE_CONFIG_DIR is set. Verified against 2.1.220.
function claudeCodeExpectedKeychainServices(): string[] {
  const secureStorageDir = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  const usesDefaultDir = secureStorageDir !== undefined ? !secureStorageDir : !process.env.CLAUDE_CONFIG_DIR;
  const configSuffix = usesDefaultDir
    ? ""
    : `-${createHash("sha256").update(claudeCodeStorageDir()).digest("hex").slice(0, 8)}`;
  const oauthSuffix = process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL ? "-custom-oauth" : "";
  return uniqueStrings([`Claude Code${oauthSuffix}-credentials${configSuffix}`, claudeCodeKeychainServiceBase]);
}

// Claude Code writes the item under the current `$USER`; a login from an older
// build (or one that could not resolve a username) sits under a different
// account on the *same* service name, so the account has to be explicit.
function claudeCodeKeychainAccount(): string {
  let user: string | undefined;
  try {
    user = process.env.USER || os.userInfo().username;
  } catch {
    user = undefined;
  }
  return user && claudeCodeKeychainAccountPattern.test(user) ? user : "claude-code-user";
}

// Newer macOS builds of the Claude Code CLI store credentials in the Keychain
// instead of ~/.claude/.credentials.json. Reading one triggers the standard
// macOS keychain access prompt (Allow / Always Allow); the user declining or
// the item not existing both surface as a non-zero exit here.
function scanClaudeCodeKeychain(scan: ClaudeCodeLoginScan): OAuthTokenSet | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }
  const expectedServices = claudeCodeExpectedKeychainServices();
  const account = claudeCodeKeychainAccount();
  // Ordered by cost: the enumeration tier shells out to `security dump-keychain`,
  // so it is only built once the expected item fails to produce a token.
  const tiers: Array<() => ClaudeCodeKeychainCandidate[]> = [
    () => expectedServices.map(service => ({ account, service })),
    // An item written under a different account, or under a config dir this
    // process cannot reconstruct, only turns up by enumeration.
    discoverClaudeCodeKeychainItems,
    // Pre-2.1 lookup: no `-a`, so the Keychain picks an arbitrary account when
    // several items share the service name.
    () => expectedServices.map(service => ({ service }))
  ];

  const attempted = new Set<string>();
  const servicesRead = new Set<string>();
  let legacyRootMatch: OAuthTokenSet | undefined;
  for (const buildTier of tiers) {
    for (const candidate of buildTier()) {
      const key = `${candidate.service}\u0000${candidate.account ?? ""}`;
      // An accountless read of a service already read by account returns one of
      // those same items, so it would only duplicate the diagnostics.
      if (attempted.has(key) || (candidate.account === undefined && servicesRead.has(candidate.service))) {
        continue;
      }
      attempted.add(key);
      const label = candidate.account === undefined ? candidate.service : `${candidate.service} (${candidate.account})`;
      const record = readClaudeCodeKeychainRecord(candidate, scan, label);
      if (!record) {
        continue;
      }
      servicesRead.add(candidate.service);
      scan.inspected.push(`keychain:${label}`);
      // Only `claudeAiOauth` is an Anthropic API credential. Both reads are
      // root-level: a recursive search would descend into `mcpOAuth`, whose
      // per-plugin records also carry `accessToken`, and that token imports
      // cleanly as a provider and then 401s on every request. Restricting to
      // root-level fields excludes *any* nested container, so a future sibling
      // key cannot reintroduce the hole.
      const claudeAiOauth = readOauthTokenSetFields(record.claudeAiOauth);
      if (claudeAiOauth) {
        return {
          accessToken: claudeAiOauth.accessToken,
          refreshToken: claudeAiOauth.refreshToken,
          sourceFile: `keychain:${label}`
        };
      }
      // Pre-`claudeAiOauth` layout, where the tokens sat at the record root.
      const legacyRoot = readOauthTokenSetFields(record);
      if (legacyRoot) {
        legacyRootMatch ??= {
          accessToken: legacyRoot.accessToken,
          refreshToken: legacyRoot.refreshToken,
          sourceFile: `keychain:${label}`
        };
        continue;
      }
      scan.tokenless.push(`keychain:${label} (keys: ${Object.keys(record).join(", ")})`);
    }
  }
  // Every tier is exhausted before falling back to a root-level match, so an
  // explicit `claudeAiOauth` on any item always wins.
  return legacyRootMatch;
}

// `security dump-keychain` without `-d` prints item *metadata* only: it never
// decrypts a password and never prompts. Finds login items this environment
// cannot name, newest-modified first.
function discoverClaudeCodeKeychainItems(): ClaudeCodeKeychainCandidate[] {
  let dump: string;
  try {
    dump = execFileSync("security", ["dump-keychain"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return [];
  }
  const found: Array<ClaudeCodeKeychainCandidate & { modified: string }> = [];
  let account: string | undefined;
  let modified = "";
  let service: string | undefined;
  const flush = () => {
    if (service && claudeCodeKeychainServicePattern.test(service)) {
      found.push({ account, modified, service });
    }
    account = undefined;
    modified = "";
    service = undefined;
  };
  for (const line of dump.split("\n")) {
    if (line.startsWith("keychain:")) {
      flush();
      continue;
    }
    const serviceMatch = /^\s*"svce"<blob>="(.*)"$/.exec(line);
    if (serviceMatch) {
      service = serviceMatch[1];
      continue;
    }
    const accountMatch = /^\s*"acct"<blob>="(.*)"$/.exec(line);
    if (accountMatch) {
      account = accountMatch[1];
      continue;
    }
    const modifiedMatch = /^\s*"mdat"<timedate>=.*"(\d{14})Z/.exec(line);
    if (modifiedMatch) {
      modified = modifiedMatch[1];
    }
  }
  flush();
  return found
    .sort((left, right) => right.modified.localeCompare(left.modified))
    .map(({ account: itemAccount, service: itemService }) => ({ account: itemAccount, service: itemService }));
}

function readClaudeCodeKeychainRecord(
  candidate: ClaudeCodeKeychainCandidate,
  scan: ClaudeCodeLoginScan,
  label: string
): Record<string, unknown> | undefined {
  const args = ["find-generic-password", "-s", candidate.service, "-w"];
  if (candidate.account !== undefined) {
    args.splice(1, 0, "-a", candidate.account);
  }
  try {
    const output = execFileSync("security", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const parsed = JSON.parse(output.trim()) as unknown;
    if (isRecord(parsed)) {
      return parsed;
    }
    scan.errors.push(`keychain:${label}: item is not a JSON object`);
    return undefined;
  } catch (error) {
    const message = keychainErrorMessage(error);
    // errSecItemNotFound is the ordinary "no such login" answer, not a fault:
    // recording it would turn a logged-out machine into a `locked` candidate.
    if (message !== undefined) {
      scan.errors.push(`keychain:${label}: ${message}`);
    }
    return undefined;
  }
}

// Returns undefined when the item simply does not exist.
function keychainErrorMessage(error: unknown): string | undefined {
  if (error instanceof SyntaxError) {
    return `item is not valid JSON (${error.message})`;
  }
  const failure = error as { status?: number; stderr?: Buffer | string } | undefined;
  if (failure?.status === keychainItemNotFoundStatus) {
    return undefined;
  }
  const stderr = typeof failure?.stderr === "string" ? failure.stderr : failure?.stderr?.toString("utf8");
  const message = stderr?.trim().replace(/\s*\n\s*/g, "; ");
  if (message) {
    return /could not be found/i.test(message) ? undefined : message;
  }
  return failure?.status === undefined ? String(error) : `security exited ${failure.status}`;
}
