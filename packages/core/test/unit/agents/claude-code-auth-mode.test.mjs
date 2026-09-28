import assert from "node:assert/strict";
import childProcess from "node:child_process";
import test from "node:test";
import { resolveClaudeCodeGatewayAuthMode } from "@ccr/core/agents/claude-code/auth-mode.ts";

test("#1779 auto auth does not infer working federation from a CLI version", (t) => {
  const probe = t.mock.method(childProcess, "spawnSync", () => ({ stdout: "2.1.235 (Claude Code)", status: 0 }));
  assert.equal(resolveClaudeCodeGatewayAuthMode({ env: { CCR_CLAUDE_CODE_AUTH_MODE: "auto" } }), "api-key-helper");
  assert.equal(probe.mock.callCount(), 0);
});

test("#1779 explicit federation and helper preferences remain available", () => {
  for (const mode of ["wif", "api-key-helper"]) {
    assert.equal(resolveClaudeCodeGatewayAuthMode({ env: { CCR_CLAUDE_CODE_AUTH_MODE: mode } }), mode);
  }
});
