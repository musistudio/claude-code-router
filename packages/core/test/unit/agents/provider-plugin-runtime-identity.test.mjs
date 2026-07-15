import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@ccr/core/gateway/core-runtime/config-compiler.ts";
import { prepareGatewayUpstreamAttemptForTest } from "@ccr/core/gateway/upstream/executor.ts";

test("provider plugins use compiled runtime and capability identities", async () => {
  const unchangedPlugin = { key: "unscoped-plugin" };
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-provider-plugin-runtime-identity.json" });
  config.providerPlugins = [
    {
      key: "single-protocol-plugin",
      providerName: "single-provider::anthropic_messages"
    },
    {
      key: "single-protocol-display-name-plugin",
      providerName: "Single Provider"
    },
    {
      key: "multi-protocol-plugin",
      providerName: "Multi Provider::openai_responses"
    },
    {
      key: "external-plugin",
      providerName: "External Provider"
    },
    unchangedPlugin
  ];
  config.Providers = [
    {
      api_base_url: "https://single.example.test/v1",
      id: "single-provider",
      models: ["single-model"],
      name: "Single Provider",
      type: "anthropic_messages"
    },
    {
      api_base_url: "https://multi.example.test/v1",
      capabilities: [
        { baseUrl: "https://multi.example.test/anthropic", type: "anthropic_messages" },
        { baseUrl: "https://multi.example.test/responses", type: "openai_responses" }
      ],
      id: "multi-provider",
      models: ["multi-model"],
      name: "Multi Provider",
      type: "anthropic_messages"
    }
  ];

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-usage-token",
    "core-auth-token"
  );
  const [runtimePlugin, displayNamePlugin, capabilityPlugin, unmatchedPlugin, unscopedPlugin] = compiled.providerPlugins;

  assert.equal(runtimePlugin.providerName, "single-provider");
  assert.equal(displayNamePlugin.providerName, "single-provider");
  assert.equal(capabilityPlugin.providerName, "multi-provider::openai_responses");
  assert.equal(unmatchedPlugin.providerName, "External Provider");
  assert.equal(unscopedPlugin, unchangedPlugin);
});

test("credential-free fallback headers use the provider runtime identity", () => {
  const provider = {
    api_base_url: "https://api.example.test",
    id: "provider-runtime-test",
    models: ["example-model"],
    name: "Display Provider",
    type: "anthropic_messages"
  };
  const config = {
    Providers: [provider],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
    gateway: {}
  };

  const attempt = prepareGatewayUpstreamAttemptForTest({
    body: {
      messages: [{ content: "hi", role: "user" }],
      model: "Display Provider/example-model"
    },
    config,
    headers: {},
    method: "POST",
    path: "/v1/messages"
  });

  assert.equal(attempt.headers["x-target-provider"], "provider-runtime-test");
});
