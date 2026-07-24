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

// packages/core/test/unit/runtime/app-paths.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_os2 = __toESM(require("node:os"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/runtime/app-paths.ts
var import_node_os = __toESM(require("node:os"));
var import_node_path = __toESM(require("node:path"));
var APP_STORAGE_NAME = "claude-code-router";
var LEGACY_CONFIGDIR = import_node_path.default.join(import_node_os.default.homedir(), ".claude-code-router");
var homeDirEnv = "CCR_INTERNAL_HOME_DIR";
var appDataDirEnv = "CCR_INTERNAL_APP_DATA_DIR";
var userDataDirEnv = "CCR_INTERNAL_USER_DATA_DIR";
function resolveRuntimeAppPath(name) {
  const configured = readConfiguredPath(name);
  if (configured) {
    return configured;
  }
  if (name === "home") {
    return import_node_os.default.homedir();
  }
  if (name === "appData") {
    return fallbackAppDataDir();
  }
  return fallbackUserDataDir();
}
function resolveRuntimeConfigDir() {
  if (process.platform === "win32") {
    return import_node_path.default.join(resolveRuntimeAppPath("appData"), APP_STORAGE_NAME);
  }
  return import_node_path.default.join(resolveRuntimeAppPath("home"), `.${APP_STORAGE_NAME}`);
}
function resolveRuntimeDataDir() {
  const configured = readConfiguredPath("userData");
  if (configured) {
    return configured;
  }
  if (process.platform === "win32") {
    return resolveRuntimeConfigDir();
  }
  return import_node_path.default.join(resolveRuntimeConfigDir(), "app-data");
}
function readConfiguredPath(name) {
  const key = name === "home" ? homeDirEnv : name === "appData" ? appDataDirEnv : userDataDirEnv;
  const value = process.env[key]?.trim();
  return value || void 0;
}
function fallbackAppDataDir() {
  if (process.platform === "win32") {
    return process.env.APPDATA || process.env.LOCALAPPDATA || (process.env.USERPROFILE ? import_node_path.default.join(process.env.USERPROFILE, "AppData", "Roaming") : import_node_path.default.join(import_node_os.default.homedir(), "AppData", "Roaming"));
  }
  return process.env.XDG_CONFIG_HOME || import_node_path.default.join(import_node_os.default.homedir(), ".config");
}
function fallbackUserDataDir() {
  return resolveRuntimeDataDir();
}

// packages/core/test/unit/runtime/app-paths.test.mjs
(0, import_node_test.default)("runtime config and data dirs default to the shared CCR storage", () => {
  withRuntimePathEnv({
    appData: import_node_path2.default.join(import_node_os2.default.tmpdir(), "ccr-app-paths-app-data"),
    home: import_node_path2.default.join(import_node_os2.default.tmpdir(), "ccr-app-paths-home")
  }, () => {
    const configDir = resolveRuntimeConfigDir();
    const expectedConfigDir = process.platform === "win32" ? import_node_path2.default.join(import_node_os2.default.tmpdir(), "ccr-app-paths-app-data", APP_STORAGE_NAME) : import_node_path2.default.join(import_node_os2.default.tmpdir(), "ccr-app-paths-home", `.${APP_STORAGE_NAME}`);
    const expectedDataDir = process.platform === "win32" ? expectedConfigDir : import_node_path2.default.join(expectedConfigDir, "app-data");
    import_strict.default.equal(configDir, expectedConfigDir);
    import_strict.default.equal(resolveRuntimeDataDir(), expectedDataDir);
  });
});
(0, import_node_test.default)("runtime data dir still allows explicit test and deployment overrides", () => {
  withRuntimePathEnv({
    appData: import_node_path2.default.join(import_node_os2.default.tmpdir(), "ccr-app-paths-override-app-data"),
    home: import_node_path2.default.join(import_node_os2.default.tmpdir(), "ccr-app-paths-override-home"),
    userData: import_node_path2.default.join(import_node_os2.default.tmpdir(), "ccr-app-paths-override-user-data")
  }, () => {
    import_strict.default.equal(resolveRuntimeDataDir(), import_node_path2.default.join(import_node_os2.default.tmpdir(), "ccr-app-paths-override-user-data"));
  });
});
function withRuntimePathEnv(paths, run) {
  const previous = {
    appData: process.env.CCR_INTERNAL_APP_DATA_DIR,
    home: process.env.CCR_INTERNAL_HOME_DIR,
    userData: process.env.CCR_INTERNAL_USER_DATA_DIR
  };
  try {
    setOptionalEnv("CCR_INTERNAL_APP_DATA_DIR", paths.appData);
    setOptionalEnv("CCR_INTERNAL_HOME_DIR", paths.home);
    setOptionalEnv("CCR_INTERNAL_USER_DATA_DIR", paths.userData);
    run();
  } finally {
    setOptionalEnv("CCR_INTERNAL_APP_DATA_DIR", previous.appData);
    setOptionalEnv("CCR_INTERNAL_HOME_DIR", previous.home);
    setOptionalEnv("CCR_INTERNAL_USER_DATA_DIR", previous.userData);
  }
}
function setOptionalEnv(name, value) {
  if (value === void 0) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
