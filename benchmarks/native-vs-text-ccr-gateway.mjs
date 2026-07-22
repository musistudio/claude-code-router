#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawnSync } from "node:child_process";

const defaultFixturesPath = "/tmp/pi-openai-server-compaction.tbp5qj/benchmarks/native-vs-text/final-results/2026-07-17T01-51-59-774Z_gpt-5.6-sol/fixtures.json";
const systemInstructions =
  "You are the assistant responsible for one synthetic software project. Treat statements marked authoritative as binding, preserve exact identifiers and tool outputs, apply later corrections over superseded values, and maintain task state.";
const summaryInstructions =
  "Create a compact continuation memory for another model. Preserve every authoritative exact identifier, number, path, checksum, relationship, actual tool result, correction, completed/in-progress/blocked task, blocker, next action, and hard constraint. Explicitly distinguish final corrections from obsolete distractors. Do not answer questions or continue the project. Use concise structured text.";
const arms = ["full_context", "native_compaction", "text_summary"];

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
  benchmark: "native-vs-token-matched-text-compaction-via-ccr-gateway",
  apiUrl: options.apiUrl,
  categories: ["exact_recall", "relational_state", "tool_history", "distractor_resolution", "task_continuation"],
  createdAt: new Date().toISOString(),
  encryptedArtifactsStored: false,
  evaluator: "CCR /v1/responses, same model, strict JSON schema, exact string scoring",
  fixtureCount: fixtures.length,
  model: options.model,
  nativeProtocol: "CCR OpenAI Responses protocol with trailing compaction_trigger",
  questionsPerFixture: fixtures[0]?.questions.length ?? 0,
  sourceFixtures: options.fixtures,
  textBudgetRule: "max_output_tokens equals native compaction response usage.output_tokens for the paired trial",
  trials: options.trials
}, null, 2)}\n`);
await writeFile(path.join(runDir, "fixtures.json"), `${JSON.stringify(fixtures, null, 2)}\n`);
await writeFile(path.join(runDir, "trials.jsonl"), "");

console.log(`CCR gateway native-vs-text benchmark: ${runDir}`);
console.log(`model=${options.model}; fixtures=${fixtures.length}; trials=${options.trials}; api=${options.apiUrl}`);

const records = [];
for (const fixture of fixtures) {
  for (let trial = 1; trial <= options.trials; trial += 1) {
    console.log(`[${fixture.id}] trial ${trial}/${options.trials}: compact`);
    const record = await runTrial({ fixture, trial });
    records.push(record);
    await appendFile(path.join(runDir, "trials.jsonl"), `${JSON.stringify(record)}\n`);
    const scores = Object.fromEntries(arms.map((arm) => {
      const rows = record.evaluations[arm].scores;
      return [arm, `${rows.filter((row) => row.correct).length}/${rows.length}`];
    }));
    console.log(`  scores=${JSON.stringify(scores)} nativeBudget=${record.nativeBudgetTokens}`);
  }
}

const summary = summarize(records);
await writeFile(path.join(runDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeScoresCsv(runDir, records);
await writeGeneratedResults(runDir, summary);
console.log(`Summary native=${summary.byArm.native_compaction.correct}/${summary.byArm.native_compaction.total} text=${summary.byArm.text_summary.correct}/${summary.byArm.text_summary.total} full=${summary.byArm.full_context.correct}/${summary.byArm.full_context.total}`);
console.log(`Records: ${runDir}`);

async function runTrial({ fixture, trial }) {
  const native = await compactNative(fixture);
  const text = await summarizeText(fixture, native.budget);
  const contexts = {
    full_context: [...fixture.history, ...fixture.sharedTail],
    native_compaction: [native.contextItem, ...fixture.sharedTail],
    text_summary: [textSummaryContext(text.text), ...fixture.sharedTail]
  };
  const order = trial % 2 === 0
    ? ["text_summary", "native_compaction", "full_context"]
    : ["full_context", "native_compaction", "text_summary"];
  const evaluations = {};
  for (const arm of order) {
    console.log(`  evaluate ${arm}`);
    evaluations[arm] = await evaluateArm(fixture, contexts[arm]);
    await delay(options.delayMs);
  }
  return {
    evaluations,
    fixtureId: fixture.id,
    model: options.model,
    nativeBudgetTokens: native.budget,
    nativeCompaction: native.record,
    seed: fixture.seed,
    textSummary: text,
    trial
  };
}

async function compactNative(fixture) {
  const started = Date.now();
  const response = await requestResponse({
    accept: "text/event-stream",
    body: {
      model: options.model,
      instructions: systemInstructions,
      input: [...fixture.history, { type: "compaction_trigger" }],
      tools: fixture.tools,
      parallel_tool_calls: false,
      reasoning: { effort: "none", summary: null },
      text: { verbosity: "low" },
      store: false
    }
  });
  const compactionItem = [...(response.body.output ?? [])].reverse().find((item) => item.type === "compaction");
  const encryptedContent = compactionItem?.encrypted_content;
  if (!compactionItem || typeof encryptedContent !== "string") {
    throw new Error(`CCR gateway compaction returned no compaction item for ${fixture.id}: ${JSON.stringify(response.body).slice(0, 1000)}`);
  }
  const budget = Number(response.body.usage?.output_tokens ?? 0);
  if (!Number.isFinite(budget) || budget < 16) {
    throw new Error(`CCR gateway compaction reported unusable output budget ${budget} for ${fixture.id}.`);
  }
  return {
    budget,
    contextItem: compactionItem,
    record: {
      artifactBytes: Buffer.byteLength(encryptedContent, "utf8"),
      artifactSha256: createHash("sha256").update(encryptedContent).digest("hex"),
      latencyMs: Date.now() - started,
      usage: usageFromRaw(response.body.usage)
    }
  };
}

async function summarizeText(fixture, maxOutputTokens) {
  const started = Date.now();
  const response = await requestResponse({
    body: {
      model: options.model,
      instructions: "You are a context-compression system. Output only the continuation memory.",
      input: [{
        type: "message",
        role: "user",
        content: [{
          type: "input_text",
          text: `${summaryInstructions}\n\n<conversation>\n${serializeHistory(fixture.history)}\n</conversation>`
        }]
      }],
      reasoning: { effort: "none", summary: null },
      max_output_tokens: maxOutputTokens,
      store: false
    }
  });
  const text = outputText(response.body);
  return {
    characters: text.length,
    latencyMs: Date.now() - started,
    responseId: response.body.id,
    text,
    usage: usageFromRaw(response.body.usage)
  };
}

async function evaluateArm(fixture, context) {
  const response = await requestResponse({
    body: {
      model: options.model,
      instructions: systemInstructions,
      input: [...context, evaluationMessage(fixture.questions)],
      tools: fixture.tools,
      tool_choice: "none",
      parallel_tool_calls: false,
      reasoning: { effort: "low", summary: null },
      text: { format: answerSchema(fixture.questions) },
      max_output_tokens: options.evaluationMaxOutputTokens,
      store: false
    }
  });
  const text = outputText(response.body);
  const answers = parseAnswers(text);
  return {
    latencyMs: response.latencyMs,
    parsedAnswers: answers,
    rawText: text,
    responseId: response.body.id,
    scores: scoreAnswers(fixture.questions, answers),
    usage: usageFromRaw(response.body.usage)
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
        throw new Error(`CCR gateway ${response.status}: ${parsed.error?.message ?? text.slice(0, 1000)}`);
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

function serializeHistory(items) {
  const lines = [];
  for (const item of items) {
    if (item.type === "message") {
      const role = String(item.role ?? "unknown");
      const content = Array.isArray(item.content)
        ? item.content.map((part) => String(part?.text ?? "")).join("")
        : String(item.content ?? "");
      lines.push(`[${role.toUpperCase()}]: ${content}`);
    } else if (item.type === "function_call") {
      lines.push(`[ASSISTANT TOOL CALL]: ${String(item.name)}(${String(item.arguments)}) [call_id=${String(item.call_id)}]`);
    } else if (item.type === "function_call_output") {
      lines.push(`[TOOL RESULT call_id=${String(item.call_id)}]: ${String(item.output)}`);
    } else {
      lines.push(`[ITEM ${item.type}]: ${JSON.stringify(item)}`);
    }
  }
  return lines.join("\n\n");
}

function textSummaryContext(summary) {
  return {
    type: "message",
    role: "user",
    content: [{
      type: "input_text",
      text: `The conversation before the retained tail was compacted into this continuation memory:\n\n<summary>\n${summary}\n</summary>`
    }]
  };
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

function scoreAnswers(questions, answers) {
  return questions.map((question) => {
    const actual = normalizeAnswer(answers[question.id]);
    const expected = normalizeAnswer(question.expected);
    return {
      actual,
      category: question.category,
      correct: actual === expected,
      expected,
      questionId: question.id
    };
  });
}

function normalizeAnswer(value) {
  return typeof value === "string" ? value.trim().replace(/^['"]|['"]$/g, "") : String(value ?? "").trim();
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
  const categories = [...new Set(records.flatMap((record) => record.evaluations.full_context.scores.map((row) => row.category)))];
  const byArm = Object.fromEntries(arms.map((arm) => [
    arm,
    aggregate(records.flatMap((record) => record.evaluations[arm].scores))
  ]));
  const byCategory = Object.fromEntries(categories.map((category) => [
    category,
    Object.fromEntries(arms.map((arm) => [
      arm,
      aggregate(records.flatMap((record) => record.evaluations[arm].scores.filter((row) => row.category === category)))
    ]))
  ]));
  const perFixture = Object.fromEntries([...new Set(records.map((record) => record.fixtureId))].map((fixtureId) => [
    fixtureId,
    Object.fromEntries(arms.map((arm) => [
      arm,
      aggregate(records.filter((record) => record.fixtureId === fixtureId).flatMap((record) => record.evaluations[arm].scores))
    ]))
  ]));
  let nativeOnly = 0;
  let textOnly = 0;
  let bothCorrect = 0;
  let bothWrong = 0;
  const disagreements = [];
  for (const record of records) {
    const native = new Map(record.evaluations.native_compaction.scores.map((row) => [row.questionId, row]));
    for (const text of record.evaluations.text_summary.scores) {
      const nativeRow = native.get(text.questionId);
      if (!nativeRow) continue;
      if (nativeRow.correct && text.correct) bothCorrect += 1;
      else if (nativeRow.correct) {
        nativeOnly += 1;
        disagreements.push({ fixtureId: record.fixtureId, trial: record.trial, winner: "native", native: nativeRow, text });
      } else if (text.correct) {
        textOnly += 1;
        disagreements.push({ fixtureId: record.fixtureId, trial: record.trial, winner: "text", native: nativeRow, text });
      } else {
        bothWrong += 1;
      }
    }
  }
  return {
    byArm,
    byCategory,
    completedTrials: records.length,
    disagreements,
    pairedNativeVsText: { bothCorrect, bothWrong, nativeOnly, textOnly },
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
    total += Number(record.textSummary.usage?.[key] ?? 0);
    for (const arm of arms) {
      total += Number(record.evaluations[arm].usage?.[key] ?? 0);
    }
  }
  return total;
}

async function writeScoresCsv(runDir, records) {
  const rows = ["fixture,trial,arm,question_id,category,correct,expected,actual"];
  for (const record of records) {
    for (const arm of arms) {
      for (const score of record.evaluations[arm].scores) {
        rows.push(csv([record.fixtureId, record.trial, arm, score.questionId, score.category, score.correct, score.expected, score.actual]));
      }
    }
  }
  await writeFile(path.join(runDir, "scores.csv"), `${rows.join("\n")}\n`);
}

async function writeGeneratedResults(runDir, summary) {
  const report = [
    "# CCR Gateway Native vs Text Compaction Results",
    "",
    "| Arm | Correct | Accuracy |",
    "|---|---:|---:|",
    ...arms.map((arm) => `| ${arm} | ${summary.byArm[arm].correct}/${summary.byArm[arm].total} | ${formatPercent(summary.byArm[arm].accuracy)} |`),
    "",
    "## By Category",
    "",
    "| Category | Full context | Native compaction | Text summary |",
    "|---|---:|---:|---:|",
    ...Object.entries(summary.byCategory).map(([category, values]) =>
      `| ${category} | ${values.full_context.correct}/${values.full_context.total} | ${values.native_compaction.correct}/${values.native_compaction.total} | ${values.text_summary.correct}/${values.text_summary.total} |`
    ),
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
    attempts: 4,
    delayMs: 300,
    evaluationMaxOutputTokens: 4096,
    fixtures: defaultFixturesPath,
    fixturesCount: 6,
    model: "智谱 AI (国内) - Coding Plan/glm-5.2",
    output: "benchmarks/native-vs-text-ccr-gateway-results",
    trials: 2
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [name, inline] = arg.includes("=") ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const value = () => inline ?? argv[++index];
    if (name === "--api-key") result.apiKey = required(value(), name);
    else if (name === "--api-key-sqlite") result.apiKeySqlite = required(value(), name);
    else if (name === "--api-url") result.apiUrl = required(value(), name);
    else if (name === "--attempts") result.attempts = positiveInteger(value(), name);
    else if (name === "--delay-ms") result.delayMs = positiveInteger(value(), name);
    else if (name === "--evaluation-max-output-tokens") result.evaluationMaxOutputTokens = positiveInteger(value(), name);
    else if (name === "--fixtures") result.fixtures = required(value(), name);
    else if (name === "--fixtures-count") result.fixturesCount = positiveInteger(value(), name);
    else if (name === "--model") result.model = required(value(), name);
    else if (name === "--output") result.output = required(value(), name);
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

function csv(values) {
  return values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",");
}

function sanitizePathPart(value) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "model";
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}
