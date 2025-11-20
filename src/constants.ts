import path from "node:path";
import os from "node:os";

export const HOME_DIR = process.env.CLAUDE_CODE_ROUTER_DIR
  ? path.resolve(process.env.CLAUDE_CODE_ROUTER_DIR)
  : path.join(os.homedir(), ".claude-code-router");

export const CONFIG_FILE = path.join(HOME_DIR, "config.json");

export const PLUGINS_DIR = path.join(HOME_DIR, "plugins");

export const PID_FILE = path.join(HOME_DIR, '.claude-code-router.pid');

export const REFERENCE_COUNT_FILE = path.join(os.tmpdir(), "claude-code-reference-count.txt");

// Claude projects directory
export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");


export const DEFAULT_CONFIG = {
  LOG: false,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_MODEL: "",
};
