import assert from "node:assert/strict";
import test from "node:test";
import { RequestRouteTraceRecorder } from "@ccr/core/observability/route-trace.ts";
import { isSensitiveRequestLogHeaderName } from "@ccr/core/observability/sensitive-headers.ts";

test("request log header redaction fails closed for custom authentication headers", () => {
  for (const name of [
    "x-auth-token",
    "x-amz-security-token",
    "x-company-client-secret",
    "x-private-key",
    "x-signed-request-signature",
    "x-custom-credential"
  ]) {
    assert.equal(isSensitiveRequestLogHeaderName(name), true, name);
  }
  for (const name of ["content-type", "user-agent", "x-request-id"]) {
    assert.equal(isSensitiveRequestLogHeaderName(name), false, name);
  }
});

test("route trace records actively reported changes and never persists sensitive values", () => {
  const startedAt = Date.now();
  const recorder = new RequestRouteTraceRecorder(startedAt);
  recorder.captureIngress();
  recorder.capture({
    changes: [
      { after: "model-b", before: "model-a", operation: "replace", path: "/body/model", scope: "body" },
      { after: "body-secret-b", before: "body-secret-a", operation: "replace", path: "/body/api_key", scope: "body" },
      { after: "Bearer header-secret-b", before: "Bearer header-secret-a", operation: "replace", path: "/headers/authorization", scope: "headers" },
      { after: "auth-sub-secret-b", before: "auth-sub-secret-a", operation: "replace", path: "/headers/x-auth-sub", scope: "headers" },
      {
        after: "https://upstream.example/v1/messages?access_token=url-secret-b",
        before: "http://127.0.0.1/v1/messages?access_token=url-secret-a",
        operation: "replace",
        path: "/url",
        scope: "url"
      }
    ],
    decision: { policyId: "rule:test", reason: "unit-test", source: "rule" },
    kind: "mutation",
    name: "router.policy",
    phase: "routing",
    target: { model: "model-b", provider: "provider-b" }
  });

  const trace = recorder.finish();
  const serialized = JSON.stringify(trace);
  assert.equal(trace.hopCount, 2);
  assert.equal(trace.version, 2);
  assert.equal(trace.ingressSnapshot, undefined);
  assert.equal(trace.finalSnapshot, undefined);
  assert.equal(trace.hops[1].decision.policyId, "rule:test");
  assert.ok(trace.hops[1].changes.some((change) => change.path === "/body/model"));
  assert.ok(trace.hops[1].changes.some((change) => change.path === "/headers/authorization" && change.redacted));
  assert.match(serialized, /\[redacted\]/);
  assert.ok(trace.hops[1].changes.some((change) => change.path === "/headers/x-auth-sub" && change.redacted));
  assert.doesNotMatch(serialized, /header-secret|auth-sub-secret|body-secret|url-secret/);
});

test("route trace omits body values when request body capture is disabled", () => {
  const recorder = new RequestRouteTraceRecorder(Date.now());
  recorder.captureIngress();
  recorder.capture({
    changes: [
      {
        after: [{ role: "user", content: "after-private-message" }],
        before: [{ role: "user", content: "before-private-message" }],
        operation: "replace",
        path: "/body/messages",
        scope: "body"
      },
      {
        after: "diagnostic-value",
        operation: "add",
        path: "/headers/x-ccr-route-source",
        scope: "headers"
      }
    ],
    name: "router.policy",
    phase: "routing"
  });

  const trace = recorder.finish({ captureBodyValues: false });
  const bodyChange = trace.hops[1].changes[0];
  assert.deepEqual(bodyChange, {
    operation: "replace",
    path: "/body/messages",
    scope: "body"
  });
  assert.equal(trace.hops[1].changes[1].after, "diagnostic-value");
  assert.doesNotMatch(JSON.stringify(trace), /private-message/);
});

test("route trace bounds actively reported values without parsing request bodies", () => {
  const recorder = new RequestRouteTraceRecorder(Date.now());
  const largeBody = Buffer.alloc(512 * 1024, "x");
  recorder.captureIngress();
  for (let index = 0; index < 200; index += 1) {
    recorder.capture({
      changes: [{ after: largeBody, operation: "replace", path: "/body", scope: "body" }],
      name: `hop-${index}`,
      phase: "routing"
    });
  }

  const trace = recorder.finish();
  assert.ok(trace.hopCount <= 64);
  assert.equal(trace.truncated, true);
  assert.deepEqual(trace.hops[1].changes[0].after, { sizeBytes: largeBody.byteLength, type: "buffer" });
  assert.doesNotMatch(JSON.stringify(trace), /xxxxxxxx/);
  assert.ok(Buffer.byteLength(JSON.stringify(trace)) <= 256 * 1024 + 4096);
});
