import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { HOME_DIR, CONFIG_FILE } from '../constants';
import { createHash } from 'crypto';

export interface InstanceInfo {
  pid: number;
  port: number;
  configPath: string;
  configHash: string;
  startedAt: number;
}

export interface InstanceRegistry {
  instances: Record<string, InstanceInfo>;
}

const INSTANCES_FILE = join(HOME_DIR, '.instances.json');

/**
 * Generate a unique instance ID based on config file path
 */
export function getInstanceId(configPath: string): string {
  return createHash('md5').update(configPath).digest('hex').substring(0, 12);
}

/**
 * Get the PID file path for a specific instance
 */
export function getInstancePidFile(instanceId: string): string {
  return join(HOME_DIR, `.instance-${instanceId}.pid`);
}

/**
 * Load the instances registry
 */
export function loadInstanceRegistry(): InstanceRegistry {
  if (!existsSync(INSTANCES_FILE)) {
    return { instances: {} };
  }

  try {
    const content = readFileSync(INSTANCES_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('Failed to load instances registry, creating new one');
    return { instances: {} };
  }
}

/**
 * Save the instances registry
 */
export function saveInstanceRegistry(registry: InstanceRegistry): void {
  try {
    writeFileSync(INSTANCES_FILE, JSON.stringify(registry, null, 2));
  } catch (error) {
    console.error('Failed to save instances registry:', error);
  }
}

/**
 * Register a new instance
 */
export function registerInstance(instanceId: string, info: InstanceInfo): void {
  const registry = loadInstanceRegistry();
  registry.instances[instanceId] = info;
  saveInstanceRegistry(registry);

  // Also save PID to instance-specific PID file for backward compatibility
  const pidFile = getInstancePidFile(instanceId);
  writeFileSync(pidFile, info.pid.toString());
}

/**
 * Unregister an instance
 */
export function unregisterInstance(instanceId: string): void {
  const registry = loadInstanceRegistry();
  delete registry.instances[instanceId];
  saveInstanceRegistry(registry);

  // Clean up instance-specific PID file
  const pidFile = getInstancePidFile(instanceId);
  if (existsSync(pidFile)) {
    try {
      unlinkSync(pidFile);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Get instance info by ID
 */
export function getInstance(instanceId: string): InstanceInfo | null {
  const registry = loadInstanceRegistry();
  return registry.instances[instanceId] || null;
}

/**
 * Get instance info by config path
 */
export function getInstanceByConfigPath(configPath: string): InstanceInfo | null {
  const instanceId = getInstanceId(configPath);
  return getInstance(instanceId);
}

/**
 * Get all running instances
 */
export function getAllInstances(): Record<string, InstanceInfo> {
  const registry = loadInstanceRegistry();
  return registry.instances;
}

/**
 * Find an available port starting from the given port
 */
export async function findAvailablePort(startPort: number = 3456): Promise<number> {
  const net = require('net');

  return new Promise((resolve, reject) => {
    const server = net.createServer();
    let port = startPort;

    const tryPort = () => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          port++;
          if (port > startPort + 100) {
            reject(new Error('No available port found'));
            return;
          }
          server.close(() => tryPort());
        } else {
          reject(err);
        }
      });

      server.once('listening', () => {
        server.close(() => resolve(port));
      });

      server.listen(port, '127.0.0.1');
    };

    tryPort();
  });
}

/**
 * Check if a process is running
 */
export function isProcessRunning(pid: number): boolean {
  try {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      const output = execSync(`tasklist /FI "PID eq ${pid}"`, { stdio: 'pipe' }).toString();
      return output.includes(pid.toString());
    } else {
      // Use signal 0 to check if process exists
      process.kill(pid, 0);
      return true;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Check if an instance is running
 */
export function isInstanceRunning(instanceId: string): boolean {
  const instance = getInstance(instanceId);
  if (!instance) {
    return false;
  }

  const running = isProcessRunning(instance.pid);

  // Clean up if process is not running
  if (!running) {
    unregisterInstance(instanceId);
  }

  return running;
}

/**
 * Clean up all dead instances
 */
export function cleanupDeadInstances(): void {
  const registry = loadInstanceRegistry();
  const instanceIds = Object.keys(registry.instances);

  for (const instanceId of instanceIds) {
    if (!isInstanceRunning(instanceId)) {
      unregisterInstance(instanceId);
    }
  }
}

/**
 * Get the config path for an instance (defaults to the standard config if not specified)
 */
export function getConfigPath(configArg?: string): string {
  if (configArg) {
    // If it's a relative path, resolve it from current directory
    if (!configArg.startsWith('/') && !configArg.startsWith('~')) {
      return join(process.cwd(), configArg);
    }
    // Expand ~ to home directory
    if (configArg.startsWith('~')) {
      return join(require('os').homedir(), configArg.substring(1));
    }
    return configArg;
  }
  return CONFIG_FILE;
}
