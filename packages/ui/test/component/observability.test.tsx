import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentAnalysisSessionRow, AgentAnalysisTraceRun, RequestLogPage } from "@ccr/core/contracts/app.ts";
import { AgentAnalysisView } from "@ccr/ui/pages/home/components/dashboard.tsx";
import { LogsView } from "@ccr/ui/pages/home/components/network-logs.tsx";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { createEmptyAgentAnalysis } from "@ccr/ui/pages/home/shared/usage.ts";

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

test("AgentAnalysisView keeps session headings horizontal and shows cache rate and cost", () => {
  const session: AgentAnalysisSessionRow = {
    agent: "claude-code",
    avgDurationMs: 420,
    cacheRatio: 0.375,
    cacheReadTokens: 300,
    cacheTokens: 300,
    cacheWriteTokens: 100,
    client: "claude-code",
    costUsd: 1.25,
    durationMs: 900,
    errorCount: 0,
    id: "session-cache-cost",
    inputTokens: 500,
    lastSeenAt: "2026-07-23T00:01:00.000Z",
    maxConcurrentRequests: 1,
    maxDurationMs: 500,
    models: ["claude-sonnet-4"],
    outputTokens: 100,
    p50DurationMs: 420,
    p95DurationMs: 500,
    p99DurationMs: 500,
    providers: ["anthropic"],
    requestCount: 2,
    sessionCount: 1,
    startedAt: "2026-07-23T00:00:00.000Z",
    subagentCallCount: 0,
    successRate: 1,
    toolCallCount: 1,
    topTools: [{ count: 1, name: "Read" }],
    totalTokens: 1000
  };
  const snapshot = {
    ...createEmptyAgentAnalysis("24h"),
    scannedRequestCount: 2,
    selectedSession: {
      endpoints: [],
      errors: [],
      models: [],
      requests: [],
      routes: [],
      session,
      statusCodes: [],
      subagents: [],
      tools: [],
      totals: session,
      trace: {
        agent: session.agent,
        durationMs: session.durationMs,
        endedAt: session.lastSeenAt,
        errorCount: 1,
        id: `${session.agent}:${session.id}`,
        llmRunCount: 0,
        maxDepth: 0,
        rootRunId: `agent:${session.agent}:${session.id}`,
        runCount: 1,
        runs: [{
          agent: session.agent,
          cacheReadTokens: session.cacheReadTokens,
          cacheWriteTokens: session.cacheWriteTokens,
          concurrentRequests: session.maxConcurrentRequests,
          depth: 0,
          durationMs: session.durationMs,
          endedAt: session.lastSeenAt,
          id: `agent:${session.agent}:${session.id}`,
          inputTokens: session.inputTokens,
          kind: "agent",
          name: "Claude Code session",
          offsetMs: 0,
          outputTokens: session.outputTokens,
          sessionId: session.id,
          startedAt: session.startedAt,
          status: "partial",
          totalTokens: session.totalTokens
        } satisfies AgentAnalysisTraceRun],
        sessionId: session.id,
        startedAt: session.startedAt,
        subagentRunCount: 0,
        toolRunCount: 0
      }
    },
    sessions: [session]
  };

  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <AgentAnalysisView
        agentFilter="all"
        error=""
        loading={false}
        range="24h"
        refreshAnalysis={() => undefined}
        setAgentFilter={() => undefined}
        setRange={() => undefined}
        setSelectedSession={() => undefined}
        snapshot={snapshot}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /持续时间/);
  assert.match(html, /子代理/);
  assert.match(html, /缓存率/);
  assert.match(html, /38%/);
  assert.match(html, /成本/);
  assert.match(html, /\$1\.25/);
  assert.match(html, /部分失败/);
  assert.match(html, /border-amber-200/);
  assert.match(html, /min-w-\[64px\]/);
  assert.match(html, /whitespace-nowrap/);
});
