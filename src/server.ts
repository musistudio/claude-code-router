import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { checkForUpdates, performUpdate } from "./utils";
import { join } from "path";
import fastifyStatic from "@fastify/static";

export const createServer = (config: any): Server => {
  const server = new Server(config);

  // Add endpoint to read config.json with access control
  server.app.get("/api/config", async (req, reply) => {
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
  server.app.post("/api/config", async (req, reply) => {
    const newConfig = req.body;

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });

  // Add endpoint to restart the service with access control
  server.app.post("/api/restart", async (req, reply) => {
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
  server.app.get("/ui", async (_, reply) => {
    return reply.redirect("/ui/");
  });
  
  // 版本检查端点
  server.app.get("/api/update/check", async (req, reply) => {
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
  server.app.post("/api/update/perform", async (req, reply) => {
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

  // Provider testing endpoints
  server.app.post("/api/test-providers", async (req, reply) => {
    try {
      // Get current config
      const config = await readConfigFile();
      
      // Import the provider testing utilities
      const { testAllProviders } = await import("./utils/providerTest");
      
      // Test all providers
      const results = await testAllProviders(config);
      
      return { results };
    } catch (error) {
      console.error("Failed to test providers:", error);
      reply.status(500).send({ error: "Failed to test providers: " + (error as Error).message });
    }
  });

  server.app.post("/api/test-provider", async (req, reply) => {
    try {
      const { providerName } = req.body as { providerName: string };
      
      if (!providerName) {
        reply.status(400).send({ error: "Provider name is required" });
        return;
      }
      
      // Get current config
      const config = await readConfigFile();
      
      // Import the provider testing utilities
      const { testSpecificProvider } = await import("./utils/providerTest");
      
      // Test specific provider
      const result = await testSpecificProvider(config, providerName);
      
      return result;
    } catch (error: any) {
      console.error("Failed to test provider:", error);
      if (error.message.includes("not found")) {
        reply.status(404).send({ error: error.message });
      } else {
        reply.status(500).send({ error: "Failed to test provider: " + error.message });
      }
    }
  });

  return server;
};
