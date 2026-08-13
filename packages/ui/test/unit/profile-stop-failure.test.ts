import assert from "node:assert/strict";
import test from "node:test";
import { profileStopFailureDetail } from "@ccr/ui/pages/home/shared/profiles.ts";

test("profile stop failure explains the rejected command", () => {
  assert.equal(profileStopFailureDetail({
    code: "process_signal_failed",
    detail: "ERROR: Access is denied.",
    exitCode: 1,
    pid: 4321
  }), "The system rejected the force-quit command. PID: 4321 · Exit code: 1 · System message: ERROR: Access is denied.");
});

test("profile stop failure distinguishes a successful command from a process that stayed alive", () => {
  assert.equal(profileStopFailureDetail({
    code: "process_still_running",
    exitCode: 0,
    pid: 4321
  }), "ZCode is still running after the force-quit command. PID: 4321 · Exit code: 0");
});

test("profile stop failure can localize labels without changing system output", () => {
  const translations: Record<string, string> = {
    "Exit code": "退出码",
    "System message": "系统信息",
    "The system rejected the force-quit command.": "系统未能执行强制退出命令。"
  };
  assert.equal(profileStopFailureDetail({
    code: "process_signal_failed",
    detail: "Access is denied.",
    exitCode: 5,
    pid: 99
  }, (value) => translations[value] ?? value), "系统未能执行强制退出命令。 PID: 99 · 退出码: 5 · 系统信息: Access is denied.");
});
