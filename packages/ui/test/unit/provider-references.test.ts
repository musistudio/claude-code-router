import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config";
import { ModelRegistry } from "@ccr/core/routing/model-registry";
import { renameProviderReferences } from "@ccr/ui/pages/home/shared/provider-references";

test("provider rename migrates profile and router model selectors to resolvable names", () => {
  const config = createDefaultAppConfig();
  config.Providers = [{ id: "my-openai", name: "Work OpenAI", models: ["demo"] }];
  config.preferredProvider = "My OpenAI";
  config.Router.rules = [{ id: "rule", enabled: true, name: "route", type: "model-prefix", target: "My OpenAI/demo", fallback: { mode: "model-chain", models: ["My OpenAI,demo"], retryCount: 1 } }];
  config.Router.rules[0].pattern = "My OpenAI/";
  config.Router.rules[0].condition = { left: "request.body.model", operator: "==", right: "My OpenAI/demo" };
  config.Router.rules[0].rewrite = { key: "request.body.model", operation: "set", value: "My OpenAI/demo" };
  config.Router.rules[0].rewrites = [{ key: "request.header.x-target-provider", operation: "set", value: "My OpenAI" }, { key: "request.body.instructions", value: "My OpenAI/do not rewrite this" }];
  config.Router.fallback.models = ["My OpenAI/demo", "Other/demo"];
  config.profile.claudeCode.model = "My OpenAI/demo";
  config.profile.codex.model = "My OpenAI/demo";
  config.profile.profiles = [{ id: "profile", agent: "claude-code", enabled: true, name: "Agent", model: "My OpenAI/demo", opusModel: "my openai/demo", availableModels: ["My OpenAI/demo"], routing: { enabled: true, enhancedRoute: false, rules: structuredClone(config.Router.rules) } }];
  const renamed = renameProviderReferences(config, "My OpenAI", "Work OpenAI");
  const registry = new ModelRegistry(renamed);
  const selectors = [renamed.Router.rules[0].target, ...renamed.Router.rules[0].fallback!.models, renamed.Router.fallback.models[0], renamed.profile.claudeCode.model, renamed.profile.codex.model, renamed.profile.profiles[0].model, renamed.profile.profiles[0].opusModel, ...renamed.profile.profiles[0].availableModels!, renamed.profile.profiles[0].routing!.rules[0].target];
  for (const selector of selectors) assert.equal(registry.resolve(selector)?.kind, "provider", selector);
  assert.equal(renamed.preferredProvider, "Work OpenAI");
  assert.equal(renamed.Router.fallback.models[1], "Other/demo");
  assert.equal(renamed.Router.rules[0].pattern, "Work OpenAI/");
  assert.equal(renamed.Router.rules[0].condition?.right, "Work OpenAI/demo");
  assert.equal(renamed.Router.rules[0].rewrite?.value, "Work OpenAI/demo");
  assert.equal(renamed.Router.rules[0].rewrites?.[0].value, "Work OpenAI");
  assert.equal(renamed.Router.rules[0].rewrites?.[1].value, "My OpenAI/do not rewrite this");
  assert.equal(config.profile.profiles[0].model, "My OpenAI/demo", "renaming must not mutate the current draft before persistence succeeds");
});

test("provider rename handles Fusion and known plugin targets without rewriting arbitrary text", () => {
  const config = createDefaultAppConfig();
  config.virtualModelProfiles = [{ id: "fusion", key: "fusion", displayName: "Fusion", enabled: true, execution: { clientToolsPolicy: "allow", mode: "tool_loop", streamMode: "buffered" }, match: { exactAliases: ["fusion"], prefixes: [], suffixes: [] }, materialization: { enabled: true, includeInGatewayModels: true }, tools: [], baseModel: { fixedModel: "Old/model" }, instructions: { append: "Old/model" }, metadata: { fusionVision: { modelSelector: "Old/vision", fallbackModels: ["Old/fallback"] }, fusionMedia: { imageModelSelector: "Old/image", videoModelSelector: "Old/video", imageFallbackModelSelectors: ["Old/image2"] }, custom: "Old/model" } }];
  config.plugins = [{ id: "cursor-proxy", enabled: true, module: "example", config: { targetProvider: "Old", targetModel: "model", routing: { default: "Old/default", modelMap: { incoming: "Old/mapped" }, rules: [{ target: "Old/routed", model: "Old/incoming" }] }, apiKey: "Old/secret" } }];
  const renamed = renameProviderReferences(config, "Old", "New");
  const fusion = renamed.virtualModelProfiles![0];
  assert.equal(fusion.baseModel?.fixedModel, "New/model");
  assert.deepEqual(fusion.metadata?.fusionVision, { modelSelector: "New/vision", fallbackModels: ["New/fallback"] });
  assert.deepEqual(fusion.metadata?.fusionMedia, { imageModelSelector: "New/image", videoModelSelector: "New/video", imageFallbackModelSelectors: ["New/image2"] });
  assert.equal(fusion.instructions?.append, "Old/model");
  assert.equal(fusion.metadata?.custom, "Old/model");
  assert.deepEqual(renamed.plugins[0].config, { targetProvider: "New", targetModel: "model", routing: { default: "New/default", modelMap: { incoming: "New/mapped" }, rules: [{ target: "New/routed", model: "Old/incoming" }] }, apiKey: "Old/secret" });
});
