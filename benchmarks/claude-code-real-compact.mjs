import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { defaultTaskCaseId, findTaskCase, taskCaseIds } from "./context-archive-task-cases.mjs";

const defaultTargetInputTokens = 180000;
const defaultMinInputTokens = 170000;
const defaultMaxInputTokens = 190000;
const defaultMaxBudgetUsd = "5";

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.listTaskCases) {
    console.log(taskCaseIds().join("\n"));
    return;
  }
  const taskCase = findTaskCase(options.taskCase);
  const sessionId = options.sessionId || randomUUID();
  const steps = [];

  let lineCursor = 0;
  let currentInputTokens = 0;
  let loadLineCount = options.lineCount ?? estimateLineCount(options.targetInputTokens);
  let loadPrompt = buildContextPrompt({
    lineCount: loadLineCount,
    lineOffset: lineCursor,
    taskCase,
    title: "initial",
    totalPlannedLines: loadLineCount
  });
  lineCursor += loadLineCount;

  const load = await runClaude({
    input: loadPrompt,
    label: "load-context",
    options,
    sessionId
  });
  steps.push(load);
  currentInputTokens = totalInputTokens(load.result);

  for (let attempt = 0; attempt < options.maxAppendAttempts && currentInputTokens < options.minInputTokens; attempt += 1) {
    const observedContextTokens = Math.max(1, currentInputTokens - basePromptOverhead(load.result));
    const tokensPerLine = Math.max(4, observedContextTokens / Math.max(1, lineCursor));
    const missingTokens = options.targetInputTokens - currentInputTokens;
    const appendLineCount = Math.max(200, Math.ceil((missingTokens / tokensPerLine) * 1.05));
    const appendPrompt = buildContextPrompt({
      lineCount: appendLineCount,
      lineOffset: lineCursor,
      taskCase,
      title: `append-${attempt + 1}`,
      totalPlannedLines: lineCursor + appendLineCount
    });
    lineCursor += appendLineCount;

    const append = await runClaude({
      input: appendPrompt,
      label: `append-context-${attempt + 1}`,
      options,
      resume: sessionId
    });
    steps.push(append);
    currentInputTokens = totalInputTokens(append.result);
  }

  const anchor = await runClaude({
    input: [
      "Read this benchmark anchor and current task state for the current conversation only. Do not write memory, do not use tools, and do not persist anything outside this chat.",
      "This packet is the latest task progress immediately before /compact.",
      `The loaded synthetic context contains ${lineCursor} generated lines.`,
      "CURRENT_TASK_STATE_PACKET_BEGIN",
      `objective=${factMarker(taskCase, "objective")}`,
      `completed=${factMarker(taskCase, "completed")}`,
      `current_focus=${factMarker(taskCase, "currentFocus")}`,
      `next_step=${factMarker(taskCase, "nextStep")}`,
      `validation_command=${factMarker(taskCase, "validationCommand")}`,
      `risk=${factMarker(taskCase, "risk")}`,
      "CURRENT_TASK_STATE_PACKET_END",
      "Reply exactly ACK_READY_TO_COMPACT."
    ].join("\n"),
    label: "anchor-turn",
    options,
    resume: sessionId
  });
  steps.push(anchor);
  currentInputTokens = totalInputTokens(anchor.result);

  const compact = await runClaude({
    input: "/compact",
    label: "slash-compact",
    options,
    resume: sessionId
  });
  steps.push(compact);

  const continuity = await runClaude({
    input: continuityProbePrompt(taskCase),
    label: "continuity-probe",
    options,
    resume: sessionId
  });
  steps.push(continuity);
  const continuityEval = evaluateContinuity(taskCase, continuity.result);

  const report = {
    compact: summarizeResult(compact.result),
    constructedContext: {
      inputTokensBeforeCompact: currentInputTokens,
      lineCount: lineCursor,
      maxInputTokens: options.maxInputTokens,
      minInputTokens: options.minInputTokens,
      nearTarget: currentInputTokens >= options.minInputTokens && currentInputTokens <= options.maxInputTokens,
      targetInputTokens: options.targetInputTokens
    },
    continuity: continuityEval,
    options: publicOptions(options),
    sessionId,
    taskCase: {
      id: taskCase.id,
      title: taskCase.title
    },
    steps: steps.map((step) => ({
      elapsedMs: Math.round(step.elapsedMs),
      label: step.label,
      stderr: step.stderr.trim(),
      summary: summarizeResult(step.result)
    }))
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  if (
    compact.result.duration_api_ms === 0 ||
    /not enough messages to compact/i.test(String(compact.result.result ?? "")) ||
    continuityEval.recall < options.minContinuityRecall
  ) {
    process.exitCode = 2;
  }
}

function buildContextPrompt(input) {
  const lines = [
    `You are loading synthetic benchmark context block ${input.title}.`,
    `Task case: ${input.taskCase.id} - ${input.taskCase.title}.`,
    "Do not summarize the block. Do not call tools. Reply exactly ACK_CONTEXT_BLOCK_LOADED.",
    "The following lines are synthetic and intentionally verbose to fill the Claude Code context window.",
    input.lineOffset === 0 ? "EARLY_DESIGN_DECISION_BEGIN" : undefined,
    input.lineOffset === 0 ? `early_decision=${factMarker(input.taskCase, "earlyDecision")}` : undefined,
    input.lineOffset === 0 ? "EARLY_DESIGN_DECISION_END" : undefined,
    "BEGIN_SYNTHETIC_CONTEXT"
  ].filter(Boolean);
  for (let index = 0; index < input.lineCount; index += 1) {
    const id = input.lineOffset + index + 1;
    const padded = String(id).padStart(6, "0");
    lines.push([
      `段落${padded}`,
      `ctx_marker_${padded}`,
      input.taskCase.filler[index % input.taskCase.filler.length],
      `事实编号${padded}要求压缩摘要能够通过历史检索恢复精确细节。`,
      `unique_alpha_${padded}_unique_beta_${padded}_unique_gamma_${padded}.`
    ].join(" "));
    if (id === Math.floor(input.totalPlannedLines / 2)) {
      lines.push("MID_SESSION_PROGRESS_BEGIN");
      lines.push(`mid_progress=${factMarker(input.taskCase, "midProgress")}`);
      lines.push("MID_SESSION_PROGRESS_END");
    }
  }
  lines.push("END_SYNTHETIC_CONTEXT");
  return lines.join("\n");
}

function continuityProbePrompt(taskCase) {
  return [
    "This is a post-/compact continuity probe.",
    "Do not use tools. Use only the compressed conversation state.",
    "Return the exact marker values you remember. If a value is absent, write UNKNOWN.",
    "Use this exact line format, one key per line:",
    ...taskCase.facts.map((fact) => `${fact.key}=<${fact.prompt}>`)
  ].join("\n");
}

function evaluateContinuity(taskCase, result) {
  const text = String(result.result ?? "");
  const items = taskCase.facts.map((fact) => ({
    key: fact.key,
    marker: fact.marker,
    found: text.includes(fact.marker)
  }));
  const found = items.filter((item) => item.found).length;
  return {
    found,
    items,
    outputPreview: text.slice(0, 1200),
    recall: items.length > 0 ? found / items.length : 0,
    total: items.length
  };
}

function factMarker(taskCase, key) {
  const fact = taskCase.facts.find((item) => item.key === key);
  if (!fact) {
    throw new Error(`Unknown continuity fact in ${taskCase.id}: ${key}`);
  }
  return fact.marker;
}

async function runClaude(input) {
  const started = performance.now();
  const args = [
    "-p",
    "--output-format",
    "json",
    "--tools",
    "",
    "--max-budget-usd",
    input.options.maxBudgetUsd
  ];
  if (input.options.model) {
    args.push("--model", input.options.model);
  }
  if (input.options.debugFile) {
    args.push("--debug-file", input.options.debugFile);
  }
  if (input.resume) {
    args.push("--resume", input.resume);
  } else {
    args.push("--session-id", input.sessionId);
  }

  const child = spawn(input.options.claudeBin, args, {
    cwd: input.options.cwd,
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

  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  const elapsedMs = performance.now() - started;
  const result = parseClaudeJson(stdout);
  if (code !== 0 && !result) {
    throw new Error([
      `claude exited with code ${code} during ${input.label}.`,
      stderr.trim(),
      stdout.trim()
    ].filter(Boolean).join("\n"));
  }
  return {
    elapsedMs,
    label: input.label,
    result: result ?? {
      is_error: true,
      raw_stdout: stdout,
      session_id: input.resume || input.sessionId,
      terminal_reason: `exit_${code}`
    },
    stderr
  };
}

function parseClaudeJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    return undefined;
  }
}

function summarizeResult(result) {
  const modelUsage = aggregateModelUsage(result.modelUsage);
  return {
    apiMs: result.duration_api_ms ?? 0,
    cacheCreationInputTokens: result.usage?.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: result.usage?.cache_read_input_tokens ?? 0,
    costUsd: result.total_cost_usd ?? 0,
    inputTokens: result.usage?.input_tokens ?? 0,
    isError: Boolean(result.is_error),
    modelInputTokens: modelUsage.inputTokens,
    modelOutputTokens: modelUsage.outputTokens,
    modelUsage: result.modelUsage ?? {},
    outputPreview: typeof result.result === "string" ? result.result.slice(0, 300) : undefined,
    outputTokens: result.usage?.output_tokens ?? 0,
    sessionId: result.session_id,
    stopReason: result.stop_reason ?? null,
    terminalReason: result.terminal_reason ?? null,
    totalInputTokens: totalInputTokens(result),
    totalOutputTokens: totalOutputTokens(result)
  };
}

function totalInputTokens(result) {
  const topLevel = Number(result.usage?.input_tokens ?? 0) +
    Number(result.usage?.cache_creation_input_tokens ?? 0) +
    Number(result.usage?.cache_read_input_tokens ?? 0);
  return topLevel > 0 ? topLevel : aggregateModelUsage(result.modelUsage).inputTokens;
}

function totalOutputTokens(result) {
  const topLevel = Number(result.usage?.output_tokens ?? 0);
  return topLevel > 0 ? topLevel : aggregateModelUsage(result.modelUsage).outputTokens;
}

function aggregateModelUsage(modelUsage) {
  const totals = {
    contextWindow: 0,
    inputTokens: 0,
    outputTokens: 0
  };
  if (!modelUsage || typeof modelUsage !== "object") {
    return totals;
  }
  for (const value of Object.values(modelUsage)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    totals.contextWindow = Math.max(totals.contextWindow, Number(value.contextWindow ?? 0));
    totals.inputTokens += Number(value.inputTokens ?? 0) +
      Number(value.cacheCreationInputTokens ?? 0) +
      Number(value.cacheReadInputTokens ?? 0);
    totals.outputTokens += Number(value.outputTokens ?? 0);
  }
  return totals;
}

function basePromptOverhead(result) {
  return Math.min(3000, Math.max(0, totalInputTokens(result) - Number(result.usage?.output_tokens ?? 0)));
}

function estimateLineCount(targetInputTokens) {
  return Math.max(500, Math.round(targetInputTokens / 65));
}

function printReport(report) {
  console.log(`Claude Code real /compact benchmark session: ${report.sessionId}`);
  console.log(`task case: ${report.taskCase.id} - ${report.taskCase.title}`);
  console.log(`constructed input tokens before /compact: ${report.constructedContext.inputTokensBeforeCompact}`);
  console.log(`target range: ${report.constructedContext.minInputTokens}-${report.constructedContext.maxInputTokens}`);
  console.log(`near target: ${report.constructedContext.nearTarget ? "yes" : "no"}`);
  console.log(`continuity recall: ${report.continuity.found}/${report.continuity.total} (${(report.continuity.recall * 100).toFixed(0)}%)`);
  console.log("");
  for (const step of report.steps) {
    console.log([
      step.label.padEnd(18),
      `input=${step.summary.totalInputTokens}`,
      `output=${step.summary.totalOutputTokens}`,
      `apiMs=${step.summary.apiMs}`,
      `cost=$${Number(step.summary.costUsd).toFixed(4)}`,
      `error=${step.summary.isError ? "yes" : "no"}`,
      step.summary.outputPreview ? `result=${JSON.stringify(step.summary.outputPreview)}` : undefined
    ].filter(Boolean).join("  "));
  }
  console.log("");
  console.log("continuity facts:");
  for (const item of report.continuity.items) {
    console.log(`${item.found ? "PASS" : "MISS"}  ${item.key}=${item.marker}`);
  }
}

function publicOptions(options) {
  return {
    claudeBin: options.claudeBin,
    cwd: options.cwd,
    debugFile: options.debugFile,
    json: options.json,
    lineCount: options.lineCount,
    listTaskCases: options.listTaskCases,
    maxAppendAttempts: options.maxAppendAttempts,
    maxBudgetUsd: options.maxBudgetUsd,
    maxInputTokens: options.maxInputTokens,
    minContinuityRecall: options.minContinuityRecall,
    minInputTokens: options.minInputTokens,
    model: options.model,
    taskCase: options.taskCase,
    targetInputTokens: options.targetInputTokens
  };
}

function parseArgs(argv) {
  const options = {
    claudeBin: process.env.CLAUDE_BIN || "claude",
    cwd: process.cwd(),
    debugFile: undefined,
    json: false,
    lineCount: undefined,
    listTaskCases: false,
    maxAppendAttempts: 2,
    maxBudgetUsd: defaultMaxBudgetUsd,
    maxInputTokens: defaultMaxInputTokens,
    minContinuityRecall: 0,
    minInputTokens: defaultMinInputTokens,
    model: undefined,
    sessionId: undefined,
    taskCase: defaultTaskCaseId,
    targetInputTokens: defaultTargetInputTokens
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [name, inlineValue] = arg.includes("=") ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const readValue = () => inlineValue ?? argv[++index];
    if (name === "--claude-bin") {
      options.claudeBin = requireValue(readValue(), name);
    } else if (name === "--cwd") {
      options.cwd = requireValue(readValue(), name);
    } else if (name === "--debug-file") {
      options.debugFile = requireValue(readValue(), name);
    } else if (name === "--json") {
      options.json = true;
    } else if (name === "--list-task-cases") {
      options.listTaskCases = true;
    } else if (name === "--line-count") {
      options.lineCount = readPositiveInteger(readValue(), name);
    } else if (name === "--max-append-attempts") {
      options.maxAppendAttempts = readPositiveInteger(readValue(), name);
    } else if (name === "--max-budget-usd") {
      options.maxBudgetUsd = requireValue(readValue(), name);
    } else if (name === "--max-input-tokens") {
      options.maxInputTokens = readPositiveInteger(readValue(), name);
    } else if (name === "--min-continuity-recall") {
      options.minContinuityRecall = readUnitNumber(readValue(), name);
    } else if (name === "--min-input-tokens") {
      options.minInputTokens = readPositiveInteger(readValue(), name);
    } else if (name === "--model") {
      options.model = requireValue(readValue(), name);
    } else if (name === "--session-id") {
      options.sessionId = requireValue(readValue(), name);
    } else if (name === "--task-case") {
      options.taskCase = requireValue(readValue(), name);
    } else if (name.startsWith("--task-case=")) {
      options.taskCase = requireValue(name.slice("--task-case=".length), "--task-case");
    } else if (name === "--target-input-tokens") {
      options.targetInputTokens = readPositiveInteger(readValue(), name);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function readUnitNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`${name} must be a number from 0 to 1.`);
  }
  return number;
}

function requireValue(value, name) {
  if (!value) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function readPositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
