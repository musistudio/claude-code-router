import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUsage, getModels } from '../controllers/monitorController';

export default async function (fastify: FastifyInstance) {
  fastify.get('/usage', getUsage);

  fastify.get('/models', getModels);

  fastify.post('/configure', async (request: FastifyRequest, reply: FastifyReply) => {
    return { message: 'Route configured successfully' };
  });
}
