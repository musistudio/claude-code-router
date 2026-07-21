"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// tests/architecture/package-boundaries.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"), 1);
var import_node_test = __toESM(require("node:test"), 1);
var projectRoot = process.cwd();
var packageNames = ["cli", "core", "electron", "ui"];
(0, import_node_test.default)("legacy Electron process test suites have been removed", () => {
  import_strict.default.equal((0, import_node_fs.existsSync)(import_node_path.default.join(projectRoot, "tests", "main")), false);
  import_strict.default.equal((0, import_node_fs.existsSync)(import_node_path.default.join(projectRoot, "tests", "renderer")), false);
});
(0, import_node_test.default)("every workspace package owns a test command and test directory", () => {
  for (const packageName of packageNames) {
    const packageRoot = import_node_path.default.join(projectRoot, "packages", packageName);
    const manifest = JSON.parse((0, import_node_fs.readFileSync)(import_node_path.default.join(packageRoot, "package.json"), "utf8"));
    import_strict.default.equal(typeof manifest.scripts?.test, "string", `${packageName} must expose a test script`);
    import_strict.default.equal((0, import_node_fs.existsSync)(import_node_path.default.join(packageRoot, "test")), true, `${packageName} must own a test directory`);
  }
});
(0, import_node_test.default)("package code and tests do not reach into another package through relative source paths", () => {
  const violations = packageNames.flatMap((packageName) => {
    const packageRoot = import_node_path.default.join(projectRoot, "packages", packageName);
    return sourceFiles(packageRoot).flatMap((file) => {
      const source = (0, import_node_fs.readFileSync)(file, "utf8");
      return /(?:from\s+|import\s*\(|require\s*\()["'][^"']*packages\/(?:cli|core|electron|ui)\/src\//.test(source) ? [import_node_path.default.relative(projectRoot, file)] : [];
    });
  });
  import_strict.default.deepEqual(violations, []);
});
function sourceFiles(directory) {
  return (0, import_node_fs.readdirSync)(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = import_node_path.default.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "dist" || entry.name === "node_modules" ? [] : sourceFiles(file);
    }
    return entry.isFile() && /\.(?:cjs|js|jsx|mjs|ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}
