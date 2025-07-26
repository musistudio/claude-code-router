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

export function log(...args: any[]) {
  // Check if logging is enabled via environment variable
  const isLogEnabled = process.env.LOG === "true";

  if (!isLogEnabled) {
    return;
  }

  // const logMessage = Array.isArray(args) ? args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ") : "";

  logger.info(args);
}
