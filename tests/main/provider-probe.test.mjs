import assert from "node:assert/strict";
import test from "node:test";
import {
  newApiKeyUsageFallbackMessageForTest,
  newApiKeyUsageMetersForTest,
  newApiUserSelfMetersForTest
} from "../../packages/core/src/providers/account-service.ts";
import { detectedProviderFromHeaders, newApiKeyUsageAccountConfig, newApiUserSelfConnectorConfig } from "../../packages/core/src/providers/new-api.ts";
import { isProviderProtocolEndpointSupportedForProbe } from "../../packages/core/src/providers/probe.ts";

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
