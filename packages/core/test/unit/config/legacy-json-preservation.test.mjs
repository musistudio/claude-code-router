import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("malformed legacy JSON is preserved when default config is persisted", async () => {
  const testRoot = path.join(
    process.env.CCR_INTERNAL_HOME_DIR,
    `legacy-json-preservation-${process.pid}`
  );
  process.env.CCR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const {
    APP_CONFIG_DB_FILE,
    LEGACY_ACTIVE_CONFIG_FILE
  } = await import("@ccr/core/config/constants.ts");
  mkdirSync(path.dirname(LEGACY_ACTIVE_CONFIG_FILE), { recursive: true });
  const malformedConfig = "{\n  \"PORT\": 9999,\n";
  writeFileSync(LEGACY_ACTIVE_CONFIG_FILE, malformedConfig, "utf8");

  const { loadAppConfig } = await import("@ccr/core/config/config.ts");
  const config = await loadAppConfig();

  assert.equal(config.PORT, 3456);
  assert.equal(existsSync(APP_CONFIG_DB_FILE), true);
  assert.equal(existsSync(LEGACY_ACTIVE_CONFIG_FILE), true);
  assert.equal(readFileSync(LEGACY_ACTIVE_CONFIG_FILE, "utf8"), malformedConfig);
});
