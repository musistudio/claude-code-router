/**
 * WizardManager - Interactive configuration wizard for external LLM providers
 * Feature: 001-external-model-wizard
 *
 * Provides conversational wizard flow for:
 * - Provider selection (Gemini, Qwen)
 * - API key collection
 * - Configuration confirmation and save
 *
 * State management:
 * - In-memory Map keyed by sessionId
 * - TTL-based expiration (15 minutes)
 * - Automatic cleanup every 5 minutes
 */

import { randomUUID } from 'crypto';
import { WizardStep, ProviderType, type WizardState } from '../types/wizard.types';
import type { IConfigManager } from './configManager';
import { PROVIDER_TEMPLATES } from './providerTemplates';

/**
 * Interface for WizardManager operations
 */
export interface IWizardManager {
  /**
   * Check if a message triggers wizard handling
   * @param messageContent - User message text
   * @returns true if message is /external-model command
   */
  isWizardCommand(messageContent: string): boolean;

  /**
   * Process user input for active wizard session
   * @param sessionId - Unique session identifier
   * @param userInput - User's message content
   * @returns Wizard response message to display
   */
  processInput(sessionId: string, userInput: string): Promise<string>;

  /**
   * Initialize new wizard session
   * @param sessionId - Unique session identifier
   * @returns Initial wizard prompt (provider menu)
   */
  startWizard(sessionId: string): string;

  /**
   * Clean up expired wizard sessions (TTL-based)
   */
  cleanupExpiredSessions(): void;

  /**
   * Cancel wizard session for given session ID
   * @param sessionId - Unique session identifier
   * @returns Cancellation confirmation message
   */
  cancelWizard(sessionId: string): string;

  /**
   * Check if there is an active wizard session for given session ID
   * @param sessionId - Unique session identifier
   * @returns true if active session exists
   */
  hasActiveSession(sessionId: string): boolean;

  /**
   * Shutdown wizard manager and cleanup resources
   */
  shutdown(): void;
}

/**
 * WizardManager class implementing wizard state machine
 */
export class WizardManager implements IWizardManager {
  private sessions = new Map<string, WizardState>();
  private cleanupInterval: NodeJS.Timeout;
  private readonly SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_SESSIONS = 100;
  private readonly MAX_RETRY_COUNT = 3;

  /**
   * Creates new WizardManager instance
   * @param configManager - ConfigManager instance for saving provider configs
   */
  constructor(private configManager: IConfigManager) {
    // Start cleanup job
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Check if message content is a wizard command
   * Detects exact '/external-model' or '/external-model ' with parameters
   */
  isWizardCommand(messageContent: string): boolean {
    const trimmed = messageContent.trim();
    return trimmed === '/external-model' || trimmed.startsWith('/external-model ');
  }

  /**
   * Check if there is an active wizard session
   * Used by interceptor to determine if message should be routed to wizard
   */
  hasActiveSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Initialize new wizard session and return provider menu
   * Enforces max session limit (100) by removing oldest session if needed
   */
  startWizard(sessionId: string): string {
    // Enforce max sessions
    if (this.sessions.size >= this.MAX_SESSIONS) {
      const oldestSession = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime())[0];
      this.sessions.delete(oldestSession[0]);
      console.log(`[WizardManager] Max sessions reached (${this.MAX_SESSIONS}), removed oldest session: ${oldestSession[0]}`);
    }

    // Create new session
    this.sessions.set(sessionId, {
      sessionId,
      currentStep: WizardStep.MENU,
      selectedProvider: null,
      apiKey: null,
      createdAt: new Date(),
      retryCount: 0,
    });

    console.log(`[WizardManager] New wizard session started: ${sessionId} → ${WizardStep.MENU}`);
    return this.getMenuPrompt();
  }

  /**
   * Process user input for active wizard session
   * Routes input to appropriate step handler based on current wizard state
   * Handles '/cancel' command at any step
   *
   * @param sessionId - Unique session identifier
   * @param userInput - User's message content
   * @returns Wizard response message
   */
  async processInput(sessionId: string, userInput: string): Promise<string> {
    // Check for cancel command
    if (userInput.trim().startsWith('/cancel')) {
      return this.cancelWizard(sessionId);
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return this.startWizard(sessionId);
    }

    // Route to appropriate step handler
    switch (session.currentStep) {
      case WizardStep.MENU:
        return this.handleMenuStep(sessionId, userInput);
      case WizardStep.API_KEY:
        return this.handleApiKeyStep(sessionId, userInput);
      case WizardStep.CONFIRM:
        return await this.handleConfirmStep(sessionId, userInput);
      default:
        return this.startWizard(sessionId);
    }
  }

  /**
   * Cancel wizard session and delete state
   * Safe to call even if session doesn't exist
   *
   * @returns Cancellation confirmation message
   */
  cancelWizard(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    if (session) {
      console.log(`[WizardManager] Session cancelled: ${sessionId} (was at step: ${session.currentStep})`);
    }
    return 'Wizard cancelled. No changes were made to your configuration.';
  }

  /**
   * Clean up expired wizard sessions based on TTL (15 minutes)
   * Called automatically every 5 minutes by cleanup interval
   * Logs cleanup count if any sessions were removed
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, state] of this.sessions.entries()) {
      const age = now - state.createdAt.getTime();
      if (age > this.SESSION_TTL_MS) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[WizardManager] Cleaned up ${cleanedCount} expired wizard sessions`);
    }
  }

  /**
   * Shutdown wizard manager and stop cleanup interval
   * Should be called when server is shutting down
   */
  shutdown(): void {
    clearInterval(this.cleanupInterval);
  }

  // ==================== Private Helper Methods ====================

  private getMenuPrompt(): string {
    return `Select Provider:
1. Gemini
2. Qwen

Enter 1 or 2, or type /cancel to exit.`;
  }

  private handleMenuStep(sessionId: string, input: string): string {
    const session = this.sessions.get(sessionId)!;
    const trimmed = input.trim();

    let selectedProvider: ProviderType | null = null;
    if (trimmed === '1') {
      selectedProvider = ProviderType.GEMINI;
    } else if (trimmed === '2') {
      selectedProvider = ProviderType.QWEN;
    }

    if (selectedProvider === null) {
      session.retryCount++;
      console.log(`[WizardManager] Invalid menu selection for session ${sessionId}: "${trimmed}" (retry ${session.retryCount}/${this.MAX_RETRY_COUNT})`);

      if (session.retryCount > this.MAX_RETRY_COUNT) {
        session.retryCount = 0;
        console.log(`[WizardManager] Session ${sessionId}: Max retries exceeded → MENU (reset)`);
        return `Too many invalid attempts. Restarting wizard.\n\n${this.getMenuPrompt()}`;
      }

      return `Invalid selection. Please enter 1 or 2.\n\n${this.getMenuPrompt()}`;
    }

    // Valid selection - transition to API_KEY step
    session.selectedProvider = selectedProvider;
    session.currentStep = WizardStep.API_KEY;
    session.retryCount = 0;
    console.log(`[WizardManager] Session ${sessionId}: ${WizardStep.MENU} → ${WizardStep.API_KEY} (provider: ${selectedProvider})`);

    return this.getApiKeyPrompt(selectedProvider);
  }

  private getApiKeyPrompt(provider: ProviderType): string {
    const template = PROVIDER_TEMPLATES[provider];
    return `${template.apiKeyPrompt}

${template.apiKeyInstructions}

Paste your API key below, or type /cancel to exit.`;
  }

  private handleApiKeyStep(sessionId: string, input: string): string {
    const session = this.sessions.get(sessionId)!;
    const trimmed = input.trim();

    if (trimmed.length === 0) {
      session.retryCount++;
      console.log(`[WizardManager] Empty API key for session ${sessionId} (retry ${session.retryCount}/${this.MAX_RETRY_COUNT})`);

      if (session.retryCount > this.MAX_RETRY_COUNT) {
        session.retryCount = 0;
        session.currentStep = WizardStep.MENU;
        console.log(`[WizardManager] Session ${sessionId}: Max retries exceeded → MENU (reset)`);
        return `Too many invalid attempts. Restarting wizard.\n\n${this.getMenuPrompt()}`;
      }

      return `API key cannot be empty. Please try again.\n\n${this.getApiKeyPrompt(session.selectedProvider!)}`;
    }

    // Valid API key - transition to CONFIRM step
    session.apiKey = trimmed;
    session.currentStep = WizardStep.CONFIRM;
    session.retryCount = 0;
    console.log(`[WizardManager] Session ${sessionId}: ${WizardStep.API_KEY} → ${WizardStep.CONFIRM} (API key: ${this.maskApiKey(trimmed)})`);

    return this.getConfirmPrompt(session.selectedProvider!, trimmed);
  }

  private getConfirmPrompt(provider: ProviderType, apiKey: string): string {
    const template = PROVIDER_TEMPLATES[provider];
    const maskedKey = this.maskApiKey(apiKey);

    return `Configuration Preview:
  Provider: ${template.config.name}
  API URL: ${template.config.api_base_url}
  Models: ${template.config.models.join(', ')}
  API Key: ${maskedKey}

Save this configuration?
(y)es / (n)o`;
  }

  private maskApiKey(apiKey: string): string {
    if (apiKey.length <= 8) {
      return '***';
    }
    const first4 = apiKey.substring(0, 4);
    const last4 = apiKey.substring(apiKey.length - 4);
    return `${first4}...${last4}`;
  }

  private async handleConfirmStep(sessionId: string, input: string): Promise<string> {
    const session = this.sessions.get(sessionId)!;
    const trimmed = input.trim().toLowerCase();

    if (trimmed === 'y' || trimmed === 'yes') {
      // Save configuration
      try {
        const template = PROVIDER_TEMPLATES[session.selectedProvider!];
        const providerConfig = {
          ...template.config,
          // Note: API key is NOT stored in provider config
          // It should be stored separately (env vars or secure storage)
        };

        console.log(`[WizardManager] Session ${sessionId}: Saving provider config for ${session.selectedProvider}`);
        await this.configManager.upsertProvider(providerConfig);

        // Delete session on success
        this.sessions.delete(sessionId);
        console.log(`[WizardManager] Session ${sessionId}: ${WizardStep.CONFIRM} → COMPLETE (config saved, session deleted)`);

        return `✓ Configuration saved successfully!

Provider "${template.config.name}" added to config.

To apply changes, restart the service:
  ccr restart

or manually:
  ccr stop
  ccr start`;
      } catch (error) {
        console.error(`[WizardManager] Session ${sessionId}: Failed to save config:`, error instanceof Error ? error.message : String(error));
        return `Error saving configuration: ${error instanceof Error ? error.message : String(error)}

Please try again or type /cancel to exit.`;
      }
    } else if (trimmed === 'n' || trimmed === 'no') {
      // Reset to MENU
      session.currentStep = WizardStep.MENU;
      session.selectedProvider = null;
      session.apiKey = null;
      session.retryCount = 0;
      console.log(`[WizardManager] Session ${sessionId}: ${WizardStep.CONFIRM} → MENU (user declined, state reset)`);

      return `Configuration discarded. Returning to menu.\n\n${this.getMenuPrompt()}`;
    } else {
      session.retryCount++;
      console.log(`[WizardManager] Invalid confirmation for session ${sessionId}: "${trimmed}" (retry ${session.retryCount}/${this.MAX_RETRY_COUNT})`);

      if (session.retryCount > this.MAX_RETRY_COUNT) {
        session.retryCount = 0;
        session.currentStep = WizardStep.MENU;
        session.selectedProvider = null;
        session.apiKey = null;
        console.log(`[WizardManager] Session ${sessionId}: Max retries exceeded → MENU (reset)`);
        return `Too many invalid attempts. Restarting wizard.\n\n${this.getMenuPrompt()}`;
      }

      return `Please enter 'y' (yes) or 'n' (no).\n\n${this.getConfirmPrompt(session.selectedProvider!, session.apiKey!)}`;
    }
  }
}
