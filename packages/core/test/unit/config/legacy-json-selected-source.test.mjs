import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("only the successfully parsed legacy JSON source is archived", async () => {
  const testRoot = path.join(
    process.env.CCR_INTERNAL_HOME_DIR,
    `legacy-json-selected-source-${process.pid}`
  );
  process.env.CCR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const {
    LEGACY_ACTIVE_CONFIG_FILE,
    LEGACY_WINDOWS_CONFIG_FILE
  } = await import("@ccr/core/config/constants.ts");
  mkdirSync(path.dirname(LEGACY_ACTIVE_CONFIG_FILE), { recursive: true });
  mkdirSync(path.dirname(LEGACY_WINDOWS_CONFIG_FILE), { recursive: true });

  const malformedConfig = "{\n  \"PORT\": 9999,\n";
  writeFileSync(LEGACY_ACTIVE_CONFIG_FILE, malformedConfig, "utf8");
  writeFileSync(LEGACY_WINDOWS_CONFIG_FILE, JSON.stringify({ PORT: 4567 }), "utf8");

  const { loadAppConfig } = await import("@ccr/core/config/config.ts");
  const config = await loadAppConfig();

  assert.equal(config.PORT, 4567);
  assert.equal(existsSync(LEGACY_ACTIVE_CONFIG_FILE), true);
  assert.equal(readFileSync(LEGACY_ACTIVE_CONFIG_FILE, "utf8"), malformedConfig);
  assert.equal(existsSync(LEGACY_WINDOWS_CONFIG_FILE), false);
});
