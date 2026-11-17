import assert from "node:assert/strict";
import test from "node:test";
import type { RequestLogBody } from "@ccr/core/contracts/app";
import { formatLogBodyForWorker, prepareLogBodyForWorker, logBodyFullTextLimit, logBodyPreviewTextLimit } from "@ccr/ui/pages/home/shared/log-body-worker-protocol.ts";
import { formatRouteTracePath } from "@ccr/ui/pages/home/shared/network.ts";

test("route trace paths use request and response dotted notation", () => {
  assert.equal(
    formatRouteTracePath({ path: "/body/model", scope: "body" }),
    "request.body.model"
  );
  assert.equal(
    formatRouteTracePath({ path: "/headers/content-type", scope: "headers" }),
    "request.header.content-type"
  );
  assert.equal(
    formatRouteTracePath({ path: "/response/body/output/0/text", scope: "body" }),
    "response.body.output.0.text"
  );
  assert.equal(
    formatRouteTracePath({ path: "/response/headers/x-request-id", scope: "headers" }),
    "response.header.x-request-id"
  );
  assert.equal(
    formatRouteTracePath({ path: "/routing/model", scope: "routing" }),
    "request.routing.model"
  );
  assert.equal(
    formatRouteTracePath({ path: "/url", scope: "url" }),
    "request.url"
  );
});

test("request log preview bodies still format parseable JSON as JSON", () => {
  const body: RequestLogBody = {
    bodyRef: "preview-json-body",
    contentType: "application/json",
    encoding: "utf8",
    preview: true,
    sizeBytes: 512 * 1024,
    text: JSON.stringify({ messages: [{ role: "user", content: "hello" }], model: "test-model" }),
    truncated: false
  };

  const view = formatLogBodyForWorker(body, "preview", 256 * 1024, 160 * 1024);
  assert.equal(view.preview, true);
  assert.deepEqual(view.json, {
    messages: [{ role: "user", content: "hello" }],
    model: "test-model"
  });
  assert.match(view.text, /"model": "test-model"/);
});

test("preview mode truncates an over-large JSON text body instead of parsing it", () => {
  const hugeText = JSON.stringify({
    model: "test-model",
    messages: Array.from({ length: 4000 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message body number ${i} `.repeat(20)
    }))
  });
  // Far beyond previewTextLimit, simulating a real ~308KB request body (issue #1694)
  assert.ok(hugeText.length > 300 * 1024, "fixture should exceed 300KB");

  const body: RequestLogBody = {
    bodyRef: "large-json-body",
    contentType: "application/json",
    encoding: "utf8",
    preview: true,
    sizeBytes: hugeText.length,
    text: hugeText,
    truncated: false
  };

  const view = formatLogBodyForWorker(body, "preview", 256 * 1024, 160 * 1024);
  assert.equal(view.preview, true);
  // Over-length text is truncated instead of fully parsed/pretty-printed, avoiding the worker crash
  assert.equal(view.json, undefined);
  assert.ok(view.text.length < hugeText.length, "should be truncated");
  assert.match(view.text, /characters omitted from preview/);
});


test("#1945 full mode bounds formatting and the worker transport for huge JSON", () => {
  const body: RequestLogBody = { contentType: "application/json", encoding: "utf8", sizeBytes: 0, truncated: false,
    text: JSON.stringify({ messages: Array.from({ length: 120000 }, () => ({ role: "user", content: "large body" })) }) };
  assert.ok(body.text.length > logBodyFullTextLimit);
  const result = formatLogBodyForWorker(body, "full");
  assert.equal(result.json, undefined);
  assert.equal(result.preview, true);
  assert.ok(result.text.length < logBodyPreviewTextLimit + 200);
  for (const mode of ["preview", "full"] as const) {
    const transported = prepareLogBodyForWorker(body, mode)!;
    assert.equal(transported.preview, true);
    assert.ok(transported.text.length < logBodyPreviewTextLimit + 200);
    assert.equal(transported.sizeBytes, body.text.length);
    assert.equal(formatLogBodyForWorker(transported, mode).preview, true);
  }
  assert.ok(!body.preview, "transport preparation must not mutate the stored body");
});
