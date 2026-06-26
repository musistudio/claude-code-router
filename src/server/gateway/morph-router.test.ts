import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMorphRouterConfig,
  extractMorphRouterInput,
  sanitizeMorphRouterInput,
  getMorphRouterDecision
} from "./morph-router";

const providers = [
  { name: "openrouter", models: ["anthropic/claude-sonnet-4.6", "anthropic/claude-opus-4.8", "deepseek/deepseek-v4-flash"] },
  { name: "deepseek", models: ["deepseek-chat"] }
];

const jsonResponse = (value: unknown, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(value), { status })) as unknown as typeof fetch;

test("valid config normalizes with no errors and preserves multi-target order", () => {
  const config = normalizeMorphRouterConfig(
    {
      enabled: true,
      api_key: "sk-test",
      policy: "balanced",
      default_model: "claude-sonnet-4-6",
      models: {
        "claude-sonnet-4-6": "openrouter,anthropic/claude-sonnet-4.6",
        "deepseek-v4-flash": { targets: ["openrouter,deepseek/deepseek-v4-flash", "deepseek,deepseek-chat"] }
      }
    },
    providers
  );
  assert.deepEqual(config.errors, []);
  assert.equal(config.enabled, true);
  assert.deepEqual([...config.allowedModels].sort(), ["claude-sonnet-4-6", "deepseek-v4-flash"]);
  const flash = config.models.find((model) => model.name === "deepseek-v4-flash");
  assert.equal(flash?.targets.length, 2);
  assert.equal(flash?.targets[0].route, "openrouter,deepseek/deepseek-v4-flash");
  assert.equal(flash?.targets[1].route, "deepseek,deepseek-chat");
});

test("missing api key and an unknown route both surface errors", () => {
  const config = normalizeMorphRouterConfig(
    { enabled: true, default_model: "x", models: { x: "nope,model-x" } },
    providers
  );
  assert.ok(config.errors.some((error) => error.includes("api_key is required")));
  assert.ok(config.errors.some((error) => error.includes("does not match any configured provider")));
});

test("default_model must reference one of the configured models", () => {
  const config = normalizeMorphRouterConfig(
    {
      enabled: true,
      api_key: "k",
      default_model: "ghost",
      models: { "claude-sonnet-4-6": "openrouter,anthropic/claude-sonnet-4.6" }
    },
    providers
  );
  assert.ok(config.errors.some((error) => error.includes('default_model "ghost"')));
});

test("disabled config short-circuits without validation errors", () => {
  const config = normalizeMorphRouterConfig({ enabled: false }, providers);
  assert.equal(config.enabled, false);
  assert.deepEqual(config.errors, []);
});

test("input extraction prefers the latest user text and strips system reminders", () => {
  const body = {
    messages: [
      { role: "user", content: "old question" },
      { role: "assistant", content: "hi" },
      { role: "user", content: [{ type: "text", text: "real question <system-reminder>secret</system-reminder>" }] }
    ]
  };
  assert.equal(extractMorphRouterInput(body, 24000), "real question");
});

test("sanitize strips session tags and trims", () => {
  assert.equal(sanitizeMorphRouterInput("  <session>hello</session>  "), "hello");
});

test("getMorphRouterDecision maps the Morph model to its primary target and fallback chain", async () => {
  const decision = await getMorphRouterDecision({
    rawConfig: {
      enabled: true,
      api_key: "k",
      default_model: "deepseek-v4-flash",
      models: { "deepseek-v4-flash": { targets: ["openrouter,deepseek/deepseek-v4-flash", "deepseek,deepseek-chat"] } }
    },
    providers,
    requestBody: { messages: [{ role: "user", content: "a hard task" }] },
    fetchImpl: jsonResponse({ model: "deepseek-v4-flash", confidence: 0.9 })
  });
  assert.ok(decision);
  assert.equal(decision?.target.route, "openrouter,deepseek/deepseek-v4-flash");
  assert.equal(decision?.fallbackTargets[0].route, "deepseek,deepseek-chat");
  assert.equal(decision?.morphModel, "deepseek-v4-flash");
});

test("an unmapped Morph model falls back gracefully (undefined)", async () => {
  const decision = await getMorphRouterDecision({
    rawConfig: {
      enabled: true,
      api_key: "k",
      default_model: "claude-sonnet-4-6",
      models: { "claude-sonnet-4-6": "openrouter,anthropic/claude-sonnet-4.6" }
    },
    providers,
    requestBody: { messages: [{ role: "user", content: "x" }] },
    fetchImpl: jsonResponse({ model: "unknown-model" })
  });
  assert.equal(decision, undefined);
});

test("an HTTP error from Morph falls back gracefully (undefined)", async () => {
  const decision = await getMorphRouterDecision({
    rawConfig: {
      enabled: true,
      api_key: "k",
      default_model: "claude-sonnet-4-6",
      models: { "claude-sonnet-4-6": "openrouter,anthropic/claude-sonnet-4.6" }
    },
    providers,
    requestBody: { messages: [{ role: "user", content: "x" }] },
    fetchImpl: jsonResponse("nope", 500)
  });
  assert.equal(decision, undefined);
});

test("a disabled Morph router yields no decision", async () => {
  const decision = await getMorphRouterDecision({
    rawConfig: { enabled: false },
    providers,
    requestBody: { messages: [{ role: "user", content: "x" }] },
    fetchImpl: jsonResponse({ model: "claude-sonnet-4-6" })
  });
  assert.equal(decision, undefined);
});
