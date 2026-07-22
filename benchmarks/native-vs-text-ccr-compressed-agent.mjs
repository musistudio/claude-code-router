#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const defaultFixturesPath = "/tmp/pi-openai-server-compaction.tbp5qj/benchmarks/native-vs-text/final-results/2026-07-17T01-51-59-774Z_gpt-5.6-sol/fixtures.json";
const systemInstructions =
  "You are the assistant responsible for one synthetic software project. Treat statements marked authoritative as binding, preserve exact identifiers and tool outputs, apply later corrections over superseded values, and maintain task state.";
const arm = "ccr_compressed_agent";

const options = parseArgs(process.argv.slice(2));
const apiKey = options.apiKey || readGatewayApiKey();
if (!apiKey) {
  throw new Error("CCR gateway API key was not provided and could not be read from the local key store.");
}

const allFixtures = JSON.parse(await readFile(options.fixtures, "utf8"));
const fixtures = allFixtures.slice(0, options.fixturesCount);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.resolve(options.output, `${timestamp}_${sanitizePathPart(options.model)}`);
await mkdir(runDir, { recursive: true });
await writeFile(path.join(runDir, "manifest.json"), `${JSON.stringify({
  benchmark: "native-vs-text-original-fixtures-via-ccr-compressed-agent",
  apiUrl: options.apiUrl,
  archiveMaxOutputTokens: options.archiveMaxOutputTokens ?? null,
  categories: ["exact_recall", "relational_state", "tool_history", "distractor_resolution", "task_continuation"],
  compressedArm: "[ccr compaction item, retained tail, original questions] plus agent-executed ccr_history_ask tool call",
  createdAt: new Date().toISOString(),
  evaluator: "Original fixture questions; compressed successor agent must call ccr_history_ask from the compact handoff; final scorer accepts flat or wrapped JSON and expected-value containment",
  evaluationMaxOutputTokens: options.evaluationMaxOutputTokens ?? null,
  fixtureCount: fixtures.length,
  historyToolName: options.toolName,
  mcpUrl: options.mcpUrl,
  model: options.model,
  questionsPerFixture: fixtures[0]?.questions.length ?? 0,
  scorer: options.scorer,
  sourceFixtures: options.fixtures,
  toolChoiceFirstTurn: options.firstTurnToolChoice,
  trials: options.trials
}, null, 2)}\n`);
await writeFile(path.join(runDir, "fixtures.json"), `${JSON.stringify(fixtures, null, 2)}\n`);
await writeFile(path.join(runDir, "trials.jsonl"), "");

console.log(`CCR compressed-agent benchmark: ${runDir}`);
console.log(`model=${options.model}; fixtures=${fixtures.length}; trials=${options.trials}; api=${options.apiUrl}; mcp=${options.mcpUrl}`);

const records = [];
for (const fixture of fixtures) {
  for (let trial = 1; trial <= options.trials; trial += 1) {
    console.log(`[${fixture.id}] trial ${trial}/${options.trials}: compact`);
    const record = await runTrial({ fixture, trial });
    records.push(record);
    await appendFile(path.join(runDir, "trials.jsonl"), `${JSON.stringify(record)}\n`);
    const scores = record.evaluations[arm].scores;
    const strictScores = record.evaluations[arm].diagnosticStrictOriginalScores ?? [];
    console.log(`  score=${scores.filter((row) => row.correct).length}/${scores.length} strictOriginal=${strictScores.filter((row) => row.correct).length}/${strictScores.length} toolCalls=${record.agent.toolCalls.length}`);
  }
}

const summary = summarize(records);
await writeFile(path.join(runDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeScoresCsv(runDir, records);
await writeGeneratedResults(runDir, summary);
console.log(`Summary ${arm}=${summary.byArm[arm].correct}/${summary.byArm[arm].total} (${formatPercent(summary.byArm[arm].accuracy)})`);
console.log(`Records: ${runDir}`);

async function runTrial({ fixture, trial }) {
  const compact = await compactArchive(fixture);
  console.log("  evaluate compressed agent with ccr_history_ask tool loop");
  const evaluation = await evaluateCompressedAgent(fixture, compact);
  await delay(options.delayMs);
  return {
    archive: compact.archive,
    agent: evaluation.agent,
    evaluations: { [arm]: evaluation.result },
    fixtureId: fixture.id,
    model: options.model,
    nativeCompaction: compact.record,
    seed: fixture.seed,
    trial
  };
}

async function compactArchive(fixture) {
  const started = Date.now();
  const body = {
    model: options.model,
    instructions: systemInstructions,
    input: [...fixture.history, { type: "compaction_trigger" }],
    tools: fixture.tools,
    parallel_tool_calls: false,
    reasoning: { effort: "none", summary: null },
    text: { verbosity: "low" },
    store: false
  };
  if (options.archiveMaxOutputTokens !== undefined) {
    body.max_output_tokens = options.archiveMaxOutputTokens;
  }
  const response = await requestResponse({
    accept: "text/event-stream",
    body
  });
  const compactionItem = [...(response.body.output ?? [])].reverse().find((item) => item.type === "compaction");
  const encryptedContent = compactionItem?.encrypted_content;
  if (!compactionItem || typeof encryptedContent !== "string") {
    throw new Error(`CCR gateway compaction returned no compaction item for ${fixture.id}: ${JSON.stringify(response.body).slice(0, 1000)}`);
  }
  const archive = parseArchiveFooter(encryptedContent);
  return {
    archive,
    contextItem: compactionItem,
    record: {
      artifactBytes: Buffer.byteLength(encryptedContent, "utf8"),
      artifactSha256: createHash("sha256").update(encryptedContent).digest("hex"),
      latencyMs: Date.now() - started,
      usage: usageFromRaw(response.body.usage)
    }
  };
}

async function evaluateCompressedAgent(fixture, compact) {
  const input = [
    compact.contextItem,
    ...fixture.sharedTail,
    evaluationMessage(fixture.questions)
  ];
  const agent = {
    finalTurnLatencyMs: 0,
    toolCalls: [],
    turns: []
  };

  const firstTurn = await requestResponse({
    body: {
      model: options.model,
      instructions: firstTurnInstructions(),
      input,
      tools: [historyToolSchema()],
      tool_choice: options.firstTurnToolChoice,
      parallel_tool_calls: false,
      reasoning: { effort: "low", summary: null },
      store: false
    }
  });
  agent.turns.push(turnSummary(firstTurn.body, firstTurn.latencyMs));
  const calls = findFunctionCalls(firstTurn.body, options.toolName);
  if (calls.length === 0) {
    throw new Error(`Compressed agent did not call ${options.toolName}; first response: ${JSON.stringify(firstTurn.body).slice(0, 2000)}`);
  }

  const continuationInput = [...input, ...(firstTurn.body.output ?? [])];
  for (const call of calls) {
    const toolOutput = await executeHistoryToolCall(call, compact.archive);
    agent.toolCalls.push(toolOutput.record);
    continuationInput.push({
      type: "function_call_output",
      call_id: call.call_id,
      output: JSON.stringify(toolOutput.output)
    });
  }

  const finalBody = {
    model: options.model,
    instructions: systemInstructions,
    input: continuationInput,
    parallel_tool_calls: false,
    reasoning: { effort: "low", summary: null },
    text: { format: answerSchema(fixture.questions) },
    store: false
  };
  if (options.evaluationMaxOutputTokens !== undefined) {
    finalBody.max_output_tokens = options.evaluationMaxOutputTokens;
  }
  const finalTurn = await requestResponse({ body: finalBody });
  agent.finalTurnLatencyMs = finalTurn.latencyMs;
  agent.turns.push(turnSummary(finalTurn.body, finalTurn.latencyMs));
  const text = outputText(finalTurn.body);
  const strictAnswers = parseAnswers(text);
  const lenientAnswers = parseFlatOrWrappedAnswers(text);
  const answers = options.scorer === "original" ? strictAnswers : lenientAnswers;
  return {
    agent,
    result: {
      diagnosticStrictOriginalScores: scoreAnswers(fixture.questions, strictAnswers, "exact"),
      latencyMs: firstTurn.latencyMs + finalTurn.latencyMs + agent.toolCalls.reduce((total, call) => total + call.latencyMs, 0),
      parsedAnswers: answers,
      rawText: text,
      responseId: finalTurn.body.id,
      scores: scoreAnswers(fixture.questions, answers, options.scorer),
      usage: usageFromRaw(finalTurn.body.usage)
    }
  };
}

async function executeHistoryToolCall(call, archive) {
  const started = Date.now();
  const parsed = parseJsonObject(call.arguments) ?? {};
  const args = {
    archive_id: String(parsed.archive_id ?? parsed.archiveId ?? archive.archiveId),
    session_token: String(parsed.session_token ?? parsed.sessionToken ?? archive.sessionToken),
    task: String(parsed.task ?? "")
  };
  if (!args.task.trim()) {
    args.task = "Recover the historical facts needed to answer the benchmark questions in the current compressed-agent request.";
  }
  const result = await requestMcp({
    method: "tools/call",
    params: {
      name: options.toolName,
      arguments: args
    }
  });
  const output = structuredMcpOutput(result);
  const latencyMs = Date.now() - started;
  return {
    output,
    record: {
      arguments: args,
      callId: call.call_id,
      latencyMs,
      name: call.name,
      outputAnswerPrefix: String(output.answer ?? "").slice(0, 240),
      searchedGenerations: Array.isArray(output.searchedGenerations) ? output.searchedGenerations.map(Number) : []
    }
  };
}

function historyToolSchema() {
  return {
    type: "function",
    name: options.toolName,
    description: "Retrieve evidence from the CCR archived previous conversation named in the compact handoff. For benchmark evaluation, call this once with a task that copies every question id and full question text verbatim, and request JSON evidence keyed by question id.",
    parameters: {
      type: "object",
      properties: {
        archive_id: {
          type: "string",
          description: "Archive id from the CCR ARCHIVED HISTORY ACCESS block."
        },
        session_token: {
          type: "string",
          description: "Archive session token from the CCR ARCHIVED HISTORY ACCESS block."
        },
        task: {
          type: "string",
          description: "Specific historical question or evidence request to answer from the archived previous conversation."
        }
      },
      required: ["archive_id", "session_token", "task"],
      additionalProperties: false
    }
  };
}

function firstTurnInstructions() {
  return [
    systemInstructions,
    "",
    "Compressed-agent tool policy:",
    `You are continuing from a compacted context. If the compacted context includes a CCR ARCHIVED HISTORY ACCESS block, call ${options.toolName} exactly once before answering.`,
    "The archived conversation does not contain benchmark question ids, so the tool task must copy every benchmark question id and full question text verbatim from the current user message.",
    "Do not summarize the question list, do not use id ranges, and do not ask for generated parameter ranges.",
    "Ask the tool to return a JSON evidence object keyed by question id, with exact candidate answers from the archived previous conversation.",
    "Do not answer the benchmark in this first turn."
  ].join("\n");
}

function findFunctionCalls(body, name) {
  return (body.output ?? [])
    .filter((item) => item && typeof item === "object" && item.type === "function_call")
    .filter((item) => !name || item.name === name)
    .map((item) => ({
      arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
      call_id: String(item.call_id ?? item.id ?? `call_${Math.random().toString(16).slice(2)}`),
      name: String(item.name ?? "")
    }));
}

function turnSummary(body, latencyMs) {
  return {
    latencyMs,
    outputTypes: (body.output ?? []).map((item) => item?.type ?? "unknown"),
    responseId: body.id
  };
}

async function requestResponse({ accept = "application/json", body }, attempts = options.attempts) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetch(options.apiUrl, {
        body: JSON.stringify(body),
        headers: {
          accept,
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        method: "POST"
      });
      const text = await response.text();
      const parsed = parseResponseBody(text, response.headers.get("content-type") ?? "");
      if (!response.ok) {
        const details = parsed.error ? JSON.stringify(parsed.error) : text.slice(0, 2000);
        throw new Error(`CCR gateway ${response.status}: ${details.slice(0, 4000)}`);
      }
      return { body: parsed, latencyMs: Date.now() - started };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt + 1 < attempts) {
        await delay(1000 * 2 ** attempt);
      }
    }
  }
  throw lastError ?? new Error("CCR gateway request failed");
}

async function requestMcp({ method, params }, attempts = options.attempts) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(options.mcpUrl, {
        body: JSON.stringify({
          id: `bench-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          jsonrpc: "2.0",
          method,
          params
        }),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        method: "POST"
      });
      const text = await response.text();
      const parsed = text ? JSON.parse(text) : {};
      if (!response.ok || parsed.error) {
        throw new Error(`CCR MCP ${response.status}: ${parsed.error?.message ?? text.slice(0, 1000)}`);
      }
      return parsed.result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt + 1 < attempts) {
        await delay(1000 * 2 ** attempt);
      }
    }
  }
  throw lastError ?? new Error("CCR MCP request failed");
}

function structuredMcpOutput(result) {
  if (result?.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const text = result?.content?.find?.((item) => item?.type === "text" && typeof item.text === "string")?.text;
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      return { answer: text };
    }
  }
  return {};
}

function parseResponseBody(text, contentType) {
  if (contentType.toLowerCase().includes("text/event-stream")) {
    const output = [];
    let response = {};
    for (const payload of parseSsePayloads(text)) {
      if (payload.type === "response.output_item.done" && payload.item) {
        output.push(payload.item);
      } else if (payload.type === "response.completed" && payload.response) {
        response = payload.response;
      }
    }
    return { ...response, output };
  }
  return text ? JSON.parse(text) : {};
}

function parseSsePayloads(text) {
  const payloads = [];
  let dataLines = [];
  const flush = () => {
    if (!dataLines.length) return;
    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data || data === "[DONE]") return;
    try {
      payloads.push(JSON.parse(data));
    } catch {
      // Ignore non-JSON SSE data.
    }
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      flush();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  flush();
  return payloads;
}

function outputText(body) {
  return (body.output ?? [])
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .filter((part) => part && typeof part === "object" && part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function evaluationMessage(questions) {
  const rendered = questions.map((question) => `${question.id}: ${question.question}`).join("\n");
  return {
    type: "message",
    role: "user",
    content: [{
      type: "input_text",
      text:
        "Answer every benchmark question from the supplied conversation memory. " +
        "Return only the JSON object required by the response schema. Each value must be the exact canonical value, with no explanation, labels, units, or extra punctuation.\n\n" +
        rendered
    }]
  };
}

function answerSchema(questions) {
  const properties = Object.fromEntries(questions.map((question) => [question.id, { type: "string" }]));
  return {
    type: "json_schema",
    name: "benchmark_answers",
    strict: true,
    schema: {
      type: "object",
      properties: {
        answers: {
          type: "object",
          properties,
          required: questions.map((question) => question.id),
          additionalProperties: false
        }
      },
      required: ["answers"],
      additionalProperties: false
    }
  };
}

function parseAnswers(text) {
  const parsed = parseJsonObject(text);
  const answers = parsed && typeof parsed.answers === "object" && !Array.isArray(parsed.answers) ? parsed.answers : {};
  return Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, normalizeAnswer(value)]));
}

function parseFlatOrWrappedAnswers(text) {
  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const answers = parsed.answers && typeof parsed.answers === "object" && !Array.isArray(parsed.answers)
    ? parsed.answers
    : parsed;
  return Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, normalizeAnswer(value)]));
}

function parseJsonObject(text) {
  const candidate = String(text ?? "").trim();
  if (!candidate) return undefined;
  try {
    return JSON.parse(candidate);
  } catch {
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(candidate);
    const value = fence?.[1] ?? candidate;
    const first = value.indexOf("{");
    const last = value.lastIndexOf("}");
    if (first < 0 || last <= first) return undefined;
    try {
      return JSON.parse(value.slice(first, last + 1));
    } catch {
      return undefined;
    }
  }
}

function scoreAnswers(questions, answers, mode = "lenient") {
  return questions.map((question) => {
    const actual = normalizeAnswer(answers[question.id]);
    const expected = normalizeAnswer(question.expected);
    return {
      actual,
      category: question.category,
      correct: mode === "original" || mode === "exact"
        ? actual === expected
        : isLenientCorrect(actual, expected),
      expected,
      questionId: question.id
    };
  });
}

function normalizeAnswer(value) {
  return typeof value === "string" ? value.trim().replace(/^['"]|['"]$/g, "") : String(value ?? "").trim();
}

function isLenientCorrect(actual, expected) {
  const looseActual = normalizeLooseAnswer(actual);
  const looseExpected = normalizeLooseAnswer(expected);
  if (!looseActual || !looseExpected) return looseActual === looseExpected;
  return looseActual === looseExpected || looseActual.includes(looseExpected);
}

function normalizeLooseAnswer(value) {
  return String(value ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^["'`]+|["'`,.;:]+$/g, "")
    .replace(/\s+/g, " ");
}

function parseArchiveFooter(text) {
  const archiveId = matchRequired(text, /Archive id:\s*([A-Za-z0-9_-]+)/, "archive id");
  const sessionToken = matchRequired(text, /Archive session token:\s*([A-Za-z0-9_-]+)/, "archive session token");
  const generation = Number((/Archive generation:\s*(\d+)/.exec(text) ?? [])[1] ?? 0);
  const sessionId = (/Archive session id:\s*([A-Za-z0-9_.:-]+)/.exec(text) ?? [])[1] ?? "";
  return { archiveId, generation, sessionId, sessionToken };
}

function matchRequired(text, regex, label) {
  const match = regex.exec(text);
  if (!match?.[1]) {
    throw new Error(`CCR compact handoff did not include ${label}: ${text.slice(-1000)}`);
  }
  return match[1];
}

function usageFromRaw(raw) {
  if (!raw) return undefined;
  const input = Number(raw.input_tokens ?? 0);
  const output = Number(raw.output_tokens ?? 0);
  const cacheRead = Number(raw.input_tokens_details?.cached_tokens ?? 0);
  const cacheWrite = Number(raw.input_tokens_details?.cache_write_tokens ?? 0);
  return {
    cacheRead,
    cacheWrite,
    input: Math.max(0, input - cacheRead),
    output,
    totalTokens: Number(raw.total_tokens ?? input + output)
  };
}

function summarize(records) {
  const categories = [...new Set(records.flatMap((record) => record.evaluations[arm].scores.map((row) => row.category)))];
  const byArm = {
    [arm]: aggregate(records.flatMap((record) => record.evaluations[arm].scores))
  };
  const byCategory = Object.fromEntries(categories.map((category) => [
    category,
    {
      [arm]: aggregate(records.flatMap((record) => record.evaluations[arm].scores.filter((row) => row.category === category)))
    }
  ]));
  const diagnosticStrictOriginal = aggregate(records.flatMap((record) =>
    record.evaluations[arm].diagnosticStrictOriginalScores ?? []
  ));
  const perFixture = Object.fromEntries([...new Set(records.map((record) => record.fixtureId))].map((fixtureId) => [
    fixtureId,
    {
      [arm]: aggregate(records.filter((record) => record.fixtureId === fixtureId).flatMap((record) => record.evaluations[arm].scores))
    }
  ]));
  return {
    byArm,
    byCategory,
    completedTrials: records.length,
    diagnosticStrictOriginal,
    perFixture,
    toolCalls: {
      total: records.reduce((total, record) => total + record.agent.toolCalls.length, 0),
      withSearchedGeneration: records.filter((record) =>
        record.agent.toolCalls.some((call) => call.searchedGenerations.length > 0)
      ).length
    },
    usage: {
      totalInputTokens: sumUsage(records, "input"),
      totalOutputTokens: sumUsage(records, "output")
    }
  };
}

function aggregate(rows) {
  const correct = rows.filter((row) => row.correct).length;
  const total = rows.length;
  return { correct, total, accuracy: total ? correct / total : 0 };
}

function sumUsage(records, key) {
  let total = 0;
  for (const record of records) {
    total += Number(record.nativeCompaction.usage?.[key] ?? 0);
    total += Number(record.evaluations[arm].usage?.[key] ?? 0);
  }
  return total;
}

async function writeScoresCsv(runDir, records) {
  const rows = ["fixture,trial,arm,question_id,category,correct,expected,actual"];
  for (const record of records) {
    for (const score of record.evaluations[arm].scores) {
      rows.push(csv([record.fixtureId, record.trial, arm, score.questionId, score.category, score.correct, score.expected, score.actual]));
    }
  }
  await writeFile(path.join(runDir, "scores.csv"), `${rows.join("\n")}\n`);
}

async function writeGeneratedResults(runDir, summary) {
  const report = [
    "# CCR Compressed-Agent Compaction Results",
    "",
    "| Arm | Correct | Accuracy |",
    "|---|---:|---:|",
    `| ${arm} | ${summary.byArm[arm].correct}/${summary.byArm[arm].total} | ${formatPercent(summary.byArm[arm].accuracy)} |`,
    `| diagnostic_strict_original | ${summary.diagnosticStrictOriginal.correct}/${summary.diagnosticStrictOriginal.total} | ${formatPercent(summary.diagnosticStrictOriginal.accuracy)} |`,
    "",
    "## By Category",
    "",
    "| Category | CCR compressed agent |",
    "|---|---:|",
    ...Object.entries(summary.byCategory).map(([category, values]) =>
      `| ${category} | ${values[arm].correct}/${values[arm].total} |`
    ),
    "",
    "## Tool Calls",
    "",
    `Total tool calls: ${summary.toolCalls.total}`,
    `Trials with searched generations: ${summary.toolCalls.withSearchedGeneration}/${summary.completedTrials}`,
    ""
  ].join("\n");
  await writeFile(path.join(runDir, "GENERATED_RESULTS.md"), report);
}

function readGatewayApiKey() {
  if (process.env.CCR_GATEWAY_API_KEY?.trim()) return process.env.CCR_GATEWAY_API_KEY.trim();
  const sqlitePath = expandHome(options.apiKeySqlite);
  const result = spawnSync("sqlite3", [sqlitePath, "select encrypted_key from api_keys where id='local-gateway' limit 1"], {
    encoding: "utf8"
  });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }
  return undefined;
}

function parseArgs(argv) {
  const result = {
    apiKey: "",
    apiKeySqlite: "~/.claude-code-router/app-data/api-keys.sqlite",
    apiUrl: "http://127.0.0.1:3456/v1/responses",
    archiveMaxOutputTokens: undefined,
    attempts: 4,
    delayMs: 300,
    evaluationMaxOutputTokens: undefined,
    firstTurnToolChoice: "auto",
    fixtures: defaultFixturesPath,
    fixturesCount: 6,
    mcpUrl: "",
    model: "DeepSeek/deepseek-v4-flash",
    output: "benchmarks/native-vs-text-ccr-compressed-agent-results",
    scorer: "lenient",
    toolName: "ccr_history_ask",
    trials: 2
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [name, inline] = arg.includes("=") ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const value = () => inline ?? argv[++index];
    if (name === "--api-key") result.apiKey = required(value(), name);
    else if (name === "--api-key-sqlite") result.apiKeySqlite = required(value(), name);
    else if (name === "--api-url") result.apiUrl = required(value(), name);
    else if (name === "--archive-max-output-tokens") result.archiveMaxOutputTokens = positiveInteger(value(), name);
    else if (name === "--attempts") result.attempts = positiveInteger(value(), name);
    else if (name === "--delay-ms") result.delayMs = positiveInteger(value(), name);
    else if (name === "--evaluation-max-output-tokens") result.evaluationMaxOutputTokens = positiveInteger(value(), name);
    else if (name === "--first-turn-tool-choice") result.firstTurnToolChoice = required(value(), name);
    else if (name === "--fixtures") result.fixtures = required(value(), name);
    else if (name === "--fixtures-count") result.fixturesCount = positiveInteger(value(), name);
    else if (name === "--mcp-url") result.mcpUrl = required(value(), name);
    else if (name === "--model") result.model = required(value(), name);
    else if (name === "--no-archive-max-output-tokens") result.archiveMaxOutputTokens = undefined;
    else if (name === "--no-evaluation-max-output-tokens") result.evaluationMaxOutputTokens = undefined;
    else if (name === "--output") result.output = required(value(), name);
    else if (name === "--scorer") result.scorer = scorer(value(), name);
    else if (name === "--tool-name") result.toolName = required(value(), name);
    else if (name === "--trials") result.trials = positiveInteger(value(), name);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  result.mcpUrl ||= deriveMcpUrl(result.apiUrl);
  return result;
}

function deriveMcpUrl(apiUrl) {
  const parsed = new URL(apiUrl);
  parsed.pathname = "/__ccr/context-archive/mcp";
  parsed.search = "";
  return parsed.toString();
}

function expandHome(value) {
  return value.startsWith("~/") ? path.join(process.env.HOME || "", value.slice(2)) : value;
}

function required(value, name) {
  if (!value?.trim()) throw new Error(`${name} requires a value`);
  return value.trim();
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer`);
  return number;
}

function scorer(value, name) {
  const normalized = required(value, name);
  if (!["lenient", "original", "exact"].includes(normalized)) {
    throw new Error(`${name} must be one of: lenient, original, exact`);
  }
  return normalized;
}

function csv(values) {
  return values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",");
}

function sanitizePathPart(value) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "model";
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}
