import assert from "node:assert/strict";
import test from "node:test";
import { applyResponsesSessionAffinity, isCodexResponsesUpstream, resolveResponsesSessionKey } from "@ccr/core/gateway/core-runtime/responses-session-affinity.ts";
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

test("inbound metadata.user_id is carried onto the outbound Responses body", () => {
  const result = applyResponsesSessionAffinity(responsesInput());

  assert.deepEqual(result.body.metadata, { user_id: "user_abc123_account__session_11112222" });
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

function codexInput(overrides = {}) {
  const input = responsesInput({
    targetProviderConfig: {
      name: "codex-api::openai_responses",
      type: "openai_responses"
    },
    ...overrides
  });
  input.upstreamRequest.url = "https://chatgpt.com/backend-api/codex/responses";
  return input;
}

test("codex upstreams receive the session_id header and prompt_cache_key but no metadata", () => {
  const input = codexInput();
  input.request.headers = { "x-claude-code-session-id": "S" };

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result.headers.session_id, "S");
  assert.equal(result.headers["content-type"], "application/json");
  assert.equal(result.body.prompt_cache_key, "S");
  assert.equal(result.body.metadata, undefined);
  assert.equal(input.upstreamRequest.headers.session_id, undefined);
  assert.equal(input.upstreamRequest.body.prompt_cache_key, undefined);
});

test("codex upstreams keep an existing session_id header regardless of spelling", () => {
  for (const name of ["session_id", "Session_Id", "Session-Id", "session-id"]) {
    const input = codexInput();
    input.upstreamRequest.headers = { ...input.upstreamRequest.headers, [name]: "existing" };

    const result = applyResponsesSessionAffinity(input);

    assert.equal(result.headers[name], "existing");
    assert.deepEqual(
      Object.keys(result.headers).filter((header) => /^session[-_]id$/i.test(header)),
      [name]
    );
    assert.equal(result.body.prompt_cache_key, "session-1111-2222");
  }
});

test("codex upstreams keep a caller-supplied prompt_cache_key", () => {
  const input = codexInput();
  input.upstreamRequest.body.prompt_cache_key = "caller-key";

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result.body.prompt_cache_key, "caller-key");
  assert.equal(result.headers.session_id, "session-1111-2222");
});

test("codex upstreams pass through untouched without a session source", () => {
  const input = codexInput({
    request: {
      body: { messages: [] },
      headers: { "content-type": "application/json" }
    }
  });

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result, input.upstreamRequest);
});

test("codex upstreams fall back to the session id embedded in metadata.user_id", () => {
  const jsonInput = codexInput();
  jsonInput.request.headers = {};
  jsonInput.request.body.metadata = {
    user_id: JSON.stringify({ account_uuid: "", device_id: "device-1", session_id: "json-session" })
  };
  const jsonResult = applyResponsesSessionAffinity(jsonInput);
  assert.equal(jsonResult.headers.session_id, "json-session");
  assert.equal(jsonResult.body.prompt_cache_key, "json-session");
  assert.equal(jsonResult.body.metadata, undefined);

  const legacyInput = codexInput();
  legacyInput.request.headers = {};
  legacyInput.request.body.metadata = {
    user_id: "user_abc123_account__session_0f8e9a1b-1111-2222-3333-444455556666"
  };
  const legacyResult = applyResponsesSessionAffinity(legacyInput);
  assert.equal(legacyResult.headers.session_id, "0f8e9a1b-1111-2222-3333-444455556666");
  assert.equal(legacyResult.body.prompt_cache_key, "0f8e9a1b-1111-2222-3333-444455556666");
});

test("codex upstreams skip the session_id header when metadata.user_id carries no session id", () => {
  const input = codexInput();
  input.request.headers = {};
  input.request.body.metadata = { user_id: "metadata-user" };

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result, input.upstreamRequest);
});

test("codex upstreams reject session ids that are unsafe as header values", () => {
  const input = codexInput();
  input.request.headers = { "x-claude-code-session-id": "bad\r\nx-injected: 1" };
  input.request.body.metadata = undefined;

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result, input.upstreamRequest);
});

test("codex upstreams receive the session_id header even for non-JSON bodies", () => {
  const input = codexInput();
  input.upstreamRequest = {
    ...input.upstreamRequest,
    body: Buffer.from("{}"),
    bodyEncoding: "bytes"
  };

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result.headers.session_id, "session-1111-2222");
  assert.equal(result.body, input.upstreamRequest.body);
});

test("codex detection via provider baseurl also applies the session_id header", () => {
  const input = codexInput({
    targetProviderConfig: {
      baseurl: "https://chatgpt.com/backend-api/codex",
      type: "openai_responses"
    }
  });
  input.upstreamRequest.url = "https://proxy.example/v1/responses";

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result.headers.session_id, "session-1111-2222");
  assert.equal(result.body.metadata, undefined);
});

test("non-codex openai_responses upstreams do not gain a session_id header", () => {
  const result = applyResponsesSessionAffinity(responsesInput());

  assert.equal(result.headers.session_id, undefined);
});

test("gateway boundary plugin forwards the session_id header to codex upstreams", async () => {
  const hooks = createGatewayPlugin().providerHooks;
  const hookNames = hooks.map(({ key }) => key);
  assert.ok(hookNames.indexOf("ccr-upstream-header-sanitizer") < hookNames.indexOf("ccr-responses-session-affinity"));

  let input = codexInput();
  input.request.headers = { "x-claude-code-session-id": "S" };
  for (const providerHook of hooks) {
    if (!providerHook.transformRequest) continue;
    const result = await providerHook.transformRequest(input);
    assert.equal(result.ok, true);
    input = { ...input, upstreamRequest: result.value };
  }

  assert.equal(input.upstreamRequest.headers.session_id, "S");
  assert.equal(input.upstreamRequest.body.prompt_cache_key, "S");
  assert.equal(input.upstreamRequest.body.metadata, undefined);
});

test("non-codex openai_responses upstreams keep the affinity injection", () => {
  const input = responsesInput();

  const result = applyResponsesSessionAffinity(input);

  assert.equal(result.body.prompt_cache_key, "session-1111-2222");
  assert.deepEqual(result.body.metadata, { user_id: "user_abc123_account__session_11112222" });
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
