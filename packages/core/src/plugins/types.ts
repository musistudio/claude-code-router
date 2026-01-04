import { FastifyPluginAsync } from 'fastify';

/**
 * Plugin configuration interface
 */
export interface CCRPluginOptions {
  enabled?: boolean;
  [key: string]: any;
}

/**
 * Plugin interface
 */
export interface CCRPlugin {
  name: string;
  version?: string;
  description?: string;
  register: FastifyPluginAsync<CCRPluginOptions>;
}

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  name: string;
  enabled: boolean;
  options?: any;
}
