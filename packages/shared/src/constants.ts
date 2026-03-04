import path from "node:path";
import os from "node:os";

export const HOME_DIR = path.join(os.homedir(), ".claude-code-router");

export const CONFIG_FILE = path.join(HOME_DIR, "config.json");

export const PLUGINS_DIR = path.join(HOME_DIR, "plugins");

export const PRESETS_DIR = path.join(HOME_DIR, "presets");

export const PID_FILE = path.join(HOME_DIR, '.claude-code-router.pid');

export const REFERENCE_COUNT_FILE = path.join(os.tmpdir(), "claude-code-reference-count.txt");

// Claude projects directory
export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");


export interface DefaultConfig {
  LOG: boolean;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
}

export const DEFAULT_CONFIG: DefaultConfig = {
  LOG: false,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_MODEL: "",
};


export const MODEL_TYPES = [{ name: 'Default Model', value: 'default' },
{ name: 'Background Model', value: 'background' },
{ name: 'Think Model', value: 'think' },
{ name: 'Long Context Model', value: 'longContext' },
{ name: 'Web Search Model', value: 'webSearch' },
{ name: 'Image Model', value: 'image' }]

export const MODEL_TYPE_VALUES = MODEL_TYPES.map(m => m.value);

// Route Group Commands
export const ROUTE_GROUP_COMMANDS = {
  title: "Route Group Commands",
  create: "ccr group create <name>     Create a new route group",
  list: "ccr group list              List all route groups",
  use: "ccr group use <name>        Switch to a route group",
  delete: "ccr group delete <name>     Delete a route group",
  edit: "ccr group edit <name>       Edit a route group",
  show: "ccr group show              Show current active route group"
} as const;