import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AccountSummaryPanel,
  AnimatedUsageChart,
  ChartShell,
  ModelShareChart,
  RadialMetric,
  RangeSwitch,
  RingMetrics,
  SourceGrid,
  StatsGrid,
  TokenActivityPanel,
  TokenMixPanel,
  TrayStatusStrip,
  UsageDetailPanel,
  UsageOverviewPanel
} from "@ccr/ui/pages/tray/components/index.ts";
import { TrayApp } from "@ccr/ui/pages/tray/TrayApp.tsx";
import { TrayDetailApp } from "@ccr/ui/pages/tray/TrayDetailApp.tsx";
import { applyTrayThemePreference, createSourceTabs } from "@ccr/ui/pages/tray/shared.tsx";
import { accountSnapshots, installBrowserGlobals, usageStats, usageTotals } from "../fixtures/index.ts";

installBrowserGlobals();

const componentVariants = {
  account: "bar",
  modelShare: "bars",
  rings: "rings",
  stats: "cards",
  tokenFlow: "line",
  tokenMix: "bars"
} as const;

test("Tray theme follows the explicit app preference and resets to system", () => {
  applyTrayThemePreference("dark");
  assert.equal(document.documentElement.dataset.theme, "dark");

  applyTrayThemePreference("light");
  assert.equal(document.documentElement.dataset.theme, "light");

  applyTrayThemePreference("system");
  assert.equal(document.documentElement.dataset.theme, undefined);
});

test("UsageOverviewPanel renders every enabled overview tray module", () => {
  const activeStats = usageStats("30d");
  const html = renderToStaticMarkup(
    <UsageOverviewPanel
      accountRefreshing
      accountSnapshots={accountSnapshots()}
      activeStats={activeStats}
      componentVariants={componentVariants}
      loading
      modules={new Set(["account", "token-flow", "activity", "stats", "token-mix", "rings", "model-share"])}
      monthTotals={usageTotals({ totalTokens: 32000 })}
      todayTotals={usageTotals({ requestCount: 12, totalTokens: 3400 })}
      topModel={activeStats.models[0]}
      weekTotals={usageTotals({ totalTokens: 8600 })}
    />
  );

  assert.match(html, /openai \/ Primary Key/);
  assert.match(html, /30d Token Flow/);
  assert.match(html, /Activity/);
  assert.match(html, /Today tokens/);
  assert.match(html, /Token Mix/);
  assert.match(html, /Circular metrics/);
  assert.match(html, /Model Share/);
  assert.match(html, /Syncing usage\.\.\./);
});

test("UsageDetailPanel renders configured detail widgets and empty state", () => {
  const activeStats = usageStats("7d");
  const html = renderToStaticMarkup(
    <UsageDetailPanel
      accountSnapshots={accountSnapshots()}
      activeStats={activeStats}
      provider="openai"
      range="7d"
      widgets={[
        { id: "tabs", type: "source-tabs" },
        { id: "header", type: "header" },
        { id: "stats", type: "stats", variant: "compact" },
        { id: "account", type: "account", variant: "stacked" },
        { id: "flow", type: "token-flow", variant: "area" },
        { id: "activity", type: "activity" },
        { id: "mix", type: "token-mix", variant: "stacked" },
        { id: "rings", type: "rings", variant: "arcs" },
        { id: "share", type: "model-share", variant: "list" }
      ]}
      onRangeChange={() => undefined}
    />
  );
  const emptyHtml = renderToStaticMarkup(
    <UsageDetailPanel
      accountSnapshots={[]}
      activeStats={activeStats}
      range="30d"
      widgets={[{ id: "tabs", type: "source-tabs" }]}
      onRangeChange={() => undefined}
    />
  );

  assert.match(html, /Usage Detail/);
  assert.match(html, /7d - OpenAI/);
  assert.match(html, /7d tokens/);
  assert.match(html, /Token Flow/);
  assert.match(html, /Token Mix/);
  assert.match(html, /Circular metrics/);
  assert.match(html, /Model Share/);
  assert.match(emptyHtml, /No tray modules enabled/);
});

test("TrayStatusStrip renders open and quit actions", () => {
  const html = renderToStaticMarkup(<TrayStatusStrip totalTokens={12500} />);

  assert.match(html, /aria-label="Open CCR"/);
  assert.match(html, /title="Open CCR"/);
  assert.match(html, /12\.5K tokens/);
  assert.match(html, /CCR/);
  assert.match(html, /aria-label="Quit"/);
});

test("SourceGrid renders provider tabs with the selected state", () => {
  const html = renderToStaticMarkup(
    <SourceGrid
      selectedProvider="openai"
      tabs={[
        { id: "all", label: "All" },
        { id: "provider:openai", iconUrl: "data:image/png;base64,AA==", label: "OpenAI", provider: "openai" },
        { id: "provider:anthropic", label: "Anthropic", provider: "anthropic" }
      ]}
      onSelect={() => undefined}
    />
  );

  assert.match(html, /data-icon-kind="all"/);
  assert.match(html, /data-icon-kind="provider"/);
  assert.match(html, /data-icon-kind="fallback"/);
  assert.match(html, /class="tray-source-tab[^"]*" data-active="true"/);
  assert.match(html, />All<\/span>/);
  assert.match(html, />OpenAI<\/span>/);
  assert.match(html, />Anthropic<\/span>/);
});

test("Tray source tabs resolve configured, preset, local, and fallback provider icons", () => {
  const tabs = createSourceTabs([], [
    { icon: "data:image/png;base64,custom", models: [], name: "Custom Provider" },
    { baseUrl: "https://generativelanguage.googleapis.com", models: [], name: "Google Gemini" },
    { baseUrl: "https://chatgpt.com/backend-api/codex", models: [], name: "Codex API" },
    { models: [], name: "unknown" }
  ]);
  const tabByProvider = new Map(tabs.map((tab) => [tab.provider, tab]));

  assert.equal(tabByProvider.get("Custom Provider")?.iconUrl, "data:image/png;base64,custom");
  assert.ok(tabByProvider.get("Google Gemini")?.iconUrl);
  assert.ok(tabByProvider.get("Codex API")?.iconUrl);
  assert.notEqual(tabByProvider.get("Google Gemini")?.iconUrl, tabByProvider.get("Codex API")?.iconUrl);
  assert.equal(tabByProvider.get("unknown")?.iconUrl, undefined);
});

test("AccountSummaryPanel covers empty and metered account states", () => {
  const emptyHtml = renderToStaticMarkup(<AccountSummaryPanel snapshots={[]} variant="bar" />);
  const meteredHtml = renderToStaticMarkup(
    <AccountSummaryPanel snapshots={accountSnapshots()} variant="stacked" onRefresh={() => undefined} />
  );

  assert.match(emptyHtml, /No account data configured/);
  assert.match(meteredHtml, /openai \/ Primary Key/);
  assert.match(meteredHtml, /5h quota/);
  assert.match(meteredHtml, /42 requests/);
  assert.match(meteredHtml, /style="\s*width:42%"/);
});

test("AccountSummaryPanel prioritizes Codex manual reset meter with expiration", () => {
  const resetAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const resetEffectiveAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const html = renderToStaticMarkup(
    <AccountSummaryPanel
      snapshots={[
        {
          meters: [
            {
              id: "codex_primary_quota",
              kind: "quota",
              label: "Primary quota",
              limit: 100,
              remaining: 66,
              resetAt,
              unit: "%",
              window: "primary"
            },
            {
              id: "codex_secondary_quota",
              kind: "quota",
              label: "Secondary quota",
              limit: 100,
              remaining: 80,
              unit: "%",
              window: "secondary"
            },
            {
              id: "codex_manual_resets",
              kind: "requests",
              label: "Manual resets",
              details: [
                {
                  effectiveAt: resetEffectiveAt,
                  expiresAt: resetAt,
                  id: "reset-1"
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
        }
      ]}
      variant="bar"
    />
  );

  assert.match(html, /Primary quota/);
  assert.match(html, /Manual resets/);
  assert.match(html, /expires in/);
  assert.match(html, /2 resets/);
  assert.match(html, /width:/);
  assert.doesNotMatch(html, /Secondary quota/);
});

test("RangeSwitch renders every usage range option", () => {
  const html = renderToStaticMarkup(<RangeSwitch range="7d" onChange={() => undefined} />);

  assert.match(html, />Today<\/button>/);
  assert.match(html, />24h<\/button>/);
  assert.match(html, /class="tray-segmented-item[^"]*" data-active="true"/);
  assert.match(html, />7d<\/button>/);
  assert.match(html, />30d<\/button>/);
});

test("ChartShell renders title, meta, and children", () => {
  const html = renderToStaticMarkup(
    <ChartShell meta="gpt-4.1" title="Token Flow">
      <span>chart body</span>
    </ChartShell>
  );

  assert.match(html, /Token Flow/);
  assert.match(html, /gpt-4\.1/);
  assert.match(html, /chart body/);
});

test("StatsGrid renders cards, compact, and pill variants", () => {
  const items = [
    { label: "Tokens", value: "12K" },
    { label: "Requests", value: "128" }
  ];
  const cardsHtml = renderToStaticMarkup(<StatsGrid items={items} variant="cards" />);
  const compactHtml = renderToStaticMarkup(<StatsGrid items={items} variant="compact" />);
  const pillsHtml = renderToStaticMarkup(<StatsGrid items={items} variant="pills" />);

  assert.match(cardsHtml, /grid-cols-2/);
  assert.match(compactHtml, /py-0\.5/);
  assert.match(pillsHtml, /rounded-full/);
  assert.match(`${cardsHtml}${compactHtml}${pillsHtml}`, /Tokens/);
  assert.match(`${cardsHtml}${compactHtml}${pillsHtml}`, /12K/);
});

test("AnimatedUsageChart renders line, area, bar, and sparkline output", () => {
  const series = usageStats().series;
  const lineHtml = renderToStaticMarkup(<AnimatedUsageChart chartId="line-chart" series={series} variant="line" />);
  const areaHtml = renderToStaticMarkup(<AnimatedUsageChart chartId="area-chart" series={series} variant="area" />);
  const barHtml = renderToStaticMarkup(<AnimatedUsageChart chartId="bar-chart" series={series} variant="bar" />);
  const sparkHtml = renderToStaticMarkup(<AnimatedUsageChart chartId="spark-chart" series={series} variant="sparkline" />);

  assert.match(lineHtml, /aria-label="Usage chart"/);
  assert.match(lineHtml, /line-chart-primary-fill/);
  assert.match(lineHtml, /stroke="rgba\(10,132,255,.98\)"/);
  assert.match(areaHtml, /fill="url\(#area-chart-primary-fill\)"/);
  assert.match(barHtml, /<rect /);
  assert.match(sparkHtml, /stroke-width="3"/);
});

test("TokenActivityPanel renders summary, grid, and legend", () => {
  const html = renderToStaticMarkup(<TokenActivityPanel series={usageStats().series} />);

  assert.match(html, /Activity/);
  assert.match(html, /Longest streak/);
  assert.match(html, /aria-label="Activity Tokens"/);
  assert.match(html, /Less/);
  assert.match(html, /More/);
});

test("TokenMixPanel renders bars, stacked, and share chart variants", () => {
  const totals = usageTotals();
  const barsHtml = renderToStaticMarkup(<TokenMixPanel totals={totals} variant="bars" />);
  const stackedHtml = renderToStaticMarkup(<TokenMixPanel totals={totals} variant="stacked" />);
  const donutHtml = renderToStaticMarkup(<TokenMixPanel totals={totals} variant="donut" />);

  assert.match(barsHtml, /Token Mix/);
  assert.match(barsHtml, /Input/);
  assert.match(stackedHtml, /bg-\[#0a84ff\]/);
  assert.match(donutHtml, /aria-label="Share chart"/);
});

test("RingMetrics and RadialMetric render accessible radial charts", () => {
  const ringsHtml = renderToStaticMarkup(<RingMetrics totals={usageTotals()} variant="gauges" />);
  const radialHtml = renderToStaticMarkup(
    <RadialMetric centerUnit="tokens" centerValue="12K" color="rgb(45,212,191)" label="Cache 24%" value={0.24} variant="ring" />
  );

  assert.match(ringsHtml, /Circular metrics/);
  assert.match(ringsHtml, /Success/);
  assert.match(ringsHtml, /Cache/);
  assert.match(radialHtml, /aria-label="Cache 24%"/);
  assert.match(radialHtml, /12K/);
  assert.match(radialHtml, /tokens/);
});

test("ModelShareChart renders populated variants and empty state", () => {
  const rows = usageStats().models;
  const barsHtml = renderToStaticMarkup(<ModelShareChart rows={rows} variant="bars" />);
  const listHtml = renderToStaticMarkup(<ModelShareChart rows={rows} variant="list" />);
  const donutHtml = renderToStaticMarkup(<ModelShareChart rows={rows} variant="donut" />);
  const emptyHtml = renderToStaticMarkup(<ModelShareChart rows={[]} variant="bars" />);

  assert.match(barsHtml, /Model Share/);
  assert.match(barsHtml, /gpt-4\.1/);
  assert.match(listHtml, /1\. gpt-4\.1/);
  assert.match(listHtml, /62%/);
  assert.match(donutHtml, /aria-label="Share chart"/);
  assert.match(emptyHtml, /No usage captured yet/);
});

test("TrayApp and TrayDetailApp render their shell components without browser runtime", () => {
  const trayHtml = renderToStaticMarkup(<TrayApp />);
  const detailHtml = renderToStaticMarkup(<TrayDetailApp provider="openai" />);

  assert.match(trayHtml, /Usage Overview/);
  assert.match(trayHtml, /Open CCR/);
  assert.match(detailHtml, /Usage Detail/);
  assert.match(detailHtml, /OpenAI/);
});
