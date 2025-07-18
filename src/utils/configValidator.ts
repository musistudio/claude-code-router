import { AppConfig, Provider, RouterConfig, ValidationResult, ValidationError } from "../types/config";
import { log } from "./log";

export class ConfigValidator {
  private errors: ValidationError[] = [];
  private warnings: ValidationError[] = [];

  validate(config: AppConfig): ValidationResult {
    this.errors = [];
    this.warnings = [];

    this.validateProviders(config);
    this.validateRouter(config);
    this.validateTransformers(config);
    this.validateGeneral(config);

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  private validateProviders(config: AppConfig): void {
    const providers = config.Providers || config.providers;
    
    if (!providers) {
      this.errors.push({
        field: "Providers",
        message: "Providers configuration is required"
      });
      return;
    }

    if (!Array.isArray(providers)) {
      this.errors.push({
        field: "Providers",
        message: "Providers must be an array",
        value: typeof providers
      });
      return;
    }

    if (providers.length === 0) {
      this.errors.push({
        field: "Providers",
        message: "At least one provider must be configured"
      });
      return;
    }

    const providerNames = new Set<string>();
    
    providers.forEach((provider, index) => {
      this.validateProvider(provider, index, providerNames);
    });
  }

  private validateProvider(provider: Provider, index: number, providerNames: Set<string>): void {
    const prefix = `Providers[${index}]`;

    // Required fields
    if (!provider.name) {
      this.errors.push({
        field: `${prefix}.name`,
        message: "Provider name is required"
      });
    } else {
      if (providerNames.has(provider.name)) {
        this.errors.push({
          field: `${prefix}.name`,
          message: `Duplicate provider name: ${provider.name}`
        });
      }
      providerNames.add(provider.name);
    }

    if (!provider.api_base_url) {
      this.errors.push({
        field: `${prefix}.api_base_url`,
        message: "API base URL is required"
      });
    } else {
      // Validate URL format
      try {
        new URL(provider.api_base_url);
      } catch {
        this.errors.push({
          field: `${prefix}.api_base_url`,
          message: "Invalid URL format",
          value: provider.api_base_url
        });
      }
    }

    if (!provider.api_key && provider.name !== "ollama") {
      this.warnings.push({
        field: `${prefix}.api_key`,
        message: "API key is missing (may be required for this provider)"
      });
    }

    if (!provider.models || !Array.isArray(provider.models) || provider.models.length === 0) {
      this.errors.push({
        field: `${prefix}.models`,
        message: "At least one model must be specified"
      });
    }

    // Validate transformer configuration
    if (provider.transformer) {
      this.validateTransformerConfig(provider.transformer, `${prefix}.transformer`);
    }
  }

  private validateRouter(config: AppConfig): void {
    if (!config.Router) {
      this.errors.push({
        field: "Router",
        message: "Router configuration is required"
      });
      return;
    }

    const router = config.Router;
    
    if (!router.default) {
      this.errors.push({
        field: "Router.default",
        message: "Default router configuration is required"
      });
    } else {
      this.validateRouterModel(router.default, "Router.default", config);
    }

    // Validate optional router configurations
    if (router.background) {
      this.validateRouterModel(router.background, "Router.background", config);
    }
    
    if (router.think) {
      this.validateRouterModel(router.think, "Router.think", config);
    }
    
    if (router.longContext) {
      this.validateRouterModel(router.longContext, "Router.longContext", config);
    }

    if (router.fallback) {
      this.validateRouterModel(router.fallback, "Router.fallback", config);
    }
  }

  private validateRouterModel(routerModel: string, field: string, config: AppConfig): void {
    if (!routerModel.includes(",")) {
      this.warnings.push({
        field,
        message: "Router model should be in format 'provider,model'",
        value: routerModel
      });
      return;
    }

    const [providerName, modelName] = routerModel.split(",", 2);
    const providers = config.Providers || config.providers || [];
    
    const provider = providers.find(p => p.name === providerName);
    if (!provider) {
      this.errors.push({
        field,
        message: `Provider '${providerName}' not found in providers list`,
        value: routerModel
      });
      return;
    }

    if (provider.disabled) {
      this.warnings.push({
        field,
        message: `Provider '${providerName}' is disabled`,
        value: routerModel
      });
    }

    if (!provider.models.includes(modelName)) {
      this.errors.push({
        field,
        message: `Model '${modelName}' not found in provider '${providerName}' models list`,
        value: routerModel
      });
    }
  }

  private validateTransformers(config: AppConfig): void {
    if (!config.transformers) return;

    if (!Array.isArray(config.transformers)) {
      this.errors.push({
        field: "transformers",
        message: "Transformers must be an array",
        value: typeof config.transformers
      });
      return;
    }

    config.transformers.forEach((transformer, index) => {
      if (!transformer.path) {
        this.errors.push({
          field: `transformers[${index}].path`,
          message: "Transformer path is required"
        });
      }
    });
  }

  private validateTransformerConfig(transformer: any, field: string): void {
    if (!transformer.use || !Array.isArray(transformer.use)) {
      this.errors.push({
        field: `${field}.use`,
        message: "Transformer 'use' field must be an array"
      });
    }
  }

  private validateGeneral(config: AppConfig): void {
    // Validate boolean fields
    if (config.LOG !== undefined && typeof config.LOG !== "boolean") {
      this.warnings.push({
        field: "LOG",
        message: "LOG should be a boolean value",
        value: config.LOG
      });
    }

    if (config.log !== undefined && typeof config.log !== "boolean") {
      this.warnings.push({
        field: "log",
        message: "log should be a boolean value",
        value: config.log
      });
    }

    // Check for deprecated fields
    if (config.OPENAI_MODEL) {
      this.warnings.push({
        field: "OPENAI_MODEL",
        message: "OPENAI_MODEL is deprecated, use Router.default instead"
      });
    }
  }
}

export function validateConfig(config: AppConfig): ValidationResult {
  const validator = new ConfigValidator();
  const result = validator.validate(config);
  
  if (result.errors.length > 0) {
    log("Configuration validation errors:");
    result.errors.forEach(error => {
      log(`  - ${error.field}: ${error.message}${error.value ? ` (got: ${error.value})` : ""}`);
    });
  }

  if (result.warnings.length > 0) {
    log("Configuration validation warnings:");
    result.warnings.forEach(warning => {
      log(`  - ${warning.field}: ${warning.message}${warning.value ? ` (got: ${warning.value})` : ""}`);
    });
  }

  return result;
}