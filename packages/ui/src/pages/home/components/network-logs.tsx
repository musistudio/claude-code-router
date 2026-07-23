import { memo } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Route, X } from "lucide-react";
import type { RequestRouteTrace, RequestRouteTraceChange, RequestRouteTraceHop } from "@ccr/core/contracts/app";
import {
  AnimatedIconSwap, Check, ChevronDown, ChevronLeft,
  ChevronRight, clampNumber, clientInitial, cn, Copy, copyTextToClipboard,
  Database, Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, filterLogText, formatBytes, formatCompactNumber, formatDuration,
  formatLogBodyView, formatLogDateTime, formatLogTokenSummary, formatNetworkRequestRaw, formatNetworkResponseRaw, formatRouteTracePath, formatUsdCost,
  isJsonContainer, jsonChildPath, logRequestModel,
  logResponseModel, logSelectOptions, motion, MoveRight, Network, networkCodeLabel,
  networkExchangeMatchesQuery, networkHeaderRows, networkLifecycleLabel, networkQueryRows, networkRowId, networkSummaryRows,
  Pause, Play, ProxyNetworkBody, ProxyNetworkExchange, ProxyNetworkSnapshot, ProxyStatus,
  ReactNode, ReactPointerEvent, RefreshCw, RequestLogBody, RequestLogEntry, RequestLogListFilter,
  RequestLogPage, requestLogPageSizeOptions, RequestLogStatusFilter, requestLogStatusOptions, Search, Select,
  translateOptions, Trash2, useAppNumberLocale, useAppText, useCallback, useEffect, useMemo, useRef,
  useState
} from "../shared/index";
type NetworkRequestTab = "body" | "header" | "query" | "raw" | "summary";
type NetworkResponseTab = "body" | "header" | "raw";

const logBodyViewCacheLimit = 12;
const logJsonAutoExpandEntryLimit = 60;
const logJsonContainerPreviewLimit = 80;
const logJsonAutoExpandTextLimit = 160 * 1024;
const logBodyViewCache = new Map<string, ReturnType<typeof formatLogBodyView>>();
type LogTableColumnId = "time" | "status" | "stream" | "model" | "credential" | "tokens" | "duration";
type LogTableColumn = {
  id: LogTableColumnId;
  minWidth: number;
};
type LogTableColumnWidths = Partial<Record<LogTableColumnId, number>>;
type LogTableGridStyle = {
  gridTemplateColumns: string;
  minWidth: string;
};

const baseLogTableColumns: LogTableColumn[] = [
  { id: "time", minWidth: 150 },
  { id: "status", minWidth: 116 },
  { id: "stream", minWidth: 108 },
  { id: "model", minWidth: 180 },
  { id: "tokens", minWidth: 140 },
  { id: "duration", minWidth: 92 }
];
const credentialLogTableColumn: LogTableColumn = { id: "credential", minWidth: 128 };

export function NetworkingView({
  clearCaptures,
  proxyStatus,
  refreshCaptures,
  setCaptureEnabled,
  snapshot
}: {
  clearCaptures: () => void;
  proxyStatus: ProxyStatus;
  refreshCaptures: () => void;
  setCaptureEnabled: (enabled: boolean) => void;
  snapshot: ProxyNetworkSnapshot;
}) {
  const t = useAppText();
  const [requestTab, setRequestTab] = useState<NetworkRequestTab>("header");
  const [responseTab, setResponseTab] = useState<NetworkResponseTab>("body");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [listHeightPercent, setListHeightPercent] = useState(48);
  const [requestWidthPercent, setRequestWidthPercent] = useState(50);
  const networkBodyRef = useRef<HTMLDivElement>(null);
  const networkDetailPanesRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const captures = useMemo(
    () => snapshot.items.filter((item) => networkExchangeMatchesQuery(item, normalizedQuery)),
    [normalizedQuery, snapshot.items]
  );
  const selected = captures.find((item) => item.id === selectedId) ?? captures[0];

  useEffect(() => {
    if (selectedId && captures.some((item) => item.id === selectedId)) {
      return;
    }
    setSelectedId(captures[0]?.id);
  }, [captures, selectedId]);

  function startListResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const container = networkBodyRef.current;
    if (!container) {
      return;
    }

    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const update = (pointerEvent: PointerEvent) => {
      const next = ((pointerEvent.clientY - rect.top) / rect.height) * 100;
      setListHeightPercent(clampNumber(next, 22, 78));
    };
    const stop = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function startDetailResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const container = networkDetailPanesRef.current;
    if (!container) {
      return;
    }

    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const update = (pointerEvent: PointerEvent) => {
      const next = ((pointerEvent.clientX - rect.left) / rect.width) * 100;
      setRequestWidthPercent(clampNumber(next, 24, 76));
    };
    const stop = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="network-view min-w-0"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="network-shell flex min-h-0 flex-col overflow-hidden rounded-lg border">
        <div className="network-toolbar flex h-10 min-w-0 shrink-0 items-center gap-2 border-b px-3 max-[720px]:h-auto max-[720px]:flex-wrap max-[720px]:py-2">
          <div className="relative min-w-[220px] flex-1 max-[720px]:min-w-0 max-[720px]:basis-full">
            <Search className="network-search-icon pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2" />
            <input
              aria-label={t("Search network captures")}
              className="network-filter-input h-7 w-full rounded-md border pl-8 pr-2 text-[12px] font-semibold outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Filter")}
              value={query}
            />
          </div>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase",
            proxyStatus.state === "running" ? "network-service-running" : "network-service-muted"
          )}>
            {t(proxyStatus.state)}
          </span>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase",
            snapshot.captureEnabled ? "network-service-running" : "network-service-paused"
          )}>
            {snapshot.captureEnabled ? t("capturing") : t("paused")}
          </span>
          <span className="network-count rounded-full px-2 py-0.5 text-[11px] font-semibold">{captures.length}</span>
          <button
            aria-label={snapshot.captureEnabled ? t("Pause network capture") : t("Resume network capture")}
            className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={() => setCaptureEnabled(!snapshot.captureEnabled)}
            title={snapshot.captureEnabled ? t("Pause capture") : t("Resume capture")}
            type="button"
          >
            {snapshot.captureEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button aria-label={t("Refresh network captures")} className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring/30" onClick={refreshCaptures} title={t("Refresh")} type="button">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button aria-label={t("Clear network captures")} className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring/30" disabled={snapshot.items.length === 0} onClick={clearCaptures} title={t("Clear")} type="button">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="network-workspace flex min-h-0 flex-1 flex-col" ref={networkBodyRef}>
          <div
            className="network-table-scroll min-h-0 overflow-auto border-b"
            style={{ flex: selected ? `0 0 ${listHeightPercent}%` : "1 1 auto" }}
          >
            <div className="grid gap-2 p-2 min-[721px]:hidden">
              {captures.map((item, index) => (
                <NetworkCaptureCard
                  exchange={item}
                  key={item.id}
                  onSelect={() => setSelectedId(item.id)}
                  rowId={networkRowId(item, index, captures.length)}
                  selected={selected?.id === item.id}
                />
              ))}
            </div>
            <div className="min-w-[1180px] max-[720px]:hidden">
              <div className="network-table-header sticky top-0 z-10 grid h-9 grid-cols-[34px_64px_minmax(460px,1fr)_220px_104px_116px_88px] items-center border-b text-[12px] font-semibold">
                <NetworkHeaderCell label="" />
                <NetworkHeaderCell label="ID" />
                <NetworkHeaderCell label="URL" />
                <NetworkHeaderCell label={t("Client")} />
                <NetworkHeaderCell label={t("Method")} />
                <NetworkHeaderCell label={t("Status")} />
                <NetworkHeaderCell label={t("Code")} />
              </div>

              {captures.length === 0 ? (
                <div className="network-empty flex h-[320px] flex-col items-center justify-center gap-2 text-center text-[12px]">
                  <Network className="network-empty-icon h-7 w-7" />
                  <div>{snapshot.items.length === 0 ? (snapshot.captureEnabled ? t("No network captures") : t("Network capture is paused")) : t("No matching captures")}</div>
                  <div className="network-empty-subtle font-mono text-[11px]">{proxyStatus.endpoint || t("Proxy not running")}</div>
                </div>
              ) : null}

              {captures.map((item, index) => (
                <button
                  className={cn(
                    "network-row grid h-9 w-full grid-cols-[34px_64px_minmax(460px,1fr)_220px_104px_116px_88px] items-center border-0 px-0 text-left text-[12px] font-semibold outline-none transition-colors",
                    index % 2 === 0 ? "network-row-even" : "network-row-odd",
                    selected?.id === item.id && "network-row-selected"
                  )}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  type="button"
                >
                  <div className="flex justify-center">
                    <NetworkStatusDot exchange={item} />
                  </div>
                  <div className="network-row-id truncate px-2 text-right">{networkRowId(item, index, captures.length)}</div>
                  <div className="truncate px-2" title={item.url}>{item.url}</div>
                  <div className="min-w-0 px-2">
                    <NetworkClientCell client={item.client} />
                  </div>
                  <div className="network-row-secondary truncate px-2">{item.method}</div>
                  <div className="network-row-secondary truncate px-2">{networkLifecycleLabel(item)}</div>
                  <div className="network-row-secondary truncate px-2">{networkCodeLabel(item)}</div>
                </button>
              ))}
            </div>
          </div>

          {selected ? (
            <>
              <button
                aria-label={t("Resize request list and detail panels")}
                className="network-resize-handle-y shrink-0"
                onPointerDown={startListResize}
                title={t("Resize list/detail")}
                type="button"
              />
              <div className="network-detail flex min-h-0 flex-1 flex-col">
                <div className="network-detail-bar flex h-12 min-w-0 shrink-0 items-center gap-2 border-b px-3 max-[720px]:h-auto max-[720px]:flex-wrap max-[720px]:py-2">
                  <span className="network-method-pill rounded-full px-3 py-1 text-[12px] font-bold">{selected.method}</span>
                  <span className={cn(
                    "rounded-full px-3 py-1 text-[12px] font-bold uppercase",
                    selected.state === "pending" ? "network-state-pill-active" : selected.state === "error" ? "network-state-pill-error" : "network-state-pill-completed"
                  )}>
                    {networkLifecycleLabel(selected)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold" title={selected.url}>
                    <span className="network-url-scheme">{selected.protocol}://</span>
                    <span className="network-url-host">{selected.host}</span>
                    <span className="network-url-path">{selected.path}</span>
                  </span>
                </div>

                <div className="network-detail-panes flex min-h-0 flex-1 max-[720px]:flex-col" ref={networkDetailPanesRef}>
                  <div className="min-w-0" style={{ flex: `0 0 ${requestWidthPercent}%` }}>
                    <NetworkRequestInspector exchange={selected} selectedTab={requestTab} setSelectedTab={setRequestTab} />
                  </div>
                  <button
                    aria-label={t("Resize request and response panels")}
                    className="network-resize-handle-x shrink-0 max-[720px]:hidden"
                    onPointerDown={startDetailResize}
                    title={t("Resize request/response")}
                    type="button"
                  />
                  <div className="min-w-0 flex-1">
                    <NetworkResponseInspector exchange={selected} selectedTab={responseTab} setSelectedTab={setResponseTab} />
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function NetworkCaptureCard({
  exchange,
  onSelect,
  rowId,
  selected
}: {
  exchange: ProxyNetworkExchange;
  onSelect: () => void;
  rowId: string;
  selected: boolean;
}) {
  return (
    <button
      className={cn(
        "network-row rounded-md border px-3 py-2 text-left text-[12px] outline-none transition-colors",
        selected && "network-row-selected"
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-1 shrink-0"><NetworkStatusDot exchange={exchange} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="network-row-id shrink-0 font-mono text-[11px]">#{rowId}</span>
            <span className="min-w-0 truncate font-mono font-semibold" title={exchange.url}>{exchange.host}{exchange.path}</span>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="network-method-pill rounded-full px-2 py-0.5 text-[11px] font-bold">{exchange.method}</span>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase",
              exchange.state === "pending" ? "network-state-pill-active" : exchange.state === "error" ? "network-state-pill-error" : "network-state-pill-completed"
            )}>
              {networkLifecycleLabel(exchange)}
            </span>
            <span className="network-row-secondary rounded-full px-2 py-0.5 text-[11px] font-semibold">{networkCodeLabel(exchange)}</span>
          </div>
          <div className="mt-2 min-w-0">
            <NetworkClientCell client={exchange.client} />
          </div>
        </div>
      </div>
    </button>
  );
}

export function LogsView({
  error,
  filter,
  loading,
  page,
  refreshLogs,
  updateFilter
}: {
  error: string;
  filter: RequestLogListFilter;
  loading: boolean;
  page: RequestLogPage;
  refreshLogs: () => void;
  updateFilter: (patch: RequestLogListFilter, resetPage?: boolean) => void;
}) {
  const t = useAppText();
  const [expandedId, setExpandedId] = useState<number>();
  const [detailById, setDetailById] = useState<Record<number, RequestLogEntry>>({});
  const [detailErrorById, setDetailErrorById] = useState<Record<number, string>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number>();
  const [logColumnWidths, setLogColumnWidths] = useState<LogTableColumnWidths>({});
  const logTableHeaderRef = useRef<HTMLDivElement>(null);
  const firstItem = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const lastItem = Math.min(page.total, page.page * page.pageSize);
  const hasAnyCredentialInfo = Boolean(filter.credential) ||
    page.options.credentials.length > 0 ||
    page.items.some(logHasCredentialInfo);
  const visibleLogColumns = useMemo(() => getLogTableColumns(hasAnyCredentialInfo), [hasAnyCredentialInfo]);
  const logTableGridClass = hasAnyCredentialInfo
    ? "grid-cols-[minmax(0,0.8fr)_minmax(92px,0.38fr)_minmax(98px,0.4fr)_minmax(0,0.78fr)_minmax(120px,0.42fr)_minmax(0,0.68fr)_82px]"
    : "grid-cols-[minmax(0,0.8fr)_minmax(92px,0.38fr)_minmax(98px,0.4fr)_minmax(0,0.9fr)_minmax(0,0.74fr)_82px]";
  const logTableGridStyle = useMemo(
    () => createLogTableGridStyle(visibleLogColumns, logColumnWidths),
    [logColumnWidths, visibleLogColumns]
  );
  const loadLogDetail = useCallback((id: number) => {
    if (detailById[id] || detailLoadingId === id || !window.ccr?.getRequestLogDetail) {
      return;
    }
    setDetailLoadingId(id);
    setDetailErrorById((current) => ({ ...current, [id]: "" }));
    void window.ccr.getRequestLogDetail({ id })
      .then((detail) => {
        if (detail) {
          setDetailById((current) => ({ ...current, [id]: detail }));
          return;
        }
        setDetailErrorById((current) => ({ ...current, [id]: t("Request log not found.") }));
      })
      .catch((error) => {
        setDetailErrorById((current) => ({ ...current, [id]: error instanceof Error ? error.message : String(error) }));
      })
      .finally(() => {
        setDetailLoadingId((current) => current === id ? undefined : current);
      });
  }, [detailById, detailLoadingId, t]);
  const toggleExpandedLog = useCallback((id: number) => {
    setExpandedId((current) => {
      const next = current === id ? undefined : id;
      if (next !== undefined) {
        loadLogDetail(next);
      }
      return next;
    });
  }, [loadLogDetail]);

  useEffect(() => {
    if (!expandedId || page.items.some((item) => item.id === expandedId)) {
      return;
    }
    setExpandedId(undefined);
  }, [expandedId, page.items]);

  function startLogColumnResize(columnIndex: number, event: ReactPointerEvent<HTMLButtonElement>) {
    const header = logTableHeaderRef.current;
    const leftColumn = visibleLogColumns[columnIndex];
    const rightColumn = visibleLogColumns[columnIndex + 1];
    if (!header || !leftColumn || !rightColumn) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const measuredWidths: LogTableColumnWidths = {};
    visibleLogColumns.forEach((column, index) => {
      const width = header.children[index]?.getBoundingClientRect().width ?? column.minWidth;
      measuredWidths[column.id] = Math.round(clampNumber(width, column.minWidth, Number.MAX_SAFE_INTEGER));
    });

    const startX = event.clientX;
    const startLeftWidth = measuredWidths[leftColumn.id] ?? leftColumn.minWidth;
    const startRightWidth = measuredWidths[rightColumn.id] ?? rightColumn.minWidth;
    const minDelta = leftColumn.minWidth - startLeftWidth;
    const maxDelta = startRightWidth - rightColumn.minWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const update = (pointerEvent: PointerEvent) => {
      const delta = clampNumber(pointerEvent.clientX - startX, minDelta, maxDelta);
      setLogColumnWidths((current) => ({
        ...current,
        ...measuredWidths,
        [leftColumn.id]: Math.round(startLeftWidth + delta),
        [rightColumn.id]: Math.round(startRightWidth - delta)
      }));
    };
    const stop = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="network-view min-w-0"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="network-shell flex min-h-0 flex-col overflow-hidden rounded-lg border">
        <div className="network-toolbar flex min-h-10 min-w-0 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="network-search-icon pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2" />
            <input
              aria-label={t("Search request logs")}
              className="network-filter-input h-7 w-full rounded-md border pl-8 pr-2 text-[12px] font-semibold outline-none"
              onChange={(event) => updateFilter({ query: event.target.value })}
              placeholder={t("筛选日志、模型、请求或响应")}
              value={filter.query ?? ""}
            />
          </div>
          <Select
            aria-label={t("Filter request log status")}
            className="h-7 w-[118px] bg-[length:14px] px-2 pr-7 text-[11px]"
            onValueChange={(value) => updateFilter({ status: value as RequestLogStatusFilter })}
            options={translateOptions(requestLogStatusOptions, t)}
            value={filter.status ?? "all"}
          />
          <Select
            aria-label={t("Filter request log provider")}
            className="h-7 w-[148px] bg-[length:14px] px-2 pr-7 text-[11px]"
            onValueChange={(value) => updateFilter({ provider: value || undefined })}
            options={logSelectOptions(t("全部供应商"), page.options.providers, filter.provider)}
            value={filter.provider ?? ""}
          />
          <Select
            aria-label={t("Filter request log model")}
            className="h-7 w-[168px] bg-[length:14px] px-2 pr-7 text-[11px]"
            onValueChange={(value) => updateFilter({ model: value || undefined })}
            options={logSelectOptions(t("全部模型"), page.options.models, filter.model)}
            value={filter.model ?? ""}
          />
          {hasAnyCredentialInfo ? (
            <Select
              aria-label={t("Filter request log credential")}
              className="h-7 w-[150px] bg-[length:14px] px-2 pr-7 text-[11px]"
              onValueChange={(value) => updateFilter({ credential: value || undefined })}
              options={logSelectOptions(t("All credentials"), page.options.credentials, filter.credential)}
              value={filter.credential ?? ""}
            />
          ) : null}
          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-label={t("Previous page")}
              className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={page.page <= 1}
              onClick={() => updateFilter({ page: page.page - 1 }, false)}
              title={t("上一页")}
              type="button"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="network-count min-w-[132px] rounded-full px-2 py-0.5 text-center text-[11px] font-semibold">
              {firstItem}-{lastItem} / {page.total}
            </span>
            <button
              aria-label={t("Next page")}
              className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={page.page >= page.totalPages}
              onClick={() => updateFilter({ page: page.page + 1 }, false)}
              title={t("下一页")}
              type="button"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <Select
              aria-label={t("Request log page size")}
              className="h-7 w-[92px] bg-[length:14px] px-2 pr-7 text-[11px]"
              onValueChange={(value) => updateFilter({ pageSize: Number(value) })}
              options={requestLogPageSizeOptions}
              value={String(page.pageSize)}
            />
          </div>
          <button
            aria-label={t("Refresh request logs")}
            className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={refreshLogs}
            title={t("Refresh")}
            type="button"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>

        {error ? (
          <div className="network-error-box mx-3 mt-3 rounded-md border px-3 py-2 text-[12px]">{error}</div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="network-table-scroll min-h-0 flex-1 overflow-auto">
            <div className="w-full min-w-0">
              <div
                className={cn("network-table-header sticky top-0 z-10 grid h-9 items-center border-b text-[12px] font-semibold", logTableGridClass)}
                ref={logTableHeaderRef}
                style={logTableGridStyle}
              >
                {visibleLogColumns.map((column, index) => (
                  <NetworkHeaderCell
                    key={column.id}
                    label={logTableColumnLabel(column.id, t)}
                    onResizeStart={index < visibleLogColumns.length - 1 ? (event) => startLogColumnResize(index, event) : undefined}
                    resizeLabel={t("Resize column width")}
                  />
                ))}
              </div>

              {page.items.length === 0 ? (
                <div className="network-empty flex h-[240px] flex-col items-center justify-center gap-2 text-center text-[12px]">
                  <Database className="network-empty-icon h-7 w-7" />
                  <div>{loading ? t("正在加载日志") : t("暂无日志")}</div>
                </div>
              ) : null}

              {page.items.map((item, index) => (
                <LogRow
                  detailError={detailErrorById[item.id]}
                  detailLoading={detailLoadingId === item.id}
                  expanded={expandedId === item.id}
                  hasCredentialInfo={hasAnyCredentialInfo}
                  index={index}
                  item={expandedId === item.id ? detailById[item.id] ?? item : item}
                  key={item.id}
                  logTableGridClass={logTableGridClass}
                  logTableGridStyle={logTableGridStyle}
                  onToggle={toggleExpandedLog}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function getLogTableColumns(hasCredentialColumn: boolean): LogTableColumn[] {
  if (!hasCredentialColumn) {
    return baseLogTableColumns;
  }
  return [
    ...baseLogTableColumns.slice(0, 4),
    credentialLogTableColumn,
    ...baseLogTableColumns.slice(4)
  ];
}

function createLogTableGridStyle(columns: LogTableColumn[], widths: LogTableColumnWidths): LogTableGridStyle | undefined {
  const columnWidths = columns.map((column) => widths[column.id]);
  if (columnWidths.some((width) => typeof width !== "number")) {
    return undefined;
  }

  return {
    gridTemplateColumns: columns.map((column, index) => {
      const width = Math.max(column.minWidth, Math.round(columnWidths[index] ?? column.minWidth));
      return `minmax(${column.minWidth}px, ${width}fr)`;
    }).join(" "),
    minWidth: `${columns.reduce((total, column) => total + column.minWidth, 0)}px`
  };
}

function logTableColumnLabel(columnId: LogTableColumnId, t: (value: string) => string): string {
  switch (columnId) {
    case "time":
      return t("时间");
    case "status":
      return t("状态");
    case "stream":
      return t("Stream");
    case "model":
      return t("模型");
    case "credential":
      return t("Credential");
    case "tokens":
      return t("令牌");
    case "duration":
      return t("持续时间");
  }
}

const LogRow = memo(function LogRow({
  detailError,
  detailLoading,
  expanded,
  hasCredentialInfo,
  index,
  item,
  logTableGridClass,
  logTableGridStyle,
  onToggle
}: {
  detailError?: string;
  detailLoading?: boolean;
  expanded: boolean;
  hasCredentialInfo: boolean;
  index: number;
  item: RequestLogEntry;
  logTableGridClass: string;
  logTableGridStyle?: LogTableGridStyle;
  onToggle: (id: number) => void;
}) {
  const t = useAppText();
  const numberLocale = useAppNumberLocale();
  const createdAt = useMemo(() => formatLogDateTime(item.createdAt), [item.createdAt]);
  const tokenSummary = useMemo(() => formatLogTokenSummary(item, t, numberLocale), [item, numberLocale, t]);

  return (
    <div>
      <button
        aria-expanded={expanded}
        className={cn(
          "network-row grid h-10 w-full items-center border-0 px-0 text-left text-[12px] font-semibold outline-none transition-colors",
          logTableGridClass,
          index % 2 === 0 ? "network-row-even" : "network-row-odd",
          expanded && "network-row-selected"
        )}
        onClick={() => onToggle(item.id)}
        style={logTableGridStyle}
        type="button"
      >
        <div className="truncate px-3 font-mono text-[11px]" title={createdAt}>
          {createdAt}
        </div>
        <div className="flex min-w-0 items-center gap-2 px-2">
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-180")} />
          <LogStatusDot entry={item} />
          <span className="network-row-secondary truncate">{item.statusCode || "-"}</span>
          {item.retryAttempts.length > 0 ? (
            <span
              className="network-service-paused shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
              title={`${t("Retry attempts")}: ${item.retryAttempts.length}`}
            >
              R{item.retryAttempts.length}
            </span>
          ) : null}
        </div>
        <LogStreamCell entry={item} />
        <LogModelRouteCell entry={item} />
        {hasCredentialInfo ? <LogCredentialCell entry={item} /> : null}
        <div className="network-row-secondary truncate px-2" title={tokenSummary}>{tokenSummary}</div>
        <div className="network-row-secondary truncate px-2">{formatDuration(item.durationMs)}</div>
      </button>
      {expanded ? <LogExpandedDetails detailError={detailError} detailLoading={detailLoading} entry={item} /> : null}
    </div>
  );
});

function LogExpandedDetails({
  detailError,
  detailLoading,
  entry
}: {
  detailError?: string;
  detailLoading?: boolean;
  entry: RequestLogEntry;
}) {
  const t = useAppText();
  const numberLocale = useAppNumberLocale();
  const hasCredentialInfo = logHasCredentialInfo(entry);

  return (
    <div className="network-detail border-b">
      <div className="network-detail-bar flex min-h-10 min-w-0 items-center gap-2 border-b px-3 py-1.5">
        <span className={cn(
          "rounded-full px-3 py-1 text-[12px] font-bold uppercase",
          entry.ok ? "network-state-pill-completed" : "network-state-pill-error"
        )}>
          HTTP {entry.statusCode || "-"}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold" title={entry.url}>
          {entry.method} {entry.path}
        </span>
      </div>
      <div className={cn("network-body-meta grid grid-cols-2 gap-y-2 border-b px-3 py-2 text-[12px] sm:grid-cols-4", hasCredentialInfo ? "lg:grid-cols-12" : "lg:grid-cols-9")}>
        <LogMetric label={t("持续时间")} value={formatDuration(entry.durationMs)} />
        <LogMetric label={t("Stream")} value={entry.isStream ? t("Streaming") : t("Non-streaming")} />
        {entry.credentialId ? <LogMetric label={t("Credential")} value={entry.credentialId} /> : null}
        {entry.credentialChain.length ? <LogMetric label={t("Credential chain")} value={entry.credentialChain.join(" > ")} /> : null}
        {hasCredentialInfo ? <LogMetric label={t("Credential saturated")} value={entry.credentialSaturated ? t("Yes") : t("No")} /> : null}
        {entry.retryAttempts.length > 0 ? <LogMetric label={t("Retry attempts")} value={String(entry.retryAttempts.length)} /> : null}
        <LogMetric label={t("输入")} value={formatCompactNumber(entry.inputTokens, numberLocale)} />
        <LogMetric label={t("输出")} value={formatCompactNumber(entry.outputTokens, numberLocale)} />
        <LogMetric label={t("Thinking")} value={formatCompactNumber(entry.reasoningTokens, numberLocale)} />
        <LogMetric label={t("缓存读取")} value={formatCompactNumber(entry.cacheReadTokens, numberLocale)} />
        <LogMetric label={t("缓存写入")} value={formatCompactNumber(entry.cacheWriteTokens, numberLocale)} />
        <LogMetric label={t("总计")} value={formatCompactNumber(entry.totalTokens, numberLocale)} />
        <LogMetric label={t("Cost")} value={formatUsdCost(entry.costUsd ?? 0)} />
      </div>
      {entry.retryAttempts.length > 0 ? <LogRetryAttempts attempts={entry.retryAttempts} /> : null}
      {entry.routeTrace ? <LogRouteTrace trace={entry.routeTrace} /> : null}
      {detailLoading || detailError ? (
        <div className={cn("border-b px-3 py-2 text-[12px] font-semibold", detailError ? "network-error-box" : "network-body-meta")}>
          {detailError || t("Loading full payload...")}
        </div>
      ) : null}
      <div className="network-detail-panes grid h-[440px] min-h-0 grid-cols-1 lg:grid-cols-2">
        <LogJsonPanel body={entry.requestBody} headerEmptyLabel="No request headers" headers={entry.requestHeaders} title={t("请求")} />
        <LogJsonPanel
          body={entry.responseBody}
          className="border-t lg:border-l lg:border-t-0"
          headerEmptyLabel="No response headers"
          headers={entry.responseHeaders}
          subtitle={`HTTP ${entry.statusCode || "-"}`}
          title={t("响应")}
        />
      </div>
    </div>
  );
}

const hiddenLegacyRouteHopNames = new Set([
  "agent-enricher.claude-code",
  "builtins.claude-code-request-enrichment",
  "enrichment.claude-code-request"
]);

function visibleRouteTraceHops(trace: RequestRouteTrace): RequestRouteTraceHop[] {
  return trace.hops.filter((hop) => !hiddenLegacyRouteHopNames.has(hop.name));
}

function LogRouteTrace({ trace }: { trace: RequestRouteTrace }) {
  const t = useAppText();
  const [dialogOpen, setDialogOpen] = useState(false);
  const visibleHopCount = visibleRouteTraceHops(trace).length;

  return (
    <>
      <div className="network-body-meta flex min-w-0 flex-wrap items-center justify-between gap-3 border-b px-3 py-2.5 text-[12px]">
        <div className="min-w-0">
          <div className="font-semibold">{t("Route trace")}</div>
          <div className="network-muted mt-0.5 text-[11px]">
            {visibleHopCount} {t("hops")}
            {trace.truncated ? ` · ${t("truncated")}` : ""}
          </div>
        </div>
        <button
          className="network-control-button flex h-8 shrink-0 items-center gap-2 rounded-md border px-3 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          onClick={() => setDialogOpen(true)}
          type="button"
        >
          <Route className="h-3.5 w-3.5" aria-hidden="true" />
          {t("View route graph")}
        </button>
      </div>
      {dialogOpen ? <LogRouteTraceDialog onClose={() => setDialogOpen(false)} trace={trace} /> : null}
    </>
  );
}

function LogRouteTraceDialog({
  onClose,
  trace
}: {
  onClose: () => void;
  trace: RequestRouteTrace;
}) {
  const t = useAppText();
  const [activeHopSequence, setActiveHopSequence] = useState<number>();
  const hops = visibleRouteTraceHops(trace);
  const activeHopIndex = hops.findIndex((hop) => hop.seq === activeHopSequence);
  const activeHop = activeHopIndex >= 0 ? hops[activeHopIndex] : undefined;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <Dialog className="items-start" onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="h-[calc(100dvh-1.5rem)] max-w-[1240px] origin-top sm:h-[min(820px,calc(100dvh-3rem))]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Route graph")}</DialogTitle>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{hops.length} {t("hops")}</span>
              {trace.truncated ? <><span aria-hidden="true">·</span><span>{t("truncated")}</span></> : null}
            </div>
          </div>
          <button
            aria-label={t("Close")}
            className="network-control-button flex h-7 w-7 items-center justify-center rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={onClose}
            title={t("Close")}
            type="button"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </DialogHeader>
        <DialogBody className="flex min-h-0 flex-col overflow-hidden p-0">
          <div className="network-body-meta shrink-0 border-b px-4 py-3">
            <div className="network-muted text-[11px] font-semibold">{t("Hover a node to inspect routing operations")}</div>
            <div className="mt-3 overflow-x-auto rounded-md border border-[color:var(--network-border)] bg-card/40">
              {hops.length === 0 ? (
                <div className="network-muted flex min-h-40 items-center justify-center px-4 text-[12px]">{t("No route activity")}</div>
              ) : (
                <div className="flex min-w-max items-center px-5 py-6" role="list" aria-label={t("Route graph")}>
                  {hops.map((hop, index) => (
                    <div className="flex items-center" key={`${hop.seq}-${hop.name}`} role="listitem">
                      {index > 0 ? (
                        <div className="flex w-12 shrink-0 items-center text-border" aria-hidden="true">
                          <span className="h-px flex-1 bg-current" />
                          <ChevronRight className="-ml-1 h-4 w-4" />
                        </div>
                      ) : null}
                      <button
                        aria-label={`${t("Route node")} ${index + 1}: ${routeHopDisplayName(hop.name, t)}`}
                        className={cn(
                          "flex h-[116px] w-[184px] shrink-0 flex-col rounded-md border border-border bg-card p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
                          activeHopSequence === hop.seq && "border-primary/60 bg-primary/5 ring-2 ring-primary/10"
                        )}
                        onFocus={() => setActiveHopSequence(hop.seq)}
                        onMouseEnter={() => setActiveHopSequence(hop.seq)}
                        type="button"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cn(
                            "h-2.5 w-2.5 shrink-0 rounded-full",
                            hop.status === "error"
                              ? "network-dot-error"
                              : hop.status === "noop"
                                ? "network-service-muted"
                                : "network-dot-completed"
                          )} />
                          <span className="network-muted truncate text-[10px] font-bold uppercase">#{index + 1}</span>
                          {hop.attempt ? <span className="network-muted ml-auto shrink-0 text-[10px]">A{hop.attempt}</span> : null}
                        </span>
                        <span className="mt-3 line-clamp-2 break-words text-[12px] font-bold leading-4">{routeHopDisplayName(hop.name, t)}</span>
                        <span className="network-muted mt-auto flex items-center justify-end text-[10px]">
                          <span>{formatDuration(hop.durationMs)}</span>
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4" id="route-hop-details">
            {activeHop ? (
              <LogRouteHopDetails hop={activeHop} index={activeHopIndex} />
            ) : (
              <div className="network-muted flex min-h-52 items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-[12px]">
                {t("Hover over a route node to inspect its operations.")}
              </div>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function LogRouteHopDetails({ hop, index }: { hop: RequestRouteTraceHop; index: number }) {
  const t = useAppText();
  const target = routeHopTargetSummary(hop);
  const outcome = routeHopOutcomeSummary(hop);
  const explanation = [hop.decision?.source, hop.decision?.ruleName ?? hop.decision?.ruleId, hop.decision?.reason]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="network-muted text-[10px] font-bold uppercase">{t("Route node")} #{index + 1}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{t(hop.phase)}</span>
            <span className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
              hop.status === "error" ? "network-state-pill-error" : hop.status === "noop" ? "network-service-muted" : "network-state-pill-completed"
            )}>{t(hop.status)}</span>
            {hop.attempt ? <span className="network-muted text-[10px]">{t("Attempt")} #{hop.attempt}</span> : null}
          </div>
          <div className="mt-1 break-words font-mono text-[13px] font-bold">{hop.name}</div>
        </div>
        <div className="network-muted shrink-0 text-right font-mono text-[10px]">
          <div>{formatDuration(hop.durationMs)}</div>
        </div>
      </div>
      {explanation || target || outcome ? (
        <div className="grid gap-2 border-b border-border py-3 text-[11px] md:grid-cols-3">
          {explanation ? <RouteHopDetail label={t("Decision")} value={explanation} /> : null}
          {target ? <RouteHopDetail label={t("Target")} mono value={target} /> : null}
          {outcome ? <RouteHopDetail danger={hop.status === "error"} label={t("Result")} value={outcome} /> : null}
        </div>
      ) : null}
      <div className="pt-3">
        <div className="mb-2 text-[11px] font-semibold">{t("Routing operations")}</div>
        {hop.changes.length > 0 ? (
          <div className="overflow-x-auto rounded border border-[color:var(--network-border)]">
            {hop.changes.map((change, changeIndex) => (
              <LogRouteChange change={change} index={changeIndex} key={`${change.path}-${changeIndex}`} />
            ))}
          </div>
        ) : <div className="network-muted rounded border border-dashed border-border px-3 py-4 text-[11px]">{t("No request fields changed")}</div>}
        {hop.truncated ? <div className="network-service-paused mt-2 text-[10px]">{t("This hop was truncated")}</div> : null}
      </div>
    </div>
  );
}

function RouteHopDetail({
  danger,
  label,
  mono,
  value
}: {
  danger?: boolean;
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/50 px-3 py-2">
      <div className="network-muted text-[10px] font-semibold uppercase">{label}</div>
      <div className={cn("mt-1 break-words text-[11px]", mono && "font-mono", danger && "network-error-text")}>{value}</div>
    </div>
  );
}

function routeHopDisplayName(name: string, t: (value: string) => string): string {
  if (name.startsWith("router.rewrite:") || name.startsWith("customer.rewrite:")) return t("Apply request rewrite");
  if (
    name === "agent-enricher.claude-code" ||
    name === "builtins.claude-code-request-enrichment" ||
    name === "enrichment.claude-code-request"
  ) {
    return t("Enrich Claude Code request");
  }
  if (name.startsWith("agent-enricher.") || name.endsWith("-request-enrichment")) return t("Enrich agent request");
  if (
    (name.startsWith("builtins.") && (name.endsWith("-route") || name.includes(".builtin-agent-"))) ||
    name === "customer.custom-router-decision" ||
    name === "customer.rule-decision"
  ) return t("Select target model");
  const labels: Record<string, string> = {
    "compatibility.codex-apply-patch": "Convert apply_patch calls",
    "compatibility.cursor-openai": "Convert Cursor request",
    "custom-router": "Call custom router",
    "customer.custom-router": "Call custom router",
    "enrichment.hosted-web-search": "Inject web search results",
    "enrichment.web-search-continuation": "Inject web search continuation",
    "fallback.execution-plan": "Build model fallback chain",
    "gateway.content-length-normalization": "Remove content-length header",
    "gateway.header-normalization": "Rewrite gateway headers",
    "model-discovery.claude-app": "Resolve Claude App model",
    "model-discovery.claude-code": "Resolve Claude Code model",
    "protocol-adapter.route-input": "Read model from request path",
    "provider.capability-routing": "Match provider capabilities",
    "request.ingress": "Receive request",
    "router.model-selection": "Apply selected model",
    "router.policy": "Select target model",
    "router.route-output": "Write routing result",
    "upstream.attempt.outcome": "Record upstream result",
    "upstream.attempt.prepare": "Build upstream request"
  };
  return t(labels[name] ?? name);
}

function LogRouteChange({ change, index }: { change: RequestRouteTraceChange; index: number }) {
  const t = useAppText();
  const displayPath = formatRouteTracePath(change);
  return (
    <div className={cn(
      "grid min-w-[560px] grid-cols-[76px_minmax(160px,0.8fr)_minmax(0,1fr)_28px_minmax(0,1fr)] border-b last:border-b-0 text-[10px]",
      index % 2 === 0 ? "network-kv-row-even" : "network-kv-row-odd"
    )}>
      <div className="border-r border-[color:var(--network-border)] px-2 py-1.5 font-bold uppercase">{t(change.operation)}</div>
      <div className="border-r border-[color:var(--network-border)] px-2 py-1.5 font-mono" title={displayPath}>{displayPath}</div>
      <RouteTraceChangeValue change={change} side="before" />
      <div className="network-muted flex items-center justify-center border-r border-[color:var(--network-border)]">→</div>
      <RouteTraceChangeValue change={change} side="after" />
    </div>
  );
}

function RouteTraceChangeValue({
  change,
  side
}: {
  change: RequestRouteTraceChange;
  side: "after" | "before";
}) {
  const t = useAppText();
  const hasRecordedValue = Object.prototype.hasOwnProperty.call(change, side);
  const value = change[side];
  const isAbsentValue = side === "before" && change.operation === "add" ||
    side === "after" && change.operation === "remove";
  const text = hasRecordedValue
    ? formatRouteTraceValue(value)
    : t(isAbsentValue ? "Not present" : "Not recorded");
  return (
    <div className="max-h-24 overflow-auto whitespace-pre-wrap break-all border-r border-[color:var(--network-border)] px-2 py-1.5 font-mono last:border-r-0" title={text}>
      {text}
    </div>
  );
}

function routeHopTargetSummary(hop: RequestRouteTraceHop): string {
  const target = hop.target;
  if (!target) return "";
  return [
    target.provider ? `provider=${target.provider}` : "",
    target.model ? `model=${target.model}` : "",
    target.protocol ? `protocol=${target.protocol}` : "",
    target.credentialId ? `credential=${target.credentialId}` : "",
    target.credentialCandidates?.length ? `candidates=${target.credentialCandidates.join(" > ")}` : ""
  ].filter(Boolean).join(" · ");
}

function routeHopOutcomeSummary(hop: RequestRouteTraceHop): string {
  const outcome = hop.outcome;
  if (!outcome) return "";
  return [
    outcome.statusCode ? `HTTP ${outcome.statusCode}` : "",
    outcome.error ?? "",
    outcome.fallbackReason ? `fallback=${outcome.fallbackReason}` : "",
    outcome.retryDelayMs !== undefined ? `retry in ${formatDuration(outcome.retryDelayMs)}` : ""
  ].filter(Boolean).join(" · ");
}

function formatRouteTraceValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value || '""';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function LogRetryAttempts({ attempts }: { attempts: RequestLogEntry["retryAttempts"] }) {
  const t = useAppText();

  return (
    <div className="network-body-meta border-b px-3 py-2 text-[12px]">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 truncate font-semibold">{t("Retry attempts")}</div>
        <div className="network-muted shrink-0 font-mono text-[11px]">{attempts.length}</div>
      </div>
      <div className="overflow-x-auto rounded border border-[color:var(--network-border)]">
        <div className="network-kv-header grid min-w-[520px] grid-cols-[96px_1fr_140px_120px] border-b text-[11px] font-bold">
          <div className="border-r border-[color:var(--network-border-strong)] px-3 py-2">{t("Attempt")}</div>
          <div className="border-r border-[color:var(--network-border-strong)] px-3 py-2">{t("Result")}</div>
          <div className="border-r border-[color:var(--network-border-strong)] px-3 py-2">{t("Next retry wait")}</div>
          <div className="px-3 py-2">{t("Type")}</div>
        </div>
        {attempts.map((attempt, index) => (
          <div
            className={cn(
              "network-kv-row grid min-w-[520px] grid-cols-[96px_1fr_140px_120px] text-[11px] font-semibold",
              index % 2 === 0 ? "network-kv-row-even" : "network-kv-row-odd"
            )}
            key={`${attempt.attempt}-${attempt.final ? "final" : "retry"}`}
          >
            <div className="border-r border-[color:var(--network-border-strong)] px-3 py-2 font-mono">#{attempt.attempt}</div>
            <div className="border-r border-[color:var(--network-border-strong)] px-3 py-2 font-mono">{attempt.status ?? "-"}</div>
            <div className="border-r border-[color:var(--network-border-strong)] px-3 py-2 font-mono">
              {attempt.final ? "-" : formatDuration(attempt.delayMs)}
            </div>
            <div className="px-3 py-2">{attempt.final ? t("Final attempt") : t("Retry")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="network-muted truncate text-[11px]">{label}</div>
      <div className="truncate font-mono text-[12px] font-semibold">{value}</div>
    </div>
  );
}

function LogModelRouteCell({ entry }: { entry: RequestLogEntry }) {
  const requestModel = logRequestModel(entry);
  const responseModel = logResponseModel(entry);
  return <LogModelTooltip requestModel={requestModel} responseModel={responseModel} />;
}

type LogModelTooltipState = {
  left: number;
  placement: "above" | "below";
  top: number;
  width: number;
};

function LogModelTooltip({
  requestModel,
  responseModel
}: {
  requestModel: string;
  responseModel: string;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<LogModelTooltipState>();
  const value = `${requestModel} -> ${responseModel}`;

  useEffect(() => {
    if (!tooltip) return;
    const dismiss = () => setTooltip(undefined);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [tooltip]);

  const showTooltip = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const gap = 6;
    const availableWidth = Math.max(0, window.innerWidth - margin * 2);
    const width = Math.min(availableWidth, Math.max(160, Math.min(480, value.length * 7 + 24)));
    const left = Math.min(
      Math.max(margin, rect.left + rect.width / 2 - width / 2),
      Math.max(margin, window.innerWidth - width - margin)
    );
    const placement = window.innerHeight - rect.bottom >= 72 || rect.top < 72 ? "below" : "above";
    setTooltip({
      left,
      placement,
      top: placement === "below" ? rect.bottom + gap : rect.top - gap,
      width
    });
  };

  return (
    <>
      <div
        className="flex min-w-0 items-center px-2"
        onMouseEnter={showTooltip}
        onMouseLeave={() => setTooltip(undefined)}
        ref={triggerRef}
      >
        <span className="min-w-0 max-w-[45%] truncate">{requestModel}</span>
        <MoveRight className="mx-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 max-w-[45%] truncate">{responseModel}</span>
      </div>
      {tooltip ? createPortal(
        <div
          className="pointer-events-none fixed z-[100] break-all rounded-md border border-border bg-popover px-2.5 py-1.5 font-mono text-[11px] font-medium text-popover-foreground shadow-card-elevated"
          role="tooltip"
          style={{
            left: tooltip.left,
            top: tooltip.top,
            transform: tooltip.placement === "above" ? "translateY(-100%)" : undefined,
            width: tooltip.width
          }}
        >
          {value}
        </div>,
        document.body
      ) : null}
    </>
  );
}

function LogCredentialCell({ entry }: { entry: RequestLogEntry }) {
  const label = logCredentialCellLabel(entry);
  const title = entry.credentialChain.length ? entry.credentialChain.join(" > ") : label;

  return (
    <div className="network-row-secondary truncate px-2" title={title}>{label}</div>
  );
}

function logHasCredentialInfo(entry: RequestLogEntry): boolean {
  return Boolean(entry.credentialId || entry.credentialChain.length > 0 || entry.credentialSaturated);
}

function logCredentialCellLabel(entry: RequestLogEntry): string {
  return entry.credentialId || entry.credentialChain[0] || (entry.credentialSaturated ? "saturated" : "-");
}

function LogStatusDot({ entry }: { entry: RequestLogEntry }) {
  return (
    <span className={cn("h-3 w-3 shrink-0 rounded-full", entry.ok ? "network-dot-completed" : "network-dot-error")} />
  );
}

function LogStreamCell({ entry }: { entry: RequestLogEntry }) {
  const t = useAppText();
  const label = entry.isStream ? t("Streaming") : t("Non-streaming");

  return (
    <div className="network-row-secondary truncate px-2" title={label}>{label}</div>
  );
}

type LogPayloadTab = "body" | "header";

function LogJsonPanel({
  body,
  className,
  headerEmptyLabel = "No values",
  headers,
  subtitle,
  title
}: {
  body?: RequestLogBody;
  className?: string;
  headerEmptyLabel?: string;
  headers?: Record<string, string | string[]>;
  subtitle?: string;
  title: string;
}) {
  const t = useAppText();
  const [selectedTab, setSelectedTab] = useState<LogPayloadTab>("body");
  const [preferTextBody, setPreferTextBody] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [query, setQuery] = useState("");
  const bodyKey = logBodyCacheKey(body);
  const bodyView = useMemo(() => cachedFormatLogBodyView(bodyKey, body), [bodyKey]);
  const formatted = bodyView.text;
  const visible = useMemo(() => filterLogText(formatted, query), [formatted, query]);
  const headerRows = useMemo(() => networkHeaderRows(headers ?? {}), [headers]);
  const [expandedJsonPaths, setExpandedJsonPaths] = useState<Set<string>>(() => createInitialVisibleJsonPaths(bodyView));
  const showJsonTree = bodyView.json !== undefined && query.trim() === "" && !preferTextBody;

  useEffect(() => {
    setExpandedJsonPaths(createInitialVisibleJsonPaths(bodyView));
    setPreferTextBody(false);
  }, [bodyKey]);

  useEffect(() => {
    if (!fullscreenOpen) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreenOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [fullscreenOpen]);

  function toggleJsonPath(path: string) {
    setExpandedJsonPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <div className={cn("network-pane-split flex min-h-0 min-w-0 flex-col", className)}>
      <div className="network-pane-header flex h-10 min-w-0 shrink-0 items-center gap-3 border-b px-3">
        <span className="network-pane-title shrink-0 text-[14px] font-bold">{title}</span>
        {subtitle ? <span className="network-muted shrink-0 text-[12px] font-semibold">{subtitle}</span> : null}
        <div className="network-payload-tabs flex min-w-0 items-center rounded-md border p-0.5">
          {(["body", "header"] as const).map((tab) => (
            <button
              aria-pressed={selectedTab === tab}
              className={cn(
                "network-payload-tab h-6 rounded-[5px] border border-transparent px-2.5 text-[12px] font-semibold capitalize outline-none transition-[background-color,border-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring/30",
                selectedTab === tab && "network-payload-tab-active"
              )}
              key={tab}
              onClick={() => setSelectedTab(tab)}
              type="button"
            >
              {t(tab)}
            </button>
          ))}
        </div>
      </div>
      <div className="network-pane-body flex min-h-0 flex-1 flex-col overflow-hidden">
        {selectedTab === "body" ? (
          <>
            <LogJsonBodyToolbar
              body={body}
              bodyView={bodyView}
              onQueryChange={setQuery}
              onToggleTextBody={() => setPreferTextBody((current) => !current)}
              preferTextBody={preferTextBody}
              query={query}
              title={title}
            />
            <LogBodyViewer
              copyLabel={`${t("Copy")} ${title} ${t("body")}`}
              copyText={formatted}
              fullscreenLabel={t("Open fullscreen JSON viewer")}
              onFullscreen={() => setFullscreenOpen(true)}
            >
              <LogJsonBodyContent
                expandedJsonPaths={expandedJsonPaths}
                onToggleJsonPath={toggleJsonPath}
                showJsonTree={showJsonTree}
                value={bodyView.json}
                visible={visible}
              />
            </LogBodyViewer>
            {fullscreenOpen ? (
              <LogJsonFullscreenViewer
                body={body}
                bodyView={bodyView}
                copyLabel={`${t("Copy")} ${title} ${t("body")}`}
                copyText={formatted}
                expandedJsonPaths={expandedJsonPaths}
                onClose={() => setFullscreenOpen(false)}
                onQueryChange={setQuery}
                onToggleJsonPath={toggleJsonPath}
                onToggleTextBody={() => setPreferTextBody((current) => !current)}
                preferTextBody={preferTextBody}
                query={query}
                showJsonTree={showJsonTree}
                subtitle={subtitle}
                title={title}
                visible={visible}
                value={bodyView.json}
              />
            ) : null}
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <NetworkKeyValueTable emptyLabel={headerEmptyLabel} rows={headerRows} />
          </div>
        )}
      </div>
    </div>
  );
}

function LogJsonBodyToolbar({
  body,
  bodyView,
  onQueryChange,
  onToggleTextBody,
  preferTextBody,
  query,
  title
}: {
  body?: RequestLogBody;
  bodyView: ReturnType<typeof formatLogBodyView>;
  onQueryChange: (value: string) => void;
  onToggleTextBody: () => void;
  preferTextBody: boolean;
  query: string;
  title: string;
}) {
  const t = useAppText();

  return (
    <div className="network-body-meta flex min-h-9 shrink-0 items-center gap-2 border-b px-3 py-1.5">
      <div className="relative min-w-[180px] flex-1">
        <Search className="network-search-icon pointer-events-none absolute left-2 top-1/2 z-[1] h-3 w-3 -translate-y-1/2" />
        <input
          aria-label={`${t("Filter")} ${title} JSON`}
          className="network-filter-input h-6 w-full rounded border pl-7 pr-2 text-[11px] font-semibold outline-none"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("筛选 JSON...")}
          value={query}
        />
      </div>
      {bodyView.json !== undefined && query.trim() === "" ? (
        <button
          className="network-tab shrink-0 border-0 bg-transparent p-0 text-[11px] font-semibold outline-none"
          onClick={onToggleTextBody}
          type="button"
        >
          {preferTextBody ? "JSON" : t("Show full content")}
        </button>
      ) : null}
      {body?.contentType ? <span className="network-muted hidden shrink-0 text-[11px] font-semibold sm:inline">{body.contentType}</span> : null}
      {body?.truncated ? <span className="network-service-paused rounded-full px-2 py-0.5 text-[11px] font-semibold">{t("truncated")}</span> : null}
    </div>
  );
}

function LogJsonBodyContent({
  expandedJsonPaths,
  onToggleJsonPath,
  showJsonTree,
  value,
  visible
}: {
  expandedJsonPaths: Set<string>;
  onToggleJsonPath: (path: string) => void;
  showJsonTree: boolean;
  value: unknown;
  visible: string;
}) {
  return showJsonTree ? (
    <LogJsonTree expandedPaths={expandedJsonPaths} onToggle={onToggleJsonPath} value={value} />
  ) : (
    <pre className="network-code min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 pr-20 font-mono text-[11px] leading-5">{visible}</pre>
  );
}

function LogJsonFullscreenViewer({
  body,
  bodyView,
  copyLabel,
  copyText,
  expandedJsonPaths,
  onClose,
  onQueryChange,
  onToggleJsonPath,
  onToggleTextBody,
  preferTextBody,
  query,
  showJsonTree,
  subtitle,
  title,
  value,
  visible
}: {
  body?: RequestLogBody;
  bodyView: ReturnType<typeof formatLogBodyView>;
  copyLabel: string;
  copyText: string;
  expandedJsonPaths: Set<string>;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onToggleJsonPath: (path: string) => void;
  onToggleTextBody: () => void;
  preferTextBody: boolean;
  query: string;
  showJsonTree: boolean;
  subtitle?: string;
  title: string;
  value: unknown;
  visible: string;
}) {
  const t = useAppText();

  return (
    <div
      aria-label={`${title} ${t("Fullscreen JSON viewer")}`}
      aria-modal="true"
      className="network-json-fullscreen fixed inset-0 z-[100] flex min-h-0"
      role="dialog"
    >
      <div className="network-json-fullscreen-panel flex min-h-0 flex-1 flex-col overflow-hidden border">
        <div className="network-json-fullscreen-header flex h-12 min-w-0 shrink-0 items-center gap-3 border-b px-4">
          <span className="network-pane-title min-w-0 truncate text-[15px] font-bold">{title}</span>
          {subtitle ? <span className="network-muted shrink-0 text-[12px] font-semibold">{subtitle}</span> : null}
          <button
            aria-label={t("Close fullscreen JSON viewer")}
            className="network-control-button ml-auto flex h-7 w-7 items-center justify-center rounded border outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={onClose}
            title={t("Close")}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <LogJsonBodyToolbar
          body={body}
          bodyView={bodyView}
          onQueryChange={onQueryChange}
          onToggleTextBody={onToggleTextBody}
          preferTextBody={preferTextBody}
          query={query}
          title={title}
        />
        <div className="network-json-fullscreen-body flex min-h-0 flex-1">
          <LogBodyViewer copyLabel={copyLabel} copyText={copyText}>
            <LogJsonBodyContent
              expandedJsonPaths={expandedJsonPaths}
              onToggleJsonPath={onToggleJsonPath}
              showJsonTree={showJsonTree}
              value={value}
              visible={visible}
            />
          </LogBodyViewer>
        </div>
      </div>
    </div>
  );
}

function logBodyCacheKey(body: RequestLogBody | undefined): string {
  if (!body) {
    return "missing";
  }
  const text = body.text ?? "";
  return [
    body.encoding ?? "",
    body.contentType ?? "",
    body.sizeBytes,
    body.truncated ? "truncated" : "complete",
    text.length,
    text.slice(0, 96),
    text.slice(-96)
  ].join("\u001f");
}

function cachedFormatLogBodyView(key: string, body: RequestLogBody | undefined): ReturnType<typeof formatLogBodyView> {
  const cached = logBodyViewCache.get(key);
  if (cached) {
    logBodyViewCache.delete(key);
    logBodyViewCache.set(key, cached);
    return cached;
  }

  const value = formatLogBodyView(body);
  logBodyViewCache.set(key, value);
  while (logBodyViewCache.size > logBodyViewCacheLimit) {
    const oldest = logBodyViewCache.keys().next().value;
    if (!oldest) {
      break;
    }
    logBodyViewCache.delete(oldest);
  }
  return value;
}

function createInitialVisibleJsonPaths(bodyView: ReturnType<typeof formatLogBodyView>): Set<string> {
  if (!isJsonContainer(bodyView.json)) {
    return new Set();
  }
  if (
    bodyView.text.length > logJsonAutoExpandTextLimit ||
    jsonContainerEntryCount(bodyView.json, logJsonAutoExpandEntryLimit + 1) > logJsonAutoExpandEntryLimit
  ) {
    return new Set();
  }
  return new Set(["$"]);
}

function jsonContainerEntryCount(value: Record<string, unknown> | unknown[], limit = Number.POSITIVE_INFINITY): number {
  if (Array.isArray(value)) {
    return value.length;
  }

  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    count += 1;
    if (count >= limit) {
      return count;
    }
  }
  return count;
}

function jsonContainerPreviewEntries(value: Record<string, unknown> | unknown[]): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.slice(0, logJsonContainerPreviewLimit).map((item, index) => [String(index), item]);
  }

  const entries: Array<[string, unknown]> = [];
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    entries.push([key, value[key]]);
    if (entries.length >= logJsonContainerPreviewLimit) {
      break;
    }
  }
  return entries;
}

function jsonContainerPreviewSummary(value: Record<string, unknown> | unknown[]): string {
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
  const count = jsonContainerEntryCount(value, logJsonContainerPreviewLimit + 1);
  return count > logJsonContainerPreviewLimit ? `Object(${logJsonContainerPreviewLimit}+)` : `Object(${count})`;
}

function jsonContainerHiddenSummary(value: Record<string, unknown> | unknown[], visibleCount: number): string {
  if (Array.isArray(value)) {
    return `... ${formatCompactNumber(Math.max(0, value.length - visibleCount))}`;
  }
  return "...";
}

function LogBodyViewer({
  children,
  copyLabel,
  copyText,
  fullscreenLabel,
  onFullscreen
}: {
  children: ReactNode;
  copyLabel: string;
  copyText: string;
  fullscreenLabel?: string;
  onFullscreen?: () => void;
}) {
  const t = useAppText();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1300);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyBody() {
    await copyTextToClipboard(copyText);
    setCopied(true);
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        {onFullscreen ? (
          <button
            aria-label={fullscreenLabel ?? t("Open fullscreen JSON viewer")}
            className="network-control-button flex h-7 w-7 items-center justify-center rounded border outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={onFullscreen}
            title={fullscreenLabel ?? t("Open fullscreen JSON viewer")}
            type="button"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          aria-label={copyLabel}
          className={cn(
            "network-control-button flex h-7 w-7 items-center justify-center rounded border outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            copied && "network-json-copy-success"
          )}
          onClick={() => void copyBody()}
          title={copied ? t("Copied") : t("复制")}
          type="button"
        >
          <AnimatedIconSwap iconKey={copied ? "copied" : "copy"}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </AnimatedIconSwap>
        </button>
      </div>
      {children}
    </div>
  );
}

function LogJsonTree({
  expandedPaths,
  onToggle,
  value
}: {
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  value: unknown;
}) {
  return (
    <div className="network-code min-h-0 flex-1 overflow-auto p-3 pr-20 font-mono text-[11px] leading-5">
      <JsonTreeNode expandedPaths={expandedPaths} onToggle={onToggle} path="$" value={value} />
    </div>
  );
}

function JsonTreeNode({
  depth = 0,
  expandedPaths,
  label,
  labelKind = "key",
  onToggle,
  path,
  trailingComma = false,
  value
}: {
  depth?: number;
  expandedPaths: Set<string>;
  label?: string;
  labelKind?: "index" | "key";
  onToggle: (path: string) => void;
  path: string;
  trailingComma?: boolean;
  value: unknown;
}) {
  const t = useAppText();

  if (!isJsonContainer(value)) {
    return (
      <div className="min-w-0 whitespace-pre-wrap break-words" style={{ paddingLeft: depth * 16 }}>
        {label !== undefined ? <JsonTreeLabel kind={labelKind} label={label} /> : null}
        <JsonPrimitiveValue value={value} />
        {trailingComma ? <span>,</span> : null}
      </div>
    );
  }

  const expanded = expandedPaths.has(path);
  const open = Array.isArray(value) ? "[" : "{";
  const close = Array.isArray(value) ? "]" : "}";
  const entryCount = jsonContainerEntryCount(value, 1);
  const visibleEntries = expanded ? jsonContainerPreviewEntries(value) : [];
  const hasHiddenEntries = expanded && jsonContainerEntryCount(value, logJsonContainerPreviewLimit + 1) > visibleEntries.length;

  if (entryCount === 0) {
    return (
      <div className="min-w-0 whitespace-pre-wrap break-words" style={{ paddingLeft: depth * 16 }}>
        <span className="inline-block w-4" />
        {label !== undefined ? <JsonTreeLabel kind={labelKind} label={label} /> : null}
        <span>{open}{close}</span>
        {trailingComma ? <span>,</span> : null}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="min-w-0 whitespace-pre-wrap break-words" style={{ paddingLeft: depth * 16 }}>
        <button
          aria-expanded={expanded}
          aria-label={expanded ? `${t("Collapse")} JSON` : `${t("Expand")} JSON`}
          className="network-control-button mr-1 inline-flex h-4 w-4 items-center justify-center rounded border align-[-2px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          onClick={() => onToggle(path)}
          title={expanded ? t("Collapse") : t("Expand")}
          type="button"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {label !== undefined ? <JsonTreeLabel kind={labelKind} label={label} /> : null}
        <span>{open}</span>
        {!expanded ? (
          <>
            <span className="network-muted"> {jsonContainerPreviewSummary(value)} </span>
            <span>{close}</span>
            {trailingComma ? <span>,</span> : null}
          </>
        ) : null}
      </div>
      {expanded ? (
        <>
          {visibleEntries.map(([key, childValue], index) => (
            <JsonTreeNode
              depth={depth + 1}
              expandedPaths={expandedPaths}
              key={`${path}/${key}`}
              label={key}
              labelKind={Array.isArray(value) ? "index" : "key"}
              onToggle={onToggle}
              path={jsonChildPath(path, key)}
              trailingComma={index < visibleEntries.length - 1 || hasHiddenEntries}
              value={childValue}
            />
          ))}
          {hasHiddenEntries ? (
            <div className="network-muted min-w-0 whitespace-pre-wrap break-words" style={{ paddingLeft: (depth + 1) * 16 }}>
              <span className="inline-block w-4" />
              <span>{jsonContainerHiddenSummary(value, visibleEntries.length)}</span>
            </div>
          ) : null}
          <div className="min-w-0 whitespace-pre-wrap break-words" style={{ paddingLeft: depth * 16 }}>
            <span className="inline-block w-4" />
            <span>{close}</span>
            {trailingComma ? <span>,</span> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function JsonTreeLabel({ kind, label }: { kind: "index" | "key"; label: string }) {
  return (
    <>
      <span className={kind === "index" ? "network-muted" : "text-[color:var(--network-accent)]"}>
        {kind === "index" ? label : JSON.stringify(label)}
      </span>
      <span>: </span>
    </>
  );
}

function JsonPrimitiveValue({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return <span className="text-emerald-600 dark:text-emerald-300">{JSON.stringify(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-blue-600 dark:text-blue-300">{String(value)}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-purple-600 dark:text-purple-300">{String(value)}</span>;
  }
  if (value === null) {
    return <span className="network-muted">null</span>;
  }
  return <span>{String(value)}</span>;
}

function NetworkHeaderCell({
  label,
  onResizeStart,
  resizeLabel
}: {
  label: string;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  resizeLabel?: string;
}) {
  return (
    <div className={cn("network-header-cell relative flex h-full min-w-0 items-center border-l px-2 first:border-l-0", onResizeStart && "pr-3")}>
      <span className="min-w-0 truncate">{label}</span>
      {onResizeStart ? (
        <button
          aria-label={resizeLabel ?? label}
          className="network-column-resize-handle"
          onPointerDown={onResizeStart}
          title={resizeLabel ?? label}
          type="button"
        />
      ) : null}
    </div>
  );
}

function NetworkStatusDot({ exchange }: { exchange: ProxyNetworkExchange }) {
  return (
    <span
      className={cn(
        "h-3 w-3 rounded-full",
        exchange.state === "error"
          ? "network-dot-error"
          : exchange.state === "pending"
            ? "network-dot-active"
            : (exchange.statusCode ?? 0) >= 400
              ? "network-dot-error"
              : "network-dot-completed"
      )}
    />
  );
}

function NetworkClientCell({ client }: { client: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="network-client-icon flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[8px] font-bold">
        {clientInitial(client)}
      </span>
      <span className="min-w-0 truncate" title={client}>{client}</span>
    </div>
  );
}

function NetworkRequestInspector({
  exchange,
  selectedTab,
  setSelectedTab
}: {
  exchange: ProxyNetworkExchange;
  selectedTab: NetworkRequestTab;
  setSelectedTab: (tab: NetworkRequestTab) => void;
}) {
  const t = useAppText();

  return (
    <div className="network-pane-split flex h-full min-w-0 flex-col">
      <div className="network-pane-header flex h-10 min-w-0 shrink-0 items-center gap-3 border-b px-3">
        <span className="network-pane-title shrink-0 text-[14px] font-bold">{t("Request")}</span>
        <div className="flex min-w-0 items-center gap-3">
          {(["header", "query", "body", "raw", "summary"] as const).map((tab) => (
            <button
              className={cn(
                "network-tab border-0 bg-transparent p-0 text-[12px] font-semibold capitalize outline-none",
                selectedTab === tab && "network-tab-active"
              )}
              key={tab}
              onClick={() => setSelectedTab(tab)}
              type="button"
            >
              {t(tab)}
            </button>
          ))}
          <span className="network-tab-divider h-4 w-px border-l" />
          <button className="network-tab border-0 bg-transparent p-0" type="button">+</button>
        </div>
      </div>

      <div className="network-pane-body min-h-0 flex-1 overflow-auto">
        {selectedTab === "header" ? <NetworkKeyValueTable rows={networkHeaderRows(exchange.requestHeaders)} /> : null}
        {selectedTab === "query" ? <NetworkKeyValueTable rows={networkQueryRows(exchange.url)} emptyLabel={t("No query parameters")} /> : null}
        {selectedTab === "body" ? <NetworkBodyViewer body={exchange.requestBody} /> : null}
        {selectedTab === "raw" ? <NetworkInspectorCode value={formatNetworkRequestRaw(exchange)} /> : null}
        {selectedTab === "summary" ? <NetworkKeyValueTable rows={networkSummaryRows(exchange)} /> : null}
      </div>
    </div>
  );
}

function NetworkResponseInspector({
  exchange,
  selectedTab,
  setSelectedTab
}: {
  exchange: ProxyNetworkExchange;
  selectedTab: NetworkResponseTab;
  setSelectedTab: (tab: NetworkResponseTab) => void;
}) {
  const t = useAppText();

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="network-pane-header flex h-10 min-w-0 shrink-0 items-center justify-between gap-3 border-b px-3">
        <span className="network-pane-title shrink-0 text-[14px] font-bold">{t("Response")}</span>
        <div className="flex items-center gap-3">
          {(["body", "header", "raw"] as const).map((tab) => (
            <button
              className={cn(
                "network-tab border-0 bg-transparent p-0 text-[12px] font-semibold capitalize outline-none",
                selectedTab === tab && "network-tab-active"
              )}
              key={tab}
              onClick={() => setSelectedTab(tab)}
              type="button"
            >
              {t(tab)}
            </button>
          ))}
        </div>
      </div>

      <div className="network-pane-body min-h-0 flex-1 overflow-auto">
        {exchange.error ? (
          <div className="network-error-box m-4 rounded-md border px-3 py-2 text-[12px]">{exchange.error}</div>
        ) : null}
        {selectedTab === "body" ? <NetworkBodyViewer body={exchange.responseBody} /> : null}
        {selectedTab === "header" ? <NetworkKeyValueTable rows={networkHeaderRows(exchange.responseHeaders ?? {})} emptyLabel={t("No response headers")} /> : null}
        {selectedTab === "raw" ? <NetworkInspectorCode value={formatNetworkResponseRaw(exchange)} /> : null}
      </div>
    </div>
  );
}

function NetworkKeyValueTable({ emptyLabel = "No values", rows }: { emptyLabel?: string; rows: Array<[string, string]> }) {
  const t = useAppText();

  if (rows.length === 0) {
    return <div className="network-kv-empty px-4 py-10 text-center text-[12px] font-semibold">{t(emptyLabel)}</div>;
  }

  return (
    <div className="min-w-[520px]">
      <div className="network-kv-header grid h-9 grid-cols-[minmax(180px,0.9fr)_minmax(280px,1.6fr)] items-center border-b text-[12px] font-bold">
        <div className="network-kv-key-head border-r px-3">{t("Key")}</div>
        <div className="px-3">{t("Value")}</div>
      </div>
      {rows.map(([key, value], index) => (
        <div
          className={cn(
            "network-kv-row grid min-h-9 grid-cols-[minmax(180px,0.9fr)_minmax(280px,1.6fr)] items-start text-[12px] font-semibold",
            index % 2 === 0 ? "network-kv-row-even" : "network-kv-row-odd"
          )}
          key={`${key}-${index}`}
        >
          <div className="network-kv-key min-w-0 px-3 py-2">{key}</div>
          <div className="network-kv-value min-w-0 whitespace-pre-wrap break-words px-3 py-2">{value}</div>
        </div>
      ))}
    </div>
  );
}

function NetworkBodyViewer({ body }: { body?: ProxyNetworkBody }) {
  const t = useAppText();

  if (!body || (!body.text && body.sizeBytes === 0)) {
    return <div className="px-4 py-10 text-center text-[12px] font-semibold text-[#777d86]">{t("No body")}</div>;
  }

  return (
    <div className="min-w-0">
      <div className="network-body-meta flex min-h-9 flex-wrap items-center gap-2 border-b px-3 py-1.5 text-[11px] font-semibold">
        <span>{formatBytes(body.sizeBytes)}</span>
        {body.contentType ? <span>{body.contentType}</span> : null}
        {body.encoding === "base64" ? <span>base64</span> : null}
        {body.decodedFrom ? <span>{body.decodedFrom} {t("decoded")}</span> : null}
        {body.truncated ? <span>{t("truncated")}</span> : null}
      </div>
      {body.error ? <div className="network-body-warning border-b px-3 py-2 text-[12px]">{body.error}</div> : null}
      <NetworkInspectorCode value={body.text || t("No body")} />
    </div>
  );
}

function NetworkInspectorCode({ value }: { value: string }) {
  return (
    <pre className="network-code min-h-[240px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5">{value}</pre>
  );
}
