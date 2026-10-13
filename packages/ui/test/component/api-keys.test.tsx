import assert from "node:assert/strict";
import test, { before } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfileConfig } from "@ccr/core/contracts/app.ts";
import { AddApiKeyDialog } from "@ccr/ui/pages/home/components/api-keys.tsx";
import { createApiKeyDraft, createGeneratedApiKey } from "@ccr/ui/pages/home/shared/api-keys.ts";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { installBrowserGlobals } from "../fixtures/index.ts";

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
  assert.equal(createGeneratedApiKey({ ...draft, profileId: profile.id }).profileId, profile.id);
});
