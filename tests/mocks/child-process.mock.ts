/**
 * Child Process Mock Utilities
 */
import { EventEmitter } from 'events';

/**
 * Create a mock child process
 */
export function createMockChildProcess(exitCode: number = 0, signal?: string) {
  const mockProcess = new EventEmitter();

  // Mock process properties
  (mockProcess as any).pid = 12345;
  (mockProcess as any).stdin = {
    end: jest.fn(),
    write: jest.fn(),
  };
  (mockProcess as any).stdout = new EventEmitter();
  (mockProcess as any).stderr = new EventEmitter();
  (mockProcess as any).kill = jest.fn();
  (mockProcess as any).unref = jest.fn();

  // Simulate process completion after a short delay
  setTimeout(() => {
    if (signal) {
      mockProcess.emit('close', null, signal);
    } else {
      mockProcess.emit('close', exitCode);
    }
  }, 10);

  return mockProcess;
}

/**
 * Mock spawn function
 */
export function createMockSpawn(exitCode: number = 0) {
  return jest.fn(() => createMockChildProcess(exitCode));
}

/**
 * Mock exec function
 */
export function createMockExec(stdout: string = '', stderr: string = '', error?: Error) {
  return jest.fn((command: string, callback?: (error: Error | null, stdout: string, stderr: string) => void) => {
    if (callback) {
      setTimeout(() => {
        callback(error || null, stdout, stderr);
      }, 10);
    }
    return createMockChildProcess(error ? 1 : 0);
  });
}

/**
 * Mock execPromise function (promisified exec)
 */
export function createMockExecPromise(stdout: string = '', stderr: string = '', shouldReject: boolean = false) {
  return jest.fn(async (command: string) => {
    if (shouldReject) {
      throw new Error(stderr || 'Command failed');
    }
    return { stdout, stderr };
  });
}
