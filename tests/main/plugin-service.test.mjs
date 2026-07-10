import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import { pluginService } from "../../packages/core/src/plugins/service.ts";

test("plugin service skips failed plugins and rolls back their registrations", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-plugin-service-test-"));
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));

  try {
    const brokenPlugin = path.join(dir, "broken-plugin.cjs");
    const goodPlugin = path.join(dir, "good-plugin.cjs");
    writeFileSync(brokenPlugin, `
module.exports = async function brokenPlugin(context) {
  context.registerApp({ id: "broken-context-app", name: "Broken context", url: "http://broken-context.local" });
  context.registerGatewayRoute({ id: "broken-context-route", path: "/broken-context", handler(_request, response) { response.end("broken"); } });
  context.registerCoreGatewayProviderPlugin({ key: "broken-context-provider" });
  context.registerCoreGatewayVirtualModelProfile({ id: "broken-context-vm" });
  context.registerProviderAccountConnector({ id: "broken-account", resolve() { return []; } });
  throw new Error("broken plugin setup failed");
};
`);
    writeFileSync(goodPlugin, `
module.exports = {
  setup(context) {
    context.registerCoreGatewayProviderPlugin({ key: "good-context-provider" });
    context.registerCoreGatewayVirtualModelProfile({ id: "good-context-vm" });
    return {
      apps: [{ id: "good-app", name: "Good app", url: "http://good.local" }],
      coreGateway: {
        config: { agent: { mcpServers: [{ name: "good-mcp", command: "good" }] } },
        providerPlugins: [{ key: "good-provider" }],
        virtualModelProfiles: [{ id: "good-vm" }]
      },
      gatewayRoutes: [{ id: "good-route", path: "/good", handler(_request, response) { response.end("good"); } }],
      providerAccountConnectors: [{ id: "good-account", resolve() { return []; } }],
      proxyRoutes: [{ host: "good.local", upstream: "http://127.0.0.1" }]
    };
  }
};
`);

    const config = createDefaultAppConfig({ generatedConfigFile: path.join(dir, "gateway.json") });
    config.plugins = [
      {
        apps: [{ id: "broken-config-app", name: "Broken config", url: "http://broken-config.local" }],
        coreGateway: {
          config: { agent: { mcpServers: [{ name: "broken-config-mcp", command: "broken" }] } },
          providerPlugins: [{ key: "broken-config-provider" }],
          virtualModelProfiles: [{ id: "broken-config-vm" }]
        },
        id: "broken",
        module: brokenPlugin,
        proxy: { routes: [{ host: "broken.local", upstream: "http://127.0.0.1" }] }
      },
      {
        id: "good",
        module: goodPlugin
      }
    ];

    await pluginService.start(config);

    assert.match(warnings.join("\n"), /plugin:broken.*Disabled after startup failure.*broken plugin setup failed/);
    assert.deepEqual(pluginService.getApps().map((app) => app.id), ["good-app"]);
    assert.equal(pluginService.matchGatewayRoute("GET", "/broken-context"), undefined);
    assert.equal(pluginService.matchGatewayRoute("GET", "/good")?.id, "good-route");
    assert.deepEqual(pluginService.getProxyRouteTargets(), [{ host: "good.local", paths: undefined }]);
    assert.deepEqual(pluginService.getCoreProviderPlugins().map((plugin) => plugin.key), ["good-context-provider", "good-provider"]);
    assert.deepEqual(pluginService.getVirtualModelProfiles().map((profile) => profile.id), ["good-context-vm", "good-vm"]);
    assert.deepEqual(pluginService.getCoreGatewayConfig(), { agent: { mcpServers: [{ name: "good-mcp", command: "good" }] } });
    assert.equal(pluginService.getProviderAccountConnector("broken", "broken-account"), undefined);
    assert.equal(typeof pluginService.getProviderAccountConnector("good", "good-account")?.resolve, "function");
  } finally {
    console.warn = originalWarn;
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});
