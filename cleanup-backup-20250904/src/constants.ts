import { join } from "path";
import { homedir } from "os";

export const HOME_DIR = join(homedir(), ".claude-code-router");

export const CONFIG_FILE = process.env.CCR_CONFIG_PATH || join(HOME_DIR, "config.json");

export const PLUGINS_DIR = join(HOME_DIR, "plugins");

export const PID_FILE = join(HOME_DIR, '.claude-code-router.pid');

export const REFERENCE_COUNT_FILE = join(require('os').tmpdir(), "claude-code-reference-count.txt");


export const DEFAULT_CONFIG = {
  LOG: false,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_MODEL: "",
};
