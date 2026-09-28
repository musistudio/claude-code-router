import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, chmodSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { resolveRuntimeAppPath } from "@ccr/core/runtime/app-paths";

const claudeAppVmBundlesDir = "vm_bundles";
const claudeAppVmBundleName = "claudevm.bundle";
const claudeAppVmSeedEnv = "CCR_CLAUDE_APP_VM_SEED_DIR";
const claudeAppVmSeedDisabledEnv = "CCR_CLAUDE_APP_VM_SEED_DISABLED";
const maxSmallFileCopyBytes = 64 * 1024 * 1024;
const lockRetryIntervalMs = 100;
const lockTimeoutMs = 15_000;
const staleLockMs = 10 * 60_000;

export type ClaudeAppVmStoragePrepareResult =
  | {
      action: "prepared";
      seedBundleDir: string;
      sourceBundleDir: string;
      targetBundleDir: string;
    }
  | {
      action: "skipped";
      reason: string;
      targetBundleDir: string;
    };

export function prepareClaudeAppVmStorage(configDir: string, userDataDir: string): ClaudeAppVmStoragePrepareResult {
  const targetBundleDir = resolveClaudeAppVmBundleDir(userDataDir);
  if (isDisabledEnv(process.env[claudeAppVmSeedDisabledEnv])) {
    return { action: "skipped", reason: "disabled", targetBundleDir };
  }
  return withVmStorageLock(configDir, targetBundleDir, () => prepareClaudeAppVmStorageLocked(configDir, userDataDir));
}

function prepareClaudeAppVmStorageLocked(configDir: string, userDataDir: string): ClaudeAppVmStoragePrepareResult {
  const targetBundleDir = resolveClaudeAppVmBundleDir(userDataDir);
  if (isUsableClaudeAppVmBundle(targetBundleDir)) {
    return { action: "skipped", reason: "target-present", targetBundleDir };
  }

  const sourceBundleDir = findClaudeAppVmSeedBundle(configDir, userDataDir);
  if (!sourceBundleDir) {
    return { action: "skipped", reason: "no-seed", targetBundleDir };
  }

  const seedBundleDir = ensureSharedClaudeAppVmSeed(configDir, sourceBundleDir, targetBundleDir);
  if (!seedBundleDir || samePath(seedBundleDir, targetBundleDir)) {
    return { action: "skipped", reason: "seed-unavailable", targetBundleDir };
  }

  if (!prepareTargetBundlePath(targetBundleDir)) {
    return { action: "skipped", reason: "target-not-replaceable", targetBundleDir };
  }

  try {
    cloneDirectory(seedBundleDir, targetBundleDir);
    return {
      action: "prepared",
      seedBundleDir,
      sourceBundleDir,
      targetBundleDir
    };
  } catch {
    rmSync(targetBundleDir, { force: true, recursive: true });
    return { action: "skipped", reason: "clone-failed", targetBundleDir };
  }
}

function withVmStorageLock(
  configDir: string,
  targetBundleDir: string,
  run: () => ClaudeAppVmStoragePrepareResult
): ClaudeAppVmStoragePrepareResult {
  const lockDir = path.join(configDir, "app-cache", "claude-app", ".vm-storage.lock");
  if (!acquireDirectoryLock(lockDir)) {
    return { action: "skipped", reason: "lock-timeout", targetBundleDir };
  }
  try {
    return run();
  } finally {
    rmSync(lockDir, { force: true, recursive: true });
  }
}

function acquireDirectoryLock(lockDir: string): boolean {
  const deadline = Date.now() + lockTimeoutMs;
  mkdirSync(path.dirname(lockDir), { mode: 0o700, recursive: true });
  while (Date.now() < deadline) {
    try {
      mkdirSync(lockDir, { mode: 0o700 });
      return true;
    } catch {
      removeStaleLock(lockDir);
      sleepSync(lockRetryIntervalMs);
    }
  }
  return false;
}

function removeStaleLock(lockDir: string): void {
  try {
    const stat = statSync(lockDir);
    if (Date.now() - stat.mtimeMs > staleLockMs) {
      rmSync(lockDir, { force: true, recursive: true });
    }
  } catch {
    // Another process may have released the lock between attempts.
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function resolveClaudeAppVmBundleDir(userDataDir: string): string {
  return path.join(userDataDir, claudeAppVmBundlesDir, claudeAppVmBundleName);
}

export function resolveSharedClaudeAppVmSeedBundleDir(configDir: string): string {
  return path.join(configDir, "app-cache", "claude-app", "vm-seeds", claudeAppVmBundleName);
}

export function resolveClaudeAppDefaultUserDataDirs(): string[] {
  if (process.platform === "darwin") {
    const applicationSupport = path.join(resolveRuntimeAppPath("home"), "Library", "Application Support");
    return [
      path.join(applicationSupport, "Claude"),
      path.join(applicationSupport, "Claude Desktop"),
      path.join(applicationSupport, "Claude-3p")
    ];
  }
  if (process.platform === "win32") {
    const roaming = resolveRuntimeAppPath("appData");
    const local = process.env.LOCALAPPDATA || path.join(roaming, "..", "Local");
    return [
      path.join(roaming, "Claude"),
      path.join(roaming, "Claude Desktop"),
      path.join(local, "Claude"),
      path.join(local, "Claude Desktop"),
      path.join(local, "Claude-3p")
    ];
  }
  const configHome = resolveRuntimeAppPath("appData");
  return [
    path.join(configHome, "Claude"),
    path.join(configHome, "claude"),
    path.join(configHome, "Claude Desktop"),
    path.join(configHome, "claude-desktop"),
    path.join(configHome, "Claude-3p")
  ];
}

function findClaudeAppVmSeedBundle(configDir: string, userDataDir: string): string | undefined {
  const targetBundleDir = resolveClaudeAppVmBundleDir(userDataDir);
  return uniqueStrings([
    ...configuredSeedBundleCandidates(),
    resolveSharedClaudeAppVmSeedBundleDir(configDir),
    ...resolveClaudeAppDefaultUserDataDirs().map(resolveClaudeAppVmBundleDir),
    ...existingCcrProfileVmBundleCandidates(configDir)
  ]).find((candidate) =>
    !samePath(candidate, targetBundleDir) &&
    isUsableClaudeAppVmBundle(candidate)
  );
}

function configuredSeedBundleCandidates(): string[] {
  const configured = process.env[claudeAppVmSeedEnv]?.trim();
  if (!configured) {
    return [];
  }
  return configured
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const resolved = resolveUserPath(entry);
      return path.basename(resolved) === claudeAppVmBundleName
        ? [resolved]
        : [resolved, resolveClaudeAppVmBundleDir(resolved)];
    });
}

function existingCcrProfileVmBundleCandidates(configDir: string): string[] {
  const profilesDir = path.join(configDir, "profiles");
  if (!isDirectory(profilesDir)) {
    return [];
  }
  const results: string[] = [];
  const pending: Array<{ depth: number; dir: string }> = [{ depth: 0, dir: profilesDir }];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || current.depth > 8) {
      continue;
    }
    for (const entry of readDirEntries(current.dir)) {
      const file = path.join(current.dir, entry);
      if (entry === claudeAppVmBundleName && isDirectory(file) && file.includes(`${path.sep}${claudeAppVmBundlesDir}${path.sep}`)) {
        results.push(file);
        continue;
      }
      if (isDirectory(file)) {
        pending.push({ depth: current.depth + 1, dir: file });
      }
    }
  }
  return results;
}

function ensureSharedClaudeAppVmSeed(
  configDir: string,
  sourceBundleDir: string,
  targetBundleDir: string
): string | undefined {
  const seedBundleDir = resolveSharedClaudeAppVmSeedBundleDir(configDir);
  if (isUsableClaudeAppVmBundle(seedBundleDir)) {
    return seedBundleDir;
  }
  if (samePath(sourceBundleDir, seedBundleDir)) {
    return isUsableClaudeAppVmBundle(sourceBundleDir) ? sourceBundleDir : undefined;
  }

  if (!prepareTargetBundlePath(seedBundleDir)) {
    return sourceBundleDir;
  }

  try {
    cloneDirectory(sourceBundleDir, seedBundleDir);
    return seedBundleDir;
  } catch {
    rmSync(seedBundleDir, { force: true, recursive: true });
    return samePath(sourceBundleDir, targetBundleDir) ? undefined : sourceBundleDir;
  }
}

function prepareTargetBundlePath(bundleDir: string): boolean {
  if (!pathEntryExists(bundleDir)) {
    mkdirSync(path.dirname(bundleDir), { mode: 0o700, recursive: true });
    return true;
  }
  if (!isReplaceableIncompleteBundle(bundleDir)) {
    return false;
  }
  rmSync(bundleDir, { force: true, recursive: true });
  mkdirSync(path.dirname(bundleDir), { mode: 0o700, recursive: true });
  return true;
}

function isUsableClaudeAppVmBundle(bundleDir: string): boolean {
  return isDirectory(bundleDir) && (
    existsSync(path.join(bundleDir, "rootfs.img")) ||
    existsSync(path.join(bundleDir, "rootfs.img.zst"))
  );
}

function isReplaceableIncompleteBundle(bundleDir: string): boolean {
  if (!isDirectory(bundleDir)) {
    return isSymlink(bundleDir);
  }
  const entries = readDirEntries(bundleDir);
  if (entries.length === 0) {
    return true;
  }
  return entries.every((entry) =>
    entry === ".cowork-adopted" ||
    entry === ".DS_Store" ||
    entry.startsWith(".wvm-tmp-")
  );
}

function cloneDirectory(sourceDir: string, targetDir: string): void {
  const parentDir = path.dirname(targetDir);
  const tempDir = path.join(parentDir, `.${path.basename(targetDir)}.ccr-clone-${process.pid}-${Date.now()}`);
  rmSync(tempDir, { force: true, recursive: true });
  try {
    copyDirectoryContents(sourceDir, tempDir);
    rmSync(targetDir, { force: true, recursive: true });
    renameSync(tempDir, targetDir);
  } catch (error) {
    rmSync(tempDir, { force: true, recursive: true });
    throw error;
  }
}

function copyDirectoryContents(sourceDir: string, targetDir: string): void {
  const sourceStat = statSync(sourceDir);
  mkdirSync(targetDir, { mode: sourceStat.mode & 0o777, recursive: true });
  chmodBestEffort(targetDir, sourceStat.mode & 0o777);
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    const sourceEntryStat = lstatSync(source);
    if (sourceEntryStat.isSymbolicLink()) {
      symlinkSync(readlinkSync(source), target);
      continue;
    }
    if (sourceEntryStat.isDirectory()) {
      copyDirectoryContents(source, target);
      continue;
    }
    if (sourceEntryStat.isFile()) {
      copyFileWithClone(source, target, sourceEntryStat.size);
      chmodBestEffort(target, sourceEntryStat.mode & 0o777);
    }
  }
}

function copyFileWithClone(source: string, target: string, size: number): void {
  if (process.platform === "darwin" && cloneFileWithMacCp(source, target)) {
    return;
  }
  try {
    copyFileSync(source, target, constants.COPYFILE_FICLONE_FORCE);
    return;
  } catch {
    if (size > maxSmallFileCopyBytes) {
      throw new Error(`Copy-on-write clone is not available for ${source}.`);
    }
  }
  copyFileSync(source, target);
}

function cloneFileWithMacCp(source: string, target: string): boolean {
  const result = spawnSync("/bin/cp", ["-c", source, target], {
    stdio: "ignore"
  });
  return result.status === 0;
}

function pathEntryExists(file: string): boolean {
  try {
    lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

function isDirectory(file: string): boolean {
  try {
    return statSync(file).isDirectory();
  } catch {
    return false;
  }
}

function isSymlink(file: string): boolean {
  try {
    return lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

function readDirEntries(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function samePath(left: string, right: string): boolean {
  return normalizeComparablePath(left) === normalizeComparablePath(right);
}

function normalizeComparablePath(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === "win32" ? normalized.replace(/\\/g, "/").toLowerCase() : normalized;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeComparablePath(value);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

function resolveUserPath(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}

function chmodBestEffort(file: string, mode: number): void {
  try {
    chmodSync(file, mode);
  } catch {
    // File permissions are best-effort across platforms.
  }
}

function isDisabledEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
