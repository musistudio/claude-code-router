import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatCodexResetCardExpiry, formatCodexResetCardNumber, OverviewView } from "@ccr/ui/pages/home/components/dashboard.tsx";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { parseStatusBucketDate } from "@ccr/ui/pages/home/shared/controls.tsx";
import { formatProviderAccountMeterValue, providerAccountMeterDetailValidityProgress } from "@ccr/ui/pages/home/shared/provider-accounts.ts";
import type { GatewayProviderConfig, OverviewWidgetConfig, ProviderAccountSnapshot } from "@ccr/core/contracts/app.ts";
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

test("OverviewView keeps Chinese token copy as Token", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <OverviewView
        overviewWidgets={[
          { enabled: true, id: "metric-total", metric: "total-tokens", size: "1:1", type: "metric", variant: "card" },
          { enabled: true, id: "trend", size: "3:2", type: "usage-trend", variant: "composed" },
          { enabled: true, id: "activity", size: "4:2", type: "token-activity", variant: "heatmap" },
          { enabled: true, id: "token-mix", size: "2:2", type: "token-mix", variant: "donut" },
          { enabled: true, id: "share-usage", size: "1:4", type: "share-usage-wrapped", variant: "card" },
          { enabled: true, id: "share-receipt", size: "1:4", type: "share-spend-receipt", variant: "card" }
        ]}
        providerAccounts={accountSnapshots()}
        refreshProviderAccounts={() => undefined}
        setUsageRange={() => undefined}
        usageRange="30d"
        usageStats={usageStats("30d")}
        onWidgetsChange={() => undefined}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /Token/);
  assert.match(html, /Token 构成/);
  assert.match(html, /总 Token/);
  assert.doesNotMatch(html, /令牌/);
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

test("OverviewView renders multi-provider account cards as staggered bento tiles without inner scrolling", () => {
  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{ enabled: true, id: "account", size: "4:2", type: "account-balance", variant: "cards" }]}
      providerAccounts={accountSnapshots()}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /data-provider-account-grid="true"/);
  assert.match(html, /auto-rows-fr/);
  assert.match(html, /grid-flow-dense/);
  assert.match(html, /grid-cols-2/);
  assert.match(html, /items-stretch/);
  assert.match(html, /row-span-1/);
  assert.match(html, /row-span-2/);
  assert.match(html, /overview-account-bento-tile/);
  assert.match(html, /data-account-status="warning"/);
  assert.doesNotMatch(html, /overflow-y-auto/);
  assert.doesNotMatch(html, /scrollbar-gutter/);
});

test("OverviewView folds overflowing account bento cards into a summary tile", () => {
  const accounts = Array.from({ length: 10 }, (_, index): ProviderAccountSnapshot => ({
    credentialId: `key-${index}`,
    meters: [
      {
        id: "balance",
        kind: "balance",
        label: "Balance",
        remaining: index + 1,
        unit: "USD"
      }
    ],
    provider: `provider-${index}`,
    source: "standard",
    status: "ok",
    updatedAt: "2026-06-30T00:00:00.000Z"
  }));

  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{ enabled: true, id: "account", size: "4:2", type: "account-balance", variant: "cards" }]}
      providerAccounts={accounts}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /grid-cols-3/);
  assert.match(html, /overview-account-bento-more/);
  assert.match(html, /\+2/);
});

test("OverviewView compacts large account bento cards before showing a summary tile", () => {
  const accounts = Array.from({ length: 5 }, (_, index): ProviderAccountSnapshot => ({
    credentialId: `quota-${index}`,
    meters: [
      {
        id: "quota",
        kind: "quota",
        label: "Subscription",
        limit: 100,
        remaining: 90 - index,
        unit: "%",
        window: "daily"
      }
    ],
    provider: `quota-provider-${index}`,
    source: "standard",
    status: "ok",
    updatedAt: "2026-06-30T00:00:00.000Z"
  }));

  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{ enabled: true, id: "account", size: "4:2", type: "account-balance", variant: "cards" }]}
      providerAccounts={accounts}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /quota-provider-4/);
  assert.match(html, /row-span-1/);
  assert.match(html, /row-span-2/);
  assert.doesNotMatch(html, /overview-account-bento-more/);
});

test("OverviewView uses height-aware balance layouts at every account card size", () => {
  const deepSeekAccount: ProviderAccountSnapshot = {
    credentialId: "deepseek",
    meters: [
      {
        id: "balance",
        kind: "balance",
        label: "Balance",
        remaining: 21.59,
        unit: "CNY"
      },
      {
        id: "granted_balance",
        kind: "balance",
        label: "Granted balance",
        remaining: 20,
        unit: "CNY"
      },
      {
        id: "topped_up_balance",
        kind: "balance",
        label: "Topped-up balance",
        remaining: 1.59,
        unit: "CNY"
      }
    ],
    provider: "DeepSeek",
    source: "standard",
    status: "ok",
    updatedAt: "2026-06-30T00:00:00.000Z"
  };
  const cardSizes = [
    { columnClass: "col-span-1", layout: "compact", rowClass: "row-span-1", size: "1:1" },
    { columnClass: "col-span-2", layout: "compact", rowClass: "row-span-1", size: "2:1" },
    { columnClass: "col-span-1", layout: "expanded", rowClass: "row-span-2", size: "1:2" },
    { columnClass: "col-span-2", layout: "expanded", rowClass: "row-span-2", size: "2:2" }
  ] as const;

  for (const cardSize of cardSizes) {
    const html = renderToStaticMarkup(
      <OverviewView
        overviewWidgets={[{
          accountCardSizes: { "DeepSeek::deepseek": cardSize.size },
          enabled: true,
          id: "account",
          size: "4:2",
          type: "account-balance",
          variant: "cards"
        }]}
        providerAccounts={[deepSeekAccount, accountSnapshots()[1]]}
        refreshProviderAccounts={() => undefined}
        setUsageRange={() => undefined}
        usageRange="30d"
        usageStats={usageStats("30d")}
        onWidgetsChange={() => undefined}
      />
    );
    const cardStart = html.indexOf('data-provider-account-sortable-id="DeepSeek::deepseek"');
    assert.ok(cardStart >= 0, `DeepSeek card should render at size ${cardSize.size}`);
    const nextCardStart = html.indexOf('data-provider-account-sortable-id=', cardStart + 1);
    const cardHtml = html.slice(cardStart, nextCardStart >= 0 ? nextCardStart : undefined);

    assert.match(cardHtml, new RegExp(`overview-account-bento-tile[^"]*${cardSize.columnClass}[^"]*${cardSize.rowClass}[^"]*" data-account-status="ok" data-provider-account-card-layout="${cardSize.layout}"`));
    assert.match(cardHtml, /Balance/);
    assert.match(cardHtml, /¥21\.59/);
    assert.doesNotMatch(html, /Granted balance|Topped-up balance/);
    assert.doesNotMatch(cardHtml, /overflow-y-auto|176px/);
    if (cardSize.layout === "compact") {
      assert.match(cardHtml, /data-provider-account-compact-meter="true"/);
      assert.match(cardHtml, /data-provider-account-compact-brand="true"/);
      assert.doesNotMatch(cardHtml, /overview-account-bento-compact-meter/);
    } else {
      assert.doesNotMatch(cardHtml, /data-provider-account-compact-meter="true"/);
      assert.doesNotMatch(cardHtml, /overview-account-bento-compact-meter/);
    }
  }
});

test("OverviewView pins compact account card identity and refresh above long errors", () => {
  const errorAccount: ProviderAccountSnapshot = {
    message: "Account endpoint returned HTTP 403: {\"code\":\"permission_denied\"}",
    meters: [],
    provider: "DeepSeek",
    source: "standard",
    status: "error",
    updatedAt: "2026-06-30T00:00:00.000Z"
  };
  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{
        accountCardSizes: { DeepSeek: "2:1" },
        enabled: true,
        id: "account",
        size: "4:2",
        type: "account-balance",
        variant: "cards"
      }]}
      providerAccounts={[errorAccount, accountSnapshots()[1]]}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );
  const cardStart = html.indexOf('data-provider-account-sortable-id="DeepSeek"');
  assert.ok(cardStart >= 0);
  const nextCardStart = html.indexOf('data-provider-account-sortable-id=', cardStart + 1);
  const cardHtml = html.slice(cardStart, nextCardStart >= 0 ? nextCardStart : undefined);
  const brandStart = cardHtml.indexOf('data-provider-account-compact-brand="true"');
  const actionsStart = cardHtml.indexOf('data-provider-account-compact-actions="true"');
  const messageStart = cardHtml.indexOf('data-provider-account-compact-message="true"');

  assert.ok(brandStart >= 0);
  assert.ok(actionsStart >= 0);
  assert.ok(messageStart >= 0);
  assert.ok(brandStart < actionsStart);
  assert.ok(actionsStart < messageStart);
  assert.match(cardHtml.slice(brandStart, actionsStart), /DeepSeek/);
  assert.doesNotMatch(cardHtml.slice(brandStart, actionsStart), /Account endpoint returned HTTP 403/);
  assert.match(cardHtml.slice(messageStart), /Account endpoint returned HTTP 403/);
  assert.doesNotMatch(cardHtml, /data-provider-account-compact-meter="true"/);
});

test("OverviewView shows secondary meters on tall account cards instead of folding to plus one", () => {
  const account: ProviderAccountSnapshot = {
    credentialId: "test",
    meters: [
      {
        id: "5h",
        kind: "quota",
        label: "5 hour quota",
        limit: 100,
        remaining: 96,
        unit: "%",
        window: "5h"
      },
      {
        id: "weekly",
        kind: "quota",
        label: "Weekly quota",
        limit: 100,
        remaining: 91,
        unit: "%",
        window: "weekly"
      }
    ],
    provider: "Zhipu AI (China) - Coding Plan",
    source: "standard",
    status: "ok",
    updatedAt: "2026-08-14T14:04:44.000Z"
  };
  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{
        accountCardSizes: { "Zhipu AI (China) - Coding Plan::test": "1:2" },
        enabled: true,
        id: "account",
        size: "1:2",
        type: "account-balance",
        variant: "cards"
      }]}
      providerAccounts={[account, accountSnapshots()[1]]}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );
  const cardStart = html.indexOf('data-provider-account-sortable-id="Zhipu AI (China) - Coding Plan::test"');
  assert.ok(cardStart >= 0);
  const nextCardStart = html.indexOf('data-provider-account-sortable-id=', cardStart + 1);
  const cardHtml = html.slice(cardStart, nextCardStart >= 0 ? nextCardStart : undefined);

  assert.match(cardHtml, /5 hour quota/);
  assert.match(cardHtml, /Weekly quota/);
  assert.doesNotMatch(cardHtml, />\+1</);
});

test("OverviewView expands a single leftover account meter instead of showing plus one", () => {
  const account: ProviderAccountSnapshot = {
    credentialId: "test",
    meters: [
      {
        id: "5h",
        kind: "quota",
        label: "5 hour quota",
        limit: 100,
        remaining: 95,
        unit: "%",
        window: "5h"
      },
      {
        id: "weekly",
        kind: "quota",
        label: "Weekly quota",
        limit: 100,
        remaining: 91,
        unit: "%",
        window: "weekly"
      },
      {
        id: "daily",
        kind: "quota",
        label: "Daily quota",
        limit: 100,
        remaining: 88,
        unit: "%",
        window: "daily"
      },
      {
        id: "monthly",
        kind: "quota",
        label: "Monthly quota",
        limit: 100,
        remaining: 82,
        unit: "%",
        window: "monthly"
      }
    ],
    provider: "Zhipu AI (China) - Coding Plan",
    source: "standard",
    status: "ok",
    updatedAt: "2026-08-14T14:07:49.000Z"
  };
  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{
        enabled: true,
        id: "account",
        size: "1:3",
        type: "account-balance",
        variant: "cards"
      }]}
      providerAccounts={[account]}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /5 hour quota/);
  assert.match(html, /Monthly quota/);
  assert.doesNotMatch(html, />\+1</);
});

test("OverviewView does not render folded account meter counts", () => {
  const account: ProviderAccountSnapshot = {
    credentialId: "test",
    meters: [
      { id: "5h", kind: "quota", label: "5 hour quota", limit: 100, remaining: 95, unit: "%", window: "5h" },
      { id: "weekly", kind: "quota", label: "Weekly quota", limit: 100, remaining: 91, unit: "%", window: "weekly" },
      { id: "daily", kind: "quota", label: "Daily quota", limit: 100, remaining: 88, unit: "%", window: "daily" },
      { id: "monthly", kind: "quota", label: "Monthly quota", limit: 100, remaining: 82, unit: "%", window: "monthly" },
      { id: "yearly", kind: "quota", label: "Yearly quota", limit: 100, remaining: 80, unit: "%", window: "yearly" },
      { id: "credits", kind: "requests", label: "Request credits", remaining: 12, unit: "credits" }
    ],
    provider: "Zhipu AI (China) - Coding Plan",
    source: "standard",
    status: "ok",
    updatedAt: "2026-08-14T14:07:49.000Z"
  };
  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{
        enabled: true,
        id: "account",
        size: "1:3",
        type: "account-balance",
        variant: "cards"
      }]}
      providerAccounts={[account]}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /5 hour quota/);
  assert.doesNotMatch(html, />\+\d+</);
});

test("OverviewView applies manual bento account card sizes", () => {
  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{
        accountCardSizes: {
          "anthropic::secondary": "1:2",
          "openai::primary": "2:1"
        },
        enabled: true,
        id: "account",
        size: "4:2",
        type: "account-balance",
        variant: "cards"
      }]}
      providerAccounts={accountSnapshots()}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /overview-account-bento-tile[^"]*col-span-2[^"]*row-span-1[^"]*" data-account-status="warning"/);
  assert.match(html, /overview-account-bento-tile[^"]*col-span-1[^"]*row-span-2[^"]*" data-account-status="ok"/);
});

test("OverviewView applies manual bento account card order", () => {
  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{
        accountCardOrder: ["anthropic::secondary", "openai::primary"],
        enabled: true,
        id: "account",
        size: "4:2",
        type: "account-balance",
        variant: "cards"
      }]}
      providerAccounts={accountSnapshots()}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );
  const anthropicIndex = html.indexOf("anthropic / Secondary Key");
  const openaiIndex = html.indexOf("openai / Primary Key");

  assert.ok(anthropicIndex >= 0);
  assert.ok(openaiIndex >= 0);
  assert.ok(anthropicIndex < openaiIndex);
});

test("OverviewView filters account balance widgets by multiple selected accounts", () => {
  const accounts = [
    ...accountSnapshots(),
    {
      credentialId: "third",
      credentialLabel: "Third Key",
      meters: [
        {
          id: "balance",
          kind: "balance",
          label: "Balance",
          remaining: 9,
          unit: "USD"
        }
      ],
      provider: "third-provider",
      source: "standard",
      status: "ok",
      updatedAt: "2026-06-30T00:00:00.000Z"
    } satisfies ProviderAccountSnapshot
  ];

  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{
        accountProviders: ["openai::primary", "third-provider::third"],
        enabled: true,
        id: "account",
        size: "4:2",
        type: "account-balance",
        variant: "cards"
      }]}
      providerAccounts={accounts}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /openai \/ Primary Key/);
  assert.match(html, /third-provider \/ Third Key/);
  assert.doesNotMatch(html, /anthropic \/ Secondary Key/);
});

test("OverviewView keeps legacy single accountProvider filters working", () => {
  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{
        accountProvider: "anthropic::secondary",
        enabled: true,
        id: "account",
        size: "4:2",
        type: "account-balance",
        variant: "cards"
      }]}
      providerAccounts={accountSnapshots()}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /anthropic \/ Secondary Key/);
  assert.doesNotMatch(html, /openai \/ Primary Key/);
});

test("OverviewView renders provider logos in account balance widgets", () => {
  const providers: GatewayProviderConfig[] = [
    { icon: "https://cdn.example.test/openai.png", models: ["gpt-4.1"], name: "openai" },
    { icon: "https://cdn.example.test/anthropic.png", models: ["claude-sonnet"], name: "anthropic" }
  ];

  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{ enabled: true, id: "account", size: "4:2", type: "account-balance", variant: "cards" }]}
      providerAccounts={accountSnapshots()}
      refreshProviderAccounts={() => undefined}
      setUsageRange={() => undefined}
      usageFilters={{
        modelFilter: "",
        providerFilter: "",
        providers,
        setModelFilter: () => undefined,
        setProviderFilter: () => undefined
      }}
      usageRange="30d"
      usageStats={usageStats("30d")}
      onWidgetsChange={() => undefined}
    />
  );

  assert.match(html, /src="https:\/\/cdn\.example\.test\/openai\.png"/);
  assert.match(html, /src="https:\/\/cdn\.example\.test\/anthropic\.png"/);
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

test("provider account meter values localize textual units", () => {
  const value = formatProviderAccountMeterValue(
    {
      id: "codex_manual_resets",
      kind: "requests",
      label: "Manual resets",
      remaining: 0,
      unit: "resets"
    },
    (unit) => appCopy.zh.text[unit] ?? unit
  );

  assert.equal(value, `0 ${appCopy.zh.text.resets}`);
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
