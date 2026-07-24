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

// packages/cli/test/integration/cli-help.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_child_process = require("node:child_process");
var import_node_path = __toESM(require("node:path"), 1);
var import_node_test = __toESM(require("node:test"), 1);
var cliRuntime = import_node_path.default.join(process.cwd(), ".test-dist", "cli", "runtime", "cli.js");
(0, import_node_test.default)("built CLI exposes package-owned help", () => {
  const result = runCli(["--help"]);
  import_strict.default.equal(result.status, 0, result.stderr);
  import_strict.default.match(result.stdout, /Usage:/);
  import_strict.default.match(result.stdout, /ccr serve/);
  import_strict.default.match(result.stdout, /ccr <profile-name-or-id>/);
});
(0, import_node_test.default)("built CLI rejects invalid ports before starting services", () => {
  const result = runCli(["serve", "--port", "invalid", "--no-open", "--no-gateway"]);
  import_strict.default.equal(result.status, 1);
  import_strict.default.match(result.stderr, /Invalid port: invalid/);
});
(0, import_node_test.default)("every service command exposes its package-owned command help", () => {
  for (const [command, usage] of [
    ["start", /ccr start/],
    ["ui", /ccr ui/],
    ["serve", /ccr serve/],
    ["stop", /ccr stop/]
  ]) {
    const result = runCli([command, "--help"]);
    import_strict.default.equal(result.status, 0, `${command}: ${result.stderr}`);
    import_strict.default.match(result.stdout, usage, command);
  }
});
(0, import_node_test.default)("built CLI rejects missing, out-of-range, and unknown service options", () => {
  const cases = [
    [["serve", "--host"], /--host requires a value/],
    [["serve", "--host="], /--host requires a value/],
    [["serve", "--port", "0"], /Invalid port: 0/],
    [["serve", "--port=65536"], /Invalid port: 65536/],
    [["ui", "--unknown"], /Unknown web option: --unknown/],
    [["stop", "--force"], /Unknown stop option: --force/]
  ];
  for (const [args, error] of cases) {
    const result = runCli(args);
    import_strict.default.equal(result.status, 1, `${args.join(" ")}: ${result.stderr}`);
    import_strict.default.match(result.stderr, error, args.join(" "));
  }
});
(0, import_node_test.default)("built CLI requires a profile reference when no command is supplied", () => {
  const result = runCli([]);
  import_strict.default.equal(result.status, 2, result.stderr);
  import_strict.default.match(`${result.stdout}${result.stderr}`, /ccr <profile-name-or-id>/);
});
function runCli(args) {
  return (0, import_node_child_process.spawnSync)(process.execPath, [cliRuntime, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_CLI_COMMAND_NAME: "ccr"
    }
  });
}
