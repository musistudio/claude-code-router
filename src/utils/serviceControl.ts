import { existsSync, unlinkSync, readFileSync } from 'fs';
import { PID_FILE, REFERENCE_COUNT_FILE } from '../constants';
import { cleanupPidFile } from './processCheck';
import { logger } from './logger';

export interface StopServiceOptions {
  force?: boolean;
  timeout?: number;
}

/**
 * Stops the service gracefully with timeout and force options
 * @param options Options for stopping the service
 * @returns true if service was stopped successfully
 */
export async function stopService(options: StopServiceOptions = {}): Promise<boolean> {
  const { force = false, timeout = 5000 } = options;

  if (!existsSync(PID_FILE)) {
    logger.debug('No PID file found, service not running');
    return false;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8'), 10);

    // Send SIGTERM for graceful shutdown
    process.kill(pid, 'SIGTERM');
    logger.info('Sent SIGTERM to service', { pid });

    // Wait for graceful shutdown
    const checkInterval = 500;
    const maxChecks = Math.floor(timeout / checkInterval);
    let stopped = false;

    for (let i = 0; i < maxChecks; i++) {
      try {
        process.kill(pid, 0); // Check if process is still running
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch {
        stopped = true;
        break;
      }
    }

    // Force kill if not stopped and force option is true
    if (!stopped && force) {
      logger.warn('Service did not stop gracefully, forcing shutdown', { pid });
      process.kill(pid, 'SIGKILL');
      stopped = true;
    }

    if (stopped) {
      cleanupPidFile();

      // Clean up reference count file
      if (existsSync(REFERENCE_COUNT_FILE)) {
        try {
          unlinkSync(REFERENCE_COUNT_FILE);
        } catch (e) {
          logger.debug('Failed to remove reference count file', { error: e });
        }
      }

      logger.info('Service stopped successfully', { pid });
    }

    return stopped;
  } catch (error: any) {
    logger.error('Failed to stop service', { error: error.message });
    cleanupPidFile();
    return false;
  }
}

/**
 * Wrapper for CLI stop command
 */
export async function handleStopCommand(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    console.log('Service is not running.');
    return;
  }

  const stopped = await stopService({ force: true, timeout: 5000 });

  if (stopped) {
    console.log('✅ Claude Code Router service has been successfully stopped.');
  } else {
    console.log('Failed to stop the service. It may have already been stopped.');
  }
}
