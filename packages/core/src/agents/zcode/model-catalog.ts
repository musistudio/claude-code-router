import type { AppConfig } from "@ccr/core/contracts/app";
import {
  buildCodexModelCatalog,
  type CodexModelCatalog,
  type CodexModelCatalogOptions
} from "@ccr/core/agents/codex/model-catalog";
import {
  findModelCatalogEntry,
  type ModelCatalogEntry,
  modelCatalogMaxInputTokens
} from "@ccr/core/gateway/model-catalog";
import { modelRegistryForConfig } from "@ccr/core/routing/model-registry";
import { resolveUsageModelAttribution } from "@ccr/core/usage/model-attribution";

type ZcodeModelCatalogConfig = Partial<Pick<
  AppConfig,
  "Providers" | "Router" | "virtualModelProfiles"
>>;

type ZcodeModelResolutionConfig = Pick<
  AppConfig,
  "Providers" | "virtualModelProfiles"
>;

export function buildZcodeModelCatalog(
  config?: ZcodeModelCatalogConfig,
  selectedModel?: string,
  options: CodexModelCatalogOptions = {}
): CodexModelCatalog {
  const catalog = buildCodexModelCatalog(config, selectedModel, options);
  const resolutionConfig = config
    ? {
        Providers: config.Providers ?? [],
        virtualModelProfiles: config.virtualModelProfiles ?? []
      }
    : undefined;
  return {
    models: catalog.models.map((item) => {
      const contextWindow = Math.max(
        item.context_window,
        modelCatalogMaxInputTokens(zcodeModelCatalogEntry(resolutionConfig, item.slug))
      );
      return {
        ...item,
        context_window: contextWindow,
        max_context_window: Math.max(item.max_context_window, contextWindow)
      };
    })
  };
}

function zcodeModelCatalogEntry(
  config: ZcodeModelResolutionConfig | undefined,
  model: string
): ModelCatalogEntry | undefined {
  if (!config) {
    return findModelCatalogEntry(model);
  }

  const registry = modelRegistryForConfig(config);
  const attribution = resolveUsageModelAttribution(config, model);
  const physicalModel = attribution.model?.trim();
  const physicalProvider = registry.findProvider(attribution.provider);
  if (physicalProvider && physicalModel) {
    return findModelCatalogEntry(`${physicalProvider.name}/${physicalModel}`);
  }

  // Request-routed virtual models do not have one physical model until the
  // request is evaluated, so retain the context already produced by Codex.
  if (registry.resolve(model)?.kind === "gateway") {
    return undefined;
  }

  return findModelCatalogEntry(physicalModel || model);
}

export function zcodeModelCatalogJson(
  config?: ZcodeModelCatalogConfig,
  selectedModel?: string,
  options: CodexModelCatalogOptions = {}
): string {
  return `${JSON.stringify(buildZcodeModelCatalog(config, selectedModel, options), null, 2)}\n`;
}
