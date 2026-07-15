import assert from "node:assert/strict";
import test from "node:test";
import { applyAgentRequestEnrichers } from "@ccr/core/agents/request-enricher.ts";
import { shouldApplyGatewayRouting } from "@ccr/core/gateway/service.ts";
import { compileRouterConfig } from "@ccr/core/routing/config-compiler.ts";
import { createRouteExecutionPlan } from "@ccr/core/routing/execution-plan.ts";
import { classifyRouteFailure } from "@ccr/core/routing/failure-classifier.ts";
import { ModelRegistry } from "@ccr/core/routing/model-registry.ts";
import { RoutePolicyEngine } from "@ccr/core/routing/policy-engine.ts";
import {
  adaptRouteRequestBody,
  restoreRouteRequestBody,
  rewriteRouteModelInUrl
} from "@ccr/core/routing/protocol-adapter.ts";

function routingConfig(overrides = {}) {
  return {
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      { models: ["shared", "alpha"], name: "Primary" },
      { models: ["shared", "beta"], name: "Secondary" }
    ],
    Router: {
      builtInRules: {
        "claude-code": { enabled: true },
        codex: { enabled: true }
      },
      fallback: { mode: "off", models: [], retryCount: 0 },
      rules: []
    },
    profile: { enabled: true, profiles: [] },
    virtualModelProfiles: [],
    ...overrides
  };
}

test("model registry canonicalizes provider models and rejects ambiguous bare models", () => {
  const registry = new ModelRegistry(routingConfig());

  assert.equal(registry.resolve("Primary/alpha")?.canonicalSelector, "Primary/alpha");
  assert.equal(registry.resolve("alpha")?.canonicalSelector, "Primary/alpha");
  assert.equal(registry.resolve("shared"), undefined);
  assert.equal(registry.resolve("Primary,alpha")?.selector, "Primary/alpha");
  assert.equal(registry.resolve("Primary/not-configured"), undefined);
});

test("model registry accepts known internal provider suffixes only", () => {
  const registry = new ModelRegistry(routingConfig());

  assert.equal(registry.findProvider("Primary::openai_chat_completions")?.name, "Primary");
  assert.equal(registry.findProvider("Primary::openai_chat_completions::cred:main")?.name, "Primary");
  assert.equal(registry.findProvider("Primary::openai_chat_completions::cred:"), undefined);
  assert.equal(registry.findProvider("Primary::bogus"), undefined);
});

test("router config compilation disables invalid rules and reports their model", () => {
  const config = routingConfig();
  config.Router.rules = [
    {
      condition: { left: "request.url", operator: "contains", right: "/v1" },
      enabled: true,
      id: "invalid",
      name: "Invalid model",
      rewrites: [{ key: "request.body.model", operation: "set", value: "Primary/missing" }],
      type: "condition"
    },
    {
      condition: { left: "request.url", operator: "contains", right: "/v1" },
      enabled: true,
      id: "valid",
      name: "Valid model",
      rewrites: [{ key: "request.body.model", operation: "set", value: "Primary/alpha" }],
      type: "condition"
    }
  ];

  const compiled = compileRouterConfig(config);

  assert.equal(compiled.rules[0].active, false);
  assert.equal(compiled.rules[1].active, true);
  assert.equal(compiled.rules[0].diagnostics[0].code, "rule-model-not-configured");
  assert.equal(compiled.rules[0].diagnostics[0].model, "Primary/missing");
});

test("router config compilation uses the final model rewrite", () => {
  const config = routingConfig();
  config.Router.rules = [{
    condition: { left: "request.url", operator: "contains", right: "/v1" },
    enabled: true,
    id: "final-model",
    name: "Final model wins",
    rewrites: [
      { key: "request.body.model", operation: "set", value: "Primary/missing" },
      { key: "request.body.model", operation: "set", value: "Primary/alpha" }
    ],
    type: "condition"
  }];

  const compiled = compileRouterConfig(config);

  assert.equal(compiled.rules[0].active, true);
  assert.deepEqual(compiled.rules[0].diagnostics, []);
  assert.equal(compiled.rules[0].model?.canonicalSelector, "Primary/alpha");
});

test("router config compilation filters invalid global fallback models", () => {
  const config = routingConfig();
  config.Router.fallback = {
    mode: "model-chain",
    models: ["Primary/alpha", "Secondary/missing", "Secondary/beta"],
    retryCount: 0
  };

  const compiled = compileRouterConfig(config);

  assert.deepEqual(compiled.fallback.models, ["Primary/alpha", "Secondary/beta"]);
  assert.equal(compiled.diagnostics[0].code, "fallback-model-not-configured");
});

test("router config compilation rejects conflicting provider and model targets", () => {
  const config = routingConfig();
  config.Router.rules = [{
    condition: { left: "request.url", operator: "contains", right: "/v1" },
    enabled: true,
    id: "conflict",
    name: "Conflicting target",
    rewrites: [
      { key: "request.header.x-target-provider", operation: "set", value: "Secondary" },
      { key: "request.body.model", operation: "set", value: "Primary/alpha" }
    ],
    type: "condition"
  }];

  const compiled = compileRouterConfig(config);

  assert.equal(compiled.rules[0].active, false);
  assert.equal(compiled.rules[0].diagnostics[0].code, "rule-provider-model-conflict");
});

test("router config compilation validates provider conflicts against final header rewrites", () => {
  const config = routingConfig();
  config.Router.rules = [
    {
      condition: { left: "request.url", operator: "contains", right: "/v1" },
      enabled: true,
      id: "case-conflict",
      name: "Case-insensitive conflict",
      rewrites: [
        { key: "request.header.X-Target-Provider", operation: "set", value: "Secondary" },
        { key: "request.body.model", operation: "set", value: "Primary/alpha" }
      ],
      type: "condition"
    },
    {
      condition: { left: "request.url", operator: "contains", right: "/v1" },
      enabled: true,
      id: "final-provider",
      name: "Final provider wins",
      rewrites: [
        { key: "request.header.x-target-provider", operation: "set", value: "Secondary" },
        { key: "request.header.x-target-provider", operation: "set", value: "Primary" },
        { key: "request.body.model", operation: "set", value: "alpha" }
      ],
      type: "condition"
    }
  ];

  const compiled = compileRouterConfig(config);

  assert.equal(compiled.rules[0].active, false);
  assert.equal(compiled.rules[0].diagnostics[0].code, "rule-provider-model-conflict");
  assert.equal(compiled.rules[1].active, true);
  assert.deepEqual(compiled.rules[1].diagnostics, []);
  assert.equal(compiled.rules[1].model?.canonicalSelector, "Primary/alpha");
});

test("router config compilation ignores diagnostics from disabled rules", () => {
  const config = routingConfig();
  config.Router.rules = [{
    condition: { left: "request.url", operator: "contains", right: "/v1" },
    enabled: false,
    fallback: {
      mode: "model-chain",
      models: ["Secondary/missing"],
      retryCount: 0
    },
    id: "disabled-invalid",
    name: "Disabled invalid rule",
    rewrites: [{ key: "request.body.model", operation: "set", value: "Primary/missing" }],
    type: "condition"
  }];

  const compiled = compileRouterConfig(config);

  assert.equal(compiled.rules[0].active, false);
  assert.deepEqual(compiled.rules[0].diagnostics, []);
  assert.deepEqual(compiled.diagnostics, []);
});

test("route policy engine returns the first matching policy", () => {
  const engine = new RoutePolicyEngine([
    { evaluate: () => undefined, id: "custom" },
    { evaluate: () => ({ model: "Primary/alpha" }), id: "rule:first" },
    { evaluate: () => ({ model: "Secondary/beta" }), id: "default" }
  ]);

  const match = engine.evaluate({});

  assert.equal(match.policyId, "rule:first");
  assert.equal(match.decision.model, "Primary/alpha");
});

test("execution planner includes primary and de-duplicated fallback attempts", () => {
  const plan = createRouteExecutionPlan({
    bodyModel: "Primary/alpha",
    fallback: {
      mode: "model-chain",
      models: ["Primary/alpha", "Secondary/beta", "Secondary/beta"],
      retryCount: 0
    },
    hasRequestBody: true
  });

  assert.deepEqual(plan.attempts, [
    { index: 0, model: "Primary/alpha" },
    { index: 1, model: "Secondary/beta" }
  ]);
});

test("failure classifier keeps retry and model-chain policies explicit", () => {
  assert.deepEqual(classifyRouteFailure(400, "retry"), {
    failureClass: "client",
    shouldFallback: false
  });
  assert.equal(classifyRouteFailure(400, "model-chain").shouldFallback, true);
  assert.equal(classifyRouteFailure(429, "retry").shouldFallback, true);
  assert.equal(classifyRouteFailure(503, "retry").failureClass, "server");
});

test("gateway routing runs for body-model protocols independent of agent user-agent", () => {
  assert.equal(shouldApplyGatewayRouting("POST", "/v1/messages"), true);
  assert.equal(shouldApplyGatewayRouting("POST", "/v1/chat/completions"), true);
  assert.equal(shouldApplyGatewayRouting("POST", "/v1/responses"), true);
  assert.equal(shouldApplyGatewayRouting("POST", "/v1beta/interactions"), true);
  assert.equal(shouldApplyGatewayRouting("POST", "/v1beta/interactions/interaction-123"), false);
  assert.equal(shouldApplyGatewayRouting("POST", "/v1beta/interactions/interaction-123/cancel"), false);
  assert.equal(shouldApplyGatewayRouting("POST", "/v1beta/models/gemini:generateContent"), true);
  assert.equal(shouldApplyGatewayRouting("GET", "/v1/messages"), false);
});

test("Gemini path-model adapter routes and restores generateContent requests", () => {
  const adaptation = adaptRouteRequestBody(
    "/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse",
    { contents: [] }
  );

  assert.equal(adaptation.modelLocation, "path");
  assert.equal(adaptation.body.model, "gemini-2.5-pro");
  assert.deepEqual(restoreRouteRequestBody({ ...adaptation.body, model: "Provider/gemini-next" }, adaptation), {
    contents: []
  });
  assert.equal(
    rewriteRouteModelInUrl(
      "http://127.0.0.1:3457/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse",
      "Provider/gemini-next"
    ),
    "http://127.0.0.1:3457/v1beta/models/Provider%2Fgemini-next:streamGenerateContent?alt=sse"
  );
});

test("body-model protocols do not require route input adaptation", () => {
  const body = { messages: [], model: "claude-sonnet" };
  const adaptation = adaptRouteRequestBody("/v1/messages", body);

  assert.equal(adaptation.modelLocation, "body");
  assert.equal(adaptation.body, body);
});

test("agent enrichers run only for matching agent contexts", () => {
  const request = { agent: "claude-code", enriched: [] };
  const applied = applyAgentRequestEnrichers(request, [
    {
      enrich: (value) => value.enriched.push("claude"),
      id: "claude-code",
      matches: (value) => value.agent === "claude-code"
    },
    {
      enrich: (value) => value.enriched.push("codex"),
      id: "codex",
      matches: (value) => value.agent === "codex"
    }
  ]);

  assert.deepEqual(applied, ["claude-code"]);
  assert.deepEqual(request.enriched, ["claude"]);
});
