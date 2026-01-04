import { FastifyInstance } from 'fastify';
import { CCRPlugin, PluginMetadata } from './types';

/**
 * Plugin manager
 */
class PluginManager {
  private plugins: Map<string, PluginMetadata> = new Map();
  private pluginInstances: Map<string, CCRPlugin> = new Map();

  /**
   * Register a plugin
   * @param plugin Plugin instance
   * @param options Plugin configuration options
   */
  registerPlugin(plugin: CCRPlugin, options: any = {}): void {
    this.pluginInstances.set(plugin.name, plugin);
    this.plugins.set(plugin.name, {
      name: plugin.name,
      enabled: options.enabled !== false,
      options
    });
  }

  /**
   * Enable a single plugin
   * @param name Plugin name
   * @param fastify Fastify instance
   */
  async enablePlugin(name: string, fastify: FastifyInstance): Promise<void> {
    const metadata = this.plugins.get(name);
    const plugin = this.pluginInstances.get(name);
    if (!metadata || !plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    if (metadata.enabled) {
      await fastify.register(plugin.register, metadata.options);
    }
  }

  /**
   * Enable all registered plugins in batch
   * @param fastify Fastify instance
   */
  async enablePlugins(fastify: FastifyInstance): Promise<void> {
    for (const [name, metadata] of this.plugins) {
      if (metadata.enabled) {
        try {
          await this.enablePlugin(name, fastify);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          fastify.log?.error(`Failed to enable plugin ${name}: ${errorMessage}`);
        }
      }
    }
  }

  /**
   * Get list of registered plugins
   */
  getPlugins(): PluginMetadata[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin instance
   * @param name Plugin name
   */
  getPlugin(name: string): CCRPlugin | undefined {
    return this.pluginInstances.get(name);
  }

  /**
   * Check if plugin is registered
   * @param name Plugin name
   */
  hasPlugin(name: string): boolean {
    return this.pluginInstances.has(name);
  }

  /**
   * Check if plugin is enabled
   * @param name Plugin name
   */
  isPluginEnabled(name: string): boolean {
    const metadata = this.plugins.get(name);
    return metadata?.enabled || false;
  }

  /**
   * Dynamically enable/disable plugin
   * @param name Plugin name
   * @param enabled Whether to enable
   */
  setPluginEnabled(name: string, enabled: boolean): void {
    const metadata = this.plugins.get(name);
    if (metadata) {
      metadata.enabled = enabled;
    }
  }

  /**
   * Remove plugin
   * @param name Plugin name
   */
  removePlugin(name: string): void {
    this.plugins.delete(name);
    this.pluginInstances.delete(name);
  }

  /**
   * Clear all plugins
   */
  clear(): void {
    this.plugins.clear();
    this.pluginInstances.clear();
  }
}

export const pluginManager = new PluginManager();
