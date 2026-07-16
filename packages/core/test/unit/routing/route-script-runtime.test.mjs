import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import { buildRouteScriptInput } from "@ccr/core/routing/route-script-context.ts";
import { RouteScriptRuntime } from "@ccr/core/routing/route-script-runtime.ts";

const workerFile = [
  path.resolve(__dirname, "../../runtime/route-script-worker.js"),
  path.resolve(__dirname, "../../../runtime/route-script-worker.js")
].find(existsSync);
assert.ok(workerFile, "compiled route script worker is required");

const routeScriptDirectory = mkdtempSync(path.join(os.tmpdir(), "ccr-route-script-files-"));
let routeScriptFileIndex = 0;
test.after(() => rmSync(routeScriptDirectory, { force: true, recursive: true }));

function routeScript(source, overrides = {}) {
  const file = path.join(routeScriptDirectory, `route-${++routeScriptFileIndex}.js`);
  writeFileSync(file, source, "utf8");
  return {
    apiVersion: 1,
    file,
    language: "javascript",
    timeoutMs: 500,
    ...overrides
  };
}

function scriptInput(script, body = {}) {
  return buildRouteScriptInput({
    body,
    headers: { authorization: "secret", "x-visible": "yes" },
    log: console,
    method: "POST",
    tokenCount: 12,
    url: "/v1/messages"
  });
}

test("route script input exposes the complete request body and headers", () => {
  const script = routeScript("return null;");
  const input = scriptInput(script, {
    hidden: "visible",
    messages: [{ content: "hello", role: "user" }],
    metadata: { secret: "visible", tenant: "acme" },
    model: "Provider/alpha"
  });

  assert.deepEqual(input.body, {
    hidden: "visible",
    messages: [{ content: "hello", role: "user" }],
    metadata: { secret: "visible", tenant: "acme" },
    model: "Provider/alpha"
  });
  assert.equal(input.headers.authorization, "secret");
  assert.equal(input.headers["x-visible"], "yes");
});

test("route scripts load local files and pick up file changes", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const script = routeScript("return 'first';");
  try {
    const first = await runtime.execute("file-reload", script, scriptInput(script));
    assert.equal(first.status, "ok");
    assert.equal(first.value, "first");

    writeFileSync(script.file, "return 'second';", "utf8");
    const second = await runtime.execute("file-reload", script, scriptInput(script));
    assert.equal(second.status, "ok");
    assert.equal(second.value, "second");
  } finally {
    await runtime.close();
  }
});

test("route scripts validate and execute async Node.js source", async () => {
  process.env.CCR_ROUTE_SCRIPT_ENV_TEST = "available";
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const script = routeScript(`
    await Promise.resolve();
    const escape = (value) => {
      try {
        return value.constructor.constructor("return process")().version;
      } catch {
        return "blocked";
      }
    };
    return {
      apiEscape: escape(api.fetch),
      inputEscape: escape(input),
      model: input.model,
      processType: typeof process,
      requireType: typeof require,
      visibleHeader: input.headers["x-visible"],
      authorization: input.headers.authorization,
      envValue: api.env("CCR_ROUTE_SCRIPT_ENV_TEST"),
      envUnset: typeof api.env("CCR_ROUTE_SCRIPT_UNSET_TEST")
    };
  `);
  try {
    assert.deepEqual(await runtime.validate(script), { diagnostics: [], ok: true });
    const result = await runtime.execute("async", script, scriptInput(script, { model: "Provider/alpha" }));
    assert.equal(result.status, "ok");
    assert.deepEqual(result.value, {
      apiEscape: "blocked",
      authorization: "secret",
      inputEscape: "blocked",
      envValue: "available",
      envUnset: "undefined",
      model: "Provider/alpha",
      processType: "undefined",
      requireType: "undefined",
      visibleHeader: "yes"
    });
  } finally {
    await runtime.close();
    delete process.env.CCR_ROUTE_SCRIPT_ENV_TEST;
  }
});

test("Node.js script rules participate in ordered routing and return dynamic decisions", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const script = routeScript(`
    if (!input.summary.lastUserText.toLowerCase().includes("beta")) return null;
    return {
      model: "Provider/beta",
      rewrites: [{ key: "request.header.x-script-route", operation: "set", value: "matched" }]
    };
  `);
  const rule = {
    enabled: true,
    id: "dynamic-script",
    name: "Dynamic script",
    script,
    type: "script"
  };
  const config = {
    CUSTOM_ROUTER_PATH: "",
    Providers: [{ models: ["alpha", "beta"], name: "Provider", type: "anthropic_messages" }],
    Router: {
      builtInRules: { "claude-code": { enabled: false }, codex: { enabled: false } },
      fallback: { mode: "off", models: [], retryCount: 0 },
      rules: [rule]
    },
    profile: { enabled: false, profiles: [] },
    virtualModelProfiles: []
  };
  try {
    const validationErrors = await runtime.prepare([rule]);
    const plugin = new ClaudeCodeRouterPlugin(config, {
      scriptRuntime: runtime,
      scriptValidationErrors: validationErrors
    });
    const headers = {};
    const result = await plugin.routeRequest({
      body: {
        messages: [{ role: "user", content: "Please use beta" }],
        model: "Provider/alpha"
      },
      headers,
      method: "POST",
      url: "/v1/messages"
    });
    assert.equal(result.body.model, "Provider/beta");
    assert.equal(headers["x-script-route"], "matched");
    assert.equal(result.decision.reason, "script:dynamic-script");
  } finally {
    await runtime.close();
  }
});

test("dynamic script model deletion overrides an earlier static model rewrite", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const script = routeScript(`
    return {
      rewrites: [{ key: "request.body.model", operation: "delete" }]
    };
  `);
  const rule = {
    enabled: true,
    id: "dynamic-model-delete",
    name: "Dynamic model delete",
    rewrites: [{ key: "request.body.model", operation: "set", value: "Provider/alpha" }],
    script,
    type: "script"
  };
  const config = {
    CUSTOM_ROUTER_PATH: "",
    Providers: [{ models: ["alpha", "beta"], name: "Provider", type: "anthropic_messages" }],
    Router: {
      builtInRules: { "claude-code": { enabled: false }, codex: { enabled: false } },
      fallback: { mode: "off", models: [], retryCount: 0 },
      rules: [rule]
    },
    profile: { enabled: false, profiles: [] },
    virtualModelProfiles: []
  };
  try {
    const validationErrors = await runtime.prepare([rule]);
    const plugin = new ClaudeCodeRouterPlugin(config, {
      scriptRuntime: runtime,
      scriptValidationErrors: validationErrors
    });
    const result = await plugin.routeRequest({
      body: { messages: [], model: "Provider/beta" },
      headers: {},
      method: "POST",
      url: "/v1/messages"
    });

    assert.equal(result.body.model, undefined);
    assert.equal(result.decision.model, undefined);
  } finally {
    await runtime.close();
  }
});

test("route scripts can read and write arbitrary filesystem paths", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ccr-route-script-"));
  const inputFile = path.join(directory, "input.txt");
  const outputFile = path.join(directory, "output.txt");
  writeFileSync(inputFile, "allowed", "utf8");
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const script = routeScript(`
    const value = await api.fs.readText(input.body.inputFile);
    await api.fs.writeText(input.body.outputFile, value.toUpperCase());
    return value;
  `);
  try {
    const result = await runtime.execute("filesystem", script, scriptInput(script, { inputFile, outputFile }));
    assert.equal(result.status, "ok");
    assert.equal(result.value, "allowed");
    assert.equal(readFileSync(outputFile, "utf8"), "ALLOWED");

  } finally {
    await runtime.close();
    rmSync(directory, { force: true, recursive: true });
  }
});

test("route scripts can access arbitrary HTTP endpoints", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ route: "beta" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/route`;
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const script = routeScript(`
    const response = await api.fetch(input.body.endpoint);
    return JSON.parse(response.body);
  `);
  try {
    const result = await runtime.execute("network", script, scriptInput(script, { endpoint }));
    assert.equal(result.status, "ok");
    assert.deepEqual(result.value, { route: "beta" });
  } finally {
    await runtime.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("route scripts report syntax failures and stop synchronous infinite loops", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  try {
    const invalid = routeScript("return {;");
    const validation = await runtime.validate(invalid);
    assert.equal(validation.ok, false);
    assert.match(validation.diagnostics[0].message, /syntax|unexpected/i);

    const looping = routeScript("while (true) {}", { timeoutMs: 30 });
    const result = await runtime.execute("loop", looping, scriptInput(looping));
    assert.equal(result.status, "timeout");
  } finally {
    await runtime.close();
  }
});

test("route script workers distribute concurrent executions across available slots", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 2, workerFile });
  const script = routeScript(`
    const deadline = Date.now() + 350;
    while (Date.now() < deadline) {}
    return true;
  `, { timeoutMs: 400 });
  const input = scriptInput(script);
  try {
    const results = await Promise.all([
      runtime.execute("parallel-a", script, input),
      runtime.execute("parallel-b", script, input)
    ]);

    assert.deepEqual(results.map((result) => result.status), ["ok", "ok"]);
  } finally {
    await runtime.close();
  }
});

test("route script synchronous execution honors configured timeouts above one second", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const script = routeScript(`
    const deadline = Date.now() + 1100;
    while (Date.now() < deadline) {}
    return true;
  `, { timeoutMs: 1600 });
  try {
    const result = await runtime.execute("long-sync", script, scriptInput(script));
    assert.equal(result.status, "ok");
    assert.equal(result.value, true);
  } finally {
    await runtime.close();
  }
});

test("route script circuit breakers are versioned and can be bypassed for test runs", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const failing = routeScript("throw new Error('broken');");
  const corrected = routeScript("return true;");
  try {
    for (let index = 0; index < 3; index += 1) {
      const failure = await runtime.execute("versioned-rule", failing, scriptInput(failing));
      assert.equal(failure.status, "error");
    }

    const open = await runtime.execute("versioned-rule", failing, scriptInput(failing));
    assert.equal(open.status, "circuit-open");

    const bypassed = await runtime.execute("versioned-rule", failing, scriptInput(failing), {
      circuitBreaker: false
    });
    assert.equal(bypassed.status, "error");

    const recovered = await runtime.execute("versioned-rule", corrected, scriptInput(corrected));
    assert.equal(recovered.status, "ok");
    assert.equal(recovered.value, true);
  } finally {
    await runtime.close();
  }
});
