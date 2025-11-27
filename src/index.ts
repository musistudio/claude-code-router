import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import path, { join } from "path";
import { initConfig, initDir, cleanupLogFiles } from "./utils";
import { createServer } from "./server";
import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { CONFIG_FILE, HOME_DIR } from "./constants";
import { createStream } from 'rotating-file-stream';
import {
  setupRequestLoggingHook,
  setupResponseLoggingHook,
  setupAuthHook,
  setupAgentAndRoutingHook,
  setupErrorEventHook,
  setupSendEventHook,
  setupAgentProcessingHook
} from "./utils/hooks";
import { EventEmitter } from "node:events";

const event = new EventEmitter()

/**
 * Initialize Claude configuration file
 */
async function initializeClaudeConfig(): Promise<void> {
  const homeDir = homedir();
  const configPath = join(homeDir, ".claude.json");
  if (!existsSync(configPath)) {
    const userId = Array.from(
      { length: 64 },
      () => Math.random().toString(16)[2]
    ).join("");
    const configContent = {
      numStartups: 184,
      autoUpdaterStatus: "enabled",
      userID: userId,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "1.0.17",
      projects: {},
    };
    await writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}

/**
 * Set up process signal handlers for graceful shutdown
 */
function setupSignalHandlers(): void {
  const handleShutdown = (signal: string) => {
    console.log(`Received ${signal}, cleaning up...`);
    cleanupPidFile();
    process.exit(0);
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

/**
 * Pads a number with leading zero if needed
 */
function padNumber(num: number): string {
  return (num > 9 ? "" : "0") + num;
}

/**
 * Configure logger based on config settings
 */
function configureLogger(config: any, homeDir: string) {
  return config.LOG !== false
    ? {
        level: config.LOG_LEVEL || "debug",
        stream: createStream((time, index) => {
          if (!time) {
            time = new Date();
          }

          const yearAndMonth = time.getFullYear() + "" + padNumber(time.getMonth() + 1);
          const day = padNumber(time.getDate());
          const hour = padNumber(time.getHours());
          const minute = padNumber(time.getMinutes());
          const second = padNumber(time.getSeconds());

          return `./logs/ccr-${yearAndMonth}${day}${hour}${minute}${second}${index ? `_${index}` : ''}.log`;
        }, {
          path: homeDir,
          maxFiles: 3,
          interval: "1d",
          compress: false,
          maxSize: "50M"
        }),
      }
    : false;
}

interface RunOptions {
  port?: number;
}

/**
 * Initialize application configuration and directories
 */
async function initializeApp(): Promise<any> {
  await initializeClaudeConfig();
  await initDir();
  await cleanupLogFiles();
  return await initConfig();
}

// Configuration constants
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3456;

/**
 * Resolve host configuration with security considerations
 */
function resolveHostConfig(config: any): string {
  let host = config.HOST || DEFAULT_HOST;

  if (config.HOST && !config.APIKEY) {
    host = DEFAULT_HOST;
    console.warn("⚠️ API key is not set. HOST is forced to 127.0.0.1 for security.");
  }

  return host;
}

/**
 * Resolve service port configuration from environment or config
 */
function resolveServicePort(config: any): number {
  const configPort = config.PORT || DEFAULT_PORT;
  const envPort = process.env.SERVICE_PORT;

  if (envPort) {
    const parsedEnvPort = parseInt(envPort, 10);
    if (isNaN(parsedEnvPort)) {
      console.warn(`⚠️ Invalid SERVICE_PORT: ${envPort}. Using default port ${configPort}.`);
      return configPort;
    }
    return parsedEnvPort;
  }

  return configPort;
}

/**
 * Setup global error handlers for the process
 */
function setupGlobalErrorHandlers(server: any): void {
  process.on("uncaughtException", (err) => {
    server.logger.error("Uncaught exception:", err);
  });

  process.on("unhandledRejection", (reason, promise) => {
    server.logger.error("Unhandled rejection at:", promise, "reason:", reason);
  });
}

async function run(options: RunOptions = {}): Promise<void> {
  // Check if service is already running
  const isRunning = await isServiceRunning();
  if (isRunning) {
    console.log("✅ Service is already running in the background.");
    return;
  }

  // Initialize application
  const config = await initializeApp();
  const host = resolveHostConfig(config);
  const servicePort = resolveServicePort(config);

  // Save the PID and set up signal handlers
  savePid(process.pid);
  setupSignalHandlers();

  // Configure logger
  const loggerConfig = configureLogger(config, HOME_DIR);

  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      providers: config.Providers || config.providers,
      HOST: host,
      PORT: servicePort,
      LOG_FILE: join(
        homedir(),
        ".claude-code-router",
        "claude-code-router.log"
      ),
    },
    logger: loggerConfig,
  });

  // Setup global error handlers and hooks
  setupGlobalErrorHandlers(server);
  setupRequestLoggingHook(server);
  setupResponseLoggingHook(server);
  setupAuthHook(server, config);
  setupAgentAndRoutingHook(server, config, event);
  setupErrorEventHook(server, event);
  setupSendEventHook(server, event);
  setupAgentProcessingHook(server, config);

  server.start();
}

export { run };
