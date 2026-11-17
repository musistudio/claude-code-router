import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import yaml from "js-yaml";
import semver from "semver";

test("#1957 npm and pnpm Electron locks satisfy the patched desktop runtime floor", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const npm = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const pnpm = yaml.load(readFileSync("pnpm-lock.yaml", "utf8"));
  const range = manifest.devDependencies.electron;
  assert.ok(semver.gte(semver.minVersion(range), "42.11.18"));
  const npmVersion = npm.packages["node_modules/electron"].version;
  const pnpmVersion = pnpm.importers["."].devDependencies.electron.version;
  assert.equal(npmVersion, pnpmVersion);
  assert.ok(semver.satisfies(npmVersion, range));
  assert.equal(pnpm.importers["."].devDependencies.electron.specifier, range);
  assert.equal(npm.packages[""].devDependencies.electron, range);
  assert.equal(pnpm.packages[`electron@${pnpmVersion}`].resolution.integrity, npm.packages["node_modules/electron"].integrity);
});
