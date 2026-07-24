import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { pluginService } from "@ccr/core/plugins/service.ts";

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

    const warnings = await startWithWarnings(configWithPlugin(dir, pluginFile, ["trusted-code"]));
    assert.match(
      warnings.join("\n"),
      /Plugin permission-test requires permission "gateway-routes" to register gateway routes\./
    );
    assert.equal(pluginService.hasGatewayRoutes(), false);
    await pluginService.stop();

    await pluginService.start(configWithPlugin(dir, pluginFile, ["trusted-code", "gateway-routes"]));
    assert.equal(pluginService.hasGatewayRoutes(), true);
  } finally {
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("plugins without permissions declarations are rejected", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-plugin-missing-permissions-"));
  try {
    const pluginFile = path.join(dir, "missing-permissions-plugin.cjs");
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

    const warnings = await startWithWarnings(configWithPlugin(dir, pluginFile, undefined));
    assert.match(
      warnings.join("\n"),
      /Plugin permission-test must explicitly declare permissions to load and execute plugin JavaScript\./
    );
    assert.equal(pluginService.hasGatewayRoutes(), false);
  } finally {
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("plugin permissions gate configured browser apps", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-plugin-static-permissions-"));
  try {
    const warnings = await startWithWarnings({
      ...baseConfig(dir),
      plugins: [{
        apps: [{ id: "app", name: "App", url: "/app" }],
        enabled: true,
        id: "static-app",
        permissions: []
      }]
    });
    assert.match(
      warnings.join("\n"),
      /Plugin static-app requires permission "apps" to register configured browser apps\./
    );
    assert.deepEqual(pluginService.getApps(), []);
  } finally {
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("known bundled plugins without persisted permissions receive scoped defaults", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-plugin-known-defaults-"));
  try {
    const pluginFile = path.join(dir, "agent-console-plugin.cjs");
    writeFileSync(pluginFile, [
      "\"use strict\";",
      "module.exports = {",
      "  setup(ctx) {",
      "    ctx.registerGatewayRoute({",
      "      auth: \"none\",",
      "      id: \"agent-console-status\",",
      "      path: \"/plugins/agent-console/__status\",",
      "      handler(_request, response, helpers) {",
      "        helpers.sendJson(response, 200, { ok: true });",
      "      }",
      "    });",
      "  }",
      "};",
      ""
    ].join("\n"), "utf8");

    await pluginService.start({
      ...baseConfig(dir),
      plugins: [{
        apps: [{ id: "agent-console", name: "Agent Console", url: "/plugins/agent-console/pages/home/" }],
        enabled: true,
        id: "agent-console",
        module: pluginFile
      }]
    });

    assert.deepEqual(pluginService.getApps().map((app) => app.id), ["agent-console"]);
    assert.equal(pluginService.hasGatewayRoutes(), true);
  } finally {
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("app-only plugin surface can execute trusted JavaScript and register apps", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-plugin-app-surface-"));
  try {
    const pluginFile = path.join(dir, "app-only-plugin.cjs");
    writeFileSync(pluginFile, [
      "\"use strict\";",
      "module.exports = {",
      "  setup(ctx) {",
      "    ctx.registerApp({ id: \"dynamic-app\", name: \"Dynamic App\", url: \"/plugins/dynamic-app\" });",
      "  }",
      "};",
      ""
    ].join("\n"), "utf8");

    const warnings = await startWithWarnings({
      ...baseConfig(dir),
      plugins: [{
        enabled: true,
        id: "app-only",
        module: pluginFile,
        permissions: ["apps"],
        surfaces: { gateway: false, provider: false }
      }]
    });
    assert.match(
      warnings.join("\n"),
      /Plugin app-only requires permission "trusted-code" to load and execute plugin JavaScript\./
    );
    assert.deepEqual(pluginService.getApps(), []);
    await pluginService.stop();

    await pluginService.start({
      ...baseConfig(dir),
      plugins: [{
        enabled: true,
        id: "app-only",
        module: pluginFile,
        permissions: ["trusted-code", "apps"],
        surfaces: { gateway: false, provider: false }
      }]
    });

    assert.deepEqual(pluginService.getApps().map((app) => app.id), ["dynamic-app"]);
    assert.equal(pluginService.hasGatewayRoutes(), false);
  } finally {
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("plugin surfaces gate dynamic gateway registration", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-plugin-surface-gate-"));
  try {
    const pluginFile = path.join(dir, "gateway-surface-plugin.cjs");
    writeFileSync(pluginFile, [
      "\"use strict\";",
      "module.exports = {",
      "  setup(ctx) {",
      "    ctx.registerGatewayRoute({",
      "      auth: \"none\",",
      "      id: \"surface-status\",",
      "      path: \"/plugins/surface-test\",",
      "      handler(_request, response, helpers) {",
      "        helpers.sendJson(response, 200, { ok: true });",
      "      }",
      "    });",
      "  }",
      "};",
      ""
    ].join("\n"), "utf8");

    const warnings = await startWithWarnings(configWithPlugin(dir, pluginFile, ["trusted-code", "gateway-routes"], { surfaces: { gateway: false, provider: true } }));
    assert.match(
      warnings.join("\n"),
      /Plugin permission-test has gateway surface disabled and cannot register gateway routes\./
    );
    assert.equal(pluginService.hasGatewayRoutes(), false);
  } finally {
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("plugin modules are reloaded from the same path after gateway restart", { skip: !process.env.CCR_INTERNAL_HOME_DIR }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-plugin-reload-"));
  try {
    const pluginFile = path.join(dir, "reload-plugin.cjs");
    writeReloadPlugin(pluginFile, "Version 1", "/v1");
    await pluginService.start(configWithPlugin(dir, pluginFile, ["trusted-code", "apps"]));
    assert.equal(pluginService.getApps()[0]?.name, "Version 1");

    await pluginService.stop();
    writeReloadPlugin(pluginFile, "Version 2", "/v2");
    await pluginService.start(configWithPlugin(dir, pluginFile, ["trusted-code", "apps"]));
    assert.equal(pluginService.getApps()[0]?.name, "Version 2");
  } finally {
    await pluginService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

function configWithPlugin(dir, pluginFile, permissions, overrides = {}) {
  const plugin = {
    enabled: true,
    id: "permission-test",
    module: pluginFile,
    ...overrides
  };
  if (permissions !== undefined) {
    plugin.permissions = permissions;
  }
  return {
    ...baseConfig(dir),
    plugins: [plugin]
  };
}

async function startWithWarnings(config) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    await pluginService.start(config);
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

function baseConfig(dir) {
  const config = createDefaultAppConfig({
    generatedConfigFile: path.join(dir, "gateway.config.json")
  });
  config.gateway.enabled = false;
  config.plugins = [];
  return config;
}

function writeReloadPlugin(pluginFile, name, url) {
  writeFileSync(pluginFile, [
    "\"use strict\";",
    "module.exports = {",
    "  setup(ctx) {",
    `    ctx.registerApp({ id: "reload-app", name: ${JSON.stringify(name)}, url: ${JSON.stringify(url)} });`,
    "  }",
    "};",
    ""
  ].join("\n"), "utf8");
}
