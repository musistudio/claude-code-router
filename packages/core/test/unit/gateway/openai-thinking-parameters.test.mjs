import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchUpstreamWithFallback,
  prepareGatewayUpstreamAttemptForTest,
  stripUnsupportedOpenAiRequestParameters
} from "@ccr/core/gateway/upstream/executor.ts";

const thinkingBody = () => ({
  messages: [{ content: "hi", role: "user" }],
  model: "ark-endpoint",
  reasoning_split: true,
  thinking: { type: "disabled" }
});

function provider(overrides) {
  return {
    api_base_url: "https://ark.example/api/v3",
    capabilities: [{ baseUrl: "https://ark.example/api/v3", type: "openai_chat_completions" }],
    credentials: [{ apiKey: "provider-key", id: "provider-main" }],
    models: ["ark-endpoint"],
    name: "Ark",
    ...overrides
  };
}

function configFor(providerOverrides, extraProviders = []) {
  return {
    CUSTOM_ROUTER_PATH: "",
    Providers: [provider(providerOverrides), ...extraProviders],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 }, rules: [] },
    virtualModelProfiles: []
  };
}

function attemptBody(input) {
  const attempt = prepareGatewayUpstreamAttemptForTest({
    body: thinkingBody(),
    config: input.config,
    headers: input.headers ?? { "x-target-provider": "Ark" },
    method: "POST",
    path: input.path ?? "/v1/chat/completions",
    routedModel: "ark-endpoint"
  });
  return attempt.body;
}

const toJsonBuffer = (value) => Buffer.from(JSON.stringify(value));
const parseOutput = (buffer) => JSON.parse(buffer.toString("utf8"));

test("drops the parameters when asked to", () => {
  const input = toJsonBuffer(thinkingBody());

  const output = parseOutput(
    stripUnsupportedOpenAiRequestParameters(input, { dropThinkingParameters: true })
  );

  assert.equal("thinking" in output, false);
  assert.equal("reasoning_split" in output, false);
  assert.deepEqual(output.messages, thinkingBody().messages);
});

test("keeps the parameters when not asked to drop them", () => {
  const input = toJsonBuffer(thinkingBody());

  const output = stripUnsupportedOpenAiRequestParameters(input, { dropThinkingParameters: false });

  assert.equal(output, input);
});

test("is a no-op when the body has nothing to strip", () => {
  const input = toJsonBuffer({ messages: [{ content: "hi", role: "user" }] });

  assert.equal(
    stripUnsupportedOpenAiRequestParameters(input, { dropThinkingParameters: true }),
    input
  );
});

test("keeps vendor thinking parameters for a provider that opts in", () => {
  const body = attemptBody({ config: configFor({ forwardThinkingParameters: true }) });

  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.reasoning_split, true);
});

test("strips vendor thinking parameters for a provider that does not opt in", () => {
  const body = attemptBody({ config: configFor({}) });

  assert.equal("thinking" in body, false);
  assert.equal("reasoning_split" in body, false);
});

test("still strips for an Anthropic client even when the provider opts in", () => {
  const body = attemptBody({
    config: configFor({ forwardThinkingParameters: true }),
    path: "/v1/messages"
  });

  assert.equal("thinking" in body, false);
  assert.equal("reasoning_split" in body, false);
});

test("keeps vendor thinking parameters for an OpenAI Responses client that opts in", () => {
  const body = attemptBody({
    config: configFor({ forwardThinkingParameters: true }),
    path: "/v1/responses"
  });

  assert.deepEqual(body.thinking, { type: "disabled" });
});

test("a fallback leg to a provider without the flag still strips", async () => {
  const originalFetch = globalThis.fetch;
  const sentBodies = [];
  try {
    globalThis.fetch = async (_url, init) => {
      sentBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return sentBodies.length === 1
        ? new Response("{}", { status: 503, headers: { "content-type": "application/json" } })
        : new Response('{"id":"ok"}', { status: 200, headers: { "content-type": "application/json" } });
    };

    const config = configFor({ forwardThinkingParameters: true }, [
      provider({ api_base_url: "https://plain.example/v1", capabilities: [{ baseUrl: "https://plain.example/v1", type: "openai_chat_completions" }], models: ["plain-endpoint"], name: "Plain" })
    ]);

    await fetchUpstreamWithFallback({
      body: toJsonBuffer(thinkingBody()),
      config,
      coreAuthToken: "core-token",
      fallback: { mode: "model-chain", models: ["Plain/plain-endpoint"], retryCount: 0 },
      headers: { "x-target-provider": "Ark" },
      method: "POST",
      path: "/v1/chat/completions",
      routedModel: "ark-endpoint",
      upstreamUrl: "http://127.0.0.1:3456/v1/chat/completions"
    });

    assert.equal(sentBodies.length, 2);
    assert.deepEqual(sentBodies[0].thinking, { type: "disabled" });
    assert.equal("thinking" in sentBodies[1], false);
    assert.equal("reasoning_split" in sentBodies[1], false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider config parses the opt-in flag from camel and snake case", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    { baseUrl: "https://ark.example/api/v3", forwardThinkingParameters: true, models: ["a"], name: "Camel" },
    { baseUrl: "https://ark.example/api/v3", forward_thinking_parameters: true, models: ["a"], name: "Snake" },
    { baseUrl: "https://ark.example/api/v3", forwardThinkingParameters: "true", models: ["a"], name: "String" }
  ]);

  assert.equal(providers[0].forwardThinkingParameters, true);
  assert.equal(providers[1].forwardThinkingParameters, true);
  assert.equal(providers[2].forwardThinkingParameters, undefined);
});
