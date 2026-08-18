import {
  agentAnalysisRangeOptions, AgentAnalysisSessionSelection, AgentAnalysisSnapshot, AgentAnalysisTracePayloadFullResult, AgentAnalysisTracePayloadRequest, AgentAnalysisTraceRun, agentFilterOptions, AgentFilterValue, agentKindLabel,
  AnimatePresence, AnimatedDisclosure, AnimatedIconSwap,
  Area, arrayMove, Badge, Bar, BarChart, Button,
  Card, CardContent, CardHeader, CardTitle, CartesianGrid, Cell, constrainOverviewWidgetSize,
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, cn, codexLogoUrl, compactId,
  compactUserAgent, compareProviderAccountSnapshots, ComposedChart, CSS, Checkbox, DEFAULT_OVERVIEW_WIDGETS, DndContext,
  Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle,
  DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent, Field, formatAxisNumber, formatBytes,
  formatCompactNumber, formatDuration, formatLogDateTime, formatPercent, formatPercentFixed, formatProviderAccountDetailDate, formatProviderAccountMeterTitle, formatProviderAccountMeterValue,
  formatStatusBucketDate, formatSystemStatusRange, formatUsdCost, KeyboardSensor,
  LabelList, LayoutGroup, Line, LoaderCircle, MeasuringStrategy, MetricTone,
  motion, normalizeAgentFilterValue, normalizeOverviewWidget, normalizeOverviewWidgets,
  OverviewAccountCardSize, OverviewMetricKind, overviewMetricOptions, overviewWidgetCollisionDetection, OverviewWidgetConfig, OverviewWidgetSize, overviewWidgetSizeOptions,
  OverviewWidgetType, OverviewWidgetVariant, Pencil, Pie, PieChart, Plus,
  PointerSensor, primaryProviderAccountMeter, providerAccountMeterDetailValidityProgress, providerAccountMeterProgress, providerAccountMetersForDisplay, providerAccountProgressClass, isGatewayProviderEnabled, isProviderAccountManualResetMeter,
  providerAccountSnapshotKey, providerAccountSnapshotLabel, providerDisplayIcon,
  ProviderAccountMeter, ProviderAccountSnapshot, ReactNode, ReactPointerEvent, rectSortingStrategy, RefreshCw, RequestLogEntry, Select,
  SelectControl, SortableContext, sortableKeyboardCoordinates, systemStatusPointTooltip,
  Tabs, TabsList, TabsTrigger, Tooltip, translateOptions, Trash2, UsageComparisonRow, usageRangeOptions,
  GatewayProviderConfig, UsageSeriesPoint, UsageStatsRange, UsageStatsSnapshot, usageStatusTone, UsageTotals, useAppText,
  useEffect, useMemo, useRef, useSensor, useSensors, useSortable,
  useState, X, XAxis, YAxis
} from "../shared/index";
import { buildTokenActivity, type TokenActivityCell } from "@/lib/usage-activity";
import { LogExpandedDetails } from "./network-logs";
import { ShareCardWidget } from "./share-cards";
import {
  CalendarDays, ChartNoAxesCombined, ChartPie, CreditCard, GripHorizontal, Inbox, Layers3,
  Rocket, Server, UsersRound, WalletCards, Wifi
} from "lucide-react";
import { Tooltip as UiTooltip, TooltipPortal } from "@/components/ui/tooltip";

type OverviewUsageFilters = {
  modelFilter: string;
  providerFilter: string;
  providers: GatewayProviderConfig[];
  setModelFilter: (model: string) => void;
  setProviderFilter: (provider: string) => void;
};

const emptyOverviewProviders: GatewayProviderConfig[] = [];

function chartTooltipPortal(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.body;
}

export function OverviewView({
  onWidgetsChange,
  overviewWidgets,
  providerAccounts,
  providerAccountRefreshing = false,
  refreshProviderAccounts,
  setUsageRange,
  usageFilters,
  usageRange,
  usageStats
}: {
  onWidgetsChange: (widgets: OverviewWidgetConfig[]) => void;
  overviewWidgets: OverviewWidgetConfig[];
  providerAccounts: ProviderAccountSnapshot[];
  providerAccountRefreshing?: boolean;
  refreshProviderAccounts?: () => void | Promise<void>;
  setUsageRange: (range: UsageStatsRange) => void;
  usageFilters?: OverviewUsageFilters;
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
}) {
  const t = useAppText();
  const viewRef = useRef<HTMLDivElement>(null);
  const [activeWidgetId, setActiveWidgetId] = useState<string>();
  const [selectedWidgetId, setSelectedWidgetId] = useState<string>();
  const [dragPreviewWidgets, setDragPreviewWidgets] = useState<OverviewWidgetConfig[]>();
  const [pendingScrollWidgetId, setPendingScrollWidgetId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );
  const widgets = useMemo(() => normalizeOverviewWidgets(overviewWidgets), [overviewWidgets]);
  const configuredVisibleWidgets = useMemo(() => widgets.filter((widget) => widget.enabled), [widgets]);
  const displayWidgets = dragPreviewWidgets ?? widgets;
  const visibleWidgets = displayWidgets.filter((widget) => widget.enabled);
  const activeWidget = visibleWidgets.find((widget) => widget.id === activeWidgetId);
  const selectedWidget = widgets.find((widget) => widget.id === selectedWidgetId);
  const filterProviders = usageFilters?.providers ?? emptyOverviewProviders;
  const providerFilter = usageFilters?.providerFilter ?? "";
  const modelFilter = usageFilters?.modelFilter ?? "";
  const providerOptions = useMemo(() => overviewProviderFilterOptions(filterProviders, t), [filterProviders, t]);
  const modelOptions = useMemo(() => overviewModelFilterOptions(filterProviders, providerFilter, t), [filterProviders, providerFilter, t]);

  useEffect(() => {
    if (!editing) {
      setActiveWidgetId(undefined);
      setSelectedWidgetId(undefined);
      setDragPreviewWidgets(undefined);
    }
  }, [editing]);

  useEffect(() => {
    if (selectedWidgetId && !widgets.some((widget) => widget.id === selectedWidgetId)) {
      setSelectedWidgetId(undefined);
    }
  }, [selectedWidgetId, widgets]);

  useEffect(() => {
    if (editing && !selectedWidgetId && configuredVisibleWidgets[0]) {
      setSelectedWidgetId(configuredVisibleWidgets[0].id);
    }
  }, [configuredVisibleWidgets, editing, selectedWidgetId]);

  useEffect(() => {
    if (!editing || !pendingScrollWidgetId || !widgets.some((widget) => widget.enabled && widget.id === pendingScrollWidgetId)) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = findOverviewWidgetElement(viewRef.current, pendingScrollWidgetId);
      if (!element) {
        return;
      }
      element.scrollIntoView({ block: "center", inline: "nearest" });
      setPendingScrollWidgetId(undefined);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing, pendingScrollWidgetId, widgets]);

  function updateWidget(id: string, patch: Partial<OverviewWidgetConfig>) {
    onWidgetsChange(widgets.map((widget) => widget.id === id ? normalizeOverviewWidget({ ...widget, ...patch }) ?? widget : widget));
  }

  function startWidgetSort(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveWidgetId(id);
    setSelectedWidgetId(id);
    setDragPreviewWidgets(widgets);
  }

  function previewWidgetSort(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId || activeId === overId) {
      return;
    }
    setDragPreviewWidgets((current) => {
      const source = current ?? widgets;
      const activeIndex = source.findIndex((widget) => widget.id === activeId);
      const overIndex = source.findIndex((widget) => widget.id === overId);
      if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
        return source;
      }
      return arrayMove(source, activeIndex, overIndex);
    });
  }

  function finishWidgetSort(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : "";
    const sortedWidgets = dragPreviewWidgets ?? widgets;
    setActiveWidgetId(undefined);
    setDragPreviewWidgets(undefined);
    if (!overId && sameOverviewWidgetOrder(sortedWidgets, widgets)) {
      return;
    }
    onWidgetsChange(sortedWidgets);
  }

  function cancelWidgetSort() {
    setActiveWidgetId(undefined);
    setDragPreviewWidgets(undefined);
  }

  function removeWidget(id: string) {
    onWidgetsChange(widgets.filter((widget) => widget.id !== id));
    setSelectedWidgetId((current) => current === id ? undefined : current);
  }

  function changeProviderFilter(provider: string) {
    usageFilters?.setProviderFilter(provider);
    if (modelFilter && provider && !overviewProviderHasModel(filterProviders, provider, modelFilter)) {
      usageFilters?.setModelFilter("");
    }
  }

  function changeModelFilter(model: string) {
    usageFilters?.setModelFilter(model);
  }

  useEffect(() => {
    if (!editing || !selectedWidgetId || activeWidgetId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.key !== "Delete" && event.key !== "Backspace")) {
        return;
      }
      const target = event.target instanceof Element ? event.target : undefined;
      if (isEditableKeyboardTarget(target)) {
        return;
      }
      if (target && target !== document.body && !viewRef.current?.contains(target)) {
        return;
      }
      event.preventDefault();
      removeWidget(selectedWidgetId);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeWidgetId, editing, selectedWidgetId, widgets]);

  function addWidget(template: OverviewWidgetConfig) {
    const id = uniqueOverviewWidgetId(widgets, template.id);
    const widget = normalizeOverviewWidget({ ...template, enabled: true, id });
    if (!widget) {
      return;
    }
    onWidgetsChange([...widgets, widget]);
    setSelectedWidgetId(id);
    setPendingScrollWidgetId(id);
    setEditing(true);
  }

  function changeWidgetCategory(id: string, category: OverviewWidgetCategory) {
    const current = widgets.find((widget) => widget.id === id);
    if (!current) {
      return;
    }
    const type = overviewWidgetTypeForCategory(category, current.type);
    const metric = type === "metric" ? current.metric ?? "requests" : undefined;
    updateWidget(id, {
      metric,
      type,
      variant: overviewWidgetVariantOptions(type)[0]?.value ?? current.variant
    });
  }

  function changeWidgetAnalysisData(id: string, type: "client-analysis" | "provider-analysis") {
    const current = widgets.find((widget) => widget.id === id);
    if (!current) {
      return;
    }
    updateWidget(id, {
      type,
      variant: overviewWidgetVariantOptions(type)[0]?.value ?? current.variant
    });
  }

  function changeWidgetBreakdownData(id: string, type: "model-distribution" | "token-mix") {
    const current = widgets.find((widget) => widget.id === id);
    if (!current) {
      return;
    }
    const variants = overviewWidgetVariantOptions(type).map((option) => option.value);
    updateWidget(id, {
      type,
      variant: variants.includes(current.variant) ? current.variant : overviewWidgetVariantOptions(type)[0]?.value ?? current.variant
    });
  }

  function changeWidgetAccountProviders(id: string, accountProviders: string[]) {
    updateWidget(id, {
      accountProvider: accountProviders.length === 1 ? accountProviders[0] : undefined,
      accountProviders: accountProviders.length > 0 ? accountProviders : undefined
    });
  }

  function changeWidgetAccountCardSize(id: string, accountKey: string, size: OverviewAccountCardSize | undefined) {
    const current = widgets.find((widget) => widget.id === id);
    if (!current) {
      return;
    }
    const accountCardSizes = { ...(current.accountCardSizes ?? {}) };
    if (size) {
      accountCardSizes[accountKey] = size;
    } else {
      delete accountCardSizes[accountKey];
    }
    updateWidget(id, {
      accountCardSizes: Object.keys(accountCardSizes).length > 0 ? accountCardSizes : undefined
    });
  }

  function changeWidgetAccountCardOrder(id: string, accountCardOrder: string[]) {
    updateWidget(id, {
      accountCardOrder: accountCardOrder.length > 0 ? accountCardOrder : undefined
    });
  }

  function changeWidgetShareData(id: string, type: ShareOverviewWidgetType) {
    const current = widgets.find((widget) => widget.id === id);
    if (!current) {
      return;
    }
    updateWidget(id, {
      type,
      variant: overviewWidgetVariantOptions(type)[0]?.value ?? current.variant
    });
  }

  function resetLayout() {
    onWidgetsChange(DEFAULT_OVERVIEW_WIDGETS.map((widget) => ({ ...widget })));
    setSelectedWidgetId(undefined);
  }

  const widgetGrid = (
    <DndContext
      collisionDetection={overviewWidgetCollisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      sensors={sensors}
      onDragCancel={cancelWidgetSort}
      onDragEnd={finishWidgetSort}
      onDragOver={previewWidgetSort}
      onDragStart={startWidgetSort}
    >
      <SortableContext items={visibleWidgets.map((widget) => widget.id)} strategy={rectSortingStrategy}>
        <LayoutGroup>
          <section className="grid auto-rows-[132px] grid-cols-1 gap-4 sm:auto-rows-[140px] sm:grid-cols-2 xl:auto-rows-[148px] xl:grid-cols-4" data-overview-widget-grid>
            {visibleWidgets.map((widget) => (
              <SortableOverviewWidget editing={editing} key={widget.id} widget={widget} onSelect={() => setSelectedWidgetId(widget.id)}>
                <OverviewWidgetFrame
                  editing={editing}
                  selected={selectedWidgetId === widget.id}
                  widget={widget}
                  onResize={(size) => updateWidget(widget.id, { size })}
                  onSelect={() => setSelectedWidgetId(widget.id)}
                >
                  <OverviewWidgetRenderer
                    editing={editing}
                    onChangeAccountCardOrder={(accountKeys) => changeWidgetAccountCardOrder(widget.id, accountKeys)}
                    onChangeAccountCardSize={(accountKey, size) => changeWidgetAccountCardSize(widget.id, accountKey, size)}
                    providerAccounts={providerAccounts}
                    providerAccountRefreshing={providerAccountRefreshing}
                    providers={filterProviders}
                    refreshProviderAccounts={refreshProviderAccounts}
                    usageRange={usageRange}
                    usageStats={usageStats}
                    widget={widget}
                  />
                </OverviewWidgetFrame>
              </SortableOverviewWidget>
            ))}
            {visibleWidgets.length === 0 ? (
              <OverviewEmptyState className="col-span-1 sm:col-span-2 xl:col-span-4" label={t("No widgets configured")} />
            ) : null}
          </section>
        </LayoutGroup>
      </SortableContext>
      <DragOverlay adjustScale={false}>
        {activeWidget ? (
          <OverviewWidgetDragOverlay
            providerAccounts={providerAccounts}
            providerAccountRefreshing={providerAccountRefreshing}
            providers={filterProviders}
            refreshProviderAccounts={refreshProviderAccounts}
            usageRange={usageRange}
            usageStats={usageStats}
            widget={activeWidget}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="overview-view space-y-5"
      data-editing={editing}
      initial={{ opacity: 0 }}
      ref={viewRef}
      transition={{ duration: 0.15 }}
    >
      <div className="overview-toolbar flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <OverviewUsageRangeSelector range={usageRange} setRange={setUsageRange} />
          <Select
            aria-label={t("Provider")}
            className="h-9 w-[168px] rounded-[10px] bg-[length:14px] px-3 pr-8 text-[12px] shadow-none"
            onValueChange={changeProviderFilter}
            options={providerOptions}
            value={providerFilter}
          />
          <Select
            aria-label={t("Model")}
            className="h-9 w-[220px] rounded-[10px] bg-[length:14px] px-3 pr-8 text-[12px] shadow-none"
            onValueChange={changeModelFilter}
            options={modelOptions}
            value={modelFilter}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <Button onClick={resetLayout} size="sm" type="button" variant="outline">
              <RefreshCw className="h-3.5 w-3.5" />
              {t("Reset layout")}
            </Button>
          ) : null}
          <Button
            aria-label={editing ? t("Done") : t("Edit widgets")}
            onClick={() => setEditing((value) => !value)}
            size={editing ? "sm" : "iconSm"}
            title={editing ? t("Done") : t("Edit widgets")}
            type="button"
            variant={editing ? "default" : "outline"}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editing ? t("Done") : null}
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
          <aside className="overview-editor-panel min-w-0 border p-3 xl:sticky xl:top-4 xl:self-start">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("Components")}</h3>
              <Badge variant="outline">{overviewWidgetTemplates().length}</Badge>
            </div>
            <OverviewWidgetPalette onAdd={addWidget} />
          </aside>

          <main className="min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("Preview")}</h3>
              <Badge variant="outline">{visibleWidgets.length}</Badge>
            </div>
            {widgetGrid}
          </main>

          <aside className="overview-editor-panel min-w-0 border p-3 xl:sticky xl:top-4 xl:self-start">
            <OverviewWidgetProperties
              providerAccounts={providerAccounts}
              widget={selectedWidget}
              onChangeAccountProviders={(accountProviders) => selectedWidget ? changeWidgetAccountProviders(selectedWidget.id, accountProviders) : undefined}
              onChangeAnalysisData={(type) => selectedWidget ? changeWidgetAnalysisData(selectedWidget.id, type) : undefined}
              onChangeBreakdownData={(type) => selectedWidget ? changeWidgetBreakdownData(selectedWidget.id, type) : undefined}
              onChangeCategory={(category) => selectedWidget ? changeWidgetCategory(selectedWidget.id, category) : undefined}
              onChangeMetric={(metric) => selectedWidget ? updateWidget(selectedWidget.id, { metric }) : undefined}
              onChangeShareData={(type) => selectedWidget ? changeWidgetShareData(selectedWidget.id, type) : undefined}
              onChangeSize={(size) => selectedWidget ? updateWidget(selectedWidget.id, { size }) : undefined}
              onChangeVariant={(variant) => selectedWidget ? updateWidget(selectedWidget.id, { variant }) : undefined}
              onRemove={() => selectedWidget ? removeWidget(selectedWidget.id) : undefined}
            />
          </aside>
        </div>
      ) : (
        widgetGrid
      )}

    </motion.div>
  );
}

function OverviewUsageRangeSelector({
  range,
  setRange
}: {
  range: UsageStatsRange;
  setRange: (range: UsageStatsRange) => void;
}) {
  const t = useAppText();

  return (
    <div aria-label={t("Usage over time")} className="overview-segmented flex" role="group">
      {usageRangeOptions.map((option) => (
        <Button
          aria-pressed={range === option.value}
          className={cn(
            "overview-segmented-item h-7 px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground",
            range === option.value && "text-foreground"
          )}
          data-active={range === option.value}
          key={option.value}
          onClick={() => setRange(option.value)}
          type="button"
          unstyled
        >
          {t(option.label)}
        </Button>
      ))}
    </div>
  );
}

type OverviewHeadingTone = "blue" | "green" | "orange" | "purple" | "red" | "slate";
type OverviewHeadingIcon = typeof Inbox;

function OverviewCardHeading({
  icon: Icon,
  title,
  tone = "blue",
  trailing
}: {
  icon: OverviewHeadingIcon;
  title: string;
  tone?: OverviewHeadingTone;
  trailing?: ReactNode;
}) {
  return (
    <CardHeader className="overview-card-header shrink-0 flex-row items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="overview-heading-icon" data-tone={tone}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <CardTitle>{title}</CardTitle>
      </div>
      {trailing ? <div className="min-w-0 shrink-0">{trailing}</div> : null}
    </CardHeader>
  );
}

function OverviewEmptyState({
  className,
  compact = false,
  label
}: {
  className?: string;
  compact?: boolean;
  label: string;
}) {
  return (
    <div className={cn(
      "overview-empty-state overview-nested-surface flex min-h-0 flex-col items-center justify-center border border-dashed px-4 text-center text-muted-foreground",
      compact ? "py-7" : "py-10",
      className
    )}>
      <span aria-hidden="true" className="overview-empty-state-icon">
        <Inbox className="h-4 w-4" />
      </span>
      <span className="mt-2 text-[12px] font-medium">{label}</span>
    </div>
  );
}

function OverviewChartLegend({ items }: { items: Array<{ color: string; label: string }> }) {
  return (
    <div className="overview-chart-legend hidden items-center gap-3 md:flex">
      {items.map((item) => (
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground" key={item.label}>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="max-w-[96px] truncate">{item.label}</span>
        </span>
      ))}
    </div>
  );
}

function OverviewDonutCenter({ label, value }: { label: string; value: string }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
      <span className="text-[17px] font-semibold tracking-[-0.025em] text-foreground">{value}</span>
      <span className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
    </div>
  );
}

function overviewProviderFilterOptions(providers: GatewayProviderConfig[], translate: (value: string) => string): Array<{ label: string; value: string }> {
  const providerNames = new Set<string>();
  for (const provider of providers) {
    if (!isGatewayProviderEnabled(provider)) {
      continue;
    }
    const name = provider.name.trim();
    if (name) {
      providerNames.add(name);
    }
  }
  return [
    { label: translate("All providers"), value: "" },
    ...Array.from(providerNames).map((provider) => ({ label: provider, value: provider }))
  ];
}

function overviewModelFilterOptions(
  providers: GatewayProviderConfig[],
  providerFilter: string,
  translate: (value: string) => string
): Array<{ label: string; value: string }> {
  const models = new Set<string>();
  for (const provider of providers) {
    if (!isGatewayProviderEnabled(provider)) {
      continue;
    }
    if (providerFilter && provider.name !== providerFilter) {
      continue;
    }
    for (const rawModel of provider.models) {
      const model = rawModel.trim();
      if (model) {
        models.add(model);
      }
    }
  }
  return [
    { label: translate("All models"), value: "" },
    ...Array.from(models).map((model) => ({ label: model, value: model }))
  ];
}

function overviewProviderHasModel(providers: GatewayProviderConfig[], providerName: string, modelName: string): boolean {
  return providers.some((provider) =>
    isGatewayProviderEnabled(provider) &&
    provider.name === providerName &&
    provider.models.some((model) => model.trim() === modelName)
  );
}

function isEditableKeyboardTarget(target: Element | undefined): boolean {
  return Boolean(target?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only'], [role='textbox']"));
}

function findOverviewWidgetElement(root: HTMLElement | null, id: string): HTMLElement | undefined {
  if (!root) {
    return undefined;
  }
  return Array.from(root.querySelectorAll<HTMLElement>("[data-overview-widget-id]"))
    .find((element) => element.dataset.overviewWidgetId === id);
}

function OverviewWidgetPalette({
  onAdd
}: {
  onAdd: (widget: OverviewWidgetConfig) => void;
}) {
  const t = useAppText();
  const templates = overviewWidgetTemplates();

  return (
    <div className="grid grid-cols-1 gap-2">
      {templates.map((template) => (
        <Button
          className="overview-palette-item grid h-auto w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-2 border px-2.5 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring/25"
          key={overviewWidgetTemplateKey(template)}
          onClick={() => onAdd(template)}
          type="button"
          unstyled
        >
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold text-foreground">{t(overviewWidgetPaletteTitle(template))}</div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{t(overviewWidgetPaletteDescription(template))}</div>
          </div>
        </Button>
      ))}
    </div>
  );
}

function OverviewWidgetProperties({
  providerAccounts,
  widget,
  onChangeAccountProviders,
  onChangeAnalysisData,
  onChangeBreakdownData,
  onChangeCategory,
  onChangeMetric,
  onChangeShareData,
  onChangeSize,
  onChangeVariant,
  onRemove
}: {
  providerAccounts: ProviderAccountSnapshot[];
  widget: OverviewWidgetConfig | undefined;
  onChangeAccountProviders: (accountProviders: string[]) => void;
  onChangeAnalysisData: (type: "client-analysis" | "provider-analysis") => void;
  onChangeBreakdownData: (type: "model-distribution" | "token-mix") => void;
  onChangeCategory: (category: OverviewWidgetCategory) => void;
  onChangeMetric: (metric: OverviewMetricKind) => void;
  onChangeShareData: (type: ShareOverviewWidgetType) => void;
  onChangeSize: (size: OverviewWidgetSize) => void;
  onChangeVariant: (variant: OverviewWidgetVariant) => void;
  onRemove: () => void;
}) {
  const t = useAppText();

  if (!widget) {
    return <OverviewEmptyState compact label={t("No widget selected")} />;
  }

  const category = overviewWidgetCategory(widget.type);
  const dataOptions = overviewWidgetDataOptions(widget, providerAccounts);
  const dataValue = overviewWidgetDataValue(widget);
  const accountProviderValues = overviewWidgetAccountProviderValues(widget);
  const sizeOptions = overviewWidgetSizeOptions.filter((option) => (
    constrainOverviewWidgetSize(option.value, widget.type, widget.variant, accountProviderValues) === option.value
  ));
  const changeData = (value: string) => {
    if (category === "metric") {
      onChangeMetric(value as OverviewMetricKind);
    }
    if (category === "analysis") {
      onChangeAnalysisData(value as "client-analysis" | "provider-analysis");
    }
    if (category === "breakdown") {
      onChangeBreakdownData(value as "model-distribution" | "token-mix");
    }
    if (category === "share-card") {
      onChangeShareData(value as ShareOverviewWidgetType);
    }
  };

  return (
    <div className="space-y-3">
      <div className="min-w-0">
        <h3 className="truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("Component properties")}</h3>
        <div className="mt-1 truncate text-[13px] font-semibold text-foreground">{overviewWidgetTitle(widget, t)}</div>
      </div>

      <Field label={t("Component category")}>
        <SelectControl onChange={(value) => onChangeCategory(value as OverviewWidgetCategory)} options={translateOptions(overviewWidgetCategoryOptions(), t)} value={overviewWidgetCategory(widget.type)} />
      </Field>

      <Field label={t("Data")}>
        {category === "account-balance" ? (
          <OverviewAccountDataSelector
            options={dataOptions}
            value={accountProviderValues}
            onChange={onChangeAccountProviders}
          />
        ) : (
          <SelectControl onChange={changeData} options={translateOptions(dataOptions, t)} value={dataValue} />
        )}
      </Field>

      <Field label={t("Widget size")}>
        <SelectControl onChange={(value) => onChangeSize(value as OverviewWidgetSize)} options={translateOptions(sizeOptions, t)} value={widget.size} />
      </Field>

      <Field label={t("Style")}>
        <SelectControl onChange={(value) => onChangeVariant(value as OverviewWidgetVariant)} options={translateOptions(overviewWidgetVariantOptions(widget.type), t)} value={widget.variant} />
      </Field>

      <Button className="w-full justify-center" onClick={onRemove} size="sm" type="button" variant="outline">
        <Trash2 className="h-3.5 w-3.5" />
        {t("Remove widget")}
      </Button>
    </div>
  );
}

function OverviewAccountDataSelector({
  onChange,
  options,
  value
}: {
  onChange: (value: string[]) => void;
  options: Array<{ label: string; value: string }>;
  value: string[];
}) {
  const t = useAppText();
  const selected = new Set(value);
  const accountOptions = options.filter((option) => option.value);
  const allSelected = selected.size === 0;

  function toggleAccount(account: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) {
      next.add(account);
    } else {
      next.delete(account);
    }
    onChange([...next]);
  }

  return (
    <div className="overview-account-data-picker min-w-0 overflow-hidden rounded-md border border-border/70 bg-card/50 p-1.5">
      <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors hover:bg-muted/50">
        <Checkbox checked={allSelected} onCheckedChange={(checked) => checked ? onChange([]) : undefined} />
        <span className="min-w-0 flex-1 truncate">{t("All accounts")}</span>
      </label>
      <div className="mt-1 max-h-44 space-y-0.5 overflow-y-auto pr-1">
        {accountOptions.map((option) => (
          <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-muted/50" key={option.value}>
            <Checkbox
              checked={selected.has(option.value)}
              onCheckedChange={(checked) => toggleAccount(option.value, checked)}
            />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SortableOverviewWidget({
  children,
  editing,
  onSelect,
  widget
}: {
  children: ReactNode;
  editing: boolean;
  onSelect: () => void;
  widget: OverviewWidgetConfig;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition
  } = useSortable({
    disabled: !editing,
    id: widget.id
  });
  const { onKeyDown, onPointerDown, ...dragListeners } = listeners ?? {};

  return (
    <motion.div
      className={cn(
        "min-h-0 min-w-0",
        overviewWidgetSizeClass(widget.size),
        editing && "cursor-grab touch-none",
        isDragging && "relative z-20 cursor-grabbing opacity-70"
      )}
      data-overview-widget-id={widget.id}
      layout
      onFocus={editing ? onSelect : undefined}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
      {...attributes}
      {...dragListeners}
      onKeyDown={(event) => {
        if (overviewWidgetSortShouldIgnoreTarget(event.target)) {
          return;
        }
        onKeyDown?.(event);
      }}
      onPointerDown={(event) => {
        if (overviewWidgetSortShouldIgnoreTarget(event.target)) {
          return;
        }
        onPointerDown?.(event);
      }}
    >
      {children}
    </motion.div>
  );
}

function overviewWidgetSortShouldIgnoreTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-overview-widget-drag-lock='true']"));
}

function OverviewWidgetDragOverlay({
  providerAccounts,
  providerAccountRefreshing = false,
  providers,
  refreshProviderAccounts,
  usageRange,
  usageStats,
  widget
}: {
  providerAccounts: ProviderAccountSnapshot[];
  providerAccountRefreshing?: boolean;
  providers: GatewayProviderConfig[];
  refreshProviderAccounts?: () => void | Promise<void>;
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
  widget: OverviewWidgetConfig;
}) {
  return (
    <div className={cn("pointer-events-none overflow-hidden opacity-95 shadow-2xl", overviewWidgetOverlaySizeClass(widget.size))}>
      <OverviewWidgetRenderer
        providerAccounts={providerAccounts}
        providerAccountRefreshing={providerAccountRefreshing}
        providers={providers}
        refreshProviderAccounts={refreshProviderAccounts}
        usageRange={usageRange}
        usageStats={usageStats}
        widget={widget}
      />
    </div>
  );
}

function OverviewWidgetFrame({
  children,
  editing,
  selected,
  widget,
  onResize,
  onSelect
}: {
  children: ReactNode;
  editing: boolean;
  selected: boolean;
  widget: OverviewWidgetConfig;
  onResize: (size: OverviewWidgetSize) => void;
  onSelect: () => void;
}) {
  const t = useAppText();
  const frameRef = useRef<HTMLDivElement>(null);
  const selectFrame = () => {
    if (!editing) {
      return;
    }
    onSelect();
  };

  function startResize(axis: OverviewWidgetResizeAxis, event: ReactPointerEvent<HTMLButtonElement>) {
    const grid = frameRef.current?.closest<HTMLElement>("[data-overview-widget-grid]");
    const metrics = readOverviewWidgetGridMetrics(grid);
    if (!editing || !metrics) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const start = overviewWidgetDimensions(widget.size);
    const maxWidth = Math.min(4, Math.max(start.width, metrics.columns)) as 1 | 2 | 3 | 4;
    const startX = event.clientX;
    const startY = event.clientY;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    let currentSize = widget.size;
    document.body.style.cursor = overviewWidgetResizeCursor(axis);
    document.body.style.userSelect = "none";

    const update = (pointerEvent: PointerEvent) => {
      const widthDelta = axis === "height" ? 0 : Math.round((pointerEvent.clientX - startX) / metrics.columnStep);
      const heightDelta = axis === "width" ? 0 : Math.round((pointerEvent.clientY - startY) / metrics.rowStep);
      const nextWidth = clampOverviewWidgetDimension(start.width + widthDelta, 1, maxWidth);
      const nextHeight = clampOverviewWidgetDimension(start.height + heightDelta, 1, 4);
      const nextSize = overviewWidgetSize(nextWidth, nextHeight);
      if (nextSize === currentSize) {
        return;
      }
      currentSize = nextSize;
      onResize(nextSize);
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
    <div
      aria-selected={editing ? selected : undefined}
      className={cn(
        "overview-widget-frame group/overview-widget relative h-full min-h-0 min-w-0 transition-opacity",
        editing && "is-editing",
        selected && "is-selected"
      )}
      role={editing ? "group" : undefined}
      onFocus={editing ? onSelect : undefined}
      onPointerDownCapture={selectFrame}
      ref={frameRef}
    >
      {children}
      {editing ? (
        <>
          <span
            aria-hidden="true"
            className={cn("overview-widget-drag-handle", selected && "is-selected")}
          >
            <GripHorizontal className="h-3.5 w-3.5" />
          </span>
          <OverviewWidgetResizeHandle
            axis="width"
            label={t("Resize widget width")}
            selected={selected}
            onPointerDown={(event) => startResize("width", event)}
          />
          <OverviewWidgetResizeHandle
            axis="height"
            label={t("Resize widget height")}
            selected={selected}
            onPointerDown={(event) => startResize("height", event)}
          />
          <OverviewWidgetResizeHandle
            axis="both"
            label={t("Resize widget size")}
            selected={selected}
            onPointerDown={(event) => startResize("both", event)}
          />
        </>
      ) : null}
    </div>
  );
}

type OverviewWidgetResizeAxis = "both" | "height" | "width";

type OverviewWidgetGridMetrics = {
  columns: 1 | 2 | 3 | 4;
  columnStep: number;
  rowStep: number;
};

function OverviewWidgetResizeHandle({
  axis,
  label,
  selected,
  onPointerDown
}: {
  axis: OverviewWidgetResizeAxis;
  label: string;
  selected: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  if (axis === "width") {
    return (
      <button
        aria-label={label}
        className="absolute -right-2 bottom-7 top-3 z-30 w-4 touch-none cursor-ew-resize rounded-full bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
        onPointerDown={onPointerDown}
        title={label}
        type="button"
      >
        <span aria-hidden="true" className={cn("absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/65 opacity-0 transition-opacity group-hover/overview-widget:opacity-100", selected && "opacity-100")} />
      </button>
    );
  }

  if (axis === "height") {
    return (
      <button
        aria-label={label}
        className="absolute -bottom-2 left-3 right-7 z-30 h-4 touch-none cursor-ns-resize rounded-full bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
        onPointerDown={onPointerDown}
        title={label}
        type="button"
      >
        <span aria-hidden="true" className={cn("absolute left-1/2 top-1/2 h-1 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/65 opacity-0 transition-opacity group-hover/overview-widget:opacity-100", selected && "opacity-100")} />
      </button>
    );
  }

  return (
    <button
      aria-label={label}
      className={cn(
        "absolute -bottom-2 -right-2 z-40 h-5 w-5 touch-none cursor-nwse-resize rounded-[6px] border border-primary/70 bg-background p-0 opacity-0 shadow-sm outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/25 group-hover/overview-widget:opacity-100",
        selected && "opacity-100"
      )}
      onPointerDown={onPointerDown}
      title={label}
      type="button"
    >
      <span aria-hidden="true" className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-br-[3px] border-b-2 border-r-2 border-primary/70" />
    </button>
  );
}

function readOverviewWidgetGridMetrics(grid: HTMLElement | null | undefined): OverviewWidgetGridMetrics | undefined {
  if (!grid) {
    return undefined;
  }
  const gridRect = grid.getBoundingClientRect();
  if (gridRect.width <= 0) {
    return undefined;
  }
  const styles = window.getComputedStyle(grid);
  const columnTracks = styles.gridTemplateColumns
    .split(" ")
    .map((track) => track.trim())
    .filter((track) => track && track !== "none");
  const columnCount = Math.max(1, Math.min(4, columnTracks.length || 1)) as 1 | 2 | 3 | 4;
  const columnGap = parseFiniteCssPixels(styles.columnGap);
  const rowGap = parseFiniteCssPixels(styles.rowGap);
  const rowHeight = parseFiniteCssPixels(styles.gridAutoRows) || 148;
  const columnWidth = (gridRect.width - columnGap * (columnCount - 1)) / columnCount;
  return {
    columns: columnCount,
    columnStep: Math.max(1, columnWidth + columnGap),
    rowStep: Math.max(1, rowHeight + rowGap)
  };
}

function parseFiniteCssPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampOverviewWidgetDimension(value: number, min: 1 | 2 | 3 | 4, max: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
  const clamped = Math.max(min, Math.min(max, value));
  if (clamped >= 4) return 4;
  if (clamped >= 3) return 3;
  if (clamped >= 2) return 2;
  return 1;
}

function overviewWidgetSize(width: 1 | 2 | 3 | 4, height: 1 | 2 | 3 | 4): OverviewWidgetSize {
  return `${width}:${height}` as OverviewWidgetSize;
}

function overviewWidgetResizeCursor(axis: OverviewWidgetResizeAxis): string {
  if (axis === "width") {
    return "ew-resize";
  }
  if (axis === "height") {
    return "ns-resize";
  }
  return "nwse-resize";
}

function OverviewWidgetRenderer({
  editing,
  onChangeAccountCardOrder,
  onChangeAccountCardSize,
  providerAccounts,
  providerAccountRefreshing = false,
  providers,
  refreshProviderAccounts,
  usageRange,
  usageStats,
  widget
}: {
  editing?: boolean;
  onChangeAccountCardOrder?: (accountKeys: string[]) => void;
  onChangeAccountCardSize?: (accountKey: string, size: OverviewAccountCardSize) => void;
  providerAccounts: ProviderAccountSnapshot[];
  providerAccountRefreshing?: boolean;
  providers: GatewayProviderConfig[];
  refreshProviderAccounts?: () => void | Promise<void>;
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
  widget: OverviewWidgetConfig;
}) {
  const dimensions = overviewWidgetDimensions(widget.size);
  let content: ReactNode;
  if (widget.type === "system-status") {
    content = <SystemStatusBar usageRange={usageRange} usageStats={usageStats} variant={widget.variant === "compact" ? "compact" : "timeline"} />;
  } else if (widget.type === "account-balance") {
    content = <ProviderAccountsOverview accountCardOrder={widget.accountCardOrder} accountCardSizes={widget.accountCardSizes} accountProviders={overviewWidgetAccountProviderValues(widget)} accounts={providerAccounts} dimensions={dimensions} editing={editing} providers={providers} refreshing={providerAccountRefreshing} variant={overviewAccountVariant(widget.variant)} onChangeAccountCardOrder={onChangeAccountCardOrder} onChangeAccountCardSize={onChangeAccountCardSize} onRefresh={refreshProviderAccounts} />;
  } else if (widget.type === "metric") {
    content = <OverviewMetricWidget metric={widget.metric ?? "requests"} totals={usageStats.totals} variant={overviewMetricVariant(widget.variant)} />;
  } else if (widget.type === "usage-trend") {
    content = <UsageTrendWidget dimensions={dimensions} usageRange={usageRange} usageStats={usageStats} variant={overviewTrendVariant(widget.variant)} />;
  } else if (widget.type === "token-activity") {
    content = <TokenActivityOverviewWidget dimensions={dimensions} usageStats={usageStats} />;
  } else if (widget.type === "token-mix") {
    content = <TokenMixOverviewWidget dimensions={dimensions} totals={usageStats.totals} variant={overviewTokenMixVariant(widget.variant)} />;
  } else if (widget.type === "model-distribution") {
    content = <ModelDistributionOverviewWidget dimensions={dimensions} rows={usageStats.models} variant={overviewTokenMixVariant(widget.variant)} />;
  } else if (widget.type === "client-analysis") {
    content = <OverviewAnalysisWidget dimensions={dimensions} kind="client" rows={usageStats.clientModels} variant={widget.variant === "compact" ? "compact" : "table"} />;
  } else if (isShareOverviewWidgetType(widget.type)) {
    content = <ShareCardWidget providerAccounts={providerAccounts} type={widget.type} usageRange={usageRange} usageStats={usageStats} />;
  } else {
    content = <OverviewAnalysisWidget dimensions={dimensions} kind="provider" rows={usageStats.providerModels} variant={widget.variant === "compact" ? "compact" : "table"} />;
  }

  return <div className="h-full min-h-0 min-w-0 overflow-hidden">{content}</div>;
}

function OverviewMetricWidget({
  metric,
  totals,
  variant
}: {
  metric: OverviewMetricKind;
  totals: UsageTotals;
  variant: "bar" | "card" | "compact" | "ring";
}) {
  const t = useAppText();
  const item = overviewMetricDatum(metric, totals, t);
  const showsRatio = overviewMetricShowsRatio(metric);

  if (variant === "compact") {
    return (
      <Card className="overview-card overview-metric-card flex h-full min-h-0 min-w-0 flex-col" data-tone={item.tone}>
        <CardContent className="flex min-h-0 flex-1 items-center justify-between gap-3 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="overview-metric-dot" />
            <div className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">{item.label}</div>
          </div>
          <div className="shrink-0 text-[19px] font-semibold tracking-[-0.02em]">{item.value}</div>
        </CardContent>
      </Card>
    );
  }

  if (variant === "bar") {
    return (
      <Card className="overview-card overview-metric-card flex h-full min-h-0 min-w-0 flex-col" data-tone={item.tone}>
        <CardContent className="min-h-0 flex-1 p-3">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">{item.label}</div>
            <div className="shrink-0 text-[18px] font-semibold tracking-tight">{item.value}</div>
          </div>
          <div className="overview-metric-track mt-3">
            <div className="overview-metric-fill" style={{ width: `${Math.max(3, Math.round(item.ratio * 100))}%` }} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === "ring") {
    return (
      <Card className="overview-card overview-metric-card flex h-full min-h-0 min-w-0 flex-col" data-tone={item.tone}>
        <CardContent className="grid min-h-0 flex-1 grid-cols-[58px_minmax(0,1fr)] items-center gap-3 p-3">
          <OverviewRingMetric ratio={item.ratio} tone={item.tone} />
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-muted-foreground">{item.label}</div>
            <div className="truncate text-[18px] font-semibold tracking-tight">{item.value}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overview-card overview-metric-card flex h-full min-h-0 min-w-0 flex-col" data-tone={item.tone}>
      <CardContent className="relative flex min-h-0 flex-1 flex-col justify-between p-4">
        <div className="flex items-center justify-between gap-3">
          <span aria-hidden="true" className="overview-metric-dot" />
          {showsRatio ? (
            <span className="text-[10px] font-semibold text-muted-foreground">{Math.round(Math.max(0, Math.min(1, item.ratio)) * 100)}%</span>
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-muted-foreground">{item.label}</div>
          <div className="mt-0.5 truncate text-[24px] font-semibold tracking-[-0.035em] text-foreground">{item.value}</div>
        </div>
        {showsRatio ? (
          <div className="overview-metric-track">
            <div className="overview-metric-fill" style={{ width: `${Math.max(3, Math.round(item.ratio * 100))}%` }} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OverviewRingMetric({ ratio, tone }: { ratio: number; tone: MetricTone }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, ratio));

  return (
    <svg aria-hidden="true" className="h-[58px] w-[58px]" viewBox="0 0 48 48">
      <circle cx="24" cy="24" fill="none" r={radius} stroke="var(--muted)" strokeWidth="6" />
      <circle
        cx="24"
        cy="24"
        fill="none"
        r={radius}
        stroke={overviewMetricToneColor(tone)}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
        strokeWidth="6"
        transform="rotate(-90 24 24)"
      />
    </svg>
  );
}

function overviewMetricToneColor(tone: MetricTone): string {
  if (tone === "blue") return "#007aff";
  if (tone === "indigo") return "#5856d6";
  if (tone === "amber") return "#ff9f0a";
  if (tone === "rose") return "#ff3b30";
  if (tone === "slate") return "#8e8e93";
  return "#30b0c7";
}

function overviewMetricShowsRatio(metric: OverviewMetricKind): boolean {
  return metric === "cache-ratio" || metric === "success-rate" || metric === "errors" ||
    metric === "input-tokens" || metric === "output-tokens" || metric === "cache-tokens";
}

function UsageTrendWidget({
  dimensions,
  usageStats,
  variant
}: {
  dimensions: OverviewWidgetDimensions;
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
  variant: "area" | "bar" | "composed" | "line";
}) {
  const t = useAppText();
  const chartMargin = dimensions.height <= 1
    ? { bottom: 0, left: 0, right: 4, top: 8 }
    : { bottom: 4, left: 0, right: 8, top: 8 };
  const legendItems = variant === "composed"
    ? [
        { color: "#007aff", label: t("Total tokens") },
        { color: "#34c759", label: t("Requests") },
        { color: overviewCacheColor, label: t("Cache tokens") }
      ]
    : variant === "bar"
      ? [
          { color: "#007aff", label: t("Total tokens") },
          { color: "#34c759", label: t("Requests") }
        ]
      : [
          { color: "#007aff", label: t("Total tokens") },
          { color: overviewCacheColor, label: t("Cache tokens") }
        ];

  return (
    <Card className="overview-card flex h-full min-h-0 min-w-0 flex-col">
      <OverviewCardHeading icon={ChartNoAxesCombined} title={t("Usage Trend")} trailing={dimensions.width >= 2 ? <OverviewChartLegend items={legendItems} /> : null} />
      <CardContent className="min-h-0 flex-1">
        <ChartFrame fill>
          {({ height, width }) => (
            <ComposedChart data={usageStats.series} height={height} margin={chartMargin} width={width}>
              <CartesianGrid stroke="var(--overview-chart-grid)" strokeDasharray="2 5" vertical={false} />
              <XAxis axisLine={false} dataKey="label" hide={dimensions.height <= 1} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} />
              <YAxis axisLine={false} hide={dimensions.width <= 1} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={formatAxisNumber} tickLine={false} yAxisId="tokens" />
              <YAxis axisLine={false} hide orientation="right" yAxisId="requests" />
              <Tooltip content={<UsageTooltip />} portal={chartTooltipPortal()} />
              {variant === "composed" ? (
                <>
                  <Area dataKey="totalTokens" fill="#007aff" fillOpacity={0.12} name={t("Total tokens")} stroke="#007aff" strokeWidth={2.25} type="monotone" yAxisId="tokens" />
                  <Bar barSize={12} dataKey="requestCount" fill="#34c759" name={t("Requests")} radius={[4, 4, 0, 0]} yAxisId="requests">
                    <LabelList content={<RequestHealthBarLabel />} dataKey="requestCount" />
                  </Bar>
                  <Line dataKey="cacheTokens" dot={false} name={t("Cache tokens")} stroke={overviewCacheColor} strokeWidth={2} type="monotone" yAxisId="tokens" />
                </>
              ) : null}
              {variant === "area" ? (
                <>
                  <Area dataKey="totalTokens" fill="#007aff" fillOpacity={0.14} name={t("Total tokens")} stroke="#007aff" strokeWidth={2.25} type="monotone" yAxisId="tokens" />
                  <Area dataKey="cacheTokens" fill={overviewCacheColor} fillOpacity={0.12} name={t("Cache tokens")} stroke={overviewCacheColor} strokeWidth={2} type="monotone" yAxisId="tokens" />
                </>
              ) : null}
              {variant === "line" ? (
                <>
                  <Line dataKey="totalTokens" dot={false} name={t("Total tokens")} stroke="#007aff" strokeWidth={2.5} type="monotone" yAxisId="tokens" />
                  <Line dataKey="cacheTokens" dot={false} name={t("Cache tokens")} stroke={overviewCacheColor} strokeWidth={2} type="monotone" yAxisId="tokens" />
                </>
              ) : null}
              {variant === "bar" ? (
                <>
                  <Bar barSize={14} dataKey="totalTokens" fill="#007aff" name={t("Total tokens")} radius={[4, 4, 0, 0]} yAxisId="tokens" />
                  <Line dataKey="requestCount" dot={false} name={t("Requests")} stroke="#34c759" strokeWidth={2} type="monotone" yAxisId="requests" />
                </>
              ) : null}
            </ComposedChart>
          )}
        </ChartFrame>
      </CardContent>
    </Card>
  );
}

function TokenActivityOverviewWidget({
  dimensions,
  usageStats
}: {
  dimensions: OverviewWidgetDimensions;
  usageStats: UsageStatsSnapshot;
}) {
  const t = useAppText();
  const weekCount = overviewActivityWeekCount(dimensions);
  const activity = buildTokenActivity(usageStats.series, {
    maxWeeks: weekCount,
    minWeeks: weekCount
  });
  const showSummary = dimensions.height >= 2;
  const showLegend = dimensions.height >= 2 && dimensions.width >= 2;

  return (
    <Card className="overview-card flex h-full min-h-0 min-w-0 flex-col">
      <OverviewCardHeading icon={CalendarDays} title={t("Activity")} tone="green" trailing={<Badge variant="outline">{t("Tokens")}</Badge>} />
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-visible p-3">
        {showSummary ? (
          <div className={cn("overview-nested-surface mb-3 grid overflow-hidden border", dimensions.width >= 2 ? "grid-cols-4" : "grid-cols-2")}>
            <OverviewActivityStat label={t("Longest streak")} value={formatCompactNumber(activity.longestStreak)} unit={t(activity.longestStreak === 1 ? "day" : "days")} />
            <OverviewActivityStat label={t("Avg / day")} value={formatCompactNumber(Math.round(activity.avgPerDay))} />
            <OverviewActivityStat label={t("Avg / week")} value={formatCompactNumber(Math.round(activity.avgPerWeek))} />
            <OverviewActivityStat label={t("Total")} value={formatCompactNumber(activity.totalTokens)} />
          </div>
        ) : null}

        <OverviewActivityGrid activity={activity} dimensions={dimensions} />

        {showLegend ? (
          <div className="mt-2 flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span>{t("Less")}</span>
            {[0, 1, 2, 3, 4].map((intensity) => (
              <span
                aria-hidden="true"
                className="overview-activity-cell h-3 w-3 rounded-[3px]"
                key={intensity}
                style={{ backgroundColor: overviewActivityColor(intensity as TokenActivityCell["intensity"], true) }}
              />
            ))}
            <span>{t("More")}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function overviewActivityWeekCount(dimensions: OverviewWidgetDimensions): number {
  if (dimensions.height <= 1) {
    if (dimensions.width >= 4) return 72;
    if (dimensions.width >= 3) return 56;
    if (dimensions.width >= 2) return 42;
    return 28;
  }
  if (dimensions.width >= 4) return 53;
  if (dimensions.width >= 3) return 40;
  if (dimensions.width >= 2) return 26;
  return 18;
}

function OverviewActivityStat({
  label,
  unit,
  value
}: {
  label: string;
  unit?: string;
  value: string;
}) {
  return (
    <div className="overview-activity-stat min-w-0 border-r border-border/60 bg-transparent px-3 py-2 last:border-r-0">
      <div className="truncate text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex min-w-0 items-baseline gap-1">
        <span className="truncate text-[17px] font-semibold tracking-tight text-foreground">{value}</span>
        {unit ? <span className="shrink-0 text-[11px] text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  );
}

function OverviewActivityGrid({
  activity,
  dimensions
}: {
  activity: ReturnType<typeof buildTokenActivity>;
  dimensions: OverviewWidgetDimensions;
}) {
  const t = useAppText();
  const showDayLabels = dimensions.width >= 2;
  const showMonthLabels = dimensions.height >= 2;
  const dayLabels = [t("M"), "", t("W"), "", t("F"), "", ""];
  const cellGap = dimensions.height <= 1 ? 2 : dimensions.width >= 3 ? 4 : 3;
  const labelColumnWidth = showDayLabels ? 20 : 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-w-0 overflow-visible">
        <div className="w-full">
          {showMonthLabels ? (
            <div
              className="mb-1 grid text-[10px] font-medium text-muted-foreground"
              style={{
                columnGap: `${cellGap}px`,
                gridTemplateColumns: `repeat(${activity.weekCount}, minmax(0, 1fr))`,
                marginLeft: `${labelColumnWidth ? labelColumnWidth + cellGap : 0}px`
              }}
            >
              {activity.months.map((month) => (
                <span
                  className="truncate"
                  key={`${month.label}-${month.weekIndex}`}
                  style={{ gridColumn: `${month.weekIndex + 1} / span ${Math.min(4, activity.weekCount - month.weekIndex)}` }}
                >
                  {month.label}
                </span>
              ))}
            </div>
          ) : null}
          <div
            className="grid min-h-[64px]"
            role="img"
            aria-label={`${t("Activity")} ${t("Tokens")}`}
            style={{
              gap: `${cellGap}px`,
              gridTemplateColumns: `${showDayLabels ? `${labelColumnWidth}px ` : ""}repeat(${activity.weekCount}, minmax(0, 1fr))`,
              gridTemplateRows: "repeat(7, auto)"
            }}
          >
            {showDayLabels ? dayLabels.map((label, index) => (
              <span
                className="self-center truncate text-[10px] font-medium leading-none text-muted-foreground"
                key={`${label}-${index}`}
                style={{ gridColumn: 1, gridRow: index + 1 }}
              >
                {label}
              </span>
            )) : null}
            {activity.cells.map((cell) => (
              <UiTooltip
                aria-label={`${cell.dateLabel}: ${formatActivityTokenCount(cell.totalTokens)} ${t("tokens")}`}
                align={cell.weekIndex <= 1 ? "start" : cell.weekIndex >= activity.weekCount - 2 ? "end" : "center"}
                className="overview-activity-cell aspect-square w-full rounded-[4px]"
                content={(
                  <>
                    <span className="block font-semibold">{cell.dateLabel}</span>
                    <span className="mt-0.5 block text-muted-foreground">{formatActivityTokenCount(cell.totalTokens)} {t("tokens")}</span>
                  </>
                )}
                contentClassName="min-w-[112px] border-border/70 px-2 py-1.5 text-left text-[11px] font-normal"
                key={cell.dateKey}
                side={cell.dayIndex <= 1 ? "bottom" : "top"}
                style={{
                  backgroundColor: overviewActivityColor(cell.intensity, cell.inObservedRange),
                  gridColumn: cell.weekIndex + (showDayLabels ? 2 : 1),
                  gridRow: cell.dayIndex + 1
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatActivityTokenCount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(Math.max(0, value)));
}

function overviewActivityColor(intensity: TokenActivityCell["intensity"], inRange: boolean): string {
  if (!inRange) return "rgba(0,122,255,.05)";
  if (intensity === 0) return "rgba(0,122,255,.12)";
  if (intensity === 1) return "rgba(0,122,255,.30)";
  if (intensity === 2) return "rgba(0,122,255,.50)";
  if (intensity === 3) return "rgba(0,122,255,.72)";
  return "rgba(0,122,255,.94)";
}

function TokenMixOverviewWidget({
  dimensions,
  totals,
  variant
}: {
  dimensions: OverviewWidgetDimensions;
  totals: UsageTotals;
  variant: "bars" | "donut" | "pie" | "stacked";
}) {
  const t = useAppText();
  const tokenMix = [
    { color: "#007aff", name: t("Input"), value: totals.inputTokens },
    { color: "#ff9f0a", name: t("Output"), value: totals.outputTokens },
    { color: overviewCacheColor, name: t("Cache"), value: totals.cacheTokens }
  ];
  const total = tokenMix.reduce((sum, item) => sum + item.value, 0);
  const showLegend = dimensions.height >= 2 && dimensions.width >= 2;
  const chartMargin = dimensions.height <= 1
    ? { bottom: 2, left: 0, right: 8, top: 2 }
    : { bottom: 8, left: 8, right: 12, top: 8 };

  return (
    <Card className="overview-card flex h-full min-h-0 min-w-0 flex-col">
      <OverviewCardHeading icon={ChartPie} title={t("Token Mix")} tone="purple" trailing={<Badge variant="outline">{formatCompactNumber(totals.totalTokens)}</Badge>} />
      <CardContent className="min-h-0 flex-1 overflow-hidden">
        {variant === "stacked" ? (
          <div className="space-y-3">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {tokenMix.map((item) => (
                <div key={item.name} style={{ backgroundColor: item.color, width: `${total > 0 ? Math.max(2, (item.value / total) * 100) : 100 / tokenMix.length}%` }} />
              ))}
            </div>
            {showLegend ? <OverviewTokenLegend rows={tokenMix} /> : null}
          </div>
        ) : null}
        {variant === "donut" || variant === "pie" ? (
          <div className={cn("grid h-full min-h-0 items-center gap-3", showLegend && "grid-cols-[minmax(96px,1fr)_minmax(0,1fr)]")}>
            <div className="relative h-full min-h-0">
              <ChartFrame fill>
                {({ height, width }) => (
                  <PieChart height={height} width={width}>
                    <Tooltip content={<TokenTooltip />} portal={chartTooltipPortal()} />
                    <Pie
                      cx="50%"
                      cy="50%"
                      data={tokenMix}
                      dataKey="value"
                      innerRadius={variant === "donut" ? Math.min(height, width) * 0.22 : 0}
                      nameKey="name"
                      outerRadius={Math.min(height, width) * 0.34}
                      paddingAngle={variant === "donut" ? 2 : 0}
                    >
                      {tokenMix.map((item) => (
                        <Cell fill={item.color} key={item.name} />
                      ))}
                    </Pie>
                  </PieChart>
                )}
              </ChartFrame>
              {variant === "donut" ? <OverviewDonutCenter label={t("Tokens")} value={formatCompactNumber(total)} /> : null}
            </div>
            {showLegend ? <OverviewTokenLegend rows={tokenMix} /> : null}
          </div>
        ) : null}
        {variant === "bars" ? (
          <ChartFrame fill>
            {({ height, width }) => (
              <BarChart data={tokenMix} height={height} layout="vertical" margin={chartMargin} width={width}>
                <CartesianGrid stroke="var(--overview-chart-grid)" strokeDasharray="2 5" horizontal={false} />
                <XAxis axisLine={false} hide={dimensions.height <= 1} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={formatAxisNumber} tickLine={false} type="number" />
                <YAxis axisLine={false} dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} type="category" width={dimensions.width <= 1 ? 42 : 52} />
                <Tooltip content={<TokenTooltip />} portal={chartTooltipPortal()} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {tokenMix.map((item) => (
                    <Cell fill={item.color} key={item.name} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ChartFrame>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ModelDistributionOverviewWidget({
  dimensions,
  rows,
  variant
}: {
  dimensions: OverviewWidgetDimensions;
  rows: UsageComparisonRow[];
  variant: "bars" | "donut" | "pie" | "stacked";
}) {
  const t = useAppText();
  const modelRows = overviewModelDistributionRows(rows, t);
  const total = modelRows.reduce((sum, item) => sum + item.value, 0);
  const showLegend = dimensions.height >= 2 && dimensions.width >= 2;
  const chartMargin = dimensions.height <= 1
    ? { bottom: 2, left: 0, right: 8, top: 2 }
    : { bottom: 8, left: 8, right: 12, top: 8 };

  return (
    <Card className="overview-card flex h-full min-h-0 min-w-0 flex-col">
      <OverviewCardHeading icon={Layers3} title={t("Model Distribution")} tone="orange" trailing={<Badge variant="outline">{formatCompactNumber(total)}</Badge>} />
      <CardContent className="min-h-0 flex-1 overflow-hidden">
        {modelRows.length === 0 ? (
          <OverviewEmptyState className="h-full py-4" compact label={t("No model activity")} />
        ) : variant === "stacked" ? (
          <div className="space-y-3">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {modelRows.map((item) => (
                <div key={item.name} style={{ backgroundColor: item.color, width: `${total > 0 ? Math.max(2, (item.value / total) * 100) : 100 / modelRows.length}%` }} />
              ))}
            </div>
            {showLegend ? <OverviewTokenLegend rows={modelRows} /> : null}
          </div>
        ) : variant === "donut" || variant === "pie" ? (
          <div className={cn("grid h-full min-h-0 items-center gap-3", showLegend && "grid-cols-[minmax(96px,1fr)_minmax(0,1fr)]")}>
            <div className="relative h-full min-h-0">
              <ChartFrame fill>
                {({ height, width }) => (
                  <PieChart height={height} width={width}>
                    <Tooltip content={<TokenTooltip />} portal={chartTooltipPortal()} />
                    <Pie
                      cx="50%"
                      cy="50%"
                      data={modelRows}
                      dataKey="value"
                      innerRadius={variant === "donut" ? Math.min(height, width) * 0.22 : 0}
                      nameKey="name"
                      outerRadius={Math.min(height, width) * 0.34}
                      paddingAngle={variant === "donut" ? 2 : 0}
                    >
                      {modelRows.map((item) => (
                        <Cell fill={item.color} key={item.name} />
                      ))}
                    </Pie>
                  </PieChart>
                )}
              </ChartFrame>
              {variant === "donut" ? <OverviewDonutCenter label={t("Tokens")} value={formatCompactNumber(total)} /> : null}
            </div>
            {showLegend ? <OverviewTokenLegend rows={modelRows} /> : null}
          </div>
        ) : (
          <ChartFrame fill>
            {({ height, width }) => (
              <BarChart data={modelRows} height={height} layout="vertical" margin={chartMargin} width={width}>
              <CartesianGrid stroke="var(--overview-chart-grid)" strokeDasharray="2 5" horizontal={false} />
                <XAxis axisLine={false} hide={dimensions.height <= 1} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={formatAxisNumber} tickLine={false} type="number" />
                <YAxis axisLine={false} dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} type="category" width={dimensions.width <= 1 ? 58 : 88} />
                <Tooltip content={<TokenTooltip />} portal={chartTooltipPortal()} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {modelRows.map((item) => (
                    <Cell fill={item.color} key={item.name} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ChartFrame>
        )}
      </CardContent>
    </Card>
  );
}

function overviewModelDistributionRows(rows: UsageComparisonRow[], translate: (value: string) => string): Array<{ color: string; name: string; value: number }> {
  const colors = ["#007aff", "#34c759", "#ff9f0a", "#ff3b30", "#af52de", "#8e8e93"];
  const positiveRows = rows
    .filter((row) => row.totalTokens > 0)
    .sort((a, b) => b.totalTokens - a.totalTokens);
  const topRows = positiveRows.slice(0, 5).map((row, index) => ({
    color: colors[index] ?? "#64748b",
    name: row.label,
    value: row.totalTokens
  }));
  const otherValue = positiveRows.slice(5).reduce((sum, row) => sum + row.totalTokens, 0);
  if (otherValue > 0) {
    topRows.push({
      color: colors[5],
      name: translate("Other"),
      value: otherValue
    });
  }
  return topRows;
}

function OverviewTokenLegend({ rows }: { rows: Array<{ color: string; name: string; value: number }> }) {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {rows.map((row) => (
        <div className="overview-legend-row flex min-w-0 items-center gap-2 rounded-[8px] px-2 py-1.5 text-[11px]" key={row.name}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.name}</span>
          <span className="shrink-0 font-semibold">{formatCompactNumber(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

function OverviewAnalysisWidget({
  dimensions,
  kind,
  rows,
  variant
}: {
  dimensions: OverviewWidgetDimensions;
  kind: "client" | "provider";
  rows: UsageComparisonRow[];
  variant: "compact" | "table";
}) {
  const t = useAppText();
  const title = kind === "client" ? t("Client Analysis") : t("Provider Analysis");
  const emptyLabel = kind === "client" ? t("No client usage yet") : t("No provider usage yet");
  const columns: UsageAnalysisColumn[] = kind === "client"
    ? [
      { key: "client", label: t("Client") },
      { key: "model", label: t("Model") },
      { key: "provider", label: t("Provider") }
    ]
    : [
      { key: "provider", label: t("Provider") },
      { key: "credentialId", label: t("Credential") },
      { key: "model", label: t("Model") }
    ];

  const rowLimit = overviewAnalysisRowLimit(dimensions);
  const shouldUseCompact = variant === "compact" || dimensions.width <= 2 || dimensions.height <= 1;

  if (shouldUseCompact) {
    return (
      <Card className="overview-card flex h-full min-h-0 min-w-0 flex-col">
        <OverviewCardHeading icon={UsersRound} title={title} tone="slate" trailing={<Badge variant="outline">{rows.length}</Badge>} />
        <CardContent className="min-h-0 flex-1 overflow-hidden">
          {rows.length === 0 ? (
            <OverviewEmptyState compact label={emptyLabel} />
          ) : (
            <div className="space-y-2">
              {rows.slice(0, rowLimit).map((row) => (
                <div className="overview-nested-surface flex min-w-0 items-center justify-between gap-3 border px-3 py-2" key={row.key}>
                  <span className="min-w-0 truncate text-[12px] font-medium">{row.label}</span>
                  <span className="shrink-0 text-[12px] font-semibold">{formatCompactNumber(row.totalTokens)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return <UsageAnalysisCard columns={columns} dimensions={dimensions} emptyLabel={emptyLabel} rows={rows} title={title} />;
}

function overviewAnalysisRowLimit(dimensions: OverviewWidgetDimensions): number {
  if (dimensions.height <= 1) return 2;
  if (dimensions.height === 2) return 5;
  if (dimensions.height === 3) return 8;
  return 12;
}

function overviewWidgetTemplates(): OverviewWidgetConfig[] {
  return [
    { enabled: true, id: "system-status", size: "4:1", type: "system-status", variant: "timeline" },
    { enabled: true, id: "account-balance", size: "4:2", type: "account-balance", variant: "cards" },
    { enabled: true, id: "metric-requests", metric: "requests", size: "1:1", type: "metric", variant: "card" },
    { enabled: true, id: "usage-trend", size: "3:2", type: "usage-trend", variant: "composed" },
    { enabled: true, id: "token-activity", size: "4:2", type: "token-activity", variant: "heatmap" },
    { enabled: true, id: "token-mix", size: "1:2", type: "token-mix", variant: "bars" },
    { enabled: true, id: "client-analysis", size: "2:2", type: "client-analysis", variant: "table" },
    { enabled: true, id: "share-usage-wrapped", size: "1:4", type: "share-usage-wrapped", variant: "card" },
    { enabled: true, id: "share-route-map", size: "1:4", type: "share-route-map", variant: "card" },
    { enabled: true, id: "share-model-leaderboard", size: "1:4", type: "share-model-leaderboard", variant: "card" },
    { enabled: true, id: "share-fuel-cockpit", size: "1:4", type: "share-fuel-cockpit", variant: "card" },
    { enabled: true, id: "share-token-calendar", size: "1:4", type: "share-token-calendar", variant: "card" },
    { enabled: true, id: "share-spend-receipt", size: "1:4", type: "share-spend-receipt", variant: "card" }
  ];
}

type ShareOverviewWidgetType = Extract<OverviewWidgetType, "share-fuel-cockpit" | "share-model-leaderboard" | "share-route-map" | "share-spend-receipt" | "share-token-calendar" | "share-usage-wrapped">;

type OverviewWidgetCategory = "account-balance" | "activity" | "analysis" | "breakdown" | "metric" | "share-card" | "system-status" | "usage-trend";

function overviewWidgetCategoryOptions(): Array<{ label: string; value: OverviewWidgetCategory }> {
  return [
    "system-status",
    "account-balance",
    "metric",
    "usage-trend",
    "activity",
    "breakdown",
    "analysis",
    "share-card"
  ].map((category) => ({
    label: overviewWidgetCategoryLabel(category as OverviewWidgetCategory),
    value: category as OverviewWidgetCategory
  }));
}

function overviewAnalysisDataOptions(): Array<{ label: string; value: "client-analysis" | "provider-analysis" }> {
  return [
    { label: "Client Analysis", value: "client-analysis" },
    { label: "Provider Analysis", value: "provider-analysis" }
  ];
}

function overviewBreakdownDataOptions(): Array<{ label: string; value: "model-distribution" | "token-mix" }> {
  return [
    { label: "Token distribution", value: "token-mix" },
    { label: "Model distribution", value: "model-distribution" }
  ];
}

function overviewShareCardDataOptions(): Array<{ label: string; value: ShareOverviewWidgetType }> {
  return [
    { label: "AI Usage Wrapped", value: "share-usage-wrapped" },
    { label: "CCR Route Map", value: "share-route-map" },
    { label: "Model Leaderboard", value: "share-model-leaderboard" },
    { label: "AI Fuel Cockpit", value: "share-fuel-cockpit" },
    { label: "Token Calendar Poster", value: "share-token-calendar" },
    { label: "Spend Receipt", value: "share-spend-receipt" }
  ];
}

function overviewWidgetDataOptions(widget: OverviewWidgetConfig, providerAccounts: ProviderAccountSnapshot[]): Array<{ label: string; value: string }> {
  const category = overviewWidgetCategory(widget.type);
  if (category === "metric") {
    return overviewMetricOptions;
  }
  if (category === "analysis") {
    return overviewAnalysisDataOptions();
  }
  if (category === "account-balance") {
    const selectedValues = overviewWidgetAccountProviderValues(widget);
    const options = providerAccounts
      .filter((account) => account.provider)
      .sort(compareProviderAccountSnapshots)
      .map((account) => ({ label: providerAccountSnapshotLabel(account), value: providerAccountSnapshotKey(account) }));
    for (const accountProvider of selectedValues) {
      if (!options.some((option) => option.value === accountProvider)) {
        options.push({ label: accountProvider, value: accountProvider });
      }
    }
    return [{ label: "All accounts", value: "" }, ...options];
  }
  if (category === "system-status") {
    return [{ label: "System status", value: "system-status" }];
  }
  if (category === "activity") {
    return [{ label: "Token activity", value: "token-activity" }];
  }
  if (category === "breakdown") {
    return overviewBreakdownDataOptions();
  }
  if (category === "share-card") {
    return overviewShareCardDataOptions();
  }
  return [{ label: "Usage over time", value: "usage-trend" }];
}

function overviewWidgetDataValue(widget: OverviewWidgetConfig): string {
  const category = overviewWidgetCategory(widget.type);
  if (category === "metric") {
    return widget.metric ?? "requests";
  }
  if (category === "analysis") {
    return widget.type;
  }
  if (category === "breakdown") {
    return widget.type;
  }
  if (category === "account-balance") {
    return overviewWidgetAccountProviderValues(widget)[0] ?? "";
  }
  if (category === "activity") {
    return "token-activity";
  }
  if (category === "share-card") {
    return widget.type;
  }
  return category;
}

function overviewWidgetAccountProviderValues(widget: OverviewWidgetConfig): string[] {
  return uniqueOverviewStrings([
    ...(widget.accountProviders ?? []),
    ...(widget.accountProvider ? [widget.accountProvider] : [])
  ]);
}

function uniqueOverviewStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = value.trim();
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result;
}

function overviewWidgetCategory(type: OverviewWidgetType): OverviewWidgetCategory {
  if (type === "client-analysis" || type === "provider-analysis") {
    return "analysis";
  }
  if (type === "model-distribution" || type === "token-mix") {
    return "breakdown";
  }
  if (type === "token-activity") {
    return "activity";
  }
  if (isShareOverviewWidgetType(type)) {
    return "share-card";
  }
  return type;
}

function overviewWidgetTypeForCategory(category: OverviewWidgetCategory, currentType: OverviewWidgetType): OverviewWidgetType {
  if (category === "analysis") {
    return currentType === "provider-analysis" ? "provider-analysis" : "client-analysis";
  }
  if (category === "breakdown") {
    return currentType === "model-distribution" ? "model-distribution" : "token-mix";
  }
  if (category === "activity") {
    return "token-activity";
  }
  if (category === "share-card") {
    return isShareOverviewWidgetType(currentType) ? currentType : "share-usage-wrapped";
  }
  return category;
}

function overviewWidgetTemplateKey(widget: OverviewWidgetConfig): string {
  if (isShareOverviewWidgetType(widget.type)) {
    return widget.type;
  }
  return overviewWidgetCategory(widget.type);
}

function overviewWidgetCategoryLabel(category: OverviewWidgetCategory): string {
  if (category === "account-balance") return "Account component";
  if (category === "analysis") return "Analysis component";
  if (category === "activity") return "Activity component";
  if (category === "metric") return "Metric component";
  if (category === "share-card") return "Share card";
  if (category === "system-status") return "Status component";
  if (category === "breakdown") return "Breakdown component";
  return "Trend component";
}

function overviewWidgetCategoryDescription(category: OverviewWidgetCategory): string {
  if (category === "account-balance") return "Account Balance";
  if (category === "analysis") return "Client or provider";
  if (category === "activity") return "Token activity heatmap";
  if (category === "metric") return "Requests, tokens, cost";
  if (category === "share-card") return "Social media PNG cards";
  if (category === "system-status") return "Status timeline";
  if (category === "breakdown") return "Token or model distribution";
  return "Usage over time";
}

function overviewWidgetPaletteTitle(widget: OverviewWidgetConfig): string {
  return isShareOverviewWidgetType(widget.type)
    ? overviewWidgetTypeLabel(widget.type)
    : overviewWidgetCategoryLabel(overviewWidgetCategory(widget.type));
}

function overviewWidgetPaletteDescription(widget: OverviewWidgetConfig): string {
  return isShareOverviewWidgetType(widget.type)
    ? overviewWidgetCategoryLabel("share-card")
    : overviewWidgetCategoryDescription(overviewWidgetCategory(widget.type));
}

function overviewWidgetTitle(widget: OverviewWidgetConfig, translate: (value: string) => string): string {
  if (widget.type === "metric") {
    return translate(overviewMetricLabel(widget.metric ?? "requests"));
  }
  return translate(overviewWidgetTypeLabel(widget.type));
}

function overviewWidgetTypeLabel(type: OverviewWidgetType): string {
  if (type === "account-balance") return "Account Balance";
  if (type === "client-analysis") return "Client Analysis";
  if (type === "metric") return "Metric";
  if (type === "model-distribution") return "Model Distribution";
  if (type === "provider-analysis") return "Provider Analysis";
  if (type === "share-fuel-cockpit") return "AI Fuel Cockpit";
  if (type === "share-model-leaderboard") return "Model Leaderboard";
  if (type === "share-route-map") return "CCR Route Map";
  if (type === "share-spend-receipt") return "Spend Receipt";
  if (type === "share-token-calendar") return "Token Calendar Poster";
  if (type === "share-usage-wrapped") return "AI Usage Wrapped";
  if (type === "system-status") return "System status";
  if (type === "token-activity") return "Activity";
  if (type === "token-mix") return "Token Mix";
  return "Usage Trend";
}

function overviewWidgetVariantOptions(type: OverviewWidgetType): Array<{ label: string; value: OverviewWidgetVariant }> {
  if (type === "account-balance") {
    return [
      { label: "Cards", value: "cards" },
      { label: "Compact", value: "compact" },
      { label: "Bars", value: "bars" },
      { label: "Ring", value: "ring" },
      { label: "Semicircle", value: "semicircle" },
      { label: "Arc", value: "arc" },
      { label: "Nested rings", value: "nested-rings" }
    ];
  }
  if (type === "metric") {
    return [
      { label: "Cards", value: "card" },
      { label: "Compact", value: "compact" },
      { label: "Bar", value: "bar" },
      { label: "Ring", value: "ring" }
    ];
  }
  if (type === "usage-trend") {
    return [
      { label: "Composed", value: "composed" },
      { label: "Area", value: "area" },
      { label: "Line", value: "line" },
      { label: "Bar", value: "bar" }
    ];
  }
  if (type === "token-activity") {
    return [
      { label: "Heatmap", value: "heatmap" }
    ];
  }
  if (type === "model-distribution" || type === "token-mix") {
    return [
      { label: "Bars", value: "bars" },
      { label: "Stacked", value: "stacked" },
      { label: "Donut", value: "donut" },
      { label: "Pie", value: "pie" }
    ];
  }
  if (type === "system-status") {
    return [
      { label: "Timeline", value: "timeline" },
      { label: "Compact", value: "compact" }
    ];
  }
  if (isShareOverviewWidgetType(type)) {
    return [
      { label: "Card", value: "card" }
    ];
  }
  return [
    { label: "Table", value: "table" },
    { label: "Compact", value: "compact" }
  ];
}

function isShareOverviewWidgetType(type: OverviewWidgetType): type is ShareOverviewWidgetType {
  return type === "share-fuel-cockpit" ||
    type === "share-model-leaderboard" ||
    type === "share-route-map" ||
    type === "share-spend-receipt" ||
    type === "share-token-calendar" ||
    type === "share-usage-wrapped";
}

function overviewWidgetSizeClass(size: OverviewWidgetSize): string {
  const { height, width } = overviewWidgetDimensions(size);
  return cn(overviewWidgetWidthClass(width), overviewWidgetHeightClass(height));
}

function overviewWidgetOverlaySizeClass(size: OverviewWidgetSize): string {
  const { height, width } = overviewWidgetDimensions(size);
  return cn(overviewWidgetOverlayWidthClass(width), overviewWidgetOverlayHeightClass(height));
}

type OverviewWidgetDimensions = { height: 1 | 2 | 3 | 4; width: 1 | 2 | 3 | 4 };

const overviewCacheColor = "#af52de";

function overviewWidgetDimensions(size: OverviewWidgetSize): OverviewWidgetDimensions {
  const [widthText, heightText] = size.split(":");
  const width = overviewWidgetDimensionValue(widthText);
  const height = overviewWidgetDimensionValue(heightText);
  return { height, width };
}

function overviewWidgetDimensionValue(value: string | undefined): 1 | 2 | 3 | 4 {
  if (value === "2") return 2;
  if (value === "3") return 3;
  if (value === "4") return 4;
  return 1;
}

function overviewWidgetWidthClass(width: 1 | 2 | 3 | 4): string {
  if (width === 1) return "col-span-1";
  if (width === 2) return "col-span-1 sm:col-span-2";
  if (width === 3) return "col-span-1 sm:col-span-2 xl:col-span-3";
  return "col-span-1 sm:col-span-2 xl:col-span-4";
}

function overviewWidgetHeightClass(height: 1 | 2 | 3 | 4): string {
  if (height === 1) return "row-span-1";
  if (height === 2) return "row-span-2";
  if (height === 3) return "row-span-3";
  return "row-span-4";
}

function overviewWidgetOverlayWidthClass(width: 1 | 2 | 3 | 4): string {
  if (width === 1) return "w-[min(260px,calc(100vw-2rem))]";
  if (width === 2) return "w-[min(536px,calc(100vw-2rem))]";
  if (width === 3) return "w-[min(812px,calc(100vw-2rem))]";
  return "w-[min(1088px,calc(100vw-2rem))]";
}

function overviewWidgetOverlayHeightClass(height: 1 | 2 | 3 | 4): string {
  if (height === 1) return "h-[148px]";
  if (height === 2) return "h-[312px]";
  if (height === 3) return "h-[476px]";
  return "h-[640px]";
}

function sameOverviewWidgetOrder(a: OverviewWidgetConfig[], b: OverviewWidgetConfig[]): boolean {
  return a.length === b.length && a.every((widget, index) => widget.id === b[index]?.id);
}

function uniqueOverviewWidgetId(widgets: OverviewWidgetConfig[], baseId: string): string {
  const ids = new Set(widgets.map((widget) => widget.id));
  if (!ids.has(baseId)) {
    return baseId;
  }
  let index = 2;
  while (ids.has(`${baseId}-${index}`)) {
    index += 1;
  }
  return `${baseId}-${index}`;
}

type OverviewAccountVariant = "arc" | "bars" | "cards" | "compact" | "nested-rings" | "ring" | "semicircle";

function overviewAccountVariant(value: OverviewWidgetVariant): OverviewAccountVariant {
  return value === "arc" || value === "bars" || value === "compact" || value === "nested-rings" || value === "ring" || value === "semicircle" ? value : "cards";
}

function overviewMetricVariant(value: OverviewWidgetVariant): "bar" | "card" | "compact" | "ring" {
  return value === "bar" || value === "compact" || value === "ring" ? value : "card";
}

function overviewTrendVariant(value: OverviewWidgetVariant): "area" | "bar" | "composed" | "line" {
  return value === "area" || value === "bar" || value === "line" ? value : "composed";
}

function overviewTokenMixVariant(value: OverviewWidgetVariant): "bars" | "donut" | "pie" | "stacked" {
  return value === "donut" || value === "pie" || value === "stacked" ? value : "bars";
}

function overviewMetricDatum(metric: OverviewMetricKind, totals: UsageTotals, translate: (value: string) => string): { label: string; ratio: number; tone: MetricTone; value: string } {
  if (metric === "total-tokens") {
    return { label: translate("Total tokens"), ratio: totals.totalTokens > 0 ? 1 : 0, tone: "teal", value: formatCompactNumber(totals.totalTokens) };
  }
  if (metric === "input-tokens") {
    return { label: translate("Input tokens"), ratio: totals.totalTokens > 0 ? totals.inputTokens / totals.totalTokens : 0, tone: "blue", value: formatCompactNumber(totals.inputTokens) };
  }
  if (metric === "output-tokens") {
    return { label: translate("Output tokens"), ratio: totals.totalTokens > 0 ? totals.outputTokens / totals.totalTokens : 0, tone: "amber", value: formatCompactNumber(totals.outputTokens) };
  }
  if (metric === "cache-tokens") {
    return { label: translate("Cache tokens"), ratio: totals.totalTokens > 0 ? totals.cacheTokens / totals.totalTokens : 0, tone: "indigo", value: formatCompactNumber(totals.cacheTokens) };
  }
  if (metric === "cache-ratio") {
    return { label: translate("Cache ratio"), ratio: totals.cacheRatio, tone: "indigo", value: formatPercent(totals.cacheRatio) };
  }
  if (metric === "estimated-cost") {
    return { label: translate("Estimated cost"), ratio: Math.min(1, Math.max(0, (totals.costUsd ?? 0) / 1)), tone: "slate", value: formatUsdCost(totals.costUsd) };
  }
  if (metric === "success-rate") {
    return { label: translate("Success rate"), ratio: totals.successRate, tone: "teal", value: formatPercent(totals.successRate) };
  }
  if (metric === "errors") {
    return { label: translate("Errors"), ratio: totals.requestCount > 0 ? totals.errorCount / totals.requestCount : 0, tone: "rose", value: formatCompactNumber(totals.errorCount) };
  }
  if (metric === "avg-latency") {
    return { label: translate("Average latency"), ratio: Math.min(1, Math.max(0, totals.avgDurationMs / 10_000)), tone: "amber", value: formatDuration(totals.avgDurationMs) };
  }
  return { label: translate("Requests"), ratio: totals.requestCount > 0 ? 1 : 0, tone: "teal", value: formatCompactNumber(totals.requestCount) };
}

function overviewMetricLabel(metric: OverviewMetricKind): string {
  return overviewMetricOptions.find((option) => option.value === metric)?.label ?? "Requests";
}

type SystemStatusTone = "error" | "idle" | "ok" | "warn";

type SystemStatusPoint = {
  dateLabel: string;
  point: UsageSeriesPoint;
  tone: SystemStatusTone;
};

type SystemStatusTooltipState = {
  arrowLeft: number;
  left: number;
  placement: "above" | "below";
  segment: SystemStatusPoint;
  top: number;
};

const systemStatusTooltipWidth = 190;
const systemStatusTooltipHeight = 104;
const systemStatusTooltipGap = 10;
const systemStatusTooltipViewportMargin = 12;

function resolveSystemStatusTooltipPosition(rect: DOMRect): Omit<SystemStatusTooltipState, "segment"> {
  const availableWidth = Math.max(0, window.innerWidth - systemStatusTooltipViewportMargin * 2);
  const width = Math.min(systemStatusTooltipWidth, availableWidth);
  const maxLeft = Math.max(systemStatusTooltipViewportMargin, window.innerWidth - width - systemStatusTooltipViewportMargin);
  const left = Math.min(
    Math.max(systemStatusTooltipViewportMargin, rect.left + rect.width / 2 - width / 2),
    maxLeft
  );
  const spaceAbove = rect.top - systemStatusTooltipViewportMargin - systemStatusTooltipGap;
  const spaceBelow = window.innerHeight - rect.bottom - systemStatusTooltipViewportMargin - systemStatusTooltipGap;
  const placement = spaceAbove >= systemStatusTooltipHeight || spaceAbove >= spaceBelow ? "above" : "below";
  const preferredTop = placement === "above"
    ? rect.top - systemStatusTooltipGap - systemStatusTooltipHeight
    : rect.bottom + systemStatusTooltipGap;
  const maxTop = Math.max(
    systemStatusTooltipViewportMargin,
    window.innerHeight - systemStatusTooltipHeight - systemStatusTooltipViewportMargin
  );
  const top = Math.min(Math.max(systemStatusTooltipViewportMargin, preferredTop), maxTop);
  const arrowLeft = Math.min(Math.max(12, rect.left + rect.width / 2 - left), Math.max(12, width - 12));

  return { arrowLeft, left, placement, top };
}

function SystemStatusBar({
  variant = "timeline",
  usageRange,
  usageStats
}: {
  variant?: "compact" | "timeline";
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
}) {
  const t = useAppText();
  const [statusTooltip, setStatusTooltip] = useState<SystemStatusTooltipState>();
  const segments = usageStats.series.map((point) => ({
    dateLabel: formatStatusBucketDate(point.bucket, usageRange),
    point,
    tone: usageStatusTone(point)
  }));
  const availability = usageStats.totals.requestCount > 0 ? usageStats.totals.successRate : 0;
  const overallTone = usageStatusTone(usageStats.totals);
  const StatusIcon = overallTone === "ok" ? Check : CircleAlert;
  const rangeLabel = formatSystemStatusRange(segments, usageRange);

  useEffect(() => {
    if (!statusTooltip) {
      return;
    }
    const dismiss = () => setStatusTooltip(undefined);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [statusTooltip]);

  const showStatusTooltip = (segment: SystemStatusPoint, target: HTMLElement) => {
    setStatusTooltip({ segment, ...resolveSystemStatusTooltipPosition(target.getBoundingClientRect()) });
  };

  if (variant === "compact") {
    return (
      <Card className="overview-card flex h-full min-h-0 min-w-0 flex-col">
        <CardContent className="flex min-h-0 min-w-0 flex-1 items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="overview-status-icon flex h-5 w-5 shrink-0 items-center justify-center rounded-full" data-tone={overallTone}>
              <StatusIcon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">{t("API Service")}</div>
              <div className="truncate text-[11px] text-muted-foreground">{rangeLabel}</div>
            </div>
          </div>
          <Badge variant={overallTone === "ok" ? "success" : overallTone === "warn" ? "warning" : overallTone === "error" ? "danger" : "outline"}>
            {formatPercent(availability)}
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overview-card flex h-full min-h-0 min-w-0 flex-col">
      <OverviewCardHeading
        icon={Server}
        title={t("System status")}
        tone={overallTone === "ok" ? "green" : overallTone === "warn" ? "orange" : overallTone === "error" ? "red" : "slate"}
        trailing={<span className="overview-date-pill block max-w-[320px] truncate">{rangeLabel}</span>}
      />
      <CardContent className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="space-y-2.5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="overview-status-icon flex h-4 w-4 shrink-0 items-center justify-center rounded-full" data-tone={overallTone}>
                <StatusIcon className="h-3 w-3" />
              </span>
              <span className="min-w-0 truncate text-[13px] font-semibold">{t("API Service")}</span>
            </div>
            <Badge variant={overallTone === "ok" ? "success" : overallTone === "warn" ? "warning" : overallTone === "error" ? "danger" : "outline"}>
              {formatPercent(availability)} {t("Availability")}
            </Badge>
          </div>

          <div className="flex min-w-0 gap-1" aria-label={t("System status")}>
            {segments.map((segment, index) => (
              <span
                aria-label={systemStatusPointTooltip(segment, t)}
                className="relative flex h-5 min-w-[3px] flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                key={`${segment.point.bucket}-${index}`}
                onBlur={() => setStatusTooltip(undefined)}
                onFocus={(event) => showStatusTooltip(segment, event.currentTarget)}
                onMouseEnter={(event) => showStatusTooltip(segment, event.currentTarget)}
                onMouseLeave={() => setStatusTooltip(undefined)}
                tabIndex={0}
              >
                <span
                  aria-label={systemStatusPointTooltip(segment, t)}
                  className="overview-status-segment h-full w-full rounded-[4px]"
                  data-tone={segment.tone}
                />
              </span>
            ))}
            {statusTooltip ? (
              <TooltipPortal
                className="w-[190px] max-w-[calc(100vw-24px)] px-3 py-2 text-left font-normal leading-4"
                style={{ left: statusTooltip.left, top: statusTooltip.top }}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute h-2 w-2 -translate-x-1/2 rotate-45 bg-popover",
                    statusTooltip.placement === "above"
                      ? "-bottom-1 border-b border-r border-border/70"
                      : "-top-1 border-l border-t border-border/70"
                  )}
                  style={{ left: statusTooltip.arrowLeft }}
                />
                <span className="block font-semibold">{statusTooltip.segment.dateLabel}</span>
                <span className="mt-1 flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("Requests")}</span>
                  <span className="font-medium">{formatCompactNumber(statusTooltip.segment.point.requestCount)}</span>
                </span>
                <span className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("Success rate")}</span>
                  <span className="font-medium">{formatPercent(statusTooltip.segment.point.successRate)}</span>
                </span>
                <span className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("Failed requests")}</span>
                  <span className="font-medium">{formatCompactNumber(statusTooltip.segment.point.errorCount)}</span>
                </span>
                <span className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("Duration")}</span>
                  <span className="font-medium">{formatDuration(statusTooltip.segment.point.avgDurationMs)}</span>
                </span>
              </TooltipPortal>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderAccountsOverview({
  accountCardOrder,
  accountCardSizes,
  accountProviders,
  accounts,
  dimensions,
  editing = false,
  onChangeAccountCardOrder,
  onChangeAccountCardSize,
  onRefresh,
  providers,
  refreshing = false,
  variant = "cards"
}: {
  accountCardOrder?: string[];
  accountCardSizes?: Record<string, OverviewAccountCardSize>;
  accountProviders?: string[];
  accounts: ProviderAccountSnapshot[];
  dimensions: OverviewWidgetDimensions;
  editing?: boolean;
  onChangeAccountCardOrder?: (accountKeys: string[]) => void;
  onChangeAccountCardSize?: (accountKey: string, size: OverviewAccountCardSize) => void;
  onRefresh?: () => void | Promise<void>;
  providers: GatewayProviderConfig[];
  refreshing?: boolean;
  variant?: OverviewAccountVariant;
}) {
  const t = useAppText();
  const selectedAccountProviders = new Set((accountProviders ?? []).map((provider) => provider.trim()).filter(Boolean));
  const sortedAccounts = accounts.map(providerAccountSnapshotForOverview).sort(compareProviderAccountSnapshots);
  const filteredAccounts = selectedAccountProviders.size > 0
    ? sortedAccounts.filter((account) => providerAccountSelectionMatches(account, selectedAccountProviders))
    : sortedAccounts
      .filter((account) => account.meters.length > 0 || account.status === "error");
  const visibleAccounts = providerAccountOrderAccounts(filteredAccounts, accountCardOrder);
  const isSingleAccount = visibleAccounts.length === 1;
  const showHeading = dimensions.height >= 2 && dimensions.width >= 2;
  const bentoLayout = !isSingleAccount && variant === "cards"
    ? providerAccountBentoLayout(visibleAccounts, dimensions, accountCardSizes)
    : undefined;
  const accountGridItems = bentoLayout?.items ?? visibleAccounts.map((account) => ({ account, span: undefined }));
  const accountCardSortSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  function finishAccountCardSort(event: DragEndEvent) {
    if (!onChangeAccountCardOrder) {
      return;
    }
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId || activeId === overId) {
      return;
    }
    const currentOrder = visibleAccounts.map(providerAccountSnapshotKey);
    const activeIndex = currentOrder.indexOf(activeId);
    const overIndex = currentOrder.indexOf(overId);
    if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
      return;
    }
    onChangeAccountCardOrder(arrayMove(currentOrder, activeIndex, overIndex));
  }

  return (
    <Card className="overview-card flex h-full min-h-0 min-w-0 flex-col">
      {showHeading ? (
        <OverviewCardHeading
          icon={WalletCards}
          title={t("Account Balance")}
          tone="green"
          trailing={<Badge variant="outline">{visibleAccounts.length}</Badge>}
        />
      ) : null}
      <CardContent className={cn("min-h-0 flex-1 overflow-hidden", providerAccountContentPaddingClass(dimensions))}>
        {visibleAccounts.length === 0 ? (
          <OverviewEmptyState className="h-full py-4" compact label={t("No account balance connectors configured")} />
        ) : isSingleAccount ? (
          <ProviderAccountSinglePanel account={visibleAccounts[0]} dimensions={dimensions} providers={providers} refreshing={refreshing} variant={variant} onRefresh={onRefresh} />
        ) : variant === "compact" ? (
          <div className={cn("grid h-full min-h-0 grid-cols-1 overflow-y-auto pr-1", providerAccountGapClass(dimensions), providerAccountGridClass(dimensions, visibleAccounts.length))}>
            {visibleAccounts.map((account) => {
              const meter = primaryProviderAccountDisplayMeter(account);
              return (
                <div className="overview-nested-surface flex min-h-0 min-w-0 items-center justify-between gap-3 overflow-hidden border px-3 py-2" key={providerAccountSnapshotKey(account)}>
                  <div className="flex min-w-0 items-center gap-2">
                    <ProviderAccountLogo account={account} className="h-7 w-7 rounded-md" providers={providers} />
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold">{providerAccountSnapshotLabel(account)}</div>
                      {providerAccountShowSource(dimensions) && meter ? <div className="truncate text-[11px] text-muted-foreground">{t(meter.label)}</div> : null}
                      {providerAccountShowRefreshTime(dimensions) ? <div className="truncate text-[11px] text-muted-foreground">{formatProviderAccountRefreshTime(account, t)}</div> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    {providerAccountShowRefresh(dimensions) ? <ProviderAccountRefreshButton account={account} refreshing={refreshing} onRefresh={onRefresh} /> : null}
                    {meter ? <div className="text-[12px] font-semibold">{formatProviderAccountMeterValue(meter)}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : variant === "bars" ? (
          <div className={cn("h-full min-h-0 overflow-y-auto pr-1", providerAccountStackClass(dimensions))}>
            {visibleAccounts.map((account) => {
              const meter = primaryProviderAccountDisplayMeter(account);
              const progress = meter && isProviderAccountQuotaMeter(meter) ? providerAccountMeterProgress(meter) : undefined;
              return (
                <div className="min-w-0 overflow-hidden" key={providerAccountSnapshotKey(account)}>
                  <div className="flex min-w-0 items-end justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <ProviderAccountLogo account={account} className="h-6 w-6 rounded-md" providers={providers} />
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold">{providerAccountSnapshotLabel(account)}</div>
                        {providerAccountShowSource(dimensions) && meter ? <div className="truncate text-[11px] text-muted-foreground">{t(meter.label)}</div> : null}
                        {providerAccountShowRefreshTime(dimensions) ? <div className="truncate text-[11px] text-muted-foreground">{formatProviderAccountRefreshTime(account, t)}</div> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[12px] font-semibold">
                      {meter ? <span>{formatProviderAccountMeterValue(meter)}</span> : null}
                      {providerAccountShowRefresh(dimensions) ? <ProviderAccountRefreshButton account={account} refreshing={refreshing} onRefresh={onRefresh} /> : null}
                    </div>
                  </div>
                  {progress !== undefined ? (
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", providerAccountProgressClass(account.status))} style={{ width: `${progress}%` }} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : variant === "cards" ? (
          <DndContext sensors={accountCardSortSensors} onDragEnd={finishAccountCardSort}>
            <SortableContext items={accountGridItems.map(({ account }) => providerAccountSnapshotKey(account))} strategy={rectSortingStrategy}>
              <div
                className={cn(
                  "grid h-full min-h-0 grid-flow-dense items-stretch overflow-hidden",
                  providerAccountBentoGridRowClass(),
                  providerAccountGapClass(dimensions),
                  providerAccountBentoGridClass(dimensions, visibleAccounts.length)
                )}
                data-provider-account-grid="true"
              >
                {accountGridItems.map(({ account, span }) => {
                  const accountKey = providerAccountSnapshotKey(account);
                  return (
                    <SortableProviderAccountCard account={account} disabled={!editing || !onChangeAccountCardOrder} key={accountKey} span={span}>
                      {(dragHandle) => (
                        <ProviderAccountSummaryCard account={account} bentoSpan={span} dimensions={dimensions} dragHandle={dragHandle} editing={editing} providers={providers} refreshing={refreshing} variant={variant} onChangeCardSize={onChangeAccountCardSize} onRefresh={onRefresh} />
                      )}
                    </SortableProviderAccountCard>
                  );
                })}
                {(bentoLayout?.hiddenCount ?? 0) > 0 ? (
                  <ProviderAccountBentoOverflowTile count={bentoLayout?.hiddenCount ?? 0} />
                ) : null}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div
            className={cn(
              "grid h-full min-h-0 auto-rows-max content-start grid-cols-1 overflow-y-auto pb-2 pr-2 [scrollbar-gutter:stable]",
              providerAccountGapClass(dimensions),
              providerAccountGridClass(dimensions, visibleAccounts.length)
            )}
            data-provider-account-grid="true"
          >
            {accountGridItems.map(({ account, span }) => {
              return <ProviderAccountSummaryCard account={account} bentoSpan={span} dimensions={dimensions} editing={editing} key={providerAccountSnapshotKey(account)} providers={providers} refreshing={refreshing} variant={variant} onChangeCardSize={onChangeAccountCardSize} onRefresh={onRefresh} />;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SortableProviderAccountCard({
  account,
  children,
  disabled,
  span
}: {
  account: ProviderAccountSnapshot;
  children: (dragHandle: ReactNode) => ReactNode;
  disabled: boolean;
  span?: ProviderAccountBentoSpan;
}) {
  const t = useAppText();
  const accountKey = providerAccountSnapshotKey(account);
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition
  } = useSortable({
    disabled,
    id: accountKey
  });
  const { onKeyDown, onPointerDown, ...dragListeners } = listeners ?? {};
  const dragHandle = disabled ? null : (
    <button
      {...attributes}
      {...dragListeners}
      aria-label={t("Move account card")}
      className="shrink-0 cursor-grab rounded-md p-1 text-muted-foreground/75 opacity-0 transition-[background-color,color,opacity] hover:bg-muted hover:text-foreground active:cursor-grabbing focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 group-hover/account-card:opacity-100"
      data-account-card-drag-handle="true"
      data-overview-widget-drag-lock="true"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        onKeyDown?.(event);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      ref={setActivatorNodeRef}
      title={t("Move account card")}
      type="button"
    >
      <GripHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div
      className={cn(
        "min-h-0 min-w-0",
        span ? providerAccountBentoSpanClass(span) : undefined,
        !disabled && "cursor-grab active:cursor-grabbing",
        isDragging && "relative z-30 opacity-70"
      )}
      data-provider-account-sortable-id={accountKey}
      data-overview-widget-drag-lock="true"
      onPointerDown={(event) => {
        event.stopPropagation();
        if (providerAccountCardSortShouldIgnoreTarget(event.target)) {
          return;
        }
        onPointerDown?.(event);
      }}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
    >
      {children(dragHandle)}
    </div>
  );
}

function providerAccountCardSortShouldIgnoreTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button,a,input,select,textarea,[contenteditable='true'],[data-account-card-resize-handle]"));
}

function ProviderAccountSinglePanel({
  account,
  dimensions,
  onRefresh,
  providers,
  refreshing = false,
  variant
}: {
  account: ProviderAccountSnapshot;
  dimensions: OverviewWidgetDimensions;
  onRefresh?: () => void | Promise<void>;
  providers: GatewayProviderConfig[];
  refreshing?: boolean;
  variant: OverviewAccountVariant;
}) {
  const t = useAppText();
  const quotaMeters = providerAccountQuotaMeters(account);
  const balanceMeter = primaryProviderAccountBalanceMeter(account);
  const meterLimit = providerAccountMeterLimitAvoidingOrphanExtra(
    account,
    providerAccountMeterLimit(dimensions, true, variant)
  );
  const meters = providerAccountMetersForDisplayOrdered(account, meterLimit);
  const showQuotaVisual = providerAccountUsesQuotaVisual(variant) && quotaMeters.length > 0;

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden", providerAccountStackClass(dimensions))}>
      <div className="flex min-w-0 shrink-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <ProviderAccountLogo account={account} className={cn("rounded-md", dimensions.height <= 1 ? "h-7 w-7" : "h-9 w-9")} providers={providers} />
          <div className="min-w-0">
            <div className={cn("truncate font-semibold", dimensions.height <= 1 ? "text-[12px]" : "text-[13px]")}>{providerAccountSnapshotLabel(account)}</div>
            {providerAccountShowRefreshTime(dimensions) ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{formatProviderAccountRefreshTime(account, t)}</div> : null}
          </div>
        </div>
        {providerAccountShowRefresh(dimensions) ? <ProviderAccountRefreshButton account={account} refreshing={refreshing} onRefresh={onRefresh} /> : null}
      </div>
      {showQuotaVisual ? (
        <ProviderAccountQuotaVisual account={account} dimensions={dimensions} meters={quotaMeters} variant={variant} />
      ) : quotaMeters.length === 0 && balanceMeter ? (
        <ProviderAccountBalanceMetric dimensions={dimensions} meter={balanceMeter} />
      ) : meters.length > 0 ? (
        <div className={cn("min-h-0 overflow-hidden", providerAccountStackClass(dimensions))}>
          {meters.map((meter) => (
            <ProviderAccountMeterLine account={account} dimensions={dimensions} key={meter.id} meter={meter} single onRefresh={onRefresh} />
          ))}
        </div>
      ) : (
        <div className="truncate text-[12px] text-muted-foreground">{account.message || account.errors?.[0]?.message || t("Unavailable")}</div>
      )}
    </div>
  );
}

function ProviderAccountSummaryCard({
  account,
  bentoSpan,
  dimensions,
  dragHandle,
  editing = false,
  onChangeCardSize,
  onRefresh,
  providers,
  refreshing = false,
  variant
}: {
  account: ProviderAccountSnapshot;
  bentoSpan?: ProviderAccountBentoSpan;
  dimensions: OverviewWidgetDimensions;
  dragHandle?: ReactNode;
  editing?: boolean;
  onChangeCardSize?: (accountKey: string, size: OverviewAccountCardSize) => void;
  onRefresh?: () => void | Promise<void>;
  providers: GatewayProviderConfig[];
  refreshing?: boolean;
  variant: OverviewAccountVariant;
}) {
  const t = useAppText();
  const quotaMeters = providerAccountQuotaMeters(account);
  const balanceMeter = primaryProviderAccountBalanceMeter(account);
  const showQuotaVisual = providerAccountUsesQuotaVisual(variant) && quotaMeters.length > 0;
  const primaryMeter = primaryProviderAccountDisplayMeter(account);
  const cardBentoSpan = bentoSpan ?? providerAccountBentoSpan(account, dimensions);
  const compactBento = cardBentoSpan.height === 1;
  const baseBentoSecondaryLimit = providerAccountBentoSecondaryLimit(dimensions, cardBentoSpan);
  const bentoSecondaryLimit = compactBento
    ? baseBentoSecondaryLimit
    : Math.max(baseBentoSecondaryLimit, providerAccountMeterLimitAvoidingOrphanExtra(account, 1 + baseBentoSecondaryLimit) - 1);
  const meterLimit = variant === "cards" && !compactBento
    ? Math.max(providerAccountMeterLimit(dimensions, false, variant), 1 + bentoSecondaryLimit)
    : providerAccountMeterLimit(dimensions, false, variant);
  const meters = providerAccountMetersForDisplayOrdered(account, meterLimit);
  const secondaryMeters = primaryMeter
    ? meters.filter((meter) => meter !== primaryMeter).slice(0, bentoSecondaryLimit)
    : [];
  const primaryProgress = primaryMeter && isProviderAccountQuotaMeter(primaryMeter) ? providerAccountMeterProgress(primaryMeter) : undefined;
  const resizeHandle = editing && onChangeCardSize
    ? <ProviderAccountCardResizeHandle account={account} currentSize={providerAccountBentoSizeFromSpan(cardBentoSpan)} maxHeight={providerAccountBentoRowCount(dimensions) >= 2 ? 2 : 1} maxWidth={providerAccountBentoColumnCount(dimensions, 2) >= 2 ? 2 : 1} onResize={onChangeCardSize} />
    : null;

  if (variant === "cards") {
    if (compactBento) {
      return (
        <div className={cn("overview-account-bento-tile overview-nested-surface group/account-card relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border p-2.5", providerAccountBentoSpanClass(cardBentoSpan))} data-account-status={account.status} data-provider-account-card-layout="compact">
          <div className="flex min-w-0 shrink-0 items-start justify-between gap-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2.5" data-provider-account-compact-brand="true">
              <ProviderAccountLogo account={account} className="h-8 w-8 rounded-md shadow-sm" providers={providers} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold leading-tight">{providerAccountSnapshotLabel(account)}</div>
              </div>
            </div>
            {dragHandle || providerAccountShowRefresh(dimensions) ? (
              <div className="flex shrink-0 items-center gap-1" data-provider-account-compact-actions="true">
                {dragHandle}
                {providerAccountShowRefresh(dimensions) ? <ProviderAccountRefreshButton account={account} className="h-7 w-7" iconClassName="h-4 w-4" refreshing={refreshing} onRefresh={onRefresh} /> : null}
              </div>
            ) : null}
          </div>
          <div className="mt-auto min-h-0 min-w-0 pt-2">
            {primaryMeter ? (
              <div className="min-w-0 text-right" data-provider-account-compact-meter="true">
                <div className="truncate text-[10px] font-semibold leading-none text-muted-foreground">
                  {formatProviderAccountMeterTitle(primaryMeter, t)}
                </div>
                <div className="mt-1 truncate text-[19px] font-semibold leading-none tracking-tight">{formatProviderAccountMeterValue(primaryMeter, t)}</div>
              </div>
            ) : (
              <div className="line-clamp-2 min-w-0 text-[11px] font-medium leading-snug text-muted-foreground" data-provider-account-compact-message="true">
                {account.message || account.errors?.[0]?.message || t("Unavailable")}
              </div>
            )}
          </div>
          {primaryProgress !== undefined && providerAccountShowProgress(dimensions) ? (
            <div className="overview-account-bento-track mt-1.5 h-1.5 shrink-0 overflow-hidden rounded-full">
              <div className="overview-account-bento-fill h-full rounded-full" style={{ width: `${primaryProgress}%` }} />
            </div>
          ) : null}
          {resizeHandle}
        </div>
      );
    }

    return (
      <div className={cn("overview-account-bento-tile overview-nested-surface group/account-card relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border", providerAccountBentoSpanClass(cardBentoSpan), providerAccountCardPaddingClass(dimensions))} data-account-status={account.status} data-provider-account-card-layout="expanded">
        <div className="flex min-w-0 shrink-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <ProviderAccountLogo account={account} className="h-8 w-8 rounded-md" providers={providers} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">{providerAccountSnapshotLabel(account)}</div>
              {providerAccountShowRefreshTime(dimensions) ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{formatProviderAccountRefreshTime(account, t)}</div> : null}
            </div>
          </div>
          {dragHandle || providerAccountShowRefresh(dimensions) ? (
            <div className="flex shrink-0 items-center gap-1">
              {dragHandle}
              {providerAccountShowRefresh(dimensions) ? <ProviderAccountRefreshButton account={account} refreshing={refreshing} onRefresh={onRefresh} /> : null}
            </div>
          ) : null}
        </div>

        {primaryMeter ? (
          <>
            <div className="mt-3 min-w-0">
              <div className="flex min-w-0 items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium text-muted-foreground">{formatProviderAccountMeterTitle(primaryMeter, t)}</div>
                  <div className={cn("truncate font-semibold tracking-tight", dimensions.height >= 3 ? "text-[22px]" : "text-[20px]")}>{formatProviderAccountMeterValue(primaryMeter, t)}</div>
                </div>
                {primaryProgress !== undefined && primaryMeter.unit.trim() !== "%" ? (
                  <div className="overview-account-bento-badge shrink-0">{primaryProgress}%</div>
                ) : null}
              </div>
              {primaryProgress !== undefined && providerAccountShowProgress(dimensions) ? (
                <div className="overview-account-bento-track mt-2 h-2 overflow-hidden rounded-full">
                  <div className="overview-account-bento-fill h-full rounded-full" style={{ width: `${primaryProgress}%` }} />
                </div>
              ) : null}
            </div>

            {secondaryMeters.length > 0 ? (
              <div className="mt-auto min-h-0 space-y-1.5 border-t border-border/45 pt-2">
                {secondaryMeters.map((meter) => (
                  <ProviderAccountMeterLine account={account} compact dimensions={dimensions} key={meter.id} meter={meter} onRefresh={onRefresh} />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-3 flex min-h-0 flex-1 items-center overflow-hidden text-[12px] text-muted-foreground">
            <span className="min-w-0 truncate">{account.message || account.errors?.[0]?.message || t("Unavailable")}</span>
          </div>
        )}
        {resizeHandle}
      </div>
    );
  }

  return (
    <div className={cn("overview-nested-surface flex h-full min-w-0 flex-col overflow-hidden border", providerAccountCardPaddingClass(dimensions))}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <ProviderAccountLogo account={account} className="h-8 w-8 rounded-md" providers={providers} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold">{providerAccountSnapshotLabel(account)}</div>
            {providerAccountShowRefreshTime(dimensions) ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{formatProviderAccountRefreshTime(account, t)}</div> : null}
          </div>
        </div>
        {providerAccountShowRefresh(dimensions) ? <ProviderAccountRefreshButton account={account} refreshing={refreshing} onRefresh={onRefresh} /> : null}
      </div>
      {showQuotaVisual ? (
        <div className="mt-2 min-h-0 overflow-hidden">
          <ProviderAccountQuotaVisual account={account} dimensions={dimensions} meters={quotaMeters} variant={variant} />
        </div>
      ) : quotaMeters.length === 0 && balanceMeter ? (
        <div className="mt-2 min-h-0 overflow-hidden">
          <ProviderAccountBalanceMetric dimensions={dimensions} meter={balanceMeter} compact />
        </div>
      ) : meters.length > 0 ? (
        <div className={cn("mt-2 min-h-0", providerAccountStackClass(dimensions))}>
          {meters.map((meter) => (
            <ProviderAccountMeterLine account={account} dimensions={dimensions} key={meter.id} meter={meter} onRefresh={onRefresh} />
          ))}
        </div>
      ) : (
        <div className="mt-2 truncate text-[12px] text-muted-foreground">{account.message || account.errors?.[0]?.message || t("Unavailable")}</div>
      )}
    </div>
  );
}

function ProviderAccountCardResizeHandle({
  account,
  currentSize,
  maxHeight,
  maxWidth,
  onResize
}: {
  account: ProviderAccountSnapshot;
  currentSize: OverviewAccountCardSize;
  maxHeight: 1 | 2;
  maxWidth: 1 | 2;
  onResize: (accountKey: string, size: OverviewAccountCardSize) => void;
}) {
  const t = useAppText();
  const size = overviewAccountCardSizeDimensions(currentSize);

  function startResize(handle: OverviewAccountCardResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const accountKey = providerAccountSnapshotKey(account);
    const startSize = size;
    const startY = event.clientY;
    const startX = event.clientX;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    let activeSize = currentSize;
    document.body.style.cursor = providerAccountCardResizeCursor(handle);
    document.body.style.userSelect = "none";

    const update = (pointerEvent: PointerEvent) => {
      const nextWidth = providerAccountNextResizeDimension(
        startSize.width,
        maxWidth,
        providerAccountCardResizeWidthDelta(handle, pointerEvent.clientX - startX)
      );
      const nextHeight = providerAccountNextResizeDimension(
        startSize.height,
        maxHeight,
        providerAccountCardResizeHeightDelta(handle, pointerEvent.clientY - startY)
      );
      const nextSize = overviewAccountCardSize(nextWidth, nextHeight);
      if (nextSize === activeSize) {
        return;
      }
      activeSize = nextSize;
      onResize(accountKey, nextSize);
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
    <>
      {overviewAccountCardResizeHandles.map((handle) => (
        <button
          aria-label={t("Resize account card")}
          className={providerAccountCardResizeHandleClass(handle)}
          data-account-card-resize-handle={handle}
          key={handle}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => startResize(handle, event)}
          title={t("Resize account card")}
          type="button"
        >
          {providerAccountCardResizeHandleIcon(handle)}
        </button>
      ))}
    </>
  );
}

type OverviewAccountCardResizeHandle = "bottom" | "bottom-left" | "bottom-right" | "left" | "right" | "top" | "top-left" | "top-right";

const overviewAccountCardResizeHandles: OverviewAccountCardResizeHandle[] = [
  "top",
  "right",
  "bottom",
  "left",
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left"
];

function overviewAccountCardSizeDimensions(size: OverviewAccountCardSize): ProviderAccountBentoSpan {
  const [widthText, heightText] = size.split(":");
  return {
    height: heightText === "2" ? 2 : 1,
    width: widthText === "2" ? 2 : 1
  };
}

function overviewAccountCardSize(width: 1 | 2, height: 1 | 2): OverviewAccountCardSize {
  return `${width}:${height}` as OverviewAccountCardSize;
}

function providerAccountNextResizeDimension(start: 1 | 2, max: 1 | 2, delta: number): 1 | 2 {
  if (max === 1) {
    return 1;
  }
  if (delta >= 18) {
    return 2;
  }
  if (delta <= -18) {
    return 1;
  }
  return start;
}

function providerAccountCardResizeWidthDelta(handle: OverviewAccountCardResizeHandle, deltaX: number): number {
  if (handle.includes("right")) {
    return deltaX;
  }
  if (handle.includes("left")) {
    return -deltaX;
  }
  return 0;
}

function providerAccountCardResizeHeightDelta(handle: OverviewAccountCardResizeHandle, deltaY: number): number {
  if (handle.includes("bottom")) {
    return deltaY;
  }
  if (handle.includes("top")) {
    return -deltaY;
  }
  return 0;
}

function providerAccountCardResizeCursor(handle: OverviewAccountCardResizeHandle): string {
  if (handle === "left" || handle === "right") {
    return "ew-resize";
  }
  if (handle === "top" || handle === "bottom") {
    return "ns-resize";
  }
  if (handle === "top-left" || handle === "bottom-right") {
    return "nwse-resize";
  }
  return "nesw-resize";
}

function providerAccountCardResizeHandleClass(handle: OverviewAccountCardResizeHandle): string {
  const base = "group/account-resize absolute z-20 touch-none border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/20";
  if (handle === "top") {
    return cn(base, "left-10 right-10 top-0 h-4 cursor-ns-resize");
  }
  if (handle === "bottom") {
    return cn(base, "bottom-0 left-10 right-10 h-4 cursor-ns-resize");
  }
  if (handle === "left") {
    return cn(base, "bottom-10 left-0 top-10 w-4 cursor-ew-resize");
  }
  if (handle === "right") {
    return cn(base, "bottom-10 right-0 top-10 w-4 cursor-ew-resize");
  }
  const cornerClass = "h-8 w-8";
  if (handle === "top-left") {
    return cn(base, cornerClass, "left-0 top-0 cursor-nwse-resize");
  }
  if (handle === "top-right") {
    return cn(base, cornerClass, "right-0 top-0 cursor-nesw-resize");
  }
  if (handle === "bottom-left") {
    return cn(base, cornerClass, "bottom-0 left-0 cursor-nesw-resize");
  }
  return cn(base, cornerClass, "bottom-0 right-0 cursor-nwse-resize");
}

function providerAccountCardResizeHandleIcon(handle: OverviewAccountCardResizeHandle): ReactNode {
  const markerClass = "pointer-events-none absolute rounded-full bg-muted-foreground/35 opacity-0 transition-[background-color,opacity] group-hover/account-card:opacity-100 group-hover/account-resize:bg-primary/55 group-focus-visible/account-resize:opacity-100 group-focus-visible/account-resize:bg-primary/55";
  if (handle === "top" || handle === "bottom" || handle === "left" || handle === "right") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          markerClass,
          (handle === "top" || handle === "bottom")
            ? "left-1/2 h-0.5 w-12 -translate-x-1/2"
            : "top-1/2 h-12 w-0.5 -translate-y-1/2",
          handle === "top" && "top-1.5",
          handle === "bottom" && "bottom-1.5",
          handle === "left" && "left-1.5",
          handle === "right" && "right-1.5"
        )}
      />
    );
  }
  const cornerLineClass = "absolute rounded-full bg-muted-foreground/35 transition-colors group-hover/account-resize:bg-primary/55 group-focus-visible/account-resize:bg-primary/55";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute h-3.5 w-3.5 opacity-0 transition-opacity group-hover/account-card:opacity-100 group-focus-visible/account-resize:opacity-100",
        handle === "top-left" && "left-2 top-2",
        handle === "top-right" && "right-2 top-2",
        handle === "bottom-left" && "bottom-2 left-2",
        handle === "bottom-right" && "bottom-2 right-2"
      )}
    >
      <span
        className={cn(
          cornerLineClass,
          "h-0.5 w-3.5",
          handle.includes("top") ? "top-0" : "bottom-0",
          handle.includes("left") ? "left-0" : "right-0"
        )}
      />
      <span
        className={cn(
          cornerLineClass,
          "h-3.5 w-0.5",
          handle.includes("top") ? "top-0" : "bottom-0",
          handle.includes("left") ? "left-0" : "right-0"
        )}
      />
    </span>
  );
}

function ProviderAccountBentoOverflowTile({ count }: { count: number }) {
  const t = useAppText();
  return (
    <div className="overview-account-bento-more overview-account-bento-tile overview-nested-surface row-span-1 flex min-h-0 min-w-0 flex-col justify-center overflow-hidden border p-3 text-center" data-account-status="unknown">
      <div className="truncate text-[22px] font-semibold tracking-tight">+{count}</div>
      <div className="truncate text-[11px] font-medium text-muted-foreground">{t("More")}</div>
    </div>
  );
}

function ProviderAccountLogo({
  account,
  className,
  providers
}: {
  account: ProviderAccountSnapshot;
  className?: string;
  providers: GatewayProviderConfig[];
}) {
  const iconUrl = providerAccountIconUrl(account, providers);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [iconUrl]);
  const fallbackLabel = account.provider.trim().slice(0, 1).toUpperCase();

  if (iconUrl && !failed) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-border bg-background p-0.5", className)}>
        <img alt="" className="h-full w-full object-contain" draggable={false} src={iconUrl} onError={() => setFailed(true)} />
      </span>
    );
  }

  return (
    <span className={cn("flex shrink-0 items-center justify-center border border-border bg-muted text-[10px] font-semibold text-muted-foreground", className)}>
      {fallbackLabel || <WalletCards className="h-3.5 w-3.5" />}
    </span>
  );
}

function providerAccountIconUrl(account: ProviderAccountSnapshot, providers: GatewayProviderConfig[]): string {
  const providerName = account.provider.trim().toLowerCase();
  if (!providerName) {
    return "";
  }
  const provider = providers.find((item) => (
    item.name.trim().toLowerCase() === providerName
      || item.id?.trim().toLowerCase() === providerName
      || item.provider?.trim().toLowerCase() === providerName
  ));
  return provider ? providerDisplayIcon(provider) : "";
}

function ProviderAccountRefreshButton({
  account,
  className,
  iconClassName,
  onRefresh,
  refreshing = false
}: {
  account: ProviderAccountSnapshot;
  className?: string;
  iconClassName?: string;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}) {
  const t = useAppText();
  const label = refreshing ? t("Refreshing account") : t("Refresh account");
  return (
    <button
      aria-label={label}
      className={cn("m-0 inline-flex h-6 w-6 shrink-0 appearance-none items-center justify-center rounded-md border-0 bg-transparent p-0 text-muted-foreground shadow-none transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-45", className)}
      disabled={refreshing || !onRefresh}
      title={`${label} (${account.status})`}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void onRefresh?.();
      }}
    >
      {refreshing ? <LoaderCircle className={cn("h-3.5 w-3.5 animate-spin", iconClassName)} /> : <RefreshCw className={cn("h-3.5 w-3.5", iconClassName)} />}
    </button>
  );
}

function formatProviderAccountRefreshTime(account: ProviderAccountSnapshot, t: (value: string) => string): string {
  return `${t("Last updated")}: ${formatProviderAccountUpdatedAt(account.updatedAt) || "-"}`;
}

function formatProviderAccountUpdatedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function ProviderAccountMeterLine({
  account,
  compact = false,
  dimensions,
  meter,
  onRefresh,
  single = false
}: {
  account: ProviderAccountSnapshot;
  compact?: boolean;
  dimensions: OverviewWidgetDimensions;
  meter: ReturnType<typeof providerAccountMetersForDisplay>[number];
  onRefresh?: () => void | Promise<void>;
  single?: boolean;
}) {
  const t = useAppText();
  const progress = isProviderAccountQuotaMeter(meter) ? providerAccountMeterProgress(meter) : undefined;
  const canExpandDetails = dimensions.height >= 2 && isProviderAccountManualResetMeter(meter) && (meter.details?.length ?? 0) > 0;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [resetDialogDetail, setResetDialogDetail] = useState<NonNullable<ProviderAccountMeter["details"]>[number]>();
  const title = formatProviderAccountMeterTitle(meter, t);
  const detailsId = `provider-account-meter-${providerAccountSnapshotKey(account)}-${meter.id}-details`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const titleClassName = cn("min-w-0 truncate font-medium text-muted-foreground", compact ? "text-[10px]" : single && dimensions.height >= 2 ? "text-[13px]" : "text-[12px]");
  const valueClassName = cn("shrink-0 font-semibold tracking-tight", compact ? "text-[12px]" : single && dimensions.height >= 2 ? "text-[18px]" : "text-[15px]");
  const meterSummary = (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        {canExpandDetails ? (
          <AnimatedIconSwap className="text-muted-foreground transition-colors group-hover:text-foreground" iconKey={detailsOpen}>
            {detailsOpen ? <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" /> : <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />}
          </AnimatedIconSwap>
        ) : null}
        <div className={titleClassName}>{title}</div>
      </div>
      <div className={valueClassName}>{formatProviderAccountMeterValue(meter, t)}</div>
    </>
  );

  return (
    <div className="min-w-0 overflow-hidden">
      {canExpandDetails ? (
        <button
          aria-controls={detailsId}
          aria-expanded={detailsOpen}
          aria-label={`${t(detailsOpen ? "Collapse" : "Expand")} ${title}`}
          className={cn("group -mx-1 flex w-[calc(100%+8px)] min-w-0 items-end justify-between gap-3 rounded-md px-1 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25", compact ? "py-0" : "py-0.5")}
          onClick={() => setDetailsOpen((current) => !current)}
          type="button"
        >
          {meterSummary}
        </button>
      ) : (
        <div className="flex min-w-0 items-end justify-between gap-3">
          {meterSummary}
        </div>
      )}
      {progress !== undefined && providerAccountShowProgress(dimensions) ? (
        <div className={cn("mt-1.5 overflow-hidden rounded-full", single ? "bg-muted" : "bg-background", compact || dimensions.height <= 1 ? "h-1.5" : "h-2")}>
          <div className={cn("h-full rounded-full", providerAccountProgressClass(account.status))} style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <AnimatePresence initial={false}>
        {canExpandDetails && detailsOpen ? (
          <AnimatedDisclosure>
            <ProviderAccountMeterDetails account={account} detailsId={detailsId} meter={meter} onReset={setResetDialogDetail} />
          </AnimatedDisclosure>
        ) : null}
      </AnimatePresence>
      <CodexResetCreditDialog
        account={account}
        details={meter.details ?? []}
        detail={resetDialogDetail}
        open={Boolean(resetDialogDetail)}
        onClose={() => setResetDialogDetail(undefined)}
        onResetComplete={onRefresh}
      />
    </div>
  );
}

function ProviderAccountMeterDetails({
  account,
  detailsId,
  meter,
  onReset
}: {
  account: ProviderAccountSnapshot;
  detailsId: string;
  meter: ProviderAccountMeter;
  onReset: (detail: NonNullable<ProviderAccountMeter["details"]>[number]) => void;
}) {
  const t = useAppText();
  const details = meter.details ?? [];

  return (
    <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1" id={detailsId}>
      {details.map((detail, index) => {
        const detailProgress = providerAccountMeterDetailValidityProgress(detail);
        const label = providerAccountMeterDetailLabel(detail, index, t);
        const status = providerAccountMeterDetailStatusLabel(detail.status, t);
        return (
          <div className="min-w-0 rounded-md border border-border/70 bg-background/70 px-2.5 py-2 text-[10px] leading-tight text-muted-foreground" key={detail.id ?? `${meter.id}-${index}`}>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-medium text-foreground/80" title={label}>{label}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {status ? <div className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] tracking-wide text-muted-foreground">{status}</div> : null}
                {detail.redeemable ? (
                  <Button
                    aria-label={`${t("Reset")} ${label}`}
                    className="h-5 px-1.5 text-[10px]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onReset(detail);
                    }}
                    title={`${t("Reset")} ${label}`}
                    type="button"
                    variant="outline"
                  >
                    {t("Reset")}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2">
              <div className="truncate">{t("Effective")}: {formatProviderAccountDetailDate(detail.effectiveAt)}</div>
              <div className="truncate text-right">{t("Expires")}: {formatProviderAccountDetailDate(detail.expiresAt)}</div>
            </div>
            {detailProgress !== undefined ? (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", providerAccountProgressClass(account.status))} style={{ width: `${detailProgress}%` }} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function providerAccountMeterDetailLabel(
  detail: NonNullable<ProviderAccountMeter["details"]>[number],
  index: number,
  t: (value: string) => string
): string {
  return detail.label ? formatProviderAccountMeterDetailLabel(detail.label, t) : `#${index + 1}`;
}

function formatProviderAccountMeterDetailLabel(value: string, t: (value: string) => string): string {
  const trimmed = value.trim();
  const fullResetMatch = /^full reset(?:\s*\(([^)]*)\))?$/i.exec(trimmed);
  if (fullResetMatch) {
    const qualifier = fullResetMatch[1] ? formatCodexResetCreditQualifier(fullResetMatch[1], t) : "";
    if (!qualifier) {
      return t("Full reset");
    }
    return appTextLooksTranslated(t)
      ? `${t("Full reset")}（${qualifier}）`
      : `${t("Full reset")} (${qualifier})`;
  }
  return t(trimmed);
}

function formatCodexResetCreditQualifier(value: string, t: (value: string) => string): string {
  return value
    .replace(/\bweekly\b/gi, t("Weekly"))
    .replace(/\bdaily\b/gi, t("Daily"))
    .replace(/\bmonthly\b/gi, t("Monthly"))
    .replace(/\byearly\b/gi, t("Yearly"))
    .replace(/\bhours?\b/gi, t("hour"))
    .replace(/\bhrs?\b/gi, t("hr"))
    .replace(/\bminutes?\b/gi, t("minute"))
    .replace(/\bmins?\b/gi, t("min"))
    .replace(/\bdays?\b/gi, t("day"))
    .replace(/\bweeks?\b/gi, t("week"))
    .replace(/\bmonths?\b/gi, t("month"))
    .replace(/\s*\+\s*/g, " + ")
    .trim();
}

function appTextLooksTranslated(t: (value: string) => string): boolean {
  return t("Manual reset credit") !== "Manual reset credit";
}

function providerAccountMeterDetailStatusLabel(status: string | undefined, t: (value: string) => string): string {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "available") return t("Available");
  if (normalized === "active") return t("Active");
  if (normalized === "expired") return t("Expired");
  if (normalized === "used") return t("Used");
  return t(status ?? "");
}

type CodexResetCardStatus = "idle" | "resetting" | "complete";
type CodexResetCreditDetail = NonNullable<ProviderAccountMeter["details"]>[number];

function CodexResetCreditDialog({
  account,
  details,
  detail,
  onClose,
  onResetComplete,
  open
}: {
  account: ProviderAccountSnapshot;
  details: CodexResetCreditDetail[];
  detail: CodexResetCreditDetail | undefined;
  onClose: () => void;
  onResetComplete?: () => void | Promise<void>;
  open: boolean;
}) {
  const t = useAppText();
  const cards = useMemo(() => details.filter((item) => Boolean(item.id)), [details]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [status, setStatus] = useState<CodexResetCardStatus>("idle");
  const [error, setError] = useState("");
  const activeDetail = cards[activeIndex] ?? detail;
  const detailLabel = activeDetail ? providerAccountMeterDetailLabel(activeDetail, activeIndex, t) : "";
  const detailStatus = providerAccountMeterDetailStatusLabel(activeDetail?.status, t);
  const canNavigate = cards.length > 1 && status === "idle";

  useEffect(() => {
    if (open) {
      const initialIndex = cards.findIndex((item) => item.id === detail?.id);
      setActiveIndex(initialIndex >= 0 ? initialIndex : 0);
      setDirection(0);
    }
    setStatus("idle");
    setError("");
  }, [open, detail?.id]);

  useEffect(() => {
    if (activeIndex >= cards.length && cards.length > 0) {
      setActiveIndex(cards.length - 1);
    }
  }, [activeIndex, cards.length]);

  function showCard(nextIndex: number, nextDirection: number) {
    if (!canNavigate) {
      return;
    }
    setDirection(nextDirection);
    setActiveIndex((nextIndex + cards.length) % cards.length);
    setError("");
  }

  function showPreviousCard() {
    showCard(activeIndex - 1, -1);
  }

  function showNextCard() {
    showCard(activeIndex + 1, 1);
  }

  async function resetCredit() {
    if (status !== "idle" || !activeDetail?.id || activeDetail.redeemable === false) {
      return;
    }
    if (!window.ccr?.resetCodexRateLimitCredit) {
      setError(t("Reset is unavailable."));
      return;
    }

    setError("");
    setStatus("resetting");
    const cardTransition = delay(650);
    try {
      await window.ccr.resetCodexRateLimitCredit({
        credentialId: account.credentialId,
        creditId: activeDetail.id,
        provider: account.provider
      });
      await cardTransition;
      setStatus("complete");
      await onResetComplete?.();
      window.setTimeout(() => {
        onClose();
        setStatus("idle");
      }, 1200);
    } catch (resetError) {
      await cardTransition.catch(() => undefined);
      setError(formatDialogError(resetError));
      setStatus("idle");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && status !== "resetting") onClose(); }}>
      <DialogContent className="max-w-[620px] overflow-hidden border-border/70 bg-background p-0 text-foreground shadow-[0_28px_90px_rgba(15,23,42,0.24)]">
        <DialogBody
          className="relative overflow-hidden p-0"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              showPreviousCard();
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              showNextCard();
            }
          }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.12),transparent_42%),radial-gradient(circle_at_90%_15%,rgba(99,102,241,0.12),transparent_38%)]" />
          <Button
            aria-label={t("Close")}
            className="absolute right-4 top-4 z-20 text-muted-foreground hover:bg-muted hover:text-foreground"
            disabled={status === "resetting"}
            onClick={onClose}
            size="iconSm"
            title={t("Close")}
            type="button"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <div className="relative z-10 px-6 pb-3 pt-6 sm:px-8">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5" />
              {t("Manual reset credit")}
            </div>
            <h2 className="mt-1.5 text-[21px] font-semibold tracking-tight">{t("Choose a reset card")}</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">{t("Use the arrows to switch between available reset credits.")}</p>
          </div>
          <div className="relative z-10 px-3 pb-2 sm:px-5">
            <div className="grid grid-cols-[36px_minmax(0,440px)_36px] items-center justify-center gap-1 sm:grid-cols-[40px_minmax(0,440px)_40px] sm:gap-3">
              <Button
                aria-label={t("Previous reset card")}
                className="rounded-full border border-border/80 bg-background/90 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
                disabled={!canNavigate}
                onClick={showPreviousCard}
                size="iconSm"
                title={t("Previous reset card")}
                type="button"
                variant="ghost"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="relative min-w-0 pb-3 pt-2 [perspective:1200px]">
                {cards.length > 1 ? (
                  <>
                    <div className="absolute inset-x-5 bottom-0 top-5 rounded-[22px] border border-slate-700/40 bg-slate-900/45 opacity-35" />
                    <div className="absolute inset-x-2.5 bottom-1.5 top-3.5 rounded-[22px] border border-slate-700/50 bg-slate-900/70 opacity-55" />
                  </>
                ) : null}
                <AnimatePresence custom={direction} initial={false} mode="wait">
                  <motion.div
                    animate={{ opacity: 1, rotateY: 0, scale: 1, x: 0 }}
                    className="relative aspect-[1.586/1] w-full cursor-grab select-none overflow-hidden rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_82%_18%,rgba(129,140,248,0.42),transparent_29%),radial-gradient(circle_at_14%_92%,rgba(16,185,129,0.34),transparent_34%),linear-gradient(135deg,#171a20_0%,#07090d_55%,#111827_100%)] text-white shadow-[0_22px_45px_rgba(15,23,42,0.34)] active:cursor-grabbing"
                    drag={canNavigate ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.16}
                    exit={{ opacity: 0, rotateY: direction > 0 ? -7 : 7, scale: 0.97, x: direction > 0 ? -48 : 48 }}
                    initial={{ opacity: 0, rotateY: direction > 0 ? 7 : -7, scale: 0.97, x: direction > 0 ? 48 : -48 }}
                    key={activeDetail?.id ?? "empty-reset-card"}
                    onDragEnd={(_, info) => {
                      if (info.offset.x < -48) showNextCard();
                      if (info.offset.x > 48) showPreviousCard();
                    }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-white/[0.07]" />
                    <div className="pointer-events-none absolute -right-8 -top-14 h-48 w-48 rounded-full border border-white/[0.06]" />
                    <div className="pointer-events-none absolute inset-0 opacity-[0.045] [background-image:repeating-linear-gradient(115deg,transparent_0,transparent_8px,#fff_9px,transparent_10px)]" />
                    <div className="relative flex h-full flex-col justify-between p-[clamp(12px,5.5%,26px)]">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 shadow-inner">
                            <img alt="Codex" className="h-5 w-5 rounded-full" draggable={false} src={codexLogoUrl} />
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white">CODEX</div>
                            <div className="text-[8px] uppercase tracking-[0.16em] text-white/45">RESET CREDIT</div>
                          </div>
                        </div>
                        {detailStatus ? <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-200">{detailStatus}</span> : null}
                      </div>

                      <div>
                        <div className="mb-3 flex items-center gap-3">
                          <div className="relative h-7 w-10 overflow-hidden rounded-md border border-amber-100/40 bg-gradient-to-br from-amber-100 via-yellow-400 to-amber-600 shadow-inner">
                            <div className="absolute inset-y-0 left-1/2 w-px bg-amber-900/30" />
                            <div className="absolute inset-x-0 top-1/2 h-px bg-amber-900/30" />
                            <div className="absolute inset-y-1 left-1/2 w-4 -translate-x-1/2 rounded border border-amber-900/25" />
                          </div>
                          <Wifi className="h-6 w-6 rotate-90 text-white/50" />
                        </div>
                        <div aria-label={`${t("Card number")}: ${activeDetail?.id ?? "-"}`} className="flex min-h-10 flex-wrap content-center gap-x-3 gap-y-0.5 font-mono text-[clamp(14px,3.8vw,20px)] font-medium tracking-[0.1em] text-white" title={activeDetail?.id}>
                          {formatCodexResetCardNumber(activeDetail?.id).map((group, index) => <span key={`${group}-${index}`}>{group}</span>)}
                        </div>
                      </div>

                      <div className="flex items-end justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-[7px] font-medium uppercase tracking-[0.18em] text-white/40">{t("Reset type")}</div>
                          <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.13em] text-white/85" title={detailLabel || undefined}>{detailLabel || "-"}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[7px] font-medium uppercase tracking-[0.18em] text-white/40">{t("Valid thru")}</div>
                          <div className="mt-0.5 font-mono text-[13px] font-semibold tracking-[0.12em]">{formatCodexResetCardExpiry(activeDetail?.expiresAt)}</div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <Button
                aria-label={t("Next reset card")}
                className="rounded-full border border-border/80 bg-background/90 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
                disabled={!canNavigate}
                onClick={showNextCard}
                size="iconSm"
                title={t("Next reset card")}
                type="button"
                variant="ghost"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div aria-label={`${t("Reset card")} ${activeIndex + 1} / ${Math.max(cards.length, 1)}`} className="mt-1 flex h-5 items-center justify-center gap-1.5">
              {cards.map((card, index) => (
                <button
                  aria-label={`${t("Reset card")} ${index + 1}`}
                  className={cn("h-1.5 rounded-full transition-all", index === activeIndex ? "w-5 bg-foreground" : "w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/50")}
                  disabled={status !== "idle"}
                  key={card.id}
                  onClick={() => showCard(index, index > activeIndex ? 1 : -1)}
                  type="button"
                />
              ))}
            </div>
          </div>

          <div className="relative z-10 border-t border-border/70 bg-muted/20 px-6 py-5 sm:px-8">
            <div className="mb-4 flex min-w-0 items-center justify-between gap-4 text-[11px]">
              <div className="min-w-0">
                <div className="text-muted-foreground">{t("Expires")}</div>
                <div className="mt-0.5 truncate font-medium text-foreground">{formatProviderAccountDetailDate(activeDetail?.expiresAt)}</div>
              </div>
              <div className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">{activeIndex + 1} / {Math.max(cards.length, 1)}</div>
            </div>
            <Button
              className={cn(
                "group relative h-14 w-full overflow-hidden rounded-full border border-red-400/50 bg-gradient-to-b from-orange-500 to-red-600 px-5 text-white shadow-[0_10px_28px_rgba(239,68,68,0.28)] transition-shadow hover:from-orange-400 hover:to-red-600 hover:shadow-[0_14px_36px_rgba(239,68,68,0.4)] disabled:opacity-100",
                status === "complete" && "border-emerald-400/40 bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-500 hover:to-emerald-700"
              )}
              disabled={status !== "idle" || !activeDetail?.id || activeDetail.redeemable === false}
              onClick={() => void resetCredit()}
              type="button"
            >
              <motion.span
                animate={status === "resetting" ? { x: [-1, 1, -2, 2, 0], y: [0, -1, 1, -1, 0] } : {}}
                className="relative z-10 flex items-center justify-center gap-2.5 text-[14px] font-bold uppercase tracking-[0.1em]"
                transition={status === "resetting" ? { duration: 0.22, repeat: Infinity } : {}}
              >
                {status === "idle" ? <><Rocket className="h-5 w-5" /><span>{t("Launch reset")}</span></> : null}
                {status === "resetting" ? (
                  <>
                    <span className="relative">
                      <Rocket className="h-5 w-5 fill-white" />
                      <motion.span
                        animate={{ height: [8, 15, 10], opacity: [0.55, 1, 0.65] }}
                        className="absolute left-1/2 top-full mt-0.5 w-1.5 -translate-x-1/2 rounded-full bg-gradient-to-b from-yellow-200 via-orange-300 to-transparent blur-[1px]"
                        transition={{ duration: 0.12, repeat: Infinity }}
                      />
                    </span>
                    <span>{t("Resetting")}</span>
                  </>
                ) : null}
                {status === "complete" ? <><CheckCircle2 className="h-5 w-5" /><span>{t("Reset complete")}</span></> : null}
              </motion.span>
              <AnimatePresence>
                {status === "resetting" ? (
                  <motion.span
                    animate={{ opacity: [0.3, 0.7, 0.3], scaleX: [0.8, 1.25, 0.9] }}
                    className="pointer-events-none absolute inset-x-10 bottom-0 h-4 rounded-full bg-yellow-200/40 blur-xl"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    transition={{ duration: 0.18, repeat: Infinity }}
                  />
                ) : null}
              </AnimatePresence>
            </Button>
            {error ? <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">{error}</div> : null}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function formatCodexResetCardNumber(value: string | undefined): string[] {
  const normalized = value?.trim().replace(/\s+/g, "") || "----";
  return normalized.match(/.{1,4}/g) ?? [normalized];
}

export function formatCodexResetCardExpiry(value: string | undefined): string {
  if (!value) {
    return "--/--";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "--/--";
  }
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function formatDialogError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ProviderAccountBalanceMetric({
  compact = false,
  dimensions,
  meter
}: {
  compact?: boolean;
  dimensions: OverviewWidgetDimensions;
  meter: ProviderAccountMeter;
}) {
  const t = useAppText();
  const large = !compact && dimensions.height >= 2;

  return (
    <div className="flex min-h-0 min-w-0 flex-col justify-center overflow-hidden">
      <div className={cn("truncate font-medium text-muted-foreground", large ? "text-[12px]" : "text-[11px]")}>{formatProviderAccountMeterTitle(meter, t)}</div>
      <div className={cn("truncate font-semibold tracking-tight", large ? "text-[24px]" : "text-[18px]")}>{formatProviderAccountMeterValue(meter)}</div>
    </div>
  );
}

function ProviderAccountQuotaVisual({
  account,
  dimensions,
  meters,
  variant
}: {
  account: ProviderAccountSnapshot;
  dimensions: OverviewWidgetDimensions;
  meters: ProviderAccountMeter[];
  variant: OverviewAccountVariant;
}) {
  const t = useAppText();
  const displayMeters = providerAccountQuotaMetersForVisual(meters, variant);
  const showLabels = dimensions.width >= 2 && dimensions.height >= 2;
  const primary = displayMeters[0];

  if (!primary) {
    return null;
  }

  return (
    <div className={cn("flex min-h-0 min-w-0 items-center overflow-hidden", showLabels ? "justify-center gap-4" : "justify-center")}>
      <ProviderAccountQuotaGauge account={account} dimensions={dimensions} meters={displayMeters} variant={variant} />
      {showLabels ? (
        <div className="min-w-0 space-y-2">
          {displayMeters.slice(0, variant === "nested-rings" ? 2 : 1).map((meter) => {
            return (
              <div className="min-w-0" key={meter.id}>
                <div className="truncate text-[12px] font-medium text-muted-foreground">{formatProviderAccountMeterTitle(meter, t)}</div>
                <div className="truncate text-[17px] font-semibold tracking-tight">{formatProviderAccountMeterValue(meter)}</div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ProviderAccountQuotaGauge({
  account,
  dimensions,
  meters,
  variant
}: {
  account: ProviderAccountSnapshot;
  dimensions: OverviewWidgetDimensions;
  meters: ProviderAccountMeter[];
  variant: OverviewAccountVariant;
}) {
  const t = useAppText();
  const primary = meters[0];
  const secondary = meters[1];
  const primaryRatio = providerAccountMeterRatio(primary) ?? 0;
  const secondaryRatio = secondary ? providerAccountMeterRatio(secondary) ?? 0 : 0;
  const stroke = providerAccountProgressStroke(account.status);
  const secondaryStroke = "#2563eb";
  const compact = dimensions.height <= 1 || dimensions.width <= 1;
  const sizeClass = compact ? "h-[72px] w-[72px]" : dimensions.height >= 3 ? "h-[124px] w-[124px]" : "h-[104px] w-[104px]";

  if (variant === "semicircle" || variant === "arc") {
    const start = variant === "semicircle" ? 270 : 225;
    const end = variant === "semicircle" ? 450 : 495;
    const path = describeSvgArc(60, 66, 42, start, end);
    return (
      <svg aria-hidden="true" className={sizeClass} viewBox="0 0 120 120">
        <path d={path} fill="none" pathLength={100} stroke="var(--muted)" strokeLinecap="round" strokeWidth="11" />
        <path d={path} fill="none" pathLength={100} stroke={stroke} strokeDasharray={`${Math.round(primaryRatio * 100)} 100`} strokeLinecap="round" strokeWidth="11" />
        <text className="fill-foreground text-[18px] font-semibold" dy="0.35em" textAnchor="middle" x="60" y="60">{formatProviderAccountMeterValue(primary)}</text>
      </svg>
    );
  }

  if (variant === "nested-rings" && secondary) {
    return (
      <svg aria-hidden="true" className={sizeClass} viewBox="0 0 120 120">
        <ProviderAccountQuotaCircle cx={60} cy={60} ratio={primaryRatio} radius={44} stroke={stroke} strokeWidth={9} />
        <ProviderAccountQuotaCircle cx={60} cy={60} ratio={secondaryRatio} radius={30} stroke={secondaryStroke} strokeWidth={9} />
        <text className="fill-foreground text-[17px] font-semibold" dy="0.35em" textAnchor="middle" x="60" y="55">{formatProviderAccountMeterValue(primary)}</text>
        <text className="fill-muted-foreground text-[10px] font-medium" dy="0.35em" textAnchor="middle" x="60" y="72">{formatProviderAccountMeterValue(secondary)}</text>
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={sizeClass} viewBox="0 0 120 120">
      <ProviderAccountQuotaCircle cx={60} cy={60} ratio={primaryRatio} radius={40} stroke={stroke} strokeWidth={10} />
      <text className="fill-foreground text-[20px] font-semibold" dy="0.35em" textAnchor="middle" x="60" y={dimensions.height >= 2 ? "57" : "60"}>{formatProviderAccountMeterValue(primary)}</text>
      {dimensions.height >= 2 ? <text className="fill-muted-foreground text-[10px] font-medium" dy="0.35em" textAnchor="middle" x="60" y="75">{formatProviderAccountMeterTitle(primary, t)}</text> : null}
    </svg>
  );
}

function ProviderAccountQuotaCircle({
  cx,
  cy,
  ratio,
  radius,
  stroke,
  strokeWidth
}: {
  cx: number;
  cy: number;
  ratio: number;
  radius: number;
  stroke: string;
  strokeWidth: number;
}) {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, ratio));

  return (
    <>
      <circle cx={cx} cy={cy} fill="none" r={radius} stroke="var(--muted)" strokeWidth={strokeWidth} />
      <circle
        cx={cx}
        cy={cy}
        fill="none"
        r={radius}
        stroke={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </>
  );
}

function primaryProviderAccountDisplayMeter(account: ProviderAccountSnapshot): ProviderAccountMeter | undefined {
  return providerAccountQuotaMeters(account)[0] ?? primaryProviderAccountBalanceMeter(account) ?? primaryProviderAccountMeter(account);
}

const providerAccountBalanceBreakdownMeterIds = new Set(["granted_balance", "topped_up_balance"]);

function providerAccountSnapshotForOverview(account: ProviderAccountSnapshot): ProviderAccountSnapshot {
  const hasTotalBalance = account.meters.some(
    (meter) => meter.kind === "balance" && meter.id.trim().toLowerCase() === "balance"
  );
  if (!hasTotalBalance) {
    return account;
  }
  const meters = account.meters.filter(
    (meter) => meter.kind !== "balance" || !providerAccountBalanceBreakdownMeterIds.has(meter.id.trim().toLowerCase())
  );
  return meters.length === account.meters.length ? account : { ...account, meters };
}

function providerAccountSelectionMatches(account: ProviderAccountSnapshot, values: ReadonlySet<string>): boolean {
  return values.has(providerAccountSnapshotKey(account)) || values.has(account.provider);
}

function providerAccountOrderAccounts(accounts: ProviderAccountSnapshot[], order: string[] | undefined): ProviderAccountSnapshot[] {
  const accountOrder = uniqueOverviewStrings(order ?? []);
  if (accountOrder.length === 0) {
    return accounts;
  }
  const accountsByKey = new Map(accounts.map((account) => [providerAccountSnapshotKey(account), account]));
  const used = new Set<string>();
  const orderedAccounts: ProviderAccountSnapshot[] = [];
  for (const accountKey of accountOrder) {
    const account = accountsByKey.get(accountKey);
    if (!account || used.has(accountKey)) {
      continue;
    }
    used.add(accountKey);
    orderedAccounts.push(account);
  }
  for (const account of accounts) {
    const accountKey = providerAccountSnapshotKey(account);
    if (!used.has(accountKey)) {
      orderedAccounts.push(account);
    }
  }
  return orderedAccounts;
}

function primaryProviderAccountBalanceMeter(account: ProviderAccountSnapshot): ProviderAccountMeter | undefined {
  return providerAccountBalanceMeters(account)[0];
}

function providerAccountMetersForDisplayOrdered(account: ProviderAccountSnapshot, maxCount: number): ProviderAccountMeter[] {
  const quotaMeters = providerAccountQuotaMeters(account);
  const manualResetMeters = account.meters.filter(isProviderAccountManualResetMeter);
  const leadingQuotaCount = manualResetMeters.length > 0 ? Math.min(quotaMeters.length, maxCount <= 2 ? 1 : 2) : quotaMeters.length;
  const ordered = [
    ...quotaMeters.slice(0, leadingQuotaCount),
    ...manualResetMeters,
    ...providerAccountBalanceMeters(account),
    ...quotaMeters.slice(leadingQuotaCount)
  ];
  const seen = new Set<string>();
  const unique = ordered.filter((meter) => {
    const key = `${meter.id}:${meter.kind}:${meter.window ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return (unique.length > 0 ? unique : providerAccountMetersForDisplay(account, maxCount)).slice(0, maxCount);
}

function providerAccountQuotaMeters(account: ProviderAccountSnapshot): ProviderAccountMeter[] {
  return account.meters
    .filter(isProviderAccountQuotaMeter)
    .sort(compareProviderAccountQuotaMeters);
}

function providerAccountBalanceMeters(account: ProviderAccountSnapshot): ProviderAccountMeter[] {
  return account.meters
    .filter(isProviderAccountBalanceMeter)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function isProviderAccountBalanceMeter(meter: ProviderAccountMeter): boolean {
  return meter.kind === "balance";
}

function isProviderAccountQuotaMeter(meter: ProviderAccountMeter): boolean {
  return meter.kind !== "balance" && providerAccountMeterRatio(meter) !== undefined;
}

function compareProviderAccountQuotaMeters(a: ProviderAccountMeter, b: ProviderAccountMeter): number {
  return providerAccountMeterWindowRank(a) - providerAccountMeterWindowRank(b) || a.label.localeCompare(b.label);
}

function providerAccountMeterWindowRank(meter: ProviderAccountMeter): number {
  const text = `${meter.window ?? ""} ${meter.id} ${meter.label}`.toLowerCase();
  if (meter.window === "5h" || text.includes("5h") || text.includes("primary")) {
    return 0;
  }
  if (meter.window === "weekly" || text.includes("weekly") || text.includes("secondary")) {
    return 1;
  }
  if (meter.window === "daily") return 2;
  if (meter.window === "monthly") return 3;
  return 4;
}

function providerAccountQuotaMetersForVisual(meters: ProviderAccountMeter[], variant: OverviewAccountVariant): ProviderAccountMeter[] {
  const sorted = [...meters].filter(isProviderAccountQuotaMeter).sort(compareProviderAccountQuotaMeters);
  if (variant !== "nested-rings") {
    return sorted.slice(0, 1);
  }
  const fiveHour = sorted.find((meter) => providerAccountMeterWindowRank(meter) === 0);
  const weekly = sorted.find((meter) => providerAccountMeterWindowRank(meter) === 1);
  const result = [fiveHour ?? sorted[0], weekly ?? sorted.find((meter) => meter !== (fiveHour ?? sorted[0]))].filter((meter): meter is ProviderAccountMeter => Boolean(meter));
  return result.slice(0, 2);
}

function providerAccountMeterRatio(meter: ProviderAccountMeter): number | undefined {
  if (!meter.limit || meter.limit <= 0 || meter.remaining === undefined) {
    return undefined;
  }
  return Math.max(0, Math.min(1, meter.remaining / meter.limit));
}

function providerAccountUsesQuotaVisual(variant: OverviewAccountVariant): boolean {
  return variant === "arc" || variant === "nested-rings" || variant === "ring" || variant === "semicircle";
}

function providerAccountProgressStroke(status: ProviderAccountSnapshot["status"]): string {
  if (status === "critical" || status === "error") {
    return "#ef4444";
  }
  if (status === "warning") {
    return "#f59e0b";
  }
  return "#10b981";
}

function describeSvgArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = svgPolarToCartesian(cx, cy, radius, endAngle);
  const end = svgPolarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function svgPolarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number): { x: number; y: number } {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}

function providerAccountMeterLimit(dimensions: OverviewWidgetDimensions, single: boolean, variant: OverviewAccountVariant): number {
  if (variant === "compact" || variant === "bars" || dimensions.height <= 1) {
    return 1;
  }
  if (single) {
    if (dimensions.height >= 4) return 6;
    if (dimensions.height >= 3) return dimensions.width >= 2 ? 5 : 3;
    return dimensions.width >= 3 ? 3 : 2;
  }
  if (dimensions.height >= 3 && dimensions.width >= 3) {
    return 3;
  }
  return 2;
}

function providerAccountMeterLimitAvoidingOrphanExtra(account: ProviderAccountSnapshot, maxCount: number): number {
  return account.meters.length - maxCount === 1 ? maxCount + 1 : maxCount;
}

function providerAccountContentPaddingClass(dimensions: OverviewWidgetDimensions): string {
  return dimensions.height <= 1 || dimensions.width <= 1 ? "p-2" : "p-3";
}

function providerAccountCardPaddingClass(dimensions: OverviewWidgetDimensions): string {
  return dimensions.height <= 1 || dimensions.width <= 1 ? "p-2" : "p-3";
}

function providerAccountBentoGridRowClass(): string {
  return "auto-rows-fr";
}

function providerAccountBentoSecondaryLimit(dimensions: OverviewWidgetDimensions, span?: ProviderAccountBentoSpan): number {
  if (span?.height === 1 || dimensions.height <= 1) return 0;
  if (span?.height === 2) return dimensions.height >= 3 || dimensions.width >= 2 ? 2 : 1;
  if (dimensions.width <= 1) return 1;
  if (dimensions.height === 2) return 1;
  return 2;
}

type ProviderAccountBentoSpan = {
  height: 1 | 2;
  width: 1 | 2;
};

function providerAccountBentoLayout(accounts: ProviderAccountSnapshot[], dimensions: OverviewWidgetDimensions, cardSizes: Record<string, OverviewAccountCardSize> | undefined): {
  hiddenCount: number;
  items: Array<{ account: ProviderAccountSnapshot; span: ProviderAccountBentoSpan }>;
} {
  const maxUnits = providerAccountBentoMaxUnits(dimensions, accounts.length);
  const items = accounts.map((account) => ({
    account,
    manual: providerAccountConfiguredCardSize(account, cardSizes) !== undefined,
    span: providerAccountBentoSpan(account, dimensions, cardSizes)
  }));
  let usedUnits = providerAccountBentoUsedUnits(items);

  for (let index = items.length - 1; index >= 0 && usedUnits > maxUnits; index -= 1) {
    if (items[index].span.height === 2 && !items[index].manual) {
      usedUnits -= items[index].span.width;
      items[index] = { ...items[index], span: { ...items[index].span, height: 1 } };
    }
  }

  if (usedUnits <= maxUnits) {
    return { hiddenCount: 0, items };
  }

  const visibleBudget = Math.max(0, maxUnits - 1);
  const visibleItems: Array<{ account: ProviderAccountSnapshot; span: ProviderAccountBentoSpan }> = [];
  let visibleUnits = 0;

  for (const item of items) {
    const itemUnits = providerAccountBentoSpanUnits(item.span);
    if (visibleUnits + itemUnits > visibleBudget) {
      break;
    }
    visibleItems.push(item);
    visibleUnits += itemUnits;
  }

  return {
    hiddenCount: accounts.length - visibleItems.length,
    items: visibleItems
  };
}

function providerAccountBentoUsedUnits(items: Array<{ span: ProviderAccountBentoSpan }>): number {
  return items.reduce((total, item) => total + providerAccountBentoSpanUnits(item.span), 0);
}

function providerAccountBentoSpanUnits(span: ProviderAccountBentoSpan): number {
  return span.width * span.height;
}

function providerAccountBentoMaxUnits(dimensions: OverviewWidgetDimensions, itemCount: number): number {
  return Math.max(1, providerAccountBentoColumnCount(dimensions, itemCount) * providerAccountBentoRowCount(dimensions));
}

function providerAccountBentoColumnCount(dimensions: OverviewWidgetDimensions, itemCount: number): 1 | 2 | 3 {
  if (dimensions.width >= 3) return itemCount <= 2 ? 2 : 3;
  if (dimensions.width >= 2) return 2;
  return 1;
}

function providerAccountBentoRowCount(dimensions: OverviewWidgetDimensions): number {
  if (dimensions.height <= 1) return 1;
  if (dimensions.height === 2) return 3;
  if (dimensions.height === 3) return 4;
  return 5;
}

function providerAccountBentoGridClass(dimensions: OverviewWidgetDimensions, itemCount: number): string {
  const columns = providerAccountBentoColumnCount(dimensions, itemCount);
  if (columns === 3) return "grid-cols-3";
  if (columns === 2) return "grid-cols-2";
  return "grid-cols-1";
}

function providerAccountBentoSpan(account: ProviderAccountSnapshot, dimensions: OverviewWidgetDimensions, cardSizes?: Record<string, OverviewAccountCardSize>): ProviderAccountBentoSpan {
  const configuredSize = providerAccountConfiguredCardSize(account, cardSizes);
  if (configuredSize) {
    return providerAccountBentoSpanFromSize(configuredSize, dimensions);
  }
  if (dimensions.height <= 1) return { height: 1, width: 1 };
  if (dimensions.width <= 1) return { height: 1, width: 1 };
  if (providerAccountQuotaMeters(account).length > 0) return { height: 2, width: 1 };
  if (dimensions.height >= 3 && account.meters.length > 2) return { height: 2, width: 1 };
  return { height: 1, width: 1 };
}

function providerAccountConfiguredCardSize(account: ProviderAccountSnapshot, cardSizes?: Record<string, OverviewAccountCardSize>): OverviewAccountCardSize | undefined {
  return cardSizes?.[providerAccountSnapshotKey(account)] ?? cardSizes?.[account.provider];
}

function providerAccountBentoSpanFromSize(size: OverviewAccountCardSize, dimensions: OverviewWidgetDimensions): ProviderAccountBentoSpan {
  const [widthText, heightText] = size.split(":");
  return {
    height: providerAccountClampBentoSpanDimension(heightText === "2" ? 2 : 1, providerAccountBentoRowCount(dimensions) >= 2 ? 2 : 1),
    width: providerAccountClampBentoSpanDimension(widthText === "2" ? 2 : 1, providerAccountBentoColumnCount(dimensions, 2) >= 2 ? 2 : 1)
  };
}

function providerAccountBentoSizeFromSpan(span: ProviderAccountBentoSpan): OverviewAccountCardSize {
  return `${span.width}:${span.height}` as OverviewAccountCardSize;
}

function providerAccountClampBentoSpanDimension(value: 1 | 2, max: 1 | 2): 1 | 2 {
  return max === 1 ? 1 : value;
}

function providerAccountBentoSpanClass(span: ProviderAccountBentoSpan): string {
  return cn(
    span.width === 2 ? "col-span-2" : "col-span-1",
    span.height === 2 ? "row-span-2" : "row-span-1"
  );
}

function providerAccountGapClass(dimensions: OverviewWidgetDimensions): string {
  return dimensions.height <= 1 || dimensions.width <= 1 ? "gap-2" : "gap-3";
}

function providerAccountStackClass(dimensions: OverviewWidgetDimensions): string {
  return dimensions.height <= 1 ? "space-y-1.5" : "space-y-2.5";
}

function providerAccountGridClass(dimensions: OverviewWidgetDimensions, itemCount: number): string {
  if (dimensions.width >= 3) return itemCount <= 2 ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3";
  if (dimensions.width >= 2) return "md:grid-cols-2";
  return "";
}

function providerAccountShowSource(dimensions: OverviewWidgetDimensions): boolean {
  return dimensions.height >= 2 && dimensions.width >= 2;
}

function providerAccountShowRefreshTime(dimensions: OverviewWidgetDimensions): boolean {
  return dimensions.height >= 2 && dimensions.width >= 2;
}

function providerAccountShowRefresh(dimensions: OverviewWidgetDimensions): boolean {
  return dimensions.width >= 2;
}

function providerAccountShowProgress(dimensions: OverviewWidgetDimensions): boolean {
  return dimensions.height >= 1;
}

export function AgentAnalysisView({
  agentFilter,
  error,
  loading,
  range,
  refreshAnalysis,
  selectedSession,
  setAgentFilter,
  setRange,
  setSelectedSession,
  snapshot
}: {
  agentFilter: AgentFilterValue;
  error: string;
  loading: boolean;
  range: UsageStatsRange;
  refreshAnalysis: () => void;
  selectedSession?: AgentAnalysisSessionSelection;
  setAgentFilter: (value: AgentFilterValue) => void;
  setRange: (range: UsageStatsRange) => void;
  setSelectedSession: (value?: AgentAnalysisSessionSelection) => void;
  snapshot: AgentAnalysisSnapshot;
}) {
  const t = useAppText();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col gap-4 pr-1"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">{t("Sessions")}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {formatCompactNumber(snapshot.sessions.length)} {t("Sessions")} / {formatCompactNumber(snapshot.scannedRequestCount)} {t("Requests")}
          </div>
        </div>
        <div className="min-w-0 flex-1" />
        <Select
          aria-label={t("Filter agent")}
          className="h-8 w-[160px] bg-[length:14px] px-2 pr-7 text-[12px]"
          onValueChange={(value) => setAgentFilter(normalizeAgentFilterValue(value))}
          options={translateOptions(agentFilterOptions, t)}
          value={agentFilter}
        />
        <div className="flex rounded-md border border-border bg-background p-0.5">
          {agentAnalysisRangeOptions.map((option) => (
            <Button
              className={cn(
                "h-7 rounded px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                range === option.value && "bg-card text-foreground shadow-sm"
              )}
              key={option.value}
              onClick={() => setRange(option.value)}
              type="button"
              unstyled
            >
              {t(option.label)}
            </Button>
          ))}
        </div>
        <Button aria-label={t("Refresh observability")} className="h-8 gap-1.5 px-2.5 text-[12px]" onClick={refreshAnalysis} title={t("Refresh observability")} type="button" variant="outline">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {t("Refresh")}
        </Button>
      </div>

      {error ? (
        <div className="flex shrink-0 items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {snapshot.requestScanTruncated ? (
        <AnalysisNotice>
          {t("Analysis is limited to the newest")} {formatCompactNumber(snapshot.requestScanLimit)} {t("requests in the selected range.")}
        </AnalysisNotice>
      ) : null}

      {selectedSession || snapshot.selectedSession ? (
        <AgentSessionDetailCard
          clearSession={() => setSelectedSession(undefined)}
          detail={snapshot.selectedSession}
          loading={loading}
          selectedSession={selectedSession}
        />
      ) : null}

      <section className="min-h-0 flex-1">
        <AgentSessionsCard
          onSelectSession={setSelectedSession}
          selectedSession={selectedSession}
          sessions={snapshot.sessions}
        />
      </section>
    </motion.div>
  );
}

function AgentSessionDetailCard({
  clearSession,
  detail,
  loading,
  selectedSession
}: {
  clearSession: () => void;
  detail?: AgentAnalysisSnapshot["selectedSession"];
  loading: boolean;
  selectedSession?: AgentAnalysisSessionSelection;
}) {
  const t = useAppText();
  const session = detail?.session;
  const headerLabel = session
    ? `${t(agentKindLabel(session.agent))} / ${compactId(session.id)}`
    : selectedSession
      ? `${t(agentKindLabel(selectedSession.agent))} / ${compactId(selectedSession.id)}`
      : t("Session");
  const [detailTab, setDetailTab] = useState<AgentSessionDetailTab>("trace");

  return (
    <Dialog className="items-start" onOpenChange={(open) => !open && clearSession()} open>
      <DialogContent className="h-[calc(100dvh-1.5rem)] max-w-[1200px] origin-top sm:h-[min(900px,calc(100dvh-3rem))]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Trace Detail")}</DialogTitle>
            <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={session?.id ?? selectedSession?.id}>
              {headerLabel}
            </div>
          </div>
          <Button aria-label={t("Close")} onClick={clearSession} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-3.5 w-3.5" />
          </Button>
        </DialogHeader>
        <DialogBody className={detailTab === "trajectory" ? "overflow-hidden" : undefined}>
        {!detail ? (
          <AnalysisEmptyState label={t(loading ? "Loading session metrics" : "Session not found or outside the selected range")} />
        ) : (
          <div className={detailTab === "trajectory" ? "flex h-full min-h-0 flex-col gap-4" : "space-y-4"}>
            <AgentSessionDetailTabs activeTab={detailTab} setActiveTab={setDetailTab} />

            {detailTab === "trace" ? <AgentTracePanel trace={detail.trace} /> : null}
            {detailTab === "trajectory" ? <AgentSessionTrajectoryPanel detail={detail} /> : null}
            {detailTab === "requests" ? <AgentSessionRequestsPanel detail={detail} /> : null}
          </div>
        )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

type AgentSessionDetailTab = "requests" | "trace" | "trajectory";

function AgentSessionDetailTabs({
  activeTab,
  setActiveTab
}: {
  activeTab: AgentSessionDetailTab;
  setActiveTab: (tab: AgentSessionDetailTab) => void;
}) {
  const t = useAppText();
  const tabs: Array<{ label: string; value: AgentSessionDetailTab }> = [
    { label: "Call chain", value: "trace" },
    { label: "Session Trajectory", value: "trajectory" },
    { label: "Session Records", value: "requests" }
  ];

  return (
    <Tabs
      className="inline-flex max-w-full"
      onValueChange={(value) => setActiveTab(value as AgentSessionDetailTab)}
      value={activeTab}
    >
      <TabsList aria-label={t("Trace Detail")} className="w-fit max-w-full flex-wrap items-center gap-1 rounded-md border border-border bg-background p-1">
        {tabs.map((tab) => (
          <TabsTrigger
            className="h-8 rounded px-3 text-[12px] font-medium data-[state=active]:bg-card data-[state=active]:text-foreground"
            key={tab.value}
            value={tab.value}
          >
            {t(tab.label)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function AgentSessionRequestsPanel({ detail }: { detail: AgentSessionDetail }) {
  const t = useAppText();
  const requests = useMemo(() => [...detail.requests].sort(compareSessionRequestsByTime), [detail.requests]);
  const [selectedRequestLogId, setSelectedRequestLogId] = useState<number>();

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold">{t("Session Records")}</div>
      </div>
      {requests.length === 0 ? (
        <AnalysisEmptyState label={t("No session records")} />
      ) : (
        <div className={cn("max-h-[620px]", agentListFrameClassName)}>
          <table className={cn("min-w-[1060px]", agentListTableClassName)}>
            <thead className={agentListHeadClassName}>
              <tr>
                <th className="px-3 py-2 font-semibold">{t("Time")}</th>
                <th className="px-3 py-2 font-semibold">{t("Status")}</th>
                <th className="px-3 py-2 font-semibold">{t("Route")}</th>
                <th className="px-3 py-2 font-semibold">{t("Model")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Tools")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Token")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Cost")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Duration")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Details")}</th>
              </tr>
            </thead>
            <tbody className={agentListBodyClassName}>
              {requests.map((request) => (
                <tr className={agentListRowClassName()} key={request.id}>
                  <td className="px-3 py-2 font-mono">{formatLogDateTime(request.createdAt)}</td>
                  <td className="px-3 py-2 font-semibold">{request.statusCode || "-"}</td>
                  <td className="max-w-[140px] px-3 py-2" title={formatRouteReason(request.routeReason)}>{formatRouteReason(request.routeReason)}</td>
                  <td className="max-w-[300px] px-3 py-2" title={`${request.provider}/${request.model}`}>{request.provider}/{request.model}</td>
                  <td className="px-3 py-2 text-right" title={request.tools.join(", ")}>{formatCompactNumber(request.toolCallCount)}</td>
                  <td className="px-3 py-2 text-right">{formatCompactNumber(request.totalTokens)}</td>
                  <td className="px-3 py-2 text-right">{formatUsdCost(request.costUsd ?? 0)}</td>
                  <td className="px-3 py-2 text-right">{formatDuration(request.durationMs)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setSelectedRequestLogId(request.id)}
                      type="button"
                      variant="outline"
                    >
                      {t("View details")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {typeof selectedRequestLogId === "number" ? (
        <AgentSessionRequestLogDialog
          onClose={() => setSelectedRequestLogId(undefined)}
          requestLogId={selectedRequestLogId}
        />
      ) : null}
    </div>
  );
}

function AgentSessionRequestLogDialog({
  onClose,
  requestLogId
}: {
  onClose: () => void;
  requestLogId: number;
}) {
  const t = useAppText();
  const [entry, setEntry] = useState<RequestLogEntry>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setEntry(undefined);
    setError("");
    setLoading(true);

    if (!window.ccr?.getRequestLogDetail) {
      setError(t("Request log detail is unavailable."));
      setLoading(false);
      return () => {
        active = false;
      };
    }

    void window.ccr.getRequestLogDetail({ id: requestLogId })
      .then((detail) => {
        if (!active) {
          return;
        }
        if (detail) {
          setEntry(detail);
        } else {
          setError(t("Request log not found."));
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : String(requestError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [requestLogId, t]);

  return (
    <Dialog className="items-start" onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="h-[calc(100dvh-1.5rem)] max-w-[1180px] origin-top sm:h-[min(820px,calc(100dvh-3rem))]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Request Log")}</DialogTitle>
            <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={String(requestLogId)}>
              #{requestLogId}{entry ? ` · ${entry.method} ${entry.path}` : ""}
            </div>
          </div>
          <Button aria-label={t("Close")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-3.5 w-3.5" />
          </Button>
        </DialogHeader>
        <DialogBody className="overflow-auto p-0">
          {entry ? (
            <LogExpandedDetails detailError={error} detailLoading={loading} entry={entry} />
          ) : (
            <div className="flex min-h-[360px] items-center justify-center px-4 py-8 text-center text-[12px] text-muted-foreground">
              {loading ? (
                <div className="flex items-center gap-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  <span>{t("Loading full payload...")}</span>
                </div>
              ) : (
                <div className={cn("rounded-md border px-4 py-3 font-semibold", error && "border-rose-200 bg-rose-50 text-rose-700")}>
                  {error || t("Request log not found.")}
                </div>
              )}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function AgentSessionTrajectoryPanel({ detail }: { detail: AgentSessionDetail }) {
  const t = useAppText();
  const trajectory = useMemo(() => buildAgentTrajectoryTree(detail), [detail]);
  const expandableNodeIds = useMemo(() => trajectory.flat.filter(trajectoryNodeHasVisibleChildren).map((node) => node.id), [trajectory.flat]);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set(expandableNodeIds));
  const [query, setQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(true);
  const visibleRows = useMemo(() => visibleTrajectoryRows(trajectory.roots, expandedNodeIds, query), [expandedNodeIds, query, trajectory.roots]);
  const listNodes = useMemo(() => trajectory.flat.filter(isTrajectoryListNode), [trajectory.flat]);
  const defaultSelectedNode =
    listNodes.find((node) => node.kind === "assistant" && node.content.trim()) ??
    listNodes.find((node) => node.content.trim()) ??
    listNodes[0];
  const selectedNode = listNodes.find((node) => node.id === selectedNodeId) ?? defaultSelectedNode;
  const callCount = detail.trace.llmRunCount + detail.trace.toolRunCount + detail.trace.subagentRunCount;

  useEffect(() => {
    setExpandedNodeIds(new Set(expandableNodeIds));
  }, [detail.conversation.length, detail.requests.length, detail.session.id, detail.trace.runCount, expandableNodeIds]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold">{t("Session Trajectory")}</div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={detail.trace.sessionId}>
            {compactId(detail.trace.sessionId)} | {formatLogDateTime(detail.trace.startedAt)} - {formatLogDateTime(detail.trace.endedAt)}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <Badge variant="outline">{t("Duration")} {formatDuration(detail.trace.durationMs)}</Badge>
          <Badge variant="outline">{formatCompactNumber(detail.conversation.length)} {t("Turns")}</Badge>
          <Badge variant="outline">{formatCompactNumber(callCount)} {t("Calls")}</Badge>
          <input
            aria-label={t("Search")}
            className="h-7 w-[190px] rounded-md border border-border bg-background px-2 text-[11px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search")}
            value={query}
          />
        </div>
      </div>

      <div className={cn(
        "grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-hidden",
        detailDrawerOpen && "lg:grid-cols-[minmax(0,1fr)_430px]"
      )}>
        <div className={cn("min-h-0 min-w-0 overflow-auto", detailDrawerOpen && "border-b border-border/60 lg:border-b-0 lg:border-r")}>
          {listNodes.length === 0 ? (
            <AnalysisEmptyState label={t("No trajectory events")} />
          ) : visibleRows.length === 0 ? (
            <AnalysisEmptyState label={t("No matching events")} />
          ) : (
            <div className="divide-y divide-border/50">
              {visibleRows.map(({ level, node }) => (
                <AgentTrajectoryNodeRow
                  expanded={expandedNodeIds.has(node.id)}
                  key={node.id}
                  level={level}
                  node={node}
                  selected={selectedNode?.id === node.id}
                  onSelect={() => {
                    setSelectedNodeId(node.id);
                    setDetailDrawerOpen(true);
                  }}
                  onToggle={() => toggleNode(node.id)}
                />
              ))}
            </div>
          )}
        </div>
        {detailDrawerOpen ? (
          <AgentTrajectoryDetailPanel
            node={selectedNode}
            onClose={() => setDetailDrawerOpen(false)}
          />
        ) : null}
      </div>
    </section>
  );
}

const agentListSurfaceClassName = "rounded-md border border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const agentListFrameClassName = cn("overflow-auto", agentListSurfaceClassName);
const agentListTableClassName = "w-full border-collapse text-left text-[11px]";
const agentListHeadClassName = "sticky top-0 z-10 border-b border-border/70 bg-muted/80 text-muted-foreground backdrop-blur [&_th]:min-w-[64px] [&_th]:whitespace-nowrap";
const agentListBodyClassName = "divide-y divide-border/50";

function agentListRowClassName({
  danger,
  selected,
  warning
}: {
  danger?: boolean;
  selected?: boolean;
  warning?: boolean;
} = {}) {
  return cn(
    "bg-card/40 transition-colors hover:bg-muted/30",
    danger && "bg-rose-500/5 hover:bg-rose-500/10",
    warning && "bg-amber-500/5 hover:bg-amber-500/10",
    selected && "bg-teal-500/10 shadow-[inset_2px_0_0_rgba(20,184,166,0.7)] hover:bg-teal-500/15"
  );
}

type AgentSessionDetail = NonNullable<AgentAnalysisSnapshot["selectedSession"]>;
type AgentTraceDetail = AgentSessionDetail["trace"];
type AgentConversationTurn = AgentSessionDetail["conversation"][number];
type AgentConversationItem = NonNullable<AgentConversationTurn["messages"]>[number];
type TracePayloadPreviewValue = NonNullable<NonNullable<AgentAnalysisTraceRun["tool"]>["input"]>;
type AgentSyntheticTrajectoryNodeKind = "tool-result";
type AgentTrajectoryNodeKind = AgentAnalysisTraceRun["kind"] | AgentConversationItem["role"] | AgentSyntheticTrajectoryNodeKind;
type AgentTrajectoryDetailTab = "preview" | "raw";

type AgentTrajectoryNode = {
  children: AgentTrajectoryNode[];
  content: string;
  costUsd?: number;
  createdAt: string;
  durationMs: number;
  error?: string;
  id: string;
  kind: AgentTrajectoryNodeKind;
  model?: string;
  offsetMs: number;
  provider?: string;
  requestId?: string;
  requestLogId?: number;
  run?: AgentAnalysisTraceRun;
  message?: AgentConversationItem;
  sourcePreview?: boolean;
  sourceTruncated?: boolean;
  status: AgentAnalysisTraceRun["status"];
  statusCode?: number;
  stepIndex: number;
  title: string;
  totalTokens: number;
  truncated?: boolean;
  turn?: AgentConversationTurn;
  turnIndex?: number;
};

type AgentTrajectoryVisibleRow = {
  level: number;
  node: AgentTrajectoryNode;
};

function compareSessionRequestsByTime(left: AgentSessionDetail["requests"][number], right: AgentSessionDetail["requests"][number]): number {
  return sortableTimestamp(left.createdAt) - sortableTimestamp(right.createdAt) || left.id - right.id;
}

function compareConversationTurnsByTime(left: AgentConversationTurn, right: AgentConversationTurn): number {
  return sortableTimestamp(left.createdAt) - sortableTimestamp(right.createdAt) || left.id - right.id;
}

function compareTraceRunsByTime(left: AgentAnalysisTraceRun, right: AgentAnalysisTraceRun): number {
  return (
    sortableTimestamp(left.startedAt) - sortableTimestamp(right.startedAt) ||
    left.offsetMs - right.offsetMs ||
    left.depth - right.depth ||
    left.id.localeCompare(right.id)
  );
}

function sortableTimestamp(value: string | undefined): number {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? time : 0;
}

function buildAgentTrajectoryTree(detail: AgentSessionDetail): { flat: AgentTrajectoryNode[]; roots: AgentTrajectoryNode[] } {
  const sortedRuns = [...detail.trace.runs].sort(compareTraceRunsByTime);
  const requestRunsByRequestId = new Map<string, AgentAnalysisTraceRun[]>();
  const requestByRequestId = new Map(detail.requests.map((request) => [request.requestId, request]));
  const roots: AgentTrajectoryNode[] = [];
  const handledRunIds = new Set<string>();

  for (const run of sortedRuns) {
    if (run.requestId && !(run.kind === "agent" && run.id === detail.trace.rootRunId)) {
      const requestRuns = requestRunsByRequestId.get(run.requestId) ?? [];
      requestRuns.push(run);
      requestRunsByRequestId.set(run.requestId, requestRuns);
    }
  }

  [...detail.conversation].sort((left, right) => compareConversationTurnsByTime(left, right)).forEach((turn, index) => {
    const requestRuns = requestRunsByRequestId.get(turn.requestId) ?? [];
    const request = requestByRequestId.get(turn.requestId);
    const status = turn.statusCode >= 400 ? "error" : "success";
    const turnStartMs = sortableTimestamp(turn.createdAt);
    const traceStartMs = sortableTimestamp(detail.trace.startedAt);
    const offsetMs = Math.max(0, turnStartMs - traceStartMs);
    const messageNodes = conversationItemsForTurn(turn).map((message, messageIndex) =>
      conversationTrajectoryNode({
        content: message.content,
        id: `conversation:${turn.id}:${message.id}`,
        index,
        kind: message.role,
        message,
        offsetMs: offsetMs + messageIndex * 0.001,
        requestTokens: message.role === "assistant"
          ? request?.outputTokens ?? 0
          : message.role === "user"
            ? request?.inputTokens ?? 0
            : 0,
        sourcePreview: message.sourcePreview,
        sourceTruncated: message.sourceTruncated,
        status,
        title: trajectoryRoleTitle(message.role),
        truncated: message.truncated,
        turn
      })
    );

    roots.push(...messageNodes);

    const operationParent =
      [...messageNodes].reverse().find((node) => node.kind === "user") ??
      messageNodes.find((node) => node.kind !== "assistant") ??
      messageNodes[0];

    appendRunNodesToTrajectory({
      handledRunIds,
      parent: operationParent,
      roots,
      runs: requestRuns
    });
  });

  appendRunNodesToTrajectory({
    handledRunIds,
    roots,
    runs: sortedRuns.filter((run) => !(run.kind === "agent" && run.id === detail.trace.rootRunId) && !handledRunIds.has(run.id))
  });

  sortTrajectoryNodes(roots);
  const flat: AgentTrajectoryNode[] = [];
  let stepIndex = 1;
  const collect = (node: AgentTrajectoryNode) => {
    node.stepIndex = stepIndex;
    stepIndex += 1;
    flat.push(node);
    node.children.forEach(collect);
  };
  roots.forEach(collect);
  return { flat, roots };
}

function appendRunNodesToTrajectory({
  handledRunIds,
  parent,
  roots,
  runs
}: {
  handledRunIds: Set<string>;
  parent?: AgentTrajectoryNode;
  roots: AgentTrajectoryNode[];
  runs: AgentAnalysisTraceRun[];
}) {
  const runByRunId = new Map(runs.map((run) => [run.id, run]));
  const runNodeByRunId = new Map<string, AgentTrajectoryNode>();
  for (const run of runs) {
    if (handledRunIds.has(run.id)) {
      continue;
    }
    handledRunIds.add(run.id);
    if (!isTrajectoryTraceRunVisible(run)) {
      continue;
    }
    const node = traceRunTrajectoryNode(run);
    runNodeByRunId.set(run.id, node);
  }

  for (const run of runs) {
    const node = runNodeByRunId.get(run.id);
    if (!node) {
      continue;
    }
    const parentNode = findVisibleTrajectoryRunParent(run, runByRunId, runNodeByRunId);
    if (parentNode) {
      parentNode.children.push(node);
    } else if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
}

function findVisibleTrajectoryRunParent(
  run: AgentAnalysisTraceRun,
  runByRunId: Map<string, AgentAnalysisTraceRun>,
  runNodeByRunId: Map<string, AgentTrajectoryNode>
): AgentTrajectoryNode | undefined {
  let parentId = run.parentId;
  while (parentId) {
    const visibleParent = runNodeByRunId.get(parentId);
    if (visibleParent) {
      return visibleParent;
    }
    parentId = runByRunId.get(parentId)?.parentId;
  }
  return undefined;
}

function isTrajectoryTraceRunVisible(run: AgentAnalysisTraceRun): boolean {
  return run.kind === "subagent" || run.kind === "tool";
}

function traceRunTrajectoryNode(run: AgentAnalysisTraceRun): AgentTrajectoryNode {
  const node: AgentTrajectoryNode = {
    children: [],
    content: trajectoryRunContent(run),
    costUsd: run.costUsd,
    createdAt: run.startedAt,
    durationMs: run.durationMs,
    error: run.error,
    id: `run:${run.id}`,
    kind: run.kind,
    model: run.model,
    offsetMs: run.offsetMs,
    provider: run.provider,
    requestId: run.requestId,
    requestLogId: run.requestLogId,
    run,
    status: run.status,
    statusCode: run.statusCode,
    stepIndex: 0,
    title: run.kind === "tool" ? run.toolName || run.name : run.name,
    totalTokens: run.totalTokens
  };
  if (run.kind === "tool") {
    const resultNode = toolResultTrajectoryNode(run);
    if (resultNode) {
      node.children.push(resultNode);
    }
  }
  return node;
}

function toolResultTrajectoryNode(run: AgentAnalysisTraceRun): AgentTrajectoryNode | undefined {
  const result = run.tool?.result?.preview.trim();
  if (!result) {
    return undefined;
  }
  return {
    children: [],
    content: result,
    createdAt: run.endedAt,
    durationMs: 0,
    error: run.error,
    id: `run:${run.id}:tool-result`,
    kind: "tool-result",
    offsetMs: run.offsetMs + run.durationMs + 0.001,
    requestId: run.tool?.resultRequestId ?? run.requestId,
    requestLogId: run.tool?.resultRequestLogId ?? run.requestLogId,
    run,
    status: run.status,
    statusCode: run.statusCode,
    stepIndex: 0,
    title: "Tool result",
    totalTokens: 0
  };
}

function conversationItemsForTurn(turn: AgentConversationTurn): AgentConversationItem[] {
  const messages = turn.messages?.filter((message) => message.content.trim()) ?? [];
  if (messages.length > 0) {
    return messages;
  }

  const items: AgentConversationItem[] = [];
  if (turn.user?.content.trim()) {
    items.push({
      ...turn.user,
      id: "legacy:user",
      role: "user"
    });
  }
  if (turn.assistant?.content.trim()) {
    items.push({
      ...turn.assistant,
      id: "legacy:assistant",
      role: "assistant"
    });
  }
  return items;
}

function conversationTrajectoryNode({
  content,
  id,
  index,
  kind,
  message,
  offsetMs,
  requestTokens,
  sourcePreview,
  sourceTruncated,
  status,
  title,
  truncated,
  turn
}: {
  content: string;
  id: string;
  index: number;
  kind: AgentConversationItem["role"];
  message?: AgentConversationItem;
  offsetMs: number;
  requestTokens: number;
  sourcePreview: boolean;
  sourceTruncated: boolean;
  status: AgentAnalysisTraceRun["status"];
  title: string;
  truncated: boolean;
  turn: AgentConversationTurn;
}): AgentTrajectoryNode {
  return {
    children: [],
    content,
    createdAt: turn.createdAt,
    durationMs: kind === "assistant" ? turn.durationMs : 0,
    id,
    kind,
    message,
    model: turn.model,
    offsetMs,
    provider: turn.provider,
    requestId: turn.requestId,
    requestLogId: turn.id,
    sourcePreview,
    sourceTruncated,
    status,
    statusCode: turn.statusCode,
    stepIndex: 0,
    title,
    totalTokens: requestTokens,
    truncated,
    turn,
    turnIndex: index + 1
  };
}

function trajectoryRoleTitle(role: AgentConversationItem["role"]): string {
  if (role === "assistant") return "Assistant";
  if (role === "context") return "Context";
  if (role === "developer") return "Developer";
  if (role === "system") return "System";
  if (role === "tool") return "Tool";
  return "User";
}

function sortTrajectoryNodes(nodes: AgentTrajectoryNode[]): void {
  nodes.sort(compareTrajectoryNodes);
  for (const node of nodes) {
    sortTrajectoryNodes(node.children);
  }
}

function compareTrajectoryNodes(left: AgentTrajectoryNode, right: AgentTrajectoryNode): number {
  return left.offsetMs - right.offsetMs || trajectoryNodePriority(left.kind) - trajectoryNodePriority(right.kind) || left.title.localeCompare(right.title);
}

function trajectoryNodePriority(kind: AgentTrajectoryNodeKind): number {
  if (kind === "agent") return 0;
  if (kind === "user") return 1;
  if (kind === "subagent") return 2;
  if (kind === "route") return 3;
  if (kind === "llm") return 4;
  if (kind === "tool") return 5;
  if (kind === "tool-result") return 6;
  return 7;
}

function visibleTrajectoryRows(nodes: AgentTrajectoryNode[], expandedNodeIds: Set<string>, query: string): AgentTrajectoryVisibleRow[] {
  const normalizedQuery = query.trim().toLowerCase();
  const rows: AgentTrajectoryVisibleRow[] = [];
  const visit = (node: AgentTrajectoryNode, level: number) => {
    if (normalizedQuery && !trajectorySubtreeMatches(node, normalizedQuery)) {
      return;
    }
    const visible = isTrajectoryListNode(node);
    if (visible) {
      rows.push({ level, node });
    }
    if (normalizedQuery || !visible || expandedNodeIds.has(node.id)) {
      node.children.forEach((child) => visit(child, visible ? level + 1 : level));
    }
  };
  nodes.forEach((node) => visit(node, 0));
  return rows;
}

function isTrajectoryListNode(node: AgentTrajectoryNode): boolean {
  return node.kind !== "agent" && node.kind !== "llm" && node.kind !== "route";
}

function trajectoryNodeHasVisibleChildren(node: AgentTrajectoryNode): boolean {
  return node.children.some((child) => isTrajectoryListNode(child) || trajectoryNodeHasVisibleChildren(child));
}

function trajectorySubtreeMatches(node: AgentTrajectoryNode, normalizedQuery: string): boolean {
  return trajectoryNodeSearchText(node).includes(normalizedQuery) || node.children.some((child) => trajectorySubtreeMatches(child, normalizedQuery));
}

function trajectoryNodeSearchText(node: AgentTrajectoryNode): string {
  return [
    node.title,
    node.content,
    node.requestId,
    node.model,
    node.provider,
    node.error,
    trajectoryNodeKindLabel(node.kind)
  ].filter(Boolean).join(" ").toLowerCase();
}

function AgentTracePanel({ trace }: { trace: AgentTraceDetail }) {
  const t = useAppText();
  const durationMs = Math.max(trace.durationMs, 1);
  const runs = useMemo(() => [...trace.runs].sort(compareTraceRunsByTime), [trace.runs]);
  const [selectedToolRun, setSelectedToolRun] = useState<AgentAnalysisTraceRun>();

  return (
    <div className="min-w-0">
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold">{t("Call chain")}</div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={trace.sessionId}>
            {compactId(trace.sessionId)} - {formatLogDateTime(trace.startedAt)}{" -> "}{formatLogDateTime(trace.endedAt)}
          </div>
        </div>
        <Badge variant="outline">{formatCompactNumber(trace.runCount)} {t("Runs")}</Badge>
      </div>

      {runs.length === 0 ? (
        <AnalysisEmptyState label={t("No trace runs")} />
      ) : (
        <div className={cn("max-h-[520px]", agentListFrameClassName)}>
          <table className={cn("min-w-[1260px]", agentListTableClassName)}>
            <thead className={agentListHeadClassName}>
              <tr>
                <th className="px-3 py-2 font-semibold">{t("Run")}</th>
                <th className="px-3 py-2 font-semibold">{t("Timeline")}</th>
                <th className="px-3 py-2 font-semibold">{t("Status")}</th>
                <th className="px-3 py-2 font-semibold">{t("Target")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Token")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Cost")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Concurrency")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Duration")}</th>
              </tr>
            </thead>
            <tbody className={agentListBodyClassName}>
              {runs.map((run) => (
                <tr className={agentListRowClassName({
                  danger: run.status === "error",
                  warning: run.status === "partial"
                })} key={run.id}>
                  <td className="max-w-[360px] px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${Math.min(run.depth, 8) * 16}px` }}>
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", traceRunDotClass(run))} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold" title={run.name}>{run.name}</div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="font-mono uppercase">{t(traceRunKindLabel(run.kind))}</span>
                          {run.requestId ? <span className="truncate font-mono" title={run.requestId}>{compactId(run.requestId)}</span> : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="relative h-5 min-w-[260px] rounded bg-muted/50">
                      <div
                        className={cn("absolute top-1/2 h-2 -translate-y-1/2 rounded-full", traceRunBarClass(run))}
                        style={traceRunBarStyle(run, durationMs)}
                        title={`${formatDuration(run.durationMs)} | +${formatDuration(run.offsetMs)}`}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={cn("border", traceRunStatusBadgeClass(run.status))} variant="outline">
                      {t(traceRunStatusLabel(run.status))}
                    </Badge>
                  </td>
                  <td className="max-w-[260px] px-3 py-2" title={traceRunTarget(run)}>
                    <TraceRunTarget run={run} onOpenTool={() => setSelectedToolRun(run)} />
                  </td>
                  <td className="px-3 py-2 text-right">{run.totalTokens > 0 ? formatCompactNumber(run.totalTokens) : "-"}</td>
                  <td className="px-3 py-2 text-right">{run.cacheReadTokens + run.cacheWriteTokens > 0 ? formatCompactNumber(run.cacheReadTokens + run.cacheWriteTokens) : "-"}</td>
                  <td className="px-3 py-2 text-right">{run.costUsd !== undefined ? formatUsdCost(run.costUsd) : "-"}</td>
                  <td className="px-3 py-2 text-right">{formatCompactNumber(run.concurrentRequests)}</td>
                  <td className="px-3 py-2 text-right">{formatDuration(run.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedToolRun ? (
        <ToolPayloadDialog
          run={selectedToolRun}
          onClose={() => setSelectedToolRun(undefined)}
        />
      ) : null}
    </div>
  );
}

function TraceRunTarget({
  onOpenTool,
  run
}: {
  onOpenTool: () => void;
  run: AgentAnalysisTraceRun;
}) {
  const t = useAppText();
  if (run.kind !== "tool") {
    return <span>{traceRunTarget(run)}</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate" title={traceRunTarget(run)}>{traceRunTarget(run)}</span>
      {run.tool ? (
        <Button className="h-6 shrink-0 border-border bg-transparent px-2 text-[10px] shadow-none hover:bg-transparent active:bg-transparent" onClick={onOpenTool} type="button" variant="outline">
          {t("Parameters")} / {t("Result")}
        </Button>
      ) : null}
    </div>
  );
}

function AgentTrajectoryNodeRow({
  expanded,
  level,
  node,
  onSelect,
  onToggle,
  selected
}: {
  expanded: boolean;
  level: number;
  node: AgentTrajectoryNode;
  onSelect: () => void;
  onToggle: () => void;
  selected: boolean;
}) {
  const t = useAppText();
  const preview = trajectoryNodePreview(trajectoryNodeListContent(node, t));
  const hasChildren = trajectoryNodeHasVisibleChildren(node);

  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-start bg-card/30 px-2.5 py-2 text-left transition-colors [contain-intrinsic-size:36px] [content-visibility:auto] hover:bg-muted/40",
        selected && "bg-primary/10 shadow-[inset_2px_0_0_hsl(var(--primary))] hover:bg-primary/10"
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingLeft: `${Math.min(level, 10) * 18}px` }}>
        {hasChildren ? (
          <button
            aria-label={t(expanded ? "Collapse" : "Expand")}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            title={t(expanded ? "Collapse" : "Expand")}
            type="button"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <span className={cn("min-w-[84px] shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[9px] font-semibold uppercase", trajectoryNodeBadgeClass(node))}>
          {trajectoryNodeRoleTag(node.kind)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/90" title={preview || trajectoryNodeTitle(node, t)}>
          {preview || trajectoryNodeTitle(node, t)}
        </span>
      </div>
    </div>
  );
}

function AgentTrajectoryDetailPanel({
  node,
  onClose
}: {
  node?: AgentTrajectoryNode;
  onClose: () => void;
}) {
  const t = useAppText();
  const [tab, setTab] = useState<AgentTrajectoryDetailTab>("preview");

  useEffect(() => {
    setTab("preview");
  }, [node?.id]);

  if (!node) {
    return <AnalysisEmptyState label={t("No trajectory events")} />;
  }

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background/80 shadow-[-8px_0_18px_rgba(15,23,42,0.04)]">
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn("rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase", trajectoryNodeBadgeClass(node))}>
              {trajectoryNodeRoleTag(node.kind)}
            </span>
            <span className="truncate text-[12px] font-medium" title={trajectoryNodeTitle(node, t)}>
              {trajectoryNodeTitle(node, t)}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {node.turnIndex ? `${t("Round")} ${node.turnIndex} | ` : ""}{t("Step")} {node.stepIndex}
          </div>
        </div>
        <Button aria-label={t("Collapse details")} onClick={onClose} size="iconSm" title={t("Collapse details")} type="button" variant="ghost">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex shrink-0 border-b border-border/60 px-3">
        {(["preview", "raw"] as AgentTrajectoryDetailTab[]).map((item) => (
          <button
            className={cn(
              "h-10 border-b-2 px-2 text-[12px] font-medium transition-colors",
              tab === item ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            key={item}
            onClick={() => setTab(item)}
            type="button"
          >
            {t(item === "preview" ? "Preview" : "Raw")}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "preview" ? <AgentTrajectoryNodePreview node={node} /> : null}
        {tab === "raw" ? <TracePayloadContent content={trajectoryNodeRawJson(node)} kind="json" /> : null}
      </div>
    </aside>
  );
}

function AgentTrajectoryNodePreview({ node }: { node: AgentTrajectoryNode }) {
  const t = useAppText();
  const run = node.run;
  const tool = run?.tool;
  const inputRequest = tool && run?.requestLogId
    ? { callId: tool.callId, part: "tool-input" as const, requestLogId: run.requestLogId }
    : undefined;
  const resultRequest = tool?.resultRequestLogId
    ? { callId: tool.callId, part: "tool-result" as const, requestLogId: tool.resultRequestLogId }
    : undefined;

  if (node.kind === "tool-result") {
    return <TracePayloadContent content={node.content} kind={node.content.trim() ? "text" : "empty"} />;
  }

  if (run?.kind === "tool") {
    return (
      <div className="space-y-3 p-3">
        <TracePayloadPane fallback={tool?.input} label={t("Tool parameters")} request={inputRequest} />
        <TracePayloadPane fallback={tool?.result} label={t("Tool result")} request={resultRequest} />
      </div>
    );
  }

  if (isConversationRoleNodeKind(node.kind)) {
    return <TracePayloadContent content={node.content} kind={node.content.trim() ? "text" : "empty"} />;
  }

  return (
    <div className="space-y-4 p-4 text-[12px]">
      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-2">
        <div className="text-muted-foreground">{t("Source")}</div>
        <div>{t(trajectoryNodeKindLabel(node.kind))}</div>
        <div className="text-muted-foreground">{t("Status")}</div>
        <div>{t(traceRunStatusLabel(node.status))}{node.statusCode ? ` (${node.statusCode})` : ""}</div>
        <div className="text-muted-foreground">{t("Target")}</div>
        <div className="truncate" title={run ? traceRunTarget(run) : undefined}>{run ? traceRunTarget(run) : "-"}</div>
        <div className="text-muted-foreground">{t("Request")}</div>
        <div className="truncate font-mono" title={node.requestId}>{node.requestId ? compactId(node.requestId) : "-"}</div>
        <div className="text-muted-foreground">{t("Model")}</div>
        <div className="truncate" title={node.provider && node.model ? `${node.provider}/${node.model}` : node.model}>
          {node.provider && node.model ? `${node.provider}/${node.model}` : node.model || "-"}
        </div>
        <div className="text-muted-foreground">{t("Tokens")}</div>
        <div>{node.totalTokens > 0 ? `${formatCompactNumber(node.totalTokens)} tok` : "-"}</div>
        <div className="text-muted-foreground">{t("Cost")}</div>
        <div>{node.costUsd !== undefined ? formatUsdCost(node.costUsd) : "-"}</div>
      </div>

      <div>
        <div className="mb-2 font-medium">{t("Request Timing")}</div>
        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          <div className="text-muted-foreground">{t("Started")}</div>
          <div className="font-mono">{formatLogDateTime(node.createdAt)}</div>
          <div className="text-muted-foreground">{t("Total duration")}</div>
          <div>{formatDuration(node.durationMs)}</div>
          <div className="text-muted-foreground">{t("Offset")}</div>
          <div>{formatDuration(node.offsetMs)}</div>
        </div>
      </div>

      {node.content.trim() ? (
        <div>
          <div className="mb-2 font-medium">{t("Preview")}</div>
          <TracePayloadContent content={node.content} kind="text" />
        </div>
      ) : null}
    </div>
  );
}

function ToolPayloadDialog({
  onClose,
  run
}: {
  onClose: () => void;
  run: AgentAnalysisTraceRun;
}) {
  const t = useAppText();
  const tool = run.tool;
  const inputRequest = tool && run.requestLogId
    ? { callId: tool.callId, part: "tool-input" as const, requestLogId: run.requestLogId }
    : undefined;
  const resultRequest = tool?.resultRequestLogId
    ? { callId: tool.callId, part: "tool-result" as const, requestLogId: tool.resultRequestLogId }
    : undefined;

  return (
    <Dialog className="z-[110] items-start" onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="h-[calc(100dvh-1.5rem)] max-w-[1180px] origin-top sm:h-[min(820px,calc(100dvh-3rem))]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{run.toolName || run.name}</DialogTitle>
            <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={tool?.callId}>
              {tool?.callId ? compactId(tool.callId) : t("Tool")}
            </div>
          </div>
          <Button aria-label={t("Close")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-3.5 w-3.5" />
          </Button>
        </DialogHeader>
        <DialogBody className="overflow-hidden">
          <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-2">
            <TracePayloadPane
              fallback={tool?.input}
              label={t("Parameters")}
              request={inputRequest}
            />
            <TracePayloadPane
              fallback={tool?.result}
              label={t("Result")}
              request={resultRequest}
            />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function TracePayloadPane({
  fallback,
  label,
  request
}: {
  fallback?: TracePayloadPreviewValue;
  label: string;
  request?: AgentAnalysisTracePayloadRequest;
}) {
  const t = useAppText();
  const requestCallId = request?.callId;
  const requestLogId = request?.requestLogId;
  const requestPart = request?.part;
  const [full, setFull] = useState<AgentAnalysisTracePayloadFullResult>();
  const [loading, setLoading] = useState(Boolean(request));
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFull(undefined);
    setLoadFailed(false);

    if (typeof requestLogId !== "number" || !requestPart || !window.ccr?.getAgentTracePayload) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    const payloadRequest: AgentAnalysisTracePayloadRequest = {
      callId: requestCallId,
      part: requestPart,
      requestLogId
    };
    window.ccr.getAgentTracePayload(payloadRequest)
      .then((result) => {
        if (!cancelled) {
          setFull(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestCallId, requestLogId, requestPart]);

  const fullPayload = full?.found ? full : undefined;
  const content = fullPayload?.content ?? fallback?.preview ?? "";
  const kind = fullPayload?.kind ?? fallback?.kind ?? "empty";
  const sizeBytes = fullPayload?.sizeBytes ?? fallback?.sizeBytes ?? 0;
  const truncated = fullPayload?.sourceTruncated ?? fallback?.truncated ?? false;
  const previewOnly = !fullPayload && Boolean(fallback);
  const unavailable = !loading && Boolean(request) && full !== undefined && !full.found;

  return (
    <section className="flex min-h-[160px] flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/20">
      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="text-[12px] font-semibold">{label}</div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
          {loading ? <Badge variant="outline">{t("Loading")}</Badge> : null}
          {sizeBytes > 0 ? <Badge variant="outline">{formatBytes(sizeBytes)}</Badge> : null}
          {previewOnly && !loading ? <Badge variant="outline">{t("Preview")}</Badge> : null}
          {truncated ? <Badge className="border-amber-200 bg-amber-50 text-amber-700" variant="outline">{t("Source truncated")}</Badge> : null}
          {loadFailed || unavailable ? <Badge className="border-rose-200 bg-rose-50 text-rose-700" variant="outline">{t("Full content unavailable")}</Badge> : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading && !content ? (
          <div className="px-3 py-4 text-[11px] text-muted-foreground">{t("Loading")}</div>
        ) : (
          <TracePayloadContent content={content} kind={kind} />
        )}
      </div>
    </section>
  );
}

function TracePayloadContent({
  content,
  kind
}: {
  content: string;
  kind: AgentAnalysisTracePayloadFullResult["kind"];
}) {
  const t = useAppText();
  const parsed = useMemo<{ value: unknown } | undefined>(() => {
    if (kind !== "json") {
      return undefined;
    }
    try {
      return { value: JSON.parse(content) };
    } catch {
      return undefined;
    }
  }, [content, kind]);

  if (!content.trim() || kind === "empty") {
    return <div className="px-3 py-4 text-[11px] text-muted-foreground">{t("No data")}</div>;
  }

  if (parsed) {
    return (
      <div className="min-w-max p-3 font-mono text-[11px] leading-5">
        <JsonTreeNode root value={parsed.value} />
      </div>
    );
  }

  return (
    <pre className="min-h-full whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-foreground">
      <code>{content}</code>
    </pre>
  );
}

function JsonTreeNode({
  name,
  root,
  value
}: {
  name?: string;
  root?: boolean;
  value: unknown;
}) {
  if (Array.isArray(value)) {
    return <JsonComplexNode closeToken="]" entries={value.map((entry, index) => [String(index), entry])} name={name} openToken="[" root={root} />;
  }
  if (isJsonObject(value)) {
    return <JsonComplexNode closeToken="}" entries={Object.entries(value)} name={name} openToken="{" root={root} />;
  }

  return (
    <div className="flex min-w-0 items-start gap-1">
      {name !== undefined ? <JsonPropertyName name={name} /> : null}
      <JsonPrimitive value={value} />
    </div>
  );
}

function JsonComplexNode({
  closeToken,
  entries,
  name,
  openToken,
  root
}: {
  closeToken: string;
  entries: Array<[string, unknown]>;
  name?: string;
  openToken: string;
  root?: boolean;
}) {
  const t = useAppText();
  const [expanded, setExpanded] = useState(Boolean(root));
  const empty = entries.length === 0;

  return (
    <div className={cn("min-w-0", !root && "py-0.5")}>
      <div className="flex min-w-0 items-center gap-1">
        {empty ? (
          <span className="h-4 w-4 shrink-0" />
        ) : (
          <button
            aria-label={t(expanded ? "Collapse" : "Expand")}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
        {name !== undefined ? <JsonPropertyName name={name} /> : null}
        <span className="text-muted-foreground">{openToken}</span>
        {!expanded ? (
          <>
            {!empty ? <span className="text-muted-foreground/70"> ... {entries.length}</span> : null}
            <span className="text-muted-foreground">{closeToken}</span>
          </>
        ) : null}
      </div>
      {expanded ? (
        <div className="ml-4 border-l border-border/60 pl-3">
          {entries.map(([entryName, entryValue]) => (
            <JsonTreeNode key={entryName} name={entryName} value={entryValue} />
          ))}
          <div className="text-muted-foreground">{closeToken}</div>
        </div>
      ) : null}
    </div>
  );
}

function JsonPropertyName({ name }: { name: string }) {
  const displayName = /^\d+$/.test(name) ? name : JSON.stringify(name);
  return (
    <>
      <span className={cn("shrink-0", /^\d+$/.test(name) ? "text-slate-500" : "text-sky-700")}>{displayName}</span>
      <span className="text-muted-foreground">:</span>
    </>
  );
}

function JsonPrimitive({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="text-muted-foreground">null</span>;
  }
  if (typeof value === "string") {
    return <span className="text-emerald-700">{JSON.stringify(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-amber-700">{String(value)}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-violet-700">{String(value)}</span>;
  }
  return <span className="text-muted-foreground">{String(value)}</span>;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function traceRunTarget(run: AgentAnalysisTraceRun): string {
  if (run.kind === "tool") {
    return run.toolName || run.name;
  }
  if (run.provider && run.model) {
    return `${run.provider}/${run.model}`;
  }
  if (run.routeReason) {
    return run.routeReason;
  }
  return run.path || "-";
}

function traceRunKindLabel(kind: AgentAnalysisTraceRun["kind"]): string {
  if (kind === "agent") return "Agent";
  if (kind === "llm") return "LLM";
  if (kind === "route") return "Route";
  if (kind === "subagent") return "Subagent";
  return "Tool";
}

function traceRunBarStyle(run: AgentAnalysisTraceRun, traceDurationMs: number): { left: string; width: string } {
  const left = Math.max(0, Math.min(99.2, (run.offsetMs / traceDurationMs) * 100));
  const rawWidth = (run.durationMs / traceDurationMs) * 100;
  const minWidth = run.kind === "tool" ? 0.7 : 1.2;
  const width = Math.max(minWidth, Math.min(100 - left, rawWidth));
  return {
    left: `${left}%`,
    width: `${width}%`
  };
}

function traceRunDotClass(run: AgentAnalysisTraceRun): string {
  if (run.status === "error") return "bg-rose-500";
  if (run.status === "partial") return "bg-amber-500";
  if (run.kind === "agent") return "bg-teal-500";
  if (run.kind === "route") return "bg-cyan-500";
  if (run.kind === "subagent") return "bg-amber-500";
  if (run.kind === "tool") return "bg-emerald-500";
  return "bg-blue-500";
}

function traceRunBarClass(run: AgentAnalysisTraceRun): string {
  if (run.status === "error") return "bg-rose-500";
  if (run.status === "partial") return "bg-amber-500";
  if (run.kind === "agent") return "bg-teal-500";
  if (run.kind === "route") return "bg-cyan-500";
  if (run.kind === "subagent") return "bg-amber-500";
  if (run.kind === "tool") return "bg-emerald-500";
  return "bg-blue-500";
}

function traceRunStatusBadgeClass(status: AgentAnalysisTraceRun["status"]): string {
  if (status === "error") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function traceRunStatusLabel(status: AgentAnalysisTraceRun["status"]): string {
  if (status === "error") return "Error";
  if (status === "partial") return "Partial failure";
  return "Success";
}

function trajectoryNodeTitle(node: AgentTrajectoryNode, t: (value: string) => string): string {
  if (node.kind === "user") return t("User sent");
  if (node.kind === "assistant") return t("Model reply");
  if (node.kind === "context") return t("Context");
  if (node.kind === "developer") return t("Developer");
  if (node.kind === "system") return t("System");
  if (node.kind === "tool-result") return t("Tool result");
  return node.title;
}

function trajectoryNodeListContent(node: AgentTrajectoryNode, t: (value: string) => string): string {
  const content = node.content.trim();
  if (node.kind === "tool-result") {
    return content;
  }
  if (node.run?.kind === "tool") {
    const input = trajectoryNodePreview(node.run.tool?.input?.preview ?? "");
    return [
      node.run.toolName || node.run.name,
      input
    ].filter(Boolean).join(" ");
  }
  if (isConversationRoleNodeKind(node.kind)) {
    return content;
  }
  if (node.kind === "llm") {
    return node.error ? node.error : t("Request");
  }
  if (node.kind === "route") {
    return content || node.run?.routeReason || node.title;
  }
  return content || node.title;
}

function isConversationRoleNodeKind(kind: AgentTrajectoryNodeKind): kind is AgentConversationItem["role"] {
  return kind === "assistant" || kind === "context" || kind === "developer" || kind === "system" || kind === "tool" || kind === "user";
}

function trajectoryNodeKindLabel(kind: AgentTrajectoryNodeKind): string {
  if (kind === "user") return "User";
  if (kind === "assistant") return "Assistant";
  if (kind === "context") return "Context";
  if (kind === "developer") return "Developer";
  if (kind === "system") return "System";
  if (kind === "tool-result") return "Tool Result";
  return traceRunKindLabel(kind);
}

function trajectoryNodeRoleTag(kind: AgentTrajectoryNodeKind): string {
  return trajectoryNodeKindLabel(kind).toUpperCase();
}

function trajectoryNodeBadgeClass(node: AgentTrajectoryNode): string {
  if (node.status === "error") return "bg-rose-100 text-rose-700";
  if (node.kind === "system") return "bg-slate-100 text-slate-700";
  if (node.kind === "context") return "bg-emerald-100 text-emerald-700";
  if (node.kind === "developer") return "bg-indigo-100 text-indigo-700";
  if (node.kind === "user") return "bg-blue-100 text-blue-700";
  if (node.kind === "assistant") return "bg-violet-100 text-violet-700";
  if (node.kind === "tool-result") return "bg-emerald-100 text-emerald-700";
  if (node.kind === "tool") return "bg-amber-100 text-amber-700";
  if (node.kind === "route") return "bg-cyan-100 text-cyan-700";
  if (node.kind === "subagent") return "bg-emerald-100 text-emerald-700";
  if (node.kind === "agent") return "bg-teal-100 text-teal-700";
  return "bg-slate-100 text-slate-700";
}

function trajectoryNodePreview(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
}

function trajectoryRunContent(run: AgentAnalysisTraceRun): string {
  if (run.kind === "tool") {
    const input = run.tool?.input?.preview.trim();
    const result = run.tool?.result?.preview.trim();
    return [
      input ? `Input\n${input}` : "",
      result ? `Result\n${result}` : "",
      run.error ? `Error\n${run.error}` : ""
    ].filter(Boolean).join("\n\n");
  }
  return [
    run.routeReason ? `Route: ${run.routeReason}` : "",
    run.error ? `Error: ${run.error}` : ""
  ].filter(Boolean).join("\n");
}

function trajectoryNodeRawJson(node: AgentTrajectoryNode): string {
  return JSON.stringify({
    content: node.content,
    costUsd: node.costUsd,
    durationMs: node.durationMs,
    error: node.error,
    kind: node.kind,
    model: node.model,
    offsetMs: node.offsetMs,
    provider: node.provider,
    requestId: node.requestId,
    requestLogId: node.requestLogId,
    sourcePreview: node.sourcePreview,
    sourceTruncated: node.sourceTruncated,
    status: node.status,
    statusCode: node.statusCode,
    stepIndex: node.stepIndex,
    title: node.title,
    totalTokens: node.totalTokens,
    truncated: node.truncated,
    turnIndex: node.turnIndex
  }, null, 2);
}

function formatRouteReason(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "-";
  }
  return trimmed.toLowerCase() === "inline-model" ? "none" : trimmed;
}

function AgentSessionsCard({
  onSelectSession,
  selectedSession,
  sessions
}: {
  onSelectSession: (value: AgentAnalysisSessionSelection) => void;
  selectedSession?: AgentAnalysisSessionSelection;
  sessions: AgentAnalysisSnapshot["sessions"];
}) {
  const t = useAppText();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {sessions.length === 0 ? (
        <AnalysisEmptyState label={t("No session activity")} />
      ) : (
        <div className={cn("h-full", agentListFrameClassName)}>
          <table className={cn("min-w-[1420px]", agentListTableClassName)}>
            <thead className={agentListHeadClassName}>
              <tr>
                <th className="px-3 py-2 font-semibold">{t("Session")}</th>
                <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                <th className="px-3 py-2 font-semibold">{t("Client")}</th>
                <th className="px-3 py-2 font-semibold">{t("Started")}</th>
                <th className="px-3 py-2 font-semibold">{t("Last seen")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Duration")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Tools")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Subagents")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Errors")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Cache rate")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Cost")}</th>
                <th className="px-3 py-2 font-semibold">{t("Models")}</th>
                <th className="px-3 py-2 font-semibold">{t("Providers")}</th>
                <th className="px-3 py-2 font-semibold">{t("UA")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Action")}</th>
              </tr>
            </thead>
            <tbody className={agentListBodyClassName}>
              {sessions.map((session) => {
                const selected = selectedSession?.agent === session.agent && selectedSession.id === session.id;
                return (
                  <tr className={agentListRowClassName({ selected })} key={`${session.agent}:${session.id}`}>
                    <td className="max-w-[180px] px-3 py-2" title={session.id}>
                      <span className="block truncate font-mono font-semibold">{compactId(session.id)}</span>
                    </td>
                    <td className="px-3 py-2">{t(agentKindLabel(session.agent))}</td>
                    <td className="max-w-[150px] px-3 py-2" title={session.client}>{session.client}</td>
                    <td className="px-3 py-2 font-mono">{formatLogDateTime(session.startedAt)}</td>
                    <td className="px-3 py-2 font-mono">{formatLogDateTime(session.lastSeenAt)}</td>
                    <td className="px-3 py-2 text-right">{formatDuration(session.durationMs)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(session.requestCount)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(session.toolCallCount)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(session.subagentCallCount)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(session.errorCount)}</td>
                    <td className="px-3 py-2 text-right">{formatPercentFixed(session.cacheRatio)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatUsdCost(session.costUsd)}</td>
                    <td className="max-w-[240px] px-3 py-2" title={session.models.join(", ")}>{session.models.join(", ") || "-"}</td>
                    <td className="max-w-[220px] px-3 py-2" title={session.providers.join(", ")}>{session.providers.join(", ") || "-"}</td>
                    <td className="max-w-[220px] px-3 py-2 font-mono" title={session.userAgent}>{compactUserAgent(session.userAgent)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button className="h-7 border-border bg-transparent px-2 text-[11px] shadow-none hover:bg-transparent active:bg-transparent" onClick={() => onSelectSession({ agent: session.agent, id: session.id })} type="button" variant="outline">
                        {t("Details")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AnalysisEmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">
      {label}
    </div>
  );
}

function AnalysisNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

type UsageAnalysisColumn = {
  key: "client" | "credentialId" | "model" | "provider";
  label: string;
};

function UsageAnalysisCard({
  columns,
  dimensions,
  emptyLabel,
  rows,
  title
}: {
  columns: UsageAnalysisColumn[];
  dimensions: OverviewWidgetDimensions;
  emptyLabel: string;
  rows: UsageComparisonRow[];
  title: string;
}) {
  const t = useAppText();
  const visibleColumns = dimensions.width >= 4 ? columns : columns.slice(0, 1);
  const visibleRows = rows.slice(0, overviewAnalysisRowLimit(dimensions));
  const showCost = dimensions.width >= 4;
  const showTokenBreakdown = dimensions.width >= 4 && dimensions.height >= 3;
  const showCacheRate = dimensions.width >= 4 && dimensions.height >= 3;

  return (
    <Card className="overview-card flex h-full min-h-0 min-w-0 flex-col">
      <OverviewCardHeading icon={UsersRound} title={title} tone="slate" trailing={<Badge variant="outline">{rows.length}</Badge>} />
      <CardContent className="min-h-0 flex-1 overflow-hidden">
        {rows.length === 0 ? (
          <OverviewEmptyState compact label={emptyLabel} />
        ) : (
          <div className={cn("h-full overflow-hidden", agentListSurfaceClassName)}>
            <table className={cn("table-fixed", agentListTableClassName)}>
              <thead className="border-b border-border/70 bg-muted/80 text-muted-foreground">
                <tr>
                  {visibleColumns.map((column) => (
                    <th className="px-3 py-2 font-semibold" key={column.key}>{column.label}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold">{t("Token")}</th>
                  {showCost ? <th className="px-3 py-2 text-right font-semibold">{t("Cost")}</th> : null}
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  {showTokenBreakdown ? <th className="px-3 py-2 text-right font-semibold">{t("Input")}</th> : null}
                  {showTokenBreakdown ? <th className="px-3 py-2 text-right font-semibold">{t("Output")}</th> : null}
                  {showTokenBreakdown ? <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th> : null}
                  {showCacheRate ? <th className="px-3 py-2 text-right font-semibold">{t("Cache rate")}</th> : null}
                </tr>
              </thead>
              <tbody className={agentListBodyClassName}>
                {visibleRows.map((row) => (
                  <tr className={agentListRowClassName()} key={row.key}>
                    {visibleColumns.map((column) => (
                      <td className="max-w-[180px] px-3 py-2 font-medium" key={column.key}>
                        <span className="block truncate" title={row[column.key] || "-"}>{row[column.key] || "-"}</span>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold">{formatCompactNumber(row.totalTokens)}</td>
                    {showCost ? <td className="px-3 py-2 text-right font-semibold">{formatUsdCost(row.costUsd)}</td> : null}
                    <td className="px-3 py-2 text-right">{formatCompactNumber(row.requestCount)}</td>
                    {showTokenBreakdown ? <td className="px-3 py-2 text-right">{formatCompactNumber(row.inputTokens)}</td> : null}
                    {showTokenBreakdown ? <td className="px-3 py-2 text-right">{formatCompactNumber(row.outputTokens)}</td> : null}
                    {showTokenBreakdown ? <td className="px-3 py-2 text-right">{formatCompactNumber(row.cacheTokens)}</td> : null}
                    {showCacheRate ? <td className="px-3 py-2 text-right">{formatPercentFixed(row.cacheRatio)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type UsageTooltipPayloadItem = {
  color?: string;
  name?: string;
  payload?: UsageSeriesPoint;
  value?: number | string;
};

type RequestHealthBarLabelProps = {
  payload?: UsageSeriesPoint;
  value?: number | string;
  width?: number | string;
  x?: number | string;
  y?: number | string;
};

function RequestHealthBarLabel({ payload, value, width, x, y }: RequestHealthBarLabelProps) {
  const requestCount = Number(value ?? payload?.requestCount ?? 0);
  const xValue = Number(x);
  const yValue = Number(y);
  const widthValue = Number(width);
  if (!payload || requestCount <= 0 || !Number.isFinite(xValue) || !Number.isFinite(yValue) || !Number.isFinite(widthValue)) {
    return null;
  }

  const label = `${formatPercent(payload.successRate)} / ${formatCompactNumber(payload.errorCount)}`;
  return (
    <text
      className="fill-muted-foreground"
      fontSize={10}
      fontWeight={600}
      textAnchor="middle"
      x={xValue + widthValue / 2}
      y={Math.max(12, yValue - 7)}
    >
      {label}
    </text>
  );
}

function UsageTooltip({
  active,
  label,
  payload
}: {
  active?: boolean;
  label?: string;
  payload?: UsageTooltipPayloadItem[];
}) {
  const t = useAppText();
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload.find((item) => item.payload)?.payload;

  return (
    <div className="overview-tooltip rounded-xl border px-3 py-2.5 text-[11px]">
      <div className="mb-1 font-semibold">{label}</div>
      <div className="space-y-1">
        {payload.map((item) => (
          <div className="flex min-w-[150px] items-center justify-between gap-4" key={item.name}>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || "#0f766e" }} />
              {item.name}
            </span>
            <span className="font-medium">{formatCompactNumber(Number(item.value) || 0)}</span>
          </div>
        ))}
        {point ? (
          <>
            <div className="flex min-w-[150px] items-center justify-between gap-4 border-t border-border/60 pt-1">
              <span className="text-muted-foreground">{t("Success rate")}</span>
              <span className="font-medium">{formatPercent(point.successRate)}</span>
            </div>
            <div className="flex min-w-[150px] items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("Failed requests")}</span>
              <span className="font-medium">{formatCompactNumber(point.errorCount)}</span>
            </div>
            <div className="flex min-w-[150px] items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("Cost")}</span>
              <span className="font-medium">{formatUsdCost(point.costUsd)}</span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ChartFrame({ children, fill = false }: { children: (size: { height: number; width: number }) => ReactNode; fill?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ height: 0, width: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = (width: number, height: number) => {
      const next = {
        height: Math.max(0, Math.floor(height)),
        width: Math.max(0, Math.floor(width))
      };
      setSize((current) => (current.height === next.height && current.width === next.width ? current : next));
    };

    const rect = container.getBoundingClientRect();
    updateSize(rect.width, rect.height);

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn(fill ? "h-full min-h-[120px]" : "h-[260px]", "min-w-0")} ref={containerRef}>
      {size.height > 0 && size.width > 0 ? children(size) : null}
    </div>
  );
}

function TokenTooltip({
  active,
  label,
  payload
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ name?: string; value?: number | string }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const title = label || payload[0]?.name || "";

  return (
    <div className="overview-tooltip rounded-xl border px-3 py-2.5 text-[11px]">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-muted-foreground">{formatCompactNumber(Number(payload[0]?.value) || 0)} tokens</div>
    </div>
  );
}
