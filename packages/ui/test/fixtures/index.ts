import type {
  AppConfig,
  ProviderAccountSnapshot,
  UsageComparisonRow,
  UsageStatsRange,
  UsageStatsSnapshot,
  UsageTotals
} from "@ccr/core/contracts/app.ts";

export function appConfigFixture(): AppConfig {
  return {
    Providers: [],
    Router: {
      builtInRules: {
        "claude-code": { enabled: true },
        codex: { enabled: true }
      },
      fallback: {
        mode: "off",
        models: [],
        retryCount: 1
      },
      rules: []
    },
    agent: {
      mcpServers: []
    },
    mediaTools: {
      allowedInputRoots: [],
      artifactTtlHours: 24,
      enabled: false,
      jobTimeoutMs: 600000,
      maxImageConcurrency: 2,
      maxVideoConcurrency: 1
    },
    profile: {
      enabled: true,
      profiles: []
    },
    virtualModelProfiles: []
  } as unknown as AppConfig;
}

export function installBrowserGlobals() {
  const documentThemeDataset: Record<string, string> = {};
  const localStorage = {
    getItem: () => null,
    removeItem: () => undefined,
    setItem: () => undefined
  };
  const windowMock = {
    addEventListener: () => undefined,
    cancelAnimationFrame: () => undefined,
    ccr: {
      closeTray: () => undefined,
      quitApp: () => undefined,
      setTrayDetailOpen: () => undefined,
      showMainWindow: () => undefined
    },
    clearInterval: () => undefined,
    localStorage,
    matchMedia: () => ({
      addEventListener: () => undefined,
      matches: false,
      removeEventListener: () => undefined
    }),
    removeEventListener: () => undefined,
    requestAnimationFrame: () => 0,
    setInterval: () => 0
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowMock
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: {
        classList: {
          add: () => undefined,
          remove: () => undefined
        },
        style: {}
      },
      documentElement: {
        dataset: documentThemeDataset,
        lang: "en",
        removeAttribute: (name: string) => {
          if (name === "data-theme") {
            delete documentThemeDataset.theme;
          }
        }
      }
    }
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      language: "en-US",
      languages: ["en-US"]
    }
  });
}

export function usageTotals(patch: Partial<UsageTotals> = {}): UsageTotals {
  return {
    avgDurationMs: 842,
    cacheRatio: 0.24,
    cacheTokens: 2400,
    costUsd: 1.23,
    errorCount: 2,
    inputTokens: 6200,
    outputTokens: 3400,
    requestCount: 128,
    successRate: 0.984,
    totalTokens: 12000,
    ...patch
  };
}

export function usageRow(key: string, label: string, patch: Partial<UsageComparisonRow> = {}): UsageComparisonRow {
  return {
    ...usageTotals(),
    caption: "Test usage row",
    key,
    label,
    maxShare: 0.5,
    ...patch
  };
}

export function usageStats(range: UsageStatsRange = "30d", patch: Partial<UsageStatsSnapshot> = {}): UsageStatsSnapshot {
  const series = Array.from({ length: 8 }, (_, index) => {
    const totalTokens = 1000 + index * 250;
    const requestCount = 8 + index;
    return {
      ...usageTotals({
        cacheRatio: 0.1 + index * 0.02,
        cacheTokens: 120 + index * 30,
        errorCount: index % 4 === 0 ? 1 : 0,
        inputTokens: 560 + index * 120,
        outputTokens: 320 + index * 80,
        requestCount,
        successRate: index % 4 === 0 ? 0.92 : 1,
        totalTokens
      }),
      bucket: `2026-06-${String(20 + index).padStart(2, "0")}T00:00:00.000Z`,
      label: `6/${20 + index}`
    };
  });
  const models = [
    usageRow("model:gpt-4.1", "gpt-4.1", { maxShare: 0.62, model: "gpt-4.1", provider: "openai", totalTokens: 7200 }),
    usageRow("model:claude-sonnet", "claude-sonnet", { maxShare: 0.38, model: "claude-sonnet", provider: "anthropic", totalTokens: 4800 })
  ];

  return {
    clientModels: [
      usageRow("client:claude-code", "Claude Code", { client: "claude-code", model: "gpt-4.1", provider: "openai", totalTokens: 6800 }),
      usageRow("client:codex", "Codex", { client: "codex", model: "claude-sonnet", provider: "anthropic", totalTokens: 5200 })
    ],
    generatedAt: "2026-06-30T00:00:00.000Z",
    models,
    providerModels: [
      usageRow("provider:openai", "OpenAI", { credentialId: "primary", model: "gpt-4.1", provider: "openai", totalTokens: 7200 }),
      usageRow("provider:anthropic", "Anthropic", { credentialId: "secondary", model: "claude-sonnet", provider: "anthropic", totalTokens: 4800 })
    ],
    range,
    recentRequests: [],
    series,
    totals: usageTotals(),
    ...patch
  };
}

export function accountSnapshots(): ProviderAccountSnapshot[] {
  return [
    {
      credentialId: "primary",
      credentialLabel: "Primary Key",
      meters: [
        {
          id: "5h",
          kind: "quota",
          label: "5h quota",
          limit: 100,
          remaining: 42,
          unit: "requests",
          window: "5h"
        },
        {
          id: "weekly",
          kind: "quota",
          label: "Weekly quota",
          limit: 500,
          remaining: 310,
          unit: "requests",
          window: "weekly"
        },
        {
          id: "balance",
          kind: "balance",
          label: "Cash balance",
          remaining: 12.34,
          unit: "USD"
        }
      ],
      provider: "openai",
      source: "standard",
      status: "warning",
      updatedAt: "2026-06-30T00:00:00.000Z"
    },
    {
      credentialId: "secondary",
      credentialLabel: "Secondary Key",
      meters: [
        {
          id: "balance",
          kind: "balance",
          label: "Credit balance",
          remaining: 88,
          unit: "USD"
        }
      ],
      provider: "anthropic",
      source: "standard",
      status: "ok",
      updatedAt: "2026-06-30T00:00:00.000Z"
    }
  ];
}
