import path from "node:path";
import os from "node:os";

export const HOME_DIR = path.join(os.homedir(), ".claude-code-router");

export const CONFIG_FILE = `${HOME_DIR}/config.json`;

export const PLUGINS_DIR = `${HOME_DIR}/plugins`;

export const PID_FILE = path.join(HOME_DIR, '.claude-code-router.pid');


export const DEFAULT_CONFIG = {
  log: false,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_MODEL: "",
};
