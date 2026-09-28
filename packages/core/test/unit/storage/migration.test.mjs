import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  copyMissingDirectoryContents,
  sameFilesystemPath
} from "@ccr/core/storage/migration.ts";

test("filesystem path comparison normalizes relative segments and case", () => {
  assert.equal(sameFilesystemPath("./data/../config", "config"), true);
  assert.equal(sameFilesystemPath("Config/Profiles", "config/profiles"), true);
  assert.equal(sameFilesystemPath("config-a", "config-b"), false);
});

test("directory migration copies nested missing files without replacing target files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-migration-test-"));
  try {
    const source = path.join(root, "source");
    const target = path.join(root, "target");
    mkdirSync(path.join(source, "nested"), { recursive: true });
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(source, "keep.txt"), "from-source");
    writeFileSync(path.join(source, "nested", "new.txt"), "new-file");
    writeFileSync(path.join(target, "keep.txt"), "from-target");

    copyMissingDirectoryContents(source, target, "test data");

    assert.equal(readFileSync(path.join(target, "keep.txt"), "utf8"), "from-target");
    assert.equal(readFileSync(path.join(target, "nested", "new.txt"), "utf8"), "new-file");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("directory migration ignores absent sources and identical paths", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-migration-skip-test-"));
  try {
    const target = path.join(root, "target");
    copyMissingDirectoryContents(path.join(root, "missing"), target, "missing data");
    assert.equal(existsSync(target), false);

    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "existing.txt"), "untouched");
    copyMissingDirectoryContents(target, path.join(target, "."), "same data");
    assert.equal(readFileSync(path.join(target, "existing.txt"), "utf8"), "untouched");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
