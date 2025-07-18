import fs from "fs";
import { EventEmitter } from "events";
import { AppConfig } from "../types/config";
import { validateConfig } from "./configValidator";
import { log } from "./log";

export interface ConfigChangeEvent {
  oldConfig: AppConfig;
  newConfig: AppConfig;
  timestamp: Date;
}

export class ConfigWatcher extends EventEmitter {
  private configPath: string;
  private currentConfig: AppConfig;
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: any = null;
  private readonly debounceMs: number = 1000; // 1 second debounce

  constructor(configPath: string, initialConfig: AppConfig) {
    super();
    this.configPath = configPath;
    this.currentConfig = initialConfig;
  }

  start(): void {
    if (this.watcher) {
      log("Config watcher is already running");
      return;
    }

    try {
      this.watcher = fs.watchFile(this.configPath, { interval: 1000 }, () => {
        this.handleConfigChange();
      });
      
      log(`Started watching config file: ${this.configPath}`);
    } catch (error) {
      log("Failed to start config watcher:", error);
      this.emit('error', error);
    }
  }

  stop(): void {
    if (this.watcher) {
      fs.unwatchFile(this.configPath);
      this.watcher = null;
      log("Stopped config watcher");
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  getCurrentConfig(): AppConfig {
    return { ...this.currentConfig };
  }

  private handleConfigChange(): void {
    // Debounce rapid file changes
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.reloadConfig();
    }, this.debounceMs);
  }

  private async reloadConfig(): Promise<void> {
    try {
      // Check if file exists
      if (!fs.existsSync(this.configPath)) {
        log("Config file no longer exists:", this.configPath);
        return;
      }

      // Read and parse new config
      const configContent = fs.readFileSync(this.configPath, 'utf-8');
      const newConfig: AppConfig = JSON.parse(configContent);

      // Validate new config
      const validationResult = validateConfig(newConfig);
      
      if (!validationResult.isValid) {
        log("Config validation failed, keeping current configuration");
        this.emit('validationError', {
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          config: newConfig
        });
        return;
      }

      // Check if config actually changed
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
      
      if (validationResult.warnings.length > 0) {
        this.emit('configWarnings', validationResult.warnings);
      }

      this.emit('configChanged', changeEvent);

    } catch (error) {
      log("Failed to reload config:", error);
      this.emit('reloadError', error);
    }
  }

  private configsEqual(config1: AppConfig, config2: AppConfig): boolean {
    try {
      return JSON.stringify(config1) === JSON.stringify(config2);
    } catch {
      return false;
    }
  }

  // Manual reload method
  async forceReload(): Promise<boolean> {
    try {
      await this.reloadConfig();
      return true;
    } catch (error) {
      log("Force reload failed:", error);
      return false;
    }
  }

  // Get config diff for debugging
  getConfigDiff(oldConfig: AppConfig, newConfig: AppConfig): string[] {
    const changes: string[] = [];
    
    // Simple diff implementation
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
    
    // Check for changed values (simplified)
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