/**
 * Config Manager Interface
 *
 * Defines the contract for atomic configuration file operations.
 * Feature: External Model Configuration Wizard
 */

import { ProviderConfig, ConfigFile } from './provider-config.interface';

/**
 * Configuration Manager Interface
 *
 * Manages atomic read/write operations for ~/.claude-code-router/config.json
 */
export interface IConfigManager {
  /**
   * Add or update provider configuration atomically
   *
   * Implements atomic write pattern:
   * 1. Create backup of current config
   * 2. Read current config
   * 3. Modify in-memory (add or update provider by name)
   * 4. Write to temp file
   * 5. Atomic rename temp file to config.json
   *
   * @param provider - Provider configuration to add or update
   * @throws Error if file operations fail (ENOENT, EACCES, EISDIR)
   * @throws Error if config validation fails
   */
  upsertProvider(provider: ProviderConfig): Promise<void>;

  /**
   * Read current configuration file
   *
   * Reads and parses ~/.claude-code-router/config.json
   * Uses JSON5 parser (supports comments, trailing commas)
   * Performs environment variable interpolation
   *
   * @returns Parsed configuration object
   * @throws Error if file doesn't exist (ENOENT)
   * @throws Error if JSON parsing fails (invalid syntax)
   */
  readConfig(): Promise<ConfigFile>;

  /**
   * Create timestamped backup of current config file
   *
   * Creates backup at: ~/.claude-code-router/config.json.backup-{timestamp}
   * Keeps last 3 backups, deletes older backups
   *
   * @returns Path to created backup file
   * @throws Error if file operations fail
   */
  backupConfig(): Promise<string>;

  /**
   * Validate configuration structure
   *
   * Validates:
   * - Providers is an array
   * - Each provider has required fields (name, api_base_url, models)
   * - api_base_url is valid HTTPS URL
   * - models is non-empty array
   * - Provider names are unique
   *
   * @param config - Configuration object to validate
   * @returns true if valid
   * @throws Error with descriptive message if validation fails
   */
  validateConfig(config: ConfigFile): boolean;

  /**
   * Get path to configuration file
   *
   * @returns Absolute path to ~/.claude-code-router/config.json
   */
  getConfigPath(): string;

  /**
   * Ensure configuration directory exists
   *
   * Creates ~/.claude-code-router/ directory if it doesn't exist
   *
   * @throws Error if directory creation fails (EACCES)
   */
  ensureConfigDir(): Promise<void>;
}
