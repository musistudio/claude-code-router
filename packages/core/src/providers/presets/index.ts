import { anthropicProviderPreset } from "@ccr/core/providers/presets/anthropic/index";
import { bailianProviderPreset } from "@ccr/core/providers/presets/bailian/index";
import { claudeApiProviderPreset } from "@ccr/core/providers/presets/claudeapi/index";
import { code0ProviderPreset } from "@ccr/core/providers/presets/code0/index";
import { deepSeekProviderPreset } from "@ccr/core/providers/presets/deepseek/index";
import { fennoProviderPreset } from "@ccr/core/providers/presets/fenno/index";
import { geminiProviderPreset } from "@ccr/core/providers/presets/gemini/index";
import { kimiCodingProviderPreset } from "@ccr/core/providers/presets/kimi-coding/index";
import { minimaxChinaProviderPreset, minimaxGlobalProviderPreset } from "@ccr/core/providers/presets/minimax/index";
import { mistralProviderPreset } from "@ccr/core/providers/presets/mistral/index";
import { moonshotChinaProviderPreset, moonshotGlobalProviderPreset } from "@ccr/core/providers/presets/moonshot/index";
import { nvidiaProviderPreset } from "@ccr/core/providers/presets/nvidia/index";
import { openaiProviderPreset } from "@ccr/core/providers/presets/openai/index";
import { openRouterProviderPreset } from "@ccr/core/providers/presets/openrouter/index";
import { qiniuAiProviderPreset } from "@ccr/core/providers/presets/qiniu-ai/index";
import { runApiProviderPreset } from "@ccr/core/providers/presets/runapi/index";
import { siliconFlowProviderPreset } from "@ccr/core/providers/presets/siliconflow/index";
import { teamoRouterProviderPreset } from "@ccr/core/providers/presets/teamorouter/index";
import { daoxeProviderPreset } from "@ccr/core/providers/presets/daoxe/index";
import { unity2ProviderPreset } from "@ccr/core/providers/presets/unity2/index";
import { zaiGlobalCodingProviderPreset } from "@ccr/core/providers/presets/zai-global-coding/index";
import { zaiGlobalGeneralProviderPreset } from "@ccr/core/providers/presets/zai-global-general/index";
import { zhipuCnCodingProviderPreset } from "@ccr/core/providers/presets/zhipu-cn-coding/index";
import { zhipuCnGeneralProviderPreset } from "@ccr/core/providers/presets/zhipu-cn-general/index";
import {
  findProviderPresetByBaseUrlInList,
  findProviderPresetInList,
  primaryProviderPresetEndpoint,
  providerApiKeySafetyIssueInList,
  providerEndpointCanReceiveProviderApiKeyInList,
  providerIdentitySafetyIssueInList,
  providerPresetMatchesBaseUrl
} from "@ccr/core/providers/presets/utils";
import type { ProviderIdentitySafetyIssue, ProviderPreset } from "@ccr/core/providers/presets/types";

export const providerPresets: ProviderPreset[] = [
  openaiProviderPreset,
  anthropicProviderPreset,
  geminiProviderPreset,
  openRouterProviderPreset,
  nvidiaProviderPreset,
  deepSeekProviderPreset,
  kimiCodingProviderPreset,
  zhipuCnCodingProviderPreset,
  zhipuCnGeneralProviderPreset,
  zaiGlobalCodingProviderPreset,
  zaiGlobalGeneralProviderPreset,
  minimaxGlobalProviderPreset,
  minimaxChinaProviderPreset,
  mistralProviderPreset,
  moonshotChinaProviderPreset,
  moonshotGlobalProviderPreset,
  bailianProviderPreset,
  siliconFlowProviderPreset,
  qiniuAiProviderPreset,
  fennoProviderPreset,
  runApiProviderPreset,
  teamoRouterProviderPreset,
  daoxeProviderPreset,
  unity2ProviderPreset,
  code0ProviderPreset,
  claudeApiProviderPreset
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
