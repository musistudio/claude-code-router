/**
 * Jest Test Setup
 * Runs before all tests to configure the test environment
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG = 'false';
process.env.PORT = '3456';

// Silence console output during tests (optional)
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set up global test timeout
jest.setTimeout(10000);
