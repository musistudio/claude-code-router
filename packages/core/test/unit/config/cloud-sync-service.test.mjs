import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  completeCloudSyncLogin,
  applyCloudSyncAuthTokens,
  applyCloudSyncSnapshot,
  createCloudSyncKeyFile,
  createCloudSyncSnapshot,
  disableCloudSyncConfig,
  decryptCloudSyncSnapshotForTest,
  encryptCloudSyncOperationForTest,
  encryptCloudSyncSnapshotForTest,
  mergeCloudSyncSnapshotsForTest,
  logoutCloudSyncConfig,
  pullCloudSyncConfig,
  pushCloudSyncConfig,
  resolveCloudSyncConflict,
  rotateCloudSyncKey,
  startCloudSyncLogin
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
  assert.equal(snapshot.version, 3);
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

test("cloud sync snapshots only export and apply the selected ranges", () => {
  const localConfig = createDefaultAppConfig();
  localConfig.cloudSync.scopes = ["providers"];
  localConfig.APIKEY = "local-api-key";
  localConfig.language = "en";
  localConfig.theme = "light";
  const remoteConfig = createDefaultAppConfig();
  remoteConfig.APIKEY = "remote-api-key";
  remoteConfig.language = "zh";
  remoteConfig.Providers = [{
    api_key: "remote-provider-key",
    api_base_url: "https://remote.example.test/v1",
    models: ["remote-model"],
    name: "Remote"
  }];
  remoteConfig.theme = "dark";

  const localSnapshot = createCloudSyncSnapshot(localConfig);
  assert.deepEqual(Object.keys(localSnapshot.config).sort(), [
    "Providers",
    "Router",
    "preferredProvider",
    "providerPlugins"
  ]);

  const applied = applyCloudSyncSnapshot(localConfig, createCloudSyncSnapshot(remoteConfig));
  assert.equal(applied.Providers[0].name, "Remote");
  assert.equal(applied.APIKEY, "local-api-key");
  assert.equal(applied.language, "en");
  assert.equal(applied.theme, "light");
});

test("appearance sync applies both language and theme preferences", () => {
  const localConfig = createDefaultAppConfig();
  localConfig.cloudSync.scopes = ["appearance"];
  localConfig.language = "en";
  localConfig.theme = "light";
  const remoteConfig = createDefaultAppConfig();
  remoteConfig.language = "zh";
  remoteConfig.theme = "dark";

  const applied = applyCloudSyncSnapshot(localConfig, createCloudSyncSnapshot(remoteConfig));

  assert.equal(applied.language, "zh");
  assert.equal(applied.theme, "dark");
});

test("cloud sync snapshots preserve unselected cloud ranges during a partial push", () => {
  const cloudConfig = createDefaultAppConfig();
  cloudConfig.APIKEY = "cloud-api-key";
  cloudConfig.theme = "dark";
  const baseSnapshot = createCloudSyncSnapshot(cloudConfig);
  const localConfig = createDefaultAppConfig();
  localConfig.cloudSync.scopes = ["providers"];
  localConfig.Providers = [{
    api_key: "local-provider-key",
    api_base_url: "https://local.example.test/v1",
    models: ["local-model"],
    name: "Local"
  }];
  localConfig.APIKEY = "local-api-key";
  localConfig.theme = "light";

  const partialSnapshot = createCloudSyncSnapshot(
    localConfig,
    "2026-07-30T00:00:00.000Z",
    { baseSnapshot }
  );

  assert.equal(partialSnapshot.config.Providers[0].name, "Local");
  assert.equal(partialSnapshot.config.APIKEY, "cloud-api-key");
  assert.equal(partialSnapshot.config.theme, "dark");
});

test("cloud sync conflict merge combines usage records from both devices", () => {
  const config = createDefaultAppConfig();
  config.cloudSync.scopes = ["usage"];
  const usageEvent = (id, requestId) => ({
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    client: "claude-code",
    costSource: "",
    costUsd: 0,
    createdAt: "2026-07-30T00:00:00.000Z",
    credentialId: "",
    durationMs: 100,
    id,
    inputTokens: 10,
    logicalModel: "model-a",
    method: "POST",
    model: "model-a",
    outputTokens: 5,
    path: "/v1/messages",
    provider: "Example",
    requestId,
    statusCode: 200,
    totalTokens: 15
  });
  const baseEvent = usageEvent("a".repeat(43), "base-request");
  const localEvent = usageEvent("b".repeat(43), "local-request");
  const remoteEvent = usageEvent("c".repeat(43), "remote-request");
  const base = createCloudSyncSnapshot(config, undefined, { usageEvents: [baseEvent] });
  const local = createCloudSyncSnapshot(config, undefined, { usageEvents: [baseEvent, localEvent] });
  const remote = createCloudSyncSnapshot(config, undefined, { usageEvents: [baseEvent, remoteEvent] });

  const merged = mergeCloudSyncSnapshotsForTest(base, local, remote);

  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(
    merged.snapshot.usageEvents.map((event) => event.requestId),
    ["base-request", "local-request", "remote-request"]
  );
});

test("cloud sync snapshots keep device-local paths and runtime credentials on each device", () => {
  const source = createDefaultAppConfig();
  const target = createDefaultAppConfig();
  source.mediaTools.allowedInputRoots = ["/source/media"];
  target.mediaTools.allowedInputRoots = ["/target/media"];
  source.profile.codex.codexHome = "/source/codex";
  target.profile.codex.codexHome = "/target/codex";
  source.botGateway.cwd = "/source/bot";
  source.botGateway.credentials = { token: "source-token" };
  target.botGateway.cwd = "/target/bot";
  target.botGateway.credentials = { token: "target-token" };
  source.profile.profiles[0].configFile = "/source/profile.json";
  source.profile.profiles[0].env = { SOURCE_ONLY: "1" };
  target.profile.profiles[0].configFile = "/target/profile.json";
  target.profile.profiles[0].env = { TARGET_ONLY: "1" };

  const snapshot = createCloudSyncSnapshot(source);
  const applied = applyCloudSyncSnapshot(target, snapshot);

  assert.equal(Object.hasOwn(snapshot.config.mediaTools, "allowedInputRoots"), false);
  assert.equal(Object.hasOwn(snapshot.config.profile.codex, "codexHome"), false);
  assert.equal(Object.hasOwn(snapshot.config.botGateway, "credentials"), false);
  assert.deepEqual(applied.mediaTools.allowedInputRoots, ["/target/media"]);
  assert.equal(applied.profile.codex.codexHome, "/target/codex");
  assert.equal(applied.botGateway.cwd, "/target/bot");
  assert.deepEqual(applied.botGateway.credentials, { token: "target-token" });
  assert.equal(applied.profile.profiles[0].configFile, "/target/profile.json");
  assert.deepEqual(applied.profile.profiles[0].env, { TARGET_ONLY: "1" });
});

test("cloud sync snapshots initialize device-local fields for newly received entries", () => {
  const source = createDefaultAppConfig();
  const target = createDefaultAppConfig();
  source.agent.mcpServers = [{
    args: [],
    command: "remote-tool",
    cwd: "/source/tool",
    env: { SOURCE_SECRET: "1" },
    name: "remote-tool",
    protocolVersion: "2025-03-26",
    requestTimeoutMs: 30_000,
    startupTimeoutMs: 10_000,
    stdioMessageMode: "newline-json",
    transport: "stdio"
  }];
  source.botConfigs = [{
    botGateway: {
      ...source.botGateway,
      credentials: { token: "source-token" },
      cwd: "/source/bot"
    },
    id: "remote-bot",
    name: "Remote bot"
  }];
  target.botGateway.credentials = { token: "target-token" };
  target.botGateway.cwd = "/target/bot";

  const applied = applyCloudSyncSnapshot(target, createCloudSyncSnapshot(source));

  assert.deepEqual(applied.agent.mcpServers[0].env, {});
  assert.equal(applied.agent.mcpServers[0].cwd, undefined);
  assert.deepEqual(applied.botConfigs[0].botGateway.credentials, {});
  assert.equal(applied.botConfigs[0].botGateway.enabled, false);
  assert.equal(applied.botConfigs[0].botGateway.cwd, "/target/bot");
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

test("cloud sync conflict merge marks concurrent order changes as risky", () => {
  const baseConfig = createDefaultAppConfig();
  const localConfig = createDefaultAppConfig();
  const remoteConfig = createDefaultAppConfig();
  const provider = {
    api_key: "secret",
    api_base_url: "https://example.test/v1",
    models: ["first", "second"],
    name: "Example"
  };
  baseConfig.Providers = [provider];
  localConfig.Providers = [{ ...provider, models: ["second", "first"] }];
  remoteConfig.Providers = [{ ...provider, models: ["first", "second", "remote"] }];

  const merged = mergeCloudSyncSnapshotsForTest(
    createCloudSyncSnapshot(baseConfig),
    createCloudSyncSnapshot(localConfig),
    createCloudSyncSnapshot(remoteConfig)
  );

  assert.deepEqual(merged.conflicts, ["config.Providers[Example].models"]);
  assert.deepEqual(merged.snapshot.config.Providers[0].models, ["second", "first"]);
});

test("cloud sync merge preserves a remote reorder while merging local item edits", () => {
  const baseConfig = createDefaultAppConfig();
  const localConfig = createDefaultAppConfig();
  const remoteConfig = createDefaultAppConfig();
  const first = {
    condition: { left: "body.model", operator: "equals", right: "first" },
    enabled: true,
    fallback: { mode: "off", models: [], retryCount: 1 },
    id: "first",
    name: "First",
    type: "conditional"
  };
  const second = {
    condition: { left: "body.model", operator: "equals", right: "second" },
    enabled: true,
    fallback: { mode: "off", models: [], retryCount: 1 },
    id: "second",
    name: "Second",
    type: "conditional"
  };
  baseConfig.Router.rules = [first, second];
  localConfig.Router.rules = [{ ...first, enabled: false }, second];
  remoteConfig.Router.rules = [second, first];

  const merged = mergeCloudSyncSnapshotsForTest(
    createCloudSyncSnapshot(baseConfig),
    createCloudSyncSnapshot(localConfig),
    createCloudSyncSnapshot(remoteConfig)
  );

  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.snapshot.config.Router.rules.map((rule) => rule.id), ["second", "first"]);
  assert.equal(merged.snapshot.config.Router.rules[1].enabled, false);
});

test("disabling sync preserves the account while signing out clears the sync generation", () => {
  const config = createDefaultAppConfig();
  config.cloudSync = {
    accessToken: "access-token",
    baseUrl: "https://sync.example.test",
    deviceId: "device-id",
    deviceName: "test-device",
    enabled: true,
    keyFilePath: "/tmp/cloud-key.json",
    keyId: "key-id",
    keyMode: "key-file",
    keySalt: "key-salt",
    lastRevision: 9,
    lastSyncedSnapshot: createCloudSyncSnapshot(config),
    namespace: "ccr",
    refreshToken: "refresh-token",
    snapshotHash: "snapshot-hash",
    userId: "user-id"
  };

  const disabled = disableCloudSyncConfig(config);
  assert.equal(disabled.cloudSync.enabled, false);
  assert.equal(disabled.cloudSync.accessToken, "access-token");
  assert.equal(disabled.cloudSync.keyId, "key-id");
  assert.equal(disabled.cloudSync.lastRevision, 9);

  const loggedOut = logoutCloudSyncConfig(config);
  assert.equal(loggedOut.cloudSync.accessToken, undefined);
  assert.equal(loggedOut.cloudSync.deviceId, undefined);
  assert.equal(loggedOut.cloudSync.keyId, undefined);
  assert.equal(loggedOut.cloudSync.lastRevision, 0);
  assert.equal(loggedOut.cloudSync.lastSyncedSnapshot, undefined);
  assert.equal(loggedOut.cloudSync.baseUrl, "https://sync.example.test");
});

test("logging in to a different account resets stale encryption and revision state", () => {
  const config = createDefaultAppConfig();
  config.cloudSync = {
    accessToken: "old-access",
    baseUrl: "https://sync.example.test",
    deviceId: "old-device",
    deviceName: "test-device",
    enabled: true,
    keyId: "old-key",
    keySalt: "old-salt",
    lastRevision: 12,
    namespace: "ccr",
    refreshToken: "old-refresh",
    userId: "old-user"
  };

  const next = applyCloudSyncAuthTokens(config, {
    accessToken: "new-access",
    refreshToken: "new-refresh",
    userId: "new-user"
  });

  assert.equal(next.cloudSync.userId, "new-user");
  assert.equal(next.cloudSync.deviceId, undefined);
  assert.equal(next.cloudSync.keyId, undefined);
  assert.equal(next.cloudSync.lastRevision, 0);
  assert.equal(next.cloudSync.enabled, false);
  assert.equal(next.cloudSync.baseUrl, "https://sync.example.test");
});

test("cloud sync login honors a configured HTTPS service URL", () => {
  const config = createDefaultAppConfig();
  config.cloudSync.baseUrl = "https://sync.example.test/base";

  const login = startCloudSyncLogin(config);

  assert.equal(new URL(login.loginUrl).origin, "https://sync.example.test");
  assert.equal(new URL(login.loginUrl).pathname, "/base/auth/github/login");
});

test("cloud sync key generation refuses to overwrite an existing key file", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ccr-cloud-key-test-"));
  const file = path.join(directory, "key.json");
  try {
    createCloudSyncKeyFile(file);
    assert.throws(
      () => createCloudSyncKeyFile(file),
      /already exists/i
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("cloud sync push skips the network when portable configuration did not change", async () => {
  const password = "correct horse battery staple";
  const keySalt = Buffer.alloc(16, 21).toString("base64");
  const config = createDefaultAppConfig();
  const snapshot = createCloudSyncSnapshot(config, "2026-07-30T00:00:00.000Z");
  const key = encryptCloudSyncSnapshotForTest(snapshot, password, keySalt);
  config.cloudSync = {
    accessToken: "access-token",
    baseUrl: "https://sync.example.test",
    deviceName: "test-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 7,
    lastSyncedSnapshot: snapshot,
    namespace: "ccr"
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network should not be called");
  };
  try {
    const result = await pushCloudSyncConfig(config);
    assert.equal(result.snapshotPushed, false);
    assert.match(result.message, /already up to date/i);
    assert.equal(
      result.config.cloudSync.lastSyncedSnapshot.kind,
      "claude-code-router-cloud-sync-baseline"
    );
    assert.equal(
      JSON.stringify(result.config.cloudSync.lastSyncedSnapshot).includes("preferredProvider"),
      false
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud sync key rotation rewrites the latest snapshot with a new key generation", async () => {
  const oldPassword = "old encryption password";
  const newPassword = "new encryption password";
  const oldKeySalt = Buffer.alloc(16, 23).toString("base64");
  const config = createDefaultAppConfig();
  config.preferredProvider = "Example";
  const snapshot = createCloudSyncSnapshot(config, "2026-07-30T00:00:00.000Z");
  const oldEncrypted = encryptCloudSyncSnapshotForTest(snapshot, oldPassword, oldKeySalt);
  config.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3000",
    deviceId: "00000000-0000-4000-8000-000000000023",
    deviceName: "test-device",
    enabled: true,
    keyId: oldEncrypted.keyId,
    keyMode: "password",
    keySalt: oldKeySalt,
    lastRevision: 1,
    lastSyncedSnapshot: snapshot,
    namespace: "ccr",
    refreshToken: "refresh-token"
  };

  const originalFetch = globalThis.fetch;
  const oldEncryptedOperation = encryptCloudSyncOperationForTest(snapshot, oldPassword, oldKeySalt);
  let servingRotatedPull = false;
  let pushedBody;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/sync/pull") {
      if (servingRotatedPull) {
        return new Response(JSON.stringify({
          document: {
            encryptedSnapshot: pushedBody.encryptedSnapshot,
            namespace: "ccr",
            revision: 2,
            snapshotHash: pushedBody.snapshotHash,
            snapshotRevision: 2,
            updatedAt: "2026-07-30T00:01:00.000Z"
          },
          operations: [{
            baseRevision: 0,
            clientOperationId: "old-key-operation",
            encryptedPayload: oldEncryptedOperation,
            id: "00000000-0000-4000-8000-000000000001",
            revision: 1
          }],
          pagination: {
            hasMore: false,
            limit: 100,
            nextRevision: null
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        document: {
          encryptedSnapshot: oldEncrypted.encrypted,
          namespace: "ccr",
          revision: 1,
          snapshotHash: "old-hash",
          snapshotRevision: 1,
          updatedAt: "2026-07-30T00:00:00.000Z"
        },
        operations: [],
        pagination: {
          hasMore: false,
          limit: 100,
          nextRevision: null
        }
      }), { status: 200 });
    }

    assert.equal(url.pathname, "/sync/push");
    pushedBody = JSON.parse(String(init?.body));
    assert.equal(pushedBody.baseRevision, 1);
    return new Response(JSON.stringify({
      accepted: true,
      conflict: false,
      document: {
        encryptedSnapshot: pushedBody.encryptedSnapshot,
        namespace: "ccr",
        revision: 2,
        snapshotHash: pushedBody.snapshotHash,
        snapshotRevision: 2,
        updatedAt: "2026-07-30T00:01:00.000Z"
      },
      mergeRequired: false,
      snapshotAccepted: true
    }), { status: 200 });
  };

  try {
    const result = await rotateCloudSyncKey(config, { password: newPassword });

    assert.equal(result.snapshotPushed, true);
    assert.notEqual(result.config.cloudSync.keyId, oldEncrypted.keyId);
    assert.equal(result.config.cloudSync.lastRevision, 2);
    const newKeySalt = pushedBody.encryptedSnapshot.metadata.keySalt;
    const rewritten = decryptCloudSyncSnapshotForTest(
      pushedBody.encryptedSnapshot,
      newPassword,
      newKeySalt
    );
    assert.equal(rewritten.config.preferredProvider, "Example");
    assert.equal(rewritten.version, 3);
    assert.equal(
      result.config.cloudSync.lastSyncedSnapshot.kind,
      "claude-code-router-cloud-sync-baseline"
    );
    assert.equal(
      JSON.stringify(result.config.cloudSync.lastSyncedSnapshot).includes("Example"),
      false
    );
    const receiver = createDefaultAppConfig();
    receiver.preferredProvider = "Example";
    receiver.cloudSync = {
      accessToken: "receiver-access-token",
      baseUrl: "http://127.0.0.1:3000",
      deviceId: "00000000-0000-4000-8000-000000000024",
      deviceName: "receiver",
      enabled: true,
      keyId: oldEncrypted.keyId,
      keyMode: "password",
      keySalt: oldKeySalt,
      lastRevision: 0,
      namespace: "ccr",
      refreshToken: "receiver-refresh-token"
    };
    const initializedReceiver = await pullCloudSyncConfig(receiver, { password: oldPassword });
    assert.equal(
      initializedReceiver.config.cloudSync.lastSyncedSnapshot.kind,
      "claude-code-router-cloud-sync-baseline"
    );
    logoutCloudSyncConfig(result.config);

    servingRotatedPull = true;
    const locked = await pullCloudSyncConfig(initializedReceiver.config);
    assert.equal(locked.keyRotationRequired, true);
    assert.equal(locked.snapshotApplied, false);
    assert.equal(locked.config.cloudSync.keyId, result.config.cloudSync.keyId);
    assert.equal(locked.config.cloudSync.lastRevision, 1);
    assert.equal(locked.status.unlocked, false);

    logoutCloudSyncConfig(initializedReceiver.config);
    const received = await pullCloudSyncConfig(locked.config, { password: newPassword });
    assert.equal(received.snapshotApplied, true);
    assert.equal(received.config.preferredProvider, "Example");
    assert.equal(received.config.cloudSync.lastRevision, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  assert.deepEqual(merged.conflictFields, [
    {
      local: { exists: true, value: "local-secret" },
      path: "config.Providers[Example].api_key",
      remote: { exists: true, value: "remote-secret" }
    },
    {
      local: { exists: true, value: "Local" },
      path: "config.preferredProvider",
      remote: { exists: true, value: "Remote" }
    }
  ]);
});

test("cloud sync login exchanges a browser-safe PKCE handoff code", async () => {
  const config = createDefaultAppConfig();
  const callbackUrl = "http://127.0.0.1:45678/cloud-sync/auth/callback?session=test-session";
  const login = startCloudSyncLogin(config, { callbackUrl });
  const loginUrl = new URL(login.loginUrl);
  const challenge = loginUrl.searchParams.get("code_challenge");

  assert.equal(loginUrl.searchParams.get("redirect_uri"), callbackUrl);
  assert.equal(loginUrl.searchParams.get("code_challenge_method"), "S256");
  assert.match(challenge ?? "", /^[a-zA-Z0-9_-]{43}$/);
  assert.equal(login.loginUrl.includes("access_token"), false);
  assert.equal(login.loginUrl.includes("refresh_token"), false);

  const originalFetch = globalThis.fetch;
  let handoffRequests = 0;
  globalThis.fetch = async (input, init) => {
    handoffRequests += 1;
    const url = new URL(String(input));
    assert.equal(url.pathname, "/auth/handoff");
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.code, "one-time-code");
    assert.equal(
      createHash("sha256").update(body.codeVerifier).digest("base64url"),
      challenge
    );
    return new Response(JSON.stringify({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      refreshTokenExpiresAt: "2026-10-30T00:00:00.000Z",
      tokenType: "Bearer",
      user: {
        avatarUrl: "https://avatars.example.test/user.png",
        email: "user@example.test",
        githubLogin: "cloud-user",
        githubName: "Cloud User",
        id: "user-id"
      }
    }), {
      headers: { "content-type": "application/json" },
      status: 200
    });
  };

  try {
    const completedUrl = new URL(callbackUrl);
    completedUrl.searchParams.set("code", "one-time-code");
    completedUrl.searchParams.set("expires_at", new Date(Date.now() + 60_000).toISOString());
    const authenticated = await completeCloudSyncLogin(config, completedUrl.toString());

    assert.equal(authenticated.cloudSync.accessToken, "access-token");
    assert.equal(authenticated.cloudSync.refreshToken, "refresh-token");
    assert.equal(authenticated.cloudSync.userLogin, "cloud-user");
    assert.equal(authenticated.cloudSync.userName, "Cloud User");
    assert.equal(handoffRequests, 1);
    await assert.rejects(
      completeCloudSyncLogin(config, completedUrl.toString()),
      /invalid or expired/i
    );
    assert.equal(handoffRequests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud sync login handoff can be retried after a transient server failure", async () => {
  const config = createDefaultAppConfig();
  const callbackUrl = "http://127.0.0.1:45679/cloud-sync/auth/callback?session=retry-session";
  const login = startCloudSyncLogin(config, { callbackUrl });
  const completedUrl = new URL(callbackUrl);
  completedUrl.searchParams.set("code", "retry-code");
  completedUrl.searchParams.set("expires_at", new Date(Date.now() + 60_000).toISOString());

  const originalFetch = globalThis.fetch;
  let handoffRequests = 0;
  globalThis.fetch = async () => {
    handoffRequests += 1;
    if (handoffRequests === 1) {
      return new Response(JSON.stringify({ message: "temporary outage" }), { status: 503 });
    }
    return new Response(JSON.stringify({
      accessToken: "retried-access-token",
      refreshToken: "retried-refresh-token",
      user: {
        githubLogin: "retry-user",
        id: "retry-user-id"
      }
    }), { status: 200 });
  };

  try {
    assert.ok(login.loginUrl);
    await assert.rejects(
      completeCloudSyncLogin(config, completedUrl.toString()),
      /temporary outage/i
    );
    const authenticated = await completeCloudSyncLogin(config, completedUrl.toString());
    assert.equal(authenticated.cloudSync.accessToken, "retried-access-token");
    assert.equal(authenticated.cloudSync.userId, "retry-user-id");
    assert.equal(handoffRequests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expired cloud authentication clears stale tokens and reports signed out", async () => {
  const password = "expired authentication password";
  const keySalt = Buffer.alloc(16, 31).toString("base64");
  const snapshot = createCloudSyncSnapshot(createDefaultAppConfig());
  const key = encryptCloudSyncSnapshotForTest(snapshot, password, keySalt);
  const config = createDefaultAppConfig();
  config.cloudSync = {
    accessToken: "expired-access-token",
    baseUrl: "http://127.0.0.1:3031",
    deviceId: "00000000-0000-4000-8000-000000000031",
    deviceName: "expired-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 1,
    lastSyncedSnapshot: snapshot,
    namespace: "ccr",
    refreshToken: "expired-refresh-token",
    userId: "existing-user"
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/refresh") {
      return new Response(JSON.stringify({ message: "expired" }), { status: 401 });
    }
    return new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 });
  };

  try {
    const result = await pullCloudSyncConfig(config, { password });
    assert.equal(result.authExpired, true);
    assert.equal(result.config.cloudSync.enabled, false);
    assert.equal(result.config.cloudSync.accessToken, undefined);
    assert.equal(result.config.cloudSync.refreshToken, undefined);
    assert.equal(result.config.cloudSync.userId, "existing-user");
    assert.equal(result.status.authenticated, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud token refresh sharing is scoped to the configured service", async () => {
  const password = "correct horse battery staple";
  const keySalt = Buffer.alloc(16, 29).toString("base64");
  const snapshot = createCloudSyncSnapshot(createDefaultAppConfig());
  const key = encryptCloudSyncSnapshotForTest(snapshot, password, keySalt);
  const createConfig = (port) => {
    const config = createDefaultAppConfig();
    config.cloudSync = {
      accessToken: "expired-access-token",
      baseUrl: `http://127.0.0.1:${port}`,
      deviceId: `00000000-0000-4000-8000-00000000${port}`,
      deviceName: `device-${port}`,
      enabled: true,
      keyId: key.keyId,
      keyMode: "password",
      keySalt,
      lastRevision: 0,
      namespace: "ccr",
      refreshToken: "shared-refresh-token"
    };
    return config;
  };

  const originalFetch = globalThis.fetch;
  let refreshRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const expectedAccessToken = `access-${url.port}`;
    if (url.pathname === "/auth/refresh") {
      refreshRequests += 1;
      return new Response(JSON.stringify({
        accessToken: expectedAccessToken,
        refreshToken: "shared-refresh-token"
      }), { status: 200 });
    }
    assert.equal(url.pathname, "/sync/pull");
    if (init?.headers?.Authorization !== `Bearer ${expectedAccessToken}`) {
      return new Response("{}", { status: 401 });
    }
    return new Response(JSON.stringify({
      document: {
        namespace: "ccr",
        revision: 0,
        snapshotRevision: 0,
        updatedAt: "2026-07-30T00:00:00.000Z"
      },
      operations: [],
      pagination: {
        hasMore: false,
        limit: 100,
        nextRevision: null
      }
    }), { status: 200 });
  };

  try {
    await pullCloudSyncConfig(createConfig(3029), { password });
    await pullCloudSyncConfig(createConfig(3030), { password });
    assert.equal(refreshRequests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("logging out invalidates refresh results cached under a rotated token", async () => {
  const password = "rotated refresh token password";
  const keySalt = Buffer.alloc(16, 37).toString("base64");
  const snapshot = createCloudSyncSnapshot(createDefaultAppConfig());
  const key = encryptCloudSyncSnapshotForTest(snapshot, password, keySalt);
  const config = createDefaultAppConfig();
  config.cloudSync = {
    accessToken: "stale-access-token",
    baseUrl: "http://127.0.0.1:3037",
    deviceName: "refresh-rotation-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 0,
    namespace: "ccr",
    refreshToken: "old-refresh-token"
  };

  const originalFetch = globalThis.fetch;
  let refreshRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/refresh") {
      refreshRequests += 1;
      if (refreshRequests === 1) {
        return new Response(JSON.stringify({
          accessToken: "fresh-access-token",
          refreshToken: "new-refresh-token"
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "expired" }), { status: 401 });
    }
    if (init?.headers?.Authorization !== "Bearer fresh-access-token") {
      return new Response("{}", { status: 401 });
    }
    return new Response(JSON.stringify({
      document: {
        namespace: "ccr",
        revision: 0,
        snapshotRevision: 0
      },
      operations: [],
      pagination: {
        hasMore: false,
        limit: 100,
        nextRevision: null
      }
    }), { status: 200 });
  };

  try {
    const refreshed = await pullCloudSyncConfig(config, { password });
    assert.equal(refreshed.config.cloudSync.refreshToken, "new-refresh-token");
    logoutCloudSyncConfig(refreshed.config);

    const staleRetry = await pullCloudSyncConfig(config, { password });
    assert.equal(staleRetry.authExpired, true);
    assert.equal(staleRetry.status.authenticated, false);
    assert.equal(refreshRequests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud sync pull does not replay operations already represented by the document snapshot", async () => {
  const password = "correct horse battery staple";
  const keySalt = Buffer.alloc(16, 9).toString("base64");
  const baseConfig = createDefaultAppConfig();
  baseConfig.Providers = [{
    api_key: "provider-a-secret",
    api_base_url: "https://a.example.test/v1",
    models: ["model-a"],
    name: "Provider A"
  }];
  const staleOperationConfig = createDefaultAppConfig();
  staleOperationConfig.Providers = [{
    api_key: "provider-b-secret",
    api_base_url: "https://b.example.test/v1",
    models: ["model-b"],
    name: "Provider B"
  }];
  const documentConfig = createDefaultAppConfig();
  documentConfig.Providers = [
    ...baseConfig.Providers,
    ...staleOperationConfig.Providers
  ];

  const baseSnapshot = createCloudSyncSnapshot(baseConfig, "2026-07-30T00:00:00.000Z");
  const staleOperationSnapshot = createCloudSyncSnapshot(
    staleOperationConfig,
    "2026-07-30T00:01:00.000Z"
  );
  const documentSnapshot = createCloudSyncSnapshot(documentConfig, "2026-07-30T00:02:00.000Z");
  const key = encryptCloudSyncSnapshotForTest(baseSnapshot, password, keySalt);
  const encryptedDocument = encryptCloudSyncSnapshotForTest(
    documentSnapshot,
    password,
    keySalt
  ).encrypted;
  baseConfig.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3000",
    deviceId: "00000000-0000-4000-8000-000000000001",
    deviceName: "test-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 101,
    lastSyncedSnapshot: baseSnapshot,
    namespace: "ccr",
    refreshToken: "refresh-token"
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/sync/pull");
    return new Response(JSON.stringify({
      document: {
        encryptedSnapshot: encryptedDocument,
        namespace: "ccr",
        revision: 104,
        snapshotHash: "document-hash",
        snapshotRevision: 104,
        updatedAt: "2026-07-30T00:02:00.000Z"
      },
      operations: [
        {
          baseRevision: 101,
          clientOperationId: "stale-operation",
          encryptedPayload: encryptCloudSyncOperationForTest(
            staleOperationSnapshot,
            password,
            keySalt
          ),
          id: "00000000-0000-4000-8000-000000000102",
          revision: 102
        },
        {
          baseRevision: 103,
          clientOperationId: "resolved-operation",
          encryptedPayload: encryptCloudSyncOperationForTest(
            documentSnapshot,
            password,
            keySalt
          ),
          id: "00000000-0000-4000-8000-000000000104",
          revision: 104
        }
      ],
      pagination: {
        hasMore: false,
        limit: 100,
        nextRevision: null
      }
    }), { status: 200 });
  };

  try {
    const result = await pullCloudSyncConfig(baseConfig, { password });

    assert.equal(result.remoteRevision, 104);
    assert.equal(result.snapshotApplied, true);
    assert.deepEqual(
      result.config.Providers.map((provider) => provider.name).sort(),
      ["Provider A", "Provider B"]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud sync pull stops before advancing past an unsupported accepted operation", async () => {
  const password = "correct horse battery staple";
  const keySalt = Buffer.alloc(16, 27).toString("base64");
  const config = createDefaultAppConfig();
  const snapshot = createCloudSyncSnapshot(config, "2026-07-30T00:00:00.000Z");
  const encrypted = encryptCloudSyncSnapshotForTest(snapshot, password, keySalt);
  config.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3000",
    deviceId: "00000000-0000-4000-8000-000000000027",
    deviceName: "test-device",
    enabled: true,
    keyId: encrypted.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 1,
    lastSyncedSnapshot: snapshot,
    namespace: "ccr",
    refreshToken: "refresh-token"
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    document: {
      encryptedSnapshot: encrypted.encrypted,
      namespace: "ccr",
      revision: 2,
      snapshotHash: "snapshot-hash",
      snapshotRevision: 1,
      updatedAt: "2026-07-30T00:01:00.000Z"
    },
    operations: [{
      baseRevision: 1,
      clientOperationId: "unsupported-operation",
      encryptedPayload: encrypted.encrypted,
      id: "00000000-0000-4000-8000-000000000002",
      revision: 2
    }],
    pagination: {
      hasMore: false,
      limit: 100,
      nextRevision: null
    }
  }), { status: 200 });

  try {
    await assert.rejects(
      pullCloudSyncConfig(config, { password }),
      /unsupported format.*Update CCR/i
    );
    assert.equal(config.cloudSync.lastRevision, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("read-only cloud sync pull does not advance the merge baseline", async () => {
  const password = "read only pull password";
  const keySalt = Buffer.alloc(16, 32).toString("base64");
  const localConfig = createDefaultAppConfig();
  localConfig.preferredProvider = "Local";
  const remoteConfig = createDefaultAppConfig();
  remoteConfig.preferredProvider = "Remote";
  const baseSnapshot = createCloudSyncSnapshot(localConfig, "2026-07-30T00:00:00.000Z");
  const remoteSnapshot = createCloudSyncSnapshot(remoteConfig, "2026-07-30T00:01:00.000Z");
  const key = encryptCloudSyncSnapshotForTest(baseSnapshot, password, keySalt);
  const encryptedRemote = encryptCloudSyncSnapshotForTest(remoteSnapshot, password, keySalt).encrypted;
  localConfig.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3032",
    deviceId: "00000000-0000-4000-8000-000000000032",
    deviceName: "read-only-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 1,
    lastSyncedSnapshot: baseSnapshot,
    namespace: "ccr",
    refreshToken: "refresh-token"
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    document: {
      encryptedSnapshot: encryptedRemote,
      namespace: "ccr",
      revision: 2,
      snapshotHash: "remote-hash",
      snapshotRevision: 2
    },
    operations: [],
    pagination: {
      hasMore: false,
      limit: 100,
      nextRevision: null
    }
  }), { status: 200 });

  try {
    const result = await pullCloudSyncConfig(localConfig, { apply: false, password });
    assert.equal(result.snapshotApplied, false);
    assert.equal(result.remoteRevision, 2);
    assert.equal(result.config.preferredProvider, "Local");
    assert.equal(result.config.cloudSync.lastRevision, 1);
    assert.deepEqual(result.config.cloudSync.lastSyncedSnapshot, baseSnapshot);
    assert.equal(result.config.cloudSync.snapshotHash, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud sync pull rejects remote revision rollback", async () => {
  const password = "rollback protection password";
  const keySalt = Buffer.alloc(16, 33).toString("base64");
  const config = createDefaultAppConfig();
  const snapshot = createCloudSyncSnapshot(config);
  const key = encryptCloudSyncSnapshotForTest(snapshot, password, keySalt);
  config.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3033",
    deviceName: "rollback-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 5,
    lastSyncedSnapshot: snapshot,
    namespace: "ccr"
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    document: {
      encryptedSnapshot: key.encrypted,
      namespace: "ccr",
      revision: 4,
      snapshotHash: "stale-hash",
      snapshotRevision: 4
    },
    operations: [],
    pagination: {
      hasMore: false,
      limit: 100,
      nextRevision: null
    }
  }), { status: 200 });

  try {
    await assert.rejects(
      pullCloudSyncConfig(config, { password }),
      /rejected a remote rollback from revision 5 to 4/i
    );
    assert.equal(config.cloudSync.lastRevision, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud sync pull rejects different content at an unchanged revision", async () => {
  const password = "revision equivocation password";
  const keySalt = Buffer.alloc(16, 38).toString("base64");
  const config = createDefaultAppConfig();
  config.preferredProvider = "Base";
  const remoteConfig = createDefaultAppConfig();
  remoteConfig.preferredProvider = "Different";
  const baseSnapshot = createCloudSyncSnapshot(config);
  const remoteSnapshot = createCloudSyncSnapshot(remoteConfig);
  const key = encryptCloudSyncSnapshotForTest(baseSnapshot, password, keySalt);
  const encryptedRemote = encryptCloudSyncSnapshotForTest(remoteSnapshot, password, keySalt).encrypted;
  config.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3038",
    deviceName: "equivocation-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 5,
    lastSyncedSnapshot: baseSnapshot,
    namespace: "ccr"
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    document: {
      encryptedSnapshot: encryptedRemote,
      namespace: "ccr",
      revision: 5,
      snapshotHash: "different-content",
      snapshotRevision: 5
    },
    operations: [],
    pagination: {
      hasMore: false,
      limit: 100,
      nextRevision: null
    }
  }), { status: 200 });

  try {
    await assert.rejects(
      pullCloudSyncConfig(config, { password }),
      /different remote content for unchanged revision 5/i
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud sync pull rejects a non-empty document without encrypted state", async () => {
  const password = "missing snapshot password";
  const keySalt = Buffer.alloc(16, 34).toString("base64");
  const config = createDefaultAppConfig();
  const snapshot = createCloudSyncSnapshot(config);
  const key = encryptCloudSyncSnapshotForTest(snapshot, password, keySalt);
  config.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3034",
    deviceName: "missing-snapshot-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 1,
    lastSyncedSnapshot: snapshot,
    namespace: "ccr"
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    document: {
      namespace: "ccr",
      revision: 2,
      snapshotHash: "missing-snapshot-hash",
      snapshotRevision: 2
    },
    operations: [],
    pagination: {
      hasMore: false,
      limit: 100,
      nextRevision: null
    }
  }), { status: 200 });

  try {
    await assert.rejects(
      pullCloudSyncConfig(config, { password }),
      /without an encrypted snapshot/i
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud sync pull bounds the total operation collection", async () => {
  const password = "bounded pagination password";
  const keySalt = Buffer.alloc(16, 35).toString("base64");
  const config = createDefaultAppConfig();
  const snapshot = createCloudSyncSnapshot(config);
  const key = encryptCloudSyncSnapshotForTest(snapshot, password, keySalt);
  config.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3035",
    deviceName: "bounded-pagination-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 0,
    namespace: "ccr"
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    document: {
      encryptedSnapshot: key.encrypted,
      namespace: "ccr",
      revision: 1,
      snapshotHash: "snapshot-hash",
      snapshotRevision: 1
    },
    operations: Array.from({ length: 10_001 }, () => ({})),
    pagination: {
      hasMore: false,
      limit: 100,
      nextRevision: null
    }
  }), { status: 200 });

  try {
    await assert.rejects(
      pullCloudSyncConfig(config, { password }),
      /exceeded the operation limit/i
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud sync pull pushes a clean merge of independent local and remote changes", async () => {
  const password = "correct horse battery staple";
  const keySalt = Buffer.alloc(16, 25).toString("base64");
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
  const baseSnapshot = createCloudSyncSnapshot(baseConfig, "2026-07-30T00:00:00.000Z");
  const remoteSnapshot = createCloudSyncSnapshot(remoteConfig, "2026-07-30T00:01:00.000Z");
  const key = encryptCloudSyncSnapshotForTest(baseSnapshot, password, keySalt);
  const encryptedRemote = encryptCloudSyncSnapshotForTest(remoteSnapshot, password, keySalt).encrypted;
  localConfig.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3000",
    deviceId: "00000000-0000-4000-8000-000000000025",
    deviceName: "test-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 1,
    lastSyncedSnapshot: baseSnapshot,
    namespace: "ccr",
    refreshToken: "refresh-token"
  };

  const originalFetch = globalThis.fetch;
  let pushedBody;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/sync/pull") {
      return new Response(JSON.stringify({
        document: {
          encryptedSnapshot: encryptedRemote,
          namespace: "ccr",
          revision: 2,
          snapshotHash: "remote-hash",
          snapshotRevision: 2,
          updatedAt: "2026-07-30T00:01:00.000Z"
        },
        operations: [],
        pagination: {
          hasMore: false,
          limit: 100,
          nextRevision: null
        }
      }), { status: 200 });
    }

    assert.equal(url.pathname, "/sync/push");
    pushedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      accepted: true,
      conflict: false,
      document: {
        encryptedSnapshot: pushedBody.encryptedSnapshot,
        namespace: "ccr",
        revision: 3,
        snapshotHash: pushedBody.snapshotHash,
        snapshotRevision: 3,
        updatedAt: "2026-07-30T00:02:00.000Z"
      },
      mergeRequired: false,
      snapshotAccepted: true
    }), { status: 200 });
  };

  try {
    const result = await pullCloudSyncConfig(localConfig, { password });

    assert.equal(result.mergeApplied, true);
    assert.equal(result.snapshotApplied, true);
    assert.equal(result.snapshotPushed, true);
    assert.equal(result.remoteRevision, 3);
    assert.deepEqual(
      result.config.Providers.map((provider) => provider.name),
      ["Local", "Remote"]
    );
    const pushedSnapshot = decryptCloudSyncSnapshotForTest(
      pushedBody.encryptedSnapshot,
      password,
      keySalt
    );
    assert.deepEqual(
      pushedSnapshot.config.Providers.map((provider) => provider.name),
      ["Local", "Remote"]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud sync pull ignores a legacy snapshot with no snapshot revision and replays the full log", async () => {
  const password = "correct horse battery staple";
  const keySalt = Buffer.alloc(16, 11).toString("base64");
  const baseConfig = createDefaultAppConfig();
  const otherConfig = createDefaultAppConfig();
  baseConfig.Providers = [{
    api_key: "provider-a-secret",
    api_base_url: "https://a.example.test/v1",
    models: ["model-a"],
    name: "Provider A"
  }];
  otherConfig.Providers = [{
    api_key: "provider-b-secret",
    api_base_url: "https://b.example.test/v1",
    models: ["model-b"],
    name: "Provider B"
  }];
  const mergedConfig = createDefaultAppConfig();
  mergedConfig.Providers = [...baseConfig.Providers, ...otherConfig.Providers];

  const baseSnapshot = createCloudSyncSnapshot(baseConfig, "2026-07-30T00:00:00.000Z");
  const otherSnapshot = createCloudSyncSnapshot(otherConfig, "2026-07-30T00:01:00.000Z");
  const mergedSnapshot = createCloudSyncSnapshot(mergedConfig, "2026-07-30T00:02:00.000Z");
  const key = encryptCloudSyncSnapshotForTest(baseSnapshot, password, keySalt);
  const encryptedLegacySnapshot = encryptCloudSyncSnapshotForTest(
    otherSnapshot,
    password,
    keySalt
  ).encrypted;
  baseConfig.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3000",
    deviceId: "00000000-0000-4000-8000-000000000001",
    deviceName: "test-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 1,
    lastSyncedSnapshot: baseSnapshot,
    namespace: "ccr",
    refreshToken: "refresh-token"
  };

  const operations = [
    {
      baseRevision: 0,
      clientOperationId: "initial-operation",
      encryptedPayload: encryptCloudSyncOperationForTest(baseSnapshot, password, keySalt),
      id: "00000000-0000-4000-8000-000000000001",
      revision: 1
    },
    {
      baseRevision: 0,
      clientOperationId: "stale-operation",
      encryptedPayload: encryptCloudSyncOperationForTest(otherSnapshot, password, keySalt),
      id: "00000000-0000-4000-8000-000000000002",
      revision: 2
    },
    {
      baseRevision: 2,
      clientOperationId: "resolved-operation",
      encryptedPayload: encryptCloudSyncOperationForTest(mergedSnapshot, password, keySalt),
      id: "00000000-0000-4000-8000-000000000003",
      revision: 3
    }
  ];
  const requestedRevisions = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedRevisions.push(url.searchParams.get("sinceRevision"));
    const sinceRevision = Number(url.searchParams.get("sinceRevision"));
    return new Response(JSON.stringify({
      document: {
        encryptedSnapshot: encryptedLegacySnapshot,
        namespace: "ccr",
        revision: 3,
        snapshotHash: "legacy-hash",
        snapshotRevision: null,
        updatedAt: "2026-07-30T00:02:00.000Z"
      },
      operations: operations.filter((operation) => operation.revision > sinceRevision),
      pagination: {
        hasMore: false,
        limit: 100,
        nextRevision: null
      }
    }), { status: 200 });
  };

  try {
    const result = await pullCloudSyncConfig(baseConfig, { password });

    assert.deepEqual(requestedRevisions, ["1", "0"]);
    assert.deepEqual(
      result.config.Providers.map((provider) => provider.name).sort(),
      ["Provider A", "Provider B"]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("risky cloud sync pull waits for confirmation and can keep cloud values", async () => {
  const password = "correct horse battery staple";
  const keySalt = Buffer.alloc(16, 13).toString("base64");
  const baseConfig = createDefaultAppConfig();
  baseConfig.preferredProvider = "Base";
  const localConfig = createDefaultAppConfig();
  localConfig.preferredProvider = "Local";
  const remoteConfig = createDefaultAppConfig();
  remoteConfig.preferredProvider = "Remote";
  const baseSnapshot = createCloudSyncSnapshot(baseConfig, "2026-07-30T00:00:00.000Z");
  const remoteSnapshot = createCloudSyncSnapshot(remoteConfig, "2026-07-30T00:01:00.000Z");
  const key = encryptCloudSyncSnapshotForTest(baseSnapshot, password, keySalt);
  const encryptedRemote = encryptCloudSyncSnapshotForTest(
    remoteSnapshot,
    password,
    keySalt
  ).encrypted;
  localConfig.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3000",
    deviceId: "00000000-0000-4000-8000-000000000013",
    deviceName: "test-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 1,
    lastSyncedSnapshot: baseSnapshot,
    namespace: "ccr",
    refreshToken: "refresh-token"
  };

  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (input) => {
    requests += 1;
    const url = new URL(String(input));
    assert.equal(url.pathname, "/sync/pull");
    return new Response(JSON.stringify({
      document: {
        encryptedSnapshot: encryptedRemote,
        namespace: "ccr",
        revision: 2,
        snapshotHash: "remote-hash",
        snapshotRevision: 2,
        updatedAt: "2026-07-30T00:01:00.000Z"
      },
      operations: [],
      pagination: {
        hasMore: false,
        limit: 100,
        nextRevision: null
      }
    }), { status: 200 });
  };

  try {
    const conflicted = await pullCloudSyncConfig(localConfig, { password });

    assert.equal(conflicted.conflict, true);
    assert.equal(conflicted.mergeApplied, false);
    assert.equal(conflicted.snapshotApplied, false);
    assert.equal(conflicted.config.preferredProvider, "Local");
    assert.deepEqual(conflicted.mergeConflicts, ["config.preferredProvider"]);
    assert.equal(conflicted.status.pendingConflict?.id, conflicted.conflictResolution?.id);
    assert.deepEqual(conflicted.conflictResolution.fields, [{
      local: { exists: true, value: "Local" },
      path: "config.preferredProvider",
      remote: { exists: true, value: "Remote" }
    }]);
    await assert.rejects(
      () => resolveCloudSyncConflict(conflicted.config, {
        conflictId: conflicted.conflictResolution.id,
        resolutions: []
      }),
      /Resolve every cloud sync conflict field/i
    );

    const changedAfterConflict = {
      ...conflicted.config,
      preferredProvider: "Changed again"
    };
    const staleResolution = await resolveCloudSyncConflict(changedAfterConflict, {
      conflictId: conflicted.conflictResolution.id,
      preference: "remote"
    });
    assert.match(staleResolution.message, /changed after the conflict/i);
    assert.equal(staleResolution.config.preferredProvider, "Changed again");

    const refreshed = await pullCloudSyncConfig(staleResolution.config, { password });
    const resolved = await resolveCloudSyncConflict(refreshed.config, {
      conflictId: refreshed.conflictResolution.id,
      preference: "remote"
    });

    assert.equal(requests, 3);
    assert.equal(resolved.config.preferredProvider, "Remote");
    assert.equal(resolved.mergeApplied, true);
    assert.equal(resolved.snapshotApplied, true);
    assert.equal(resolved.snapshotPushed, false);
    assert.equal(resolved.status.pendingConflict, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud sync conflict descriptors redact secrets nested inside container values", async () => {
  const password = "nested conflict secret password";
  const keySalt = Buffer.alloc(16, 36).toString("base64");
  const baseConfig = createDefaultAppConfig();
  baseConfig.Providers = [{
    api_key: "base-container-secret",
    api_base_url: "https://example.test/v1",
    models: ["model"],
    name: "Example"
  }];
  const localConfig = structuredClone(baseConfig);
  localConfig.Providers = [];
  const remoteConfig = structuredClone(baseConfig);
  remoteConfig.Providers[0].api_key = "remote-container-secret";
  const baseSnapshot = createCloudSyncSnapshot(baseConfig, "2026-07-30T00:00:00.000Z");
  const remoteSnapshot = createCloudSyncSnapshot(remoteConfig, "2026-07-30T00:01:00.000Z");
  const key = encryptCloudSyncSnapshotForTest(baseSnapshot, password, keySalt);
  const encryptedRemote = encryptCloudSyncSnapshotForTest(remoteSnapshot, password, keySalt).encrypted;
  localConfig.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3036",
    deviceName: "nested-conflict-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 1,
    lastSyncedSnapshot: baseSnapshot,
    namespace: "ccr"
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    document: {
      encryptedSnapshot: encryptedRemote,
      namespace: "ccr",
      revision: 2,
      snapshotHash: "remote-hash",
      snapshotRevision: 2
    },
    operations: [],
    pagination: {
      hasMore: false,
      limit: 100,
      nextRevision: null
    }
  }), { status: 200 });

  try {
    const result = await pullCloudSyncConfig(localConfig, { password });
    const field = result.conflictResolution.fields.find(
      (candidate) => candidate.path === "config.Providers[Example]"
    );
    assert.equal(field.sensitive, true);
    assert.deepEqual(field.local, { exists: false });
    assert.deepEqual(field.remote, { exists: true });
    assert.equal(JSON.stringify(result.conflictResolution).includes("remote-container-secret"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reviewed cloud sync values support per-field side choices and custom JSON", async () => {
  const password = "correct horse battery staple";
  const keySalt = Buffer.alloc(16, 15).toString("base64");
  const baseConfig = createDefaultAppConfig();
  baseConfig.preferredProvider = "Base";
  baseConfig.Providers = [{
    api_key: "base-secret",
    api_base_url: "https://example.test/v1",
    models: ["model"],
    name: "Example"
  }];
  const localConfig = createDefaultAppConfig();
  localConfig.preferredProvider = "Local";
  localConfig.Router.fallback.retryCount = 2;
  localConfig.Providers = [{
    ...baseConfig.Providers[0],
    api_key: "local-secret"
  }];
  const remoteConfig = createDefaultAppConfig();
  remoteConfig.preferredProvider = "Remote";
  remoteConfig.Router.fallback.retryCount = 3;
  remoteConfig.Providers = [{
    ...baseConfig.Providers[0],
    api_key: "remote-secret"
  }];
  const baseSnapshot = createCloudSyncSnapshot(baseConfig, "2026-07-30T00:00:00.000Z");
  const remoteSnapshot = createCloudSyncSnapshot(remoteConfig, "2026-07-30T00:01:00.000Z");
  const key = encryptCloudSyncSnapshotForTest(baseSnapshot, password, keySalt);
  const encryptedRemote = encryptCloudSyncSnapshotForTest(
    remoteSnapshot,
    password,
    keySalt
  ).encrypted;
  localConfig.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3000",
    deviceId: "00000000-0000-4000-8000-000000000015",
    deviceName: "test-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 1,
    lastSyncedSnapshot: baseSnapshot,
    namespace: "ccr",
    refreshToken: "refresh-token"
  };

  const originalFetch = globalThis.fetch;
  let pushedBody;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/sync/pull") {
      return new Response(JSON.stringify({
        document: {
          encryptedSnapshot: encryptedRemote,
          namespace: "ccr",
          revision: 2,
          snapshotHash: "remote-hash",
          snapshotRevision: 2,
          updatedAt: "2026-07-30T00:01:00.000Z"
        },
        operations: [],
        pagination: {
          hasMore: false,
          limit: 100,
          nextRevision: null
        }
      }), { status: 200 });
    }

    assert.equal(url.pathname, "/sync/push");
    pushedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      accepted: true,
      conflict: false,
      document: {
        encryptedSnapshot: pushedBody.encryptedSnapshot,
        namespace: "ccr",
        revision: 3,
        snapshotHash: pushedBody.snapshotHash,
        snapshotRevision: 3,
        updatedAt: "2026-07-30T00:02:00.000Z"
      },
      mergeRequired: false,
      snapshotAccepted: true
    }), { status: 200 });
  };

  try {
    const conflicted = await pullCloudSyncConfig(localConfig, { password });
    assert.deepEqual(
      conflicted.conflictResolution.fields.map((field) => field.path).sort(),
      [
        "config.Providers[Example].api_key",
        "config.Router.fallback.retryCount",
        "config.preferredProvider"
      ]
    );
    const sensitiveField = conflicted.conflictResolution.fields.find(
      (field) => field.path === "config.Providers[Example].api_key"
    );
    assert.equal(sensitiveField.sensitive, true);
    assert.deepEqual(sensitiveField.local, { exists: true });
    assert.deepEqual(sensitiveField.remote, { exists: true });
    const resolved = await resolveCloudSyncConflict(conflicted.config, {
      conflictId: conflicted.conflictResolution.id,
      resolutions: conflicted.conflictResolution.fields.map((field) => ({
        path: field.path,
        ...(field.path === "config.Providers[Example].api_key"
          ? { source: "remote" }
          : field.path === "config.preferredProvider"
            ? { source: "local" }
            : { result: { exists: true, value: 9 } })
      }))
    });

    assert.equal(pushedBody.baseRevision, 2);
    assert.equal(resolved.config.preferredProvider, "Local");
    assert.equal(resolved.config.Providers[0].api_key, "remote-secret");
    assert.equal(resolved.config.Router.fallback.retryCount, 9);
    assert.equal(resolved.snapshotPushed, true);
    assert.equal(resolved.status.pendingConflict, undefined);
    const pushedSnapshot = decryptCloudSyncSnapshotForTest(
      pushedBody.encryptedSnapshot,
      password,
      keySalt
    );
    assert.equal(pushedSnapshot.config.preferredProvider, "Local");
    assert.equal(pushedSnapshot.config.Providers[0].api_key, "remote-secret");
    assert.equal(pushedSnapshot.config.Router.fallback.retryCount, 9);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud sync conflict paging ignores rejected stale snapshots before merge and retry", async () => {
  const password = "correct horse battery staple";
  const keySalt = Buffer.alloc(16, 7).toString("base64");
  const baseConfig = createDefaultAppConfig();
  const localConfig = createDefaultAppConfig();
  const remoteConfig = createDefaultAppConfig();
  const pendingConfig = createDefaultAppConfig();
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
  pendingConfig.Providers = [{
    api_key: "pending-secret",
    api_base_url: "https://pending.example.test/v1",
    models: ["pending-model"],
    name: "Pending"
  }];

  const baseSnapshot = createCloudSyncSnapshot(baseConfig, "2026-07-30T00:00:00.000Z");
  const remoteSnapshot = createCloudSyncSnapshot(remoteConfig, "2026-07-30T00:01:00.000Z");
  const pendingSnapshot = createCloudSyncSnapshot(pendingConfig, "2026-07-30T00:02:00.000Z");
  const key = encryptCloudSyncSnapshotForTest(baseSnapshot, password, keySalt);
  const encryptedRemote = encryptCloudSyncSnapshotForTest(remoteSnapshot, password, keySalt).encrypted;
  const encryptedPendingOperation = encryptCloudSyncOperationForTest(pendingSnapshot, password, keySalt);
  localConfig.cloudSync = {
    accessToken: "access-token",
    baseUrl: "http://127.0.0.1:3000",
    deviceId: "00000000-0000-4000-8000-000000000001",
    deviceName: "test-device",
    enabled: true,
    keyId: key.keyId,
    keyMode: "password",
    keySalt,
    lastRevision: 1,
    lastSyncedSnapshot: baseSnapshot,
    namespace: "ccr",
    refreshToken: "refresh-token"
  };

  const originalFetch = globalThis.fetch;
  const requestBodies = [];
  const requestUrls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requestUrls.push(url);
    if (url.pathname === "/sync/pull") {
      return new Response(JSON.stringify({
        document: {
          encryptedSnapshot: encryptedRemote,
          namespace: "ccr",
          revision: 102,
          snapshotHash: "remote-hash",
          updatedAt: "2026-07-30T00:02:30.000Z"
        },
        operations: [{
          baseRevision: 1,
          clientOperationId: "pending-operation",
          encryptedPayload: encryptedPendingOperation,
          id: "00000000-0000-4000-8000-000000000100",
          revision: 101
        }],
        pagination: {
          excludeOperationId: "00000000-0000-4000-8000-000000000099",
          hasMore: false,
          limit: 100,
          nextRevision: null
        }
      }), { status: 200 });
    }

    assert.equal(url.pathname, "/sync/push");
    const body = JSON.parse(String(init?.body));
    requestBodies.push(body);
    if (requestBodies.length === 1) {
      return new Response(JSON.stringify({
        accepted: true,
        conflict: true,
        document: {
          encryptedSnapshot: encryptedRemote,
          namespace: "ccr",
          revision: 102,
          snapshotHash: "remote-hash",
          updatedAt: "2026-07-30T00:02:30.000Z"
        },
        mergeRequired: true,
        missingOperations: [],
        missingOperationsExcludeOperationId: "00000000-0000-4000-8000-000000000099",
        missingOperationsHasMore: true,
        nextMissingRevision: 100,
        snapshotAccepted: false,
        snapshotRejectedReason: "merge_required"
      }), { status: 200 });
    }

    return new Response(JSON.stringify({
      accepted: true,
      conflict: false,
      document: {
        encryptedSnapshot: body.encryptedSnapshot,
        namespace: "ccr",
        revision: 103,
        snapshotHash: body.snapshotHash,
        updatedAt: "2026-07-30T00:03:00.000Z"
      },
      mergeRequired: false,
      snapshotAccepted: true
    }), { status: 200 });
  };

  try {
    const result = await pushCloudSyncConfig(localConfig, { password });

    assert.equal(result.conflict, true);
    assert.equal(result.mergeApplied, true);
    assert.equal(result.snapshotPushed, true);
    assert.equal(requestBodies.length, 2);
    assert.equal(requestBodies[1].baseRevision, 102);
    const continuation = requestUrls.find((url) => url.pathname === "/sync/pull");
    assert.equal(continuation?.searchParams.get("sinceRevision"), "100");
    assert.equal(
      continuation?.searchParams.get("excludeOperationId"),
      "00000000-0000-4000-8000-000000000099"
    );

    const mergedSnapshot = decryptCloudSyncSnapshotForTest(
      requestBodies[1].encryptedSnapshot,
      password,
      keySalt
    );
    assert.deepEqual(
      mergedSnapshot.config.Providers.map((provider) => provider.name).sort(),
      ["Local", "Remote"]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
