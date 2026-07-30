import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  completeCloudSyncLogin,
  applyCloudSyncSnapshot,
  createCloudSyncSnapshot,
  decryptCloudSyncSnapshotForTest,
  encryptCloudSyncOperationForTest,
  encryptCloudSyncSnapshotForTest,
  mergeCloudSyncSnapshotsForTest,
  pullCloudSyncConfig,
  pushCloudSyncConfig,
  resolveCloudSyncConflict,
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

test("reviewed cloud sync values support per-field side choices and custom JSON", async () => {
  const password = "correct horse battery staple";
  const keySalt = Buffer.alloc(16, 15).toString("base64");
  const baseConfig = createDefaultAppConfig();
  baseConfig.preferredProvider = "Base";
  const localConfig = createDefaultAppConfig();
  localConfig.preferredProvider = "Local";
  localConfig.Router.fallback.retryCount = 2;
  const remoteConfig = createDefaultAppConfig();
  remoteConfig.preferredProvider = "Remote";
  remoteConfig.Router.fallback.retryCount = 3;
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
      ["config.Router.fallback.retryCount", "config.preferredProvider"]
    );
    const resolved = await resolveCloudSyncConflict(conflicted.config, {
      conflictId: conflicted.conflictResolution.id,
      resolutions: conflicted.conflictResolution.fields.map((field) => ({
        path: field.path,
        result: field.path === "config.preferredProvider"
          ? field.local
          : { exists: true, value: 9 }
      }))
    });

    assert.equal(pushedBody.baseRevision, 2);
    assert.equal(resolved.config.preferredProvider, "Local");
    assert.equal(resolved.config.Router.fallback.retryCount, 9);
    assert.equal(resolved.snapshotPushed, true);
    assert.equal(resolved.status.pendingConflict, undefined);
    const pushedSnapshot = decryptCloudSyncSnapshotForTest(
      pushedBody.encryptedSnapshot,
      password,
      keySalt
    );
    assert.equal(pushedSnapshot.config.preferredProvider, "Local");
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
