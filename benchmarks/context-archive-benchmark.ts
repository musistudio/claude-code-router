import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createDefaultAppConfig } from "../packages/core/src/config/default-config";
import type { AppConfig, GatewayProviderProtocol } from "../packages/core/src/contracts/app";
import {
  contextArchiveService,
  finalizeContextArchiveRequest,
  prepareContextArchiveRequest
} from "../packages/core/src/gateway/context-archive";
import { selectTaskCases } from "./context-archive-task-cases.mjs";

type BenchmarkOptions = {
  cases: string;
  iterations: number;
  json: boolean;
  turns: number;
};

type Fact = {
  detail: string;
  expected: string;
  index: (turns: number) => number;
  label: string;
  query: string;
};

type Corpus = {
  caseId: string;
  facts: Fact[];
  messages: Array<{ content: string; role: "assistant" | "user" }>;
};

type StrategyId = "anthropic" | "false-positive-guard" | "openai-chat" | "openai-responses";

type Strategy = {
  description: string;
  id: StrategyId;
};

type Scenario = {
  body: Record<string, unknown>;
  config: AppConfig;
  headers: Record<string, string>;
  path: string;
  protocol: GatewayProviderProtocol;
  sessionId: string;
};

type RunMetric = {
  askMs: number[];
  archiveRecall: number;
  bodyRecall: number;
  caseId: string;
  compressionRatio: number;
  diagnostic: string;
  falsePositive: boolean;
  forwardedBytes: number;
  historyAccessInjected: boolean;
  originalBytes: number;
  prepareMs: number;
  strategy: StrategyId;
};

type SummaryMetric = {
  askP50Ms: number;
  askP95Ms: number;
  archiveRecall: number;
  bodyRecall: number;
  caseId?: string;
  compressionRatio: number;
  diagnosticModes: string[];
  falsePositiveRate: number;
  forwardedBytes: number;
  historyAccessRate: number;
  originalBytes: number;
  prepareP50Ms: number;
  prepareP95Ms: number;
  score: number;
  strategy: StrategyId;
};

const strategies: Strategy[] = [
  {
    description: "Immutable OpenAI Chat snapshot plus exact archived-agent replay.",
    id: "openai-chat"
  },
  {
    description: "Immutable OpenAI Responses snapshot plus exact archived-agent replay.",
    id: "openai-responses"
  },
  {
    description: "Immutable Anthropic snapshot plus exact archived-agent replay.",
    id: "anthropic"
  },
  {
    description: "Claude Code request with unrelated 'compact' wording; should not trigger compaction.",
    id: "false-positive-guard"
  }
];

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  const runs: RunMetric[] = [];
  const taskCases = selectTaskCases(options.cases);

  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    for (const taskCase of taskCases) {
      const corpus = buildCorpus(taskCase, options.turns, iteration);
      for (const strategy of strategies) {
        runs.push(await runStrategy(strategy.id, corpus, iteration));
      }
    }
  }

  const summaries = strategies.map((strategy) => summarizeStrategy(strategy.id, runs));
  const caseSummaries = taskCases.map((taskCase) => summarizeStrategy("openai-chat", runs, taskCase.id));
  if (options.json) {
    console.log(JSON.stringify({
      caseSummaries,
      notes: benchmarkNotes(),
      options,
      selectedCases: taskCases.map((taskCase) => taskCase.id),
      strategies: summaries
    }, null, 2));
    return;
  }

  printSummary(options, summaries, caseSummaries);
}

async function runStrategy(strategy: StrategyId, corpus: Corpus, iteration: number): Promise<RunMetric> {
  contextArchiveService.clear();
  const scenario = buildScenario(strategy, corpus, iteration);
  const original = Buffer.from(JSON.stringify(scenario.body), "utf8");
  const started = performance.now();
  const result = await prepareContextArchiveRequest({
    body: original,
    config: scenario.config,
    headers: scenario.headers,
    method: "POST",
    path: scenario.path,
    protocol: scenario.protocol,
    requestId: `${strategy}-${corpus.caseId}-${iteration}`
  });
  const prepareMs = performance.now() - started;
  const forwarded = result?.body ?? original;
  const forwardedText = forwarded.toString("utf8");
  const diagnostic = result?.diagnostic ?? "none";
  if (strategy === "false-positive-guard") {
    const passed = result === undefined;
    return {
      archiveRecall: passed ? 1 : 0,
      bodyRecall: passed ? 1 : 0,
      caseId: corpus.caseId,
      compressionRatio: forwarded.byteLength / original.byteLength,
      diagnostic,
      falsePositive: !passed,
      forwardedBytes: forwarded.byteLength,
      historyAccessInjected: forwardedText.includes("CCR ARCHIVED HISTORY ACCESS"),
      originalBytes: original.byteLength,
      prepareMs,
      askMs: [],
      strategy
    };
  }
  if (!result) {
    throw new Error(`Explicit compact benchmark did not create an archive for ${strategy}.`);
  }
  finalizeContextArchiveRequest(result.record, {
    logicalProvider: "benchmark-provider",
    providerProtocol: scenario.protocol,
    routedModel: String(scenario.body.model || "benchmark-model")
  }, scenario.config);
  const token = /Archive session token:\s*([A-Za-z0-9_-]+)/.exec(forwardedText)?.[1];
  if (!token) {
    throw new Error(`Compact handoff did not contain an archive token for ${strategy}.`);
  }
  const askMs: number[] = [];
  let archiveHits = 0;

  const executor = mockHistoryExecutor(corpus.facts);
  for (const fact of corpus.facts) {
    const askStarted = performance.now();
    const answer = await contextArchiveService.ask({
      archiveId: result.record.archiveId,
      sessionToken: token,
      task: fact.query
    }, scenario.config.contextArchive, executor);
    askMs.push(performance.now() - askStarted);
    if (askOutputContains(answer, fact.expected)) {
      archiveHits += 1;
    }
  }

  const bodyHits = corpus.facts.filter((fact) => forwardedText.includes(fact.expected)).length;
  return {
    archiveRecall: archiveHits / corpus.facts.length,
    bodyRecall: bodyHits / corpus.facts.length,
    caseId: corpus.caseId,
    compressionRatio: forwarded.byteLength / original.byteLength,
    diagnostic,
    falsePositive: false,
    forwardedBytes: forwarded.byteLength,
    historyAccessInjected: forwardedText.includes("CCR ARCHIVED HISTORY ACCESS"),
    originalBytes: original.byteLength,
    prepareMs,
    askMs,
    strategy
  };
}

function mockHistoryExecutor(facts: Fact[]) {
  return async (input: { body: Buffer; snapshot: { protocol: GatewayProviderProtocol } }) => {
    const payload = JSON.parse(input.body.toString("utf8")) as Record<string, unknown>;
    const payloadText = allPayloadStrings(payload).join("\n");
    const taskText = replayTaskText(payload);
    const fact = facts.find((candidate) =>
      taskText.includes(candidate.detail) &&
      payloadText.includes(candidate.expected)
    );
    const content = fact
      ? `The archived replay request records ${fact.expected}.`
      : "The archived replay request supplied to the history agent does not contain enough information to answer.";
    const responseBody = input.snapshot.protocol === "anthropic_messages"
      ? { content: [{ text: content, type: "text" }] }
      : input.snapshot.protocol === "openai_responses"
        ? { output: [{ content: [{ text: content, type: "output_text" }], role: "assistant", type: "message" }] }
        : { choices: [{ message: { content } }] };
    return {
      body: JSON.stringify(responseBody),
      contentType: "application/json",
      statusCode: 200
    };
  };
}

function replayTaskText(payload: Record<string, unknown>): string {
  const items = Array.isArray(payload.messages)
    ? payload.messages
    : Array.isArray(payload.input)
      ? payload.input
      : [];
  return allPayloadStrings(items.at(-1)).join("\n");
}

function allPayloadStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(allPayloadStrings);
  }
  if (isRecord(value)) {
    return Object.values(value).flatMap(allPayloadStrings);
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildScenario(strategy: StrategyId, corpus: Corpus, iteration: number): Scenario {
  const sessionId = `${strategy}-${iteration}`;
  switch (strategy) {
    case "openai-chat":
      return {
        body: openAiChatBody(corpus),
        config: benchmarkConfig(),
        headers: { "x-ccr-context-compact": "handoff", "x-session-id": sessionId },
        path: "/v1/chat/completions",
        protocol: "openai_chat_completions",
        sessionId
      };
    case "openai-responses":
      return {
        body: openAiResponsesBody(corpus, "Please summarize the conversation so far for context compaction. Include decisions, constraints, commands, and next steps."),
        config: benchmarkConfig(),
        headers: { "x-ccr-context-compact": "handoff", "x-codex-session-id": sessionId },
        path: "/v1/responses",
        protocol: "openai_responses",
        sessionId
      };
    case "anthropic":
      return {
        body: anthropicMessagesBody(corpus, "Summarize the conversation so far for handoff into a new context window."),
        config: benchmarkConfig(),
        headers: { "x-ccr-context-compact": "handoff", "x-claude-code-session-id": sessionId },
        path: "/v1/messages",
        protocol: "anthropic_messages",
        sessionId
      };
    case "false-positive-guard":
      return {
        body: {
          messages: [
            { content: "We are editing a product preferences panel.", role: "assistant" },
            { content: "Please set the UI density option to compact.", role: "user" }
          ],
          model: "claude-sonnet-4-5",
          system: "You are Claude Code."
        },
        config: benchmarkConfig(),
        headers: { "user-agent": "claude-code/2.0", "x-claude-code-session-id": sessionId },
        path: "/v1/messages",
        protocol: "anthropic_messages",
        sessionId
      };
  }
}

function benchmarkConfig(): AppConfig {
  const config = createDefaultAppConfig({
    generatedConfigFile: "/tmp/ccr-context-archive-benchmark-gateway.json"
  });
  return {
    ...config,
    APIKEY: "benchmark-key",
    APIKEYS: [{ id: "benchmark", key: "benchmark-key", name: "Benchmark" }],
    contextArchive: {
      ...config.contextArchive,
      enabled: true,
      maxBytes: 256 * 1024 * 1024,
      maxSnapshotBytes: 64 * 1024 * 1024,
      maxSnapshots: 1000,
      storagePath: `/tmp/ccr-context-archive-benchmark-${process.pid}-${randomUUID()}.sqlite`
    }
  };
}

function buildCorpus(taskCase: {
  facts: Array<{ detail: string; key: string; marker: string; placement: string; prompt: string }>;
  filler: string[];
  id: string;
  title: string;
}, turns: number, iteration: number): Corpus {
  const safeTurns = Math.max(20, turns);
  const facts: Fact[] = taskCase.facts.map((fact) => ({
    detail: fact.detail,
    expected: iteration === 0 ? fact.marker : `${fact.marker}_ITER_${iteration}`,
    index: placementIndex(fact.placement, fact.key),
    label: fact.key,
    query: `What marker captures this task fact: ${fact.detail}`
  }));
  const factsByIndex = new Map(facts.map((fact) => [fact.index(safeTurns), fact]));
  const messages: Corpus["messages"] = [];
  for (let index = 0; index < safeTurns; index += 1) {
    const fact = factsByIndex.get(index);
    const role = index % 2 === 0 ? "user" : "assistant";
    messages.push({
      content: [
        `Turn ${index}: ${role} works on task case ${taskCase.id}: ${taskCase.title}.`,
        filler(taskCase, index),
        fact ? `FACT ${fact.label}: ${fact.expected}. ${fact.detail}` : undefined
      ].filter(Boolean).join("\n"),
      role
    });
  }
  return { caseId: taskCase.id, facts, messages };
}

function placementIndex(placement: string, key: string): (turns: number) => number {
  switch (placement) {
    case "early":
      return (count) => Math.max(2, Math.floor(count * 0.08));
    case "middle":
      return (count) => Math.max(3, Math.floor(count * 0.50));
    case "recent":
      return (count) => Math.max(4, count - recentOffset(key));
    default:
      return (count) => Math.max(1, count - 5);
  }
}

function recentOffset(key: string): number {
  if (key === "objective") return 8;
  if (key === "completed") return 6;
  if (key === "currentFocus") return 5;
  if (key === "nextStep") return 4;
  if (key === "validationCommand") return 3;
  if (key === "risk") return 2;
  return 7;
}

function filler(taskCase: { filler: string[] }, index: number): string {
  const fragment = taskCase.filler[index % taskCase.filler.length] || "The task context contains implementation details and verification notes.";
  return `${fragment} Repeated context marker ${index.toString().padStart(3, "0")}.`;
}

function openAiChatBody(corpus: Corpus): Record<string, unknown> {
  return {
    messages: [
      { content: "You are a coding agent.", role: "system" },
      ...corpus.messages,
      { content: "Produce a compact handoff for a fresh context.", role: "user" }
    ],
    model: "benchmark-model"
  };
}

function openAiResponsesBody(corpus: Corpus, finalPrompt: string): Record<string, unknown> {
  return {
    input: [
      ...corpus.messages.map((message) => ({
        content: [{ text: message.content, type: "input_text" }],
        role: message.role,
        type: "message"
      })),
      {
        content: [{ text: finalPrompt, type: "input_text" }],
        role: "user",
        type: "message"
      }
    ],
    instructions: "You are Codex.",
    model: "gpt-5-codex"
  };
}

function anthropicMessagesBody(corpus: Corpus, finalPrompt: string): Record<string, unknown> {
  return {
    messages: [
      ...corpus.messages,
      { content: finalPrompt, role: "user" }
    ],
    model: "claude-sonnet-4-5",
    system: "You are Claude Code."
  };
}

function askOutputContains(value: unknown, expected: string): boolean {
  return JSON.stringify(value).includes(expected);
}

function summarizeStrategy(strategy: StrategyId, runs: RunMetric[], caseId?: string): SummaryMetric {
  const selected = runs.filter((run) => run.strategy === strategy && (!caseId || run.caseId === caseId));
  const summary = {
    archiveRecall: average(selected.map((run) => run.archiveRecall)),
    bodyRecall: average(selected.map((run) => run.bodyRecall)),
    compressionRatio: average(selected.map((run) => run.compressionRatio)),
    diagnosticModes: unique(selected.map((run) => run.diagnostic.split(":")[0] || "none")),
    falsePositiveRate: average(selected.map((run) => run.falsePositive ? 1 : 0)),
    forwardedBytes: average(selected.map((run) => run.forwardedBytes)),
    historyAccessRate: average(selected.map((run) => run.historyAccessInjected ? 1 : 0)),
    originalBytes: average(selected.map((run) => run.originalBytes)),
    prepareP50Ms: percentile(selected.map((run) => run.prepareMs), 50),
    prepareP95Ms: percentile(selected.map((run) => run.prepareMs), 95),
    askP50Ms: percentile(selected.flatMap((run) => run.askMs), 50),
    askP95Ms: percentile(selected.flatMap((run) => run.askMs), 95),
    strategy
  };
  return {
    ...summary,
    ...(caseId ? { caseId } : {}),
    score: scoreSummary(summary)
  };
}

function scoreSummary(summary: Omit<SummaryMetric, "score">): number {
  const quality = clamp01(summary.archiveRecall);
  const safety = 1 - clamp01(summary.falsePositiveRate);
  return quality * 0.8 + safety * 0.2;
}

function printSummary(options: BenchmarkOptions, summaries: SummaryMetric[], caseSummaries: SummaryMetric[]): void {
  console.log(`Context archive benchmark: cases=${options.cases} iterations=${options.iterations} turns=${options.turns}`);
  console.log(benchmarkNotes());
  console.log("");
  console.log("Strategy summary:");
  const headers = [
    "strategy",
    "diag",
    "ratio",
    "body_recall",
    "archive_recall",
    "handoff",
    "false_pos",
    "prep_p50",
    "ask_p95",
    "score"
  ];
  const rows = summaries.map((summary) => [
    summary.strategy,
    summary.diagnosticModes.join(","),
    formatNumber(summary.compressionRatio),
    formatPercent(summary.bodyRecall),
    formatPercent(summary.archiveRecall),
    formatPercent(summary.historyAccessRate),
    formatPercent(summary.falsePositiveRate),
    `${formatNumber(summary.prepareP50Ms)}ms`,
    `${formatNumber(summary.askP95Ms)}ms`,
    formatNumber(summary.score)
  ]);
  printTable(headers, rows);
  console.log("");
  console.log("OpenAI chat replay by task case:");
  printTable([
    "case",
    "ratio",
    "body_recall",
    "archive_recall",
    "ask_p95",
    "score"
  ], caseSummaries.map((summary) => [
    summary.caseId ?? "all",
    formatNumber(summary.compressionRatio),
    formatPercent(summary.bodyRecall),
    formatPercent(summary.archiveRecall),
    `${formatNumber(summary.askP95Ms)}ms`,
    formatNumber(summary.score)
  ]));
}

function benchmarkNotes(): string {
  return [
    "Notes:",
    "ratio=handoff-generation request bytes/original request bytes; it measures task overhead, not compression.",
    "body_recall=markers preserved because the compact generation request remains complete.",
    "archive_recall=continuity markers recovered through ccr_history_ask.",
    "score=0.8*archive_recall + 0.2*(1-false_positive_rate).",
    "This benchmark does not perform lexical, chunk, or embedding retrieval."
  ].join(" ");
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0))
  );
  console.log(headers.map((header, index) => header.padEnd(widths[index])).join("  "));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log(row.map((cell, index) => cell.padEnd(widths[index])).join("  "));
  }
}

function parseArgs(argv: string[]): BenchmarkOptions {
  const options: BenchmarkOptions = {
    iterations: 5,
    json: false,
    cases: "all",
    turns: 120
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--case" || arg === "--cases") {
      options.cases = readString(argv[++index], arg);
    } else if (arg.startsWith("--case=")) {
      options.cases = readString(arg.slice("--case=".length), "--case");
    } else if (arg.startsWith("--cases=")) {
      options.cases = readString(arg.slice("--cases=".length), "--cases");
    } else if (arg === "--iterations") {
      options.iterations = readPositiveInteger(argv[++index], "--iterations");
    } else if (arg.startsWith("--iterations=")) {
      options.iterations = readPositiveInteger(arg.slice("--iterations=".length), "--iterations");
    } else if (arg === "--turns") {
      options.turns = readPositiveInteger(argv[++index], "--turns");
    } else if (arg.startsWith("--turns=")) {
      options.turns = readPositiveInteger(arg.slice("--turns=".length), "--turns");
    } else {
      throw new Error(`Unknown benchmark argument: ${arg}`);
    }
  }
  return options;
}

function readString(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} requires a value.`);
  }
  return value.trim();
}

function readPositiveInteger(value: string | undefined, name: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index];
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatNumber(value: number): string {
  return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 3);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}
