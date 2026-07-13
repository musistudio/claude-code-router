import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfileConfig } from "../../packages/core/src/contracts/app.ts";
import { DeleteProfileDialog } from "../../packages/ui/src/pages/home/components/profiles.tsx";
import { AppI18nContext, appCopy } from "../../packages/ui/src/pages/home/shared/i18n.tsx";
import { createProfileDraft, profileDraftWithDetectedAppPath } from "../../packages/ui/src/pages/home/shared/profiles.ts";

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

test("detected CHATGPT_APP_PATH is used as the Codex profile default", () => {
  const detectedPath = "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT";
  const draft = profileDraftWithDetectedAppPath(createProfileDraft("codex"), `  ${detectedPath}  `);

  assert.equal(draft.appPath, detectedPath);
  assert.equal(profileDraftWithDetectedAppPath({ ...draft, appPath: "/custom/chatgpt" }, detectedPath).appPath, "/custom/chatgpt");
  assert.equal(profileDraftWithDetectedAppPath(createProfileDraft("claude-code"), detectedPath).appPath, "");
});
