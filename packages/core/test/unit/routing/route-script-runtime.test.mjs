import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gatewayService } from "@ccr/core/gateway/application/gateway-service.ts";
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

function routeScript(source, overrides = {}, extension = "js") {
  const file = path.join(routeScriptDirectory, `route-${++routeScriptFileIndex}.${extension}`);
  writeFileSync(file, source, "utf8");
  return {
    apiVersion: 1,
    file,
    language: "javascript",
    timeoutMs: 500,
    ...overrides
  };
}

function scriptRule(id, script, overrides = {}) {
  return {
    enabled: true,
    id,
    name: id,
    script,
    type: "script",
    ...overrides
  };
}

function routingConfig(rules = []) {
  return {
    CUSTOM_ROUTER_PATH: "",
    Providers: [{ models: ["alpha", "beta", "fallback"], name: "Provider", type: "anthropic_messages" }],
    Router: {
      builtInRules: { "claude-code": { enabled: false }, codex: { enabled: false } },
      fallback: { mode: "off", models: [], retryCount: 0 },
      rules
    },
    profile: { enabled: false, profiles: [] },
    virtualModelProfiles: []
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

test("route script input derives every documented routing summary field", () => {
  const body = {
    messages: [
      { content: "ignore assistant", role: "assistant" },
      {
        content: [
          { text: "route this request", type: "text" },
          { source: { media_type: "image/png" }, type: "image" }
        ],
        role: "user"
      }
    ],
    model: "Provider/alpha",
    system: [{ text: "system policy", type: "text" }],
    tools: [{ name: "direct_tool" }, { function: { name: "function_tool" } }]
  };
  const input = buildRouteScriptInput({
    body,
    builtInSubagentModel: "Provider/beta",
    headers: { "X-Auth-Api-Key-Id": "key-id", "x-tags": ["one", "two"] },
    log: console,
    method: "POST",
    sessionId: "session-1",
    tokenCount: 321,
    url: "/v1/messages?beta=true"
  });

  assert.notEqual(input.body, body);
  assert.deepEqual(input, {
    apiKeyId: "key-id",
    body,
    builtInSubagentModel: "Provider/beta",
    headers: { "X-Auth-Api-Key-Id": "key-id", "x-tags": ["one", "two"] },
    method: "POST",
    model: "Provider/alpha",
    sessionId: "session-1",
    summary: {
      hasImage: true,
      lastUserText: "route this request",
      messageCount: 2,
      systemText: "system policy",
      toolNames: ["direct_tool", "function_tool"]
    },
    tokenCount: 321,
    url: "/v1/messages?beta=true"
  });
});

test("route scripts receive frozen per-request input and a stable hash helper", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const script = routeScript(`
    const blocked = [];
    try { input.body.model = "Provider/beta"; } catch { blocked.push("body"); }
    try { input.headers["x-visible"] = "changed"; } catch { blocked.push("headers"); }
    try { api.fs.readText = undefined; } catch { blocked.push("api"); }
    const leaked = globalThis.routeScriptLeak === true;
    globalThis.routeScriptLeak = true;
    return {
      blocked,
      hash: api.hash(input.sessionId),
      leaked,
      model: input.body.model,
      visibleHeader: input.headers["x-visible"]
    };
  `);
  const input = buildRouteScriptInput({
    body: { model: "Provider/alpha" },
    headers: { "x-visible": "yes" },
    log: console,
    method: "POST",
    sessionId: "stable-session",
    url: "/v1/messages"
  });
  try {
    const first = await runtime.execute("frozen-input-1", script, input);
    const second = await runtime.execute("frozen-input-2", script, input);

    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    assert.deepEqual(first.value.blocked, ["body", "headers", "api"]);
    assert.equal(first.value.model, "Provider/alpha");
    assert.equal(first.value.visibleHeader, "yes");
    assert.equal(first.value.leaked, false);
    assert.equal(second.value.leaked, false);
    assert.equal(first.value.hash, second.value.hash);
    assert.ok(Number.isInteger(first.value.hash));
  } finally {
    await runtime.close();
  }
});

test("route scripts load local files and pick up file changes", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const script = routeScript("return 'first';");
  try {
    assert.deepEqual(await runtime.validate(script), { diagnostics: [], ok: true });
    const first = await runtime.execute("file-reload", script, scriptInput(script));
    assert.equal(first.status, "ok");
    assert.equal(first.value, "first");

    writeFileSync(script.file, "return {;", "utf8");
    const invalid = await runtime.validate(script);
    assert.equal(invalid.ok, false);

    writeFileSync(script.file, "return 'second';", "utf8");
    assert.deepEqual(await runtime.validate(script), { diagnostics: [], ok: true });
    const second = await runtime.execute("file-reload", script, scriptInput(script));
    assert.equal(second.status, "ok");
    assert.equal(second.value, "second");
  } finally {
    await runtime.close();
  }
});

test("route scripts support every documented file extension and legacy inline source", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  try {
    for (const extension of ["js", "mjs", "cjs"]) {
      const script = routeScript(`return "${extension}";`, {}, extension);
      assert.deepEqual(await runtime.validate(script), { diagnostics: [], ok: true });
      const result = await runtime.execute(`extension-${extension}`, script, scriptInput(script));
      assert.equal(result.status, "ok");
      assert.equal(result.value, extension);
    }

    const inline = {
      apiVersion: 1,
      language: "javascript",
      source: "await Promise.resolve(); return 'inline';",
      timeoutMs: 500
    };
    assert.deepEqual(await runtime.validate(inline), { diagnostics: [], ok: true });
    const result = await runtime.execute("legacy-inline", inline, scriptInput(inline));
    assert.equal(result.status, "ok");
    assert.equal(result.value, "inline");
  } finally {
    await runtime.close();
  }
});

test("route script validation rejects invalid metadata, paths, content, and limits", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const valid = routeScript("return true;");
  const directoryFile = path.join(routeScriptDirectory, `directory-${++routeScriptFileIndex}.js`);
  mkdirSync(directoryFile);
  const cases = [
    [{ ...valid, apiVersion: 2 }, /unsupported route script api or language/i],
    [{ ...valid, language: "typescript" }, /unsupported route script api or language/i],
    [{ ...valid, file: undefined, source: " " }, /between 1 and 65536 bytes/i],
    [{ ...valid, file: `${valid.file}.txt` }, /\.js, \.mjs, or \.cjs extension/i],
    [{ ...valid, timeoutMs: 9 }, /between 10 and 30000 ms/i],
    [{ ...valid, timeoutMs: 30001 }, /between 10 and 30000 ms/i],
    [{ ...valid, file: path.join(routeScriptDirectory, "missing.js") }, /unable to read route script file/i],
    [{ ...valid, file: directoryFile }, /is not a file/i],
    [routeScript("x".repeat(64 * 1024 + 1)), /exceeds 65536 bytes/i]
  ];
  try {
    for (const [script, expectedMessage] of cases) {
      const result = await runtime.validate(script);
      assert.equal(result.ok, false);
      assert.equal(result.diagnostics[0].code, "script-source-invalid");
      assert.match(result.diagnostics[0].message, expectedMessage);
    }
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
  const rule = scriptRule("dynamic-script", script, { name: "Dynamic script" });
  const config = routingConfig([rule]);
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

test("Node.js script rules fail open and continue to the first valid dynamic decision", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const rules = [
    scriptRule("null-result", routeScript("return null;")),
    scriptRule("runtime-error", routeScript("throw new Error('policy unavailable');")),
    scriptRule("invalid-result", routeScript("return 'Provider/beta';")),
    scriptRule("unconfigured-model", routeScript('return { model: "Provider/missing" };')),
    scriptRule("invalid-fallback", routeScript(`
      return { fallback: { mode: "model-chain", models: ["Provider/missing"], retryCount: 0 } };
    `)),
    scriptRule("protected-rewrite", routeScript(`
      return {
        rewrites: [{ key: "request.header.authorization", operation: "set", value: "replaced" }]
      };
    `)),
    scriptRule("explicit-no-match", routeScript(`
      return { match: false, model: "Provider/alpha" };
    `)),
    scriptRule("valid-result", routeScript(`
      return {
        model: "Provider/beta",
        rewrites: [
          { key: "request.body.temperature", operation: "set", value: 0.25 },
          { key: "request.body.tags", operation: "array-append", value: "script" },
          { key: "request.header.x-route-policy", operation: "set", value: "dynamic" }
        ],
        fallback: {
          mode: "model-chain",
          models: ["Provider/fallback"],
          retryCount: 0
        }
      };
    `))
  ];
  const config = routingConfig(rules);
  try {
    const validationErrors = await runtime.prepare(rules);
    assert.deepEqual([...validationErrors], []);
    const plugin = new ClaudeCodeRouterPlugin(config, {
      scriptRuntime: runtime,
      scriptValidationErrors: validationErrors
    });
    const headers = {};
    const result = await plugin.routeRequest({
      body: { messages: [], model: "Provider/alpha", tags: ["base"] },
      headers,
      method: "POST",
      url: "/v1/messages"
    });

    assert.equal(result.body.model, "Provider/beta");
    assert.equal(result.body.temperature, 0.25);
    assert.deepEqual(result.body.tags, ["base", "script"]);
    assert.equal(headers["x-route-policy"], "dynamic");
    assert.equal(result.decision.reason, "script:valid-result");
    assert.deepEqual(result.decision.fallback, {
      mode: "model-chain",
      models: ["Provider/fallback"],
      retryCount: 0
    });
    assert.deepEqual(
      result.decision.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "script-runtime-error",
        "script-invalid-result",
        "script-model-not-configured",
        "script-invalid-result",
        "script-invalid-result"
      ]
    );
  } finally {
    await runtime.close();
  }
});

test("startup validation disables an invalid script without blocking later rules", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const invalidRule = scriptRule("invalid-syntax", routeScript("return {;"));
  const validRule = scriptRule("valid-after-invalid", routeScript('return { model: "Provider/beta" };'));
  const rules = [invalidRule, validRule];
  const config = routingConfig(rules);
  try {
    const validationErrors = await runtime.prepare(rules);
    assert.equal(validationErrors.size, 1);
    assert.match(validationErrors.get("invalid-syntax"), /syntax|unexpected/i);

    const plugin = new ClaudeCodeRouterPlugin(config, {
      scriptRuntime: runtime,
      scriptValidationErrors: validationErrors
    });
    const result = await plugin.routeRequest({
      body: { messages: [], model: "Provider/alpha" },
      headers: {},
      method: "POST",
      url: "/v1/messages"
    });

    assert.equal(result.body.model, "Provider/beta");
    assert.equal(result.decision.reason, "script:valid-after-invalid");
    assert.ok(result.decision.diagnostics.some((diagnostic) =>
      diagnostic.code === "script-source-invalid" && diagnostic.ruleId === "invalid-syntax"
    ));
  } finally {
    await runtime.close();
  }
});

test("a true script result applies the rule's static target, rewrites, and fallback", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const rule = scriptRule("static-script-decision", routeScript("return true;"), {
    fallback: { mode: "retry", models: [], retryCount: 2 },
    rewrites: [
      { key: "request.body.model", operation: "set", value: "Provider/beta" },
      { key: "request.body.metadata.route", operation: "set", value: "static" }
    ]
  });
  const config = routingConfig([rule]);
  try {
    const validationErrors = await runtime.prepare([rule]);
    const plugin = new ClaudeCodeRouterPlugin(config, {
      scriptRuntime: runtime,
      scriptValidationErrors: validationErrors
    });
    const result = await plugin.routeRequest({
      body: { messages: [], model: "Provider/alpha" },
      headers: {},
      method: "POST",
      url: "/v1/messages"
    });

    assert.equal(result.body.model, "Provider/beta");
    assert.deepEqual(result.body.metadata, { route: "static" });
    assert.deepEqual(result.decision.fallback, { mode: "retry", models: [], retryCount: 2 });
    assert.equal(result.decision.reason, "script:static-script-decision");
  } finally {
    await runtime.close();
  }
});

test("the route-script test service validates, executes, and previews a custom decision", async () => {
  const script = routeScript(`
    return {
      model: input.headers["x-use-beta"] === "yes" ? "Provider/beta" : "Provider/alpha",
      rewrites: [{ key: "request.body.tested", operation: "set", value: true }]
    };
  `);
  try {
    const result = await gatewayService.testRouteScript(routingConfig(), {
      request: {
        body: { messages: [], model: "Provider/alpha" },
        headers: { "x-use-beta": "yes" },
        method: "POST",
        sessionId: "test-session",
        tokenCount: 42,
        url: "/v1/messages"
      },
      script
    });

    assert.equal(result.ok, true);
    assert.equal(result.matched, true);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.output, {
      model: "Provider/beta",
      rewrites: [{ key: "request.body.tested", operation: "set", value: true }]
    });
    assert.ok(result.durationMs >= 0);
  } finally {
    await gatewayService.stop();
  }
});

test("dynamic script model deletion overrides an earlier static model rewrite", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const script = routeScript(`
    return {
      rewrites: [{ key: "request.body.model", operation: "delete" }]
    };
  `);
  const rule = scriptRule("dynamic-model-delete", script, {
    name: "Dynamic model delete",
    rewrites: [{ key: "request.body.model", operation: "set", value: "Provider/alpha" }],
  });
  const config = routingConfig([rule]);
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

test("route scripts expose the complete documented filesystem API", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ccr-route-script-"));
  const inputFile = path.join(directory, "input.json");
  const outputFile = path.join(directory, "output.txt");
  const outputJsonFile = path.join(directory, "output.json");
  const missingFile = path.join(directory, "missing.txt");
  writeFileSync(inputFile, JSON.stringify({ route: "allowed" }), "utf8");
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const script = routeScript(`
    const text = await api.fs.readText(input.body.inputFile);
    const json = await api.fs.readJson(input.body.inputFile);
    await api.fs.writeText(input.body.outputFile, json.route.toUpperCase());
    await api.fs.writeJson(input.body.outputJsonFile, { copied: json.route });
    return {
      directory: await api.fs.stat(input.body.directory),
      entries: await api.fs.list(input.body.directory),
      file: await api.fs.stat(input.body.inputFile),
      inputExists: await api.fs.exists(input.body.inputFile),
      json,
      missingExists: await api.fs.exists(input.body.missingFile),
      text
    };
  `);
  try {
    const result = await runtime.execute("filesystem", script, scriptInput(script, {
      directory,
      inputFile,
      missingFile,
      outputFile,
      outputJsonFile
    }));
    assert.equal(result.status, "ok");
    assert.equal(result.value.inputExists, true);
    assert.equal(result.value.missingExists, false);
    assert.equal(result.value.text, JSON.stringify({ route: "allowed" }));
    assert.deepEqual(result.value.json, { route: "allowed" });
    assert.equal(result.value.directory.isDirectory, true);
    assert.equal(result.value.file.isFile, true);
    assert.ok(result.value.file.size > 0);
    assert.match(result.value.file.modifiedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(
      result.value.entries.map((entry) => entry.name).sort(),
      ["input.json", "output.json", "output.txt"]
    );
    assert.equal(readFileSync(outputFile, "utf8"), "ALLOWED");
    assert.equal(readFileSync(outputJsonFile, "utf8"), '{\n  "copied": "allowed"\n}\n');
  } finally {
    await runtime.close();
    rmSync(directory, { force: true, recursive: true });
  }
});

test("route scripts expose HTTP request options and response metadata", async () => {
  let received;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      body: Buffer.concat(chunks).toString("utf8"),
      header: request.headers["x-policy-request"],
      method: request.method,
      url: request.url
    };
    response.statusCode = 201;
    response.setHeader("content-type", "application/json");
    response.setHeader("x-policy-response", "available");
    response.end(JSON.stringify({ route: "beta" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/route`;
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const script = routeScript(`
    const response = await api.fetch(input.body.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-policy-request": "check" },
      body: JSON.stringify({ tenant: "acme" })
    });
    return { ...response, body: JSON.parse(response.body) };
  `);
  try {
    const result = await runtime.execute("network", script, scriptInput(script, { endpoint }));
    assert.equal(result.status, "ok");
    assert.equal(result.value.ok, true);
    assert.equal(result.value.status, 201);
    assert.equal(result.value.statusText, "Created");
    assert.equal(result.value.redirected, false);
    assert.equal(result.value.url, endpoint);
    assert.equal(result.value.headers["x-policy-response"], "available");
    assert.deepEqual(result.value.body, { route: "beta" });
    assert.deepEqual(received, {
      body: JSON.stringify({ tenant: "acme" }),
      header: "check",
      method: "POST",
      url: "/route"
    });

    const invalidUrl = routeScript('await api.fetch("file:///tmp/policy.json");');
    const invalidResult = await runtime.execute("network-invalid-url", invalidUrl, scriptInput(invalidUrl));
    assert.equal(invalidResult.status, "error");
    assert.match(invalidResult.error, /only http\(s\) urls/i);
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

test("route scripts stop unresolved async work and keep the worker reusable", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const stalled = routeScript("await new Promise(() => {});", { timeoutMs: 30 });
  const healthy = routeScript("return 'recovered';");
  try {
    const timeout = await runtime.execute("async-timeout", stalled, scriptInput(stalled));
    assert.equal(timeout.status, "timeout");
    assert.match(timeout.error, /timed out/i);

    const recovered = await runtime.execute("after-async-timeout", healthy, scriptInput(healthy));
    assert.equal(recovered.status, "ok");
    assert.equal(recovered.value, "recovered");
  } finally {
    await runtime.close();
  }
});

test("route scripts reject non-JSON and oversized results without poisoning later executions", async () => {
  const runtime = new RouteScriptRuntime({ workerCount: 1, workerFile });
  const cases = [
    ["bigint", routeScript("return 1n;"), /json serializable|bigint/i],
    ["circular", routeScript("const value = {}; value.self = value; return value;"), /circular/i],
    ["oversized", routeScript('return { value: "x".repeat(70 * 1024) };'), /exceeds 65536 bytes/i]
  ];
  try {
    for (const [ruleId, script, expectedMessage] of cases) {
      const result = await runtime.execute(ruleId, script, scriptInput(script));
      assert.equal(result.status, "error");
      assert.match(result.error, expectedMessage);
    }

    const healthy = routeScript("return { match: true };");
    const recovered = await runtime.execute("after-invalid-results", healthy, scriptInput(healthy));
    assert.equal(recovered.status, "ok");
    assert.deepEqual(recovered.value, { match: true });
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
