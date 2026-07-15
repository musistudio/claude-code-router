import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { getHeapStatistics } from "node:v8";
import { RequestLogStore } from "@ccr/core/observability/request-log-store.ts";
import { RequestRouteTraceRecorder } from "@ccr/core/observability/route-trace.ts";
import { createBetterSqliteDatabase } from "@ccr/core/storage/sqlite-native.ts";

const execFileAsync = promisify(execFile);
const isBoundedHeapWorker = process.env.CCR_REQUEST_LOG_BOUNDED_HEAP_WORKER === "1";

async function recordLargeAgentRequests(store, dbFile, { paddingBytes, requestCount, sessionId }) {
  const padding = "x".repeat(paddingBytes);
  const startedAt = new Date().toISOString();
  const requestBodyText = JSON.stringify({
    messages: [
      { content: "inspect repo", role: "user" },
      {
        content: JSON.stringify({ ok: true, files: ["README.md"] }),
        role: "tool",
        tool_call_id: "call-read"
      }
    ],
    metadata: { padding },
    model: "gpt-test",
    session_id: sessionId
  });
  const responseBodyText = JSON.stringify({
    choices: [{
      message: {
        role: "assistant",
        tool_calls: [{
          function: {
            arguments: JSON.stringify({ path: "README.md" }),
            name: "read_file"
          },
          id: "call-read",
          type: "function"
        }]
      }
    }],
    metadata: { padding },
    model: "gpt-test"
  });
  const requestHeaders = JSON.stringify({
    "content-type": "application/json",
    "user-agent": "openai-codex test",
    "x-codex-session-id": sessionId
  });
  const responseHeaders = JSON.stringify({ "content-type": "application/json" });
  const requestBodySize = Buffer.byteLength(requestBodyText);
  const responseBodySize = Buffer.byteLength(responseBodyText);

  await store.list({ pageSize: 1 });
  const database = createBetterSqliteDatabase(dbFile);
  try {
    const insert = database.prepare(`
      INSERT INTO request_logs (
        created_at,
        completed_at,
        request_id,
        method,
        path,
        url,
        provider,
        model,
        status_code,
        ok,
        duration_ms,
        request_headers,
        response_headers,
        request_body_text,
        request_body_size_bytes,
        response_body_text,
        response_body_size_bytes
      ) VALUES (?, ?, ?, 'POST', '/v1/chat/completions', 'http://127.0.0.1:3456/v1/chat/completions', 'test-provider', 'gpt-test', 200, 1, 50, ?, ?, ?, ?, ?, ?)
    `);
    database.transaction(() => {
      for (let index = 0; index < requestCount; index += 1) {
        insert.run(
          startedAt,
          startedAt,
          `${sessionId}-request-${index}`,
          requestHeaders,
          responseHeaders,
          requestBodyText,
          requestBodySize,
          responseBodyText,
          responseBodySize
        );
      }
    })();
  } finally {
    database.close();
  }

  return requestCount * (requestBodySize + responseBodySize);
}

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

test("RequestLogStore persists actively reported route hops without synthesizing Core diffs", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-route-trace-test-"));
  try {
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const recorder = new RequestRouteTraceRecorder(startedAtMs);
    recorder.captureIngress();
    recorder.capture({
      changes: [{
        after: "routed-model",
        before: "request-model",
        operation: "replace",
        path: "/body/model",
        scope: "body"
      }],
      decision: { policyId: "rule:test", reason: "test-rule", source: "rule" },
      name: "router.policy",
      phase: "routing",
      target: { model: "routed-model", provider: "test-provider" }
    });

    await store.record({
      completedAt: startedAt,
      durationMs: 20,
      method: "POST",
      path: "/v1/messages",
      providerName: "test-provider",
      requestBody: Buffer.from(JSON.stringify({ model: "routed-model", stream: true })),
      requestHeaders: { "content-type": "application/json" },
      requestId: "route-trace-request",
      responseBodyText: "{}",
      responseHeaders: { "content-type": "application/json" },
      routeTrace: recorder.finish(),
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const pageBeforeRawTrace = await store.list({ pageSize: 25 });
    assert.equal(pageBeforeRawTrace.items[0].routeHopCount, 2);
    assert.equal(pageBeforeRawTrace.items[0].routeAttemptCount, 0);
    assert.equal(pageBeforeRawTrace.items[0].routeTrace, undefined);

    const applied = await store.updateFromRawTrace({
      method: "POST",
      model: "wire-model",
      path: "/v1/messages",
      provider: "wire-provider",
      requestBodyContentType: "application/json",
      requestBodyText: JSON.stringify({ model: "wire-model", stream: true }),
      requestHeaders: { "content-type": "application/json", "x-wire-header": "yes" },
      requestId: "route-trace-request",
      statusCode: 200,
      url: "https://upstream.example/v1/messages"
    });
    assert.equal(applied, true);

    const detail = await store.getDetail({ id: pageBeforeRawTrace.items[0].id });
    assert.ok(detail?.routeTrace);
    assert.equal(detail.routeTrace.version, 2);
    assert.equal(detail.routeTrace.hopCount, 2);
    assert.equal(detail.routeTrace.hops.at(-1).name, "router.policy");
    assert.ok(detail.routeTrace.hops.at(-1).changes.some((change) => change.path === "/body/model"));
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

test("RequestLogStore analyzes large bodies without dropping agent metadata", {
  skip: isBoundedHeapWorker,
  timeout: 30000
}, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-large-analysis-test-"));
  try {
    const dbFile = path.join(dir, "request-logs.sqlite");
    const store = new RequestLogStore(dbFile);
    const requestCount = 48;
    await recordLargeAgentRequests(store, dbFile, {
      paddingBytes: 256 * 1024,
      requestCount,
      sessionId: "large-session"
    });

    const analysis = await store.analyze({ range: "30d" });

    assert.equal(analysis.scannedRequestCount, requestCount);
    assert.equal(analysis.totals.requestCount, requestCount);
    assert.equal(analysis.sessions[0]?.id, "large-session");
    assert.equal(analysis.tools[0]?.name, "read_file");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore streams more body text than the bounded worker heap", {
  skip: !isBoundedHeapWorker,
  timeout: 30000
}, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-bounded-heap-test-"));
  try {
    const dbFile = path.join(dir, "request-logs.sqlite");
    const store = new RequestLogStore(dbFile);
    const requestCount = 384;
    const totalBodyBytes = await recordLargeAgentRequests(store, dbFile, {
      paddingBytes: 256 * 1024,
      requestCount,
      sessionId: "bounded-heap-session"
    });

    assert.ok(totalBodyBytes > getHeapStatistics().heap_size_limit);
    const analysis = await store.analyze({ range: "30d" });
    assert.equal(analysis.scannedRequestCount, requestCount);
    assert.equal(analysis.totals.requestCount, requestCount);
    assert.equal(analysis.sessions[0]?.id, "bounded-heap-session");
    assert.equal(analysis.tools[0]?.name, "read_file");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore keeps analysis bounded by the maximum row count", {
  skip: isBoundedHeapWorker,
  timeout: 30000
}, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-analysis-limit-test-"));
  try {
    const dbFile = path.join(dir, "request-logs.sqlite");
    const store = new RequestLogStore(dbFile);
    const requestCount = 5000;
    const startedAt = new Date().toISOString();
    await store.list({ pageSize: 1 });
    const database = createBetterSqliteDatabase(dbFile);
    try {
      const insert = database.prepare(`
        INSERT INTO request_logs (
          created_at,
          completed_at,
          request_id,
          method,
          path,
          provider,
          model,
          status_code,
          ok,
          duration_ms,
          request_headers,
          response_headers,
          request_body_text,
          response_body_text
        ) VALUES (?, ?, ?, 'POST', '/v1/chat/completions', 'test-provider', 'gpt-test', 200, 1, 1, ?, '{}', ?, '{}')
      `);
      const requestHeaders = JSON.stringify({
        "content-type": "application/json",
        "user-agent": "openai-codex test",
        "x-codex-session-id": "max-row-session"
      });
      const requestBodyText = JSON.stringify({ model: "gpt-test" });
      database.transaction(() => {
        for (let index = 0; index < requestCount; index += 1) {
          insert.run(startedAt, startedAt, `max-row-request-${index}`, requestHeaders, requestBodyText);
        }
      })();
    } finally {
      database.close();
    }

    const analysis = await store.analyze({ range: "30d" });
    assert.equal(analysis.scannedRequestCount, requestCount);
    assert.equal(analysis.totals.requestCount, requestCount);
    assert.equal(analysis.sessions[0]?.id, "max-row-session");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore bounded heap regression", {
  skip: isBoundedHeapWorker,
  timeout: 45000
}, async () => {
  const workerEnv = {
    ...process.env,
    CCR_REQUEST_LOG_BOUNDED_HEAP_WORKER: "1",
    ELECTRON_RUN_AS_NODE: "1"
  };
  delete workerEnv.NODE_TEST_CONTEXT;
  const { stderr, stdout } = await execFileAsync(
    process.execPath,
    ["--max-old-space-size=64", "--test", __filename],
    {
      encoding: "utf8",
      env: workerEnv,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    }
  );
  assert.match(`${stdout}\n${stderr}`, /streams more body text than the bounded worker heap/);
});

test("RequestLogStore identifies Grok CLI requests in agent analysis", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-grok-agent-test-"));
  try {
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date().toISOString();
    await store.record({
      completedAt: startedAt,
      durationMs: 25,
      method: "POST",
      path: "/v1/responses",
      providerName: "test-provider",
      providerProtocol: "openai_responses",
      requestBody: Buffer.from(JSON.stringify({ input: "hello", model: "Provider/model" }), "utf8"),
      requestHeaders: {
        "content-type": "application/json",
        "user-agent": "xai-grok-cli/0.2.93"
      },
      requestId: "grok-agent-request",
      responseBodyText: JSON.stringify({ model: "Provider/model", output: [] }),
      responseHeaders: { "content-type": "application/json" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/responses"
    });

    const analysis = await store.analyze({ agent: "grok", range: "30d" });
    assert.equal(analysis.scannedRequestCount, 1);
    assert.equal(analysis.agents[0]?.agent, "grok");
    assert.equal(analysis.agents[0]?.label, "Grok CLI");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore does not identify an unknown client as Grok CLI from its model name", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-grok-model-test-"));
  try {
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date().toISOString();
    await store.record({
      completedAt: startedAt,
      durationMs: 25,
      method: "POST",
      path: "/v1/responses",
      providerName: "test-provider",
      providerProtocol: "openai_responses",
      requestBody: Buffer.from(JSON.stringify({ input: "hello", model: "xAI/grok-4.5" }), "utf8"),
      requestHeaders: {
        "content-type": "application/json",
        "user-agent": "generic-openai-client/1.0"
      },
      requestId: "grok-model-request",
      responseBodyText: JSON.stringify({ model: "xAI/grok-4.5", output: [] }),
      responseHeaders: { "content-type": "application/json" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/responses"
    });

    const analysis = await store.analyze({ agent: "all", range: "30d" });
    assert.equal(analysis.scannedRequestCount, 1);
    assert.equal(analysis.agents[0]?.agent, "unknown");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore identifies OpenCode from its explicit client header", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-opencode-agent-test-"));
  try {
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date().toISOString();
    await store.record({
      completedAt: startedAt,
      durationMs: 25,
      method: "POST",
      path: "/v1/chat/completions",
      providerName: "test-provider",
      providerProtocol: "openai_chat_completions",
      requestBody: Buffer.from(JSON.stringify({ messages: [{ content: "hello", role: "user" }], model: "Provider/model" }), "utf8"),
      requestHeaders: {
        "content-type": "application/json",
        "user-agent": "generic-openai-client/1.0",
        "x-ccr-client": "opencode"
      },
      requestId: "opencode-agent-request",
      responseBodyText: JSON.stringify({ choices: [], model: "Provider/model" }),
      responseHeaders: { "content-type": "application/json" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/chat/completions"
    });

    const analysis = await store.analyze({ agent: "opencode", range: "30d" });
    assert.equal(analysis.scannedRequestCount, 1);
    assert.equal(analysis.agents[0]?.agent, "opencode");
    assert.equal(analysis.agents[0]?.label, "OpenCode");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore does not identify an unknown client as OpenCode from its model name", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-opencode-model-test-"));
  try {
    const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date().toISOString();
    await store.record({
      completedAt: startedAt,
      durationMs: 25,
      method: "POST",
      path: "/v1/chat/completions",
      providerName: "test-provider",
      providerProtocol: "openai_chat_completions",
      requestBody: Buffer.from(JSON.stringify({ messages: [{ content: "hello", role: "user" }], model: "opencode/qwen3-coder" }), "utf8"),
      requestHeaders: {
        "content-type": "application/json",
        "user-agent": "generic-openai-client/1.0"
      },
      requestId: "opencode-model-request",
      responseBodyText: JSON.stringify({ choices: [], model: "opencode/qwen3-coder" }),
      responseHeaders: { "content-type": "application/json" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/chat/completions"
    });

    const analysis = await store.analyze({ agent: "all", range: "30d" });
    assert.equal(analysis.scannedRequestCount, 1);
    assert.equal(analysis.agents[0]?.agent, "unknown");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
