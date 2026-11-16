import assert from "node:assert/strict";
import test from "node:test";
import { testProviderAccountConnector } from "@ccr/core/providers/account-service.ts";
import { findProviderPreset, findProviderPresetByBaseUrl } from "@ccr/core/providers/presets/index.ts";

// Real-shaped payloads, captured against the live endpoints on 2026-10-28.
//
// Z.ai: `percentage` is the CONSUMED share of the window — 6 % consumed means
// 94 % left — and the limit type is `CREDIT_LIMIT` (it used to be
// `TOKENS_LIMIT` before the plans moved from tokens to credits).
//
// MiniMax: `*_remaining_percent` is the REMAINING share, and `model_remains`
// carries one entry per model family ("general" for text/coding, "video").
const zaiQuotaPayload = {
  code: 200,
  data: {
    limits: [
      { type: "CREDIT_LIMIT", unit: 3, number: 5, usage: 28000, currentValue: 1869, remaining: 26130, percentage: 6, nextResetTime: 1793137319966 },
      { type: "CREDIT_LIMIT", unit: 6, number: 1, usage: 140000, currentValue: 93649, remaining: 46350, percentage: 66, nextResetTime: 1793273259984 }
    ],
    level: "max"
  },
  msg: "Operation successful",
  success: true
};

// Same payload, with the limit type name Z.ai used before the credits switch.
const zaiLegacyQuotaPayload = {
  ...zaiQuotaPayload,
  data: {
    ...zaiQuotaPayload.data,
    limits: zaiQuotaPayload.data.limits.map((limit) => ({ ...limit, type: "TOKENS_LIMIT" }))
  }
};

const minimaxQuotaPayload = {
  model_remains: [
    {
      start_time: 1793059200000,
      end_time: 1793145600000,
      model_name: "video",
      current_interval_remaining_percent: 100,
      current_weekly_remaining_percent: 100,
      weekly_end_time: 1793577600000
    },
    {
      start_time: 1793095200000,
      end_time: 1793113200000,
      model_name: "general",
      current_interval_remaining_percent: 75,
      current_weekly_remaining_percent: 54,
      weekly_end_time: 1793577600000
    }
  ],
  base_resp: { status_code: 0, status_msg: "success" }
};

function stubJsonFetch(t, payload, capture) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    capture.url = String(url);
    capture.authorization = options?.headers?.authorization ?? options?.headers?.Authorization;
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
}

function assertZaiWindows(meters) {
  const fiveHour = meters.find((meter) => meter.id === "five_hour_quota");
  assert.equal(fiveHour?.remaining, 94);
  assert.equal(fiveHour?.used, 6);
  assert.equal(fiveHour?.window, "5h");
  assert.equal(fiveHour?.limit, 100);
  assert.equal(fiveHour?.unit, "%");
  assert.equal(fiveHour?.resetAt, "2026-10-27T21:41:59.966Z");

  const weekly = meters.find((meter) => meter.id === "weekly_quota");
  assert.equal(weekly?.remaining, 34);
  assert.equal(weekly?.used, 66);
  assert.equal(weekly?.window, "weekly");
  assert.equal(weekly?.limit, 100);
  assert.equal(weekly?.unit, "%");
  assert.equal(weekly?.resetAt, "2026-10-29T11:27:39.984Z");
}

test("Z.ai coding plan connector maps the 5h + weekly windows", async (t) => {
  const preset = findProviderPreset("zai-global-coding");
  const connector = preset?.account?.connectors?.[0];
  assert.ok(connector, "the zai-global-coding preset must ship a quota connector");
  assert.equal(connector.type, "http-json");
  assert.equal(connector.endpoint, "https://api.z.ai/api/monitor/usage/quota/limit");
  // Zhipu AI sends the key raw; api.z.ai accepts that form (and the Bearer
  // form) interchangeably.
  assert.equal(connector.auth, "provider-api-key-raw");

  const capture = {};
  stubJsonFetch(t, zaiQuotaPayload, capture);

  const result = await testProviderAccountConnector({
    apiKey: "zai-coding-key",
    baseUrl: "https://api.z.ai/api/anthropic",
    connector,
    providerName: preset.name
  });

  assert.equal(capture.authorization, "zai-coding-key");
  // `percentage` is the consumed share: 6 % consumed => 94 % left.
  assertZaiWindows(result.meters);
});

test("Z.ai general endpoint connector maps the 5h + weekly windows", async (t) => {
  const preset = findProviderPreset("zai-global-general");
  const connector = preset?.account?.connectors?.[0];
  assert.ok(connector, "the zai-global-general preset must ship a quota connector");
  assert.equal(connector.type, "http-json");
  assert.equal(connector.endpoint, "https://api.z.ai/api/monitor/usage/quota/limit");

  const capture = {};
  stubJsonFetch(t, zaiQuotaPayload, capture);

  const result = await testProviderAccountConnector({
    apiKey: "zai-general-key",
    baseUrl: "https://api.z.ai/api/paas/v4",
    connector,
    providerName: preset.name
  });

  assert.equal(capture.authorization, "zai-general-key");
  assertZaiWindows(result.meters);
});

test("Z.ai connector does not depend on the limit type name", async (t) => {
  const preset = findProviderPreset("zai-global-coding");
  const connector = preset?.account?.connectors?.[0];
  assert.ok(connector);

  stubJsonFetch(t, zaiLegacyQuotaPayload, {});

  const result = await testProviderAccountConnector({
    apiKey: "zai-coding-key",
    baseUrl: "https://api.z.ai/api/anthropic",
    connector,
    providerName: preset.name
  });

  // The endpoint renamed `TOKENS_LIMIT` to `CREDIT_LIMIT`; filtering on the
  // type name emptied every meter when that happened.
  assertZaiWindows(result.meters);
});

test("MiniMax global preset maps the 5h + weekly windows of the general model", async (t) => {
  const preset = findProviderPreset("minimax-global");
  const connector = preset?.account?.connectors?.[0];
  assert.ok(connector, "the minimax-global preset must ship a quota connector");
  assert.equal(connector.type, "http-json");
  assert.equal(connector.endpoint, "https://www.minimax.io/v1/token_plan/remains");
  assert.equal(connector.auth, "provider-api-key");

  const capture = {};
  stubJsonFetch(t, minimaxQuotaPayload, capture);

  const result = await testProviderAccountConnector({
    apiKey: "minimax-key",
    baseUrl: "https://api.minimax.io/anthropic/v1",
    connector,
    providerName: preset.name
  });

  assert.equal(capture.authorization, "Bearer minimax-key");

  const fiveHour = result.meters.find((meter) => meter.id === "five_hour_quota");
  // The "video" family must not be picked up — the payload order is not contractual.
  assert.equal(fiveHour?.remaining, 75);
  assert.equal(fiveHour?.used, 25);
  assert.equal(fiveHour?.window, "5h");
  assert.equal(fiveHour?.limit, 100);
  assert.equal(fiveHour?.unit, "%");
  assert.equal(fiveHour?.resetAt, "2026-10-27T15:00:00.000Z");

  const weekly = result.meters.find((meter) => meter.id === "weekly_quota");
  assert.equal(weekly?.remaining, 54);
  assert.equal(weekly?.used, 46);
  assert.equal(weekly?.window, "weekly");
  assert.equal(weekly?.limit, 100);
  assert.equal(weekly?.unit, "%");
  assert.equal(weekly?.resetAt, "2026-11-02T00:00:00.000Z");
});

test("the quota connectors are reachable through the base-URL preset resolution", () => {
  // The runtime resolves the preset of a provider from its base URL
  // (effectiveProviderAccountConfig in account-service.ts), so a preset whose
  // endpoints collide with an earlier one is never applied — the connector
  // would ship in the preset and stay dead in production.
  const minimax = findProviderPresetByBaseUrl("https://api.minimax.io/v1");
  assert.equal(minimax?.id, "minimax-global");
  assert.equal(minimax?.account?.connectors?.[0]?.type, "http-json");

  const minimaxAnthropic = findProviderPresetByBaseUrl("https://api.minimax.io/anthropic/v1");
  assert.equal(minimaxAnthropic?.id, "minimax-global");
  assert.equal(minimaxAnthropic?.account?.connectors?.[0]?.type, "http-json");

  const zai = findProviderPresetByBaseUrl("https://api.z.ai/api/anthropic");
  assert.equal(zai?.id, "zai-global-coding");
  assert.equal(zai?.account?.connectors?.[0]?.type, "http-json");
});
