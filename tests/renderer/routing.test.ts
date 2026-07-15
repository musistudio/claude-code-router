import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import {
  buildBuiltInAgentRoutingRows,
  routerBuiltInAgentProfile,
  routerBuiltInAgentRouteTarget,
  routerBuiltInAgentRuleDisabledReason,
  routerBuiltInAgentRuleIsActive
} from "../../packages/ui/src/pages/home/shared/routing.ts";

test("Codex built-in route accepts a later enabled profile with a configured model", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-generated.json" });
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
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-generated.json" });
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
