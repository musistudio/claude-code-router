import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeCodexCompatibleAppModelCatalog } from "../../packages/core/src/agents/codex/app-launch.ts";

test("Codex App model catalog write includes patch bridge capabilities", () => {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "ccr-codex-app-catalog-"));
  try {
    const config = {
      Providers: [
        { name: "DeepSeek", type: "openai_chat_completions", models: ["deepseek-v4-flash"] }
      ],
      Router: {
        builtInRules: {
          "claude-code": { enabled: true },
          codex: { enabled: true }
        },
        fallback: { mode: "off", models: [], retryCount: 1 },
        rules: []
      }
    };
    const profile = {
      agent: "codex",
      enabled: true,
      id: "codex-main",
      model: "DeepSeek/deepseek-v4-flash",
      name: "Codex Main",
      providerId: "openai-codex",
      scope: "ccr",
      surface: "app"
    };

    const result = writeCodexCompatibleAppModelCatalog(configDir, profile, config);
    assert.equal(result.changed, true);
    assert.equal(path.basename(result.file), "ccr-codex-model-catalog.json");
    assert.equal(
      result.userDataDir,
      path.join(configDir, "profiles", "codex-main", "codex", ".claude-code-router", "codex-app-user-data", "codex-main")
    );

    const catalog = JSON.parse(readFileSync(result.file, "utf8"));
    const model = catalog.models.find((item) => item.slug === "DeepSeek/deepseek-v4-flash");
    assert.ok(model);
    assert.equal(model.apply_patch_tool_type, "freeform");

    const second = writeCodexCompatibleAppModelCatalog(configDir, profile, config);
    assert.equal(second.changed, false);
    assert.equal(second.file, result.file);
  } finally {
    rmSync(configDir, { force: true, recursive: true });
  }
});
