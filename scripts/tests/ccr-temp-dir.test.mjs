import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const constantsPath = path.join(repoRoot, "packages/shared/src/constants.ts");
const source = fs.readFileSync(constantsPath, "utf8");

const userSuffix =
  typeof process.getuid === "function"
    ? String(process.getuid())
    : os.userInfo().username.replace(/[^a-zA-Z0-9._-]/g, "_");
const expectedTempDir = path.join(os.tmpdir(), `claude-code-router-${userSuffix}`);

assert.match(source, /export const getCcrTempDir = \(\): string => \{/);
assert.match(source, /typeof process\.getuid === "function"/);
assert.match(source, /sanitizeTempPathSegment\(os\.userInfo\(\)\.username\)/);
assert.match(source, /path\.join\(os\.tmpdir\(\), `claude-code-router-\$\{userSuffix\}`\)/);
assert.notEqual(expectedTempDir, path.join(os.tmpdir(), "claude-code-router"));
