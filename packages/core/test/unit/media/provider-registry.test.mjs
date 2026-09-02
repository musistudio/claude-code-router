import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import {
  miniMaxImageGenerationSchema,
  registeredMediaCapabilities
} from "@ccr/core/media/provider-registry.ts";
import { resolveProviderMediaTarget } from "@ccr/core/media/service.ts";
import {
  minimaxChinaProviderPreset,
  minimaxGlobalProviderPreset
} from "@ccr/core/providers/presets/minimax/index.ts";

test("MiniMax presets register the supported image generation models", () => {
  assert.deepEqual(miniMaxImageGenerationSchema.models, ["image-01", "image-01-live"]);
  assert.ok(miniMaxImageGenerationSchema.models.every((model) => minimaxGlobalProviderPreset.defaultModels.includes(model)));
  assert.ok(miniMaxImageGenerationSchema.models.every((model) => minimaxChinaProviderPreset.defaultModels.includes(model)));
});

test("MiniMax image models register their regional image generation endpoint", () => {
  assert.deepEqual(registeredMediaCapabilities({
    api_base_url: "https://api.minimax.io/v1",
    models: ["MiniMax-M3", "image-01"],
    name: "MiniMax (Global)"
  }), [{
    baseUrl: "https://api.minimax.io/v1",
    source: "preset",
    type: "openai_image_generations"
  }]);
  assert.deepEqual(registeredMediaCapabilities({
    api_base_url: "https://api.minimaxi.com/anthropic/v1",
    models: ["image-01-live"],
    name: "MiniMax (China)"
  }), [{
    baseUrl: "https://api.minimaxi.com/v1",
    source: "preset",
    type: "openai_image_generations"
  }]);
});

test("an explicit image capability takes precedence over the MiniMax registry", () => {
  assert.deepEqual(registeredMediaCapabilities({
    api_base_url: "https://api.minimax.io/v1",
    capabilities: [{
      baseUrl: "https://proxy.example/v1",
      type: "openai_image_generations"
    }],
    models: ["image-01"],
    name: "MiniMax through proxy"
  }), []);
});

test("Fusion media resolves a registered MiniMax image model", () => {
  const config = createDefaultAppConfig();
  config.Providers = [{
    api_base_url: "https://api.minimax.io/v1",
    api_key: "provider-key",
    models: ["MiniMax-M3", "image-01"],
    name: "MiniMax (Global)",
    type: "openai_chat_completions"
  }];

  const target = resolveProviderMediaTarget(config, "MiniMax (Global)/image-01", "image-generate");
  assert.equal(target.model, "image-01");
  assert.equal(target.protocol, "openai_image_generations");
  assert.equal(target.providerBaseUrl, "https://api.minimax.io/v1");
  assert.match(target.providerSelector, /::openai_image_generations$/);
});
