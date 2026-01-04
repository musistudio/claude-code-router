import { FastifyPluginAsync } from 'fastify';

declare module '@musistudio/llms' {

  export interface CCRPluginOptions {
    enabled?: boolean;
    [key: string]: any;
  }


  export interface CCRPlugin {
    name: string;
    version?: string;
    description?: string;
    register: FastifyPluginAsync<CCRPluginOptions>;
  }


  export interface PluginMetadata {
    name: string;
    enabled: boolean;
    options?: any;
  }


  export class PluginManager {
    private plugins;
    private pluginInstances;
    registerPlugin(plugin: CCRPlugin, options?: any): void;
    enablePlugin(name: string, fastify: import('fastify').FastifyInstance): Promise<void>;
    enablePlugins(fastify: import('fastify').FastifyInstance): Promise<void>;
    getPlugins(): PluginMetadata[];
    getPlugin(name: string): CCRPlugin | undefined;
    hasPlugin(name: string): boolean;
    isPluginEnabled(name: string): boolean;
    setPluginEnabled(name: string, enabled: boolean): void;
    removePlugin(name: string): void;
    clear(): void;
  }


  export const pluginManager: PluginManager;


  export const tokenSpeedPlugin: CCRPlugin;


  export class SSEParserTransform extends TransformStream<string, any> {
    constructor();
  }


  export class SSESerializerTransform extends TransformStream<any, string> {
    constructor();
  }


  export function rewriteStream(
    stream: ReadableStream,
    processor: (data: any, controller: ReadableStreamController<any>) => Promise<any>
  ): ReadableStream;
}
