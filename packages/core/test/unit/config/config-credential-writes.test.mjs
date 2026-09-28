import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test, { before } from "node:test";

const root = path.join(process.env.CCR_INTERNAL_HOME_DIR || os.tmpdir(), `credential-writes-${process.pid}`);
process.env.CCR_INTERNAL_HOME_DIR = path.join(root, "home");
process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(root, "app-data");
process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(root, "user-data");

let configApi;
before(async () => {
  configApi = await import("@ccr/core/config/config.ts");
});

const retained = { createdAt: "2026-01-01T00:00:00.000Z", id: "retained", key: "retained-token" };
const revoked = { createdAt: "2026-01-01T00:00:00.000Z", id: "revoked", key: "revoked-token" };

test("saving an old settings snapshot cannot restore a revoked key", async () => {
  const stale = await configApi.saveApiKeysConfig([retained, revoked]);
  await configApi.saveApiKeysConfig([retained]);

  const saved = await configApi.saveAppConfig({ ...stale, autoStart: !stale.autoStart });
  assert.equal(saved.autoStart, !stale.autoStart);
  assert.deepEqual(saved.APIKEYS, [retained]);
  assert.deepEqual((await configApi.loadAppConfig()).APIKEYS, [retained]);
});

test("interleaved settings saves preserve key rotations and updated limits", async () => {
  const stale = await configApi.saveApiKeysConfig([retained, revoked]);
  const rotated = { ...retained, key: "rotated-token", limits: { rpm: 2 } };
  await Promise.all([
    configApi.saveAppConfig({ ...stale, autoStart: false }),
    configApi.saveApiKeysConfig([rotated]),
    configApi.saveAppConfig({ ...stale, autoStart: true })
  ]);

  const current = await configApi.loadAppConfig();
  assert.equal(current.autoStart, true);
  assert.equal(current.APIKEY, rotated.key);
  assert.deepEqual(current.APIKEYS, [rotated]);
});

test("profile maintenance cannot restore general keys from a stale config", async () => {
  const { applyProfileConfig } = await import("@ccr/core/profiles/service.ts");
  const stale = await configApi.saveApiKeysConfig([retained, revoked]);
  await configApi.saveApiKeysConfig([retained]);
  stale.profile = { ...stale.profile, enabled: false, profiles: [] };

  await applyProfileConfig(stale);

  assert.deepEqual(stale.APIKEYS, [retained]);
  assert.deepEqual((await configApi.loadAppConfig()).APIKEYS, [retained]);
});

test("profile key generation uses the latest credentials without restoring revoked keys", async () => {
  const { applyProfileConfig } = await import("@ccr/core/profiles/service.ts");
  const stale = await configApi.saveApiKeysConfig([retained, revoked]);
  await configApi.saveApiKeysConfig([retained]);
  stale.Providers = [{ name: "Provider", models: ["model"], api_base_url: "https://example.test/v1" }];
  stale.profile = {
    ...stale.profile,
    enabled: true,
    profiles: [{ agent: "claude-design", enabled: true, id: "new-profile", model: "Provider/model", name: "New", scope: "ccr" }]
  };

  await applyProfileConfig(stale);

  const current = await configApi.loadAppConfig();
  assert.deepEqual(current.APIKEYS.map((key) => key.id), ["retained", "profile:new-profile"]);
  assert.ok(current.APIKEYS[1].key.startsWith("ccr-profile-"));
});
