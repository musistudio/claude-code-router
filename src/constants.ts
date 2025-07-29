import path from "node:path";
import os from "node:os";

export const HOME_DIR = path.join(os.homedir(), ".claude-code-router");

export const CONFIG_FILE = path.join(HOME_DIR, "config.json");

export const PLUGINS_DIR = path.join(HOME_DIR, "plugins");

export const PID_FILE = path.join(HOME_DIR, '.claude-code-router.pid');

export const REFERENCE_COUNT_FILE = path.join(os.tmpdir(), "claude-code-reference-count.txt");


export const DEFAULT_CONFIG = {
  LOG: false,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_MODEL: "",
};


// 项目的相对路径
export const DEV_HOME_DIR = path.join(__dirname, "..", ".claude-code-router");
export const DEV_PID_FILE = path.join(DEV_HOME_DIR, ".claude-code-router.pid")
export const DEV_CONFIG_FILE = path.join(DEV_HOME_DIR, "config.json");
export const DEV_PLUGINS_DIR = path.join(DEV_HOME_DIR, "plugins");
export const DEV_REFERENCE_COUNT_FILE = path.join(DEV_HOME_DIR, "claude-code-reference-count.txt");


export function getConfigFile(): string {
  return process.env.NODE_ENV === 'development' ? DEV_CONFIG_FILE : CONFIG_FILE;
}
export function getPluginsDir(): string {
  return process.env.NODE_ENV === 'development' ? DEV_PLUGINS_DIR : PLUGINS_DIR;
}
export function getPidFile(): string {
  return process.env.NODE_ENV === 'development' ? DEV_PID_FILE : PID_FILE;
}
export function getReferenceCountFile(): string {
  return process.env.NODE_ENV === 'development' ? DEV_REFERENCE_COUNT_FILE : REFERENCE_COUNT_FILE;
}
export function getHomeDir(): string {
  return process.env.NODE_ENV === 'development' ? DEV_HOME_DIR : HOME_DIR;
}

export function isDevMode(): boolean {
  return process.env.NODE_ENV === 'development';
}