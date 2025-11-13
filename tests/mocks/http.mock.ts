/**
 * HTTP Mock Utilities using nock
 */
import nock from 'nock';
import { createMockResponse, createMockSSEStream } from './anthropic.mock';

/**
 * Mock the Anthropic API endpoint
 */
export function mockAnthropicAPI(
  port: number = 3456,
  responseText: string = 'Mock response',
  statusCode: number = 200
) {
  return nock(`http://127.0.0.1:${port}`)
    .post('/v1/messages')
    .reply(statusCode, createMockResponse(responseText));
}

/**
 * Mock the Anthropic API with streaming response
 */
export function mockAnthropicStreamingAPI(
  port: number = 3456,
  responseText: string = 'Mock streaming response'
) {
  return nock(`http://127.0.0.1:${port}`)
    .post('/v1/messages')
    .reply(200, createMockSSEStream(responseText), {
      'Content-Type': 'text/event-stream',
    });
}

/**
 * Mock the Anthropic API with error
 */
export function mockAnthropicAPIError(
  port: number = 3456,
  errorMessage: string = 'API Error',
  statusCode: number = 500
) {
  return nock(`http://127.0.0.1:${port}`)
    .post('/v1/messages')
    .reply(statusCode, {
      error: {
        type: 'api_error',
        message: errorMessage,
      },
    });
}

/**
 * Mock token counting endpoint
 */
export function mockTokenCountingAPI(
  port: number = 3456,
  tokenCount: number = 100
) {
  return nock(`http://127.0.0.1:${port}`)
    .post('/v1/messages/count_tokens')
    .reply(200, {
      input_tokens: tokenCount,
    });
}

/**
 * Clean up all HTTP mocks
 */
export function cleanupHTTPMocks() {
  nock.cleanAll();
}

/**
 * Enable HTTP request logging (useful for debugging)
 */
export function enableHTTPLogging() {
  nock.recorder.rec({
    output_objects: true,
    dont_print: false,
  });
}
