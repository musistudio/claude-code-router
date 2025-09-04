import { FastifyInstance } from 'fastify';
import { getCostUsageForecast } from '../controllers/costUsageForecastController';

export default async function (fastify: FastifyInstance) {
  fastify.get('/cost-usage', getCostUsageForecast);
}
