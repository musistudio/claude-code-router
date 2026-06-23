import {
  agentAnalysisRangeOptions, AgentAnalysisSessionSelection, AgentAnalysisSnapshot, agentFilterOptions, AgentFilterValue, agentKindLabel,
  Area, arrayMove, Badge, Bar, BarChart, Button,
  Card, CardContent, CardHeader, CardTitle, CartesianGrid, Cell, constrainOverviewWidgetSize,
  Check, ChevronLeft, ChevronRight, CircleAlert, cn, compactId,
  compactUserAgent, compareProviderAccountSnapshots, ComposedChart, CSS, DEFAULT_OVERVIEW_WIDGETS, DndContext,
  DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent, Field, formatAxisNumber,
  formatCompactNumber, formatDuration, formatLogDateTime, formatPercent, formatProviderAccountMeterTitle, formatProviderAccountMeterValue,
  formatStatusBucketDate, formatStatusCodeCounts, formatSystemStatusRange, formatToolCounts, formatUsdCost, KeyboardSensor,
  LabelList, LayoutGroup, Line, MeasuringStrategy, MetricCard, MetricTone,
  metricToneBar, metricToneStroke, motion, normalizeAgentFilterValue, normalizeOverviewWidget, normalizeOverviewWidgets,
  OverviewMetricKind, overviewMetricOptions, overviewWidgetCollisionDetection, OverviewWidgetConfig, OverviewWidgetSize, overviewWidgetSizeOptions,
  OverviewWidgetType, OverviewWidgetVariant, Pencil, Pie, PieChart, Plus,
  PointerSensor, primaryProviderAccountMeter, providerAccountBadgeVariant, providerAccountMeterProgress, providerAccountMetersForDisplay, providerAccountProgressClass,
  providerAccountSnapshotKey, providerAccountSnapshotLabel,
  ProviderAccountMeter, ProviderAccountSnapshot, ReactNode, ReactPointerEvent, rectSortingStrategy, RefreshCw, Select,
  SelectControl, SortableContext, sortableKeyboardCoordinates, systemStatusIconClass, systemStatusPointTooltip, systemStatusSegmentClass,
  systemStatusTooltipPositionClass, Tooltip, translateOptions, Trash2, UsageComparisonRow, usageRangeOptions,
  UsageSeriesPoint, UsageStatsRange, UsageStatsSnapshot, usageStatusTone, UsageTotals, useAppText,
  useEffect, useMemo, useRef, useSensor, useSensors, useSortable,
  useState, X, XAxis, YAxis
} from "../shared";
export function OverviewView({
  onWidgetsChange,
  overviewWidgets,
  providerAccounts,
  setUsageRange,
  usageRange,
  usageStats
}: {
  onWidgetsChange: (widgets: OverviewWidgetConfig[]) => void;
  overviewWidgets: OverviewWidgetConfig[];
  providerAccounts: ProviderAccountSnapshot[];
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
            <div className="truncate text-[12px] font-semibold text-foreground">{t(overviewWidgetCategoryLabel(overviewWidgetCategory(template.type)))}</div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{t(overviewWidgetCategoryDescription(overviewWidgetCategory(template.type)))}</div>
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
  usageRange,
  usageStats,
  widget
}: {
  providerAccounts: ProviderAccountSnapshot[];
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
  widget: OverviewWidgetConfig;
}) {
  return (
    <div className={cn("pointer-events-none overflow-hidden opacity-95 shadow-2xl", overviewWidgetOverlaySizeClass(widget.size))}>
      <OverviewWidgetRenderer
        providerAccounts={providerAccounts}
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
  usageRange,
  usageStats,
  widget
}: {
  providerAccounts: ProviderAccountSnapshot[];
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
  widget: OverviewWidgetConfig;
}) {
  const dimensions = overviewWidgetDimensions(widget.size);
  let content: ReactNode;
  if (widget.type === "system-status") {
    content = <SystemStatusBar usageRange={usageRange} usageStats={usageStats} variant={widget.variant === "compact" ? "compact" : "timeline"} />;
  } else if (widget.type === "account-balance") {
    content = <ProviderAccountsOverview accountProvider={widget.accountProvider} accounts={providerAccounts} dimensions={dimensions} variant={overviewAccountVariant(widget.variant)} />;
  } else if (widget.type === "metric") {
    content = <OverviewMetricWidget metric={widget.metric ?? "requests"} totals={usageStats.totals} variant={overviewMetricVariant(widget.variant)} />;
  } else if (widget.type === "usage-trend") {
    content = <UsageTrendWidget dimensions={dimensions} usageRange={usageRange} usageStats={usageStats} variant={overviewTrendVariant(widget.variant)} />;
  } else if (widget.type === "token-mix") {
    content = <TokenMixOverviewWidget dimensions={dimensions} totals={usageStats.totals} variant={overviewTokenMixVariant(widget.variant)} />;
  } else if (widget.type === "model-distribution") {
    content = <ModelDistributionOverviewWidget dimensions={dimensions} rows={usageStats.models} variant={overviewTokenMixVariant(widget.variant)} />;
  } else if (widget.type === "client-analysis") {
    content = <OverviewAnalysisWidget dimensions={dimensions} kind="client" rows={usageStats.clientModels} variant={widget.variant === "compact" ? "compact" : "table"} />;
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
                  <Line dataKey="cacheTokens" dot={false} name={t("Cache tokens")} stroke="#be123c" strokeWidth={2} type="monotone" yAxisId="tokens" />
                </>
              ) : null}
              {variant === "area" ? (
                <>
                  <Area dataKey="totalTokens" fill="#0f766e" fillOpacity={0.18} name={t("Total tokens")} stroke="#0f766e" strokeWidth={2} type="monotone" yAxisId="tokens" />
                  <Area dataKey="cacheTokens" fill="#be123c" fillOpacity={0.12} name={t("Cache tokens")} stroke="#be123c" strokeWidth={2} type="monotone" yAxisId="tokens" />
                </>
              ) : null}
              {variant === "line" ? (
                <>
                  <Line dataKey="totalTokens" dot={false} name={t("Total tokens")} stroke="#0f766e" strokeWidth={2.5} type="monotone" yAxisId="tokens" />
                  <Line dataKey="cacheTokens" dot={false} name={t("Cache tokens")} stroke="#be123c" strokeWidth={2} type="monotone" yAxisId="tokens" />
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
    { color: "#be123c", name: t("Cache"), value: totals.cacheTokens }
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
    { enabled: true, id: "token-mix", size: "1:2", type: "token-mix", variant: "bars" },
    { enabled: true, id: "client-analysis", size: "2:2", type: "client-analysis", variant: "table" }
  ];
}

type OverviewWidgetCategory = "account-balance" | "analysis" | "breakdown" | "metric" | "system-status" | "usage-trend";

function overviewWidgetCategoryOptions(): Array<{ label: string; value: OverviewWidgetCategory }> {
  return [
    "system-status",
    "account-balance",
    "metric",
    "usage-trend",
    "breakdown",
    "analysis"
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
  if (category === "breakdown") {
    return overviewBreakdownDataOptions();
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
  return category;
}

function overviewWidgetCategory(type: OverviewWidgetType): OverviewWidgetCategory {
  if (type === "client-analysis" || type === "provider-analysis") {
    return "analysis";
  }
  if (type === "model-distribution" || type === "token-mix") {
    return "breakdown";
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
  return category;
}

function overviewWidgetTemplateKey(widget: OverviewWidgetConfig): string {
  return overviewWidgetCategory(widget.type);
}

function overviewWidgetCategoryLabel(category: OverviewWidgetCategory): string {
  if (category === "account-balance") return "Account component";
  if (category === "analysis") return "Analysis component";
  if (category === "metric") return "Metric component";
  if (category === "system-status") return "Status component";
  if (category === "breakdown") return "Breakdown component";
  return "Trend component";
}

function overviewWidgetCategoryDescription(category: OverviewWidgetCategory): string {
  if (category === "account-balance") return "Account Balance";
  if (category === "analysis") return "Client or provider";
  if (category === "metric") return "Requests, tokens, cost";
  if (category === "system-status") return "Status timeline";
  if (category === "breakdown") return "Token or model distribution";
  return "Usage over time";
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
  if (type === "system-status") return "System status";
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
  return [
    { label: "Table", value: "table" },
    { label: "Compact", value: "compact" }
  ];
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
    return { label: translate("Cache tokens"), ratio: totals.totalTokens > 0 ? totals.cacheTokens / totals.totalTokens : 0, tone: "rose", value: formatCompactNumber(totals.cacheTokens) };
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
  variant = "cards"
}: {
  accountProvider?: string;
  accounts: ProviderAccountSnapshot[];
  dimensions: OverviewWidgetDimensions;
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
          <ProviderAccountSinglePanel account={visibleAccounts[0]} dimensions={dimensions} variant={variant} />
        ) : variant === "compact" ? (
          <div className={cn("grid h-full min-h-0 grid-cols-1 overflow-y-auto pr-1", providerAccountGapClass(dimensions), providerAccountGridClass(dimensions))}>
            {visibleAccounts.map((account) => {
              const meter = primaryProviderAccountDisplayMeter(account);
              return (
                <div className="flex min-h-0 min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg border border-border bg-muted/20 px-3 py-2" key={providerAccountSnapshotKey(account)}>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold">{providerAccountSnapshotLabel(account)}</div>
                    {providerAccountShowSource(dimensions) ? <div className="truncate text-[11px] text-muted-foreground">{meter ? t(meter.label) : account.source}</div> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    {providerAccountShowStatus(dimensions) ? <Badge variant={providerAccountBadgeVariant(account.status)}>{account.status}</Badge> : null}
                    {meter ? <div className="mt-1 text-[12px] font-semibold">{formatProviderAccountMeterValue(meter)}</div> : null}
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
                      {providerAccountShowSource(dimensions) ? <div className="truncate text-[11px] text-muted-foreground">{meter ? t(meter.label) : account.source}</div> : null}
                    </div>
                    <div className="shrink-0 text-[12px] font-semibold">{meter ? formatProviderAccountMeterValue(meter) : account.status}</div>
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
              return <ProviderAccountSummaryCard account={account} dimensions={dimensions} key={providerAccountSnapshotKey(account)} variant={variant} />;
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
  variant
}: {
  account: ProviderAccountSnapshot;
  dimensions: OverviewWidgetDimensions;
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
          {providerAccountShowSource(dimensions) ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{account.source}</div> : null}
        </div>
        {providerAccountShowStatus(dimensions) ? <Badge variant={providerAccountBadgeVariant(account.status)}>{account.status}</Badge> : null}
      </div>
      {showQuotaVisual ? (
        <ProviderAccountQuotaVisual account={account} dimensions={dimensions} meters={quotaMeters} variant={variant} />
      ) : quotaMeters.length === 0 && balanceMeter ? (
        <ProviderAccountBalanceMetric dimensions={dimensions} meter={balanceMeter} />
      ) : meters.length > 0 ? (
        <div className={cn("min-h-0 overflow-hidden", providerAccountStackClass(dimensions))}>
          {meters.map((meter) => (
            <ProviderAccountMeterLine account={account} dimensions={dimensions} key={meter.id} meter={meter} single />
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
  variant
}: {
  account: ProviderAccountSnapshot;
  dimensions: OverviewWidgetDimensions;
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
          {providerAccountShowSource(dimensions) ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{account.source}</div> : null}
        </div>
        {providerAccountShowStatus(dimensions) ? <Badge variant={providerAccountBadgeVariant(account.status)}>{account.status}</Badge> : null}
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
            <ProviderAccountMeterLine account={account} dimensions={dimensions} key={meter.id} meter={meter} />
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

function ProviderAccountMeterLine({
  account,
  dimensions,
  meter,
  single = false
}: {
  account: ProviderAccountSnapshot;
  dimensions: OverviewWidgetDimensions;
  meter: ReturnType<typeof providerAccountMetersForDisplay>[number];
  single?: boolean;
}) {
  const t = useAppText();
  const progress = isProviderAccountQuotaMeter(meter) ? providerAccountMeterProgress(meter) : undefined;

  return (
    <div className="min-w-0 overflow-hidden">
      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className={cn("min-w-0 truncate font-medium text-muted-foreground", single && dimensions.height >= 2 ? "text-[13px]" : "text-[12px]")}>{formatProviderAccountMeterTitle(meter, t)}</div>
        <div className={cn("shrink-0 font-semibold tracking-tight", single && dimensions.height >= 2 ? "text-[18px]" : "text-[15px]")}>{formatProviderAccountMeterValue(meter)}</div>
      </div>
      {progress !== undefined && providerAccountShowProgress(dimensions) ? (
        <div className={cn("mt-1.5 overflow-hidden rounded-full", single ? "bg-muted" : "bg-background", dimensions.height <= 1 ? "h-1.5" : "h-2")}>
          <div className={cn("h-full rounded-full", providerAccountProgressClass(account.status))} style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );
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
  const ordered = [...providerAccountQuotaMeters(account), ...providerAccountBalanceMeters(account)];
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
  if (meter.window === "5h" || meter.id.toLowerCase().includes("5h") || meter.label.toLowerCase().includes("5h")) {
    return 0;
  }
  if (meter.window === "weekly" || meter.id.toLowerCase().includes("weekly") || meter.label.toLowerCase().includes("weekly")) {
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

function providerAccountShowStatus(dimensions: OverviewWidgetDimensions): boolean {
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
  const totals = snapshot.totals;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-auto pr-1"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
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
        <Select
          aria-label={t("Filter agent")}
          className="h-8 w-[160px] bg-[length:14px] px-2 pr-7 text-[12px]"
          onValueChange={(value) => setAgentFilter(normalizeAgentFilterValue(value))}
          options={translateOptions(agentFilterOptions, t)}
          value={agentFilter}
        />
        {selectedSession ? (
          <div className="flex h-8 max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px]">
            <span className="shrink-0 text-muted-foreground">{t("Session")}</span>
            <span className="min-w-0 max-w-[160px] truncate font-mono font-semibold" title={selectedSession.id}>{compactId(selectedSession.id)}</span>
            <Button aria-label={t("Clear session")} onClick={() => setSelectedSession(undefined)} size="iconSm" title={t("Clear session")} type="button" variant="ghost">
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : null}
        <div className="min-w-0 flex-1" />
        <Button aria-label={t("Refresh observability")} onClick={refreshAnalysis} size="iconSm" title={t("Refresh observability")} type="button" variant="outline">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive flex items-start gap-2">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label={t("Requests")} tone="teal" value={formatCompactNumber(totals.requestCount)} />
        <MetricCard label={t("Success rate")} tone="blue" value={formatPercent(totals.successRate)} />
        <MetricCard label={t("P95")} tone="amber" value={formatDuration(totals.p95DurationMs)} />
        <MetricCard label={t("Errors")} tone="rose" value={formatCompactNumber(totals.errorCount)} />
        <MetricCard label={t("Max concurrency")} tone="indigo" value={formatCompactNumber(totals.maxConcurrentRequests)} />
        <MetricCard label={t("Cache ratio")} tone="rose" value={formatPercent(totals.cacheRatio)} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("Concurrency")}</CardTitle>
            <Badge variant="outline">{formatCompactNumber(totals.errorCount)} {t("Errors")}</Badge>
          </CardHeader>
          <CardContent>
            <ChartFrame>
              {({ height, width }) => (
                <ComposedChart data={snapshot.concurrency} height={height} margin={{ bottom: 4, left: 0, right: 8, top: 8 }} width={width}>
                  <CartesianGrid stroke="#dfe3e8" strokeDasharray="3 3" vertical={false} />
                  <XAxis axisLine={false} dataKey="label" tick={{ fill: "#5f6b7a", fontSize: 11 }} tickLine={false} />
                  <YAxis axisLine={false} tick={{ fill: "#5f6b7a", fontSize: 11 }} tickFormatter={formatAxisNumber} tickLine={false} yAxisId="requests" />
                  <YAxis axisLine={false} hide orientation="right" yAxisId="concurrency" />
                  <Tooltip content={<UsageTooltip />} />
                  <Bar barSize={12} dataKey="requestCount" fill="#2563eb" name={t("Requests")} radius={[3, 3, 0, 0]} yAxisId="requests" />
                  <Line dataKey="maxConcurrentRequests" dot={false} name={t("Max concurrent")} stroke="#0f766e" strokeWidth={2} type="monotone" yAxisId="concurrency" />
                </ComposedChart>
              )}
            </ChartFrame>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("Agent Mix")}</CardTitle>
            <Badge variant="outline">{snapshot.agents.length}</Badge>
          </CardHeader>
          <CardContent>
            {snapshot.agents.length === 0 ? (
              <AnalysisEmptyState label={t("No agent activity")} />
            ) : (
              <div className="space-y-3">
                {snapshot.agents.map((agent) => (
                  <div className="min-w-0" key={agent.key}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                      <span className="truncate font-semibold">{t(agent.label)}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatCompactNumber(agent.totalTokens)} tokens</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(2, Math.round(agent.maxShare * 100))}%` }} />
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                      <span>{formatCompactNumber(agent.sessionCount)} {t("Sessions")}</span>
                      <span>{formatCompactNumber(agent.toolCallCount)} {t("Tools")}</span>
                      <span>{formatPercent(agent.cacheRatio)} {t("Cache")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
        <AgentEndpointsCard endpoints={snapshot.endpoints} />
        <AgentClientsCard clients={snapshot.clients} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,.85fr)_minmax(0,1.15fr)]">
        <AgentRoutesCard routes={snapshot.routes} />
        <AgentErrorsCard errors={snapshot.errors} />
      </section>

      {selectedSession || snapshot.selectedSession ? (
        <AgentSessionDetailCard
          clearSession={() => setSelectedSession(undefined)}
          detail={snapshot.selectedSession}
          selectedSession={selectedSession}
        />
      ) : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
        <AgentSessionsCard
          onSelectSession={setSelectedSession}
          selectedSession={selectedSession}
          sessions={snapshot.sessions}
        />
        <AgentToolsCard tools={snapshot.tools} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,.8fr)_minmax(0,1.2fr)]">
        <AgentSubagentsCard subagents={snapshot.subagents} />
        <AgentRecentRequestsCard requests={snapshot.recentRequests} />
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
          <div className="max-h-[380px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[980px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
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
              <tbody className="divide-y divide-border/60">
                {endpoints.map((endpoint) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={endpoint.key}>
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
          <div className="max-h-[380px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[720px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
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
              <tbody className="divide-y divide-border/60">
                {clients.map((client) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={client.key}>
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
          <div className="max-h-[360px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[700px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Route")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Model")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Success rate")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("P95")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {routes.map((route) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={route.key}>
                    <td className="max-w-[180px] px-3 py-2 font-semibold" title={route.routeReason}>{route.routeReason}</td>
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
          <div className="max-h-[360px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[900px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Time")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Status")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Path")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Route")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Duration")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {errors.map((error) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={error.id}>
                    <td className="px-3 py-2 font-mono">{formatLogDateTime(error.createdAt)}</td>
                    <td className="px-3 py-2 font-semibold" title={error.error}>{error.statusCode || "-"}</td>
                    <td className="max-w-[260px] px-3 py-2" title={`${error.method} ${error.path}`}>{error.method} {error.path}</td>
                    <td className="px-3 py-2">{t(agentKindLabel(error.agent))}</td>
                    <td className="max-w-[140px] px-3 py-2" title={error.routeReason}>{error.routeReason || "-"}</td>
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
    <Card className="min-w-0">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{t("Session Detail")}</CardTitle>
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={session?.id ?? selectedSession?.id}>
            {headerLabel}
          </div>
        </div>
        <Button aria-label={t("Clear session")} onClick={clearSession} size="iconSm" title={t("Clear session")} type="button" variant="outline">
          <X className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {!detail ? (
          <AnalysisEmptyState label={t("Loading session metrics")} />
        ) : (
          <div className="space-y-4">
            <div className="grid overflow-hidden rounded-md border border-border/60 bg-card text-[11px] sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <SessionMetricCell label={t("Requests")} value={formatCompactNumber(detail.totals.requestCount)} />
              <SessionMetricCell label={t("Success rate")} value={formatPercent(detail.totals.successRate)} />
              <SessionMetricCell label={t("P95")} value={formatDuration(detail.totals.p95DurationMs)} />
              <SessionMetricCell label={t("Max concurrency")} value={formatCompactNumber(detail.totals.maxConcurrentRequests)} />
              <SessionMetricCell label={t("Tokens")} value={formatCompactNumber(detail.totals.totalTokens)} />
              <SessionMetricCell label={t("Cache ratio")} value={formatPercent(detail.totals.cacheRatio)} />
              <SessionMetricCell label={t("Cost")} value={formatUsdCost(detail.totals.costUsd)} />
              <SessionMetricCell label={t("Status codes")} value={formatStatusCodeCounts(detail.statusCodes) || "-"} />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)]">
              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[12px] font-semibold">{t("Models")}</div>
                  <Badge variant="outline">{detail.models.length}</Badge>
                </div>
                {detail.models.length === 0 ? (
                  <AnalysisEmptyState label={t("No model activity")} />
                ) : (
                  <div className="max-h-[260px] overflow-auto rounded-lg border border-border/60">
                    <table className="min-w-[720px] w-full border-collapse text-left text-[11px]">
                      <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-semibold">{t("Model")}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t("Tokens")}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t("P95")}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t("Cost")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {detail.models.map((model) => (
                          <tr className="bg-card/40 hover:bg-muted/30" key={model.key}>
                            <td className="max-w-[280px] px-3 py-2" title={`${model.provider}/${model.model}`}>{model.provider}/{model.model}</td>
                            <td className="px-3 py-2 text-right">{formatCompactNumber(model.requestCount)}</td>
                            <td className="px-3 py-2 text-right">{formatCompactNumber(model.totalTokens)}</td>
                            <td className="px-3 py-2 text-right">{formatCompactNumber(model.cacheTokens)}</td>
                            <td className="px-3 py-2 text-right">{formatDuration(model.p95DurationMs)}</td>
                            <td className="px-3 py-2 text-right">{formatUsdCost(model.costUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[12px] font-semibold">{t("Session Requests")}</div>
                  <Badge variant="outline">{detail.requests.length}</Badge>
                </div>
                {detail.requests.length === 0 ? (
                  <AnalysisEmptyState label={t("No session requests")} />
                ) : (
                  <div className="max-h-[260px] overflow-auto rounded-lg border border-border/60">
                    <table className="min-w-[980px] w-full border-collapse text-left text-[11px]">
                      <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
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
                      <tbody className="divide-y divide-border/60">
                        {detail.requests.map((request) => (
                          <tr className="bg-card/40 hover:bg-muted/30" key={request.id}>
                            <td className="px-3 py-2 font-mono">{formatLogDateTime(request.createdAt)}</td>
                            <td className="px-3 py-2 font-semibold">{request.statusCode || "-"}</td>
                            <td className="max-w-[140px] px-3 py-2" title={request.routeReason}>{request.routeReason || "-"}</td>
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

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <SessionInlineList title={t("Top tools")} value={formatToolRows(detail.tools)} />
              <SessionInlineList title={t("Routes")} value={formatRouteRows(detail.routes)} />
              <SessionInlineList title={t("Errors")} value={detail.errors.length ? `${formatCompactNumber(detail.errors.length)} ${t("Errors")}` : t("No errors")} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
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
  return routes.slice(0, 5).map((route) => `${route.routeReason}: ${formatCompactNumber(route.requestCount)}`).join(", ");
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
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Sessions")}</CardTitle>
        <Badge variant="outline">{sessions.length}</Badge>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <AnalysisEmptyState label={t("No session activity")} />
        ) : (
          <div className="max-h-[380px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[1120px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Session")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Client")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Tools")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Subagents")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Max concurrent")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Top tools")}</th>
                  <th className="px-3 py-2 font-semibold">{t("UA")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Last seen")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sessions.map((session) => {
                  const selected = selectedSession?.agent === session.agent && selectedSession.id === session.id;
                  return (
                    <tr className={cn("bg-card/40 hover:bg-muted/30", selected && "bg-teal-500/10 hover:bg-teal-500/15")} key={`${session.agent}:${session.id}`}>
                      <td className="max-w-[180px] px-3 py-2" title={session.id}>
                        <button
                          className="max-w-full truncate font-mono font-semibold text-foreground underline-offset-2 hover:underline"
                          onClick={() => onSelectSession({ agent: session.agent, id: session.id })}
                          type="button"
                        >
                          {compactId(session.id)}
                        </button>
                      </td>
                      <td className="px-3 py-2">{t(agentKindLabel(session.agent))}</td>
                      <td className="max-w-[150px] px-3 py-2" title={session.client}>{session.client}</td>
                      <td className="px-3 py-2 text-right">{formatCompactNumber(session.requestCount)}</td>
                      <td className="px-3 py-2 text-right">{formatCompactNumber(session.toolCallCount)}</td>
                      <td className="px-3 py-2 text-right">{formatCompactNumber(session.subagentCallCount)}</td>
                      <td className="px-3 py-2 text-right">{formatCompactNumber(session.cacheTokens)}</td>
                      <td className="px-3 py-2 text-right">{formatCompactNumber(session.maxConcurrentRequests)}</td>
                      <td className="max-w-[220px] px-3 py-2" title={formatToolCounts(session.topTools)}>{formatToolCounts(session.topTools) || "-"}</td>
                      <td className="max-w-[220px] px-3 py-2 font-mono" title={session.userAgent}>{compactUserAgent(session.userAgent)}</td>
                      <td className="px-3 py-2 font-mono">{formatLogDateTime(session.lastSeenAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
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
          <div className="max-h-[380px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[560px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Tool")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Tool calls")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Sessions")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Agent")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {tools.map((tool) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={tool.name}>
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
          <div className="max-h-[360px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[620px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Session")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Model")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Tokens")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {subagents.map((subagent) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={`${subagent.agent}:${subagent.sessionId}:${subagent.provider}:${subagent.model}`}>
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
          <div className="max-h-[360px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[1240px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
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
              <tbody className="divide-y divide-border/60">
                {requests.map((request) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={request.id}>
                    <td className="px-3 py-2 font-mono">{formatLogDateTime(request.createdAt)}</td>
                    <td className="px-3 py-2">{t(agentKindLabel(request.agent))}</td>
                    <td className="max-w-[160px] px-3 py-2" title={request.userAgent || request.client}>{request.client}</td>
                    <td className="px-3 py-2 font-semibold">{request.statusCode || "-"}</td>
                    <td className="max-w-[150px] px-3 py-2 font-mono font-semibold" title={request.sessionId}>{compactId(request.sessionId)}</td>
                    <td className="max-w-[130px] px-3 py-2" title={request.routeReason}>{request.routeReason || "-"}</td>
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
          <div className="h-full overflow-hidden rounded-lg border border-border/60">
            <table className="w-full table-fixed border-collapse text-left text-[11px]">
              <thead className="bg-muted text-muted-foreground">
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
              <tbody className="divide-y divide-border/60">
                {visibleRows.map((row) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={row.key}>
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
