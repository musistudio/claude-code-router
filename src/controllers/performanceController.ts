import { FastifyRequest, FastifyReply } from 'fastify';
import { mockPerformanceAlerts } from '../data/mockPerformanceData';

export const getPerformanceAlerts = async (request: FastifyRequest, reply: FastifyReply) => {
  return mockPerformanceAlerts;
};

export const resolvePerformanceAlert = async (request: FastifyRequest, reply: FastifyReply) => {
  const { alertId } = request.body as { alertId: string };

  if (!alertId) {
    return reply.status(400).send({ message: 'alertId is required' });
  }

  const alert = mockPerformanceAlerts.find((a) => a.id === alertId);

  if (!alert) {
    return reply.status(404).send({ message: 'Alert not found' });
  }

  alert.resolved = true;

  reply.status(200).send({ message: 'Alert resolved successfully' });
};
