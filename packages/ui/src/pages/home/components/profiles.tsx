import {
  AddProfileDraft, AgentLogo, AnimatedIconSwap, AnimatedPopover, AnimatePresence, AppConfig, Badge, BotGatewaySavedConfig, botGatewaySavedConfigLabel, BotHandoffScanTarget, Button,
	  Card, CardContent, CardHeader, CardTitle, Check, ChevronDown, Copy,
	  cn, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
	  DialogTitle, Field, GatewayProviderConfig, Info, Input, KeyValueRowsControl, LoaderCircle, motion,
  normalizeProfileScope, normalizeProfileSurface, parseProfileModelValue, Pencil, Plus, PopoverContent,
  profileAgentLabel, profileAgentOptions, ProfileConfig, profileModelDisplayValue, profileModelMatchesQuery, profileModelProviderMatchesQuery,
  profileModelOptionDisplayName, profileModelProviderOptions, profileOpenSurfaces, profileScopeLabel, profileScopeOptions, profileSummaryItems, profileSurfaceLabel, profileSurfaceOptions,
  Play, Power, RefreshCw, Search, Select, SelectControl, Terminal, Toggle, translateOptions, Trash2, useAppErrorText, useAppText, type ProfileOpenSurface, type ProfileRuntimeStatus, type ReactNode, type VirtualModelProfileConfig,
  copyTextToClipboard,
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, X
} from "../shared/index";

type ProfileActionBusy = {
  profileId: string;
  surface: ProfileOpenSurface;
};

export function ProfileView({
  addProfile,
  applyError,
  copyProfileCliCommand,
  config,
  editProfile,
  openProfileApp,
  profileActionBusy,
  profileRuntimeStatus,
  removeProfile,
  stopProfileApp,
  updateProfileItem
}: {
  addProfile: (agent?: ProfileConfig["agent"]) => void;
  applyError: string;
  copyProfileCliCommand: (index: number) => void;
  config: AppConfig;
  editProfile: (index: number) => void;
  openProfileApp: (index: number) => void;
  profileActionBusy?: ProfileActionBusy;
  profileRuntimeStatus: ProfileRuntimeStatus;
  removeProfile: (index: number) => void;
  stopProfileApp: (index: number) => void;
  updateProfileItem: (index: number, patch: Partial<ProfileConfig>) => void;
}) {
  const t = useAppText();
  const profiles = config.profile.profiles;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
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
        <CardContent className="min-h-0 flex-1 space-y-3 overflow-auto">
          <div className="space-y-2">
            {profiles.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-[12px] text-muted-foreground">
                {t("No profiles configured")}
              </div>
            ) : null}
            {profiles.map((profile, index) => {
              const scope = normalizeProfileScope(profile.scope);
              const surface = profile.agent === "zcode" ? "app" : normalizeProfileSurface(profile.surface);
              const openSurfaces = profileOpenSurfaces(profile);
              const summaryItems = profileSummaryItems(profile, config, t);
              const cliBusy = profileActionBusy?.profileId === profile.id && profileActionBusy.surface === "cli";
              const appBusy = profileActionBusy?.profileId === profile.id && profileActionBusy.surface === "app";
              const appRunning = profileRuntimeStatus.profiles.some((entry) =>
                entry.profileId === profile.id && entry.surface === "app" && entry.state === "running"
              );
              const appActionLabel = appRunning ? "Stop" : "Start";
              const appActionTooltip = `${t(appActionLabel)} ${t("App")}`;
              const cliActionTooltip = `${t("Copy")} ${t("CLI command")}`;
              const showProfileLaunchActions = profile.enabled;
              const profileActionDisabled = Boolean(profileActionBusy);

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
                      {showProfileLaunchActions && openSurfaces.includes("cli") ? (
                        <ProfileActionTooltip label={cliActionTooltip}>
                          <Button
                            aria-label={`${cliActionTooltip} ${profile.name || t("Profile")}`}
                            disabled={profileActionDisabled}
                            onClick={() => copyProfileCliCommand(index)}
                            size="iconSm"
                            type="button"
                            variant="ghost"
                          >
	                            <AnimatedIconSwap iconKey={cliBusy ? "busy" : "terminal"}>
	                              {cliBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Terminal className="h-3.5 w-3.5" />}
	                            </AnimatedIconSwap>
                          </Button>
                        </ProfileActionTooltip>
                      ) : null}
                      {showProfileLaunchActions && openSurfaces.includes("app") ? (
                        <ProfileActionTooltip label={appActionTooltip}>
                          <Button
                            aria-label={`${appActionTooltip} ${profile.name || t("Profile")}`}
                            disabled={profileActionDisabled}
                            onClick={() => appRunning ? stopProfileApp(index) : openProfileApp(index)}
                            size="iconSm"
                            type="button"
                            variant={appRunning ? "outline" : "ghost"}
                          >
	                            <AnimatedIconSwap iconKey={appBusy ? "busy" : appRunning ? "stop" : "play"}>
	                              {appBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : appRunning ? <Power className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
	                            </AnimatedIconSwap>
                          </Button>
                        </ProfileActionTooltip>
                      ) : null}
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

function ManagedCompactSetting({
  agent,
  checked,
  onChange
}: {
  agent: ProfileConfig["agent"];
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useAppText();
  const title = t("CCR managed compact");

  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <AgentLogo agent={agent} className="h-6 w-6 rounded-[5px]" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">{title}</div>
              <div className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
                {t("Use CCR context archive for this profile's auto compact requests.")}
              </div>
            </div>
          </div>
        </div>
        <Toggle
          checked={checked}
          title={title}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

export function ProfileOpenDialog({
  appRunning = false,
  busy,
  command,
  error,
  mode,
  onChooseApp,
  onClose,
  onStopApp,
  profile
}: {
  appRunning?: boolean;
  busy?: ProfileOpenSurface | "";
  command?: string;
  error?: string;
  mode: "choose" | "cli";
  onChooseApp: () => void;
  onClose: () => void;
  onStopApp: () => void;
  profile: ProfileConfig;
}) {
  const t = useAppText();
  const surfaces = profileOpenSurfaces(profile);
  const appActionLabel = appRunning ? "Stop" : "App";
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number>();

  useEffect(() => {
    setCopied(false);
  }, [command]);

  useEffect(() => () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  async function copyCommand() {
    if (!command) {
      return;
    }
    await copyTextToClipboard(command);
    setCopied(true);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setCopied(false), 3000);
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Open Agent")}</DialogTitle>
          </div>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3">
            <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
              <AgentLogo agent={profile.agent} className="h-6 w-6 rounded-[5px]" />
              <div className="min-w-0 flex-1 truncate text-[13px] font-semibold">{profile.name || profile.id}</div>
              {mode === "choose" && surfaces.includes("app") ? (
                <Button className="shrink-0" disabled={Boolean(busy)} onClick={appRunning ? onStopApp : onChooseApp} size="sm" type="button" variant="outline">
	                  <AnimatedIconSwap iconKey={busy === "app" ? "busy" : appRunning ? "stop" : "play"}>
	                    {busy === "app" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : appRunning ? <Power className="h-4 w-4" /> : <Play className="h-4 w-4" />}
	                  </AnimatedIconSwap>
                  {t(appActionLabel)}
                </Button>
              ) : null}
            </div>
            {mode === "choose" ? (
              <div className="space-y-3">
                {surfaces.includes("cli") ? (
                  <ProfileCliCommandBlock
                    command={command}
                    copied={copied}
                    onCopy={() => void copyCommand()}
                    t={t}
                  />
                ) : null}
              </div>
            ) : (
              <ProfileCliCommandBlock
                command={command}
                copied={copied}
                onCopy={() => void copyCommand()}
                t={t}
              />
            )}
            {error ? (
              <div className="whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {t(error)}
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProfileActionTooltip({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <span className="group relative inline-flex shrink-0">
      {children}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 max-w-[180px] -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-medium leading-4 text-popover-foreground opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        role="tooltip"
      >
        <span className="block truncate whitespace-nowrap">{label}</span>
      </span>
    </span>
  );
}

function ProfileCliCommandBlock({
  command,
  copied,
  onCopy,
  t
}: {
  command?: string;
  copied: boolean;
  onCopy: () => void;
  t: (value: string) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[12px] font-medium text-muted-foreground">{t("CLI command")}</div>
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/20 p-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-[5px] bg-background px-2 py-2 font-mono text-[12px] text-foreground">
          {command || t("Loading")}
        </code>
        <Button aria-label={copied ? t("Copied") : t("Copy")} disabled={!command} onClick={onCopy} size="iconSm" title={copied ? t("Copied") : t("Copy")} type="button" variant={copied ? "default" : "outline"}>
	          <AnimatedIconSwap iconKey={copied ? "copied" : "copy"}>
	            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
	          </AnimatedIconSwap>
        </Button>
      </div>
    </div>
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
      className="grid grid-cols-1 gap-1 rounded-md border border-border bg-muted/20 p-1 sm:grid-cols-3"
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
          <AnimatedPopover className="absolute left-0 right-0 top-full z-50 mt-1">
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
          </AnimatedPopover>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ProfileModelSelector({
  onChange,
  placeholder,
  providers,
  value,
  virtualModelProfiles = []
}: {
  onChange: (value: string) => void;
  placeholder?: string;
  providers: GatewayProviderConfig[];
  value: string;
  virtualModelProfiles?: VirtualModelProfileConfig[];
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
  const parsedValue = useMemo(() => parseProfileModelValue(value, providers, virtualModelProfiles), [providers, value, virtualModelProfiles]);
  const providerOptions = useMemo(() => profileModelProviderOptions(providers, virtualModelProfiles), [providers, virtualModelProfiles]);
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
    ? activeProvider.models.filter((model) => profileModelMatchesQuery(activeProvider.name, model, query, profileModelOptionDisplayName(activeProvider, model)))
    : [];
  const displayValue = profileModelDisplayValue(value, parsedValue, providers, placeholder, virtualModelProfiles);

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
          <AnimatedPopover
            className="fixed z-[70]"
            placement={popoverLayout?.placement ?? "below"}
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
                      const displayName = profileModelOptionDisplayName(activeProvider, model);
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
                          <span className="min-w-0 flex-1 truncate" title={displayName}>{displayName}</span>
                          {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </PopoverContent>
          </AnimatedPopover>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function AddProfileForm({
  botConfigs,
  draft,
  error,
  onChange,
  onCreateBot,
  providers,
  virtualModelProfiles = []
}: {
  botConfigs: BotGatewaySavedConfig[];
  draft: AddProfileDraft;
  error: string;
  onChange: (patch: Partial<AddProfileDraft>) => void;
  onCreateBot: () => void;
  providers: GatewayProviderConfig[];
  virtualModelProfiles?: VirtualModelProfileConfig[];
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
            onChange={(surface) => {
              const nextSurface = normalizeProfileSurface(surface);
              onChange(nextSurface !== "cli"
                ? { surface: nextSurface }
                : {
                    botConfigId: "",
                    botConfigured: true,
                    botEnabled: false,
                    surface: nextSurface
                  });
            }}
            options={translateOptions(
              draft.agent === "zcode"
                ? profileSurfaceOptions.filter((option) => option.value === "app")
                : profileSurfaceOptions,
              t
            )}
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
	                virtualModelProfiles={virtualModelProfiles}
	                onChange={(model) => onChange({ model })}
	              />
            </Field>
            <Field label={t("Small fast model")}>
              <ProfileModelSelector
	                placeholder={t("Keep Claude Code default")}
	                providers={providers}
	                value={draft.smallFastModel}
	                virtualModelProfiles={virtualModelProfiles}
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
            {draft.agent !== "zcode" ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
                <span className="text-[12px] font-medium">{t("Show all sessions")}</span>
                <Toggle checked={draft.showAllSessions} onChange={(showAllSessions) => onChange({ showAllSessions })} />
              </div>
            ) : null}
            <Field className="sm:col-span-2" label={t(draft.agent === "zcode" ? "ZCode model" : "Codex model")}>
              <ProfileModelSelector
	                placeholder={providers[0]?.models[0] && providers[0]?.name ? `${providers[0].name}/${providers[0].models[0]}` : ""}
	                providers={providers}
	                value={draft.model}
	                virtualModelProfiles={virtualModelProfiles}
	                onChange={(model) => onChange({ model })}
	              />
            </Field>
          </>
        )}
        {draft.agent === "claude-code" || draft.agent === "codex" ? (
          <div className="sm:col-span-2">
            <ManagedCompactSetting
              agent={draft.agent}
              checked={draft.managedCompact}
              onChange={(managedCompact) => onChange({ managedCompact })}
            />
          </div>
        ) : null}
        {draft.surface !== "cli" ? (
          <div className="sm:col-span-2">
            <BotGatewaySelectForm botConfigs={botConfigs} draft={draft} onChange={onChange} onCreateBot={onCreateBot} />
          </div>
        ) : null}
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

const ADD_BOT_SELECT_VALUE = "__add_bot__";
const HANDOFF_TARGET_NONE_VALUE = "__ccr_handoff_target_none__";

type BotHandoffScanState = {
  error: string;
  loading: boolean;
  results: BotHandoffScanTarget[];
};

const emptyHandoffScanState: BotHandoffScanState = {
  error: "",
  loading: false,
  results: []
};

function BotGatewaySelectForm({
  botConfigs,
  draft,
  onChange,
  onCreateBot
}: {
  botConfigs: BotGatewaySavedConfig[];
  draft: AddProfileDraft;
  onChange: (patch: Partial<AddProfileDraft>) => void;
  onCreateBot: () => void;
}) {
  const t = useAppText();
  const formatError = useAppErrorText();
  const options = [
    { label: t("None"), value: "none" },
    ...botConfigs.map((config) => ({ label: botGatewaySavedConfigLabel(config, t), value: config.id })),
    { label: t("Add new bot"), value: ADD_BOT_SELECT_VALUE }
  ];
  const selectedValue = draft.botEnabled && draft.botConfigId ? draft.botConfigId : "none";
  const selectedBot = draft.botEnabled
    ? botConfigs.find((config) => config.id === selectedValue)
    : undefined;
  const [wifiScan, setWifiScan] = useState<BotHandoffScanState>(emptyHandoffScanState);
  const [bluetoothScan, setBluetoothScan] = useState<BotHandoffScanState>(emptyHandoffScanState);
  const autoHandoffScanRef = useRef(false);

  const scanHandoffTargets = useCallback(async (kind: "bluetooth" | "wifi") => {
    const setScan = kind === "wifi" ? setWifiScan : setBluetoothScan;
    const scanner = kind === "wifi"
      ? window.ccr?.scanBotHandoffWifiTargets
      : window.ccr?.scanBotHandoffBluetoothTargets;
    if (!scanner) {
      setScan({
        error: t("Handoff target scan is available in the Electron app."),
        loading: false,
        results: []
      });
      return;
    }
    setScan({ ...emptyHandoffScanState, loading: true });
    try {
      const results = await scanner();
      setScan({
        error: "",
        loading: false,
        results
      });
    } catch (error) {
      setScan({
        error: formatError(error),
        loading: false,
        results: []
      });
    }
  }, [formatError, t]);

  useEffect(() => {
    if (!draft.botEnabled || !draft.botHandoffEnabled || !selectedBot) {
      autoHandoffScanRef.current = false;
      return;
    }
    if (autoHandoffScanRef.current) {
      return;
    }
    autoHandoffScanRef.current = true;
    void scanHandoffTargets("wifi");
    void scanHandoffTargets("bluetooth");
  }, [draft.botEnabled, draft.botHandoffEnabled, scanHandoffTargets, selectedBot]);

  function updateEnabled(botEnabled: boolean) {
    if (!botEnabled) {
      onChange({ botConfigId: "", botConfigured: true, botEnabled: false });
      return;
    }
    const nextBotConfigId = draft.botConfigId || botConfigs[0]?.id || "";
    const nextBot = botConfigs.find((config) => config.id === nextBotConfigId);
    onChange({
      botConfigId: nextBotConfigId,
      botConfigured: true,
      botEnabled: true,
      botForwardAllAgentMessages: nextBot ? nextBot.botGateway.forwardAllAgentMessages !== false : draft.botForwardAllAgentMessages
    });
  }

  function updateBot(value: string) {
    if (value === ADD_BOT_SELECT_VALUE) {
      onCreateBot();
      return;
    }
    if (value === "none") {
      onChange({ botConfigId: "", botConfigured: true, botEnabled: false });
      return;
    }
    const nextBot = botConfigs.find((config) => config.id === value);
    onChange({
      botConfigId: value,
      botConfigured: true,
      botEnabled: true,
      botForwardAllAgentMessages: nextBot ? nextBot.botGateway.forwardAllAgentMessages !== false : draft.botForwardAllAgentMessages
    });
  }

  const botScopeHint = t("Bot only forwards messages when opening the APP from CCR. CLI does not forward messages yet.");

  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-[12px] font-medium">{t("Bot")}</span>
          <button
            aria-label={botScopeHint}
            className="group relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
            type="button"
          >
            <Info
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            />
            <span className="pointer-events-none invisible absolute left-0 top-full z-[90] mt-1.5 w-[260px] max-w-[calc(100vw-64px)] whitespace-normal rounded-md border border-border bg-popover px-2 py-1.5 text-left text-[11px] font-medium leading-4 text-popover-foreground opacity-0 shadow-card transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 sm:w-[280px]">
              {botScopeHint}
            </span>
          </button>
        </span>
        <Toggle checked={draft.botEnabled} onChange={updateEnabled} />
      </div>
      {draft.botEnabled ? (
        <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
          <Field label={t("Select bot")}>
            <SelectControl onChange={updateBot} options={options} value={selectedValue} />
          </Field>
          {selectedBot ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                <span className="text-[12px] font-medium">{t("Forward agent messages")}</span>
                <Toggle checked={draft.botForwardAllAgentMessages} onChange={(botForwardAllAgentMessages) => onChange({ botForwardAllAgentMessages })} />
              </div>
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="text-[12px] font-medium">{t("Handoff")}</span>
                  <Toggle checked={draft.botHandoffEnabled} onChange={(botHandoffEnabled) => onChange({ botHandoffEnabled })} />
                </div>
                {draft.botHandoffEnabled ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border/70 pt-3 sm:grid-cols-2">
                    <Field label={t("Idle seconds")}>
                      <Input
                        min={30}
                        max={86400}
                        type="number"
                        value={draft.botHandoffIdleSeconds}
                        onChange={(event) => onChange({ botHandoffIdleSeconds: event.target.value })}
                      />
                    </Field>
                    <HandoffTargetPicker
                      label={t("Phone Wi-Fi target")}
                      scan={wifiScan}
                      selectedTarget={firstHandoffTarget(draft.botHandoffPhoneWifiTargets)}
                      onRefresh={() => void scanHandoffTargets("wifi")}
                      onSelect={(botHandoffPhoneWifiTargets) => onChange({ botHandoffPhoneWifiTargets })}
                    />
                    <HandoffTargetPicker
                      className="sm:col-span-2"
                      label={t("Phone Bluetooth target")}
                      scan={bluetoothScan}
                      selectedTarget={firstHandoffTarget(draft.botHandoffPhoneBluetoothTargets)}
                      onRefresh={() => void scanHandoffTargets("bluetooth")}
                      onSelect={(botHandoffPhoneBluetoothTargets) => onChange({ botHandoffPhoneBluetoothTargets })}
                    />
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function HandoffTargetPicker({
  className,
  label,
  scan,
  selectedTarget,
  onRefresh,
  onSelect
}: {
  className?: string;
  label: string;
  scan: BotHandoffScanState;
  selectedTarget: string;
  onRefresh: () => void;
  onSelect: (targetValue: string) => void;
}) {
  const t = useAppText();
  const options = selectedTarget && !scan.results.some((target) => handoffTargetMatchesSavedValue(target, selectedTarget))
    ? [
        {
          detail: "",
          id: `selected:${selectedTarget}`,
          label: selectedTarget,
          source: "selected",
          target: selectedTarget
        },
        ...scan.results
      ]
    : scan.results;
  const placeholderText = scan.loading
    ? t("Scanning targets")
    : options.length > 0
      ? t("Select a scanned target")
      : t("No targets found");
  const selectedOption = options.find((target) => handoffTargetMatchesSavedValue(target, selectedTarget));
  const selectValue = selectedTarget || HANDOFF_TARGET_NONE_VALUE;
  const selectOptions = [
    ...(selectedTarget ? [{ label: t("None"), value: HANDOFF_TARGET_NONE_VALUE }] : []),
    ...(!selectedTarget ? [{ disabled: true, label: placeholderText, value: HANDOFF_TARGET_NONE_VALUE }] : []),
    ...options.map((target) => ({
      label: handoffTargetSelectionText(target),
      value: handoffTargetSavedValue(target)
    }))
  ];

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <Select
          className="min-w-0 flex-1"
          disabled={scan.loading || (!selectedTarget && options.length === 0)}
          onValueChange={(value) => onSelect(value === HANDOFF_TARGET_NONE_VALUE ? "" : value)}
          options={selectOptions}
          value={selectValue}
        />
        <Button
          className="h-8 w-8 border-0 bg-transparent p-0 shadow-none hover:bg-transparent"
          aria-label={t("Refresh targets")}
          disabled={scan.loading}
          onClick={onRefresh}
          title={t("Refresh targets")}
          type="button"
          unstyled
        >
          <RefreshCw className={cn("h-5 w-5 text-muted-foreground hover:text-foreground", scan.loading && "animate-spin")} />
        </Button>
      </div>
      {selectedOption?.detail ? (
        <div className="truncate text-[11px] text-muted-foreground" title={selectedOption.detail}>
          {selectedOption.detail}
        </div>
      ) : null}
      {scan.error ? (
        <div className="break-words text-[11px] text-destructive">{scan.error}</div>
      ) : null}
    </div>
  );
}

function firstHandoffTarget(value: string): string {
  return value.split(/\r?\n/).map((item) => item.trim()).find(Boolean) ?? "";
}

function handoffTargetSelectionText(target: BotHandoffScanTarget): string {
  if (target.source !== "bluetooth") {
    return target.label;
  }
  const label = target.label.trim();
  const value = target.target.trim();
  if (!label || !value || label === value || label.includes(value)) {
    return label || value;
  }
  return `${label}(${value})`;
}

function handoffTargetSavedValue(target: BotHandoffScanTarget): string {
  if (target.source === "bluetooth") {
    return handoffTargetSelectionText(target);
  }
  return target.target;
}

function handoffTargetMatchesSavedValue(target: BotHandoffScanTarget, savedValue: string): boolean {
  return target.target === savedValue || handoffTargetSavedValue(target) === savedValue;
}

export function AddProfileDialog({
  botConfigs,
  canSubmit,
  draft,
  error,
  mode = "add",
  onChange,
  onCreateBot,
  onClose,
  providers,
  submitting = false,
  virtualModelProfiles = [],
  onSubmit
}: {
  botConfigs: BotGatewaySavedConfig[];
  canSubmit: boolean;
  draft: AddProfileDraft;
  error: string;
  mode?: "add" | "edit";
  onChange: (patch: Partial<AddProfileDraft>) => void;
  onCreateBot: () => void;
  onClose: () => void;
  providers: GatewayProviderConfig[];
  submitting?: boolean;
  virtualModelProfiles?: VirtualModelProfileConfig[];
  onSubmit: () => Promise<boolean> | boolean | void;
}) {
  const t = useAppText();

  return (
	    <Dialog onOpenChange={(open) => !open && !submitting && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <div>
            <DialogTitle>{mode === "edit" ? t("Edit Profile") : t("Add Profile")}</DialogTitle>
          </div>
        </DialogHeader>
        <DialogBody>
	          <AddProfileForm
              botConfigs={botConfigs}
              draft={draft}
              error={error}
              onChange={onChange}
              onCreateBot={onCreateBot}
              providers={providers}
              virtualModelProfiles={virtualModelProfiles}
            />
        </DialogBody>
        <DialogFooter>
          <div className="flex justify-end gap-2">
	            <Button disabled={submitting} onClick={onClose} type="button" variant="outline">
	              {t("Cancel")}
	            </Button>
	            <Button disabled={!canSubmit || submitting} onClick={() => void onSubmit()} type="button">
		              {submitting || mode === "add" ? (
		                <AnimatedIconSwap iconKey={submitting ? "submitting" : "add"}>
		                  {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
		                </AnimatedIconSwap>
		              ) : null}
	              {mode === "edit" ? t("Save") : t("Add")}
	            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
