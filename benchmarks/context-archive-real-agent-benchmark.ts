import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createDefaultAppConfig } from "../packages/core/src/config/default-config";
import type { AppConfig } from "../packages/core/src/contracts/app";
import {
  contextArchiveService,
  finalizeContextArchiveRequest,
  prepareContextArchiveRequest
} from "../packages/core/src/gateway/context-archive";
import { defaultTaskCaseId, findTaskCase, selectTaskCases, taskCaseIds } from "./context-archive-task-cases.mjs";

type BenchmarkOptions = {
  caseSelector: string;
  claudeBin: string;
  json: boolean;
  listTaskCases: boolean;
  maxBudgetUsd: string;
  maxEstimatedTokens: number;
  minEstimatedTokens: number;
  targetEstimatedTokens: number;
  turns?: number;
};

type TaskCase = {
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

type Corpus = {
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
  question?: string;
  session_id?: string;
  session_token?: string;
  task?: string;
};

type CaseReport = {
  bodyRecall: number;
  caseId: string;
  compactedBytes: number;
  diagnostic: string;
  estimatedTokens: number;
  finalOutput: string;
  found: number;
  initialAgent: ClaudeRun;
  misses: string[];
  nearTarget: boolean;
  originalBytes: number;
  ratio: number;
  sessionId: string;
  synthesisAgent: ClaudeRun;
  title: string;
  toolCalls: number;
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
    return;
  }
  printReports(reports);
}

async function runCase(taskCase: TaskCase, options: BenchmarkOptions): Promise<CaseReport> {
  contextArchiveService.clear();
  const corpus = buildTargetCorpus(taskCase, options);
  const sessionId = `real-ccr-${taskCase.id}-${randomUUID()}`;
  const config = benchmarkConfig();
  const body = anthropicMessagesBody(corpus);
  const original = Buffer.from(JSON.stringify(body), "utf8");
  const prepared = await prepareContextArchiveRequest({
    body: original,
    config,
    headers: { "x-ccr-context-compact": "handoff", "x-session-id": sessionId },
    method: "POST",
    path: "/v1/messages",
    protocol: "anthropic_messages",
    requestId: `real-agent-${taskCase.id}`
  });
  if (!prepared) {
    throw new Error(`CCR did not prepare context archive request for ${taskCase.id}.`);
  }
  finalizeContextArchiveRequest(prepared.record, {
    logicalProvider: "benchmark-provider",
    providerProtocol: "anthropic_messages",
    routedModel: "claude-sonnet-4-5"
  }, config);

  const compactedBody = JSON.parse(prepared.body.toString("utf8")) as Record<string, unknown>;
  const compactedText = renderCompactedBody(compactedBody);
  const initialAgent = await runClaude({
    claudeBin: options.claudeBin,
    input: initialAgentPrompt(corpus, compactedText, sessionId),
    maxBudgetUsd: options.maxBudgetUsd,
    sessionId: randomUUID()
  });
  const preparedText = prepared.body.toString("utf8");
  const archiveId = prepared.record.archiveId;
  const sessionToken = /Archive session token:\s*([A-Za-z0-9_-]+)/.exec(preparedText)?.[1];
  if (!sessionToken) {
    throw new Error(`CCR handoff did not include a session token for ${taskCase.id}.`);
  }
  const toolRequests = parseToolRequests(initialAgent.output, corpus, sessionId, archiveId, sessionToken);
  const toolResults = [];
  const executor = mockHistoryExecutor(corpus.facts);
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

  const synthesisAgent = await runClaude({
    claudeBin: options.claudeBin,
    input: synthesisPrompt(corpus, compactedText, sessionId, toolResults),
    maxBudgetUsd: options.maxBudgetUsd,
    resume: initialAgent.sessionId
  });
  const finalOutput = parseFinalText(synthesisAgent.output);
  const foundFacts = corpus.facts.filter((fact) => finalOutput.includes(fact.expected));
  const bodyFacts = corpus.facts.filter((fact) => compactedText.includes(fact.expected));
  const misses = corpus.facts.filter((fact) => !finalOutput.includes(fact.expected)).map((fact) => fact.key);
  const estimatedTokens = estimateBodyTokens(body);

  return {
    bodyRecall: bodyFacts.length / corpus.facts.length,
    caseId: taskCase.id,
    compactedBytes: prepared.body.byteLength,
    diagnostic: prepared.diagnostic,
    estimatedTokens,
    finalOutput,
    found: foundFacts.length,
    initialAgent,
    misses,
    nearTarget: estimatedTokens >= options.minEstimatedTokens && estimatedTokens <= options.maxEstimatedTokens,
    originalBytes: original.byteLength,
    ratio: prepared.body.byteLength / original.byteLength,
    sessionId,
    synthesisAgent,
    title: taskCase.title,
    toolCalls: toolResults.length,
    total: corpus.facts.length,
    totalCostUsd: initialAgent.costUsd + synthesisAgent.costUsd,
    turns: corpus.turns
  };
}

function mockHistoryExecutor(facts: CorpusFact[]) {
  return async (input: { body: Buffer }) => {
    const payload = JSON.parse(input.body.toString("utf8")) as Record<string, unknown>;
    const payloadText = allPayloadStrings(payload).join("\n");
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const taskText = allPayloadStrings(messages.at(-1)).join("\n");
    const fact = facts.find((candidate) =>
      taskText.includes(candidate.detail) &&
      payloadText.includes(candidate.expected)
    );
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
      storagePath: `/tmp/ccr-context-archive-real-benchmark-${process.pid}-${randomUUID()}.sqlite`
    }
  };
}

function buildTargetCorpus(taskCase: TaskCase, options: BenchmarkOptions): Corpus {
  if (options.turns) {
    return buildCorpus(taskCase, options.turns);
  }
  let turns = 1200;
  let corpus = buildCorpus(taskCase, turns);
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
    corpus = buildCorpus(taskCase, turns);
  }
  return corpus;
}

function buildCorpus(taskCase: TaskCase, turns: number): Corpus {
  const safeTurns = Math.max(20, turns);
  const facts = taskCase.facts.map((fact) => ({
    detail: fact.detail,
    expected: fact.marker,
    key: fact.key,
    query: `What exact marker records this task fact: ${fact.detail}`
  }));
  const factsByIndex = new Map(taskCase.facts.map((fact) => [
    placementIndex(fact.placement, fact.key)(safeTurns),
    fact
  ]));
  const messages: Corpus["messages"] = [];
  for (let index = 0; index < safeTurns; index += 1) {
    const fact = factsByIndex.get(index);
    const role = index % 2 === 0 ? "user" : "assistant";
    messages.push({
      content: [
        `Turn ${index}: ${role} works on realistic task case ${taskCase.id}: ${taskCase.title}.`,
        filler(taskCase, index),
        "The conversation includes file paths, command output, partial implementation notes, and review constraints.",
        fact ? `FACT ${fact.key}: ${fact.marker}. ${fact.detail}` : undefined
      ].filter(Boolean).join("\n"),
      role
    });
  }
  return { facts, messages, taskCase, turns: safeTurns };
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

function renderCompactedBody(body: Record<string, unknown>): string {
  const system = contentText(body.system);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return [
    "SYSTEM:",
    system,
    "",
    "MESSAGES:",
    ...messages.map((message, index) => {
      const record = isRecord(message) ? message : {};
      return [
        `--- message ${index + 1} role=${String(record.role ?? "unknown")} ---`,
        contentText(record.content)
      ].join("\n");
    })
  ].join("\n").slice(0, 120000);
}

function initialAgentPrompt(corpus: Corpus, compactedText: string, sessionId: string): string {
  return [
    "You are a real post-compaction coding agent evaluating CCR context continuity.",
    "You received only the CCR-compressed context below. Exact older details may require ccr_history_ask.",
    "Do not guess marker strings. Ask the archived previous-context agent for every marker that is not directly visible.",
    "Return ONLY JSON in this shape:",
    '{"tool_calls":[{"task":"specific natural-language history question","archive_id":"archive id","session_token":"archive token"}]}',
    "",
    `Archive session id: ${sessionId}`,
    "Continuity facts to recover:",
    ...corpus.facts.map((fact) => `- ${fact.key}: ${fact.detail}`),
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
  toolResults: Array<{ request: ToolRequest; result: unknown }>
): string {
  return [
    "Use the CCR-compressed context and ccr_history_ask answers to answer the continuity probe.",
    "Return ONLY JSON in this exact shape:",
    `{"final":{${corpus.facts.map((fact) => `"${fact.key}":"exact marker or UNKNOWN"`).join(",")}}}`,
    "Do not guess. If evidence is insufficient, use UNKNOWN.",
    "",
    `Archive session id: ${sessionId}`,
    "",
    "CCR_COMPRESSED_CONTEXT_BEGIN",
    compactedText,
    "CCR_COMPRESSED_CONTEXT_END",
    "",
    "CCR_HISTORY_ASK_RESULTS_BEGIN",
    JSON.stringify(toolResults, null, 2),
    "CCR_HISTORY_ASK_RESULTS_END"
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
  return corpus.facts.map((fact) => ({
    archive_id: archiveId,
    question: fact.query,
    session_id: sessionId,
    session_token: sessionToken,
    task: fact.query
  }));
}

function parseFinalText(output: string): string {
  const parsed = parseJsonObject(output);
  if (parsed?.final && typeof parsed.final === "object") {
    return JSON.stringify(parsed.final);
  }
  return output;
}

async function runClaude(input: {
  claudeBin: string;
  input: string;
  maxBudgetUsd: string;
  resume?: string;
  sessionId?: string;
}): Promise<ClaudeRun> {
  const started = performance.now();
  const args = [
    "-p",
    "--output-format",
    "json",
    "--tools",
    "",
    "--max-budget-usd",
    input.maxBudgetUsd
  ];
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

  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  const elapsedMs = performance.now() - started;
  const result = parseClaudeJson(stdout);
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
  return {
    avgRatio: average(reports.map((report) => report.ratio)),
    bodyRecall: average(reports.map((report) => report.bodyRecall)),
    costUsd: reports.reduce((sum, report) => sum + report.totalCostUsd, 0),
    found,
    nearTargetCases: reports.filter((report) => report.nearTarget).length,
    recall: total ? found / total : 0,
    total
  };
}

function printReports(reports: CaseReport[]): void {
  const summary = summarizeReports(reports);
  console.log("CCR real post-compaction agent benchmark");
  console.log(`summary: recall=${summary.found}/${summary.total} (${formatPercent(Number(summary.recall))}) avg_ratio=${formatNumber(Number(summary.avgRatio))} body_recall=${formatPercent(Number(summary.bodyRecall))} cost=$${formatNumber(Number(summary.costUsd))} near_target=${summary.nearTargetCases}/${reports.length}`);
  console.log("");
  printTable([
    "case",
    "est_tokens",
    "turns",
    "near",
    "ratio",
    "body",
    "tool_calls",
    "recall",
    "misses",
    "cost"
  ], reports.map((report) => [
    report.caseId,
    String(report.estimatedTokens),
    String(report.turns),
    report.nearTarget ? "yes" : "no",
    formatNumber(report.ratio),
    formatPercent(report.bodyRecall),
    String(report.toolCalls),
    `${report.found}/${report.total}`,
    report.misses.join(",") || "-",
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
    json: false,
    listTaskCases: false,
    maxBudgetUsd: "20",
    maxEstimatedTokens: 190000,
    minEstimatedTokens: 170000,
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
    } else if (name === "--json") {
      options.json = true;
    } else if (name === "--list-task-cases") {
      options.listTaskCases = true;
    } else if (name === "--max-budget-usd") {
      options.maxBudgetUsd = readString(readValue(), name);
    } else if (name === "--max-estimated-tokens") {
      options.maxEstimatedTokens = readPositiveInteger(readValue(), name);
    } else if (name === "--min-estimated-tokens") {
      options.minEstimatedTokens = readPositiveInteger(readValue(), name);
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
