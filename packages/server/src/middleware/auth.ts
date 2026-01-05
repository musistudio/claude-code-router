import { FastifyRequest, FastifyReply } from "fastify";

/**
 * Get the list of allowed CORS origins
 * Combines default origins (localhost with config port) with custom ALLOWED_ORIGINS from config
 * @param config - The configuration object
 * @returns Array of allowed origin strings
 */
export function getAllowedOrigins(config: any): string[] {
  const port = config.PORT || 3456;
  
  // Default origins using config port
  const defaultOrigins = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ];
  
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
    const publicPaths = ["/", "/health"];
    if (publicPaths.includes(req.url) || req.url.startsWith("/ui")) {
      return done();
    }

    // Check if Providers is empty or not configured
    const providers = config.Providers || config.providers || [];
    if (!providers || providers.length === 0) {
      // No providers configured, skip authentication
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
