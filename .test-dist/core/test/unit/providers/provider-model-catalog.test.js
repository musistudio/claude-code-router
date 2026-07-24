"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/core/test/unit/providers/provider-model-catalog.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/providers/url.ts
function providerUrlWithDefaultScheme(value) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(value)) {
    return `http://${value}`;
  }
  return `https://${value}`;
}

// packages/core/src/models/catalog-file.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
function loadModelCatalogPayload() {
  const candidate = resolveModelCatalogPath();
  return candidate ? {
    loadedFrom: candidate,
    payload: JSON.parse((0, import_node_fs.readFileSync)(candidate, "utf8"))
  } : void 0;
}
function resolveModelCatalogPath() {
  return modelCatalogPathCandidates().find((candidate) => (0, import_node_fs.existsSync)(candidate));
}
function modelCatalogPathCandidates() {
  return uniqueStrings([
    process.env.CCR_MODEL_CATALOG_PATH?.trim() || "",
    process.env.CCR_MODELS_JSON_PATH?.trim() || "",
    (0, import_node_path.resolve)(process.cwd(), "models.json"),
    (0, import_node_path.resolve)(process.cwd(), "packages", "core", "models.json"),
    (0, import_node_path.resolve)(process.cwd(), "packages", "cli", "models.json"),
    (0, import_node_path.resolve)(__dirname, "..", "models.json"),
    (0, import_node_path.resolve)(__dirname, "..", "assets", "models.json"),
    (0, import_node_path.resolve)(__dirname, "..", "..", "models.json"),
    (0, import_node_path.resolve)(__dirname, "..", "..", "..", "models.json")
  ]);
}
function uniqueStrings(values) {
  const seen = /* @__PURE__ */ new Set();
  const strings = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    strings.push(trimmed);
  }
  return strings;
}

// packages/core/src/providers/presets/types.ts
var customProviderPresetId = "custom";
var defaultProviderAccountConfig = {
  connectors: [],
  enabled: false
};
var standardProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      type: "standard"
    }
  ],
  enabled: true
};

// packages/core/src/providers/presets/anthropic/index.ts
var anthropicProviderPreset = {
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
  name: "Anthropic",
  officialApiKeyPatterns: [
    { flags: "i", source: "^sk-ant-[a-z0-9_-]+$" }
  ],
  websiteUrl: "https://www.anthropic.com/"
};

// packages/core/src/providers/presets/bailian/index.ts
var bailianProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["qwen", "dashscope", "bailian", "alibaba"],
  endpoints: [
    {
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "bailian",
  name: "Alibaba Bailian",
  websiteUrl: "https://bailian.console.aliyun.com/"
};

// packages/core/src/providers/presets/claudeapi/index.ts
var claudeApiProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["claudeapi", "claudeapi.com", "www.claudeapi.com"],
  endpoints: [
    {
      baseUrl: "https://gw.claudeapi.com",
      protocols: ["anthropic_messages"]
    }
  ],
  id: "claudeapi",
  name: "claudeapi",
  websiteUrl: "https://console.claudeapi.com/agent/register/LbmB7Y9kPloyzhwF?utm_source=claudecoderouter&utm_medium=partner&utm_campaign=claudecoderouter_2026&utm_content=default"
};

// packages/core/src/providers/presets/code0/index.ts
var code0ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["code0", "code0.ai", "code 0"],
  endpoints: [
    {
      baseUrl: "https://console.code0.ai",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "code0",
  name: "code0.ai",
  websiteUrl: "https://code0.ai/agent/register/9n9jOsSnYQoemIVL?utm_source=claudecoderouter&utm_medium=partner&utm_campaign=claudecoderouter_2026&utm_content=default"
};

// packages/core/src/providers/presets/deepseek/index.ts
var deepSeekProviderAccountConfig = {
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
var deepSeekProviderPreset = {
  account: deepSeekProviderAccountConfig,
  aliases: ["deepseek"],
  endpoints: [
    {
      baseUrl: "https://api.deepseek.com",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "deepseek",
  name: "DeepSeek",
  websiteUrl: "https://www.deepseek.com/"
};

// packages/core/src/providers/presets/fenno/index.ts
var fennoProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["fenno", "fenno.ai", "fenno ai"],
  endpoints: [
    {
      baseUrl: "https://api.fenno.ai",
      protocols: ["openai_chat_completions", "openai_responses", "anthropic_messages"]
    }
  ],
  id: "fenno",
  name: "Fenno.ai",
  websiteUrl: "https://api.fenno.ai/register?redirect=/purchase?tab=subscription%26group=16&aff=9HHHAB5QLAES"
};

// packages/core/src/providers/presets/gemini/index.ts
var geminiProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["gemini", "google"],
  endpoints: [
    {
      baseUrl: "https://generativelanguage.googleapis.com",
      protocols: ["gemini_generate_content", "gemini_interactions"]
    }
  ],
  id: "gemini",
  name: "Google Gemini",
  officialApiKeyPatterns: [
    { flags: "i", source: "^AIza[a-z0-9_-]{20,}$" }
  ],
  websiteUrl: "https://gemini.google.com/"
};

// packages/core/src/providers/presets/kimi-coding/index.ts
var kimiCodingProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.kimi.com/coding/v1/usages",
      mapping: {
        meters: []
      },
      parser: "kimi-code-usages",
      type: "http-json"
    }
  ],
  enabled: true
};
var kimiCodingProviderPreset = {
  account: kimiCodingProviderAccountConfig,
  aliases: ["kimi code", "kimi coding", "kimi coding plan", "kimi-for-coding"],
  defaultModelDisplayNames: {
    "kimi-for-coding": "K2.7 Code"
  },
  defaultModels: ["kimi-for-coding"],
  endpoints: [
    {
      baseUrl: "https://api.kimi.com/coding/v1",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://www.kimi.com/code?aff=ccr"
    },
    {
      baseUrl: "https://api.kimi.com/coding/",
      protocols: ["anthropic_messages"],
      websiteUrl: "https://www.kimi.com/code?aff=ccr"
    }
  ],
  id: "kimi-coding",
  name: "Kimi Code - Coding Plan",
  websiteUrl: "https://www.kimi.com/code?aff=ccr"
};

// packages/core/src/providers/presets/minimax/index.ts
var minimaxGlobalProviderPreset = {
  account: standardProviderAccountConfig,
  aliases: ["minimax", "minimax global"],
  defaultModels: ["MiniMax-M3"],
  endpoints: [
    {
      baseUrl: "https://api.minimax.io/v1",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://platform.minimax.io/docs"
    },
    {
      baseUrl: "https://api.minimax.io/anthropic/v1",
      protocols: ["anthropic_messages"],
      websiteUrl: "https://platform.minimax.io/docs"
    }
  ],
  id: "minimax-global",
  name: "MiniMax (Global)",
  websiteUrl: "https://platform.minimax.io/docs"
};
var minimaxChinaProviderPreset = {
  account: standardProviderAccountConfig,
  aliases: ["minimax", "minimaxi", "minimax china"],
  defaultModels: ["MiniMax-M3"],
  endpoints: [
    {
      baseUrl: "https://api.minimaxi.com/v1",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://platform.minimaxi.com/docs"
    },
    {
      baseUrl: "https://api.minimaxi.com/anthropic/v1",
      protocols: ["anthropic_messages"],
      websiteUrl: "https://platform.minimaxi.com/docs"
    }
  ],
  id: "minimax-cn",
  name: "MiniMax (China)",
  websiteUrl: "https://platform.minimaxi.com/docs"
};

// packages/core/src/providers/presets/mistral/index.ts
var mistralProviderAccountConfig = {
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
var mistralProviderPreset = {
  account: mistralProviderAccountConfig,
  aliases: ["mistral"],
  endpoints: [
    {
      baseUrl: "https://api.mistral.ai/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "mistral",
  name: "Mistral",
  websiteUrl: "https://mistral.ai/"
};

// packages/core/src/providers/presets/moonshot/index.ts
var moonshotGlobalProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://api.moonshot.ai/v1/users/me/balance",
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
var moonshotChinaProviderAccountConfig = {
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
var moonshotChinaProviderPreset = {
  account: moonshotChinaProviderAccountConfig,
  aliases: ["kimi", "kimi api", "moonshot", "moonshot kimi"],
  defaultModels: ["kimi-k2.7-code"],
  endpoints: [
    {
      baseUrl: "https://api.moonshot.cn/v1",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://platform.kimi.com/?aff=ccr"
    }
  ],
  id: "moonshot",
  name: "Kimi API (China)",
  websiteUrl: "https://platform.kimi.com/?aff=ccr"
};
var moonshotGlobalProviderPreset = {
  account: moonshotGlobalProviderAccountConfig,
  aliases: ["kimi", "kimi api", "moonshot", "moonshot kimi"],
  defaultModels: ["kimi-k2.7-code"],
  endpoints: [
    {
      baseUrl: "https://api.moonshot.ai/v1",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://platform.kimi.ai/?aff=ccr"
    }
  ],
  id: "moonshot-global",
  name: "Kimi API (Global)",
  websiteUrl: "https://platform.kimi.ai/?aff=ccr"
};

// packages/core/src/providers/presets/nvidia/index.ts
var nvidiaProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["nvidia", "nvidia nim", "nvidia api catalog", "build.nvidia.com"],
  defaultModels: [
    "nvidia/nemotron-3-super-120b-a12b",
    "nvidia/nemotron-3-ultra-550b-a55b"
  ],
  endpoints: [
    {
      baseUrl: "https://integrate.api.nvidia.com/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "nvidia",
  name: "NVIDIA",
  officialApiKeyPatterns: [
    { flags: "i", source: "^nvapi-[a-z0-9_-]+$" }
  ],
  websiteUrl: "https://build.nvidia.com/models"
};

// packages/core/src/providers/presets/openai/index.ts
var openaiProviderPreset = {
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
  name: "OpenAI",
  officialApiKeyPatterns: [
    { flags: "i", source: "^sk-(?:proj|svcacct)-[a-z0-9_-]+$" }
  ],
  websiteUrl: "https://openai.com/"
};

// packages/core/src/providers/presets/openrouter/index.ts
var openRouterProviderAccountConfig = {
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
            limit: "$.data.total_credits",
            used: "$.data.total_usage",
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
var openRouterProviderPreset = {
  account: openRouterProviderAccountConfig,
  aliases: ["openrouter"],
  endpoints: [
    {
      baseUrl: "https://openrouter.ai/api/v1",
      protocols: ["openai_chat_completions", "openai_responses"]
    }
  ],
  id: "openrouter",
  name: "OpenRouter",
  officialApiKeyPatterns: [
    { flags: "i", source: "^sk-or-v1-[a-z0-9_-]+$" }
  ],
  websiteUrl: "https://openrouter.ai/"
};

// packages/core/src/providers/presets/qiniu-ai/index.ts
var qiniuAiProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["qiniu", "qiniu ai", "qiniu cloud ai", "qiniu yun ai", "qiniu yun", "\u4E03\u725B\u4E91", "\u4E03\u725B\u4E91ai", "\u4E03\u725B\u4E91 ai", "modelink"],
  endpoints: [
    {
      baseUrl: "https://api.qnaigc.com",
      label: "China mainland OpenAI",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://s.qiniu.com/AVjMVf"
    },
    {
      baseUrl: "https://api.qnaigc.com/bypass/openai/v1",
      label: "China mainland OpenAI Responses",
      protocols: ["openai_responses"],
      websiteUrl: "https://s.qiniu.com/AVjMVf"
    },
    {
      baseUrl: "https://api.qnaigc.com",
      label: "China mainland Anthropic",
      protocols: ["anthropic_messages"],
      websiteUrl: "https://s.qiniu.com/AVjMVf"
    },
    {
      baseUrl: "https://api.qnaigc.com/bypass/vertex/v1",
      label: "China mainland Gemini Generate",
      protocols: ["gemini_generate_content"],
      websiteUrl: "https://s.qiniu.com/AVjMVf"
    }
  ],
  id: "qiniu-ai",
  name: "\u4E03\u725B\u4E91 AI",
  websiteUrl: "https://s.qiniu.com/AVjMVf"
};

// packages/core/src/providers/presets/runapi/index.ts
var runApiProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["runapi"],
  endpoints: [
    {
      baseUrl: "https://runapi.co/v1",
      protocols: ["openai_responses", "openai_chat_completions"]
    }
  ],
  id: "runapi",
  name: "RunAPI",
  websiteUrl: "https://runapi.co/register?aff=IX1t"
};

// packages/core/src/providers/presets/siliconflow/index.ts
var siliconFlowProviderAccountConfig = {
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
var siliconFlowProviderPreset = {
  account: siliconFlowProviderAccountConfig,
  aliases: ["siliconflow"],
  endpoints: [
    {
      baseUrl: "https://api.siliconflow.cn/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "siliconflow",
  name: "SiliconFlow",
  websiteUrl: "https://siliconflow.cn/"
};

// packages/core/src/providers/presets/teamorouter/index.ts
var teamoRouterProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["teamorouter", "teamo router", "teamo"],
  endpoints: [
    {
      baseUrl: "https://api.teamorouter.com",
      protocols: ["anthropic_messages", "openai_chat_completions", "openai_responses"]
    }
  ],
  id: "teamorouter",
  name: "TeamoRouter",
  websiteUrl: "https://teamorouter.com/"
};

// packages/core/src/providers/presets/unity2/index.ts
var unity2ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["unity2", "unity2.ai", "unity2 ai", "unity 2"],
  endpoints: [
    {
      baseUrl: "https://unity2.ai/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "unity2",
  name: "Unity2.Ai",
  websiteUrl: "https://unity2.ai/register?source=claudecoderouter"
};

// packages/core/src/providers/presets/zai-global-coding/index.ts
var zaiQuotaMapping = {
  meters: [
    {
      id: "five_hour_quota",
      kind: "quota",
      label: "5h quota",
      limit: 100,
      remaining: '100 - $.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==3)].percentage',
      resetAt: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==3)].nextResetTime',
      unit: "%",
      used: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==3)].percentage',
      window: "5h"
    },
    {
      id: "weekly_quota",
      kind: "quota",
      label: "Weekly quota",
      limit: 100,
      remaining: '100 - $.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==6)].percentage',
      resetAt: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==6)].nextResetTime',
      unit: "%",
      used: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==6)].percentage',
      window: "weekly"
    }
  ]
};
var zaiGlobalProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key-raw",
      endpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
      headers: {
        "Accept-Language": "en-US,en"
      },
      mapping: zaiQuotaMapping,
      type: "http-json"
    }
  ],
  enabled: true
};
var zaiGlobalCodingProviderPreset = {
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
  name: "Z.ai (Global) - Coding Plan",
  websiteUrl: "https://z.ai/"
};

// packages/core/src/providers/presets/zai-global-general/index.ts
var zaiQuotaMapping2 = {
  meters: [
    {
      id: "five_hour_quota",
      kind: "quota",
      label: "5h quota",
      limit: 100,
      remaining: '100 - $.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==3)].percentage',
      resetAt: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==3)].nextResetTime',
      unit: "%",
      used: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==3)].percentage',
      window: "5h"
    },
    {
      id: "weekly_quota",
      kind: "quota",
      label: "Weekly quota",
      limit: 100,
      remaining: '100 - $.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==6)].percentage',
      resetAt: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==6)].nextResetTime',
      unit: "%",
      used: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==6)].percentage',
      window: "weekly"
    }
  ]
};
var zaiGlobalProviderAccountConfig2 = {
  connectors: [
    {
      auth: "provider-api-key-raw",
      endpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
      headers: {
        "Accept-Language": "en-US,en"
      },
      mapping: zaiQuotaMapping2,
      type: "http-json"
    }
  ],
  enabled: true
};
var zaiGlobalGeneralProviderPreset = {
  account: zaiGlobalProviderAccountConfig2,
  aliases: ["z.ai", "zai", "z ai", "z-ai", "glm global"],
  defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
  endpoints: [
    {
      baseUrl: "https://api.z.ai/api/paas/v4",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "zai-global-general",
  name: "Z.ai (Global) - General Endpoint",
  websiteUrl: "https://z.ai/"
};

// packages/core/src/providers/presets/zhipu-cn-coding/index.ts
var zhipuQuotaMapping = {
  meters: [
    {
      id: "five_hour_quota",
      kind: "quota",
      label: "5h quota",
      limit: 100,
      remaining: '100 - $.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==3)].percentage',
      resetAt: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==3)].nextResetTime',
      unit: "%",
      used: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==3)].percentage',
      window: "5h"
    },
    {
      id: "weekly_quota",
      kind: "quota",
      label: "Weekly quota",
      limit: 100,
      remaining: '100 - $.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==6)].percentage',
      resetAt: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==6)].nextResetTime',
      unit: "%",
      used: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==6)].percentage',
      window: "weekly"
    }
  ]
};
var zhipuCnProviderAccountConfig = {
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
var zhipuCnCodingProviderPreset = {
  account: zhipuCnProviderAccountConfig,
  aliases: ["zhipu", "bigmodel", "glm", "\u667A\u8C31", "\u667A\u8C31ai", "\u667A\u8C31\u6E05\u8A00"],
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
  name: "Zhipu AI (China) - Coding Plan",
  websiteUrl: "https://www.bigmodel.cn/"
};

// packages/core/src/providers/presets/zhipu-cn-general/index.ts
var zhipuQuotaMapping2 = {
  meters: [
    {
      id: "five_hour_quota",
      kind: "quota",
      label: "5h quota",
      limit: 100,
      remaining: '100 - $.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==3)].percentage',
      resetAt: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==3)].nextResetTime',
      unit: "%",
      used: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==3)].percentage',
      window: "5h"
    },
    {
      id: "weekly_quota",
      kind: "quota",
      label: "Weekly quota",
      limit: 100,
      remaining: '100 - $.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==6)].percentage',
      resetAt: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==6)].nextResetTime',
      unit: "%",
      used: '$.data.limits[?(@.type=="TOKENS_LIMIT" && @.unit==6)].percentage',
      window: "weekly"
    }
  ]
};
var zhipuCnProviderAccountConfig2 = {
  connectors: [
    {
      auth: "provider-api-key-raw",
      endpoint: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
      headers: {
        "Accept-Language": "en-US,en"
      },
      mapping: zhipuQuotaMapping2,
      type: "http-json"
    }
  ],
  enabled: true
};
var zhipuCnGeneralProviderPreset = {
  account: zhipuCnProviderAccountConfig2,
  aliases: ["zhipu", "bigmodel", "glm", "\u667A\u8C31", "\u667A\u8C31ai", "\u667A\u8C31\u6E05\u8A00"],
  defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
  endpoints: [
    {
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "zhipu-cn-general",
  name: "Zhipu AI (China) - General Endpoint",
  websiteUrl: "https://www.bigmodel.cn/"
};

// packages/core/src/providers/presets/utils.ts
function findProviderPresetInList(presets, id) {
  if (!id || id === customProviderPresetId) {
    return void 0;
  }
  return presets.find((preset) => preset.id === id);
}
function findProviderPresetByBaseUrlInList(presets, baseUrl) {
  return presets.find(
    (preset) => providerPresetMatchesBaseUrl(preset, baseUrl)
  );
}
function providerPresetMatchesBaseUrl(preset, baseUrl) {
  return preset.endpoints.some((endpoint) => providerEndpointMatchesBaseUrl(endpoint.baseUrl, baseUrl));
}
function providerEndpointMatchesBaseUrl(endpointBaseUrl, baseUrl) {
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
  return endpointPath === "/" || candidatePath === "/" || candidatePath === endpointPath || candidatePath.startsWith(`${endpointPath}/`) || endpointPath.startsWith(`${candidatePath}/`);
}
function parseProviderPresetUrl(value) {
  try {
    return new URL(providerUrlWithDefaultScheme(value.trim()));
  } catch {
    return void 0;
  }
}
function normalizeProviderPresetPath(value) {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed || "/";
}

// packages/core/src/providers/presets/index.ts
var providerPresets = [
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
  unity2ProviderPreset,
  code0ProviderPreset,
  claudeApiProviderPreset
];
function findProviderPreset(id) {
  return findProviderPresetInList(providerPresets, id);
}
function findProviderPresetByBaseUrl(baseUrl) {
  return findProviderPresetByBaseUrlInList(providerPresets, baseUrl);
}

// packages/core/src/providers/model-catalog.ts
var presetCatalogProviderIds = {
  anthropic: ["anthropic"],
  bailian: ["alibaba-cn"],
  deepseek: ["deepseek"],
  gemini: ["google"],
  "kimi-coding": ["kimi-for-coding"],
  mistral: ["mistral"],
  moonshot: ["moonshotai-cn"],
  "moonshot-global": ["moonshotai"],
  nvidia: ["nvidia"],
  openai: ["openai"],
  openrouter: ["openrouter"],
  siliconflow: ["siliconflow-cn"],
  "zai-global-coding": ["zai-coding-plan"],
  "zai-global-general": ["zai"],
  "zhipu-cn-coding": ["zhipuai-coding-plan"],
  "zhipu-cn-general": ["zhipuai"]
};
var presetCatalogModelOverrides = {
  "kimi-coding": {
    modelDisplayNames: {
      "kimi-for-coding": "K2.7 Code"
    },
    metadataModelAliases: {
      "kimi-for-coding": "k2p7"
    },
    models: ["kimi-for-coding"],
    provider: "kimi-for-coding",
    providerName: "Kimi Code"
  }
};
var catalogIndex;
function getProviderCatalogModels(request) {
  const index = loadCatalogIndex();
  const modelOverride = providerCatalogModelOverride(request);
  if (modelOverride) {
    const { metadataModelAliases, ...result } = modelOverride;
    return {
      loadedFrom: index.loadedFrom,
      ...result,
      modelMetadata: catalogOverrideModelMetadata(index.providers, modelOverride, metadataModelAliases)
    };
  }
  const match = findBestCatalogProviderMatch(index.providers, request);
  if (!match) {
    return {
      loadedFrom: index.loadedFrom,
      models: []
    };
  }
  return {
    loadedFrom: index.loadedFrom,
    matchedBy: match.matchedBy,
    modelDisplayNames: nonEmptyRecord(match.entry.modelDisplayNames),
    modelMetadata: nonEmptyRecord(match.entry.modelMetadata),
    models: match.entry.models,
    provider: match.entry.provider,
    providerName: match.entry.providerName
  };
}
function providerCatalogModelOverride(request) {
  const providerPresetId = request.providerPresetId?.trim() || "";
  const providerPresetOverride = presetCatalogModelOverrides[providerPresetId];
  if (providerPresetOverride) {
    return {
      matchedBy: "provider-id",
      metadataModelAliases: providerPresetOverride.metadataModelAliases,
      modelDisplayNames: providerPresetOverride.modelDisplayNames,
      models: providerPresetOverride.models,
      provider: providerPresetOverride.provider,
      providerName: providerPresetOverride.providerName
    };
  }
  const baseUrlPresetId = request.baseUrl ? findProviderPresetByBaseUrl(request.baseUrl)?.id ?? "" : "";
  const baseUrlOverride = presetCatalogModelOverrides[baseUrlPresetId];
  if (baseUrlOverride) {
    return {
      matchedBy: "base-url",
      metadataModelAliases: baseUrlOverride.metadataModelAliases,
      modelDisplayNames: baseUrlOverride.modelDisplayNames,
      models: baseUrlOverride.models,
      provider: baseUrlOverride.provider,
      providerName: baseUrlOverride.providerName
    };
  }
  return void 0;
}
function catalogOverrideModelMetadata(providers, override, aliases) {
  const entry = providers.find((candidate) => candidate.provider === override.provider);
  if (!entry) {
    return void 0;
  }
  const result = {};
  for (const model of override.models) {
    const metadata = entry.modelMetadata[aliases?.[model] ?? model];
    if (metadata) {
      result[model] = metadata;
    }
  }
  return nonEmptyRecord(result);
}
function loadCatalogIndex() {
  if (catalogIndex) {
    return catalogIndex;
  }
  try {
    const loaded = loadModelCatalogPayload();
    if (loaded) {
      catalogIndex = buildCatalogIndex(loaded.payload, loaded.loadedFrom);
      return catalogIndex;
    }
  } catch (error) {
    console.warn("Failed to load provider model catalog:", error);
  }
  catalogIndex = {
    providers: []
  };
  return catalogIndex;
}
function buildCatalogIndex(payload, loadedFrom) {
  const providers = /* @__PURE__ */ new Map();
  const models = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];
  for (const item of models) {
    if (!isRecord(item)) {
      continue;
    }
    const sourceRecords = Array.isArray(item.sourceRecords) ? item.sourceRecords : [];
    for (const sourceRecord of sourceRecords) {
      if (!isRecord(sourceRecord)) {
        continue;
      }
      if (!catalogModelCanRouteText(item, sourceRecord)) {
        continue;
      }
      const provider = stringValue(sourceRecord.provider);
      const model = providerModelName(sourceRecord, item);
      if (!provider || !model) {
        continue;
      }
      const entry = providers.get(provider) ?? createMutableCatalogProviderEntry(provider);
      const providerName = stringValue(sourceRecord.providerName);
      const providerApi = stringValue(sourceRecord.providerApi);
      if (!entry.providerName && providerName) {
        entry.providerName = providerName;
      }
      addSetValue(entry.tokens, normalizeProviderToken(provider));
      addSetValue(entry.tokens, normalizeProviderToken(providerName));
      addSetValue(entry.tokens, normalizeProviderToken(providerApiHost(providerApi)));
      addSetValue(entry.apiUrls, normalizeProviderUrl(providerApi));
      if (!entry.modelSet.has(model)) {
        entry.modelSet.add(model);
        entry.models.push(model);
        const displayName = stringValue(sourceRecord.displayName) || stringValue(item.displayName);
        if (displayName && displayName !== model) {
          entry.modelDisplayNames[model] = displayName;
        }
        const metadata = providerModelMetadataFromCatalog(item, sourceRecord, provider, model);
        if (metadata) {
          entry.modelMetadata[model] = metadata;
        }
      }
      providers.set(provider, entry);
    }
  }
  return {
    loadedFrom,
    providers: Array.from(providers.values()).map((entry) => ({
      apiUrls: Array.from(entry.apiUrls),
      modelDisplayNames: entry.modelDisplayNames,
      modelMetadata: entry.modelMetadata,
      models: sortCatalogProviderModels(entry.models),
      provider: entry.provider,
      providerName: entry.providerName,
      tokens: Array.from(entry.tokens)
    }))
  };
}
function createMutableCatalogProviderEntry(provider) {
  return {
    apiUrls: /* @__PURE__ */ new Set(),
    modelDisplayNames: {},
    modelMetadata: {},
    models: [],
    modelSet: /* @__PURE__ */ new Set(),
    provider,
    tokens: /* @__PURE__ */ new Set([normalizeProviderToken(provider)])
  };
}
function providerModelMetadataFromCatalog(modelEntry, sourceRecord, provider, model) {
  const limits = isRecord(modelEntry.limits) ? modelEntry.limits : {};
  const contextWindow = maxPositiveInteger(limits.contextTokens, limits.inputTokens, limits.maxTokens);
  const capabilities = isRecord(modelEntry.capabilities) ? modelEntry.capabilities : {};
  const imageInput = booleanValue(capabilities.imageInput);
  const webSearch = booleanValue(capabilities.webSearch);
  const supportedReasoningLevels = catalogReasoningLevels(sourceRecord, capabilities);
  const supportsReasoningSummaries = booleanValue(capabilities.reasoning);
  const pricing = providerModelPricingFromCatalog(modelEntry, provider, model);
  const metadata = {
    ...imageInput !== void 0 || webSearch !== void 0 ? {
      capabilities: {
        ...imageInput !== void 0 ? { imageInput } : {},
        ...webSearch !== void 0 ? { webSearch } : {}
      }
    } : {},
    ...contextWindow ? { contextWindow, maxContextWindow: contextWindow } : {},
    ...pricing ? { pricing } : {},
    ...supportedReasoningLevels.length > 0 ? { supportedReasoningLevels } : {},
    ...supportsReasoningSummaries !== void 0 ? { supportsReasoningSummaries } : {}
  };
  return Object.keys(metadata).length > 0 ? metadata : void 0;
}
function catalogReasoningLevels(sourceRecord, capabilities) {
  const sourceMetadata = isRecord(sourceRecord.metadata) ? sourceRecord.metadata : {};
  const reasoningOptions = Array.isArray(sourceMetadata.reasoningOptions) ? sourceMetadata.reasoningOptions : [];
  const allowed = /* @__PURE__ */ new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);
  const efforts = uniqueStrings2(reasoningOptions.flatMap(
    (option) => isRecord(option) && stringValue(option.type).toLowerCase() === "effort" ? stringListValue(option.values).map((effort) => effort.toLowerCase()) : []
  )).filter((effort) => allowed.has(effort));
  const inferred = efforts.length > 0 ? efforts : [
    booleanValue(capabilities.lowReasoningEffort) ? "low" : "",
    booleanValue(capabilities.mediumReasoningEffort) ? "medium" : "",
    booleanValue(capabilities.highReasoningEffort) ? "high" : "",
    booleanValue(capabilities.xhighReasoningEffort) ? "xhigh" : "",
    booleanValue(capabilities.maxReasoningEffort) ? "max" : "",
    booleanValue(capabilities.ultraReasoningEffort) ? "ultra" : ""
  ].filter(Boolean);
  return inferred.map((effort) => ({ description: reasoningEffortDescription(effort), effort }));
}
function reasoningEffortDescription(effort) {
  if (effort === "xhigh") return "Extra high";
  return effort.slice(0, 1).toUpperCase() + effort.slice(1);
}
function providerModelPricingFromCatalog(modelEntry, provider, model) {
  const pricing = isRecord(modelEntry.pricing) ? modelEntry.pricing : {};
  const offers = Array.isArray(pricing.offers) ? pricing.offers.filter(isRecord) : [];
  const normalizedProvider = normalizeProviderToken(provider);
  const normalizedModel = normalizeModelToken(model);
  const matchingOffers = offers.map((candidate, index) => ({
    candidate,
    index,
    providerMatch: normalizeProviderToken(stringValue(candidate.provider)) === normalizedProvider,
    modelMatch: normalizeModelToken(stringValue(candidate.model)) === normalizedModel,
    sourceRank: catalogPricingSourceRank(stringValue(candidate.source))
  })).filter((candidate) => candidate.providerMatch).sort(
    (left, right) => Number(right.modelMatch) - Number(left.modelMatch) || left.sourceRank - right.sourceRank || left.index - right.index
  ).map(({ candidate }) => candidate);
  if (matchingOffers.length === 0) {
    return void 0;
  }
  const result = {};
  for (const offer of matchingOffers) {
    const candidate = providerModelPricingFromOffer(offer);
    for (const [field, value] of Object.entries(candidate)) {
      if (result[field] === void 0) {
        result[field] = value;
      }
    }
  }
  return Object.keys(result).length > 0 ? result : void 0;
}
function providerModelPricingFromOffer(offer) {
  const per1MTokens = isRecord(offer.per1MTokens) ? offer.per1MTokens : {};
  const extra = isRecord(offer.extra) ? offer.extra : {};
  const sourceUnit = stringValue(offer.sourceUnit);
  const cacheWriteLegacy = nonNegativeNumber(per1MTokens.cacheWrite);
  const cacheWrite5m = nonNegativeNumber(per1MTokens.cacheWrite5m) ?? cacheWriteLegacy;
  const cacheWrite1h = nonNegativeNumber(per1MTokens.cacheWrite1h) ?? catalogExtraCacheWrite1h(extra, sourceUnit);
  return {
    ...nonNegativeNumber(per1MTokens.cacheRead) !== void 0 ? { cacheReadUsdPerMillionTokens: nonNegativeNumber(per1MTokens.cacheRead) } : {},
    ...cacheWrite5m !== void 0 ? { cacheWrite5mUsdPerMillionTokens: cacheWrite5m } : {},
    ...cacheWrite1h !== void 0 ? { cacheWrite1hUsdPerMillionTokens: cacheWrite1h } : {},
    ...nonNegativeNumber(per1MTokens.input) !== void 0 ? { inputUsdPerMillionTokens: nonNegativeNumber(per1MTokens.input) } : {},
    ...nonNegativeNumber(per1MTokens.output) !== void 0 ? { outputUsdPerMillionTokens: nonNegativeNumber(per1MTokens.output) } : {}
  };
}
function catalogExtraCacheWrite1h(extra, sourceUnit) {
  const value = nonNegativeNumber(extra.input_cache_write_1h) ?? nonNegativeNumber(extra.cache_creation_input_token_cost_above_1hr);
  if (value === void 0) {
    return void 0;
  }
  return sourceUnit === "usd_per_1m_tokens" ? value : value * 1e6;
}
function catalogPricingSourceRank(source) {
  if (source === "models.dev") return 0;
  if (source === "litellm") return 1;
  if (source === "openrouter") return 2;
  return 3;
}
function maxPositiveInteger(...values) {
  const parsed = values.map((value) => nonNegativeNumber(value)).filter((value) => value !== void 0 && value > 0).map((value) => Math.trunc(value));
  return parsed.length > 0 ? Math.max(...parsed) : void 0;
}
function normalizeModelToken(value) {
  return value.trim().toLowerCase().replace(/^.*\//, "");
}
function nonEmptyRecord(value) {
  return Object.keys(value).length > 0 ? value : void 0;
}
function providerModelName(sourceRecord, modelEntry) {
  return stringValue(sourceRecord.model) || stringValue(sourceRecord.modelKey) || stringValue(modelEntry.model) || stringValue(modelEntry.id);
}
function sortCatalogProviderModels(models) {
  return models.map((model, index) => ({ index, model })).sort(
    (left, right) => catalogProviderModelRank(left.model) - catalogProviderModelRank(right.model) || left.index - right.index
  ).map((item) => item.model);
}
function catalogProviderModelRank(model) {
  const normalized = model.toLowerCase();
  if (normalized.startsWith("ft:") || normalized.includes("/ft:")) {
    return 30;
  }
  if (normalized.includes("sonnet")) return 0;
  if (normalized.includes("gpt-5") || normalized.includes("gpt-4o") || normalized.includes("gpt-4.1")) return 0;
  if (/\bo[34]\b/.test(normalized) || /(^|[-_/])o[34]([-_/]|$)/.test(normalized)) return 1;
  if (normalized.includes("opus")) return 1;
  if (normalized.includes("gemini") && normalized.includes("pro")) return 1;
  if (normalized.includes("deepseek-chat") || normalized.includes("kimi-k2") || normalized.includes("qwen3") || normalized.includes("glm-4.5") || normalized.includes("mistral-large")) return 2;
  if (normalized.includes("haiku") || normalized.includes("flash")) return 3;
  if (normalized.includes("mini") || normalized.includes("lite")) return 4;
  return 10;
}
function catalogModelCanRouteText(modelEntry, sourceRecord) {
  const mode = (stringValue(sourceRecord.mode) || stringValue(modelEntry.mode)).toLowerCase();
  if (/embedding|image|audio|speech|transcription|moderation|rerank/.test(mode)) {
    return false;
  }
  const modalities = isRecord(modelEntry.modalities) ? modelEntry.modalities : void 0;
  const output = stringListValue(modalities?.output).map((item) => item.toLowerCase());
  return output.length === 0 || output.includes("text");
}
function findBestCatalogProviderMatch(providers, request) {
  const urlKeys = providerUrlLookupKeys(request.baseUrl);
  const explicitProviderTokens = explicitProviderLookupTokens(request);
  const nameTokens = providerNameLookupTokens(request);
  const matches = providers.map((entry) => catalogProviderMatch(entry, urlKeys, explicitProviderTokens, nameTokens)).filter((match) => Boolean(match)).sort(
    (left, right) => left.score - right.score || right.entry.models.length - left.entry.models.length || left.entry.provider.localeCompare(right.entry.provider)
  );
  return matches[0];
}
function catalogProviderMatch(entry, urlKeys, explicitProviderTokens, nameTokens) {
  const urlScore = catalogProviderUrlScore(entry, urlKeys);
  const explicitScore = catalogProviderTokenScore(entry, explicitProviderTokens);
  if (urlScore !== void 0) {
    return {
      entry,
      matchedBy: "base-url",
      score: urlScore + (urlScore >= 12 ? explicitScore ?? 8 : 0)
    };
  }
  if (explicitScore !== void 0) {
    return {
      entry,
      matchedBy: "provider-id",
      score: 20 + explicitScore
    };
  }
  const nameScore = catalogProviderTokenScore(entry, nameTokens);
  if (nameScore !== void 0) {
    return {
      entry,
      matchedBy: "provider-name",
      score: 40 + nameScore
    };
  }
  return void 0;
}
function explicitProviderLookupTokens(request) {
  const presetIds = uniqueStrings2([
    request.providerPresetId?.trim() || "",
    request.baseUrl ? findProviderPresetByBaseUrl(request.baseUrl)?.id ?? "" : ""
  ]);
  const presetProviderIds = uniqueStrings2(presetIds.flatMap((presetId) => presetCatalogProviderIds[presetId] ?? []));
  const presetTokens = presetProviderIds.length > 0 ? presetProviderIds : presetIds.flatMap((presetId) => {
    const preset = findProviderPreset(presetId);
    return [
      presetId,
      preset?.name ?? "",
      ...preset?.aliases ?? []
    ];
  });
  return uniqueStrings2([
    ...request.providerIds ?? [],
    ...presetTokens
  ].map(normalizeProviderToken));
}
function providerNameLookupTokens(request) {
  return uniqueStrings2([
    request.name ?? "",
    request.baseUrl ? providerApiHost(request.baseUrl) : ""
  ].map(normalizeProviderToken));
}
function catalogProviderUrlScore(entry, urlKeys) {
  let bestScore;
  for (const apiUrl of entry.apiUrls) {
    const apiKey = providerUrlKey(apiUrl);
    if (!apiKey) {
      continue;
    }
    for (const key of urlKeys) {
      const score = providerUrlMatchScore(apiKey, key);
      if (score === void 0) {
        continue;
      }
      bestScore = bestScore === void 0 ? score : Math.min(bestScore, score);
    }
  }
  return bestScore;
}
function catalogProviderTokenScore(entry, tokens) {
  let bestScore;
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    for (const entryToken of entry.tokens) {
      if (!entryToken) {
        continue;
      }
      const score = token === entryToken ? 0 : token.length >= 4 && entryToken.includes(token) ? 8 : entryToken.length >= 4 && token.includes(entryToken) ? 10 : void 0;
      if (score === void 0) {
        continue;
      }
      bestScore = bestScore === void 0 ? score : Math.min(bestScore, score);
    }
  }
  return bestScore;
}
function providerUrlLookupKeys(value) {
  const normalized = normalizeProviderUrl(value);
  const key = providerUrlKey(normalized);
  if (!key) {
    return [];
  }
  const rootKey = providerUrlRootKey(key);
  return rootKey.host !== key.host || rootKey.pathname !== key.pathname || rootKey.protocol !== key.protocol ? [key, rootKey] : [key];
}
function providerUrlKey(value) {
  if (!value) {
    return void 0;
  }
  try {
    const url = new URL(providerUrlWithDefaultScheme(value));
    url.username = "";
    url.password = "";
    url.hash = "";
    url.search = "";
    return {
      host: url.host.toLowerCase(),
      pathname: normalizeProviderPath(url.pathname),
      protocol: url.protocol.toLowerCase()
    };
  } catch {
    return void 0;
  }
}
function providerUrlRootKey(key) {
  return {
    ...key,
    pathname: key.pathname.replace(/\/(v1|v1beta)$/i, "") || "/"
  };
}
function providerUrlMatchScore(left, right) {
  if (left.protocol !== right.protocol || left.host !== right.host) {
    return void 0;
  }
  if (left.pathname === right.pathname) {
    return 0;
  }
  if (left.pathname === "/" || right.pathname === "/") {
    return 12;
  }
  if (right.pathname.startsWith(`${left.pathname}/`) || left.pathname.startsWith(`${right.pathname}/`)) {
    return 4;
  }
  return void 0;
}
function normalizeProviderUrl(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(providerUrlWithDefaultScheme(trimmed));
    url.username = "";
    url.password = "";
    url.hash = "";
    url.search = "";
    url.pathname = normalizeProviderPath(url.pathname);
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}
function normalizeProviderPath(value) {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed || "/";
}
function providerApiHost(value) {
  const normalized = normalizeProviderUrl(value);
  if (!normalized) {
    return "";
  }
  try {
    const host = new URL(providerUrlWithDefaultScheme(normalized)).hostname;
    return host.replace(/^api\./i, "");
  } catch {
    return "";
  }
}
function normalizeProviderToken(value) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "") ?? "";
}
function addSetValue(values, value) {
  if (value) {
    values.add(value);
  }
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function booleanValue(value) {
  return typeof value === "boolean" ? value : void 0;
}
function nonNegativeNumber(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : void 0;
}
function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
function stringListValue(value) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}
function uniqueStrings2(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

// packages/core/test/unit/providers/provider-model-catalog.test.mjs
(0, import_node_test.default)("provider model catalog exposes models.json settings as editable defaults", () => {
  const catalog = getProviderCatalogModels({
    baseUrl: "https://api.anthropic.com",
    providerPresetId: "anthropic"
  });
  const metadata = catalog.modelMetadata?.["claude-sonnet-4-20250514"];
  import_strict.default.ok(catalog.models.includes("claude-sonnet-4-20250514"));
  import_strict.default.equal(metadata?.contextWindow, 1e6);
  import_strict.default.equal(metadata?.capabilities?.imageInput, true);
  import_strict.default.equal(metadata?.pricing?.inputUsdPerMillionTokens, 3);
  import_strict.default.equal(metadata?.pricing?.outputUsdPerMillionTokens, 15);
  import_strict.default.equal(metadata?.pricing?.cacheReadUsdPerMillionTokens, 0.3);
  import_strict.default.equal(metadata?.pricing?.cacheWrite5mUsdPerMillionTokens, 3.75);
  import_strict.default.equal(metadata?.pricing?.cacheWrite1hUsdPerMillionTokens, 6);
});
(0, import_node_test.default)("provider model catalog maps preset aliases to models.json defaults", () => {
  const catalog = getProviderCatalogModels({ providerPresetId: "kimi-coding" });
  const metadata = catalog.modelMetadata?.["kimi-for-coding"];
  import_strict.default.deepEqual(catalog.models, ["kimi-for-coding"]);
  import_strict.default.equal(metadata?.contextWindow, 262144);
  import_strict.default.equal(metadata?.capabilities?.imageInput, true);
});
(0, import_node_test.default)("provider model catalog exposes reasoning, web search, and image presets", () => {
  const catalog = getProviderCatalogModels({ providerPresetId: "openai" });
  const metadata = catalog.modelMetadata?.["gpt-5"];
  import_strict.default.deepEqual(metadata?.supportedReasoningLevels?.map((level) => level.effort), [
    "low",
    "medium",
    "high"
  ]);
  import_strict.default.equal(metadata?.capabilities?.webSearch, true);
  import_strict.default.equal(metadata?.capabilities?.imageInput, true);
});
