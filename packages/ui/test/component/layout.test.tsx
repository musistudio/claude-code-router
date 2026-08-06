import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GatewayStartupErrorBanner, groupSidebarNavigation, MainLayout, UpdateEntryButton } from "@ccr/ui/pages/home/components/layout.tsx";
import { MediaModelConfigurationPanel, VirtualModelsView } from "@ccr/ui/pages/home/components/virtual-models.tsx";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { createVirtualModelDraft } from "@ccr/ui/pages/home/shared/virtual-models.ts";
import { appConfigFixture } from "../fixtures/index.ts";
import { fallbackGatewayStatus, fallbackUpdateStatus } from "@ccr/ui/pages/home/shared/fallbacks.ts";
import { navigation } from "@ccr/ui/pages/home/shared/options.ts";
import { formatUpdateReleaseNotes, shouldCheckForUpdateOnOpen, UpdateDialog } from "@ccr/ui/pages/home/components/update.tsx";

test("sidebar navigation groups pages and hides networking from the sidebar", () => {
  const groups = groupSidebarNavigation(navigation);

  assert.deepEqual(groups.map((group) => group.label), ["Workspace", "Setup", "Monitor", "Advanced"]);
  assert.deepEqual(groups.map((group) => group.items.map((item) => item.id)), [
    ["overview"],
    ["providers", "profile", "routing"],
    ["logs", "observability"],
    ["virtual-models", "models", "api-keys", "extensions"]
  ]);
  assert.equal(groups.some((group) => group.items.some((item) => item.id === "networking")), false);

  const filteredGroups = groupSidebarNavigation(navigation.filter((item) => item.id !== "observability"));
  assert.deepEqual(filteredGroups.map((group) => group.items.map((item) => item.id)), [
    ["overview"],
    ["providers", "profile", "routing"],
    ["logs"],
    ["virtual-models", "models", "api-keys", "extensions"]
  ]);
});

test("sidebar navigation scrolls vertically without displacing the settings footer", () => {
  const html = renderToStaticMarkup(
    <MainLayout
      activeView="networking"
      agentAnalysisEnabled={false}
      compactLayout={false}
      config={appConfigFixture()}
      copy={appCopy.en}
      gatewayActionBusy={false}
      gatewayEndpoint="http://127.0.0.1:3456"
      gatewayStatus={fallbackGatewayStatus}
      isMac={false}
      needsTrafficLightSafeArea={false}
      networkCaptureEnabled={false}
      onOpenServerSettings={() => undefined}
      onOpenSettings={() => undefined}
      onOpenUpdate={() => undefined}
      onSelectNavigationItem={() => undefined}
      onToggleSidebar={() => undefined}
      requestLogsEnabled={false}
      shouldReduceMotion={true}
      sidebarOpen
      toggleGatewayService={() => undefined}
      updateActionBusy={false}
      updateStatus={fallbackUpdateStatus}
      viewProps={{} as never}
      visibleNavigation={navigation}
    />
  );

  assert.match(html, /<nav class="[^"]*overflow-y-auto[^"]*max-\[720px\]:overflow-y-hidden[^"]*"/);
  assert.match(html, /class="grid shrink-0 gap-1 border-t/);
  assert.ok(html.indexOf("</nav>") < html.indexOf("Settings"));
});

test("GatewayStartupErrorBanner renders startup failure details", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <GatewayStartupErrorBanner message="没有可用模型。请先配置供应商。" onOpenServerSettings={() => undefined} />
    </AppI18nContext.Provider>
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="assertive"/);
  assert.match(html, /服务启动失败/);
  assert.match(html, /没有可用模型。请先配置供应商。/);
  assert.match(html, />服务<\/button>/);
});

test("GatewayStartupErrorBanner stays hidden without a failure message", () => {
  const html = renderToStaticMarkup(<GatewayStartupErrorBanner message="" />);

  assert.equal(html, "");
});

test("Fusion page does not render a standalone Grok media panel", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <VirtualModelsView
        addVirtualModel={() => undefined}
        editVirtualModel={() => undefined}
        profiles={[]}
        removeVirtualModel={() => undefined}
        setVirtualModelEnabled={() => undefined}
      />
    </AppI18nContext.Provider>
  );

  assert.doesNotMatch(html, /Grok 生图与生视频/);
  assert.doesNotMatch(html, /Fusion 内置工具/);
});

test("media tool configuration renders a generic provider model selector without backend settings", () => {
  const config = appConfigFixture();
  config.Providers = [{
    apikey: "provider-key",
    baseUrl: "https://media.example/v1",
    capabilities: [{ baseUrl: "https://media.example/v1", type: "openai_image_generations" }],
    models: ["image-model"],
    name: "Media Provider"
  }];
  const draft = createVirtualModelDraft(config);
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <MediaModelConfigurationPanel
        draft={draft}
        kind="image"
        modelOptions={[{ label: "Media Provider/Image Model", value: "Media Provider/image-model" }]}
        onChange={() => undefined}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /图片模型/);
  assert.match(html, /Media Provider\/Image Model/);
  assert.match(html, /ai-gateway/);
  assert.match(html, /Grok Agent/);
  assert.doesNotMatch(html, /Grok CLI（内置）/);
  assert.doesNotMatch(html, /API Key|允许读取图片|产物保留|图片并发|视频并发|执行后端/);
});

test("UpdateEntryButton keeps update-center semantics when an update is available", () => {
  const html = renderToStaticMarkup(
    <UpdateEntryButton
      actionBusy={false}
      copy={appCopy.en}
      onOpen={() => undefined}
      status={{
        ...fallbackUpdateStatus,
        availableVersion: "3.0.15",
        canDownload: true,
        state: "available",
        supported: true
      }}
    />
  );

  assert.match(html, /aria-label="Update available"/);
  assert.match(html, /lucide-refresh-cw/);
  assert.match(html, /data-update-available-indicator/);
  assert.doesNotMatch(html, /lucide-download/);
});

test("UpdateDialog shows a compact action set and sanitized release notes", () => {
  const html = renderToStaticMarkup(
    <UpdateDialog
      actionBusy=""
      actionError=""
      copy={appCopy.en}
      onCheck={async () => undefined}
      onClose={() => undefined}
      onDownload={async () => undefined}
      onInstall={async () => undefined}
      status={{
        ...fallbackUpdateStatus,
        availableVersion: "3.0.17",
        canDownload: true,
        currentVersion: "3.0.13",
        releaseNotes: `3.0.17
<h2>What's Changed</h2>
<ul>
<li>fix(zcode): 保证模型同步正确的上下文长度 by <a class="user-mention" href="https://github.com/jesieleo">@jesieleo</a> in <a href="https://github.com/musistudio/claude-code-router/pull/437">#437</a></li>
</ul>`,
        state: "available",
        supported: true
      }}
    />
  );

  assert.match(html, /Download update/);
  assert.match(html, /fix\(zcode\): 保证模型同步正确的上下文长度/);
  assert.doesNotMatch(html, /Check for updates|Install and restart|Feed URL|Last checked/);
  assert.doesNotMatch(html, /&lt;h2|user-mention|@jesieleo|#437/);
});

test("formatUpdateReleaseNotes converts GitHub release HTML to concise text", () => {
  assert.equal(formatUpdateReleaseNotes(`3.0.17
<h2>What's Changed</h2>
<ul>
<li>feat: add &amp; verify update notes by <a class="user-mention" href="https://github.com/a">@author</a> in <a href="https://github.com/musistudio/claude-code-router/pull/1">#1</a></li>
</ul>
<p>Full Changelog: <a href="https://github.com/musistudio/claude-code-router/compare/v3.0.13...v3.0.17">v3.0.13...v3.0.17</a></p>`), "- feat: add & verify update notes");
});

test("opening the update entry only checks when the status is not already actionable", () => {
  for (const state of ["idle", "not-available", "error"] as const) {
    assert.equal(shouldCheckForUpdateOnOpen({ ...fallbackUpdateStatus, state }), true, state);
  }
  for (const state of ["checking", "available", "downloading", "downloaded", "installing"] as const) {
    assert.equal(shouldCheckForUpdateOnOpen({ ...fallbackUpdateStatus, state }), false, state);
  }
});
