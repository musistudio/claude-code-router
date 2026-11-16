import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { codexProfileEnvForTest } from "@ccr/core/agents/codex/app-launch.ts";

test("macOS Codex launch uses the CLI packaged with the desktop app for startup checks", { skip: process.platform !== "darwin" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-codex-bundled-cli-"));
  const app = path.join(dir, "ChatGPT.app");
  const executable = path.join(app, "Contents", "MacOS", "ChatGPT");
  const resources = path.join(app, "Contents", "Resources");
  const profile = { agent: "codex", id: "codex", name: "Codex", model: "", providerId: "ccr" };
  const modernShim = path.join(resources, "codex-cli", "bin", "codex");
  const modernBinary = path.join(resources, "codex-cli", "CodexCLI.app", "Contents", "MacOS", "codex");
  const legacyCli = path.join(resources, "codex");
  const writeCli = (file) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "#!/bin/sh\n", { mode: 0o755 });
  };
  const assertCli = (expected, configuredProfile = profile) => {
    const env = codexProfileEnvForTest(configuredProfile, executable);
    assert.equal(env.CCR_CODEX_ISOLATED_IDENTITY, "1");
    assert.equal(env.CCR_CODEX_CHATGPT_AUTH_FILE, "");
    assert.equal(env.CODEXL_CODEX_CHATGPT_AUTH_FILE, "");
    for (const key of ["CCR_REAL_CODEX_CLI_PATH", "CCR_BUNDLED_CODEX_CLI_PATH", "CODEXL_REAL_CODEX_CLI_PATH", "CODEXL_BUNDLED_CODEX_CLI_PATH"]) {
      assert.equal(env[key], expected, key);
    }
  };
  try {
    mkdirSync(path.dirname(executable), { recursive: true });
    assertCli("codex");
    writeCli(legacyCli);
    assertCli(legacyCli);
    writeCli(modernBinary);
    assertCli(modernBinary);
    writeCli(modernShim);
    assertCli(modernShim);
    assertCli("/custom/codex", { ...profile, codexCliPath: "/custom/codex" });
    rmSync(modernShim);
    assertCli(modernBinary);
    rmSync(modernBinary);
    assertCli(legacyCli);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
