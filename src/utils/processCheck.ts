import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { PID_FILE, REFERENCE_COUNT_FILE } from '../constants';
import { readConfigFile } from '.';

export function incrementReferenceCount() {
    let count = 0;
    if (existsSync(REFERENCE_COUNT_FILE)) {
        count = parseInt(readFileSync(REFERENCE_COUNT_FILE, 'utf-8'), 10) || 0;
    }
    count++;
    writeFileSync(REFERENCE_COUNT_FILE, count.toString());
}

export function decrementReferenceCount() {
    let count = 0;
    if (existsSync(REFERENCE_COUNT_FILE)) {
        count = parseInt(readFileSync(REFERENCE_COUNT_FILE, 'utf-8'), 10) || 0;
    }
    count = Math.max(0, count - 1);
    writeFileSync(REFERENCE_COUNT_FILE, count.toString());
}

export function getReferenceCount(): number {
    if (!existsSync(REFERENCE_COUNT_FILE)) {
        return 0;
    }
    return parseInt(readFileSync(REFERENCE_COUNT_FILE, 'utf-8'), 10) || 0;
}

export function isServiceRunning(): boolean {
    if (!existsSync(PID_FILE)) {
        return false;
    }

    try {
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8'), 10);
        process.kill(pid, 0);
        return true;
    } catch (e) {
        // Process not running, clean up pid file
        cleanupPidFile();
        return false;
    }
}

export function savePid(pid: number) {
    writeFileSync(PID_FILE, pid.toString());
}

export function cleanupPidFile() {
    if (existsSync(PID_FILE)) {
        try {
            unlinkSync(PID_FILE);
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

export function getServicePid(): number | null {
    if (!existsSync(PID_FILE)) {
        return null;
    }
    
    try {
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8'), 10);
        return isNaN(pid) ? null : pid;
    } catch (e) {
        return null;
    }
}

export async function getServiceInfo() {
    const pid = getServicePid();
    const running = isServiceRunning();
    const config = await readConfigFile();
    
    return {
        running,
        pid,
        port: config.PORT,
        endpoint: `http://127.0.0.1:${config.PORT}`,
        pidFile: PID_FILE,
        referenceCount: getReferenceCount()
    };
}