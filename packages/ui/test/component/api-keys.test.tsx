import assert from "node:assert/strict";
import test, { before } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfileConfig } from "@ccr/core/contracts/app.ts";
import { AddApiKeyDialog, ApiKeysView } from "@ccr/ui/pages/home/components/api-keys.tsx";
import { apiKeyMatchesQuery, createApiKeyDraft, createApiKeyEditDraft, createApiKeyList, createGeneratedApiKey, normalizeApiKeys, updateApiKeyEditableConfig } from "@ccr/ui/pages/home/shared/api-keys.ts";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { appConfigFixture, installBrowserGlobals } from "../fixtures/index.ts";

const profile: ProfileConfig = { agent: "codex", enabled: true, id: "Work / Team", model: "Provider/model", name: "Team Profile" };
const noop = () => undefined;

before(() => {
  installBrowserGlobals();
  Object.assign(window, { crypto: globalThis.crypto, btoa: globalThis.btoa });
});

test("API key creation defaults to no profile and offers enabled profiles in Chinese", () => {
  const draft = createApiKeyDraft();
  assert.equal(draft.profileId, "");
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <AddApiKeyDialog
        canSubmit={false} draft={draft} error="" onChange={noop} onClose={noop} onSubmit={noop}
        profiles={[profile, { ...profile, enabled: false, id: "disabled", name: "Disabled Profile" }]}
      />
    </AppI18nContext.Provider>
  );
  assert.match(html, /关联 Profile/);
  assert.match(html, /value="" selected="">不关联 Profile/);
  assert.match(html, /value="Work \/ Team">Team Profile/);
  assert.doesNotMatch(html, /Disabled Profile/);
});

test("API key generation, normalization and limit edits retain the optional profile binding", () => {
  const draft = { ...createApiKeyDraft(), name: "Team key", profileId: profile.id };
  const linked = createGeneratedApiKey(draft);
  assert.equal(linked.profileId, profile.id);
  assert.match(linked.id, /^key_/);
  const normalized = normalizeApiKeys([linked]);
  assert.deepEqual(normalized, [linked]);
  const edited = updateApiKeyEditableConfig(linked, { ...createApiKeyEditDraft(linked), expirationPreset: "30d" });
  assert.equal(edited.profileId, profile.id);
  assert.equal(edited.key, linked.key);
  assert.equal(edited.id, linked.id);
  assert.ok(edited.expiresAt);
  assert.equal(createGeneratedApiKey({ ...draft, profileId: "" }).profileId, undefined);
});

test("a removed selection stays visible as unavailable instead of appearing unlinked", () => {
  const html = renderToStaticMarkup(
    <AddApiKeyDialog
      canSubmit draft={{ ...createApiKeyDraft(), name: "Team key", profileId: profile.id }} error=""
      onChange={noop} onClose={noop} onSubmit={noop} profiles={[]}
    />
  );
  assert.match(html, /disabled="" value="Work \/ Team" selected="">Profile unavailable/);
  assert.match(html, /value="">No linked Profile/);
});

test("API key list displays and searches linked profile names, with an ID fallback after deletion", () => {
  const config = appConfigFixture();
  config.APIKEYS = [createGeneratedApiKey({ ...createApiKeyDraft(), name: "Team key", profileId: profile.id })];
  config.profile.profiles = [profile];
  const items = createApiKeyList(config);
  assert.equal(items[0].profileName, profile.name);
  assert.equal(apiKeyMatchesQuery(items[0], "team profile"), true);
  const html = renderToStaticMarkup(
    <ApiKeysView addApiKey={noop} apiKeys={items} editApiKey={noop} error="" notify={noop} removeApiKey={noop} />
  );
  assert.match(html, /Linked Profile.*Team Profile/);
  config.profile.profiles = [];
  assert.equal(createApiKeyList(config)[0].profileName, profile.id);
});
