import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { codexAppSpawnableCliLauncher } from "@ccr/core/agents/codex/app-launch.ts";

const middleware = "C:\\Users\\me\\.claude-code-router\\bin\\ccr-codex-cli-stdio-codex.cmd";
const realCodex = "C:\\Program Files\\ChatGPT\\resources\\codex.exe";

test("Windows Codex desktop launcher falls back to the real CLI when the middleware is a batch script", () => {
  assert.equal(codexAppSpawnableCliLauncher(middleware, realCodex, "win32"), realCodex);
  assert.equal(codexAppSpawnableCliLauncher(middleware.replace(/\.cmd$/, ".BAT"), realCodex, "win32"), realCodex);
  assert.equal(codexAppSpawnableCliLauncher(middleware, "  codex  ", "win32"), "codex");
});

test("Windows Codex desktop launcher keeps the middleware when no spawnable real CLI is known", () => {
  assert.equal(codexAppSpawnableCliLauncher(middleware, undefined, "win32"), middleware);
  assert.equal(codexAppSpawnableCliLauncher(middleware, "", "win32"), middleware);
  assert.equal(codexAppSpawnableCliLauncher(middleware, "C:\\npm\\codex.cmd", "win32"), middleware);
});

test("Codex desktop launcher is unchanged for non-batch launchers and on other platforms", () => {
  const shim = "/home/me/.claude-code-router/bin/ccr-codex-cli-stdio-codex";
  assert.equal(codexAppSpawnableCliLauncher(shim, "/opt/codex", "linux"), shim);
  assert.equal(codexAppSpawnableCliLauncher(shim, "/opt/codex", "darwin"), shim);
  assert.equal(codexAppSpawnableCliLauncher(middleware, realCodex, "linux"), middleware);
  assert.equal(codexAppSpawnableCliLauncher("C:\\bin\\launcher.exe", realCodex, "win32"), "C:\\bin\\launcher.exe");
});

test("the launcher chosen on Windows can be spawned without a shell (no spawn EINVAL)", { skip: process.platform !== "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-codex-launcher-"));
  try {
    const cmd = path.join(dir, "ccr-codex-cli-stdio-test.cmd");
    writeFileSync(cmd, "@echo off\r\necho middleware\r\n");
    // The premise of the bug: the Codex desktop app spawns CODEX_CLI_PATH with shell:false.
    const direct = spawnSync(cmd, ["app-server"], { shell: false, encoding: "utf8" });
    assert.equal(direct.error?.code, "EINVAL");

    // process.execPath stands in for the real codex.exe.
    const launcher = codexAppSpawnableCliLauncher(cmd, process.execPath);
    const result = spawnSync(launcher, ["-e", "console.log('codex-ran')"], { shell: false, encoding: "utf8" });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "codex-ran");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
