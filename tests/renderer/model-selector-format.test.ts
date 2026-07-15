import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProviderModelSelector } from "../../packages/ui/src/pages/home/shared/common.ts";
import { normalizeProfileClientModel } from "../../packages/ui/src/pages/home/shared/profiles.ts";
import {
  createRouteModelOptions,
  createRoutingRewriteDraftRowFromRewrite,
  routingRewriteFromDraftRow
} from "../../packages/ui/src/pages/home/shared/providers.ts";
import {
  composeRouteTargetValue,
  normalizeRouterFallbackConfig,
  normalizeRouterRules
} from "../../packages/ui/src/pages/home/shared/routing.ts";
import { normalizeCoreModelSelector } from "../../packages/ui/src/pages/home/shared/virtual-models.ts";

test("route model options emit slash-form provider selectors", () => {
  const options = createRouteModelOptions([
    {
      models: ["glm-5"],
      name: "Zhipu"
    } as any
  ]);

  assert.deepEqual(options, [
    {
      label: "Zhipu/glm-5",
      value: "Zhipu/glm-5"
    }
  ]);
});

test("UI model selector helpers normalize legacy comma selectors", () => {
  assert.equal(normalizeProviderModelSelector("Zhipu,glm-5"), "Zhipu/glm-5");
  assert.equal(normalizeProfileClientModel("Zhipu,glm-5"), "Zhipu/glm-5");
  assert.equal(normalizeCoreModelSelector("Zhipu,glm-5"), "Zhipu/glm-5");
  assert.equal(composeRouteTargetValue("Zhipu", "glm-5"), "Zhipu/glm-5");
});

test("router UI drafts read and write model selectors in slash form", () => {
  const row = createRoutingRewriteDraftRowFromRewrite({
    key: "request.body.model",
    operation: "set",
    value: "Zhipu,glm-5"
  });

  assert.equal(row.value, "Zhipu/glm-5");
  assert.equal(routingRewriteFromDraftRow({ ...row, value: "Zhipu,glm-5" }).value, "Zhipu/glm-5");

  const fallback = normalizeRouterFallbackConfig({
    mode: "model-chain",
    models: ["Zhipu,glm-5"],
    retryCount: 1
  });
  assert.deepEqual(fallback.models, ["Zhipu/glm-5"]);

  const rules = normalizeRouterRules([
    {
      condition: {
        left: "request.body.model",
        operator: "==",
        right: "claude"
      },
      id: "legacy-comma",
      rewrite: {
        key: "request.body.model",
        value: "Zhipu,glm-5"
      },
      type: "condition"
    }
  ]);

  assert.equal(rules?.[0]?.rewrite?.value, "Zhipu/glm-5");
});
