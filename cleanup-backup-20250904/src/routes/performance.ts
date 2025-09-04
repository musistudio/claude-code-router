import { FastifyInstance } from 'fastify';
import { getPerformanceAlerts, resolvePerformanceAlert } from '../controllers/performanceController';

export default async function (fastify: FastifyInstance) {
  fastify.get('/alerts', getPerformanceAlerts);

  fastify.post('/resolve-alert', resolvePerformanceAlert);
}
