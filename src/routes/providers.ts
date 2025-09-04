import { FastifyInstance } from 'fastify';
import { getProviderHealth, switchProvider } from '../controllers/providerHealthController';

export default async function (fastify: FastifyInstance) {
  fastify.get('/health-check', getProviderHealth);

  fastify.post('/switch', switchProvider);
}
