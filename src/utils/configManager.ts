import { promises as fs } from "fs";
import { watch } from "fs";
import { EventEmitter } from "events";
import { AppConfig, ValidationResult } from "../types/config";
import { validateConfig } from "./configValidator";
import { log } from "./log";

export interface ConfigChangeEvent {
  oldConfig: AppConfig;
  newConfig: AppConfig;
  timestamp: Date;
}

export class ConfigManager extends EventEmitter {
  private configPath: string;
  private currentConfig: AppConfig;
  private watcher: any = null;
  private debounceTimer: any = null;
  private readonly debounceMs: number = 1000;

  constructor(configPath: string, initialConfig: AppConfig) {
    super();
    this.configPath = configPath;
    this.currentConfig = initialConfig;
  }

  // Start watching for config changes
  startWatching(): void {
    if (this.watcher) {
      log("Config watcher is already running");
      return;
    }

    try {
      this.watcher = watch(this.configPath, (eventType) => {
        if (eventType === 'change') {
          this.handleConfigChange();
        }
      });
      
      log(`Started watching config file: ${this.configPath}`);
    } catch (error) {
      log("Failed to start config watcher:", error);
      this.emit('error', error);
    }
  }

  // Stop watching
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      log("Stopped config watcher");
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  // Get current config
  getCurrentConfig(): AppConfig {
    return { ...this.currentConfig };
  }

  // Validate and load config from file
  async loadConfig(): Promise<AppConfig> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const config: AppConfig = JSON.parse(configContent);
      
      const validationResult = validateConfig(config);
      
      if (!validationResult.isValid) {
        log("Configuration validation failed:");
        validationResult.errors.forEach(error => {
          log(`  - ${error.field}: ${error.message}`);
        });
        throw new Error("Invalid configuration");
      }

      if (validationResult.warnings.length > 0) {
        log("Configuration warnings:");
        validationResult.warnings.forEach(warning => {
          log(`  - ${warning.field}: ${warning.message}`);
        });
      }

      return config;
    } catch (error) {
      log("Failed to load config:", error);
      throw error;
    }
  }

  // Save config to file
  async saveConfig(config: AppConfig): Promise<void> {
    try {
      // Validate before saving
      const validationResult = validateConfig(config);
      if (!validationResult.isValid) {
        throw new Error("Cannot save invalid configuration");
      }

      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
      this.currentConfig = config;
      log("Configuration saved successfully");
    } catch (error) {
      log("Failed to save config:", error);
      throw error;
    }
  }

  // Handle config file changes
  private handleConfigChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.reloadConfig();
    }, this.debounceMs);
  }

  // Reload config from file
  private async reloadConfig(): Promise<void> {
    try {
      const newConfig = await this.loadConfig();
      
      if (this.configsEqual(this.currentConfig, newConfig)) {
        log("Config file changed but content is the same");
        return;
      }

      const oldConfig = { ...this.currentConfig };
      this.currentConfig = newConfig;

      const changeEvent: ConfigChangeEvent = {
        oldConfig,
        newConfig,
        timestamp: new Date()
      };

      log("Configuration reloaded successfully");
      this.emit('configChanged', changeEvent);

    } catch (error) {
      log("Failed to reload config:", error);
      this.emit('reloadError', error);
    }
  }

  // Compare configs for equality
  private configsEqual(config1: AppConfig, config2: AppConfig): boolean {
    try {
      return JSON.stringify(config1) === JSON.stringify(config2);
    } catch {
      return false;
    }
  }

  // Force reload config
  async forceReload(): Promise<boolean> {
    try {
      await this.reloadConfig();
      return true;
    } catch (error) {
      log("Force reload failed:", error);
      return false;
    }
  }

  // Get config differences
  getConfigDiff(oldConfig: AppConfig, newConfig: AppConfig): string[] {
    const changes: string[] = [];
    
    const oldKeys = Object.keys(oldConfig);
    const newKeys = Object.keys(newConfig);
    
    // Check for added keys
    newKeys.forEach(key => {
      if (!oldKeys.includes(key)) {
        changes.push(`Added: ${key}`);
      }
    });
    
    // Check for removed keys
    oldKeys.forEach(key => {
      if (!newKeys.includes(key)) {
        changes.push(`Removed: ${key}`);
      }
    });
    
    // Check for changed values
    oldKeys.forEach(key => {
      if (newKeys.includes(key)) {
        const oldValue = JSON.stringify((oldConfig as any)[key]);
        const newValue = JSON.stringify((newConfig as any)[key]);
        if (oldValue !== newValue) {
          changes.push(`Changed: ${key}`);
        }
      }
    });
    
    return changes;
  }
}

// Configuration templates for easy setup
export const CONFIG_TEMPLATES = {
  deepseek: (apiKey: string) => ({
    LOG: true,
    Providers: [{
      name: "deepseek",
      api_base_url: "https://api.deepseek.com/chat/completions",
      api_key: apiKey,
      models: ["deepseek-chat", "deepseek-reasoner"],
      transformer: {
        use: ["deepseek"],
        "deepseek-chat": {
          use: ["tooluse"]
        }
      }
    }],
    Router: {
      default: "deepseek,deepseek-chat",
      think: "deepseek,deepseek-reasoner"
    }
  }),
  
  openrouter: (apiKey: string) => ({
    LOG: true,
    Providers: [{
      name: "openrouter",
      api_base_url: "https://openrouter.ai/api/v1/chat/completions",
      api_key: apiKey,
      models: [
        "google/gemini-2.5-pro-preview",
        "anthropic/claude-3.5-sonnet"
      ],
      transformer: {
        use: ["openrouter"]
      }
    }],
    Router: {
      default: "openrouter,anthropic/claude-3.5-sonnet",
      longContext: "openrouter,google/gemini-2.5-pro-preview"
    }
  }),
  
  ollama: () => ({
    LOG: true,
    Providers: [{
      name: "ollama",
      api_base_url: "http://localhost:11434/v1/chat/completions",
      api_key: "ollama",
      models: ["qwen2.5-coder:latest"]
    }],
    Router: {
      default: "ollama,qwen2.5-coder:latest",
      background: "ollama,qwen2.5-coder:latest"
    }
  })
};

// Helper function to create config from template
export function createConfigFromTemplate(
  templateName: keyof typeof CONFIG_TEMPLATES, 
  apiKey?: string
): AppConfig {
  const template = CONFIG_TEMPLATES[templateName];
  if (!template) {
    throw new Error(`Unknown template: ${templateName}`);
  }
  
  if (templateName !== 'ollama' && !apiKey) {
    throw new Error(`API key is required for ${templateName} template`);
  }
  
  return template(apiKey || '') as AppConfig;
}