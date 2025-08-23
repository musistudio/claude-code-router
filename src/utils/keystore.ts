import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { HOME_DIR } from "../constants";

/**
 * Interface for secure key storage backends.
 * This abstraction allows for different implementations (file-based, OS keychain, etc.)
 */
export interface KeyStore {
  setKey(provider: string, key: string): Promise<void>;
  getKey(provider: string): Promise<string | null>;
  deleteKey(provider: string): Promise<void>;
  listProviders(): Promise<string[]>;
  isAvailable(): boolean;
  getStorageType(): string;
}

const KEYS_FILE = path.join(HOME_DIR, "keys");

/**
 * File-based key storage implementation.
 * 
 * Follows the standard Unix approach used by SSH, AWS CLI, npm, Docker, etc:
 * - Stores keys in plaintext JSON in ~/.claude-code-router/keys
 * - Protects the file with restrictive permissions (0600)
 * - Relies on OS file permissions as the security boundary
 * 
 * Security model: "If someone can read your home directory files, you're already compromised"
 * This is the same model used by ~/.ssh/id_rsa, ~/.aws/credentials, ~/.npmrc, etc.
 */
class FileKeyStore implements KeyStore {
  isAvailable(): boolean {
    return true; // Always available
  }

  getStorageType(): string {
    return "Protected File Storage (~/.claude-code-router/keys)";
  }

  private async loadKeys(): Promise<Record<string, string>> {
    try {
      const data = await fs.readFile(KEYS_FILE, "utf8");
      return JSON.parse(data);
    } catch (e) {
      // File doesn't exist or is invalid JSON, return empty object
      return {};
    }
  }

  private async saveKeys(keys: Record<string, string>): Promise<void> {
    const data = JSON.stringify(keys, null, 2);
    
    // Ensure the directory exists
    await fs.mkdir(path.dirname(KEYS_FILE), { recursive: true });
    
    // Write the file with restrictive permissions
    await fs.writeFile(KEYS_FILE, data, { mode: 0o600 });
    
    // Double-check permissions (some systems might not respect the mode option)
    try {
      await fs.chmod(KEYS_FILE, 0o600);
    } catch {
      // Ignore chmod errors on systems that don't support it
    }
  }

  async setKey(provider: string, key: string): Promise<void> {
    const keys = await this.loadKeys();
    keys[provider] = key;
    await this.saveKeys(keys);
  }

  async getKey(provider: string): Promise<string | null> {
    const keys = await this.loadKeys();
    return keys[provider] || null;
  }

  async deleteKey(provider: string): Promise<void> {
    const keys = await this.loadKeys();
    delete keys[provider];
    await this.saveKeys(keys);
  }

  async listProviders(): Promise<string[]> {
    const keys = await this.loadKeys();
    return Object.keys(keys);
  }
}

/**
 * Main key store manager that selects the appropriate backend.
 * Currently uses file-based storage following Unix conventions.
 * Future PR will add native OS keychain support as an alternative.
 */
export class SecureKeyStore {
  private store: KeyStore;

  constructor() {
    // For now, we only have the file-based backend
    // Future PR will add logic here to select native keychain if available
    this.store = new FileKeyStore();
  }

  async setKey(provider: string, key: string): Promise<void> {
    return this.store.setKey(provider, key);
  }

  async getKey(provider: string): Promise<string | null> {
    return this.store.getKey(provider);
  }

  async deleteKey(provider: string): Promise<void> {
    return this.store.deleteKey(provider);
  }

  async listProviders(): Promise<string[]> {
    return this.store.listProviders();
  }

  isAvailable(): boolean {
    return this.store.isAvailable();
  }

  getStorageType(): string {
    return this.store.getStorageType();
  }

  // Helper method to mask API keys for display
  maskKey(key: string): string {
    if (!key || key.length < 8) return "****";
    return "*".repeat(key.length - 4) + key.slice(-4);
  }

  // Helper method to validate API key format
  validateKey(key: string): boolean {
    // Basic validation - at least 10 characters
    return key && key.length >= 10;
  }
}

// Export singleton instance
export const keyStore = new SecureKeyStore();