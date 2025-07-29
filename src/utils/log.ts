import fs from "node:fs";
import path from "node:path";
import { HOME_DIR } from "@/constants";

const LOG_FILE = path.join(HOME_DIR, "claude-code-router.log");

// Ensure log directory exists
if (!fs.existsSync(HOME_DIR)) {
  fs.mkdirSync(HOME_DIR, { recursive: true });
}

export function log(...args: any[]) {
  // Check if logging is enabled via environment variable
  const isLogEnabled = process.env.LOG === "true";

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
  fs.appendFileSync(LOG_FILE, logMessage, "utf8");
}
