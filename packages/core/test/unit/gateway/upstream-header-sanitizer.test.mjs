import assert from "node:assert/strict";
import test from "node:test";
import {
  createGatewayPlugin,
  rewriteUpstreamProviderUrl,
  sanitizeUpstreamProviderHeaders
} from "@ccr/core/gateway/core-runtime/upstream-header-sanitizer.ts";

test("#1778 native Gemini sends AI Studio keys as API keys while OpenAI compatibility keeps bearer auth", () => {
  const [hook] = createGatewayPlugin().providerHooks;
  for (const type of ["gemini_generate_content", "gemini_interactions", "openai_chat_completions"]) {
    const key = "AIza-test-provider-key";
    const native = type !== "openai_chat_completions";
    const result = hook.transformRequest({
      targetProviderConfig: { type, apikey: key },
      upstreamRequest: { body: {}, headers: { authorization: `Bearer ${key}` }, url: "https://generativelanguage.googleapis.com/v1beta/models/model:generateContent" }
    }).value;
    assert.equal(result.headers.authorization, native ? undefined : `Bearer ${key}`);
    assert.equal(result.headers["x-goog-api-key"], native ? key : undefined);
    assert.equal(new URL(result.url).searchParams.get("key"), native ? key : null);
  }
});

test("provider boundary removes CCR-owned headers and preserves provider headers", () => {
  assert.deepEqual(sanitizeUpstreamProviderHeaders({
    authorization: "Bearer provider-token",
    "X-Auth-API-Key-ID": "profile:claude",
    "x-auth-sub": "profile:claude",
    "x-auth-token": "provider-specific-token",
    "x-ccr-core-auth": "core-secret",
    "X-CCR-Route-Reason": "rule:claude",
    "x-client-request-id": "request-1"
  }), {
    authorization: "Bearer provider-token",
    "x-auth-token": "provider-specific-token",
    "x-client-request-id": "request-1"
  });
});

test("gateway sanitizer hook runs on the final upstream request shape", async () => {
  const [hook] = createGatewayPlugin().providerHooks;
  const upstreamRequest = {
    body: { model: "provider-model" },
    headers: {
      "content-type": "application/json",
      "x-ccr-provider-credential-id": "credential-id",
      "x-auth-api-key-id": "profile:codex"
    },
    method: "POST",
    url: "https://provider.example/v1/responses"
  };

  const result = await hook.transformRequest({ upstreamRequest });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    ...upstreamRequest,
    headers: { "content-type": "application/json" }
  });
  assert.equal(upstreamRequest.headers["x-ccr-provider-credential-id"], "credential-id");
});

test("gateway sanitizer hook forwards client headers without overriding provider headers", async () => {
  const [hook] = createGatewayPlugin().providerHooks;
  const upstreamRequest = {
    body: { model: "provider-model" },
    headers: {
      authorization: "Bearer provider-token",
      "Content-Type": "application/json"
    },
    method: "POST",
    url: "https://provider.example/v1/responses"
  };

  const result = await hook.transformRequest({
    request: {
      headers: {
        authorization: "Bearer ccr-client-token",
        "api-key": "legacy-client-token",
        connection: "keep-alive, x-hop-only",
        "content-length": "123",
        "content-type": "text/plain",
        cookie: "client-cookie=value",
        host: "127.0.0.1:3457",
        "http-referer": "https://cherry-ai.com",
        "user-agent": "Codex Desktop",
        "x-auth-api-key-id": "profile:codex",
        "x-auth-provider-extension": "provider-extension",
        "x-ccr-core-auth": "core-secret",
        "x-codex-access-token": "codex-client-token",
        "x-custom-provider-header": "custom-value",
        "x-custom-list": ["one", "two"],
        "x-goog-api-key": "google-client-token",
        "x-hop-only": "remove-me",
        "x-mcp-key": "mcp-client-token",
        "x-api-key": "client-token",
        "x-target-model": "internal-provider/internal-model",
        "x-target-provider": "internal-provider",
        "x-title": "Claude Code Router"
      }
    },
    upstreamRequest
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.headers, {
    authorization: "Bearer provider-token",
    "content-type": "application/json",
    "http-referer": "https://cherry-ai.com",
    "user-agent": "Codex Desktop",
    "x-auth-provider-extension": "provider-extension",
    "x-custom-provider-header": "custom-value",
    "x-custom-list": "one,two",
    "x-title": "Claude Code Router"
  });
});

test("gateway sanitizer hook does not inherit Cloudflare headers, cookies or CDN metadata", () => {
  const [hook] = createGatewayPlugin().providerHooks;
  const requestHeaders = {
    "CF-Connecting-IP": "192.0.2.10",
    "Cf-Connecting-IPv6": "2001:db8::10",
    "cf-pseudo-ipv4": "240.0.0.10",
    "CF-IPCountry": "XX",
    "CF-Access-Jwt-Assertion": "synthetic-inbound-jwt",
    "CF-Access-Client-Id": "synthetic-inbound-client",
    "CF-Access-Client-Secret": "synthetic-inbound-secret",
    "CF-Access-Authenticated-User-Email": "user@example.test",
    "CF-Warp-Tag-Id": "synthetic-warp-tag",
    "CF-Ray": "synthetic-ray",
    "CF-Visitor": '{"scheme":"https"}',
    "Cf-Future-Metadata": ["one", "two"],
    "CoOkIe": "synthetic-session=value",
    "CDN-Loop": "cloudflare",
    "True-Client-IP": "192.0.2.10",
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "synthetic-beta",
    "user-agent": "synthetic-cli",
    "x-claude-code-session-id": "synthetic-session",
    "x-custom-provider-header": "custom-value"
  };
  const originalHeaders = structuredClone(requestHeaders);
  const upstreamRequest = {
    body: { model: "provider-model", messages: [], stream: true },
    headers: { authorization: "Bearer provider-token", "content-type": "application/json" },
    method: "POST",
    url: "https://provider.example/v1/messages"
  };

  const result = hook.transformRequest({ request: { headers: requestHeaders }, upstreamRequest });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    ...upstreamRequest,
    headers: {
      authorization: "Bearer provider-token",
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "synthetic-beta",
      "user-agent": "synthetic-cli",
      "x-claude-code-session-id": "synthetic-session",
      "x-custom-provider-header": "custom-value"
    }
  });
  assert.deepEqual(requestHeaders, originalHeaders);
});

test("gateway sanitizer hook preserves explicitly supplied provider cookies and Cloudflare headers", () => {
  const [hook] = createGatewayPlugin().providerHooks;
  const upstreamRequest = {
    body: { model: "provider-model" },
    headers: {
      authorization: "Bearer provider-token",
      "Cookie": "provider-session=value",
      "CF-Access-Client-Id": "provider-access-client",
      "CF-Access-Client-Secret": "provider-access-secret",
      "CF-Access-Jwt-Assertion": "provider-access-jwt",
      "CF-Custom-Header": "provider-custom-value"
    },
    url: "https://provider.example/v1/messages"
  };

  const result = hook.transformRequest({
    request: {
      headers: {
        cookie: "inbound-session=value",
        "cf-access-client-id": "inbound-access-client",
        "cf-access-client-secret": "inbound-access-secret",
        "cf-access-jwt-assertion": "inbound-access-jwt",
        "cf-custom-header": "inbound-custom-value"
      }
    },
    upstreamRequest
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.headers, {
    authorization: "Bearer provider-token",
    cookie: "provider-session=value",
    "cf-access-client-id": "provider-access-client",
    "cf-access-client-secret": "provider-access-secret",
    "cf-access-jwt-assertion": "provider-access-jwt",
    "cf-custom-header": "provider-custom-value"
  });
  assert.equal(upstreamRequest.headers.Cookie, "provider-session=value");
});

test("upstream sanitizer rewrites Anthropic requests to the selected provider base URL", () => {
  const hook = createGatewayPlugin().providerHooks[0];

  const result = hook.transformRequest({
    config: {
      anthropicBaseUrl: "https://api.anthropic.com"
    },
    request: {
      headers: {
        "x-request-id": "request-1"
      }
    },
    targetProviderConfig: {
      baseurl: "http://127.0.0.1:4000",
      name: "depu-messages::anthropic_messages",
      type: "anthropic_messages"
    },
    upstreamRequest: {
      body: { model: "GLM-5.2-NVFP4-Claude" },
      headers: {
        "content-type": "application/json"
      },
      url: "https://api.anthropic.com/v1/messages"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.url, "http://127.0.0.1:4000/v1/messages");
  assert.deepEqual(result.value.headers, {
    "content-type": "application/json",
    "x-request-id": "request-1"
  });
});

test("Anthropic provider URL rewrite preserves target base path variants", () => {
  assert.equal(
    rewriteUpstreamProviderUrl(
      "https://api.anthropic.com/v1/messages",
      { baseurl: "http://127.0.0.1:4000/anthropic", type: "anthropic_messages" },
      { anthropicBaseUrl: "https://api.anthropic.com" }
    ),
    "http://127.0.0.1:4000/anthropic/v1/messages"
  );

  assert.equal(
    rewriteUpstreamProviderUrl(
      "https://gateway.example/anthropic/v1/messages",
      { baseurl: "http://127.0.0.1:4000/vendor/anthropic", type: "anthropic_messages" },
      { anthropicBaseUrl: "https://gateway.example/anthropic" }
    ),
    "http://127.0.0.1:4000/vendor/anthropic/v1/messages"
  );
});

test("provider URL rewrite ignores unrelated providers and upstream hosts", () => {
  assert.equal(
    rewriteUpstreamProviderUrl(
      "https://api.openai.com/v1/responses",
      { baseurl: "http://127.0.0.1:4000/v1", type: "openai_responses" },
      { anthropicBaseUrl: "https://api.anthropic.com" }
    ),
    "https://api.openai.com/v1/responses"
  );

  assert.equal(
    rewriteUpstreamProviderUrl(
      "https://other.example/v1/messages",
      { baseurl: "http://127.0.0.1:4000", type: "anthropic_messages" },
      { anthropicBaseUrl: "https://api.anthropic.com" }
    ),
    "https://other.example/v1/messages"
  );
});

test("gateway sanitizer hook does not forward reverse proxy metadata to providers", async () => {
  const [hook] = createGatewayPlugin().providerHooks;
  const upstreamRequest = {
    body: { model: "provider-model" },
    headers: {
      "content-type": "application/json"
    },
    method: "POST",
    url: "https://provider.example/v1/messages"
  };

  const result = await hook.transformRequest({
    request: {
      headers: {
        forwarded: "for=192.0.2.10;proto=http;host=ccr.example",
        via: "1.1 ccr",
        "x-forwarded-client-cert": "proxy-certificate",
        "x-forwarded-for": "192.0.2.10",
        "x-forwarded-host": "ccr.example",
        "x-forwarded-port": "80",
        "x-forwarded-proto": "http",
        "x-real-ip": "192.0.2.10",
        "x-custom-provider-header": "custom-value"
      }
    },
    upstreamRequest
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.headers, {
    "content-type": "application/json",
    "x-custom-provider-header": "custom-value"
  });
});
