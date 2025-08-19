import fs from "node:fs/promises";
import readline from "node:readline";
import JSON5 from "json5";
import path from "node:path";
import {
  CONFIG_FILE,
  DEFAULT_CONFIG,
  HOME_DIR,
  PLUGINS_DIR,
} from "../constants";
import { cleanupLogFiles } from "./logCleanup";
import { keyStore } from "./keystore";

// Cache for keystore lookups to avoid repeated async calls
const keystoreCache: { [key: string]: string | null } = {};
const warningsShown = new Set<string>();
let keystoreCacheInitialized = false;

// Function to interpolate environment variables in config values
// PRIORITY: 1. Keystore (if explicitly set by user)
//           2. Environment variables (backward compatibility)
//           3. Keep original if neither exists
const interpolateEnvVars = async (obj: any): Promise<any> => {
  // Initialize keystore cache on first use
  if (!keystoreCacheInitialized) {
    keystoreCacheInitialized = true;
    // Pre-load all stored keys into cache to minimize async operations
    try {
      const providers = await keyStore.listProviders();
      for (const provider of providers) {
        const key = await keyStore.getKey(provider);
        if (key) {
          // Store with common patterns that users might use in config
          keystoreCache[`${provider.toUpperCase()}_API_KEY`] = key;
          keystoreCache[`${provider.toUpperCase()}_KEY`] = key;
          // Also store the exact provider name for direct lookups
          keystoreCache[provider.toUpperCase()] = key;
        }
      }
    } catch (e) {
      // Keystore not available, continue without it
    }
  }

  if (typeof obj === "string") {
    // Replace $VAR_NAME or ${VAR_NAME} with appropriate values
    return obj.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, braced, unbraced) => {
      const varName = braced || unbraced;
      
      // 1. Check keystore first (user's explicit configuration)
      if (keystoreCache[varName]) {
        // Warn if env var also exists (help users understand what's happening)
        if (process.env[varName] && !warningsShown.has(varName)) {
          warningsShown.add(varName);
          console.warn(
            `⚠️  Using stored API key for ${varName} from keystore.\n` +
            `   Environment variable ${varName} also exists but is being overridden.\n` +
            `   To use the environment variable instead, run: ccr config delete <provider>`
          );
        }
        return keystoreCache[varName]!;
      }
      
      // 2. Fall back to environment variable (backward compatibility)
      if (process.env[varName]) {
        return process.env[varName]!;
      }
      
      // 3. Keep original if neither exists
      return match;
    });
  } else if (Array.isArray(obj)) {
    return Promise.all(obj.map(interpolateEnvVars));
  } else if (obj !== null && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = await interpolateEnvVars(value);
    }
    return result;
  }
  return obj;
};

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
  await ensureDir(path.join(HOME_DIR, "logs"));
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

export const readConfigFile = async () => {
  try {
    const config = await fs.readFile(CONFIG_FILE, "utf-8");
    try {
      // Try to parse with JSON5 first (which also supports standard JSON)
      const parsedConfig = JSON5.parse(config);
      // Interpolate environment variables and keystore values in the parsed config
      return await interpolateEnvVars(parsedConfig);
    } catch (parseError) {
      console.error(`Failed to parse config file at ${CONFIG_FILE}`);
      console.error("Error details:", (parseError as Error).message);
      console.error("Please check your config file syntax.");
      process.exit(1);
    }
  } catch (readError: any) {
    if (readError.code === "ENOENT") {
      // Config file doesn't exist, prompt user for initial setup
      const name = await question("Enter Provider Name: ");
      const APIKEY = await question("Enter Provider API KEY: ");
      const baseUrl = await question("Enter Provider URL: ");
      const model = await question("Enter MODEL Name: ");
      const config = Object.assign({}, DEFAULT_CONFIG, {
        Providers: [
          {
            name,
            api_base_url: baseUrl,
            api_key: APIKEY,
            models: [model],
          },
        ],
        Router: {
          default: `${name},${model}`,
        },
      });
      await writeConfigFile(config);
      return config;
    } else {
      console.error(`Failed to read config file at ${CONFIG_FILE}`);
      console.error("Error details:", readError.message);
      process.exit(1);
    }
  }
};

export const backupConfigFile = async () => {
  try {
    if (await fs.access(CONFIG_FILE).then(() => true).catch(() => false)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${CONFIG_FILE}.${timestamp}.bak`;
      await fs.copyFile(CONFIG_FILE, backupPath);
      
      // Clean up old backups, keeping only the 3 most recent
      try {
        const configDir = path.dirname(CONFIG_FILE);
        const configFileName = path.basename(CONFIG_FILE);
        const files = await fs.readdir(configDir);
        
        // Find all backup files for this config
        const backupFiles = files
          .filter(file => file.startsWith(configFileName) && file.endsWith('.bak'))
          .sort()
          .reverse(); // Sort in descending order (newest first)
        
        // Delete all but the 3 most recent backups
        if (backupFiles.length > 3) {
          for (let i = 3; i < backupFiles.length; i++) {
            const oldBackupPath = path.join(configDir, backupFiles[i]);
            await fs.unlink(oldBackupPath);
          }
        }
      } catch (cleanupError) {
        console.warn("Failed to clean up old backups:", cleanupError);
      }
      
      return backupPath;
    }
  } catch (error) {
    console.error("Failed to backup config file:", error);
  }
  return null;
};

export const writeConfigFile = async (config: any) => {
  await ensureDir(HOME_DIR);
  const configWithComment = `${JSON.stringify(config, null, 2)}`;
  await fs.writeFile(CONFIG_FILE, configWithComment);
};

export const initConfig = async () => {
  const config = await readConfigFile();
  Object.assign(process.env, config);
  return config;
};

// 导出日志清理函数
export { cleanupLogFiles };

// 导出更新功能
export { checkForUpdates, performUpdate } from "./update";
