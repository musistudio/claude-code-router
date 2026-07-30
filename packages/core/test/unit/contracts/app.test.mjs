import assert from "node:assert/strict";
import test from "node:test";
import { CLAUDE_DESIGN_PLUGIN_ID, knownGatewayPluginDefaultApps } from "@ccr/core/contracts/app.ts";

test("known gateway plugin defaults open Claude Design at the current shell", () => {
  assert.equal(
    knownGatewayPluginDefaultApps(CLAUDE_DESIGN_PLUGIN_ID)?.find((app) => app.id === "claude-design")?.url,
    "https://claude-design.ccrdesk.top/design"
  );
});
