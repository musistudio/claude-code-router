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

test("profile bindings persist and invalid new bindings leave credentials unchanged", async () => {
  const config = await configApi.loadAppConfig();
  const profile = { id: "work", agent: "codex", name: "Work", enabled: true, model: "Provider/model", scope: "ccr" };
  await configApi.saveAppConfig({ ...config, profile: { ...config.profile, enabled: true, profiles: [profile] } });
  const linked = { ...retained, profileId: profile.id };
  const saved = await configApi.saveApiKeysConfig([linked]);
  await configApi.saveAppConfig({ ...saved, autoStart: !saved.autoStart });
  assert.deepEqual((await configApi.loadAppConfig()).APIKEYS, [linked]);
  await configApi.saveAppConfig({ ...await configApi.loadAppConfig(), profile: { ...config.profile, profiles: [] } });
  await assert.rejects(configApi.saveApiKeysConfig([linked, { ...revoked, profileId: "missing" }]), /Selected Profile/);
  assert.deepEqual((await configApi.loadAppConfig()).APIKEYS, [linked]);
  const edited = { ...linked, limits: { rpm: 2 } };
  assert.deepEqual((await configApi.saveApiKeysConfig([edited])).APIKEYS, [edited]);
});

test("saving an old settings snapshot cannot restore a revoked key", async () => {
  const stale = await configApi.saveApiKeysConfig([retained, revoked]);
  await configApi.saveApiKeysConfig([retained]);

  const saved = await configApi.saveAppConfig({ ...stale, autoStart: !stale.autoStart });
  assert.equal(saved.autoStart, !stale.autoStart);
  assert.deepEqual(saved.APIKEYS, [retained]);
  assert.deepEqual((await configApi.loadAppConfig()).APIKEYS, [retained]);
});

test("interleaved settings saves preserve key rotations and updated limits", async () => {
  const initial = await configApi.loadAppConfig();
  await configApi.saveAppConfig({ ...initial, autoStart: true });
  const stale = await configApi.saveApiKeysConfig([retained, revoked]);
  const rotated = { ...retained, key: "rotated-token", limits: { rpm: 2 } };
  const results = await Promise.allSettled([
    configApi.saveAppConfig({ ...stale, autoStart: false }),
    configApi.saveApiKeysConfig([rotated]),
    configApi.saveAppConfig({ ...stale, autoStart: true })
  ]);
  assert.equal(results[2].status, "rejected");
  assert.match(results[2].reason.message, /Configuration changed/);

  const current = await configApi.loadAppConfig();
  assert.equal(current.autoStart, false);
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
