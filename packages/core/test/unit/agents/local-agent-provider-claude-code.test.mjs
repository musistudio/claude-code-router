import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claudeCodeCandidate, importClaudeCodeProvider } from "@ccr/core/agents/local-providers/claude-code.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";

test("Claude Code local provider prefers macOS Keychain credentials over stale file credentials", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityOutput({
        claudeAiOauth: {
          accessToken: "keychain-access-token",
          refreshToken: "keychain-refresh-token"
        }
      }, async () => {
        writeClaudeCredentials(home, {
          access_token: "stale-file-access-token",
          refresh_token: "stale-file-refresh-token"
        });

        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, `keychain:Claude Code-credentials (${keychainAccount})`);

        const result = importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer keychain-access-token");
        assert.equal(result.providerPlugins[1].auth.headers.authorization, "Bearer keychain-access-token");
      });
    });
  });
});

test("Claude Code local provider falls back to file credentials when Keychain is unavailable", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityFailure(async () => {
        const credentialFile = writeClaudeCredentials(home, {
          accessToken: "file-access-token",
          refreshToken: "file-refresh-token"
        });

        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, credentialFile);

        const result = importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer file-access-token");
      });
    });
  });
});

test("Core gateway config replaces imported Claude Code OAuth token with live macOS Keychain token", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityOutput({
        access_token: "keychain-runtime-token",
        refresh_token: "keychain-refresh-token"
      }, async () => {
        const config = createDefaultAppConfig();
        config.providerPlugins = [
          {
            auth: {
              headers: {
                authorization: "Bearer imported-stale-token",
                "anthropic-beta": "oauth-2025-04-20"
              },
              removeHeaders: ["x-api-key"],
              strict: true
            },
            key: "ccr-local-agent-claude-code-api-claude-code-oauth",
            providerName: "Claude Code API"
          }
        ];
        config.Providers = [
          {
            api_base_url: "https://api.anthropic.com",
            id: "claude-code-api",
            models: ["claude-sonnet-5"],
            name: "Claude Code API",
            type: "anthropic_messages"
          }
        ];

        const compiled = await compileCoreGatewayConfig(config, "raw-trace-token", "billing-usage-token", "core-auth-token");
        const plugin = compiled.providerPlugins.find((item) => item.key === "ccr-local-agent-claude-code-api-claude-code-oauth");

        assert.equal(plugin.auth.headers.authorization, "Bearer keychain-runtime-token");
        assert.deepEqual(plugin.auth.headers["anthropic-beta"], {
          default: "oauth-2025-04-20",
          from: "request.headers.anthropic-beta"
        });
      });
    });
  });
});

// Claude Code >= 2.1 writes the credential item under the current $USER and
// leaves any pre-2.1 item (account "unknown") in place on the same service
// name. A lookup without `-a` matches the stale one, which only carries MCP
// plugin OAuth. See musistudio/claude-code-router#1601.
test("Claude Code local provider reads the credential item stored under the current account", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: "unknown",
          modified: "20260604091803",
          record: { mcpOAuth: { "plugin:github|1": { expiresAt: 1 } } },
          service: "Claude Code-credentials"
        },
        {
          account: keychainAccount,
          modified: "20260729042837",
          record: { claudeAiOauth: { accessToken: "live-access-token", refreshToken: "live-refresh-token" } },
          service: "Claude Code-credentials"
        }
      ], async () => {
        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, `keychain:Claude Code-credentials (${keychainAccount})`);

        const result = importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer live-access-token");
      });
    });
  });
});

// The only path to an item written under a different account (a login made as
// another user, or a $USER that has since changed) is `security dump-keychain`
// enumeration; the expected-name lookup cannot reach it.
test("Claude Code local provider enumerates the keychain to find an item under another account", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: "other-user",
          modified: "20260729042837",
          record: { claudeAiOauth: { accessToken: "enumerated-access-token" } },
          service: "Claude Code-credentials",
          accountlessLookup: false
        }
      ], async () => {
        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, "keychain:Claude Code-credentials (other-user)");

        const result = importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer enumerated-access-token");
      });
    });
  });
});

// mcpOAuth holds per-plugin tokens that are not Anthropic API credentials;
// importing one yields a provider that 401s on every request.
test("Claude Code local provider ignores mcpOAuth plugin tokens in favour of claudeAiOauth", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: keychainAccount,
          modified: "20260729042837",
          record: {
            mcpOAuth: { "plugin:github|1": { accessToken: "mcp-plugin-token", refreshToken: "mcp-plugin-refresh" } },
            claudeAiOauth: { accessToken: "live-access-token", refreshToken: "live-refresh-token" }
          },
          service: "Claude Code-credentials"
        }
      ], async () => {
        const result = importClaudeCodeProvider(claudeCodeCandidate(), []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer live-access-token");
      });
    });
  });
});

// Regression for the review on #1604: an mcpOAuth-only record must yield no
// token at all, not a plugin token demoted to a fallback.
test("Claude Code local provider does not import an mcpOAuth-only keychain token", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: keychainAccount,
          modified: "20260729042837",
          record: {
            mcpOAuth: {
              "plugin:github|1": {
                accessToken: "mcp-plugin-token",
                refreshToken: "mcp-plugin-refresh"
              }
            }
          },
          service: "Claude Code-credentials"
        }
      ], async () => {
        const candidate = claudeCodeCandidate();

        assert.equal(candidate.status, "locked");
        assert.equal(candidate.importable, false);
        assert.match(candidate.detail, /no OAuth token/);
        assert.match(candidate.detail, /mcpOAuth/);
        assert.throws(
          () => importClaudeCodeProvider(candidate, []),
          /Claude Code access token was not found/
        );
      });
    });
  });
});

// An mcpOAuth-only keychain record must not short-circuit the file fallback.
test("Claude Code local provider prefers file credentials over an mcpOAuth-only keychain token", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: keychainAccount,
          modified: "20260729042837",
          record: {
            mcpOAuth: {
              "plugin:github|1": {
                accessToken: "mcp-plugin-token",
                refreshToken: "mcp-plugin-refresh"
              }
            }
          },
          service: "Claude Code-credentials"
        }
      ], async () => {
        const credentialFile = writeClaudeCredentials(home, {
          accessToken: "file-access-token",
          refreshToken: "file-refresh-token"
        });

        const candidate = claudeCodeCandidate();

        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, credentialFile);

        const result = importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer file-access-token");
      });
    });
  });
});

// With CLAUDE_CONFIG_DIR set, Claude Code appends the first 8 hex of
// sha256(NFC(configDir)) to the service name.
test("Claude Code local provider reads the config-dir-suffixed keychain service", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      const configDir = path.join(home, "alt-claude");
      const suffix = createHash("sha256").update(configDir.normalize("NFC")).digest("hex").slice(0, 8);
      const service = `Claude Code-credentials-${suffix}`;
      await withEnv("CLAUDE_CONFIG_DIR", configDir, async () => {
        await withFakeSecurityKeychain([
          {
            account: keychainAccount,
            modified: "20260729042837",
            record: { claudeAiOauth: { accessToken: "suffixed-access-token" } },
            service
          }
        ], async () => {
          const candidate = claudeCodeCandidate();
          assert.equal(candidate.status, "available");
          assert.equal(candidate.sourceFile, `keychain:${service} (${keychainAccount})`);
        });
      });
    });
  });
});

test("Claude Code local provider explains login state that carries no OAuth token", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: keychainAccount,
          modified: "20260729042837",
          record: { mcpOAuth: { "plugin:github|1": { expiresAt: 1 } } },
          service: "Claude Code-credentials"
        }
      ], async () => {
        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "locked");
        assert.equal(candidate.importable, false);
        assert.match(candidate.detail, /no OAuth token/);
        assert.match(candidate.detail, /mcpOAuth/);
      });
    });
  });
});

// errSecItemNotFound is the ordinary logged-out answer: it must not be reported
// as an unreadable store.
test("Claude Code local provider reports a missing candidate when no keychain item exists", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([], async () => {
        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "missing");
        assert.equal(candidate.importable, false);
        assert.equal(candidate.detail, "No local login state was found for this agent.");
      });
    });
  });
});

async function withClaudeCodeHome(run) {
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-claude-code-provider-"));
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  try {
    await run(home);
  } finally {
    restoreEnv("HOME", previousHome);
    rmSync(home, { force: true, recursive: true });
  }
}

async function withPlatform(platform, run) {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform
  });
  try {
    await run();
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
}

async function withFakeSecurityOutput(output, run) {
  await withFakeSecurityScript(`cat <<'CCR_KEYCHAIN_JSON'\n${JSON.stringify(output)}\nCCR_KEYCHAIN_JSON\n`, run);
}

async function withFakeSecurityFailure(run) {
  await withFakeSecurityScript("exit 44\n", run);
}

// Pins $USER as well as PATH: the provider looks the keychain item up under the
// current account, so the expected item name has to be deterministic.
async function withFakeSecurityScript(body, run) {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "ccr-security-bin-"));
  const securityPath = path.join(binDir, "security");
  const previousPath = process.env.PATH;
  const previousUser = process.env.USER;
  writeFileSync(securityPath, `#!/bin/sh\n${body}`);
  chmodSync(securityPath, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
  process.env.USER = keychainAccount;
  try {
    await run();
  } finally {
    restoreEnv("PATH", previousPath);
    restoreEnv("USER", previousUser);
    rmSync(binDir, { force: true, recursive: true });
  }
}

const keychainAccount = "ccr-test-user";

// Stands in for the macOS keychain: `find-generic-password` matches on
// service+account, an omitted `-a` matches the first item registered for the
// service (as the real Keychain picks an arbitrary one), and `dump-keychain`
// prints the metadata-only listing the provider parses.
async function withFakeSecurityKeychain(items, run) {
  await withFakeSecurityScript(fakeSecurityBody(items), run);
}

function fakeSecurityBody(items) {
  const dump = [
    ...items.map(item => [
      `keychain: "/tmp/login.keychain-db"`,
      "version: 512",
      "class: \"genp\"",
      "attributes:",
      `    "acct"<blob>="${item.account}"`,
      `    "mdat"<timedate>=0x00  "${item.modified}Z\\000"`,
      `    "svce"<blob>="${item.service}"`
    ].join("\n")),
    [
      `keychain: "/tmp/login.keychain-db"`,
      "attributes:",
      `    "acct"<blob>="unrelated"`,
      `    "svce"<blob>="Bitwarden Safe Storage"`
    ].join("\n")
  ].join("\n");

  // `accountlessLookup: false` models an item the Keychain will not return for
  // a `-s`-only query, so only enumeration can reach it.
  const firstForService = new Map();
  for (const item of items) {
    if (item.accountlessLookup !== false && !firstForService.has(item.service)) {
      firstForService.set(item.service, item);
    }
  }
  const branches = [
    ...items.map((item, index) => ({ key: `${item.service}|${item.account}`, record: item.record, tag: `CCR_J${index}` })),
    ...[...firstForService.values()].map((item, index) => ({ key: `${item.service}|`, record: item.record, tag: `CCR_A${index}` }))
  ];

  return [
    `if [ "$1" = "dump-keychain" ]; then`,
    `cat <<'CCR_DUMP'`,
    dump,
    "CCR_DUMP",
    "exit 0",
    "fi",
    "shift",
    "acct=''",
    "svc=''",
    "while [ $# -gt 0 ]; do",
    `  case "$1" in`,
    `    -a) acct="$2"; shift 2 ;;`,
    `    -s) svc="$2"; shift 2 ;;`,
    "    *) shift ;;",
    "  esac",
    "done",
    `case "$svc|$acct" in`,
    ...branches.map(branch => [
      `"${branch.key}")`,
      `cat <<'${branch.tag}'`,
      JSON.stringify(branch.record),
      branch.tag,
      "exit 0 ;;"
    ].join("\n")),
    "esac",
    `echo 'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.' >&2`,
    "exit 44"
  ].join("\n");
}

async function withEnv(name, value, run) {
  const previous = process.env[name];
  process.env[name] = value;
  try {
    await run();
  } finally {
    restoreEnv(name, previous);
  }
}

function writeClaudeCredentials(home, credentials) {
  const directory = path.join(home, ".claude");
  const credentialFile = path.join(directory, ".credentials.json");
  mkdirSync(directory, { recursive: true });
  writeFileSync(credentialFile, JSON.stringify(credentials, null, 2));
  return credentialFile;
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
