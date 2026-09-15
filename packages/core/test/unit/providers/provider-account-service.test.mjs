import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  localAgentProviderAccountCredentialForTest,
  localCodexAccountCredentialForTest,
  setProviderAccountWebContentFetchHandler,
  testProviderAccountConnector
} from "@ccr/core/providers/account-service.ts";
import {
  grokDefaultBillingEndpoint,
  grokDefaultBaseUrl,
  grokDefaultSubscriptionEndpoint,
  grokProviderAccountConfig
} from "@ccr/core/agents/local-providers/grok.ts";
import { findProviderPreset } from "@ccr/core/providers/presets/index.ts";

const localAgentProviderApiKey = "ccr-local-agent-login";
const codexDefaultBaseUrl = "https://chatgpt.com/backend-api/codex";
const zcodeDefaultBaseUrl = "https://zcode.z.ai/api/v1/zcode-plan/anthropic";

test("Grok billing connector maps credit usage payload", async (t) => {
  const previousFetch = globalThis.fetch;
  let authorization = "";
  let clientIdentifier = "";
  let clientVersion = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), grokDefaultBillingEndpoint);
    authorization = init?.headers?.authorization ?? "";
    clientIdentifier = init?.headers?.["x-grok-client-identifier"] ?? "";
    clientVersion = init?.headers?.["x-grok-client-version"] ?? "";
    return new Response(JSON.stringify({
      config: {
        billingPeriodEnd: "2026-08-01T00:00:00Z",
        creditUsagePercent: { val: 25 },
        includedUsed: { val: 10 },
        monthlyLimit: { val: 40 },
        onDemandCap: { val: 100 },
        onDemandUsed: { val: 5 },
        prepaidBalance: { val: 12 },
        totalUsed: { val: 15 }
      }
    }), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const connector = grokProviderAccountConfig().connectors?.[0];
  assert.equal(connector?.type, "http-json");
  const result = await testProviderAccountConnector({
    apiKey: "grok-access-token",
    baseUrl: grokDefaultBaseUrl,
    connector,
    providerName: "Grok CLI API"
  });

  assert.equal(authorization, "Bearer grok-access-token");
  assert.equal(clientIdentifier, "xai-grok-cli");
  assert.equal(clientVersion, "0.2.93");
  assert.equal(result.meters.find((meter) => meter.id === "grok_credit_usage_percent")?.remaining, 75);
  assert.equal(result.meters.find((meter) => meter.id === "grok_included_credits")?.remaining, 30);
  assert.equal(result.meters.find((meter) => meter.id === "grok_total_credits")?.used, 15);
  assert.equal(result.meters.find((meter) => meter.id === "grok_pay_as_you_go_cap")?.remaining, 95);
  assert.equal(result.meters.find((meter) => meter.id === "grok_prepaid_balance")?.remaining, 12);
});

test("Grok subscription connector maps access status payload", async (t) => {
  const previousFetch = globalThis.fetch;
  let authorization = "";
  let clientIdentifier = "";
  let clientVersion = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), grokDefaultSubscriptionEndpoint);
    authorization = init?.headers?.authorization ?? "";
    clientIdentifier = init?.headers?.["x-grok-client-identifier"] ?? "";
    clientVersion = init?.headers?.["x-grok-client-version"] ?? "";
    return new Response(JSON.stringify({
      hasGrokCodeAccess: true,
      subscriptionTier: "SuperGrok Heavy"
    }), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const connector = grokProviderAccountConfig().connectors?.[1];
  assert.equal(connector?.type, "http-json");
  const result = await testProviderAccountConnector({
    apiKey: "grok-access-token",
    baseUrl: grokDefaultBaseUrl,
    connector,
    providerName: "Grok CLI API"
  });

  assert.equal(authorization, "Bearer grok-access-token");
  assert.equal(clientIdentifier, "xai-grok-cli");
  assert.equal(clientVersion, "0.2.93");
  assert.equal(result.status, "ok");
  assert.equal(result.message, "SuperGrok Heavy");
  assert.equal(result.meters.find((meter) => meter.id === "grok_subscription_access")?.remaining, 100);
});

test("OpenCode Go usage connector maps official windows to remaining percent", async (t) => {
  const previousFetch = globalThis.fetch;
  let authorization = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://opencode.ai/zen/go/v1/usage");
    authorization = init?.headers?.authorization ?? "";
    return new Response(JSON.stringify({
      usage: {
        rolling: { resetsAt: "2026-09-11T20:00:00.000Z", status: "ok", percent: 12 },
        weekly: { resetsAt: "2026-09-14T00:00:00.000Z", status: "ok", percent: 34 },
        monthly: { resetsAt: "2026-10-01T00:00:00.000Z", status: "limit_reached", percent: 100 }
      }
    }), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const connector = findProviderPreset("opencode-go")?.account?.connectors?.[0];
  assert.equal(connector?.type, "http-json");
  const result = await testProviderAccountConnector({
    apiKey: "opencode-go-key",
    baseUrl: "https://opencode.ai/zen/go/v1",
    connector,
    providerName: "OpenCode Go"
  });

  assert.equal(authorization, "Bearer opencode-go-key");
  const rolling = result.meters.find((meter) => meter.id === "opencode_go_5h");
  assert.equal(rolling?.used, 12);
  assert.equal(rolling?.remaining, 88);
  assert.equal(rolling?.limit, 100);
  assert.equal(rolling?.unit, "%");
  assert.equal(rolling?.resetAt, "2026-09-11T20:00:00.000Z");
  assert.equal(result.meters.find((meter) => meter.id === "opencode_go_weekly")?.remaining, 66);
  assert.equal(result.meters.find((meter) => meter.id === "opencode_go_monthly")?.remaining, 0);
});

test("webcontent-json connector uses browser-session handler without provider API key", async (t) => {
  let captured;
  setProviderAccountWebContentFetchHandler(async (request) => {
    captured = request;
    return {
      payload: {
        balance: 42,
        message: "Signed in"
      }
    };
  });
  t.after(() => {
    setProviderAccountWebContentFetchHandler(undefined);
  });

  const result = await testProviderAccountConnector({
    apiKey: "should-not-reach-handler",
    baseUrl: "https://vendor.example.com/v1",
    connector: {
      browser: {
        headerTemplates: {
          authorization: "Bearer ${localStorage.accessToken}"
        },
        loginUrl: "https://vendor.example.com/login",
        requestOrigin: "https://vendor.example.com",
        timeoutMs: 12000
      },
      endpoint: "https://api.vendor.example.com/account",
      headers: {
        "x-csrf-token": "csrf"
      },
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.balance",
            unit: "USD"
          }
        ],
        message: "$.message"
      },
      type: "webcontent-json"
    },
    providerName: "Vendor"
  });

  assert.equal(captured.endpoint, "https://api.vendor.example.com/account");
  assert.equal(captured.credentials, "omit");
  assert.equal(captured.method, "GET");
  assert.equal(captured.requestOrigin, "https://vendor.example.com");
  assert.equal(captured.loginUrl, "https://vendor.example.com/login");
  assert.equal(captured.headerTemplates.authorization, "Bearer ${localStorage.accessToken}");
  assert.equal(captured.provider.api_key, "");
  assert.equal(captured.provider.apiKey, undefined);
  assert.equal(captured.headers["x-csrf-token"], "csrf");
  assert.equal(result.message, "Signed in");
  assert.equal(result.meters[0].remaining, 42);
  assert.equal(result.meters[0].source, "webcontent-json");
});

test("webcontent-json connector defaults browser request origin to login URL origin", async (t) => {
  let captured;
  setProviderAccountWebContentFetchHandler(async (request) => {
    captured = request;
    return {
      payload: {
        balance: 7
      }
    };
  });
  t.after(() => {
    setProviderAccountWebContentFetchHandler(undefined);
  });

  const result = await testProviderAccountConnector({
    baseUrl: "https://vendor.example.com/v1",
    connector: {
      browser: {
        loginUrl: "https://app.vendor.example.com/login"
      },
      endpoint: "https://api.vendor.example.com/account",
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.balance",
            unit: "USD"
          }
        ]
      },
      type: "webcontent-json"
    },
    providerName: "Vendor"
  });

  assert.equal(captured.endpoint, "https://api.vendor.example.com/account");
  assert.equal(captured.credentials, "include");
  assert.equal(captured.requestOrigin, "https://app.vendor.example.com");
  assert.equal(result.meters[0].remaining, 7);
});

test("webcontent-json connector reports unsupported outside CCR Desktop", async () => {
  setProviderAccountWebContentFetchHandler(undefined);

  await assert.rejects(
    () => testProviderAccountConnector({
      baseUrl: "https://vendor.example.com/v1",
      connector: {
        endpoint: "https://vendor.example.com/account",
        mapping: { meters: [] },
        type: "webcontent-json"
      },
      providerName: "Vendor"
    }),
    /only available in CCR Desktop/
  );
});

test("Codex local account credential refreshes when only a refresh token is available", async (t) => {
  const previousHome = process.env.CCR_INTERNAL_HOME_DIR;
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-codex-account-refresh-"));
  mkdirSync(path.join(home, ".codex"), { recursive: true });
  process.env.CCR_INTERNAL_HOME_DIR = home;
  t.after(() => {
    if (previousHome === undefined) {
      delete process.env.CCR_INTERNAL_HOME_DIR;
    } else {
      process.env.CCR_INTERNAL_HOME_DIR = previousHome;
    }
  });

  let requestBody = "";
  let requestUrl = "";
  const accessToken = jwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-refreshed"
    },
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api.connectors.read api.connectors.invoke"
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: "refresh-next",
        scope: "api.connectors.read api.connectors.invoke"
      }),
      { headers: { "content-type": "application/json" }, status: 200 }
    );
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const credential = await localCodexAccountCredentialForTest({
    codexOauth: {
      refreshToken: "refresh-only",
      tokenEndpoint: "http://127.0.0.1/oauth/token"
    },
    key: "ccr-local-agent-codex-api-codex-oauth",
    providerName: "Codex API"
  });

  assert.equal(credential.apiKey, accessToken);
  assert.equal(credential.headers?.["ChatGPT-Account-Id"], "acct-refreshed");
  assert.equal(requestUrl, "http://127.0.0.1/oauth/token");
  assert.deepEqual(JSON.parse(requestBody), {
    client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
    grant_type: "refresh_token",
    refresh_token: "refresh-only",
    scope: "openid profile email offline_access api.connectors.read api.connectors.invoke"
  });
});

test("Codex local account credential matches internal provider plugin names", async (t) => {
  useTemporaryCodexHome(t, "ccr-codex-account-internal-plugin-");
  const accessToken = jwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-internal"
    },
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api.connectors.read api.connectors.invoke"
  });

  const credential = await localAgentProviderAccountCredentialForTest({
    providerPlugins: [
      {
        codexOauth: {
          accessToken
        },
        key: "ccr-local-agent-codex-api-codex-oauth-internal",
        providerName: "codex-api::openai_responses"
      }
    ]
  }, {
    api_base_url: codexDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    id: "codex-api",
    models: ["gpt-5-codex"],
    name: "Renamed Codex API",
    type: "openai_responses"
  });

  assert.equal(credential?.apiKey, accessToken);
  assert.equal(credential?.headers?.["ChatGPT-Account-Id"], "acct-internal");
});

test("Codex local account credential falls back to the live auth file when plugin is missing", async (t) => {
  const home = useTemporaryCodexHome(t, "ccr-codex-account-live-auth-");
  const codexHome = path.join(home, ".codex");
  mkdirSync(codexHome, { recursive: true });
  const accessToken = jwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-live"
    },
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api.connectors.read api.connectors.invoke"
  });
  writeFileSync(path.join(codexHome, "auth.json"), JSON.stringify({
    auth_mode: "chatgpt",
    tokens: {
      access_token: accessToken
    }
  }));

  const credential = await localAgentProviderAccountCredentialForTest({
    providerPlugins: []
  }, {
    api_base_url: codexDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    id: "codex-api",
    models: ["gpt-5-codex"],
    name: "Codex API",
    type: "openai_responses"
  });

  assert.equal(credential?.apiKey, accessToken);
  assert.equal(credential?.headers?.["ChatGPT-Account-Id"], "acct-live");
});

test("Claude Code local account credential prefers live macOS Keychain token", { skip: process.platform === "win32" }, async (t) => {
  const home = useTemporaryHome(t, "ccr-claude-code-account-live-keychain-");
  usePlatform(t, "darwin");
  useFakeSecurityOutput(t, {
    access_token: "keychain-account-token",
    refresh_token: "keychain-refresh-token"
  });
  process.env.HOME = home;

  const credential = await localAgentProviderAccountCredentialForTest({
    providerPlugins: [
      {
        auth: {
          headers: {
            authorization: "Bearer imported-stale-token",
            "anthropic-beta": "oauth-2025-04-20"
          },
          strict: true
        },
        key: "ccr-local-agent-claude-code-api-claude-code-oauth-internal",
        providerName: "claude-code-api::anthropic_messages"
      }
    ]
  }, {
    api_base_url: "https://api.anthropic.com",
    api_key: localAgentProviderApiKey,
    id: "claude-code-api",
    models: ["claude-sonnet-5"],
    name: "Renamed Claude Code API",
    type: "anthropic_messages"
  });

  assert.equal(credential?.apiKey, "keychain-account-token");
  assert.equal(credential?.headers?.authorization, undefined);
  assert.equal(credential?.headers?.["anthropic-beta"], "oauth-2025-04-20");
});

test("Kimi local account credential carries its API key and CLI identity", async (t) => {
  const home = useTemporaryCodexHome(t, "ccr-kimi-account-plugin-");
  const previousVersion = process.env.KIMI_CODE_VERSION;
  process.env.KIMI_CODE_VERSION = "0.27.0-test";
  t.after(() => {
    if (previousVersion === undefined) delete process.env.KIMI_CODE_VERSION;
    else process.env.KIMI_CODE_VERSION = previousVersion;
  });

  const credential = await localAgentProviderAccountCredentialForTest({
    providerPlugins: [
      {
        auth: {
          headers: { authorization: "Bearer kimi-plugin-key" },
          strict: true
        },
        key: "ccr-local-agent-kimi-api-kimi-cli-api-key-internal",
        providerName: "kimi-api::openai_chat_completions"
      }
    ]
  }, {
    api_base_url: "https://api.kimi.com/coding/v1",
    api_key: localAgentProviderApiKey,
    id: "kimi-api",
    models: ["k3"],
    name: "Renamed Kimi API",
    type: "openai_chat_completions"
  });

  assert.equal(credential?.apiKey, "kimi-plugin-key");
  assert.equal(credential?.headers?.["User-Agent"], "kimi-code-cli/0.27.0-test");
  assert.equal(credential?.headers?.["X-Msh-Platform"], "kimi_code_cli");
  assert.ok(credential?.headers?.["X-Msh-Device-Id"]);
  assert.equal(existsSync(path.join(home, ".kimi-code", "device_id")), true);
});

test("ZCode local account credential matches internal provider plugin names", async () => {
  const credential = await localAgentProviderAccountCredentialForTest({
    providerPlugins: [
      {
        auth: {
          headers: {
            "x-api-key": "zcode-plugin-key"
          },
          removeHeaders: ["authorization"],
          strict: true
        },
        key: "ccr-local-agent-zcode-api-zcode-api-key-internal",
        providerName: "zcode-api::anthropic_messages"
      }
    ]
  }, {
    api_base_url: zcodeDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    id: "zcode-api",
    models: ["GLM-5.2"],
    name: "Renamed ZCode API",
    type: "anthropic_messages"
  });

  assert.equal(credential?.apiKey, "zcode-plugin-key");
});

test("ZCode local account credential falls back to the live config when plugin is missing", async (t) => {
  const home = useTemporaryCodexHome(t, "ccr-zcode-account-live-config-");
  const zcodeConfigDir = path.join(home, ".zcode", "cli");
  mkdirSync(zcodeConfigDir, { recursive: true });
  writeFileSync(path.join(zcodeConfigDir, "config.json"), JSON.stringify({
    provider: {
      zcode: {
        enabled: true,
        kind: "anthropic",
        models: ["GLM-5.2"],
        name: "ZCode",
        options: {
          apiKey: "zcode-live-key",
          baseURL: zcodeDefaultBaseUrl
        }
      }
    }
  }));

  const credential = await localAgentProviderAccountCredentialForTest({
    providerPlugins: []
  }, {
    api_base_url: zcodeDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    id: "zcode-api",
    models: ["GLM-5.2"],
    name: "ZCode API",
    type: "anthropic_messages"
  });

  assert.equal(credential?.apiKey, "zcode-live-key");
});

test("OpenCode local account credential reuses the imported plugin key", async () => {
  const bearer = await localAgentProviderAccountCredentialForTest({
    providerPlugins: [
      {
        auth: {
          headers: { authorization: "Bearer opencode-go-key" },
          removeHeaders: ["x-api-key"],
          strict: true
        },
        key: "ccr-local-agent-opencode-go-chat-completions-opencode-go-openai-chat-completions-api-key",
        providerName: "OpenCode Go (Chat Completions)"
      }
    ]
  }, {
    api_base_url: "https://opencode.ai/zen/go/v1",
    api_key: localAgentProviderApiKey,
    id: "opencode-go-api-openai-chat-completions",
    models: ["kimi-k2.7-code"],
    name: "OpenCode Go (Chat Completions)",
    type: "openai_chat_completions"
  });

  assert.equal(bearer?.apiKey, "opencode-go-key");
  assert.equal(bearer?.headers?.authorization, undefined);

  const anthropic = await localAgentProviderAccountCredentialForTest({
    providerPlugins: [
      {
        auth: {
          headers: { "x-api-key": "opencode-go-anthropic-key" },
          removeHeaders: ["authorization"],
          strict: true
        },
        key: "ccr-local-agent-opencode-go-anthropic-messages-opencode-go-anthropic-messages-api-key",
        providerName: "opencode-go-api-anthropic-messages::anthropic_messages"
      }
    ]
  }, {
    api_base_url: "https://opencode.ai/zen/go/v1",
    api_key: localAgentProviderApiKey,
    id: "opencode-go-api-anthropic-messages",
    models: ["minimax-m3"],
    name: "Renamed OpenCode Go",
    type: "anthropic_messages"
  });

  assert.equal(anthropic?.apiKey, "opencode-go-anthropic-key");
  assert.equal(anthropic?.headers?.["x-api-key"], undefined);
});

function useTemporaryCodexHome(t, prefix) {
  const home = useTemporaryHome(t, prefix);
  mkdirSync(path.join(home, ".codex"), { recursive: true });
  return home;
}

function useTemporaryHome(t, prefix) {
  const previousHome = process.env.CCR_INTERNAL_HOME_DIR;
  const previousOsHome = process.env.HOME;
  const previousZcodeHome = process.env.ZCODE_HOME;
  const previousZcodeStorageDir = process.env.ZCODE_STORAGE_DIR;
  const home = mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.CCR_INTERNAL_HOME_DIR = home;
  delete process.env.ZCODE_HOME;
  delete process.env.ZCODE_STORAGE_DIR;
  t.after(() => {
    if (previousHome === undefined) {
      delete process.env.CCR_INTERNAL_HOME_DIR;
    } else {
      process.env.CCR_INTERNAL_HOME_DIR = previousHome;
    }
    if (previousOsHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousOsHome;
    }
    if (previousZcodeHome === undefined) {
      delete process.env.ZCODE_HOME;
    } else {
      process.env.ZCODE_HOME = previousZcodeHome;
    }
    if (previousZcodeStorageDir === undefined) {
      delete process.env.ZCODE_STORAGE_DIR;
    } else {
      process.env.ZCODE_STORAGE_DIR = previousZcodeStorageDir;
    }
    rmSync(home, { force: true, recursive: true });
  });
  return home;
}

function usePlatform(t, platform) {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform
  });
  t.after(() => {
    Object.defineProperty(process, "platform", descriptor);
  });
}

function useFakeSecurityOutput(t, output) {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "ccr-security-bin-"));
  const securityPath = path.join(binDir, "security");
  const previousPath = process.env.PATH;
  writeFileSync(securityPath, `#!/bin/sh\ncat <<'CCR_KEYCHAIN_JSON'\n${JSON.stringify(output)}\nCCR_KEYCHAIN_JSON\n`);
  chmodSync(securityPath, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
  t.after(() => {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    rmSync(binDir, { force: true, recursive: true });
  });
}

function jwt(payload) {
  return [
    base64url({ alg: "none", typ: "JWT" }),
    base64url(payload),
    "signature"
  ].join(".");
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
