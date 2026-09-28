import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig, PluginMarketplaceEntry } from "@ccr/core/contracts/app.ts";
import { pluginConfigPatchFromSettingsDraft, resolvePluginInstallPlan } from "@ccr/ui/pages/home/shared/extensions.ts";
import type { PluginInstallCandidate, PluginSettingsDraft } from "@ccr/ui/pages/home/shared/types.ts";

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

test("plugin settings draft persists advanced fields", () => {
  const draft: PluginSettingsDraft = {
    appsSurfaceEnabled: true,
    appsText: JSON.stringify([{ name: "Console", url: "/plugins/console" }]),
    configText: JSON.stringify({ message: "hello" }),
    coreGatewayText: JSON.stringify({ config: { billing: { enabled: true } } }),
    enabled: true,
    gatewaySurfaceEnabled: false,
    modulePath: " /tmp/plugin.cjs ",
    permissionsText: JSON.stringify(["trusted-code", "apps"]),
    providerSurfaceEnabled: true,
    proxyText: JSON.stringify({
      routes: [{ host: "api.example.com", upstream: "http://127.0.0.1:1234" }]
    })
  };

  const result = pluginConfigPatchFromSettingsDraft({ routing: { enabled: true } }, draft);
  if (!result.ok) {
    assert.fail(result.message);
  }

  assert.deepEqual(result.value, {
    apps: [{ name: "Console", url: "/plugins/console" }],
    config: {
      message: "hello",
      routing: { enabled: true }
    },
    coreGateway: { config: { billing: { enabled: true } } },
    enabled: true,
    module: "/tmp/plugin.cjs",
    permissions: ["trusted-code", "apps"],
    proxy: {
      routes: [{ host: "api.example.com", upstream: "http://127.0.0.1:1234" }]
    },
    surfaces: { apps: true, gateway: false, provider: true }
  });
});

test("plugin settings draft omits empty advanced objects", () => {
  const draft: PluginSettingsDraft = {
    appsSurfaceEnabled: true,
    appsText: "[]",
    configText: "{}",
    coreGatewayText: "{}",
    enabled: false,
    gatewaySurfaceEnabled: true,
    modulePath: " ",
    permissionsText: "[]",
    providerSurfaceEnabled: true,
    proxyText: "{}"
  };

  const result = pluginConfigPatchFromSettingsDraft(undefined, draft);
  if (!result.ok) {
    assert.fail(result.message);
  }

  assert.deepEqual(result.value, {
    apps: undefined,
    config: undefined,
    coreGateway: undefined,
    enabled: false,
    module: undefined,
    permissions: undefined,
    proxy: undefined,
    surfaces: undefined
  });
});
