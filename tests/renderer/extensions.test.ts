import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig, PluginMarketplaceEntry } from "../../packages/core/src/contracts/app.ts";
import { resolvePluginInstallPlan } from "../../packages/ui/src/pages/home/shared/extensions.ts";
import type { PluginInstallCandidate } from "../../packages/ui/src/pages/home/shared/types.ts";

test("extension install dependencies require enabled installed plugins with required surfaces", () => {
  const marketplace: PluginMarketplaceEntry[] = [{
    capabilities: ["Gateway"],
    dependencies: [],
    description: "Dependency plugin",
    id: "dependency",
    modulePath: "/tmp/dependency.cjs",
    name: "Dependency",
    permissions: ["trusted-code", "gateway-routes"]
  }];
  const root: PluginInstallCandidate = {
    dependencies: [{ id: "dependency", surfaces: { gateway: true } }],
    id: "root",
    modulePath: "/tmp/root.cjs",
    name: "Root",
    permissions: ["trusted-code"],
    surfaces: { gateway: true }
  };

  const disabledPlan = resolvePluginInstallPlan(root, marketplace, [{
    enabled: false,
    id: "dependency",
    module: "/tmp/dependency.cjs",
    permissions: ["trusted-code", "gateway-routes"],
    surfaces: { apps: false, gateway: true, provider: false }
  }]);
  assert.deepEqual(disabledPlan.missing, ["dependency"]);

  const surfaceDisabledPlan = resolvePluginInstallPlan(root, marketplace, [{
    enabled: true,
    id: "dependency",
    module: "/tmp/dependency.cjs",
    permissions: ["trusted-code", "gateway-routes"],
    surfaces: { apps: true, gateway: false, provider: false }
  }]);
  assert.deepEqual(surfaceDisabledPlan.missing, ["dependency"]);

  const satisfiedPlan = resolvePluginInstallPlan(root, marketplace, [{
    enabled: true,
    id: "dependency",
    module: "/tmp/dependency.cjs",
    permissions: ["trusted-code", "gateway-routes"],
    surfaces: { apps: false, gateway: true, provider: false }
  }]);
  assert.deepEqual(satisfiedPlan.missing, []);
  assert.deepEqual(satisfiedPlan.items.map((item) => item.id), ["root"]);
});

test("extension install dependencies without required surfaces still require enabled installed plugins", () => {
  const root: PluginInstallCandidate = {
    dependencies: [{ id: "dependency" }],
    id: "root",
    modulePath: "/tmp/root.cjs",
    name: "Root",
    permissions: ["trusted-code"],
    surfaces: { gateway: true }
  };
  const installed: AppConfig["plugins"] = [{
    enabled: false,
    id: "dependency",
    module: "/tmp/dependency.cjs",
    permissions: ["trusted-code"]
  }];

  const plan = resolvePluginInstallPlan(root, [], installed);
  assert.deepEqual(plan.missing, ["dependency"]);
});
