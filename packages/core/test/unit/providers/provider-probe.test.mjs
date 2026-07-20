import assert from "node:assert/strict";
import test from "node:test";
import {
  newApiKeyUsageFallbackMessageForTest,
  newApiKeyUsageMetersForTest,
  newApiUserSelfMetersForTest
} from "@ccr/core/providers/account-service.ts";
import { detectedProviderFromHeaders, newApiKeyUsageAccountConfig, newApiUserSelfConnectorConfig } from "@ccr/core/providers/new-api.ts";
import {
  checkGatewayProviderConnectivity,
  isProviderProtocolEndpointSupportedForProbe,
  probeGatewayProvider
} from "@ccr/core/providers/probe.ts";

test("protocol support probe does not treat Gemini auth errors as every protocol", () => {
  const message = "HTTP 403: API key not valid. Please pass a valid API key.";
  const hints = ["gemini_generate_content"];

  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(403, message, "anthropic_messages", hints),
    false
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(403, message, "openai_chat_completions", hints),
    false
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(403, message, "openai_responses", hints),
    false
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(403, message, "gemini_generate_content", hints),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(403, message, "gemini_interactions", hints),
    false
  );
});

test("protocol support probe keeps auth-only fallback for unhinted endpoints", () => {
  const message = "HTTP 401: Unauthorized";

  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(401, message, "openai_chat_completions", []),
    true
  );
});

test("NVIDIA probe never requests or persists the Responses protocol", async (t) => {
  const previousFetch = globalThis.fetch;
  const paths = [];

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    return new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
      headers: { "content-type": "application/json" },
      status: 401
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const probe = await probeGatewayProvider({
    baseUrl: "https://integrate.api.nvidia.com/v1",
    forceRefresh: true,
    mode: "protocols",
    protocols: ["openai_responses", "openai_chat_completions"]
  });

  assert.deepEqual(paths, ["/v1/chat/completions"]);
  assert.deepEqual(
    probe.protocols.map(({ protocol, status, supported }) => ({ protocol, status, supported })),
    [{ protocol: "openai_chat_completions", status: 401, supported: true }]
  );
  assert.deepEqual(
    probe.capabilities?.map(({ type }) => type),
    ["openai_chat_completions"]
  );
  assert.equal(probe.detectedProtocol, "openai_chat_completions");
  assert.equal(
    probe.catalogModelMetadata?.["qwen/qwen2.5-coder-32b-instruct"]?.contextWindow,
    128000
  );
});

test("protocol support probe treats HTTP 400 validation as protocol support", () => {
  const message = "HTTP 400: * GenerateContentRequest.contents: contents is not specified";

  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(400, message, "gemini_generate_content", ["gemini_generate_content"]),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(400, message, "openai_chat_completions", ["openai_chat_completions"]),
    true
  );
});

test("protocol support probe treats HTTP 400 input validation as protocol support", () => {
  const message = "HTTP 400: Gemini Interactions request requires input.";

  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(400, message, "gemini_interactions", ["gemini_interactions"]),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(400, message, "gemini_generate_content", ["gemini_generate_content"]),
    true
  );
});

test("protocol support probe still rejects HTTP 400 route misses", () => {
  const message = "HTTP 400: unknown route";

  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(400, message, "openai_chat_completions", ["openai_chat_completions"]),
    false
  );
});

test("media protocol support recognizes validation responses and HTTP 401 endpoints", () => {
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(
      422,
      "prompt is required",
      "openai_image_generations",
      []
    ),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(
      401,
      "Unauthorized",
      "openai_video_generations",
      []
    ),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(
      401,
      "Unauthorized",
      "openai_video_generations",
      ["openai_video_generations"]
    ),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(
      401,
      "Unauthorized",
      "openai_image_generations",
      []
    ),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(
      401,
      "unknown route",
      "openai_image_generations",
      []
    ),
    false
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(
      403,
      "Forbidden",
      "openai_video_generations",
      []
    ),
    false
  );
});

test("provider probe exposes image and video capabilities when their endpoints return HTTP 401", async (t) => {
  const previousFetch = globalThis.fetch;
  const paths = [];

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    return new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
      headers: { "content-type": "application/json" },
      status: 401
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const probe = await probeGatewayProvider({
    baseUrl: "http://127.0.0.1:49124/v1",
    forceRefresh: true,
    mode: "protocols",
    protocols: ["openai_image_generations", "openai_video_generations"]
  });

  assert.deepEqual(paths, ["/v1/images/generations", "/v1/videos/generations"]);
  assert.deepEqual(
    probe.protocols.map(({ protocol, status, supported }) => ({ protocol, status, supported })),
    [
      { protocol: "openai_image_generations", status: 401, supported: true },
      { protocol: "openai_video_generations", status: 401, supported: true }
    ]
  );
  assert.deepEqual(
    probe.capabilities?.map(({ type }) => type),
    ["openai_image_generations", "openai_video_generations"]
  );
});

test("connectivity probe applies provider plugin auth for local agent imports", async (t) => {
  const previousFetch = globalThis.fetch;
  let called = false;

  globalThis.fetch = async (input, init) => {
    called = true;
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);

    assert.equal(url.origin, "http://127.0.0.1:49123");
    assert.equal(url.pathname, "/v1/chat/completions");
    assert.equal(url.searchParams.get("key"), "plugin-query-key");
    assert.equal(headers.get("authorization"), "Bearer plugin-token");
    assert.equal(headers.get("x-local-agent"), "opencode");

    return new Response(JSON.stringify({ id: "ok" }), {
      headers: { "content-type": "application/json" },
      status: 200
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const report = await checkGatewayProviderConnectivity({
    apiKey: "ccr-local-agent-login",
    candidates: [{
      baseUrl: "http://127.0.0.1:49123/v1",
      name: "Local Agent",
      protocols: ["openai_chat_completions"],
      source: "preset"
    }],
    forceRefresh: true,
    models: ["local-model"],
    providerPlugins: [{
      auth: {
        headers: {
          authorization: "Bearer plugin-token",
          "x-local-agent": "opencode"
        },
        query: {
          key: "plugin-query-key"
        },
        removeHeaders: ["authorization"]
      }
    }],
    protocols: ["openai_chat_completions"]
  });

  assert.equal(called, true);
  assert.equal(report.passed.length, 1);
  assert.equal(report.failed.length, 0);
  assert.equal(report.results[0]?.supported, true);
});

test("New API response headers enable key quota account connector", () => {
  assert.equal(detectedProviderFromHeaders({ "X-New-Api-Version": "0.8.0" }), "new-api");
  assert.equal(detectedProviderFromHeaders({ "x-oneapi-request-id": "req-1" }), "new-api");
  assert.equal(detectedProviderFromHeaders({ "content-type": "application/json" }), undefined);

  const account = newApiKeyUsageAccountConfig("https://gateway.example/v1");
  const connector = account.connectors?.[0];
  assert.equal(account.enabled, true);
  assert.equal(connector?.type, "http-json");
  assert.equal(connector?.endpoint, "https://gateway.example/api/usage/token/");
  assert.equal(connector?.parser, "new-api-key-usage");
  assert.equal(connector?.mapping.meters[0]?.kind, "quota");
  assert.equal(connector?.mapping.meters[0]?.remaining, "$.data.total_available");
  assert.equal(connector?.mapping.meters[0]?.limit, "$.data.total_granted");
  assert.equal(connector?.mapping.meters[0]?.used, "$.data.total_used");

  const userBalanceConnector = newApiUserSelfConnectorConfig("https://gateway.example/v1");
  assert.equal(userBalanceConnector.endpoint, "https://gateway.example/api/user/self");
  assert.equal(userBalanceConnector.parser, "new-api-user-self");
  assert.equal(userBalanceConnector.headers?.["New-Api-User"], "<user-id>");
});

test("New API key usage parser ignores keys without a dedicated quota", () => {
  const payload = {
    code: true,
    data: {
      name: "default",
      total_available: 0,
      total_granted: 0,
      total_used: 0,
      unlimited_quota: true
    },
    message: "ok"
  };

  assert.deepEqual(newApiKeyUsageMetersForTest(payload), []);
  assert.match(newApiKeyUsageFallbackMessageForTest(payload), /no dedicated quota/i);
});

test("New API user self parser returns user balance", () => {
  const payload = {
    data: {
      quota: 1250,
      used_quota: 250
    },
    message: "",
    success: true
  };

  assert.deepEqual(newApiUserSelfMetersForTest(payload), [{
    id: "new_api_user_balance",
    kind: "balance",
    label: "User balance",
    limit: 1500,
    remaining: 1250,
    source: "http-json",
    unit: "quota",
    used: 250
  }]);
});
