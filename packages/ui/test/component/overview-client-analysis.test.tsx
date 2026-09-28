import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { OverviewWidgetConfig } from "@ccr/core/contracts/app.ts";
import { OverviewView } from "@ccr/ui/pages/home/components/dashboard.tsx";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import { installBrowserGlobals, usageRow, usageStats } from "../fixtures/index.ts";

installBrowserGlobals();

const rows = Array.from({ length: 8 }, (_, index) => {
  const client = index === 0 ? "unknown" : "Mac mini";
  const clientApiKeyId = index === 0 ? undefined : `key-${index}`;
  return usageRow(`api-key-${index}`, client, {
    caption: clientApiKeyId ?? "",
    client,
    clientApiKeyId,
    totalTokens: 8000 - index * 1000
  });
});

for (const [size, variant] of [["2:2", "table"], ["4:2", "compact"], ["3:2", "table"], ["4:2", "table"]] as const) {
  test(`client analysis uses key totals and distinguishes same-name keys in ${size} ${variant}`, () => {
    const widget: OverviewWidgetConfig = { enabled: true, id: "clients", size, type: "client-analysis", variant };
    const html = renderToStaticMarkup(
      <AppI18nContext.Provider value={appCopy.zh}>
        <OverviewView
          overviewWidgets={[widget]}
          providerAccounts={[]}
          setUsageRange={() => undefined}
          usageRange="30d"
          usageStats={usageStats("30d", {
            clients: rows,
            clientModels: [usageRow("route", "route-client", { caption: "route-provider / route-credential / route-model" })]
          })}
          onWidgetsChange={() => undefined}
        />
      </AppI18nContext.Provider>
    );
    const visibleText = html.replace(/<[^>]*>/g, " ");
    assert.match(visibleText, /8 组/);
    assert.match(visibleText, /未识别 Key/);
    assert.match(visibleText, /Mac mini/);
    assert.doesNotMatch(visibleText, /unknown/);
    assert.match(visibleText, /Token/);
    assert.match(visibleText, /key-1/);
    assert.match(visibleText, /key-7/);
    assert.doesNotMatch(visibleText, /route-client|route-provider|route-credential|route-model|凭据/);
  });
}
