import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  prepareClaudeAppVmStorage,
  resolveClaudeAppDefaultUserDataDirs,
  resolveClaudeAppVmBundleDir,
  resolveSharedClaudeAppVmSeedBundleDir
} from "@ccr/core/agents/claude-app/vm-storage.ts";

test("Claude App VM storage prepares profile bundle from the default Claude App data dir", () => {
  withRuntimeEnv((root) => {
    const configDir = path.join(root, "ccr");
    const sourceBundle = resolveClaudeAppVmBundleDir(resolveClaudeAppDefaultUserDataDirs()[0]);
    const targetUserDataDir = path.join(configDir, "profiles", "target", "claude", ".claude-code-router", "claude-app-user-data", "target");
    writeVmBundle(sourceBundle, "default-vm");

    const result = prepareClaudeAppVmStorage(configDir, targetUserDataDir);

    assert.equal(result.action, "prepared");
    assert.equal(readRootfs(resolveSharedClaudeAppVmSeedBundleDir(configDir)), "default-vm");
    assert.equal(readRootfs(resolveClaudeAppVmBundleDir(targetUserDataDir)), "default-vm");
  });
});

test("Claude App VM storage can seed new profiles from an existing CCR profile", () => {
  withRuntimeEnv((root) => {
    const configDir = path.join(root, "ccr");
    const sourceUserDataDir = path.join(configDir, "profiles", "source", "claude", ".claude-code-router", "claude-app-user-data", "source");
    const targetUserDataDir = path.join(configDir, "profiles", "target", "claude", ".claude-code-router", "claude-app-user-data", "target");
    const sourceBundle = resolveClaudeAppVmBundleDir(sourceUserDataDir);
    writeVmBundle(sourceBundle, "profile-vm");

    const result = prepareClaudeAppVmStorage(configDir, targetUserDataDir);

    assert.equal(result.action, "prepared");
    assert.equal(result.sourceBundleDir, sourceBundle);
    assert.equal(readRootfs(resolveSharedClaudeAppVmSeedBundleDir(configDir)), "profile-vm");
    assert.equal(readRootfs(resolveClaudeAppVmBundleDir(targetUserDataDir)), "profile-vm");
  });
});

test("Claude App VM storage leaves an existing profile VM untouched", () => {
  withRuntimeEnv((root) => {
    const configDir = path.join(root, "ccr");
    const sourceBundle = resolveClaudeAppVmBundleDir(resolveClaudeAppDefaultUserDataDirs()[0]);
    const targetUserDataDir = path.join(configDir, "profiles", "target", "claude", ".claude-code-router", "claude-app-user-data", "target");
    const targetBundle = resolveClaudeAppVmBundleDir(targetUserDataDir);
    writeVmBundle(sourceBundle, "source-vm");
    writeVmBundle(targetBundle, "target-vm");

    const result = prepareClaudeAppVmStorage(configDir, targetUserDataDir);

    assert.deepEqual(result, {
      action: "skipped",
      reason: "target-present",
      targetBundleDir: targetBundle
    });
    assert.equal(readRootfs(targetBundle), "target-vm");
  });
});

test("Claude App VM storage replaces incomplete temporary VM bundles", () => {
  withRuntimeEnv((root) => {
    const configDir = path.join(root, "ccr");
    const sourceBundle = resolveClaudeAppVmBundleDir(resolveClaudeAppDefaultUserDataDirs()[0]);
    const targetUserDataDir = path.join(configDir, "profiles", "target", "claude", ".claude-code-router", "claude-app-user-data", "target");
    const targetBundle = resolveClaudeAppVmBundleDir(targetUserDataDir);
    writeVmBundle(sourceBundle, "source-vm");
    mkdirSync(path.join(targetBundle, ".wvm-tmp-123"), { recursive: true });
    writeFileSync(path.join(targetBundle, ".wvm-tmp-123", "rootfs.img"), "partial-vm");
    writeFileSync(path.join(targetBundle, ".cowork-adopted"), "marker");

    const result = prepareClaudeAppVmStorage(configDir, targetUserDataDir);

    assert.equal(result.action, "prepared");
    assert.equal(readRootfs(targetBundle), "source-vm");
    assert.equal(existsSync(path.join(targetBundle, ".wvm-tmp-123")), false);
  });
});

function writeVmBundle(bundleDir, content) {
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(path.join(bundleDir, "rootfs.img"), content);
  writeFileSync(path.join(bundleDir, "machineIdentifier"), "machine");
}

function readRootfs(bundleDir) {
  return readFileSync(path.join(bundleDir, "rootfs.img"), "utf8");
}

function withRuntimeEnv(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-claude-app-vm-storage-"));
  const previous = {
    appData: process.env.CCR_INTERNAL_APP_DATA_DIR,
    home: process.env.CCR_INTERNAL_HOME_DIR,
    seed: process.env.CCR_CLAUDE_APP_VM_SEED_DIR,
    seedDisabled: process.env.CCR_CLAUDE_APP_VM_SEED_DISABLED
  };
  try {
    process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(root, "app-data");
    process.env.CCR_INTERNAL_HOME_DIR = path.join(root, "home");
    delete process.env.CCR_CLAUDE_APP_VM_SEED_DIR;
    delete process.env.CCR_CLAUDE_APP_VM_SEED_DISABLED;
    run(root);
  } finally {
    setOptionalEnv("CCR_INTERNAL_APP_DATA_DIR", previous.appData);
    setOptionalEnv("CCR_INTERNAL_HOME_DIR", previous.home);
    setOptionalEnv("CCR_CLAUDE_APP_VM_SEED_DIR", previous.seed);
    setOptionalEnv("CCR_CLAUDE_APP_VM_SEED_DISABLED", previous.seedDisabled);
    rmSync(root, { force: true, recursive: true });
  }
}

function setOptionalEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
