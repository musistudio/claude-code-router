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

export const readConfigFile = async () => {
  try {
    const config = await fs.readFile(CONFIG_FILE, "utf-8");
    try {
      // Try to parse with JSON5 first (which also supports standard JSON)
      return JSON5.parse(config);
    } catch (parseError) {
      console.error(`Failed to parse config file at ${CONFIG_FILE}`);
      console.error("Error details:", (parseError as Error).message);
      console.error("Please check your config file syntax.");
      process.exit(1);
    }
  } catch (readError: any) {
    if (readError.code === "ENOENT") {
      // Config file doesn't exist, prompt user for initial setup
      console.log("\n🚀 Welcome to Claude Code Router! Let's set up your configuration.");
      console.log("\nYou can choose between:");
      console.log("1. AutoRouter - Simple OpenAI-compatible API forwarding (recommended)");
      console.log("2. Legacy - Multiple provider support with complex routing");
      
      const useAutoRouter = await confirm("\nUse AutoRouter mode? (Y/n): ");
      
      if (useAutoRouter) {
        const endpoint = await question("Enter OpenAI-compatible API endpoint: ");
        const apiKey = await question("Enter API key: ");
        const secretKey = await question("Enter secret key for Claude CLI authentication: ");
        
        const config = {
          AutoRouter: {
            enabled: true,
            endpoint: endpoint,
            api_key: apiKey,
            timeout: 30000
          },
          APIKEY: secretKey,
          HOST: "0.0.0.0",
          PORT: 3456,
          API_TIMEOUT_MS: 600000
        };
        
        await writeConfigFile(config);
        console.log("\n✅ AutoRouter configuration saved!");
        return config;
      } else {
        // Legacy setup
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
        console.log("\n✅ Legacy configuration saved!");
        return config;
      }
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

const validateAutoRouterConfig = (config: any) => {
  if (!config.AutoRouter) {
    return { valid: false, error: "AutoRouter configuration missing" };
  }
  
  const { enabled, endpoint, api_key } = config.AutoRouter;
  
  if (enabled && !endpoint) {
    return { valid: false, error: "AutoRouter endpoint is required when enabled" };
  }
  
  if (enabled && !api_key) {
    return { valid: false, error: "AutoRouter API key is required when enabled" };
  }
  
  if (enabled && endpoint && !endpoint.startsWith('http')) {
    return { valid: false, error: "AutoRouter endpoint must be a valid HTTP(S) URL" };
  }
  
  return { valid: true };
};

export const initConfig = async () => {
  const config = await readConfigFile();
  
  // Validate AutoRouter configuration if present
  if (config.AutoRouter) {
    const validation = validateAutoRouterConfig(config);
    if (!validation.valid) {
      console.error(`❌ Configuration error: ${validation.error}`);
      console.error("Please check your configuration file at:", CONFIG_FILE);
      process.exit(1);
    }
  }
  
  Object.assign(process.env, config);
  return config;
};
