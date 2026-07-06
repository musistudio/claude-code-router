import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { codexCliMiddlewareRuntimeScript } from "../../packages/core/src/agents/codex/cli-middleware-runtime.ts";

test("generated Codex CLI middleware runtime is valid JavaScript", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-check-"));
  const file = path.join(dir, "ccr-codex-cli-middleware.js");
  writeFileSync(file, codexCliMiddlewareRuntimeScript());
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
});

test("Claude Code wrapper injects the scoped profile model into real CLI args", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-wrapper-"));
  const runtimeFile = writeRuntimeScript(dir);
  const { fakeCli, outputFile } = writeFakeClaudeCli(dir);

  execFileSync(process.execPath, [runtimeFile, "-p", "hi"], {
    env: {
      ...process.env,
      ANTHROPIC_MODEL: "Fusion/kimisearch",
      CCR_CLAUDE_CODE_MODEL: "Fusion/kimisearch",
      CCR_CLAUDE_CODE_WRAPPER: "1",
      CCR_FAKE_CLAUDE_OUT: outputFile,
      CCR_REAL_CLAUDE_CODE_BIN: fakeCli,
      CCR_REMOTE_SYNC_ENABLED: "0"
    },
    stdio: "pipe"
  });

  const observed = JSON.parse(readFileSync(outputFile, "utf8"));
  assert.deepEqual(observed.argv, ["--model", "Fusion/kimisearch", "-p", "hi"]);
  assert.equal(observed.env.ANTHROPIC_MODEL, "Fusion/kimisearch");
  assert.equal(observed.env.CCR_CLAUDE_CODE_MODEL, "Fusion/kimisearch");
});

test("Claude Code wrapper does not duplicate an explicit model argument", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-wrapper-"));
  const runtimeFile = writeRuntimeScript(dir);
  const { fakeCli, outputFile } = writeFakeClaudeCli(dir);

  execFileSync(process.execPath, [runtimeFile, "--model", "Provider/manual", "-p", "hi"], {
    env: {
      ...process.env,
      ANTHROPIC_MODEL: "Fusion/kimisearch",
      CCR_CLAUDE_CODE_MODEL: "Fusion/kimisearch",
      CCR_CLAUDE_CODE_WRAPPER: "1",
      CCR_FAKE_CLAUDE_OUT: outputFile,
      CCR_REAL_CLAUDE_CODE_BIN: fakeCli,
      CCR_REMOTE_SYNC_ENABLED: "0"
    },
    stdio: "pipe"
  });

  const observed = JSON.parse(readFileSync(outputFile, "utf8"));
  assert.deepEqual(observed.argv, ["--model", "Provider/manual", "-p", "hi"]);
});

test("Claude Code wrapper injects the ToolHub MCP config into real CLI args", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-wrapper-"));
  const runtimeFile = writeRuntimeScript(dir);
  const { fakeCli, outputFile } = writeFakeClaudeCli(dir);
  const mcpConfigFile = path.join(dir, "toolhub-mcp.json");

  execFileSync(process.execPath, [runtimeFile, "-p", "hi"], {
    env: {
      ...process.env,
      CCR_CLAUDE_CODE_MCP_CONFIG: mcpConfigFile,
      CCR_CLAUDE_CODE_WRAPPER: "1",
      CCR_FAKE_CLAUDE_OUT: outputFile,
      CCR_REAL_CLAUDE_CODE_BIN: fakeCli,
      CCR_REMOTE_SYNC_ENABLED: "0"
    },
    stdio: "pipe"
  });

  const observed = JSON.parse(readFileSync(outputFile, "utf8"));
  assert.deepEqual(observed.argv, ["--mcp-config", mcpConfigFile, "-p", "hi"]);
  assert.equal(observed.env.CCR_CLAUDE_CODE_MCP_CONFIG, mcpConfigFile);
});

test("Claude Code wrapper does not duplicate an explicit MCP config argument", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-runtime-wrapper-"));
  const runtimeFile = writeRuntimeScript(dir);
  const { fakeCli, outputFile } = writeFakeClaudeCli(dir);
  const envMcpConfigFile = path.join(dir, "toolhub-mcp.json");
  const explicitMcpConfigFile = path.join(dir, "manual-mcp.json");

  execFileSync(process.execPath, [runtimeFile, "--mcp-config", explicitMcpConfigFile, "-p", "hi"], {
    env: {
      ...process.env,
      CCR_CLAUDE_CODE_MCP_CONFIG: envMcpConfigFile,
      CCR_CLAUDE_CODE_WRAPPER: "1",
      CCR_FAKE_CLAUDE_OUT: outputFile,
      CCR_REAL_CLAUDE_CODE_BIN: fakeCli,
      CCR_REMOTE_SYNC_ENABLED: "0"
    },
    stdio: "pipe"
  });

  const observed = JSON.parse(readFileSync(outputFile, "utf8"));
  assert.deepEqual(observed.argv, ["--mcp-config", explicitMcpConfigFile, "-p", "hi"]);
});

function writeRuntimeScript(dir) {
  const file = path.join(dir, "ccr-codex-cli-middleware.js");
  writeFileSync(file, codexCliMiddlewareRuntimeScript());
  chmodSync(file, 0o700);
  return file;
}

function writeFakeClaudeCli(dir) {
  const fakeCli = path.join(dir, "fake-claude");
  const outputFile = path.join(dir, "fake-claude-output.json");
  writeFileSync(fakeCli, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "fs.writeFileSync(process.env.CCR_FAKE_CLAUDE_OUT, JSON.stringify({",
    "  argv: process.argv.slice(2),",
    "  env: {",
    "    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || '',",
    "    CCR_CLAUDE_CODE_MODEL: process.env.CCR_CLAUDE_CODE_MODEL || '',",
    "    CCR_CLAUDE_CODE_MCP_CONFIG: process.env.CCR_CLAUDE_CODE_MCP_CONFIG || ''",
    "  }",
    "}));",
    ""
  ].join("\n"));
  chmodSync(fakeCli, 0o700);
  return { fakeCli, outputFile };
}
