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

// tests/architecture/ui-build-contract.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"), 1);
var import_node_test = __toESM(require("node:test"), 1);
(0, import_node_test.default)("home renderer HTML loads the web client bridge before the app bundle", () => {
  const projectRoot = process.cwd();
  const buildConfig = (0, import_node_fs.readFileSync)(import_node_path.default.join(projectRoot, "build", "esbuild.config.mjs"), "utf8");
  const webBridge = (0, import_node_fs.readFileSync)(import_node_path.default.join(projectRoot, "packages", "ui", "src", "web-client-bridge.ts"), "utf8");
  import_strict.default.match(buildConfig, /beforeModuleScriptTags:\s*\[\s*'    <script src="\.\.\/\.\.\/assets\/web-client-bridge\.js"><\/script>'\s*\]/);
  import_strict.default.match(webBridge, /if \(!window\.ccr\) \{/);
});
