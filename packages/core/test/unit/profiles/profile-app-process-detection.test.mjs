import assert from "node:assert/strict";
import test from "node:test";
import { isProfileAppMainProcessCommandForTest } from "@ccr/core/profiles/launch-service.ts";

const userDataDir = "/Users/example/.claude-code-router/profiles/codex/codex/.claude-code-router/codex-app-user-data/codex";

test("profile app process detection ignores persistent Chromium helper processes", () => {
  const main = `/Applications/ChatGPT.app/Contents/MacOS/ChatGPT --remote-debugging-port=0 --user-data-dir=${userDataDir}`;
  const renderer = `/Applications/ChatGPT.app/Contents/Frameworks/Codex (Renderer) --type=renderer --user-data-dir=${userDataDir}`;
  const crashpad = `/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/browser_crashpad_handler --monitor-self --database=${userDataDir}/Crashpad --monitor-self-annotation=ptype=crashpad-handler`;

  assert.equal(isProfileAppMainProcessCommandForTest(main, userDataDir), true);
  assert.equal(isProfileAppMainProcessCommandForTest(renderer, userDataDir), false);
  assert.equal(isProfileAppMainProcessCommandForTest(crashpad, userDataDir), false);
  assert.equal(isProfileAppMainProcessCommandForTest("/Applications/ChatGPT.app/Contents/MacOS/ChatGPT", userDataDir), false);
});
