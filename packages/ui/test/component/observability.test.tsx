import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentAnalysisSessionRow, AgentAnalysisTraceRun, RequestLogEntry, RequestLogPage } from "@ccr/core/contracts/app.ts";
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

const sampleRequestLogEntry: RequestLogEntry = {
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  client: "claude-code",
  costUsd: 0.01,
  createdAt: "2026-07-23T00:00:00.000Z",
  credentialChain: [],
  credentialSaturated: false,
  durationMs: 120,
  id: 1,
  inputTokens: 100,
  isStream: true,
  method: "POST",
  model: "claude-sonnet-4",
  ok: true,
  outputTokens: 50,
  path: "/v1/messages",
  provider: "anthropic",
  reasoningTokens: 0,
  requestBody: { encoding: "utf8", sizeBytes: 2, text: "{}", truncated: false },
  requestHeaders: {},
  requestId: "req-token-copy",
  routeAttemptCount: 1,
  routeHopCount: 1,
  routeTraceTruncated: false,
  retryAttempts: [],
  responseBody: { encoding: "utf8", sizeBytes: 2, text: "{}", truncated: false },
  responseHeaders: {},
  statusCode: 200,
  totalTokens: 150,
  url: "/v1/messages"
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

test("LogsView keeps Chinese token column copy as Token", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <LogsView
        error=""
        filter={{ page: 1, pageSize: 25, status: "all" }}
        loading={false}
        page={{ ...emptyLogPage, items: [sampleRequestLogEntry], total: 1 }}
        refreshLogs={() => undefined}
        updateFilter={() => undefined}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /Token/);
  assert.doesNotMatch(html, /令牌/);
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
    subagentCallCount: 1,
    successRate: 1,
    toolCallCount: 1,
    topTools: [{ count: 1, name: "Read" }],
    totalTokens: 1000
  };
  const snapshot = {
    ...createEmptyAgentAnalysis("24h"),
    scannedRequestCount: 2,
    selectedSession: {
      conversation: [{
        agent: session.agent,
        assistant: {
          content: "I inspected the repo and found the README.",
          sourcePreview: false,
          sourceTruncated: false,
          truncated: false
        },
        createdAt: session.startedAt,
        durationMs: 420,
        id: 42,
        model: "claude-sonnet-4",
        provider: "anthropic",
        requestId: "request-with-cost",
        sessionId: session.id,
        statusCode: 200,
        user: {
          content: "inspect repo",
          sourcePreview: false,
          sourceTruncated: false,
          truncated: false
        }
      }],
      endpoints: [],
      errors: [],
      models: [],
      requests: [{
        agent: session.agent,
        cacheReadTokens: 300,
        cacheWriteTokens: 100,
        client: session.client,
        concurrentRequests: 1,
        costUsd: 0.25,
        createdAt: session.startedAt,
        durationMs: 420,
        id: 42,
        inputTokens: 500,
        method: "POST",
        model: "claude-sonnet-4",
        ok: true,
        outputTokens: 100,
        path: "/v1/messages",
        provider: "anthropic",
        requestId: "request-with-cost",
        routeReason: "default",
        sessionId: session.id,
        statusCode: 200,
        toolCallCount: 1,
        tools: ["Read"],
        totalTokens: 1000
      }],
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
        llmRunCount: 1,
        maxDepth: 3,
        rootRunId: `agent:${session.agent}:${session.id}`,
        runCount: 4,
        runs: [
          {
            agent: session.agent,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            concurrentRequests: 1,
            depth: 1,
            durationMs: 80,
            endedAt: session.lastSeenAt,
            id: "tool:42:Read",
            inputTokens: 0,
            kind: "tool",
            name: "Read repository file",
            offsetMs: 120,
            outputTokens: 0,
            parentId: "llm:42",
            requestId: "request-with-cost",
            requestLogId: 42,
            sessionId: session.id,
            startedAt: session.startedAt,
            status: "success",
            statusCode: 200,
            tool: {
              callId: "call-read",
              input: {
                kind: "json",
                preview: "{\"path\":\"README.md\"}",
                sizeBytes: 20,
                truncated: false
              },
              result: {
                kind: "json",
                preview: "{\"ok\":true,\"files\":[\"README.md\"]}",
                sizeBytes: 33,
                truncated: false
              },
              resultRequestLogId: 42
            },
            toolName: "Read",
            totalTokens: 0
          },
          {
            agent: session.agent,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            concurrentRequests: 1,
            depth: 2,
            durationMs: 340,
            endedAt: session.lastSeenAt,
            id: "llm:42",
            inputTokens: 500,
            kind: "llm",
            model: "claude-sonnet-4",
            name: "Model run: claude-sonnet-4",
            offsetMs: 80,
            outputTokens: 100,
            parentId: "subagent:42",
            provider: "anthropic",
            requestId: "request-with-cost",
            requestLogId: 42,
            sessionId: session.id,
            startedAt: session.startedAt,
            status: "success",
            statusCode: 200,
            totalTokens: 1000
          },
          {
            agent: session.agent,
            cacheReadTokens: 300,
            cacheWriteTokens: 100,
            concurrentRequests: 1,
            costUsd: 0.25,
            depth: 1,
            durationMs: 420,
            endedAt: session.lastSeenAt,
            id: "subagent:42",
            inputTokens: 500,
            kind: "subagent",
            model: "claude-sonnet-4",
            name: "Subagent: repo-inspector",
            offsetMs: 0,
            outputTokens: 100,
            parentId: `agent:${session.agent}:${session.id}`,
            provider: "anthropic",
            requestId: "request-with-cost",
            requestLogId: 42,
            sessionId: session.id,
            startedAt: session.startedAt,
            status: "success",
            statusCode: 200,
            totalTokens: 1000
          },
          {
            agent: session.agent,
            cacheReadTokens: session.cacheReadTokens,
            cacheWriteTokens: session.cacheWriteTokens,
            concurrentRequests: session.maxConcurrentRequests,
            costUsd: 0.75,
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
          }
        ] satisfies AgentAnalysisTraceRun[],
        sessionId: session.id,
        startedAt: session.startedAt,
        subagentRunCount: 1,
        toolRunCount: 1
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
  assert.match(html, /37\.50%/);
  assert.match(html, /成本/);
  assert.match(html, /会话记录/);
  assert.match(html, /调用链路/);
  assert.match(html, /会话轨迹/);
  assert.ok(html.indexOf("调用链路") >= 0);
  assert.ok(html.indexOf("调用链路") < html.indexOf("会话轨迹"));
  assert.ok(html.indexOf("会话轨迹") < html.indexOf("会话记录"));
  assert.ok(html.indexOf("Claude Code session") < html.indexOf("Subagent: repo-inspector"));
  assert.ok(html.indexOf("Subagent: repo-inspector") < html.indexOf("Model run: claude-sonnet-4"));
  assert.ok(html.indexOf("Model run: claude-sonnet-4") < html.indexOf("Read repository file"));
  assert.match(html, /部分失败/);
  assert.match(html, /Token/);
  assert.doesNotMatch(html, /令牌/);
  assert.match(html, /\$1\.25/);
  assert.match(html, /\$0\.75/);
  assert.doesNotMatch(html, /会话详情仅展示最新的/);
  assert.doesNotMatch(html, /1 \/ 2 条请求/);
  assert.match(html, /border-amber-200/);
  assert.match(html, /min-w-\[64px\]/);
  assert.match(html, /whitespace-nowrap/);
});

test("AgentAnalysisView surfaces bounded analysis and missing session states", () => {
  const snapshot = {
    ...createEmptyAgentAnalysis("30d"),
    requestScanLimit: 5000,
    requestScanTruncated: true,
    scannedRequestCount: 5000
  };

  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <AgentAnalysisView
        agentFilter="all"
        error=""
        loading={false}
        range="30d"
        refreshAnalysis={() => undefined}
        selectedSession={{ agent: "codex", id: "missing-session" }}
        setAgentFilter={() => undefined}
        setRange={() => undefined}
        setSelectedSession={() => undefined}
        snapshot={snapshot}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /分析结果仅包含最新的/);
  assert.match(html, /5,000/);
  assert.match(html, /未找到该会话，或它不在当前时间范围内/);
  assert.doesNotMatch(html, /正在加载会话指标/);
});
