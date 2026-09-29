import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  probeGatewayProvider,
  probeGatewayProviderCandidates
} from "@ccr/core/providers/probe.ts";

test("#1778 Gemini probe does not present an AI Studio API key as an OAuth bearer token", async (t) => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), headers: new Headers(init.headers) });
    return new Response(JSON.stringify({ error: { message: "Missing contents" } }), { status: 400 });
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  await probeGatewayProvider({ baseUrl: "https://generativelanguage.googleapis.com", apiKey: "AIza-test-key", forceRefresh: true, mode: "protocols", protocols: ["gemini_generate_content"] });
  assert.ok(requests.length > 0);
  for (const request of requests) {
    assert.equal(request.headers.get("authorization"), null);
    assert.equal(request.headers.get("x-goog-api-key"), "AIza-test-key");
  }
});

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
    131072
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

test("candidate protocol probe carries the entered API key and Authorization fallback", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({
      authorization: headers.get("authorization"),
      pathname: url.pathname,
      protocol: url.pathname.includes("/messages")
        ? "anthropic"
        : url.pathname.includes(":generateContent")
          ? "gemini"
          : "openai",
      xApiKey: headers.get("x-api-key"),
      xGoogApiKey: headers.get("x-goog-api-key")
    });

    return new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
      headers: { "content-type": "application/json" },
      status: 401
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  await probeGatewayProviderCandidates({
    apiKey: "sk-probe-key",
    candidates: [{
      baseUrl: "http://127.0.0.1:49124",
      protocols: ["openai_chat_completions", "anthropic_messages", "gemini_generate_content"],
      source: "custom"
    }],
    forceRefresh: true,
    mode: "protocols",
    protocols: ["openai_chat_completions", "anthropic_messages", "gemini_generate_content"]
  });

  assert.deepEqual(
    calls.map((call) => call.protocol),
    ["openai", "anthropic", "gemini"]
  );
  assert.equal(calls[0]?.authorization, "Bearer sk-probe-key");
  assert.equal(calls[1]?.authorization, "Bearer sk-probe-key");
  assert.equal(calls[1]?.xApiKey, "sk-probe-key");
  assert.equal(calls[2]?.authorization, "Bearer sk-probe-key");
  assert.equal(calls[2]?.xGoogApiKey, "sk-probe-key");
});

test("model discovery carries Authorization fallback for protocol-specific API keys", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({
      authorization: headers.get("authorization"),
      key: url.searchParams.get("key"),
      pathname: url.pathname,
      xApiKey: headers.get("x-api-key"),
      xGoogApiKey: headers.get("x-goog-api-key")
    });

    return new Response(JSON.stringify({ data: [] }), {
      headers: { "content-type": "application/json" },
      status: 200
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  await probeGatewayProvider({
    apiKey: "Bearer sk-model-key",
    baseUrl: "http://127.0.0.1:49124",
    forceRefresh: true,
    mode: "models",
    protocols: ["openai_chat_completions", "anthropic_messages", "gemini_generate_content"]
  });

  const modelCalls = calls.filter((call) => call.pathname.endsWith("/models"));
  assert.equal(modelCalls.length >= 3, true);
  assert.equal(calls.every((call) => call.authorization === "Bearer sk-model-key"), true);
  assert.equal(modelCalls.some((call) => call.xApiKey === "sk-model-key"), true);
  assert.equal(
    modelCalls.some((call) => call.key === "sk-model-key" && call.xGoogApiKey === "sk-model-key"),
    true
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

test("connectivity probe applies provider plugin request transforms", async (t) => {
  const previousFetch = globalThis.fetch;
  let called = false;

  globalThis.fetch = async (input, init) => {
    called = true;
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body ?? "{}"));

    assert.equal(url.origin, "http://127.0.0.1:49124");
    assert.equal(url.pathname, "/v1/responses");
    assert.equal(url.searchParams.get("probe_model"), "probe-model");
    assert.equal(headers.get("x-probe-model"), "probe-model");
    assert.equal(body.model, "probe-model");
    assert.equal(body.max_output_tokens, undefined);

    return new Response(JSON.stringify({ id: "ok" }), {
      headers: { "content-type": "application/json" },
      status: 200
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const report = await checkGatewayProviderConnectivity({
    apiKey: "sk-test",
    candidates: [{
      baseUrl: "http://127.0.0.1:49124/v1",
      name: "Local Agent",
      protocols: ["openai_responses"],
      source: "custom"
    }],
    forceRefresh: true,
    models: ["probe-model"],
    providerPlugins: [{
      request: {
        bodyRemove: ["max_output_tokens"],
        headers: {
          "x-probe-model": "{{ model }}"
        },
        query: {
          probe_model: "{{ request.body.model }}"
        }
      }
    }],
    protocols: ["openai_responses"]
  });

  assert.equal(called, true);
  assert.equal(report.passed.length, 1);
  assert.equal(report.failed.length, 0);
});

test("connectivity probe refreshes Codex OAuth plugin auth", async (t) => {
  const previousFetch = globalThis.fetch;
  const accessToken = jwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-refreshed"
    },
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api.connectors.read api.connectors.invoke"
  });
  const calls = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({
      authorization: headers.get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      chatgptAccountId: headers.get("chatgpt-account-id"),
      method: init?.method,
      pathname: url.pathname,
      url: url.toString()
    });

    if (url.toString() === "http://127.0.0.1:49122/oauth/token") {
      return new Response(JSON.stringify({
        access_token: accessToken,
        refresh_token: "refresh-next"
      }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    }

    if (url.origin === "http://127.0.0.1:49122" && url.pathname === "/codex/responses") {
      const ok =
        headers.get("authorization") === `Bearer ${accessToken}` &&
        headers.get("chatgpt-account-id") === "acct-refreshed";
      return new Response(JSON.stringify(ok ? { id: "ok" } : { error: { message: "Unauthorized" } }), {
        headers: { "content-type": "application/json" },
        status: ok ? 200 : 401
      });
    }

    return new Response(JSON.stringify({ error: { message: "Unexpected request" } }), {
      headers: { "content-type": "application/json" },
      status: 404
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const report = await checkGatewayProviderConnectivity({
    apiKey: "ccr-local-agent-login",
    candidates: [{
      baseUrl: "http://127.0.0.1:49122/codex",
      name: "Codex API",
      protocols: ["openai_responses"],
      source: "custom"
    }],
    forceRefresh: true,
    models: ["gpt-5-codex"],
    providerPlugins: [{
      codexOauth: {
        refreshToken: "refresh-current",
        tokenEndpoint: "http://127.0.0.1:49122/oauth/token"
      },
      key: "ccr-local-agent-codex-api-codex-oauth",
      providerName: "Codex API"
    }],
    protocols: ["openai_responses"]
  });

  assert.equal(report.passed.length, 1);
  assert.equal(report.failed.length, 0);
  assert.deepEqual(calls.map((call) => call.pathname), ["/oauth/token", "/codex/responses"]);
  assert.deepEqual(calls[0]?.body, {
    client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
    grant_type: "refresh_token",
    refresh_token: "refresh-current",
    scope: "openid profile email offline_access api.connectors.read api.connectors.invoke"
  });
  assert.equal(calls[1]?.authorization, `Bearer ${accessToken}`);
  assert.equal(calls[1]?.chatgptAccountId, "acct-refreshed");
});

test("connectivity probe applies Codex request defaults for OAuth plugins", async (t) => {
  const previousFetch = globalThis.fetch;
  const accessToken = jwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-codex-defaults"
    },
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api.connectors.read api.connectors.invoke"
  });
  let requestBody;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (url.toString() === "https://chatgpt.com/backend-api/codex/responses") {
      const ok =
        headers.get("authorization") === `Bearer ${accessToken}` &&
        headers.get("chatgpt-account-id") === "acct-codex-defaults" &&
        requestBody?.max_output_tokens === undefined;
      return new Response(JSON.stringify(ok ? { id: "ok" } : { error: { message: "Bad request" } }), {
        headers: { "content-type": "application/json" },
        status: ok ? 200 : 400
      });
    }

    return new Response(JSON.stringify({ error: { message: "Unexpected request" } }), {
      headers: { "content-type": "application/json" },
      status: 404
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const report = await checkGatewayProviderConnectivity({
    apiKey: "ccr-local-agent-login",
    candidates: [{
      baseUrl: "https://chatgpt.com/backend-api/codex",
      name: "Codex API",
      protocols: ["openai_responses"],
      source: "custom"
    }],
    forceRefresh: true,
    models: ["gpt-5-codex"],
    providerPlugins: [{
      codexOauth: {
        accessToken
      },
      key: "ccr-local-agent-codex-api-codex-oauth",
      providerName: "Codex API"
    }],
    protocols: ["openai_responses"]
  });

  assert.equal(report.passed.length, 1);
  assert.equal(report.failed.length, 0);
  assert.equal(requestBody?.model, "gpt-5-codex");
  assert.equal(requestBody?.max_output_tokens, undefined);
});

test("connectivity probe prefers live Codex auth over saved OAuth plugin tokens", async (t) => {
  useTemporaryCodexHome(t, "ccr-codex-probe-live-over-plugin-");
  const previousFetch = globalThis.fetch;
  const savedToken = jwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-saved-plugin"
    },
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api.connectors.read api.connectors.invoke"
  });
  const liveToken = jwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-live-token"
    },
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api.connectors.read api.connectors.invoke"
  });
  const calls = [];

  fs.mkdirSync(path.join(process.env.CCR_INTERNAL_HOME_DIR, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(process.env.CCR_INTERNAL_HOME_DIR, ".codex", "auth.json"), JSON.stringify({
    tokens: {
      access_token: liveToken,
      account_id: "acct-live-file",
      refresh_token: "refresh-live"
    }
  }));

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({
      authorization: headers.get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      chatgptAccountId: headers.get("chatgpt-account-id"),
      pathname: url.pathname,
      url: url.toString()
    });

    if (url.toString() === "https://chatgpt.com/backend-api/codex/responses") {
      const ok =
        headers.get("authorization") === `Bearer ${liveToken}` &&
        headers.get("chatgpt-account-id") === "acct-live-file";
      return new Response(JSON.stringify(ok ? { id: "ok" } : { error: { message: "Unauthorized" } }), {
        headers: { "content-type": "application/json" },
        status: ok ? 200 : 401
      });
    }

    return new Response(JSON.stringify({ error: { message: "Unexpected request" } }), {
      headers: { "content-type": "application/json" },
      status: 404
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const report = await checkGatewayProviderConnectivity({
    apiKey: "ccr-local-agent-login",
    candidates: [{
      baseUrl: "https://chatgpt.com/backend-api/codex",
      name: "Codex API",
      protocols: ["openai_responses"],
      source: "custom"
    }],
    forceRefresh: true,
    models: ["gpt-5-codex"],
    providerPlugins: [{
      codexOauth: {
        accessToken: savedToken,
        accountId: "acct-saved-plugin"
      },
      key: "ccr-local-agent-codex-api-codex-oauth",
      providerName: "Codex API"
    }],
    protocols: ["openai_responses"]
  });

  assert.equal(report.passed.length, 1);
  assert.equal(report.failed.length, 0);
  assert.deepEqual(calls.map((call) => call.pathname), ["/backend-api/codex/responses"]);
  assert.equal(calls[0]?.authorization, `Bearer ${liveToken}`);
  assert.equal(calls[0]?.chatgptAccountId, "acct-live-file");
  assert.equal(calls[0]?.body?.max_output_tokens, undefined);
});

test("connectivity probe shares concurrent Codex OAuth refreshes", async (t) => {
  const previousFetch = globalThis.fetch;
  const accessToken = jwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-shared-refresh"
    },
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api.connectors.read api.connectors.invoke"
  });
  let refreshCalls = 0;
  let responseCalls = 0;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);

    if (url.toString() === "http://127.0.0.1:49125/oauth/token") {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return new Response(JSON.stringify({
        access_token: accessToken,
        refresh_token: "refresh-shared-next"
      }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    }

    if (url.origin === "http://127.0.0.1:49125" && url.pathname === "/codex/responses") {
      responseCalls += 1;
      const ok =
        headers.get("authorization") === `Bearer ${accessToken}` &&
        headers.get("chatgpt-account-id") === "acct-shared-refresh";
      return new Response(JSON.stringify(ok ? { id: "ok" } : { error: { message: "Unauthorized" } }), {
        headers: { "content-type": "application/json" },
        status: ok ? 200 : 401
      });
    }

    return new Response(JSON.stringify({ error: { message: "Unexpected request" } }), {
      headers: { "content-type": "application/json" },
      status: 404
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const report = await checkGatewayProviderConnectivity({
    apiKey: "ccr-local-agent-login",
    candidates: [{
      baseUrl: "http://127.0.0.1:49125/codex",
      name: "Codex API",
      protocols: ["openai_responses"],
      source: "custom"
    }],
    forceRefresh: true,
    models: ["gpt-5-a", "gpt-5-b"],
    providerPlugins: [{
      codexOauth: {
        refreshToken: "refresh-shared-current",
        tokenEndpoint: "http://127.0.0.1:49125/oauth/token"
      },
      key: "ccr-local-agent-codex-api-codex-oauth",
      providerName: "Codex API"
    }],
    protocols: ["openai_responses"]
  });

  assert.equal(refreshCalls, 1);
  assert.equal(responseCalls, 2);
  assert.equal(report.passed.length, 2);
  assert.equal(report.failed.length, 0);
});

test("connectivity probe recovers Codex OAuth auth when saved plugin is missing", async (t) => {
  useTemporaryCodexHome(t, "ccr-codex-probe-live-auth-");
  const previousFetch = globalThis.fetch;
  const accessToken = jwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-live-probe"
    },
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api.connectors.read api.connectors.invoke"
  });
  const calls = [];

  fs.mkdirSync(path.join(process.env.CCR_INTERNAL_HOME_DIR, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(process.env.CCR_INTERNAL_HOME_DIR, ".codex", "auth.json"), JSON.stringify({
    tokens: {
      refresh_token: "refresh-live"
    }
  }));

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({
      authorization: headers.get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      chatgptAccountId: headers.get("chatgpt-account-id"),
      pathname: url.pathname,
      url: url.toString()
    });

    if (url.toString() === "https://auth.openai.com/oauth/token") {
      return new Response(JSON.stringify({
        access_token: accessToken
      }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    }

    if (url.toString() === "https://chatgpt.com/backend-api/codex/responses") {
      const ok =
        headers.get("authorization") === `Bearer ${accessToken}` &&
        headers.get("chatgpt-account-id") === "acct-live-probe";
      return new Response(JSON.stringify(ok ? { id: "ok" } : { error: { message: "Unauthorized" } }), {
        headers: { "content-type": "application/json" },
        status: ok ? 200 : 401
      });
    }

    return new Response(JSON.stringify({ error: { message: "Unexpected request" } }), {
      headers: { "content-type": "application/json" },
      status: 404
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const report = await checkGatewayProviderConnectivity({
    apiKey: "ccr-local-agent-login",
    candidates: [{
      baseUrl: "https://chatgpt.com/backend-api/codex",
      name: "Codex API",
      protocols: ["openai_responses"],
      source: "custom"
    }],
    forceRefresh: true,
    models: ["gpt-5.5"],
    providerPlugins: [],
    protocols: ["openai_responses"]
  });

  assert.equal(report.passed.length, 1);
  assert.equal(report.failed.length, 0);
  assert.deepEqual(calls.map((call) => call.pathname), ["/oauth/token", "/backend-api/codex/responses"]);
  assert.equal(calls[0]?.body?.refresh_token, "refresh-live");
  assert.equal(calls[1]?.authorization, `Bearer ${accessToken}`);
  assert.equal(calls[1]?.chatgptAccountId, "acct-live-probe");
  assert.equal(calls[1]?.body?.max_output_tokens, undefined);
});

test("connectivity probe prefers live Claude Code OAuth over saved plugin tokens", async (t) => {
  const claudeConfigDir = useTemporaryClaudeCodeHome(t, "ccr-claude-code-probe-live-");
  const previousFetch = globalThis.fetch;
  const savedToken = "sk-ant-oat01-saved-stale-token";
  const liveToken = "sk-ant-oat01-live-access-token";
  const calls = [];

  fs.mkdirSync(claudeConfigDir, { recursive: true });
  fs.writeFileSync(path.join(claudeConfigDir, ".credentials.json"), JSON.stringify({
    claudeAiOauth: {
      accessToken: liveToken,
      refreshToken: "refresh-live"
    }
  }));

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({
      anthropicBeta: headers.get("anthropic-beta"),
      authorization: headers.get("authorization"),
      method: init?.method,
      pathname: url.pathname,
      xApiKey: headers.get("x-api-key")
    });

    const ok =
      headers.get("authorization") === `Bearer ${liveToken}` &&
      headers.get("x-api-key") === null;
    return new Response(JSON.stringify(ok ? { data: [{ id: "claude-sonnet-5" }] } : { error: { message: "Unauthorized" } }), {
      headers: { "content-type": "application/json" },
      status: ok ? 200 : 401
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const result = await probeGatewayProvider({
    apiKey: "ccr-local-agent-login",
    baseUrl: "http://127.0.0.1:49126",
    forceRefresh: true,
    mode: "models",
    providerPlugins: [{
      auth: {
        headers: {
          authorization: `Bearer ${savedToken}`
        },
        removeHeaders: ["x-api-key"]
      },
      key: "ccr-local-agent-claude-code-api-claude-code-oauth",
      providerName: "Claude Code API"
    }],
    protocols: ["anthropic_messages"]
  });

  assert.deepEqual(calls.map((call) => call.pathname).filter((pathname, index, all) => all.indexOf(pathname) === index), [
    "/v1/models",
    "/v1/messages"
  ]);
  assert.equal(calls[0]?.authorization, `Bearer ${liveToken}`);
  assert.equal(calls[0]?.xApiKey, null);
  assert.equal(calls[0]?.anthropicBeta, "oauth-2025-04-20");
  assert.deepEqual(result.models, ["claude-sonnet-5"]);
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

test("OpenCode Go model discovery only returns models for the requested protocol", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ccr-probe-opencode-"));
  const previousHome = process.env.CCR_INTERNAL_HOME_DIR;
  const previousFetch = globalThis.fetch;
  process.env.CCR_INTERNAL_HOME_DIR = home;
  fs.mkdirSync(path.join(home, ".cache", "opencode"), { recursive: true });
  fs.writeFileSync(path.join(home, ".cache", "opencode", "models.json"), JSON.stringify({
    "opencode-go": {
      api: "https://opencode.ai/zen/go/v1",
      models: {
        "go-chat": { name: "Go Chat", provider: { npm: "@ai-sdk/openai-compatible" } },
        "go-responses": { name: "Go Responses", provider: { npm: "@ai-sdk/openai" } },
        "stale-chat": { name: "Stale Chat", provider: { npm: "@ai-sdk/openai-compatible" } },
        "stale-responses": { name: "Stale Responses", provider: { npm: "@ai-sdk/openai" } }
      },
      name: "OpenCode Go",
      npm: "@ai-sdk/openai-compatible"
    }
  }));
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [{ id: "go-chat" }, { id: "go-responses" }]
  }), { headers: { "content-type": "application/json" }, status: 200 });
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousHome === undefined) {
      delete process.env.CCR_INTERNAL_HOME_DIR;
    } else {
      process.env.CCR_INTERNAL_HOME_DIR = previousHome;
    }
    fs.rmSync(home, { force: true, recursive: true });
  });

  const probe = await probeGatewayProvider({
    baseUrl: "https://opencode.ai/zen/go/v1",
    forceRefresh: true,
    mode: "models",
    protocols: ["openai_responses", "openai_chat_completions"]
  });
  assert.deepEqual(probe.models, ["go-chat", "go-responses"]);
  assert.deepEqual(probe.protocolModels, {
    openai_chat_completions: ["go-chat"],
    openai_responses: ["go-responses"]
  });

  const normalizedProbe = await probeGatewayProvider({
    baseUrl: "https://opencode.ai/zen/go",
    forceRefresh: true,
    mode: "models",
    protocols: ["openai_responses"]
  });
  assert.deepEqual(normalizedProbe.models, ["go-responses"]);
});

test("OpenCode Go model discovery keeps live models when the local catalog has no protocol models", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ccr-probe-opencode-empty-"));
  const previousHome = process.env.CCR_INTERNAL_HOME_DIR;
  const previousFetch = globalThis.fetch;
  process.env.CCR_INTERNAL_HOME_DIR = home;
  fs.mkdirSync(path.join(home, ".cache", "opencode"), { recursive: true });
  fs.writeFileSync(path.join(home, ".cache", "opencode", "models.json"), JSON.stringify({
    "opencode-go": {
      api: "https://opencode.ai/zen/go/v1",
      name: "OpenCode Go"
    }
  }));
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [{ id: "go-new" }]
  }), { headers: { "content-type": "application/json" }, status: 200 });
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousHome === undefined) {
      delete process.env.CCR_INTERNAL_HOME_DIR;
    } else {
      process.env.CCR_INTERNAL_HOME_DIR = previousHome;
    }
    fs.rmSync(home, { force: true, recursive: true });
  });

  const probe = await probeGatewayProvider({
    baseUrl: "https://opencode.ai/zen/go/v1",
    forceRefresh: true,
    mode: "models",
    protocols: ["openai_chat_completions"]
  });
  assert.deepEqual(probe.models, ["go-new"]);
  assert.equal(probe.protocolModels, undefined);
});

test("OpenCode Zen model discovery keeps paid models when the probe supplies an API key", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ccr-probe-opencode-paid-"));
  const previousHome = process.env.CCR_INTERNAL_HOME_DIR;
  const previousFetch = globalThis.fetch;
  process.env.CCR_INTERNAL_HOME_DIR = home;
  fs.mkdirSync(path.join(home, ".cache", "opencode"), { recursive: true });
  fs.writeFileSync(path.join(home, ".cache", "opencode", "models.json"), JSON.stringify({
    opencode: {
      api: "https://opencode.ai/zen/v1",
      models: {
        "free-model": { cost: { input: 0, output: 0 }, name: "Free Model", provider: { npm: "@ai-sdk/openai-compatible" } },
        "paid-model": { cost: { input: 3, output: 15 }, name: "Paid Model", provider: { npm: "@ai-sdk/openai-compatible" } }
      },
      name: "OpenCode Zen",
      npm: "@ai-sdk/openai-compatible"
    }
  }));
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [{ id: "free-model" }, { id: "paid-model" }]
  }), { headers: { "content-type": "application/json" }, status: 200 });
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousHome === undefined) {
      delete process.env.CCR_INTERNAL_HOME_DIR;
    } else {
      process.env.CCR_INTERNAL_HOME_DIR = previousHome;
    }
    fs.rmSync(home, { force: true, recursive: true });
  });

  const probe = await probeGatewayProvider({
    apiKey: "paid-zen-key",
    baseUrl: "https://opencode.ai/zen/v1",
    forceRefresh: true,
    mode: "models",
    protocols: ["openai_chat_completions"]
  });
  assert.deepEqual(probe.models, ["free-model", "paid-model"]);
  assert.deepEqual(probe.protocolModels, {
    openai_chat_completions: ["free-model", "paid-model"]
  });
});

function jwt(payload) {
  return [
    base64url({ alg: "none", typ: "JWT" }),
    base64url(payload),
    ""
  ].join(".");
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function useTemporaryClaudeCodeHome(t, prefix) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const previousHome = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = path.join(home, ".claude");
  t.after(() => {
    if (previousHome === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousHome;
    }
  });
  return path.join(home, ".claude");
}

function useTemporaryCodexHome(t, prefix) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const previousHome = process.env.CCR_INTERNAL_HOME_DIR;
  process.env.CCR_INTERNAL_HOME_DIR = home;
  t.after(() => {
    if (previousHome === undefined) {
      delete process.env.CCR_INTERNAL_HOME_DIR;
    } else {
      process.env.CCR_INTERNAL_HOME_DIR = previousHome;
    }
  });
  return home;
}
