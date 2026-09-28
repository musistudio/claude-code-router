import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const packageNames = ["cli", "core", "electron", "ui"];

test("legacy Electron process test suites contain no source files", () => {
  for (const directoryName of ["main", "renderer"]) {
    const directory = path.join(projectRoot, "tests", directoryName);
    const files = existsSync(directory) ? sourceFiles(directory) : [];
    assert.deepEqual(files, [], `${directoryName} must not contain legacy test sources`);
  }
});

test("every workspace package owns a test command and test directory", () => {
  for (const packageName of packageNames) {
    const packageRoot = path.join(projectRoot, "packages", packageName);
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    assert.equal(typeof manifest.scripts?.test, "string", `${packageName} must expose a test script`);
    assert.equal(existsSync(path.join(packageRoot, "test")), true, `${packageName} must own a test directory`);
  }
});

test("package code and tests do not reach into another package through relative source paths", () => {
  const violations = packageNames.flatMap((packageName) => {
    const packageRoot = path.join(projectRoot, "packages", packageName);
    return sourceFiles(packageRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return /(?:from\s+|import\s*\(|require\s*\()["'][^"']*packages\/(?:cli|core|electron|ui)\/src\//.test(source)
        ? [path.relative(projectRoot, file)]
        : [];
    });
  });

  assert.deepEqual(violations, []);
});

test("npm and Docker builds carry the plugin-capable gateway runtime", () => {
  const buildConfig = readFileSync(path.join(projectRoot, "build", "esbuild.config.mjs"), "utf8");
  const manifest = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));

  assert.match(buildConfig, /export function createCliBuildOptions[\s\S]*?entryPoints:\s*\[[\s\S]*?gatewayRuntimeInput/);
  assert.match(buildConfig, /export function createCoreServerBuildOptions[\s\S]*?entryPoints:\s*\[[\s\S]*?gatewayRuntimeInput/);
  assert.equal(manifest.scripts["docker:prepare-gateway"], "node build/docker-local-gateway.mjs prepare");
  assert.equal(manifest.scripts["docker:build"], "node build/docker-image.mjs");
  assert.equal(manifest.scripts["docker:compose:build"], "node build/docker-compose.mjs build");
  assert.equal(manifest.scripts["docker:compose:up"], "node build/docker-compose.mjs up -d --build");
});

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "dist" || entry.name === "node_modules" ? [] : sourceFiles(file);
    }
    return entry.isFile() && /\.(?:cjs|js|jsx|mjs|ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}
