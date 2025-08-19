import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { readFileSync } from "fs";

const execPromise = promisify(exec);

/**
 * 检查是否有新版本可用
 * @param currentVersion 当前版本
 * @returns 包含更新信息的对象
 */
export async function checkForUpdates(currentVersion: string) {
  try {
    // 从npm registry获取最新版本信息
    const { stdout } = await execPromise("npm view @musistudio/claude-code-router version");
    const latestVersion = stdout.trim();
    
    // 比较版本
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
    
    // 如果有更新，获取更新日志
    let changelog = "";
    
    return { hasUpdate, latestVersion, changelog };
  } catch (error) {
    console.error("Error checking for updates:", error);
    // 如果检查失败，假设没有更新
    return { hasUpdate: false, latestVersion: currentVersion, changelog: "" };
  }
}

/**
 * 执行更新操作
 * @returns 更新结果
 */
export async function performUpdate() {
  try {
    // 执行npm update命令
    const { stdout, stderr } = await execPromise("npm update -g @musistudio/claude-code-router");
    
    if (stderr) {
      console.error("Update stderr:", stderr);
    }
    
    console.log("Update stdout:", stdout);
    
    return { 
      success: true, 
      message: "Update completed successfully. Please restart the application to apply changes." 
    };
  } catch (error) {
    console.error("Error performing update:", error);
    return { 
      success: false, 
      message: `Failed to perform update: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * 比较两个版本号
 * @param v1 版本号1
 * @param v2 版本号2
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = i < parts1.length ? parts1[i] : 0;
    const num2 = i < parts2.length ? parts2[i] : 0;
    
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  
  return 0;
}