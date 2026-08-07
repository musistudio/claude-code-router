import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claudeDesignRuntimePluginConfig, claudeShipRuntimePluginConfig, migrateKnownGatewayPluginConfigsForTest, withClaudeDesignRuntimePluginConfig } from "@ccr/core/config/config.ts";
import { CCR_DESKTOP_APP_ENV } from "@ccr/core/runtime/desktop-app.ts";

test("legacy combined Claude Design plugin config migrates to split Design and Ship plugins", () => {
  const extensionsRoot = mkdtempSync(path.join(os.tmpdir(), "ccr-extensions-migration-"));
  const previousExtensionsDir = process.env.CCR_EXTENSIONS_DIR;
  const previousDesktopApp = process.env[CCR_DESKTOP_APP_ENV];
  try {
    writePluginModule(extensionsRoot, "claude-design");
    writePluginModule(extensionsRoot, "claude-ship");
    process.env.CCR_EXTENSIONS_DIR = extensionsRoot;
    process.env[CCR_DESKTOP_APP_ENV] = "1";

    const result = migrateKnownGatewayPluginConfigsForTest([{
      apps: [
        {
          description: "Open Claude Design in a dedicated CCR Electron window.",
          icon: "palette",
          id: "claude-design",
          name: "Claude Design",
          url: "https://claude.ai/design"
        },
        {
          description: "Open Claude Ship in a dedicated CCR Electron window.",
          icon: "rocket",
          id: "claude-ship",
          name: "Claude Ship",
          url: "https://claude.ai/claude-ship"
        }
      ],
      config: {
        adminAuth: "gateway",
        autoAnswerQuestions: true,
        host: "claude.ai"
      },
      enabled: true,
      id: "claude-design",
      module: "/Users/example/products/CCR/claude-code-router/examples/plugins/claude-design/index.cjs",
      permissions: ["trusted-code", "apps", "gateway-routes", "proxy-routes", "http-backends", "sqlite-store"],
      surfaces: { apps: true, gateway: true, provider: false }
    }]);

    assert.equal(result.changed, true);
    assert.deepEqual(result.plugins.map((plugin) => plugin.id), ["claude-design", "claude-ship"]);
    assert.equal(result.plugins[0].module, bundledPluginModule("claude-design"));
    assert.deepEqual(result.plugins[0].apps?.map((app) => app.id), ["claude-design"]);
    assert.equal(result.plugins[0].apps?.[0]?.url, "https://claude-design.ccrdesk.top/design");
    assert.deepEqual(result.plugins[0].config, {
      adminAuth: "gateway",
      host: "claude.ai"
    });
    assert.equal(result.plugins[1].module, bundledPluginModule("claude-ship"));
    assert.equal(result.plugins[1].apps?.[0]?.url, "https://claude.ai/claude-ship");
    assert.deepEqual(result.plugins[1].config, {
      adminAuth: "gateway",
      host: "claude.ai"
    });
  } finally {
    restoreEnv("CCR_EXTENSIONS_DIR", previousExtensionsDir);
    restoreEnv(CCR_DESKTOP_APP_ENV, previousDesktopApp);
    rmSync(extensionsRoot, { force: true, recursive: true });
  }
});

test("legacy Claude Design migration does not duplicate an existing Claude Ship plugin", () => {
  const extensionsRoot = mkdtempSync(path.join(os.tmpdir(), "ccr-extensions-migration-"));
  const previousExtensionsDir = process.env.CCR_EXTENSIONS_DIR;
  try {
    writePluginModule(extensionsRoot, "claude-design");
    writePluginModule(extensionsRoot, "claude-ship");
    process.env.CCR_EXTENSIONS_DIR = extensionsRoot;

    const result = migrateKnownGatewayPluginConfigsForTest([
      {
        apps: [{ id: "claude-ship", name: "Claude Ship", url: "https://claude.ai/claude-ship" }],
        enabled: true,
        id: "claude-design",
        module: "/Users/example/products/CCR/claude-code-router/examples/plugins/claude-design/index.cjs"
      },
      {
        enabled: true,
        id: "claude-ship",
        module: path.join(extensionsRoot, "plugins", "claude-ship", "index.cjs")
      }
    ]);

    assert.equal(result.changed, true);
    assert.deepEqual(result.plugins.map((plugin) => plugin.id), ["claude-design", "claude-ship"]);
  } finally {
    restoreEnv("CCR_EXTENSIONS_DIR", previousExtensionsDir);
    rmSync(extensionsRoot, { force: true, recursive: true });
  }
});

test("Claude Design runtime plugin config resolves from the bundled plugin in CCR Desktop without persisting", () => {
  const previousDesktopApp = process.env[CCR_DESKTOP_APP_ENV];
  try {
    process.env[CCR_DESKTOP_APP_ENV] = "1";

    const plugin = claudeDesignRuntimePluginConfig();
    const shipPlugin = claudeShipRuntimePluginConfig();
    assert.equal(plugin?.id, "claude-design");
    assert.equal(plugin?.module, bundledPluginModule("claude-design"));
    assert.deepEqual(plugin?.apps?.map((app) => app.id), ["claude-design"]);
    assert.equal(shipPlugin?.id, "claude-ship");
    assert.equal(shipPlugin?.module, bundledPluginModule("claude-ship"));
    assert.deepEqual(shipPlugin?.apps?.map((app) => app.id), ["claude-ship"]);

    const config = { plugins: [] };
    const runtimeConfig = withClaudeDesignRuntimePluginConfig(config);
    assert.deepEqual(config.plugins, []);
    assert.equal(runtimeConfig.plugins.length, 1);
    assert.equal(runtimeConfig.plugins[0].id, "claude-design");
    assert.equal(runtimeConfig.plugins[0].module, bundledPluginModule("claude-design"));

    const missingModule = { plugins: [{ enabled: true, id: "claude-design" }] };
    const filledConfig = withClaudeDesignRuntimePluginConfig(missingModule);
    assert.equal(filledConfig.plugins[0].module, bundledPluginModule("claude-design"));
    assert.equal(missingModule.plugins[0].module, undefined);

    const configured = { plugins: [{ enabled: true, id: "claude-design", module: "/custom/design.cjs" }] };
    assert.equal(withClaudeDesignRuntimePluginConfig(configured), configured);
  } finally {
    restoreEnv(CCR_DESKTOP_APP_ENV, previousDesktopApp);
  }
});

test("Claude Design runtime plugin config is unavailable outside CCR Desktop", () => {
  const previousDesktopApp = process.env[CCR_DESKTOP_APP_ENV];
  try {
    delete process.env[CCR_DESKTOP_APP_ENV];

    assert.equal(claudeDesignRuntimePluginConfig(), undefined);
    assert.throws(
      () => withClaudeDesignRuntimePluginConfig({ plugins: [] }),
      /Claude Design is only available in CCR Desktop/
    );
  } finally {
    restoreEnv(CCR_DESKTOP_APP_ENV, previousDesktopApp);
  }
});

test("Claude Design plugin config drops deprecated local frontend settings while preserving other settings", () => {
  const result = migrateKnownGatewayPluginConfigsForTest([{
    config: {
      adminAuth: "gateway",
      appMode: "local",
      autoAnswerQuestions: true,
      frontendAssetsOrigin: "https://custom.pages.dev",
      frontendUrl: false,
      host: "claude.ai"
    },
    enabled: true,
    id: "claude-design",
    module: "/custom/design.cjs"
  }]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.plugins[0].config, {
    adminAuth: "gateway",
    frontendAssetsOrigin: "https://custom.pages.dev",
    host: "claude.ai"
  });
});

test("Claude Design plugin config removes empty config after dropping deprecated local frontend settings", () => {
  const result = migrateKnownGatewayPluginConfigsForTest([{
    config: {
      autoAnswerQuestions: true,
      savedHtmlPath: "/tmp/Claude Design.html",
      useSavedHtml: true
    },
    enabled: true,
    id: "claude-design",
    module: "/custom/design.cjs"
  }]);

  assert.equal(result.changed, true);
  assert.equal(Object.hasOwn(result.plugins[0], "config"), false);
});

test("Claude Ship plugin config drops deprecated local frontend settings while preserving other settings", () => {
  const result = migrateKnownGatewayPluginConfigsForTest([{
    config: {
      adminAuth: "gateway",
      autoAnswerQuestions: true,
      claudeShipAssets: true,
      host: "claude.ai",
      shipAssetDir: "/Applications/Claude.app/Contents/Resources/ion-dist",
      shipFrontendUrl: "https://custom.pages.dev/ship"
    },
    enabled: true,
    id: "claude-ship",
    module: "/custom/ship.cjs"
  }]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.plugins[0].config, {
    adminAuth: "gateway",
    host: "claude.ai",
    shipFrontendUrl: "https://custom.pages.dev/ship"
  });
});

test("externalized plugin modules migrate from the old marketplace path to ccr-extensions", () => {
  const extensionsRoot = mkdtempSync(path.join(os.tmpdir(), "ccr-extensions-migration-"));
  const previousExtensionsDir = process.env.CCR_EXTENSIONS_DIR;
  try {
    writePluginModule(extensionsRoot, "cursor-proxy");
    process.env.CCR_EXTENSIONS_DIR = extensionsRoot;

    const result = migrateKnownGatewayPluginConfigsForTest([{
      enabled: true,
      id: "cursor-proxy",
      module: "/Users/example/products/CCR/claude-code-router/marketplace/plugins/cursor-proxy/index.cjs"
    }]);

    assert.equal(result.changed, true);
    assert.equal(result.plugins[0].module, path.join(extensionsRoot, "plugins", "cursor-proxy", "index.cjs"));
  } finally {
    restoreEnv("CCR_EXTENSIONS_DIR", previousExtensionsDir);
    rmSync(extensionsRoot, { force: true, recursive: true });
  }
});

function writePluginModule(root, pluginId) {
  const dir = path.join(root, "plugins", pluginId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.cjs"), "\"use strict\";\nmodule.exports = {};\n", "utf8");
}

function bundledPluginModule(pluginId) {
  const distModule = path.resolve(process.cwd(), "packages", "electron", "dist", "bundled-plugins", pluginId, "index.cjs");
  return existsSync(distModule)
    ? distModule
    : path.resolve(process.cwd(), "packages", "electron", "bundled-plugins", pluginId, "index.cjs");
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
