import type { AppConfig, RouterRule } from "@ccr/core/contracts/app";

/** Rename stored selectors without touching credentials, URLs, prompts or scripts. */
export function renameProviderReferences(config: AppConfig, previousName: string, nextName: string): AppConfig {
  if (previousName === nextName) return config;
  const next = structuredClone(config);
  const rewrite = (value: string): string => {
    const trimmed = value.trim();
    for (const separator of ["/", ","]) {
      const prefix = `${previousName}${separator}`;
      if (trimmed.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
        return `${nextName}/${trimmed.slice(prefix.length).trim()}`;
      }
    }
    return value;
  };
  const fields = (value: object | undefined, names: string[], lists: string[] = []) => {
    if (!value) return;
    const record = value as Record<string, unknown>;
    for (const name of names) {
      if (typeof record[name] === "string") record[name] = rewrite(record[name]);
    }
    for (const name of lists) {
      if (Array.isArray(record[name])) record[name] = record[name].map((item) => typeof item === "string" ? rewrite(item) : item);
    }
  };
  const rules = (items: RouterRule[]) => {
    for (const rule of items) {
      fields(rule, ["target"]);
      fields(rule.fallback, [], ["models"]);
      if (rule.type === "model-prefix") fields(rule, ["pattern"]);
      if (rule.condition) {
        rule.condition.right = rewritePathValue(rule.condition.left, rule.condition.right);
      }
      for (const change of [...(rule.rewrites ?? []), ...(rule.rewrite ? [rule.rewrite] : [])]) {
        if (change.value) change.value = rewritePathValue(change.key, change.value);
        if (change.match) change.match = rewritePathValue(change.key, change.match);
      }
    }
  };
  const rewritePathValue = (field: string, value: string): string => {
    if (field.trim() === "request.body.model") return rewrite(value);
    const providerFields = ["request.body.provider", "request.header.x-target-provider", "request.header.x-gateway-target-provider"];
    return providerFields.includes(field.trim()) && value.trim().toLowerCase() === previousName.toLowerCase() ? nextName : value;
  };
  if (next.preferredProvider === previousName) next.preferredProvider = nextName;
  fields(next.Router.fallback, [], ["models"]);
  rules(next.Router.rules);
  const modelFields = ["model", "fableModel", "haikuModel", "opusModel", "sonnetModel", "smallFastModel"];
  fields(next.profile.claudeCode, modelFields);
  fields(next.profile.codex, ["model"]);
  for (const profile of next.profile.profiles) {
    fields(profile, modelFields, ["availableModels"]);
    if (profile.routing) rules(profile.routing.rules);
  }
  for (const profile of next.virtualModelProfiles ?? []) {
    fields(profile.baseModel, ["fixedModel"]);
    const vision = profile.metadata?.fusionVision;
    if (isRecord(vision)) fields(vision, ["model", "modelSelector"], ["fallbackModels"]);
    const media = profile.metadata?.fusionMedia;
    if (isRecord(media)) fields(media, ["imageModelSelector", "videoModelSelector"], ["imageFallbackModelSelectors", "videoFallbackModelSelectors"]);
  }
  fields(next.toolHub.llm, ["model"]);
  for (const plugin of next.plugins) {
    if (plugin.id !== "claude-design" && plugin.id !== "cursor-proxy") continue;
    if (!isRecord(plugin.config)) continue;
    if (plugin.config.targetProvider === previousName) plugin.config.targetProvider = nextName;
    fields(plugin.config, ["targetModel"]);
    const routing = plugin.config.routing;
    if (!isRecord(routing)) continue;
    fields(routing, ["default", "defaultTarget"]);
    if (isRecord(routing.modelMap)) {
      for (const [model, target] of Object.entries(routing.modelMap)) {
        if (typeof target === "string") routing.modelMap[model] = rewrite(target);
      }
    }
    if (Array.isArray(routing.rules)) {
      for (const rule of routing.rules) if (isRecord(rule)) fields(rule, ["target"]);
    }
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
