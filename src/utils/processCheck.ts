import { existsSync, readFileSync, writeFileSync } from 'fs';
import { PID_FILE, REFERENCE_COUNT_FILE } from '../constants';
import { readConfigFile } from '.';
import find from 'find-process';
import { execSync } from 'child_process'; // 引入 execSync 来执行命令行

export async function isProcessRunning(pid: number): Promise<boolean> {
    try {
        const processes = await find('pid', pid);
        return processes.length > 0;
    } catch (error) {
        return false;
    }
}

export function incrementReferenceCount() {
    let count = 0;
    if (existsSync(REFERENCE_COUNT_FILE)) {
        count = parseInt(readFileSync(REFERENCE_COUNT_FILE, 'utf-8')) || 0;
    }
    count++;
    writeFileSync(REFERENCE_COUNT_FILE, count.toString());
}

export function decrementReferenceCount() {
    let count = 0;
    if (existsSync(REFERENCE_COUNT_FILE)) {
        count = parseInt(readFileSync(REFERENCE_COUNT_FILE, 'utf-8')) || 0;
    }
    count = Math.max(0, count - 1);
    writeFileSync(REFERENCE_COUNT_FILE, count.toString());
}

export function getReferenceCount(): number {
    if (!existsSync(REFERENCE_COUNT_FILE)) {
        return 0;
    }
    return parseInt(readFileSync(REFERENCE_COUNT_FILE, 'utf-8')) || 0;
}

export function isServiceRunning(): boolean {
    if (!existsSync(PID_FILE)) {
        return false;
    }

    let pid: number;
    try {
        const pidStr = readFileSync(PID_FILE, 'utf-8');
        pid = parseInt(pidStr, 10);
        if (isNaN(pid)) {
            // PID 文件内容无效
            cleanupPidFile();
            return false;
        }
    } catch (e) {
        // 读取文件失败
        return false;
    }

    try {
        if (process.platform === 'win32') {
            // --- Windows 平台逻辑 ---
            // 使用 tasklist 命令并通过 PID 过滤器查找进程
            // stdio: 'pipe' 压制命令的输出，防止其显示在控制台
            const command = `tasklist /FI "PID eq ${pid}"`;
            const output = execSync(command, { stdio: 'pipe' }).toString();

            // 如果输出中包含了 PID，说明进程存在
            // tasklist 找不到进程时会返回 "INFO: No tasks are running..."
            // 所以一个简单的包含检查就足够了
            if (output.includes(pid.toString())) {
                return true;
            } else {
                // 理论上如果 tasklist 成功执行但没找到，这里不会被命中
                // 但作为保险，我们仍然认为进程不存在
                cleanupPidFile();
                return false;
            }

        } else {
            // --- Linux, macOS 等其他平台逻辑 ---
            // 使用信号 0 来检查进程是否存在，这不会真的杀死进程
            process.kill(pid, 0);
            return true; // 如果没有抛出异常，说明进程存在
        }
    } catch (e) {
        // 捕获到异常，说明进程不存在 (无论是 kill 还是 execSync 失败)
        // 清理掉无效的 PID 文件
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
            const fs = require('fs');
            fs.unlinkSync(PID_FILE);
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
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8'));
        return isNaN(pid) ? null : pid;
    } catch (e) {
        return null;
    }
}

export async function getServiceInfo() {
    const pid = getServicePid();
    const running = await isServiceRunning();
    const config = await readConfigFile();
    const port = config.PORT || 3456;

    return {
        running,
        pid,
        port,
        endpoint: `http://127.0.0.1:${port}`,
        pidFile: PID_FILE,
        referenceCount: getReferenceCount()
    };
}
