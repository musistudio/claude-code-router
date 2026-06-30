import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { RequestLogStore } from "../../src/main/request-log-store.ts";

test("RequestLogStore keeps list rows lightweight and detail rows complete", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-test-"));
  try {
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const body = JSON.stringify({ messages: [{ content: "hello", role: "user" }], model: "request-model" });
    const response = JSON.stringify({
      model: "response-model",
      usage: {
        input_tokens: 3,
        output_tokens: 4,
        total_tokens: 7
      }
    });

    await store.record({
      completedAt: new Date().toISOString(),
      durationMs: 42,
      method: "POST",
      path: "/v1/messages",
      providerName: "test-provider",
      requestBody: Buffer.from(body, "utf8"),
      requestHeaders: { "content-type": "application/json" },
      requestId: "request-log-test",
      responseBodyText: response,
      responseHeaders: { "content-type": "application/json" },
      startedAt: new Date().toISOString(),
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const page = await store.list({ pageSize: 25 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].requestBody.text, "");
    assert.equal(page.items[0].responseBody?.text, "");
    assert.equal(page.items[0].requestBody.sizeBytes, Buffer.byteLength(body));
    assert.equal(page.items[0].responseBody?.sizeBytes, Buffer.byteLength(response));

    const detail = await store.getDetail({ id: page.items[0].id });
    assert.ok(detail);
    assert.match(detail.requestBody.text, /request-model/);
    assert.match(detail.responseBody?.text ?? "", /response-model/);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore redacts secrets and records CCR metadata", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-metadata-test-"));
  try {
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date().toISOString();

    await store.record({
      completedAt: startedAt,
      durationMs: 75,
      method: "POST",
      path: "/v1/chat/completions",
      providerName: "openai-like",
      providerProtocol: "openai_chat_completions",
      requestBody: Buffer.from(JSON.stringify({ model: "gpt-test", stream: true }), "utf8"),
      requestHeaders: {
        accept: "text/event-stream",
        authorization: "Bearer request-secret",
        cookie: "session=request-secret",
        "content-type": "application/json",
        "x-ccr-provider-credential-chain": "cred-a, cred-b",
        "x-ccr-provider-credential-id": "cred-a"
      },
      requestId: "request-log-metadata-test",
      responseBodyText: "",
      responseHeaders: {
        "content-type": "text/event-stream",
        "x-api-key": "response-secret",
        "x-ccr-provider-credential-saturated": "true",
        "x-gateway-billing-cache-read-tokens": "10",
        "x-gateway-billing-input-tokens": "100",
        "x-gateway-billing-output-tokens": "20",
        "x-gateway-billing-total-tokens": "130"
      },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/chat/completions"
    });

    const page = await store.list({ pageSize: 25 });
    const detail = await store.getDetail({ id: page.items[0].id });

    assert.ok(detail);
    assert.equal(detail.requestHeaders.authorization, "[redacted]");
    assert.equal(detail.requestHeaders.cookie, "[redacted]");
    assert.equal(detail.responseHeaders["x-api-key"], "[redacted]");
    assert.equal(detail.credentialId, "cred-a");
    assert.deepEqual(detail.credentialChain, ["cred-a", "cred-b"]);
    assert.equal(detail.credentialSaturated, true);
    assert.equal(detail.isStream, true);
    assert.equal(detail.inputTokens, 90);
    assert.equal(detail.cacheReadTokens, 10);
    assert.equal(detail.outputTokens, 20);
    assert.equal(detail.totalTokens, 130);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore marks interrupted successful-status streams as errors", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-interrupted-stream-test-"));
  try {
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date().toISOString();
    const error = "Client connection closed before response completed.";

    await store.record({
      completedAt: startedAt,
      durationMs: 301000,
      error,
      method: "POST",
      path: "/v1/messages",
      providerName: "test-provider",
      requestBody: Buffer.from(JSON.stringify({ model: "claude-test", stream: true }), "utf8"),
      requestHeaders: {
        accept: "text/event-stream",
        "content-type": "application/json"
      },
      requestId: "interrupted-stream-request",
      responseBodyText: "data: {\"type\":\"message_delta\"}\n\n",
      responseHeaders: { "content-type": "text/event-stream" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const page = await store.list({ pageSize: 25, status: "error" });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].ok, false);
    assert.equal(page.items[0].statusCode, 200);
    assert.equal(page.items[0].durationMs, 301000);
    assert.equal(page.items[0].isStream, true);
    assert.equal(page.items[0].error, error);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore applies raw trace updates to existing request logs", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-raw-trace-test-"));
  try {
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date().toISOString();
    const errorStream = [
      "event: error",
      'data: {"error":{"type":"rate_limit_error","message":"quota exceeded"}}',
      ""
    ].join("\n");

    await store.record({
      completedAt: startedAt,
      durationMs: 20,
      method: "POST",
      path: "/v1/messages",
      providerName: "before-provider",
      requestBody: Buffer.from(JSON.stringify({ model: "before-model" }), "utf8"),
      requestHeaders: { "content-type": "application/json" },
      requestId: "raw-trace-request",
      responseBodyText: "{}",
      responseHeaders: { "content-type": "application/json" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const applied = await store.updateFromRawTrace({
      isStream: true,
      model: "trace-model",
      provider: "trace-provider",
      requestHeaders: { "x-client-name": "codex-cli" },
      requestId: "raw-trace-request",
      responseBodyContentType: "text/event-stream",
      responseBodyText: errorStream,
      responseHeaders: { "content-type": "text/event-stream" },
      statusCode: 200
    });

    assert.equal(applied, true);
    const page = await store.list({ query: "quota exceeded" });
    assert.equal(page.items.length, 1);
    const detail = await store.getDetail({ id: page.items[0].id });

    assert.ok(detail);
    assert.equal(detail.model, "trace-model");
    assert.equal(detail.provider, "trace-provider");
    assert.equal(detail.ok, false);
    assert.equal(detail.isStream, true);
    assert.match(detail.error, /rate_limit_error: quota exceeded/);
    assert.match(detail.responseBody?.text ?? "", /quota exceeded/);
    assert.equal(detail.requestHeaders["x-client-name"], "codex-cli");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore analyzes agent sessions and exposes trace payloads", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-agent-test-"));
  try {
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date(Date.now() - 1000).toISOString();
    const completedAt = new Date().toISOString();
    const requestBody = {
      messages: [
        { content: "inspect repo", role: "user" },
        {
          content: JSON.stringify({ ok: true, files: ["README.md"] }),
          role: "tool",
          tool_call_id: "call-read"
        }
      ],
      model: "gpt-test",
      session_id: "session-1"
    };
    const responseBody = {
      choices: [
        {
          message: {
            role: "assistant",
            tool_calls: [
              {
                function: {
                  arguments: JSON.stringify({ path: "README.md" }),
                  name: "read_file"
                },
                id: "call-read",
                type: "function"
              }
            ]
          }
        }
      ],
      model: "gpt-test",
      usage: {
        completion_tokens: 3,
        prompt_tokens: 7,
        total_tokens: 10
      }
    };

    await store.record({
      completedAt,
      durationMs: 150,
      method: "POST",
      path: "/v1/chat/completions",
      providerName: "test-provider",
      providerProtocol: "openai_chat_completions",
      requestBody: Buffer.from(JSON.stringify(requestBody), "utf8"),
      requestHeaders: {
        "content-type": "application/json",
        "user-agent": "openai-codex test",
        "x-ccr-route-reason": "default",
        "x-codex-session-id": "session-1"
      },
      requestId: "agent-request-1",
      responseBodyText: JSON.stringify(responseBody),
      responseHeaders: { "content-type": "application/json" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/chat/completions"
    });

    const page = await store.list({ pageSize: 25 });
    const detail = await store.getDetail({ id: page.items[0].id });
    assert.ok(detail);

    const analysis = await store.analyze({ range: "30d" });
    assert.equal(analysis.scannedRequestCount, 1);
    assert.equal(analysis.totals.requestCount, 1);
    assert.equal(analysis.agents[0]?.agent, "codex");
    assert.equal(analysis.sessions[0]?.id, "session-1");
    assert.equal(analysis.tools[0]?.name, "read_file");

    const selected = await store.analyze({
      range: "30d",
      sessionAgent: "codex",
      sessionId: "session-1"
    });
    assert.equal(selected.selectedSession?.trace.toolRunCount, 1);
    assert.equal(selected.selectedSession?.trace.llmRunCount, 1);
    assert.equal(selected.selectedSession?.trace.runs.some((run) => run.toolName === "read_file"), true);

    const inputPayload = await store.getTracePayload({
      callId: "call-read",
      part: "tool-input",
      requestLogId: detail.id
    });
    assert.equal(inputPayload.found, true);
    assert.equal(inputPayload.kind, "json");
    assert.match(inputPayload.content, /README\.md/);

    const resultPayload = await store.getTracePayload({
      callId: "call-read",
      part: "tool-result",
      requestLogId: detail.id
    });
    assert.equal(resultPayload.found, true);
    assert.equal(resultPayload.kind, "json");
    assert.match(resultPayload.content, /files/);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
