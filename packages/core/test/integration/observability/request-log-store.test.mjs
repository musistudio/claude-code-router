import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { getHeapStatistics } from "node:v8";
import { createSseErrorDetector, RequestLogStore } from "@ccr/core/observability/request-log-store.ts";
import { requestLogRequestedModel, requestLogResponseModel } from "@ccr/core/observability/request-log-model.ts";
import { resolveStreamRequestLogOutcome } from "@ccr/core/gateway/internal/shared.ts";
import { RequestRouteTraceRecorder } from "@ccr/core/observability/route-trace.ts";
import { createBetterSqliteDatabase } from "@ccr/core/storage/sqlite-native.ts";

const execFileAsync = promisify(execFile);
const isBoundedHeapWorker = process.env.CCR_REQUEST_LOG_BOUNDED_HEAP_WORKER === "1";

test("request log model summaries support routed paths and streamed responses", () => {
  assert.equal(
    requestLogRequestedModel("{}", "/v1beta/models/gemini-2.5-pro:streamGenerateContent"),
    "gemini-2.5-pro"
  );
  assert.equal(
    requestLogResponseModel([
      "event: message_start",
      "data: {\"type\":\"message_start\",\"message\":{\"model\":\"claude-response\"}}",
      "",
      "event: message_stop",
      "data: {\"type\":\"message_stop\"}"
    ].join("\n")),
    "claude-response"
  );
  assert.equal(
    requestLogResponseModel("data: {\"type\":\"response.created\",\"response\":{\"model\":\"gpt-response\"}}\n\n"),
    "gpt-response"
  );
});

test("RequestLogStore backfills model summaries when upgrading an existing database", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-model-migration-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  let store;
  try {
    const legacy = createBetterSqliteDatabase(dbFile);
    try {
      legacy.exec(`
        CREATE TABLE request_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          model TEXT NOT NULL,
          request_body_text TEXT NOT NULL,
          response_body_text TEXT NOT NULL
        );
      `);
      legacy.prepare(`
        INSERT INTO request_logs (
          created_at, method, path, model, request_body_text, response_body_text
        ) VALUES (?, 'POST', '/v1/messages', 'resolved-model', ?, ?)
      `).run(
        new Date().toISOString(),
        JSON.stringify({ model: "request-model" }),
        JSON.stringify({ model: "response-model" })
      );
    } finally {
      legacy.close();
    }

    store = new RequestLogStore(dbFile);
    const page = await store.list({ pageSize: 25 });
    assert.equal(page.items[0].requestedModel, "request-model");
    assert.equal(page.items[0].resolvedModel, "resolved-model");
    assert.equal(page.items[0].responseModel, "response-model");
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore resumes interrupted gateway migrations across bounded batches", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-paged-migration-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  let store;
  try {
    const legacy = createBetterSqliteDatabase(dbFile);
    try {
      legacy.exec(`
        CREATE TABLE request_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          event_id TEXT NOT NULL DEFAULT '',
          status_code INTEGER NOT NULL DEFAULT 0,
          ok INTEGER NOT NULL DEFAULT 0,
          error TEXT NOT NULL DEFAULT '',
          gateway_status_code INTEGER NOT NULL DEFAULT 0,
          gateway_ok INTEGER NOT NULL DEFAULT 0,
          gateway_error TEXT NOT NULL DEFAULT '',
          gateway_final_attempt INTEGER NOT NULL DEFAULT 1,
          response_headers TEXT NOT NULL DEFAULT '{}'
        );
        CREATE TABLE request_log_schema_migrations (
          migration TEXT PRIMARY KEY,
          last_id INTEGER NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
      `);
      const insert = legacy.prepare(`
        INSERT INTO request_logs (created_at, event_id, status_code, ok, error, response_headers)
        VALUES (?, ?, 503, 0, 'legacy failure', ?)
      `);
      const createdAt = new Date().toISOString();
      legacy.transaction(() => {
        for (let index = 0; index < 1_205; index += 1) {
          insert.run(
            createdAt,
            `legacy-event-${index}`,
            JSON.stringify({ "x-ccr-fallback-attempts": String((index % 4) + 1) })
          );
        }
      })();
      legacy.exec(`
        UPDATE request_logs
        SET gateway_final_attempt = ((id - 1) % 4) + 1
        WHERE id <= 500;
        INSERT INTO request_log_schema_migrations (migration, last_id, completed, updated_at)
        VALUES ('gateway-final-attempt-v1', 500, 0, 1);
      `);
    } finally {
      legacy.close();
    }

    store = new RequestLogStore(dbFile);
    await store.list({ pageSize: 1 });

    const migrated = createBetterSqliteDatabase(dbFile);
    try {
      const rows = migrated.prepare(`
        SELECT gateway_final_attempt AS attempt, COUNT(*) AS total
        FROM request_logs
        GROUP BY gateway_final_attempt
        ORDER BY gateway_final_attempt
      `).all();
      assert.deepEqual(rows.map((row) => [row.attempt, row.total]), [
        [1, 302],
        [2, 301],
        [3, 301],
        [4, 301]
      ]);
      const outcome = migrated.prepare(`
        SELECT COUNT(*) AS total
        FROM request_logs
        WHERE gateway_status_code = 503
          AND gateway_ok = 0
          AND gateway_error = 'legacy failure'
      `).get();
      assert.equal(outcome.total, 1_205);
      const migrations = migrated.prepare(`
        SELECT migration, completed
        FROM request_log_schema_migrations
        ORDER BY migration
      `).all();
      assert.deepEqual(migrations, [
        { completed: 1, migration: "gateway-final-attempt-v1" },
        { completed: 1, migration: "gateway-outcome-v1" }
      ]);
      const indexes = migrated.prepare("PRAGMA index_list(request_logs)").all();
      assert.equal(indexes.some((index) => index.name === "request_logs_request_id_idx"), true);
    } finally {
      migrated.close();
    }
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

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
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
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
    assert.equal(page.items[0].requestedModel, "request-model");
    assert.equal(page.items[0].resolvedModel, "request-model");
    assert.equal(page.items[0].responseModel, "response-model");
    assert.equal(page.items[0].requestBody.text, "");
    assert.equal(page.items[0].responseBody?.text, "");
    assert.equal(page.items[0].requestBody.sizeBytes, Buffer.byteLength(body));
    assert.equal(page.items[0].responseBody?.sizeBytes, Buffer.byteLength(response));

    const detail = await store.getDetail({ id: page.items[0].id });
    assert.ok(detail);
    assert.equal(detail.requestedModel, "request-model");
    assert.equal(detail.resolvedModel, "request-model");
    assert.equal(detail.responseModel, "response-model");
    assert.match(detail.requestBody.text, /request-model/);
    assert.match(detail.responseBody?.text ?? "", /response-model/);
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore keeps large request bodies in sidecar storage and reads them by chunk", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-sidecar-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const body = JSON.stringify({
      messages: [{ content: "hello", role: "user" }],
      model: "request-model",
      padding: "中🙂".repeat(40 * 1024),
      tail: "request-tail"
    });
    const response = JSON.stringify({
      model: "response-model",
      padding: "y".repeat(220 * 1024),
      tail: "response-tail",
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
      requestId: "request-log-sidecar-test",
      responseBodyText: response,
      responseHeaders: { "content-type": "application/json" },
      startedAt: new Date().toISOString(),
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const page = await store.list({ pageSize: 25 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].requestBody.text, "");
    assert.equal(page.items[0].requestBody.preview, true);
    assert.ok(page.items[0].requestBody.bodyRef);

    const detail = await store.getDetail({ id: page.items[0].id });
    assert.ok(detail);
    assert.equal(detail.requestBody.preview, true);
    assert.equal(detail.requestBody.truncated, false);
    assert.match(detail.requestBody.text, /bytes omitted from preview/);
    assert.match(detail.requestBody.text, /request-tail/);
    assert.equal(detail.responseBody?.preview, true);
    assert.equal(detail.responseBody?.truncated, false);
    assert.match(detail.responseBody?.text ?? "", /response-tail/);

    const requestChunk = await store.getBodyChunk({
      id: detail.id,
      length: 512 * 1024,
      offset: 0,
      side: "request"
    });
    assert.ok(requestChunk);
    assert.equal(requestChunk.eof, true);
    assert.equal(requestChunk.truncated, false);
    assert.equal(requestChunk.text, body);

    let unicodeOffset = 0;
    const unicodeChunks = [];
    while (true) {
      const unicodeChunk = await store.getBodyChunk({
        id: detail.id,
        length: 4097,
        offset: unicodeOffset,
        side: "request"
      });
      assert.ok(unicodeChunk);
      unicodeChunks.push(unicodeChunk.text);
      if (unicodeChunk.eof) break;
      assert.ok(unicodeChunk.nextOffset > unicodeOffset);
      unicodeOffset = unicodeChunk.nextOffset;
    }
    assert.equal(unicodeChunks.join(""), body);

    const responseChunk = await store.getBodyChunk({
      id: detail.id,
      length: 512 * 1024,
      offset: 0,
      side: "response"
    });
    assert.ok(responseChunk);
    assert.equal(responseChunk.eof, true);
    assert.equal(responseChunk.truncated, false);
    assert.equal(responseChunk.text, response);
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore stores decoded Claude App route models for observability", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-claude-app-model-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const sessionId = "claude-app-hex-session";
    const routedModel = "Provider/real-model";
    const encodedModel = `anthropic/claude-ccr-h${Buffer.from(routedModel, "utf8").toString("hex")}`;
    const startedAt = new Date().toISOString();
    const responseBodyText = [
      "event: message_start",
      `data: ${JSON.stringify({
        message: {
          model: encodedModel,
          usage: {
            input_tokens: 3,
            output_tokens: 5,
            total_tokens: 8
          }
        },
        type: "message_start"
      })}`,
      "",
      "event: message_stop",
      "data: {\"type\":\"message_stop\"}",
      ""
    ].join("\n");

    await store.record({
      completedAt: startedAt,
      durationMs: 42,
      fallbackModel: routedModel,
      method: "POST",
      model: routedModel,
      path: "/v1/messages",
      providerName: "Provider",
      providerProtocol: "anthropic_messages",
      requestedModel: encodedModel,
      requestBody: Buffer.from(JSON.stringify({
        messages: [{ content: "hello", role: "user" }],
        model: routedModel
      }), "utf8"),
      requestHeaders: {
        "content-type": "application/json",
        "user-agent": "openai-codex test",
        "x-codex-session-id": sessionId
      },
      requestId: "claude-app-hex-request",
      resolvedModel: routedModel,
      responseBodyText,
      responseHeaders: { "content-type": "text/event-stream" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const page = await store.list({ pageSize: 25 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].provider, "Provider");
    assert.equal(page.items[0].model, "real-model");
    assert.equal(page.items[0].requestedModel, encodedModel);
    assert.equal(page.items[0].resolvedModel, routedModel);
    assert.equal(page.items[0].responseModel, encodedModel);

    const selected = await store.analyze({
      range: "30d",
      sessionAgent: "codex",
      sessionId
    });
    assert.equal(selected.selectedSession?.requests[0]?.model, "real-model");
    assert.deepEqual(selected.selectedSession?.session.models, ["real-model"]);
    assert.equal(
      selected.selectedSession?.trace.runs.find((run) => run.kind === "llm")?.model,
      "real-model"
    );
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore persists actively reported route hops without synthesizing Core diffs", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-route-trace-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
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
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore redacts secrets and records CCR metadata", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-metadata-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
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
        "api-key": "azure-request-secret",
        authorization: "Bearer request-secret",
        cookie: "session=request-secret",
        "content-type": "application/json",
        "ocp-apim-subscription-key": "bing-request-secret",
        "x-amz-security-token": "aws-request-secret",
        "x-auth-token": "custom-request-secret",
        "x-ccr-provider-credential-chain": "cred-a, cred-b",
        "x-ccr-provider-credential-id": "cred-a",
        "x-goog-api-key": "google-request-secret"
      },
      requestId: "request-log-metadata-test",
      responseBodyText: "",
      responseHeaders: {
        "content-type": "text/event-stream",
        "x-api-key": "response-secret",
        "x-company-client-secret": "custom-response-secret",
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
    assert.equal(detail.requestHeaders["api-key"], "[redacted]");
    assert.equal(detail.requestHeaders.authorization, "[redacted]");
    assert.equal(detail.requestHeaders.cookie, "[redacted]");
    assert.equal(detail.requestHeaders["ocp-apim-subscription-key"], "[redacted]");
    assert.equal(detail.requestHeaders["x-amz-security-token"], "[redacted]");
    assert.equal(detail.requestHeaders["x-auth-token"], "[redacted]");
    assert.equal(detail.requestHeaders["x-goog-api-key"], "[redacted]");
    assert.equal(detail.responseHeaders["x-api-key"], "[redacted]");
    assert.equal(detail.responseHeaders["x-company-client-secret"], "[redacted]");
    assert.equal(detail.credentialId, "cred-a");
    assert.deepEqual(detail.credentialChain, ["cred-a", "cred-b"]);
    assert.equal(detail.credentialSaturated, true);
    assert.equal(detail.isStream, true);
    assert.equal(detail.inputTokens, 90);
    assert.equal(detail.cacheReadTokens, 10);
    assert.equal(detail.outputTokens, 20);
    assert.equal(detail.totalTokens, 130);
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore marks interrupted successful-status streams as errors", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-interrupted-stream-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
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
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore keeps an authoritative gateway failure when a later raw trace reports HTTP 200", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-raw-authority-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  const startedAt = new Date().toISOString();
  try {
    await store.record({
      completedAt: startedAt,
      durationMs: 25,
      error: "Client connection closed before response completed.",
      method: "POST",
      path: "/v1/messages",
      providerName: "gateway-provider",
      requestBody: Buffer.from('{"model":"gateway-model","stream":true}'),
      requestHeaders: { "content-type": "application/json" },
      requestId: "gateway-failure-before-raw",
      responseBodyText: "gateway-captured-error-body",
      responseHeaders: { "content-type": "text/event-stream" },
      startedAt,
      statusCode: 499,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    await store.updateFromRawTrace({
      bodyCapturePolicy: "errors",
      isStream: true,
      requestId: "gateway-failure-before-raw",
      responseBodySizeBytes: 128,
      responseBodyText: "",
      responseBodyTruncated: true,
      statusCode: 200
    });

    const page = await store.list({ pageSize: 25 });
    const detail = await store.getDetail({ id: page.items[0].id });
    assert.equal(detail.statusCode, 499);
    assert.equal(detail.ok, false);
    assert.equal(detail.error, "Client connection closed before response completed.");
    assert.equal(detail.responseBody.text, "gateway-captured-error-body");
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore keeps an errorless gateway HTTP 500 authoritative over raw HTTP 200", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-status-authority-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  const startedAt = new Date().toISOString();
  try {
    await store.record({
      completedAt: startedAt,
      durationMs: 25,
      method: "POST",
      path: "/v1/messages",
      providerName: "gateway-provider",
      requestBody: Buffer.from('{"model":"gateway-model"}'),
      requestHeaders: { "content-type": "application/json" },
      requestId: "gateway-status-failure-before-raw",
      responseBodyText: '{"type":"gateway_failure"}',
      responseHeaders: { "content-type": "application/json" },
      startedAt,
      statusCode: 500,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    await store.updateFromRawTrace({
      requestId: "gateway-status-failure-before-raw",
      responseBodyText: '{"type":"upstream_success"}',
      statusCode: 200
    });

    const page = await store.list({ pageSize: 25 });
    const detail = await store.getDetail({ id: page.items[0].id });
    assert.equal(detail.statusCode, 500);
    assert.equal(detail.ok, false);
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore consumes fallback bundles by unique bundle id and only final attempt mutates outcome", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-fallback-bundles-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const store = new RequestLogStore(dbFile);
  const startedAt = new Date().toISOString();
  try {
    for (const requestId of ["fallback-final-success", "fallback-final-failure"]) {
      await store.record({
        completedAt: startedAt,
        durationMs: 25,
        method: "POST",
        path: "/v1/messages",
        providerName: "gateway-provider",
        requestBody: Buffer.from('{"model":"gateway-model"}'),
        requestHeaders: { "content-type": "application/json" },
        requestId,
        responseBodyText: "gateway-body",
        responseHeaders: {
          "content-type": "application/json",
          "x-ccr-fallback-attempts": "2"
        },
        startedAt,
        statusCode: 200,
        url: "http://127.0.0.1:3456/v1/messages"
      });
    }

    await store.writeBatch([
      {
        input: {
          attempt: 2,
          bundleId: "success-final-bundle",
          requestId: "fallback-final-success",
          responseBodyText: "final-success-body",
          statusCode: 200
        },
        kind: "raw-trace-update",
        sequence: 1
      },
      {
        input: {
          attempt: 1,
          bundleId: "success-intermediate-bundle",
          requestId: "fallback-final-success",
          responseBodyText: "intermediate-failure-body",
          statusCode: 500
        },
        kind: "raw-trace-update",
        sequence: 2
      },
      {
        input: {
          attempt: 2,
          bundleId: "failure-final-bundle",
          requestId: "fallback-final-failure",
          responseBodyText: "final-failure-body",
          statusCode: 502
        },
        kind: "raw-trace-update",
        sequence: 3
      },
      {
        input: {
          attempt: 1,
          bundleId: "failure-intermediate-bundle",
          requestId: "fallback-final-failure",
          responseBodyText: "intermediate-success-body",
          statusCode: 200
        },
        kind: "raw-trace-update",
        sequence: 4
      },
      {
        input: {
          attempt: 2,
          bundleId: "success-final-bundle",
          requestId: "fallback-final-success",
          responseBodyText: "duplicate-must-not-apply",
          statusCode: 503
        },
        kind: "raw-trace-update",
        sequence: 5
      }
    ]);

    const page = await store.list({ pageSize: 25 });
    const success = await store.getDetail({
      id: page.items.find((item) => item.requestId === "fallback-final-success").id
    });
    const failure = await store.getDetail({
      id: page.items.find((item) => item.requestId === "fallback-final-failure").id
    });
    assert.equal(success.statusCode, 200);
    assert.equal(success.ok, true);
    assert.equal(success.responseBody.text, "final-success-body");
    assert.equal(failure.statusCode, 502);
    assert.equal(failure.ok, false);
    assert.equal(failure.responseBody.text, "final-failure-body");

    const database = createBetterSqliteDatabase(dbFile);
    try {
      const count = database.prepare("SELECT COUNT(*) AS total FROM request_log_raw_trace_events").get();
      assert.equal(Number(count.total), 4);
    } finally {
      database.close();
    }
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore detects raw errors before applying errors-only body suppression", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-raw-error-policy-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  const startedAt = new Date().toISOString();
  try {
    for (const requestId of ["raw-http-error", "raw-sse-error"]) {
      await store.record({
        completedAt: startedAt,
        durationMs: 25,
        method: "POST",
        path: "/v1/messages",
        providerName: "gateway-provider",
        requestBody: Buffer.from('{"model":"gateway-model"}'),
        requestHeaders: { "content-type": "application/json" },
        requestId,
        responseBodyText: "gateway-success-body",
        responseHeaders: { "content-type": "application/json" },
        startedAt,
        statusCode: 200,
        url: "http://127.0.0.1:3456/v1/messages"
      });
    }

    await store.updateFromRawTrace({
      bodyCapturePolicy: "errors",
      requestId: "raw-http-error",
      responseBodyContentType: "application/json",
      responseBodyText: '{"error":{"message":"upstream failed"}}',
      responseHeaders: { "content-type": "application/json" },
      statusCode: 500
    });
    await store.updateFromRawTrace({
      bodyCapturePolicy: "errors",
      isStream: true,
      requestId: "raw-sse-error",
      responseBodyContentType: "text/event-stream",
      responseBodyText: 'event: error\ndata: {"error":{"message":"late failure"}}\n\n',
      responseHeaders: { "content-type": "text/event-stream" },
      statusCode: 200
    });

    const page = await store.list({ pageSize: 25 });
    const httpEntry = page.items.find((item) => item.requestId === "raw-http-error");
    const sseEntry = page.items.find((item) => item.requestId === "raw-sse-error");
    const httpDetail = await store.getDetail({ id: httpEntry.id });
    const sseDetail = await store.getDetail({ id: sseEntry.id });
    assert.equal(httpDetail.ok, false);
    assert.equal(httpDetail.statusCode, 500);
    assert.match(httpDetail.responseBody.text, /upstream failed/);
    assert.equal(sseDetail.ok, false);
    assert.match(sseDetail.error, /late failure/);
    assert.match(sseDetail.responseBody.text, /late failure/);
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("SSE terminal detection distinguishes completed streams from interrupted streams", () => {
  const completed = createSseErrorDetector("text/event-stream");
  completed.append("event: response.completed\n");
  completed.append('data: {"type":"response.completed","response":{"status":"completed"}}\n\n');
  assert.equal(completed.hasTerminalEvent(), true);
  assert.equal(completed.read(), undefined);

  const done = createSseErrorDetector("text/event-stream");
  done.append("data: [DONE]\n\n");
  assert.equal(done.hasTerminalEvent(), true);

  const anthropic = createSseErrorDetector("text/event-stream");
  anthropic.append('event: message_stop\ndata: {"type":"message_stop"}\n\n');
  assert.equal(anthropic.hasTerminalEvent(), true);

  const failed = createSseErrorDetector("text/event-stream");
  failed.append('event: response.failed\ndata: {"type":"response.failed","response":{"status":"failed","error":{"message":"upstream failed"}}}');
  assert.equal(failed.hasTerminalEvent(), false);
  assert.match(failed.finish() ?? "", /upstream failed/);
  assert.equal(failed.hasTerminalEvent(), true);

  const responseStatusError = createSseErrorDetector("text/event-stream");
  responseStatusError.append('data: {"response":{"status":"error"}}\n\n');
  assert.equal(responseStatusError.hasTerminalEvent(), true);

  const topLevelError = createSseErrorDetector("text/event-stream");
  topLevelError.append('data: {"error":{"type":"server_error","message":"provider unavailable"}}\n\n');
  assert.match(topLevelError.read() ?? "", /provider unavailable/);
  assert.equal(topLevelError.hasTerminalEvent(), true);

  const interrupted = createSseErrorDetector("text/event-stream");
  interrupted.append('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n');
  interrupted.finish();
  assert.equal(interrupted.hasTerminalEvent(), false);
});

test("stream request log outcomes preserve completed client closures and mark real interruptions", () => {
  assert.deepEqual(
    resolveStreamRequestLogOutcome({
      clientDisconnected: true,
      terminalEventSeen: true,
      upstreamStatus: 200
    }),
    {
      error: undefined,
      statusCode: 200
    }
  );

  assert.deepEqual(
    resolveStreamRequestLogOutcome({
      clientDisconnected: true,
      terminalEventSeen: false,
      upstreamStatus: 200
    }),
    {
      error: "Client connection closed before response completed.",
      statusCode: 499
    }
  );

  assert.deepEqual(
    resolveStreamRequestLogOutcome({
      clientDisconnected: false,
      streamError: "fetch failed",
      terminalEventSeen: false,
      upstreamStatus: 502
    }),
    {
      error: "fetch failed",
      statusCode: 502
    }
  );

  assert.deepEqual(
    resolveStreamRequestLogOutcome({
      clientDisconnected: true,
      detectedError: "upstream failed",
      streamError: "The operation was aborted",
      terminalEventSeen: true,
      upstreamStatus: 200
    }),
    {
      error: "upstream failed",
      statusCode: 200
    }
  );
});

test("RequestLogStore applies raw trace updates to existing request logs", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-raw-trace-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
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
      requestHeaders: {
        "api-key": "raw-azure-secret",
        "ocp-apim-subscription-key": "raw-bing-secret",
        "x-ccr-provider-credential-id": "raw-credential-id",
        "x-client-name": "codex-cli",
        "x-goog-api-key": "raw-google-secret"
      },
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
    assert.equal(detail.credentialId, "raw-credential-id");
    assert.equal(detail.ok, false);
    assert.equal(detail.isStream, true);
    assert.match(detail.error, /rate_limit_error: quota exceeded/);
    assert.match(detail.responseBody?.text ?? "", /quota exceeded/);
    assert.equal(detail.requestHeaders["api-key"], "[redacted]");
    assert.equal(detail.requestHeaders["ocp-apim-subscription-key"], "[redacted]");
    assert.equal(detail.requestHeaders["x-ccr-provider-credential-id"], "[redacted]");
    assert.equal(detail.requestHeaders["x-client-name"], "codex-cli");
    assert.equal(detail.requestHeaders["x-goog-api-key"], "[redacted]");
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore analyzes agent sessions and exposes trace payloads", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-agent-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date(Date.now() - 1000).toISOString();
    const completedAt = new Date().toISOString();
    const requestBody = {
      messages: [
        { content: "Current runtime context. This snapshot supersedes earlier runtime-context snapshots.", role: "user" },
        { content: "inspect repo", role: "user" },
        {
          content: JSON.stringify({ ok: true, files: ["README.md"] }),
          role: "tool",
          tool_call_id: "call-read"
        }
      ],
      model: "gpt-test",
      session_id: "session-1",
      system: "Initial System Prompt"
    };
    const responseBody = {
      choices: [
        {
          message: {
            content: "I will inspect README.md.",
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
    assert.equal(selected.selectedSession?.conversation.length, 1);
    assert.equal(selected.selectedSession?.conversation[0]?.user?.content, "inspect repo");
    assert.equal(selected.selectedSession?.conversation[0]?.assistant?.content, "I will inspect README.md.");
    assert.deepEqual(
      selected.selectedSession?.conversation[0]?.messages?.map((message) => message.role),
      ["system", "context", "user", "tool", "assistant"]
    );
    assert.equal(selected.selectedSession?.conversation[0]?.messages?.[0]?.content, "Initial System Prompt");
    assert.equal(selected.selectedSession?.conversation[0]?.messages?.[2]?.content, "inspect repo");
    assert.equal(selected.selectedSession?.trace.runs.some((run) => run.kind === "route"), false);
    assert.equal(selected.selectedSession?.trace.runs.some((run) => run.toolName === "read_file"), true);
    assert.equal(
      selected.selectedSession?.trace.runs.find((run) => run.id === selected.selectedSession?.trace.rootRunId)?.status,
      "success"
    );

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
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore pairs tool results without stable call ids", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-tool-result-fallback-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date(Date.now() - 1000).toISOString();
    const completedAt = new Date().toISOString();
    const requestBody = {
      input: [
        { content: "run diagnostic", role: "user" },
        {
          output: "diagnostic ok\npid=42",
          type: "custom_tool_call_output"
        }
      ],
      model: "gpt-test"
    };
    const responseBody = {
      output: [
        {
          arguments: JSON.stringify({ command: "pwd" }),
          name: "Shell",
          type: "function_call"
        }
      ],
      output_text: "I will run the diagnostic.",
      usage: {
        input_tokens: 9,
        output_tokens: 4,
        total_tokens: 13
      }
    };

    await store.record({
      completedAt,
      durationMs: 90,
      method: "POST",
      path: "/v1/responses",
      providerName: "test-provider",
      providerProtocol: "openai_responses",
      requestBody: Buffer.from(JSON.stringify(requestBody), "utf8"),
      requestHeaders: {
        "content-type": "application/json",
        "user-agent": "openai-codex test",
        "x-codex-session-id": "session-tool-result-fallback"
      },
      requestId: "agent-tool-result-fallback",
      responseBodyText: JSON.stringify(responseBody),
      responseHeaders: { "content-type": "application/json" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/responses"
    });

    const page = await store.list({ pageSize: 25 });
    const detail = await store.getDetail({ id: page.items[0].id });
    assert.ok(detail);

    const selected = await store.analyze({
      range: "30d",
      sessionAgent: "codex",
      sessionId: "session-tool-result-fallback"
    });
    const toolRun = selected.selectedSession?.trace.runs.find((run) => run.kind === "tool" && run.toolName === "Shell");
    assert.ok(toolRun);
    assert.match(toolRun.tool?.result?.preview ?? "", /diagnostic ok/);

    const resultPayload = await store.getTracePayload({
      callId: toolRun.tool?.callId,
      part: "tool-result",
      requestLogId: detail.id
    });
    assert.equal(resultPayload.found, true);
    assert.match(resultPayload.content, /pid=42/);
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore reads sidecar bodies when pairing session tool results", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-tool-result-sidecar-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date(Date.now() - 1000).toISOString();
    const completedAt = new Date().toISOString();
    const requestBody = {
      model: "claude-test",
      prefix: "p".repeat(130 * 1024),
      messages: [
        { content: "run probe", role: "user" },
        {
          content: [{ id: "call-probe", input: { command: "probe" }, name: "Bash", type: "tool_use" }],
          role: "assistant"
        },
        {
          content: [{ content: "sidecar probe result\nok=true", tool_use_id: "call-probe", type: "tool_result" }],
          role: "user"
        }
      ],
      suffix: "s".repeat(130 * 1024)
    };
    const responseBody = {
      content: [
        { text: "I will run the probe.", type: "text" },
        { id: "call-probe", input: { command: "probe" }, name: "Bash", type: "tool_use" }
      ],
      model: "claude-test",
      role: "assistant",
      usage: {
        input_tokens: 12,
        output_tokens: 5,
        total_tokens: 17
      }
    };

    await store.record({
      completedAt,
      durationMs: 120,
      method: "POST",
      path: "/v1/messages",
      providerName: "test-provider",
      providerProtocol: "anthropic_messages",
      requestBody: Buffer.from(JSON.stringify(requestBody), "utf8"),
      requestHeaders: {
        "content-type": "application/json",
        "user-agent": "claude-code test",
        "x-claude-session-id": "session-tool-result-sidecar"
      },
      requestId: "agent-tool-result-sidecar",
      responseBodyText: JSON.stringify(responseBody),
      responseHeaders: { "content-type": "application/json" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const page = await store.list({ pageSize: 25 });
    assert.equal(page.items[0].requestBody.preview, true);
    assert.doesNotMatch(page.items[0].requestBody.text, /sidecar probe result/);

    const detail = await store.getDetail({ id: page.items[0].id });
    assert.ok(detail);

    const selected = await store.analyze({
      range: "30d",
      sessionAgent: "claude-code",
      sessionId: "session-tool-result-sidecar"
    });
    const toolRun = selected.selectedSession?.trace.runs.find((run) => run.kind === "tool" && run.toolName === "Bash");
    assert.ok(toolRun);
    assert.match(toolRun.tool?.result?.preview ?? "", /sidecar probe result/);

    const resultPayload = await store.getTracePayload({
      callId: "call-probe",
      part: "tool-result",
      requestLogId: detail.id
    });
    assert.equal(resultPayload.found, true);
    assert.match(resultPayload.content, /ok=true/);
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore extracts assistant text from nested responses completion payloads", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-agent-response-text-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date(Date.now() - 1000).toISOString();
    const completedAt = new Date().toISOString();
    await store.record({
      completedAt,
      durationMs: 120,
      method: "POST",
      path: "/v1/responses",
      providerName: "test-provider",
      providerProtocol: "openai_responses",
      requestBody: Buffer.from(JSON.stringify({
        input: [{ content: [{ text: "write status", type: "input_text" }], role: "user" }],
        model: "gpt-test",
        session_id: "session-response-text"
      }), "utf8"),
      requestHeaders: {
        "content-type": "application/json",
        "user-agent": "openai-codex test",
        "x-codex-session-id": "session-response-text"
      },
      requestId: "agent-response-text-1",
      responseBodyText: [
        "event: response.completed",
        'data: {"type":"response.completed","response":{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Nested final answer."}]}],"usage":{"input_tokens":4,"output_tokens":3,"total_tokens":7}}}',
        ""
      ].join("\n"),
      responseHeaders: { "content-type": "text/event-stream" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/responses"
    });

    const selected = await store.analyze({
      range: "30d",
      sessionAgent: "codex",
      sessionId: "session-response-text"
    });
    assert.equal(selected.selectedSession?.conversation[0]?.user?.content, "write status");
    assert.equal(selected.selectedSession?.conversation[0]?.assistant?.content, "Nested final answer.");
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore ignores subagent markers in tool definitions and placeholder text", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-subagent-detection-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const baseTime = Date.now() - 5000;

    async function recordClaudeRequest({ body, offsetMs, sessionId }) {
      const startedAtMs = baseTime + offsetMs;
      await store.record({
        completedAt: new Date(startedAtMs + 100).toISOString(),
        durationMs: 100,
        method: "POST",
        path: "/v1/messages",
        providerName: "test-provider",
        requestBody: Buffer.from(JSON.stringify({
          ...body,
          model: "claude-test"
        }), "utf8"),
        requestHeaders: {
          "content-type": "application/json",
          "user-agent": "claude-cli test",
          "x-ccr-route-reason": "default",
          "x-ccr-routed-model": "test-provider/claude-test",
          "x-claude-code-session-id": sessionId
        },
        requestId: `${sessionId}-request`,
        responseBodyText: JSON.stringify({ model: "claude-test" }),
        responseHeaders: { "content-type": "application/json" },
        startedAt: new Date(startedAtMs).toISOString(),
        statusCode: 200,
        url: "http://127.0.0.1:3456/v1/messages"
      });
    }

    await recordClaudeRequest({
      body: {
        messages: [{ content: "normal main-agent request", role: "user" }],
        tools: [{
          description: "Use <CCR-SUBAGENT-MODEL>Provider/claude-opus</CCR-SUBAGENT-MODEL> when spawning an agent.",
          input_schema: {
            properties: {
              prompt: {
                description: "Start with <CCR-SUBAGENT-MODEL>Provider/model</CCR-SUBAGENT-MODEL>.",
                type: "string"
              }
            },
            type: "object"
          },
          name: "Agent"
        }]
      },
      offsetMs: 0,
      sessionId: "tool-description-session"
    });
    await recordClaudeRequest({
      body: {
        messages: [{ content: "normal request", role: "user" }],
        system: "Example: <CCR-SUBAGENT-MODEL>Provider/model</CCR-SUBAGENT-MODEL>"
      },
      offsetMs: 1000,
      sessionId: "placeholder-session"
    });
    await recordClaudeRequest({
      body: {
        messages: [{
          content: "<CCR-SUBAGENT-MODEL>Provider/claude-opus</CCR-SUBAGENT-MODEL>\nInspect the repository.",
          role: "user"
        }]
      },
      offsetMs: 2000,
      sessionId: "real-subagent-session"
    });

    const toolDescription = await store.analyze({
      range: "30d",
      sessionAgent: "claude-code",
      sessionId: "tool-description-session"
    });
    assert.equal(toolDescription.selectedSession?.trace.subagentRunCount, 0);
    assert.equal(toolDescription.selectedSession?.subagents.length, 0);

    const placeholder = await store.analyze({
      range: "30d",
      sessionAgent: "claude-code",
      sessionId: "placeholder-session"
    });
    assert.equal(placeholder.selectedSession?.trace.subagentRunCount, 0);
    assert.equal(placeholder.selectedSession?.subagents.length, 0);

    const realSubagent = await store.analyze({
      range: "30d",
      sessionAgent: "claude-code",
      sessionId: "real-subagent-session"
    });
    assert.equal(realSubagent.selectedSession?.trace.subagentRunCount, 1);
    assert.equal(realSubagent.selectedSession?.subagents[0]?.model, "Provider/claude-opus");
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore distinguishes partial session failures from failed sessions", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-agent-status-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const baseTime = Date.now() - 5000;

    async function recordAgentRequest({ offsetMs, requestId, sessionId, statusCode }) {
      const startedAtMs = baseTime + offsetMs;
      await store.record({
        completedAt: new Date(startedAtMs + 100).toISOString(),
        durationMs: 100,
        ...(statusCode >= 400 ? { error: "upstream request failed" } : {}),
        method: "POST",
        path: "/v1/chat/completions",
        providerName: "test-provider",
        providerProtocol: "openai_chat_completions",
        requestBody: Buffer.from(JSON.stringify({
          messages: [{ content: "continue task", role: "user" }],
          model: "gpt-test",
          session_id: sessionId
        }), "utf8"),
        requestHeaders: {
          "content-type": "application/json",
          "user-agent": "openai-codex test",
          "x-codex-session-id": sessionId
        },
        requestId,
        responseBodyText: JSON.stringify({ model: "gpt-test" }),
        responseHeaders: { "content-type": "application/json" },
        startedAt: new Date(startedAtMs).toISOString(),
        statusCode,
        url: "http://127.0.0.1:3456/v1/chat/completions"
      });
    }

    await recordAgentRequest({
      offsetMs: 0,
      requestId: "mixed-failed",
      sessionId: "session-mixed",
      statusCode: 502
    });
    await recordAgentRequest({
      offsetMs: 1000,
      requestId: "mixed-recovered",
      sessionId: "session-mixed",
      statusCode: 200
    });
    await recordAgentRequest({
      offsetMs: 2000,
      requestId: "failed-only",
      sessionId: "session-failed",
      statusCode: 502
    });

    const mixed = await store.analyze({
      range: "30d",
      sessionAgent: "codex",
      sessionId: "session-mixed"
    });
    const mixedTrace = mixed.selectedSession?.trace;
    assert.equal(
      mixedTrace?.runs.find((run) => run.id === mixedTrace.rootRunId)?.status,
      "partial"
    );
    assert.equal(mixedTrace?.runs.some((run) => run.kind === "llm" && run.status === "error"), true);
    assert.equal(mixedTrace?.runs.some((run) => run.kind === "llm" && run.status === "success"), true);

    const failed = await store.analyze({
      range: "30d",
      sessionAgent: "codex",
      sessionId: "session-failed"
    });
    const failedTrace = failed.selectedSession?.trace;
    assert.equal(
      failedTrace?.runs.find((run) => run.id === failedTrace.rootRunId)?.status,
      "error"
    );
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore agent analysis cache ratio denominator includes cache tokens when total tokens omit cache", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-cache-ratio-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date(Date.now() - 1000).toISOString();
    const completedAt = new Date().toISOString();

    await store.record({
      completedAt,
      durationMs: 100,
      method: "POST",
      path: "/v1/messages",
      providerName: "zhipu",
      providerProtocol: "anthropic_messages",
      requestBody: Buffer.from(JSON.stringify({
        messages: [{ content: "hello", role: "user" }],
        model: "glm-cache",
        session_id: "cache-session"
      }), "utf8"),
      requestHeaders: {
        "content-type": "application/json",
        "user-agent": "openai-codex test",
        "x-ccr-route-reason": "default",
        "x-codex-session-id": "cache-session"
      },
      requestId: "request-log-cache-ratio",
      responseBodyText: JSON.stringify({
        model: "glm-cache",
        usage: {
          cache_read_tokens: 90,
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15
        }
      }),
      responseHeaders: { "content-type": "application/json" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const analysis = await store.analyze({ range: "30d" });
    assert.equal(analysis.totals.totalTokens, 105);
    assert.equal(analysis.totals.cacheRatio, 0.9);
    assert.equal(analysis.sessions[0]?.cacheRatio, 0.9);
    assert.equal(analysis.agents[0]?.cacheRatio, 0.9);
    assert.equal(analysis.routes[0]?.cacheRatio, 0.9);
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore analyzes large bodies without dropping agent metadata", {
  skip: isBoundedHeapWorker,
  timeout: 30000
}, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-large-analysis-test-"));
  let store;
  try {
    const dbFile = path.join(dir, "request-logs.sqlite");
    store = new RequestLogStore(dbFile);
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
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore streams more body text than the bounded worker heap", {
  skip: !isBoundedHeapWorker,
  timeout: 30000
}, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-bounded-heap-test-"));
  let store;
  try {
    const dbFile = path.join(dir, "request-logs.sqlite");
    store = new RequestLogStore(dbFile);
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
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore reports when analysis is bounded by the maximum row count", {
  skip: isBoundedHeapWorker,
  timeout: 30000
}, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-analysis-limit-test-"));
  let store;
  try {
    const dbFile = path.join(dir, "request-logs.sqlite");
    store = new RequestLogStore(dbFile);
    const requestCount = 5001;
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
    assert.equal(analysis.requestScanLimit, 5000);
    assert.equal(analysis.requestScanTruncated, true);
    assert.equal(analysis.scannedRequestCount, 5000);
    assert.equal(analysis.totals.requestCount, 5000);
    assert.equal(analysis.sessions[0]?.id, "max-row-session");
  } finally {
    await store?.close();
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
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
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
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore does not identify an unknown client as Grok CLI from its model name", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-grok-model-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
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
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore identifies Kimi CLI without inferring it from a Kimi model name", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-kimi-agent-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
    const startedAt = new Date().toISOString();
    for (const [requestId, requestHeaders] of [
      ["kimi-agent-request", { "content-type": "application/json", "user-agent": "kimi-code-cli/0.27.0" }],
      ["kimi-model-request", { "content-type": "application/json", "user-agent": "generic-openai-client/1.0" }]
    ]) {
      await store.record({
        completedAt: startedAt,
        durationMs: 25,
        method: "POST",
        path: "/v1/chat/completions",
        providerName: "test-provider",
        providerProtocol: "openai_chat_completions",
        requestBody: Buffer.from(JSON.stringify({ messages: [], model: "Moonshot/kimi-k3" }), "utf8"),
        requestHeaders,
        requestId,
        responseBodyText: JSON.stringify({ choices: [], model: "Moonshot/kimi-k3" }),
        responseHeaders: { "content-type": "application/json" },
        startedAt,
        statusCode: 200,
        url: "http://127.0.0.1:3456/v1/chat/completions"
      });
    }

    const kimiAnalysis = await store.analyze({ agent: "kimi", range: "30d" });
    assert.equal(kimiAnalysis.scannedRequestCount, 2);
    assert.equal(kimiAnalysis.totals.requestCount, 1);
    assert.equal(kimiAnalysis.agents[0]?.agent, "kimi");
    assert.equal(kimiAnalysis.agents[0]?.label, "Kimi CLI");

    const unknownAnalysis = await store.analyze({ agent: "unknown", range: "30d" });
    assert.equal(unknownAnalysis.scannedRequestCount, 2);
    assert.equal(unknownAnalysis.totals.requestCount, 1);
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore identifies OpenCode from its explicit client header", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-opencode-agent-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
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
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore identifies Kilo CLI from its explicit client header", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-kilo-agent-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
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
        "x-ccr-client": "kilo"
      },
      requestId: "kilo-agent-request",
      responseBodyText: JSON.stringify({ choices: [], model: "Provider/model" }),
      responseHeaders: { "content-type": "application/json" },
      startedAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/chat/completions"
    });

    const analysis = await store.analyze({ agent: "kilo", range: "30d" });
    assert.equal(analysis.scannedRequestCount, 1);
    assert.equal(analysis.agents[0]?.agent, "kilo");
    assert.equal(analysis.agents[0]?.label, "Kilo CLI");
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore does not identify an unknown client as OpenCode from its model name", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-request-log-opencode-model-test-"));
  let store;
  try {
    store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
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
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});
