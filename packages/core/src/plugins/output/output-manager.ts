import { OutputHandler, OutputOptions, OutputHandlerConfig } from './types';
import { ConsoleOutputHandler } from './console-handler';
import { WebhookOutputHandler } from './webhook-handler';
import { TempFileOutputHandler } from './temp-file-handler';

/**
 * Output manager
 * Manages multiple output handlers and provides unified output interface
 */
class OutputManager {
  private handlers: Map<string, OutputHandler> = new Map();
  private defaultOptions: OutputOptions = {};

  /**
   * Register output handler
   * @param name Output handler name
   * @param handler Output handler instance
   */
  registerHandler(name: string, handler: OutputHandler): void {
    this.handlers.set(name, handler);
  }

  /**
   * Register output handlers in batch
   * @param configs Output handler configuration array
   */
  registerHandlers(configs: OutputHandlerConfig[]): void {
    for (const config of configs) {
      if (config.enabled === false) {
        continue;
      }

      try {
        const handler = this.createHandler(config);
        const name = config.type + '_' + Date.now();
        this.registerHandler(name, handler);
      } catch (error) {
        console.error(`[OutputManager] Failed to register ${config.type} handler:`, error);
      }
    }
  }

  /**
   * Create output handler instance
   * @param config Output handler configuration
   */
  private createHandler(config: OutputHandlerConfig): OutputHandler {
    switch (config.type) {
      case 'console':
        return new ConsoleOutputHandler(config.config as any);

      case 'webhook':
        return new WebhookOutputHandler(config.config as any);

      case 'temp-file':
        return new TempFileOutputHandler(config.config as any);

      // Reserved for other output handler types
      // case 'websocket':
      //   return new WebSocketOutputHandler(config.config as any);

      default:
        throw new Error(`Unknown output handler type: ${config.type}`);
    }
  }

  /**
   * Remove output handler
   * @param name Output handler name
   */
  unregisterHandler(name: string): boolean {
    return this.handlers.delete(name);
  }

  /**
   * Get output handler
   * @param name Output handler name
   */
  getHandler(name: string): OutputHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * Get all output handlers
   */
  getAllHandlers(): Map<string, OutputHandler> {
    return new Map(this.handlers);
  }

  /**
   * Clear all output handlers
   */
  clearHandlers(): void {
    this.handlers.clear();
  }

  /**
   * Set default output options
   * @param options Output options
   */
  setDefaultOptions(options: OutputOptions): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * Get default output options
   */
  getDefaultOptions(): OutputOptions {
    return { ...this.defaultOptions };
  }

  /**
   * Output data to all registered output handlers
   * @param data Data to output
   * @param options Output options
   * @returns Promise<{success: string[], failed: string[]}> Names of successful and failed handlers
   */
  async output(
    data: any,
    options?: OutputOptions
  ): Promise<{ success: string[]; failed: string[] }> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const results = { success: [] as string[], failed: [] as string[] };

    // Send data to all handlers in parallel
    const promises = Array.from(this.handlers.entries()).map(
      async ([name, handler]) => {
        try {
          const success = await handler.output(data, mergedOptions);
          if (success) {
            results.success.push(name);
          } else {
            results.failed.push(name);
          }
        } catch (error) {
          console.error(`[OutputManager] Handler ${name} failed:`, error);
          results.failed.push(name);
        }
      }
    );

    await Promise.all(promises);
    return results;
  }

  /**
   * Output data to specified output handlers
   * @param handlerNames Array of output handler names
   * @param data Data to output
   * @param options Output options
   * @returns Promise<{success: string[], failed: string[]}> Names of successful and failed handlers
   */
  async outputTo(
    handlerNames: string[],
    data: any,
    options?: OutputOptions
  ): Promise<{ success: string[]; failed: string[] }> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const results = { success: [] as string[], failed: [] as string[] };

    const promises = handlerNames.map(async name => {
      const handler = this.handlers.get(name);
      if (!handler) {
        console.warn(`[OutputManager] Handler ${name} not found`);
        results.failed.push(name);
        return;
      }

      try {
        const success = await handler.output(data, mergedOptions);
        if (success) {
          results.success.push(name);
        } else {
          results.failed.push(name);
        }
      } catch (error) {
        console.error(`[OutputManager] Handler ${name} failed:`, error);
        results.failed.push(name);
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Output data to specified type of output handlers
   * @param type Output handler type
   * @param data Data to output
   * @param options Output options
   * @returns Promise<{success: string[], failed: string[]}> Names of successful and failed handlers
   */
  async outputToType(
    type: string,
    data: any,
    options?: OutputOptions
  ): Promise<{ success: string[]; failed: string[] }> {
    const targetHandlers = Array.from(this.handlers.entries())
      .filter(([_, handler]) => handler.type === type)
      .map(([name]) => name);

    return this.outputTo(targetHandlers, data, options);
  }
}

/**
 * Global output manager instance
 */
export const outputManager = new OutputManager();

/**
 * Convenience method: Quickly output data to all registered handlers
 * @param data Data to output
 * @param options Output options
 */
export async function output(data: any, options?: OutputOptions) {
  return outputManager.output(data, options);
}

/**
 * Convenience method: Quickly output data to specified type of handlers
 * @param type Output handler type ('console' | 'webhook' | 'websocket')
 * @param data Data to output
 * @param options Output options
 */
export async function outputTo(type: string, data: any, options?: OutputOptions) {
  return outputManager.outputToType(type, data, options);
}
