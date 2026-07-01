import assert from "node:assert/strict";
import test from "node:test";
import { claudeCodeUtcTimezoneEnvOverride, isChinaTimeZone } from "../../src/main/claude-environment.ts";

test("detects China time zones used by Claude Code", () => {
  assert.equal(isChinaTimeZone("Asia/Shanghai"), true);
  assert.equal(isChinaTimeZone("Asia/Urumqi"), true);
  assert.equal(isChinaTimeZone("PRC"), true);
  assert.equal(isChinaTimeZone("UTC"), false);
  assert.equal(isChinaTimeZone("Asia/Singapore"), false);
});

test("overrides Claude Code timezone only for China time zones", () => {
  assert.deepEqual(claudeCodeUtcTimezoneEnvOverride("Asia/Shanghai"), { TZ: "UTC" });
  assert.deepEqual(claudeCodeUtcTimezoneEnvOverride("UTC"), {});
  assert.deepEqual(claudeCodeUtcTimezoneEnvOverride("America/Los_Angeles"), {});
});
