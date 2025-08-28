import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { checkForUpdates, performUpdate } from "./utils";
import { join } from "path";
import fastifyStatic from "@fastify/static";
import { analyticsRoutes } from "./routes/analytics";
import { strategyRoutes } from './routes/strategy';
import executionGuardRoutes from './routes/execution-guard';
import { missionControlRoutes } from './routes/mission-control';
import { FastifyRequest, FastifyReply } from 'fastify';

// Global Throttling configuration
const GLOBAL_REQUEST_DELAY_MS = 200; // 200ms delay between requests (max 5 requests/sec)
let lastRequestTimestamp = 0;

export const createServer = (config: any): Server => {
  const server = new Server(config);

  // Add a global pre-handler hook for throttling
  server.app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTimestamp;

    if (timeSinceLastRequest < GLOBAL_REQUEST_DELAY_MS) {
      const waitTime = GLOBAL_REQUEST_DELAY_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastRequestTimestamp = Date.now();
  });

  // Register valuable analytics routes for dashboard  
  analyticsRoutes(server.app);
  strategyRoutes(server.app);
  
  // Register ExecutionGuard monitoring and control routes
  server.app.register(executionGuardRoutes, { prefix: '/api/execution-guard' });
  
  // Register Mission Control v2 routes
  server.app.register(missionControlRoutes);

  // Add endpoint to read config.json with access control
  server.app.get("/api/config", async (req: any, reply: any) => {
    return await readConfigFile();
  });

  server.app.get("/api/transformers", async () => {
    const transformers =
      server.app._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(
      ([name, transformer]: any) => ({
        name,
        endpoint: transformer.endPoint || null,
      })
    );
    return { transformers: transformerList };
  });

  // Add endpoint to save config.json with access control
  server.app.post("/api/config", async (req: any, reply: any) => {
    const newConfig = req.body;

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });

  // Add PUT endpoint for config updates (frontend compatibility)
  server.app.put("/api/config", async (req: any, reply: any) => {
    const newConfig = req.body;

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });

  // Add endpoint to handle optimization settings
  server.app.get("/api/optimization/settings", async (req: any, reply: any) => {
    return {
      autoOptimization: true,
      advancedRouting: true, 
      circuitBreakerEnabled: true,
      rateLimitingEnabled: true,
      cachingEnabled: true,
      retryMechanism: true,
      loadBalancing: false,
      failoverRouting: true,
      dynamicProviderSwitching: true,
      intelligentQueueing: true
    };
  });

  server.app.post("/api/optimization/settings", async (req: any, reply: any) => {
    const settings = req.body;
    // In a real implementation, this would save settings to config
    console.log('Optimization settings saved:', settings);
    return { success: true, message: "Optimization settings saved successfully" };
  });

  // Add endpoint to restart the service with access control

  server.app.get("/api/restart", async (req: any, reply: any) => {
    reply.send({ success: true, message: "Service restart initiated" });

    // Restart the service after a short delay to allow response to be sent
    setTimeout(() => {
      const { spawn } = require("child_process");
      spawn(process.execPath, [process.argv[1], "restart"], {
        detached: true,
        stdio: "ignore",
      });
    }, 1000);
  });

  // Register static file serving with caching
  server.app.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // Redirect /ui to /ui/ for proper static file serving
  server.app.get("/ui", async (_: any, reply: any) => {
    return reply.redirect("/ui/");
  });
  
  // 版本检查端点
  server.app.get("/api/updates/check", async (req: any, reply: any) => {
    try {
      // 获取当前版本
      const currentVersion = require("../package.json").version;
      const { hasUpdate, latestVersion, changelog } = await checkForUpdates(currentVersion);
      
      return { 
        hasUpdate, 
        latestVersion: hasUpdate ? latestVersion : undefined,
        changelog: hasUpdate ? changelog : undefined
      };
    } catch (error) {
      console.error("Failed to check for updates:", error);
      reply.status(500).send({ error: "Failed to check for updates" });
    }
  });
  
  // 执行更新端点
  server.app.post("/api/updates/perform", async (req: any, reply: any) => {
    try {
      // 只允许完全访问权限的用户执行更新
      const accessLevel = (req as any).accessLevel || "restricted";
      if (accessLevel !== "full") {
        reply.status(403).send("Full access required to perform updates");
        return;
      }
      
      // 执行更新逻辑
      const result = await performUpdate();
      
      return result;
    } catch (error) {
      console.error("Failed to perform update:", error);
      reply.status(500).send({ error: "Failed to perform update" });
    }
  });

  return server;
};
