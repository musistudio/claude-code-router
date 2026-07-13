import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  grokCandidate,
  grokDefaultBillingEndpoint,
  grokDefaultBaseUrl,
  grokDefaultSubscriptionEndpoint,
  grokModelCatalogFromPayloadForTest,
  importGrokProvider,
  normalizeGrokProviderAccountConfig
} from "../../packages/core/src/agents/local-providers/grok.ts";
import { localAgentProviderApiKey } from "../../packages/core/src/agents/local-providers/shared.ts";

test("Grok local provider imports bearer token and model override plugin", async () => {
  await withGrokHome(async (grokHome) => {
    writeGrokAuth(grokHome, {
      key: "grok-access-token",
      refresh_token: "grok-refresh-token",
      expires_at: "2999-01-01T00:00:00Z"
    });
    writeFileSync(path.join(grokHome, "config.toml"), "[models]\ndefault = \"grok-4.5\"\n");
    writeGrokModels(grokHome);

    const candidate = grokCandidate();
    assert.equal(candidate.kind, "grok");
    assert.equal(candidate.importable, true);
    assert.equal(candidate.protocol, "openai_responses");
    assert.deepEqual(candidate.models, ["grok-4.5", "grok-composer-2.5-fast"]);
    assert.deepEqual(candidate.modelDisplayNames, {
      "grok-4.5": "Grok 4.5",
      "grok-composer-2.5-fast": "Composer 2.5"
    });

    const result = await importGrokProvider(candidate, []);
    assert.equal(result.provider.name, "Grok CLI API");
    assert.equal(result.provider.baseUrl, grokDefaultBaseUrl);
    assert.equal(result.provider.protocol, "openai_responses");
    assert.equal(result.provider.apiKey, "ccr-local-agent-login");
    assert.equal(result.provider.account?.enabled, true);
    assert.equal(result.provider.account?.connectors?.length, 2);
    assert.equal(result.provider.account?.connectors?.[0]?.type, "http-json");
    assert.equal(result.provider.account?.connectors?.[0]?.auth, "provider-api-key");
    assert.equal(result.provider.account?.connectors?.[0]?.endpoint, grokDefaultBillingEndpoint);
    assert.equal(result.provider.account?.connectors?.[0]?.headers?.["x-grok-client-identifier"], "xai-grok-cli");
    assert.equal(result.provider.account?.connectors?.[0]?.headers?.["x-grok-client-version"], "0.2.93");
    assert.deepEqual(
      result.provider.account?.connectors?.[0]?.mapping.meters.map((meter) => meter.id),
      [
        "grok_credit_usage_percent",
        "grok_included_credits",
        "grok_total_credits",
        "grok_pay_as_you_go_cap",
        "grok_prepaid_balance"
      ]
    );
    assert.equal(result.provider.account?.connectors?.[1]?.type, "http-json");
    assert.equal(result.provider.account?.connectors?.[1]?.auth, "provider-api-key");
    assert.equal(result.provider.account?.connectors?.[1]?.endpoint, grokDefaultSubscriptionEndpoint);
    assert.equal(result.provider.account?.connectors?.[1]?.headers?.["x-grok-client-identifier"], "xai-grok-cli");
    assert.equal(result.provider.account?.connectors?.[1]?.parser, "grok-subscription");
    assert.equal(result.providerPlugins.length, 2);
    assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer grok-access-token");
    assert.equal(result.providerPlugins[0].request.headers["x-grok-client-identifier"], "xai-grok-cli");
    assert.equal(result.providerPlugins[0].request.headers["x-grok-client-version"], "0.2.93");
    assert.equal(result.providerPlugins[0].request.headers["x-grok-model-override"], "{{ model }}");
    assert.equal(result.providerPlugins[1].providerName, "__CCR_PROVIDER_INTERNAL_NAME__");
  });
});

test("Grok local provider refreshes expired token during import", async (t) => {
  await withGrokHome(async (grokHome) => {
    writeGrokAuth(grokHome, {
      key: "expired-token",
      refresh_token: "grok-refresh-token",
      expires_at: "2000-01-01T00:00:00Z",
      oidc_client_id: "grok-client-id",
      oidc_issuer: "https://auth.x.ai"
    });
    writeGrokModels(grokHome);

    const previousFetch = globalThis.fetch;
    const previousTokenEndpoint = process.env.GROK_OIDC_TOKEN_ENDPOINT;
    process.env.GROK_OIDC_TOKEN_ENDPOINT = "http://127.0.0.1/grok/oauth/token";
    let requestBody = "";
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "http://127.0.0.1/grok/oauth/token");
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        access_token: "refreshed-grok-access-token",
        expires_in: 3600,
        refresh_token: "refreshed-grok-refresh-token"
      }), { headers: { "content-type": "application/json" }, status: 200 });
    };
    t.after(() => {
      globalThis.fetch = previousFetch;
      restoreEnv("GROK_OIDC_TOKEN_ENDPOINT", previousTokenEndpoint);
    });

    const candidate = grokCandidate();
    assert.equal(candidate.kind, "grok");
    assert.equal(candidate.importable, true);
    assert.equal(candidate.status, "available");

    const result = await importGrokProvider(candidate, []);
    assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer refreshed-grok-access-token");
    assert.equal(requestBody, "client_id=grok-client-id&grant_type=refresh_token&refresh_token=grok-refresh-token");

    const persisted = JSON.parse(readFileSync(path.join(grokHome, "auth.json"), "utf8"));
    assert.equal(persisted["https://auth.x.ai::test-account"].key, "refreshed-grok-access-token");
    assert.equal(persisted["https://auth.x.ai::test-account"].refresh_token, "refreshed-grok-refresh-token");
  });
});

test("Grok model catalog parser keeps responses models from the selected base URL", () => {
  const catalog = grokModelCatalogFromPayloadForTest({
    models: {
      "grok-4.5": {
        info: {
          api_backend: "responses",
          base_url: "https://cli-chat-proxy.grok.com/v1",
          context_window: 500000,
          model: "grok-4.5",
          name: "Grok 4.5",
          reasoning_effort: "high",
          supported_in_api: true
        }
      },
      "grok-hidden": {
        info: {
          api_backend: "responses",
          base_url: "https://cli-chat-proxy.grok.com/v1",
          hidden: true,
          model: "grok-hidden",
          name: "Hidden"
        }
      },
      "grok-chat": {
        info: {
          api_backend: "chat_completions",
          base_url: "https://cli-chat-proxy.grok.com/v1",
          model: "grok-chat",
          name: "Chat"
        }
      },
      "other-responses": {
        info: {
          api_backend: "responses",
          base_url: "https://example.com/v1",
          model: "other-responses",
          name: "Other"
        }
      }
    }
  }, "grok-4.5");

  assert.deepEqual(catalog.models, ["grok-4.5"]);
  assert.deepEqual(catalog.modelDisplayNames, { "grok-4.5": "Grok 4.5" });
  assert.deepEqual(catalog.modelMetadata, { "grok-4.5": { defaultReasoningLevel: "high" } });
  assert.equal(catalog.baseUrl, grokDefaultBaseUrl);
});

test("Grok local provider account config upgrades persisted usage mapping", () => {
  const provider = normalizeGrokProviderAccountConfig({
    account: {
      connectors: [],
      refreshIntervalMs: 45000
    },
    api_base_url: grokDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    models: ["grok-4.5"],
    name: "Grok CLI API",
    protocol: "openai_responses"
  });

  const connector = provider.account?.connectors?.[0];
  const subscriptionConnector = provider.account?.connectors?.[1];
  assert.equal(provider.account?.refreshIntervalMs, 45000);
  assert.equal(connector?.type, "http-json");
  assert.equal(connector?.endpoint, grokDefaultBillingEndpoint);
  assert.equal(connector?.mapping.meters.find((meter) => meter.id === "grok_credit_usage_percent")?.unit, "%");
  assert.equal(subscriptionConnector?.type, "http-json");
  assert.equal(subscriptionConnector?.endpoint, grokDefaultSubscriptionEndpoint);
  assert.equal(subscriptionConnector?.parser, "grok-subscription");
});

test("Grok local provider account config upgrades old web usage endpoints", () => {
  const provider = normalizeGrokProviderAccountConfig({
    account: {
      connectors: [
        {
          endpoint: "https://grok.com/billing?format=credits",
          mapping: { meters: [] },
          type: "http-json"
        },
        {
          endpoint: "https://grok.com/user?include=subscription",
          mapping: { meters: [] },
          parser: "grok-subscription",
          type: "http-json"
        }
      ]
    },
    api_base_url: grokDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    models: ["grok-4.5"],
    name: "Grok CLI API",
    protocol: "openai_responses"
  });

  assert.equal(provider.account?.connectors?.[0]?.type, "http-json");
  assert.equal(provider.account?.connectors?.[0]?.endpoint, grokDefaultBillingEndpoint);
  assert.equal(provider.account?.connectors?.[1]?.type, "http-json");
  assert.equal(provider.account?.connectors?.[1]?.endpoint, grokDefaultSubscriptionEndpoint);
});

test("Grok local provider account config keeps custom connectors", () => {
  const account = {
    connectors: [
      {
        endpoint: "https://example.com/usage",
        mapping: {
          meters: [
            {
              id: "custom",
              kind: "balance",
              label: "Custom",
              remaining: "$.balance",
              unit: "credits"
            }
          ]
        },
        type: "http-json"
      }
    ],
    enabled: true
  };

  const provider = normalizeGrokProviderAccountConfig({
    account,
    api_base_url: grokDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    models: ["grok-4.5"],
    name: "Grok CLI API",
    protocol: "openai_responses"
  });

  assert.equal(provider.account, account);
});

async function withGrokHome(run) {
  const previousGrokHome = process.env.GROK_HOME;
  const previousGrokAuthFile = process.env.GROK_AUTH_FILE;
  const previousGrokConfigFile = process.env.GROK_CONFIG_FILE;
  const previousGrokModelsCacheFile = process.env.GROK_MODELS_CACHE_FILE;
  const previousGrokTokenEndpoint = process.env.GROK_OIDC_TOKEN_ENDPOINT;
  const grokHome = mkdtempSync(path.join(os.tmpdir(), "ccr-grok-test-"));
  process.env.GROK_HOME = grokHome;
  delete process.env.GROK_AUTH_FILE;
  delete process.env.GROK_CONFIG_FILE;
  delete process.env.GROK_MODELS_CACHE_FILE;
  delete process.env.GROK_OIDC_TOKEN_ENDPOINT;
  try {
    await run(grokHome);
  } finally {
    restoreEnv("GROK_HOME", previousGrokHome);
    restoreEnv("GROK_AUTH_FILE", previousGrokAuthFile);
    restoreEnv("GROK_CONFIG_FILE", previousGrokConfigFile);
    restoreEnv("GROK_MODELS_CACHE_FILE", previousGrokModelsCacheFile);
    restoreEnv("GROK_OIDC_TOKEN_ENDPOINT", previousGrokTokenEndpoint);
    rmSync(grokHome, { force: true, recursive: true });
  }
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function writeGrokAuth(grokHome, auth) {
  writeFileSync(path.join(grokHome, "auth.json"), JSON.stringify({
    "https://auth.x.ai::test-account": auth
  }, null, 2));
}

function writeGrokModels(grokHome) {
  writeFileSync(path.join(grokHome, "models_cache.json"), JSON.stringify({
    models: {
      "grok-4.5": {
        info: {
          api_backend: "responses",
          auth_scheme: "bearer",
          base_url: grokDefaultBaseUrl,
          context_window: 500000,
          hidden: false,
          model: "grok-4.5",
          name: "Grok 4.5",
          reasoning_effort: "high",
          supported_in_api: true
        }
      },
      "grok-composer-2.5-fast": {
        info: {
          api_backend: "responses",
          auth_scheme: "bearer",
          base_url: grokDefaultBaseUrl,
          context_window: 200000,
          hidden: false,
          model: "grok-composer-2.5-fast",
          name: "Composer 2.5",
          reasoning_effort: null,
          supported_in_api: true
        }
      }
    }
  }, null, 2));
}
