import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBuiltInAgentRoutingRows,
  normalizeRouteScriptSampleRequest,
  normalizeRouterRules,
  routerBuiltInAgentProfile,
  routerBuiltInAgentRouteTarget,
  routerBuiltInAgentRuleDisabledReason,
  routerBuiltInAgentRuleIsActive
} from "@ccr/ui/pages/home/shared/routing.ts";
import {
  createRoutingRuleDraft,
  createRoutingRuleDraftFromRule,
  isRoutingRuleDraftSubmittable
} from "@ccr/ui/pages/home/shared/providers.ts";
import { appConfigFixture } from "../fixtures/index.ts";

test("Codex built-in route accepts a later enabled profile with a configured model", () => {
  const config = appConfigFixture();
  config.profile.profiles = [
    {
      agent: "codex",
      enabled: true,
      id: "codex",
      model: "",
      name: "Codex",
      scope: "ccr"
    },
    {
      agent: "codex",
      enabled: true,
      id: "bs-2",
      model: "uuroute/gpt-5.5",
      name: "BS",
      scope: "ccr"
    }
  ];

  assert.equal(routerBuiltInAgentProfile(config, "codex")?.id, "bs-2");
  assert.equal(routerBuiltInAgentRouteTarget(config, "codex"), "uuroute/gpt-5.5");
  assert.equal(routerBuiltInAgentRuleDisabledReason(config, "codex"), undefined);
  assert.equal(routerBuiltInAgentRuleIsActive(config, "codex"), true);
  assert.equal(
    buildBuiltInAgentRoutingRows(config).find((row) => row.builtInAgent === "codex")?.target,
    "set request.body.model = uuroute/gpt-5.5"
  );
});

test("Codex built-in route asks for a model only when every enabled Codex profile is unset", () => {
  const config = appConfigFixture();
  config.profile.profiles = [
    {
      agent: "codex",
      enabled: true,
      id: "codex",
      model: "  ",
      name: "Codex",
      scope: "ccr"
    },
    {
      agent: "codex",
      enabled: true,
      id: "bs-2",
      model: "",
      name: "BS",
      scope: "ccr"
    }
  ];

  assert.equal(
    routerBuiltInAgentRuleDisabledReason(config, "codex"),
    "Set a model on the Codex profile before enabling this built-in route."
  );
  assert.equal(routerBuiltInAgentRuleIsActive(config, "codex"), false);
});

test("routing UI preserves the Node.js script file and timeout", () => {
  const rules = normalizeRouterRules([{
    enabled: true,
    id: "node-script",
    name: "Node script",
    script: {
      apiVersion: 1,
      file: "/tmp/route-script.js",
      language: "javascript",
      permissions: {
        environment: ["ROUTER_TOKEN"],
        filesystem: { read: ["~/.config/router"], write: ["~/.cache/router"] },
        network: ["https://api.example.com/v1"]
      },
      readPaths: ["request.body.metadata"],
      timeoutMs: 3500
    },
    type: "script"
  }]);

  assert.equal(rules?.[0]?.type, "script");
  const draft = createRoutingRuleDraftFromRule(rules![0]);
  assert.equal(draft.type, "script");
  assert.equal(draft.scriptFile, "/tmp/route-script.js");
  assert.equal(draft.scriptTimeoutMs, "3500");
  assert.deepEqual(draft.rewrites, []);
  assert.deepEqual(rules?.[0]?.script, {
    apiVersion: 1,
    file: "/tmp/route-script.js",
    language: "javascript",
    timeoutMs: 3500
  });
});

test("script routing drafts do not depend on request rewrite rows", () => {
  const draft = createRoutingRuleDraft();
  draft.name = "Script";
  draft.type = "script";
  draft.scriptFile = "/tmp/route-script.js";
  draft.rewrites = [];
  assert.equal(isRoutingRuleDraftSubmittable(draft), true);

  draft.rewrites = [{
    id: "incomplete",
    key: "request.body.temperature",
    match: "",
    operation: "set",
    value: ""
  }];
  assert.equal(isRoutingRuleDraftSubmittable(draft), true);
});

test("route script test JSON accepts request headers and body together", () => {
  assert.deepEqual(normalizeRouteScriptSampleRequest({
    body: { messages: [{ role: "user", content: "hello" }], model: "Provider/alpha" },
    headers: {
      authorization: "Bearer test",
      "x-tags": ["one", "two"]
    },
    method: "POST",
    url: "/v1/messages"
  }), {
    body: { messages: [{ role: "user", content: "hello" }], model: "Provider/alpha" },
    headers: {
      authorization: "Bearer test",
      "x-tags": ["one", "two"]
    },
    method: "POST",
    url: "/v1/messages"
  });
  assert.throws(
    () => normalizeRouteScriptSampleRequest({ body: {}, headers: { invalid: 123 } }),
    /headers/i
  );
});
