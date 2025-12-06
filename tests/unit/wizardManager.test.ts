import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WizardManager } from '../../src/utils/wizardManager';
import { WizardStep, ProviderType } from '../../src/types/wizard.types';
import type { IConfigManager } from '../../src/utils/configManager';

// Mock ConfigManager
const mockConfigManager: IConfigManager = {
  upsertProvider: vi.fn().mockResolvedValue(undefined),
  readConfig: vi.fn().mockResolvedValue({ Providers: [] }),
  backupConfig: vi.fn().mockResolvedValue('/path/to/backup'),
  validateConfig: vi.fn().mockReturnValue(true),
};

describe('WizardManager', () => {
  let wizardManager: WizardManager;
  let sessionId: string;

  beforeEach(() => {
    wizardManager = new WizardManager(mockConfigManager);
    sessionId = 'test-session-123';
    vi.clearAllMocks();
  });

  afterEach(() => {
    wizardManager.shutdown();
  });

  // T031: isWizardCommand should return true for '/external-model'
  describe('isWizardCommand', () => {
    it('should return true for "/external-model"', () => {
      expect(wizardManager.isWizardCommand('/external-model')).toBe(true);
    });

    // T032: isWizardCommand should return false for other messages
    it('should return false for other messages', () => {
      expect(wizardManager.isWizardCommand('hello')).toBe(false);
      expect(wizardManager.isWizardCommand('/help')).toBe(false);
      expect(wizardManager.isWizardCommand('external-model')).toBe(false);
      expect(wizardManager.isWizardCommand('/external-model-2')).toBe(false);
    });
  });

  // T033: startWizard should create new session with MENU step
  describe('startWizard', () => {
    it('should create new session with MENU step', () => {
      const response = wizardManager.startWizard(sessionId);

      expect(response).toBeTruthy();
      expect(typeof response).toBe('string');

      // Verify session was created
      expect(wizardManager.hasActiveSession(sessionId)).toBe(true);
    });

    // T034: startWizard should return provider menu prompt
    it('should return provider menu prompt', () => {
      const response = wizardManager.startWizard(sessionId);

      expect(response).toContain('Select Provider');
      expect(response).toContain('1');
      expect(response).toContain('2');
      expect(response).toContain('Gemini');
      expect(response).toContain('Qwen');
    });
  });

  describe('processInput - MENU step', () => {
    beforeEach(() => {
      wizardManager.startWizard(sessionId);
    });

    // T035: processInput should transition MENU → API_KEY on valid selection '1'
    it('should transition MENU → API_KEY on valid selection "1"', async () => {
      const response = await wizardManager.processInput(sessionId, '1');

      expect(response).toContain('API key');
      expect(response).toContain('Gemini');
    });

    // T036: processInput should transition MENU → API_KEY on valid selection '2'
    it('should transition MENU → API_KEY on valid selection "2"', async () => {
      const response = await wizardManager.processInput(sessionId, '2');

      expect(response).toContain('API key');
      expect(response).toContain('Qwen');
    });

    // T037: processInput should stay at MENU and increment retryCount on invalid selection
    it('should stay at MENU and increment retryCount on invalid selection', async () => {
      const response = await wizardManager.processInput(sessionId, '3');

      expect(response).toContain('Invalid');
      expect(response).toContain('Select Provider');

      // Verify still at MENU step
      expect(wizardManager.hasActiveSession(sessionId)).toBe(true);
    });
  });

  describe('processInput - API_KEY step', () => {
    beforeEach(async () => {
      wizardManager.startWizard(sessionId);
      await wizardManager.processInput(sessionId, '1'); // Select Gemini
    });

    // T038: processInput should transition API_KEY → CONFIRM on valid API key
    it('should transition API_KEY → CONFIRM on valid API key', async () => {
      const response = await wizardManager.processInput(sessionId, 'sk-test-api-key-12345');

      expect(response).toContain('Configuration Preview');
      expect(response).toContain('Gemini');
      expect(response).toContain('Save');
      expect(response).toContain('(y)es');
      expect(response).toContain('(n)o');
    });

    // T039: processInput should reject empty API key and increment retryCount
    it('should reject empty API key and increment retryCount', async () => {
      const response = await wizardManager.processInput(sessionId, '');

      expect(response).toContain('cannot be empty');
      expect(response).toContain('API key');
    });

    // T040: processInput should reject whitespace-only API key
    it('should reject whitespace-only API key', async () => {
      const response = await wizardManager.processInput(sessionId, '   ');

      expect(response).toContain('cannot be empty');
    });
  });

  describe('processInput - CONFIRM step', () => {
    beforeEach(async () => {
      wizardManager.startWizard(sessionId);
      await wizardManager.processInput(sessionId, '1'); // Select Gemini
      await wizardManager.processInput(sessionId, 'sk-test-api-key-12345'); // Enter API key
    });

    // T041: processInput should call ConfigManager.upsertProvider on CONFIRM step
    it('should call ConfigManager.upsertProvider on confirmation', async () => {
      await wizardManager.processInput(sessionId, 'yes');

      expect(mockConfigManager.upsertProvider).toHaveBeenCalledTimes(1);
      expect(mockConfigManager.upsertProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Gemini',
          api_base_url: expect.any(String),
          models: expect.any(Array),
        })
      );
    });

    // T042: processInput should delete session on successful completion
    it('should delete session on successful completion', async () => {
      await wizardManager.processInput(sessionId, 'y');

      expect(wizardManager.hasActiveSession(sessionId)).toBe(false);
    });
  });

  // T043: cancelWizard should delete session for any step
  describe('cancelWizard', () => {
    it('should delete session at MENU step', () => {
      wizardManager.startWizard(sessionId);
      const response = wizardManager.cancelWizard(sessionId);

      expect(response).toContain('cancel');
      expect(wizardManager.hasActiveSession(sessionId)).toBe(false);
    });

    it('should delete session at API_KEY step', async () => {
      wizardManager.startWizard(sessionId);
      await wizardManager.processInput(sessionId, '1');

      const response = wizardManager.cancelWizard(sessionId);

      expect(response).toContain('cancel');
      expect(wizardManager.hasActiveSession(sessionId)).toBe(false);
    });

    it('should delete session at CONFIRM step', async () => {
      wizardManager.startWizard(sessionId);
      await wizardManager.processInput(sessionId, '1');
      await wizardManager.processInput(sessionId, 'sk-test-key');

      const response = wizardManager.cancelWizard(sessionId);

      expect(response).toContain('cancel');
      expect(wizardManager.hasActiveSession(sessionId)).toBe(false);
    });
  });

  // T044: cleanupExpiredSessions should remove sessions older than 15 minutes
  describe('cleanupExpiredSessions', () => {
    it('should remove sessions older than 15 minutes', () => {
      // Create session
      wizardManager.startWizard(sessionId);

      // Mock old timestamp (16 minutes ago)
      const oldDate = new Date(Date.now() - 16 * 60 * 1000);
      // @ts-expect-error - Accessing private sessions map for testing
      const session = wizardManager['sessions'].get(sessionId);
      if (session) {
        session.createdAt = oldDate;
      }

      // Run cleanup
      wizardManager.cleanupExpiredSessions();

      // Session should be removed
      expect(wizardManager.hasActiveSession(sessionId)).toBe(false);
    });

    // T045: cleanupExpiredSessions should preserve active sessions
    it('should preserve active sessions', () => {
      wizardManager.startWizard(sessionId);

      // Run cleanup
      wizardManager.cleanupExpiredSessions();

      // Session should still exist
      expect(wizardManager.hasActiveSession(sessionId)).toBe(true);
    });
  });

  // Phase 5: User Story 2 - Error Handling Tests
  describe('Error Handling - Invalid Menu Selections', () => {
    beforeEach(() => {
      wizardManager.startWizard(sessionId);
    });

    // T093: Invalid menu selection '3' should re-prompt with error message
    it('should re-prompt with error message for selection "3"', async () => {
      const response = await wizardManager.processInput(sessionId, '3');

      expect(response).toContain('Invalid');
      expect(response).toContain('Select Provider');
      expect(wizardManager.hasActiveSession(sessionId)).toBe(true);
    });

    // T094: Invalid menu selection 'abc' should re-prompt with error message
    it('should re-prompt with error message for selection "abc"', async () => {
      const response = await wizardManager.processInput(sessionId, 'abc');

      expect(response).toContain('Invalid');
      expect(response).toContain('Select Provider');
    });

    // T095: Invalid menu selection '0' should re-prompt with error message
    it('should re-prompt with error message for selection "0"', async () => {
      const response = await wizardManager.processInput(sessionId, '0');

      expect(response).toContain('Invalid');
      expect(response).toContain('Select Provider');
    });

    // T096: Empty string menu selection should re-prompt with error message
    it('should re-prompt with error message for empty string', async () => {
      const response = await wizardManager.processInput(sessionId, '');

      expect(response).toContain('Invalid');
      expect(response).toContain('Select Provider');
    });
  });

  describe('Error Handling - Retry Count and Reset', () => {
    beforeEach(() => {
      wizardManager.startWizard(sessionId);
    });

    // T097: Retry count should increment on each invalid menu selection
    it('should increment retry count on each invalid menu selection', async () => {
      await wizardManager.processInput(sessionId, '3');
      // @ts-expect-error - Accessing private sessions map for testing
      let session = wizardManager['sessions'].get(sessionId);
      expect(session?.retryCount).toBe(1);

      await wizardManager.processInput(sessionId, 'invalid');
      // @ts-expect-error - Accessing private sessions map for testing
      session = wizardManager['sessions'].get(sessionId);
      expect(session?.retryCount).toBe(2);
    });

    // T098: After 3 invalid attempts, wizard should reset to MENU with retryCount=0
    it('should reset to MENU with retryCount=0 after 3 invalid attempts', async () => {
      // Make 3 invalid attempts
      await wizardManager.processInput(sessionId, 'invalid1');
      await wizardManager.processInput(sessionId, 'invalid2');
      await wizardManager.processInput(sessionId, 'invalid3');

      // 4th attempt should trigger reset
      const response = await wizardManager.processInput(sessionId, 'invalid4');

      expect(response).toContain('Too many');
      expect(response).toContain('Select Provider');

      // @ts-expect-error - Accessing private sessions map for testing
      const session = wizardManager['sessions'].get(sessionId);
      expect(session?.retryCount).toBe(0);
    });
  });

  describe('Error Handling - Cancellation', () => {
    // T099: '/cancel' at MENU step should delete session and return cancellation message
    it('should handle /cancel at MENU step', async () => {
      wizardManager.startWizard(sessionId);
      const response = await wizardManager.processInput(sessionId, '/cancel');

      expect(response).toContain('cancel');
      expect(wizardManager.hasActiveSession(sessionId)).toBe(false);
    });

    // T100: '/cancel' at API_KEY step should delete session
    it('should handle /cancel at API_KEY step', async () => {
      wizardManager.startWizard(sessionId);
      await wizardManager.processInput(sessionId, '1');

      const response = await wizardManager.processInput(sessionId, '/cancel');

      expect(response).toContain('cancel');
      expect(wizardManager.hasActiveSession(sessionId)).toBe(false);
    });

    // T101: '/cancel' at CONFIRM step should delete session
    it('should handle /cancel at CONFIRM step', async () => {
      wizardManager.startWizard(sessionId);
      await wizardManager.processInput(sessionId, '1');
      await wizardManager.processInput(sessionId, 'sk-test-key');

      const response = await wizardManager.processInput(sessionId, '/cancel');

      expect(response).toContain('cancel');
      expect(wizardManager.hasActiveSession(sessionId)).toBe(false);
    });
  });

  describe('Error Handling - API Key Validation', () => {
    beforeEach(async () => {
      wizardManager.startWizard(sessionId);
      await wizardManager.processInput(sessionId, '1'); // Select Gemini
    });

    // T102: Whitespace-only API key '   ' should be rejected
    it('should reject whitespace-only API key', async () => {
      const response = await wizardManager.processInput(sessionId, '   ');

      expect(response).toContain('cannot be empty');
      expect(response).toContain('API key');
    });
  });

  describe('Error Handling - Confirmation Validation', () => {
    beforeEach(async () => {
      wizardManager.startWizard(sessionId);
      await wizardManager.processInput(sessionId, '1'); // Select Gemini
      await wizardManager.processInput(sessionId, 'sk-test-key'); // Enter API key
    });

    // T103: Empty confirmation input should re-prompt
    it('should re-prompt for empty confirmation input', async () => {
      const response = await wizardManager.processInput(sessionId, '');

      expect(response).toContain('Please enter');
      expect(response).toContain('(y)es');
      expect(response).toContain('(n)o');
    });

    // T104: Invalid confirmation 'maybe' should re-prompt
    it('should re-prompt for invalid confirmation "maybe"', async () => {
      const response = await wizardManager.processInput(sessionId, 'maybe');

      expect(response).toContain('Please enter');
      expect(response).toContain('(y)es');
      expect(response).toContain('(n)o');
    });
  });
});
