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

// Function to interpolate environment variables in config values
const interpolateEnvVars = (obj: any): any => {
  if (typeof obj === "string") {
    // Replace $VAR_NAME or ${VAR_NAME} with environment variable values
    return obj.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, braced, unbraced) => {
      const varName = braced || unbraced;
      return process.env[varName] || match; // Keep original if env var doesn't exist
    });
  } else if (Array.isArray(obj)) {
    return obj.map(interpolateEnvVars);
  } else if (obj !== null && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateEnvVars(value);
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
      // Interpolate environment variables in the parsed config
      return interpolateEnvVars(parsedConfig);
    } catch (parseError) {
      console.error(`Failed to parse config file at ${CONFIG_FILE}`);
      console.error("Error details:", (parseError as Error).message);
      console.error("Please check your config file syntax.");
      process.exit(1);
    }
  } catch (readError: any) {
    if (readError.code === "ENOENT") {
      // Config file doesn't exist, prompt user for initial setup
      try {
        // Initialize directories
        await initDir();

        // Backup existing config file if it exists
        const backupPath = await backupConfigFile();
        if (backupPath) {
          console.log(
              `Backed up existing configuration file to ${backupPath}`
          );
        }
        const config = {
          PORT: 3456,
          Providers: [],
          Router: {},
        }
        // Create a minimal default config file
        await writeConfigFile(config);
        console.log(
            "Created minimal default configuration file at ~/.claude-code-router/config.json"
        );
        console.log(
            "Please edit this file with your actual configuration."
        );
        return config
      } catch (error: any) {
        console.error(
            "Failed to create default configuration:",
            error.message
        );
        process.exit(1);
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

export const initConfig = async () => {
  const config = await readConfigFile();
  Object.assign(process.env, config);

  // Vertex Gemini support: allow specifying service account credentials via config
  // Accepted shapes:
  // 1) Top-level keys: VERTEX_GEMINI_KEY_FILE, VERTEX_GEMINI_PROJECT, VERTEX_GEMINI_LOCATION
  // 2) Nested object: vertexGemini: { keyFile?: string; keyJson?: object|string; project?: string; location?: string }
  // 3) Provider-specific: providers[].vertexAuth: { keyFile?: string; keyJson?: object|string; project?: string; location?: string }
  // If keyJson is provided we persist it to ~/.claude-code-router/vertex-key.json and point GOOGLE_APPLICATION_CREDENTIALS to it.
  try {
    const vg = (config as any).vertexGemini || {};
    const keyFile = (config as any).VERTEX_GEMINI_KEY_FILE || vg.keyFile;
    const keyJson = vg.keyJson || (config as any).VERTEX_GEMINI_KEY_JSON;
    const project = (config as any).VERTEX_GEMINI_PROJECT || vg.project;
    const location = (config as any).VERTEX_GEMINI_LOCATION || vg.location;

    // Also check for provider-specific vertex auth configurations
    let providerVertexAuth: any = null;
    if ((config as any).Providers && Array.isArray((config as any).Providers)) {
      for (const provider of (config as any).Providers) {
        if (provider.vertexAuth && provider.transformer?.use?.some((t: any) => 
          (typeof t === 'string' && t === 'vertex-gemini') ||
          (Array.isArray(t) && t[0] === 'vertex-gemini')
        )) {
          providerVertexAuth = provider.vertexAuth;
          break; // Use the first vertex provider found
        }
      }
    }

    // Merge global and provider-specific configurations (provider takes precedence)
    const finalKeyFile = providerVertexAuth?.keyFile || keyFile;
    const finalKeyJson = providerVertexAuth?.keyJson || keyJson;
    const finalProject = providerVertexAuth?.project || project;
    const finalLocation = providerVertexAuth?.location || location;

    let resolvedProject = finalProject;

    if (finalKeyJson && !finalKeyFile) {
      // Persist inline JSON to file
      const targetPath = path.join(HOME_DIR, 'vertex-gemini-key.json');
      const serialized = typeof finalKeyJson === 'string' ? finalKeyJson : JSON.stringify(finalKeyJson, null, 2);
      await fs.writeFile(targetPath, serialized, { encoding: 'utf-8' });
      process.env.GOOGLE_APPLICATION_CREDENTIALS = targetPath;
      
      // Extract project_id from the service account JSON if not explicitly provided
      if (!resolvedProject) {
        try {
          const credentials = typeof finalKeyJson === 'string' ? JSON.parse(finalKeyJson) : finalKeyJson;
          if (credentials && credentials.project_id) {
            resolvedProject = credentials.project_id;
          }
        } catch (e) {
          console.warn('Failed to parse service account JSON for project_id:', (e as Error).message);
        }
      }
    } else if (finalKeyFile) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = finalKeyFile;
      
      // Extract project_id from the service account file if not explicitly provided
      if (!resolvedProject) {
        try {
          const credentialsContent = await fs.readFile(finalKeyFile, 'utf-8');
          const credentials = JSON.parse(credentialsContent);
          if (credentials && credentials.project_id) {
            resolvedProject = credentials.project_id;
          }
        } catch (e) {
          console.warn('Failed to read service account file for project_id:', (e as Error).message);
        }
      }
    }
    
    // Set both GOOGLE_CLOUD_PROJECT (for vertex transformer) and VERTEX_GEMINI_PROJECT (legacy)
    if (resolvedProject) {
      process.env.GOOGLE_CLOUD_PROJECT = resolvedProject;
      process.env.VERTEX_GEMINI_PROJECT = resolvedProject;
    }
    if (finalLocation) process.env.VERTEX_GEMINI_LOCATION = finalLocation;
  } catch (e) {
    console.warn('Failed to initialize vertex gemini credentials:', (e as Error).message);
  }
  return config;
};

// 导出日志清理函数
export { cleanupLogFiles };

// 导出更新功能
export { checkForUpdates, performUpdate } from "./update";
