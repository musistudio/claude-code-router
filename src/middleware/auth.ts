import { FastifyRequest, FastifyReply } from "fastify";
import { getTempAPIKey } from "../utils/systemUUID";

export const apiKeyAuth =
  (config: any) =>
  async (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    // Check for temp API key in query parameters or headers
    let tempApiKey = null;
    if (req.query && (req.query as any).tempApiKey) {
      tempApiKey = (req.query as any).tempApiKey;
    } else if (req.headers['x-temp-api-key']) {
      tempApiKey = req.headers['x-temp-api-key'] as string;
    }
    
    // If temp API key is provided, validate it
    if (tempApiKey) {
      try {
        const expectedTempKey = await getTempAPIKey();
        
        // If temp key matches, grant temporary full access
        if (tempApiKey === expectedTempKey) {
          (req as any).accessLevel = "full";
          (req as any).isTempAccess = true;
          return done();
        }
      } catch (error) {
        // If there's an error generating temp key, continue with normal auth
        console.warn("Failed to verify temporary API key:", error);
      }
    }
    
    // Public endpoints that don't require authentication
    if (["/", "/health"].includes(req.url) || req.url.startsWith("/ui")) {
      return done();
    }

    const apiKey = config.APIKEY;
    const isConfigEndpoint = req.url.startsWith("/api/config");

    // For config endpoints, we implement granular access control
    if (isConfigEndpoint) {
      // Attach access level to request for later use
      (req as any).accessLevel = "restricted";
      
      // If no API key is set in config, allow restricted access
      if (!apiKey) {
        (req as any).accessLevel = "restricted";
        return done();
      }
      
      // Check for temporary access via query parameter (for UI)
      if ((req as any).isTempAccess) {
        return done();
      }
      
      // If API key is set, check authentication
      const authKey: string | undefined =
        (req.headers.authorization || req.headers["x-api-key"]) as string | undefined;
      
      if (!authKey) {
        (req as any).accessLevel = "restricted";
        return done();
      }
      
      let token = "";
      if (authKey.startsWith("Bearer")) {
        token = authKey.split(" ")[1];
      } else {
        token = authKey;
      }
      
      if (token !== apiKey) {
        (req as any).accessLevel = "restricted";
        return done();
      }
      
      // Full access for authenticated users
      (req as any).accessLevel = "full";
      return done();
    }

    // For non-config endpoints, use existing logic
    if (!apiKey) {
      return done();
    }

    // Check for temporary access via query parameter (for UI)
    if ((req as any).isTempAccess) {
      return done();
    }

    const authKey: string | undefined =
      (req.headers.authorization || req.headers["x-api-key"]) as string | undefined;
    if (!authKey) {
      reply.status(401).send("APIKEY is missing");
      return;
    }
    let token = "";
    if (authKey.startsWith("Bearer")) {
      token = authKey.split(" ")[1];
    } else {
      token = authKey;
    }
    if (token !== apiKey) {
      reply.status(401).send("Invalid API key");
      return;
    }

    done();
  };
