import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GatewayStartupErrorBanner, UpdateEntryButton } from "@ccr/ui/pages/home/components/layout.tsx";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { fallbackUpdateStatus } from "@ccr/ui/pages/home/shared/fallbacks.ts";
import { shouldCheckForUpdateOnOpen } from "@ccr/ui/pages/home/components/update.tsx";

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

test("opening the update entry only checks when the status is not already actionable", () => {
  for (const state of ["idle", "not-available", "error"] as const) {
    assert.equal(shouldCheckForUpdateOnOpen({ ...fallbackUpdateStatus, state }), true, state);
  }
  for (const state of ["checking", "available", "downloading", "downloaded", "installing"] as const) {
    assert.equal(shouldCheckForUpdateOnOpen({ ...fallbackUpdateStatus, state }), false, state);
  }
});
