import type { FastifyInstance } from 'fastify';

export interface AnalyticsPluginConfig {
  enabled: boolean;
  batchSize?: number;
  saveFrequency?: number;
  enableRealTimeUpdates?: boolean;
  dataRetentionDays?: number;
}

export interface Plugin {
  install(server: FastifyInstance, config: any): void;
  uninstall?(): void;
}

export interface PluginConfig {
  analytics?: AnalyticsPluginConfig;
  [key: string]: any;
}