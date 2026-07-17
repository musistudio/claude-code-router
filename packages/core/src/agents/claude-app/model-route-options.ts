import {
  type ClaudeAppGatewayModelRouteOptions,
  providerModelSupportsOneMillionContext
} from "@ccr/core/agents/claude-app/gateway-routes";
import type { AppConfig } from "@ccr/core/contracts/app";
import { findModelCatalogEntry } from "@ccr/core/gateway/model-catalog";

type ClaudeAppGatewayModelRouteConfig = Pick<
  AppConfig,
  "Providers" | "virtualModelProfiles"
>;

export function claudeAppGatewayModelRouteOptions(
  config: ClaudeAppGatewayModelRouteConfig
): ClaudeAppGatewayModelRouteOptions {
  return {
    displayName: (model) => findModelCatalogEntry(model)?.displayName,
    supportsOneMillionContext: (model) => providerModelSupportsOneMillionContext(
      config,
      model,
      Boolean(findModelCatalogEntry(model)?.limits?.supports1MContext)
    )
  };
}
