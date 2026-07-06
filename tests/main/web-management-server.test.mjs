import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExternalHttpTarget } from "../../packages/core/src/web/management-server.ts";

test("normalizeExternalHttpTarget only accepts absolute http and https URLs", () => {
  assert.equal(normalizeExternalHttpTarget(""), undefined);
  assert.equal(normalizeExternalHttpTarget(undefined), undefined);
  assert.equal(normalizeExternalHttpTarget("about:blank"), undefined);
  assert.equal(normalizeExternalHttpTarget(" https://example.com/path?q=1 "), "https://example.com/path?q=1");
  assert.equal(normalizeExternalHttpTarget("http://localhost:3458/"), "http://localhost:3458/");
  assert.throws(() => normalizeExternalHttpTarget("file:///etc/passwd"), /Only http and https/);
  assert.throws(() => normalizeExternalHttpTarget("javascript:alert(1)"), /Only http and https/);
  assert.throws(() => normalizeExternalHttpTarget("example.com"), /valid absolute URL/);
});
