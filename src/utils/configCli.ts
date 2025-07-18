import { promises as fs } from "fs";
import * as readline from "readline";
import { CONFIG_FILE, HOME_DIR } from "../constants";
import { AppConfig } from "../types/config";
import { ConfigManager, CONFIG_TEMPLATES, createConfigFromTemplate } from "./configManager";
import { validateConfig } from "./configValidator";
import { log } from "./log";

// Create readline interface
function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

// Ask question and return promise
function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createReadline();
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Confirm question
async function confirm(query: string): Promise<boolean> {
  const answer = await question(query);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

// Ensure directory exists
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

// Interactive configuration setup
export async function setupConfig(): Promise<void> {
  console.log("\n=== Claude Code Router Configuration Setup ===\n");
  
  // Check if config already exists
  try {
    await fs.access(CONFIG_FILE);
    const overwrite = await confirm("Configuration file already exists. Overwrite? (y/N): ");
    if (!overwrite) {
      console.log("Setup cancelled.");
      return;
    }
  } catch {
    // Config doesn't exist, continue
  }

  console.log("Available templates:");
  console.log("1. DeepSeek (Recommended for cost-effectiveness)");
  console.log("2. OpenRouter (Multiple model access)");
  console.log("3. Ollama (Local models)");
  console.log("4. Custom setup");

  const choice = await question("Choose a template (1-4): ");
  
  let config: AppConfig;
  
  switch (choice) {
    case '1':
      config = await setupDeepSeek();
      break;
    case '2':
      config = await setupOpenRouter();
      break;
    case '3':
      config = await setupOllama();
      break;
    case '4':
      config = await setupCustom();
      break;
    default:
      console.log("Invalid choice. Using DeepSeek template.");
      config = await setupDeepSeek();
  }

  // Validate configuration
  const validationResult = validateConfig(config);
  if (!validationResult.isValid) {
    console.error("Generated configuration is invalid:");
    validationResult.errors.forEach(error => {
      console.error(`  - ${error.field}: ${error.message}`);
    });
    return;
  }

  if (validationResult.warnings.length > 0) {
    console.warn("Configuration warnings:");
    validationResult.warnings.forEach(warning => {
      console.warn(`  - ${warning.field}: ${warning.message}`);
    });
  }

  // Save configuration
  await ensureDir(HOME_DIR);
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  
  console.log(`\n✅ Configuration saved to: ${CONFIG_FILE}`);
  console.log("🚀 You can now start the router with: ccr start");
}

async function setupDeepSeek(): Promise<AppConfig> {
  console.log("\n--- DeepSeek Configuration ---");
  const apiKey = await question("Enter your DeepSeek API key: ");
  
  const config = createConfigFromTemplate('deepseek', apiKey);
  
  const setupBackground = await confirm("Setup background model for lightweight tasks? (Y/n): ");
  if (!setupBackground) {
    delete config.Router?.background;
  }
  
  return config;
}

async function setupOpenRouter(): Promise<AppConfig> {
  console.log("\n--- OpenRouter Configuration ---");
  const apiKey = await question("Enter your OpenRouter API key: ");
  
  return createConfigFromTemplate('openrouter', apiKey);
}

async function setupOllama(): Promise<AppConfig> {
  console.log("\n--- Ollama Configuration ---");
  console.log("Make sure Ollama is running on http://localhost:11434");
  
  const customModel = await question("Enter model name (default: qwen2.5-coder:latest): ");
  const config = createConfigFromTemplate('ollama');
  
  if (customModel.trim()) {
    config.Providers![0].models = [customModel.trim()];
    config.Router!.default = `ollama,${customModel.trim()}`;
    if (config.Router!.background) {
      config.Router!.background = `ollama,${customModel.trim()}`;
    }
  }
  
  return config;
}

async function setupCustom(): Promise<AppConfig> {
  console.log("\n--- Custom Configuration ---");
  
  const name = await question("Provider name: ");
  const apiBaseUrl = await question("API base URL: ");
  const apiKey = await question("API key (leave empty if not required): ");
  const models = await question("Models (comma-separated): ");
  
  const modelList = models.split(',').map(m => m.trim()).filter(m => m);
  
  const config: AppConfig = {
    LOG: true,
    Providers: [{
      name,
      api_base_url: apiBaseUrl,
      api_key: apiKey || undefined,
      models: modelList
    }],
    Router: {
      default: `${name},${modelList[0]}`
    }
  };
  
  return config;
}

// Validate existing configuration
export async function validateExistingConfig(): Promise<void> {
  try {
    const configContent = await fs.readFile(CONFIG_FILE, 'utf-8');
    const config: AppConfig = JSON.parse(configContent);
    
    console.log("Validating configuration...\n");
    
    const validationResult = validateConfig(config);
    
    if (validationResult.isValid) {
      console.log("✅ Configuration is valid!");
    } else {
      console.log("❌ Configuration has errors:");
      validationResult.errors.forEach(error => {
        console.log(`  - ${error.field}: ${error.message}`);
      });
    }
    
    if (validationResult.warnings.length > 0) {
      console.log("\n⚠️  Configuration warnings:");
      validationResult.warnings.forEach(warning => {
        console.log(`  - ${warning.field}: ${warning.message}`);
      });
    }
    
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      console.log("❌ Configuration file not found. Run 'ccr setup' to create one.");
    } else {
      console.error("❌ Failed to validate configuration:", error);
    }
  }
}

// Show current configuration
export async function showConfig(): Promise<void> {
  try {
    const configContent = await fs.readFile(CONFIG_FILE, 'utf-8');
    const config: AppConfig = JSON.parse(configContent);
    
    console.log("Current configuration:\n");
    console.log(JSON.stringify(config, null, 2));
    
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      console.log("❌ Configuration file not found. Run 'ccr setup' to create one.");
    } else {
      console.error("❌ Failed to read configuration:", error);
    }
  }
}

// Test configuration hot reload
export async function testHotReload(): Promise<void> {
  try {
    const configContent = await fs.readFile(CONFIG_FILE, 'utf-8');
    const config: AppConfig = JSON.parse(configContent);
    
    const configManager = new ConfigManager(CONFIG_FILE, config);
    
    console.log("🔄 Starting configuration hot reload test...");
    console.log("📝 Edit your configuration file and save it to see hot reload in action.");
    console.log("⏹️  Press Ctrl+C to stop the test.\n");
    
    configManager.on('configChanged', (event) => {
      console.log(`\n🔄 Configuration changed at ${event.timestamp.toISOString()}`);
      
      const changes = configManager.getConfigDiff(event.oldConfig, event.newConfig);
      if (changes.length > 0) {
        console.log("Changes detected:");
        changes.forEach(change => console.log(`  - ${change}`));
      }
    });
    
    configManager.on('reloadError', (error) => {
      console.error("❌ Failed to reload configuration:", error);
    });
    
    configManager.startWatching();
    
    // Keep the process running
    process.on('SIGINT', () => {
      console.log("\n🛑 Stopping hot reload test...");
      configManager.stopWatching();
      process.exit(0);
    });
    
  } catch (error) {
    console.error("❌ Failed to start hot reload test:", error);
  }
}