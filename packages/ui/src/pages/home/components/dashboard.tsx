import {
  agentAnalysisRangeOptions, AgentAnalysisSessionSelection, AgentAnalysisSnapshot, AgentAnalysisTracePayloadFullResult, AgentAnalysisTracePayloadRequest, AgentAnalysisTraceRun, agentFilterOptions, AgentFilterValue, agentKindLabel,
  AnimatePresence, AnimatedDisclosure, AnimatedIconSwap,
  Area, arrayMove, Badge, Bar, BarChart, Button,
  Card, CardContent, CardHeader, CardTitle, CartesianGrid, Cell, constrainOverviewWidgetSize,
  Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, cn, compactId,
  compactUserAgent, compareProviderAccountSnapshots, ComposedChart, CSS, DEFAULT_OVERVIEW_WIDGETS, DndContext,
  Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle,
  DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent, Field, formatAxisNumber, formatBytes,
  formatCompactNumber, formatDuration, formatLogDateTime, formatPercent, formatProviderAccountDetailDate, formatProviderAccountMeterTitle, formatProviderAccountMeterValue,
  formatStatusBucketDate, formatStatusCodeCounts, formatSystemStatusRange, formatToolCounts, formatUsdCost, KeyboardSensor,
  LabelList, LayoutGroup, Line, LoaderCircle, MeasuringStrategy, MetricCard, MetricTone,
  metricToneBar, metricToneStroke, motion, normalizeAgentFilterValue, normalizeOverviewWidget, normalizeOverviewWidgets,
  OverviewMetricKind, overviewMetricOptions, overviewWidgetCollisionDetection, OverviewWidgetConfig, OverviewWidgetSize, overviewWidgetSizeOptions,
  OverviewWidgetType, OverviewWidgetVariant, Pencil, Pie, PieChart, Plus,
  PointerSensor, primaryProviderAccountMeter, providerAccountMeterDetailValidityProgress, providerAccountMeterProgress, providerAccountMetersForDisplay, providerAccountProgressClass, isProviderAccountManualResetMeter,
  providerAccountSnapshotKey, providerAccountSnapshotLabel,
  ProviderAccountMeter, ProviderAccountSnapshot, ReactNode, ReactPointerEvent, rectSortingStrategy, RefreshCw, Select,
  SelectControl, SortableContext, sortableKeyboardCoordinates, systemStatusIconClass, systemStatusPointTooltip, systemStatusSegmentClass,
  systemStatusTooltipPositionClass, Tooltip, translateOptions, Trash2, UsageComparisonRow, usageRangeOptions,
  UsageSeriesPoint, UsageStatsRange, UsageStatsSnapshot, usageStatusTone, UsageTotals, useAppText,
  useEffect, useMemo, useRef, useSensor, useSensors, useSortable,
  useState, X, XAxis, YAxis
} from "../shared/index";
import { buildTokenActivity, type TokenActivityCell } from "@/lib/usage-activity";
import { ShareCardWidget } from "./share-cards";
import { Cloud, Rocket } from "lucide-react";
export function OverviewView({
  onWidgetsChange,
  overviewWidgets,
  providerAccounts,
  providerAccountRefreshing = false,
  refreshProviderAccounts,
  setUsageRange,
  usageRange,
  usageStats
}: {
  onWidgetsChange: (widgets: OverviewWidgetConfig[]) => void;
  overviewWidgets: OverviewWidgetConfig[];
  providerAccounts: ProviderAccountSnapshot[];
  providerAccountRefreshing?: boolean;
  refreshProviderAccounts?: () => void | Promise<void>;
  setUsageRange: (range: UsageStatsRange) => void;
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
                    providerAccounts={providerAccounts}
                    providerAccountRefreshing={providerAccountRefreshing}
                    refreshProviderAccounts={refreshProviderAccounts}
                    usageRange={usageRange}
                    usageStats={usageStats}
                    widget={widget}
                  />
                </OverviewWidgetFrame>
              </SortableOverviewWidget>
            ))}
            {visibleWidgets.length === 0 ? (
              <div className="col-span-1 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-[12px] text-muted-foreground sm:col-span-2 xl:col-span-4">
                {t("No widgets configured")}
              </div>
            ) : null}
          </section>
        </LayoutGroup>
      </SortableContext>
      <DragOverlay adjustScale={false}>
        {activeWidget ? (
          <OverviewWidgetDragOverlay
            providerAccounts={providerAccounts}
            providerAccountRefreshing={providerAccountRefreshing}
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
      className="space-y-4"
      initial={{ opacity: 0 }}
      ref={viewRef}
      transition={{ duration: 0.15 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="truncate text-[18px] font-semibold tracking-tight">{t("Overview")}</h2>
          <OverviewUsageRangeSelector range={usageRange} setRange={setUsageRange} />
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
          <aside className="min-w-0 rounded-lg border border-border bg-card p-3 xl:sticky xl:top-4 xl:self-start">
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

          <aside className="min-w-0 rounded-lg border border-border bg-card p-3 xl:sticky xl:top-4 xl:self-start">
            <OverviewWidgetProperties
              providerAccounts={providerAccounts}
              widget={selectedWidget}
              onChangeAccountProvider={(accountProvider) => selectedWidget ? updateWidget(selectedWidget.id, { accountProvider }) : undefined}
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
    <div aria-label={t("Usage over time")} className="flex rounded-md border border-input bg-card p-0.5 shadow-sm" role="group">
      {usageRangeOptions.map((option) => (
        <Button
          className={cn(
            "h-7 rounded px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
            range === option.value && "bg-background text-foreground shadow-sm"
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
          className="grid h-auto w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-left transition-colors hover:bg-muted/55 focus-visible:ring-2 focus-visible:ring-ring/25"
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
  onChangeAccountProvider,
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
  onChangeAccountProvider: (accountProvider: string | undefined) => void;
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
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">
        {t("No widget selected")}
      </div>
    );
  }

  const category = overviewWidgetCategory(widget.type);
  const dataOptions = overviewWidgetDataOptions(widget, providerAccounts);
  const dataValue = overviewWidgetDataValue(widget);
  const sizeOptions = overviewWidgetSizeOptions.filter((option) => (
    constrainOverviewWidgetSize(option.value, widget.type, widget.variant, widget.accountProvider) === option.value
  ));
  const changeData = (value: string) => {
    if (category === "account-balance") {
      onChangeAccountProvider(value || undefined);
    }
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
        <SelectControl onChange={changeData} options={translateOptions(dataOptions, t)} value={dataValue} />
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
      {...listeners}
    >
      {children}
    </motion.div>
  );
}

function OverviewWidgetDragOverlay({
  providerAccounts,
  providerAccountRefreshing = false,
  refreshProviderAccounts,
  usageRange,
  usageStats,
  widget
}: {
  providerAccounts: ProviderAccountSnapshot[];
  providerAccountRefreshing?: boolean;
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
        "group/overview-widget relative h-full min-h-0 min-w-0 transition-opacity",
        editing && (selected
          ? "rounded-xl outline outline-2 outline-primary outline-offset-2 ring-2 ring-primary/20"
          : "rounded-xl outline outline-2 outline-primary/35 outline-offset-2")
      )}
      role={editing ? "group" : undefined}
      onFocus={editing ? onSelect : undefined}
      onPointerDownCapture={selectFrame}
      ref={frameRef}
    >
      {children}
      {editing ? (
        <>
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
  providerAccounts,
  providerAccountRefreshing = false,
  refreshProviderAccounts,
  usageRange,
  usageStats,
  widget
}: {
  providerAccounts: ProviderAccountSnapshot[];
  providerAccountRefreshing?: boolean;
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
    content = <ProviderAccountsOverview accountProvider={widget.accountProvider} accounts={providerAccounts} dimensions={dimensions} refreshing={providerAccountRefreshing} variant={overviewAccountVariant(widget.variant)} onRefresh={refreshProviderAccounts} />;
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

  if (variant === "compact") {
    return (
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardContent className="flex min-h-0 flex-1 items-center justify-between gap-3 p-3">
          <div className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">{item.label}</div>
          <div className="shrink-0 text-[18px] font-semibold tracking-tight">{item.value}</div>
        </CardContent>
      </Card>
    );
  }

  if (variant === "bar") {
    return (
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardContent className="min-h-0 flex-1 p-3">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">{item.label}</div>
            <div className="shrink-0 text-[18px] font-semibold tracking-tight">{item.value}</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", metricToneBar(item.tone))} style={{ width: `${Math.max(3, Math.round(item.ratio * 100))}%` }} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === "ring") {
    return (
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
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

  return <MetricCard label={item.label} tone={item.tone} value={item.value} />;
}

function OverviewRingMetric({ ratio, tone }: { ratio: number; tone: MetricTone }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, ratio));

  return (
    <svg aria-hidden="true" className="h-[58px] w-[58px]" viewBox="0 0 48 48">
      <circle cx="24" cy="24" fill="none" r={radius} stroke="hsl(var(--muted))" strokeWidth="6" />
      <circle
        cx="24"
        cy="24"
        fill="none"
        r={radius}
        stroke={metricToneStroke(tone)}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
        strokeWidth="6"
        transform="rotate(-90 24 24)"
      />
    </svg>
  );
}

function UsageTrendWidget({
  dimensions,
  usageRange,
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

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col">
      <CardHeader className="shrink-0 flex-row items-center justify-between">
        <CardTitle>{t("Usage Trend")}</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ChartFrame fill>
          {({ height, width }) => (
            <ComposedChart data={usageStats.series} height={height} margin={chartMargin} width={width}>
              <CartesianGrid stroke="#dfe3e8" strokeDasharray="3 3" vertical={false} />
              <XAxis axisLine={false} dataKey="label" hide={dimensions.height <= 1} tick={{ fill: "#5f6b7a", fontSize: 11 }} tickLine={false} />
              <YAxis axisLine={false} hide={dimensions.width <= 1} tick={{ fill: "#5f6b7a", fontSize: 11 }} tickFormatter={formatAxisNumber} tickLine={false} yAxisId="tokens" />
              <YAxis axisLine={false} hide orientation="right" yAxisId="requests" />
              <Tooltip content={<UsageTooltip />} />
              {variant === "composed" ? (
                <>
                  <Area dataKey="totalTokens" fill="#0f766e" fillOpacity={0.14} name={t("Total tokens")} stroke="#0f766e" strokeWidth={2} type="monotone" yAxisId="tokens" />
                  <Bar barSize={12} dataKey="requestCount" fill="#2563eb" name={t("Requests")} radius={[3, 3, 0, 0]} yAxisId="requests">
                    <LabelList content={<RequestHealthBarLabel />} dataKey="requestCount" />
                  </Bar>
                  <Line dataKey="cacheTokens" dot={false} name={t("Cache tokens")} stroke={overviewCacheColor} strokeWidth={2} type="monotone" yAxisId="tokens" />
                </>
              ) : null}
              {variant === "area" ? (
                <>
                  <Area dataKey="totalTokens" fill="#0f766e" fillOpacity={0.18} name={t("Total tokens")} stroke="#0f766e" strokeWidth={2} type="monotone" yAxisId="tokens" />
                  <Area dataKey="cacheTokens" fill={overviewCacheColor} fillOpacity={0.12} name={t("Cache tokens")} stroke={overviewCacheColor} strokeWidth={2} type="monotone" yAxisId="tokens" />
                </>
              ) : null}
              {variant === "line" ? (
                <>
                  <Line dataKey="totalTokens" dot={false} name={t("Total tokens")} stroke="#0f766e" strokeWidth={2.5} type="monotone" yAxisId="tokens" />
                  <Line dataKey="cacheTokens" dot={false} name={t("Cache tokens")} stroke={overviewCacheColor} strokeWidth={2} type="monotone" yAxisId="tokens" />
                </>
              ) : null}
              {variant === "bar" ? (
                <>
                  <Bar barSize={14} dataKey="totalTokens" fill="#0f766e" name={t("Total tokens")} radius={[4, 4, 0, 0]} yAxisId="tokens" />
                  <Line dataKey="requestCount" dot={false} name={t("Requests")} stroke="#2563eb" strokeWidth={2} type="monotone" yAxisId="requests" />
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
    <Card className="flex h-full min-h-0 min-w-0 flex-col">
      <CardHeader className="shrink-0 flex-row items-center justify-between">
        <CardTitle>{t("Activity")}</CardTitle>
        <Badge variant="outline">{t("Tokens")}</Badge>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-visible p-3">
        {showSummary ? (
          <div className={cn("mb-3 grid overflow-hidden rounded-lg border border-border bg-muted/20", dimensions.width >= 2 ? "grid-cols-4" : "grid-cols-2")}>
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
                className="h-3 w-3 rounded-[3px]"
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
    <div className="min-w-0 border-r border-border bg-card/60 px-3 py-2 last:border-r-0">
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
              <span
                aria-label={`${cell.dateLabel}: ${formatActivityTokenCount(cell.totalTokens)} ${t("tokens")}`}
                className="group relative aspect-square w-full rounded-[4px]"
                key={cell.dateKey}
                style={{
                  backgroundColor: overviewActivityColor(cell.intensity, cell.inObservedRange),
                  gridColumn: cell.weekIndex + (showDayLabels ? 2 : 1),
                  gridRow: cell.dayIndex + 1
                }}
              >
                <span className={`pointer-events-none absolute z-30 hidden min-w-[112px] rounded-md border border-border/70 bg-popover px-2 py-1.5 text-left text-[11px] text-popover-foreground shadow-card-elevated group-hover:block ${overviewActivityTooltipPositionClass(cell, activity.weekCount)}`}>
                  <span className="block font-semibold">{cell.dateLabel}</span>
                  <span className="mt-0.5 block text-muted-foreground">{formatActivityTokenCount(cell.totalTokens)} {t("tokens")}</span>
                </span>
              </span>
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

function overviewActivityTooltipPositionClass(cell: TokenActivityCell, weekCount: number): string {
  const verticalClass = cell.dayIndex <= 1 ? "top-full mt-1" : "bottom-full mb-1";
  if (cell.weekIndex <= 1) {
    return `${verticalClass} left-0`;
  }
  if (cell.weekIndex >= weekCount - 2) {
    return `${verticalClass} right-0`;
  }
  return `${verticalClass} left-1/2 -translate-x-1/2`;
}

function overviewActivityColor(intensity: TokenActivityCell["intensity"], inRange: boolean): string {
  if (!inRange) return "rgba(99,102,241,.06)";
  if (intensity === 0) return "rgba(99,102,241,.12)";
  if (intensity === 1) return "rgba(99,102,241,.30)";
  if (intensity === 2) return "rgba(99,102,241,.50)";
  if (intensity === 3) return "rgba(99,102,241,.70)";
  return "rgba(99,102,241,.92)";
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
    { color: "#2563eb", name: t("Input"), value: totals.inputTokens },
    { color: "#d97706", name: t("Output"), value: totals.outputTokens },
    { color: overviewCacheColor, name: t("Cache"), value: totals.cacheTokens }
  ];
  const total = tokenMix.reduce((sum, item) => sum + item.value, 0);
  const showLegend = dimensions.height >= 2 && dimensions.width >= 2;
  const chartMargin = dimensions.height <= 1
    ? { bottom: 2, left: 0, right: 8, top: 2 }
    : { bottom: 8, left: 8, right: 12, top: 8 };

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col">
      <CardHeader className="shrink-0 flex-row items-center justify-between">
        <CardTitle>{t("Token Mix")}</CardTitle>
        <Badge variant="outline">{formatCompactNumber(totals.totalTokens)}</Badge>
      </CardHeader>
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
          <ChartFrame fill>
            {({ height, width }) => (
              <PieChart height={height} width={width}>
                <Tooltip content={<TokenTooltip />} />
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
        ) : null}
        {variant === "bars" ? (
          <ChartFrame fill>
            {({ height, width }) => (
              <BarChart data={tokenMix} height={height} layout="vertical" margin={chartMargin} width={width}>
                <CartesianGrid stroke="#dfe3e8" strokeDasharray="3 3" horizontal={false} />
                <XAxis axisLine={false} hide={dimensions.height <= 1} tick={{ fill: "#5f6b7a", fontSize: 11 }} tickFormatter={formatAxisNumber} tickLine={false} type="number" />
                <YAxis axisLine={false} dataKey="name" tick={{ fill: "#5f6b7a", fontSize: 11 }} tickLine={false} type="category" width={dimensions.width <= 1 ? 42 : 52} />
                <Tooltip content={<TokenTooltip />} />
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
    <Card className="flex h-full min-h-0 min-w-0 flex-col">
      <CardHeader className="shrink-0 flex-row items-center justify-between">
        <CardTitle>{t("Model Distribution")}</CardTitle>
        <Badge variant="outline">{formatCompactNumber(total)}</Badge>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-hidden">
        {modelRows.length === 0 ? (
          <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-[12px] text-muted-foreground">
            {t("No model activity")}
          </div>
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
            <ChartFrame fill>
              {({ height, width }) => (
                <PieChart height={height} width={width}>
                  <Tooltip content={<TokenTooltip />} />
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
            {showLegend ? <OverviewTokenLegend rows={modelRows} /> : null}
          </div>
        ) : (
          <ChartFrame fill>
            {({ height, width }) => (
              <BarChart data={modelRows} height={height} layout="vertical" margin={chartMargin} width={width}>
                <CartesianGrid stroke="#dfe3e8" strokeDasharray="3 3" horizontal={false} />
                <XAxis axisLine={false} hide={dimensions.height <= 1} tick={{ fill: "#5f6b7a", fontSize: 11 }} tickFormatter={formatAxisNumber} tickLine={false} type="number" />
                <YAxis axisLine={false} dataKey="name" tick={{ fill: "#5f6b7a", fontSize: 11 }} tickLine={false} type="category" width={dimensions.width <= 1 ? 58 : 88} />
                <Tooltip content={<TokenTooltip />} />
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
  const colors = ["#2563eb", "#0f766e", "#d97706", "#be123c", "#7c3aed", "#64748b"];
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
    <div className="grid grid-cols-1 gap-2">
      {rows.map((row) => (
        <div className="flex min-w-0 items-center gap-2 text-[12px]" key={row.name}>
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
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="shrink-0 flex-row items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Badge variant="outline">{rows.length}</Badge>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-hidden">
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-7 text-center text-[12px] text-muted-foreground">{emptyLabel}</div>
          ) : (
            <div className="space-y-2">
              {rows.slice(0, rowLimit).map((row) => (
                <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2" key={row.key}>
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
    const options = providerAccounts
      .filter((account) => account.provider)
      .sort(compareProviderAccountSnapshots)
      .map((account) => ({ label: providerAccountSnapshotLabel(account), value: providerAccountSnapshotKey(account) }));
    if (widget.accountProvider && !options.some((option) => option.value === widget.accountProvider)) {
      options.push({ label: widget.accountProvider, value: widget.accountProvider });
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
    return widget.accountProvider ?? "";
  }
  if (category === "activity") {
    return "token-activity";
  }
  if (category === "share-card") {
    return widget.type;
  }
  return category;
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

const overviewCacheColor = "#6366f1";

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
  const segments = usageStats.series.map((point) => ({
    dateLabel: formatStatusBucketDate(point.bucket, usageRange),
    point,
    tone: usageStatusTone(point)
  }));
  const availability = usageStats.totals.requestCount > 0 ? usageStats.totals.successRate : 0;
  const overallTone = usageStatusTone(usageStats.totals);
  const StatusIcon = overallTone === "ok" ? Check : CircleAlert;
  const rangeLabel = formatSystemStatusRange(segments, usageRange);

  if (variant === "compact") {
    return (
      <Card className="flex h-full min-h-0 min-w-0 flex-col border-border/70 bg-card">
        <CardContent className="flex min-h-0 min-w-0 flex-1 items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", systemStatusIconClass(overallTone))}>
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
    <Card className="flex h-full min-h-0 min-w-0 flex-col border-border/70 bg-card">
      <CardContent className="min-h-0 flex-1 space-y-4 overflow-hidden p-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 className="truncate text-[15px] font-semibold tracking-tight">{t("System status")}</h2>
          <div className="flex shrink-0 items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5 opacity-60" />
            <span>{rangeLabel}</span>
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 opacity-60" />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full", systemStatusIconClass(overallTone))}>
                <StatusIcon className="h-3 w-3" />
              </span>
              <span className="min-w-0 truncate text-[13px] font-semibold">{t("API Service")}</span>
            </div>
            <div className="shrink-0 text-[12px] font-medium text-muted-foreground">
              {formatPercent(availability)} {t("Availability")}
            </div>
          </div>

          <div className="flex min-w-0 gap-1" aria-label={t("System status")}>
            {segments.map((segment, index) => (
              <span
                className="group relative flex h-5 min-w-[3px] flex-1"
                key={`${segment.point.bucket}-${index}`}
              >
                <span
                  className={cn("h-full w-full rounded-[3px]", systemStatusSegmentClass(segment.tone))}
                  aria-label={systemStatusPointTooltip(segment, t)}
                />
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-full z-50 mb-2 hidden w-[190px] max-w-[calc(100vw-32px)] rounded-md border border-border/70 bg-popover px-3 py-2 text-left text-[11px] text-popover-foreground shadow-card-elevated group-hover:block",
                    systemStatusTooltipPositionClass(index, segments.length)
                  )}
                >
                  <span className="block font-semibold">{segment.dateLabel}</span>
                  <span className="mt-1 flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("Requests")}</span>
                    <span className="font-medium">{formatCompactNumber(segment.point.requestCount)}</span>
                  </span>
                  <span className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("Success rate")}</span>
                    <span className="font-medium">{formatPercent(segment.point.successRate)}</span>
                  </span>
                  <span className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("Failed requests")}</span>
                    <span className="font-medium">{formatCompactNumber(segment.point.errorCount)}</span>
                  </span>
                  <span className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("Duration")}</span>
                    <span className="font-medium">{formatDuration(segment.point.avgDurationMs)}</span>
                  </span>
                </span>
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderAccountsOverview({
  accountProvider,
  accounts,
  dimensions,
  onRefresh,
  refreshing = false,
  variant = "cards"
}: {
  accountProvider?: string;
  accounts: ProviderAccountSnapshot[];
  dimensions: OverviewWidgetDimensions;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  variant?: OverviewAccountVariant;
}) {
  const t = useAppText();
  const selectedAccountProvider = accountProvider?.trim();
  const sortedAccounts = [...accounts].sort(compareProviderAccountSnapshots);
  const visibleAccounts = selectedAccountProvider
    ? sortedAccounts.filter((account) => providerAccountSelectionMatches(account, selectedAccountProvider)).slice(0, 1)
    : sortedAccounts
      .filter((account) => account.meters.length > 0 || account.status === "error");
  const isSingleAccount = visibleAccounts.length === 1;

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col">
      <CardContent className={cn("min-h-0 flex-1 overflow-hidden", providerAccountContentPaddingClass(dimensions))}>
        {visibleAccounts.length === 0 ? (
          <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-[12px] text-muted-foreground">
            {t("No account balance connectors configured")}
          </div>
        ) : isSingleAccount ? (
          <ProviderAccountSinglePanel account={visibleAccounts[0]} dimensions={dimensions} refreshing={refreshing} variant={variant} onRefresh={onRefresh} />
        ) : variant === "compact" ? (
          <div className={cn("grid h-full min-h-0 grid-cols-1 overflow-y-auto pr-1", providerAccountGapClass(dimensions), providerAccountGridClass(dimensions))}>
            {visibleAccounts.map((account) => {
              const meter = primaryProviderAccountDisplayMeter(account);
              return (
                <div className="flex min-h-0 min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg border border-border bg-muted/20 px-3 py-2" key={providerAccountSnapshotKey(account)}>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold">{providerAccountSnapshotLabel(account)}</div>
                    {providerAccountShowSource(dimensions) && meter ? <div className="truncate text-[11px] text-muted-foreground">{t(meter.label)}</div> : null}
                    {providerAccountShowRefreshTime(dimensions) ? <div className="truncate text-[11px] text-muted-foreground">{formatProviderAccountRefreshTime(account, t)}</div> : null}
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
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold">{providerAccountSnapshotLabel(account)}</div>
                      {providerAccountShowSource(dimensions) && meter ? <div className="truncate text-[11px] text-muted-foreground">{t(meter.label)}</div> : null}
                      {providerAccountShowRefreshTime(dimensions) ? <div className="truncate text-[11px] text-muted-foreground">{formatProviderAccountRefreshTime(account, t)}</div> : null}
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
        ) : (
          <div className={cn("grid h-full min-h-0 grid-cols-1 overflow-y-auto pr-1", providerAccountGapClass(dimensions), providerAccountGridClass(dimensions))}>
            {visibleAccounts.map((account) => {
              return <ProviderAccountSummaryCard account={account} dimensions={dimensions} key={providerAccountSnapshotKey(account)} refreshing={refreshing} variant={variant} onRefresh={onRefresh} />;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderAccountSinglePanel({
  account,
  dimensions,
  onRefresh,
  refreshing = false,
  variant
}: {
  account: ProviderAccountSnapshot;
  dimensions: OverviewWidgetDimensions;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  variant: OverviewAccountVariant;
}) {
  const t = useAppText();
  const quotaMeters = providerAccountQuotaMeters(account);
  const balanceMeter = primaryProviderAccountBalanceMeter(account);
  const meters = providerAccountMetersForDisplayOrdered(account, providerAccountMeterLimit(dimensions, true, variant));
  const showQuotaVisual = providerAccountUsesQuotaVisual(variant) && quotaMeters.length > 0;

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden", providerAccountStackClass(dimensions))}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("truncate font-semibold", dimensions.height <= 1 ? "text-[12px]" : "text-[13px]")}>{providerAccountSnapshotLabel(account)}</div>
          {providerAccountShowRefreshTime(dimensions) ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{formatProviderAccountRefreshTime(account, t)}</div> : null}
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
          {providerAccountShowExtraCount(dimensions) && account.meters.length > meters.length ? (
            <div className="truncate text-[10px] text-muted-foreground">+{account.meters.length - meters.length}</div>
          ) : null}
        </div>
      ) : (
        <div className="truncate text-[12px] text-muted-foreground">{account.message || account.errors?.[0]?.message || t("Unavailable")}</div>
      )}
    </div>
  );
}

function ProviderAccountSummaryCard({
  account,
  dimensions,
  onRefresh,
  refreshing = false,
  variant
}: {
  account: ProviderAccountSnapshot;
  dimensions: OverviewWidgetDimensions;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  variant: OverviewAccountVariant;
}) {
  const t = useAppText();
  const quotaMeters = providerAccountQuotaMeters(account);
  const balanceMeter = primaryProviderAccountBalanceMeter(account);
  const meters = providerAccountMetersForDisplayOrdered(account, providerAccountMeterLimit(dimensions, false, variant));
  const showQuotaVisual = providerAccountUsesQuotaVisual(variant) && quotaMeters.length > 0;

  return (
    <div className={cn("min-h-0 min-w-0 overflow-hidden rounded-lg border border-border bg-muted/20", providerAccountCardPaddingClass(dimensions))}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{providerAccountSnapshotLabel(account)}</div>
          {providerAccountShowRefreshTime(dimensions) ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{formatProviderAccountRefreshTime(account, t)}</div> : null}
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
        <div className={cn("mt-2 min-h-0 overflow-hidden", providerAccountStackClass(dimensions))}>
          {meters.map((meter) => (
            <ProviderAccountMeterLine account={account} dimensions={dimensions} key={meter.id} meter={meter} onRefresh={onRefresh} />
          ))}
          {providerAccountShowExtraCount(dimensions) && account.meters.length > meters.length ? (
            <div className="truncate text-[10px] text-muted-foreground">+{account.meters.length - meters.length}</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 truncate text-[12px] text-muted-foreground">{account.message || account.errors?.[0]?.message || t("Unavailable")}</div>
      )}
    </div>
  );
}

function ProviderAccountRefreshButton({
  account,
  onRefresh,
  refreshing = false
}: {
  account: ProviderAccountSnapshot;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}) {
  const t = useAppText();
  const label = refreshing ? t("Refreshing account") : t("Refresh account");
  return (
    <button
      aria-label={label}
      className="m-0 inline-flex shrink-0 appearance-none items-center justify-center border-0 bg-transparent p-0 text-muted-foreground shadow-none transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-45"
      disabled={refreshing || !onRefresh}
      title={`${label} (${account.status})`}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void onRefresh?.();
      }}
    >
      {refreshing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
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
  dimensions,
  meter,
  onRefresh,
  single = false
}: {
  account: ProviderAccountSnapshot;
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
  const titleClassName = cn("min-w-0 truncate font-medium text-muted-foreground", single && dimensions.height >= 2 ? "text-[13px]" : "text-[12px]");
  const valueClassName = cn("shrink-0 font-semibold tracking-tight", single && dimensions.height >= 2 ? "text-[18px]" : "text-[15px]");
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
      <div className={valueClassName}>{formatProviderAccountMeterValue(meter)}</div>
    </>
  );

  return (
    <div className="min-w-0 overflow-hidden">
      {canExpandDetails ? (
        <button
          aria-controls={detailsId}
          aria-expanded={detailsOpen}
          aria-label={`${t(detailsOpen ? "Collapse" : "Expand")} ${title}`}
          className="group -mx-1 flex w-[calc(100%+8px)] min-w-0 items-end justify-between gap-3 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
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
        <div className={cn("mt-1.5 overflow-hidden rounded-full", single ? "bg-muted" : "bg-background", dimensions.height <= 1 ? "h-1.5" : "h-2")}>
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

type CodexResetLaunchStatus = "idle" | "launching" | "launched";

function CodexResetCreditDialog({
  account,
  detail,
  onClose,
  onResetComplete,
  open
}: {
  account: ProviderAccountSnapshot;
  detail: NonNullable<ProviderAccountMeter["details"]>[number] | undefined;
  onClose: () => void;
  onResetComplete?: () => void | Promise<void>;
  open: boolean;
}) {
  const t = useAppText();
  const [status, setStatus] = useState<CodexResetLaunchStatus>("idle");
  const [error, setError] = useState("");
  const detailLabel = detail ? providerAccountMeterDetailLabel(detail, 0, t) : "";
  const detailStatus = providerAccountMeterDetailStatusLabel(detail?.status, t);

  useEffect(() => {
    if (!open) {
      setStatus("idle");
      setError("");
    }
  }, [open, detail?.id]);

  async function resetCredit() {
    if (status !== "idle" || !detail?.id) {
      return;
    }
    if (!window.ccr?.resetCodexRateLimitCredit) {
      setError(t("Reset is unavailable."));
      return;
    }

    setError("");
    setStatus("launching");
    const ignition = delay(2000);
    try {
      await window.ccr.resetCodexRateLimitCredit({
        credentialId: account.credentialId,
        creditId: detail.id,
        provider: account.provider
      });
      await ignition;
      setStatus("launched");
      await onResetComplete?.();
      window.setTimeout(() => {
        onClose();
        setStatus("idle");
      }, 1800);
    } catch (resetError) {
      await ignition.catch(() => undefined);
      setError(formatDialogError(resetError));
      setStatus("idle");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && status !== "launching") onClose(); }}>
      <DialogContent className="max-w-[560px] overflow-hidden border-slate-700/60 bg-slate-950 p-0 text-white shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
        <DialogBody className="relative min-h-[420px] overflow-hidden p-0">
          <style>{codexResetSpaceAnimationCss}</style>
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,#020617_0%,#030712_48%,#07111f_100%)]" />
            <div
              className="ccr-codex-starfield-slow absolute -inset-12 opacity-80"
              style={{
                backgroundImage: codexResetStarfieldDense,
                backgroundSize: "180px 180px"
              }}
            />
            <div
              className="ccr-codex-starfield-deep absolute -inset-16 opacity-55"
              style={{
                backgroundImage: codexResetStarfieldWide,
                backgroundSize: "320px 320px"
              }}
            />
            <div className="ccr-codex-nebula absolute -inset-24 opacity-75" />
            {codexResetSpaceDust.map((dust) => (
              <div
                className="ccr-codex-space-dust absolute rounded-full bg-cyan-100/60 shadow-[0_0_12px_rgba(125,211,252,0.55)]"
                key={dust.id}
                style={{
                  animationDelay: `${dust.delay}s`,
                  animationDuration: `${dust.duration}s`,
                  height: dust.size,
                  left: `${dust.left}%`,
                  top: `${dust.top}%`,
                  width: dust.size
                }}
              />
            ))}
            {codexResetLaunchStars.map((star) => (
              <div
                className="ccr-codex-twinkle-star absolute rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.75)]"
                key={star.id}
                style={{
                  animationDelay: `${star.delay}s`,
                  animationDuration: `${star.duration}s`,
                  height: star.size,
                  left: `${star.left}%`,
                  top: `${star.top}%`,
                  width: star.size
                }}
              />
            ))}
            {codexResetShootingStars.map((meteor) => (
              <div
                className="ccr-codex-meteor absolute h-px w-36 rounded-full bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_16px_rgba(255,255,255,0.95)]"
                key={meteor.id}
                style={{
                  animationDelay: `${meteor.delay}s`,
                  animationDuration: `${meteor.duration}s`,
                  opacity: meteor.opacity,
                  top: `${meteor.top}%`
                }}
              />
            ))}
          </div>
          <Button
            aria-label={t("Close")}
            className="absolute right-3 top-3 z-20 text-slate-300 hover:bg-white/10 hover:text-white"
            disabled={status === "launching"}
            onClick={onClose}
            size="iconSm"
            title={t("Close")}
            type="button"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <div className="absolute left-5 right-14 top-5 z-10 min-w-0 text-slate-300">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{t("Manual reset credit")}</div>
            <div className="mt-1 truncate text-[15px] font-semibold text-white" title={detailLabel || undefined}>{detailLabel || "-"}</div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span>{t("Expires")}: {formatProviderAccountDetailDate(detail?.expiresAt)}</span>
              {detailStatus ? <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">{detailStatus}</span> : null}
            </div>
          </div>
          <div className="relative z-10 flex min-h-[420px] flex-col items-center justify-center px-4 py-16 font-sans">
            <div className="flex flex-col items-center">
              <motion.button
                animate={status === "launching" ? {
                  x: [-2, 2, -3, 3, -1, 1, 0],
                  y: [-1, 1, -2, 2, -1, 1, 0]
                } : {}}
                className="group relative overflow-hidden rounded-full border border-red-400/50 bg-gradient-to-b from-orange-500 to-red-600 shadow-[0_0_40px_rgba(239,68,68,0.3)] transition-shadow duration-300 hover:shadow-[0_0_60px_rgba(239,68,68,0.6)] disabled:cursor-not-allowed"
                disabled={status !== "idle"}
                onClick={() => void resetCredit()}
                transition={status === "launching" ? { duration: 0.3, repeat: Infinity } : {}}
                type="button"
                whileHover={status === "idle" ? { scale: 1.05 } : {}}
                whileTap={status === "idle" ? { scale: 0.95 } : {}}
              >
                <div className="relative z-10 flex w-64 items-center justify-center gap-4 px-10 py-5">
                  <AnimatePresence mode="wait">
                    {status === "idle" ? (
                      <motion.div
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 text-xl font-bold uppercase tracking-wider text-white"
                        exit={{ opacity: 0, y: -10 }}
                        initial={{ opacity: 0, y: 10 }}
                        key="idle-text"
                      >
                        <Rocket className="h-6 w-6" />
                        <span>{t("Reset")}</span>
                      </motion.div>
                    ) : null}
                    {status === "launching" ? (
                      <motion.div
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 text-xl font-bold uppercase tracking-wider text-white"
                        exit={{ opacity: 0, scale: 0.9 }}
                        initial={{ opacity: 0, y: 10 }}
                        key="launching-text"
                      >
                        <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 0.2, repeat: Infinity }}>
                          <Rocket className="h-6 w-6 fill-white" />
                        </motion.div>
                        <span>{t("Resetting")}</span>
                      </motion.div>
                    ) : null}
                    {status === "launched" ? (
                      <motion.div
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-3 text-xl font-bold uppercase tracking-wider text-white"
                        exit={{ opacity: 0 }}
                        initial={{ opacity: 0 }}
                        key="launched-text"
                      >
                        <span className="bg-gradient-to-r from-yellow-200 to-white bg-clip-text text-transparent">{t("Reset complete")}</span>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                <AnimatePresence>
                  {(status === "launching" || status === "launched") ? (
                    <motion.div
                      animate={status === "launching" ? {
                        bottom: "-20px",
                        height: ["40px", "70px", "50px"],
                        opacity: [0.6, 1, 0.6],
                        width: ["50px", "60px", "50px"]
                      } : {
                        bottom: "-100px",
                        height: "250px",
                        opacity: 0,
                        width: "100px"
                      }}
                      className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full bg-gradient-to-t from-yellow-300 via-orange-500 to-transparent blur-md"
                      exit={{ opacity: 0 }}
                      initial={{ height: 0, opacity: 0, width: "40px" }}
                      transition={status === "launching" ? { duration: 0.1, repeat: Infinity } : { duration: 0.8, ease: "easeOut" }}
                    />
                  ) : null}
                </AnimatePresence>

                <AnimatePresence>
                  {status === "launched" ? (
                    <motion.div
                      animate={{ opacity: 0, scale: 0.5, y: -800 }}
                      className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
                      initial={{ opacity: 1, scale: 1.2, y: 0 }}
                      transition={{ duration: 1.5, ease: "easeIn" }}
                    >
                      <div className="relative">
                        <Rocket className="h-10 w-10 fill-white text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                        <motion.div
                          animate={{
                            height: ["100px", "150px", "120px"],
                            opacity: [0.8, 1, 0.8]
                          }}
                          className="absolute left-1/2 top-full h-32 w-6 -translate-x-1/2 rounded-full bg-gradient-to-b from-yellow-200 via-orange-500 to-transparent blur-sm"
                          transition={{ duration: 0.1, repeat: Infinity }}
                        />
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.button>

              <AnimatePresence>
                {status !== "idle" ? (
                  <motion.div
                    animate={status === "launching" ? {
                      opacity: 1,
                      scale: 1,
                      y: 0
                    } : {
                      opacity: 0,
                      scale: 2.5,
                      y: 50
                    }}
                    className="pointer-events-none absolute top-full mt-2 flex w-full justify-center"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0, scale: 0.8, y: -20 }}
                    transition={{ duration: status === "launching" ? 1 : 1.5 }}
                  >
                    <div className="relative h-24 w-48">
                      <motion.div animate={{ x: [-5, 5, -5] }} className="absolute left-4 top-0 text-slate-300 drop-shadow-xl" transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}>
                        <Cloud className="h-20 w-20 fill-slate-300 opacity-90" />
                      </motion.div>
                      <motion.div animate={{ x: [5, -5, 5] }} className="absolute right-4 top-4 text-slate-400 drop-shadow-xl" transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity }}>
                        <Cloud className="h-24 w-24 fill-slate-400 opacity-80" />
                      </motion.div>
                      <motion.div animate={{ y: [-3, 3, -3] }} className="absolute -top-2 left-16 text-slate-200 drop-shadow-xl" transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity }}>
                        <Cloud className="h-16 w-16 fill-slate-200 opacity-95" />
                      </motion.div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
          {error ? <div className="absolute bottom-4 left-5 right-5 z-20 rounded-md border border-red-400/30 bg-red-950/70 px-3 py-2 text-[11px] text-red-100">{error}</div> : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

const codexResetStarfieldDense = [
  "radial-gradient(circle at 12% 18%, rgba(255,255,255,0.75) 0 1px, transparent 1.4px)",
  "radial-gradient(circle at 42% 36%, rgba(186,230,253,0.65) 0 1px, transparent 1.6px)",
  "radial-gradient(circle at 74% 22%, rgba(255,255,255,0.6) 0 1px, transparent 1.5px)",
  "radial-gradient(circle at 18% 72%, rgba(226,232,240,0.55) 0 1px, transparent 1.4px)",
  "radial-gradient(circle at 88% 78%, rgba(147,197,253,0.5) 0 1px, transparent 1.6px)"
].join(", ");

const codexResetStarfieldWide = [
  "radial-gradient(circle at 18% 28%, rgba(255,255,255,0.5) 0 1.4px, transparent 2px)",
  "radial-gradient(circle at 58% 16%, rgba(219,234,254,0.45) 0 1.2px, transparent 2px)",
  "radial-gradient(circle at 78% 62%, rgba(255,255,255,0.42) 0 1.3px, transparent 2px)",
  "radial-gradient(circle at 34% 82%, rgba(125,211,252,0.35) 0 1.2px, transparent 2px)"
].join(", ");

const codexResetLaunchStars = Array.from({ length: 76 }, (_, index) => ({
  delay: (index % 9) * 0.18,
  duration: 2 + (index % 7) * 0.35,
  id: index,
  left: (index * 37) % 100,
  opacity: 0.45 + (index % 5) * 0.11,
  size: `${1.2 + (index % 4) * 0.65}px`,
  top: (index * 53) % 100
}));

const codexResetSpaceDust = Array.from({ length: 26 }, (_, index) => ({
  delay: (index % 8) * 0.55,
  duration: 5.5 + (index % 6) * 0.75,
  id: index,
  left: (index * 41) % 100,
  size: `${2 + (index % 3)}px`,
  top: (index * 29) % 100
}));

const codexResetShootingStars = Array.from({ length: 5 }, (_, index) => ({
  delay: 1.4 + index * 2.8,
  drop: 14 + (index % 3) * 5,
  duration: 5.8 + index * 0.7,
  id: index,
  opacity: 0.55 + (index % 3) * 0.12,
  repeatDelay: 8 + index * 1.4,
  rotate: 14 + (index % 2) * 6,
  top: 12 + index * 15
}));

const codexResetSpaceAnimationCss = `
  .ccr-codex-starfield-slow {
    animation: ccr-codex-starfield-slow 9s linear infinite;
    will-change: background-position;
  }

  .ccr-codex-starfield-deep {
    animation: ccr-codex-starfield-deep 15s linear infinite;
    will-change: background-position;
  }

  .ccr-codex-nebula {
    background:
      radial-gradient(circle at 24% 52%, rgba(239, 68, 68, 0.2), transparent 32%),
      radial-gradient(circle at 70% 42%, rgba(59, 130, 246, 0.18), transparent 36%),
      radial-gradient(circle at 54% 76%, rgba(20, 184, 166, 0.12), transparent 38%);
    animation: ccr-codex-nebula 6s ease-in-out infinite alternate;
    will-change: opacity, transform;
  }

  .ccr-codex-twinkle-star {
    animation-name: ccr-codex-twinkle-star;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    opacity: 0.24;
    will-change: opacity, transform;
  }

  .ccr-codex-space-dust {
    animation-name: ccr-codex-space-dust;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    opacity: 0;
    will-change: opacity, transform;
  }

  .ccr-codex-meteor {
    left: -32%;
    opacity: 0;
    transform: translate3d(-160px, -40px, 0) rotate(16deg);
    animation-name: ccr-codex-meteor;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
    will-change: opacity, transform;
  }

  @keyframes ccr-codex-starfield-slow {
    from { background-position: 0 0; }
    to { background-position: 180px 180px; }
  }

  @keyframes ccr-codex-starfield-deep {
    from { background-position: 0 0; }
    to { background-position: -320px 320px; }
  }

  @keyframes ccr-codex-nebula {
    0% { opacity: 0.42; transform: translate3d(-18px, 10px, 0) scale(1); }
    100% { opacity: 0.82; transform: translate3d(18px, -14px, 0) scale(1.08); }
  }

  @keyframes ccr-codex-twinkle-star {
    0%, 100% { opacity: 0.18; transform: scale(0.65); }
    45% { opacity: 0.95; transform: scale(1.8); }
    70% { opacity: 0.36; transform: scale(1.1); }
  }

  @keyframes ccr-codex-space-dust {
    0% { opacity: 0; transform: translate3d(-10px, 24px, 0) scale(0.7); }
    35% { opacity: 0.75; }
    100% { opacity: 0; transform: translate3d(34px, -44px, 0) scale(1.35); }
  }

  @keyframes ccr-codex-meteor {
    0%, 48% { opacity: 0; transform: translate3d(-180px, -72px, 0) rotate(16deg) scaleX(0.75); }
    54% { opacity: 1; }
    72% { opacity: 0.85; }
    100% { opacity: 0; transform: translate3d(860px, 210px, 0) rotate(16deg) scaleX(1.25); }
  }
`;

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
        <path d={path} fill="none" pathLength={100} stroke="hsl(var(--muted))" strokeLinecap="round" strokeWidth="11" />
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
      <circle cx={cx} cy={cy} fill="none" r={radius} stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
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

function providerAccountSelectionMatches(account: ProviderAccountSnapshot, value: string): boolean {
  return providerAccountSnapshotKey(account) === value || account.provider === value;
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

function providerAccountContentPaddingClass(dimensions: OverviewWidgetDimensions): string {
  return dimensions.height <= 1 || dimensions.width <= 1 ? "p-2" : "p-3";
}

function providerAccountCardPaddingClass(dimensions: OverviewWidgetDimensions): string {
  return dimensions.height <= 1 || dimensions.width <= 1 ? "p-2" : "p-3";
}

function providerAccountGapClass(dimensions: OverviewWidgetDimensions): string {
  return dimensions.height <= 1 || dimensions.width <= 1 ? "gap-2" : "gap-3";
}

function providerAccountStackClass(dimensions: OverviewWidgetDimensions): string {
  return dimensions.height <= 1 ? "space-y-1.5" : "space-y-2.5";
}

function providerAccountGridClass(dimensions: OverviewWidgetDimensions): string {
  if (dimensions.width >= 3) return "md:grid-cols-2 xl:grid-cols-3";
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

function providerAccountShowExtraCount(dimensions: OverviewWidgetDimensions): boolean {
  return dimensions.height >= 3;
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

      {selectedSession || snapshot.selectedSession ? (
        <AgentSessionDetailCard
          clearSession={() => setSelectedSession(undefined)}
          detail={snapshot.selectedSession}
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

function AgentEndpointsCard({ endpoints }: { endpoints: AgentAnalysisSnapshot["endpoints"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Endpoint Health")}</CardTitle>
        <Badge variant="outline">{endpoints.length}</Badge>
      </CardHeader>
      <CardContent>
        {endpoints.length === 0 ? (
          <AnalysisEmptyState label={t("No endpoint activity")} />
        ) : (
          <div className={cn("max-h-[380px]", agentListFrameClassName)}>
            <table className={cn("min-w-[980px]", agentListTableClassName)}>
              <thead className={agentListHeadClassName}>
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Path")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Success rate")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("P95")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Max concurrent")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Status codes")}</th>
                </tr>
              </thead>
              <tbody className={agentListBodyClassName}>
                {endpoints.map((endpoint) => (
                  <tr className={agentListRowClassName()} key={endpoint.key}>
                    <td className="max-w-[260px] px-3 py-2" title={`${endpoint.method} ${endpoint.path}`}>
                      <span className="font-mono font-semibold">{endpoint.method}</span> {endpoint.path}
                    </td>
                    <td className="px-3 py-2">{t(agentKindLabel(endpoint.agent))}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(endpoint.requestCount)}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(endpoint.successRate)}</td>
                    <td className="px-3 py-2 text-right">{formatDuration(endpoint.p95DurationMs)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(endpoint.maxConcurrentRequests)}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(endpoint.cacheRatio)}</td>
                    <td className="px-3 py-2">{formatStatusCodeCounts(endpoint.statusCodes)}</td>
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

function AgentClientsCard({ clients }: { clients: AgentAnalysisSnapshot["clients"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Client Signals")}</CardTitle>
        <Badge variant="outline">{clients.length}</Badge>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <AnalysisEmptyState label={t("No client signals")} />
        ) : (
          <div className={cn("max-h-[380px]", agentListFrameClassName)}>
            <table className={cn("min-w-[720px]", agentListTableClassName)}>
              <thead className={agentListHeadClassName}>
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Client")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Sessions")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Success rate")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("P95")}</th>
                  <th className="px-3 py-2 font-semibold">{t("UA")}</th>
                </tr>
              </thead>
              <tbody className={agentListBodyClassName}>
                {clients.map((client) => (
                  <tr className={agentListRowClassName()} key={client.key}>
                    <td className="max-w-[160px] px-3 py-2 font-semibold" title={client.label}>{client.label}</td>
                    <td className="px-3 py-2">{t(agentKindLabel(client.agent))}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(client.sessionCount)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(client.requestCount)}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(client.successRate)}</td>
                    <td className="px-3 py-2 text-right">{formatDuration(client.p95DurationMs)}</td>
                    <td className="max-w-[260px] px-3 py-2 font-mono" title={client.userAgent}>{compactUserAgent(client.userAgent)}</td>
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

function AgentRoutesCard({ routes }: { routes: AgentAnalysisSnapshot["routes"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Route Observability")}</CardTitle>
        <Badge variant="outline">{routes.length}</Badge>
      </CardHeader>
      <CardContent>
        {routes.length === 0 ? (
          <AnalysisEmptyState label={t("No route activity")} />
        ) : (
          <div className={cn("max-h-[360px]", agentListFrameClassName)}>
            <table className={cn("min-w-[700px]", agentListTableClassName)}>
              <thead className={agentListHeadClassName}>
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Route")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Model")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Success rate")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("P95")}</th>
                </tr>
              </thead>
              <tbody className={agentListBodyClassName}>
                {routes.map((route) => (
                  <tr className={agentListRowClassName()} key={route.key}>
                    <td className="max-w-[180px] px-3 py-2 font-semibold" title={formatRouteReason(route.routeReason)}>{formatRouteReason(route.routeReason)}</td>
                    <td className="px-3 py-2">{t(agentKindLabel(route.agent))}</td>
                    <td className="max-w-[220px] px-3 py-2" title={`${route.provider}/${route.model}`}>{route.provider}/{route.model}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(route.requestCount)}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(route.successRate)}</td>
                    <td className="px-3 py-2 text-right">{formatDuration(route.p95DurationMs)}</td>
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

function AgentErrorsCard({ errors }: { errors: AgentAnalysisSnapshot["errors"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Recent Errors")}</CardTitle>
        <Badge variant="outline">{errors.length}</Badge>
      </CardHeader>
      <CardContent>
        {errors.length === 0 ? (
          <AnalysisEmptyState label={t("No errors")} />
        ) : (
          <div className={cn("max-h-[360px]", agentListFrameClassName)}>
            <table className={cn("min-w-[900px]", agentListTableClassName)}>
              <thead className={agentListHeadClassName}>
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Time")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Status")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Path")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Route")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Duration")}</th>
                </tr>
              </thead>
              <tbody className={agentListBodyClassName}>
                {errors.map((error) => (
                  <tr className={agentListRowClassName({ danger: true })} key={error.id}>
                    <td className="px-3 py-2 font-mono">{formatLogDateTime(error.createdAt)}</td>
                    <td className="px-3 py-2 font-semibold" title={error.error}>{error.statusCode || "-"}</td>
                    <td className="max-w-[260px] px-3 py-2" title={`${error.method} ${error.path}`}>{error.method} {error.path}</td>
                    <td className="px-3 py-2">{t(agentKindLabel(error.agent))}</td>
                    <td className="max-w-[140px] px-3 py-2" title={formatRouteReason(error.routeReason)}>{formatRouteReason(error.routeReason)}</td>
                    <td className="px-3 py-2 text-right">{formatDuration(error.durationMs)}</td>
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

function AgentSessionDetailCard({
  clearSession,
  detail,
  selectedSession
}: {
  clearSession: () => void;
  detail?: AgentAnalysisSnapshot["selectedSession"];
  selectedSession?: AgentAnalysisSessionSelection;
}) {
  const t = useAppText();
  const session = detail?.session;
  const headerLabel = session
    ? `${t(agentKindLabel(session.agent))} / ${compactId(session.id)}`
    : selectedSession
      ? `${t(agentKindLabel(selectedSession.agent))} / ${compactId(selectedSession.id)}`
      : t("Session");

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
        <DialogBody>
        {!detail ? (
          <AnalysisEmptyState label={t("Loading session metrics")} />
        ) : (
          <div className="space-y-4">
            <AgentTracePanel trace={detail.trace} />

            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[12px] font-semibold">{t("Session Requests")}</div>
              </div>
              {detail.requests.length === 0 ? (
                <AnalysisEmptyState label={t("No session requests")} />
              ) : (
                <div className={cn("max-h-[260px]", agentListFrameClassName)}>
                  <table className={cn("min-w-[980px]", agentListTableClassName)}>
                    <thead className={agentListHeadClassName}>
                      <tr>
                        <th className="px-3 py-2 font-semibold">{t("Time")}</th>
                        <th className="px-3 py-2 font-semibold">{t("Status")}</th>
                        <th className="px-3 py-2 font-semibold">{t("Route")}</th>
                        <th className="px-3 py-2 font-semibold">{t("Model")}</th>
                        <th className="px-3 py-2 text-right font-semibold">{t("Tools")}</th>
                        <th className="px-3 py-2 text-right font-semibold">{t("Tokens")}</th>
                        <th className="px-3 py-2 text-right font-semibold">{t("Duration")}</th>
                      </tr>
                    </thead>
                    <tbody className={agentListBodyClassName}>
                      {detail.requests.map((request) => (
                        <tr className={agentListRowClassName()} key={request.id}>
                          <td className="px-3 py-2 font-mono">{formatLogDateTime(request.createdAt)}</td>
                          <td className="px-3 py-2 font-semibold">{request.statusCode || "-"}</td>
                          <td className="max-w-[140px] px-3 py-2" title={formatRouteReason(request.routeReason)}>{formatRouteReason(request.routeReason)}</td>
                          <td className="max-w-[300px] px-3 py-2" title={`${request.provider}/${request.model}`}>{request.provider}/{request.model}</td>
                          <td className="px-3 py-2 text-right" title={request.tools.join(", ")}>{formatCompactNumber(request.toolCallCount)}</td>
                          <td className="px-3 py-2 text-right">{formatCompactNumber(request.totalTokens)}</td>
                          <td className="px-3 py-2 text-right">{formatDuration(request.durationMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

const agentListSurfaceClassName = "rounded-md border border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const agentListFrameClassName = cn("overflow-auto", agentListSurfaceClassName);
const agentListTableClassName = "w-full border-collapse text-left text-[11px]";
const agentListHeadClassName = "sticky top-0 z-10 border-b border-border/70 bg-muted/80 text-muted-foreground backdrop-blur";
const agentListBodyClassName = "divide-y divide-border/50";

function agentListRowClassName({
  danger,
  selected
}: {
  danger?: boolean;
  selected?: boolean;
} = {}) {
  return cn(
    "bg-card/40 transition-colors hover:bg-muted/30",
    danger && "bg-rose-500/5 hover:bg-rose-500/10",
    selected && "bg-teal-500/10 shadow-[inset_2px_0_0_rgba(20,184,166,0.7)] hover:bg-teal-500/15"
  );
}

type AgentTraceDetail = NonNullable<AgentAnalysisSnapshot["selectedSession"]>["trace"];
type TracePayloadPreviewValue = NonNullable<NonNullable<AgentAnalysisTraceRun["tool"]>["input"]>;

function AgentTracePanel({ trace }: { trace: AgentTraceDetail }) {
  const t = useAppText();
  const durationMs = Math.max(trace.durationMs, 1);
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

      {trace.runs.length === 0 ? (
        <AnalysisEmptyState label={t("No trace runs")} />
      ) : (
        <div className={cn("max-h-[420px]", agentListFrameClassName)}>
          <table className={cn("min-w-[1180px]", agentListTableClassName)}>
            <thead className={agentListHeadClassName}>
              <tr>
                <th className="px-3 py-2 font-semibold">{t("Run")}</th>
                <th className="px-3 py-2 font-semibold">{t("Timeline")}</th>
                <th className="px-3 py-2 font-semibold">{t("Status")}</th>
                <th className="px-3 py-2 font-semibold">{t("Target")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Tokens")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Concurrency")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Duration")}</th>
              </tr>
            </thead>
            <tbody className={agentListBodyClassName}>
              {trace.runs.map((run) => (
                <tr className={agentListRowClassName({ danger: run.status === "error" })} key={run.id}>
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
                    <Badge className={cn("border", run.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")} variant="outline">
                      {t(run.status === "error" ? "Error" : "Success")}
                    </Badge>
                  </td>
                  <td className="max-w-[260px] px-3 py-2" title={traceRunTarget(run)}>
                    <TraceRunTarget run={run} onOpenTool={() => setSelectedToolRun(run)} />
                  </td>
                  <td className="px-3 py-2 text-right">{run.totalTokens > 0 ? formatCompactNumber(run.totalTokens) : "-"}</td>
                  <td className="px-3 py-2 text-right">{run.cacheReadTokens + run.cacheWriteTokens > 0 ? formatCompactNumber(run.cacheReadTokens + run.cacheWriteTokens) : "-"}</td>
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

function traceRunKindLabel(kind: AgentAnalysisTraceRun["kind"]): string {
  if (kind === "agent") return "Agent";
  if (kind === "llm") return "LLM";
  if (kind === "route") return "Route";
  if (kind === "subagent") return "Subagent";
  return "Tool";
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
    <Dialog className="z-[70] items-start" onOpenChange={(open) => !open && onClose()} open>
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
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/20">
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
  const [expanded, setExpanded] = useState(false);
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
  if (run.kind === "agent") return "bg-teal-500";
  if (run.kind === "route") return "bg-cyan-500";
  if (run.kind === "subagent") return "bg-amber-500";
  if (run.kind === "tool") return "bg-emerald-500";
  return "bg-blue-500";
}

function traceRunBarClass(run: AgentAnalysisTraceRun): string {
  if (run.status === "error") return "bg-rose-500";
  if (run.kind === "agent") return "bg-teal-500";
  if (run.kind === "route") return "bg-cyan-500";
  if (run.kind === "subagent") return "bg-amber-500";
  if (run.kind === "tool") return "bg-emerald-500";
  return "bg-blue-500";
}

function SessionMetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-r border-border/60 px-3 py-2 last:border-r-0 xl:border-b-0">
      <div className="truncate text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-[13px] font-semibold text-foreground" title={value}>{value}</div>
    </div>
  );
}

function SessionInlineList({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 px-3 py-2 text-[11px]">
      <div className="text-muted-foreground">{title}</div>
      <div className="mt-1 truncate font-medium" title={value}>{value || "-"}</div>
    </div>
  );
}

function formatToolRows(tools: AgentAnalysisSnapshot["tools"]): string {
  return tools.slice(0, 5).map((tool) => `${tool.name} (${formatCompactNumber(tool.count)})`).join(", ");
}

function formatRouteRows(routes: AgentAnalysisSnapshot["routes"]): string {
  return routes.slice(0, 5).map((route) => `${formatRouteReason(route.routeReason)}: ${formatCompactNumber(route.requestCount)}`).join(", ");
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
          <table className={cn("min-w-[1260px]", agentListTableClassName)}>
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

function AgentToolsCard({ tools }: { tools: AgentAnalysisSnapshot["tools"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Tool Usage")}</CardTitle>
        <Badge variant="outline">{tools.length}</Badge>
      </CardHeader>
      <CardContent>
        {tools.length === 0 ? (
          <AnalysisEmptyState label={t("No tool calls")} />
        ) : (
          <div className={cn("max-h-[380px]", agentListFrameClassName)}>
            <table className={cn("min-w-[560px]", agentListTableClassName)}>
              <thead className={agentListHeadClassName}>
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Tool")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Tool calls")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Sessions")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                </tr>
              </thead>
              <tbody className={agentListBodyClassName}>
                {tools.map((tool) => (
                  <tr className={agentListRowClassName()} key={tool.name}>
                    <td className="max-w-[220px] px-3 py-2 font-semibold" title={tool.name}>{tool.name}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(tool.count)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(tool.requestCount)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(tool.sessions)}</td>
                    <td className="px-3 py-2">{tool.agents.map(agentKindLabel).map(t).join(", ")}</td>
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

function AgentSubagentsCard({ subagents }: { subagents: AgentAnalysisSnapshot["subagents"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Subagent Routing")}</CardTitle>
        <Badge variant="outline">{subagents.length}</Badge>
      </CardHeader>
      <CardContent>
        {subagents.length === 0 ? (
          <AnalysisEmptyState label={t("No subagent calls")} />
        ) : (
          <div className={cn("max-h-[360px]", agentListFrameClassName)}>
            <table className={cn("min-w-[620px]", agentListTableClassName)}>
              <thead className={agentListHeadClassName}>
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Session")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Model")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Tokens")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                </tr>
              </thead>
              <tbody className={agentListBodyClassName}>
                {subagents.map((subagent) => (
                  <tr className={agentListRowClassName()} key={`${subagent.agent}:${subagent.sessionId}:${subagent.provider}:${subagent.model}`}>
                    <td className="max-w-[160px] px-3 py-2 font-mono font-semibold" title={subagent.sessionId}>{compactId(subagent.sessionId)}</td>
                    <td className="max-w-[240px] px-3 py-2" title={`${subagent.provider}/${subagent.model}`}>{subagent.provider}/{subagent.model}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(subagent.count)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(subagent.totalTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(subagent.cacheReadTokens + subagent.cacheWriteTokens)}</td>
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

function AgentRecentRequestsCard({ requests }: { requests: AgentAnalysisSnapshot["recentRequests"] }) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Recent Requests")}</CardTitle>
        <Badge variant="outline">{requests.length}</Badge>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <AnalysisEmptyState label={t("No recent agent requests")} />
        ) : (
          <div className={cn("max-h-[360px]", agentListFrameClassName)}>
            <table className={cn("min-w-[1240px]", agentListTableClassName)}>
              <thead className={agentListHeadClassName}>
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Time")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Client")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Status")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Session")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Route")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Model")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Tools")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Subagents")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Concurrency")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Duration")}</th>
                </tr>
              </thead>
              <tbody className={agentListBodyClassName}>
                {requests.map((request) => (
                  <tr className={agentListRowClassName()} key={request.id}>
                    <td className="px-3 py-2 font-mono">{formatLogDateTime(request.createdAt)}</td>
                    <td className="px-3 py-2">{t(agentKindLabel(request.agent))}</td>
                    <td className="max-w-[160px] px-3 py-2" title={request.userAgent || request.client}>{request.client}</td>
                    <td className="px-3 py-2 font-semibold">{request.statusCode || "-"}</td>
                    <td className="max-w-[150px] px-3 py-2 font-mono font-semibold" title={request.sessionId}>{compactId(request.sessionId)}</td>
                    <td className="max-w-[130px] px-3 py-2" title={formatRouteReason(request.routeReason)}>{formatRouteReason(request.routeReason)}</td>
                    <td className="max-w-[240px] px-3 py-2" title={`${request.provider}/${request.model}`}>{request.provider}/{request.model}</td>
                    <td className="px-3 py-2 text-right" title={request.tools.join(", ")}>{formatCompactNumber(request.toolCallCount)}</td>
                    <td className="px-3 py-2 text-right">{request.subagentModel ? request.subagentModel : "-"}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(request.cacheReadTokens + request.cacheWriteTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(request.concurrentRequests)}</td>
                    <td className="px-3 py-2 text-right">{formatDuration(request.durationMs)}</td>
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

function AnalysisEmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">
      {label}
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
    <Card className="flex h-full min-h-0 min-w-0 flex-col">
      <CardHeader className="shrink-0 flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge variant="outline">{rows.length}</Badge>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-hidden">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">{emptyLabel}</div>
        ) : (
          <div className={cn("h-full overflow-hidden", agentListSurfaceClassName)}>
            <table className={cn("table-fixed", agentListTableClassName)}>
              <thead className="border-b border-border/70 bg-muted/80 text-muted-foreground">
                <tr>
                  {visibleColumns.map((column) => (
                    <th className="px-3 py-2 font-semibold" key={column.key}>{column.label}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold">{t("Tokens")}</th>
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
                    {showCacheRate ? <td className="px-3 py-2 text-right">{formatPercent(row.cacheRatio)}</td> : null}
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
    <div className="rounded-lg border border-border/60 bg-card/95 glass-surface px-3 py-2.5 text-[11px] shadow-card-elevated">
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
    <div className="rounded-lg border border-border/60 bg-card/95 glass-surface px-3 py-2.5 text-[11px] shadow-card-elevated">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-muted-foreground">{formatCompactNumber(Number(payload[0]?.value) || 0)} tokens</div>
    </div>
  );
}
