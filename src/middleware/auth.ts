import { FastifyRequest, FastifyReply } from "fastify";

export const apiKeyAuth =
  (config: any) =>
  (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    if (["/", "/health"].includes(req.url)) {
      return done();
    }
    const apiKey = config.APIKEY;

    // Allow bypass when no API key is configured (development mode)
    if (!apiKey) {
      return done();
    }

    // Support both standard Authorization and x-api-key header formats
    const authKey: string = req.headers.authorization || req.headers["x-api-key"] as string;
    if (!authKey) {
      reply.status(401).send("APIKEY is missing");
      return;
    }
    let token = "";
    // Handle both 'Bearer <token>' and direct token formats
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
