import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CCR_CLI_COMPANION_RUNTIME_FILE_NAMES,
  syncCcrCliCompanionRuntimes
} from "@ccr/core/profiles/launch-service.ts";

test("CCR CLI launcher copies every bundled companion runtime next to ccr-cli.js", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-cli-runtime-"));
  try {
    const sourceDir = path.join(root, "dist", "main");
    const binDir = path.join(root, "bin");
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    const runtimeSource = path.join(sourceDir, "cli.js");
    writeFileSync(runtimeSource, "cli runtime\n");
    for (const fileName of CCR_CLI_COMPANION_RUNTIME_FILE_NAMES) {
      writeFileSync(path.join(sourceDir, fileName), `runtime:${fileName}\n`);
      writeFileSync(path.join(binDir, fileName), "stale\n");
    }

    const synced = syncCcrCliCompanionRuntimes(runtimeSource, binDir);

    assert.deepEqual(synced.map((file) => path.basename(file)), [...CCR_CLI_COMPANION_RUNTIME_FILE_NAMES]);
    for (const fileName of CCR_CLI_COMPANION_RUNTIME_FILE_NAMES) {
      assert.equal(readFileSync(path.join(binDir, fileName), "utf8"), `runtime:${fileName}\n`);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
