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

// packages/electron/test/unit/launch-at-login.test.ts
var import_strict = __toESM(require("node:assert/strict"));
var import_node_test = __toESM(require("node:test"));

// packages/electron/src/main/launch-at-login.ts
var import_electron = require("electron");
function isLaunchAtLoginSupported(platform = process.platform) {
  return platform === "darwin" || platform === "win32";
}

// packages/electron/test/unit/launch-at-login.test.ts
(0, import_node_test.default)("launch at login is available only on supported desktop platforms", () => {
  import_strict.default.equal(isLaunchAtLoginSupported("darwin"), true);
  import_strict.default.equal(isLaunchAtLoginSupported("win32"), true);
  import_strict.default.equal(isLaunchAtLoginSupported("linux"), false);
});
