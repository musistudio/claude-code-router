import { isServiceRunning, cleanupPidFile, getReferenceCount } from './processCheck';
import { readFileSync } from 'fs';
import { HOME_DIR } from '../constants';
import { join } from 'path';

export async function closeService() {
    const PID_FILE = join(HOME_DIR, '.claude-code-router.pid');
    const isRunning = await isServiceRunning()
    
    if (!isRunning) {
        console.log("ℹ️  No service is currently running.");
        // Still try to cleanup any remaining processes
        await forceCleanupAllProcesses();
        return;
    }

    const refCount = getReferenceCount();
    if (refCount > 0 && !force) {
        console.log(`⚠️  Other processes are still using the service (count: ${refCount}). Keeping it running.`);
        console.log("💡 Use force cleanup if needed: run './cleanup.sh' or restart with 'ccr restart'");
        return;
    }

    try {
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8'));
        console.log(`🔄 Stopping main service process (PID: ${pid})...`);
        process.kill(pid, 'SIGTERM');
        
        // Wait a bit for graceful shutdown
        setTimeout(() => {
            try {
                process.kill(pid, 0); // Check if still running
                console.log("⚡ Force killing main process...");
                process.kill(pid, 'SIGKILL');
            } catch (e) {
                // Process already stopped
            }
        }, 2000);
        
        cleanupPidFile();
        console.log("claude code router service has been successfully stopped.");
    } catch (e) {
        console.log("⚠️  Failed to stop the main service. Attempting force cleanup...");
        cleanupPidFile();
        await forceCleanupAllProcesses();
    }
}

async function forceCleanupAllProcesses(): Promise<void> {
    return new Promise((resolve) => {
        console.log("🧹 Force cleaning up all related processes...");
        
        // Reset reference count
        const REFERENCE_COUNT_FILE = join(HOME_DIR, '../..', 'tmp', 'claude-code-reference-count.txt');
        try {
            require('fs').unlinkSync(REFERENCE_COUNT_FILE);
            console.log("🗑️  Reset reference count file");
        } catch (e) {
            // File doesn't exist or couldn't delete
        }
        
        // Kill all ccr processes
        exec('pkill -f "ccr" 2>/dev/null || true', (error) => {
            // Kill all claude-code-router processes
            exec('pkill -f "claude-code-router" 2>/dev/null || true', (error) => {
                // Kill processes on port 3456
                exec('lsof -ti:3456 | xargs kill -9 2>/dev/null || true', (error) => {
                    console.log("✅ Force cleanup completed.");
                    resolve();
                });
            });
        });
    });
}
