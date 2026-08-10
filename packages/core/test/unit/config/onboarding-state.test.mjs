import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("onboarding state falls back to the legacy marker when the config database cannot be read", async () => {
  const testRoot = path.join(
    process.env.CCR_INTERNAL_HOME_DIR,
    `onboarding-state-fallback-${process.pid}`
  );
  process.env.CCR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const {
    APP_CONFIG_DB_FILE,
    ONBOARDING_FINISHED_FILE
  } = await import("@ccr/core/config/constants.ts");
  mkdirSync(path.dirname(APP_CONFIG_DB_FILE), { recursive: true });
  writeFileSync(APP_CONFIG_DB_FILE, "not a SQLite database", "utf8");
  writeFileSync(ONBOARDING_FINISHED_FILE, "", "utf8");

  const { loadOnboardingFinished } = await import("@ccr/core/config/onboarding-state.ts");
  assert.equal(await loadOnboardingFinished(), true);

  rmSync(ONBOARDING_FINISHED_FILE);
  assert.equal(await loadOnboardingFinished(), false);
});
