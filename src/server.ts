import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile } from "./utils";
import { CONFIG_FILE } from "./constants";
import { join } from "path";
import { readFileSync } from "fs";
import fastifyStatic from "@fastify/static";

export const createServer = (config: any): Server => {
  const server = new Server(config);

  // Add endpoint to read config.json with access control
  server.app.get("/api/config", async (req, reply) => {
    // Get access level from request (set by auth middleware)
    const accessLevel = (req as any).accessLevel || "restricted";
    
    // If restricted access, return 401
    if (accessLevel === "restricted") {
      reply.status(401).send("API key required to access configuration");
      return;
    }
    
    // For full access (including temp API key), return complete config
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
    // Only allow full access users to save config
    const accessLevel = (req as any).accessLevel || "restricted";
    if (accessLevel !== "full") {
      reply.status(403).send("Full access required to modify configuration");
      return;
    }
    
    const newConfig = req.body;
    
    // Backup existing config file if it exists
    const { backupConfigFile } = await import("./utils");
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }
    
    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });
  
  // Add endpoint for testing full access without modifying config
  server.app.post("/api/config/test", async (req, reply) => {
    // Only allow full access users to test config access
    const accessLevel = (req as any).accessLevel || "restricted";
    if (accessLevel !== "full") {
      reply.status(403).send("Full access required to test configuration access");
      return;
    }
    
    // Return success without modifying anything
    return { success: true, message: "Access granted" };
  });

  // Add endpoint to restart the service with access control
  server.app.post("/api/restart", async (req, reply) => {
    // Only allow full access users to restart service
    const accessLevel = (req as any).accessLevel || "restricted";
    if (accessLevel !== "full") {
      reply.status(403).send("Full access required to restart service");
      return;
    }
    
    reply.send({ success: true, message: "Service restart initiated" });

    // Restart the service after a short delay to allow response to be sent
    setTimeout(() => {
      const { spawn } = require("child_process");
      spawn(process.execPath, [process.argv[1], "restart"], { detached: true, stdio: "ignore" });
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

  return server;
};
