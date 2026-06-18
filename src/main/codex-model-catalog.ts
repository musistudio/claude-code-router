import type { AppConfig, VirtualModelProfileConfig } from "../shared/app";

const fusionModelProviderName = "Fusion";

export function buildCodexModelCatalog(config?: Partial<Pick<AppConfig, "Providers" | "virtualModelProfiles">>, selectedModel?: string): string[] {
  const ids: string[] = [];
  pushUniqueModel(ids, normalizeModelSelector(selectedModel));

  const baseEntries: Array<{ modelName: string; providerName: string }> = [];
  for (const provider of config?.Providers ?? []) {
    const providerName = provider.name?.trim();
    if (!providerName || !Array.isArray(provider.models)) {
      continue;
    }
    for (const rawModel of provider.models) {
      const modelName = rawModel.trim();
      if (!modelName) {
        continue;
      }
      baseEntries.push({ modelName, providerName });
      pushUniqueModel(ids, `${providerName}/${modelName}`);
    }
  }

  for (const profile of config?.virtualModelProfiles ?? []) {
    if (!virtualModelIsCatalogVisible(profile)) {
      continue;
    }
    for (const entry of baseEntries) {
      for (const prefix of profile.match?.prefixes ?? []) {
        const normalizedPrefix = prefix.trim();
        if (normalizedPrefix) {
          pushUniqueModel(ids, `${entry.providerName}/${normalizedPrefix}${entry.modelName}`);
        }
      }
      for (const suffix of profile.match?.suffixes ?? []) {
        const normalizedSuffix = suffix.trim();
        if (normalizedSuffix) {
          pushUniqueModel(ids, `${entry.providerName}/${entry.modelName}${normalizedSuffix}`);
        }
      }
    }
    for (const alias of virtualModelRawCatalogNames(profile)) {
      pushUniqueModel(ids, fusionModelSelector(alias));
    }
  }

  return ids;
}

export function codexModelCatalogBase64(config?: Partial<Pick<AppConfig, "Providers" | "virtualModelProfiles">>, selectedModel?: string): string {
  const catalog = buildCodexModelCatalog(config, selectedModel);
  return Buffer.from(JSON.stringify(catalog), "utf8").toString("base64");
}

function virtualModelIsCatalogVisible(profile: VirtualModelProfileConfig): boolean {
  return profile.enabled !== false &&
    profile.materialization?.enabled !== false &&
    profile.materialization?.includeInGatewayModels !== false;
}

function virtualModelRawCatalogNames(profile: VirtualModelProfileConfig): string[] {
  const exactAliases = uniqueStrings(profile.match?.exactAliases ?? []);
  if (exactAliases.length > 0) {
    return exactAliases;
  }
  return [profile.key || profile.displayName].filter(Boolean);
}

function fusionModelSelector(model: string): string {
  const normalized = fusionModelNameFromSelector(model);
  return normalized ? `${fusionModelProviderName}/${normalized}` : "";
}

function fusionModelNameFromSelector(model: string): string {
  const trimmed = model.trim();
  const prefix = `${fusionModelProviderName}/`;
  return trimmed.toLowerCase().startsWith(prefix.toLowerCase())
    ? trimmed.slice(prefix.length).trim()
    : trimmed;
}

function normalizeModelSelector(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : "";
  }
  return trimmed;
}

function pushUniqueModel(models: string[], model: string | undefined): void {
  const normalized = model?.trim();
  if (normalized && !models.includes(normalized)) {
    models.push(normalized);
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}
