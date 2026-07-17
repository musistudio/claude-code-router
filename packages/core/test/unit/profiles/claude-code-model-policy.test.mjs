import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClaudeAppGatewayModelRoutes,
  resolveClaudeAppGatewayRouteModel
} from "@ccr/core/agents/claude-app/gateway-routes.ts";
import { createGatewayModelsResponse } from "@ccr/core/gateway/features/model-discovery.ts";
import {
  compileClaudeCodeAllowedModels,
  compileClaudeCodeModelSelector,
  isClaudeCodeModelAllowedByPolicy
} from "@ccr/core/profiles/claude-code-model-policy.ts";

function createConfig(providers) {
  return {
    Providers: providers,
    profile: {
      enabled: true,
      profiles: []
    },
    virtualModelProfiles: []
  };
}

test("Claude Code allowed models compile provider selectors to discovery route IDs", () => {
  const config = createConfig([
    {
      models: ["gpt-5.6-sol"],
      name: "openai",
      type: "openai_responses"
    }
  ]);
  const route = buildClaudeAppGatewayModelRoutes(config)
    .find((candidate) => candidate.targetModel === "openai/gpt-5.6-sol");
  const discovery = createGatewayModelsResponse(config, {
    "user-agent": "claude-code/2.1.211"
  });

  assert.ok(route);
  assert.ok(Array.isArray(discovery.data));
  assert.equal(
    discovery.data.some((model) => model.id === route.id),
    true,
    "the compiled ID must be the exact route published by gateway discovery"
  );

  const policy = compileClaudeCodeAllowedModels(config, [
    "opus",
    "fable",
    "openai/gpt-5.6-sol"
  ]);

  assert.deepEqual(policy, {
    availableModels: ["opus", "fable", route.id],
    enforceAvailableModels: true
  });
  assert.equal(compileClaudeCodeModelSelector(config, "openai/gpt-5.6-sol"), route.id);
  assert.equal(isClaudeCodeModelAllowedByPolicy(policy, route.id), true);
  assert.equal(isClaudeCodeModelAllowedByPolicy(policy, "fable[1m]"), true);
  assert.equal(policy.availableModels.some((model) => /haiku/i.test(model)), false);
  assert.equal(
    resolveClaudeAppGatewayRouteModel(route.id, config),
    "openai/gpt-5.6-sol"
  );
});

test("Claude Code model selectors normalize native context suffixes", () => {
  const config = createConfig([]);

  assert.equal(
    compileClaudeCodeModelSelector(config, "claude-opus-4-8 [1m]"),
    "claude-opus-4-8[1m]"
  );
  assert.equal(compileClaudeCodeModelSelector(config, "haiku[1m]"), "haiku[1m]");

  const concretePolicy = compileClaudeCodeAllowedModels(config, ["claude-opus-4-8"]);
  assert.equal(
    isClaudeCodeModelAllowedByPolicy(concretePolicy, "claude-opus-4-5"),
    false
  );
  assert.equal(
    isClaudeCodeModelAllowedByPolicy(
      compileClaudeCodeAllowedModels(config, ["opus"]),
      "claude-opus-4-5"
    ),
    true
  );
});

test("Claude Code model selectors preserve stock native version-prefix policy", () => {
  const config = createConfig([]);
  const policy = compileClaudeCodeAllowedModels(config, ["OPUS-4-5", "sonnet-4"]);

  assert.deepEqual(policy, {
    availableModels: ["opus-4-5", "sonnet-4"],
    enforceAvailableModels: true
  });
  assert.equal(compileClaudeCodeModelSelector(config, "OPUS-4-5"), "opus-4-5");
  assert.equal(isClaudeCodeModelAllowedByPolicy(policy, "opus"), true);
  assert.equal(
    isClaudeCodeModelAllowedByPolicy(policy, "claude-opus-4-5-20251101"),
    true
  );
  assert.equal(
    isClaudeCodeModelAllowedByPolicy(policy, "anthropic/claude-sonnet-4-20250514"),
    true
  );
  assert.equal(isClaudeCodeModelAllowedByPolicy(policy, "claude-opus-4-6"), false);
});

test("Claude Code model selectors honor bounded provider context metadata", () => {
  const config = createConfig([
    {
      modelMetadata: {
        "gpt-5.6-sol": {
          contextWindow: 272000,
          effectiveContextWindowPercent: 95,
          maxContextWindow: 272000
        }
      },
      models: ["gpt-5.6-sol"],
      name: "openai",
      type: "openai_responses"
    }
  ]);

  assert.throws(
    () => compileClaudeCodeModelSelector(config, "openai/gpt-5.6-sol[1m]"),
    /does not support 1M context/i
  );

  config.Providers[0].modelMetadata["gpt-5.6-sol"] = {
    contextWindow: 272_000,
    effectiveContextWindowPercent: 95,
    maxContextWindow: 1_000_000
  };
  assert.match(
    compileClaudeCodeModelSelector(config, "openai/gpt-5.6-sol[1m]"),
    /\[1m\]$/
  );

  config.Providers[0].modelMetadata["gpt-5.6-sol"] = {
    contextWindow: 1_000_000,
    effectiveContextWindowPercent: 95,
    maxContextWindow: 1_000_000
  };
  assert.match(
    compileClaudeCodeModelSelector(config, "openai/gpt-5.6-sol[1m]"),
    /\[1m\]$/
  );
});

test("Claude Code allowed models reject unknown and ambiguous provider selectors", () => {
  const config = createConfig([
    {
      models: ["gpt-5.6-sol", "shared-model"],
      name: "openai",
      type: "openai_responses"
    },
    {
      models: ["shared-model"],
      name: "other",
      type: "openai_responses"
    }
  ]);

  assert.throws(
    () => compileClaudeCodeAllowedModels(config, ["missing/model"]),
    /unknown|not configured/i
  );
  assert.throws(
    () => compileClaudeCodeAllowedModels(config, ["shared-model"]),
    /ambiguous/i
  );
});

test("Claude Code allowed models deduplicate aliases and provider routes case-insensitively", () => {
  const config = createConfig([
    {
      models: ["gpt-5.6-sol"],
      name: "openai",
      type: "openai_responses"
    }
  ]);
  const route = buildClaudeAppGatewayModelRoutes(config)
    .find((candidate) => candidate.targetModel === "openai/gpt-5.6-sol");
  assert.ok(route);

  assert.deepEqual(
    compileClaudeCodeAllowedModels(config, [
      "Opus",
      "opus",
      "FABLE",
      "fable",
      "openai/gpt-5.6-sol",
      "OPENAI/GPT-5.6-SOL"
    ]),
    {
      availableModels: ["opus", "fable", route.id],
      enforceAvailableModels: true
    }
  );
});

test("Claude Code allowed models reject encoded routes absent from current discovery", () => {
  const config = createConfig([
    {
      models: ["gpt-5.6-sol"],
      name: "openai",
      type: "openai_responses"
    }
  ]);
  const route = buildClaudeAppGatewayModelRoutes(config)
    .find((candidate) => candidate.targetModel === "openai/gpt-5.6-sol");
  assert.ok(route);
  const staleRouteId = `${route.id}00`;

  assert.equal(
    createGatewayModelsResponse(config, { "user-agent": "claude-code/2.1.211" })
      .data.some((model) => model.id === staleRouteId),
    false
  );
  assert.throws(
    () => compileClaudeCodeAllowedModels(config, [staleRouteId]),
    /not configured/i
  );
});

test("Claude Code allowed models enforce entry count, byte, and control-character limits", () => {
  const config = createConfig([]);
  const maximumEntries = Array.from(
    { length: 64 },
    (_, index) => `claude-opus-${index}`
  );
  const exactByteEntry = `claude-opus-${"x".repeat(512 - Buffer.byteLength("claude-opus-"))}`;
  const oversizedEntry = `${exactByteEntry}x`;

  assert.equal(
    compileClaudeCodeAllowedModels(config, maximumEntries).availableModels.length,
    64
  );
  assert.equal(
    compileClaudeCodeAllowedModels(config, [exactByteEntry]).availableModels[0],
    exactByteEntry
  );
  assert.throws(
    () => compileClaudeCodeAllowedModels(config, [...maximumEntries, "claude-opus-extra"]),
    /at most 64 entries/i
  );
  assert.throws(
    () => compileClaudeCodeAllowedModels(config, [oversizedEntry]),
    /512 UTF-8 bytes/i
  );
  assert.throws(
    () => compileClaudeCodeAllowedModels(config, ["opus\u0000hidden"]),
    /control characters/i
  );
});
