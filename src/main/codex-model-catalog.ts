import type { AppConfig, VirtualModelProfileConfig } from "../shared/app";

const fusionModelProviderName = "Fusion";

export type CodexModelCatalog = {
  models: CodexModelCatalogItem[];
};

export type CodexModelCatalogItem = {
  additional_speed_tiers: unknown[];
  apply_patch_tool_type: string;
  availability_nux: null;
  base_instructions: string;
  context_window: number;
  default_reasoning_level: string;
  default_reasoning_summary: string;
  description: string;
  display_name: string;
  effective_context_window_percent: number;
  experimental_supported_tools: unknown[];
  input_modalities: string[];
  max_context_window: number;
  priority: number;
  service_tiers: unknown[];
  shell_type: string;
  slug: string;
  support_verbosity: boolean;
  supported_in_api: boolean;
  supported_reasoning_levels: Array<{ description: string; effort: string }>;
  supports_image_detail_original: boolean;
  supports_parallel_tool_calls: boolean;
  supports_reasoning_summaries: boolean;
  supports_search_tool: boolean;
  truncation_policy: { limit: number; mode: string };
  upgrade: null;
  visibility: string;
  web_search_tool_type: string;
};

export function buildCodexModelCatalog(config?: Partial<Pick<AppConfig, "Providers" | "virtualModelProfiles">>, selectedModel?: string): CodexModelCatalog {
  return {
    models: buildCodexModelCatalogIds(config, selectedModel).map((model, index) => codexModelCatalogItem(model, index))
  };
}

export function buildCodexModelCatalogIds(config?: Partial<Pick<AppConfig, "Providers" | "virtualModelProfiles">>, selectedModel?: string): string[] {
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

export function codexModelCatalogJson(config?: Partial<Pick<AppConfig, "Providers" | "virtualModelProfiles">>, selectedModel?: string): string {
  return `${JSON.stringify(buildCodexModelCatalog(config, selectedModel), null, 2)}\n`;
}

export function codexModelCatalogBase64(config?: Partial<Pick<AppConfig, "Providers" | "virtualModelProfiles">>, selectedModel?: string): string {
  const catalog = buildCodexModelCatalog(config, selectedModel);
  return Buffer.from(JSON.stringify(catalog), "utf8").toString("base64");
}

function codexModelCatalogItem(model: string, priority: number): CodexModelCatalogItem {
  return {
    additional_speed_tiers: [],
    apply_patch_tool_type: "freeform",
    availability_nux: null,
    base_instructions: "You are Codex, a coding agent.",
    context_window: 128_000,
    default_reasoning_level: "medium",
    default_reasoning_summary: "none",
    description: `CCR gateway model ${model}`,
    display_name: model,
    effective_context_window_percent: 95,
    experimental_supported_tools: [],
    input_modalities: ["text", "image"],
    max_context_window: 128_000,
    priority,
    service_tiers: [],
    shell_type: "shell_command",
    slug: model,
    support_verbosity: true,
    supported_in_api: true,
    supported_reasoning_levels: [
      { effort: "low", description: "Low reasoning" },
      { effort: "medium", description: "Medium reasoning" },
      { effort: "high", description: "High reasoning" },
      { effort: "xhigh", description: "Extra high reasoning" }
    ],
    supports_image_detail_original: true,
    supports_parallel_tool_calls: true,
    supports_reasoning_summaries: true,
    supports_search_tool: true,
    truncation_policy: { mode: "tokens", limit: 10_000 },
    upgrade: null,
    visibility: "list",
    web_search_tool_type: "text_and_image"
  };
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
