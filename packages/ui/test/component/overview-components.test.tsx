import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatCodexResetCardExpiry, formatCodexResetCardNumber, OverviewView } from "@ccr/ui/pages/home/components/dashboard.tsx";
import { parseStatusBucketDate } from "@ccr/ui/pages/home/shared/controls.tsx";
import { providerAccountMeterDetailValidityProgress } from "@ccr/ui/pages/home/shared/provider-accounts.ts";
import type { OverviewWidgetConfig, ProviderAccountSnapshot } from "@ccr/core/contracts/app.ts";
import { accountSnapshots, installBrowserGlobals, usageStats } from "../fixtures/index.ts";

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
    { enabled: true, id: "providers", size: "4:2", type: "provider-analysis", variant: "table" },
    { enabled: true, id: "share-usage", size: "1:4", type: "share-usage-wrapped", variant: "card" },
    { enabled: true, id: "share-routes", size: "1:4", type: "share-route-map", variant: "card" },
    { enabled: true, id: "share-models", size: "1:4", type: "share-model-leaderboard", variant: "card" },
    { enabled: true, id: "share-fuel", size: "1:4", type: "share-fuel-cockpit", variant: "card" },
    { enabled: true, id: "share-calendar", size: "1:4", type: "share-token-calendar", variant: "card" },
    { enabled: true, id: "share-receipt", size: "1:4", type: "share-spend-receipt", variant: "card" }
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

  assert.doesNotMatch(html, /<h2 class="[^"]*">Overview<\/h2>/);
  assert.match(html, /All providers/);
  assert.match(html, /All models/);
  assert.match(html, /aria-label="Edit widgets"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /overview-heading-icon/);
  assert.match(html, /overview-metric-card/);
  assert.doesNotMatch(html, /2026-06-20T00:00:00\.000Z/);
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
  assert.match(html, /Save image/);
  assert.match(html, /AI Usage Wrapped/);
  assert.match(html, /CCR Route Map/);
  assert.match(html, /Model Leaderboard/);
  assert.match(html, /AI Fuel Cockpit/);
  assert.match(html, /Token Calendar Poster/);
  assert.match(html, /Spend Receipt/);
});

test("overview status dates accept ISO usage buckets", () => {
  assert.equal(parseStatusBucketDate("2026-06-20T00:00:00.000Z")?.toISOString(), "2026-06-20T00:00:00.000Z");
});

test("overview metric cards only show progress for ratio-based data", () => {
  const renderMetric = (metric: "cache-ratio" | "requests", variant: "bar" | "card") => renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{ enabled: true, id: `metric-${metric}-${variant}`, metric, size: "1:1", type: "metric", variant }]}
      providerAccounts={[]}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.doesNotMatch(renderMetric("requests", "card"), /overview-metric-track/);
  assert.match(renderMetric("cache-ratio", "card"), /overview-metric-track/);
  assert.match(renderMetric("requests", "bar"), /overview-metric-track/);
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

  assert.doesNotMatch(html, /<h2 class="[^"]*">Overview<\/h2>/);
  assert.match(html, /All providers/);
  assert.match(html, /All models/);
  assert.match(html, /No widgets configured/);
  assert.match(html, /aria-label="Edit widgets"/);
});

test("OverviewView prioritizes Codex manual resets before folded balance meters", () => {
  const resetAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const resetEffectiveAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const codexAccount: ProviderAccountSnapshot = {
    meters: [
      {
        id: "codex_primary_quota",
        kind: "quota",
        label: "Primary quota",
        limit: 100,
        remaining: 96,
        resetAt,
        unit: "%",
        window: "primary"
      },
      {
        id: "codex_secondary_quota",
        kind: "quota",
        label: "Secondary quota",
        limit: 100,
        remaining: 68,
        resetAt,
        unit: "%",
        window: "secondary"
      },
      {
        id: "codex_individual_limit",
        kind: "quota",
        label: "Individual limit",
        limit: 100,
        remaining: 42,
        resetAt,
        unit: "credits",
        window: "monthly"
      },
      {
        id: "codex_credit_balance",
        kind: "balance",
        label: "Credit balance",
        remaining: 0,
        unit: "credits"
      },
      {
        id: "codex_manual_resets",
        kind: "requests",
        label: "Manual resets",
        details: [
          {
            description: "Reset all active Codex rate limits.",
            effectiveAt: resetEffectiveAt,
            expiresAt: resetAt,
            id: "reset-1",
            label: "Full reset"
          }
        ],
        remaining: 2,
        resetAt,
        unit: "resets",
        window: "manual-reset"
      }
    ],
    provider: "Codex API",
    source: "http-json",
    status: "ok",
    updatedAt: new Date().toISOString()
  };

  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{ enabled: true, id: "account", size: "4:2", type: "account-balance", variant: "cards" }]}
      providerAccounts={[codexAccount]}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /Primary quota/);
  assert.match(html, /Secondary quota/);
  assert.match(html, /Manual resets/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-label="Expand Manual resets/);
  assert.doesNotMatch(html, /Effective/);
  assert.doesNotMatch(html, /Expires/);
  assert.doesNotMatch(html, /Full reset/);
  assert.match(html, /expires in/);
  assert.match(html, /2 resets/);
  assert.doesNotMatch(html, /Credit balance/);
});

test("OverviewView does not render an outer progress bar for Codex manual resets", () => {
  const resetAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const resetEffectiveAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const codexAccount: ProviderAccountSnapshot = {
    meters: [
      {
        id: "codex_manual_resets",
        kind: "requests",
        label: "Manual resets",
        details: [
          {
            effectiveAt: resetEffectiveAt,
            expiresAt: resetAt,
            id: "reset-1",
            label: "Full reset"
          }
        ],
        remaining: 2,
        resetAt,
        unit: "resets",
        window: "manual-reset"
      }
    ],
    provider: "Codex API",
    source: "http-json",
    status: "ok",
    updatedAt: new Date().toISOString()
  };

  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{ enabled: true, id: "account", size: "4:2", type: "account-balance", variant: "cards" }]}
      providerAccounts={[codexAccount]}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /Manual resets/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /style="width:[^"]*%"/);
  assert.doesNotMatch(html, /Full reset/);
});

test("provider account reset credit detail progress uses each validity window", () => {
  const effectiveAt = "2026-07-01T00:00:00.000Z";
  const expiresAt = "2026-07-11T00:00:00.000Z";

  assert.equal(providerAccountMeterDetailValidityProgress({
    effectiveAt,
    expiresAt
  }, Date.parse("2026-07-06T00:00:00.000Z")), 50);
  assert.equal(providerAccountMeterDetailValidityProgress({
    effectiveAt,
    expiresAt
  }, Date.parse("2026-06-30T00:00:00.000Z")), 100);
  assert.equal(providerAccountMeterDetailValidityProgress({
    effectiveAt,
    expiresAt
  }, Date.parse("2026-07-12T00:00:00.000Z")), 0);
  assert.equal(providerAccountMeterDetailValidityProgress({
    effectiveAt: expiresAt,
    expiresAt
  }, Date.parse("2026-07-06T00:00:00.000Z")), undefined);
});

test("Codex reset cards format the credit id and expiry like card data", () => {
  assert.deepEqual(formatCodexResetCardNumber("reset-root-1"), ["rese", "t-ro", "ot-1"]);
  assert.equal(formatCodexResetCardExpiry("2026-08-02T00:00:00Z"), "08/02");
  assert.equal(formatCodexResetCardExpiry("not-a-date"), "--/--");
});
