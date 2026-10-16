import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { windowsBatchSetLine } from "@ccr/core/platform/windows-batch.ts";

const specialValue = 'Habilynx/glm-5.3 (self hosted) 100% ^ & | < > "preview"';

test("Windows batch environment assignments use matching unquoted escaping", () => {
  assert.equal(
    windowsBatchSetLine("ANTHROPIC_MODEL", specialValue),
    'set ANTHROPIC_MODEL=Habilynx/glm-5.3 ^(self hosted^) 100%% ^^ ^& ^| ^< ^> ^"preview^"'
  );
  assert.equal(
    windowsBatchSetLine("CCR_CODEX_MODEL", "line one\r\nline two", "  "),
    "  set CCR_CODEX_MODEL=line one line two"
  );
});

test("Windows batch environment assignments preserve special characters in the child environment", { skip: process.platform !== "win32" }, () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-windows-batch-env-"));
  const script = path.join(root, "env-round-trip.cmd");
  try {
    writeFileSync(script, [
      "@echo off",
      windowsBatchSetLine("CCR_TEST_MODEL", specialValue),
      "set CCR_TEST_MODEL",
      ""
    ].join("\r\n"));

    const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", script], {
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), `CCR_TEST_MODEL=${specialValue}`);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
