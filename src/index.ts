// =========================================================================
// === index.ts  ===
// =========================================================================

import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { initConfig, initDir, cleanupLogFiles } from "./utils";
import { createServer } from "./server";
import { router } from "./utils/router";
import { apiKeyAuth } from "./middleware/auth";
import "./middleware/tracking";

// --- ExecutionGuard Integration ---
import { executionGuard, guardedExecute } from './utils/ExecutionGuard';
import { configureLogging, warn, info } from "./utils/log";
import { sessionUsageCache } from "./utils/cache";

// --- Importuri standard din proiect ---
import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { CONFIG_FILE, HOME_DIR } from "./constants";
import createWriteStream from "pino-rotating-file-stream";
import Stream from "node:stream";

// Definirea tipului ReadableStream dacă nu este disponibil global (pentru compatibilitate)
declare const ReadableStream: any;

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
  if (isServiceRunning()) {
    console.log("✅ Service is already running in the background.");
    return;
  }
  await initializeClaudeConfig();
  await initDir();
  await cleanupLogFiles();
  const config = await initConfig();
  configureLogging(config);

  // Initialize ExecutionGuard with config
  if (config.executionGuard?.enabled) {
    executionGuard.updateConfig(config.executionGuard);
    info('[ExecutionGuard] Initialized and configured');
  }
  
  let HOST = config.HOST;
  if (config.HOST && !config.APIKEY) {
    HOST = "127.0.0.1";
    console.warn("⚠️ API key is not set. HOST is forced to 127.0.0.1.");
  }
  const port = config.PORT || 3456;
  savePid(process.pid);
  process.on("SIGINT", () => {
    console.log("Received SIGINT, cleaning up...");
    cleanupPidFile();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanupPidFile();
    process.exit(0);
  });
  console.log(HOST);

  const servicePort = process.env.SERVICE_PORT ? parseInt(process.env.SERVICE_PORT) : port;
  const loggerConfig = config.LOG !== false ? {
          level: config.LOG_LEVEL || "debug",
          stream: createWriteStream({
            path: HOME_DIR,
            filename: config.LOGNAME || `./logs/ccr-${+new Date()}.log`,
            maxFiles: 3,
            interval: "1d",
          }),
        } : false;

  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      ...config,
      providers: config.Providers || config.providers,
      HOST: HOST,
      PORT: servicePort,
      LOG_FILE: join(homedir(), ".claude-code-router", "claude-code-router.log"),
    },
    logger: loggerConfig,
  });

  // --- ExecutionGuard: Replace old deduplication ---
  // (Removed old deduplication hook - now handled by ExecutionGuard in routing hook)

  // Păstrăm hook-ul de autentificare
  server.addHook("preHandler", async (req: any, reply: any) => {
    return new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => { if (err) reject(err); else resolve(); };
      apiKeyAuth(config)(req, reply, done).catch(reject);
    });
  });

  // Păstrăm hook-ul de analytics
  server.addHook("preHandler", async (req: any, reply: any) => {
    if (req.url.startsWith("/v1/")) {
      req.startTime = Date.now();
    }
  });
  
  // --- ExecutionGuard: Main routing with integrated deduplication, queue, and retry logic ---
  server.addHook("preHandler", async (req: any, reply: any) => {
    if (req.url.startsWith("/v1/messages")) {
      try {
        await guardedExecute(
          async () => {
            await router(req, reply, config);
            return reply; // Return reply object for ExecutionGuard
          },
          {
            req,
            keyId: `provider-${req.body?.model?.split(',')[0] || 'default'}`,
            providerName: req.body?.model?.split(',')[0] || 'default'
          }
        );
        return reply; // Short-circuit Fastify routing
      } catch (error: any) {
        // Handle ExecutionGuard errors (rate limiting, circuit breaker)
        if (error.message.includes('Rate limit exceeded')) {
          reply.code(429).send({
            error: 'Too Many Requests',
            message: error.message
          });
        } else if (error.message.includes('Circuit breaker')) {
          reply.code(503).send({
            error: 'Service Temporarily Unavailable',
            message: 'System is recovering from high load'
          });
        } else {
          throw error; // Re-throw other errors
        }
        return reply;
      }
    }
  });

  // --- Păstrăm hook-urile onSend și onResponse EXACT CUM ERAU ---
  server.addHook("onSend", (req: any, reply: any, payload: any, done: any) => {
    // --- ExecutionGuard handles response caching internally ---
    // (Removed old manual caching - ExecutionGuard manages this automatically)
    // --- De aici în jos, este codul tău original 100% ---
    if (req.sessionId && req.url.startsWith("/v1/messages")) {
      if (payload instanceof ReadableStream) {
        const [originalStream, clonedStream] = payload.tee();
        const read = async (stream: ReadableStream) => {
          const reader = stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const dataStr = new TextDecoder().decode(value);
            if (!dataStr.startsWith("event: message_delta")) {
              continue;
            }
            const str = dataStr.slice(27);
            try {
              const message = JSON.parse(str);
              if(message.usage) { // Adaugat un check de siguranță
                sessionUsageCache.put(req.sessionId, message.usage);
              }
            } catch {}
          }
        }
        read(clonedStream);
        done(null, originalStream)
      } else {
        req.log.debug({payload}, 'onSend Hook')
        if (payload && payload.usage) { // Adaugat un check de siguranță
            sessionUsageCache.put(req.sessionId, payload.usage);
        }
        if (payload instanceof Buffer || payload instanceof Response) {
          done(null, payload);
        } else if(typeof payload === "object" && payload !== null) {
          done(null, JSON.stringify(payload));
        } else {
          done(null, payload);
        }
      }
    } else {
      if(payload instanceof Buffer || payload instanceof Response || payload === null || payload instanceof ReadableStream || payload instanceof Stream) {
        done(null, payload);
      } else if(typeof payload === "object" && payload !== null) {
        req.log.debug({payload}, 'onSend Hook')
        done(null, JSON.stringify(payload));
      } else {
        done(null, payload);
      }
    }
  });
  
  server.addHook("onResponse", async (req: any, reply: any) => {
    if (req.url.startsWith("/v1/") && req.startTime) {
      const responseTime = Date.now() - req.startTime;
      console.log(`[DEBUG] onResponse hook called for: ${req.url}, response time: ${responseTime}ms`);
      
      try {
        const { analytics } = await import('./utils/analytics');
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
          cost: 0,
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