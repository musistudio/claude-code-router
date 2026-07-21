import {
  AddProfileDraft, AgentLogo, AnimatedIconSwap, AnimatedPopover, AnimatePresence, AppConfig, Badge, BotGatewaySavedConfig, botGatewaySavedConfigLabel, BotHandoffScanTarget, Button,
  Card, CardContent, CardHeader, CardTitle, Check, ChevronDown, CircleAlert, Copy,
  cn, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, Field, GatewayProviderConfig, Info, Input, KeyValueRowsControl, LoaderCircle, motion,
  normalizeProfileScope, normalizeProfileSurface, Pencil, Plus, PopoverContent,
  profileAgentLabel, profileAgentOptions, ProfileConfig, profileOpenSurfaces, profileScopeLabel, profileScopeOptions, profileSummaryItems, profileSurfaceLabel, profileSurfaceOptions,
  Play, Power, RefreshCw, Select, SelectControl, Terminal, Toggle, translateOptions, Trash2, useAppErrorText, useAppText, type ProfileOpenSurface, type ProfileRuntimeStatus, type ReactDragEvent, type ReactNode, type VirtualModelProfileConfig,
  copyTextToClipboard,
  useCallback, useEffect, useMemo, useRef, useState, X
} from "../shared/index";
import { ModelMultiSelector, ModelSelector } from "./model-selector";

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
        <CardContent className="min-h-0 flex-1 space-y-4 overflow-auto">
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
              const runtimeEntry = profileRuntimeStatus.profiles.find((entry) =>
                entry.profileId === profile.id && entry.surface === "app" && entry.state === "running"
              );
              const appRunning = Boolean(runtimeEntry);
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
                            {runtimeEntry?.botGateway ? (
                              <Badge variant={runtimeEntry.botGateway.state === "connected" ? "success" : runtimeEntry.botGateway.lastError ? "warning" : "outline"}>
                                {t("Bot")} · {t(runtimeEntry.botGateway.state === "connected" ? "Connected" : runtimeEntry.botGateway.state === "starting" ? "Starting" : runtimeEntry.botGateway.state)}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-2 min-w-0 space-y-1.5">
                          {summaryItems.map((item) => (
                            <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-baseline gap-2 text-[12px] sm:grid-cols-[128px_minmax(0,1fr)]" key={item.label}>
                              <div className="truncate text-muted-foreground">{item.label}</div>
                              <div className="min-w-0 truncate font-medium text-foreground" title={item.value}>{item.value}</div>
                            </div>
                          ))}
                          {runtimeEntry?.botGateway ? (
                            <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-baseline gap-2 text-[12px] sm:grid-cols-[128px_minmax(0,1fr)]">
                              <div className="truncate text-muted-foreground">{t("Bot activity")}</div>
                              <div className="min-w-0 truncate font-medium text-foreground" title={runtimeEntry.botGateway.lastError || runtimeEntry.botGateway.lastEventAt || ""}>
                                {runtimeEntry.botGateway.lastError
                                  ? runtimeEntry.botGateway.lastError
                                  : runtimeEntry.botGateway.lastEventAt
                                    ? `${t("Last event")}: ${new Date(runtimeEntry.botGateway.lastEventAt).toLocaleString()}`
                                    : t("Waiting for messages")}
                                {runtimeEntry.botGateway.outboxCount > 0 ? ` · ${runtimeEntry.botGateway.outboxCount} ${t("pending")}` : ""}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div
                      aria-label={`${profile.name || t("Profile")} ${t("Profile actions")}`}
                      className="ml-auto grid shrink-0 grid-cols-[54px_1px_28px_28px_1px_28px_28px] items-center gap-1.5"
                      role="group"
                    >
                      <Toggle
                        checked={profile.enabled}
                        onChange={(enabled) => updateProfileItem(index, { enabled })}
                        title={t(profile.enabled ? "Enabled" : "Disabled")}
                      />
                      <span aria-hidden="true" className="h-5 w-px bg-border/80" />
                      {showProfileLaunchActions && openSurfaces.includes("cli") ? (
                        <ProfileActionTooltip label={cliActionTooltip}>
                          <Button
                            aria-label={`${cliActionTooltip} ${profile.name || t("Profile")}`}
                            disabled={profileActionDisabled}
                            onClick={() => copyProfileCliCommand(index)}
                            size="iconSm"
                            type="button"
                            variant="subtle"
                          >
	                            <AnimatedIconSwap iconKey={cliBusy ? "busy" : "terminal"}>
	                              {cliBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Terminal className="h-3.5 w-3.5" />}
	                            </AnimatedIconSwap>
                          </Button>
                        </ProfileActionTooltip>
                      ) : <span aria-hidden="true" className="h-7 w-7" />}
                      {showProfileLaunchActions && openSurfaces.includes("app") ? (
                        <ProfileActionTooltip label={appActionTooltip}>
                          <Button
                            aria-label={`${appActionTooltip} ${profile.name || t("Profile")}`}
                            disabled={profileActionDisabled}
                            onClick={() => appRunning ? stopProfileApp(index) : openProfileApp(index)}
                            size="iconSm"
                            type="button"
                            variant={appRunning ? "outline" : "subtle"}
                          >
	                            <AnimatedIconSwap iconKey={appBusy ? "busy" : appRunning ? "stop" : "play"}>
	                              {appBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : appRunning ? <Power className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
	                            </AnimatedIconSwap>
                          </Button>
                        </ProfileActionTooltip>
                      ) : <span aria-hidden="true" className="h-7 w-7" />}
                      <span aria-hidden="true" className="h-5 w-px bg-border/80" />
                      <ProfileActionTooltip label={t("Edit")}>
                        <Button aria-label={`${t("Edit")} ${profile.name || t("Profile")}`} onClick={() => editProfile(index)} size="iconSm" type="button" variant="ghost">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </ProfileActionTooltip>
                      <ProfileActionTooltip label={t("Remove profile")}>
                        <Button
                          aria-label={t("Remove profile")}
                          className="hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
                          onClick={() => removeProfile(index)}
                          size="iconSm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </ProfileActionTooltip>
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

export function DeleteProfileDialog({
  onClose,
  onConfirm,
  profile
}: {
  onClose: () => void;
  onConfirm: () => void;
  profile: ProfileConfig;
}) {
  const t = useAppText();
  const name = profile.name || t("Unnamed");
  const agent = t(profileAgentLabel(profile.agent));

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Delete Profile")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <div className="flex items-start gap-2 text-[12px] font-medium text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("Delete this agent profile from the configuration?")}</span>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <div className="truncate" title={name}>
                <span className="font-medium text-foreground">{t("Name")}:</span> {name}
              </div>
              <div className="truncate" title={agent}>
                <span className="font-medium text-foreground">{t("Agent")}:</span> {agent}
              </div>
              <div>{t("This action is applied immediately to the draft config and will auto-save with other changes.")}</div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button autoFocus onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button onClick={onConfirm} type="button" variant="destructive">
            <Trash2 className="h-4 w-4" />
            {t("Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      className="grid grid-cols-1 gap-1 rounded-md border border-border bg-muted/20 p-1 sm:grid-cols-5"
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
  const [appPathDragActive, setAppPathDragActive] = useState(false);
  const appPathLabel = profileAppPathLabel(draft.agent);
  const showAppPathField = draft.surface !== "cli" && Boolean(appPathLabel);
  const handleAppPathDrop = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!showAppPathField) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setAppPathDragActive(false);
    const appPath = appPathFromDropEvent(event);
    if (appPath) {
      onChange({ appPath });
    }
  }, [onChange, showAppPathField]);
  const handleAppPathDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!showAppPathField) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setAppPathDragActive(true);
  }, [showAppPathField]);
  const handleAppPathDragLeave = useCallback(() => {
    setAppPathDragActive(false);
  }, []);

  return (
    <>
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onDragLeave={showAppPathField ? handleAppPathDragLeave : undefined}
        onDragOver={showAppPathField ? handleAppPathDragOver : undefined}
        onDrop={showAppPathField ? handleAppPathDrop : undefined}
      >
        <Field label={t("Agent")}>
          <AgentSelectControl
            onChange={(agent) => onChange(agent === "grok" || agent === "kimi"
              ? {
                  agent,
                  availableModels: [],
                  botConfigId: "",
                  botConfigured: true,
                  botEnabled: false,
                  model: "",
                  scope: "ccr",
                  surface: "cli"
                }
              : agent === "zcode"
                ? { agent, surface: "app" }
                : { agent })}
            value={draft.agent}
          />
        </Field>
        <Field label={t("Profile name")}>
          <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
        </Field>
        <Field label={t("Effect scope")}>
          <SelectControl
            onChange={(scope) => onChange({ scope: normalizeProfileScope(scope) })}
            options={translateOptions(
              draft.agent === "grok" || draft.agent === "kimi"
                ? profileScopeOptions.filter((option) => option.value === "ccr")
                : profileScopeOptions,
              t
            )}
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
                : draft.agent === "grok" || draft.agent === "kimi"
                  ? profileSurfaceOptions.filter((option) => option.value === "cli")
                : profileSurfaceOptions,
              t
            )}
            value={draft.surface}
          />
        </Field>
        {showAppPathField && appPathLabel ? (
          <Field className="sm:col-span-2" label={t(appPathLabel)}>
            <div className={cn(
              "rounded-md border border-border bg-background p-1 transition-colors",
              appPathDragActive ? "border-primary bg-primary/5" : "border-border"
            )}>
              <Input
                placeholder={t("Drop the app here or paste the executable path")}
                value={draft.appPath}
                onChange={(event) => onChange({ appPath: event.target.value })}
              />
            </div>
          </Field>
        ) : null}
        {draft.agent === "claude-code" ? (
          <>
            <Field label={t("Model override")}>
              <ModelSelector
                placeholder={t("Keep Claude Code default")}
                providers={providers}
                value={draft.model}
                virtualModelProfiles={virtualModelProfiles}
                onChange={(model) => onChange({ model })}
              />
            </Field>
            <Field label={t("Small fast model")}>
              <ModelSelector
                placeholder={t("Keep Claude Code default")}
                providers={providers}
                value={draft.smallFastModel}
                virtualModelProfiles={virtualModelProfiles}
                onChange={(smallFastModel) => onChange({ smallFastModel })}
              />
            </Field>
          </>
        ) : draft.agent === "grok" ? (
          <Field className="sm:col-span-2" label={t("Grok model")}>
            <ModelSelector
              placeholder={providers[0]?.models[0] && providers[0]?.name ? `${providers[0].name}/${providers[0].models[0]}` : ""}
              providers={providers}
              value={draft.model}
              virtualModelProfiles={virtualModelProfiles}
              onChange={(model) => onChange({ model })}
            />
          </Field>
        ) : draft.agent === "kimi" ? (
          <>
            <Field className="sm:col-span-2" label={t("Default model")}>
              <ModelSelector
                placeholder={providers[0]?.models[0] && providers[0]?.name ? `${providers[0].name}/${providers[0].models[0]}` : ""}
                providers={providers}
                value={draft.model}
                virtualModelProfiles={virtualModelProfiles}
                onChange={(model) => onChange({
                  availableModels: model && !draft.availableModels.includes(model)
                    ? [model, ...draft.availableModels]
                    : draft.availableModels,
                  model
                })}
              />
            </Field>
            <Field className="sm:col-span-2" label={t("Available models")}>
              <ModelMultiSelector
                providers={providers}
                value={draft.availableModels}
                virtualModelProfiles={virtualModelProfiles}
                onChange={(availableModels) => onChange({
                  availableModels,
                  model: availableModels.includes(draft.model) ? draft.model : availableModels[0] ?? ""
                })}
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
            {draft.agent !== "zcode" && draft.agent !== "opencode" ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
                <span className="text-[12px] font-medium">{t("Show all sessions")}</span>
                <Toggle checked={draft.showAllSessions} onChange={(showAllSessions) => onChange({ showAllSessions })} />
              </div>
            ) : null}
            <Field className="sm:col-span-2" label={t(draft.agent === "zcode" ? "ZCode model" : draft.agent === "opencode" ? "OpenCode model" : "Codex model")}>
              <ModelSelector
                placeholder={providers[0]?.models[0] && providers[0]?.name ? `${providers[0].name}/${providers[0].models[0]}` : ""}
                providers={providers}
                value={draft.model}
                virtualModelProfiles={virtualModelProfiles}
                onChange={(model) => onChange({ model })}
              />
            </Field>
          </>
        )}
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

function profileAppPathLabel(agent: ProfileConfig["agent"]): "CLAUDE_APP_PATH" | "CHATGPT_APP_PATH" | "OPENCODE_APP_PATH" | undefined {
  if (agent === "claude-code") {
    return "CLAUDE_APP_PATH";
  }
  if (agent === "codex") {
    return "CHATGPT_APP_PATH";
  }
  if (agent === "opencode") {
    return "OPENCODE_APP_PATH";
  }
  return undefined;
}

function appPathFromDropEvent(event: ReactDragEvent<HTMLElement>): string {
  for (const file of Array.from(event.dataTransfer.files ?? [])) {
    const path = filePathFromDroppedFile(file);
    if (path) {
      return path;
    }
  }
  return appPathFromDroppedText(
    event.dataTransfer.getData("text/uri-list") ||
    event.dataTransfer.getData("text/plain")
  );
}

function filePathFromDroppedFile(file: File): string {
  try {
    const bridgedPath = window.ccr?.getFilePath?.(file)?.trim();
    if (bridgedPath) {
      return bridgedPath;
    }
  } catch {
    // Fall through to Electron versions that still expose File.path.
  }
  const legacyPath = (file as File & { path?: string }).path?.trim();
  return legacyPath || "";
}

function appPathFromDroppedText(value: string): string {
  const line = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith("#")) || "";
  if (!line) {
    return "";
  }
  if (!line.startsWith("file:")) {
    return line;
  }
  try {
    const pathname = decodeURIComponent(new URL(line).pathname);
    return /^\/[A-Za-z]:\//.test(pathname)
      ? pathname.slice(1)
      : pathname;
  } catch {
    return "";
  }
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
                    <div className="sm:col-span-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-4 text-amber-700 dark:text-amber-300">
                      {t("Phone presence targets are experimental and do not affect runtime handoff yet. Handoff currently uses screen lock and idle time.")}
                    </div>
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
	          <AddProfileForm botConfigs={botConfigs} draft={draft} error={error} onChange={onChange} onCreateBot={onCreateBot} providers={providers} virtualModelProfiles={virtualModelProfiles} />
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
