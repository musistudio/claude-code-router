import assert from "node:assert/strict";
import test from "node:test";
import type { RequestLogBody } from "@ccr/core/contracts/app";
import { formatLogBodyForWorker } from "@ccr/ui/pages/home/shared/log-body-worker-protocol.ts";
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
