import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { CLAUDE_DESIGN_PLUGIN_ID } from "@ccr/core/contracts/app.ts";
import { CCR_DESKTOP_APP_ENV } from "@ccr/core/runtime/desktop-app.ts";
import { builtInPluginAppForOpen, configForPluginAppOpen, isLegacyClaudeDesignUrl, pluginAppUrlForOpen } from "@ccr/electron/main/plugin-app-url.ts";

const configWithIgnoredSavedDesignHtml = {
  plugins: [
    {
      config: {
        savedHtmlPath: "/tmp/Claude Design.html",
        useSavedHtml: true
      },
      enabled: true,
      id: "claude-design"
    }
  ]
} as any;

test("Claude Design app URLs classify legacy Claude Design entries as legacy", () => {
  assert.equal(isLegacyClaudeDesignUrl("https://claude.ai/discover/design"), true);
  assert.equal(isLegacyClaudeDesignUrl("https://claude.ai/design"), true);
  assert.equal(isLegacyClaudeDesignUrl("https://claude-design.ccrdesk.top/design"), false);
  assert.equal(isLegacyClaudeDesignUrl("https://example.com/discover/design"), false);
});

test("Claude Design app opening migrates legacy Design URLs to the current shell", () => {
  assert.equal(
    pluginAppUrlForOpen(
      configWithIgnoredSavedDesignHtml,
      "claude-design",
      "https://claude.ai/discover/design"
    ),
    "https://claude-design.ccrdesk.top/design"
  );
});

test("Claude Design app opening keeps current and non-Design app URLs unchanged", () => {
  assert.equal(
    pluginAppUrlForOpen(
      configWithIgnoredSavedDesignHtml,
      "claude-design",
      "https://claude-design.ccrdesk.top/design"
    ),
    "https://claude-design.ccrdesk.top/design"
  );
  assert.equal(
    pluginAppUrlForOpen(
      configWithIgnoredSavedDesignHtml,
      "claude-ship",
      "https://example.com/discover/design"
    ),
    "https://example.com/discover/design"
  );
});

test("Claude Design resolves to the built-in app without installed plugin config", () => {
  const pluginApp = builtInPluginAppForOpen(CLAUDE_DESIGN_PLUGIN_ID);

  assert.equal(pluginApp?.id, "claude-design");
  assert.equal(pluginApp?.name, "Claude Design");
  assert.equal(pluginApp?.url, "https://claude-design.ccrdesk.top/design");
  assert.equal(builtInPluginAppForOpen("unknown-plugin"), undefined);
  assert.equal(builtInPluginAppForOpen(CLAUDE_DESIGN_PLUGIN_ID, "missing"), undefined);
});

test("Claude Design app opening injects the runtime plugin config", () => {
  withDesktopRuntime(() => {
    const config = { plugins: [] } as any;
    const runtimeConfig = configForPluginAppOpen(config, CLAUDE_DESIGN_PLUGIN_ID);

    assert.equal(config.plugins.length, 0);
    assert.equal(runtimeConfig.plugins.length, 1);
    assert.equal(runtimeConfig.plugins[0].id, CLAUDE_DESIGN_PLUGIN_ID);
    assert.equal(runtimeConfig.plugins[0].module, bundledPluginModule("claude-design"));
    assert.equal(configForPluginAppOpen(config, "claude-ship"), config);
  });
});

test("Claude Design app opening fills an existing built-in plugin config without a module", () => {
  withDesktopRuntime(() => {
    const config = {
      plugins: [{
        config: { savedHtmlPath: "/tmp/Claude Design.html" },
        enabled: true,
        id: CLAUDE_DESIGN_PLUGIN_ID
      }]
    } as any;

    const runtimeConfig = configForPluginAppOpen(config, CLAUDE_DESIGN_PLUGIN_ID);

    assert.equal(config.plugins[0].module, undefined);
    assert.equal(runtimeConfig.plugins.length, 1);
    assert.equal(runtimeConfig.plugins[0].module, bundledPluginModule("claude-design"));
    assert.deepEqual(runtimeConfig.plugins[0].config, { savedHtmlPath: "/tmp/Claude Design.html" });
  });
});

function bundledPluginModule(pluginId: string): string {
  const distModule = path.resolve(process.cwd(), "packages", "electron", "dist", "bundled-plugins", pluginId, "index.cjs");
  return existsSync(distModule)
    ? distModule
    : path.resolve(process.cwd(), "packages", "electron", "bundled-plugins", pluginId, "index.cjs");
}

function withDesktopRuntime(run: () => void): void {
  const previousDesktopApp = process.env[CCR_DESKTOP_APP_ENV];
  try {
    process.env[CCR_DESKTOP_APP_ENV] = "1";
    run();
  } finally {
    if (previousDesktopApp === undefined) {
      delete process.env[CCR_DESKTOP_APP_ENV];
    } else {
      process.env[CCR_DESKTOP_APP_ENV] = previousDesktopApp;
    }
  }
}
