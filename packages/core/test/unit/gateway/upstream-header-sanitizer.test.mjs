import assert from "node:assert/strict";
import test from "node:test";
import {
  createGatewayPlugin,
  rewriteUpstreamProviderUrl,
  sanitizeUpstreamProviderHeaders
} from "@ccr/core/gateway/core-runtime/upstream-header-sanitizer.ts";

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
        "x-custom-provider-header": "custom-value",
        "x-custom-list": ["one", "two"],
        "x-hop-only": "remove-me",
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
    cookie: "client-cookie=value",
    "http-referer": "https://cherry-ai.com",
    "user-agent": "Codex Desktop",
    "x-auth-provider-extension": "provider-extension",
    "x-custom-provider-header": "custom-value",
    "x-custom-list": "one,two",
    "x-title": "Claude Code Router"
  });
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
