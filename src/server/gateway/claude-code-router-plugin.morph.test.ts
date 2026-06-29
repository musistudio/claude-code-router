import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "../../shared/app";
import { ClaudeCodeRouterPlugin } from "./claude-code-router-plugin";

// Integration coverage for the MorphRouter hook inside routeRequest(): it must
// own non-explicit routing, while explicit inline models, subagent tags, and a
// disabled config all bypass it. Morph's HTTP call is stubbed via global fetch.

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      { name: "openrouter", models: ["anthropic/claude-sonnet-4.6", "anthropic/claude-opus-4.8", "deepseek/deepseek-v4-flash"] },
      { name: "deepseek", models: ["deepseek-chat"] }
    ],
    Router: {
      default: "openrouter,anthropic/claude-sonnet-4.6",
      fallback: { mode: "off", models: [], retryCount: 1 },
      longContextThreshold: 200000,
      rules: []
    },
    MorphRouter: {
      enabled: true,
      api_key: "sk-test",
      policy: "balanced",
      default_model: "claude-sonnet-4-6",
      models: {
        "claude-sonnet-4-6": "openrouter,anthropic/claude-sonnet-4.6",
        "deepseek-v4-flash": { targets: ["openrouter,deepseek/deepseek-v4-flash", "deepseek,deepseek-chat"] }
      }
    },
    ...overrides
  } as unknown as AppConfig;
}

function stubFetch(morphModel: string) {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ model: morphModel, confidence: 0.9 }), { status: 200 });
  }) as typeof fetch;
  return {
    callCount: () => calls,
    restore: () => {
      globalThis.fetch = original;
    }
  };
}

// Captures what is actually POSTed to the Morph API so tests can assert the
// request payload (e.g. that the prompt was sanitized before it left the box).
function recordingFetch(morphModel: string) {
  let calls = 0;
  let lastBody: Record<string, unknown> | undefined;
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init: { body?: string } = {}) => {
    calls += 1;
    lastBody = init.body ? JSON.parse(init.body) : undefined;
    return new Response(JSON.stringify({ model: morphModel, confidence: 0.9 }), { status: 200 });
  }) as typeof fetch;
  return {
    callCount: () => calls,
    lastBody: () => lastBody,
    restore: () => {
      globalThis.fetch = original;
    }
  };
}

// Captures console.info output (the plugin logs routing decisions via console).
function captureInfo() {
  const lines: string[] = [];
  const original = console.info;
  console.info = ((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  }) as typeof console.info;
  return {
    lines: () => lines,
    restore: () => {
      console.info = original;
    }
  };
}

const userRequest = (model = "claude-3-5-sonnet") => ({
  body: { model, messages: [{ role: "user", content: "please refactor this gnarly function" }] },
  headers: {},
  method: "POST",
  url: "/v1/messages"
});

test("non-explicit request is routed by MorphRouter with a model-chain fallback", async () => {
  const fetchStub = stubFetch("deepseek-v4-flash");
  try {
    const plugin = new ClaudeCodeRouterPlugin(baseConfig());
    const { body, decision } = await plugin.routeRequest(userRequest());
    assert.equal(fetchStub.callCount(), 1, "Morph API should be called once");
    assert.equal(decision.reason, "morph-router");
    assert.equal(decision.model, "openrouter/deepseek/deepseek-v4-flash");
    assert.equal(body.model, "openrouter/deepseek/deepseek-v4-flash");
    assert.equal(decision.fallback?.mode, "model-chain");
    assert.deepEqual(decision.fallback?.models, ["deepseek/deepseek-chat"]);
  } finally {
    fetchStub.restore();
  }
});

test("explicit provider,model selection bypasses MorphRouter", async () => {
  const fetchStub = stubFetch("deepseek-v4-flash");
  try {
    const plugin = new ClaudeCodeRouterPlugin(baseConfig());
    const { decision } = await plugin.routeRequest(userRequest("openrouter,anthropic/claude-opus-4.8"));
    assert.equal(fetchStub.callCount(), 0, "Morph API must not be called for explicit routes");
    assert.equal(decision.reason, "inline-model");
    assert.equal(decision.model, "openrouter/anthropic/claude-opus-4.8");
  } finally {
    fetchStub.restore();
  }
});

test("subagent model tag bypasses MorphRouter", async () => {
  const fetchStub = stubFetch("deepseek-v4-flash");
  try {
    const config = baseConfig({
      Router: {
        default: "openrouter,anthropic/claude-sonnet-4.6",
        fallback: { mode: "off", models: [], retryCount: 1 },
        longContextThreshold: 200000,
        rules: [{ id: "subagent", type: "subagent", enabled: true } as never]
      }
    });
    const plugin = new ClaudeCodeRouterPlugin(config);
    const { decision } = await plugin.routeRequest({
      body: {
        model: "claude-3-5-sonnet",
        system: [
          { type: "text", text: "system" },
          { type: "text", text: "<CCR-SUBAGENT-MODEL>openrouter,anthropic/claude-opus-4.8</CCR-SUBAGENT-MODEL>" }
        ],
        messages: [{ role: "user", content: "do a small subtask" }]
      },
      headers: {},
      method: "POST",
      url: "/v1/messages"
    });
    assert.equal(fetchStub.callCount(), 0, "Morph API must not be called for subagent routes");
    assert.equal(decision.reason, "subagent");
  } finally {
    fetchStub.restore();
  }
});

test("disabled MorphRouter falls through to the default route", async () => {
  const fetchStub = stubFetch("deepseek-v4-flash");
  try {
    const plugin = new ClaudeCodeRouterPlugin(
      baseConfig({ MorphRouter: { enabled: false } } as Partial<AppConfig>)
    );
    const { decision } = await plugin.routeRequest(userRequest());
    assert.equal(fetchStub.callCount(), 0, "Morph API must not be called when disabled");
    assert.equal(decision.reason, "default");
    assert.equal(decision.model, "openrouter/anthropic/claude-sonnet-4.6");
  } finally {
    fetchStub.restore();
  }
});

test("an explicit provider,model selection bypasses Morph even if the provider is unconfigured", async () => {
  const fetchStub = stubFetch("deepseek-v4-flash");
  try {
    const plugin = new ClaudeCodeRouterPlugin(baseConfig());
    const { decision } = await plugin.routeRequest(userRequest("not-configured,some/model"));
    assert.equal(fetchStub.callCount(), 0, "Morph must not be called for an explicit selector");
    assert.notEqual(decision.reason, "morph-router");
  } finally {
    fetchStub.restore();
  }
});

test("a subagent model tag bypasses Morph even without a configured subagent rule", async () => {
  const fetchStub = stubFetch("deepseek-v4-flash");
  try {
    const plugin = new ClaudeCodeRouterPlugin(baseConfig()); // Router.rules is empty
    const { decision } = await plugin.routeRequest({
      body: {
        model: "claude-3-5-sonnet",
        system: [
          { type: "text", text: "system" },
          { type: "text", text: "<CCR-SUBAGENT-MODEL>openrouter,anthropic/claude-opus-4.8</CCR-SUBAGENT-MODEL>" }
        ],
        messages: [{ role: "user", content: "do a subtask" }]
      },
      headers: {},
      method: "POST",
      url: "/v1/messages"
    });
    assert.equal(fetchStub.callCount(), 0, "Morph must not be called when a subagent tag is present");
    assert.notEqual(decision.reason, "morph-router");
  } finally {
    fetchStub.restore();
  }
});

test("a configured custom router that returns undefined still bypasses Morph", async () => {
  const fetchStub = stubFetch("deepseek-v4-flash");
  const routerPath = join(tmpdir(), `ccr-noop-router-${process.pid}.cjs`);
  writeFileSync(routerPath, "module.exports = async () => undefined;\n");
  try {
    const plugin = new ClaudeCodeRouterPlugin(baseConfig({ CUSTOM_ROUTER_PATH: routerPath } as Partial<AppConfig>));
    const { decision } = await plugin.routeRequest(userRequest());
    assert.equal(fetchStub.callCount(), 0, "Morph must not be called when a custom router is configured");
    assert.notEqual(decision.reason, "morph-router");
  } finally {
    fetchStub.restore();
    rmSync(routerPath, { force: true });
  }
});

test("an unreachable MorphRouter falls back to the default route", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  try {
    const plugin = new ClaudeCodeRouterPlugin(baseConfig());
    const { decision } = await plugin.routeRequest(userRequest());
    assert.equal(decision.reason, "default");
    assert.equal(decision.model, "openrouter/anthropic/claude-sonnet-4.6");
  } finally {
    globalThis.fetch = original;
  }
});

test("Morph's fallback chain appends the configured global fallback after its own targets", async () => {
  const fetchStub = recordingFetch("deepseek-v4-flash");
  try {
    const plugin = new ClaudeCodeRouterPlugin(
      baseConfig({
        Router: {
          default: "openrouter,anthropic/claude-sonnet-4.6",
          fallback: { mode: "model-chain", models: ["openrouter,anthropic/claude-sonnet-4.6"], retryCount: 2 },
          longContextThreshold: 200000,
          rules: []
        }
      })
    );
    const { decision } = await plugin.routeRequest(userRequest());
    assert.equal(decision.fallback?.mode, "model-chain");
    // Morph's remaining target first, then the user's configured global fallback.
    assert.deepEqual(decision.fallback?.models, ["deepseek/deepseek-chat", "openrouter/anthropic/claude-sonnet-4.6"]);
    assert.equal(decision.fallback?.retryCount, 2);
  } finally {
    fetchStub.restore();
  }
});

test("the prompt sent to the Morph API is sanitized (system-reminder stripped) and the decision is logged", async () => {
  const fetchStub = recordingFetch("deepseek-v4-flash");
  const log = captureInfo();
  try {
    const plugin = new ClaudeCodeRouterPlugin(baseConfig());
    await plugin.routeRequest({
      body: {
        model: "claude-3-5-sonnet",
        messages: [
          { role: "user", content: "refactor the auth module <system-reminder>SECRET_TOKEN_DO_NOT_LEAK</system-reminder>" }
        ]
      },
      headers: {},
      method: "POST",
      url: "/v1/messages"
    });

    const sent = fetchStub.lastBody();
    assert.ok(sent, "expected a payload to be sent to the Morph API");
    const input = String(sent!.input ?? "");
    assert.ok(input.includes("refactor the auth module"), "real prompt text should be present");
    assert.ok(!input.includes("SECRET_TOKEN_DO_NOT_LEAK"), "system-reminder content must be stripped");
    assert.ok(!/system-reminder/i.test(input), "system-reminder tags must be stripped");
    // allowed_models / policy / default_model are part of the contract.
    assert.ok(Array.isArray(sent!.allowed_models));
    assert.equal(sent!.policy, "balanced");

    const logged = log.lines().some((line) => /MorphRouter selected deepseek-v4-flash -> openrouter\/deepseek\/deepseek-v4-flash/.test(line));
    assert.ok(logged, `expected a MorphRouter selection log line; got: ${log.lines().join(" | ")}`);
  } finally {
    log.restore();
    fetchStub.restore();
  }
});

test("a subagent tag is stripped from the returned body so it is not forwarded upstream", async () => {
  const fetchStub = recordingFetch("deepseek-v4-flash");
  try {
    const config = baseConfig({
      Router: {
        default: "openrouter,anthropic/claude-sonnet-4.6",
        fallback: { mode: "off", models: [], retryCount: 1 },
        longContextThreshold: 200000,
        rules: [{ id: "subagent", type: "subagent", enabled: true } as never]
      }
    });
    const plugin = new ClaudeCodeRouterPlugin(config);
    const { body, decision } = await plugin.routeRequest({
      body: {
        model: "claude-3-5-sonnet",
        system: [
          { type: "text", text: "system" },
          { type: "text", text: "before <CCR-SUBAGENT-MODEL>openrouter,anthropic/claude-opus-4.8</CCR-SUBAGENT-MODEL> after" }
        ],
        messages: [{ role: "user", content: "subtask" }]
      },
      headers: {},
      method: "POST",
      url: "/v1/messages"
    });
    assert.equal(fetchStub.callCount(), 0, "Morph must not be called for subagent routing");
    assert.equal(decision.reason, "subagent");
    const system = body.system as Array<{ text?: string }>;
    assert.ok(!system[1].text?.includes("<CCR-SUBAGENT-MODEL>"), "the subagent tag must be stripped from the body");
    assert.ok(system[1].text?.includes("before") && system[1].text?.includes("after"), "surrounding text should remain");
  } finally {
    fetchStub.restore();
  }
});
