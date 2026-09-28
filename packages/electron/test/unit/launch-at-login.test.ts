import assert from "node:assert/strict";
import test from "node:test";
import { isLaunchAtLoginSupported } from "@ccr/electron/main/launch-at-login.ts";

test("launch at login is available only on supported desktop platforms", () => {
  assert.equal(isLaunchAtLoginSupported("darwin"), true);
  assert.equal(isLaunchAtLoginSupported("win32"), true);
  assert.equal(isLaunchAtLoginSupported("linux"), false);
});
