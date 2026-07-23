import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfileConfig } from "@ccr/core/contracts/app.ts";
import { AgentProfileContextPanel, DeleteProfileDialog, ProfileView } from "@ccr/ui/pages/home/components/profiles.tsx";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { createProfileDraft, normalizeUnknownProfileItem, profileDraftWithDetectedAppPath } from "@ccr/ui/pages/home/shared/profiles.ts";
import { appConfigFixture } from "../fixtures/index.ts";

const profile: ProfileConfig = {
  agent: "claude-code",
  enabled: true,
  id: "claude-code-main",
  model: "openai/gpt-5.2",
  name: "Claude Code Main"
};

test("DeleteProfileDialog identifies the profile and requires an explicit confirmation", () => {
  const html = renderToStaticMarkup(
    <DeleteProfileDialog onClose={() => undefined} onConfirm={() => undefined} profile={profile} />
  );

  assert.match(html, /Delete Profile/);
  assert.match(html, /Delete this agent profile from the configuration\?/);
  assert.match(html, /Claude Code Main/);
  assert.match(html, /Claude Code/);
  assert.match(html, />Cancel<\/button>/);
  assert.match(html, />Delete<\/button>/);
});

test("DeleteProfileDialog renders the Chinese confirmation copy", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <DeleteProfileDialog onClose={() => undefined} onConfirm={() => undefined} profile={profile} />
    </AppI18nContext.Provider>
  );

  assert.match(html, /删除 Agent 配置/);
  assert.match(html, /从配置中删除这个 Agent 配置档案？/);
  assert.match(html, />取消<\/button>/);
  assert.match(html, />删除<\/button>/);
});

test("ProfileView keeps launch actions directly accessible in an aligned action bar", () => {
  const config = appConfigFixture();
  config.profile.profiles = [
    {
      ...profile,
      scope: "ccr",
      surface: "auto"
    },
    {
      agent: "zcode",
      enabled: true,
      id: "zcode-main",
      model: "openai/gpt-5.2",
      name: "ZCode Main",
      scope: "global",
      surface: "app"
    }
  ];

  const html = renderToStaticMarkup(
    <ProfileView
      addProfile={() => undefined}
      applyError=""
      config={config}
      copyProfileCliCommand={() => undefined}
      editProfile={() => undefined}
      openProfileApp={() => undefined}
      profileRuntimeStatus={{ profiles: [] }}
      removeProfile={() => undefined}
      stopProfileApp={() => undefined}
      updateProfileItem={() => undefined}
    />
  );

  assert.equal(html.match(/aria-label="(?:Claude Code Main|ZCode Main) Profile actions"/g)?.length, 2);
  assert.match(html, /Configuration/);
  assert.match(html, /aria-label="Claude Code Main Launch actions"/);
  assert.match(html, /aria-label="Claude Code Main Management actions"/);
  assert.match(html, /aria-label="Copy CLI command Claude Code Main"/);
  assert.match(html, /aria-label="Start App Claude Code Main"/);
  assert.match(html, /aria-label="Start App ZCode Main"/);
  assert.doesNotMatch(html, /aria-label="Copy CLI command ZCode Main"/);
});

test("AgentProfileContextPanel explains agent-specific requirements and provider availability", () => {
  const html = renderToStaticMarkup(
    <AgentProfileContextPanel agent="codex" availableModelCount={1} providerCount={1} />
  );

  assert.match(html, /Profile requirements/);
  assert.match(html, /Provider ID and Provider name identify the routed provider in Codex\./);
  assert.match(html, /1 model/);
});

test("detected CHATGPT_APP_PATH is used as the Codex profile default", () => {
  const detectedPath = "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT";
  const draft = profileDraftWithDetectedAppPath(createProfileDraft("codex"), `  ${detectedPath}  `);

  assert.equal(draft.appPath, detectedPath);
  assert.equal(profileDraftWithDetectedAppPath({ ...draft, appPath: "/custom/chatgpt" }, detectedPath).appPath, "/custom/chatgpt");
  assert.equal(profileDraftWithDetectedAppPath(createProfileDraft("claude-code"), detectedPath).appPath, "");
});

test("detected OPENCODE_APP_PATH is used as the OpenCode profile default", () => {
  const detectedPath = "/Applications/OpenCode.app/Contents/MacOS/OpenCode";
  const draft = profileDraftWithDetectedAppPath(createProfileDraft("opencode"), undefined, detectedPath);
  assert.equal(draft.appPath, detectedPath);
  assert.equal(profileDraftWithDetectedAppPath({ ...draft, appPath: "/custom/opencode" }, undefined, detectedPath).appPath, "/custom/opencode");
});

test("Grok CLI profile defaults to a CCR-scoped CLI entry", () => {
  const draft = createProfileDraft("grok");

  assert.equal(draft.name, "Grok CLI");
  assert.equal(draft.scope, "ccr");
  assert.equal(draft.surface, "cli");
});

test("persisted Grok profiles are normalized to the supported launch scope", () => {
  const profile = normalizeUnknownProfileItem({
    agent: "grok-cli",
    enabled: true,
    id: "grok-work",
    model: "Provider/model",
    name: "Grok Work",
    scope: "global",
    surface: "app"
  }, 0);

  assert.equal(profile?.agent, "grok");
  assert.equal(profile?.scope, "ccr");
  assert.equal(profile?.surface, "cli");
});

test("OpenCode profiles support local CLI and App configuration", () => {
  const draft = createProfileDraft("opencode");
  assert.equal(draft.name, "OpenCode");
  assert.equal(draft.configFile, "~/.config/opencode/opencode.jsonc");
  assert.equal(draft.surface, "cli");

  const profile = normalizeUnknownProfileItem({
    agent: "open-code",
    appPath: "/Applications/OpenCode.app",
    enabled: true,
    id: "opencode-work",
    model: "Provider/model",
    name: "OpenCode Work",
    scope: "ccr",
    surface: "auto"
  }, 0);
  assert.equal(profile?.agent, "opencode");
  assert.equal(profile?.appPath, "/Applications/OpenCode.app");
  assert.equal(profile?.surface, "auto");
});
