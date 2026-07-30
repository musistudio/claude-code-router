import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOUD_SYNC_SCOPE_IDS,
  normalizeCloudSyncScopeSelection
} from "../../src/pages/home/shared/cloud-sync.ts";

test("cloud sync scope selection defaults to every supported range", () => {
  assert.deepEqual(
    normalizeCloudSyncScopeSelection(undefined),
    [...CLOUD_SYNC_SCOPE_IDS]
  );
});

test("cloud sync scope selection keeps explicit choices and removes invalid duplicates", () => {
  assert.deepEqual(
    normalizeCloudSyncScopeSelection(["usage", "providers", "usage", "invalid"]),
    ["usage", "providers"]
  );
  assert.deepEqual(normalizeCloudSyncScopeSelection([]), []);
});
