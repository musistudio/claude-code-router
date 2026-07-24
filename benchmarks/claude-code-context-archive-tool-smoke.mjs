import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const defaultLineCount = 2600;

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const sessionId = options.sessionId || randomUUID();
  const targetMarker = `vk_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const targetKey = `value_kappa_on_synthetic_line_${String(options.targetLine).padStart(5, "0")}`;
  const debugFile = options.debugFile;

  const steps = [];
  steps.push(await runClaude({
    input: buildLoadPrompt({ lineCount: options.lineCount, targetLine: options.targetLine, targetMarker }),
    label: "load-hidden-context",
    options,
    sessionId
  }));
  steps.push(await runClaude({
    input: [
      "Current task update before compaction:",
      "The synthetic context block has been loaded. Do not summarize it now.",
      "Reply exactly ACK_READY_FOR_COMPACT."
    ].join("\n"),
    label: "anchor-before-compact",
    options,
    resume: sessionId
  }));
  steps.push(await runClaude({
    input: "/compact",
    label: "slash-compact",
    options,
    resume: sessionId
  }));
  steps.push(await runClaude({
    input: [
      "Post-compact retrieval probe.",
      `Return the exact value_kappa field from synthetic_line_${String(options.targetLine).padStart(5, "0")} in the earlier synthetic context.`,
      "If the compacted context does not contain the exact value, use the available archived-history/context-recall tool from the compact handoff.",
      "Do not use shell, filesystem, web, or project tools for this probe.",
      "Reply in exactly this format:",
      `${targetKey}=<exact value>`
    ].join("\n"),
    label: "post-compact-recall",
    options,
    resume: sessionId
  }));

  const recallText = String(steps.at(-1)?.result?.result ?? "");
  const report = {
    debugFile,
    expected: {
      key: targetKey,
      marker: targetMarker
    },
    found: recallText.includes(targetMarker),
    sessionId,
    steps: steps.map((step) => ({
      elapsedMs: Math.round(step.elapsedMs),
      label: step.label,
      result: summarizeClaudeResult(step.result),
      stderr: step.stderr.trim().slice(0, 2000)
    }))
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.found) {
    process.exitCode = 2;
  }
}

function buildLoadPrompt(input) {
  const lines = [
    "You are loading synthetic benchmark context for a CCR Claude Code CLI /compact smoke test.",
    "Do not summarize the block. Do not call tools. Reply exactly ACK_CONTEXT_BLOCK_LOADED.",
    "The following lines are ordinary synthetic filler.",
    "BEGIN_SYNTHETIC_CONTEXT"
  ];
  for (let index = 1; index <= input.lineCount; index += 1) {
    const padded = String(index).padStart(5, "0");
    lines.push([
      `synthetic_line_${padded}`,
      `ctx_noise_alpha_${padded}`,
      "This line is intentionally verbose filler for compaction behavior.",
      `noise_checksum_${padded}_${(index * 7919).toString(36)}`,
      `value_kappa=${index === input.targetLine ? input.targetMarker : ordinaryKappaValue(index)}`
    ].join(" "));
  }
  lines.push("END_SYNTHETIC_CONTEXT");
  return lines.join("\n");
}

function ordinaryKappaValue(index) {
  const left = (index * 3571).toString(16).padStart(8, "0").slice(-8);
  const right = (index * 7919).toString(16).padStart(8, "0").slice(-8);
  const tail = (index * 104729).toString(16).padStart(8, "0").slice(-8);
  return `vk_${left}${right}${tail}`;
}

async function runClaude(input) {
  const started = performance.now();
  const args = [
    "-p",
    "--output-format",
    "json",
    "--setting-sources",
    input.options.settingSources,
    "--max-budget-usd",
    input.options.maxBudgetUsd
  ];
  if (input.options.debugFile) {
    args.push("--debug-file", input.options.debugFile);
  }
  if (input.options.model) {
    args.push("--model", input.options.model);
  }
  if (input.resume) {
    args.push("--resume", input.resume);
  } else {
    args.push("--session-id", input.sessionId);
  }

  const child = spawn(input.options.claudeBin, args, {
    cwd: input.options.cwd,
    env: claudeChildEnv(input.options),
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
  const result = parseClaudeJson(stdout) ?? {
    is_error: true,
    raw_stdout: stdout.slice(0, 4000),
    terminal_reason: `exit_${code}`
  };
  if (code !== 0 && !result.raw_stdout) {
    throw new Error([
      `claude exited with code ${code} during ${input.label}.`,
      stderr.trim(),
      stdout.trim()
    ].filter(Boolean).join("\n"));
  }
  return { elapsedMs, label: input.label, result, stderr };
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
    return firstBrace >= 0 && lastBrace > firstBrace
      ? JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
      : undefined;
  }
}

function summarizeClaudeResult(result) {
  return {
    apiMs: result.duration_api_ms ?? 0,
    costUsd: result.total_cost_usd ?? 0,
    inputTokens: Number(result.usage?.input_tokens ?? 0) +
      Number(result.usage?.cache_creation_input_tokens ?? 0) +
      Number(result.usage?.cache_read_input_tokens ?? 0),
    isError: Boolean(result.is_error),
    outputPreview: typeof result.result === "string" ? result.result.slice(0, 1000) : undefined,
    outputTokens: Number(result.usage?.output_tokens ?? 0),
    sessionId: result.session_id,
    stopReason: result.stop_reason ?? null,
    terminalReason: result.terminal_reason ?? null
  };
}

function parseArgs(argv) {
  const options = {
    claudeBin: process.env.CLAUDE_BIN || "claude",
    cwd: process.cwd(),
    debugFile: undefined,
    lineCount: defaultLineCount,
    maxBudgetUsd: "2",
    model: undefined,
    sessionId: undefined,
    settingSources: "project,local",
    targetLine: 777,
    useClaudeSettingsEnv: true
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
    } else if (name === "--line-count") {
      options.lineCount = readPositiveInteger(readValue(), name);
    } else if (name === "--max-budget-usd") {
      options.maxBudgetUsd = requireValue(readValue(), name);
    } else if (name === "--model") {
      options.model = requireValue(readValue(), name);
    } else if (name === "--session-id") {
      options.sessionId = requireValue(readValue(), name);
    } else if (name === "--setting-sources") {
      options.settingSources = requireValue(readValue(), name);
    } else if (name === "--target-line") {
      options.targetLine = readPositiveInteger(readValue(), name);
    } else if (name === "--no-claude-settings-env") {
      options.useClaudeSettingsEnv = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function claudeChildEnv(options) {
  if (!options.useClaudeSettingsEnv) {
    return process.env;
  }
  const settings = readClaudeSettings();
  const env = {
    ...process.env,
    ...(isRecord(settings.env) ? settings.env : {})
  };
  const helperKey = readApiKeyFromHelper(settings.apiKeyHelper);
  if (helperKey) {
    env.ANTHROPIC_API_KEY = helperKey;
  }
  return env;
}

function readClaudeSettings() {
  try {
    const parsed = JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readApiKeyFromHelper(value) {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  try {
    const text = readFileSync(value, "utf8");
    return (/printf\s+'%s\\n'\s+'([^']+)'/.exec(text) ?? [])[1];
  } catch {
    return undefined;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
