import assert from "node:assert/strict";
import test from "node:test";
import { CLAUDE_DESIGN_PLUGIN_ID } from "@ccr/core/contracts/app.ts";
import { builtInPluginAppForOpen, isLegacyClaudeDesignUrl, pluginAppUrlForOpen } from "@ccr/electron/main/plugin-app-url.ts";

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

test("Claude Design app URLs classify only legacy Claude and old Cloudflare Design entries as legacy", () => {
  assert.equal(isLegacyClaudeDesignUrl("https://claude.ai/discover/design"), true);
  assert.equal(isLegacyClaudeDesignUrl("https://claude.ai/design"), true);
  assert.equal(isLegacyClaudeDesignUrl("https://claude-design-assets.pages.dev/discover/design"), true);
  assert.equal(isLegacyClaudeDesignUrl("https://claude-design-assets.pages.dev/design"), false);
  assert.equal(isLegacyClaudeDesignUrl("https://example.com/discover/design"), false);
});

test("Claude Design app opening migrates legacy Design URLs to the Cloudflare Pages shell", () => {
  assert.equal(
    pluginAppUrlForOpen(
      configWithIgnoredSavedDesignHtml,
      "claude-design",
      "https://claude-design-assets.pages.dev/discover/design"
    ),
    "https://claude-design-assets.pages.dev/design"
  );
});

test("Claude Design app opening keeps current and non-Design app URLs unchanged", () => {
  assert.equal(
    pluginAppUrlForOpen(
      configWithIgnoredSavedDesignHtml,
      "claude-design",
      "https://claude-design-assets.pages.dev/design"
    ),
    "https://claude-design-assets.pages.dev/design"
  );
  assert.equal(
    pluginAppUrlForOpen(
      configWithIgnoredSavedDesignHtml,
      "claude-ship",
      "https://claude-design-assets.pages.dev/discover/design"
    ),
    "https://claude-design-assets.pages.dev/discover/design"
  );
});

test("Claude Design resolves to the built-in app without installed plugin config", () => {
  const pluginApp = builtInPluginAppForOpen(CLAUDE_DESIGN_PLUGIN_ID);

  assert.equal(pluginApp?.id, "claude-design");
  assert.equal(pluginApp?.name, "Claude Design");
  assert.equal(pluginApp?.url, "https://claude-design-assets.pages.dev/design");
  assert.equal(builtInPluginAppForOpen("agent-console"), undefined);
  assert.equal(builtInPluginAppForOpen(CLAUDE_DESIGN_PLUGIN_ID, "missing"), undefined);
});
