import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { RUNTIME_FILE } from '../constants';

export { RUNTIME_FILE };

/**
 * Runtime state interface - represents the actual running state of the service
 */
export interface RuntimeState {
  port: number;
  host: string;
  startTime: string; // ISO 8601 format
}

/**
 * Save runtime state to the runtime file
 * @param state - The runtime state to persist
 */
export function saveRuntimeState(state: RuntimeState): void {
  try {
    writeFileSync(RUNTIME_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    // Log warning but don't block service startup
    console.warn('Failed to save runtime state:', error);
  }
}

/**
 * Read runtime state from the runtime file
 * @returns The runtime state or null if file doesn't exist or is invalid
 */
export function getRuntimeState(): RuntimeState | null {
  if (!existsSync(RUNTIME_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(RUNTIME_FILE, 'utf-8');
    const state = JSON.parse(content) as RuntimeState;
    
    // Validate required fields
    if (typeof state.port !== 'number' || typeof state.host !== 'string') {
      return null;
    }
    
    return state;
  } catch (error) {
    // File is corrupted or unreadable, return null to fallback to config
    return null;
  }
}

/**
 * Clean up the runtime state file
 * Should be called when the service stops
 */
export function cleanupRuntimeState(): void {
  if (existsSync(RUNTIME_FILE)) {
    try {
      unlinkSync(RUNTIME_FILE);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Get the runtime port with fallback to config port
 * @param configPort - The port from config file to use as fallback
 * @returns The actual runtime port or the config port if runtime state is unavailable
 */
export function getRuntimePort(configPort: number): number {
  const runtimeState = getRuntimeState();
  return runtimeState?.port ?? configPort;
}
