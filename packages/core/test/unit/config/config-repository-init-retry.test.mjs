import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("the same repository retries initialization after the filesystem recovers", async () => {
  const root = path.join(process.env.CCR_INTERNAL_HOME_DIR || os.tmpdir(), `repository-init-retry-${process.pid}`);
  process.env.CCR_INTERNAL_HOME_DIR = path.join(root, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(root, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(root, "user-data");
  const { ConfigRepository } = await import("@ccr/core/config/config-repository.ts");
  mkdirSync(root, { recursive: true });
  const blockedDirectory = path.join(root, "blocked");
  writeFileSync(blockedDirectory, "temporary filesystem obstruction");
  const repository = new ConfigRepository(path.join(blockedDirectory, "config.sqlite"));

  const attempts = await Promise.allSettled([
    repository.readSetting("retry"),
    repository.replaceSetting("retry", "before recovery")
  ]);
  assert.ok(attempts.every((result) => result.status === "rejected"));

  rmSync(blockedDirectory);
  mkdirSync(blockedDirectory);
  await repository.replaceSetting("retry", "after recovery");
  assert.equal(await repository.readSetting("retry"), "after recovery");
});
