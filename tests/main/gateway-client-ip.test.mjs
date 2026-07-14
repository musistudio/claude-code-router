import assert from "node:assert/strict";
import test from "node:test";
import { resolveClientIp } from "../../packages/core/src/gateway/http/io.ts";

function mockRequest({ remoteAddress, headers = {} } = {}) {
  return { socket: remoteAddress === undefined ? {} : { remoteAddress }, headers };
}

test("resolveClientIp uses the socket peer address as authoritative", () => {
  assert.equal(resolveClientIp(mockRequest({ remoteAddress: "203.0.113.7" })), "203.0.113.7");
  assert.equal(resolveClientIp(mockRequest({ remoteAddress: "2001:db8::1" })), "2001:db8::1");
});

test("resolveClientIp normalizes IPv4-mapped IPv6 to plain IPv4", () => {
  assert.equal(resolveClientIp(mockRequest({ remoteAddress: "::ffff:203.0.113.7" })), "203.0.113.7");
});

test("resolveClientIp ignores forged forwarding headers from a non-loopback remote peer", () => {
  // A remote client claiming to be someone else via XFF must not be trusted.
  const request = mockRequest({
    remoteAddress: "203.0.113.7",
    headers: { "x-forwarded-for": "10.0.0.1, 198.51.100.4" }
  });
  assert.equal(resolveClientIp(request), "203.0.113.7");
});

test("resolveClientIp trusts X-Forwarded-For only when the direct peer is loopback", () => {
  const request = mockRequest({
    remoteAddress: "127.0.0.1",
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" }
  });
  assert.equal(resolveClientIp(request), "203.0.113.9");
});

test("resolveClientIp prefers X-Real-IP over X-Forwarded-For behind a loopback proxy", () => {
  const request = mockRequest({
    remoteAddress: "::1",
    headers: { "x-real-ip": "203.0.113.20", "x-forwarded-for": "198.51.100.4" }
  });
  assert.equal(resolveClientIp(request), "203.0.113.20");
});

test("resolveClientIp normalizes an IPv4-mapped loopback proxy peer and still trusts forwarding", () => {
  const request = mockRequest({
    remoteAddress: "::ffff:127.0.0.1",
    headers: { "x-forwarded-for": "203.0.113.30" }
  });
  assert.equal(resolveClientIp(request), "203.0.113.30");
});

test("resolveClientIp falls back to the peer when forwarding headers are absent or invalid", () => {
  assert.equal(resolveClientIp(mockRequest({ remoteAddress: "127.0.0.1" })), "127.0.0.1");
  assert.equal(
    resolveClientIp(mockRequest({ remoteAddress: "127.0.0.1", headers: { "x-forwarded-for": "not-an-ip" } })),
    "127.0.0.1"
  );
  assert.equal(
    resolveClientIp(mockRequest({ remoteAddress: "127.0.0.1", headers: { "x-forwarded-for": "bad:value" } })),
    "127.0.0.1"
  );
  assert.equal(resolveClientIp(mockRequest({ remoteAddress: "bad:value" })), undefined);
  assert.equal(resolveClientIp(mockRequest({ remoteAddress: undefined })), undefined);
});
