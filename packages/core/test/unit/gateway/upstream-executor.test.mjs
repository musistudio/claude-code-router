import assert from "node:assert/strict";
import test from "node:test";
import { fetchUpstreamWithFallback, prepareGatewayUpstreamAttemptForTest } from "@ccr/core/gateway/upstream/executor.ts";
import { RequestRouteTraceRecorder } from "@ccr/core/observability/route-trace.ts";

const retryConfig = {
  Providers: [],
  Router: { fallback: { mode: "retry", models: [], retryCount: 1 }, rules: [] },
  virtualModelProfiles: []
};
const retryFallback = { mode: "retry", models: [], retryCount: 1 };

function responsesConfig(provider) {
  return {
    Providers: [
      {
        api_base_url: provider.baseUrl,
        capabilities: [
          {
            baseUrl: provider.baseUrl,
            ...(provider.features ? { features: provider.features } : {}),
            type: "openai_responses"
          }
        ],
        ...(provider.modelMetadata ? { modelMetadata: provider.modelMetadata } : {}),
        models: [provider.model],
        name: provider.name,
        type: "openai_responses"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 }, rules: [] },
    virtualModelProfiles: []
  };
}

function prepareResponsesAttempt({ body, features, modelMetadata, name = "Provider", baseUrl = "https://provider.example/v1", model = "model" }) {
  return prepareGatewayUpstreamAttemptForTest({
    body: { model, ...body },
    config: responsesConfig({ baseUrl, features, model, modelMetadata, name }),
    headers: {
      "x-target-provider": name
    },
    method: "POST",
    path: "/v1/responses",
    routedModel: model
  });
}

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

test("OpenAI responses reasoning history keeps encrypted content and strips plaintext", () => {
  const attempt = prepareResponsesAttempt({
    baseUrl: "https://api.openai.com/v1",
    body: {
      include: ["reasoning.encrypted_content", "file_search_call.results"],
      input: [
        { content: [{ text: "hello", type: "input_text" }], role: "user", type: "message" },
        {
          content: [{ text: "raw reasoning", type: "reasoning_text" }],
          encrypted_content: null,
          id: "rs_plain",
          status: "completed",
          summary: [],
          type: "reasoning"
        },
        {
          content: [{ text: "raw encrypted reasoning", type: "reasoning_text" }],
          encrypted_content: "encrypted-state",
          id: "rs_encrypted",
          status: "completed",
          summary: [{ text: "brief summary", type: "summary_text" }],
          type: "reasoning"
        }
      ]
    },
    features: { reasoningHistoryPolicy: "encrypted" },
    model: "gpt-5.5",
    name: "OpenAI"
  });

  assert.deepEqual(attempt.body.include, ["reasoning.encrypted_content", "file_search_call.results"]);
  assert.deepEqual(attempt.body.input, [
    { content: [{ text: "hello", type: "input_text" }], role: "user", type: "message" },
    {
      encrypted_content: "encrypted-state",
      id: "rs_encrypted",
      status: "completed",
      summary: [{ text: "brief summary", type: "summary_text" }],
      type: "reasoning"
    }
  ]);
});

test("plaintext responses reasoning history can use summary as content fallback", () => {
  const attempt = prepareResponsesAttempt({
    baseUrl: "https://api.deepseek.com",
    body: {
      include: ["reasoning.encrypted_content", "file_search_call.results"],
      input: [
        {
          content: [],
          encrypted_content: "encrypted-state",
          id: "rs_summary",
          status: "completed",
          summary: [{ text: "summary fallback", type: "summary_text" }],
          type: "reasoning"
        },
        {
          content: [{ text: "raw reasoning", type: "reasoning_text" }],
          encrypted_content: "encrypted-state",
          id: "rs_plain",
          status: "completed",
          summary: [{ text: "unused summary", type: "summary_text" }],
          type: "reasoning"
        }
      ]
    },
    features: {
      reasoningHistoryPolicy: "plaintext",
      reasoningSummaryPolicy: "as_content"
    },
    model: "deepseek-v4-flash",
    name: "DeepSeek"
  });

  assert.deepEqual(attempt.body.include, ["file_search_call.results"]);
  assert.deepEqual(attempt.body.input, [
    {
      content: [{ text: "summary fallback", type: "reasoning_text" }],
      id: "rs_summary",
      status: "completed",
      type: "reasoning"
    },
    {
      content: [{ text: "raw reasoning", type: "reasoning_text" }],
      id: "rs_plain",
      status: "completed",
      type: "reasoning"
    }
  ]);
});

test("unknown responses-compatible providers strip reasoning history by default", () => {
  const attempt = prepareResponsesAttempt({
    body: {
      include: ["reasoning.encrypted_content"],
      input: [
        {
          content: [{ text: "raw reasoning", type: "reasoning_text" }],
          encrypted_content: "encrypted-state",
          id: "rs_unknown",
          status: "completed",
          summary: [{ text: "summary", type: "summary_text" }],
          type: "reasoning"
        },
        { content: [{ text: "hello", type: "input_text" }], role: "user", type: "message" }
      ]
    },
    name: "OpenAI Compatible"
  });

  assert.equal(attempt.body.include, undefined);
  assert.deepEqual(attempt.body.input, [
    { content: [{ text: "hello", type: "input_text" }], role: "user", type: "message" }
  ]);
});

test("responses reasoning history auto detection only uses official base URLs", () => {
  const openAiAttempt = prepareResponsesAttempt({
    baseUrl: "https://api.openai.com/v1",
    body: {
      include: ["reasoning.encrypted_content"],
      input: [
        {
          content: [{ text: "raw reasoning", type: "reasoning_text" }],
          encrypted_content: "encrypted-state",
          id: "rs_openai",
          status: "completed",
          summary: [{ text: "summary", type: "summary_text" }],
          type: "reasoning"
        }
      ]
    },
    model: "gpt-5.5",
    name: "Any Name"
  });

  assert.deepEqual(openAiAttempt.body.input, [
    {
      encrypted_content: "encrypted-state",
      id: "rs_openai",
      status: "completed",
      summary: [{ text: "summary", type: "summary_text" }],
      type: "reasoning"
    }
  ]);

  const deepSeekAttempt = prepareResponsesAttempt({
    baseUrl: "https://api.deepseek.com",
    body: {
      include: ["reasoning.encrypted_content"],
      input: [
        {
          content: [{ text: "raw reasoning", type: "reasoning_text" }],
          encrypted_content: "encrypted-state",
          id: "rs_deepseek",
          status: "completed",
          summary: [{ text: "summary", type: "summary_text" }],
          type: "reasoning"
        }
      ]
    },
    model: "deepseek-reasoner",
    name: "Any Name"
  });

  assert.deepEqual(deepSeekAttempt.body.input, [
    {
      content: [{ text: "raw reasoning", type: "reasoning_text" }],
      id: "rs_deepseek",
      status: "completed",
      type: "reasoning"
    }
  ]);

  const nameOnlyAttempt = prepareResponsesAttempt({
    baseUrl: "https://gateway.example/v1",
    body: {
      include: ["reasoning.encrypted_content"],
      input: [
        {
          content: [{ text: "raw reasoning", type: "reasoning_text" }],
          encrypted_content: "encrypted-state",
          id: "rs_name_only",
          status: "completed",
          summary: [{ text: "summary", type: "summary_text" }],
          type: "reasoning"
        }
      ]
    },
    model: "model",
    name: "OpenAI DeepSeek Compatible"
  });

  assert.equal(nameOnlyAttempt.body.include, undefined);
  assert.deepEqual(nameOnlyAttempt.body.input, []);
});

test("responses reasoning history uses model protocol features before provider defaults", () => {
  const attempt = prepareResponsesAttempt({
    body: {
      include: ["reasoning.encrypted_content"],
      input: [
        {
          content: [],
          encrypted_content: "encrypted-state",
          id: "rs_model_override",
          status: "completed",
          summary: [{ text: "model summary", type: "summary_text" }],
          type: "reasoning"
        }
      ]
    },
    features: {
      reasoningHistoryPolicy: "strip"
    },
    model: "custom-gpt-5.5",
    modelMetadata: {
      "custom-gpt-5.5": {
        protocolFeatures: {
          openai_responses: {
            reasoningHistoryPolicy: "plaintext",
            reasoningSummaryPolicy: "as_content"
          }
        }
      }
    }
  });

  assert.equal(attempt.body.include, undefined);
  assert.deepEqual(attempt.body.input, [
    {
      content: [{ text: "model summary", type: "reasoning_text" }],
      id: "rs_model_override",
      status: "completed",
      type: "reasoning"
    }
  ]);
});

test("provider model protocols limit capability routing per model", () => {
  const config = {
    Providers: [
      {
        api_base_url: "https://provider.example/v1",
        capabilities: [
          {
            baseUrl: "https://provider.example/v1",
            type: "openai_chat_completions"
          },
          {
            baseUrl: "https://provider.example/v1",
            type: "openai_responses"
          }
        ],
        modelMetadata: {
          "chat-only": {
            protocols: ["openai_chat_completions"]
          },
          "responses-only": {
            protocols: ["openai_responses"]
          },
          "disabled-model": {
            protocols: []
          }
        },
        models: ["chat-only", "responses-only", "disabled-model"],
        name: "Multi Protocol",
        type: "openai_chat_completions"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 }, rules: [] },
    virtualModelProfiles: []
  };

  const chatAttempt = prepareGatewayUpstreamAttemptForTest({
    body: { model: "chat-only" },
    config,
    headers: {},
    method: "POST",
    path: "/v1/responses",
    routedModel: "chat-only"
  });
  assert.equal(chatAttempt.body.model, "chat-only");
  assert.match(chatAttempt.headers?.["x-target-provider"] ?? "", /::openai_chat_completions$/);

  const responsesAttempt = prepareGatewayUpstreamAttemptForTest({
    body: { model: "responses-only" },
    config,
    headers: {},
    method: "POST",
    path: "/v1/responses",
    routedModel: "responses-only"
  });
  assert.equal(responsesAttempt.body.model, "responses-only");
  assert.match(responsesAttempt.headers?.["x-target-provider"] ?? "", /::openai_responses$/);

  const disabledAttempt = prepareGatewayUpstreamAttemptForTest({
    body: { model: "disabled-model" },
    config,
    headers: {},
    method: "POST",
    path: "/v1/responses",
    routedModel: "disabled-model"
  });
  assert.equal(disabledAttempt.headers?.["x-target-provider"], undefined);
});
