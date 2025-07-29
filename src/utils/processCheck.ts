import { existsSync, readFileSync, writeFileSync } from 'fs';
import {getPidFile, getReferenceCountFile, PID_FILE, REFERENCE_COUNT_FILE} from '@/constants';
import { readConfigFile } from '.';

// Atomically increment service reference count to track active users
export function incrementReferenceCount() {
    let count = 0;
    const referenceCountFile = getReferenceCountFile();
    if (existsSync(referenceCountFile)) {
        count = parseInt(readFileSync(referenceCountFile, 'utf-8')) || 0;
    }
    count++;
    writeFileSync(referenceCountFile, count.toString());
}

// Safely decrement reference count with floor at zero to prevent negative values
export function decrementReferenceCount() {
    let count = 0;
    const referenceCountFile = getReferenceCountFile();
    if (existsSync(referenceCountFile)) {
        count = parseInt(readFileSync(referenceCountFile, 'utf-8')) || 0;
    }
    count = Math.max(0, count - 1);
    writeFileSync(referenceCountFile, count.toString());
}

export function getReferenceCount(): number {
    const referenceCountFile = getReferenceCountFile();
    if (!existsSync(referenceCountFile)) {
        return 0;
    }
    return parseInt(readFileSync(referenceCountFile, 'utf-8')) || 0;
}

// Check if service is actively running by verifying PID file and process existence
export function isServiceRunning(pid_file= PID_FILE): boolean {
    if (!existsSync(pid_file)) {
        return false;
    }

    try {
        const pid = parseInt(readFileSync(pid_file, 'utf-8'));
        process.kill(pid, 0);
        return true;
    } catch (e) {
        // Process not running, clean up pid file
        cleanupPidFile(pid_file);
        return false;
    }
}

// Persist current process ID to file for lifecycle management and status checks
export function savePid(pid: number, pidFile = PID_FILE) {
    writeFileSync(pidFile, pid.toString());
}

// Remove PID file when service terminates to prevent stale process detection
export function cleanupPidFile(pidFile = PID_FILE) {
    if (existsSync(pidFile)) {
        try {
            const fs = require('fs');
            fs.unlinkSync(pidFile);
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

export function getServicePid(pidFile = PID_FILE): number | null {
    if (!existsSync(pidFile)) {
        return null;
    }
    
    try {
        const pid = parseInt(readFileSync(pidFile, 'utf-8'));
        return isNaN(pid) ? null : pid;
    } catch (e) {
        return null;
    }
}

// Aggregate service status information for CLI status reporting and monitoring
export async function getServiceInfo() {

    const pidFile = getPidFile()
    const pid = getServicePid(pidFile);
    const running = isServiceRunning(pidFile);
    const config = await readConfigFile();
    
    return {
        running,
        pid,
        port: config.PORT,
        endpoint: `http://127.0.0.1:${config.PORT}`,
        pidFile,
        referenceCount: getReferenceCount()
    };
}
