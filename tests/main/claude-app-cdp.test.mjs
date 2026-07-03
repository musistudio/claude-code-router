import assert from "node:assert/strict";
import test from "node:test";
import { shouldEnableClaudeAppDesignCdp } from "../../src/main/claude-app-cdp.ts";

test("Claude App Design CDP is opt-in even when Claude Design is configured", (t) => {
  const previous = process.env.CCR_CLAUDE_APP_DESIGN_CDP;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.CCR_CLAUDE_APP_DESIGN_CDP;
    } else {
      process.env.CCR_CLAUDE_APP_DESIGN_CDP = previous;
    }
  });

  delete process.env.CCR_CLAUDE_APP_DESIGN_CDP;
  assert.equal(shouldEnableClaudeAppDesignCdp(true), false);
  assert.equal(shouldEnableClaudeAppDesignCdp(false), false);

  process.env.CCR_CLAUDE_APP_DESIGN_CDP = "true";
  assert.equal(shouldEnableClaudeAppDesignCdp(false), true);

  process.env.CCR_CLAUDE_APP_DESIGN_CDP = "off";
  assert.equal(shouldEnableClaudeAppDesignCdp(true), false);
});
