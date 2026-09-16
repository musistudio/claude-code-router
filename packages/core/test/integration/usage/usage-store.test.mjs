import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { RequestLogStore } from "@ccr/core/observability/request-log-store.ts";
import { providerRuntimeId } from "@ccr/core/routing/model-registry.ts";
import { createBetterSqliteDatabase } from "@ccr/core/storage/sqlite-native.ts";
import { GatewayBillingSynchronizer } from "@ccr/core/usage/billing-sync.ts";
import { resolveUsageModelAttribution } from "@ccr/core/usage/model-attribution.ts";
import { UsageStore } from "@ccr/core/usage/store.ts";

const fusionUsageConfig = {
  Providers: [
    {
      baseUrl: "https://api.moonshot.cn/anthropic",
      models: ["kimi-for-coding", "kimi-vision"],
      name: "Kimi Code - Coding Plan",
      type: "anthropic_messages"
    },
    {
      baseUrl: "https://api.example.com/v1",
      models: ["openai-vision"],
      name: "OpenAI Compatible",
      type: "openai_chat_completions"
    }
  ],
  virtualModelProfiles: [
    {
      baseModel: { fixedModel: "Kimi Code - Coding Plan/kimi-for-coding", mode: "fixed" },
      enabled: true,
      id: "kimisearch",
      key: "kimisearch",
      match: { exactAliases: ["kimisearch"], prefixes: [], suffixes: [] }
    }
  ]
};

test("Fusion usage attribution resolves fixed aliases to their upstream model", () => {
  assert.deepEqual(resolveUsageModelAttribution(fusionUsageConfig, "Fusion/kimisearch"), {
    logicalModel: "Fusion/kimisearch",
    model: "kimi-for-coding",
    provider: "Kimi Code - Coding Plan"
  });
});

test("Fusion usage attribution mirrors gateway virtual-model precedence and target rewriting", () => {
  const config = {
    Providers: [
      { models: ["base", "web-base-tail", "web-special-base"], name: "Requested", type: "openai_chat_completions" },
      { models: ["long-prefix", "short-prefix", "suffix"], name: "Targets", type: "openai_chat_completions" }
    ],
    virtualModelProfiles: [
      {
        baseModel: { fixedModel: "Targets/short-prefix", mode: "fixed" },
        enabled: true,
        match: { exactAliases: [], prefixes: ["web-"], suffixes: [] }
      },
      {
        baseModel: { fixedModel: "Targets/long-prefix", mode: "fixed" },
        enabled: true,
        match: { exactAliases: [], prefixes: ["web-special-"], suffixes: [] }
      },
      {
        baseModel: { fixedModel: "Targets/suffix", mode: "fixed" },
        enabled: true,
        match: { exactAliases: [], prefixes: [], suffixes: ["-tail"] }
      },
      {
        baseModel: { mode: "request" },
        enabled: true,
        match: { exactAliases: [], prefixes: ["raw-"], suffixes: [] }
      }
    ]
  };

  assert.deepEqual(resolveUsageModelAttribution(config, "Requested/web-special-base"), {
    logicalModel: "Requested/web-special-base",
    model: "long-prefix",
    provider: "Targets"
  });
  assert.deepEqual(resolveUsageModelAttribution(config, "Requested/web-base-tail"), {
    logicalModel: "Requested/web-base-tail",
    model: "suffix",
    provider: "Targets"
  });
  assert.deepEqual(resolveUsageModelAttribution(config, "Requested/raw-base"), {
    logicalModel: "Requested/raw-base",
    model: "base",
    provider: "Requested"
  });
});

test("usage attribution preserves slash-containing physical model IDs", () => {
  const model = "accounts/fireworks/models/llama-v3p2-11b-vision-instruct";
  assert.deepEqual(resolveUsageModelAttribution(fusionUsageConfig, model, { physicalModel: true }), {
    logicalModel: model,
    model
  });
});

test("UsageStore aggregates stats in SQLite without loading all events", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    await store.record({
      createdAt: earlier.toISOString(),
      durationMs: 120,
      method: "POST",
      model: "alpha-model",
      path: "/v1/messages",
      provider: "alpha",
      requestId: "req-1",
      statusCode: 200,
      usage: {
        cacheReadTokens: 2,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 17
      }
    });
    await store.record({
      createdAt: now.toISOString(),
      durationMs: 80,
      method: "POST",
      model: "beta-model",
      path: "/v1/messages",
      provider: "beta",
      requestId: "req-2",
      statusCode: 500,
      usage: {
        inputTokens: 4,
        outputTokens: 6
      }
    });

    const stats = await store.getStats("30d", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 2);
    assert.equal(stats.totals.errorCount, 1);
    assert.equal(stats.totals.totalTokens, 27);
    assert.equal(stats.totals.inputTokens, 14);
    assert.equal(stats.totals.outputTokens, 11);
    assert.equal(stats.recentRequests.length, 2);
    assert.equal(stats.models[0]?.requestCount, 1);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore cache ratio denominator includes cache tokens when total tokens omit cache", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-cache-ratio-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));

    await store.record({
      createdAt: new Date().toISOString(),
      durationMs: 50,
      method: "POST",
      model: "glm-cache",
      path: "/v1/messages",
      provider: "zhipu",
      requestId: "cache-ratio-total-omits-cache",
      statusCode: 200,
      usage: {
        cacheReadTokens: 90,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15
      }
    });

    const stats = await store.getStats("30d");
    assert.equal(stats.totals.totalTokens, 105);
    assert.equal(stats.totals.cacheRatio, 0.9);
    assert.equal(stats.models[0]?.cacheRatio, 0.9);
    assert.equal(stats.recentRequests[0]?.totalTokens, 105);
    assert.equal(stats.recentRequests[0]?.cacheRatio, 0.9);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore excludes proxy rows by default and includes them on request", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-proxy-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const createdAt = new Date().toISOString();

    await store.record({
      createdAt,
      durationMs: 10,
      method: "POST",
      model: "direct/model-a",
      path: "/v1/messages",
      requestId: "direct-1",
      statusCode: 200,
      usage: {
        inputTokens: 5,
        outputTokens: 7
      }
    });
    await store.record({
      createdAt,
      durationMs: 10,
      method: "POST",
      model: "proxy-model",
      path: "/v1/messages",
      provider: "proxy",
      requestId: "proxy-1",
      statusCode: 200,
      usage: {
        inputTokens: 100,
        outputTokens: 200
      }
    });

    const defaultStats = await store.getStats("30d");
    assert.equal(defaultStats.totals.requestCount, 1);
    assert.equal(defaultStats.totals.totalTokens, 12);
    assert.equal(defaultStats.providerModels[0]?.provider, "direct");
    assert.equal(defaultStats.providerModels[0]?.model, "model-a");

    const withProxy = await store.getStats("30d", { includeProxy: true });
    assert.equal(withProxy.totals.requestCount, 2);
    assert.equal(withProxy.totals.totalTokens, 312);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore treats null web RPC usage filters as empty filters", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-null-filter-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));

    await store.record({
      createdAt: new Date().toISOString(),
      durationMs: 10,
      method: "POST",
      model: "alpha-model",
      path: "/v1/messages",
      provider: "alpha",
      requestId: "req-null-filter",
      statusCode: 200,
      usage: {
        inputTokens: 3,
        outputTokens: 4
      }
    });

    const stats = await store.getStats("7d", null);
    assert.equal(stats.range, "7d");
    assert.equal(stats.totals.requestCount, 1);

    const defaultRangeStats = await store.getStats(null, null);
    assert.equal(defaultRangeStats.range, "7d");
    assert.equal(defaultRangeStats.totals.requestCount, 1);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore keeps the Fusion logical model while grouping by the upstream model", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-fusion-attribution-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    await store.record({
      createdAt: new Date().toISOString(),
      durationMs: 25,
      logicalModel: "Fusion/kimisearch",
      method: "POST",
      model: "kimi-for-coding",
      path: "/v1/messages",
      provider: "Kimi Code - Coding Plan",
      requestId: "fusion-request-1",
      statusCode: 200,
      usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 }
    });

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.models[0]?.model, "kimi-for-coding");
    assert.equal(stats.models[0]?.provider, "Kimi Code - Coding Plan");
    assert.equal(stats.recentRequests[0]?.logicalModel, "Fusion/kimisearch");
    assert.equal(stats.totals.requestCount, 1);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore prices the routed upstream model when the response echoes a rule alias", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-alias-pricing-test-"));
  try {
    const pricing = {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 2
    };
    const provider = {
      baseUrl: "https://api.example.com",
      modelMetadata: { "Vendor/some-model": { pricing } },
      models: ["Vendor/some-model"],
      name: "ProviderA",
      type: "anthropic_messages"
    };
    const estimatedInputs = [];
    const store = new UsageStore(path.join(dir, "usage.sqlite"), {
      estimateCost: async (input) => {
        estimatedInputs.push({
          model: input.model,
          pricing: input.pricing,
          provider: input.provider
        });
        return input.pricing
          ? { amountUsd: 2, model: input.model, source: "custom" }
          : undefined;
      }
    });

    await store.recordCapture({
      bodyText: JSON.stringify({
        model: "my-alias",
        usage: { input_tokens: 1000000, output_tokens: 500000 }
      }),
      config: { Providers: [provider] },
      durationMs: 40,
      fallbackModel: `${providerRuntimeId(provider)}::anthropic_messages/Vendor/some-model`,
      method: "POST",
      path: "/v1/messages",
      providerName: "ProviderA",
      requestId: "alias-pricing-request",
      responseHeaders: new Headers({ "content-type": "application/json" }),
      statusCode: 200
    });

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.models[0]?.model, "my-alias");
    assert.equal(stats.models[0]?.provider, "ProviderA");
    assert.equal(stats.totals.costUsd, 2);
    assert.deepEqual(estimatedInputs, [{
      model: "my-alias",
      pricing,
      provider: "ProviderA"
    }]);

    const database = createBetterSqliteDatabase(path.join(dir, "usage.sqlite"));
    try {
      const row = database.prepare("SELECT model, cost_source, cost_usd FROM usage_events").get();
      assert.equal(row.model, "my-alias");
      assert.equal(row.cost_source, "custom");
      assert.equal(row.cost_usd, 2);
    } finally {
      database.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore attributes Claude App encoded response model IDs to the routed upstream model", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-claude-app-encoded-model-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const encodedModel = `anthropic/claude-ccr-h${Buffer.from("Fusion/kimisearch", "utf8").toString("hex")}`;

    await store.recordCapture({
      bodyText: [
        "event: message_start",
        `data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"${encodedModel}","usage":{"input_tokens":12,"output_tokens":8,"total_tokens":20}}}`,
        "",
        "data: [DONE]",
        ""
      ].join("\n"),
      client: "Claude Code",
      config: fusionUsageConfig,
      durationMs: 100,
      fallbackModel: "Fusion/kimisearch",
      method: "POST",
      path: "/v1/messages",
      providerProtocol: "anthropic_messages",
      requestId: "encoded-claude-app-model",
      responseHeaders: new Headers({ "content-type": "text/event-stream; charset=utf-8" }),
      statusCode: 200
    });

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.models[0]?.model, "kimi-for-coding");
    assert.equal(stats.models[0]?.provider, "Kimi Code - Coding Plan");
    assert.equal(stats.recentRequests[0]?.logicalModel, "Fusion/kimisearch");
    assert.notEqual(stats.models[0]?.model, encodedModel);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore attributes client-visible provider-prefixed response models to the bare model", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-client-visible-selector-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const config = {
      Providers: [
        {
          baseUrl: "https://dashscope.example.com/api/v2/apps/anthropic",
          models: ["ZHIPU/GLM-5.3"],
          name: "dashscope-private",
          type: "anthropic_messages"
        }
      ],
      virtualModelProfiles: []
    };

    await store.recordCapture({
      bodyText: [
        "event: message_start",
        'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"dashscope-private/ZHIPU/GLM-5.3","usage":{"input_tokens":12,"output_tokens":8,"total_tokens":20}}}',
        "",
        "data: [DONE]",
        ""
      ].join("\n"),
      client: "Claude Code",
      config,
      durationMs: 100,
      fallbackModel: "dashscope-private/ZHIPU/GLM-5.3",
      method: "POST",
      path: "/v1/messages",
      providerProtocol: "anthropic_messages",
      requestId: "client-visible-selector-model",
      responseHeaders: new Headers({ "content-type": "text/event-stream; charset=utf-8" }),
      statusCode: 200
    });

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.models[0]?.model, "ZHIPU/GLM-5.3");
    assert.equal(stats.models[0]?.provider, "dashscope-private");
    assert.notEqual(stats.models[0]?.model, "dashscope-private/ZHIPU/GLM-5.3");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore keeps physical response models with unknown provider prefixes verbatim", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-physical-slash-model-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const config = {
      Providers: [
        {
          baseUrl: "https://dashscope.example.com/api/v2/apps/anthropic",
          models: ["ZHIPU/GLM-5.3"],
          name: "dashscope-private",
          type: "anthropic_messages"
        }
      ],
      virtualModelProfiles: []
    };

    // The upstream echoes the physical model id, whose own name contains a
    // slash; "ZHIPU" is not a configured provider, so the echo must be kept
    // verbatim instead of being re-attributed as a route selector.
    await store.recordCapture({
      bodyText: [
        "event: message_start",
        'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"ZHIPU/GLM-5.3","usage":{"input_tokens":12,"output_tokens":8,"total_tokens":20}}}',
        "",
        "data: [DONE]",
        ""
      ].join("\n"),
      client: "Claude Code",
      config,
      durationMs: 100,
      fallbackModel: "dashscope-private/ZHIPU/GLM-5.3",
      method: "POST",
      path: "/v1/messages",
      providerProtocol: "anthropic_messages",
      requestId: "physical-slash-model",
      responseHeaders: new Headers({ "content-type": "text/event-stream; charset=utf-8" }),
      statusCode: 200
    });

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.models[0]?.model, "ZHIPU/GLM-5.3");
    assert.equal(stats.models[0]?.provider, "dashscope-private");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("lightweight usage synchronization records and deduplicates Fusion internal upstream calls", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-fusion-internal-test-"));
  try {
    let estimateCallCount = 0;
    const store = new UsageStore(path.join(dir, "usage.sqlite"), {
      estimateCost: async () => {
        estimateCallCount += 1;
        return { amountUsd: 99, model: "unexpected", source: "litellm" };
      }
    });
    const synchronizer = new GatewayBillingSynchronizer({ getConfig: () => fusionUsageConfig, store });
    const event = {
      billing: {
        cost: { total: 0.001 },
        usage: { input_tokens: 50, output_tokens: 5, total_tokens: 55 }
      },
      emittedAt: new Date().toISOString(),
      eventId: "fusion-vision-event-1",
      outcome: { status: "success", statusCode: 200 },
      performance: { latency_ms: 150 },
      route: { method: "POST", url: "/v1/chat/completions" },
      schema: "ccr.fusion-usage.v1",
      source: { adapterKey: "openai_chat", provider: "fusion_vision" },
      target: {
        credentialId: "test-1",
        model: "kimi-vision",
        providerName: "Kimi Code - Coding Plan"
      }
    };

    assert.equal(await synchronizer.ingest(event), true);
    assert.equal(await store.hasRequestId(event.eventId), true);
    assert.equal(await synchronizer.ingest(event), true);
    assert.equal(await synchronizer.ingest({
      ...event,
      eventId: "top-level-embedding-event",
      source: { adapterKey: "openai_embeddings", provider: "openai" }
    }), false);
    assert.equal(await synchronizer.ingest({ ...event, eventId: "legacy-full-billing-event", schema: undefined }), false);

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 1);
    assert.equal(stats.totals.totalTokens, 55);
    assert.equal(stats.totals.costUsd, 0.001);
    assert.equal(stats.models[0]?.model, "kimi-vision");
    assert.equal(stats.models[0]?.provider, "Kimi Code - Coding Plan");
    assert.equal(stats.recentRequests[0]?.credentialId, "test-1");
    assert.equal(estimateCallCount, 0);

    const database = createBetterSqliteDatabase(path.join(dir, "usage.sqlite"));
    try {
      const queryPlan = database
        .prepare("EXPLAIN QUERY PLAN SELECT 1 FROM usage_events WHERE request_id = ? LIMIT 1")
        .all(event.eventId)
        .map((row) => String(row.detail ?? ""))
        .join("\n");
      assert.match(queryPlan, /usage_events_request_id_idx/);
    } finally {
      database.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("lightweight Fusion usage normalizes OpenAI cache tokens and estimates unconfigured zero costs", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-fusion-zero-cost-test-"));
  try {
    const estimatedInputs = [];
    const store = new UsageStore(path.join(dir, "usage.sqlite"), {
      estimateCost: async (input) => {
        estimatedInputs.push(input);
        return { amountUsd: 0.0025, model: input.model, source: "litellm" };
      }
    });
    const synchronizer = new GatewayBillingSynchronizer({ getConfig: () => fusionUsageConfig, store });

    assert.equal(await synchronizer.ingest({
      billing: {
        cost: { total: 0 },
        usage: {
          cache_read_tokens: 10,
          input_tokens: 50,
          output_tokens: 5,
          total_tokens: 55
        }
      },
      emittedAt: new Date().toISOString(),
      eventId: "fusion-vision-zero-cost-event",
      outcome: { status: "success", statusCode: 200 },
      performance: { latency_ms: 100 },
      route: { method: "POST", url: "/v1/chat/completions" },
      schema: "ccr.fusion-usage.v1",
      source: { adapterKey: "openai_chat", provider: "fusion_vision" },
      target: {
        model: "openai-vision",
        providerName: "OpenAI Compatible::openai_chat_completions"
      }
    }), true);

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.totals.inputTokens, 40);
    assert.equal(stats.totals.cacheTokens, 10);
    assert.equal(stats.totals.totalTokens, 55);
    assert.equal(stats.totals.costUsd, 0.0025);
    assert.equal(stats.models[0]?.provider, "OpenAI Compatible");
    assert.deepEqual(estimatedInputs, [{
      cacheReadTokens: 10,
      cacheWrite1hTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWriteTokens: 0,
      inputTokens: 40,
      model: "openai-vision",
      outputTokens: 5,
      pricing: undefined,
      provider: "OpenAI Compatible"
    }]);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("lightweight Fusion usage preserves slash-containing external model IDs through storage", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-fusion-external-model-test-"));
  try {
    const estimatedInputs = [];
    const store = new UsageStore(path.join(dir, "usage.sqlite"), {
      estimateCost: async (input) => {
        estimatedInputs.push(input);
        return { amountUsd: 0.004, model: input.model, source: "litellm" };
      }
    });
    const synchronizer = new GatewayBillingSynchronizer({ getConfig: () => fusionUsageConfig, store });
    const model = "accounts/fireworks/models/llama-v3p2-11b-vision-instruct";

    assert.equal(await synchronizer.ingest({
      billing: {
        cost: {},
        usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 }
      },
      emittedAt: new Date().toISOString(),
      eventId: "fusion-external-slash-model-event",
      outcome: { status: "success", statusCode: 200 },
      performance: { latency_ms: 100 },
      route: { method: "POST", url: "/v1/chat/completions" },
      schema: "ccr.fusion-usage.v1",
      source: { adapterKey: "openai_chat", provider: "fusion_vision" },
      target: { model }
    }), true);

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.models[0]?.model, model);
    assert.equal(stats.models[0]?.provider, "unknown");
    assert.equal(stats.recentRequests[0]?.logicalModel, model);
    assert.deepEqual(estimatedInputs, [{
      cacheReadTokens: 0,
      cacheWrite1hTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWriteTokens: 0,
      inputTokens: 10,
      model,
      outputTokens: 3,
      pricing: undefined,
      provider: "unknown"
    }]);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("lightweight Fusion usage honors numeric-string zero costs from global core billing rates", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-fusion-global-rate-test-"));
  try {
    let estimateCallCount = 0;
    const store = new UsageStore(path.join(dir, "usage.sqlite"), {
      estimateCost: async () => {
        estimateCallCount += 1;
        return { amountUsd: 99, model: "unexpected", source: "litellm" };
      }
    });
    const synchronizer = new GatewayBillingSynchronizer({
      getConfig: () => fusionUsageConfig,
      getGlobalBillingConfig: () => ({
        rates: {
          openai: {
            cacheReadPerMillionUsd: "0",
            cacheWritePerMillionUsd: "0",
            inputPerMillionUsd: "0",
            outputPerMillionUsd: "0"
          }
        }
      }),
      store
    });

    assert.equal(await synchronizer.ingest({
      billing: {
        cost: { total: 0 },
        usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 }
      },
      emittedAt: new Date().toISOString(),
      eventId: "fusion-global-zero-rate-event",
      outcome: { status: "success", statusCode: 200 },
      performance: { latency_ms: 100 },
      route: { method: "POST", url: "/v1/chat/completions" },
      schema: "ccr.fusion-usage.v1",
      source: { adapterKey: "openai_chat", provider: "fusion_vision" },
      target: {
        model: "openai-vision",
        providerName: "OpenAI Compatible::openai_chat_completions"
      }
    }), true);

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.totals.costUsd, 0);
    assert.equal(estimateCallCount, 0);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("lightweight Fusion usage coalesces concurrent deliveries of the same event", async () => {
  let hasRequestIdCallCount = 0;
  let recordCallCount = 0;
  let releaseRecord;
  let markRecordStarted;
  const recordStarted = new Promise((resolve) => {
    markRecordStarted = resolve;
  });
  const recordReleased = new Promise((resolve) => {
    releaseRecord = resolve;
  });
  const store = {
    hasRequestId: async () => {
      hasRequestIdCallCount += 1;
      return false;
    },
    record: async () => {
      recordCallCount += 1;
      markRecordStarted();
      await recordReleased;
    }
  };
  const synchronizer = new GatewayBillingSynchronizer({ getConfig: () => fusionUsageConfig, store });
  const event = {
    billing: {
      cost: { total: 0.001 },
      usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 }
    },
    emittedAt: new Date().toISOString(),
    eventId: "fusion-concurrent-event",
    outcome: { status: "success", statusCode: 200 },
    performance: { latency_ms: 100 },
    route: { method: "POST", url: "/v1/chat/completions" },
    schema: "ccr.fusion-usage.v1",
    source: { adapterKey: "openai_chat", provider: "fusion_vision" },
    target: { model: "openai-vision", providerName: "OpenAI Compatible" }
  };

  const first = synchronizer.ingest(event);
  await recordStarted;
  const second = synchronizer.ingest(event);
  releaseRecord();

  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(hasRequestIdCallCount, 1);
  assert.equal(recordCallCount, 1);
});

test("UsageStore backfills missing events from request logs", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-request-log-backfill-test-"));
  try {
    const requestLogDbFile = path.join(dir, "request-logs.sqlite");
    const requestLogStore = new RequestLogStore(requestLogDbFile);
    const usageStore = new UsageStore(path.join(dir, "usage.sqlite"), { requestLogDbFile });
    const createdAt = new Date().toISOString();

    await requestLogStore.record({
      client: "Claude Code",
      completedAt: createdAt,
      durationMs: 25,
      method: "POST",
      path: "/v1/messages",
      providerName: "alpha",
      requestBody: Buffer.from(JSON.stringify({ model: "alpha-model" })),
      requestHeaders: { "content-type": "application/json" },
      requestId: "req-backfill-1",
      responseBodyText: JSON.stringify({
        model: "alpha-model",
        usage: {
          input_tokens: 12,
          output_tokens: 5,
          total_tokens: 17
        }
      }),
      responseHeaders: new Headers({ "content-type": "application/json" }),
      startedAt: createdAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const stats = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 1);
    assert.equal(stats.totals.totalTokens, 17);
    assert.equal(stats.providerModels[0]?.provider, "alpha");
    assert.equal(stats.providerModels[0]?.model, "alpha-model");

    const reread = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(reread.totals.requestCount, 1);
    assert.equal(reread.totals.totalTokens, 17);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("UsageStore reset clears overview stats and does not backfill old request logs", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-reset-test-"));
  try {
    const requestLogDbFile = path.join(dir, "request-logs.sqlite");
    const requestLogStore = new RequestLogStore(requestLogDbFile);
    const usageStore = new UsageStore(path.join(dir, "usage.sqlite"), { requestLogDbFile });
    const beforeResetAt = new Date().toISOString();

    await requestLogStore.record({
      client: "Claude Code",
      completedAt: beforeResetAt,
      durationMs: 25,
      method: "POST",
      path: "/v1/messages",
      providerName: "alpha",
      requestBody: Buffer.from(JSON.stringify({ model: "alpha-model" })),
      requestHeaders: { "content-type": "application/json" },
      requestId: "req-reset-before",
      responseBodyText: JSON.stringify({
        model: "alpha-model",
        usage: {
          input_tokens: 12,
          output_tokens: 5,
          total_tokens: 17
        }
      }),
      responseHeaders: new Headers({ "content-type": "application/json" }),
      startedAt: beforeResetAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const before = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(before.totals.requestCount, 1);

    const reset = await usageStore.resetStatistics();
    assert.equal(reset.deletedEvents, 1);

    const afterReset = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(afterReset.totals.requestCount, 0);
    assert.equal(afterReset.totals.totalTokens, 0);

    const afterResetAt = new Date(Date.parse(reset.resetAt) + 1000).toISOString();
    await requestLogStore.record({
      client: "Claude Code",
      completedAt: afterResetAt,
      durationMs: 40,
      method: "POST",
      path: "/v1/messages",
      providerName: "beta",
      requestBody: Buffer.from(JSON.stringify({ model: "beta-model" })),
      requestHeaders: { "content-type": "application/json" },
      requestId: "req-reset-after",
      responseBodyText: JSON.stringify({
        model: "beta-model",
        usage: {
          input_tokens: 7,
          output_tokens: 3,
          total_tokens: 10
        }
      }),
      responseHeaders: new Headers({ "content-type": "application/json" }),
      startedAt: afterResetAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const afterNewRequest = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(afterNewRequest.totals.requestCount, 1);
    assert.equal(afterNewRequest.totals.totalTokens, 10);
    assert.equal(afterNewRequest.providerModels[0]?.provider, "beta");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// A request whose upstream status was never captured is undecided, not failed.
// Overview used to derive errorCount as requestCount - successCount, so those
// rows inflated the error count and depressed the success rate.
test("UsageStore does not count an uncaptured upstream status as an error", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-unknown-outcome-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const now = new Date();
    // One genuine success and one genuine failure through the public API.
    await store.record({
      createdAt: now.toISOString(),
      durationMs: 10,
      method: "POST",
      model: "model-a",
      path: "/v1/messages",
      provider: "vendor",
      requestId: "ok-1",
      statusCode: 200,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    });
    await store.record({
      createdAt: now.toISOString(),
      durationMs: 10,
      method: "POST",
      model: "model-a",
      path: "/v1/messages",
      provider: "vendor",
      requestId: "bad-1",
      statusCode: 500,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    });
    // The undecided row goes through the same public writer, because that is the
    // writer that actually runs: on a single-gateway install the request-log
    // backfill produces no rows at all. Inserting this row with raw SQL instead
    // would assert only that the SELECT reads a column, and would pass even when
    // no writer ever populates it -- which is exactly how this shipped empty.
    await store.record({
      createdAt: now.toISOString(),
      durationMs: 10,
      method: "POST",
      model: "model-a",
      path: "/v1/messages",
      provider: "vendor",
      requestId: "unknown-1",
      statusCode: 0,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    });

    const database = createBetterSqliteDatabase(path.join(dir, "usage.sqlite"));
    try {
      const outcomes = database.prepare(
        "SELECT request_id, upstream_outcome FROM usage_events ORDER BY request_id"
      ).all();
      assert.deepEqual(outcomes, [
        { request_id: "bad-1", upstream_outcome: "http_status" },
        { request_id: "ok-1", upstream_outcome: "http_status" },
        { request_id: "unknown-1", upstream_outcome: "unknown" }
      ], "the writer records the outcome it can establish from the status");
    } finally {
      database.close();
    }

    const stats = await store.getStats("30d");
    assert.equal(stats.totals.requestCount, 3, "all three rows are still counted");
    assert.equal(stats.totals.errorCount, 1, "only the real 500 is an error");
    // Decided requests are the 200 and the 500, so the rate is 1/2 -- the
    // undecided row must not drag it to 1/3.
    assert.equal(stats.totals.successRate, 0.5);

    // Recent requests are totalled per row in memory rather than in SQL, so they
    // need the same rule or the undecided row still shows as a failed request.
    const recentByStatus = new Map(
      stats.recentRequests.map((row) => [row.caption.split(" · ").at(-1), row])
    );
    assert.equal(recentByStatus.get("500")?.errorCount, 1);
    assert.equal(recentByStatus.get("200")?.errorCount, 0);
    assert.equal(recentByStatus.get("200")?.successRate, 1);
    assert.equal(recentByStatus.get("0")?.errorCount, 0, "the undecided recent request is not a failure");
    assert.equal(recentByStatus.get("0")?.successRate, 0);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// Usage can attach a request-log database before the request-log worker has
// migrated it. Reading logs.upstream_outcome unconditionally failed with
// `no such column` and silently skipped the entire backfill.
test("UsageStore backfills from a request-log database that predates upstream_outcome", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-legacy-request-log-test-"));
  try {
    const requestLogDbFile = path.join(dir, "request-logs.sqlite");
    const now = new Date().toISOString();
    const legacy = createBetterSqliteDatabase(requestLogDbFile);
    try {
      legacy.exec(`
        CREATE TABLE request_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          request_id TEXT NOT NULL DEFAULT '',
          client TEXT NOT NULL DEFAULT 'unknown',
          method TEXT NOT NULL DEFAULT '',
          path TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '',
          provider TEXT NOT NULL DEFAULT '',
          credential_id TEXT NOT NULL DEFAULT '',
          status_code INTEGER NOT NULL DEFAULT 0,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          cache_read_tokens INTEGER NOT NULL DEFAULT 0,
          cache_write_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          cost_usd REAL,
          source_usage_id TEXT
        )
      `);
      const insert = legacy.prepare(`
        INSERT INTO request_logs (
          created_at, request_id, client, method, path, model, provider, status_code,
          duration_ms, input_tokens, output_tokens, total_tokens
        ) VALUES (?, ?, 'Claude Code', 'POST', '/v1/messages', 'alpha-model', 'alpha', ?, 10, 3, 2, 5)
      `);
      insert.run(now, "legacy-ok", 200);
      insert.run(now, "legacy-uncaptured", 0);
    } finally {
      legacy.close();
    }

    const usageStore = new UsageStore(path.join(dir, "usage.sqlite"), { requestLogDbFile });
    const stats = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 2, "the backfill ran instead of being skipped");
    assert.equal(stats.totals.errorCount, 0);
    assert.equal(stats.totals.successRate, 1);

    const usageDatabase = createBetterSqliteDatabase(path.join(dir, "usage.sqlite"));
    try {
      assert.deepEqual(
        usageDatabase.prepare("SELECT request_id, upstream_outcome FROM usage_events ORDER BY request_id").all(),
        [
          { request_id: "legacy-ok", upstream_outcome: "http_status" },
          { request_id: "legacy-uncaptured", upstream_outcome: "unknown" }
        ],
        "the outcome is derived from the status the way the request-log migration seeds it"
      );
    } finally {
      usageDatabase.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// An install that ran a build which added the column without populating it holds
// '' on every row. '' reads as decided, so every uncaptured status stayed in the
// error count until the rows are migrated.
test("UsageStore migrates usage rows left without an upstream outcome", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-outcome-migrate-test-"));
  try {
    const dbFile = path.join(dir, "usage.sqlite");
    const now = new Date().toISOString();
    const seed = new UsageStore(dbFile);
    await seed.record({
      createdAt: now,
      durationMs: 10,
      method: "POST",
      model: "model-a",
      path: "/v1/messages",
      provider: "vendor",
      requestId: "seed-1",
      statusCode: 200,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    });
    await seed.getStats("30d");

    // Reproduce the shipped state: the column exists but holds '', and that build
    // never recorded the backfill as complete.
    const database = createBetterSqliteDatabase(dbFile);
    try {
      database.exec("UPDATE usage_events SET upstream_outcome = ''");
      database.exec("DELETE FROM usage_metadata WHERE key = 'usage_upstream_outcome_backfill_v1'");
      database.prepare(`
        INSERT INTO usage_events (
          created_at, request_id, client, method, path, model, logical_model, provider,
          credential_id, status_code, duration_ms, input_tokens, output_tokens,
          cache_read_tokens, cache_write_tokens, total_tokens, cost_usd, cost_source,
          upstream_outcome
        ) VALUES (?, 'legacy-zero', 'unknown', 'POST', '/v1/messages', 'model-a', 'model-a',
          'vendor', '', 0, 10, 1, 1, 0, 0, 2, NULL, 'models.dev', '')
      `).run(now);
    } finally {
      database.close();
    }

    // Reopening runs the schema migration.
    const reopened = new UsageStore(dbFile);
    const stats = await reopened.getStats("30d");
    const after = createBetterSqliteDatabase(dbFile);
    try {
      const rows = after.prepare(
        "SELECT request_id, upstream_outcome FROM usage_events ORDER BY request_id"
      ).all();
      assert.deepEqual(rows, [
        { request_id: "legacy-zero", upstream_outcome: "unknown" },
        { request_id: "seed-1", upstream_outcome: "http_status" }
      ]);
    } finally {
      after.close();
    }
    assert.equal(stats.totals.requestCount, 2, "both rows are still counted");
    assert.equal(stats.totals.errorCount, 0, "the migrated zero-status row is not an error");
    assert.equal(stats.totals.successRate, 1);

    // Once the backfill has finished, later opens skip it rather than scanning
    // the whole table again. A row put back to '' behind its back stays as it is.
    const marked = createBetterSqliteDatabase(dbFile);
    try {
      marked.exec("UPDATE usage_events SET upstream_outcome = '' WHERE request_id = 'seed-1'");
    } finally {
      marked.close();
    }
    await new UsageStore(dbFile).getStats("30d");
    const skipped = createBetterSqliteDatabase(dbFile);
    try {
      assert.equal(
        skipped.prepare("SELECT upstream_outcome FROM usage_events WHERE request_id = 'seed-1'").get().upstream_outcome,
        "",
        "a completed backfill does not run again on reopen"
      );
    } finally {
      skipped.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// The backfill is paged so it never holds the usage table's write lock for a
// whole large history at once. Paging is only correct if it actually walks past
// the first batch, so seed more rows than the batch size (500) and mix statuses
// so a wrong page boundary would leave some row behind or mislabel it.
test("UsageStore migrates more usage rows than a single backfill batch", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-usage-outcome-paged-test-"));
  try {
    const dbFile = path.join(dir, "usage.sqlite");
    const now = new Date().toISOString();
    const seed = new UsageStore(dbFile);
    await seed.record({
      createdAt: now,
      durationMs: 1,
      method: "POST",
      model: "model-a",
      path: "/v1/messages",
      provider: "vendor",
      requestId: "seed-1",
      statusCode: 200,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    });
    await seed.getStats("30d");

    const total = 1250;
    const database = createBetterSqliteDatabase(dbFile);
    try {
      const insert = database.prepare(`
        INSERT INTO usage_events (
          created_at, request_id, client, method, path, model, logical_model, provider,
          credential_id, status_code, duration_ms, input_tokens, output_tokens,
          cache_read_tokens, cache_write_tokens, total_tokens, cost_usd, cost_source,
          upstream_outcome
        ) VALUES (?, ?, 'unknown', 'POST', '/v1/messages', 'model-a', 'model-a',
          'vendor', '', ?, 1, 1, 1, 0, 0, 2, NULL, 'models.dev', '')
      `);
      database.exec("BEGIN");
      // Alternate a captured status and an uncaptured one across the batch
      // boundary, so both branches of the CASE are exercised on every page.
      for (let index = 0; index < total; index += 1) {
        insert.run(now, `legacy-${index}`, index % 2 === 0 ? 200 : 0);
      }
      database.exec("UPDATE usage_events SET upstream_outcome = ''");
      database.exec("DELETE FROM usage_metadata WHERE key = 'usage_upstream_outcome_backfill_v1'");
      database.exec("COMMIT");
    } finally {
      database.close();
    }

    const reopened = new UsageStore(dbFile);
    const stats = await reopened.getStats("30d");
    const after = createBetterSqliteDatabase(dbFile);
    try {
      const counts = after.prepare(`
        SELECT upstream_outcome AS outcome, COUNT(*) AS n
        FROM usage_events
        GROUP BY upstream_outcome
        ORDER BY upstream_outcome
      `).all();
      assert.deepEqual(counts, [
        // 625 seeded zero-status rows.
        { outcome: "unknown", n: total / 2 },
        // 625 seeded plus the one real success recorded above.
        { outcome: "http_status", n: total / 2 + 1 }
      ].sort((a, b) => a.outcome.localeCompare(b.outcome)));
      assert.equal(
        after.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE upstream_outcome = ''").get().n,
        0,
        "no row is left behind past the first page"
      );
    } finally {
      after.close();
    }
    assert.equal(stats.totals.requestCount, total + 1);
    // Only the zero-status rows are undecided; nothing became an error.
    assert.equal(stats.totals.errorCount, 0);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
