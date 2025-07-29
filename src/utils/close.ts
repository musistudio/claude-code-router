import { isServiceRunning, cleanupPidFile, getReferenceCount } from './processCheck';
import { readFileSync } from 'fs';
import { getPidFile} from '@/constants';

export async function closeService() {

    const pidFile = getPidFile()
    
    if (!isServiceRunning(pidFile)) {
        console.log("No service is currently running.");
        return;
    }

    if (getReferenceCount() > 0) {
        return;
    }

    try {
        const pid = parseInt(readFileSync(pidFile, 'utf-8'));
        process.kill(pid);
        cleanupPidFile(pidFile);
        console.log("claude code router service has been successfully stopped.");
    } catch (e) {
        console.log("Failed to stop the service. It may have already been stopped.");
        cleanupPidFile(pidFile);
    }
}
