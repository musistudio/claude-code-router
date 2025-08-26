import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import path, { join } from "path";
import { initConfig, initDir, cleanupLogFiles } from "./utils";
import { createServer } from "./server";
import { router } from "./utils/router";
import { apiKeyAuth } from "./middleware/auth";
import "./middleware/tracking"; // Import tracking middleware
// REMOVED: import { applyFetchInterceptor } from './utils/fetch-interceptor'; - ExecutionGuard handles retry logic

import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { CONFIG_FILE } from "./constants";
import createWriteStream from "pino-rotating-file-stream";
import { HOME_DIR } from "./constants";
import { configureLogging } from "./utils/log";
import { sessionUsageCache } from "./utils/cache";
import Stream from "node:stream";

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

  await initializeClaudeConfig();
  await initDir();
  // Clean up old log files, keeping only the 10 most recent ones
  await cleanupLogFiles();
  const config = await initConfig();

  // Configure logging based on config
  configureLogging(config);

  // REMOVED: applyFetchInterceptor(); - ExecutionGuard provides integrated retry logic

  let HOST = config.HOST;

  if (config.HOST && !config.APIKEY) {
    HOST = "127.0.0.1";
    console.warn("⚠️ API key is not set. HOST is forced to 127.0.0.1.");
  }

  const port = config.PORT || 3456;

  // Save the PID of the background process
  savePid(process.pid);

  // Handle SIGINT (Ctrl+C) to clean up PID file
  process.on("SIGINT", () => {
    console.log("Received SIGINT, cleaning up...");
    cleanupPidFile();
    process.exit(0);
  });

  // Handle SIGTERM to clean up PID file
  process.on("SIGTERM", () => {
    cleanupPidFile();
    process.exit(0);
  });
  console.log(HOST);

  // Use port from environment variable if set (for background process)
  const servicePort = process.env.SERVICE_PORT
    ? parseInt(process.env.SERVICE_PORT)
    : port;

  // Configure logger based on config settings
  const loggerConfig =
    config.LOG !== false
      ? {
          level: config.LOG_LEVEL || "debug",
          stream: createWriteStream({
            path: HOME_DIR,
            filename: config.LOGNAME || `./logs/ccr-${+new Date()}.log`,
            maxFiles: 3,
            interval: "1d",
          }),
        }
      : false;

  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      
      providers: config.Providers || config.providers,
      HOST: HOST,
      PORT: servicePort,
      LOG_FILE: join(
        homedir(),
        ".claude-code-router",
        "claude-code-router.log"
      ),
    },
    logger: loggerConfig,
  });
  // Add async preHandler hook for authentication
  server.addHook("preHandler", async (req: any, reply: any) => {
    return new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => {
        if (err) reject(err);
        else resolve();
      };
      // Call the async auth function
      apiKeyAuth(config)(req, reply, done).catch(reject);
    });
  });
  // Analytics tracking preHandler
  server.addHook("preHandler", async (req: any, reply: any) => {
    if (req.url.startsWith("/v1/")) {
      req.startTime = Date.now();
    }
  });
  
  server.addHook("preHandler", async (req: any, reply: any) => {
    if (req.url.startsWith("/v1/messages")) {
      router(req, reply, config);
    }
  });
  server.addHook("onSend", (req: any, reply: any, payload: any, done: any) => {
    if (req.sessionId && req.url.startsWith("/v1/messages")) {
      if (payload instanceof ReadableStream) {
        const [originalStream, clonedStream] = payload.tee();
        const read = async (stream: ReadableStream) => {
          const reader = stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // Process the value if needed
            const dataStr = new TextDecoder().decode(value);
            if (!dataStr.startsWith("event: message_delta")) {
              continue;
            }
            const str = dataStr.slice(27);
            try {
              const message = JSON.parse(str);
              sessionUsageCache.put(req.sessionId, message.usage);
            } catch {}
          }
        }
        read(clonedStream);
        done(null, originalStream)
      } else {
        req.log.debug({payload}, 'onSend Hook')
        sessionUsageCache.put(req.sessionId, payload.usage);
        if (payload instanceof Buffer || payload instanceof Response) {
          done(null, payload);
        } else if(typeof payload === "object") {
          done(null, JSON.stringify(payload));
        } else {
          done(null, payload);
        }
      }
    } else {
      if(payload instanceof Buffer || payload instanceof Response || payload === null || payload instanceof ReadableStream || payload instanceof Stream) {
        done(null, payload);
      } else if(typeof payload === "object") {
        req.log.debug({payload}, 'onSend Hook')
        done(null, JSON.stringify(payload));
      } else {
        done(null, payload);
      }
    }
  });
  
  // Analytics tracking onResponse
  server.addHook("onResponse", async (req: any, reply: any) => {
    if (req.url.startsWith("/v1/") && req.startTime) {
      const responseTime = Date.now() - req.startTime;
      console.log(`[DEBUG] onResponse hook called for: ${req.url}, response time: ${responseTime}ms`);
      
      try {
        // Import analytics here to avoid circular dependencies
        const { analytics } = await import('./utils/analytics');
        
        // Track the request
        analytics.trackRequest({
          model: req.selectedModel || req.body?.model || 'unknown',
          provider: req.selectedProvider || 'unknown',
          endpoint: req.url,
          method: req.method,
          statusCode: reply.statusCode,
          responseTime,
          tokenCount: req.tokenCount || 0,
          inputTokens: req.inputTokens || 0,
          outputTokens: req.outputTokens || 0,
          cost: 0, // Will be calculated by analytics
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip
        });
      } catch (error: any) {
        console.error('Analytics tracking error:', error.message);
      }
    }
  });
  
  server.start();
}

export { run };
// run();