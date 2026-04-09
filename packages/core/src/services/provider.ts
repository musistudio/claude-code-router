import { TransformerConstructor } from "@/types/transformer";
import {
  LLMProvider,
  RegisterProviderRequest,
  ModelRoute,
  RequestRouteInfo,
  ConfigProvider,
} from "../types/llm";
import { ConfigService } from "./config"; 
import { TransformerService } from "./transformer";

export class ProviderService {
  private providers: Map<string, LLMProvider> = new Map();
  private modelRoutes: Map<string, ModelRoute> = new Map();

  constructor(private readonly configService: ConfigService, private readonly transformerService: TransformerService, private readonly logger: any) {
    this.initializeCustomProviders();
  }

  private initializeCustomProviders() {
    const providersConfig =
      this.configService.get<ConfigProvider[]>("providers");
    if (providersConfig && Array.isArray(providersConfig)) {
      this.initializeFromProvidersArray(providersConfig);
      return;
    }
  }

  private initializeFromProvidersArray(providersConfig: ConfigProvider[]) {
    providersConfig.forEach((providerConfig: ConfigProvider) => {
      try {
        if (
          !providerConfig.name ||
          !providerConfig.api_base_url ||
          (!providerConfig.api_key &&
            providerConfig.auth?.type !== "openai_codex_oauth")
        ) {
          return;
        }

        const transformer: LLMProvider["transformer"] = {}

        if (providerConfig.transformer) {
          Object.keys(providerConfig.transformer).forEach(key => {
            if (key === 'use') {
              if (Array.isArray(providerConfig.transformer.use)) {
                transformer.use = providerConfig.transformer.use.map((transformer) => {
                  if (Array.isArray(transformer) && typeof transformer[0] === 'string') {
                    const Constructor = this.transformerService.getTransformer(transformer[0]);
                    if (Constructor) {
                      return new (Constructor as TransformerConstructor)(transformer[1]);
                    }
                  }
                  if (typeof transformer === 'string') {
                    const transformerInstance = this.transformerService.getTransformer(transformer);
                    if (typeof transformerInstance === 'function') {
                      return new transformerInstance();
                    }
                    return transformerInstance;
                  }
                }).filter((transformer) => typeof transformer !== 'undefined');
              }
            } else {
              if (Array.isArray(providerConfig.transformer[key]?.use)) {
                transformer[key] = {
                  use: providerConfig.transformer[key].use.map((transformer) => {
                    if (Array.isArray(transformer) && typeof transformer[0] === 'string') {
                      const Constructor = this.transformerService.getTransformer(transformer[0]);
                      if (Constructor) {
                        return new (Constructor as TransformerConstructor)(transformer[1]);
                      }
                    }
                    if (typeof transformer === 'string') {
                      const transformerInstance = this.transformerService.getTransformer(transformer);
                      if (typeof transformerInstance === 'function') {
                        return new transformerInstance();
                      }
                      return transformerInstance;
                    }
                  }).filter((transformer) => typeof transformer !== 'undefined')
                }
              }
            }
          })
        }

        this.registerProvider({
          name: providerConfig.name,
          baseUrl: providerConfig.api_base_url,
          apiKey: providerConfig.api_key || "",
          auth: providerConfig.auth,
          models: providerConfig.models || [],
          transformer: providerConfig.transformer ? transformer : undefined,
        });

        this.logger.info(`${providerConfig.name} provider registered`);
      } catch (error) {
        this.logger.error(`${providerConfig.name} provider registered error: ${error}`);
      }
    });
  }

  registerProvider(request: RegisterProviderRequest): LLMProvider {
    const provider: LLMProvider = {
      ...request,
    };

    this.providers.set(provider.name, provider);

    request.models.forEach((model) => {
      this.registerModelRoute(provider.name, model, model);
    });

    return provider;
  }

  getProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  updateProvider(
    id: string,
    updates: Partial<LLMProvider>
  ): LLMProvider | null {
    const provider = this.providers.get(id);
    if (!provider) {
      return null;
    }

    const updatedProvider = {
      ...provider,
      ...updates,
      updatedAt: new Date(),
    };

    this.providers.set(id, updatedProvider);

    if (updates.models) {
      this.clearProviderRoutes(provider);

      updates.models.forEach((model) => {
        this.registerModelRoute(provider.name, model, model);
      });
    }

    return updatedProvider;
  }

  deleteProvider(id: string): boolean {
    const provider = this.providers.get(id);
    if (!provider) {
      return false;
    }

    this.clearProviderRoutes(provider);

    this.providers.delete(id);
    return true;
  }

  toggleProvider(name: string, enabled: boolean): boolean {
    const provider = this.providers.get(name);
    if (!provider) {
      return false;
    }
    return true;
  }

  resolveModelRoute(modelName: string): RequestRouteInfo | null {
    const route = this.modelRoutes.get(modelName);
    if (!route) {
      return null;
    }

    const provider = this.providers.get(route.provider);
    if (!provider) {
      return null;
    }

    return {
      provider,
      originalModel: modelName,
      targetModel: route.model,
    };
  }

  getAvailableModelNames(): string[] {
    const modelNames: string[] = [];
    this.providers.forEach((provider) => {
      provider.models.forEach((model) => {
        modelNames.push(model);
        modelNames.push(`${provider.name},${model}`);
      });
    });
    return modelNames;
  }

  getModelRoutes(): ModelRoute[] {
    return Array.from(this.modelRoutes.values());
  }

  private registerModelRoute(
    providerName: string,
    routeKey: string,
    targetModel: string
  ) {
    const fullModel = `${providerName},${routeKey}`;
    const route: ModelRoute = {
      provider: providerName,
      model: targetModel,
      fullModel,
    };
    this.modelRoutes.set(fullModel, route);
    if (!this.modelRoutes.has(routeKey)) {
      this.modelRoutes.set(routeKey, route);
    }
  }

  private clearProviderRoutes(provider: LLMProvider) {
    const routeKeys = new Set(provider.models);

    routeKeys.forEach((routeKey) => {
      const fullModel = `${provider.name},${routeKey}`;
      this.modelRoutes.delete(fullModel);
      this.modelRoutes.delete(routeKey);
    });
  }

  private parseTransformerConfig(transformerConfig: any): any {
    if (!transformerConfig) return {};

    if (Array.isArray(transformerConfig)) {
      return transformerConfig.reduce((acc, item) => {
        if (Array.isArray(item)) {
          const [name, config = {}] = item;
          acc[name] = config;
        } else {
          acc[item] = {};
        }
        return acc;
      }, {});
    }

    return transformerConfig;
  }

  async getAvailableModels(): Promise<{
    object: string;
    data: Array<{
      id: string;
      object: string;
      owned_by: string;
      provider: string;
    }>;
  }> {
    const models: Array<{
      id: string;
      object: string;
      owned_by: string;
      provider: string;
    }> = [];

    this.providers.forEach((provider) => {
      provider.models.forEach((model) => {
        models.push({
          id: model,
          object: "model",
          owned_by: provider.name,
          provider: provider.name,
        });

        models.push({
          id: `${provider.name},${model}`,
          object: "model",
          owned_by: provider.name,
          provider: provider.name,
        });
      });
    });

    return {
      object: "list",
      data: models,
    };
  }
}
