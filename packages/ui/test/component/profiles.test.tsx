import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfileConfig } from "@ccr/core/contracts/app.ts";
import { AddProfileForm, DeleteProfileDialog, ProfileView } from "@ccr/ui/pages/home/components/profiles.tsx";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { createProfileDraft, createProfileDraftFromProfile, isProfileDraftSubmittable, normalizeUnknownProfileItem, profileAgentLogoUrl, profileConfigFromDraft, profileDraftWithDetectedAppPath, profileSummaryItems } from "@ccr/ui/pages/home/shared/profiles.ts";
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
  const allowedModelListIndex = html.indexOf("Allowed model list");

  assert.ok(advancedSettingsIndex >= 0);
  assert.ok(enhancedRouteIndex > advancedSettingsIndex);
  assert.ok(profileRoutingIndex > advancedSettingsIndex);
  assert.ok(allowedModelListIndex > advancedSettingsIndex);
  assert.ok(allowedModelListIndex > profileRoutingIndex);
  assert.ok(enhancedRouteIndex < profileRoutingIndex);
  assert.doesNotMatch(html, /Routing disabled/);
  assert.match(html, /Enhanced route/);
  assert.match(html, /Allowed model list/);
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
  const draft = { ...createProfileDraft("codex"), providerId: "", providerName: "", routingEnabled: true };
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
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
  assert.doesNotMatch(html, /Provider ID/);
  assert.doesNotMatch(html, /Provider name/);
  assert.equal(isProfileDraftSubmittable(draft), true);
  assert.equal(profileConfigFromDraft(draft, []).providerId, "claude-code-router");
  assert.equal(profileConfigFromDraft(draft, []).providerName, "Claude Code Router");
});

test("explicit allowed model lists require a default model", () => {
  const config = appConfigFixture();
  config.Providers = [{
    models: ["alpha", "beta"],
    name: "Provider"
  }];
  const draft = {
    ...createProfileDraft("codex"),
    availableModels: ["Provider/alpha"]
  };
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.equal(isProfileDraftSubmittable(draft), false);
  assert.match(html, /Advanced settings need attention/);
  assert.match(html, /Default model is required when allowed model list is set\./);
});

test("AddProfileForm renders unrestricted allowed models as selected without a default model", () => {
  const config = appConfigFixture();
  config.Providers = [{
    models: ["alpha", "beta"],
    name: "Provider"
  }];
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={createProfileDraft("codex")}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
  const alphaIndex = html.indexOf('title="Provider/alpha"');
  const betaIndex = html.indexOf('title="Provider/beta"');
  const alphaLabel = html.slice(alphaIndex, betaIndex);
  const betaLabel = html.slice(betaIndex, html.indexOf("</label>", betaIndex));
  const clearIndex = html.indexOf(">Clear</button>");
  const clearButton = html.slice(html.lastIndexOf("<button", clearIndex), clearIndex);

  assert.ok(alphaIndex >= 0);
  assert.ok(betaIndex > alphaIndex);
  assert.match(alphaLabel, /aria-checked="true"/);
  assert.match(betaLabel, /aria-checked="true"/);
  assert.match(clearButton, /disabled=""/);
});

test("AddProfileForm keeps the default model locked in allowed model lists", () => {
  const config = appConfigFixture();
  config.Providers = [{
    models: ["alpha", "beta"],
    name: "Provider"
  }];
  const draft = {
    ...createProfileDraft("codex"),
    availableModels: ["Provider/alpha"],
    model: "Provider/alpha"
  };
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
  const defaultIndex = html.indexOf('title="Provider/alpha"');
  const otherIndex = html.indexOf('title="Provider/beta"');
  const defaultLabel = html.slice(defaultIndex, otherIndex);
  const otherLabel = html.slice(otherIndex, html.indexOf("</label>", otherIndex));

  assert.ok(defaultIndex >= 0);
  assert.ok(otherIndex > defaultIndex);
  assert.match(defaultLabel, /aria-checked="true"/);
  assert.match(defaultLabel, /disabled=""/);
  assert.match(otherLabel, /aria-checked="false"/);
  assert.doesNotMatch(otherLabel, /disabled=""/);
});

test("AddProfileForm places APP_PATH below Bot settings", () => {
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
  const appPathIndex = html.indexOf("APP_PATH");
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
  assert.doesNotMatch(html, /Allowed model list/);
});

test("Claude Code profiles require a default model before submission", () => {
  const draft = createProfileDraft("claude-code");

  assert.equal(isProfileDraftSubmittable(draft), false);
  assert.equal(isProfileDraftSubmittable({ ...draft, model: "anthropic/claude-sonnet-4-5" }), true);
});

test("AddProfileForm labels Kimi CLI model fields with Kimi-specific copy", () => {
  const config = appConfigFixture();
  const draft = createProfileDraft("kimi");
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

  assert.match(html, /Kimi model/);
  assert.doesNotMatch(html, /Advanced settings need attention/);
  assert.doesNotMatch(html, /Allowed model list/);
  assert.doesNotMatch(html, /Default model/);
  assert.doesNotMatch(html, /Available models/);
  assert.equal(isProfileDraftSubmittable(draft), false);
  const defaultOnlyDraft = { ...draft, model: "kimi/k2", availableModels: [] };
  assert.equal(isProfileDraftSubmittable(defaultOnlyDraft), true);
  assert.equal(profileConfigFromDraft(defaultOnlyDraft, []).availableModels, undefined);
});

test("AddProfileForm shows Kimi allowed models as selected by default", () => {
  const config = appConfigFixture();
  config.Providers = [{
    models: ["k2", "k3"],
    name: "Kimi"
  }];
  const draft = { ...createProfileDraft("kimi"), model: "Kimi/k2" };
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(html, /Allowed model list/);
  assert.match(html, /title="Kimi\/k2"[\s\S]*?aria-checked="true"/);
  assert.match(html, /title="Kimi\/k3"[\s\S]*?aria-checked="true"/);
  assert.equal(profileConfigFromDraft(draft, []).availableModels, undefined);
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
  assert.doesNotMatch(html, /Allowed model list/);
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
  assert.equal(items[1]?.label, "Allowed model list");
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

test("profileSummaryItems uses a generic App path label", () => {
  const config = appConfigFixture();
  const items = profileSummaryItems({
    agent: "workbuddy",
    appPath: "/Applications/WorkBuddy AI.app/Contents/MacOS/Electron",
    enabled: true,
    id: "workbuddy-main",
    model: "openai/gpt-5.2",
    name: "Workbuddy Main",
    scope: "ccr",
    surface: "app"
  }, config, (value) => value);

  assert.equal(items.find((item) => item.value.includes("WorkBuddy AI.app"))?.label, "APP_PATH");
  assert.doesNotMatch(items.map((item) => item.label).join(" "), /CHATGPT_APP_PATH|WORKBUDDY_APP_PATH/);
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

  assert.deepEqual(disabledItems.map((item) => item.label), ["Model"]);
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
  assert.doesNotMatch(enabledItems.map((item) => item.label).join(" "), /Provider ID/);
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

test("detected WORKBUDDY_APP_PATH is used as the Workbuddy profile default", () => {
  const detectedPath = "/Applications/WorkBuddy AI.app/Contents/MacOS/Electron";
  const draft = profileDraftWithDetectedAppPath(createProfileDraft("workbuddy"), undefined, undefined, detectedPath);
  assert.equal(draft.appPath, detectedPath);
  assert.equal(profileDraftWithDetectedAppPath({ ...draft, appPath: "/custom/workbuddy" }, undefined, undefined, detectedPath).appPath, "/custom/workbuddy");
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

test("Workbuddy profiles support local App configuration", () => {
  const config = appConfigFixture();
  const draft = createProfileDraft("workbuddy");
  assert.equal(draft.name, "Workbuddy");
  assert.equal(draft.configFile, "~/.workbuddy/config.toml");
  assert.equal(draft.surface, "app");
  assert.equal(isProfileDraftSubmittable(draft), true);

  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs ?? []}
      draft={draft}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
  assert.match(html, /App only/);
  assert.doesNotMatch(html, /CLI only/);
  assert.match(html, /APP_PATH/);
  assert.doesNotMatch(html, /WORKBUDDY_APP_PATH/);

  const profile = normalizeUnknownProfileItem({
    agent: "work-buddy",
    enabled: true,
    id: "workbuddy-work",
    model: "Provider/model",
    name: "Workbuddy Work",
    providerId: "claude-code-router",
    scope: "global",
    showAllSessions: true,
    surface: "app"
  }, 0);
  assert.equal(profile?.agent, "workbuddy");
  assert.equal(profile?.configFile, "~/.workbuddy/config.toml");
  assert.equal(profile?.showAllSessions, false);
  assert.equal(profile?.surface, "app");
  assert.match(profileAgentLogoUrl("workbuddy"), /workbuddy/i);
  assert.notEqual(profileAgentLogoUrl("workbuddy"), profileAgentLogoUrl("codex"));
});
