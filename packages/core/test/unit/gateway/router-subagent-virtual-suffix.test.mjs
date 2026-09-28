import assert from "node:assert/strict";
import test from "node:test";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import { prepareClaudeAppDiscoveredModelRequest } from "@ccr/core/gateway/features/model-discovery.ts";
import { prepareGatewayUpstreamAttemptForTest } from "@ccr/core/gateway/service.ts";

// Issue #1693: a claude-code profile model carrying the "[1m]" virtual suffix is
// injected verbatim by the subagent remap path (cc_is_subagent), after ingress
// virtual-suffix normalization has already run for the client-supplied model.
// The suffixed string is forwarded to the upstream provider and fails with 404.

function createIssue1693Config(options = {}) {
  return {
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      {
        models: options.providerModels ?? ["claude-fable-5", "claude-fable-5[1m]"],
        name: "Provider",
        type: "anthropic_messages"
      }
    ],
    Router: {
      builtInRules: {
        "claude-code": { enabled: true },
        codex: { enabled: true }
      },
      fallback: { mode: "off", models: [], retryCount: 1 },
      rules: []
    },
    profile: {
      enabled: true,
      profiles: [
        {
          agent: "claude-code",
          enabled: true,
          env: options.profileEnv ?? {},
          id: "claude-code-profile",
          model: options.profileModel ?? "Provider/claude-fable-5[1m]",
          name: "Claude Code",
          scope: "global"
        }
      ]
    },
    virtualModelProfiles: []
  };
}

function claudeCodeSubagentBillingSystem() {
  return [
    {
      text: "x-anthropic-billing-header: cc_version=2.1.233; cc_entrypoint=cli; cc_is_subagent=true;",
      type: "text"
    },
    {
      text: "You are a helpful subagent.",
      type: "text"
    }
  ];
}

function routeIssue1693Request(config, body) {
  const plugin = new ClaudeCodeRouterPlugin(config);
  return plugin.routeRequest({
    body,
    headers: {
      "user-agent": "claude-cli/2.1.233 (external, cli)",
      "x-auth-api-key-id": "profile:claude-code-profile"
    },
    method: "POST",
    url: "/v1/messages"
  });
}

test("issue 1693 subagent remap normalizes the [1m] virtual suffix on the profile model", async () => {
  const config = createIssue1693Config();
  const result = await routeIssue1693Request(config, {
    messages: [],
    model: "Provider/claude-fable-5",
    system: claudeCodeSubagentBillingSystem()
  });

  assert.equal(result.body.model, "Provider/claude-fable-5");
  assert.doesNotMatch(result.body.model, /\[1m\]$/);
  assert.equal(result.decision.model, "Provider/claude-fable-5");
  assert.equal(result.decision.reason, "builtin:claude-code");
});

test("issue 1693 subagent remap strips the suffix from a bare [1m] profile model", async () => {
  const config = createIssue1693Config({ profileModel: "claude-fable-5[1m]" });
  const result = await routeIssue1693Request(config, {
    messages: [],
    model: "Provider/claude-fable-5",
    system: claudeCodeSubagentBillingSystem()
  });

  assert.equal(result.body.model, "Provider/claude-fable-5");
  assert.doesNotMatch(result.body.model, /\[1m\]$/);
  assert.equal(result.decision.reason, "builtin:claude-code");
});

test("issue 1693 subagent remap forwards a suffix-free wire model upstream", async () => {
  const config = createIssue1693Config();
  const result = await routeIssue1693Request(config, {
    messages: [],
    model: "Provider/claude-fable-5",
    system: claudeCodeSubagentBillingSystem()
  });

  const upstreamAttempt = prepareGatewayUpstreamAttemptForTest({
    body: result.body,
    config,
    fallback: result.decision.fallback,
    headers: {},
    method: "POST",
    path: "/v1/messages",
    routedModel: result.decision.model
  });

  assert.equal(upstreamAttempt.body.model, "claude-fable-5");
  assert.doesNotMatch(upstreamAttempt.body.model, /\[1m\]$/);
});

test("issue 1693 subagent env remap normalizes a [1m] virtual suffix", async () => {
  const config = createIssue1693Config({
    profileEnv: { CLAUDE_CODE_SUBAGENT_MODEL: "Provider/claude-fable-5[1m]" },
    profileModel: "Provider/claude-fable-5"
  });
  const result = await routeIssue1693Request(config, {
    messages: [],
    model: "Provider/claude-fable-5",
    system: claudeCodeSubagentBillingSystem()
  });

  assert.equal(result.body.model, "Provider/claude-fable-5");
  assert.doesNotMatch(result.body.model, /\[1m\]$/);
  assert.equal(result.decision.model, "Provider/claude-fable-5");
  assert.equal(result.decision.reason, "builtin:claude-code-subagent-env");
});

test("issue 1693 subagent remap resolves a [1m] profile model against the bare provider entry", async () => {
  const config = createIssue1693Config({
    profileModel: "Provider/claude-fable-5[1m]",
    providerModels: ["claude-fable-5"]
  });
  const result = await routeIssue1693Request(config, {
    messages: [],
    model: "Provider/claude-fable-5",
    system: claudeCodeSubagentBillingSystem()
  });

  assert.equal(result.body.model, "Provider/claude-fable-5");
  assert.equal(result.decision.model, "Provider/claude-fable-5");
  assert.equal(result.decision.reason, "builtin:claude-code");
});

test("issue 1693 parent-session client models keep the ingress [1m] normalization", async () => {
  const config = createIssue1693Config();

  // Ingress rewrite (pipeline phase) normalizes the client-supplied suffixed id
  // the same way the parent session experiences it.
  const ingress = prepareClaudeAppDiscoveredModelRequest(
    config,
    "POST",
    "/v1/messages",
    Buffer.from(JSON.stringify({ messages: [], model: "Provider/claude-fable-5[1m]" }))
  );
  assert.equal(ingress?.routedModel, "Provider/claude-fable-5");

  const result = await routeIssue1693Request(config, {
    messages: [],
    model: ingress.routedModel
  });

  assert.equal(result.body.model, "Provider/claude-fable-5");
  assert.doesNotMatch(result.body.model, /\[1m\]$/);
});
