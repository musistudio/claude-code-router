import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RequestLogPage } from "@ccr/core/contracts/app.ts";
import { LogsView } from "@ccr/ui/pages/home/components/network-logs.tsx";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";

const emptyLogPage: RequestLogPage = {
  generatedAt: "2026-07-23T00:00:00.000Z",
  items: [],
  options: {
    credentials: [],
    models: [],
    providers: []
  },
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 1
};

test("LogsView keeps disabled request logs discoverable with an enable action", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <LogsView
        enabled={false}
        error=""
        filter={{ page: 1, pageSize: 25, status: "all" }}
        loading={false}
        onEnable={() => undefined}
        page={emptyLogPage}
        refreshLogs={() => undefined}
        updateFilter={() => undefined}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /请求日志已关闭/);
  assert.match(html, /启用请求日志/);
});

test("LogsView explains filtered empty results and translates page sizes", () => {
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.en}>
      <LogsView
        error=""
        filter={{ page: 1, pageSize: 25, query: "missing", status: "all" }}
        loading={false}
        page={emptyLogPage}
        refreshLogs={() => undefined}
        updateFilter={() => undefined}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /No request logs match the current filters\./);
  assert.match(html, /Clear filters/);
  assert.match(html, /25 \/ page/);
  assert.doesNotMatch(html, /\/ 页/);
});
