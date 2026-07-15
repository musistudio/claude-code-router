import assert from "node:assert/strict";
import test from "node:test";
import {
  abortSignalMessage,
  filteredResponseHeaders,
  forwardHeaders,
  inferGatewayClient,
  omitLocalObservabilityHeaders,
  parseJsonObject,
  readAuthToken,
  readHeader,
  readRemoteControlQueryAuthToken,
  shouldCaptureGatewayUsage,
  shouldSendBody,
  stripLocalGatewayAuthHeaders,
  withCoreGatewayAuthHeader
} from "@ccr/core/gateway/http/io.ts";
import {
  parseJsonObjectCached,
  parseJsonObjectSafe,
  releaseJsonObject,
  serializeJsonBody,
  serializeJsonBodyWithModel,
  takeJsonObject
} from "@ccr/core/gateway/http/body.ts";

test("gateway client inference honors explicit, proxy, API-key, and user-agent identity", () => {
  assert.equal(inferGatewayClient(undefined, { "x-ccr-client": "  Desktop App  " }), "Desktop App");
  assert.equal(inferGatewayClient({ id: "key-id", name: "Team key" }, { "user-agent": "codex-cli/1.0" }), "Team key");
  assert.equal(
    inferGatewayClient(
      { id: "key-id", name: "Team key" },
      { "user-agent": "codex-cli/1.0", "x-ccr-proxy-mode": "gateway" }
    ),
    "Codex"
  );
  assert.equal(inferGatewayClient(undefined, { "user-agent": "curl/8.0" }), "curl");
  assert.equal(inferGatewayClient(undefined, { "user-agent": "custom-client/2.1" }), "custom-client");
});

test("gateway authentication accepts supported headers and scopes query tokens to remote control", () => {
  assert.equal(readAuthToken({ authorization: " Bearer secret-token " }), "secret-token");
  assert.equal(readAuthToken({ "x-api-key": " api-key-token " }), "api-key-token");
  assert.equal(readAuthToken({}), undefined);
  assert.equal(readHeader([" first ", "second"]), "first");

  assert.equal(
    readRemoteControlQueryAuthToken({ url: "/__ccr/remote/status?api_key=query-token" }),
    "query-token"
  );
  assert.equal(
    readRemoteControlQueryAuthToken({ url: "/__ccr/remote/session?key=fallback-token" }),
    "fallback-token"
  );
  assert.equal(readRemoteControlQueryAuthToken({ url: "/v1/messages?api_key=must-not-leak" }), undefined);
});

test("gateway header forwarding strips hop-by-hop, local auth, and observability headers", () => {
  const forwarded = forwardHeaders({
    connection: "keep-alive",
    host: "127.0.0.1:3456",
    "x-ccr-core-auth": "internal-secret",
    "x-extra": ["one", "two"],
    "x-keep": "yes"
  });

  assert.deepEqual(forwarded, {
    "x-extra": "one,two",
    "x-keep": "yes"
  });

  const authHeaders = {
    "api-key": "legacy",
    authorization: "Bearer local",
    "x-api-key": "local",
    "x-keep": "yes"
  };
  stripLocalGatewayAuthHeaders(authHeaders);
  assert.deepEqual(authHeaders, { "x-keep": "yes" });

  assert.deepEqual(
    omitLocalObservabilityHeaders({
      "x-ccr-logical-provider": "Provider",
      "x-ccr-provider-credential-chain": "credential",
      "x-keep": "yes"
    }),
    { "x-keep": "yes" }
  );
});

test("core gateway auth and upstream response headers stay on their intended boundary", () => {
  assert.deepEqual(withCoreGatewayAuthHeader({ accept: "application/json" }, "core-token"), {
    accept: "application/json",
    "x-ccr-core-auth": "core-token"
  });
  assert.throws(() => withCoreGatewayAuthHeader({}, ""), /not initialized/);

  const headers = new Headers({
    connection: "close",
    "content-encoding": "gzip",
    "content-type": "application/json",
    "x-request-id": "request-1"
  });
  assert.deepEqual(filteredResponseHeaders(headers), [
    ["content-type", "application/json"],
    ["x-request-id", "request-1"]
  ]);
});

test("gateway JSON helpers accept only objects and preserve the selected model", () => {
  assert.deepEqual(parseJsonObject(Buffer.alloc(0)), {});
  assert.deepEqual(parseJsonObject(Buffer.from('{"model":"old","stream":true}')), {
    model: "old",
    stream: true
  });
  assert.throws(() => parseJsonObject(Buffer.from("[]")), /must be a JSON object/);
  assert.throws(() => parseJsonObject(Buffer.from("null")), /must be a JSON object/);

  assert.equal(parseJsonObjectSafe(undefined), undefined);
  assert.equal(parseJsonObjectSafe(Buffer.from("not-json")), undefined);
  assert.deepEqual(parseJsonObjectSafe(Buffer.from('{"ok":true}')), { ok: true });
  assert.equal(
    serializeJsonBodyWithModel({ model: "old", stream: true }, "Provider/new").toString("utf8"),
    '{"model":"Provider/new","stream":true}\n'
  );
});

test("gateway JSON helpers reuse immutable parses and release mutable ownership", () => {
  const buffer = Buffer.from('{"model":"old","stream":true}');
  const cached = parseJsonObjectCached(buffer);
  assert.equal(parseJsonObjectCached(buffer), cached);
  assert.equal(parseJsonObjectSafe(buffer), cached);

  const owned = takeJsonObject(buffer);
  assert.equal(owned, cached);
  owned.model = "mutated";

  const reparsed = parseJsonObjectCached(buffer);
  assert.notEqual(reparsed, owned);
  assert.equal(reparsed.model, "old");

  const body = { model: "Provider/new", stream: true };
  const serialized = serializeJsonBody(body);
  assert.equal(parseJsonObjectCached(serialized), body);
  releaseJsonObject(serialized);
  assert.notEqual(parseJsonObjectCached(serialized), body);
});

test("gateway method and abort helpers cover body and cancellation edge cases", () => {
  assert.equal(shouldSendBody("GET"), false);
  assert.equal(shouldSendBody("head"), false);
  assert.equal(shouldSendBody("POST"), true);
  assert.equal(shouldSendBody(undefined), true);
  assert.equal(shouldCaptureGatewayUsage("PATCH", "/v1/messages"), true);
  assert.equal(shouldCaptureGatewayUsage("GET", "/v1/messages"), false);

  const errorController = new AbortController();
  errorController.abort(new Error("client disconnected"));
  assert.equal(abortSignalMessage(errorController.signal), "client disconnected");

  const textController = new AbortController();
  textController.abort("  timed out  ");
  assert.equal(abortSignalMessage(textController.signal), "timed out");
});
