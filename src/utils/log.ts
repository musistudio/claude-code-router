import winston from "winston";
import path from "node:path";
import { HOME_DIR } from "../constants";

const LOG_FILE = path.join(HOME_DIR, "claude-code-router.log");

// Create logger with winston
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, message }) => {
      return `[${timestamp}] -- ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: LOG_FILE,
      maxsize: 1024 * 1024 * 2, // 2MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

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

  // const logMessage = Array.isArray(args) ? args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ") : "";

  logger.info(args);
}
