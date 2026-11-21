import assert from "node:assert/strict";
import test from "node:test";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/upstream-header-sanitizer.ts";

const chatUrl = "https://api.openai.com/v1/chat/completions";
const responsesUrl = "https://api.openai.com/v1/responses";

function transform(upstreamRequest) {
  return createGatewayPlugin().providerHooks.reduce((request, hook) =>
    hook.transformRequest({ upstreamRequest: request }).value, upstreamRequest);
}

function chatRequest(body, url = chatUrl) {
  return { url, headers: {}, body };
}

test("#1972 Chat Completions maps max_tokens to max_completion_tokens for models that reject it", () => {
  for (const model of [
    "o1",
    "o3",
    "o3-mini",
    "o4-mini-2025-04-16",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5.2",
    "gpt-5.1-codex",
    "gpt-5-2025-08-07",
    "openai/gpt-5-mini",
    "ft:gpt-5-mini:org:suffix:abc123",
    "ft:o3-mini:org:suffix:abc123",
    "GPT-5"
  ]) {
    const request = chatRequest({ model, max_tokens: 1024, messages: [{ role: "user", content: "hi" }] });
    const result = transform(request);
    assert.equal(result.body.max_completion_tokens, 1024, model);
    assert.equal("max_tokens" in result.body, false, model);
    assert.equal(result.body.model, model);
    assert.deepEqual(result.body.messages, request.body.messages);
    assert.equal(request.body.max_tokens, 1024, `${model} request must not be mutated`);
    assert.equal("max_completion_tokens" in request.body, false, `${model} request must not be mutated`);
  }
});

test("#1972 Chat Completions keeps max_tokens for models that still accept it", () => {
  for (const model of ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "ft:gpt-4o-mini:org::abc", "gpt-50", "omni-moderation-latest", "o"]) {
    const request = chatRequest({ model, max_tokens: 1024 });
    const result = transform(request);
    assert.deepEqual(result.body, { model, max_tokens: 1024 }, model);
  }
});

test("#1972 Chat Completions keeps an existing max_completion_tokens and drops max_tokens", () => {
  const request = chatRequest({ model: "gpt-5", max_tokens: 1024, max_completion_tokens: 2048 });
  const result = transform(request);
  assert.deepEqual(result.body, { model: "gpt-5", max_completion_tokens: 2048 });
  assert.deepEqual(request.body, { model: "gpt-5", max_tokens: 1024, max_completion_tokens: 2048 });
});

test("#1972 Chat Completions replaces an invalid max_completion_tokens with max_tokens", () => {
  const result = transform(chatRequest({ model: "o3", max_tokens: 512, max_completion_tokens: 0 }));
  assert.deepEqual(result.body, { model: "o3", max_completion_tokens: 512 });
});

test("#1972 Chat Completions remap applies to trailing slash and non-official hosts", () => {
  for (const url of [
    "https://api.openai.com/v1/chat/completions/",
    "https://example.test/v1/chat/completions",
    "https://example.test/openai/deployments/x/chat/completions?api-version=2025-01-01"
  ]) {
    const result = transform(chatRequest({ model: "gpt-5-mini", max_tokens: 64 }, url));
    assert.deepEqual(result.body, { model: "gpt-5-mini", max_completion_tokens: 64 }, url);
  }
});

test("#1972 Chat Completions remap ignores invalid max_tokens values and unrelated fields", () => {
  for (const maxTokens of [0, -1, 1.5, "1024", null, undefined]) {
    const body = { model: "gpt-5", max_output_tokens: 1, temperature: 1, ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }) };
    assert.deepEqual(transform(chatRequest(body)).body, body, String(maxTokens));
  }
});

test("#1972 Chat Completions remap does not change other endpoints", () => {
  for (const url of [
    "https://api.openai.com/v1/messages",
    "https://api.openai.com/v1/chat/completions/extra",
    "https://api.openai.com/v1/completions"
  ]) {
    const body = { model: "gpt-5", max_tokens: 64 };
    assert.deepEqual(transform(chatRequest(body, url)).body, body, url);
  }
});

test("#1972 official OpenAI Responses floors max_output_tokens below 16 without mutation", () => {
  for (const [input, expected] of [[1, 16], [15, 16], [16, 16], [128, 128]]) {
    const request = { url: responsesUrl, headers: {}, body: { model: "gpt-5", max_output_tokens: input, input: "hi" } };
    const result = transform(request);
    assert.equal(result.body.max_output_tokens, expected);
    assert.equal(result.body.input, "hi");
    assert.equal(request.body.max_output_tokens, input);
  }
  const trailingSlash = transform({ url: `${responsesUrl}/`, headers: {}, body: { model: "gpt-4.1", max_output_tokens: 1 } });
  assert.equal(trailingSlash.body.max_output_tokens, 16);
});

test("#1972 official OpenAI Responses leaves absent, zero, negative and non-integer limits alone", () => {
  for (const body of [
    { model: "gpt-5" },
    { model: "gpt-5", max_output_tokens: 0 },
    { model: "gpt-5", max_output_tokens: -1 },
    { model: "gpt-5", max_output_tokens: 1.5 },
    { model: "gpt-5", max_output_tokens: "1" },
    { model: "gpt-5", max_output_tokens: null }
  ]) {
    assert.deepEqual(transform({ url: responsesUrl, headers: {}, body }).body, body);
  }
});

test("#1972 Responses does not map max_tokens or touch other fields", () => {
  const body = { model: "gpt-5", max_tokens: 1, max_completion_tokens: 1, max_output_tokens: 128 };
  assert.deepEqual(transform({ url: responsesUrl, headers: {}, body }).body, body);
});

test("#1972 Responses floor is scoped to official api.openai.com over https", () => {
  const body = { model: "gpt-5", max_output_tokens: 1 };
  for (const url of [
    "https://example.test/v1/responses",
    "https://openrouter.ai/api/v1/responses",
    "https://my-resource.openai.azure.com/openai/v1/responses",
    "https://api.openai.com.evil.test/v1/responses",
    "https://evil.test/api.openai.com/v1/responses",
    "http://api.openai.com/v1/responses",
    "https://api.openai.com:8443/v1/responses",
    "https://api.openai.com/v1/responses/extra",
    "https://api.openai.com/v1/messages"
  ]) {
    assert.deepEqual(transform({ url, headers: {}, body }).body, body, url);
  }
});

test("#1972 compatibility rewrites skip non-JSON bodies and unparsable URLs", () => {
  const chatBody = { model: "gpt-5", max_tokens: 64 };
  const responsesBody = { model: "gpt-5", max_output_tokens: 1 };
  for (const input of [
    { url: chatUrl, headers: {}, bodyEncoding: "text", body: JSON.stringify(chatBody) },
    { url: chatUrl, headers: {}, bodyEncoding: "bytes", body: Buffer.from(JSON.stringify(chatBody)) },
    { url: chatUrl, headers: {}, bodyEncoding: "form", body: chatBody },
    { url: responsesUrl, headers: {}, bodyEncoding: "text", body: JSON.stringify(responsesBody) },
    { url: chatUrl, headers: {}, body: JSON.stringify(chatBody) },
    { url: chatUrl, headers: {}, body: [chatBody] },
    { url: chatUrl, headers: {}, body: null },
    { url: "not a url/chat/completions", headers: {}, body: chatBody }
  ]) {
    assert.deepEqual(transform(input).body, input.body);
  }
  const explicitJson = transform({ url: chatUrl, headers: {}, bodyEncoding: "json", body: chatBody });
  assert.deepEqual(explicitJson.body, { model: "gpt-5", max_completion_tokens: 64 });
});

test("#1972 compatibility rewrites return the original request when nothing changes", () => {
  const hook = createGatewayPlugin().providerHooks[0];
  const request = { url: chatUrl, headers: {}, body: { model: "gpt-4o", max_tokens: 64 } };
  assert.equal(hook.transformRequest({ upstreamRequest: request }).value.body, request.body);
});

test("#1972 compatibility rewrites compose with the Muse Spark floor", () => {
  const request = { url: "https://openrouter.ai/api/v1/chat/completions", headers: {}, body: { model: "meta/muse-spark-1.3-contributor", max_tokens: 1 } };
  assert.equal(transform(request).body.max_tokens, 16);
  const remapped = transform({ url: "https://openrouter.ai/api/v1/chat/completions", headers: {}, body: { model: "openai/gpt-5-mini", max_tokens: 1 } });
  assert.deepEqual(remapped.body, { model: "openai/gpt-5-mini", max_completion_tokens: 1 });
});
