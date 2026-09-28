import assert from "node:assert/strict";
import test from "node:test";
import { providerCapabilityForClientProtocol, toCoreGatewayProviders } from "@ccr/core/providers/runtime-topology.ts";
import { prepareGatewayUpstreamAttemptForTest } from "@ccr/core/gateway/upstream/executor.ts";

test("#1778 Gemini OpenAI endpoint keeps selected protocol through compilation and request routing", () => {
  const baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
  const provider = {
    id: "gemini", name: "GeminiOpenAPI", api_base_url: baseUrl,
    api_key: "test-key", models: ["gemini-2.5-flash"], type: "openai_chat_completions",
    capabilities: [{ baseUrl, source: "detected", type: "openai_chat_completions" }]
  };
  assert.equal(providerCapabilityForClientProtocol(provider, "anthropic_messages").type, "openai_chat_completions");
  assert.deepEqual(toCoreGatewayProviders(provider).map((item) => [item.type, item.baseurl]), [["openai_chat_completions", baseUrl]]);
  const attempt = prepareGatewayUpstreamAttemptForTest({
    body: { model: "GeminiOpenAPI/gemini-2.5-flash", max_tokens: 64, messages: [{ role: "user", content: "hello" }] },
    config: { Providers: [provider], Router: { fallback: { mode: "off", models: [], retryCount: 0 }, rules: [] }, virtualModelProfiles: [] },
    headers: {}, method: "POST", path: "/v1/messages", routedModel: "GeminiOpenAPI/gemini-2.5-flash"
  });
  assert.equal(attempt.headers["x-target-provider"], "gemini::openai_chat_completions");
});

test("#1778 endpoint inference distinguishes Google OpenAI compatibility from native Gemini", () => {
  const provider = { name: "Google", models: ["gemini-2.5-flash"] };
  assert.equal(toCoreGatewayProviders({ ...provider, api_base_url: "https://generativelanguage.googleapis.com/v1beta/openai" })[0].type, "openai_chat_completions");
  assert.equal(toCoreGatewayProviders({ ...provider, api_base_url: "https://generativelanguage.googleapis.com" })[0].type, "gemini_generate_content");
});
