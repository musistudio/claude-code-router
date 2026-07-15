import assert from "node:assert/strict";
import test from "node:test";
import { formatUpstreamErrorForLog } from "../../packages/core/src/gateway/http/io.ts";

test("upstream fetch diagnostics expose timeout phase and fallback counts without secrets", () => {
  const cause = Object.assign(
    new Error("Headers timeout at https://api.example.test/v1/responses?api_key=private-value"),
    {
      code: "UND_ERR_HEADERS_TIMEOUT",
      errno: -110,
      name: "HeadersTimeoutError",
      syscall: "read"
    }
  );
  const error = new TypeError(
    "fetch failed for https://api.example.test/v1/responses?api_key=private-value",
    { cause }
  );

  const message = formatUpstreamErrorForLog(error, {
    attempts: 2,
    elapsedMs: 307655,
    fallbackFailures: 1,
    operation: "fetch",
    responseStarted: false,
    retryDelayMs: 500
  });

  assert.match(message, /^Upstream fetch failed: fetch failed/);
  assert.match(message, /https:\/\/api\.example\.test\/v1\/responses\?api_key=\[redacted\]/);
  assert.match(message, /cause=HeadersTimeoutError/);
  assert.match(message, /code=UND_ERR_HEADERS_TIMEOUT/);
  assert.match(message, /errno=-110/);
  assert.match(message, /syscall=read/);
  assert.match(message, /phase=response_headers/);
  assert.match(message, /response_started=false/);
  assert.match(message, /attempts=2/);
  assert.match(message, /fallback_failures=1/);
  assert.match(message, /retry_delay_ms=500/);
  assert.match(message, /elapsed_ms=307655/);
  assert.doesNotMatch(message, /private-value/);
});

test("upstream stream diagnostics redact credentials without hiding the endpoint", () => {
  const error = Object.assign(
    new Error("read ECONNRESET from private.internal:443 using Bearer secret-token-value api_key=another-secret"),
    {
      code: "ECONNRESET",
      name: "SocketError",
      syscall: "read"
    }
  );

  const message = formatUpstreamErrorForLog(error, {
    attempts: 1,
    elapsedMs: 8123,
    fallbackFailures: 0,
    operation: "stream",
    responseStarted: true
  });

  assert.match(message, /^Upstream stream failed:/);
  assert.match(message, /code=ECONNRESET/);
  assert.match(message, /phase=response_body/);
  assert.match(message, /response_started=true/);
  assert.match(message, /from private\.internal:443/);
  assert.match(message, /Bearer \[redacted\]/);
  assert.match(message, /api_key=\[redacted\]/);
  assert.doesNotMatch(message, /secret-token-value|another-secret/);
});

test("upstream diagnostics preserve non-sensitive error details", () => {
  const message = formatUpstreamErrorForLog(
    new Error("failed to parse response from cache at http://10.0.0.5:8080/v1"),
    {
      attempts: 1,
      elapsedMs: 25,
      fallbackFailures: 0,
      operation: "fetch",
      responseStarted: false
    }
  );

  assert.match(message, /failed to parse response from cache/);
  assert.match(message, /http:\/\/10\.0\.0\.5:8080\/v1/);
});
