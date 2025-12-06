/**
 * ConfigManager - Atomic configuration file operations
 * Feature: 001-external-model-wizard
 *
 * Provides atomic read/write operations for config.json using:
 * - Temp file + atomic rename pattern
 * - Backup rotation (keep last 3)
 * - Configuration validation
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import JSON5 from 'json5';
import { ProviderConfig, ConfigFile } from '../types/wizard.types';

const HOME_DIR = path.join(os.homedir(), '.claude-code-router');
const DEFAULT_CONFIG_PATH = path.join(HOME_DIR, 'config.json');

/**
 * Interface for ConfigManager operations
 */
export interface IConfigManager {
  /**
   * Add or update provider configuration atomically
   * @param provider - Provider configuration to add/update
   * @throws Error if file operations fail
   */
  upsertProvider(provider: ProviderConfig): Promise<void>;

  /**
   * Read current configuration file
   * @returns Parsed configuration object
   * @throws Error if file doesn't exist or invalid JSON
   */
  readConfig(): Promise<ConfigFile>;

  /**
   * Create backup of current config file
   * @returns Path to backup file
   */
  backupConfig(): Promise<string>;

  /**
   * Validate configuration structure
   * @param config - Configuration object to validate
   * @returns true if valid, throws Error otherwise
   */
  validateConfig(config: ConfigFile): boolean;
}

/**
 * ConfigManager class implementing atomic config file operations
 */
export class ConfigManager implements IConfigManager {
  private configPath: string;

  constructor(configPath: string = DEFAULT_CONFIG_PATH) {
    this.configPath = configPath;
  }

  /**
   * Read and parse configuration file
   * Supports JSON5 format (comments, trailing commas, etc.)
   *
   * For invalid JSON, creates backup and returns default config
   */
  async readConfig(): Promise<ConfigFile> {
    try {
      console.log(`[ConfigManager] Reading config from: ${this.configPath}`);
      const configContent = await fs.readFile(this.configPath, 'utf-8');

      try {
        // Parse with JSON5 (supports JSON + comments + trailing commas)
        const config = JSON5.parse(configContent);
        console.log(`[ConfigManager] Config loaded successfully (${config.Providers?.length || 0} providers)`);
        return config as ConfigFile;
      } catch (parseError) {
        // T122: Invalid JSON - backup corrupt file and return default config
        console.warn(`Invalid JSON in config file. Creating backup...`);
        try {
          const configDir = path.dirname(this.configPath);
          const configFilename = path.basename(this.configPath);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupPath = path.join(configDir, `${configFilename}.corrupt-${timestamp}`);

          await fs.copyFile(this.configPath, backupPath);
          console.warn(`Corrupt config backed up to: ${backupPath}`);

          // Return default config instead of throwing
          return { Providers: [] };
        } catch (backupError) {
          // If backup fails, still throw the original parse error
          throw new Error(`Invalid JSON in config file: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Config file not found: ${this.configPath}`);
      }
      throw error;
    }
  }

  /**
   * Validate configuration structure and content
   * @throws Error with specific validation failure message
   */
  validateConfig(config: ConfigFile): boolean {
    // Validate Providers is an array
    if (!Array.isArray(config.Providers)) {
      throw new Error('Providers must be an array');
    }

    // Check for duplicate provider names
    const providerNames = config.Providers.map(p => p.name);
    const duplicates = providerNames.filter((name, index) => providerNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate provider name: ${duplicates[0]}`);
    }

    // Validate each provider
    for (const provider of config.Providers) {
      // Validate api_base_url is HTTPS
      if (!provider.api_base_url.startsWith('https://')) {
        throw new Error(`api_base_url must use HTTPS for provider: ${provider.name}`);
      }

      // Validate models array
      if (!Array.isArray(provider.models) || provider.models.length === 0) {
        throw new Error(`Provider ${provider.name} must have at least one model`);
      }
    }

    return true;
  }

  /**
   * Create timestamped backup of config file
   * Keeps only last 3 backups (deletes older ones)
   */
  async backupConfig(): Promise<string> {
    const configDir = path.dirname(this.configPath);
    const configFilename = path.basename(this.configPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(configDir, `${configFilename}.backup-${timestamp}`);

    // Create backup
    console.log(`[ConfigManager] Creating backup: ${backupPath}`);
    await fs.copyFile(this.configPath, backupPath);

    // Cleanup old backups (keep only last 3)
    await this.cleanupOldBackups(configDir, configFilename);

    return backupPath;
  }

  /**
   * Remove old backup files, keeping only the last 3
   */
  private async cleanupOldBackups(configDir: string, configFilename: string): Promise<void> {
    try {
      const files = await fs.readdir(configDir);
      const backupFiles = files
        .filter(f => f.startsWith(`${configFilename}.backup-`))
        .map(f => ({
          name: f,
          path: path.join(configDir, f),
        }));

      // Sort by filename (timestamp in name ensures chronological order)
      backupFiles.sort((a, b) => a.name.localeCompare(b.name));

      // Keep only last 3, delete older ones
      const filesToDelete = backupFiles.slice(0, Math.max(0, backupFiles.length - 3));
      if (filesToDelete.length > 0) {
        console.log(`[ConfigManager] Removing ${filesToDelete.length} old backup(s), keeping last 3`);
        for (const file of filesToDelete) {
          await fs.unlink(file.path);
        }
      }
    } catch (error) {
      // Don't fail if cleanup fails
      console.warn('Failed to cleanup old backups:', error);
    }
  }

  /**
   * Add or update provider configuration atomically
   * Uses temp file + rename pattern for atomicity
   */
  async upsertProvider(provider: ProviderConfig): Promise<void> {
    const tempPath = `${this.configPath}.tmp.${Date.now()}`;
    console.log(`[ConfigManager] Upserting provider: ${provider.name}`);

    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      try {
        await fs.access(configDir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // Create directory if it doesn't exist
          console.log(`[ConfigManager] Creating config directory: ${configDir}`);
          await fs.mkdir(configDir, { recursive: true });
        } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          throw new Error(`Permission denied: Cannot create config directory at ${configDir}`);
        } else {
          throw error;
        }
      }

      // Create backup before modification
      const configExists = await fs.access(this.configPath).then(() => true).catch(() => false);
      if (configExists) {
        await this.backupConfig();
      }

      // Read current config or create default if missing
      let config: ConfigFile;
      try {
        config = await this.readConfig();
      } catch (error) {
        if ((error as Error).message.includes('not found')) {
          // Create default config if missing
          config = { Providers: [] };
        } else {
          throw error;
        }
      }

      // Find and update or add provider
      const existingIndex = config.Providers.findIndex(p => p.name === provider.name);
      if (existingIndex >= 0) {
        // Update existing provider
        console.log(`[ConfigManager] Updating existing provider at index ${existingIndex}: ${provider.name}`);
        config.Providers[existingIndex] = provider;
      } else {
        // Add new provider
        console.log(`[ConfigManager] Adding new provider: ${provider.name}`);
        config.Providers.push(provider);
      }

      // Validate before writing
      this.validateConfig(config);
      console.log(`[ConfigManager] Config validation passed`);

      // Write to temp file
      const configContent = JSON.stringify(config, null, 2);
      console.log(`[ConfigManager] Writing to temp file: ${tempPath}`);
      await fs.writeFile(tempPath, configContent, 'utf-8');

      // Atomic rename (OS-level atomic operation)
      console.log(`[ConfigManager] Atomic rename: ${tempPath} → ${this.configPath}`);
      await fs.rename(tempPath, this.configPath);
      console.log(`[ConfigManager] Provider ${provider.name} saved successfully`);

    } catch (error) {
      // Cleanup temp file on error
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      // Re-throw with context
      if ((error as NodeJS.ErrnoException).code === 'EBUSY') {
        throw new Error(`Config file is in use. Please try again in a moment.`);
      } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw new Error(`Permission denied. Check ~/.claude-code-router/ permissions.`);
      } else {
        throw error;
      }
    }
  }
}

/**
 * Singleton instance for application-wide use
 */
export const configManager = new ConfigManager();
