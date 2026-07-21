import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";
import { shouldRunGatewayRuntime } from "@ccr/core/gateway/core-runtime/supervisor.ts";

test("media tools start their internal gateway runtime when the public gateway is disabled", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.gateway.enabled = false;
  config.proxy.enabled = false;
  config.mediaTools.enabled = true;

  assert.equal(shouldRunGatewayRuntime(config), true);
});

test("core gateway compiles media capabilities and provider plugin aliases for credentials", async () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.Providers = [{
    api_base_url: "https://chat.example/v1",
    capabilities: [
      { baseUrl: "https://chat.example/v1", source: "detected", type: "openai_chat_completions" },
      { baseUrl: "https://media.example/v1", source: "detected", type: "openai_image_generations" },
      { baseUrl: "https://media.example/v1", source: "detected", type: "openai_video_generations" },
      { baseUrl: "https://api.x.ai/v1", source: "detected", type: "xai_video_generations" }
    ],
    credentials: [{ apiKey: "provider-key", enabled: true, id: "primary", priority: 1 }],
    id: "media-provider",
    models: ["image-model", "video-model"],
    name: "Media Provider",
    type: "openai_chat_completions"
  }];
  config.providerPlugins = [{
    auth: { headers: { authorization: "Bearer provider-token" } },
    enabled: true,
    key: "media-provider-auth",
    provider: "openai",
    providerName: "Media Provider"
  }];

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-token",
    "core-token"
  );
  const providers = compiled.providers;
  const providerPlugins = compiled.providerPlugins;
  assert.ok(Array.isArray(providers));
  assert.ok(Array.isArray(providerPlugins));

  assert.deepEqual(providers.map((provider) => [provider.name, provider.type, provider.baseurl]), [
    ["media-provider::openai_chat_completions::cred:primary", "openai_chat_completions", "https://chat.example/v1"],
    ["media-provider::openai_image_generations::cred:primary", "openai_image_generations", "https://media.example/v1"],
    ["media-provider::openai_video_generations::cred:primary", "openai_video_generations", "https://media.example/v1"],
    ["media-provider::xai_video_generations::cred:primary", "xai_video_generations", "https://api.x.ai/v1"]
  ]);
  assert.deepEqual(
    providerPlugins.map((plugin) => plugin.providerName).filter(Boolean).sort(),
    [
      "Media Provider",
      "media-provider::openai_chat_completions::cred:primary",
      "media-provider::openai_image_generations::cred:primary",
      "media-provider::openai_video_generations::cred:primary",
      "media-provider::xai_video_generations::cred:primary"
    ].sort()
  );
});
