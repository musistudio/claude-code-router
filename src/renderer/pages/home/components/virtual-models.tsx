import {
  AnimatedListItem, AnimatePresence, Boxes, BUILTIN_UNIMCP_VISION_TOOL_NAME, BUILTIN_UNIMCP_WEB_SEARCH_TOOL_NAME, Button,
  Card, CardContent, CardHeader, CardTitle, Check, ChevronDown,
  cn, createRouteModelOptions, Dialog, DialogBody, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, ExtensionInstallDraft, Field, FolderOpen, formatPluginDependencies,
  fusionToolOptions, GatewayProviderConfig, Input, motion, normalizeFusionToolName, Pencil,
  PluginMarketplaceEntry, Plus, PopoverContent, RouteTargetControl, Search, selectedFusionToolName,
  Toggle, Trash2, useAppText, useEffect, useLayoutEffect, useMemo,
  useRef, useState, virtualModelBaseModelSummary, VirtualModelDraft, virtualModelMatchesQuery, virtualModelMatchSummary,
  VirtualModelProfileConfig, virtualModelToolSummary, X
} from "../shared";
export function VirtualModelsView({
  addVirtualModel,
  editVirtualModel,
  profiles,
  removeVirtualModel,
  setVirtualModelEnabled
}: {
  addVirtualModel: () => void;
  editVirtualModel: (index: number) => void;
  profiles: VirtualModelProfileConfig[];
  removeVirtualModel: (index: number) => void;
  setVirtualModelEnabled: (index: number, enabled: boolean) => void;
}) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleProfiles = useMemo(
    () => profiles
      .map((profile, index) => ({ index, profile }))
      .filter(({ profile }) => virtualModelMatchesQuery(profile, normalizedQuery)),
    [profiles, normalizedQuery]
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col gap-3"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle className="min-w-0 shrink-0 truncate">{t("Virtual Models")}</CardTitle>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search virtual models")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search virtual models")}
              value={query}
            />
          </div>
          <Button aria-label={t("Add virtual model")} onClick={addVirtualModel} title={t("Add virtual model")} type="button">
            <Plus className="h-4 w-4" />
            {t("Add")}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {profiles.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <Boxes className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[13px] font-semibold text-foreground">{t("No virtual models configured")}</div>
              <div className="mx-auto mt-1 max-w-[480px] text-[12px] leading-5 text-muted-foreground">{t("Fusion combines a model with another model or tools into a new model.")}</div>
              <div className="mt-2 font-mono text-[11px] text-muted-foreground/70">{t("Fusion example")}</div>
            </div>
          ) : null}
          {profiles.length > 0 && visibleProfiles.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching virtual models")}</div>
          ) : null}
          {visibleProfiles.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[780px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(180px,0.9fr)_minmax(220px,1.1fr)_minmax(220px,1.1fr)_minmax(170px,0.85fr)_112px_96px] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Name")}</div>
                  <div className="truncate">{t("New model")}</div>
                  <div className="truncate">{t("Base model")}</div>
                  <div className="truncate">{t("Tools")}</div>
                  <div className="truncate">{t("Status")}</div>
                  <div aria-hidden="true" />
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                    {visibleProfiles.map(({ index, profile }) => (
                      <AnimatedListItem
                        className="grid min-h-[58px] grid-cols-[minmax(180px,0.9fr)_minmax(220px,1.1fr)_minmax(220px,1.1fr)_minmax(170px,0.85fr)_112px_96px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                        key={`${profile.id || profile.key}-${index}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold" title={profile.displayName || profile.key}>{profile.displayName || profile.key}</div>
                          <div className="truncate text-[11px] text-muted-foreground" title={profile.key}>{profile.key}</div>
                        </div>
                        <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={virtualModelMatchSummary(profile)}>
                          {virtualModelMatchSummary(profile)}
                        </div>
                        <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={virtualModelBaseModelSummary(profile)}>
                          {virtualModelBaseModelSummary(profile)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[11px] text-muted-foreground" title={virtualModelToolSummary(profile)}>
                            {virtualModelToolSummary(profile)}
                          </div>
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <Toggle checked={profile.enabled !== false} onChange={(enabled) => setVirtualModelEnabled(index, enabled)} />
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <Button aria-label={`${t("Edit virtual model")} ${profile.displayName || profile.key}`} onClick={() => editVirtualModel(index)} size="iconSm" title={t("Edit virtual model")} type="button" variant="ghost">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button aria-label={`${t("Remove virtual model")} ${profile.displayName || profile.key}`} onClick={() => removeVirtualModel(index)} size="iconSm" title={t("Remove virtual model")} type="button" variant="ghost">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </AnimatedListItem>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function VirtualModelDialog({
  canSubmit,
  draft,
  error,
  mode,
  onChange,
  onClose,
  onSubmit,
  providers
}: {
  canSubmit: boolean;
  draft: VirtualModelDraft;
  error: string;
  mode: "add" | "edit";
  onChange: (patch: Partial<VirtualModelDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const modelOptions = useMemo(() => createRouteModelOptions(providers), [providers]);
  const selectedTool = selectedFusionToolName(draft.toolsText);

  function updateFusionTool(toolName: string) {
    const nextTool = normalizeFusionToolName(toolName);
    onChange({
      toolsText: nextTool,
      matchMultimodal: nextTool === BUILTIN_UNIMCP_VISION_TOOL_NAME,
      matchWebSearch: nextTool === BUILTIN_UNIMCP_WEB_SEARCH_TOOL_NAME
    });
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{mode === "edit" ? t("Edit Virtual Model") : t("Add Virtual Model")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Field label={t("New model")}>
                <Input value={draft.exactAliasesText} onChange={(event) => onChange({ exactAliasesText: event.target.value })} />
              </Field>
              <div className="flex h-5 items-center justify-center font-mono text-[13px] font-semibold text-muted-foreground">=</div>
              <Field label={t("Base model")}>
                <RouteTargetControl modelOptions={modelOptions} onChange={(fixedModel) => onChange({ fixedModel })} value={draft.fixedModel} />
              </Field>
              <div className="flex h-5 items-center justify-center font-mono text-[13px] font-semibold text-muted-foreground">+</div>
              <Field label={t("Tools")}>
                <FusionToolSelectControl
                  onChange={updateFusionTool}
                  value={selectedTool}
                />
              </Field>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{t(error)}</div>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit} type="button">
            {mode === "edit" ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {mode === "edit" ? t("Save") : t("Add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FusionToolSelectControl({
  onChange,
  value
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const t = useAppText();
  const [open, setOpen] = useState(false);
  const [popoverLayout, setPopoverLayout] = useState<{
    left: number;
    maxHeight: number;
    offset: number;
    placement: "above" | "below";
    width: number;
  }>();
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = fusionToolOptions.find((option) => option.value === normalizeFusionToolName(value)) ?? fusionToolOptions[0];

  useLayoutEffect(() => {
    if (!open) {
      setPopoverLayout(undefined);
      return;
    }

    function updatePopoverLayout() {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      const anchor = root.getBoundingClientRect();
      const margin = 12;
      const gap = 6;
      const desiredHeight = 136;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const availableWidth = Math.max(240, viewportWidth - margin * 2);
      const width = Math.min(Math.max(anchor.width, 280), availableWidth);
      const left = Math.min(Math.max(margin, anchor.left), viewportWidth - margin - width);
      const below = Math.max(0, viewportHeight - anchor.bottom - margin - gap);
      const above = Math.max(0, anchor.top - margin - gap);
      const placement = below < desiredHeight && above > below ? "above" : "below";
      const availableHeight = Math.max(96, placement === "above" ? above : below);
      setPopoverLayout({
        left,
        maxHeight: Math.min(220, availableHeight),
        offset: placement === "above" ? viewportHeight - anchor.top + gap : anchor.bottom + gap,
        placement,
        width
      });
    }

    updatePopoverLayout();
    window.addEventListener("resize", updatePopoverLayout);
    window.addEventListener("scroll", updatePopoverLayout, true);
    return () => {
      window.removeEventListener("resize", updatePopoverLayout);
      window.removeEventListener("scroll", updatePopoverLayout, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        aria-controls="fusion-tool-select-options"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-[12px] font-medium shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-[background-color,border-color,box-shadow,color] hover:border-muted-foreground/45 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/25",
          open && "border-ring/35 bg-muted/40"
        )}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="fixed z-[70]"
            exit={{ opacity: 0, scale: 0.98, y: popoverLayout?.placement === "above" ? 4 : -4 }}
            initial={{ opacity: 0, scale: 0.98, y: popoverLayout?.placement === "above" ? 4 : -4 }}
            style={popoverLayout
              ? {
                left: `${popoverLayout.left}px`,
                width: `${popoverLayout.width}px`,
                ...(popoverLayout.placement === "above"
                  ? { bottom: `${popoverLayout.offset}px` }
                  : { top: `${popoverLayout.offset}px` })
              }
              : undefined}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <PopoverContent
              className="w-full overflow-y-auto p-1"
              id="fusion-tool-select-options"
              role="listbox"
              style={{ maxHeight: `${popoverLayout?.maxHeight ?? 220}px` }}
            >
              {fusionToolOptions.map((option) => {
                const selectedOption = option.value === selected?.value;
                return (
                  <button
                    aria-selected={selectedOption}
                    className={cn(
                      "flex min-h-[58px] w-full min-w-0 items-start gap-2 rounded-[5px] px-2 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
                      selectedOption ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                    )}
                    key={option.value}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold">{option.label}</span>
                      <span className={cn("mt-0.5 block text-[11px] leading-4", selectedOption ? "text-primary/80" : "text-muted-foreground")}>
                        {t(option.description)}
                      </span>
                    </span>
                    {selectedOption ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
                  </button>
                );
              })}
            </PopoverContent>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function InstallExtensionDialog({
  canSubmit,
  draft,
  error,
  marketplace,
  onChange,
  onChooseLocal,
  onClose,
  onSubmit
}: {
  canSubmit: boolean;
  draft: ExtensionInstallDraft;
  error: string;
  marketplace: PluginMarketplaceEntry[];
  onChange: (patch: Partial<ExtensionInstallDraft>) => void;
  onChooseLocal: () => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useAppText();

  function selectMarketplace(entry: PluginMarketplaceEntry) {
    onChange({
      key: entry.id,
      apps: entry.apps,
      dependencies: entry.dependencies,
      marketplaceId: entry.id,
      modulePath: entry.modulePath,
      selectedName: entry.name
    });
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Install Extension")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-3">
            <div className="space-y-2">
              {marketplace.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">{t("No marketplace extensions")}</div>
              ) : (
                marketplace.map((entry) => (
                  <button
                    className={cn(
                      "flex w-full min-w-0 flex-col gap-1 rounded-md border px-3 py-2 text-left text-[12px] transition-colors",
                      draft.marketplaceId === entry.id ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                    )}
                    key={entry.id}
                    onClick={() => selectMarketplace(entry)}
                    type="button"
                  >
                    <span className="truncate font-semibold text-foreground">{entry.name}</span>
                    <span className="line-clamp-2 text-[11px] text-muted-foreground">{entry.description}</span>
                    <span className="truncate text-[10px] text-muted-foreground/80">{entry.capabilities.join(", ")}</span>
                    {entry.dependencies.length > 0 ? (
                      <span className="truncate text-[10px] text-muted-foreground/80">{t("Dependencies")}: {formatPluginDependencies(entry.dependencies)}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{error}</div>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter className="justify-between">
          <Button onClick={onChooseLocal} type="button" variant="outline">
            <FolderOpen className="h-4 w-4" />
            {t("Choose folder")}
          </Button>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              {t("Cancel")}
            </Button>
            <Button disabled={!canSubmit} onClick={onSubmit} type="button">
              <Plus className="h-4 w-4" />
              {t("Install")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
