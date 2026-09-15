import assert from "node:assert/strict";
import test from "node:test";
import { parseProvidersForTest } from "@ccr/core/config/config.ts";
import { toCoreGatewayProviders } from "@ccr/core/providers/runtime-topology.ts";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/upstream-header-sanitizer.ts";

test("#1780 provider headers aliases reach the compiled upstream configuration", () => {
  for (const field of ["headers", "extra_headers", "extraHeaders"]) {
    const [provider] = parseProvidersForTest([{ name: "opencode-go", models: ["omen-alpha"], api_base_url: "https://opencode.ai/zen/go/v1", [field]: { "x-opencode-session": "explicit-session" } }]);
    assert.equal(toCoreGatewayProviders(provider)[0].extraHeaders["x-opencode-session"], "explicit-session");
  }
  const [provider] = parseProvidersForTest([{ name: "go", models: ["model"], headers: { "x-opencode-session": "old" }, extraHeaders: { "x-opencode-session": "current" } }]);
  assert.equal(provider.extraHeaders["x-opencode-session"], "current");
});

test("#1754/#1780 official opencode-go requests forward Claude session headers", () => {
  const [hook] = createGatewayPlugin().providerHooks;
  const upstreamRequest = { body: {}, headers: { authorization: "Bearer provider-key" }, url: "https://opencode.ai/zen/go/v1/chat/completions" };
  const codeSession = hook.transformRequest({
    request: {
      id: "request-1",
      headers: {
        "X-Claude-Code-Session-ID": "claude-code-session",
        "x-claude-session-id": "legacy-session"
      }
    },
    upstreamRequest
  }).value;
  assert.equal(codeSession.headers["x-opencode-session"], "claude-code-session");

  const legacySession = hook.transformRequest({
    request: { id: "request-2", headers: { "X-Claude-Session-ID": "legacy-session" } },
    upstreamRequest
  }).value;
  assert.equal(legacySession.headers["x-opencode-session"], "legacy-session");
  assert.equal(upstreamRequest.headers["x-opencode-session"], undefined);

  const blankPrimary = hook.transformRequest({
    request: { id: "request-3", headers: { "x-claude-code-session-id": "  ", "x-claude-session-id": "legacy-from-blank" } },
    upstreamRequest
  }).value;
  assert.equal(blankPrimary.headers["x-opencode-session"], "legacy-from-blank");

  const arrayHeader = hook.transformRequest({
    request: { id: "request-4", headers: { "x-claude-code-session-id": ["", "array-session"] } },
    upstreamRequest
  }).value;
  assert.equal(arrayHeader.headers["x-opencode-session"], "array-session");
});

test("#1780 official opencode-go requests use a stable fallback without overriding configured headers", () => {
  const [hook] = createGatewayPlugin().providerHooks;
  const upstreamRequest = { body: {}, headers: { authorization: "Bearer provider-key" }, url: "https://opencode.ai/zen/go/v1/chat/completions" };

  const first = hook.transformRequest({
    request: { body: { metadata: { user_id: "conversation-1" } }, headers: {}, id: "request-1" },
    upstreamRequest
  }).value;
  assert.equal(first.headers["x-opencode-session"], "conversation-1");
  const second = hook.transformRequest({
    request: { body: { metadata: { user_id: "conversation-1" } }, headers: {}, id: "request-2" },
    upstreamRequest
  }).value;
  assert.equal(second.headers["x-opencode-session"], first.headers["x-opencode-session"]);

  const anonymous = hook.transformRequest({ request: { headers: {}, id: "request-3" }, upstreamRequest }).value;
  assert.ok(anonymous.headers["x-opencode-session"]?.startsWith("ccr-"));
  assert.equal(
    hook.transformRequest({ request: { headers: {}, id: "request-4" }, upstreamRequest }).value.headers["x-opencode-session"],
    anonymous.headers["x-opencode-session"]
  );

  const unsafeMetadata = hook.transformRequest({
    request: { body: { metadata: { user_id: "bad\nvalue" } }, headers: {}, id: "request-5" },
    upstreamRequest
  }).value;
  assert.ok(unsafeMetadata.headers["x-opencode-session"]?.startsWith("ccr-"));

  const unicodeMetadata = hook.transformRequest({
    request: { body: { metadata: { user_id: "会话-1" } }, headers: {}, id: "request-8" },
    upstreamRequest
  }).value;
  assert.ok(unicodeMetadata.headers["x-opencode-session"]?.startsWith("ccr-"));

  const longMetadata = hook.transformRequest({
    request: { body: { metadata: { user_id: "a".repeat(400) } }, headers: {}, id: "request-9" },
    upstreamRequest
  }).value;
  assert.equal(longMetadata.headers["x-opencode-session"], "a".repeat(200));

  const explicit = hook.transformRequest({
    request: { headers: { "x-claude-code-session-id": "claude-session" }, id: "request-6" },
    upstreamRequest: { ...upstreamRequest, headers: { "X-OpenCode-Session": "configured" } }
  }).value;
  assert.equal(explicit.headers["x-opencode-session"], "configured");
  assert.equal(upstreamRequest.headers["x-opencode-session"], undefined);

  const blankConfigured = hook.transformRequest({
    request: { headers: { "x-claude-code-session-id": "claude-session" }, id: "request-7" },
    upstreamRequest: { ...upstreamRequest, headers: { "X-OpenCode-Session": "   " } }
  }).value;
  assert.equal(blankConfigured.headers["x-opencode-session"], "claude-session");
});

test("#1780 explicit client opencode-session outranks other session sources", () => {
  const [hook] = createGatewayPlugin().providerHooks;
  const upstreamRequest = { body: {}, headers: { authorization: "Bearer provider-key" }, url: "https://opencode.ai/zen/go/v1/chat/completions" };

  const explicitOverMetadata = hook.transformRequest({
    request: { body: { metadata: { user_id: "conversation-1" } }, headers: { "x-opencode-session": "client-session" }, id: "request-1" },
    upstreamRequest
  }).value;
  assert.equal(explicitOverMetadata.headers["x-opencode-session"], "client-session");

  const blankProviderKeepsClientSession = hook.transformRequest({
    request: {
      body: { metadata: { user_id: "conversation-1" } },
      headers: { "x-claude-code-session-id": "claude-session", "x-opencode-session": "client-session" },
      id: "request-2"
    },
    upstreamRequest: { ...upstreamRequest, headers: { ...upstreamRequest.headers, "X-OpenCode-Session": "   " } }
  }).value;
  assert.equal(blankProviderKeepsClientSession.headers["x-opencode-session"], "client-session");
});

test("OpenCode Go session injection is scoped to the official Go endpoint", () => {
  const [hook] = createGatewayPlugin().providerHooks;
  const request = { id: "request-1", headers: { "x-claude-code-session-id": "claude-session" } };
  const upstreamRequest = { body: {}, headers: { authorization: "Bearer provider-key" }, url: "https://opencode.ai/zen/go/v1/chat/completions" };
  for (const url of [
    "https://opencode.ai/zen/v1/chat/completions",
    "https://other.test/zen/go/v1/chat/completions",
    "https://opencode.ai/zen/go/v10/chat/completions",
    "https://opencode.ai/zen/go/v1x/chat/completions",
    "https://opencode.ai/zen/gofake/chat/completions",
    "https://opencode.ai/zen/go/chat/completions",
    "https://sub.opencode.ai/zen/go/v1/chat/completions",
    "https://opencode.ai.example.com/zen/go/v1/chat/completions",
    "http://opencode.ai/zen/go/v1/chat/completions",
    "https://opencode.ai:8443/zen/go/v1/chat/completions"
  ]) {
    assert.equal(hook.transformRequest({ request, upstreamRequest: { ...upstreamRequest, url } }).value.headers["x-opencode-session"], undefined);
  }

  for (const url of [
    "https://opencode.ai/zen/go/v1",
    "https://opencode.ai/zen/go/v1/",
    "https://opencode.ai/zen/go/v1/messages",
    "https://opencode.ai/zen/go/v1/responses",
    "https://opencode.ai/zen/go/v1/chat/completions",
    "https://opencode.ai/zen/go/v1/chat/completions?stream=true",
    "https://opencode.ai:443/zen/go/v1/chat/completions"
  ]) {
    assert.equal(hook.transformRequest({ request, upstreamRequest: { ...upstreamRequest, url } }).value.headers["x-opencode-session"], "claude-session");
  }

  const clientSession = hook.transformRequest({
    request: { ...request, headers: { "x-opencode-session": "client-session" } },
    upstreamRequest
  }).value;
  assert.equal(clientSession.headers["x-opencode-session"], "client-session");
});
