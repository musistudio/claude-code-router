import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { reconcileProfileModelSelections } from "@ccr/core/profiles/model-selection.ts";

function fixture() {
  const config = createDefaultAppConfig();
  config.Providers = [{ id: "local-engine", name: "Local", type: "openai_responses", models: ["local-model", "openai/vendor-model"] }];
  config.profile.profiles = [{ id: "checked", name: "Checked", agent: "claude-code", scope: "ccr", enabled: true,
    model: "Local/local-model", availableModels: ["Local/local-model", "Local/local-engine", "Gone/model", "Local/openai/vendor-model"] }];
  return config;
}

test("#1910 save reconciliation removes stale provider/model entries and retains the restrictive default", () => {
  const config = fixture();
  const result = reconcileProfileModelSelections(config);
  assert.deepEqual(result.profile.profiles[0].availableModels, ["Local/local-model", "Local/openai/vendor-model"]);
  assert.equal(config.profile.profiles[0].availableModels.length, 4, "validation does not mutate the caller's snapshot");
});

test("#1910 an invalid default reports its actual provider and never becomes allow-all", () => {
  const config = fixture();
  config.profile.profiles[0].model = "Local/local-engine";
  assert.throws(() => reconcileProfileModelSelections(config), /Profile "Checked".*Provider "Local".*local-engine.*Available models: local-model, openai\/vendor-model/);
  config.profile.profiles[0].model = "";
  config.profile.profiles[0].availableModels = ["Gone/model"];
  assert.throws(() => reconcileProfileModelSelections(config), /Select at least one configured model/);
});

test("#1910 configured bare models remain valid across multiple provider protocols", () => {
  const config = fixture();
  config.Providers.push({ id: "second", name: "Second", type: "anthropic_messages", models: ["local-model"] });
  config.profile.profiles[0].model = "local-model";
  config.profile.profiles[0].availableModels = ["local-model", "Gone/model"];
  assert.deepEqual(reconcileProfileModelSelections(config).profile.profiles[0].availableModels, ["local-model"]);
});

test("#1910 settings persistence reconciles the saved profile allowlist", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-profile-model-save-"));
  const previous = process.env.CCR_INTERNAL_HOME_DIR;
  const previousData = process.env.CCR_INTERNAL_APP_DATA_DIR;
  process.env.CCR_INTERNAL_HOME_DIR = dir;
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(dir, "app-data");
  try {
    const { saveAppConfig, loadAppConfig } = await import("@ccr/core/config/config.ts");
    const saved = await saveAppConfig(fixture());
    assert.deepEqual(saved.profile.profiles[0].availableModels, ["Local/local-model", "Local/openai/vendor-model"]);
    assert.deepEqual((await loadAppConfig()).profile.profiles[0].availableModels, saved.profile.profiles[0].availableModels);
  } finally {
    if (previous === undefined) delete process.env.CCR_INTERNAL_HOME_DIR; else process.env.CCR_INTERNAL_HOME_DIR = previous;
    if (previousData === undefined) delete process.env.CCR_INTERNAL_APP_DATA_DIR; else process.env.CCR_INTERNAL_APP_DATA_DIR = previousData;
    rmSync(dir, { recursive: true, force: true });
  }
});
