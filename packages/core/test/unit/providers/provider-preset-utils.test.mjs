import assert from "node:assert/strict";
import test from "node:test";
import {
  findProviderPresetByBaseUrlInList,
  findProviderPresetByIdentityInList,
  providerApiKeySafetyIssueInList,
  providerEndpointCanReceiveProviderApiKeyInList,
  providerIdentitySafetyIssueInList,
  providerPresetMatchesBaseUrl
} from "@ccr/core/providers/presets/utils.ts";
import {
  fennoProviderPreset
} from "@ccr/core/providers/presets/fenno/index.ts";
import {
  moonshotChinaProviderPreset,
  moonshotGlobalProviderPreset
} from "@ccr/core/providers/presets/moonshot/index.ts";
import {
  qiniuAiProviderPreset
} from "@ccr/core/providers/presets/qiniu-ai/index.ts";
import {
  unity2ProviderPreset
} from "@ccr/core/providers/presets/unity2/index.ts";

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
const moonshotPresets = [moonshotChinaProviderPreset, moonshotGlobalProviderPreset];

test("provider preset matching accepts endpoint subpaths but rejects different hosts", () => {
  const openRouterPreset = {
    aliases: ["openrouter"],
    endpoints: [{ baseUrl: "https://openrouter.ai/api/v1", protocols: ["openai_chat_completions"] }],
    id: "openrouter",
    name: "OpenRouter"
  };

  assert.equal(providerPresetMatchesBaseUrl(openAiPreset, "https://api.openai.com/v1/chat/completions"), true);
  assert.equal(providerPresetMatchesBaseUrl(openAiPreset, "https://api.openai.com"), true);
  assert.equal(providerPresetMatchesBaseUrl(openRouterPreset, "https://openrouter.ai/api"), true);
  assert.equal(providerPresetMatchesBaseUrl(openAiPreset, "https://proxy.example.com/v1"), false);
  assert.equal(findProviderPresetByBaseUrlInList(presets, "api.anthropic.com/v1/messages")?.id, "anthropic");
});

test("provider identity lookup normalizes aliases and punctuation", () => {
  assert.equal(findProviderPresetByIdentityInList(presets, "my ChatGPT gateway")?.id, "openai");
  assert.equal(findProviderPresetByIdentityInList(presets, "Claude Provider")?.id, "anthropic");
});

test("provider identity lookup prefers exact Kimi regional names over shared aliases", () => {
  assert.equal(findProviderPresetByIdentityInList(moonshotPresets, "Kimi API (Global)")?.id, "moonshot-global");
  assert.equal(findProviderPresetByIdentityInList(moonshotPresets, "Kimi API (China)")?.id, "moonshot");
});

test("sponsor provider presets expose requested endpoints and protocols", () => {
  assert.equal(fennoProviderPreset.websiteUrl, "https://api.fenno.ai/register?redirect=/purchase?tab=subscription%26group=16&aff=9HHHAB5QLAES");
  assert.deepEqual(fennoProviderPreset.endpoints[0]?.protocols, [
    "openai_chat_completions",
    "openai_responses",
    "anthropic_messages"
  ]);

  assert.equal(qiniuAiProviderPreset.websiteUrl, "https://s.qiniu.com/AVjMVf");
  assert.equal(providerPresetMatchesBaseUrl(qiniuAiProviderPreset, "https://api.qnaigc.com"), true);
  assert.equal(providerPresetMatchesBaseUrl(qiniuAiProviderPreset, "https://api.modelink.ai/v1/models"), false);
  assert.equal(providerPresetMatchesBaseUrl(qiniuAiProviderPreset, "https://api.qnaigc.com/bypass/openai/v1/responses"), true);
  assert.equal(providerPresetMatchesBaseUrl(qiniuAiProviderPreset, "https://api.qnaigc.com/bypass/vertex/v1/models/gemini-pro:generateContent"), true);
  assert.deepEqual(qiniuAiProviderPreset.endpoints.map((endpoint) => [endpoint.label, endpoint.baseUrl, endpoint.protocols]), [
    ["China mainland OpenAI", "https://api.qnaigc.com", ["openai_chat_completions"]],
    ["China mainland OpenAI Responses", "https://api.qnaigc.com/bypass/openai/v1", ["openai_responses"]],
    ["China mainland Anthropic", "https://api.qnaigc.com", ["anthropic_messages"]],
    ["China mainland Gemini Generate", "https://api.qnaigc.com/bypass/vertex/v1", ["gemini_generate_content"]]
  ]);
  assert.deepEqual(qiniuAiProviderPreset.endpoints[0]?.protocols, [
    "openai_chat_completions"
  ]);

  assert.equal(unity2ProviderPreset.websiteUrl, "https://unity2.ai/register?source=claudecoderouter");
  assert.equal(providerPresetMatchesBaseUrl(unity2ProviderPreset, "https://unity2.ai/v1/chat/completions"), true);
  assert.equal(providerPresetMatchesBaseUrl(unity2ProviderPreset, "https://api.unity2.ai/v1"), false);
  assert.deepEqual(unity2ProviderPreset.endpoints[0]?.protocols, [
    "openai_chat_completions"
  ]);
});

test("provider identity safety does not block branded third-party endpoints", () => {
  assert.equal(
    providerIdentitySafetyIssueInList(presets, {
      baseUrl: "http://127.0.0.1:3456/v1",
      name: "OpenAI local test"
    }),
    undefined
  );
  assert.equal(
    providerIdentitySafetyIssueInList(presets, {
      baseUrl: "https://proxy.example.com/v1",
      name: "OpenAI proxy"
    }),
    undefined
  );
});

test("provider identity safety does not block shared Kimi aliases", () => {
  assert.equal(
    providerIdentitySafetyIssueInList(moonshotPresets, {
      baseUrl: "https://api.moonshot.ai/anthropic",
      name: "Kimi API (Global)"
    }),
    undefined
  );
  assert.equal(
    providerIdentitySafetyIssueInList(moonshotPresets, {
      baseUrl: "https://api.moonshot.ai/v1",
      name: "Kimi API (China)"
    }),
    undefined
  );
  assert.equal(
    providerEndpointCanReceiveProviderApiKeyInList(moonshotPresets, {
      apiKey: "manifest-provider-api-key",
      endpoint: "https://api.moonshot.ai/v1/users/me/balance",
      providerName: "Kimi API (China)"
    }),
    undefined
  );
  assert.equal(
    providerIdentitySafetyIssueInList(moonshotPresets, {
      baseUrl: "https://proxy.example.com/v1",
      name: "Kimi API (Global)"
    }),
    undefined
  );
});

test("provider API key safety does not block official-looking keys on third-party endpoints", () => {
  assert.equal(
    providerApiKeySafetyIssueInList(presets, {
      apiKey: "sk-openai-test",
      baseUrl: "https://proxy.example.com/v1",
      name: "neutral proxy"
    }),
    undefined
  );
  assert.equal(
    providerApiKeySafetyIssueInList(presets, {
      apiKey: "sk-openai-test",
      baseUrl: "https://api.openai.com/v1"
    }),
    undefined
  );
  assert.equal(
    providerEndpointCanReceiveProviderApiKeyInList(presets, {
      apiKey: "sk-ant-test",
      endpoint: "https://proxy.example.com/anthropic",
      providerName: "Anthropic"
    }),
    undefined
  );
});
