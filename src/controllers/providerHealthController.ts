import { FastifyRequest, FastifyReply } from 'fastify';
import { mockProviderHealth } from '../data/mockProviderHealthData';

export const getProviderHealth = async (request: FastifyRequest, reply: FastifyReply) => {
  return mockProviderHealth;
};

export const switchProvider = async (request: FastifyRequest, reply: FastifyReply) => {
  const { provider } = request.body as { provider: string };

  if (!provider) {
    return reply.status(400).send({ message: 'provider is required' });
  }

  // In a real implementation, you would switch the provider here.

  reply.status(200).send({ message: `Switched to provider: ${provider}` });
};
