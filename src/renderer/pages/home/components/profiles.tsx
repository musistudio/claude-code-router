import {
  AddProfileDraft, AgentLogo, AnimatePresence, AppConfig, Badge, Button,
  Card, CardContent, CardHeader, CardTitle, Check, ChevronDown,
  cn, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, Field, GatewayProviderConfig, Input, KeyValueRowsControl, motion,
  normalizeProfileScope, normalizeProfileSurface, parseProfileModelValue, Pencil, Plus, PopoverContent,
  profileAgentLabel, profileAgentOptions, ProfileConfig, profileModelDisplayValue, profileModelMatchesQuery, profileModelProviderMatchesQuery,
  profileModelProviderOptions, profileScopeLabel, profileScopeOptions, profileSummaryItems, profileSurfaceLabel, profileSurfaceOptions,
  Search, SelectControl, Toggle, translateOptions, Trash2, useAppText,
  useEffect, useLayoutEffect, useMemo, useRef, useState, X
} from "../shared";
export function ProfileView({
  addProfile,
  applyError,
  config,
  editProfile,
  removeProfile,
  updateProfileItem
}: {
  addProfile: (agent?: ProfileConfig["agent"]) => void;
  applyError: string;
  config: AppConfig;
  editProfile: (index: number) => void;
  removeProfile: (index: number) => void;
  updateProfileItem: (index: number, patch: Partial<ProfileConfig>) => void;
}) {
  const t = useAppText();
  const profiles = config.profile.profiles;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="mx-auto w-full max-w-4xl"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>{t("Agent access")}</CardTitle>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t("Choose where each agent uses CCR.")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button onClick={() => addProfile()} size="sm" type="button">
                <Plus className="h-3.5 w-3.5" />
                {t("Add profile")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {profiles.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-[12px] text-muted-foreground">
                {t("No profiles configured")}
              </div>
            ) : null}
            {profiles.map((profile, index) => {
              const scope = normalizeProfileScope(profile.scope);
              const surface = normalizeProfileSurface(profile.surface);
              const summaryItems = profileSummaryItems(profile, config, t);

              return (
                <div className="rounded-md border border-border bg-muted/20 p-3" key={profile.id}>
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <AgentLogo agent={profile.agent} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="min-w-0 max-w-[180px] truncate text-[13px] font-semibold sm:max-w-[260px] md:max-w-[320px]">{profile.name || t("Unnamed")}</span>
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            {!profile.enabled ? <Badge variant="outline">{t("Disabled")}</Badge> : null}
                            <Badge variant="secondary">{t(profileAgentLabel(profile.agent))}</Badge>
                            <Badge variant={scope === "ccr" ? "success" : scope === "global" ? "warning" : "outline"}>
                              {t(profileScopeLabel(scope))}
                            </Badge>
                            <Badge variant="outline">{t(profileSurfaceLabel(surface))}</Badge>
                          </div>
                        </div>
                        <div className="mt-2 min-w-0 space-y-1.5">
                          {summaryItems.map((item) => (
                            <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-baseline gap-2 text-[12px] sm:grid-cols-[128px_minmax(0,1fr)]" key={item.label}>
                              <div className="truncate text-muted-foreground">{item.label}</div>
                              <div className="min-w-0 truncate font-medium text-foreground" title={item.value}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Toggle checked={profile.enabled} onChange={(enabled) => updateProfileItem(index, { enabled })} />
                      <Button aria-label={`${t("Edit")} ${profile.name || t("Profile")}`} onClick={() => editProfile(index)} size="iconSm" title={t("Edit")} type="button" variant="ghost">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button aria-label={t("Remove profile")} onClick={() => removeProfile(index)} size="iconSm" title={t("Remove profile")} type="button" variant="ghost">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {applyError ? (
            <div className="whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {t(applyError)}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ProfileAgentTabs({
  activeAgent,
  profiles,
  setActiveAgent
}: {
  activeAgent: ProfileConfig["agent"];
  profiles: ProfileConfig[];
  setActiveAgent: (agent: ProfileConfig["agent"]) => void;
}) {
  const t = useAppText();

  return (
    <div
      aria-label={t("Agent profiles")}
      className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted/20 p-1"
      role="tablist"
    >
      {profileAgentOptions.map((option) => {
        const agent = option.value;
        const selected = activeAgent === agent;
        const count = profiles.filter((profile) => profile.agent === agent).length;

        return (
          <button
            aria-selected={selected}
            className={cn(
              "flex h-11 min-w-0 items-center gap-2 rounded-[5px] px-2 text-left text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
              selected
                ? "bg-background text-foreground shadow-card"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            )}
            key={agent}
            onClick={() => setActiveAgent(agent)}
            role="tab"
            type="button"
          >
            <AgentLogo agent={agent} className="h-6 w-6 rounded-[5px]" />
            <span className="min-w-0 flex-1 truncate">{t(profileAgentLabel(agent))}</span>
            <Badge className="shrink-0" variant={selected ? "secondary" : "outline"}>
              {count}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

function AgentSelectControl({
  onChange,
  value
}: {
  onChange: (agent: ProfileConfig["agent"]) => void;
  value: ProfileConfig["agent"];
}) {
  const t = useAppText();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
        aria-controls="profile-agent-select-options"
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
        <AgentLogo agent={value} className="h-5 w-5 rounded-[5px]" />
        <span className="min-w-0 flex-1 truncate">{t(profileAgentLabel(value))}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute left-0 right-0 top-full z-50 mt-1"
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <PopoverContent
              className="overflow-hidden p-1"
              id="profile-agent-select-options"
              role="listbox"
            >
              {profileAgentOptions.map((option) => {
                const agent = option.value;
                const selected = value === agent;

                return (
                  <button
                    aria-selected={selected}
                    className={cn(
                      "flex h-9 w-full min-w-0 items-center gap-2 rounded-[5px] px-2 text-left text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
                      selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                    )}
                    key={agent}
                    onClick={() => {
                      onChange(agent);
                      setOpen(false);
                    }}
                    role="option"
                    type="button"
                  >
                    <AgentLogo agent={agent} className="h-6 w-6 rounded-[5px]" />
                    <span className="min-w-0 flex-1 truncate">{t(profileAgentLabel(agent))}</span>
                    {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
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

function ProfileModelSelector({
  onChange,
  placeholder,
  providers,
  value
}: {
  onChange: (value: string) => void;
  placeholder?: string;
  providers: GatewayProviderConfig[];
  value: string;
}) {
  const t = useAppText();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [popoverLayout, setPopoverLayout] = useState<{
    gridHeight: number;
    left: number;
    maxHeight: number;
    offset: number;
    placement: "above" | "below";
    width: number;
  }>();
  const parsedValue = useMemo(() => parseProfileModelValue(value, providers), [providers, value]);
  const providerOptions = useMemo(() => profileModelProviderOptions(providers), [providers]);
  const filteredProviders = useMemo(
    () => providerOptions.filter((provider) => profileModelProviderMatchesQuery(provider, query)),
    [providerOptions, query]
  );
  const [activeProviderName, setActiveProviderName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const activeProvider =
    filteredProviders.find((provider) => provider.name === activeProviderName) ??
    filteredProviders.find((provider) => provider.name === parsedValue.provider) ??
    filteredProviders[0];
  const filteredModels = activeProvider
    ? activeProvider.models.filter((model) => profileModelMatchesQuery(activeProvider.name, model, query))
    : [];
  const displayValue = profileModelDisplayValue(value, parsedValue, providers, placeholder);

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
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const availableWidth = Math.max(240, viewportWidth - margin * 2);
      const width = Math.min(560, availableWidth);
      const left = Math.min(Math.max(margin, anchor.left), viewportWidth - margin - width);
      const below = Math.max(0, viewportHeight - anchor.bottom - margin - gap);
      const above = Math.max(0, anchor.top - margin - gap);
      const placement = below < 240 && above > below ? "above" : "below";
      const availableHeight = Math.max(144, placement === "above" ? above : below);
      const maxHeight = Math.min(360, availableHeight);
      const gridHeight = Math.max(128, Math.min(280, maxHeight - 58));
      setPopoverLayout({
        gridHeight,
        left,
        maxHeight,
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

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (activeProviderName && filteredProviders.some((provider) => provider.name === activeProviderName)) {
      return;
    }
    setActiveProviderName(parsedValue.provider || filteredProviders[0]?.name || "");
  }, [activeProviderName, filteredProviders, open, parsedValue.provider]);

  function chooseModel(providerName: string, model: string) {
    onChange(`${providerName}/${model}`);
    setOpen(false);
    setQuery("");
    setActiveProviderName(providerName);
  }

  function openSelector() {
    setOpen(true);
    setQuery("");
    setActiveProviderName(parsedValue.provider || providerOptions[0]?.name || "");
  }

  function clearValue(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    onChange("");
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <div
        className={cn(
          "flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-[12px] shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-[background-color,border-color,box-shadow,color] hover:border-muted-foreground/45 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/25",
          open && "border-ring/35 bg-muted/40",
          !value.trim() && "text-muted-foreground"
        )}
      >
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          className="min-w-0 flex-1 truncate text-left outline-none"
          onClick={openSelector}
          type="button"
        >
          {displayValue}
        </button>
        {value.trim() ? (
          <button
            aria-label={t("Clear")}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
            onClick={clearValue}
            title={t("Clear")}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          aria-label={open ? t("Collapse") : t("Expand")}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
          onClick={openSelector}
          title={open ? t("Collapse") : t("Expand")}
          type="button"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="fixed z-[70]"
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            style={popoverLayout
              ? {
                left: `${popoverLayout.left}px`,
                maxHeight: `${popoverLayout.maxHeight}px`,
                width: `${popoverLayout.width}px`,
                ...(popoverLayout.placement === "above"
                  ? { bottom: `${popoverLayout.offset}px` }
                  : { top: `${popoverLayout.offset}px` })
              }
              : undefined}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <PopoverContent className="w-full overflow-hidden p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  aria-label={t("Search models")}
                  className="h-9 pl-8"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("Search providers or models")}
                  value={query}
                />
              </div>

              {providerOptions.length === 0 ? (
                <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">
                  {t("No models configured")}
                </div>
              ) : (
                <div
                  className="mt-2 grid grid-cols-[minmax(112px,0.38fr)_minmax(0,1fr)] overflow-hidden rounded-md border border-border"
                  style={{ height: `${popoverLayout?.gridHeight ?? 220}px` }}
                >
                  <div className="min-w-0 overflow-auto border-r border-border bg-muted/30 p-1">
                    {filteredProviders.length === 0 ? (
                      <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">{t("No matching providers")}</div>
                    ) : null}
                    {filteredProviders.map((provider) => {
                      const active = provider.name === activeProvider?.name;
                      return (
                        <button
                          className={cn(
                            "flex h-9 w-full min-w-0 items-center gap-2 rounded-[5px] px-2 text-left text-[12px] outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/25",
                            active && "bg-background text-primary"
                          )}
                          key={provider.name}
                          onClick={() => setActiveProviderName(provider.name)}
                          type="button"
                        >
                          <span className="min-w-0 flex-1 truncate">{provider.name}</span>
                          <Badge className="shrink-0" variant="outline">{provider.models.length}</Badge>
                        </button>
                      );
                    })}
                  </div>
                  <div className="min-w-0 overflow-auto bg-background p-1">
                    {!activeProvider ? (
                      <div className="px-2 py-10 text-center text-[12px] text-muted-foreground">{t("No matching models")}</div>
                    ) : null}
                    {activeProvider && filteredModels.length === 0 ? (
                      <div className="px-2 py-10 text-center text-[12px] text-muted-foreground">{t("No matching models")}</div>
                    ) : null}
                    {activeProvider && filteredModels.map((model) => {
                      const selected = parsedValue.provider === activeProvider.name && parsedValue.model === model;
                      return (
                        <button
                          className={cn(
                            "flex h-9 w-full min-w-0 items-center gap-2 rounded-[5px] px-2 text-left text-[12px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/25",
                            selected && "bg-primary/10 text-primary"
                          )}
                          key={`${activeProvider.name}/${model}`}
                          onClick={() => chooseModel(activeProvider.name, model)}
                          type="button"
                        >
                          <span className="min-w-0 flex-1 truncate font-mono">{model}</span>
                          {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </PopoverContent>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function AddProfileForm({
  draft,
  error,
  onChange,
  providers
}: {
  draft: AddProfileDraft;
  error: string;
  onChange: (patch: Partial<AddProfileDraft>) => void;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("Agent")}>
          <AgentSelectControl
            onChange={(agent) => onChange({ agent })}
            value={draft.agent}
          />
        </Field>
        <Field label={t("Profile name")}>
          <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
        </Field>
        <Field label={t("Effect scope")}>
          <SelectControl
            onChange={(scope) => onChange({ scope: normalizeProfileScope(scope) })}
            options={translateOptions(profileScopeOptions, t)}
            value={draft.scope}
          />
        </Field>
        <Field label={t("Entry mode")}>
          <SelectControl
            onChange={(surface) => onChange({ surface: normalizeProfileSurface(surface) })}
            options={translateOptions(profileSurfaceOptions, t)}
            value={draft.surface}
          />
        </Field>
        {draft.agent === "claude-code" ? (
          <>
            <Field label={t("Model override")}>
              <ProfileModelSelector
                placeholder={t("Keep Claude Code default")}
                providers={providers}
                value={draft.model}
                onChange={(model) => onChange({ model })}
              />
            </Field>
            <Field label={t("Small fast model")}>
              <ProfileModelSelector
                placeholder={t("Keep Claude Code default")}
                providers={providers}
                value={draft.smallFastModel}
                onChange={(smallFastModel) => onChange({ smallFastModel })}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label={t("Provider ID")}>
              <Input value={draft.providerId} onChange={(event) => onChange({ providerId: event.target.value })} />
            </Field>
            <Field label={t("Provider name")}>
              <Input value={draft.providerName} onChange={(event) => onChange({ providerName: event.target.value })} />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
              <span className="text-[12px] font-medium">{t("Show all sessions")}</span>
              <Toggle checked={draft.showAllSessions} onChange={(showAllSessions) => onChange({ showAllSessions })} />
            </div>
            <Field className="sm:col-span-2" label={t("Codex model")}>
              <ProfileModelSelector
                placeholder={providers[0]?.models[0] && providers[0]?.name ? `${providers[0].name}/${providers[0].models[0]}` : ""}
                providers={providers}
                value={draft.model}
                onChange={(model) => onChange({ model })}
              />
            </Field>
          </>
        )}
        <Field className="sm:col-span-2" label={t("Environment variables")}>
          <KeyValueRowsControl
            addLabel={t("Add env variable")}
            rows={draft.envRows}
            onChange={(envRows) => onChange({ envRows })}
          />
        </Field>
      </div>
      {error ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {t(error)}
        </div>
      ) : null}
    </>
  );
}

export function AddProfileDialog({
  canSubmit,
  draft,
  error,
  mode = "add",
  onChange,
  onClose,
  providers,
  onSubmit
}: {
  canSubmit: boolean;
  draft: AddProfileDraft;
  error: string;
  mode?: "add" | "edit";
  onChange: (patch: Partial<AddProfileDraft>) => void;
  onClose: () => void;
  providers: GatewayProviderConfig[];
  onSubmit: () => Promise<boolean> | boolean | void;
}) {
  const t = useAppText();

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <div>
            <DialogTitle>{mode === "edit" ? t("Edit Profile") : t("Add Profile")}</DialogTitle>
          </div>
        </DialogHeader>
        <DialogBody>
          <AddProfileForm draft={draft} error={error} onChange={onChange} providers={providers} />
        </DialogBody>
        <DialogFooter>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              {t("Cancel")}
            </Button>
            <Button disabled={!canSubmit} onClick={() => void onSubmit()} type="button">
              {mode === "add" ? <Plus className="h-4 w-4" /> : null}
              {mode === "edit" ? t("Save") : t("Add")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
