import assert from "node:assert/strict";
import test from "node:test";
import { preserveEqualPollingSnapshot } from "@ccr/ui/pages/home/shared/polling.ts";

test("polling snapshots preserve the current reference when nested content is unchanged", () => {
  const current = {
    profiles: [
      {
        botGateway: { outboxCount: 0, state: "connected" },
        profileId: "zcode",
        state: "running"
      }
    ]
  };
  const next = {
    profiles: [
      {
        state: "running",
        profileId: "zcode",
        botGateway: { state: "connected", outboxCount: 0 }
      }
    ]
  };

  assert.equal(preserveEqualPollingSnapshot(current, next), current);
});

test("polling snapshots use the next reference when nested content changes", () => {
  const current = {
    profiles: [{ profileId: "zcode", state: "running" }]
  };
  const next = {
    profiles: [{ profileId: "zcode", state: "stopped" }]
  };

  assert.equal(preserveEqualPollingSnapshot(current, next), next);
});

test("polling snapshots treat array order as meaningful", () => {
  const current = { targetHosts: ["api.openai.com", "chatgpt.com"] };
  const next = { targetHosts: ["chatgpt.com", "api.openai.com"] };

  assert.equal(preserveEqualPollingSnapshot(current, next), next);
});
