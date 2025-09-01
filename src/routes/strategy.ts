
import { FastifyInstance } from 'fastify';

export const strategyRoutes = (app: FastifyInstance) => {
  app.get('/api/strategy/fallback-status', async (request, reply) => {
    try {
      // Provider status now handled by OAuth CLI-based providers - simplified response
      reply.send({ message: 'Provider status now managed by OAuth CLI authentication' });
    } catch (error: any) {
      reply.status(500).send({ error: 'Failed to get fallback status', details: error.message });
    }
  });

  app.get('/api/strategy/cache-stats', async (request, reply) => {
    try {
      // Cache deduplication now handled by OAuth CLI-based providers - simplified response
      reply.send({ message: 'Cache statistics now managed by OAuth CLI authentication' });
    } catch (error: any) {
      reply.status(500).send({ error: 'Failed to get cache stats', details: error.message });
    }
  });
};
