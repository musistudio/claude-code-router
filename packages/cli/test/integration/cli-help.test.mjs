import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const cliRuntime = path.join(process.cwd(), ".test-dist", "cli", "runtime", "cli.js");

test("built CLI exposes package-owned help", () => {
  const result = runCli(["--help"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /ccr serve/);
  assert.match(result.stdout, /ccr <profile-name-or-id>/);
});

test("built CLI rejects invalid ports before starting services", () => {
  const result = runCli(["serve", "--port", "invalid", "--no-open", "--no-gateway"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid port: invalid/);
});

test("every service command exposes its package-owned command help", () => {
  for (const [command, usage] of [
    ["start", /ccr start/],
    ["ui", /ccr ui/],
    ["serve", /ccr serve/],
    ["stop", /ccr stop/]
  ]) {
    const result = runCli([command, "--help"]);
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    assert.match(result.stdout, usage, command);
  }
});

test("built CLI rejects missing, out-of-range, and unknown service options", () => {
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
    assert.equal(result.status, 1, `${args.join(" ")}: ${result.stderr}`);
    assert.match(result.stderr, error, args.join(" "));
  }
});

test("built CLI requires a profile reference when no command is supplied", () => {
  const result = runCli([]);

  assert.equal(result.status, 2, result.stderr);
  assert.match(`${result.stdout}${result.stderr}`, /ccr <profile-name-or-id>/);
});

function runCli(args) {
  return spawnSync(process.execPath, [cliRuntime, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      CCR_CLI_COMMAND_NAME: "ccr"
    }
  });
}
