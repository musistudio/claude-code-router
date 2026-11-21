import assert from "node:assert/strict";
import test from "node:test";
import { selectCodexAppUsageWindow } from "@ccr/core/agents/codex/app-usage-bridge.ts";

const page = (id, extra = {}) => ({ id, type: "page", url: "app://-/index.html", webSocketDebuggerUrl: `ws://localhost/${id}`, ...extra });

test("quota bridge selects the real navigation window ahead of auxiliary Codex pages", async () => {
  const targets = [page("auxiliary", { title: "Codex" }), page("thread"), page("main")];
  const result = await selectCodexAppUsageWindow(targets, async target => ({ navigation: target.id === "main", root: true, buttons: target.id === "main" ? 2 : 50 }));
  assert.equal(result.target.id, "main");
  assert.equal(result.candidatePages, 3);
  assert.equal(result.navigationPages, 1);
});

test("quota window discovery tolerates closed auxiliary windows and ignores unrelated surfaces", async () => {
  const targets = [page("closed"), page("external", { url: "https://example.com" }), page("worker", { type: "worker" }), page("main")];
  const inspected = [];
  const result = await selectCodexAppUsageWindow(targets, async target => {
    inspected.push(target.id);
    if (target.id === "closed") throw new Error("Target closed");
    return { navigation: true, root: true, buttons: 8 };
  });
  assert.deepEqual(inspected, ["closed", "main"]);
  assert.equal(result.target.id, "main");
});
