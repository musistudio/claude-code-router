import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { createGatewayModelsResponse } from "@ccr/core/gateway/features/model-discovery.ts";

test("#1911 both discovery formats expose the configured context window", () => {
  const config = createDefaultAppConfig();
  config.Providers = [{ id: "local", name: "Local", type: "openai_responses", models: ["custom-model"], modelMetadata: { "custom-model": { contextWindow: 262144 } } }];
  config.profile.enabled = false;
  config.virtualModelProfiles = [];
  for (const agent of ["test-client", "claude-cli/2.1.306 (external, cli)"]) {
    const response = createGatewayModelsResponse(config, { "user-agent": agent });
    assert.ok(response.data.length > 0);
    for (const model of response.data) {
      assert.equal(model.context_window, 262144);
      assert.equal(model.max_context_window, 262144);
      assert.equal(model.max_input_tokens, 262144);
    }
  }
});
