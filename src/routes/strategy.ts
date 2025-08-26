
import { FastifyInstance } from 'fastify';
import { executionGuard } from '../utils/ExecutionGuard';

export const strategyRoutes = (app: FastifyInstance) => {
  app.get('/api/strategy/fallback-status', async (request, reply) => {
    try {
      // Replaced providerFallbackManager.getProviderStatus() with executionGuard.getStats().providers
      const { providers } = executionGuard.getStats();
      reply.send(providers);
    } catch (error: any) {
      reply.status(500).send({ error: 'Failed to get fallback status', details: error.message });
    }
  });

  app.get('/api/strategy/cache-stats', async (request, reply) => {
    try {
      // Replaced aiRequestController.getStatistics() with executionGuard.getStats().deduplication
      const { deduplication } = executionGuard.getStats();
      reply.send(deduplication);
    } catch (error: any) {
      reply.status(500).send({ error: 'Failed to get cache stats', details: error.message });
    }
  });
};
