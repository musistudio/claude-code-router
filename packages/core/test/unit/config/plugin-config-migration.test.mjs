import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateKnownGatewayPluginConfigsForTest } from "@ccr/core/config/config.ts";

test("legacy combined Claude Design plugin config migrates to split Design and Ship plugins", () => {
  const extensionsRoot = mkdtempSync(path.join(os.tmpdir(), "ccr-extensions-migration-"));
  const previousExtensionsDir = process.env.CCR_EXTENSIONS_DIR;
  try {
    writePluginModule(extensionsRoot, "claude-design");
    writePluginModule(extensionsRoot, "claude-ship");
    process.env.CCR_EXTENSIONS_DIR = extensionsRoot;

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
    assert.equal(result.plugins[0].module, path.join(extensionsRoot, "plugins", "claude-design", "index.cjs"));
    assert.deepEqual(result.plugins[0].apps?.map((app) => app.id), ["claude-design"]);
    assert.equal(result.plugins[0].apps?.[0]?.url, "https://claude-design-assets.pages.dev/design");
    assert.equal(result.plugins[1].module, path.join(extensionsRoot, "plugins", "claude-ship", "index.cjs"));
    assert.equal(result.plugins[1].apps?.[0]?.url, "https://claude.ai/claude-ship");
    assert.deepEqual(result.plugins[1].config, {
      adminAuth: "gateway",
      host: "claude.ai"
    });
  } finally {
    restoreEnv("CCR_EXTENSIONS_DIR", previousExtensionsDir);
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

test("legacy Claude Ship app URL migrates back to the local runtime host", () => {
  const extensionsRoot = mkdtempSync(path.join(os.tmpdir(), "ccr-extensions-migration-"));
  const previousExtensionsDir = process.env.CCR_EXTENSIONS_DIR;
  try {
    writePluginModule(extensionsRoot, "claude-ship");
    process.env.CCR_EXTENSIONS_DIR = extensionsRoot;

    const result = migrateKnownGatewayPluginConfigsForTest([{
      apps: [{
        id: "claude-ship",
        name: "Claude Ship",
        url: "https://claude-design-assets.pages.dev/claude-ship"
      }],
      enabled: true,
      id: "claude-ship",
      module: path.join(extensionsRoot, "plugins", "claude-ship", "index.cjs")
    }]);

    assert.equal(result.changed, true);
    assert.equal(result.plugins[0].apps?.[0]?.url, "https://claude.ai/claude-ship");
  } finally {
    restoreEnv("CCR_EXTENSIONS_DIR", previousExtensionsDir);
    rmSync(extensionsRoot, { force: true, recursive: true });
  }
});

test("externalized plugin modules migrate from the old marketplace path to ccr-extensions", () => {
  const extensionsRoot = mkdtempSync(path.join(os.tmpdir(), "ccr-extensions-migration-"));
  const previousExtensionsDir = process.env.CCR_EXTENSIONS_DIR;
  try {
    writePluginModule(extensionsRoot, "agent-console");
    process.env.CCR_EXTENSIONS_DIR = extensionsRoot;

    const result = migrateKnownGatewayPluginConfigsForTest([{
      apps: [{ id: "agent-console", name: "Agent Console", url: "/plugins/agent-console/pages/home/" }],
      enabled: true,
      id: "agent-console",
      module: "/Users/example/products/CCR/claude-code-router/marketplace/plugins/agent-console/index.cjs"
    }]);

    assert.equal(result.changed, true);
    assert.equal(result.plugins[0].module, path.join(extensionsRoot, "plugins", "agent-console", "index.cjs"));
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

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
