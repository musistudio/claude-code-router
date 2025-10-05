import fs from "node:fs/promises";
import path from "node:path";
import { HOME_DIR } from "../constants";

/**
 * Cleans up old log files, keeping only the most recent ones
 * @param maxFiles - Maximum number of log files to keep (default: 9)
 */
export async function cleanupLogFiles(maxFiles: number = 9): Promise<void> {
  try {
    const logsDir = path.join(HOME_DIR, "logs");

    // Check if logs directory exists
    try {
      await fs.access(logsDir);
    } catch {
      // Logs directory doesn't exist, nothing to clean up
      return;
    }

    // Read all files in the logs directory
    const files = await fs.readdir(logsDir);

    // Filter for log files (files starting with 'ccr-' and ending with '.log')
    const logFiles = files
      .filter(file => file.startsWith('ccr-') && file.endsWith('.log'))
      .sort()
      .reverse(); // Sort in descending order (newest first)

    // Delete files exceeding the maxFiles limit
    if (logFiles.length > maxFiles) {
      for (let i = maxFiles; i < logFiles.length; i++) {
        const filePath = path.join(logsDir, logFiles[i]);
        try {
          await fs.unlink(filePath);
        } catch (error) {
          console.warn(`Failed to delete log file ${filePath}:`, error);
        }
      }
    }
  } catch (error) {
    console.warn("Failed to clean up log files:", error);
  }
}
