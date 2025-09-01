import { FastifyRequest, FastifyReply } from 'fastify';
import { mockCostUsageForecast } from '../data/mockCostUsageForecastData';

export const getCostUsageForecast = async (request: FastifyRequest, reply: FastifyReply) => {
  return mockCostUsageForecast;
};
