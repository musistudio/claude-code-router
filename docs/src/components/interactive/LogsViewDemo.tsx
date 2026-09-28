/**
 * Docs wrapper rendering the REAL, UNMODIFIED LogsView (request logs) from the
 * UI package, with empty demo data + no-op callbacks + i18n + BaseProvider.
 * Client:only on an isolated bare page. (Observability/AgentAnalysisView is a
 * SEPARATE component — ObservabilityViewDemo.)
 */
import { LogsView } from "@/pages/home/components/network-logs";
import { BaseUiProvider } from "@/lib/baseui-provider";
import { AppI18nContext, appCopy } from "@/pages/home/shared/i18n";
import { getRequestLogData } from "./mockData";
import { DemoShell, readDemoLocale } from "./demoRuntime";
import type { RequestLogListFilter, RequestLogPage } from "@ccr/core/contracts/app";

const noop = () => {};

export default function LogsViewDemo() {
  const locale = readDemoLocale();
  return (
    <AppI18nContext.Provider value={locale === "zh" ? appCopy.zh : appCopy.en}>
      <DemoShell
        locale={locale}
        title={{
          zh: "请求日志 — 查看每个请求的详情、状态与耗时",
          en: "Request logs — inspect each request's details, status, and latency",
        }}
        contentClassName="docs-demo-content--data"
      >
        <BaseUiProvider>
          <div className="docs-demo-app-surface docs-demo-app-surface--logs">
            <LogsView
              enabled
              error=""
              filter={{} as RequestLogListFilter}
              loading={false}
              page={getRequestLogData()}
              refreshLogs={noop}
              updateFilter={noop}
              onEnable={noop}
              onFocusedRequestHandled={noop}
            />
          </div>
        </BaseUiProvider>
      </DemoShell>
    </AppI18nContext.Provider>
  );
}
