import assert from "node:assert/strict";
import test from "node:test";
import { isLegacyClaudeDesignUrl, pluginAppUrlForOpen } from "@ccr/electron/main/plugin-app-url.ts";

const configWithoutSavedDesignHtml = {
  plugins: [
    {
      config: {
        savedHtmlPath: false
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

test("Claude Design app opening migrates the old Cloudflare Design URL to the current shell", () => {
  assert.equal(
    pluginAppUrlForOpen(
      configWithoutSavedDesignHtml,
      "claude-design",
      "https://claude-design-assets.pages.dev/discover/design"
    ),
    "https://claude-design-assets.pages.dev/design"
  );
});

test("Claude Design app opening keeps current and non-Design app URLs unchanged", () => {
  assert.equal(
    pluginAppUrlForOpen(
      configWithoutSavedDesignHtml,
      "claude-design",
      "https://claude-design-assets.pages.dev/design"
    ),
    "https://claude-design-assets.pages.dev/design"
  );
  assert.equal(
    pluginAppUrlForOpen(
      configWithoutSavedDesignHtml,
      "claude-ship",
      "https://claude-design-assets.pages.dev/discover/design"
    ),
    "https://claude-design-assets.pages.dev/discover/design"
  );
});
