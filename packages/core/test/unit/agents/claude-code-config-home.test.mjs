import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claudeCodeConfigDirEnv,
  isDefaultClaudeConfigDir,
  resolveClaudeCodeGlobalConfigFile
} from "@ccr/core/agents/claude-code/config-home.ts";

function withHome(run) {
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-claude-config-home-"));
  try {
    return run(home);
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

test("the default Claude config home is ~/.claude, however it is spelled", () => {
  withHome((home) => {
    assert.equal(isDefaultClaudeConfigDir(path.join(home, ".claude"), home), true);
    assert.equal(isDefaultClaudeConfigDir(path.join(home, ".claude", "."), home), true);
    assert.equal(isDefaultClaudeConfigDir(path.join(home, ".claude-work"), home), false);
    assert.equal(isDefaultClaudeConfigDir(path.join(home, "profiles", "a", "claude"), home), false);
  });
});

test("launchers export CLAUDE_CONFIG_DIR only for a non-default config home", () => {
  withHome((home) => {
    assert.deepEqual(claudeCodeConfigDirEnv(path.join(home, ".claude"), home), {});
    const custom = path.join(home, "profiles", "a", "claude");
    assert.deepEqual(claudeCodeConfigDirEnv(custom, home), { CLAUDE_CONFIG_DIR: custom });
  });
});

test("the global config file of the default home is ~/.claude.json, not ~/.claude/.claude.json", () => {
  withHome((home) => {
    const defaultDir = path.join(home, ".claude");
    const custom = path.join(home, "profiles", "a", "claude");
    assert.equal(resolveClaudeCodeGlobalConfigFile(defaultDir, home), path.join(home, ".claude.json"));
    assert.equal(resolveClaudeCodeGlobalConfigFile(custom, home), path.join(custom, ".claude.json"));
  });
});

test("a legacy .config.json in the config home stays the global config file while it exists", () => {
  withHome((home) => {
    const defaultDir = path.join(home, ".claude");
    mkdirSync(defaultDir, { recursive: true });
    writeFileSync(path.join(defaultDir, ".config.json"), "{}\n");
    assert.equal(resolveClaudeCodeGlobalConfigFile(defaultDir, home), path.join(defaultDir, ".config.json"));
  });
});
