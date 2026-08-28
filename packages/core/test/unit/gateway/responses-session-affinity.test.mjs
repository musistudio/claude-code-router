import assert from "node:assert/strict";
import test from "node:test";
import {
  applyResponsesSessionAffinity,
  isCodexResponsesUpstream,
  isOfficialOpenAIResponsesUpstream,
  resolveResponsesSessionKey
} from "@ccr/core/gateway/core-runtime/responses-session-affinity.ts";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/upstream-header-sanitizer.ts";

function responsesInput(overrides = {}) {
  return {
    request: {
      body: {
        messages: [{ content: "hello", role: "user" }],
        metadata: { user_id: "user_abc123_account__session_11112222" },
        model: "claude-sonnet-4-5"
      },
      headers: {
        "x-claude-code-session-id": "session-1111-2222"
      }
    },
    targetProviderConfig: {
      name: "multi-channel::openai_responses",
      type: "openai_responses"
    },
    upstreamRequest: {
      body: {
        input: [],
        instructions: "system prompt",
        max_output_tokens: 32000,
        model: "gpt-5.1-codex",
        stream: true
      },
      bodyEncoding: "json",
      headers: { "content-type": "application/json" },
      method: "POST",
      url: "https://provider.example/v1/responses"
    },
    ...overrides
  };
}

test("openai_responses bodies gain prompt_cache_key from the Claude Code session header", () => {
  const input = responsesInput();

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result.body.prompt_cache_key, "session-1111-2222");
  assert.equal(result.body.model, "gpt-5.1-codex");
  assert.equal(input.upstreamRequest.body.prompt_cache_key, undefined);
});

test("inbound metadata.user_id is carried only onto the public OpenAI Responses API", () => {
  const official = responsesInput();
  official.upstreamRequest.url = "https://api.openai.com/v1/responses";

  const officialResult = applyResponsesSessionAffinity(official);
  assert.deepEqual(officialResult.body.metadata, { user_id: "user_abc123_account__session_11112222" });
  assert.equal(officialResult.body.prompt_cache_key, "session-1111-2222");

  const genericResult = applyResponsesSessionAffinity(responsesInput());
  assert.equal(genericResult.body.metadata, undefined);
  assert.equal(genericResult.body.prompt_cache_key, "session-1111-2222");
});

test("caller-supplied prompt_cache_key is never overwritten", () => {
  const input = responsesInput();
  input.upstreamRequest.body.prompt_cache_key = "caller-key";

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result.body.prompt_cache_key, "caller-key");
});

test("empty prompt_cache_key is treated as missing", () => {
  const input = responsesInput();
  input.upstreamRequest.body.prompt_cache_key = "  ";

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result.body.prompt_cache_key, "session-1111-2222");
});

test("session headers resolve case-insensitively and prefer x-claude-code-session-id", () => {
  const input = responsesInput();
  input.request.headers = {
    "X-Claude-Code-Session-ID": "code-session",
    "x-claude-session-id": "legacy-session"
  };

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result.body.prompt_cache_key, "code-session");
});

test("x-claude-session-id and inbound metadata.user_id are fallback key sources", () => {
  assert.equal(
    resolveResponsesSessionKey({ "x-claude-session-id": "legacy-session" }, "metadata-user"),
    "legacy-session"
  );
  assert.equal(resolveResponsesSessionKey({}, "metadata-user"), "metadata-user");
  assert.equal(resolveResponsesSessionKey(undefined, undefined), undefined);
});

test("codex upstreams receive neither prompt_cache_key nor metadata", () => {
  const input = responsesInput({
    targetProviderConfig: {
      name: "codex-api::openai_responses",
      type: "openai_responses"
    }
  });
  input.upstreamRequest.url = "https://chatgpt.com/backend-api/codex/responses";

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result, input.upstreamRequest);
  assert.equal(result.body.prompt_cache_key, undefined);
  assert.equal(result.body.metadata, undefined);
});

test("non-OpenAI openai_responses upstreams keep prompt_cache_key without Anthropic metadata", () => {
  for (const url of [
    "https://provider.example/v1/responses",
    "https://cli-chat-proxy.grok.com/v1/responses"
  ]) {
    const input = responsesInput();
    input.upstreamRequest.url = url;

    const result = applyResponsesSessionAffinity(input);

    assert.equal(result.body.prompt_cache_key, "session-1111-2222");
    assert.equal(result.body.metadata, undefined);
  }
});

test("isCodexResponsesUpstream matches the outbound url and provider baseurl", () => {
  assert.equal(isCodexResponsesUpstream("https://chatgpt.com/backend-api/codex/responses"), true);
  assert.equal(isCodexResponsesUpstream("https://api.openai.com/v1/responses"), false);
  assert.equal(
    isCodexResponsesUpstream("https://api.openai.com/v1/responses", { baseurl: "https://chatgpt.com/backend-api/codex" }),
    true
  );
  assert.equal(isCodexResponsesUpstream("https://mirror.example/backend-api/codex/responses"), true);
});

test("isOfficialOpenAIResponsesUpstream matches api.openai.com only", () => {
  assert.equal(isOfficialOpenAIResponsesUpstream("https://api.openai.com/v1/responses"), true);
  assert.equal(isOfficialOpenAIResponsesUpstream("https://chatgpt.com/backend-api/codex/responses"), false);
  assert.equal(isOfficialOpenAIResponsesUpstream("https://cli-chat-proxy.grok.com/v1/responses"), false);
  assert.equal(isOfficialOpenAIResponsesUpstream("https://provider.example/v1/responses"), false);
});

test("non-Responses providers and non-JSON bodies pass through untouched", () => {
  const chatInput = responsesInput({
    targetProviderConfig: { type: "openai_chat_completions" }
  });
  assert.equal(applyResponsesSessionAffinity(chatInput), chatInput.upstreamRequest);

  const bytesInput = responsesInput();
  bytesInput.upstreamRequest = {
    ...bytesInput.upstreamRequest,
    body: Buffer.from("{}"),
    bodyEncoding: "bytes"
  };
  assert.equal(applyResponsesSessionAffinity(bytesInput), bytesInput.upstreamRequest);
});

test("requests without any session key source pass through untouched", () => {
  const input = responsesInput({
    request: {
      body: { messages: [] },
      headers: { "content-type": "application/json" }
    }
  });

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result, input.upstreamRequest);
});

test("outbound metadata supplied by the caller is preserved", () => {
  const input = responsesInput();
  input.upstreamRequest.body.metadata = { user_id: "caller-user" };
  input.upstreamRequest.body.prompt_cache_key = "caller-key";

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result, input.upstreamRequest);
});

test("gateway boundary plugin registers the session affinity hook", async () => {
  const hooks = createGatewayPlugin().providerHooks;
  const affinityHook = hooks.find((hook) => hook.key === "ccr-responses-session-affinity");
  assert.ok(affinityHook);

  const input = responsesInput();
  const result = await affinityHook.transformRequest(input);

  assert.equal(result.ok, true);
  assert.equal(result.value.body.prompt_cache_key, "session-1111-2222");
});
