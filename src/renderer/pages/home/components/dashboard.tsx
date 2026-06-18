import {
  agentAnalysisRangeOptions, AgentAnalysisSnapshot, agentFilterOptions, AgentFilterValue, agentKindLabel, AnimatePresence,
  Area, arrayMove, Badge, Bar, BarChart, Button,
  Card, CardContent, CardHeader, CardTitle, CartesianGrid, Cell,
  Check, ChevronLeft, ChevronRight, CircleAlert, cn, compactId,
  compactUserAgent, compareProviderAccountSnapshots, ComposedChart, CSS, DEFAULT_OVERVIEW_WIDGETS, DndContext,
  DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent, Field, formatAxisNumber,
  formatCompactNumber, formatDuration, formatLogDateTime, formatPercent, formatProviderAccountMeterValue, formatProviderAccountReset,
  formatStatusBucketDate, formatStatusCodeCounts, formatSystemStatusRange, formatToolCounts, formatUsdCost, KeyboardSensor,
  LabelList, LayoutGroup, Line, MeasuringStrategy, MetricCard, MetricTone,
  metricToneBar, metricToneStroke, motion, normalizeAgentFilterValue, normalizeOverviewWidget, normalizeOverviewWidgets,
  OverviewMetricKind, overviewMetricOptions, overviewWidgetCollisionDetection, OverviewWidgetConfig, OverviewWidgetSize, overviewWidgetSizeOptions,
  OverviewWidgetType, OverviewWidgetVariant, Pencil, Pie, PieChart, Plus,
  PointerSensor, primaryProviderAccountMeter, providerAccountBadgeVariant, providerAccountMeterProgress, providerAccountMetersForDisplay, providerAccountProgressClass,
  ProviderAccountSnapshot, ReactNode, ReactPointerEvent, rectSortingStrategy, RefreshCw, Select,
  SelectControl, SortableContext, sortableKeyboardCoordinates, systemStatusIconClass, systemStatusPointTooltip, systemStatusSegmentClass,
  systemStatusTooltipPositionClass, Tooltip, translateOptions, Trash2, UsageComparisonRow, usageRangeOptions,
  UsageSeriesPoint, UsageStatsRange, UsageStatsSnapshot, usageStatusTone, UsageTotals, useAppText,
  useEffect, useMemo, useRef, useSensor, useSensors, useSortable,
  useState, XAxis, YAxis
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
  const [editing, setEditing] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
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
  const displayWidgets = dragPreviewWidgets ?? widgets;
  const visibleWidgets = displayWidgets.filter((widget) => widget.enabled);
  const activeWidget = visibleWidgets.find((widget) => widget.id === activeWidgetId);

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
    setShowAddPanel(false);
    setEditing(true);
  }

  function resetLayout() {
    onWidgetsChange(DEFAULT_OVERVIEW_WIDGETS.map((widget) => ({ ...widget })));
    setSelectedWidgetId(undefined);
    setShowAddPanel(false);
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="space-y-4"
      initial={{ opacity: 0 }}
      ref={viewRef}
      transition={{ duration: 0.15 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[18px] font-semibold tracking-tight">{t("Overview layout")}</h2>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{editing ? t("Drag cards to arrange") : t("Overview")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <Button onClick={() => setShowAddPanel((value) => !value)} size="sm" type="button" variant="outline">
              <Plus className="h-3.5 w-3.5" />
              {t("Add widget")}
            </Button>
          ) : null}
          {editing ? (
            <Button onClick={resetLayout} size="sm" type="button" variant="outline">
              <RefreshCw className="h-3.5 w-3.5" />
              {t("Reset layout")}
            </Button>
          ) : null}
          <Button onClick={() => setEditing((value) => !value)} size="sm" type="button" variant={editing ? "default" : "outline"}>
            <Pencil className="h-3.5 w-3.5" />
            {editing ? t("Done") : t("Edit widgets")}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {editing && showAddPanel ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-border bg-card p-3"
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
          >
            <OverviewWidgetPalette widgets={widgets} onAdd={addWidget} />
          </motion.div>
        ) : null}
      </AnimatePresence>

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
            <section className="grid grid-cols-12 gap-4" data-overview-widget-grid>
              {visibleWidgets.map((widget) => (
                <SortableOverviewWidget editing={editing} key={widget.id} widget={widget} onSelect={() => setSelectedWidgetId(widget.id)}>
                  <OverviewWidgetFrame
                    editing={editing}
                    selected={selectedWidgetId === widget.id}
                    widget={widget}
                    onChangeMetric={(metric) => updateWidget(widget.id, { metric })}
                    onChangeSize={(size) => updateWidget(widget.id, { size })}
                    onChangeVariant={(variant) => updateWidget(widget.id, { variant })}
                    onRemove={() => removeWidget(widget.id)}
                    onSelect={() => setSelectedWidgetId(widget.id)}
                  >
                    <OverviewWidgetRenderer
                      providerAccounts={providerAccounts}
                      setUsageRange={setUsageRange}
                      usageRange={usageRange}
                      usageStats={usageStats}
                      widget={widget}
                    />
                  </OverviewWidgetFrame>
                </SortableOverviewWidget>
              ))}
              {visibleWidgets.length === 0 ? (
                <div className="col-span-12 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-[12px] text-muted-foreground">
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
              setUsageRange={setUsageRange}
              usageRange={usageRange}
              usageStats={usageStats}
              widget={activeWidget}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </motion.div>
  );
}

function isEditableKeyboardTarget(target: Element | undefined): boolean {
  return Boolean(target?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only'], [role='textbox']"));
}

function OverviewWidgetPalette({
  widgets,
  onAdd
}: {
  widgets: OverviewWidgetConfig[];
  onAdd: (widget: OverviewWidgetConfig) => void;
}) {
  const t = useAppText();
  const existingKeys = new Set(widgets.map(overviewWidgetTemplateKey));
  const templates = overviewWidgetTemplates();

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {templates.map((template) => {
        const exists = existingKeys.has(overviewWidgetTemplateKey(template));
        return (
          <Button
            className="h-auto justify-start rounded-md border border-border bg-background px-3 py-2 text-left"
            disabled={exists}
            key={overviewWidgetTemplateKey(template)}
            onClick={() => onAdd(template)}
            type="button"
            unstyled
          >
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-foreground">{overviewWidgetTitle(template, t)}</div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{t(overviewWidgetTypeLabel(template.type))}</div>
            </div>
          </Button>
        );
      })}
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
        "min-w-0",
        overviewWidgetSizeClass(widget.size),
        editing && "cursor-grab touch-none",
        isDragging && "relative z-20 cursor-grabbing opacity-70"
      )}
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
  setUsageRange,
  usageRange,
  usageStats,
  widget
}: {
  providerAccounts: ProviderAccountSnapshot[];
  setUsageRange: (range: UsageStatsRange) => void;
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
  widget: OverviewWidgetConfig;
}) {
  return (
    <div className={cn("pointer-events-none opacity-95 shadow-2xl", overviewWidgetOverlaySizeClass(widget.size))}>
      <OverviewWidgetRenderer
        providerAccounts={providerAccounts}
        setUsageRange={setUsageRange}
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
  onChangeMetric,
  onChangeSize,
  onChangeVariant,
  onRemove,
  onSelect
}: {
  children: ReactNode;
  editing: boolean;
  selected: boolean;
  widget: OverviewWidgetConfig;
  onChangeMetric: (metric: OverviewMetricKind) => void;
  onChangeSize: (size: OverviewWidgetSize) => void;
  onChangeVariant: (variant: OverviewWidgetVariant) => void;
  onRemove: () => void;
  onSelect: () => void;
}) {
  const t = useAppText();
  const frameRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarPlacement, setToolbarPlacement] = useState<OverviewToolbarPlacement>("right");
  const variantOptions = overviewWidgetVariantOptions(widget.type);
  const isHorizontalToolbar = toolbarPlacement === "top" || toolbarPlacement === "bottom";
  const toolbarFieldClass = cn("space-y-0.5", isHorizontalToolbar && "w-[112px] shrink-0");
  const toolbarSelectClass = cn(
    "h-7 min-w-0 bg-[length:12px] text-[10px]",
    isHorizontalToolbar ? "w-[112px] px-2 pr-6" : "px-1.5 pr-5"
  );
  const updateToolbarPlacement = () => {
    setToolbarPlacement(resolveOverviewToolbarPlacement(frameRef.current, toolbarRef.current));
  };
  const selectFrame = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing) {
      return;
    }
    if (event.target instanceof Node && toolbarRef.current?.contains(event.target)) {
      return;
    }
    onSelect();
  };

  useEffect(() => {
    if (!editing) {
      return;
    }
    updateToolbarPlacement();
    window.addEventListener("resize", updateToolbarPlacement);
    return () => window.removeEventListener("resize", updateToolbarPlacement);
  }, [editing, widget.type]);

  return (
    <div
      aria-selected={editing ? selected : undefined}
      className={cn(
        "group/overview-widget relative min-w-0 transition-opacity",
        editing && (selected
          ? "rounded-xl outline outline-2 outline-primary outline-offset-2 ring-2 ring-primary/20"
          : "rounded-xl outline outline-2 outline-primary/35 outline-offset-2")
      )}
      ref={frameRef}
      role={editing ? "group" : undefined}
      onFocus={editing ? () => {
        onSelect();
        updateToolbarPlacement();
      } : undefined}
      onMouseEnter={editing ? updateToolbarPlacement : undefined}
      onPointerDownCapture={selectFrame}
    >
      {editing ? (
        <div
          className={cn(
            "pointer-events-none absolute z-40 opacity-0 transition-opacity duration-150 group-hover/overview-widget:pointer-events-auto group-hover/overview-widget:opacity-100 group-focus-within/overview-widget:pointer-events-auto group-focus-within/overview-widget:opacity-100",
            isHorizontalToolbar ? "w-max max-w-[min(520px,calc(100vw-2rem))]" : toolbarPlacement === "inside" ? "w-[84px]" : "w-[88px]",
            toolbarPlacement === "right" && "left-full top-2 pl-1.5",
            toolbarPlacement === "left" && "right-full top-2 pr-1.5",
            toolbarPlacement === "top" && "bottom-full left-1/2 -translate-x-1/2 pb-1.5",
            toolbarPlacement === "bottom" && "left-1/2 top-full -translate-x-1/2 pt-1.5",
            toolbarPlacement === "inside" && "right-2 top-2"
          )}
          data-overview-toolbar-layout={isHorizontalToolbar ? "horizontal" : "vertical"}
          onPointerDownCapture={(event) => event.stopPropagation()}
          ref={toolbarRef}
        >
          <div className={cn(
            "cursor-default gap-1.5 rounded-md border border-border bg-card/98 p-1.5 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/90",
            isHorizontalToolbar ? "flex max-w-[min(520px,calc(100vw-2rem))] flex-wrap items-end" : "grid grid-cols-1"
          )}>
            {widget.type === "metric" ? (
              <Field className={toolbarFieldClass} label={t("Metric")}>
                <SelectControl className={toolbarSelectClass} onChange={(value) => onChangeMetric(value as OverviewMetricKind)} options={translateOptions(overviewMetricOptions, t)} value={widget.metric ?? "requests"} />
              </Field>
            ) : null}
            <Field className={toolbarFieldClass} label={t("Widget size")}>
              <SelectControl className={toolbarSelectClass} onChange={(value) => onChangeSize(value as OverviewWidgetSize)} options={translateOptions(overviewWidgetSizeOptions, t)} value={widget.size} />
            </Field>
            <Field className={toolbarFieldClass} label={t("Style")}>
              <SelectControl className={toolbarSelectClass} onChange={(value) => onChangeVariant(value as OverviewWidgetVariant)} options={translateOptions(variantOptions, t)} value={widget.variant} />
            </Field>
            <Button aria-label={t("Remove widget")} className={cn("h-7 justify-center px-0", isHorizontalToolbar ? "w-7 shrink-0" : "w-full")} onClick={onRemove} size="sm" title={t("Remove widget")} type="button" variant="outline">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function OverviewWidgetRenderer({
  providerAccounts,
  setUsageRange,
  usageRange,
  usageStats,
  widget
}: {
  providerAccounts: ProviderAccountSnapshot[];
  setUsageRange: (range: UsageStatsRange) => void;
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
  widget: OverviewWidgetConfig;
}) {
  if (widget.type === "system-status") {
    return <SystemStatusBar usageRange={usageRange} usageStats={usageStats} variant={widget.variant === "compact" ? "compact" : "timeline"} />;
  }
  if (widget.type === "account-balance") {
    return <ProviderAccountsOverview accounts={providerAccounts} variant={overviewAccountVariant(widget.variant)} />;
  }
  if (widget.type === "metric") {
    return <OverviewMetricWidget metric={widget.metric ?? "requests"} totals={usageStats.totals} variant={overviewMetricVariant(widget.variant)} />;
  }
  if (widget.type === "usage-trend") {
    return <UsageTrendWidget setUsageRange={setUsageRange} usageRange={usageRange} usageStats={usageStats} variant={overviewTrendVariant(widget.variant)} />;
  }
  if (widget.type === "token-mix") {
    return <TokenMixOverviewWidget totals={usageStats.totals} variant={overviewTokenMixVariant(widget.variant)} />;
  }
  if (widget.type === "client-analysis") {
    return <OverviewAnalysisWidget kind="client" rows={usageStats.clientModels} variant={widget.variant === "compact" ? "compact" : "table"} />;
  }
  return <OverviewAnalysisWidget kind="provider" rows={usageStats.providerModels} variant={widget.variant === "compact" ? "compact" : "table"} />;
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
      <Card className="min-w-0">
        <CardContent className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">{item.label}</div>
          <div className="shrink-0 text-[18px] font-semibold tracking-tight">{item.value}</div>
        </CardContent>
      </Card>
    );
  }

  if (variant === "bar") {
    return (
      <Card className="min-w-0">
        <CardContent className="p-3">
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
      <Card className="min-w-0">
        <CardContent className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-3 p-3">
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
  setUsageRange,
  usageRange,
  usageStats,
  variant
}: {
  setUsageRange: (range: UsageStatsRange) => void;
  usageRange: UsageStatsRange;
  usageStats: UsageStatsSnapshot;
  variant: "area" | "bar" | "composed" | "line";
}) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Usage Trend")}</CardTitle>
        <div className="flex rounded-md border border-border bg-background p-0.5">
          {usageRangeOptions.map((option) => (
            <Button
              className={cn(
                "h-7 rounded px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                usageRange === option.value && "bg-card text-foreground shadow-sm"
              )}
              key={option.value}
              onClick={() => setUsageRange(option.value)}
              type="button"
              unstyled
            >
              {t(option.label)}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ChartFrame>
          {({ height, width }) => (
            <ComposedChart data={usageStats.series} height={height} margin={{ bottom: 4, left: 0, right: 8, top: 28 }} width={width}>
              <CartesianGrid stroke="#dfe3e8" strokeDasharray="3 3" vertical={false} />
              <XAxis axisLine={false} dataKey="label" tick={{ fill: "#5f6b7a", fontSize: 11 }} tickLine={false} />
              <YAxis axisLine={false} tick={{ fill: "#5f6b7a", fontSize: 11 }} tickFormatter={formatAxisNumber} tickLine={false} yAxisId="tokens" />
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
  totals,
  variant
}: {
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

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Token Mix")}</CardTitle>
        <Badge variant="outline">{formatCompactNumber(totals.totalTokens)}</Badge>
      </CardHeader>
      <CardContent>
        {variant === "stacked" ? (
          <div className="space-y-3">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {tokenMix.map((item) => (
                <div key={item.name} style={{ backgroundColor: item.color, width: `${total > 0 ? Math.max(2, (item.value / total) * 100) : 100 / tokenMix.length}%` }} />
              ))}
            </div>
            <OverviewTokenLegend rows={tokenMix} />
          </div>
        ) : null}
        {variant === "donut" || variant === "pie" ? (
          <ChartFrame>
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
          <ChartFrame>
            {({ height, width }) => (
              <BarChart data={tokenMix} height={height} layout="vertical" margin={{ bottom: 8, left: 8, right: 12, top: 8 }} width={width}>
                <CartesianGrid stroke="#dfe3e8" strokeDasharray="3 3" horizontal={false} />
                <XAxis axisLine={false} tick={{ fill: "#5f6b7a", fontSize: 11 }} tickFormatter={formatAxisNumber} tickLine={false} type="number" />
                <YAxis axisLine={false} dataKey="name" tick={{ fill: "#5f6b7a", fontSize: 11 }} tickLine={false} type="category" width={52} />
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
  kind,
  rows,
  variant
}: {
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
      { key: "model", label: t("Model") }
    ];

  if (variant === "compact") {
    return (
      <Card className="min-w-0">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Badge variant="outline">{rows.length}</Badge>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-7 text-center text-[12px] text-muted-foreground">{emptyLabel}</div>
          ) : (
            <div className="space-y-2">
              {rows.slice(0, 5).map((row) => (
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

  return <UsageAnalysisCard columns={columns} emptyLabel={emptyLabel} rows={rows} title={title} />;
}

function overviewWidgetTemplates(): OverviewWidgetConfig[] {
  const baseWidgets: OverviewWidgetConfig[] = [
    { enabled: true, id: "system-status", size: "full", type: "system-status", variant: "timeline" },
    { enabled: true, id: "account-balance", size: "full", type: "account-balance", variant: "cards" },
    { enabled: true, id: "usage-trend", size: "wide", type: "usage-trend", variant: "composed" },
    { enabled: true, id: "token-mix", size: "medium", type: "token-mix", variant: "bars" },
    { enabled: true, id: "client-analysis", size: "large", type: "client-analysis", variant: "table" },
    { enabled: true, id: "provider-analysis", size: "large", type: "provider-analysis", variant: "table" }
  ];
  return [
    ...baseWidgets,
    ...overviewMetricOptions.map((option) => ({
      enabled: true,
      id: `metric-${option.value}`,
      metric: option.value,
      size: "small" as const,
      type: "metric" as const,
      variant: "card" as const
    }))
  ];
}

function overviewWidgetTemplateKey(widget: OverviewWidgetConfig): string {
  return widget.type === "metric" ? `metric:${widget.metric ?? "requests"}` : widget.type;
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
      { label: "Bars", value: "bars" }
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
  if (type === "token-mix") {
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
  if (size === "small") return "col-span-12 sm:col-span-6 xl:col-span-2";
  if (size === "medium") return "col-span-12 md:col-span-6 xl:col-span-4";
  if (size === "large") return "col-span-12 lg:col-span-6";
  if (size === "wide") return "col-span-12 lg:col-span-8";
  return "col-span-12";
}

function overviewWidgetOverlaySizeClass(size: OverviewWidgetSize): string {
  if (size === "small") return "w-[min(320px,calc(100vw-2rem))]";
  if (size === "medium") return "w-[min(460px,calc(100vw-2rem))]";
  if (size === "large") return "w-[min(640px,calc(100vw-2rem))]";
  if (size === "wide") return "w-[min(860px,calc(100vw-2rem))]";
  return "w-[min(960px,calc(100vw-2rem))]";
}

type OverviewToolbarPlacement = "bottom" | "inside" | "left" | "right" | "top";

function resolveOverviewToolbarPlacement(element: HTMLElement | null, toolbar: HTMLElement | null): OverviewToolbarPlacement {
  if (!element || typeof window === "undefined") {
    return "right";
  }
  const rect = element.getBoundingClientRect();
  const toolbarWidth = 96;
  const gutter = 12;
  const boundary = element.closest<HTMLElement>("[data-overview-widget-grid]")?.getBoundingClientRect();
  const boundaryLeft = boundary?.left ?? 0;
  const boundaryRight = boundary?.right ?? window.innerWidth;
  const boundaryWidth = boundaryRight - boundaryLeft;
  const horizontalToolbarWidth = Math.min(520, Math.max(toolbarWidth, boundaryWidth - gutter * 2));
  const horizontalToolbarHeight = toolbar?.dataset.overviewToolbarLayout === "horizontal"
    ? toolbar.getBoundingClientRect().height || 56
    : 56;
  const leftSpace = rect.left - boundaryLeft;
  const rightSpace = boundaryRight - rect.right;
  const topSpace = rect.top;
  const bottomSpace = window.innerHeight - rect.bottom;
  const centerX = rect.left + rect.width / 2;
  const hasCenteredHorizontalSpace = centerX >= boundaryLeft + horizontalToolbarWidth / 2 + gutter && boundaryRight - centerX >= horizontalToolbarWidth / 2 + gutter;

  if (rightSpace >= toolbarWidth + gutter) {
    return "right";
  }
  if (leftSpace >= toolbarWidth + gutter) {
    return "left";
  }
  if (hasCenteredHorizontalSpace && topSpace >= horizontalToolbarHeight + gutter) {
    return "top";
  }
  if (hasCenteredHorizontalSpace && bottomSpace >= horizontalToolbarHeight + gutter) {
    return "bottom";
  }
  if (hasCenteredHorizontalSpace && Math.max(topSpace, bottomSpace) >= horizontalToolbarHeight * 0.6) {
    return bottomSpace >= topSpace ? "bottom" : "top";
  }
  return "inside";
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

function overviewAccountVariant(value: OverviewWidgetVariant): "bars" | "cards" | "compact" {
  return value === "bars" || value === "compact" ? value : "cards";
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
      <Card className="min-w-0 border-border/70 bg-card">
        <CardContent className="flex min-w-0 items-center justify-between gap-3 p-4">
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
    <Card className="min-w-0 overflow-visible border-border/70 bg-card">
      <CardContent className="space-y-4 p-4">
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
  accounts,
  variant = "cards"
}: {
  accounts: ProviderAccountSnapshot[];
  variant?: "bars" | "cards" | "compact";
}) {
  const t = useAppText();
  const visibleAccounts = accounts
    .filter((account) => account.meters.length > 0 || account.status === "error")
    .sort(compareProviderAccountSnapshots)
    .slice(0, 6);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("Account Balance")}</CardTitle>
        <Badge variant="outline">{accounts.length}</Badge>
      </CardHeader>
      <CardContent>
        {visibleAccounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-7 text-center text-[12px] text-muted-foreground">
            {t("No account balance connectors configured")}
          </div>
        ) : variant === "compact" ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {visibleAccounts.map((account) => {
              const meter = primaryProviderAccountMeter(account);
              return (
                <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2" key={account.provider}>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold">{account.provider}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{meter ? t(meter.label) : account.source}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge variant={providerAccountBadgeVariant(account.status)}>{account.status}</Badge>
                    {meter ? <div className="mt-1 text-[12px] font-semibold">{formatProviderAccountMeterValue(meter)}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : variant === "bars" ? (
          <div className="space-y-3">
            {visibleAccounts.map((account) => {
              const meter = primaryProviderAccountMeter(account);
              const progress = meter ? providerAccountMeterProgress(meter) : undefined;
              return (
                <div className="min-w-0" key={account.provider}>
                  <div className="flex min-w-0 items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold">{account.provider}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{meter ? t(meter.label) : account.source}</div>
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleAccounts.map((account) => {
              const meters = providerAccountMetersForDisplay(account, 3);
              return (
                <div className="min-w-0 rounded-lg border border-border bg-muted/20 p-3" key={account.provider}>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold">{account.provider}</div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{account.source}</div>
                    </div>
                    <Badge variant={providerAccountBadgeVariant(account.status)}>{account.status}</Badge>
                  </div>
                  {meters.length > 0 ? (
                    <div className="mt-3 space-y-2.5">
                      {meters.map((meter) => {
                        const progress = providerAccountMeterProgress(meter);
                        return (
                          <div className="min-w-0" key={meter.id}>
                            <div className="flex min-w-0 items-end justify-between gap-3">
                              <div className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">{t(meter.label)}</div>
                              <div className="shrink-0 text-[15px] font-semibold tracking-tight">{formatProviderAccountMeterValue(meter)}</div>
                            </div>
                            {progress !== undefined ? (
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background">
                                <div className={cn("h-full rounded-full", providerAccountProgressClass(account.status))} style={{ width: `${progress}%` }} />
                              </div>
                            ) : null}
                            {meter.resetAt ? <div className="mt-1 truncate text-[10px] text-muted-foreground">{t("Resets")} {formatProviderAccountReset(meter.resetAt)}</div> : null}
                          </div>
                        );
                      })}
                      {account.meters.length > meters.length ? (
                        <div className="truncate text-[10px] text-muted-foreground">+{account.meters.length - meters.length}</div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 truncate text-[12px] text-muted-foreground">{account.message || account.errors?.[0]?.message || t("Unavailable")}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AgentAnalysisView({
  agentFilter,
  error,
  loading,
  range,
  refreshAnalysis,
  setAgentFilter,
  setRange,
  snapshot
}: {
  agentFilter: AgentFilterValue;
  error: string;
  loading: boolean;
  range: UsageStatsRange;
  refreshAnalysis: () => void;
  setAgentFilter: (value: AgentFilterValue) => void;
  setRange: (range: UsageStatsRange) => void;
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

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
        <AgentSessionsCard sessions={snapshot.sessions} />
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

function AgentSessionsCard({ sessions }: { sessions: AgentAnalysisSnapshot["sessions"] }) {
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
                {sessions.map((session) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={`${session.agent}:${session.id}`}>
                    <td className="max-w-[180px] px-3 py-2 font-mono font-semibold" title={session.id}>{compactId(session.id)}</td>
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
                ))}
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
  key: "client" | "model" | "provider";
  label: string;
};

function UsageAnalysisCard({
  columns,
  emptyLabel,
  rows,
  title
}: {
  columns: UsageAnalysisColumn[];
  emptyLabel: string;
  rows: UsageComparisonRow[];
  title: string;
}) {
  const t = useAppText();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge variant="outline">{rows.length}</Badge>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">{emptyLabel}</div>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-lg border border-border/60">
            <table className="min-w-[840px] w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  {columns.map((column) => (
                    <th className="px-3 py-2 font-semibold" key={column.key}>{column.label}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold">{t("Tokens")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cost")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Requests")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Input")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Output")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Cache rate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((row) => (
                  <tr className="bg-card/40 hover:bg-muted/30" key={row.key}>
                    {columns.map((column) => (
                      <td className="max-w-[180px] px-3 py-2 font-medium" key={column.key}>
                        <span className="block truncate" title={row[column.key] ?? "unknown"}>{row[column.key] ?? "unknown"}</span>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold">{formatCompactNumber(row.totalTokens)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatUsdCost(row.costUsd)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(row.requestCount)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(row.inputTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(row.outputTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatCompactNumber(row.cacheTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(row.cacheRatio)}</td>
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

function ChartFrame({ children }: { children: (size: { height: number; width: number }) => ReactNode }) {
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
    <div className="h-[260px] min-w-0" ref={containerRef}>
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
  payload?: Array<{ value?: number | string }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card/95 glass-surface px-3 py-2.5 text-[11px] shadow-card-elevated">
      <div className="font-semibold">{label}</div>
      <div className="mt-1 text-muted-foreground">{formatCompactNumber(Number(payload[0]?.value) || 0)} tokens</div>
    </div>
  );
}
