import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { readFileSync } from "fs";

const execPromise = promisify(exec);

/**
 * Check if new version is available
 * @param currentVersion Current version
 * @returns Object containing update information
 */
export async function checkForUpdates(currentVersion: string) {
  try {
    // Get latest version info from npm registry
    const { stdout } = await execPromise("npm view @musistudio/claude-code-router version");
    const latestVersion = stdout.trim();
    
    // Compare versions
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
    
    // If there is an update, get changelog
    let changelog = "";
    
    return { hasUpdate, latestVersion, changelog };
  } catch (error) {
    console.error("Error checking for updates:", error);
    // If check fails, assume no update
    return { hasUpdate: false, latestVersion: currentVersion, changelog: "" };
  }
}

/**
 * Perform update operation
 * @returns Update result
 */
export async function performUpdate() {
  try {
    // Execute npm update command
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
 * Compare two version numbers
 * @param v1 Version number 1
 * @param v2 Version number 2
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