import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentAnalysisSnapshot, AgentAnalysisTotals, RequestLogPage } from "@ccr/core/contracts/app.ts";
import { AgentAnalysisView } from "@ccr/ui/pages/home/components/dashboard.tsx";
import { LogsView } from "@ccr/ui/pages/home/components/network-logs.tsx";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { usageTotals } from "../fixtures/index.ts";

const emptyLogPage: RequestLogPage = {
  generatedAt: "2026-07-23T00:00:00.000Z",
  items: [],
  options: {
    credentials: [],
    models: [],
    providers: []
  },
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 1
};

test("LogsView keeps disabled request logs discoverable with an enable action", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <LogsView
        enabled={false}
        error=""
        filter={{ page: 1, pageSize: 25, status: "all" }}
        loading={false}
        onEnable={() => undefined}
        page={emptyLogPage}
        refreshLogs={() => undefined}
        updateFilter={() => undefined}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /请求日志已关闭/);
  assert.match(html, /启用请求日志/);
});

test("LogsView explains filtered empty results and translates page sizes", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.en}>
      <LogsView
        error=""
        filter={{ page: 1, pageSize: 25, query: "missing", status: "all" }}
        loading={false}
        page={emptyLogPage}
        refreshLogs={() => undefined}
        updateFilter={() => undefined}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /No request logs match the current filters\./);
  assert.match(html, /Clear filters/);
  assert.match(html, /25 \/ page/);
  assert.doesNotMatch(html, /\/ 页/);
});

test("AgentAnalysisView renders overview cards and request-log actions", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.en}>
      <AgentAnalysisView
        agentFilter="all"
        enabled
        error=""
        loading={false}
        openRequestLog={() => undefined}
        range="7d"
        refreshAnalysis={() => undefined}
        setAgentFilter={() => undefined}
        setRange={() => undefined}
        setSelectedSession={() => undefined}
        snapshot={agentAnalysisSnapshot()}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /Success rate/);
  assert.match(html, /Endpoint Health/);
  assert.match(html, /Route Observability/);
  assert.match(html, /Tool Usage/);
  assert.match(html, /Recent Requests/);
  assert.match(html, /Open log/);
});

test("AgentAnalysisView keeps disabled observability discoverable with an enable action", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <AgentAnalysisView
        agentFilter="all"
        enabled={false}
        error=""
        loading={false}
        onEnable={() => undefined}
        range="7d"
        refreshAnalysis={() => undefined}
        setAgentFilter={() => undefined}
        setRange={() => undefined}
        setSelectedSession={() => undefined}
        snapshot={agentAnalysisSnapshot()}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /Agent 观测已关闭/);
  assert.match(html, /启用 Agent 观测/);
});

function agentTotals(patch: Partial<AgentAnalysisTotals> = {}): AgentAnalysisTotals {
  return {
    ...usageTotals(),
    cacheReadTokens: 1200,
    cacheWriteTokens: 240,
    errorCount: 1,
    maxConcurrentRequests: 3,
    maxDurationMs: 2400,
    p50DurationMs: 640,
    p95DurationMs: 1180,
    p99DurationMs: 2100,
    sessionCount: 1,
    subagentCallCount: 1,
    toolCallCount: 2,
    ...patch
  };
}

function agentAnalysisSnapshot(): AgentAnalysisSnapshot {
  const totals = agentTotals();
  return {
    agents: [],
    clients: [],
    concurrency: [],
    endpoints: [{
      ...totals,
      agent: "claude-code",
      key: "POST:/v1/messages",
      lastSeenAt: "2026-07-23T00:01:00.000Z",
      method: "POST",
      model: "gpt-5.2",
      path: "/v1/messages",
      provider: "openai",
      statusCodes: [{ count: 1, statusCode: 200 }]
    }],
    errors: [{
      agent: "claude-code",
      client: "Claude Code",
      createdAt: "2026-07-23T00:01:00.000Z",
      durationMs: 900,
      error: "upstream failed",
      id: 11,
      method: "POST",
      model: "gpt-5.2",
      path: "/v1/messages",
      provider: "openai",
      requestId: "req_test",
      routeReason: "default",
      sessionId: "session_test",
      statusCode: 500
    }],
    generatedAt: "2026-07-23T00:02:00.000Z",
    range: "7d",
    recentRequests: [{
      agent: "claude-code",
      cacheReadTokens: 120,
      cacheWriteTokens: 0,
      client: "Claude Code",
      concurrentRequests: 1,
      createdAt: "2026-07-23T00:01:00.000Z",
      durationMs: 900,
      id: 11,
      inputTokens: 1000,
      method: "POST",
      model: "gpt-5.2",
      ok: false,
      outputTokens: 500,
      path: "/v1/messages",
      provider: "openai",
      requestId: "req_test",
      routeReason: "default",
      sessionId: "session_test",
      statusCode: 500,
      subagentModel: "openai/gpt-5.2",
      toolCallCount: 1,
      tools: ["Read"],
      totalTokens: 1500
    }],
    routes: [{
      agent: "claude-code",
      cacheRatio: 0.2,
      errorCount: 1,
      key: "default:openai:gpt-5.2",
      lastSeenAt: "2026-07-23T00:01:00.000Z",
      model: "gpt-5.2",
      p95DurationMs: 1180,
      provider: "openai",
      requestCount: 3,
      routeReason: "default",
      successRate: 0.67,
      totalTokens: 1500
    }],
    scannedRequestCount: 3,
    sessions: [{
      ...totals,
      agent: "claude-code",
      client: "Claude Code",
      durationMs: 2400,
      id: "session_test",
      lastRequestId: "req_test",
      lastSeenAt: "2026-07-23T00:01:00.000Z",
      models: ["gpt-5.2"],
      providers: ["openai"],
      startedAt: "2026-07-23T00:00:00.000Z",
      topTools: [{ count: 1, name: "Read" }]
    }],
    subagents: [{
      agent: "claude-code",
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      count: 1,
      lastSeenAt: "2026-07-23T00:01:00.000Z",
      model: "gpt-5.2",
      provider: "openai",
      sessionId: "session_test",
      totalTokens: 500
    }],
    tools: [{
      agents: ["claude-code"],
      count: 1,
      lastSeenAt: "2026-07-23T00:01:00.000Z",
      name: "Read",
      requestCount: 1,
      sessions: 1
    }],
    totals
  };
}
