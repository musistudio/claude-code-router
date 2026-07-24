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

// packages/core/test/unit/storage/migration.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_fs2 = require("node:fs");
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/storage/migration.ts
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"));
function copyMissingDirectoryContents(source, target, label) {
  if (!source || !target || sameFilesystemPath(source, target) || !(0, import_node_fs.existsSync)(source)) {
    return;
  }
  try {
    (0, import_node_fs.mkdirSync)(target, { recursive: true });
    (0, import_node_fs.cpSync)(source, target, { errorOnExist: false, force: false, recursive: true });
  } catch (error) {
    console.warn(`Failed to migrate ${label} from ${source} to ${target}: ${formatError(error)}`);
  }
}
function sameFilesystemPath(left, right) {
  return import_node_path.default.resolve(left).toLowerCase() === import_node_path.default.resolve(right).toLowerCase();
}
function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

// packages/core/test/unit/storage/migration.test.mjs
(0, import_node_test.default)("filesystem path comparison normalizes relative segments and case", () => {
  import_strict.default.equal(sameFilesystemPath("./data/../config", "config"), true);
  import_strict.default.equal(sameFilesystemPath("Config/Profiles", "config/profiles"), true);
  import_strict.default.equal(sameFilesystemPath("config-a", "config-b"), false);
});
(0, import_node_test.default)("directory migration copies nested missing files without replacing target files", () => {
  const root = (0, import_node_fs2.mkdtempSync)(import_node_path2.default.join(import_node_os.default.tmpdir(), "ccr-migration-test-"));
  try {
    const source = import_node_path2.default.join(root, "source");
    const target = import_node_path2.default.join(root, "target");
    (0, import_node_fs2.mkdirSync)(import_node_path2.default.join(source, "nested"), { recursive: true });
    (0, import_node_fs2.mkdirSync)(target, { recursive: true });
    (0, import_node_fs2.writeFileSync)(import_node_path2.default.join(source, "keep.txt"), "from-source");
    (0, import_node_fs2.writeFileSync)(import_node_path2.default.join(source, "nested", "new.txt"), "new-file");
    (0, import_node_fs2.writeFileSync)(import_node_path2.default.join(target, "keep.txt"), "from-target");
    copyMissingDirectoryContents(source, target, "test data");
    import_strict.default.equal((0, import_node_fs2.readFileSync)(import_node_path2.default.join(target, "keep.txt"), "utf8"), "from-target");
    import_strict.default.equal((0, import_node_fs2.readFileSync)(import_node_path2.default.join(target, "nested", "new.txt"), "utf8"), "new-file");
  } finally {
    (0, import_node_fs2.rmSync)(root, { force: true, recursive: true });
  }
});
(0, import_node_test.default)("directory migration ignores absent sources and identical paths", () => {
  const root = (0, import_node_fs2.mkdtempSync)(import_node_path2.default.join(import_node_os.default.tmpdir(), "ccr-migration-skip-test-"));
  try {
    const target = import_node_path2.default.join(root, "target");
    copyMissingDirectoryContents(import_node_path2.default.join(root, "missing"), target, "missing data");
    import_strict.default.equal((0, import_node_fs2.existsSync)(target), false);
    (0, import_node_fs2.mkdirSync)(target, { recursive: true });
    (0, import_node_fs2.writeFileSync)(import_node_path2.default.join(target, "existing.txt"), "untouched");
    copyMissingDirectoryContents(target, import_node_path2.default.join(target, "."), "same data");
    import_strict.default.equal((0, import_node_fs2.readFileSync)(import_node_path2.default.join(target, "existing.txt"), "utf8"), "untouched");
  } finally {
    (0, import_node_fs2.rmSync)(root, { force: true, recursive: true });
  }
});
