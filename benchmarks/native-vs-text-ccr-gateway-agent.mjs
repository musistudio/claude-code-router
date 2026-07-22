#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const defaultFixturesPath = "/tmp/pi-openai-server-compaction.tbp5qj/benchmarks/native-vs-text/final-results/2026-07-17T01-51-59-774Z_gpt-5.6-sol/fixtures.json";
const systemInstructions =
  "You are the assistant responsible for one synthetic software project. Treat statements marked authoritative as binding, preserve exact identifiers and tool outputs, apply later corrections over superseded values, and maintain task state.";
const arm = "ccr_gateway_agent";

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
  benchmark: "native-vs-text-original-fixtures-via-ccr-gateway-agent",
  apiUrl: options.apiUrl,
  archiveMaxOutputTokens: options.archiveMaxOutputTokens ?? null,
  categories: ["exact_recall", "relational_state", "tool_history", "distractor_resolution", "task_continuation"],
  compressedArm: "[ccr compaction item, retained tail, original questions]; original fixture tools are present; CCR injects and executes history retrieval in gateway",
  createdAt: new Date().toISOString(),
  evaluator: "Original fixture questions; runner does not expose or call ccr_history_ask; gateway injects/parses/executes it; primary scorer accepts flat or wrapped JSON and expected-value containment",
  evaluationMaxOutputTokens: options.evaluationMaxOutputTokens ?? null,
  fixtureCount: fixtures.length,
  model: options.model,
  questionsPerFixture: fixtures[0]?.questions.length ?? 0,
  scorer: options.scorer,
  sourceFixtures: options.fixtures,
  toolChoice: options.toolChoice ?? null,
  trials: options.trials
}, null, 2)}\n`);
await writeFile(path.join(runDir, "fixtures.json"), `${JSON.stringify(fixtures, null, 2)}\n`);
await writeFile(path.join(runDir, "trials.jsonl"), "");

console.log(`CCR gateway-agent benchmark: ${runDir}`);
console.log(`model=${options.model}; fixtures=${fixtures.length}; trials=${options.trials}; api=${options.apiUrl}`);

const records = [];
for (const fixture of fixtures) {
  for (let trial = 1; trial <= options.trials; trial += 1) {
    console.log(`[${fixture.id}] trial ${trial}/${options.trials}: compact`);
    const record = await runTrial({ fixture, trial });
    records.push(record);
    await appendFile(path.join(runDir, "trials.jsonl"), `${JSON.stringify(record)}\n`);
    const scores = record.evaluations[arm].scores;
    const strictScores = record.evaluations[arm].diagnosticStrictOriginalScores ?? [];
    console.log(`  score=${scores.filter((row) => row.correct).length}/${scores.length} strictOriginal=${strictScores.filter((row) => row.correct).length}/${strictScores.length} gatewayToolCalls=${record.gatewayHistoryToolCalls}`);
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
  console.log("  evaluate ordinary compressed continuation through gateway");
  const evaluation = await evaluateGatewayAgent(fixture, compact.contextItem);
  await delay(options.delayMs);
  return {
    archive: compact.archive,
    evaluations: { [arm]: evaluation.result },
    fixtureId: fixture.id,
    gatewayHistoryToolCalls: evaluation.gatewayHistoryToolCalls,
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
  return {
    archive: parseArchiveFooter(encryptedContent),
    contextItem: compactionItem,
    record: {
      artifactBytes: Buffer.byteLength(encryptedContent, "utf8"),
      artifactSha256: createHash("sha256").update(encryptedContent).digest("hex"),
      latencyMs: Date.now() - started,
      usage: usageFromRaw(response.body.usage)
    }
  };
}

async function evaluateGatewayAgent(fixture, contextItem) {
  const body = {
    model: options.model,
    instructions: systemInstructions,
    input: [
      contextItem,
      ...fixture.sharedTail,
      evaluationMessage(fixture.questions)
    ],
    tools: fixture.tools,
    parallel_tool_calls: false,
    reasoning: { effort: "low", summary: null },
    text: { format: answerSchema(fixture.questions) },
    store: false
  };
  if (options.toolChoice !== undefined) {
    body.tool_choice = options.toolChoice;
  }
  if (options.evaluationMaxOutputTokens !== undefined) {
    body.max_output_tokens = options.evaluationMaxOutputTokens;
  }
  const response = await requestResponse({ body });
  const text = outputText(response.body);
  const strictAnswers = parseAnswers(text);
  const lenientAnswers = parseFlatOrWrappedAnswers(text);
  const answers = options.scorer === "original" ? strictAnswers : lenientAnswers;
  return {
    gatewayHistoryToolCalls: Number(response.headers["x-ccr-context-archive-tool-calls"] ?? 0),
    result: {
      diagnosticStrictOriginalScores: scoreAnswers(fixture.questions, strictAnswers, "exact"),
      latencyMs: response.latencyMs,
      parsedAnswers: answers,
      rawText: text,
      responseId: response.body.id,
      scores: scoreAnswers(fixture.questions, answers, options.scorer),
      usage: usageFromRaw(response.body.usage)
    }
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
      return {
        body: parsed,
        headers: Object.fromEntries(response.headers.entries()),
        latencyMs: Date.now() - started
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt + 1 < attempts) {
        await delay(1000 * 2 ** attempt);
      }
    }
  }
  throw lastError ?? new Error("CCR gateway request failed");
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
    gatewayHistoryToolCalls: records.reduce((total, record) => total + record.gatewayHistoryToolCalls, 0),
    perFixture,
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
    "# CCR Gateway-Agent Compaction Results",
    "",
    "| Arm | Correct | Accuracy |",
    "|---|---:|---:|",
    `| ${arm} | ${summary.byArm[arm].correct}/${summary.byArm[arm].total} | ${formatPercent(summary.byArm[arm].accuracy)} |`,
    `| diagnostic_strict_original | ${summary.diagnosticStrictOriginal.correct}/${summary.diagnosticStrictOriginal.total} | ${formatPercent(summary.diagnosticStrictOriginal.accuracy)} |`,
    "",
    "## By Category",
    "",
    "| Category | CCR gateway agent |",
    "|---|---:|",
    ...Object.entries(summary.byCategory).map(([category, values]) =>
      `| ${category} | ${values[arm].correct}/${values[arm].total} |`
    ),
    "",
    "## Gateway Tool Calls",
    "",
    `Total gateway-executed history calls: ${summary.gatewayHistoryToolCalls}`,
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
    fixtures: defaultFixturesPath,
    fixturesCount: 6,
    model: "DeepSeek/deepseek-v4-flash",
    output: "benchmarks/native-vs-text-ccr-gateway-agent-results",
    scorer: "lenient",
    toolChoice: undefined,
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
    else if (name === "--fixtures") result.fixtures = required(value(), name);
    else if (name === "--fixtures-count") result.fixturesCount = positiveInteger(value(), name);
    else if (name === "--model") result.model = required(value(), name);
    else if (name === "--no-archive-max-output-tokens") result.archiveMaxOutputTokens = undefined;
    else if (name === "--no-evaluation-max-output-tokens") result.evaluationMaxOutputTokens = undefined;
    else if (name === "--output") result.output = required(value(), name);
    else if (name === "--scorer") result.scorer = scorer(value(), name);
    else if (name === "--tool-choice") result.toolChoice = required(value(), name);
    else if (name === "--trials") result.trials = positiveInteger(value(), name);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
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
