/**
 * Wizard State Interface
 *
 * Defines the data structures for managing wizard session state.
 * Feature: External Model Configuration Wizard
 */

/**
 * Represents the current state of an active wizard session
 */
export interface WizardState {
  /** Unique identifier for the wizard session (UUID) */
  sessionId: string;

  /** Current step in the wizard flow */
  currentStep: WizardStep;

  /** User's selected provider (null until selection made) */
  selectedProvider: ProviderType | null;

  /** User's API key input (temporary, cleared after save) */
  apiKey: string | null;

  /** Session creation timestamp (for TTL expiration tracking) */
  createdAt: Date;

  /** Count of invalid input attempts at current step (max 3) */
  retryCount: number;
}

/**
 * Wizard flow steps
 */
export enum WizardStep {
  /** Displaying provider selection menu */
  MENU = 'menu',

  /** Prompting for API key input */
  API_KEY = 'api_key',

  /** Confirming configuration before save */
  CONFIRM = 'confirm',

  /** Wizard successfully completed */
  COMPLETE = 'complete'
}

/**
 * Supported external LLM provider types
 */
export enum ProviderType {
  /** Google Gemini / Generative Language API */
  GEMINI = 'gemini',

  /** Alibaba Qwen / DashScope API */
  QWEN = 'qwen'
}
