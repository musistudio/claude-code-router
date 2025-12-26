import { FastifyRequest, FastifyReply } from "fastify";
import { getRuntimePort } from "../utils/runtimeState";

/**
 * Get the list of allowed CORS origins
 * Combines default origins (localhost with runtime port) with custom ALLOWED_ORIGINS from config
 * @param config - The configuration object
 * @returns Array of allowed origin strings
 */
export function getAllowedOrigins(config: any): string[] {
  const configPort = config.PORT || 3456;
  const runtimePort = getRuntimePort(configPort);
  
  // Default origins using runtime port
  const defaultOrigins = [
    `http://127.0.0.1:${runtimePort}`,
    `http://localhost:${runtimePort}`,
  ];
  
  // Add config port origins if different from runtime port
  if (runtimePort !== configPort) {
    defaultOrigins.push(`http://127.0.0.1:${configPort}`);
    defaultOrigins.push(`http://localhost:${configPort}`);
  }
  
  // Merge with custom ALLOWED_ORIGINS from config
  const customOrigins = Array.isArray(config.ALLOWED_ORIGINS) ? config.ALLOWED_ORIGINS : [];
  
  // Filter out invalid origins and deduplicate
  const allOrigins = [...defaultOrigins, ...customOrigins].filter(
    (origin): origin is string => typeof origin === 'string' && origin.length > 0
  );
  
  return [...new Set(allOrigins)];
}

/**
 * Check if an origin is allowed
 * @param origin - The origin to check
 * @param allowedOrigins - List of allowed origins
 * @returns true if origin is allowed, false otherwise
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return true; // No origin header means same-origin request
  }
  return allowedOrigins.includes(origin);
}

export const apiKeyAuth =
  (config: any) =>
  async (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    // Public endpoints that don't require authentication
    if (["/", "/health"].includes(req.url) || req.url.startsWith("/ui")) {
      return done();
    }

    const apiKey = config.APIKEY;
    if (!apiKey) {
      // If no API key is set, enable CORS for allowed origins only
      const allowedOrigins = getAllowedOrigins(config);
      const requestOrigin = req.headers.origin;
      
      if (!isOriginAllowed(requestOrigin, allowedOrigins)) {
        reply.status(403).send("CORS not allowed for this origin");
        return;
      }
      
      // Set CORS header for the requesting origin if it's allowed
      if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        reply.header('Access-Control-Allow-Origin', requestOrigin);
      }
      return done();
    }

    const authHeaderValue =
      req.headers.authorization || req.headers["x-api-key"];
    const authKey: string = Array.isArray(authHeaderValue)
      ? authHeaderValue[0]
      : authHeaderValue || "";
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
