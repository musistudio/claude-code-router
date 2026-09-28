import type { AppConfig, GatewayProviderConfig } from "@ccr/core/contracts/app";
import { modelRegistryForConfig } from "@ccr/core/routing/model-registry";

export function resolveConfiguredProviderModelSelector(
  value: string | undefined,
  config: AppConfig
): { model: string; provider: GatewayProviderConfig } | undefined {
  return modelRegistryForConfig(config).resolveProviderModel(value);
}

export function resolveUniqueConfiguredProviderModelSelector(
  value: string | undefined,
  config: AppConfig
): { model: string; provider: GatewayProviderConfig } | undefined {
  return modelRegistryForConfig(config).resolveUniqueProviderModel(value);
}
