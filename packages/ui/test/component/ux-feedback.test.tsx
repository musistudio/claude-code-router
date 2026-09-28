import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_OVERVIEW_WIDGETS, LEGACY_DEFAULT_OVERVIEW_WIDGETS } from "@ccr/core/contracts/app.ts";
import { Dialog, DialogContent, DialogTitle } from "@ccr/ui/components/ui/dialog.tsx";
import { OverviewView } from "@ccr/ui/pages/home/components/dashboard.tsx";
import { FeedbackStack, LightToast, PersistenceFeedback } from "@ccr/ui/pages/home/components/feedback.tsx";
import { normalizeOverviewWidget, normalizeOverviewWidgets } from "@ccr/ui/pages/home/shared/common.ts";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { createEmptyUsageStats } from "@ccr/ui/pages/home/shared/usage.ts";

test("dialog accessible name refers to its rendered title", () => {
  const html = renderToStaticMarkup(<Dialog><DialogContent><DialogTitle>Edit provider</DialogTitle></DialogContent></Dialog>);
  const titleId = html.match(/aria-labelledby="([^"]+)"/)?.[1];
  assert.ok(titleId);
  assert.ok(html.includes(`id="${titleId}"`));
  assert.match(html, /tabindex="-1"/);
});

test("failed saves expose an actionable alert and collapsed diagnostic details", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <PersistenceFeedback actionError="" disconnected={false} error="Storage unavailable" onDismissAction={() => {}} onRetry={() => {}} state="error" />
    </AppI18nContext.Provider>
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /更改尚未保存/);
  assert.match(html, />重新保存<\/button>/);
  assert.match(html, /<details[^>]*><summary/);
  assert.doesNotMatch(html, /<details[^>]*open/);
});

test("global feedback stack keeps save feedback and toast notifications at the top", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.en}>
      <FeedbackStack>
        <PersistenceFeedback actionError="" contained disconnected={false} error="" onDismissAction={() => {}} onRetry={() => {}} state="saving" />
        <LightToast contained toast={{ id: 1, message: "Copied" }} />
      </FeedbackStack>
    </AppI18nContext.Provider>
  );
  assert.match(html, /fixed left-1\/2 top-5/);
  assert.match(html, /Saving changes/);
  assert.match(html, /Copied/);
  assert.doesNotMatch(html, /bottom-4/);
});

test("settings save progress is a live status inside the dialog flow", () => {
  const html = renderToStaticMarkup(<PersistenceFeedback actionError="" disconnected={false} error="" inline onDismissAction={() => {}} onRetry={() => {}} state="saving" />);
  assert.match(html, /role="status"/);
  assert.match(html, /Saving changes/);
  assert.doesNotMatch(html, /class="[^"]*fixed/);
});

test("only the unchanged legacy dashboard receives the new default order", () => {
  assert.deepEqual(normalizeOverviewWidgets(LEGACY_DEFAULT_OVERVIEW_WIDGETS), DEFAULT_OVERVIEW_WIDGETS);
  const customized = LEGACY_DEFAULT_OVERVIEW_WIDGETS.map((widget, index) => index === 0 ? { ...widget, enabled: false } : widget);
  assert.deepEqual(normalizeOverviewWidgets(customized), customized.map(normalizeOverviewWidget));
  assert.deepEqual(normalizeOverviewWidgets([]), []);
});

test("empty dashboard shows no-data success state and a compact account setup action", () => {
  const html = renderToStaticMarkup(
    <OverviewView
      onConfigureProviderAccounts={() => {}}
      onWidgetsChange={() => {}}
      overviewWidgets={DEFAULT_OVERVIEW_WIDGETS}
      providerAccounts={[]}
      setUsageRange={() => {}}
      usageRange="7d"
      usageStats={createEmptyUsageStats("7d")}
    />
  );
  assert.match(html, /No requests yet/);
  assert.match(html, /Request success rate/);
  assert.doesNotMatch(html, /Availability/);
  assert.match(html, /Configure account usage/);
  assert.doesNotMatch(html, /data-overview-widget-id="account-balance"/);
  assert.ok(html.indexOf('data-overview-widget-id="metric-estimated-cost"') < html.indexOf('data-overview-widget-id="usage-trend"'));
});
