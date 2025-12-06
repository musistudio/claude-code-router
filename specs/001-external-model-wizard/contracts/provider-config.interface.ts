/**
 * Provider Configuration Interface
 *
 * Defines the data structures for LLM provider configurations.
 * Feature: External Model Configuration Wizard
 */

/**
 * Configuration for an external LLM provider
 */
export interface ProviderConfig {
  /** Provider display name (e.g., "Gemini", "Qwen") */
  name: string;

  /** API endpoint base URL (must be HTTPS) */
  api_base_url: string;

  /** Array of model identifiers available for this provider */
  models: string[];

  /** Optional custom request headers */
  headers?: Record<string, string>;
}

/**
 * Complete configuration file structure
 */
export interface ConfigFile {
  /** Array of configured LLM providers */
  Providers: ProviderConfig[];

  /** Optional routing configuration */
  Router?: {
    default?: string;
    think?: string;
    webSearch?: string;
    longContext?: string;
    image?: string;
    background?: string;
  };

  /** Preserve all other existing config properties */
  [key: string]: any;
}

/**
 * Pre-defined provider configuration template
 */
export interface ProviderTemplate {
  /** Provider type identifier */
  providerType: import('./wizard-state.interface').ProviderType;

  /** Provider configuration to be saved */
  config: ProviderConfig;

  /** Custom prompt text for API key input step */
  apiKeyPrompt: string;

  /** Instructions or URL for obtaining API key */
  apiKeyInstructions: string;
}
