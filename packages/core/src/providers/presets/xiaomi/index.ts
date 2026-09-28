import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

const xiaomiMimoDefaultModels = ["mimo-v2.5-pro", "mimo-v2.5"];
const xiaomiMimoWebsiteUrl = "https://platform.xiaomimimo.com/";

function createXiaomiMimoProviderPreset(input: {
  aliases: string[];
  anthropicBaseUrl: string;
  id: string;
  name: string;
  openAiBaseUrl: string;
}): ProviderPreset {
  return {
    account: defaultProviderAccountConfig,
    aliases: input.aliases,
    defaultModels: xiaomiMimoDefaultModels,
    endpoints: [
      {
        baseUrl: input.openAiBaseUrl,
        label: "OpenAI",
        protocols: ["openai_responses", "openai_chat_completions"]
      },
      {
        baseUrl: input.anthropicBaseUrl,
        label: "Anthropic",
        protocols: ["anthropic_messages"]
      }
    ],
    id: input.id,
    name: input.name,
    websiteUrl: xiaomiMimoWebsiteUrl
  };
}

export const xiaomiMimoProviderPreset = createXiaomiMimoProviderPreset({
  aliases: ["mimo", "xiaomi", "xiaomi mimo", "小米", "小米 mimo"],
  anthropicBaseUrl: "https://api.xiaomimimo.com/anthropic",
  id: "xiaomi",
  name: "Xiaomi MiMo",
  openAiBaseUrl: "https://api.xiaomimimo.com/v1"
});

export const xiaomiMimoTokenPlanChinaProviderPreset = createXiaomiMimoProviderPreset({
  aliases: ["mimo token plan china", "xiaomi token plan china", "xiaomi token plan cn"],
  anthropicBaseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
  id: "xiaomi-token-plan-cn",
  name: "Xiaomi Token Plan (China)",
  openAiBaseUrl: "https://token-plan-cn.xiaomimimo.com/v1"
});

export const xiaomiMimoTokenPlanSingaporeProviderPreset = createXiaomiMimoProviderPreset({
  aliases: ["mimo token plan singapore", "xiaomi token plan singapore", "xiaomi token plan sgp"],
  anthropicBaseUrl: "https://token-plan-sgp.xiaomimimo.com/anthropic",
  id: "xiaomi-token-plan-sgp",
  name: "Xiaomi Token Plan (Singapore)",
  openAiBaseUrl: "https://token-plan-sgp.xiaomimimo.com/v1"
});

export const xiaomiMimoTokenPlanEuropeProviderPreset = createXiaomiMimoProviderPreset({
  aliases: ["mimo token plan europe", "xiaomi token plan ams", "xiaomi token plan europe"],
  anthropicBaseUrl: "https://token-plan-ams.xiaomimimo.com/anthropic",
  id: "xiaomi-token-plan-ams",
  name: "Xiaomi Token Plan (Europe)",
  openAiBaseUrl: "https://token-plan-ams.xiaomimimo.com/v1"
});
