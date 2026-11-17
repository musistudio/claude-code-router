import { isGatewayProviderEnabled, type AppConfig, type ProfileConfig } from "@ccr/core/contracts/app";
import { ModelRegistry, parseProviderModelSelector } from "@ccr/core/routing/model-registry";

/** Reconcile saved allowlists without turning a restrictive list into allow-all. */
export function reconcileProfileModelSelections(config: AppConfig): AppConfig {
  const registry = new ModelRegistry(config);
  // A bare model can be valid in multiple protocols. Saving a profile should
  // validate membership, while request routing resolves that ambiguity later.
  const isConfigured = (model: string) => Boolean(registry.resolve(model)) || config.Providers.some(provider =>
    isGatewayProviderEnabled(provider) && provider.models.some(candidate => candidate.toLowerCase() === model.toLowerCase())
  );
  const describe = (model: string) => {
    const parsed = parseProviderModelSelector(model);
    const provider = parsed ? registry.findProvider(parsed.provider) : undefined;
    return provider
      ? `Provider "${provider.name}" does not list model "${parsed!.model}". Available models: ${provider.models.join(", ") || "none"}.`
      : `Model "${model}" is not configured in an enabled provider or virtual model.`;
  };
  const profiles = config.profile.profiles.map((profile): ProfileConfig => {
    if (!profile.availableModels?.length) return profile;
    const availableModels = profile.availableModels.filter(isConfigured);
    if (profile.enabled && profile.model && !isConfigured(profile.model)) {
      throw new Error(`Profile "${profile.name}": ${describe(profile.model)} Select a configured default model or disable this profile.`);
    }
    // An explicit allowlist always retains its valid default model. If there
    // are no valid choices, require correction instead of silently allowing all.
    if (profile.model && isConfigured(profile.model) && !availableModels.includes(profile.model)) availableModels.unshift(profile.model);
    if (profile.enabled && availableModels.length === 0) {
      throw new Error(`Profile "${profile.name}": ${describe(profile.availableModels[0])} Select at least one configured model.`);
    }
    return { ...profile, availableModels };
  });
  return { ...config, profile: { ...config.profile, profiles } };
}
