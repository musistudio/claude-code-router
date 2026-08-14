import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfileConfig } from "@ccr/core/contracts/app.ts";
import { AddProfileForm, DeleteProfileDialog, ForceStopZcodeDialog, ProfileView } from "@ccr/ui/pages/home/components/profiles.tsx";
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

test("ForceStopZcodeDialog warns before force-killing a CCR-owned instance", () => {
  const zcodeProfile: ProfileConfig = {
    agent: "zcode",
    enabled: true,
    id: "zcode-main",
    model: "zcode/glm-5",
    name: "ZCode Main"
  };
  const html = renderToStaticMarkup(
    <ForceStopZcodeDialog onClose={() => undefined} onConfirm={() => undefined} profile={zcodeProfile} />
  );

  assert.match(html, /Force quit ZCode\?/);
  assert.match(html, /Unsaved work may be lost\./);
  assert.match(html, /Closing the ZCode window only sends it to the system tray\./);
  assert.match(html, /Force quitting immediately ends ZCode and its child processes\./);
  assert.match(html, />Cancel<\/button>/);
  assert.match(html, />Force quit<\/button>/);
});

test("ForceStopZcodeDialog identifies an external instance in Chinese", () => {
  const zcodeProfile: ProfileConfig = {
    agent: "zcode",
    enabled: true,
    id: "zcode-main",
    model: "zcode/glm-5",
    name: "ZCode Main"
  };
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <ForceStopZcodeDialog external onClose={() => undefined} onConfirm={() => undefined} profile={zcodeProfile} />
    </AppI18nContext.Provider>
  );

  assert.match(html, /强制退出 ZCode？/);
  assert.match(html, /未保存的内容可能会丢失。/);
  assert.match(html, /该 ZCode 不是由 CCR 启动的。/);
  assert.match(html, />取消<\/button>/);
  assert.match(html, />强制退出<\/button>/);
});

test("AddProfileForm does not show the profile requirements panel", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={createProfileDraft("claude-code")}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(html, /Effect scope/);
  assert.doesNotMatch(html, /Profile requirements/);
  assert.doesNotMatch(html, /Profile guidance/);
});

test("AddProfileForm keeps profile routing inside Advanced settings", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={createProfileDraft("claude-code")}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(html, /Advanced settings/);
  assert.doesNotMatch(html, /Profile routing/);
  assert.doesNotMatch(html, /Routing disabled/);
  assert.doesNotMatch(html, /Enhanced route/);
});

test("AddProfileForm shows enhanced route as a sibling of profile routing", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={createProfileDraft("claude-code")}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
  const advancedSettingsIndex = html.indexOf("Advanced settings");
  const enhancedRouteIndex = html.indexOf("Enhanced route");
  const profileRoutingIndex = html.indexOf("Profile routing");

  assert.ok(advancedSettingsIndex >= 0);
  assert.ok(enhancedRouteIndex > advancedSettingsIndex);
  assert.ok(profileRoutingIndex > advancedSettingsIndex);
  assert.ok(enhancedRouteIndex < profileRoutingIndex);
  assert.doesNotMatch(html, /Routing disabled/);
  assert.match(html, /Enhanced route/);
  assert.match(html, /rounded-b-none/);
  assert.match(html, /rounded-b-md border border-t-0/);
  assert.doesNotMatch(html, /Profile routes/);
  assert.match(html, /CCR built-in Claude Code routing optimizes requests to third-party models for this profile\./);
});

test("AddProfileForm shows private profile routes when profile routing is enabled", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={{ ...createProfileDraft("claude-code"), routingEnabled: true }}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(html, /Profile routing/);
  assert.match(html, /Enhanced route/);
  assert.match(html, /Profile routes/);
  assert.ok(html.indexOf("Enhanced route") < html.indexOf("Profile routing"));
  assert.match(html, /CCR built-in Claude Code routing optimizes requests to third-party models for this profile\./);
  assert.match(html, /data-ui-tooltip-trigger/);
});

test("AddProfileForm uses Codex-specific enhanced route info for Codex profiles", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={{ ...createProfileDraft("codex"), routingEnabled: true }}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(html, /Enhanced route/);
  assert.match(html, /CCR built-in Codex routing optimizes requests to third-party models for this profile\./);
});

test("AddProfileForm places CLAUDE_APP_PATH below Bot settings", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs ?? []}
      draft={{ ...createProfileDraft("claude-code"), surface: "app" }}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
  const botIndex = html.indexOf(">Bot</span>");
  const appPathIndex = html.indexOf("CLAUDE_APP_PATH");
  const envIndex = html.indexOf("Environment variables");

  assert.ok(botIndex >= 0);
  assert.ok(appPathIndex > botIndex);
  assert.ok(envIndex > appPathIndex);
  assert.doesNotMatch(html, /rounded-md border border-border bg-background p-1 transition-colors/);
});

test("AddProfileForm marks required and optional fields", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={createProfileDraft("claude-code")}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.equal(html.match(/>Required<\/span>/g)?.length, 5);
  assert.equal(html.match(/>Optional<\/span>/g)?.length, 4);
  assert.match(html, /Default model/);
  assert.match(html, /Default model is required\./);
  assert.match(html, /Fable model/);
  assert.match(html, /Opus model/);
  assert.match(html, /Sonnet model/);
  assert.match(html, /Haiku model/);
});

test("Claude Code profiles require a default model before submission", () => {
  const draft = createProfileDraft("claude-code");

  assert.equal(isProfileDraftSubmittable(draft), false);
  assert.equal(isProfileDraftSubmittable({ ...draft, model: "anthropic/claude-sonnet-4-5" }), true);
});

test("AddProfileForm labels Kimi CLI model fields with Kimi-specific copy", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={createProfileDraft("kimi")}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(html, /Kimi model/);
  assert.match(html, /Allowed models/);
  assert.doesNotMatch(html, /Default model/);
  assert.doesNotMatch(html, /Available models/);
});

test("AddProfileForm treats Pi as a CCR-only CLI profile", () => {
  const config = appConfigFixture();
  const draft = createProfileDraft("pi");
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.equal(isProfileDraftSubmittable(draft), true);
  assert.match(html, /Pi model/);
  assert.doesNotMatch(html, /Provider ID/);
  assert.doesNotMatch(html, /Provider name/);
  assert.doesNotMatch(html, /Allowed models/);
});

test("AddProfileForm treats Claude Design as a CCR-only App profile", () => {
  const config = appConfigFixture();
  const draft = createProfileDraft("claude-design");
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={[]}
      virtualModelProfiles={[]}
    />
  );

  assert.equal(draft.name, "Claude Design");
  assert.equal(draft.scope, "ccr");
  assert.equal(draft.surface, "app");
  assert.equal(isProfileDraftSubmittable(draft), true);
  assert.match(html, /Claude Design/);
  assert.match(html, /App only/);
  assert.doesNotMatch(html, /CLI only/);
  assert.doesNotMatch(html, /Provider ID/);
  assert.doesNotMatch(html, /Provider name/);
  assert.doesNotMatch(html, /Environment variables/);
  assert.doesNotMatch(html, /Advanced settings/);
  assert.doesNotMatch(html, /Configure at least one enabled provider model/);
});

test("ProfileView renders agent profiles as compact cards with inline actions", () => {
  const config = appConfigFixture();
  config.profile.profiles = [
    {
      ...profile,
      scope: "ccr",
      surface: "auto"
    },
    {
      agent: "zcode",
      enabled: false,
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
  assert.match(html, /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,420px\),1fr\)\)/);
  assert.match(html, /min-h-\[220px\]/);
  assert.match(html, /class="flex min-w-0 items-center gap-2"/);
  assert.match(html, /Configuration/);
  assert.match(html, /class="mt-3 min-w-0 flex-1 space-y-1\.5 border-t border-border\/60 pt-2"><div class="flex min-w-0 flex-wrap items-center gap-1\.5"/);
  assert.doesNotMatch(html, /class="mt-1 flex min-w-0 flex-wrap items-center gap-1\.5"/);
  assert.match(html, /aria-label="Claude Code Main Profile actions" class="[^"]*border-t border-border\/60/);
  assert.doesNotMatch(html, />Disabled<\/span>/);
  assert.doesNotMatch(html, /aria-label="Claude Code Main Launch actions"/);
  assert.doesNotMatch(html, /aria-label="Claude Code Main Management actions"/);
  assert.match(html, /aria-label="Copy CLI command Claude Code Main"/);
  assert.match(html, /aria-label="Start App Claude Code Main"/);
  assert.match(html, /aria-label="Edit Claude Code Main"/);
  assert.match(html, /aria-label="Remove profile"/);
  assert.doesNotMatch(html, /aria-label="Start App ZCode Main"/);
  assert.doesNotMatch(html, /aria-label="Copy CLI command ZCode Main"/);
});

test("profileSummaryItems uses Kimi-specific model labels", () => {
  const config = appConfigFixture();
  const items = profileSummaryItems({
    agent: "kimi",
    availableModels: ["kimi/k2", "kimi/k3"],
    enabled: true,
    id: "kimi-main",
    model: "kimi/k2",
    name: "Kimi Main",
    scope: "ccr",
    surface: "cli"
  }, config, (value) => value);

  assert.equal(items[0]?.label, "Kimi model");
  assert.equal(items[1]?.label, "Allowed models");
  assert.equal(items[1]?.value, "2");
});

test("profileSummaryItems uses Pi-specific model labels", () => {
  const config = appConfigFixture();
  const items = profileSummaryItems({
    agent: "pi",
    enabled: true,
    id: "pi-main",
    model: "openai/gpt-5.2",
    name: "Pi Main",
    scope: "ccr",
    surface: "cli"
  }, config, (value) => value);

  assert.equal(items[0]?.label, "Pi model");
});

test("profileSummaryItems omits disabled profile properties from cards", () => {
  const config = appConfigFixture();
  const disabledItems = profileSummaryItems({
    agent: "codex",
    botGateway: { enabled: false, platform: "slack" } as NonNullable<ProfileConfig["botGateway"]>,
    enabled: true,
    id: "codex-main",
    managedCompact: false,
    model: "openai/gpt-5.2",
    name: "Codex Main",
    providerId: "claude-code-router",
    scope: "ccr",
    showAllSessions: false,
    surface: "auto"
  }, config, (value) => value);

  assert.deepEqual(disabledItems.map((item) => item.label), ["Model", "Provider ID"]);
  assert.doesNotMatch(disabledItems.map((item) => item.value).join(" "), /Disabled/);

  const enabledItems = profileSummaryItems({
    agent: "codex",
    enabled: true,
    id: "codex-main",
    managedCompact: true,
    model: "openai/gpt-5.2",
    name: "Codex Main",
    providerId: "claude-code-router",
    scope: "ccr",
    showAllSessions: true,
    surface: "auto"
  }, config, (value) => value);

  assert.match(enabledItems.map((item) => item.label).join(" "), /Show all sessions/);
  assert.match(enabledItems.map((item) => item.label).join(" "), /CCR managed compact/);
});

test("profileSummaryItems shows disabled profile enhanced route without private routing status", () => {
  const config = appConfigFixture();
  const items = profileSummaryItems({
    agent: "claude-code",
    enabled: true,
    id: "claude-main",
    model: "openai/gpt-5.2",
    name: "Claude Main",
    routing: {
      enabled: false,
      enhancedRoute: false,
      rules: []
    },
    scope: "ccr",
    surface: "cli"
  }, config, (value) => value);
  const text = items.map((item) => `${item.label} ${item.value}`).join(" ");

  assert.doesNotMatch(text, /Routing disabled/);
  assert.match(text, /Enhanced route off/);
  assert.match(items.map((item) => item.label).join(" "), /Routing/);
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

test("profile routing survives profile draft round trip", () => {
  const profile = normalizeUnknownProfileItem({
    agent: "claude-code",
    enabled: true,
    id: "claude-work",
    model: "Provider/sonnet",
    name: "Claude Work",
    routing: {
      enabled: true,
      enhancedRoute: false,
      rules: [{
        condition: { left: "request.auth.profileId", operator: "==", right: "claude-work" },
        enabled: true,
        id: "auth-profile",
        name: "Auth profile",
        rewrites: [{ key: "request.body.model", operation: "set", value: "Provider/opus" }],
        type: "condition"
      }]
    },
    scope: "ccr",
    surface: "cli"
  }, 0);

  assert.equal(profile?.routing?.enhancedRoute, false);
  assert.equal(profile?.routing?.rules[0]?.id, "auth-profile");

  const draft = createProfileDraftFromProfile(profile);
  const saved = profileConfigFromDraft(draft, [profile], profile);

  assert.equal(saved.routing?.enabled, true);
  assert.equal(saved.routing?.enhancedRoute, false);
  assert.equal(saved.routing?.rules[0]?.condition?.left, "request.auth.profileId");
});

test("disabled private profile routing persists the profile enhanced route switch", () => {
  const draft = {
    ...createProfileDraft("claude-code"),
    model: "Provider/sonnet",
    routingEnabled: false,
    routingEnhancedRoute: false
  };
  const saved = profileConfigFromDraft(draft, [], undefined);

  assert.equal(saved.routing?.enabled, false);
  assert.equal(saved.routing?.enhancedRoute, false);
  assert.deepEqual(saved.routing?.rules, []);
});

test("disabled profile routing preserves existing private rules without enabling them", () => {
  const draft = {
    ...createProfileDraft("claude-code"),
    model: "Provider/sonnet",
    routingEnabled: false,
    routingRules: [{
      condition: { left: "request.header.x-task", operator: "==", right: "heavy" },
      enabled: true,
      id: "heavy",
      name: "Heavy",
      rewrites: [{ key: "request.body.model", operation: "set", value: "Provider/opus" }],
      type: "condition"
    }]
  };
  const saved = profileConfigFromDraft(draft, [], undefined);

  assert.equal(saved.routing?.enabled, false);
  assert.equal(saved.routing?.rules[0]?.id, "heavy");
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

test("Kilo CLI profiles support local CLI configuration", () => {
  const draft = createProfileDraft("kilo");
  assert.equal(draft.name, "Kilo CLI");
  assert.equal(draft.configFile, "~/.config/kilo/kilo.jsonc");
  assert.equal(draft.surface, "cli");

  const profile = normalizeUnknownProfileItem({
    agent: "kilo-code",
    enabled: true,
    id: "kilo-work",
    model: "Provider/model",
    name: "Kilo Work",
    providerId: "claude-code-router",
    scope: "global",
    showAllSessions: true,
    surface: "app"
  }, 0);
  assert.equal(profile?.agent, "kilo");
  assert.equal(profile?.scope, "global");
  assert.equal(profile?.showAllSessions, false);
  assert.equal(profile?.surface, "cli");
});
