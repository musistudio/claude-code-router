import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Readable } from "node:stream";
import { createDefaultAppConfig } from "../packages/core/src/config/default-config";
import type { AppConfig } from "../packages/core/src/contracts/app";
import {
  contextArchiveHandoffResponseStream,
  contextArchiveService,
  finalizeContextArchiveRequest,
  prepareContextArchiveRequest,
  type ContextArchiveReplayExecutor
} from "../packages/core/src/gateway/context-archive";
import { defaultTaskCaseId, findTaskCase, selectTaskCases, taskCaseIds } from "./context-archive-task-cases.mjs";

type BenchmarkOptions = {
  caseSelector: string;
  claudeBin: string;
  claudeTimeoutMs: number;
  compactStrategy: "ccr" | "native";
  compactSummaryMode: "lossy" | "minimal";
  cycles: number;
  historyExecutor: "mock" | "model";
  json: boolean;
  listTaskCases: boolean;
  minActionContinuity: number;
  maxBudgetUsd: string;
  maxDriftRate: number;
  maxEstimatedTokens: number;
  minGoalRetention: number;
  minHiddenRequestRecall: number;
  minRecall: number;
  minSourceAccuracy: number;
  minToolRequestPrecision: number;
  minEstimatedTokens: number;
  model?: string;
  resumeSynthesis: boolean;
  scenarioRealism: "light" | "standard" | "heavy";
  targetEstimatedTokens: number;
  turns?: number;
};

type TaskCase = {
  artifacts?: string[];
  facts: Array<{ detail: string; key: string; marker: string; placement: string; prompt: string }>;
  filler: string[];
  id: string;
  title: string;
};

type CorpusFact = {
  detail: string;
  expected: string;
  key: string;
  query: string;
};

type DriftMarker = {
  detail: string;
  key: string;
  marker: string;
};

type Corpus = {
  driftMarkers: DriftMarker[];
  facts: CorpusFact[];
  messages: Array<{ content: string; role: "assistant" | "user" }>;
  taskCase: TaskCase;
  turns: number;
};

type ClaudeRun = {
  apiMs: number;
  costUsd: number;
  elapsedMs: number;
  inputTokens: number;
  isError: boolean;
  output: string;
  outputTokens: number;
  sessionId: string;
};

type ToolRequest = {
  archive_id?: string;
  fact_key?: string;
  question?: string;
  session_id?: string;
  session_token?: string;
  task?: string;
};

type FactSource = "compact" | "history" | "unknown";

type FinalProbeJson = {
  continuation?: Record<string, unknown>;
  final?: Record<string, unknown>;
  sources?: Record<string, unknown>;
};

const goalFactKeys = new Set(["objective", "currentFocus", "nextStep", "validationCommand"]);
const matchStopWords = new Set([
  "about",
  "after",
  "been",
  "from",
  "have",
  "instead",
  "only",
  "that",
  "the",
  "this",
  "what",
  "with"
]);

type CaseReport = {
  actionContinuity: number;
  bodyRecall: number;
  caseId: string;
  compactContextBytes: number;
  compactContextRecall: number;
  compactAgent: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    runs: number;
  };
  compactStrategy: BenchmarkOptions["compactStrategy"];
  compactedBytes: number;
  cycles: number;
  diagnostic: string;
  driftHits: string[];
  driftRate: number;
  estimatedTokens: number;
  finalOutput: string;
  found: number;
  goalFound: number;
  goalRetention: number;
  goalTotal: number;
  hallucinatedMarkers: string[];
  handoffRequestBytes: number;
  historyAgent: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    runs: number;
  };
  historyExecutor: BenchmarkOptions["historyExecutor"];
  initialAgent: ClaudeRun;
  misses: string[];
  nearTarget: boolean;
  offGoal: boolean;
  passed: boolean;
  originalBytes: number;
  ratio: number;
  score: number;
  scenarioRealism: BenchmarkOptions["scenarioRealism"];
  sessionId: string;
  sourceAccuracy: number;
  synthesisAgent: ClaudeRun;
  title: string;
  toolCalls: number;
  toolRequestDriftHits: string[];
  toolRequestFalsePositiveRate: number;
  toolRequestPrecision: number;
  toolRequestedHiddenKeys: string[];
  toolRequestRecall: number;
  toolRequestedHidden: number;
  toolRequestHiddenTotal: number;
  toolRequestedVisible: number;
  toolRequestedVisibleKeys: string[];
  total: number;
  totalCostUsd: number;
  turns: number;
};

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  if (options.listTaskCases) {
    console.log(taskCaseIds().join("\n"));
    return;
  }

  const taskCases = options.caseSelector === "all"
    ? selectTaskCases("all")
    : [findTaskCase(options.caseSelector)];
  const reports: CaseReport[] = [];
  for (const taskCase of taskCases) {
    reports.push(await runCase(taskCase, options));
  }

  if (options.json) {
    console.log(JSON.stringify({ reports, summary: summarizeReports(reports) }, null, 2));
  } else {
    printReports(reports, options);
  }
  if (reports.some((report) => !report.passed)) {
    process.exitCode = 2;
  }
}

async function runCase(taskCase: TaskCase, options: BenchmarkOptions): Promise<CaseReport> {
  contextArchiveService.clear();
  const corpus = buildTargetCorpus(taskCase, options);
  const sessionId = `real-ccr-${taskCase.id}-${randomUUID()}`;
  const config = benchmarkConfig();
  const body = anthropicMessagesBody(corpus);
  const original = Buffer.from(JSON.stringify(body), "utf8");
  const compactState = await prepareBenchmarkCompactState({
    config,
    corpus,
    initialBody: body,
    options,
    sessionId,
    taskCase
  });
  const compactContextText = compactState.compactContextText;
  let initialAgent = emptyClaudeRun("native-no-history-planning");
  let archiveId = "";
  let sessionToken = "";
  let toolRequests: ToolRequest[] = [];
  if (options.compactStrategy === "ccr") {
    const prepared = compactState.prepared;
    if (!prepared) {
      throw new Error(`CCR compact state is missing the prepared handoff for ${taskCase.id}.`);
    }
    initialAgent = await runClaude({
      claudeBin: options.claudeBin,
      input: initialAgentPrompt(corpus, compactContextText, sessionId),
      maxBudgetUsd: options.maxBudgetUsd,
      model: options.model,
      sessionId: randomUUID(),
      timeoutMs: options.claudeTimeoutMs,
      useEmptyToolsFlag: true
    });
    const preparedText = prepared.body.toString("utf8");
    archiveId = prepared.record.archiveId;
    sessionToken = latestArchiveSessionToken(preparedText) ?? "";
    if (!sessionToken) {
      throw new Error(`CCR handoff did not include a session token for ${taskCase.id}.`);
    }
    toolRequests = parseToolRequests(initialAgent.output, corpus, sessionId, archiveId, sessionToken);
  }
  const hiddenFacts = corpus.facts.filter((fact) => !compactContextText.includes(fact.expected));
  const visibleFacts = corpus.facts.filter((fact) => compactContextText.includes(fact.expected));
  const toolRequestTexts = toolRequests.map(toolRequestText).filter(Boolean);
  const requestedHiddenFacts = hiddenFacts.filter((fact) => toolRequests.some((request) => toolRequestMatchesFact(request, fact)));
  const requestedVisibleFacts = visibleFacts.filter((fact) => toolRequests.some((request) => toolRequestMatchesFact(request, fact)));
  const toolRequestDriftHits = corpus.driftMarkers
    .filter((marker) => toolRequestTexts.some((text) => taskMatchesFact(text, marker) || text.includes(marker.marker)))
    .map((marker) => marker.key);
  const toolResults = [];
  const historyAgentRuns: ClaudeRun[] = [];
  const executor = options.historyExecutor === "model"
    ? modelHistoryExecutor(options, historyAgentRuns)
    : mockHistoryExecutor(corpus.facts);
  for (const request of toolRequests) {
    const task = (request.task || request.question)?.trim();
    if (!task) {
      continue;
    }
    const result = await contextArchiveService.ask({
      archiveId: request.archive_id || archiveId,
      sessionToken: request.session_token || sessionToken,
      task
    }, config.contextArchive, executor);
    toolResults.push({ request, result });
  }
  const toolResultText = JSON.stringify(toolResults);
  const historyCostUsd = historyAgentRuns.reduce((sum, run) => sum + run.costUsd, 0);

  const synthesisAgent = await runClaude({
    claudeBin: options.claudeBin,
    input: synthesisPrompt(corpus, compactContextText, sessionId, toolResults, options.compactStrategy),
    maxBudgetUsd: options.maxBudgetUsd,
    model: options.model,
    timeoutMs: options.claudeTimeoutMs,
    useEmptyToolsFlag: options.compactStrategy === "ccr",
    ...(options.resumeSynthesis ? { resume: initialAgent.sessionId } : { sessionId: randomUUID() })
  });
  const finalJson = parseFinalProbeJson(synthesisAgent.output);
  const finalOutput = finalJson ? JSON.stringify(finalJson) : parseFinalText(synthesisAgent.output);
  const foundFacts = corpus.facts.filter((fact) => finalOutput.includes(fact.expected));
  const bodyFacts = corpus.facts.filter((fact) => compactContextText.includes(fact.expected));
  const goalFacts = corpus.facts.filter((fact) => goalFactKeys.has(fact.key));
  const goalFoundFacts = goalFacts.filter((fact) => finalOutput.includes(fact.expected));
  const driftHits = corpus.driftMarkers
    .filter((marker) => finalOutput.includes(marker.marker))
    .map((marker) => marker.key);
  const misses = corpus.facts.filter((fact) => !finalOutput.includes(fact.expected)).map((fact) => fact.key);
  const expectedMarkers = new Set(corpus.facts.map((fact) => fact.expected));
  const driftMarkers = new Set(corpus.driftMarkers.map((marker) => marker.marker));
  const hallucinatedMarkers = extractCcrMarkers(finalOutput)
    .filter((marker) => !expectedMarkers.has(marker) && !driftMarkers.has(marker));
  const estimatedTokens = estimateBodyTokens(body);
  const recall = foundFacts.length / corpus.facts.length;
  const goalRetention = goalFacts.length ? goalFoundFacts.length / goalFacts.length : 1;
  const sourceAccuracy = sourceAttributionAccuracy({
    compactContextText,
    facts: corpus.facts,
    finalJson,
    foundFacts,
    toolResultText
  });
  const actionContinuity = actionContinuityScore(finalJson, corpus);
  const driftRate = corpus.driftMarkers.length ? driftHits.length / corpus.driftMarkers.length : 0;
  const offGoalFlag = /"off_goal"\s*:\s*true/i.test(finalOutput);
  const toolRequestRecall = hiddenFacts.length ? requestedHiddenFacts.length / hiddenFacts.length : 1;
  const toolRequestFalsePositiveDenominator = requestedHiddenFacts.length + requestedVisibleFacts.length + toolRequestDriftHits.length;
  const toolRequestFalsePositiveRate = toolRequestFalsePositiveDenominator
    ? (requestedVisibleFacts.length + toolRequestDriftHits.length) / toolRequestFalsePositiveDenominator
    : 0;
  const toolRequestPrecision = toolRequestFalsePositiveDenominator
    ? requestedHiddenFacts.length / toolRequestFalsePositiveDenominator
    : hiddenFacts.length ? 0 : 1;
  const offGoal = offGoalFlag ||
    driftHits.length > 0 ||
    toolRequestDriftHits.length > 0 ||
    goalRetention < options.minGoalRetention ||
    actionContinuity < options.minActionContinuity;
  const score = benchmarkScore({
    actionContinuity,
    driftRate,
    goalRetention,
    hallucinationRate: hallucinatedMarkers.length > 0 ? 1 : 0,
    recall,
    sourceAccuracy,
    toolRequestPrecision,
    toolRequestRecall
  });
  const passed =
    recall >= options.minRecall &&
    goalRetention >= options.minGoalRetention &&
    toolRequestRecall >= options.minHiddenRequestRecall &&
    toolRequestPrecision >= options.minToolRequestPrecision &&
    sourceAccuracy >= options.minSourceAccuracy &&
    actionContinuity >= options.minActionContinuity &&
    driftRate <= options.maxDriftRate &&
    toolRequestDriftHits.length === 0 &&
    hallucinatedMarkers.length === 0 &&
    !offGoalFlag;

  return {
    actionContinuity,
    bodyRecall: bodyFacts.length / corpus.facts.length,
    caseId: taskCase.id,
    compactContextBytes: Buffer.byteLength(compactContextText, "utf8"),
    compactContextRecall: bodyFacts.length / corpus.facts.length,
    compactAgent: summarizeClaudeRuns(compactState.compactAgentRuns),
    compactStrategy: options.compactStrategy,
    compactedBytes: Buffer.byteLength(compactContextText, "utf8"),
    cycles: options.cycles,
    diagnostic: compactState.diagnostic,
    driftHits,
    driftRate,
    estimatedTokens,
    finalOutput,
    found: foundFacts.length,
    goalFound: goalFoundFacts.length,
    goalRetention,
    goalTotal: goalFacts.length,
    hallucinatedMarkers,
    handoffRequestBytes: compactState.handoffRequestBytes,
    historyAgent: {
      costUsd: historyCostUsd,
      inputTokens: historyAgentRuns.reduce((sum, run) => sum + run.inputTokens, 0),
      outputTokens: historyAgentRuns.reduce((sum, run) => sum + run.outputTokens, 0),
      runs: historyAgentRuns.length
    },
    historyExecutor: options.historyExecutor,
    initialAgent,
    misses,
    nearTarget: estimatedTokens >= options.minEstimatedTokens && estimatedTokens <= options.maxEstimatedTokens,
    offGoal,
    passed,
    originalBytes: original.byteLength,
    ratio: Buffer.byteLength(compactContextText, "utf8") / original.byteLength,
    score,
    scenarioRealism: options.scenarioRealism,
    sessionId,
    sourceAccuracy,
    synthesisAgent,
    title: taskCase.title,
    toolCalls: toolResults.length,
    toolRequestDriftHits,
    toolRequestFalsePositiveRate,
    toolRequestPrecision,
    toolRequestedHiddenKeys: requestedHiddenFacts.map((fact) => fact.key),
    toolRequestRecall,
    toolRequestedHidden: requestedHiddenFacts.length,
    toolRequestHiddenTotal: hiddenFacts.length,
    toolRequestedVisible: requestedVisibleFacts.length,
    toolRequestedVisibleKeys: requestedVisibleFacts.map((fact) => fact.key),
    total: corpus.facts.length,
    totalCostUsd: initialAgent.costUsd + synthesisAgent.costUsd + historyCostUsd + compactState.compactAgentRuns.reduce((sum, run) => sum + run.costUsd, 0),
    turns: corpus.turns
  };
}

type PreparedCompact = NonNullable<Awaited<ReturnType<typeof prepareContextArchiveRequest>>>;

type BenchmarkCompactState = {
  compactAgentRuns: ClaudeRun[];
  compactContextText: string;
  diagnostic: string;
  handoffRequestBytes: number;
  prepared?: PreparedCompact;
};

async function prepareBenchmarkCompactState(input: {
  config: AppConfig;
  corpus: Corpus;
  initialBody: Record<string, unknown>;
  options: BenchmarkOptions;
  sessionId: string;
  taskCase: TaskCase;
}): Promise<BenchmarkCompactState> {
  if (input.options.compactStrategy === "native") {
    return prepareNativeCompactCycles(input);
  }
  return prepareBenchmarkCompactCycles(input);
}

async function prepareBenchmarkCompactCycles(input: {
  config: AppConfig;
  corpus: Corpus;
  initialBody: Record<string, unknown>;
  options: BenchmarkOptions;
  sessionId: string;
  taskCase: TaskCase;
}): Promise<BenchmarkCompactState> {
  let body = input.initialBody;
  let prepared: PreparedCompact | undefined;
  let compactContextText = "";
  let handoffRequestBytes = 0;
  for (let cycle = 1; cycle <= input.options.cycles; cycle += 1) {
    const serialized = Buffer.from(JSON.stringify(body), "utf8");
    const result = await prepareContextArchiveRequest({
      body: serialized,
      config: input.config,
      headers: { "x-ccr-context-compact": "handoff", "x-session-id": input.sessionId },
      method: "POST",
      path: "/v1/messages",
      protocol: "anthropic_messages",
      requestId: `real-agent-${input.taskCase.id}-cycle-${cycle}`
    });
    if (!result) {
      throw new Error(`CCR did not prepare context archive request for ${input.taskCase.id} cycle ${cycle}.`);
    }
    finalizeContextArchiveRequest(result.record, {
      logicalProvider: "benchmark-provider",
      providerProtocol: "anthropic_messages",
      routedModel: "claude-sonnet-4-5"
    }, input.config);
    prepared = result;
    handoffRequestBytes = result.body.byteLength;
    compactContextText = await renderPostCompactContext(result.record, input.corpus, input.options);
    if (cycle < input.options.cycles) {
      body = anthropicMessagesBodyFromCompactedContext(input.corpus, compactContextText, cycle + 1);
    }
  }
  if (!prepared) {
    throw new Error(`CCR did not prepare any compact request for ${input.taskCase.id}.`);
  }
  return {
    compactAgentRuns: [],
    compactContextText,
    diagnostic: prepared.diagnostic,
    handoffRequestBytes,
    prepared
  };
}

async function prepareNativeCompactCycles(input: {
  config: AppConfig;
  corpus: Corpus;
  initialBody: Record<string, unknown>;
  options: BenchmarkOptions;
  sessionId: string;
  taskCase: TaskCase;
}): Promise<BenchmarkCompactState> {
  let body = input.initialBody;
  let compactContextText = "";
  let handoffRequestBytes = 0;
  const compactAgentRuns: ClaudeRun[] = [];
  for (let cycle = 1; cycle <= input.options.cycles; cycle += 1) {
    const prompt = nativeCompactPrompt(body, input.corpus, cycle);
    handoffRequestBytes = Buffer.byteLength(prompt, "utf8");
    const run = await runClaude({
      claudeBin: input.options.claudeBin,
      input: prompt,
      maxBudgetUsd: input.options.maxBudgetUsd,
      model: input.options.model,
      sessionId: randomUUID(),
      timeoutMs: input.options.claudeTimeoutMs,
      useEmptyToolsFlag: false
    });
    compactAgentRuns.push(run);
    compactContextText = extractNativeCompactText(run.output);
    if (cycle < input.options.cycles) {
      body = anthropicMessagesBodyFromNativeCompactedContext(input.corpus, compactContextText, cycle + 1);
    }
  }
  return {
    compactAgentRuns,
    compactContextText,
    diagnostic: `native-compact:${input.sessionId}:${input.options.cycles}`,
    handoffRequestBytes
  };
}

function latestArchiveSessionToken(text: string): string | undefined {
  return Array.from(text.matchAll(/Archive session token:\s*([A-Za-z0-9_-]+)/g)).at(-1)?.[1];
}

async function renderPostCompactContext(
  record: {
    archiveId: string;
    footer: string;
    generation: number;
    sessionId: string;
  },
  corpus: Corpus,
  options: BenchmarkOptions
): Promise<string> {
  const upstreamBody = {
    content: [{ text: benchmarkCompactSummary(corpus, options.compactSummaryMode), type: "text" }],
    role: "assistant"
  };
  const transformed = await streamText(contextArchiveHandoffResponseStream(
    Readable.from([JSON.stringify(upstreamBody)]),
    record,
    "anthropic_messages",
    "application/json"
  ));
  const parsed = JSON.parse(transformed) as Record<string, unknown>;
  return contentText(parsed.content);
}

function benchmarkCompactSummary(corpus: Corpus, mode: BenchmarkOptions["compactSummaryMode"]): string {
  const visibleKeys = mode === "minimal"
    ? new Set(["objective", "nextStep"])
    : new Set(["objective", "completed", "currentFocus", "nextStep", "validationCommand", "risk"]);
  const visibleFacts = corpus.facts.filter((fact) => visibleKeys.has(fact.key));
  return [
    "Benchmark compact summary after CCR handoff.",
    "The current task must continue from the live target facts below. Older exact facts may require ccr_history_ask.",
    "",
    "VISIBLE_CURRENT_TARGET_FACTS_BEGIN",
    ...visibleFacts.map((fact) => `${fact.key}=${fact.expected}. ${fact.detail}`),
    "VISIBLE_CURRENT_TARGET_FACTS_END",
    "",
    "OBSOLETE_DRIFT_TRAPS_BEGIN",
    ...corpus.driftMarkers.map((marker) => `${marker.key}=${marker.marker}. ${marker.detail} This is explicitly obsolete and must not be continued.`),
    "OBSOLETE_DRIFT_TRAPS_END"
  ].join("\n");
}

async function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function mockHistoryExecutor(facts: CorpusFact[]) {
  return async (input: { body: Buffer }) => {
    const payload = JSON.parse(input.body.toString("utf8")) as Record<string, unknown>;
    const payloadText = allPayloadStrings(payload).join("\n");
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const taskText = allPayloadStrings(messages.at(-1)).join("\n");
    const fact = facts.find((candidate) => taskMatchesFact(taskText, candidate) && payloadText.includes(candidate.expected));
    const content = fact
      ? `The archived replay request records ${fact.expected}.`
      : "The archived replay request supplied to the history agent does not contain enough information to answer.";
    return {
      body: JSON.stringify({ content: [{ text: content, type: "text" }] }),
      contentType: "application/json",
      statusCode: 200
    };
  };
}

function modelHistoryExecutor(
  options: BenchmarkOptions,
  historyAgentRuns: ClaudeRun[]
): ContextArchiveReplayExecutor {
  return async (input) => {
    const run = await runClaude({
      claudeBin: options.claudeBin,
      input: historyReplayProbePrompt(input.body.toString("utf8")),
      maxBudgetUsd: options.maxBudgetUsd,
      model: options.model,
      sessionId: randomUUID(),
      timeoutMs: options.claudeTimeoutMs,
      useEmptyToolsFlag: true
    });
    historyAgentRuns.push(run);
    return {
      body: JSON.stringify({ content: [{ text: run.output, type: "text" }], role: "assistant" }),
      contentType: "application/json",
      statusCode: 200
    };
  };
}

function historyReplayProbePrompt(replayPayload: string): string {
  return [
    "You are the archived pre-compaction agent replay used by a benchmark.",
    "The payload below is the exact replay request containing the archived conversation plus a final CCR history task.",
    "Use only evidence inside the replay payload. Do not use outside knowledge and do not infer marker strings.",
    "If the requested exact marker or fact is present, answer with the exact marker string and a short evidence phrase.",
    "If the replay payload does not contain enough information, answer exactly: context is insufficient.",
    "Do not continue the coding task. Do not call tools. Return plain text only.",
    "",
    "CCR_ARCHIVED_REPLAY_PAYLOAD_BEGIN",
    replayPayload,
    "CCR_ARCHIVED_REPLAY_PAYLOAD_END"
  ].join("\n");
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

function taskMatchesFact(taskText: string, fact: Pick<CorpusFact, "detail" | "key">): boolean {
  const task = normalizeMatchText(taskText);
  if (!task) {
    return false;
  }
  const key = normalizeMatchText(fact.key);
  if (key && task.includes(key)) {
    return true;
  }
  const detail = normalizeMatchText(fact.detail);
  if (detail && task.includes(detail)) {
    return true;
  }
  const detailWords = detail.split(" ").filter((word) => word.length >= 4 && !matchStopWords.has(word));
  if (detailWords.length === 0) {
    return false;
  }
  const hits = detailWords.filter((word) => task.includes(word)).length;
  return hits / detailWords.length >= 0.65;
}

function normalizeMatchText(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function benchmarkConfig(): AppConfig {
  const config = createDefaultAppConfig({
    generatedConfigFile: "/tmp/ccr-context-archive-real-agent-benchmark.json"
  });
  return {
    ...config,
    APIKEY: "benchmark-key",
    APIKEYS: [{ id: "benchmark", key: "benchmark-key", name: "Benchmark" }],
    contextArchive: {
      ...config.contextArchive,
      enabled: true,
      maxBytes: 1024 * 1024 * 1024,
      maxSnapshotBytes: 256 * 1024 * 1024,
      maxSnapshots: 1000,
      replayTimeoutMs: 10 * 60 * 1000,
      storagePath: `/tmp/ccr-context-archive-real-benchmark-${process.pid}-${randomUUID()}.sqlite`
    }
  };
}

function buildTargetCorpus(taskCase: TaskCase, options: BenchmarkOptions): Corpus {
  if (options.turns) {
    return buildCorpus(taskCase, options.turns, options.scenarioRealism);
  }
  let turns = 1200;
  let corpus = buildCorpus(taskCase, turns, options.scenarioRealism);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const estimate = estimateBodyTokens(anthropicMessagesBody(corpus));
    if (estimate >= options.minEstimatedTokens && estimate <= options.maxEstimatedTokens) {
      return corpus;
    }
    const nextTurns = Math.max(20, Math.round(turns * (options.targetEstimatedTokens / Math.max(1, estimate))));
    if (Math.abs(nextTurns - turns) <= 2) {
      return corpus;
    }
    turns = nextTurns;
    corpus = buildCorpus(taskCase, turns, options.scenarioRealism);
  }
  return corpus;
}

function buildCorpus(
  taskCase: TaskCase,
  turns: number,
  scenarioRealism: BenchmarkOptions["scenarioRealism"]
): Corpus {
  const safeTurns = Math.max(20, turns);
  const facts = taskCase.facts.map((fact) => ({
    detail: fact.detail,
    expected: fact.marker,
    key: fact.key,
    query: `What exact marker records this task fact: ${fact.detail}`
  }));
  const driftMarkers = buildDriftMarkers(taskCase);
  const factsByIndex = new Map(taskCase.facts.map((fact) => [
    placementIndex(fact.placement, fact.key)(safeTurns),
    fact
  ]));
  const driftByIndex = new Map([
    [Math.max(1, Math.floor(safeTurns * 0.15)), driftMarkers[0]],
    [Math.max(2, Math.floor(safeTurns * 0.62)), driftMarkers[1]]
  ]);
  const messages: Corpus["messages"] = [];
  for (let index = 0; index < safeTurns; index += 1) {
    const fact = factsByIndex.get(index);
    const drift = driftByIndex.get(index);
    const role = index % 2 === 0 ? "user" : "assistant";
    messages.push({
      content: [
        `Turn ${index}: ${role} works on realistic task case ${taskCase.id}: ${taskCase.title}.`,
        filler(taskCase, index),
        "The conversation includes file paths, command output, partial implementation notes, and review constraints.",
        realisticArtifact(taskCase, index, scenarioRealism),
        fact ? `FACT ${fact.key}: ${fact.marker}. ${fact.detail}` : undefined,
        drift ? `OBSOLETE_DRIFT_TRAP ${drift.key}: ${drift.marker}. ${drift.detail} This branch was abandoned and must not be resumed.` : undefined
      ].filter(Boolean).join("\n"),
      role
    });
  }
  return { driftMarkers, facts, messages, taskCase, turns: safeTurns };
}

function realisticArtifact(
  taskCase: TaskCase,
  index: number,
  scenarioRealism: BenchmarkOptions["scenarioRealism"]
): string | undefined {
  const artifacts = taskCase.artifacts ?? [];
  if (artifacts.length === 0 || scenarioRealism === "light") {
    return undefined;
  }
  const cadence = scenarioRealism === "heavy" ? 3 : 7;
  if (index % cadence !== 0) {
    return undefined;
  }
  const artifact = artifacts[Math.floor(index / cadence) % artifacts.length];
  return [
    `REALISTIC_AGENT_ARTIFACT_BEGIN case=${taskCase.id} turn=${index}`,
    artifact,
    `REALISTIC_AGENT_ARTIFACT_END case=${taskCase.id} turn=${index}`
  ].join("\n");
}

function buildDriftMarkers(taskCase: TaskCase): DriftMarker[] {
  const slug = taskCase.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return [
    {
      detail: "Obsolete objective: start a new unrelated feature instead of continuing the current coding task.",
      key: "obsoleteObjective",
      marker: `CCR_DRIFT_${slug}_OBSOLETE_NEW_FEATURE_01X`
    },
    {
      detail: "Abandoned next step: skip the requested validation and rewrite a different subsystem.",
      key: "abandonedNextStep",
      marker: `CCR_DRIFT_${slug}_ABANDONED_REWRITE_OTHER_SUBSYSTEM_02Y`
    }
  ];
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

function filler(taskCase: TaskCase, index: number): string {
  const fragment = taskCase.filler[index % taskCase.filler.length] || "The task context contains implementation details and verification notes.";
  const padded = String(index).padStart(5, "0");
  return [
    fragment,
    `Repeated realistic worklog marker ${padded}.`,
    `The agent records constraints, tests, and pending decisions for continuation quality ${padded}.`
  ].join(" ");
}

function anthropicMessagesBody(corpus: Corpus): Record<string, unknown> {
  return {
    messages: [
      ...corpus.messages,
      {
        content: [
          "Continue the coding task after context management.",
          "Preserve exact decisions, completed work, current focus, next step, validation command, and known risk.",
          "Do not summarize unless asked."
        ].join(" "),
        role: "user"
      }
    ],
    model: "claude-sonnet-4-5",
    system: "You are Claude Code working inside a repository."
  };
}

function anthropicMessagesBodyFromCompactedContext(
  corpus: Corpus,
  compactContextText: string,
  cycle: number
): Record<string, unknown> {
  return {
    messages: [
      {
        content: [
          `Successor context after compact cycle ${cycle - 1}.`,
          "The original pre-compact transcript is no longer in the active context.",
          "The archive access block below is the only path to exact older details omitted from the compact summary.",
          "",
          compactContextText
        ].join("\n"),
        role: "user"
      },
      {
        content: [
          `Continuing cycle ${cycle} for realistic task case ${corpus.taskCase.id}: ${corpus.taskCase.title}.`,
          "I kept working from the compacted handoff and did not reopen the original transcript."
        ].join("\n"),
        role: "assistant"
      },
      {
        content: [
          "Compact again for the next successor agent.",
          "Preserve the current objective, focus, next step, validation command, risk, and latest archive access.",
          "Do not reintroduce obsolete drift traps as current work."
        ].join(" "),
        role: "user"
      }
    ],
    model: "claude-sonnet-4-5",
    system: "You are Claude Code working inside a repository."
  };
}

function anthropicMessagesBodyFromNativeCompactedContext(
  corpus: Corpus,
  compactContextText: string,
  cycle: number
): Record<string, unknown> {
  return {
    messages: [
      {
        content: [
          `Successor context after native Claude Code compact cycle ${cycle - 1}.`,
          "The original pre-compact transcript is no longer in the active context.",
          "There is no CCR archive access and no history replay tool in this baseline.",
          "",
          compactContextText
        ].join("\n"),
        role: "user"
      },
      {
        content: [
          `Continuing cycle ${cycle} for realistic task case ${corpus.taskCase.id}: ${corpus.taskCase.title}.`,
          "I kept working from the native compacted handoff and did not reopen the original transcript."
        ].join("\n"),
        role: "assistant"
      },
      {
        content: [
          "Compact again for the next successor agent.",
          "Preserve the current objective, focus, next step, validation command, and risk.",
          "Do not reintroduce obsolete drift traps as current work."
        ].join(" "),
        role: "user"
      }
    ],
    model: "claude-sonnet-4-5",
    system: "You are Claude Code working inside a repository."
  };
}

function nativeCompactPrompt(body: Record<string, unknown>, corpus: Corpus, cycle: number): string {
  return [
    "CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.",
    "Your task is to create a detailed summary of the conversation so far for a successor Claude Code agent that will continue with a fresh context.",
    "Summarize the current goal, user constraints, decisions, changed files, completed work, validation status, unresolved risks, and exact next action.",
    "Do not invent details. Do not continue the task. Do not mention that you are running a benchmark.",
    "Your entire response must be plain text: an <analysis> block followed by a <summary> block.",
    "",
    `Native compact cycle: ${cycle}`,
    `Task case: ${corpus.taskCase.id} - ${corpus.taskCase.title}`,
    "",
    "CONVERSATION_TO_COMPACT_BEGIN",
    renderAnthropicBodyAsTranscript(body),
    "CONVERSATION_TO_COMPACT_END"
  ].join("\n");
}

function renderAnthropicBodyAsTranscript(body: Record<string, unknown>): string {
  const system = contentText(body.system);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return [
    system ? `system:\n${system}` : undefined,
    ...messages.map((message, index) => {
      if (!isRecord(message)) {
        return `message ${index}:\n${contentText(message)}`;
      }
      const role = typeof message.role === "string" ? message.role : `message ${index}`;
      return `${role}:\n${contentText(message.content)}`;
    })
  ].filter(Boolean).join("\n\n");
}

function extractNativeCompactText(output: string): string {
  const trimmed = output.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed;
}

function initialAgentPrompt(corpus: Corpus, compactedText: string, sessionId: string): string {
  return [
    "You are a real post-compaction coding agent evaluating CCR context continuity.",
    "You received only the real compacted successor context below. Exact older details may require ccr_history_ask.",
    "Do not guess marker strings. Ask the archived previous-context agent for every required marker that is not directly visible.",
    "Do not ask for markers that are already visible in the compacted context. Do not over-fetch unrelated history.",
    "The compacted context may contain obsolete drift traps. Do not continue obsolete work or ask for obsolete markers.",
    "For each required hidden fact, include fact_key with exactly one key from the continuity fact list.",
    "Return ONLY JSON in this shape:",
    '{"tool_calls":[{"fact_key":"one continuity fact key","task":"specific natural-language history question","archive_id":"archive id","session_token":"archive token"}]}',
    "",
    `Archive session id: ${sessionId}`,
    "Continuity facts to recover:",
    ...corpus.facts.map((fact) => `- ${fact.key}: ${fact.detail}`),
    "Obsolete drift markers that must NOT become the current target:",
    ...corpus.driftMarkers.map((marker) => `- ${marker.key}: ${marker.detail}`),
    "",
    "CCR_COMPRESSED_CONTEXT_BEGIN",
    compactedText,
    "CCR_COMPRESSED_CONTEXT_END"
  ].join("\n");
}

function synthesisPrompt(
  corpus: Corpus,
  compactedText: string,
  sessionId: string,
  toolResults: Array<{ request: ToolRequest; result: unknown }>,
  compactStrategy: BenchmarkOptions["compactStrategy"]
): string {
  const contextLabel = compactStrategy === "native" ? "NATIVE_COMPACT_CONTEXT" : "CCR_COMPRESSED_CONTEXT";
  const historyLabel = compactStrategy === "native" ? "NATIVE_HISTORY_RESULTS" : "CCR_HISTORY_ASK_RESULTS";
  return [
    compactStrategy === "native"
      ? "Use only the native Claude Code compact summary below to answer the continuity probe. This baseline has no archive/history tool."
      : "Use the CCR-compressed context and ccr_history_ask answers to answer the continuity probe.",
    "Return ONLY JSON in this exact shape:",
    `{"final":{${corpus.facts.map((fact) => `"${fact.key}":"exact marker or UNKNOWN"`).join(",")}},"sources":{${corpus.facts.map((fact) => `"${fact.key}":"compact|history|unknown"`).join(",")}},"continuation":{"objective":"exact objective marker or UNKNOWN","current_focus":"exact current-focus marker or UNKNOWN","next_step":"exact next-step marker or UNKNOWN","validation_command":"exact validation-command marker or UNKNOWN","off_goal":false,"action":"one short next action that continues the next_step"}}`,
    `For each source, use compact only when the marker is present in ${contextLabel}, history only when it is present in ${historyLabel}, and unknown when evidence is insufficient.`,
    "Do not guess marker strings. If evidence is insufficient, use UNKNOWN.",
    "The continuation must stay on the current target and must not use obsolete drift markers.",
    "",
    `Archive session id: ${sessionId}`,
    "",
    `${contextLabel}_BEGIN`,
    compactedText,
    `${contextLabel}_END`,
    "",
    `${historyLabel}_BEGIN`,
    JSON.stringify(toolResults, null, 2),
    `${historyLabel}_END`
  ].join("\n");
}

function parseToolRequests(
  output: string,
  corpus: Corpus,
  sessionId: string,
  archiveId: string,
  sessionToken: string
): ToolRequest[] {
  const parsed = parseJsonObject(output);
  const rawCalls = Array.isArray(parsed?.tool_calls) ? parsed.tool_calls : undefined;
  if (rawCalls?.length) {
    return rawCalls
      .filter(isRecord)
      .map((call) => ({
        archive_id: typeof call.archive_id === "string" ? call.archive_id : archiveId,
        fact_key: typeof call.fact_key === "string"
          ? call.fact_key
          : typeof call.factKey === "string"
            ? call.factKey
            : typeof call.key === "string"
              ? call.key
              : undefined,
        question: typeof call.question === "string"
          ? call.question
          : typeof call.prompt === "string"
            ? call.prompt
            : undefined,
        session_id: typeof call.session_id === "string" ? call.session_id : sessionId,
        session_token: typeof call.session_token === "string" ? call.session_token : sessionToken,
        task: typeof call.task === "string" ? call.task : undefined
      }))
      .filter((call) => Boolean(call.task || call.question));
  }
  return [];
}

function toolRequestMatchesFact(request: ToolRequest, fact: CorpusFact): boolean {
  const requestedKey = normalizeMatchText(request.fact_key ?? "");
  if (requestedKey) {
    const factKey = normalizeMatchText(fact.key);
    return requestedKey === factKey || requestedKey.replace(/\s+/g, "") === factKey.replace(/\s+/g, "");
  }
  return taskMatchesFact(toolRequestText(request), fact);
}

function toolRequestText(request: ToolRequest): string {
  return [request.task, request.question].filter(Boolean).join("\n");
}

function parseFinalText(output: string): string {
  const parsed = parseJsonObject(output);
  if (parsed) {
    return JSON.stringify(parsed);
  }
  return output;
}

function parseFinalProbeJson(output: string): FinalProbeJson | undefined {
  const parsed = parseJsonObject(output);
  if (!parsed || (!isRecord(parsed.final) && !isRecord(parsed.continuation))) {
    return undefined;
  }
  return {
    continuation: isRecord(parsed.continuation) ? parsed.continuation : undefined,
    final: isRecord(parsed.final) ? parsed.final : undefined,
    sources: isRecord(parsed.sources) ? parsed.sources : undefined
  };
}

function sourceAttributionAccuracy(input: {
  compactContextText: string;
  facts: CorpusFact[];
  finalJson: FinalProbeJson | undefined;
  foundFacts: CorpusFact[];
  toolResultText: string;
}): number {
  if (input.foundFacts.length === 0) {
    return 0;
  }
  if (!input.finalJson?.sources) {
    return 0;
  }
  let correct = 0;
  for (const fact of input.foundFacts) {
    const expectedSource = expectedFactSource(fact, input.compactContextText, input.toolResultText);
    const actualSource = normalizeFactSource(input.finalJson.sources[fact.key]);
    if (actualSource === expectedSource) {
      correct += 1;
    }
  }
  return correct / input.foundFacts.length;
}

function expectedFactSource(fact: CorpusFact, compactContextText: string, toolResultText: string): FactSource {
  if (compactContextText.includes(fact.expected)) {
    return "compact";
  }
  if (toolResultText.includes(fact.expected)) {
    return "history";
  }
  return "unknown";
}

function normalizeFactSource(value: unknown): FactSource {
  if (typeof value !== "string") {
    return "unknown";
  }
  const normalized = value.toLowerCase();
  if (normalized.includes("history") || normalized.includes("archive") || normalized.includes("tool")) {
    return "history";
  }
  if (normalized.includes("compact") || normalized.includes("summary") || normalized.includes("context")) {
    return "compact";
  }
  return "unknown";
}

function actionContinuityScore(finalJson: FinalProbeJson | undefined, corpus: Corpus): number {
  const continuation = finalJson?.continuation;
  if (!continuation) {
    return 0;
  }
  const factByKey = new Map(corpus.facts.map((fact) => [fact.key, fact]));
  const objective = factByKey.get("objective");
  const currentFocus = factByKey.get("currentFocus");
  const nextStep = factByKey.get("nextStep");
  const validationCommand = factByKey.get("validationCommand");
  const action = stringValue(continuation.action) ?? "";
  const continuationText = allPayloadStrings(continuation).join("\n");
  const checks = [
    factFieldMatches(continuation.objective, objective),
    factFieldMatches(continuation.current_focus ?? continuation.currentFocus, currentFocus),
    factFieldMatches(continuation.next_step ?? continuation.nextStep, nextStep),
    factFieldMatches(continuation.validation_command ?? continuation.validationCommand, validationCommand),
    nextStep ? action.includes(nextStep.expected) || taskMatchesFact(action, nextStep) : false,
    !corpus.driftMarkers.some((marker) =>
      continuationText.includes(marker.marker) || taskMatchesFact(action, marker)
    )
  ];
  return checks.filter(Boolean).length / checks.length;
}

function factFieldMatches(value: unknown, fact: CorpusFact | undefined): boolean {
  return Boolean(fact && typeof value === "string" && value.includes(fact.expected));
}

function extractCcrMarkers(text: string): string[] {
  return Array.from(new Set(text.match(/\bCCR_(?:CASE|DRIFT)_[A-Z0-9_]+/g) ?? []));
}

function emptyClaudeRun(sessionId: string): ClaudeRun {
  return {
    apiMs: 0,
    costUsd: 0,
    elapsedMs: 0,
    inputTokens: 0,
    isError: false,
    output: "",
    outputTokens: 0,
    sessionId
  };
}

function summarizeClaudeRuns(runs: ClaudeRun[]): CaseReport["compactAgent"] {
  return {
    costUsd: runs.reduce((sum, run) => sum + run.costUsd, 0),
    inputTokens: runs.reduce((sum, run) => sum + run.inputTokens, 0),
    outputTokens: runs.reduce((sum, run) => sum + run.outputTokens, 0),
    runs: runs.length
  };
}

async function runClaude(input: {
  claudeBin: string;
  input: string;
  maxBudgetUsd: string;
  model?: string;
  resume?: string;
  sessionId?: string;
  timeoutMs: number;
  useEmptyToolsFlag?: boolean;
}): Promise<ClaudeRun> {
  const started = performance.now();
  const args = [
    "-p",
    "--output-format",
    "json",
    "--max-budget-usd",
    input.maxBudgetUsd
  ];
  if (input.useEmptyToolsFlag) {
    args.splice(3, 0, "--tools", "");
  }
  if (input.model) {
    args.push("--model", input.model);
  }
  if (input.resume) {
    args.push("--resume", input.resume);
  } else {
    args.push("--session-id", input.sessionId || randomUUID());
  }

  const child = spawn(input.claudeBin, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let stdinError = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.on("error", (error) => {
    stdinError = error instanceof Error ? error.message : String(error);
  });
  child.stdin.end(input.input);
  let timedOut = false;
  let forceKillTimer: NodeJS.Timeout | undefined;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
  }, Math.max(1000, input.timeoutMs));

  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  clearTimeout(timeout);
  if (forceKillTimer) {
    clearTimeout(forceKillTimer);
  }
  const elapsedMs = performance.now() - started;
  const result = parseClaudeJson(stdout);
  if (timedOut) {
    throw new Error([
      `claude timed out after ${input.timeoutMs}ms.`,
      stderr.trim(),
      stdout.trim()
    ].filter(Boolean).join("\n"));
  }
  if (code !== 0 && !result) {
    throw new Error([
      `claude exited with code ${code}.`,
      stdinError ? `stdin error: ${stdinError}` : undefined,
      stderr.trim(),
      stdout.trim()
    ].filter(Boolean).join("\n"));
  }
  return {
    apiMs: Number(result?.duration_api_ms ?? 0),
    costUsd: Number(result?.total_cost_usd ?? 0),
    elapsedMs: Math.round(elapsedMs),
    inputTokens: totalInputTokens(result),
    isError: Boolean(result?.is_error),
    output: typeof result?.result === "string" ? result.result : stdout,
    outputTokens: totalOutputTokens(result),
    sessionId: String(result?.session_id || input.resume || input.sessionId || "")
  };
}

function parseClaudeJson(stdout: string): Record<string, unknown> | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return parseJsonObject(trimmed);
  }
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fence?.[1] ?? text;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return undefined;
  }
  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function totalInputTokens(result: Record<string, unknown> | undefined): number {
  const usage = isRecord(result?.usage) ? result.usage : {};
  const topLevel =
    Number(usage.input_tokens ?? 0) +
    Number(usage.cache_creation_input_tokens ?? 0) +
    Number(usage.cache_read_input_tokens ?? 0);
  return topLevel;
}

function totalOutputTokens(result: Record<string, unknown> | undefined): number {
  const usage = isRecord(result?.usage) ? result.usage : {};
  return Number(usage.output_tokens ?? 0);
}

function contentText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(contentText).filter(Boolean).join("\n");
  }
  if (!isRecord(value)) {
    return "";
  }
  const direct = stringValue(value.text) || stringValue(value.input_text) || stringValue(value.output_text);
  if (direct) {
    return direct;
  }
  if (value.content !== undefined) {
    return contentText(value.content);
  }
  return JSON.stringify(value);
}

function estimateBodyTokens(body: Record<string, unknown>): number {
  return Math.ceil(JSON.stringify(body).length / 4);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function summarizeReports(reports: CaseReport[]): Record<string, unknown> {
  const found = reports.reduce((sum, report) => sum + report.found, 0);
  const total = reports.reduce((sum, report) => sum + report.total, 0);
  const goalFound = reports.reduce((sum, report) => sum + report.goalFound, 0);
  const goalTotal = reports.reduce((sum, report) => sum + report.goalTotal, 0);
  return {
    actionContinuity: average(reports.map((report) => report.actionContinuity)),
    avgRatio: average(reports.map((report) => report.ratio)),
    bodyRecall: average(reports.map((report) => report.bodyRecall)),
    compactContextRecall: average(reports.map((report) => report.compactContextRecall)),
    compactCostUsd: reports.reduce((sum, report) => sum + report.compactAgent.costUsd, 0),
    compactRuns: reports.reduce((sum, report) => sum + report.compactAgent.runs, 0),
    compactStrategy: Array.from(new Set(reports.map((report) => report.compactStrategy))).join(","),
    costUsd: reports.reduce((sum, report) => sum + report.totalCostUsd, 0),
    driftRate: average(reports.map((report) => report.driftRate)),
    found,
    goalFound,
    goalRetention: goalTotal ? goalFound / goalTotal : 1,
    goalTotal,
    hallucinationCases: reports.filter((report) => report.hallucinatedMarkers.length > 0).length,
    historyCostUsd: reports.reduce((sum, report) => sum + report.historyAgent.costUsd, 0),
    historyExecutor: Array.from(new Set(reports.map((report) => report.historyExecutor))).join(","),
    historyRuns: reports.reduce((sum, report) => sum + report.historyAgent.runs, 0),
    nearTargetCases: reports.filter((report) => report.nearTarget).length,
    offGoalCases: reports.filter((report) => report.offGoal).length,
    passedCases: reports.filter((report) => report.passed).length,
    recall: total ? found / total : 0,
    score: average(reports.map((report) => report.score)),
    sourceAccuracy: average(reports.map((report) => report.sourceAccuracy)),
    scenarioRealism: Array.from(new Set(reports.map((report) => report.scenarioRealism))).join(","),
    toolRequestDriftCases: reports.filter((report) => report.toolRequestDriftHits.length > 0).length,
    toolRequestFalsePositiveRate: average(reports.map((report) => report.toolRequestFalsePositiveRate)),
    toolRequestPrecision: average(reports.map((report) => report.toolRequestPrecision)),
    toolRequestRecall: average(reports.map((report) => report.toolRequestRecall)),
    total
  };
}

function benchmarkScore(input: {
  actionContinuity: number;
  driftRate: number;
  goalRetention: number;
  hallucinationRate: number;
  recall: number;
  sourceAccuracy: number;
  toolRequestPrecision: number;
  toolRequestRecall: number;
}): number {
  return input.recall * 0.25 +
    input.goalRetention * 0.20 +
    input.actionContinuity * 0.15 +
    input.sourceAccuracy * 0.15 +
    input.toolRequestRecall * 0.10 +
    input.toolRequestPrecision * 0.10 +
    (1 - input.driftRate) * 0.03 +
    (1 - input.hallucinationRate) * 0.02;
}

function printReports(reports: CaseReport[], options: BenchmarkOptions): void {
  const summary = summarizeReports(reports);
  console.log("CCR real post-compaction agent benchmark");
  console.log(`summary: recall=${summary.found}/${summary.total} (${formatPercent(Number(summary.recall))}) goal=${summary.goalFound}/${summary.goalTotal} (${formatPercent(Number(summary.goalRetention))}) hidden_req=${formatPercent(Number(summary.toolRequestRecall))} req_precision=${formatPercent(Number(summary.toolRequestPrecision))} source=${formatPercent(Number(summary.sourceAccuracy))} action=${formatPercent(Number(summary.actionContinuity))} drift=${formatPercent(Number(summary.driftRate))} off_goal=${summary.offGoalCases}/${reports.length} hallucination=${summary.hallucinationCases}/${reports.length} score=${formatNumber(Number(summary.score))} pass=${summary.passedCases}/${reports.length} cost=$${formatNumber(Number(summary.costUsd))} compact_runs=${summary.compactRuns} compact_cost=$${formatNumber(Number(summary.compactCostUsd))} history_runs=${summary.historyRuns} history_cost=$${formatNumber(Number(summary.historyCostUsd))}`);
  console.log(`thresholds: min_recall=${formatPercent(options.minRecall)} min_goal=${formatPercent(options.minGoalRetention)} min_hidden_req=${formatPercent(options.minHiddenRequestRecall)} min_req_precision=${formatPercent(options.minToolRequestPrecision)} min_source=${formatPercent(options.minSourceAccuracy)} min_action=${formatPercent(options.minActionContinuity)} max_drift=${formatPercent(options.maxDriftRate)} compact_strategy=${options.compactStrategy} compact_summary=${options.compactSummaryMode} realism=${options.scenarioRealism} history=${options.historyExecutor}`);
  console.log("");
  printTable([
    "case",
    "est_tokens",
    "turns",
    "cycles",
    "strategy",
    "realism",
    "history",
    "near",
    "ratio",
    "visible",
    "hidden_req",
    "req_prec",
    "source",
    "action",
    "compact_runs",
    "tool_calls",
    "history_runs",
    "recall",
    "goal",
    "drift",
    "req_drift",
    "off_goal",
    "score",
    "pass",
    "misses",
    "hallucinated",
    "compact_cost",
    "history_cost",
    "cost"
  ], reports.map((report) => [
    report.caseId,
    String(report.estimatedTokens),
    String(report.turns),
    String(report.cycles),
    report.compactStrategy,
    report.scenarioRealism,
    report.historyExecutor,
    report.nearTarget ? "yes" : "no",
    formatNumber(report.ratio),
    formatPercent(report.compactContextRecall),
    `${report.toolRequestedHidden}/${report.toolRequestHiddenTotal}`,
    formatPercent(report.toolRequestPrecision),
    formatPercent(report.sourceAccuracy),
    formatPercent(report.actionContinuity),
    String(report.compactAgent.runs),
    String(report.toolCalls),
    String(report.historyAgent.runs),
    `${report.found}/${report.total}`,
    `${report.goalFound}/${report.goalTotal}`,
    report.driftHits.join(",") || "-",
    report.toolRequestDriftHits.join(",") || "-",
    report.offGoal ? "yes" : "no",
    formatNumber(report.score),
    report.passed ? "yes" : "no",
    report.misses.join(",") || "-",
    report.hallucinatedMarkers.join(",") || "-",
    `$${formatNumber(report.compactAgent.costUsd)}`,
    `$${formatNumber(report.historyAgent.costUsd)}`,
    `$${formatNumber(report.totalCostUsd)}`
  ]));
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
    caseSelector: "all",
    claudeBin: process.env.CLAUDE_BIN || "claude",
    claudeTimeoutMs: 10 * 60 * 1000,
    compactStrategy: "ccr",
    compactSummaryMode: "lossy",
    cycles: 1,
    historyExecutor: "mock",
    json: false,
    listTaskCases: false,
    minActionContinuity: 0.75,
    maxDriftRate: 0,
    maxBudgetUsd: "20",
    maxEstimatedTokens: 190000,
    minGoalRetention: 0.75,
    minHiddenRequestRecall: 0.75,
    minRecall: 0.75,
    minSourceAccuracy: 0.75,
    minToolRequestPrecision: 0.75,
    minEstimatedTokens: 170000,
    resumeSynthesis: false,
    scenarioRealism: "standard",
    targetEstimatedTokens: 180000
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [name, inlineValue] = arg.includes("=") ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const readValue = () => inlineValue ?? argv[++index];
    if (name === "--case" || name === "--cases") {
      options.caseSelector = readString(readValue(), name);
    } else if (name === "--claude-bin") {
      options.claudeBin = readString(readValue(), name);
    } else if (name === "--claude-timeout-ms") {
      options.claudeTimeoutMs = readPositiveInteger(readValue(), name);
    } else if (name === "--compact-summary") {
      options.compactSummaryMode = readCompactSummaryMode(readValue(), name);
    } else if (name === "--compact-strategy") {
      options.compactStrategy = readCompactStrategy(readValue(), name);
    } else if (name === "--cycles") {
      options.cycles = readPositiveInteger(readValue(), name);
    } else if (name === "--history-executor") {
      options.historyExecutor = readHistoryExecutor(readValue(), name);
    } else if (name === "--json") {
      options.json = true;
    } else if (name === "--list-task-cases") {
      options.listTaskCases = true;
    } else if (name === "--min-action-continuity") {
      options.minActionContinuity = readUnitNumber(readValue(), name);
    } else if (name === "--max-budget-usd") {
      options.maxBudgetUsd = readString(readValue(), name);
    } else if (name === "--max-drift-rate") {
      options.maxDriftRate = readUnitNumber(readValue(), name);
    } else if (name === "--max-estimated-tokens") {
      options.maxEstimatedTokens = readPositiveInteger(readValue(), name);
    } else if (name === "--min-goal-retention") {
      options.minGoalRetention = readUnitNumber(readValue(), name);
    } else if (name === "--min-hidden-request-recall") {
      options.minHiddenRequestRecall = readUnitNumber(readValue(), name);
    } else if (name === "--min-recall") {
      options.minRecall = readUnitNumber(readValue(), name);
    } else if (name === "--min-source-accuracy") {
      options.minSourceAccuracy = readUnitNumber(readValue(), name);
    } else if (name === "--min-tool-request-precision") {
      options.minToolRequestPrecision = readUnitNumber(readValue(), name);
    } else if (name === "--min-estimated-tokens") {
      options.minEstimatedTokens = readPositiveInteger(readValue(), name);
    } else if (name === "--model") {
      options.model = readString(readValue(), name);
    } else if (name === "--resume-synthesis") {
      options.resumeSynthesis = true;
    } else if (name === "--scenario-realism") {
      options.scenarioRealism = readScenarioRealism(readValue(), name);
    } else if (name === "--target-estimated-tokens") {
      options.targetEstimatedTokens = readPositiveInteger(readValue(), name);
    } else if (name === "--turns") {
      options.turns = readPositiveInteger(readValue(), name);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.caseSelector !== "all") {
    findTaskCase(options.caseSelector || defaultTaskCaseId);
  }
  return options;
}

function readCompactStrategy(value: string | undefined, name: string): BenchmarkOptions["compactStrategy"] {
  const mode = readString(value, name);
  if (mode === "ccr" || mode === "native") {
    return mode;
  }
  throw new Error(`${name} must be "ccr" or "native".`);
}

function readHistoryExecutor(value: string | undefined, name: string): BenchmarkOptions["historyExecutor"] {
  const mode = readString(value, name);
  if (mode === "mock" || mode === "model") {
    return mode;
  }
  throw new Error(`${name} must be "mock" or "model".`);
}

function readScenarioRealism(value: string | undefined, name: string): BenchmarkOptions["scenarioRealism"] {
  const mode = readString(value, name);
  if (mode === "light" || mode === "standard" || mode === "heavy") {
    return mode;
  }
  throw new Error(`${name} must be "light", "standard", or "heavy".`);
}

function readCompactSummaryMode(value: string | undefined, name: string): BenchmarkOptions["compactSummaryMode"] {
  const mode = readString(value, name);
  if (mode === "lossy" || mode === "minimal") {
    return mode;
  }
  throw new Error(`${name} must be "lossy" or "minimal".`);
}

function readUnitNumber(value: string | undefined, name: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`${name} must be a number from 0 to 1.`);
  }
  return number;
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

function formatNumber(value: number): string {
  return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 3);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}
