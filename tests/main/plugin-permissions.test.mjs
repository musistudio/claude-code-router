import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "../../packages/core/src/config/default-config.ts";
import { pluginService } from "../../packages/core/src/plugins/service.ts";

test("plugin permissions gate dynamic gateway route registration", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-plugin-permissions-"));
  try {
    const pluginFile = path.join(dir, "route-plugin.cjs");
    writeFileSync(pluginFile, [
      "\"use strict\";",
      "module.exports = {",
      "  setup(ctx) {",
      "    ctx.registerGatewayRoute({",
      "      auth: \"none\",",
      "      id: \"status\",",
      "      path: \"/plugins/permission-test\",",
      "      handler(_request, response, helpers) {",
      "        helpers.sendJson(response, 200, { ok: true });",
      "      }",
      "    });",
      "  }",
      "};",
      ""
    ].join("\n"), "utf8");

    await assert.rejects(
      () => pluginService.start(configWithPlugin(dir, pluginFile, [])),
      /Plugin permission-test requires permission "gateway-routes" to register gateway routes\./
    );
    await pluginService.stop();

    await pluginService.start(configWithPlugin(dir, pluginFile, ["gateway-routes"]));
    assert.equal(pluginService.hasGatewayRoutes(), true);
  } finally {
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("plugins without permissions declarations keep legacy compatibility", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-plugin-legacy-permissions-"));
  try {
    const pluginFile = path.join(dir, "legacy-route-plugin.cjs");
    writeFileSync(pluginFile, [
      "\"use strict\";",
      "module.exports = {",
      "  setup(ctx) {",
      "    ctx.registerGatewayRoute({",
      "      auth: \"none\",",
      "      id: \"legacy-status\",",
      "      path: \"/plugins/legacy-permission-test\",",
      "      handler(_request, response, helpers) {",
      "        helpers.sendJson(response, 200, { ok: true });",
      "      }",
      "    });",
      "  }",
      "};",
      ""
    ].join("\n"), "utf8");

    await pluginService.start(configWithPlugin(dir, pluginFile, undefined));
    assert.equal(pluginService.hasGatewayRoutes(), true);
  } finally {
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("plugin permissions gate configured browser apps", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-plugin-static-permissions-"));
  try {
    await assert.rejects(
      () => pluginService.start({
        ...baseConfig(dir),
        plugins: [{
          apps: [{ id: "app", name: "App", url: "/app" }],
          enabled: true,
          id: "static-app",
          permissions: []
        }]
      }),
      /Plugin static-app requires permission "apps" to register configured browser apps\./
    );
  } finally {
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

function configWithPlugin(dir, pluginFile, permissions) {
  const plugin = {
    enabled: true,
    id: "permission-test",
    module: pluginFile
  };
  if (permissions !== undefined) {
    plugin.permissions = permissions;
  }
  return {
    ...baseConfig(dir),
    plugins: [plugin]
  };
}

function baseConfig(dir) {
  const config = createDefaultAppConfig({
    generatedConfigFile: path.join(dir, "gateway.config.json")
  });
  config.gateway.enabled = false;
  config.plugins = [];
  return config;
}
