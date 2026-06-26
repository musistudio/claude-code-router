import { test } from "node:test";
import assert from "node:assert/strict";
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
