import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfileConfig } from "@ccr/core/contracts/app.ts";
import { AddProfileForm, DeleteProfileDialog, ProfileView } from "@ccr/ui/pages/home/components/profiles.tsx";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { createProfileDraft, createProfileDraftFromProfile, isProfileDraftSubmittable, normalizeUnknownProfileItem, profileConfigFromDraft, profileDraftWithDetectedAppPath, profileSummaryItems } from "@ccr/ui/pages/home/shared/profiles.ts";
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
  assert.match(html, /aria-label="Copy CLI command Claude Code Main"/);
  assert.match(html, /aria-label="Start App Claude Code Main"/);
  assert.match(html, /aria-label="Start App ZCode Main"/);
  assert.doesNotMatch(html, /aria-label="Copy CLI command ZCode Main"/);
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

test("new Claude Code profiles default to isolated configuration", () => {
  const draft = createProfileDraft("claude-code");

  assert.equal(draft.claudeConfigMode, "isolated");
});

test("non-Claude profiles do not persist Claude configuration mode", () => {
  const saved = profileConfigFromDraft(createProfileDraft("codex"), []);

  assert.equal(saved.claudeConfigMode, undefined);
});

test("inherited Claude Code configuration survives profile editing", () => {
  const existing = {
    ...profile,
    claudeConfigMode: "inherit",
    scope: "ccr",
    settingsFile: "~/.claude/settings.json",
    surface: "cli"
  } satisfies ProfileConfig;
  const draft = createProfileDraftFromProfile(existing);

  assert.equal(draft.claudeConfigMode, "inherit");
  const saved = profileConfigFromDraft(draft, [existing], existing);
  assert.equal(saved.claudeConfigMode, "inherit");
  assert.equal(saved.settingsFile, "~/.claude/settings.json");
});

test("Claude Code allowed models survive profile editing", () => {
  const existing = {
    ...profile,
    allowedModels: ["opus", "fable", "openai/gpt-5.6-sol"],
    scope: "ccr",
    surface: "cli"
  } satisfies ProfileConfig;
  const draft = createProfileDraftFromProfile(existing);

  assert.equal(draft.allowedModels, "opus\nfable\nopenai/gpt-5.6-sol");
  const saved = profileConfigFromDraft(draft, [existing], existing);
  assert.deepEqual(saved.allowedModels, ["opus", "fable", "openai/gpt-5.6-sol"]);
  assert.deepEqual(
    profileSummaryItems(existing, appConfigFixture(), (value) => value)
      .find((item) => item.label === "Allowed models"),
    { label: "Allowed models", value: "opus, fable, openai/gpt-5.6-sol" }
  );
});

test("Claude Code allowed models accept lines and commas while empty input stays unset", () => {
  const draft = createProfileDraft("claude-code");

  assert.deepEqual(
    profileConfigFromDraft({ ...draft, allowedModels: "opus, fable\nopenai/gpt-5.6-sol\nOPUS" }, []).allowedModels,
    ["opus", "fable", "openai/gpt-5.6-sol"]
  );
  assert.equal(profileConfigFromDraft({ ...draft, allowedModels: " \n, " }, []).allowedModels, undefined);
  assert.equal(profileConfigFromDraft({ ...createProfileDraft("codex"), allowedModels: "opus" }, []).allowedModels, undefined);
});

test("app-only Claude Code profiles hide and drop allowed models", () => {
  const existing = {
    ...profile,
    allowedModels: ["opus", "fable"],
    surface: "app"
  } satisfies ProfileConfig;
  const draft = createProfileDraftFromProfile(existing);
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={[]}
      draft={draft}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={[]}
    />
  );

  assert.equal(draft.allowedModels, "");
  assert.equal(profileConfigFromDraft({ ...draft, allowedModels: "opus" }, [existing], existing).allowedModels, undefined);
  assert.equal(normalizeUnknownProfileItem(existing, 0)?.allowedModels, undefined);
  assert.equal(
    profileSummaryItems(existing, appConfigFixture(), (value) => value)
      .find((item) => item.label === "Allowed models"),
    undefined
  );
  assert.doesNotMatch(html, /Allowed models/);
  assert.doesNotMatch(html, /Use native aliases such as opus or fable/);
});

test("global Claude Code profiles hide and drop allowed models", () => {
  const existing = {
    ...profile,
    allowedModels: ["opus", "fable"],
    scope: "global",
    surface: "cli"
  } satisfies ProfileConfig;
  const draft = createProfileDraftFromProfile(existing);
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={[]}
      draft={draft}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={[]}
    />
  );

  assert.equal(draft.allowedModels, "");
  assert.equal(profileConfigFromDraft({ ...draft, allowedModels: "opus" }, [existing], existing).allowedModels, undefined);
  assert.equal(normalizeUnknownProfileItem(existing, 0)?.allowedModels, undefined);
  assert.equal(
    profileSummaryItems(existing, appConfigFixture(), (value) => value)
      .find((item) => item.label === "Allowed models"),
    undefined
  );
  assert.doesNotMatch(html, /Allowed models/);
  assert.doesNotMatch(html, /Use native aliases such as opus or fable/);
});

test("auto Claude Code profiles retain and expose allowed models", () => {
  const draft = {
    ...createProfileDraft("claude-code"),
    allowedModels: "opus, fable",
    surface: "auto" as const
  };
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={[]}
      draft={draft}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={[]}
    />
  );

  assert.deepEqual(profileConfigFromDraft(draft, []).allowedModels, ["opus", "fable"]);
  assert.match(html, /Allowed models/);
  assert.match(html, /Use native aliases such as opus or fable/);
});

test("persisted inherited Claude Code configuration survives normalization", () => {
  const normalized = normalizeUnknownProfileItem({
    agent: "claude-code",
    claudeConfigMode: "inherit",
    enabled: true,
    id: "inherited-cli",
    model: "Provider/model",
    name: "Inherited CLI",
    scope: "ccr",
    settingsFile: "~/.claude/settings.json",
    surface: "cli"
  }, 0);

  assert.equal(normalized?.claudeConfigMode, "inherit");
});

test("persisted Claude Code allowed models survive normalization", () => {
  const normalized = normalizeUnknownProfileItem({
    agent: "claude-code",
    allowedModels: [" opus ", "fable", "opus", null],
    enabled: true,
    id: "allowed-models-cli",
    model: "",
    name: "Allowed Models CLI",
    scope: "ccr",
    surface: "cli"
  }, 0);

  assert.deepEqual(normalized?.allowedModels, ["opus", "fable"]);
});

test("inherited Claude Code profile summary identifies the reused configuration", () => {
  const inherited = {
    ...profile,
    claudeConfigMode: "inherit",
    scope: "ccr",
    settingsFile: "~/.claude/settings.json",
    surface: "cli"
  } satisfies ProfileConfig;

  assert.deepEqual(
    profileSummaryItems(inherited, appConfigFixture(), (value) => value)
      .filter((item) => item.label === "Claude configuration" || item.label === "Settings file"),
    [
      { label: "Claude configuration", value: "Reuse existing Claude configuration" },
      { label: "Settings file", value: "~/.claude/settings.json" }
    ]
  );
});

test("system-default Claude Code profile summary does not claim isolated configuration", () => {
  const systemDefault = {
    ...profile,
    claudeConfigMode: "isolated",
    scope: "global",
    settingsFile: "~/.claude/settings.json",
    surface: "cli"
  } satisfies ProfileConfig;

  assert.equal(
    profileSummaryItems(systemDefault, appConfigFixture(), (value) => value)
      .some((item) => item.label === "Claude configuration"),
    false
  );
});

test("Claude Code profile form exposes isolated and inherited configuration", () => {
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={[]}
      draft={createProfileDraft("claude-code")}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={[]}
    />
  );

  assert.match(html, /Claude configuration/);
  assert.match(html, /Isolated CCR configuration/);
  assert.match(html, /Reuse existing Claude configuration/);
  assert.match(html, /Allowed models/);
  assert.match(html, /Use native aliases such as opus or fable/);
});

test("non-Claude profile form hides the allowed models control", () => {
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={[]}
      draft={createProfileDraft("codex")}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={[]}
    />
  );

  assert.doesNotMatch(html, /Allowed models/);
  assert.doesNotMatch(html, /Use native aliases such as opus or fable/);
});

test("system-default Claude Code profile form hides CCR configuration modes", () => {
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={[]}
      draft={{ ...createProfileDraft("claude-code"), scope: "global" }}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={[]}
    />
  );

  assert.doesNotMatch(html, /Claude configuration/);
  assert.doesNotMatch(html, /Isolated CCR configuration/);
  assert.doesNotMatch(html, /Reuse existing Claude configuration/);
});

test("inherited Claude Code profile form exposes the existing settings path", () => {
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={[]}
      draft={{ ...createProfileDraft("claude-code"), claudeConfigMode: "inherit" }}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={[]}
    />
  );

  assert.match(html, /Existing Claude settings file/);
  assert.match(html, /After any managed System-default backup is restored/);
  assert.match(html, /Changes made by the launched CLI remain shared/);
  assert.match(html, /CCR keeps native default paths for ~\/.claude\/settings.json. Custom selections must also be named settings.json and use the file&#x27;s parent directory as CLAUDE_CONFIG_DIR/);
  assert.match(html, /value="~\/.claude\/settings.json"/);
});

test("inherited Claude Code profile form renders the Chinese configuration copy", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <AddProfileForm
        botConfigs={[]}
        draft={{ ...createProfileDraft("claude-code"), claudeConfigMode: "inherit" }}
        error=""
        onChange={() => undefined}
        onCreateBot={() => undefined}
        providers={[]}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /复用现有 Claude 配置/);
  assert.match(html, /现有 Claude 设置文件/);
  assert.match(html, /恢复任何由 CCR 管理的系统默认备份后/);
  assert.match(html, /由启动的 CLI 所做的更改仍会共享/);
});

test("inherited Claude Code profile draft requires a CLI-only CCR settings path", () => {
  const draft = { ...createProfileDraft("claude-code"), claudeConfigMode: "inherit" as const };

  assert.equal(isProfileDraftSubmittable(draft), true);
  assert.equal(isProfileDraftSubmittable({ ...draft, settingsFile: " " }), false);
  assert.equal(isProfileDraftSubmittable({ ...draft, settingsFile: "~/.claude/preferences.json" }), false);
  assert.equal(isProfileDraftSubmittable({ ...draft, settingsFile: "C:\\Users\\example-user\\.claude\\SETTINGS.JSON" }), false);
  assert.equal(isProfileDraftSubmittable({ ...draft, settingsFile: "C:\\Users\\example-user\\.claude\\settings.json" }), true);
  assert.equal(isProfileDraftSubmittable({ ...draft, scope: "global" }), false);
  assert.equal(isProfileDraftSubmittable({ ...draft, surface: "auto" }), false);
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
