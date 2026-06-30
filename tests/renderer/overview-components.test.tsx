import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OverviewView } from "../../src/renderer/pages/home/components/dashboard.tsx";
import type { OverviewWidgetConfig } from "../../src/shared/app.ts";
import { accountSnapshots, installBrowserGlobals, usageStats } from "./fixtures.ts";

installBrowserGlobals();

test("OverviewView renders every overview widget type", () => {
  const widgets: OverviewWidgetConfig[] = [
    { enabled: true, id: "status", size: "4:1", type: "system-status", variant: "timeline" },
    { enabled: true, id: "account", size: "4:2", type: "account-balance", variant: "nested-rings" },
    { enabled: true, id: "metric-requests", metric: "requests", size: "1:1", type: "metric", variant: "card" },
    { enabled: true, id: "metric-cache", metric: "cache-ratio", size: "1:1", type: "metric", variant: "ring" },
    { enabled: true, id: "metric-errors", metric: "errors", size: "1:1", type: "metric", variant: "bar" },
    { enabled: true, id: "trend", size: "3:2", type: "usage-trend", variant: "composed" },
    { enabled: true, id: "activity", size: "4:2", type: "token-activity", variant: "heatmap" },
    { enabled: true, id: "token-mix", size: "2:2", type: "token-mix", variant: "stacked" },
    { enabled: true, id: "models", size: "2:2", type: "model-distribution", variant: "donut" },
    { enabled: true, id: "clients", size: "4:2", type: "client-analysis", variant: "table" },
    { enabled: true, id: "providers", size: "4:2", type: "provider-analysis", variant: "table" }
  ];

  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={widgets}
      providerAccounts={accountSnapshots()}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /<h2 class="[^"]*">Overview<\/h2>/);
  assert.match(html, /aria-label="Edit widgets"/);
  assert.match(html, /System status/);
  assert.match(html, /API Service/);
  assert.match(html, /openai \/ Primary Key/);
  assert.match(html, /Requests/);
  assert.match(html, /Cache ratio/);
  assert.match(html, /Errors/);
  assert.match(html, /Usage Trend/);
  assert.match(html, /Activity/);
  assert.match(html, /Token Mix/);
  assert.match(html, /Model Distribution/);
  assert.match(html, /Client Analysis/);
  assert.match(html, /Provider Analysis/);
  assert.match(html, /claude-code/);
  assert.match(html, /openai/);
});

test("OverviewView renders the empty widget layout state", () => {
  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[]}
      providerAccounts={[]}
      setUsageRange={() => undefined}
      usageRange="7d"
      usageStats={usageStats("7d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /Overview/);
  assert.match(html, /No widgets configured/);
  assert.match(html, /aria-label="Edit widgets"/);
});
