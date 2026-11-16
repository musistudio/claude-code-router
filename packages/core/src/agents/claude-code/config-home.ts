import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const CLAUDE_CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR";

// Claude Code's default config home is ~/.claude, but its global config file for that home is
// ~/.claude.json, outside the directory. CLAUDE_CONFIG_DIR=~/.claude is therefore not a no-op:
// Claude Code then reads ~/.claude/.claude.json instead, leaving the user's state in two files
// (Claude Code reports "Two Claude Code config files exist" once both are present).
export function isDefaultClaudeConfigDir(configDir: string, homeDir = os.homedir()): boolean {
  return path.resolve(configDir) === path.resolve(homeDir, ".claude");
}

// The CLAUDE_CONFIG_DIR a launcher should export for a profile's settings directory: none for the
// default home (Claude Code finds it on its own), the directory itself for any other home.
export function claudeCodeConfigDirEnv(settingsDir: string, homeDir = os.homedir()): Record<string, string> {
  return isDefaultClaudeConfigDir(settingsDir, homeDir) ? {} : { [CLAUDE_CONFIG_DIR_ENV]: settingsDir };
}

// The global config file Claude Code reads for a config home, as Claude Code resolves it: a legacy
// <home>/.config.json wins while it exists; otherwise ~/.claude.json for the default home and
// <home>/.claude.json for any other.
export function resolveClaudeCodeGlobalConfigFile(settingsDir: string, homeDir = os.homedir()): string {
  const legacyFile = path.join(settingsDir, ".config.json");
  if (existsSync(legacyFile)) {
    return legacyFile;
  }
  return isDefaultClaudeConfigDir(settingsDir, homeDir)
    ? path.join(homeDir, ".claude.json")
    : path.join(settingsDir, ".claude.json");
}
