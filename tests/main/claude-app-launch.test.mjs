import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claudeAppLaunchCommand } from "../../src/main/claude-app-launch.ts";

test("claudeAppLaunchCommand opens macOS app bundles through LaunchServices", (t) => {
  const tempDir = mkdtempForTest();
  t.after(() => rmSync(tempDir, { force: true, recursive: true }));

  const appBundle = path.join(tempDir, "Claude.app");
  const executable = path.join(appBundle, "Contents", "MacOS", "Claude");
  mkdirSync(path.dirname(executable), { recursive: true });
  writeFileSync(executable, "");

  const launch = claudeAppLaunchCommand(
    executable,
    path.join(tempDir, "profile data"),
    49152,
    "http://127.0.0.1:3456",
    {
      "BAD-NAME": "ignored",
      CLAUDE_CONFIG_DIR: path.join(tempDir, "config"),
      CCR_PROFILE_SURFACE: "app"
    }
  );

  if (process.platform !== "darwin") {
    assert.equal(launch.command, executable);
    assert.equal(launch.pidIsLauncher, undefined);
    return;
  }

  assert.equal(launch.command, "/usr/bin/open");
  assert.equal(launch.pidIsLauncher, true);
  assert.deepEqual(launch.args.slice(0, 2), ["-W", "-n"]);
  assert.ok(launch.args.includes("--env"));
  assert.ok(launch.args.includes(`CLAUDE_CONFIG_DIR=${path.join(tempDir, "config")}`));
  assert.ok(launch.args.includes("CCR_PROFILE_SURFACE=app"));
  assert.equal(launch.args.some((arg) => arg.startsWith("BAD-NAME=")), false);

  const appIndex = launch.args.indexOf(appBundle);
  assert.ok(appIndex > 0);
  assert.equal(launch.args[appIndex + 1], "--args");
  assert.ok(launch.args.includes("--remote-debugging-port=49152"));
  assert.ok(launch.args.includes("--remote-debugging-address=127.0.0.1"));
  assert.ok(launch.args.includes("--proxy-server=http://127.0.0.1:3456"));
  assert.ok(launch.args.includes(`--user-data-dir=${path.join(tempDir, "profile data")}`));
});

function mkdtempForTest() {
  return mkdtempSync(path.join(os.tmpdir(), "ccr-claude-app-launch-"));
}
