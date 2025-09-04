import { FastifyRequest, FastifyReply } from 'fastify';
import { mockCostData } from '../data/mockCostData';

export const getCostOptimizations = async (request: FastifyRequest, reply: FastifyReply) => {
  return mockCostData;
};

export const applyCostOptimization = async (request: FastifyRequest, reply: FastifyReply) => {
  const { recommendationId } = request.body as { recommendationId: string };

  if (!recommendationId) {
    return reply.status(400).send({ message: 'recommendationId is required' });
  }

  const recommendation = mockCostData.recommendations.find(
    (r) => r.id === recommendationId
  );

  if (!recommendation) {
    return reply.status(404).send({ message: 'Recommendation not found' });
  }

  if (recommendation.status === 'APPLIED') {
    return reply.status(200).send({ message: 'Recommendation was already applied' });
  }

  recommendation.status = 'APPLIED';

  reply.status(200).send({ message: 'Cost savings applied successfully' });
};
