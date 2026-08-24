import assert from "node:assert/strict";
import test from "node:test";
import { buildClaudeAppGatewayModelRoutes } from "@ccr/core/agents/claude-app/gateway-routes.ts";
import { prepareClaudeAppDiscoveredModelRequest } from "@ccr/core/gateway/features/model-discovery.ts";
import { fetchUpstreamWithFallback, prepareGatewayUpstreamAttemptForTest } from "@ccr/core/gateway/upstream/executor.ts";
import { RequestRouteTraceRecorder } from "@ccr/core/observability/route-trace.ts";

const retryConfig = {
  Providers: [],
  Router: { fallback: { mode: "retry", models: [], retryCount: 1 }, rules: [] },
  virtualModelProfiles: []
};
const retryFallback = { mode: "retry", models: [], retryCount: 1 };

async function assertRetryBackoffStopsAfterAbort(fetchImpl) {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const controller = new AbortController();
  let fetchCount = 0;
  globalThis.fetch = async (...args) => {
    fetchCount += 1;
    return fetchImpl(...args);
  };
  globalThis.setTimeout = (_callback, delay, ..._args) => {
    const timer = originalSetTimeout(() => {}, delay);
    timer.unref?.();
    queueMicrotask(() => controller.abort(new Error("client disconnected")));
    return timer;
  };

  try {
    const outcome = await Promise.race([
      fetchUpstreamWithFallback({
        body: Buffer.from('{"model":"test-model"}'),
        config: retryConfig,
        coreAuthToken: "core-token",
        fallback: retryFallback,
        headers: {},
        method: "POST",
        path: "/v1/messages",
        routedModel: "test-model",
        signal: controller.signal,
        upstreamUrl: "http://127.0.0.1:3456/v1/messages"
      }).then(
        () => ({ kind: "resolved" }),
        (error) => ({ error, kind: "rejected" })
      ),
      new Promise((resolve) => setImmediate(() => resolve({ kind: "pending" })))
    ]);

    assert.notEqual(outcome.kind, "pending");
    assert.equal(outcome.kind, "rejected");
    assert.match(outcome.error.message, /client disconnected/);
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
}

test("retry backoff stops after client aborts a retryable HTTP response", async () => {
  await assertRetryBackoffStopsAfterAbort(async () => new Response(null, { status: 503 }));
});

test("retry backoff stops after client aborts a network error", async () => {
  await assertRetryBackoffStopsAfterAbort(async () => {
    throw new Error("upstream unavailable");
  });
});

test("OpenRouter discount provider constraints are removed from different fallback model attempts", async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  try {
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response("{}", {
        headers: { "content-type": "application/json" },
        status: bodies.length === 1 ? 503 : 200
      });
    };

    const result = await fetchUpstreamWithFallback({
      body: Buffer.from(JSON.stringify({
        messages: [],
        model: "OpenRouter/z-ai/glm-primary",
        provider: {
          ignore: ["legacy"],
          order: ["cheap"]
        }
      })),
      config: {
        Providers: [],
        Router: {
          fallback: {
            mode: "model-chain",
            models: ["OpenRouter/z-ai/glm-fallback"],
            retryCount: 0
          },
          rules: []
        },
        virtualModelProfiles: []
      },
      coreAuthToken: "core-token",
      fallback: {
        mode: "model-chain",
        models: ["OpenRouter/z-ai/glm-fallback"],
        retryCount: 0
      },
      headers: {
        "x-ccr-openrouter-discount-model": "z-ai/glm-primary",
        "x-ccr-openrouter-discount-provider-id": "openrouter"
      },
      method: "POST",
      path: "/v1/chat/completions",
      routedModel: "OpenRouter/z-ai/glm-primary",
      upstreamUrl: "http://127.0.0.1:3456/v1/chat/completions"
    });

    assert.equal(result.response.status, 200);
    assert.equal(result.failedAttempts.length, 1);
    assert.deepEqual(bodies[0].provider, {
      ignore: ["legacy"],
      order: ["cheap"]
    });
    assert.equal(bodies[1].model, "OpenRouter/z-ai/glm-fallback");
    assert.equal(bodies[1].provider, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("target-provider routing preserves slash-namespaced model ids", () => {
  const cases = [
    {
      model: "openai/gpt-oss-20b",
      provider: "Groq",
      url: "https://api.groq.example/openai/v1"
    },
    {
      model: "nvidia/nemotron-3-ultra-550b-a55b",
      provider: "NVIDIA",
      url: "https://integrate.api.nvidia.com/v1"
    },
    {
      model: "google/gemini-2.5-pro",
      provider: "OpenRouter",
      url: "https://openrouter.ai/api/v1"
    }
  ];

  for (const item of cases) {
    const attempt = prepareGatewayUpstreamAttemptForTest({
      body: {
        messages: [],
        model: item.model
      },
      config: {
        Providers: [
          {
            capabilities: [{ baseUrl: item.url, type: "openai_chat_completions" }],
            credentials: [{ apiKey: "provider-key", id: "provider-main" }],
            models: [item.model],
            name: item.provider
          }
        ],
        Router: { fallback: { mode: "off", models: [], retryCount: 0 }, rules: [] },
        virtualModelProfiles: []
      },
      headers: {
        "x-target-provider": item.provider
      },
      method: "POST",
      path: "/v1/chat/completions",
      routedModel: item.model
    });

    assert.equal(attempt.body.model, item.model);
    assert.equal(attempt.logicalProvider, item.provider);
  }
});

test("Claude App OpenRouter routes do not send conflicting vendor-prefixed model selectors to the core gateway", () => {
  const targetModel = "OpenRouter/google/gemini-3.7-flash";
  const config = {
    Providers: [
      {
        apiKey: "openrouter-key",
        capabilities: [
          { baseUrl: "https://openrouter.ai/api/v1", type: "openai_chat_completions" },
          { baseUrl: "https://openrouter.ai/api/v1", type: "openai_responses" }
        ],
        id: "openrouter",
        models: ["google/gemini-3.7-flash"],
        name: "OpenRouter"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 }, rules: [] },
    profile: {
      enabled: true,
      profiles: [
        {
          agent: "claude-code",
          enabled: true,
          id: "claude-code-openrouter",
          model: targetModel,
          name: "Claude Code OpenRouter",
          scope: "global"
        }
      ]
    },
    virtualModelProfiles: []
  };
  const route = buildClaudeAppGatewayModelRoutes(config).find((item) => item.targetModel === targetModel);
  assert.ok(route);

  const rewrite = prepareClaudeAppDiscoveredModelRequest(
    config,
    "POST",
    "/v1/messages",
    Buffer.from(JSON.stringify({ max_tokens: 8, messages: [{ role: "user", content: "hello" }], model: route.id }))
  );
  assert.equal(rewrite?.routedModel, targetModel);

  const rewrittenBody = JSON.parse(rewrite.body.toString("utf8"));
  const attempt = prepareGatewayUpstreamAttemptForTest({
    body: rewrittenBody,
    config,
    headers: {},
    method: "POST",
    path: "/v1/messages",
    routedModel: rewrite.routedModel
  });

  assert.equal(attempt.headers["x-target-provider"], "openrouter::openai_chat_completions");
  assert.equal(coreGatewayTargetProviderConflict(attempt), false);
  assert.equal(attempt.body.model, "openrouter::openai_chat_completions/google/gemini-3.7-flash");
});

test("target-provider routing keeps vendor-prefixed model ids even when the prefix names another provider", () => {
  const config = {
    Providers: [
      {
        capabilities: [{ baseUrl: "https://api.openai.example/v1", type: "openai_chat_completions" }],
        credentials: [{ apiKey: "openai-key", id: "openai-main" }],
        id: "openai",
        models: ["gpt-oss-20b"],
        name: "OpenAI"
      },
      {
        capabilities: [{ baseUrl: "https://api.groq.example/openai/v1", type: "openai_chat_completions" }],
        credentials: [{ apiKey: "groq-key", id: "groq-main" }],
        id: "groq",
        models: ["openai/gpt-oss-20b"],
        name: "Groq"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 }, rules: [] },
    virtualModelProfiles: []
  };

  const attempt = prepareGatewayUpstreamAttemptForTest({
    body: {
      messages: [],
      model: "openai/gpt-oss-20b"
    },
    config,
    headers: {
      "x-target-provider": "Groq"
    },
    method: "POST",
    path: "/v1/chat/completions",
    routedModel: "openai/gpt-oss-20b"
  });

  assert.equal(attempt.body.model, "openai/gpt-oss-20b");
  assert.equal(attempt.logicalProvider, "Groq");
});

function coreGatewayTargetProviderConflict(attempt) {
  const bodyModel = typeof attempt.body?.model === "string" ? attempt.body.model : "";
  const targetProvider = attempt.headers?.["x-target-provider"];
  if (!bodyModel || !targetProvider) {
    return false;
  }
  const slashIndex = bodyModel.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= bodyModel.length - 1) {
    return false;
  }
  const providerHint = bodyModel.slice(0, slashIndex);
  if (providerHint === targetProvider) {
    return false;
  }
  const modelProvider = coreGatewayBuiltinProvider(providerHint);
  const targetProviderType = coreGatewayProviderType(targetProvider);
  return Boolean(modelProvider && targetProviderType && modelProvider !== targetProviderType);
}

function coreGatewayProviderType(providerSelector) {
  if (providerSelector.includes("::openai_chat_completions") || providerSelector.includes("::openai_responses")) {
    return "openai";
  }
  if (providerSelector.includes("::anthropic_messages")) {
    return "anthropic";
  }
  if (providerSelector.includes("::gemini_generate_content") || providerSelector.includes("::gemini_interactions")) {
    return "gemini";
  }
  return coreGatewayBuiltinProvider(providerSelector);
}

function coreGatewayBuiltinProvider(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "openai") {
    return "openai";
  }
  if (normalized === "anthropic" || normalized === "claude") {
    return "anthropic";
  }
  if (normalized === "gemini" || normalized === "google") {
    return "gemini";
  }
  return undefined;
}

test("target-provider routing preserves slash model ids for providers without explicit capabilities", () => {
  const config = {
    Providers: [
      {
        api_base_url: "https://api.openai.example/v1",
        credentials: [{ apiKey: "openai-key", id: "openai-main" }],
        id: "openai",
        models: ["gpt-oss-20b"],
        name: "OpenAI",
        type: "openai_chat_completions"
      },
      {
        api_base_url: "https://api.groq.example/openai/v1",
        credentials: [{ apiKey: "groq-key", id: "groq-main" }],
        id: "groq",
        models: ["openai/gpt-oss-20b"],
        name: "Groq",
        provider: "openai",
        type: "openai_chat_completions"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 }, rules: [] },
    virtualModelProfiles: []
  };

  const attempt = prepareGatewayUpstreamAttemptForTest({
    body: {
      messages: [],
      model: "openai/gpt-oss-20b"
    },
    config,
    headers: {
      "x-target-provider": "Groq"
    },
    method: "POST",
    path: "/v1/chat/completions",
    routedModel: "openai/gpt-oss-20b"
  });

  assert.equal(attempt.body.model, "openai/gpt-oss-20b");
  assert.equal(attempt.logicalProvider, "Groq");
  assert.equal(attempt.credentialProtocol, "openai_chat_completions");
  assert.equal(attempt.headers["x-target-providers"], "groq::openai_chat_completions::cred:groq-main");
});

test("model-chain fallback rebuilds every protocol attempt from the canonical request", async () => {
  const config = {
    Providers: [
      {
        capabilities: [{ baseUrl: "https://anthropic-primary.example", type: "anthropic_messages" }],
        id: "anthropic-primary",
        models: ["claude-primary"],
        name: "Anthropic Primary"
      },
      {
        capabilities: [{ baseUrl: "https://openai-fallback.example", type: "openai_responses" }],
        id: "openai-fallback",
        models: ["gpt-fallback"],
        name: "OpenAI Fallback"
      },
      {
        capabilities: [{ baseUrl: "https://anthropic-recovery.example", type: "anthropic_messages" }],
        id: "anthropic-recovery",
        models: ["claude-recovery"],
        name: "Anthropic Recovery"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 }, rules: [] },
    virtualModelProfiles: []
  };
  const fallback = {
    mode: "model-chain",
    models: ["OpenAI Fallback/gpt-fallback", "Anthropic Recovery/claude-recovery"],
    retryCount: 0
  };
  const canonicalBody = {
    context_management: { edits: [{ type: "clear_tool_uses_20250919" }] },
    messages: [{ content: "hello", role: "user" }],
    model: "Anthropic Primary/claude-primary",
    output_config: { effort: "high", verbosity: "medium" },
    system: [{ cache_control: { type: "ephemeral" }, text: "system", type: "text" }],
    thinking: { type: "adaptive" }
  };
  const captured = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    captured.push({
      body: JSON.parse(init.body),
      headers: init.headers
    });
    const status = captured.length === 1 ? 429 : captured.length === 2 ? 400 : 200;
    return new Response('{"ok":true}', {
      headers: {
        "content-type": "application/json",
        "retry-after": "0.001"
      },
      status
    });
  };

  try {
    const trace = new RequestRouteTraceRecorder(Date.now());
    const result = await fetchUpstreamWithFallback({
      body: Buffer.from(JSON.stringify(canonicalBody)),
      config,
      coreAuthToken: "core-token",
      fallback,
      headers: {},
      method: "POST",
      path: "/v1/messages",
      routedModel: canonicalBody.model,
      trace,
      upstreamUrl: "http://127.0.0.1:3456/v1/messages"
    });

    assert.equal(result.response.status, 200);
    assert.equal(captured.length, 3);
    assert.deepEqual(captured.map((attempt) => attempt.body.model), [
      "claude-primary",
      "gpt-fallback",
      "claude-recovery"
    ]);
    assert.deepEqual(captured[0].body.thinking, { type: "adaptive" });
    assert.equal(captured[1].body.thinking, undefined);
    assert.deepEqual(captured[2].body.thinking, { type: "adaptive" });
    assert.deepEqual(captured[2].body.context_management, canonicalBody.context_management);
    assert.deepEqual(captured[2].body.output_config, canonicalBody.output_config);
    assert.equal(captured[0].headers["x-target-provider"], "anthropic-primary::anthropic_messages");
    assert.equal(captured[1].headers["x-target-provider"], "openai-fallback::openai_responses");
    assert.equal(captured[2].headers["x-target-provider"], "anthropic-recovery::anthropic_messages");
    const finishedTrace = trace.finish();
    const capabilityRoutingHops = finishedTrace.hops
      .filter((hop) => hop.name === "provider.capability-routing");
    assert.deepEqual(
      capabilityRoutingHops.map((hop) => hop.attempt),
      [1, 2, 3]
    );
    assert.deepEqual(
      capabilityRoutingHops[0].changes.map((change) => change.path),
      ["/body/model", "/routing/model"]
    );
    assert.deepEqual(
      finishedTrace.hops
        .find((hop) => hop.name === "fallback.execution-plan")
        ?.changes.map((change) => change.path),
      ["/routing/fallback"]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
