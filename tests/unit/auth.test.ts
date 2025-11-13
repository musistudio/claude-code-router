/**
 * Authentication Unit Tests
 * Tests for src/middleware/auth.ts
 */

import { apiKeyAuth } from '../../src/middleware/auth';

describe('Authentication Middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let mockDone: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      url: '/v1/messages',
      headers: {},
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
    };

    mockDone = jest.fn();
  });

  describe('Public Endpoints', () => {
    it('should allow access to / without authentication', async () => {
      mockRequest.url = '/';
      const config = { APIKEY: 'test-key' };

      await apiKeyAuth(config)(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should allow access to /health without authentication', async () => {
      mockRequest.url = '/health';
      const config = { APIKEY: 'test-key' };

      await apiKeyAuth(config)(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should allow access to /ui/* without authentication', async () => {
      mockRequest.url = '/ui/index.html';
      const config = { APIKEY: 'test-key' };

      await apiKeyAuth(config)(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
      expect(mockReply.status).not.toHaveBeenCalled();
    });
  });

  describe('No API Key Configured', () => {
    it('should allow local requests when no API key is set', async () => {
      mockRequest.headers.origin = 'http://127.0.0.1:3456';
      const config = { PORT: 3456 };

      await apiKeyAuth(config)(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
      expect(mockReply.header).toHaveBeenCalled();
    });

    it('should reject non-local requests when no API key is set', async () => {
      mockRequest.headers.origin = 'http://evil.com';
      const config = { PORT: 3456 };

      await apiKeyAuth(config)(mockRequest, mockReply, mockDone);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith('CORS not allowed for this origin');
    });
  });

  describe('API Key Authentication', () => {
    it('should reject requests without API key', async () => {
      const config = { APIKEY: 'test-api-key' };

      await apiKeyAuth(config)(mockRequest, mockReply, mockDone);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith('APIKEY is missing');
    });

    it('should accept valid API key in authorization header', async () => {
      mockRequest.headers.authorization = 'Bearer test-api-key';
      const config = { APIKEY: 'test-api-key' };

      await apiKeyAuth(config)(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should accept valid API key in x-api-key header', async () => {
      mockRequest.headers['x-api-key'] = 'test-api-key';
      const config = { APIKEY: 'test-api-key' };

      await apiKeyAuth(config)(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject invalid API key', async () => {
      mockRequest.headers.authorization = 'Bearer wrong-key';
      const config = { APIKEY: 'test-api-key' };

      await apiKeyAuth(config)(mockRequest, mockReply, mockDone);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith('Invalid API key');
    });

    it('should handle array header values', async () => {
      mockRequest.headers['x-api-key'] = ['test-api-key', 'another-key'];
      const config = { APIKEY: 'test-api-key' };

      await apiKeyAuth(config)(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should strip Bearer prefix from token', async () => {
      mockRequest.headers.authorization = 'Bearer test-api-key';
      const config = { APIKEY: 'test-api-key' };

      await apiKeyAuth(config)(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
    });

    it('should handle token without Bearer prefix', async () => {
      mockRequest.headers['x-api-key'] = 'test-api-key';
      const config = { APIKEY: 'test-api-key' };

      await apiKeyAuth(config)(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
    });
  });
});
