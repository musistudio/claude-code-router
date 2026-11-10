import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRouteScriptInput,
  serializeRouteScriptInput
} from "@ccr/core/routing/route-script-context.ts";

test("serializeRouteScriptInput keeps small bodies intact", () => {
  const request = {
    body: { messages: [{ role: "user", content: "hi" }], model: "m1" },
    headers: {},
    method: "POST",
    url: "/v1/messages"
  };
  const input = buildRouteScriptInput(request);
  const json = JSON.parse(serializeRouteScriptInput(input));
  assert.deepEqual(json.body, request.body);
});

test("serializeRouteScriptInput replaces oversized bodies with a truncated stub", () => {
  const bigText = "x".repeat(3 * 1024 * 1024);
  const request = {
    body: {
      messages: [{ role: "user", content: bigText }],
      model: "m1"
    },
    headers: {},
    method: "POST",
    url: "/v1/messages"
  };
  const input = buildRouteScriptInput(request);
  const serialized = serializeRouteScriptInput(input);
  const json = JSON.parse(serialized);
  assert.equal(json.body.__ccrBodyTruncated, true);
  assert.equal(json.body.model, "m1");
  assert.equal(json.body.messages, undefined);
  assert.ok(serialized.length < 64 * 1024);
});

test("serializeRouteScriptInput stub keeps the summary fields available", () => {
  const bigText = "y".repeat(3 * 1024 * 1024);
  const request = {
    body: {
      messages: [{ role: "user", content: bigText }],
      model: "m1",
      tools: [{ name: "Read" }]
    },
    headers: {},
    method: "POST",
    url: "/v1/messages"
  };
  const input = buildRouteScriptInput(request);
  const json = JSON.parse(serializeRouteScriptInput(input));
  assert.equal(json.summary.messageCount, 1);
  assert.deepEqual(json.summary.toolNames, ["Read"]);
});
