/**
 * Type definitions for External Model Configuration Wizard
 * Feature: 001-external-model-wizard
 */

/**
 * Wizard step identifiers
 */
export enum WizardStep {
  MENU = 'menu',           // Displaying provider selection menu
  API_KEY = 'api_key',     // Prompting for API key input
  CONFIRM = 'confirm',     // Confirming configuration before save
  COMPLETE = 'complete'    // Wizard successfully completed
}

/**
 * Supported external LLM provider types
 */
export enum ProviderType {
  GEMINI = 'gemini',
  QWEN = 'qwen'
}

/**
 * Runtime state of an active wizard session
 */
export interface WizardState {
  /** Unique identifier for wizard session (UUID) */
  sessionId: string;

  /** Current step in wizard flow */
  currentStep: WizardStep;

  /** User's provider selection (null until selected) */
  selectedProvider: ProviderType | null;

  /** User's API key input (temporary, cleared after save) */
  apiKey: string | null;

  /** Session creation timestamp (for TTL expiration) */
  createdAt: Date;

  /** Count of invalid input attempts at current step */
  retryCount: number;
}

/**
 * Configuration structure for an external LLM provider
 */
export interface ProviderConfig {
  /** Provider display name (e.g., "Gemini") */
  name: string;

  /** API endpoint base URL */
  api_base_url: string;

  /** Array of model identifiers */
  models: string[];

  /** Optional custom request headers */
  headers?: Record<string, string>;
}

/**
 * Complete structure of ~/.claude-code-router/config.json
 */
export interface ConfigFile {
  /** Array of configured providers */
  Providers: ProviderConfig[];

  /** Optional routing configuration */
  Router?: {
    default?: string;
    think?: string;
    webSearch?: string;
    longContext?: string;
    [key: string]: any;
  };

  /** Other existing config properties */
  [key: string]: any;
}

/**
 * Pre-defined configuration template for supported providers
 */
export interface ProviderTemplate {
  /** Enum identifier */
  providerType: ProviderType;

  /** Provider configuration */
  config: ProviderConfig;

  /** Custom prompt text for API key step */
  apiKeyPrompt: string;

  /** URL or instructions for obtaining API key */
  apiKeyInstructions: string;
}
