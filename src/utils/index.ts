import { promises as fs } from "fs";
import * as readline from "readline";
import {
  CONFIG_FILE,
  DEFAULT_CONFIG,
  HOME_DIR,
  PLUGINS_DIR,
} from "../constants";
import { AppConfig } from "../types/config";
import { validateConfig } from "./configValidator";
import { ConfigWatcher, ConfigChangeEvent } from "./configWatcher";
import { log } from "./log";

const ensureDir = async (dir_path: string) => {
  try {
    await fs.access(dir_path);
  } catch {
    await fs.mkdir(dir_path, { recursive: true });
  }
};

export const initDir = async () => {
  await ensureDir(HOME_DIR);
  await ensureDir(PLUGINS_DIR);
};

const createReadline = () => {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
};

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    const rl = createReadline();
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

const confirm = async (query: string): Promise<boolean> => {
  const answer = await question(query);
  return answer.toLowerCase() !== "n";
};

// Configuration backup functionality
export const backupConfig = async (config: AppConfig, reason: string = "manual"): Promise<string> => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${CONFIG_FILE}.backup.${timestamp}.${reason}`;

  try {
    await fs.writeFile(backupPath, JSON.stringify(config, null, 2));
    log(`Configuration backed up to: ${backupPath}`);
    return backupPath;
  } catch (error) {
    log("Failed to backup configuration:", error);
    throw error;
  }
};

// Enhanced config reading with validation
export const readConfigFile = async (): Promise<AppConfig> => {
  try {
    const configContent = await fs.readFile(CONFIG_FILE, "utf-8");
    const config: AppConfig = JSON.parse(configContent);

    // Validate configuration
    const validationResult = validateConfig(config);

    if (!validationResult.isValid) {
      log("Configuration validation failed:");
      validationResult.errors.forEach(error => {
        log(`  Error - ${error.field}: ${error.message}`);
      });

      // Ask user if they want to continue with invalid config
      const continueWithInvalid = await confirm(
        "Configuration has validation errors. Continue anyway? (y/N): "
      );

      if (!continueWithInvalid) {
        throw new Error("Configuration validation failed");
      }
    }

    if (validationResult.warnings.length > 0) {
      log("Configuration warnings:");
      validationResult.warnings.forEach(warning => {
        log(`  Warning - ${warning.field}: ${warning.message}`);
      });
    }

    return config;
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      log("Configuration file not found, creating interactive setup...");
      return await createInteractiveConfig();
    }

    if (error instanceof SyntaxError) {
      log("Configuration file has invalid JSON syntax");
      const fixConfig = await confirm("Would you like to recreate the configuration? (y/N): ");
      if (fixConfig) {
        return await createInteractiveConfig();
      }
    }

    throw error;
  }
};

// Interactive configuration creation
const createInteractiveConfig = async (): Promise<AppConfig> => {
  console.log("\n=== Claude Code Router Configuration Setup ===\n");

  const name = await question("Enter Provider Name (e.g., deepseek, openrouter): ");
  const apiKey = await question("Enter Provider API KEY: ");
  const baseUrl = await question("Enter Provider URL: ");
  const model = await question("Enter MODEL Name: ");

  const enableLogging = await confirm("Enable logging? (Y/n): ");
  const setupBackground = await confirm("Setup background model for lightweight tasks? (Y/n): ");

  let backgroundModel = "";
  if (setupBackground) {
    backgroundModel = await question("Enter background model (provider,model): ");
  }

  const config: AppConfig = {
    ...DEFAULT_CONFIG,
    LOG: enableLogging,
    Providers: [
      {
        name,
        api_base_url: baseUrl,
        api_key: apiKey,
        models: [model],
      },
    ],
    Router: {
      default: `${name},${model}`,
      ...(backgroundModel && { background: backgroundModel }),
    },
  };

  // Validate the created config
  const validationResult = validateConfig(config);
  if (!validationResult.isValid) {
    log("Generated configuration is invalid:");
    validationResult.errors.forEach(error => {
      log(`  - ${error.field}: ${error.message}`);
    });
    throw new Error("Failed to create valid configuration");
  }

  await writeConfigFile(config);
  log("Configuration created successfully!");

  return config;
};

export const writeConfigFile = async (config: AppConfig) => {
  await ensureDir(HOME_DIR);

  // Backup existing config before writing
  try {
    const existingConfig = await readConfigFile();
    await backupConfig(existingConfig, "auto-before-write");
  } catch {
    // No existing config to backup
  }

  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  log("Configuration file updated");
};

// Global config watcher instance
let globalConfigWatcher: ConfigWatcher | null = null;

// Initialize configuration with hot reload support
export const initConfig = async (enableHotReload: boolean = true): Promise<AppConfig> => {
  const config = await readConfigFile();
  Object.assign(process.env, config);

  if (enableHotReload && !globalConfigWatcher) {
    globalConfigWatcher = new ConfigWatcher(CONFIG_FILE, config);

    // Set up event handlers
    globalConfigWatcher.on('configChanged', (event: ConfigChangeEvent) => {
      log("Configuration changed, updating environment variables");
      Object.assign(process.env, event.newConfig);

      const changes = globalConfigWatcher!.getConfigDiff(event.oldConfig, event.newConfig);
      if (changes.length > 0) {
        log("Configuration changes detected:");
        changes.forEach(change => log(`  - ${change}`));
      }
    });

    globalConfigWatcher.on('validationError', (event) => {
      log("Configuration validation failed during hot reload:");
      event.errors.forEach(error => {
        log(`  Error - ${error.field}: ${error.message}`);
      });
    });

    globalConfigWatcher.on('configWarnings', (warnings) => {
      log("Configuration warnings during hot reload:");
      warnings.forEach(warning => {
        log(`  Warning - ${warning.field}: ${warning.message}`);
      });
    });

    globalConfigWatcher.on('reloadError', (error) => {
      log("Failed to reload configuration:", error);
    });

    globalConfigWatcher.on('error', (error) => {
      log("Config watcher error:", error);
    });

    globalConfigWatcher.start();
    log("Configuration hot reload enabled");
  }

  return config;
};

// Get current configuration (useful for hot reload scenarios)
export const getCurrentConfig = (): AppConfig | null => {
  return globalConfigWatcher?.getCurrentConfig() || null;
};

// Force reload configuration
export const reloadConfig = async (): Promise<boolean> => {
  if (globalConfigWatcher) {
    return await globalConfigWatcher.forceReload();
  }
  return false;
};

// Stop config watcher (cleanup)
export const stopConfigWatcher = (): void => {
  if (globalConfigWatcher) {
    globalConfigWatcher.stop();
    globalConfigWatcher = null;
    log("Configuration watcher stopped");
  }
};

// Configuration templates for common providers
export const CONFIG_TEMPLATES = {
  deepseek: {
    name: "deepseek",
    api_base_url: "https://api.deepseek.com/chat/completions",
    models: ["deepseek-chat", "deepseek-reasoner"],
    transformer: {
      use: ["deepseek"],
      "deepseek-chat": {
        use: ["tooluse"]
      }
    }
  },
  openrouter: {
    name: "openrouter",
    api_base_url: "https://openrouter.ai/api/v1/chat/completions",
    models: [
      "google/gemini-2.5-pro-preview",
      "anthropic/claude-sonnet-4",
      "anthropic/claude-3.5-sonnet"
    ],
    transformer: {
      use: ["openrouter"]
    }
  },
  ollama: {
    name: "ollama",
    api_base_url: "http://localhost:11434/v1/chat/completions",
    api_key: "ollama",
    models: ["qwen2.5-coder:latest"]
  },
  gemini: {
    name: "gemini",
    api_base_url: "https://generativelanguage.googleapis.com/v1beta/models/",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    transformer: {
      use: ["gemini"]
    }
  }
};

// Helper function to create config from template
export const createConfigFromTemplate = (templateName: keyof typeof CONFIG_TEMPLATES, apiKey: string): AppConfig => {
  const template = CONFIG_TEMPLATES[templateName];
  if (!template) {
    throw new Error(`Unknown template: ${templateName}`);
  }

  const provider = {
    ...template,
    api_key: apiKey
  };

  return {
    LOG: true,
    Providers: [provider],
    Router: {
      default: `${provider.name},${provider.models[0]}`
    }
  };
};