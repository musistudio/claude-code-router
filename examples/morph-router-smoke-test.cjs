#!/usr/bin/env node
/**
 * Local smoke test for examples/morph-router.cjs.
 *
 * The test runs entirely against local mock services:
 * - a mock Morph Router API
 * - a mock OpenAI-compatible provider
 * - a real CCR process started with a temporary HOME
 *
 * It then sends Anthropic /v1/messages requests through CCR and asserts that
 * Morph decisions become provider calls with the expected model.
 */

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const routerSource = path.join(__dirname, "morph-router.cjs");

main().catch((error) => {
  console.error(`\nFAIL ${error.message}`);
  if (error.stack) console.error(error.stack.split("\n").slice(1).join("\n"));
  process.exitCode = 1;
});

async function main() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "ccr-morph-router-smoke-"));
  const ccrHome = path.join(tempHome, ".claude-code-router");
  fs.mkdirSync(ccrHome, { recursive: true });

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
        policy: body.policy,
      });

      if (body.input.includes("UNKNOWN_MODEL")) {
        return {
          body: decision("missing-model", "easy", 0.91),
        };
      }

      return {
        body: decision("chosen-model", "medium", 0.97),
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
          id: "chatcmpl-morph-router-smoke",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: `mock provider handled ${body.model}`,
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

    const ccrProcess = startCcr({ tempHome });
    cleanup.push(() => stopProcess(ccrProcess));
    await waitForHttp(`http://127.0.0.1:${ccrPort}/health`, 15000);

    console.log("CCR Morph Model Router smoke test");
    console.log(`repo: ${repoRoot}`);
    console.log(`temp HOME: ${tempHome}`);
    console.log(`CCR endpoint: http://127.0.0.1:${ccrPort}/v1/messages`);
    console.log(`mock Morph endpoint: ${morphServer.url}/v1/router/multimodel`);
    console.log("");

    const results = [];

    const eligibleStart = morphCalls.length;
    await sendCcrMessage(ccrPort, "ROUTE_ME choose the best coding model");
    results.push(assertCase({
      name: "eligible prompt routes through Morph",
      morphDelta: morphCalls.length - eligibleStart,
      morphInput: last(morphCalls).input,
      providerModel: last(providerCalls).model,
      expectedMorphDelta: 1,
      expectedProviderModel: "chosen-model",
    }));

    const fallbackStart = morphCalls.length;
    await sendCcrMessage(ccrPort, "UNKNOWN_MODEL demonstrate fallback");
    results.push(assertCase({
      name: "unconfigured Morph model falls back",
      morphDelta: morphCalls.length - fallbackStart,
      morphInput: last(morphCalls).input,
      providerModel: last(providerCalls).model,
      expectedMorphDelta: 1,
      expectedProviderModel: "fallback-model",
    }));

    const thinkingStart = morphCalls.length;
    await sendCcrMessage(ccrPort, "ROUTE_ME but preserve CCR thinking route", {
      thinking: { type: "enabled", budget_tokens: 1024 },
    });
    results.push(assertCase({
      name: "thinking request keeps CCR route",
      morphDelta: morphCalls.length - thinkingStart,
      morphInput: "(not called)",
      providerModel: last(providerCalls).model,
      expectedMorphDelta: 0,
      expectedProviderModel: "fallback-model",
    }));

    const privacyStart = morphCalls.length;
    await sendCcrMessage(ccrPort, [
      {
        type: "tool_result",
        tool_use_id: "toolu_secret",
        content: "SECRET_TOOL_OUTPUT_SHOULD_NOT_REACH_MORPH",
      },
      {
        type: "text",
        text: "TOOL_PRIVACY_TEXT route this prompt only",
      },
    ]);
    const privacyInput = last(morphCalls).input;
    results.push(assertCase({
      name: "tool_result content is not sent to Morph",
      morphDelta: morphCalls.length - privacyStart,
      morphInput: privacyInput,
      providerModel: last(providerCalls).model,
      expectedMorphDelta: 1,
      expectedProviderModel: "chosen-model",
      extraCheck: !privacyInput.includes("SECRET_TOOL_OUTPUT_SHOULD_NOT_REACH_MORPH"),
      extraFailure: "secret tool output reached Morph input",
    }));

    printResults(results);

    const failed = results.filter((result) => result.status !== "PASS");
    if (failed.length) {
      throw new Error(`${failed.length} smoke-test case(s) failed`);
    }

    if (last(morphCalls).authorization !== "Bearer test-morph-key") {
      throw new Error("Morph API key was not resolved from MORPH_API_KEY");
    }

    console.log("");
    console.log("PASS all smoke-test cases passed");
  } finally {
    for (const item of cleanup.reverse()) {
      await item().catch?.(() => {});
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function decision(model, difficulty, confidence) {
  return {
    model,
    provider: "openai",
    difficulty,
    confidence,
    ambiguity: "low",
    ambiguity_confidence: 0.88,
    domain: "coding",
    domain_confidence: 0.92,
  };
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

function startCcr({ tempHome }) {
  const { command, args } = resolveCcrCommand();
  const child = spawn(command, [...args, "start"], {
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

  child.stdout.on("data", (chunk) => {
    if (process.env.CCR_SMOKE_VERBOSE) process.stdout.write(chunk);
  });

  child.stderr.on("data", (chunk) => {
    if (process.env.CCR_SMOKE_VERBOSE) process.stderr.write(chunk);
  });

  child.on("exit", (code, signal) => {
    if (code && process.env.CCR_SMOKE_VERBOSE) {
      console.error(`ccr exited with code ${code} signal ${signal}`);
    }
  });

  return child;
}

function resolveCcrCommand() {
  if (process.env.CCR_COMMAND) {
    return {
      command: process.env.CCR_COMMAND,
      args: splitArgs(process.env.CCR_COMMAND_ARGS || ""),
    };
  }

  const localCli = path.join(repoRoot, "dist", "cli.js");
  if (fs.existsSync(localCli)) {
    return { command: process.execPath, args: [localCli] };
  }

  return { command: "ccr", args: [] };
}

function splitArgs(value) {
  if (!value.trim()) return [];
  return value.match(/(?:[^\s"]+|"[^"]*")+/g).map((part) => part.replace(/^"|"$/g, ""));
}

async function sendCcrMessage(port, content, extra = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 64,
      messages: [{ role: "user", content }],
      ...extra,
    }),
  });

  if (!response.ok) {
    throw new Error(`CCR request failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function assertCase({
  name,
  morphDelta,
  morphInput,
  providerModel,
  expectedMorphDelta,
  expectedProviderModel,
  extraCheck = true,
  extraFailure = "extra check failed",
}) {
  const failures = [];
  if (morphDelta !== expectedMorphDelta) {
    failures.push(`expected Morph calls +${expectedMorphDelta}, got +${morphDelta}`);
  }
  if (providerModel !== expectedProviderModel) {
    failures.push(`expected provider model ${expectedProviderModel}, got ${providerModel}`);
  }
  if (!extraCheck) failures.push(extraFailure);

  return {
    status: failures.length ? "FAIL" : "PASS",
    name,
    morphCalls: `+${morphDelta}`,
    morphInput,
    providerModel,
    failures,
  };
}

function printResults(results) {
  const rows = results.map((result) => ({
    status: result.status,
    case: result.name,
    morph: result.morphCalls,
    provider_model: result.providerModel,
    morph_input: result.morphInput,
  }));

  console.table(rows);

  for (const result of results) {
    if (result.failures.length) {
      console.error(`${result.name}: ${result.failures.join("; ")}`);
    }
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
