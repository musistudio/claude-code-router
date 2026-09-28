import assert from "node:assert/strict";
import test from "node:test";
import {
  pruneInactiveProfileApiKeysFromList,
  profileApiKeyId,
  profileForApiKey,
  profileForApiKeyId,
  profileIdFromApiKeyId,
  syncProfileApiKeys
} from "@ccr/core/profiles/api-key.ts";

test("profile API key ids are stable, sanitized, and profile-scoped", () => {
  assert.equal(
    profileApiKeyId({ agent: "claude-code", id: "Claude Work/Profile", name: "Claude Work" }),
    "profile:Claude-Work-Profile"
  );
  assert.equal(
    profileApiKeyId({ agent: "codex", id: "", name: "Codex Work" }),
    "profile:Codex-Work"
  );
  assert.equal(
    profileApiKeyId({ agent: "grok", id: "", name: "" }),
    "profile:grok"
  );
  assert.equal(profileApiKeyId("  Team Profile ++ "), "profile:Team-Profile");
});

test("profile API key ids expose their sanitized profile key segment", () => {
  assert.equal(profileIdFromApiKeyId("profile:Claude-Work-Profile"), "Claude-Work-Profile");
  assert.equal(profileIdFromApiKeyId(" profile:with-space "), "with-space");
  assert.equal(profileIdFromApiKeyId("general-key"), undefined);
  assert.equal(profileIdFromApiKeyId(undefined), undefined);
});

test("manual keys share an explicit profile without taking over its generated key", () => {
  const profile = { agent: "codex", enabled: true, id: "Work / Team", model: "Provider/model", name: "Work" };
  const manualKeys = ["team-key-a", "team-key-b"].map((id) => ({
    createdAt: new Date(0).toISOString(), id, key: `${id}-token`, profileId: profile.id
  }));
  const synced = syncProfileApiKeys(manualKeys, [profile], { generateKey: () => "generated-token" });
  const config = { APIKEYS: synced.apiKeys, profile: { enabled: true, profiles: [profile] } };

  assert.equal(synced.apiKeys.length, 3);
  assert.equal(synced.tokens.get(profile.id), "generated-token");
  for (const apiKey of synced.apiKeys) {
    assert.equal(profileForApiKey(config, apiKey), profile);
    assert.equal(profileForApiKeyId(config, apiKey.id), profile);
  }
  assert.equal(profileForApiKey(config, { id: "unlinked" }), undefined);
  assert.equal(profileForApiKey(config, { id: profileApiKeyId(profile), profileId: "missing" }), undefined);

  profile.enabled = false;
  assert.equal(profileForApiKeyId(config, manualKeys[0].id), undefined);
  assert.deepEqual(pruneInactiveProfileApiKeysFromList(synced.apiKeys, [profile]).apiKeys, manualKeys);
  assert.deepEqual(pruneInactiveProfileApiKeysFromList(synced.apiKeys, []).apiKeys, manualKeys);
});

test("profile API key sync creates stable independent keys per enabled profile", () => {
  const generalKey = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "general-key",
    key: "general-key",
    name: "General key"
  };
  const profileA = {
    agent: "claude-code",
    enabled: true,
    id: "profile-a",
    model: "Provider/model",
    name: "Profile A",
    scope: "ccr"
  };
  const profileB = {
    agent: "codex",
    enabled: true,
    id: "profile-b",
    model: "Provider/model",
    name: "Profile B",
    scope: "ccr"
  };
  let generated = 0;

  const first = syncProfileApiKeys([generalKey], [profileA, profileB], {
    generateKey: () => `generated-profile-key-${++generated}`,
    now: () => "2026-01-02T00:00:00.000Z"
  });

  assert.equal(first.changed, true);
  assert.deepEqual(first.apiKeys.map((apiKey) => apiKey.id), [
    "general-key",
    "profile:profile-a",
    "profile:profile-b"
  ]);
  assert.equal(first.tokens.get("profile-a"), "generated-profile-key-1");
  assert.equal(first.tokens.get("profile-b"), "generated-profile-key-2");
  assert.notEqual(first.tokens.get("profile-a"), first.tokens.get("profile-b"));

  const renamedProfileA = { ...profileA, name: "Profile A Renamed" };
  const second = syncProfileApiKeys(first.apiKeys, [renamedProfileA, profileB], {
    generateKey: () => {
      throw new Error("existing profile keys should be reused");
    }
  });

  assert.equal(second.changed, true);
  assert.equal(second.tokens.get("profile-a"), "generated-profile-key-1");
  assert.equal(second.tokens.get("profile-b"), "generated-profile-key-2");
  assert.equal(
    second.apiKeys.find((apiKey) => apiKey.id === profileApiKeyId(profileA))?.name,
    "Profile: Profile A Renamed"
  );

  const pruned = pruneInactiveProfileApiKeysFromList(second.apiKeys, [
    renamedProfileA,
    { ...profileB, enabled: false }
  ]);

  assert.equal(pruned.changed, true);
  assert.deepEqual(pruned.apiKeys.map((apiKey) => apiKey.id), [
    "general-key",
    "profile:profile-a"
  ]);
  assert.equal(
    pruned.apiKeys.find((apiKey) => apiKey.id === profileApiKeyId(profileA))?.key,
    "generated-profile-key-1"
  );
});
