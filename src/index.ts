import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { initConfig, initDir, stopConfigWatcher, getCurrentConfig } from "./utils";
import { createServer } from "./server";
import { router } from "./utils/router";
import { apiKeyAuth } from "./middleware/auth";
import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { CONFIG_FILE } from "./constants";
import { log } from "./utils/log";
import { AppConfig } from "./types/config";

async function initializeClaudeConfig() {
  const homeDir = homedir();
  const configPath = join(homeDir, ".claude.json");
  if (!existsSync(configPath)) {
    const userID = Array.from(
      { length: 64 },
      () => Math.random().toString(16)[2]
    ).join("");
    const configContent = {
      numStartups: 184,
      autoUpdaterStatus: "enabled",
      userID,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "1.0.17",
      projects: {},
    };
    await writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}

interface RunOptions {
  port?: number;
}

async function run(options: RunOptions = {}) {
  // Check if service is already running
  if (isServiceRunning()) {
    console.log("✅ Service is already running in the background.");
    return;
  }

  try {
    await initializeClaudeConfig();
    await initDir();

    // Initialize config with hot reload enabled
    const config = await initConfig(true);
    log("Configuration loaded successfully");
    let HOST = config.HOST;

    if (config.HOST && !config.APIKEY) {
      HOST = "127.0.0.1";
      console.warn(
        "⚠️ API key is not set. HOST is forced to 127.0.0.1."
      );
    }


    const port = options.port || 3456;

    // Save the PID of the background process
    savePid(process.pid);

    // Enhanced cleanup function
    const cleanup = () => {
      log("Shutting down service...");
      stopConfigWatcher();
      cleanupPidFile();
    };

    // Handle SIGINT (Ctrl+C) to clean up PID file
    process.on("SIGINT", () => {
      console.log("Received SIGINT, cleaning up...");
      cleanup();
      process.exit(0);
    });

    // Handle SIGTERM to clean up PID file
    process.on("SIGTERM", () => {
      log("Received SIGTERM, cleaning up...");
      cleanup();
      process.exit(0);
    });
    console.log(HOST)

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      log("Uncaught exception:", error);
      cleanup();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      log("Unhandled rejection at:", promise, "reason:", reason);
      cleanup();
      process.exit(1);
    });

    // Use port from environment variable if set (for background process)
    const servicePort = process.env.SERVICE_PORT
      ? parseInt(process.env.SERVICE_PORT)
      : port;

    const server = createServer({
      jsonPath: CONFIG_FILE,
      initialConfig: {
        // ...config,
        providers: config.Providers || config.providers,
        HOST: HOST,
        PORT: servicePort,
        LOG_FILE: join(
          homedir(),
          ".claude-code-router",
          "claude-code-router.log"
        ),
      },
    });

    // Enhanced router middleware with hot reload support
    server.addHook("preHandler", apiKeyAuth(config));
    server.addHook("preHandler", async (req, reply) => {
      // Get current config (may have been updated via hot reload)
      const currentConfig = getCurrentConfig() || config;
      return router(req, reply, currentConfig);
    });

    log(`Starting server on port ${servicePort}`);
    server.start();

    console.log(`🚀 Claude Code Router started successfully on port ${servicePort}`);
    console.log(`📁 Configuration file: ${CONFIG_FILE}`);
    console.log(`📝 Log file: ${join(homedir(), ".claude-code-router", "claude-code-router.log")}`);
    console.log("🔄 Hot reload enabled - configuration changes will be applied automatically");

  } catch (error) {
    log("Failed to start service:", error);
    console.error("❌ Failed to start Claude Code Router:", error);
    process.exit(1);
  }
}

export { run };
// run();
