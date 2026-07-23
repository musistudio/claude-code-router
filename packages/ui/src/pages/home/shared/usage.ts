import type {
  AgentAnalysisSnapshot,
  AgentKind,
  RequestLogListFilter,
  RequestLogPage,
  UsageStatsRange,
  UsageStatsSnapshot,
  UsageTotals
} from "@ccr/core/contracts/app";
import type { AgentFilterValue } from "./options";

function positiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : undefined;
}

export function createEmptyUsageStats(range: UsageStatsRange): UsageStatsSnapshot {
  return {
    clientModels: [],
    generatedAt: new Date().toISOString(),
    models: [],
    providerModels: [],
    range,
    recentRequests: [],
    series: createEmptyUsageSeries(range),
    totals: emptyUsageTotals()
  };
}

export function createEmptyAgentAnalysis(range: UsageStatsRange): AgentAnalysisSnapshot {
  return {
    agents: [],
    clients: [],
    concurrency: createEmptyAgentConcurrencySeries(range),
    endpoints: [],
    errors: [],
    generatedAt: new Date().toISOString(),
    range,
    recentRequests: [],
    routes: [],
    scannedRequestCount: 0,
    sessions: [],
    subagents: [],
    tools: [],
    totals: {
      ...emptyUsageTotals(),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      errorCount: 0,
      maxConcurrentRequests: 0,
      maxDurationMs: 0,
      p50DurationMs: 0,
      p95DurationMs: 0,
      p99DurationMs: 0,
      sessionCount: 0,
      subagentCallCount: 0,
      toolCallCount: 0
    }
  };
}

export function createEmptyRequestLogPage(filter: RequestLogListFilter = {}): RequestLogPage {
  const pageSize = positiveInteger(filter.pageSize) ?? 25;
  return {
    generatedAt: new Date().toISOString(),
    items: [],
    options: {
      credentials: [],
      models: [],
      providers: []
    },
    page: positiveInteger(filter.page) ?? 1,
    pageSize,
    total: 0,
    totalPages: 1
  };
}

export function createEmptyAgentConcurrencySeries(range: UsageStatsRange) {
  return createEmptyUsageSeries(range).map((point) => ({
    bucket: point.bucket,
    label: point.label,
    maxConcurrentRequests: 0,
    requestCount: 0
  }));
}

export function createEmptyUsageSeries(range: UsageStatsRange) {
  const now = new Date();
  if (range === "today" || range === "24h") {
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    if (range === "today") {
      start.setHours(0);
    } else {
      start.setHours(start.getHours() - 23);
    }
    const count = range === "today" ? now.getHours() + 1 : 24;
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(start);
      date.setHours(start.getHours() + index);
      return {
        ...emptyUsageTotals(),
        bucket: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}`,
        label: `${String(date.getHours()).padStart(2, "0")}:00`
      };
    });
  }

  const count = range === "7d" ? 7 : 30;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (count - 1));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      ...emptyUsageTotals(),
      bucket: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      label: `${date.getMonth() + 1}/${date.getDate()}`
    };
  });
}

export function emptyUsageTotals(): UsageTotals {
  return {
    avgDurationMs: 0,
    cacheRatio: 0,
    cacheTokens: 0,
    costUsd: 0,
    errorCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    requestCount: 0,
    successRate: 0,
    totalTokens: 0
  };
}

export function formatCompactNumber(value: number, locale?: Intl.LocalesArgument): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 10000 ? "compact" : "standard"
  }).format(value);
}

export function formatUsdCost(value: number | undefined): string {
  const normalized = Number.isFinite(value) && value && value > 0 ? value : 0;
  if (normalized === 0) {
    return "$0.00";
  }
  if (normalized < 0.01) {
    return `$${normalized.toFixed(6)}`;
  }
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: normalized >= 100 ? 0 : 2,
    minimumFractionDigits: normalized >= 100 ? 0 : 2,
    style: "currency"
  }).format(normalized);
}

export function formatAxisNumber(value: number): string {
  return formatCompactNumber(value);
}

export function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function logSelectOptions(label: string, values: string[], selected: string | undefined): Array<{ label: string; value: string }> {
  const merged = new Set(values);
  if (selected) {
    merged.add(selected);
  }
  return [
    { label, value: "" },
    ...Array.from(merged).map((value) => ({ label: value, value }))
  ];
}

export function normalizeAgentFilterValue(value: string): AgentFilterValue {
  return value === "claude-code" || value === "codex" || value === "grok" || value === "kimi" || value === "opencode" || value === "zcode" || value === "claude-design" || value === "unknown" ? value : "all";
}

export function agentKindLabel(agent: AgentKind): string {
  if (agent === "claude-code") {
    return "Claude Code";
  }
  if (agent === "claude-design") {
    return "Claude Design";
  }
  if (agent === "codex") {
    return "Codex";
  }
  if (agent === "grok") {
    return "Grok CLI";
  }
  if (agent === "kimi") {
    return "Kimi CLI";
  }
  if (agent === "opencode") {
    return "OpenCode";
  }
  if (agent === "zcode") {
    return "ZCode";
  }
  return "Unknown";
}

export function compactId(value: string): string {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function compactUserAgent(value: string | undefined): string {
  if (!value) {
    return "-";
  }
  return value.length > 42 ? `${value.slice(0, 39)}...` : value;
}

export function formatStatusCodeCounts(values: Array<{ count: number; statusCode: number }>): string {
  return values.map((item) => `${item.statusCode || "-"} x${item.count}`).join(", ") || "-";
}

export function formatToolCounts(values: Array<{ count: number; name: string }>): string {
  return values.map((item) => `${item.name} x${item.count}`).join(", ");
}
