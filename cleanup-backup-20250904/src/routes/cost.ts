import { FastifyInstance } from 'fastify';
import { getCostOptimizations, applyCostOptimization } from '../controllers/costController';

export default async function (fastify: FastifyInstance) {
  fastify.get('/optimizations', getCostOptimizations);

  fastify.post('/apply-optimization', applyCostOptimization);
}
