import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  ApiError,
  ConfigurationError,
  CircuitBreakerError,
  circuitBreaker,
  retryWithBackoff,
  shouldRetry,
  formatErrorMessage,
} from '../src/utils/errorHandler';

describe('Error Handler', () => {
  describe('Custom Error Classes', () => {
    it('should create ApiError with correct properties', () => {
      const error = new ApiError('API failed', 500, 'openrouter', 'gpt-4');
      expect(error.message).toBe('API failed');
      expect(error.statusCode).toBe(500);
      expect(error.provider).toBe('openrouter');
      expect(error.model).toBe('gpt-4');
      expect(error.name).toBe('ApiError');
    });

    it('should create ConfigurationError with correct properties', () => {
      const error = new ConfigurationError('Invalid config', 'api_key');
      expect(error.message).toBe('Invalid config');
      expect(error.field).toBe('api_key');
      expect(error.name).toBe('ConfigurationError');
    });

    it('should create CircuitBreakerError with correct properties', () => {
      const error = new CircuitBreakerError('Provider down', 'openrouter');
      expect(error.message).toBe('Provider down');
      expect(error.provider).toBe('openrouter');
      expect(error.name).toBe('CircuitBreakerError');
    });
  });

  describe('shouldRetry', () => {
    it('should not retry on client errors except 429', () => {
      expect(shouldRetry(new ApiError('Bad request', 400))).toBe(false);
      expect(shouldRetry(new ApiError('Unauthorized', 401))).toBe(false);
      expect(shouldRetry(new ApiError('Not found', 404))).toBe(false);
      expect(shouldRetry(new ApiError('Rate limited', 429))).toBe(true);
    });

    it('should retry on server errors', () => {
      expect(shouldRetry(new ApiError('Server error', 500))).toBe(true);
      expect(shouldRetry(new ApiError('Bad gateway', 502))).toBe(true);
      expect(shouldRetry(new ApiError('Service unavailable', 503))).toBe(true);
    });

    it('should retry on network errors', () => {
      expect(shouldRetry({ code: 'ECONNREFUSED' })).toBe(true);
      expect(shouldRetry({ code: 'ETIMEDOUT' })).toBe(true);
      expect(shouldRetry({ code: 'ENOTFOUND' })).toBe(true);
    });
  });

  describe('formatErrorMessage', () => {
    it('should format ApiError correctly', () => {
      const error = new ApiError('API failed', 500, 'openrouter', 'gpt-4');
      const formatted = formatErrorMessage(error);
      expect(formatted).toBe('API Error (500): API failed [Provider: openrouter] [Model: gpt-4]');
    });

    it('should format ConfigurationError correctly', () => {
      const error = new ConfigurationError('Invalid config', 'api_key');
      const formatted = formatErrorMessage(error);
      expect(formatted).toBe('Configuration Error: Invalid config [Field: api_key]');
    });

    it('should format network errors correctly', () => {
      expect(formatErrorMessage({ code: 'ECONNREFUSED' }))
        .toBe('Connection refused. Please check if the API endpoint is accessible.');
      expect(formatErrorMessage({ code: 'ETIMEDOUT' }))
        .toBe('Request timed out. Please try again or increase the timeout setting.');
      expect(formatErrorMessage({ code: 'ENOTFOUND' }))
        .toBe('DNS lookup failed. Please check the API URL.');
    });
  });

  describe('Circuit Breaker', () => {
    beforeEach(() => {
      // Reset circuit breaker state
      circuitBreaker.reset('test-provider');
    });

    it('should open circuit after threshold failures', () => {
      const provider = 'test-provider';
      
      // Should be closed initially
      expect(circuitBreaker.isOpen(provider)).toBe(false);
      
      // Record failures up to threshold
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure(provider);
      }
      
      // Should be open after threshold
      expect(circuitBreaker.isOpen(provider)).toBe(true);
    });

    it('should close circuit after successful requests in half-open state', () => {
      const provider = 'test-provider';
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure(provider);
      }
      
      expect(circuitBreaker.isOpen(provider)).toBe(true);
      
      // Record successes
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordSuccess(provider);
      }
      
      // Should eventually close
      expect(circuitBreaker.isOpen(provider)).toBe(false);
    });
  });

  describe('retryWithBackoff', () => {
    it('should retry failed operations', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await retryWithBackoff(operation, { retries: 3, minTimeout: 10 });
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      const operation = async () => {
        throw new Error('Permanent failure');
      };

      await expect(retryWithBackoff(operation, { retries: 2, minTimeout: 10 }))
        .rejects.toThrow('Permanent failure');
    });
  });
});