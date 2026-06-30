import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCoreGatewayVirtualModelProfiles } from "../../src/server/gateway/service.ts";

test("gateway config rewrites Fusion fixed base and vision models to core provider selectors", () => {
  const providerName = "Zhipu AI (China) - Coding Plan";
  const config = {
    Providers: [
      {
        baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
        capabilities: [
          { baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4", type: "openai_chat_completions" },
          { baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4", type: "anthropic_messages" }
        ],
        credentials: [{ apiKey: "test-key", id: "test-1" }],
        models: ["glm-5.2", "glm-5v-turbo"],
        name: providerName,
        type: "openai_chat_completions"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
    gateway: {}
  };
  const profiles = [
    {
      baseModel: { fixedModel: `${providerName}/glm-5.2`, mode: "fixed" },
      displayName: "GLM Fusion",
      enabled: true,
      execution: {
        clientToolsPolicy: "allow",
        maxToolCalls: 8,
        maxTurns: 6,
        mode: "tool_loop",
        streamMode: "optimistic"
      },
      id: "glm-fusion",
      key: "glm-fusion",
      match: { exactAliases: ["glm-fusion"], prefixes: [], suffixes: [] },
      materialization: { enabled: true, includeInGatewayModels: true },
      metadata: {
        fusionVision: {
          modelSelector: `${providerName}/glm-5v-turbo`,
          toolName: "vision_understand_glm_fusion"
        }
      },
      tools: [{ name: "vision_understand_glm_fusion", visibility: "internal" }]
    }
  ];

  const [profile] = normalizeCoreGatewayVirtualModelProfiles(profiles, config);

  assert.match(
    profile.baseModel.fixedModel,
    /^provider-zhipu-ai-china---coding-plan-[a-f0-9]{10}::anthropic_messages::cred:test-1\/glm-5\.2$/
  );
  assert.match(
    profile.metadata.fusionVision.modelSelector,
    /^provider-zhipu-ai-china---coding-plan-[a-f0-9]{10}::openai_chat_completions::cred:test-1\/glm-5v-turbo$/
  );
  assert.equal(profiles[0].baseModel.fixedModel, `${providerName}/glm-5.2`);
});
