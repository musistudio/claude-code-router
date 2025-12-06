/**
 * Wizard Manager Interface
 *
 * Defines the contract for the wizard state management system.
 * Feature: External Model Configuration Wizard
 */

import { WizardState } from './wizard-state.interface';

/**
 * Wizard response payload (Anthropic API compatible)
 */
export interface WizardResponse {
  /** Unique message ID */
  id: string;

  /** Message type (always "message" for wizard responses) */
  type: 'message';

  /** Role (always "assistant" for wizard responses) */
  role: 'assistant';

  /** Message content blocks */
  content: Array<{
    type: 'text';
    text: string;
  }>;

  /** Model identifier (always "wizard" for wizard responses) */
  model: 'wizard';

  /** Stop reason (always "end_turn" for wizard responses) */
  stop_reason: 'end_turn';

  /** Token usage (always 0 for wizard responses) */
  usage: {
    input_tokens: 0;
    output_tokens: 0;
  };
}

/**
 * Wizard Manager Interface
 *
 * Manages wizard session lifecycle, state transitions, and user interaction flow.
 */
export interface IWizardManager {
  /**
   * Check if a message content triggers wizard handling
   *
   * @param messageContent - User message text to check
   * @returns true if message is /external-model command
   */
  isWizardCommand(messageContent: string): boolean;

  /**
   * Check if a wizard session is currently active for the given session ID
   *
   * @param sessionId - Wizard session identifier
   * @returns true if session exists and is not expired
   */
  hasActiveSession(sessionId: string): boolean;

  /**
   * Process user input for active wizard session
   *
   * Handles state transitions, input validation, and error handling.
   * Returns Anthropic API-compatible response for display to user.
   *
   * @param sessionId - Wizard session identifier
   * @param userInput - User's message content
   * @returns Wizard response message (Anthropic API format)
   * @throws Error if session not found or config save fails
   */
  processInput(sessionId: string, userInput: string): Promise<WizardResponse>;

  /**
   * Initialize new wizard session
   *
   * Creates new session state and returns initial provider menu prompt.
   *
   * @param sessionId - Unique wizard session identifier (UUID)
   * @returns Initial wizard prompt (provider menu)
   */
  startWizard(sessionId: string): WizardResponse;

  /**
   * Get current session state (for debugging/monitoring)
   *
   * @param sessionId - Wizard session identifier
   * @returns Current wizard state or undefined if not found
   */
  getSessionState(sessionId: string): WizardState | undefined;

  /**
   * Clean up expired wizard sessions (TTL-based)
   *
   * Called periodically by cleanup interval.
   * Removes sessions older than SESSION_TTL_MS (15 minutes).
   */
  cleanupExpiredSessions(): void;

  /**
   * Cancel wizard session for conversation
   *
   * Immediately removes session state.
   *
   * @param sessionId - Wizard session identifier
   */
  cancelWizard(sessionId: string): void;

  /**
   * Shutdown wizard manager
   *
   * Clears cleanup interval timer.
   * Called during server shutdown.
   */
  shutdown(): void;
}
