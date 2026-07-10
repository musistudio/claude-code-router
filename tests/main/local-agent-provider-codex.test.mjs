import assert from "node:assert/strict";
import test from "node:test";
import {
  attachCodexRateLimitResetCreditDetails,
  codexDefaultBaseUrl,
  codexModelCatalogFromPayloadForTest,
  codexProviderAccountConfig,
  codexRateLimitResetCreditDetails,
  normalizeCodexProviderAccountConfig
} from "../../packages/core/src/agents/local-providers/codex.ts";
import { localAgentProviderApiKey } from "../../packages/core/src/agents/local-providers/shared.ts";

test("Codex provider account config includes manual reset meter", () => {
  const config = codexProviderAccountConfig();
  const usageConnector = config.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/usage"));
  assert.ok(usageConnector);

  const meters = usageConnector.mapping.meters;
  const manualResetMeter = meters.find((meter) => meter.id === "codex_manual_resets");
  assert.ok(manualResetMeter);
  assert.equal(manualResetMeter.label, "Manual resets");
  assert.equal(manualResetMeter.unit, "resets");
  assert.equal(manualResetMeter.window, "manual-reset");
  assert.ok(Array.isArray(manualResetMeter.remaining));
  assert.ok(manualResetMeter.remaining.includes("$.resetsAvailable"));
  assert.ok(manualResetMeter.remaining.includes("$.availableRateLimitResetCount"));
  assert.ok(manualResetMeter.remaining.includes("$.rate_limit_reset_credits.available_count"));
  assert.ok(manualResetMeter.remaining.includes("$.rate_limit.manual_resets.remaining"));
  assert.equal(manualResetMeter.remaining.at(-1), 0);
  assert.ok(Array.isArray(manualResetMeter.resetAt));
  assert.ok(manualResetMeter.resetAt.includes("$.resetExpires"));
  assert.ok(manualResetMeter.resetAt.includes("$.expires_at"));
  assert.ok(manualResetMeter.resetAt.includes("$.rate_limit.manual_resets.expires_at"));
  assert.ok(manualResetMeter.resetAt.includes("$.manual_resets.reset_at"));

  const resetCreditsConnector = config.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/rate-limit-reset-credits"));
  assert.ok(resetCreditsConnector);
  const resetCreditsMeter = resetCreditsConnector.mapping.meters.find((meter) => meter.id === "codex_manual_resets");
  assert.ok(resetCreditsMeter);
  assert.deepEqual(resetCreditsMeter.remaining, ["$.available_count", "$.rate_limit_reset_credits.available_count", 0]);
});

test("Codex quota meters accept reset_at and resets_at usage shapes", () => {
  const config = codexProviderAccountConfig();
  const usageConnector = config.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/usage"));
  const primaryQuota = usageConnector.mapping.meters.find((meter) => meter.id === "codex_primary_quota");
  const secondaryQuota = usageConnector.mapping.meters.find((meter) => meter.id === "codex_secondary_quota");

  assert.ok(Array.isArray(primaryQuota.resetAt));
  assert.ok(primaryQuota.resetAt.includes("$.rate_limit.primary_window.reset_at"));
  assert.ok(primaryQuota.resetAt.includes("$.rate_limit.primary_window.resets_at"));
  assert.ok(primaryQuota.resetAt.includes("$.rate_limits.primary.resets_at"));
  assert.ok(Array.isArray(secondaryQuota.resetAt));
  assert.ok(secondaryQuota.resetAt.includes("$.rate_limit.secondary_window.reset_at"));
  assert.ok(secondaryQuota.resetAt.includes("$.rate_limit.secondary_window.resets_at"));
  assert.ok(secondaryQuota.resetAt.includes("$.rate_limits.secondary.resets_at"));
});

test("Codex local provider account config upgrades persisted usage mapping", () => {
  const oldAccount = JSON.parse(JSON.stringify(codexProviderAccountConfig()));
  oldAccount.refreshIntervalMs = 45000;
  const usageConnector = oldAccount.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/usage"));
  const manualResetMeter = usageConnector.mapping.meters.find((meter) => meter.id === "codex_manual_resets");
  manualResetMeter.remaining = manualResetMeter.remaining.filter((path) => path !== "$.rate_limit_reset_credits.available_count");

  const provider = normalizeCodexProviderAccountConfig({
    account: oldAccount,
    api_base_url: codexDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    models: ["gpt-5-codex"],
    name: "Codex API",
    protocol: "openai_responses"
  });

  const upgradedUsageConnector = provider.account.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/usage"));
  const upgradedResetCreditsConnector = provider.account.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/rate-limit-reset-credits"));
  const upgradedManualResetMeter = upgradedUsageConnector.mapping.meters.find((meter) => meter.id === "codex_manual_resets");
  assert.equal(provider.account.refreshIntervalMs, 45000);
  assert.ok(upgradedResetCreditsConnector);
  assert.ok(upgradedManualResetMeter.remaining.includes("$.rate_limit_reset_credits.available_count"));
});

test("Codex reset credit details include available effective and expiry times", () => {
  const details = codexRateLimitResetCreditDetails({
    rate_limit_reset_credits: {
      credits: [
        {
          effective_at: "2026-07-03T00:00:00Z",
          expires_at: "2026-07-10T00:00:00Z",
          id: "reset-1",
          status: "available"
        },
        {
          effectiveAt: "2026-07-04T00:00:00Z",
          expiresAt: "2026-07-11T00:00:00Z",
          id: "reset-2",
          status: "available"
        },
        {
          effective_at: "2026-06-01T00:00:00Z",
          expires_at: "2026-06-08T00:00:00Z",
          id: "reset-expired",
          status: "expired"
        }
      ]
    }
  });

  assert.deepEqual(details.map((detail) => detail.id), ["reset-1", "reset-2"]);
  assert.equal(details[0].effectiveAt, "2026-07-03T00:00:00.000Z");
  assert.equal(details[0].expiresAt, "2026-07-10T00:00:00.000Z");
});

test("Codex reset credit details support reset credits endpoint shape", () => {
  const details = codexRateLimitResetCreditDetails({
    available_count: 2,
    credits: [
      {
        description: "Reset all Codex limits.",
        expires_at: "2026-08-02T00:00:00Z",
        id: "reset-root-1",
        start_date: "2026-07-03T00:00:00Z",
        status: "available",
        title: "Usage reset"
      },
      {
        expires_at: "2026-07-20T00:00:00Z",
        id: "reset-used",
        start_date: "2026-06-20T00:00:00Z",
        status: "used",
        title: "Used reset"
      }
    ]
  });

  assert.equal(details.length, 1);
  assert.equal(details[0].id, "reset-root-1");
  assert.equal(details[0].label, "Usage reset");
  assert.equal(details[0].description, "Reset all Codex limits.");
  assert.equal(details[0].redeemable, true);
  assert.equal(details[0].effectiveAt, "2026-07-03T00:00:00.000Z");
  assert.equal(details[0].expiresAt, "2026-08-02T00:00:00.000Z");
});

test("Codex reset credit details attach to manual reset meter", () => {
  const meters = attachCodexRateLimitResetCreditDetails([
    {
      id: "codex_manual_resets",
      kind: "requests",
      label: "Manual resets",
      remaining: 1,
      source: "http-json",
      unit: "resets",
      window: "manual-reset"
    }
  ], {
    rate_limit_reset_credits: {
      credits: [
        {
          effective_at: "2026-07-03T00:00:00Z",
          expires_at: "2026-07-10T00:00:00Z",
          id: "reset-1",
          status: "available"
        }
      ]
    }
  });

  assert.equal(meters[0].details.length, 1);
  assert.equal(meters[0].details[0].id, "reset-1");
  assert.equal(meters[0].resetAt, "2026-07-10T00:00:00.000Z");
});

test("Codex local provider account config keeps custom connectors", () => {
  const account = {
    connectors: [
      {
        auth: "none",
        endpoint: "https://example.com/account",
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

  const provider = normalizeCodexProviderAccountConfig({
    account,
    api_base_url: codexDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    models: ["gpt-5-codex"],
    name: "Codex API",
    protocol: "openai_responses"
  });

  assert.equal(provider.account, account);
});

test("Codex model catalog parser accepts live model endpoint shapes", () => {
  const catalog = codexModelCatalogFromPayloadForTest({
    data: [
      {
        additional_speed_tiers: [{ id: "fast", label: "Fast" }],
        default_reasoning_level: "high",
        display_name: "GPT-5 Codex",
        service_tiers: [{ id: "auto" }],
        slug: "gpt-5-codex",
        supported_reasoning_levels: [
          { description: "Low", effort: "low" },
          { description: "High", effort: "high" }
        ],
        supports_reasoning_summaries: true
      },
      { displayName: "GPT-5.1 Codex", id: "gpt-5.1-codex" }
    ],
    models: [
      "gpt-5-codex",
      { label: "GPT-5.2 Codex", name: "gpt-5.2-codex" }
    ]
  });

  assert.deepEqual(catalog.models, ["gpt-5-codex", "gpt-5.1-codex", "gpt-5.2-codex"]);
  assert.deepEqual(catalog.modelDisplayNames, {
    "gpt-5-codex": "GPT-5 Codex",
    "gpt-5.1-codex": "GPT-5.1 Codex",
    "gpt-5.2-codex": "GPT-5.2 Codex"
  });
  assert.deepEqual(catalog.modelMetadata["gpt-5-codex"], {
    additionalSpeedTiers: [{ id: "fast", label: "Fast" }],
    defaultReasoningLevel: "high",
    serviceTiers: [{ id: "auto" }],
    supportedReasoningLevels: [
      { description: "Low", effort: "low" },
      { description: "High", effort: "high" }
    ],
    supportsReasoningSummaries: true
  });
});
