import { anthropicProviderPreset } from "./anthropic";
import { bailianProviderPreset } from "./bailian";
import { deepSeekProviderPreset } from "./deepseek";
import { geminiProviderPreset } from "./gemini";
import { kimiCodingProviderPreset } from "./kimi-coding";
import { mistralProviderPreset } from "./mistral";
import { moonshotChinaProviderPreset, moonshotGlobalProviderPreset } from "./moonshot";
import { openaiProviderPreset } from "./openai";
import { openRouterProviderPreset } from "./openrouter";
import { runApiProviderPreset } from "./runapi";
import { siliconFlowProviderPreset } from "./siliconflow";
import { zaiGlobalCodingProviderPreset } from "./zai-global-coding";
import { zaiGlobalGeneralProviderPreset } from "./zai-global-general";
import { zhipuCnCodingProviderPreset } from "./zhipu-cn-coding";
import { zhipuCnGeneralProviderPreset } from "./zhipu-cn-general";
import {
  findProviderPresetByBaseUrlInList,
  findProviderPresetInList,
  primaryProviderPresetEndpoint,
  providerApiKeySafetyIssueInList,
  providerEndpointCanReceiveProviderApiKeyInList,
  providerIdentitySafetyIssueInList,
  providerPresetMatchesBaseUrl
} from "../../shared/provider-preset-utils";
import type { ProviderIdentitySafetyIssue, ProviderPreset } from "../../shared/provider-presets";

export const providerPresets: ProviderPreset[] = [
  openaiProviderPreset,
  anthropicProviderPreset,
  geminiProviderPreset,
  openRouterProviderPreset,
  deepSeekProviderPreset,
  kimiCodingProviderPreset,
  zhipuCnCodingProviderPreset,
  zhipuCnGeneralProviderPreset,
  zaiGlobalCodingProviderPreset,
  zaiGlobalGeneralProviderPreset,
  mistralProviderPreset,
  moonshotChinaProviderPreset,
  moonshotGlobalProviderPreset,
  bailianProviderPreset,
  siliconFlowProviderPreset,
  runApiProviderPreset
];

export function getProviderPresets(): ProviderPreset[] {
  return JSON.parse(JSON.stringify(providerPresets)) as ProviderPreset[];
}

export function findProviderPreset(id: string | undefined): ProviderPreset | undefined {
  return findProviderPresetInList(providerPresets, id);
}

export function findProviderPresetByBaseUrl(baseUrl: string): ProviderPreset | undefined {
  return findProviderPresetByBaseUrlInList(providerPresets, baseUrl);
}

export { primaryProviderPresetEndpoint, providerPresetMatchesBaseUrl };

export function providerIdentitySafetyIssue(input: {
  baseUrl: string;
  name?: string;
  presetId?: string;
}): ProviderIdentitySafetyIssue | undefined {
  return providerIdentitySafetyIssueInList(providerPresets, input);
}

export function providerApiKeySafetyIssue(input: {
  apiKey?: string;
  baseUrl: string;
  name?: string;
  presetId?: string;
}): ProviderIdentitySafetyIssue | undefined {
  return providerApiKeySafetyIssueInList(providerPresets, input);
}

export function providerEndpointCanReceiveProviderApiKey(input: {
  apiKey?: string;
  endpoint: string;
  providerName?: string;
  providerPresetId?: string;
}): ProviderIdentitySafetyIssue | undefined {
  return providerEndpointCanReceiveProviderApiKeyInList(providerPresets, input);
}
