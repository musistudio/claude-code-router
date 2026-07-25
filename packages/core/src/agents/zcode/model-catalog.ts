import type { AppConfig } from "@ccr/core/contracts/app";
import {
  buildCodexModelCatalog,
  type CodexModelCatalog
} from "@ccr/core/agents/codex/model-catalog";
import {
  findModelCatalogEntry,
  modelCatalogMaxInputTokens
} from "@ccr/core/gateway/model-catalog";

type ZcodeModelCatalogConfig = Partial<Pick<
  AppConfig,
  "Providers" | "Router" | "virtualModelProfiles"
>>;

export function buildZcodeModelCatalog(
  config?: ZcodeModelCatalogConfig,
  selectedModel?: string
): CodexModelCatalog {
  const catalog = buildCodexModelCatalog(config, selectedModel);
  return {
    models: catalog.models.map((item) => {
      const contextWindow = Math.max(
        item.context_window,
        modelCatalogMaxInputTokens(findModelCatalogEntry(item.slug))
      );
      return {
        ...item,
        context_window: contextWindow,
        max_context_window: Math.max(item.max_context_window, contextWindow)
      };
    })
  };
}

export function zcodeModelCatalogJson(
  config?: ZcodeModelCatalogConfig,
  selectedModel?: string
): string {
  return `${JSON.stringify(buildZcodeModelCatalog(config, selectedModel), null, 2)}\n`;
}
