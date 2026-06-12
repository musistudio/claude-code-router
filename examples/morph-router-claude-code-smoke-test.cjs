#!/usr/bin/env node
/**
 * Claude Code acceptance smoke test for examples/morph-router.cjs.
 *
 * This is stricter than morph-router-smoke-test.cjs:
 * - it uses the branch-built CCR CLI at ./dist/cli.js
 * - it runs the real `claude` CLI with ANTHROPIC_BASE_URL pointed at CCR
 * - it proves Claude Code's request was routed to the provider model selected
 *   by the Morph custom router
 *
 * Run `pnpm build` first so ./dist/cli.js exists.
 */

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const routerSource = path.join(__dirname, "morph-router.cjs");
const localCcrCli = path.join(repoRoot, "dist", "cli.js");

main().catch((error) => {
  console.error(`\nFAIL ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  if (!fs.existsSync(localCcrCli)) {
    throw new Error("dist/cli.js is missing. Run `pnpm build` before this smoke test.");
  }

  await assertCommandExists("claude", ["--version"]);

  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "ccr-claude-code-morph-"));
  const ccrHome = path.join(tempHome, ".claude-code-router");
  fs.mkdirSync(ccrHome, { recursive: true });
  fs.mkdirSync(path.join(tempHome, ".claude"), { recursive: true });

  const routerTarget = path.join(ccrHome, "morph-router.cjs");
  fs.copyFileSync(routerSource, routerTarget);

  const morphCalls = [];
  const providerCalls = [];
  const cleanup = [];

  try {
    const morphServer = await startJsonServer(async ({ req, body }) => {
      if (req.method !== "POST" || req.url !== "/v1/router/multimodel") {
        return { status: 404, body: { error: "not found" } };
      }

      morphCalls.push({
        input: body.input,
        authorization: req.headers.authorization,
      });

      return {
        body: {
          model: "chosen-model",
          provider: "openai",
          difficulty: "medium",
          confidence: 0.97,
          ambiguity: "low",
          ambiguity_confidence: 0.88,
          domain: "coding",
          domain_confidence: 0.92,
        },
      };
    });
    cleanup.push(() => morphServer.close());

    const providerServer = await startJsonServer(async ({ req, body }) => {
      providerCalls.push({
        path: req.url,
        model: body.model,
        messages: body.messages,
        authorization: req.headers.authorization,
      });

      return {
        body: {
          id: "chatcmpl-claude-code-morph-router-proof",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: `ROUTE_PROOF_OK provider_model=${body.model}`,
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 8,
            completion_tokens: 5,
            total_tokens: 13,
          },
        },
      };
    });
    cleanup.push(() => providerServer.close());

    const ccrPort = await getFreePort();
    writeConfig({
      path: path.join(ccrHome, "config.json"),
      port: ccrPort,
      routerPath: routerTarget,
      morphEndpoint: `${morphServer.url}/v1/router/multimodel`,
      providerEndpoint: `${providerServer.url}/v1/chat/completions`,
    });

    console.log("CCR Morph Model Router Claude Code acceptance test");
    console.log(`repo: ${repoRoot}`);
    console.log(`temp HOME: ${tempHome}`);
    console.log("");

    console.log("$ HOME=<temp> node dist/cli.js start");
    const ccrProcess = spawn(process.execPath, [localCcrCli, "start"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: tempHome,
        MORPH_API_KEY: "test-morph-key",
        OPENAI_API_KEY: "test-openai-key",
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    cleanup.push(() => stopProcess(ccrProcess));

    const ccrOutput = collectOutput(ccrProcess);
    await waitForHttp(`http://127.0.0.1:${ccrPort}/health`, 15000);
    console.log(`CCR dev endpoint: http://127.0.0.1:${ccrPort}/v1/messages`);
    console.log(`mock Morph endpoint: ${morphServer.url}/v1/router/multimodel`);
    console.log("");

    const claudeArgs = [
      "--bare",
      "--print",
      "--output-format",
      "json",
      "--model",
      "claude-3-5-sonnet-20241022",
      "--no-session-persistence",
      "--prompt-suggestions",
      "false",
      "ROUTE_ME call CCR through Claude Code and return the provider proof.",
    ];

    console.log(
      `$ ANTHROPIC_BASE_URL=http://127.0.0.1:${ccrPort} ANTHROPIC_API_KEY=<test> claude ${claudeArgs.join(" ")}`
    );

    const claude = await runCommand("claude", claudeArgs, {
      cwd: repoRoot,
      timeoutMs: 45000,
      env: {
        ...process.env,
        HOME: tempHome,
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${ccrPort}`,
        ANTHROPIC_AUTH_TOKEN: "test-client-key",
        ANTHROPIC_API_KEY: "test-client-key",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        NO_COLOR: "1",
      },
    });

    const claudeText = extractClaudeText(claude.stdout);
    console.log("");
    console.log("Claude Code output:");
    console.log(claudeText || claude.stdout.trim());
    if (claude.stderr.trim()) {
      console.log("");
      console.log("Claude Code stderr:");
      console.log(claude.stderr.trim());
    }

    const providerCall = last(providerCalls);
    const morphCall = last(morphCalls);

    console.log("");
    console.log("Route proof:");
    console.log(`Morph calls: ${morphCalls.length}`);
    console.log(`Morph input: ${morphCall?.input || "(none)"}`);
    console.log(`Provider calls: ${providerCalls.length}`);
    console.log(`Provider endpoint path: ${providerCall?.path || "(none)"}`);
    console.log(`Provider received model: ${providerCall?.model || "(none)"}`);

    if (ccrOutput.stderr.trim()) {
      console.log("");
      console.log("CCR stderr:");
      console.log(ccrOutput.stderr.trim().split("\n").slice(-8).join("\n"));
    }

    if (morphCalls.length < 1) {
      throw new Error(`expected at least one Morph call, got ${morphCalls.length}`);
    }
    if (!morphCalls.every((call) => call.input.includes("ROUTE_ME"))) {
      throw new Error("Claude Code prompt did not reach Morph router");
    }
    if (providerCalls.length < 1) {
      throw new Error(`expected at least one provider call, got ${providerCalls.length}`);
    }
    if (!providerCalls.every((call) => call.model === "chosen-model")) {
      throw new Error(`expected every provider call to use chosen-model, got ${providerCalls.map((call) => call.model).join(", ")}`);
    }
    if (!claudeText.includes("ROUTE_PROOF_OK provider_model=chosen-model")) {
      throw new Error("Claude Code did not print the mock provider proof response");
    }

    console.log("");
    console.log("PASS Claude Code used branch-built CCR and routed to chosen-model");
  } finally {
    for (const item of cleanup.reverse()) {
      await item().catch?.(() => {});
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function writeConfig({ path: configPath, port, routerPath, morphEndpoint, providerEndpoint }) {
  const config = {
    PORT: port,
    HOST: "127.0.0.1",
    LOG: false,
    API_TIMEOUT_MS: 10000,
    CUSTOM_ROUTER_PATH: routerPath,
    MORPH_ROUTER: {
      enabled: true,
      api_key: "$MORPH_API_KEY",
      endpoint: morphEndpoint,
      policy: "balanced",
      allowed_providers: ["openai"],
      default_model: "fallback-model",
      fallback: "openai,fallback-model",
      timeout_ms: 2000,
    },
    Providers: [
      {
        name: "openai",
        api_base_url: providerEndpoint,
        api_key: "$OPENAI_API_KEY",
        models: ["chosen-model", "fallback-model"],
        transformer: {
          use: ["OpenAI"],
        },
      },
    ],
    Router: {
      default: "openai,fallback-model",
      background: "openai,fallback-model",
      think: "openai,fallback-model",
      longContext: "openai,fallback-model",
      webSearch: "openai,fallback-model",
      longContextThreshold: 60000,
    },
  };

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function assertCommandExists(command, args) {
  const result = await runCommand(command, args, { timeoutMs: 10000 });
  if (!result.stdout && !result.stderr) {
    throw new Error(`Unable to run ${command}`);
  }
}

async function runCommand(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output = collectOutput(child);
  const timeoutMs = options.timeoutMs || 30000;
  let timeout;

  const exit = await Promise.race([
    new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal }))),
    new Promise((resolve) => {
      timeout = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({ code: null, signal: "TIMEOUT" });
      }, timeoutMs);
    }),
  ]);

  clearTimeout(timeout);

  if (exit.signal === "TIMEOUT") {
    throw new Error(`${command} timed out after ${timeoutMs}ms`);
  }
  if (exit.code !== 0) {
    throw new Error(`${command} exited with ${exit.code}\n${output.stderr || output.stdout}`);
  }

  return output;
}

function collectOutput(child) {
  const output = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk) => {
    output.stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output.stderr += chunk.toString();
  });
  return output;
}

function extractClaudeText(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    return parsed.result || parsed.message || parsed.content || trimmed;
  } catch {
    return trimmed;
  }
}

function last(items) {
  return items[items.length - 1];
}

async function startJsonServer(handler) {
  const server = http.createServer(async (req, res) => {
    try {
      const body = await readJson(req);
      const result = await handler({ req, body });
      const status = result.status || 200;
      res.writeHead(status, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify(result.body || {}));
    } catch (error) {
      res.writeHead(500, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ error: error.message }));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || "no response"}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(3000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
