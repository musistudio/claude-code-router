import assert from "node:assert/strict";
import test from "node:test";
import {
  providerCapabilityFeaturesFromConfigForTest,
  providerModelMetadataFromConfigForTest
} from "@ccr/core/config/config.ts";
import { toCoreGatewayProviders } from "@ccr/core/providers/runtime-topology.ts";

test("Responses reasoning feature config preserves supported values and drops invalid ones", () => {
  assert.deepEqual(providerCapabilityFeaturesFromConfigForTest({
    reasoningHistoryPolicy: "plaintext",
    reasoningSummaryPolicy: "as-content"
  }), {
    reasoningHistoryPolicy: "plaintext",
    reasoningSummaryPolicy: "as_content"
  });
  assert.equal(providerCapabilityFeaturesFromConfigForTest({
    reasoningHistoryPolicy: "unsafe",
    reasoningSummaryPolicy: "keep"
  }), undefined);
});

test("provider model metadata preserves Responses policy overrides", () => {
  assert.deepEqual(providerModelMetadataFromConfigForTest({
    protocol_features: {
      openai_responses: {
        reasoning_history_policy: "strip",
        reasoning_summary_policy: "as_content"
      },
      unsupported_protocol: {
        reasoning_history_policy: "plaintext"
      }
    }
  }), {
    protocolFeatures: {
      openai_responses: {
        reasoningHistoryPolicy: "strip",
        reasoningSummaryPolicy: "as_content"
      }
    }
  });
});

test("core gateway providers receive provider defaults and per-model Responses overrides", () => {
  const providers = toCoreGatewayProviders({
    api_key: "test-key",
    capabilities: [
      {
        baseUrl: "https://responses.example.test/v1",
        features: {
          reasoningHistoryPolicy: "encrypted",
          reasoningSummaryPolicy: "drop"
        },
        type: "openai_responses"
      },
      {
        baseUrl: "https://chat.example.test/v1",
        type: "openai_chat_completions"
      }
    ],
    modelMetadata: {
      "reasoning-model": {
        protocolFeatures: {
          openai_responses: {
            reasoningHistoryPolicy: "plaintext",
            reasoningSummaryPolicy: "as_content"
          }
        },
        supportedReasoningLevels: [{ description: "High", effort: "high" }]
      }
    },
    models: ["reasoning-model"],
    name: "Mixed provider"
  });

  const responses = providers.find((provider) => provider.type === "openai_responses");
  const chat = providers.find((provider) => provider.type === "openai_chat_completions");
  assert.match(
    responses?.name ?? "",
    /^provider-mixed-provider-[a-f0-9]{10}::openai_responses$/
  );
  assert.deepEqual({ ...responses, name: undefined }, {
    apikey: "test-key",
    baseurl: "https://responses.example.test/v1",
    billing: undefined,
    extraBody: undefined,
    extraHeaders: undefined,
    modelMetadata: {
      "reasoning-model": {
        openaiResponsesReasoningHistoryPolicy: "plaintext",
        openaiResponsesReasoningSummaryPolicy: "as_content",
        supportedReasoningLevels: [{ description: "High", effort: "high" }]
      }
    },
    models: ["reasoning-model"],
    name: undefined,
    openaiResponsesReasoningHistoryPolicy: "encrypted",
    openaiResponsesReasoningSummaryPolicy: "drop",
    type: "openai_responses"
  });
  assert.equal(chat?.openaiResponsesReasoningHistoryPolicy, undefined);
  assert.equal(
    chat?.modelMetadata?.["reasoning-model"]?.openaiResponsesReasoningHistoryPolicy,
    undefined
  );
});
