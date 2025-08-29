import { existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { HOME_DIR } from "../constants";

const LOG_FILE = join(HOME_DIR, "claude-code-router.log");

// Ensure log directory exists
if (!existsSync(HOME_DIR)) {
  mkdirSync(HOME_DIR, { recursive: true });
}

// Global variable to store the logging configuration
let isLogEnabled: boolean | null = null;
let logLevel: string = "info";

// Function to configure logging
export function configureLogging(config: { LOG?: boolean; LOG_LEVEL?: string }) {
  isLogEnabled = config.LOG !== false; // Default to true if not explicitly set to false
  logLevel = config.LOG_LEVEL || "debug";
}

export function log(...args: any[]) {
  // If logging configuration hasn't been set, default to enabled
  if (isLogEnabled === null) {
    isLogEnabled = true;
  }

  if (!isLogEnabled) {
    return;
  }

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${
    Array.isArray(args)
      ? args
          .map((arg) =>
            typeof arg === "object" ? JSON.stringify(arg) : String(arg)
          )
          .join(" ")
      : ""
  }\n`;

  // Append to log file
  appendFileSync(LOG_FILE, logMessage, "utf8");
}

// Add methods for different log levels
export const info = (...args: any[]) => log("INFO:", ...args);
export const warn = (...args: any[]) => log("WARN:", ...args);
export const error = (...args: any[]) => log("ERROR:", ...args);
