import assert from "node:assert/strict";
import test from "node:test";
import { pickConfigForTest } from "@ccr/core/config/config.ts";

const gateway = (responseModelPolicy) => ({
  gateway: {
    ...(responseModelPolicy === undefined ? {} : { responseModelPolicy })
  }
});

test("keeps a passthrough response model policy", () => {
  const config = pickConfigForTest(gateway("passthrough"));

  assert.equal(config.gateway?.responseModelPolicy, "passthrough");
});

test("keeps an explicit rewrite response model policy", () => {
  const config = pickConfigForTest(gateway("rewrite"));

  assert.equal(config.gateway?.responseModelPolicy, "rewrite");
});

test("drops an unknown response model policy", () => {
  const config = pickConfigForTest(gateway("passthru"));

  assert.equal(config.gateway?.responseModelPolicy, undefined);
});

test("leaves the policy unset so the pipeline default applies", () => {
  const config = pickConfigForTest(gateway(undefined));

  assert.equal(config.gateway?.responseModelPolicy, undefined);
});
