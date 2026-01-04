import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import JSON5 from 'json5';

export interface ConfigOptions {
  envPath?: string;
  jsonPath?: string;
  useEnvFile?: boolean;
  useJsonFile?: boolean;
  useEnvironmentVariables?: boolean;
  initialConfig?: AppConfig;
}

export interface AppConfig {
  [key: string]: any;
}

export class ConfigService {
  private config: AppConfig = {};
  private options: ConfigOptions;

  constructor(
    options: ConfigOptions = {
      jsonPath: "./config.json",
    }
  ) {
    this.options = {
      envPath: options.envPath || ".env",
      jsonPath: options.jsonPath,
      useEnvFile: false,
      useJsonFile: options.useJsonFile !== false,
      useEnvironmentVariables: options.useEnvironmentVariables !== false,
      ...options,
    };

    this.loadConfig();
  }

  private loadConfig(): void {
    if (this.options.useJsonFile && this.options.jsonPath) {
      this.loadJsonConfig();
    }

    if (this.options.initialConfig) {
      this.config = { ...this.config, ...this.options.initialConfig };
    }

    if (this.options.useEnvFile) {
      this.loadEnvConfig();
    }

    // if (this.options.useEnvironmentVariables) {
    //   this.loadEnvironmentVariables();
    // }

    if (this.config.LOG_FILE) {
      process.env.LOG_FILE = this.config.LOG_FILE;
    }
    if (this.config.LOG) {
      process.env.LOG = this.config.LOG;
    }
  }

  private loadJsonConfig(): void {
    if (!this.options.jsonPath) return;

    const jsonPath = this.isAbsolutePath(this.options.jsonPath)
      ? this.options.jsonPath
      : join(process.cwd(), this.options.jsonPath);

    if (existsSync(jsonPath)) {
      try {
        const jsonContent = readFileSync(jsonPath, "utf-8");
        const jsonConfig = JSON5.parse(jsonContent);
        this.config = { ...this.config, ...jsonConfig };
        console.log(`Loaded JSON config from: ${jsonPath}`);
      } catch (error) {
        console.warn(`Failed to load JSON config from ${jsonPath}:`, error);
      }
    } else {
      console.warn(`JSON config file not found: ${jsonPath}`);
    }
  }

  private loadEnvConfig(): void {
    const envPath = this.isAbsolutePath(this.options.envPath!)
      ? this.options.envPath!
      : join(process.cwd(), this.options.envPath!);

    if (existsSync(envPath)) {
      try {
        const result = config({ path: envPath });
        if (result.parsed) {
          this.config = {
            ...this.config,
            ...this.parseEnvConfig(result.parsed),
          };
        }
      } catch (error) {
        console.warn(`Failed to load .env config from ${envPath}:`, error);
      }
    }
  }

  private loadEnvironmentVariables(): void {
    const envConfig = this.parseEnvConfig(process.env);
    this.config = { ...this.config, ...envConfig };
  }

  private parseEnvConfig(
    env: Record<string, string | undefined>
  ): Partial<AppConfig> {
    const parsed: Partial<AppConfig> = {};

    Object.assign(parsed, env);

    return parsed;
  }

  private isAbsolutePath(path: string): boolean {
    return path.startsWith("/") || path.includes(":");
  }

  public get<T = any>(key: keyof AppConfig): T | undefined;
  public get<T = any>(key: keyof AppConfig, defaultValue: T): T;
  public get<T = any>(key: keyof AppConfig, defaultValue?: T): T | undefined {
    const value = this.config[key];
    return value !== undefined ? (value as T) : defaultValue;
  }

  public getAll(): AppConfig {
    return { ...this.config };
  }

  public getHttpsProxy(): string | undefined {
    return (
      this.get("HTTPS_PROXY") ||
      this.get("https_proxy") ||
      this.get("httpsProxy") ||
      this.get("PROXY_URL")
    );
  }

  public has(key: keyof AppConfig): boolean {
    return this.config[key] !== undefined;
  }

  public set(key: keyof AppConfig, value: any): void {
    this.config[key] = value;
  }

  public reload(): void {
    this.config = {};
    this.loadConfig();
  }

  public getConfigSummary(): string {
    const summary: string[] = [];

    if (this.options.initialConfig) {
      summary.push("Initial Config");
    }

    if (this.options.useJsonFile && this.options.jsonPath) {
      summary.push(`JSON: ${this.options.jsonPath}`);
    }

    if (this.options.useEnvFile) {
      summary.push(`ENV: ${this.options.envPath}`);
    }

    if (this.options.useEnvironmentVariables) {
      summary.push("Environment Variables");
    }

    return `Config sources: ${summary.join(", ")}`;
  }
}
