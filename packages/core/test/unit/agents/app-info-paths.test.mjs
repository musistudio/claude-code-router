import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { createAppInfoPathReader } from "@ccr/core/agents/app-info-paths.ts";
import { findInstalledCodexAppExecutable } from "@ccr/core/agents/codex/app-launch.ts";
import { findInstalledOpenCodeAppExecutable } from "@ccr/core/agents/opencode/app-launch.ts";

test("#1776 app info caches found and absent paths, expires, and cannot be mutated by callers", () => {
  let time = 0;
  let calls = 0;
  const read = createAppInfoPathReader(() => {
    calls++;
    return calls === 1 ? {} : { chatgptAppPath: "/new/app" };
  }, () => time);
  assert.deepEqual(read(), {});
  time = 29_999;
  assert.deepEqual(read(), {});
  assert.equal(calls, 1);
  time = 30_000;
  const result = read();
  assert.equal(result.chatgptAppPath, "/new/app");
  result.chatgptAppPath = "changed";
  assert.equal(read().chatgptAppPath, "/new/app");
  assert.equal(calls, 2);
});

test("#1776 failed discovery can be retried", () => {
  let calls = 0;
  const read = createAppInfoPathReader(() => {
    if (++calls === 1) throw new Error("discovery failed");
    return {};
  });
  assert.throws(read, /discovery failed/);
  assert.deepEqual(read(), {});
});

test("#1776 Windows apps in standard locations are found without starting PowerShell or where", (t) => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32" });
  t.after(() => Object.defineProperty(process, "platform", platform));
  t.mock.method(fs, "statSync", (file) => ({
    isDirectory: () => false,
    isFile: () => /\/(ChatGPT|OpenCode)\.exe$/.test(String(file))
  }));
  t.mock.method(fs, "existsSync", () => true);
  const spawn = t.mock.method(childProcess, "spawnSync", () => ({ status: 0, stdout: "" }));
  assert.match(findInstalledCodexAppExecutable().executable, /ChatGPT\.exe$/);
  assert.match(findInstalledOpenCodeAppExecutable().executable, /OpenCode\.exe$/);
  assert.equal(spawn.mock.callCount(), 0);
});
