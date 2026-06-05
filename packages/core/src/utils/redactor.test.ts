import { describe, it, expect } from 'vitest';
import { redactString, redactObject, containsSensitiveInfo } from './redactor';

describe('redactor', () => {
  describe('redactString', () => {
    it('should redact API keys (sk-...)', () => {
      const result = redactString('Use key sk-abcdefghijklmnopqrstuvwxyz123456 for auth');
      expect(result).toContain('sk-****REDACTED****');
      expect(result).not.toContain('abcdefghijklmnopqrstuvwxyz');
    });

    it('should redact Chinese phone numbers', () => {
      const result = redactString('Call me at 13812345678 or 139-8765-4321');
      expect(result).not.toContain('13812345678');
      expect(result).toContain('138****5678');
    });

    it('should redact Chinese ID card numbers', () => {
      const result = redactString('ID: 110101199001011234');
      expect(result).not.toContain('110101199001011234');
      expect(result).toContain('110101********1234');
    });

    it('should redact credit card numbers', () => {
      const result = redactString('Card: 1234-5678-9012-3456');
      expect(result).toContain('****-****-****-****');
    });

    it('should redact bank card numbers', () => {
      const result = redactString('Bank: 6222 0200 1234 5678 901');
      expect(result).toContain('****-****-****-');
    });

    it('should redact email addresses when enabled', () => {
      const result = redactString('Email: test@example.com', { maskEmails: true });
      expect(result).toContain('****@****.***');
    });

    it('should redact IP addresses when enabled', () => {
      const result = redactString('Server: 192.168.1.100', { maskIps: true });
      expect(result).toContain('***.***.***.***');
    });

    it('should not modify clean text', () => {
      const input = 'This is a normal message about trading';
      const result = redactString(input);
      expect(result).toBe(input);
    });

    it('should handle empty string', () => {
      expect(redactString('')).toBe('');
    });
  });

  describe('redactObject', () => {
    it('should redact sensitive fields in objects', () => {
      const obj = {
        api_key: 'sk-abcdefghijklmnopqrstuvwxyz123456',
        password: 'mysecretpassword',
        name: 'John',
        message: 'Hello world',
      };
      const result = redactObject(obj);
      expect(result.api_key).toContain('****');
      expect(result.password).toContain('****');
      expect(result.name).toBe('John');
    });

    it('should redact nested objects', () => {
      const obj = {
        config: {
          api_key: 'secretkey123456789',
          timeout: 5000,
        },
      };
      const result = redactObject(obj);
      expect(result.config.api_key).toContain('****');
      expect(result.config.timeout).toBe(5000);
    });

    it('should redact arrays', () => {
      const obj = {
        items: [
          { api_key: 'key1', name: 'a' },
          { api_key: 'key2', name: 'b' },
        ],
      };
      const result = redactObject(obj);
      expect(result.items[0].api_key).toContain('****');
      expect(result.items[0].name).toBe('a');
    });

    it('should handle null/undefined gracefully', () => {
      expect(redactObject(null)).toBeNull();
      expect(redactObject(undefined)).toBeUndefined();
    });
  });

  describe('containsSensitiveInfo', () => {
    it('should detect API keys', () => {
      expect(containsSensitiveInfo('sk-abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
    });

    it('should detect Chinese phone numbers', () => {
      expect(containsSensitiveInfo('Call 13812345678')).toBe(true);
    });

    it('should detect Chinese ID numbers', () => {
      expect(containsSensitiveInfo('ID 110101199001011234')).toBe(true);
    });

    it('should return false for clean text', () => {
      expect(containsSensitiveInfo('Hello world')).toBe(false);
    });
  });
});
