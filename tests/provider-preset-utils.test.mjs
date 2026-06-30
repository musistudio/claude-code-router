import assert from "node:assert/strict";
import test from "node:test";
import {
  findProviderPresetByBaseUrlInList,
  findProviderPresetByIdentityInList,
  providerApiKeySafetyIssueInList,
  providerEndpointCanReceiveProviderApiKeyInList,
  providerIdentitySafetyIssueInList,
  providerPresetMatchesBaseUrl
} from "../src/shared/provider-preset-utils.ts";

const openAiPreset = {
  aliases: ["OpenAI", "ChatGPT"],
  endpoints: [{ baseUrl: "https://api.openai.com/v1", protocols: ["openai_chat_completions"] }],
  id: "openai",
  name: "OpenAI",
  officialApiKeyPatterns: [{ source: "^sk-openai-" }]
};

const anthropicPreset = {
  aliases: ["Claude"],
  endpoints: [{ baseUrl: "https://api.anthropic.com", protocols: ["anthropic_messages"] }],
  id: "anthropic",
  name: "Anthropic",
  officialApiKeyPatterns: [{ source: "^sk-ant-" }]
};

const presets = [openAiPreset, anthropicPreset];

test("provider preset matching accepts endpoint subpaths but rejects different hosts", () => {
  assert.equal(providerPresetMatchesBaseUrl(openAiPreset, "https://api.openai.com/v1/chat/completions"), true);
  assert.equal(providerPresetMatchesBaseUrl(openAiPreset, "https://api.openai.com"), true);
  assert.equal(providerPresetMatchesBaseUrl(openAiPreset, "https://proxy.example.com/v1"), false);
  assert.equal(findProviderPresetByBaseUrlInList(presets, "api.anthropic.com/v1/messages")?.id, "anthropic");
});

test("provider identity lookup normalizes aliases and punctuation", () => {
  assert.equal(findProviderPresetByIdentityInList(presets, "my ChatGPT gateway")?.id, "openai");
  assert.equal(findProviderPresetByIdentityInList(presets, "Claude Provider")?.id, "anthropic");
});

test("provider identity safety allows loopback but warns on branded third-party endpoints", () => {
  assert.equal(
    providerIdentitySafetyIssueInList(presets, {
      baseUrl: "http://127.0.0.1:3456/v1",
      name: "OpenAI local test"
    }),
    undefined
  );
  assert.match(
    providerIdentitySafetyIssueInList(presets, {
      baseUrl: "https://proxy.example.com/v1",
      name: "OpenAI proxy"
    })?.message ?? "",
    /Provider identity looks like OpenAI/
  );
});

test("provider API key safety blocks official-looking keys on untrusted endpoints", () => {
  assert.match(
    providerApiKeySafetyIssueInList(presets, {
      apiKey: "sk-openai-test",
      baseUrl: "https://proxy.example.com/v1",
      name: "neutral proxy"
    })?.message ?? "",
    /official OpenAI key/
  );
  assert.equal(
    providerApiKeySafetyIssueInList(presets, {
      apiKey: "sk-openai-test",
      baseUrl: "https://api.openai.com/v1"
    }),
    undefined
  );
  assert.match(
    providerEndpointCanReceiveProviderApiKeyInList(presets, {
      apiKey: "sk-ant-test",
      endpoint: "https://proxy.example.com/anthropic",
      providerName: "Anthropic"
    })?.message ?? "",
    /official Anthropic key/
  );
});
