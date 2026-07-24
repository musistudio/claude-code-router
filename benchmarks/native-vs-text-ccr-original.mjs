#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const defaultFixturesPath = "/tmp/pi-openai-server-compaction.tbp5qj/benchmarks/native-vs-text/final-results/2026-07-17T01-51-59-774Z_gpt-5.6-sol/fixtures.json";

const options = parseArgs(process.argv.slice(2));
const fixtures = JSON.parse(await readFile(options.fixtures, "utf8"));
const selectedFixtures = fixtures.slice(0, options.fixturesCount);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.resolve(options.output, `${timestamp}_ccr-archive-replay_${options.model || "claude-default"}`);
await mkdir(runDir, { recursive: true });

const manifest = {
  benchmark: "native-vs-text-original-fixtures-ccr-archive-replay",
  sourceFixtures: options.fixtures,
  createdAt: new Date().toISOString(),
  evaluator: "Claude CLI archive replay; exact string scoring",
  fixtures: selectedFixtures.length,
  trials: options.trials,
  questionsPerFixture: selectedFixtures[0]?.questions?.length ?? 0,
  totalQuestions: selectedFixtures.reduce((sum, fixture) => sum + fixture.questions.length * options.trials, 0),
  model: options.model || "claude-default",
  claudeBin: options.claudeBin
};
await writeFile(path.join(runDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const records = [];
const scoresCsv = ["fixture,trial,question_id,category,correct,expected,actual"];

console.log(`CCR original-fixture benchmark: ${runDir}`);
console.log(`fixtures=${selectedFixtures.length} trials=${options.trials} questions=${manifest.totalQuestions}`);

for (const fixture of selectedFixtures) {
  for (let trial = 1; trial <= options.trials; trial += 1) {
    const run = await runClaude({
      claudeBin: options.claudeBin,
      input: archiveReplayPrompt(fixture),
      maxBudgetUsd: options.maxBudgetUsd,
      model: options.model,
      timeoutMs: options.timeoutMs
    });
    const answers = parseAnswers(run.output);
    const scores = scoreAnswers(fixture.questions, answers);
    const correct = scores.filter((score) => score.correct).length;
    const record = {
      fixtureId: fixture.id,
      trial,
      run,
      scores,
      correct,
      total: scores.length
    };
    records.push(record);
    for (const score of scores) {
      scoresCsv.push(csv([
        fixture.id,
        trial,
        score.questionId,
        score.category,
        score.correct,
        score.expected,
        score.actual
      ]));
    }
    await writeFile(path.join(runDir, "trials.jsonl"), `${records.map((item) => JSON.stringify(item)).join("\n")}\n`);
    await writeFile(path.join(runDir, "scores.csv"), `${scoresCsv.join("\n")}\n`);
    console.log(`[${fixture.id}] trial ${trial}/${options.trials}: ${correct}/${scores.length} cost=$${formatNumber(run.costUsd)} elapsed=${Math.round(run.elapsedMs / 1000)}s`);
  }
}

const summary = summarize(records);
await writeFile(path.join(runDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary.byArm.ccr_archive_replay, null, 2));
console.log(`Summary: ${summary.byArm.ccr_archive_replay.correct}/${summary.byArm.ccr_archive_replay.total} (${formatPercent(summary.byArm.ccr_archive_replay.accuracy)})`);
console.log(`Records: ${runDir}`);

function archiveReplayPrompt(fixture) {
  const questions = fixture.questions.map((question) => `${question.id}: ${question.question}`).join("\n");
  return [
    "You are the archived pre-compaction agent replay for a CCR context archive benchmark.",
    "Use only the immutable archived conversation and the retained shared tail below.",
    "Answer every benchmark question from the supplied conversation memory.",
    "Return only a valid JSON object in this exact shape: {\"answers\":{\"question-id\":\"exact canonical value\"}}.",
    "Each value must be the exact canonical value, with no explanation, labels, units, or extra punctuation.",
    "Apply later authoritative corrections over provisional or obsolete values.",
    "Use actual tool outputs for tool-history questions.",
    "",
    "ARCHIVED_CONVERSATION_BEGIN",
    serializeItems(fixture.history),
    "ARCHIVED_CONVERSATION_END",
    "",
    "RETAINED_SHARED_TAIL_BEGIN",
    serializeItems(fixture.sharedTail),
    "RETAINED_SHARED_TAIL_END",
    "",
    "QUESTIONS_BEGIN",
    questions,
    "QUESTIONS_END"
  ].join("\n");
}

function serializeItems(items) {
  const lines = [];
  for (const item of items) {
    if (item.type === "message") {
      const role = String(item.role ?? "unknown").toUpperCase();
      lines.push(`[${role}]: ${contentText(item.content)}`);
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

function contentText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (part && typeof part === "object") {
        return String(part.text ?? part.input_text ?? part.output_text ?? "");
      }
      return String(part ?? "");
    }).join("");
  }
  return String(value ?? "");
}

async function runClaude(input) {
  const started = performance.now();
  const args = ["-p", "--output-format", "json", "--tools", "", "--max-budget-usd", input.maxBudgetUsd, "--session-id", randomUUID()];
  if (input.model) args.push("--model", input.model);
  const child = spawn(input.claudeBin, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(input.input);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, input.timeoutMs);
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  clearTimeout(timeout);
  const elapsedMs = performance.now() - started;
  if (timedOut) {
    throw new Error(`claude timed out after ${input.timeoutMs}ms\n${stderr}\n${stdout}`);
  }
  const parsed = parseJsonObject(stdout);
  if (code !== 0 && !parsed) {
    throw new Error(`claude exited with code ${code}\n${stderr}\n${stdout}`);
  }
  const usage = parsed && typeof parsed.usage === "object" && parsed.usage ? parsed.usage : {};
  return {
    costUsd: Number(parsed?.total_cost_usd ?? 0),
    elapsedMs,
    inputTokens: Number(usage.input_tokens ?? 0) + Number(usage.cache_creation_input_tokens ?? 0) + Number(usage.cache_read_input_tokens ?? 0),
    isError: Boolean(parsed?.is_error),
    output: typeof parsed?.result === "string" ? parsed.result : stdout,
    outputTokens: Number(usage.output_tokens ?? 0),
    rawStdout: stdout,
    stderr
  };
}

function parseAnswers(output) {
  const parsed = parseJsonObject(output);
  const answers = parsed && typeof parsed.answers === "object" && !Array.isArray(parsed.answers) ? parsed.answers : {};
  return Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, normalizeAnswer(value)]));
}

function parseJsonObject(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    const candidate = fence?.[1] ?? trimmed;
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first < 0 || last <= first) return undefined;
    try {
      return JSON.parse(candidate.slice(first, last + 1));
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
      questionId: question.id,
      category: question.category,
      expected,
      actual,
      correct: actual === expected
    };
  });
}

function normalizeAnswer(value) {
  return typeof value === "string" ? value.trim().replace(/^['"]|['"]$/g, "") : String(value ?? "").trim();
}

function summarize(records) {
  const allScores = records.flatMap((record) => record.scores);
  const byCategory = {};
  for (const category of [...new Set(allScores.map((score) => score.category))]) {
    byCategory[category] = aggregate(allScores.filter((score) => score.category === category));
  }
  const byFixture = {};
  for (const fixtureId of [...new Set(records.map((record) => record.fixtureId))]) {
    byFixture[fixtureId] = aggregate(records.filter((record) => record.fixtureId === fixtureId).flatMap((record) => record.scores));
  }
  return {
    byArm: {
      ccr_archive_replay: aggregate(allScores)
    },
    byCategory,
    byFixture,
    costUsd: records.reduce((sum, record) => sum + record.run.costUsd, 0),
    completedTrials: records.length,
    totalInputTokens: records.reduce((sum, record) => sum + record.run.inputTokens, 0),
    totalOutputTokens: records.reduce((sum, record) => sum + record.run.outputTokens, 0)
  };
}

function aggregate(scores) {
  const correct = scores.filter((score) => score.correct).length;
  const total = scores.length;
  return { correct, total, accuracy: total ? correct / total : 0 };
}

function parseArgs(argv) {
  const options = {
    claudeBin: process.env.CLAUDE_BIN || "claude",
    fixtures: defaultFixturesPath,
    fixturesCount: 6,
    maxBudgetUsd: "3",
    model: undefined,
    output: "benchmarks/native-vs-text-ccr-results",
    timeoutMs: 10 * 60 * 1000,
    trials: 2
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [name, inline] = arg.includes("=") ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const value = () => inline ?? argv[++index];
    if (name === "--claude-bin") options.claudeBin = required(value(), name);
    else if (name === "--fixtures") options.fixtures = required(value(), name);
    else if (name === "--fixtures-count") options.fixturesCount = positiveInteger(value(), name);
    else if (name === "--max-budget-usd") options.maxBudgetUsd = required(value(), name);
    else if (name === "--model") options.model = required(value(), name);
    else if (name === "--output") options.output = required(value(), name);
    else if (name === "--timeout-ms") options.timeoutMs = positiveInteger(value(), name);
    else if (name === "--trials") options.trials = positiveInteger(value(), name);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function required(value, name) {
  if (!value || !String(value).trim()) throw new Error(`${name} requires a value`);
  return String(value).trim();
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer`);
  return number;
}

function csv(values) {
  return values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",");
}

function formatNumber(value) {
  return value.toFixed(value >= 10 ? 2 : 4);
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}
