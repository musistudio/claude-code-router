import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCloudSyncSnapshot,
  createCloudSyncSnapshot,
  decryptCloudSyncSnapshotForTest,
  encryptCloudSyncSnapshotForTest,
  mergeCloudSyncSnapshotsForTest
} from "@ccr/core/cloud-sync/service.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";

test("cloud sync snapshot contains user sync data but excludes cloud sync secrets", () => {
  const config = createDefaultAppConfig();
  config.Providers = [{
    api_key: "provider-secret",
    api_base_url: "https://example.test/v1",
    models: ["model-a"],
    name: "Example"
  }];
  config.Router.rules = [{
    condition: { left: "body.model", operator: "equals", right: "model-a" },
    enabled: true,
    fallback: { mode: "off", models: [], retryCount: 1 },
    id: "route-a",
    name: "Route A",
    type: "conditional"
  }];
  config.cloudSync = {
    accessToken: "cloud-access-token",
    baseUrl: "https://cloud.example.test",
    deviceName: "test-device",
    enabled: true,
    keyId: "local-key",
    keySalt: "local-salt",
    lastRevision: 7,
    namespace: "ccr",
    refreshToken: "cloud-refresh-token"
  };

  const snapshot = createCloudSyncSnapshot(config, "2026-07-28T00:00:00.000Z");

  assert.equal(snapshot.kind, "claude-code-router-cloud-sync-snapshot");
  assert.equal(snapshot.config.Providers[0].api_key, "provider-secret");
  assert.equal(Object.hasOwn(snapshot.config, "cloudSync"), false);
  assert.equal(JSON.stringify(snapshot).includes("cloud-access-token"), false);
  assert.equal(JSON.stringify(snapshot).includes("cloud-refresh-token"), false);
});

test("cloud sync snapshots decrypt with the matching password only", () => {
  const config = createDefaultAppConfig();
  config.profile.profiles[0].model = "provider,model-a";
  const snapshot = createCloudSyncSnapshot(config, "2026-07-28T00:00:00.000Z");
  const encrypted = encryptCloudSyncSnapshotForTest(snapshot, "correct horse battery staple");

  const decrypted = decryptCloudSyncSnapshotForTest(
    encrypted.encrypted,
    "correct horse battery staple",
    encrypted.keySalt
  );

  assert.deepEqual(decrypted, snapshot);
  assert.throws(
    () => decryptCloudSyncSnapshotForTest(encrypted.encrypted, "wrong password", encrypted.keySalt),
    /does not match|Unsupported state|unable to authenticate/i
  );
});

test("cloud sync snapshots apply the synced config fields onto a local config", () => {
  const localConfig = createDefaultAppConfig();
  const remoteConfig = createDefaultAppConfig();
  remoteConfig.preferredProvider = "Example";
  remoteConfig.Providers = [{
    api_key: "remote-secret",
    api_base_url: "https://example.test/v1",
    models: ["remote-model"],
    name: "Example"
  }];

  const merged = applyCloudSyncSnapshot(localConfig, createCloudSyncSnapshot(remoteConfig));

  assert.equal(merged.preferredProvider, "Example");
  assert.equal(merged.Providers[0].name, "Example");
  assert.equal(merged.Providers[0].api_key, "remote-secret");
  assert.deepEqual(merged.cloudSync, localConfig.cloudSync);
});

test("cloud sync conflict merge combines independent additions", () => {
  const baseConfig = createDefaultAppConfig();
  const localConfig = createDefaultAppConfig();
  const remoteConfig = createDefaultAppConfig();

  localConfig.Providers = [{
    api_key: "local-secret",
    api_base_url: "https://local.example.test/v1",
    models: ["local-model"],
    name: "Local"
  }];
  remoteConfig.Providers = [{
    api_key: "remote-secret",
    api_base_url: "https://remote.example.test/v1",
    models: ["remote-model"],
    name: "Remote"
  }];
  localConfig.Router.rules = [{
    condition: { left: "body.model", operator: "equals", right: "local-model" },
    enabled: true,
    fallback: { mode: "off", models: [], retryCount: 1 },
    id: "local-route",
    name: "Local route",
    type: "condition"
  }];
  remoteConfig.Router.rules = [{
    condition: { left: "body.model", operator: "equals", right: "remote-model" },
    enabled: true,
    fallback: { mode: "off", models: [], retryCount: 1 },
    id: "remote-route",
    name: "Remote route",
    type: "condition"
  }];

  const merged = mergeCloudSyncSnapshotsForTest(
    createCloudSyncSnapshot(baseConfig),
    createCloudSyncSnapshot(localConfig),
    createCloudSyncSnapshot(remoteConfig)
  );

  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.snapshot.config.Providers.map((provider) => provider.name).sort(), ["Local", "Remote"]);
  assert.deepEqual(merged.snapshot.config.Router.rules.map((rule) => rule.id).sort(), ["local-route", "remote-route"]);
});

test("cloud sync conflict merge combines primitive list changes", () => {
  const baseConfig = createDefaultAppConfig();
  const localConfig = createDefaultAppConfig();
  const remoteConfig = createDefaultAppConfig();
  const provider = {
    api_key: "secret",
    api_base_url: "https://example.test/v1",
    models: ["base-model"],
    name: "Example"
  };
  baseConfig.Providers = [provider];
  localConfig.Providers = [{ ...provider, models: ["base-model", "local-model"] }];
  remoteConfig.Providers = [{ ...provider, models: ["base-model", "remote-model"] }];

  const merged = mergeCloudSyncSnapshotsForTest(
    createCloudSyncSnapshot(baseConfig),
    createCloudSyncSnapshot(localConfig),
    createCloudSyncSnapshot(remoteConfig)
  );

  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.snapshot.config.Providers[0].models, ["base-model", "local-model", "remote-model"]);
});

test("cloud sync conflict merge keeps local values for same-field conflicts", () => {
  const baseConfig = createDefaultAppConfig();
  const localConfig = createDefaultAppConfig();
  const remoteConfig = createDefaultAppConfig();
  const provider = {
    api_key: "base-secret",
    api_base_url: "https://example.test/v1",
    models: ["model"],
    name: "Example"
  };
  baseConfig.preferredProvider = "Base";
  localConfig.preferredProvider = "Local";
  remoteConfig.preferredProvider = "Remote";
  baseConfig.Providers = [provider];
  localConfig.Providers = [{ ...provider, api_key: "local-secret" }];
  remoteConfig.Providers = [{ ...provider, api_key: "remote-secret" }];

  const merged = mergeCloudSyncSnapshotsForTest(
    createCloudSyncSnapshot(baseConfig),
    createCloudSyncSnapshot(localConfig),
    createCloudSyncSnapshot(remoteConfig)
  );

  assert.equal(merged.snapshot.config.preferredProvider, "Local");
  assert.equal(merged.snapshot.config.Providers[0].api_key, "local-secret");
  assert.deepEqual(merged.conflicts, [
    "config.Providers[Example].api_key",
    "config.preferredProvider"
  ]);
});
