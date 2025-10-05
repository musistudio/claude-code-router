import { FastifyRequest, FastifyReply } from "fastify";

export const apiKeyAuth = async (
  req: FastifyRequest,
  reply: FastifyReply,
  config: any
) => {
  // Public endpoints that don't require authentication
  const whiteList = ["/", "/health", "/ui", "/ui/"];
  if (whiteList.includes(req.url)) {
    return;
  }
  
  const apiKey = config.APIKEY;
  if (!apiKey) {
    // If no API key is set, enable CORS for local
    const allowedOrigins = [
      `http://127.0.0.1:${config.PORT || 3456}`,
      `http://localhost:${config.PORT || 3456}`,
    ];
    if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) {
      return reply.status(403).send("CORS not allowed for this origin");
    } else {
      reply.header(
        "Access-Control-Allow-Origin",
        `http://127.0.0.1:${config.PORT || 3456}`
      );
      reply.header(
        "Access-Control-Allow-Origin",
        `http://localhost:${config.PORT || 3456}`
      );
    }
  }

  const authHeaderValue = req.headers.authorization || req.headers["x-api-key"];
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
    return reply.status(401).send("Invalid API key");
  }
};
