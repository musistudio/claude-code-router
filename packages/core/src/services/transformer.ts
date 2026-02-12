import { Transformer, TransformerConstructor } from "@/types/transformer";
import { ConfigService } from "./config";
import Transformers from "@/transformer";
import Module from "node:module";

/**
 * Check if a value is a class constructor function
 */
function isClassConstructor(value: any): value is new (...args: any[]) => any {
  return (
    typeof value === 'function' &&
    value.prototype !== undefined &&
    typeof value.prototype.constructor === 'function'
  );
}

interface TransformerConfig {
  transformers: Array<{
    name: string;
    type: "class" | "module";
    path?: string;
    options?: any;
  }>;
}

export class TransformerService {
  private transformers: Map<string, Transformer | TransformerConstructor> =
    new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: any
  ) {}

  registerTransformer(name: string, transformer: Transformer): void {
    this.transformers.set(name, transformer);
    this.logger.info(
      `register transformer: ${name}${
        transformer.endPoint
          ? ` (endpoint: ${transformer.endPoint})`
          : " (no endpoint)"
      }`
    );
  }

  getTransformer(
    name: string
  ): Transformer | TransformerConstructor | undefined {
    return this.transformers.get(name);
  }

  getAllTransformers(): Map<string, Transformer | TransformerConstructor> {
    return new Map(this.transformers);
  }

  getTransformersWithEndpoint(): { name: string; transformer: Transformer }[] {
    const result: { name: string; transformer: Transformer }[] = [];

    this.transformers.forEach((transformer, name) => {
      // Check if it's an instance with endPoint
      if (typeof transformer === 'object' && transformer.endPoint) {
        result.push({ name, transformer });
      }
    });

    return result;
  }

  getTransformersWithoutEndpoint(): {
    name: string;
    transformer: Transformer;
  }[] {
    const result: { name: string; transformer: Transformer }[] = [];

    this.transformers.forEach((transformer, name) => {
      // Check if it's an instance without endPoint
      if (typeof transformer === 'object' && !transformer.endPoint) {
        result.push({ name, transformer });
      }
    });

    return result;
  }

  removeTransformer(name: string): boolean {
    return this.transformers.delete(name);
  }

  hasTransformer(name: string): boolean {
    return this.transformers.has(name);
  }

  async registerTransformerFromConfig(config: {
    path?: string;
    options?: any;
  }): Promise<boolean> {
    try {
      if (config.path) {
        const module = require(require.resolve(config.path));
        if (module) {
          // Handle different export patterns:
          // 1. CommonJS: module.exports = Class
          // 2. ES module default export: module.default
          // 3. Named export with TransformerName static property
          // 4. Named export - use the first exported class
          let TransformerClass: any;

          // Check if module.exports is the class directly (CommonJS pattern)
          if (isClassConstructor(module)) {
            TransformerClass = module;
          } else if (module.default && isClassConstructor(module.default)) {
            // ES module default export
            TransformerClass = module.default;
          } else if (module.TransformerName && typeof module[module.TransformerName] === 'function') {
            // Named export matching TransformerName
            TransformerClass = module[module.TransformerName];
          } else {
            // Find the first exported class constructor
            const exports = Object.values(module).filter(isClassConstructor);

            if (exports.length === 0) {
              throw new Error(
                `No class constructor found in module at ${config.path}. ` +
                `Ensure your transformer exports a class (default export or named export).`
              );
            }

            TransformerClass = exports[0];
          }

          // Check if it's a constructor function
          if (typeof TransformerClass !== 'function') {
            throw new Error(
              `Exported value from ${config.path} is not a constructor. ` +
              `Got type: ${typeof TransformerClass}`
            );
          }

          // Check for static TransformerName (register as constructor)
          if (
            "TransformerName" in TransformerClass &&
            typeof TransformerClass.TransformerName === "string"
          ) {
            this.registerTransformer(
              TransformerClass.TransformerName,
              TransformerClass
            );
            return true;
          }

          // Otherwise instantiate the transformer
          const instance = new TransformerClass(config.options);
          // Set logger for transformer instance
          if (instance && typeof instance === "object") {
            (instance as any).logger = this.logger;
          }
          if (!instance.name) {
            throw new Error(
              `Transformer instance from ${config.path} does not have a name property.`
            );
          }
          this.registerTransformer(instance.name, instance);
          return true;
        }
      }
      return false;
    } catch (error: any) {
      this.logger.error(
        `load transformer (${config.path}) \nerror: ${error.message}\nstack: ${error.stack}`
      );
      return false;
    }
  }

  async initialize(): Promise<void> {
    try {
      await this.registerDefaultTransformersInternal();
      await this.loadFromConfig();
    } catch (error: any) {
      this.logger.error(
        `TransformerService init error: ${error.message}\nStack: ${error.stack}`
      );
    }
  }

  private async registerDefaultTransformersInternal(): Promise<void> {
    try {
      Object.values(Transformers).forEach(
        (TransformerStatic: any) => {
          if (
            "TransformerName" in TransformerStatic &&
            typeof TransformerStatic.TransformerName === "string"
          ) {
            this.registerTransformer(
              TransformerStatic.TransformerName,
              TransformerStatic
            );
          } else {
            const transformerInstance = new TransformerStatic();
            // Set logger for transformer instance
            if (
              transformerInstance &&
              typeof transformerInstance === "object"
            ) {
              (transformerInstance as any).logger = this.logger;
            }
            this.registerTransformer(
              transformerInstance.name!,
              transformerInstance
            );
          }
        }
      );
    } catch (error) {
      this.logger.error({ error }, "transformer regist error:");
    }
  }

  private async loadFromConfig(): Promise<void> {
    const transformers = this.configService.get<
      TransformerConfig["transformers"]
    >("transformers", []);
    for (const transformer of transformers) {
      await this.registerTransformerFromConfig(transformer);
    }
  }
}
