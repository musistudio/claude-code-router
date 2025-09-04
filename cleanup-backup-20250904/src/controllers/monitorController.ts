import { FastifyRequest, FastifyReply } from 'fastify';
import { mockUsage, mockModels } from '../data/mockMonitorData';

export const getUsage = async (request: FastifyRequest, reply: FastifyReply) => {
  return mockUsage;
};

export const getModels = async (request: FastifyRequest, reply: FastifyReply) => {
  return mockModels;
};
