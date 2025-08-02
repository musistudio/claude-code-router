import Fastify, { FastifyInstance } from "fastify";
import { readConfigFile, writeConfigFile } from "./utils";
import { CONFIG_FILE } from "./constants";
import { join } from "path";
import { readFileSync } from "fs";
import fastifyStatic from "@fastify/static";

export const createServer = (config: any): FastifyInstance => {
  const server = Fastify({ logger: true });

  // Add endpoint to read config.json
  server.get("/api/config", async () => {
    return await readConfigFile();
  });

  // Add endpoint to save config.json
  server.post("/api/config", async (req) => {
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
  server.post("/api/restart", async (_, reply) => {
    reply.send({ success: true, message: "Service restart initiated" });

    // Restart the service after a short delay to allow response to be sent
    setTimeout(() => {
      const { spawn } = require("child_process");
      spawn("ccr", ["restart"], { detached: true, stdio: "ignore" });
    }, 1000);
  });

  // Main Claude API endpoint - will be handled by router
  server.post("/v1/messages", async (req, reply) => {
    // This will be handled by the router hook in index.ts
    reply.code(500).send({ error: "Router not configured" });
  });

  // Register static file serving with caching
  server.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // Redirect /ui to /ui/ for proper static file serving
  server.get("/ui", async (_, reply) => {
    return reply.redirect("/ui/");
  });

  return server;
};
