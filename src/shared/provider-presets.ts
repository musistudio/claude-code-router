import type { GatewayProviderProtocol, ProviderAccountConfig, ProviderAccountMappingConfig } from "./app";
import { providerUrlWithDefaultScheme } from "./provider-url";

export type ProviderPresetEndpoint = {
  baseUrl: string;
  label?: string;
  protocols: GatewayProviderProtocol[];
};

export type ProviderPreset = {
  account?: ProviderAccountConfig;
  aliases: string[];
  defaultModels?: string[];
  endpoints: ProviderPresetEndpoint[];
  id: string;
  name: string;
};

export type ProviderIdentitySafetyIssue = {
  message: string;
  preset: ProviderPreset;
};

type ProviderOfficialKeyPattern = {
  pattern: RegExp;
  presetId: string;
};

export const customProviderPresetId = "custom";

export const defaultProviderAccountConfig: ProviderAccountConfig = {
  connectors: [],
  enabled: false
};

export const standardProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      type: "standard"
    }
  ],
  enabled: true
};

const deepSeekProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.deepseek.com/user/balance",
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.balance_infos[0].total_balance",
            unit: "$.balance_infos[0].currency"
          },
          {
            id: "granted_balance",
            kind: "balance",
            label: "Granted balance",
            remaining: "$.balance_infos[0].granted_balance",
            unit: "$.balance_infos[0].currency"
          },
          {
            id: "topped_up_balance",
            kind: "balance",
            label: "Topped-up balance",
            remaining: "$.balance_infos[0].topped_up_balance",
            unit: "$.balance_infos[0].currency"
          }
        ]
      },
      type: "http-json"
    }
  ],
  enabled: true
};

const moonshotProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.moonshot.cn/v1/users/me/balance",
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.data.available_balance",
            unit: "CNY"
          },
          {
            id: "voucher_balance",
            kind: "balance",
            label: "Voucher balance",
            remaining: "$.data.voucher_balance",
            unit: "CNY"
          },
          {
            id: "cash_balance",
            kind: "balance",
            label: "Cash balance",
            remaining: "$.data.cash_balance",
            unit: "CNY"
          }
        ]
      },
      type: "http-json"
    }
  ],
  enabled: true
};

const openRouterProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://openrouter.ai/api/v1/credits",
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.data.total_credits - $.data.total_usage",
            unit: "USD"
          },
          {
            id: "total_credits",
            kind: "balance",
            label: "Total credits",
            limit: "$.data.total_credits",
            unit: "USD"
          },
          {
            id: "total_usage",
            kind: "balance",
            label: "Total usage",
            unit: "USD",
            used: "$.data.total_usage"
          }
        ]
      },
      type: "http-json"
    }
  ],
  enabled: true
};

const zhipuQuotaMapping: ProviderAccountMappingConfig = {
  meters: [
    {
      id: "five_hour_quota",
      kind: "quota",
      label: "5h quota",
      limit: 100,
      remaining: "100 - $.data.limits[?(@.type==\"TOKENS_LIMIT\" && @.unit==3)].percentage",
      resetAt: "$.data.limits[?(@.type==\"TOKENS_LIMIT\" && @.unit==3)].nextResetTime",
      unit: "%",
      used: "$.data.limits[?(@.type==\"TOKENS_LIMIT\" && @.unit==3)].percentage",
      window: "5h"
    },
    {
      id: "weekly_quota",
      kind: "quota",
      label: "Weekly quota",
      limit: 100,
      remaining: "100 - $.data.limits[?(@.type==\"TOKENS_LIMIT\" && @.unit==6)].percentage",
      resetAt: "$.data.limits[?(@.type==\"TOKENS_LIMIT\" && @.unit==6)].nextResetTime",
      unit: "%",
      used: "$.data.limits[?(@.type==\"TOKENS_LIMIT\" && @.unit==6)].percentage",
      window: "weekly"
    },
  ]
};

const zhipuCnProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key-raw",
      endpoint: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
      headers: {
        "Accept-Language": "en-US,en"
      },
      mapping: zhipuQuotaMapping,
      type: "http-json"
    }
  ],
  enabled: true
};

const zaiGlobalProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key-raw",
      endpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
      headers: {
        "Accept-Language": "en-US,en"
      },
      mapping: zhipuQuotaMapping,
      type: "http-json"
    }
  ],
  enabled: true
};

const mistralProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.mistral.ai/v1/billing/subscription",
      mapping: {
        meters: [
          {
            id: "credit_balance",
            kind: "balance",
            label: "Credit balance",
            remaining: "$.credit_balance",
            unit: "EUR"
          },
          {
            id: "monthly_budget",
            kind: "quota",
            label: "Monthly budget",
            limit: "$.monthly_budget",
            unit: "EUR",
            window: "monthly"
          }
        ]
      },
      type: "http-json"
    }
  ],
  enabled: true
};

const siliconFlowProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.siliconflow.cn/v1/user/info",
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.data.totalBalance",
            unit: "CNY"
          },
          {
            id: "current_balance",
            kind: "balance",
            label: "Current balance",
            remaining: "$.data.balance",
            unit: "CNY"
          },
          {
            id: "charge_balance",
            kind: "balance",
            label: "Charge balance",
            remaining: "$.data.chargeBalance",
            unit: "CNY"
          }
        ]
      },
      type: "http-json"
    }
  ],
  enabled: true
};

export const providerPresets: ProviderPreset[] = [
  {
    account: defaultProviderAccountConfig,
    aliases: ["openai", "chatgpt"],
    defaultModels: ["gpt-4o"],
    endpoints: [
      {
        baseUrl: "https://api.openai.com/v1",
        protocols: ["openai_responses", "openai_chat_completions"]
      }
    ],
    id: "openai",
    name: "OpenAI"
  },
  {
    account: defaultProviderAccountConfig,
    aliases: ["anthropic", "claude"],
    defaultModels: ["claude-sonnet-4-20250514"],
    endpoints: [
      {
        baseUrl: "https://api.anthropic.com",
        protocols: ["anthropic_messages"]
      }
    ],
    id: "anthropic",
    name: "Anthropic"
  },
  {
    account: defaultProviderAccountConfig,
    aliases: ["gemini", "google"],
    endpoints: [
      {
        baseUrl: "https://generativelanguage.googleapis.com",
        protocols: ["gemini_generate_content"]
      }
    ],
    id: "gemini",
    name: "Google Gemini"
  },
  {
    account: openRouterProviderAccountConfig,
    aliases: ["openrouter"],
    endpoints: [
      {
        baseUrl: "https://openrouter.ai/api/v1",
        protocols: ["openai_chat_completions", "openai_responses"]
      }
    ],
    id: "openrouter",
    name: "OpenRouter"
  },
  {
    account: deepSeekProviderAccountConfig,
    aliases: ["deepseek"],
    defaultModels: ["deepseek-chat"],
    endpoints: [
      {
        baseUrl: "https://api.deepseek.com",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "deepseek",
    name: "DeepSeek"
  },
  {
    account: zhipuCnProviderAccountConfig,
    aliases: ["zhipu", "bigmodel", "glm", "智谱", "智谱ai", "智谱清言"],
    defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
    endpoints: [
      {
        baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
        protocols: ["openai_chat_completions"]
      },
      {
        baseUrl: "https://open.bigmodel.cn/api/anthropic",
        protocols: ["anthropic_messages"]
      }
    ],
    id: "zhipu-cn-coding",
    name: "Zhipu AI (China) - Coding Plan"
  },
  {
    account: zhipuCnProviderAccountConfig,
    aliases: ["zhipu", "bigmodel", "glm", "智谱", "智谱ai", "智谱清言"],
    defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
    endpoints: [
      {
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "zhipu-cn-general",
    name: "Zhipu AI (China) - General Endpoint"
  },
  {
    account: zaiGlobalProviderAccountConfig,
    aliases: ["z.ai", "zai", "z ai", "z-ai", "glm global"],
    defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
    endpoints: [
      {
        baseUrl: "https://api.z.ai/api/coding/paas/v4",
        protocols: ["openai_chat_completions"]
      },
      {
        baseUrl: "https://api.z.ai/api/anthropic",
        protocols: ["anthropic_messages"]
      }
    ],
    id: "zai-global-coding",
    name: "Z.ai (Global) - Coding Plan"
  },
  {
    account: zaiGlobalProviderAccountConfig,
    aliases: ["z.ai", "zai", "z ai", "z-ai", "glm global"],
    defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
    endpoints: [
      {
        baseUrl: "https://api.z.ai/api/paas/v4",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "zai-global-general",
    name: "Z.ai (Global) - General Endpoint"
  },
  {
    account: mistralProviderAccountConfig,
    aliases: ["mistral"],
    endpoints: [
      {
        baseUrl: "https://api.mistral.ai/v1",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "mistral",
    name: "Mistral"
  },
  {
    account: moonshotProviderAccountConfig,
    aliases: ["kimi", "moonshot"],
    defaultModels: ["moonshot-v1-8k"],
    endpoints: [
      {
        baseUrl: "https://api.moonshot.cn/v1",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "moonshot",
    name: "Moonshot Kimi"
  },
  {
    account: defaultProviderAccountConfig,
    aliases: ["qwen", "dashscope", "bailian", "alibaba"],
    endpoints: [
      {
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "bailian",
    name: "Alibaba Bailian"
  },
  {
    account: siliconFlowProviderAccountConfig,
    aliases: ["siliconflow"],
    endpoints: [
      {
        baseUrl: "https://api.siliconflow.cn/v1",
        protocols: ["openai_chat_completions"]
      }
    ],
    id: "siliconflow",
    name: "SiliconFlow"
  }
];

const officialProviderKeyPatterns: ProviderOfficialKeyPattern[] = [
  { pattern: /^sk-(?:proj|svcacct)-[a-z0-9_-]+$/i, presetId: "openai" },
  { pattern: /^sk-ant-[a-z0-9_-]+$/i, presetId: "anthropic" },
  { pattern: /^AIza[a-z0-9_-]{20,}$/i, presetId: "gemini" },
  { pattern: /^sk-or-v1-[a-z0-9_-]+$/i, presetId: "openrouter" }
];

export function findProviderPreset(id: string | undefined): ProviderPreset | undefined {
  if (!id || id === customProviderPresetId) {
    return undefined;
  }
  return providerPresets.find((preset) => preset.id === id);
}

export function findProviderPresetByBaseUrl(baseUrl: string): ProviderPreset | undefined {
  return providerPresets.find((preset) =>
    providerPresetMatchesBaseUrl(preset, baseUrl)
  );
}

export function primaryProviderPresetEndpoint(preset: ProviderPreset): ProviderPresetEndpoint | undefined {
  return preset.endpoints[0];
}

export function providerIdentitySafetyIssue(input: {
  baseUrl: string;
  name?: string;
  presetId?: string;
}): ProviderIdentitySafetyIssue | undefined {
  if (isLoopbackProviderBaseUrl(input.baseUrl)) {
    return undefined;
  }

  const selectedPreset = findProviderPreset(input.presetId);
  if (selectedPreset && !providerPresetMatchesBaseUrl(selectedPreset, input.baseUrl)) {
    return createProviderIdentitySafetyIssue(selectedPreset);
  }

  const namedPresets = findProviderPresetsByIdentity(input.name);
  if (
    namedPresets.length > 0 &&
    !namedPresets.some((preset) => providerPresetMatchesBaseUrl(preset, input.baseUrl))
  ) {
    return createProviderIdentitySafetyIssue(namedPresets[0]);
  }

  return undefined;
}

export function providerApiKeySafetyIssue(input: {
  apiKey?: string;
  baseUrl: string;
  name?: string;
  presetId?: string;
}): ProviderIdentitySafetyIssue | undefined {
  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    const officialKeyPreset = findProviderPresetByOfficialKey(apiKey);
    if (officialKeyPreset && !providerBaseUrlCanReceiveOfficialKey(officialKeyPreset, input.baseUrl)) {
      return createProviderApiKeySafetyIssue(officialKeyPreset);
    }
  }

  return providerIdentitySafetyIssue(input);
}

export function providerPresetMatchesBaseUrl(preset: ProviderPreset, baseUrl: string): boolean {
  return preset.endpoints.some((endpoint) => providerEndpointMatchesBaseUrl(endpoint.baseUrl, baseUrl));
}

export function providerEndpointCanReceiveProviderApiKey(input: {
  apiKey?: string;
  endpoint: string;
  providerName?: string;
  providerPresetId?: string;
}): ProviderIdentitySafetyIssue | undefined {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    return undefined;
  }

  const officialKeyPreset = findProviderPresetByOfficialKey(apiKey);
  if (officialKeyPreset && !providerBaseUrlCanReceiveOfficialKey(officialKeyPreset, input.endpoint)) {
    return createProviderApiKeySafetyIssue(officialKeyPreset);
  }

  const selectedPreset = findProviderPreset(input.providerPresetId);
  if (selectedPreset && !providerBaseUrlCanReceiveOfficialKey(selectedPreset, input.endpoint)) {
    return createProviderApiKeySafetyIssue(selectedPreset);
  }

  const namedPresets = findProviderPresetsByIdentity(input.providerName);
  if (
    namedPresets.length > 0 &&
    !namedPresets.some((preset) => providerBaseUrlCanReceiveOfficialKey(preset, input.endpoint))
  ) {
    return createProviderApiKeySafetyIssue(namedPresets[0]);
  }
  return undefined;
}

function findProviderPresetsByIdentity(name: string | undefined): ProviderPreset[] {
  const normalizedName = normalizeProviderIdentityText(name);
  if (!normalizedName) {
    return [];
  }

  return providerPresets.filter((preset) => {
    const identities = [preset.id, preset.name, ...preset.aliases]
      .map(normalizeProviderIdentityText)
      .filter(Boolean);
    return identities.some((identity) =>
      normalizedName === identity ||
      (identity.length >= 4 && normalizedName.includes(identity))
    );
  });
}

function createProviderIdentitySafetyIssue(preset: ProviderPreset): ProviderIdentitySafetyIssue {
  const hosts = uniqueStrings(preset.endpoints
    .map((endpoint) => providerEndpointHost(endpoint.baseUrl))
    .filter((host): host is string => Boolean(host)));
  return {
    message: `Provider identity looks like ${preset.name}, but the Base URL is not an official ${preset.name} endpoint (${hosts.join(", ")}). Use a neutral custom name for third-party gateways and never enter official provider keys into untrusted endpoints.`,
    preset
  };
}

function createProviderApiKeySafetyIssue(preset: ProviderPreset): ProviderIdentitySafetyIssue {
  const hosts = uniqueStrings(preset.endpoints
    .map((endpoint) => providerEndpointHost(endpoint.baseUrl))
    .filter((host): host is string => Boolean(host)));
  return {
    message: `The API key looks like an official ${preset.name} key, but the target endpoint is not an official ${preset.name} endpoint (${hosts.join(", ")}) or a local loopback endpoint. Official provider keys must not be sent to third-party gateways.`,
    preset
  };
}

function findProviderPresetByOfficialKey(apiKey: string): ProviderPreset | undefined {
  const matched = officialProviderKeyPatterns.find((item) => item.pattern.test(apiKey.trim()));
  return matched ? findProviderPreset(matched.presetId) : undefined;
}

function providerBaseUrlCanReceiveOfficialKey(preset: ProviderPreset, baseUrl: string): boolean {
  return providerPresetMatchesHost(preset, baseUrl) || isLoopbackProviderBaseUrl(baseUrl);
}

function providerEndpointMatchesBaseUrl(endpointBaseUrl: string, baseUrl: string): boolean {
  const endpoint = parseProviderPresetUrl(endpointBaseUrl);
  const candidate = parseProviderPresetUrl(baseUrl);
  if (!endpoint || !candidate) {
    return false;
  }
  if (candidate.protocol !== endpoint.protocol || candidate.host !== endpoint.host) {
    return false;
  }

  const endpointPath = normalizeProviderPresetPath(endpoint.pathname);
  const candidatePath = normalizeProviderPresetPath(candidate.pathname);
  return endpointPath === "/" || candidatePath === "/" || candidatePath === endpointPath || candidatePath.startsWith(`${endpointPath}/`);
}

function providerEndpointHost(baseUrl: string): string | undefined {
  return parseProviderPresetUrl(baseUrl)?.host;
}

function providerPresetMatchesHost(preset: ProviderPreset, baseUrl: string): boolean {
  const candidate = parseProviderPresetUrl(baseUrl);
  if (!candidate) {
    return false;
  }
  return preset.endpoints.some((endpoint) => {
    const parsed = parseProviderPresetUrl(endpoint.baseUrl);
    return parsed?.protocol === candidate.protocol && parsed.host === candidate.host;
  });
}

function parseProviderPresetUrl(value: string): URL | undefined {
  try {
    return new URL(providerUrlWithDefaultScheme(value.trim()));
  } catch {
    return undefined;
  }
}

function isLoopbackProviderBaseUrl(value: string): boolean {
  try {
    const hostname = new URL(providerUrlWithDefaultScheme(value.trim())).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function normalizeProviderPresetPath(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed || "/";
}

function normalizeProviderIdentityText(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "") ?? "";
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}
