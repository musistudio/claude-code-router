import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export interface VaultConfig {
  vaultPath: string;
  masterPasswordEnv?: string;
}

interface VaultData {
  version: number;
  salt: string;
  iv: string;
  tag: string;
  encrypted: string;
  secrets: Record<string, string>;
}

const VAULT_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;

export class VaultManager {
  private vaultPath: string;
  private masterKey: Buffer | null = null;
  private currentSalt: string = '';
  private secrets: Map<string, string> = new Map();
  private dirty = false;
  private logger?: any;

  constructor(config: Partial<VaultConfig> = {}, logger?: any) {
    this.logger = logger;
    const vaultDir = join(homedir(), '.ccr');
    this.vaultPath = config.vaultPath || join(vaultDir, 'vault.enc');

    if (!existsSync(vaultDir)) {
      mkdirSync(vaultDir, { recursive: true });
    }

    const gitignorePath = join(vaultDir, '.gitignore');
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, '*.enc\n*.key\n');
    }
  }

  async initialize(masterPassword: string): Promise<void> {
    if (!masterPassword || masterPassword.length < 8) {
      throw new Error('Master password must be at least 8 characters');
    }

    if (existsSync(this.vaultPath)) {
      await this.load(masterPassword);
    } else {
      this.currentSalt = randomBytes(SALT_LENGTH).toString('hex');
      this.masterKey = this.deriveKey(masterPassword, this.currentSalt);
      this.secrets = new Map();
      this.dirty = true;
      await this.save();
      this.logger?.info('VaultManager: Created new vault');
    }
  }

  async initializeFromEnv(envVar: string = 'VAULT_PASSWORD'): Promise<void> {
    const password = process.env[envVar];
    if (!password) {
      throw new Error(`Environment variable ${envVar} not set`);
    }
    await this.initialize(password);
  }

  async getSecret(key: string): Promise<string | null> {
    const value = this.secrets.get(key);
    if (value !== undefined) {
      return value;
    }

    const envValue = this.getEnvFallback(key);
    if (envValue) {
      return envValue;
    }

    return null;
  }

  async setSecret(key: string, value: string): Promise<void> {
    if (!this.masterKey) {
      throw new Error('Vault not initialized');
    }
    this.secrets.set(key, value);
    this.dirty = true;
    await this.save();
  }

  async deleteSecret(key: string): Promise<boolean> {
    if (!this.secrets.has(key)) {
      return false;
    }
    this.secrets.delete(key);
    this.dirty = true;
    await this.save();
    return true;
  }

  async listKeys(): Promise<string[]> {
    return Array.from(this.secrets.keys());
  }

  async rotateMasterPassword(oldPassword: string, newPassword: string): Promise<void> {
    if (!this.masterKey) {
      throw new Error('Vault not initialized');
    }

    const testKey = this.deriveKey(oldPassword, '');
    const allSecrets = new Map(this.secrets);

    this.masterKey = this.deriveKey(newPassword, randomBytes(SALT_LENGTH).toString('hex'));
    this.secrets = allSecrets;
    this.dirty = true;
    await this.save();
    this.logger?.info('VaultManager: Master password rotated');
  }

  async loadProviderKeys(providerConfig: Array<{ name: string; apiKey: string }>): Promise<Map<string, string>> {
    const resolvedKeys = new Map<string, string>();

    for (const provider of providerConfig) {
      const vaultKey = `${provider.name.toUpperCase()}_API_KEY`;
      let apiKey = await this.getSecret(vaultKey);

      if (!apiKey && provider.apiKey) {
        if (!provider.apiKey.startsWith('${')) {
          apiKey = provider.apiKey;
        } else {
          const envName = provider.apiKey.slice(2, -1);
          apiKey = process.env[envName] || '';
        }
      }

      if (apiKey) {
        resolvedKeys.set(provider.name, apiKey);
      }
    }

    return resolvedKeys;
  }

  private getEnvFallback(key: string): string | null {
    const envMap: Record<string, string> = {
      'OPENAI_API_KEY': 'OPENAI_API_KEY',
      'DEEPSEEK_API_KEY': 'DEEPSEEK_API_KEY',
      'GEMINI_API_KEY': 'GEMINI_API_KEY',
      'GOOGLE_API_KEY': 'GOOGLE_API_KEY',
      'GLM_API_KEY': 'GLM_API_KEY',
    };
    return process.env[envMap[key]] || process.env[key] || null;
  }

  private deriveKey(password: string, salt: string): Buffer {
    return scryptSync(password, salt, KEY_LENGTH);
  }

  private async load(password: string): Promise<void> {
    try {
      const raw = readFileSync(this.vaultPath, 'utf8');
      const data: VaultData = JSON.parse(raw);

      if (data.version !== VAULT_VERSION) {
        throw new Error(`Unsupported vault version: ${data.version}`);
      }

      this.masterKey = this.deriveKey(password, data.salt);
      this.currentSalt = data.salt;

      const decipher = createDecipheriv(
        ALGORITHM,
        this.masterKey,
        Buffer.from(data.iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(data.tag, 'hex'));

      let decrypted: string;
      try {
        decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
      } catch {
        throw new Error('Invalid master password or corrupted vault');
      }

      const secrets: Record<string, string> = JSON.parse(decrypted);
      this.secrets = new Map(Object.entries(secrets));
      this.dirty = false;
      this.logger?.info(`VaultManager: Loaded ${this.secrets.size} secrets`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error('Vault file not found');
      }
      throw error;
    }
  }

  private async save(): Promise<void> {
    if (!this.dirty || !this.masterKey) return;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv);

    const plaintext = JSON.stringify(Object.fromEntries(this.secrets));
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag().toString('hex');

    const data: Omit<VaultData, 'secrets'> & { secrets: never } = {
      version: VAULT_VERSION,
      salt: this.currentSalt,
      iv: iv.toString('hex'),
      tag,
      encrypted,
    };

    writeFileSync(this.vaultPath, JSON.stringify(data, null, 2), {
      mode: 0o600,
    });

    this.dirty = false;
  }

  getStats(): { secretCount: number; vaultPath: string; initialized: boolean } {
    return {
      secretCount: this.secrets.size,
      vaultPath: this.vaultPath,
      initialized: this.masterKey !== null,
    };
  }
}

let _vault: VaultManager | null = null;

export function getVaultManager(config?: Partial<VaultConfig>, logger?: any): VaultManager {
  if (!_vault) {
    _vault = new VaultManager(config, logger);
  }
  return _vault;
}
