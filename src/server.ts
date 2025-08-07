import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile } from "./utils";
import { CONFIG_FILE } from "./constants";
import { join } from "path";
import { readFileSync } from "fs";
import fastifyStatic from "@fastify/static";

export const createServer = (config: any): Server => {
  const server = new Server(config);

  // Add endpoint to read config.json
  server.app.get("/api/config", async () => {
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

  // Add endpoint to save config.json
  server.app.post("/api/config", async (req) => {
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

  // Add endpoint to restart the service
  server.app.post("/api/restart", async (_, reply) => {
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
