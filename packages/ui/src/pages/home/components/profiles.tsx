import {
  AddProfileDraft, AgentLogo, AnimatedIconSwap, AnimatedPopover, AnimatePresence, AppConfig, Badge, BotGatewaySavedConfig, botGatewaySavedConfigLabel, BotHandoffScanTarget, Button,
  Card, CardContent, CardHeader, CardTitle, Check, ChevronDown, CircleAlert, Copy,
  cn, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, Field, GatewayProviderConfig, Info, Input, KeyValueRowsControl, LoaderCircle, motion,
  normalizeProfileScope, normalizeProfileSurface, Pencil, Plus, PopoverContent,
  profileAgentLabel, profileAgentOptions, ProfileConfig, profileModelProviderOptions, profileOpenSurfaces, profileScopeLabel, profileScopeOptions, profileSummaryItems, profileSurfaceLabel, profileSurfaceOptions,
  Play, Power, RefreshCw, Select, SelectControl, Terminal, Toggle, translateOptions, Trash2, useAppErrorText, useAppText, useLayoutEffect, type ProfileOpenSurface, type ProfileRuntimeStatus, type ReactDragEvent, type ReactNode, type VirtualModelProfileConfig,
  copyTextToClipboard, validateProfileEnvRows,
  useCallback, useEffect, useMemo, useRef, useState, X
} from "../shared/index";
import { PopoverPortal } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { ModelMultiSelector, ModelSelector } from "./model-selector";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
              <CardTitle>{t("Agent profiles")}</CardTitle>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t("Create profiles that tell each agent which model and entry mode to use.")}
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
        <CardContent className="min-h-0 flex-1 overflow-auto max-[720px]:p-3">
          <div className="grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))] max-[720px]:gap-2.5">
            {profiles.length === 0 ? (
              <div className="col-span-full flex h-32 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-[12px] text-muted-foreground">
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
                <div
                  className={cn(
                    "flex min-h-[220px] min-w-0 flex-col rounded-md border border-border p-3 transition-colors",
                    profile.enabled
                      ? "bg-background hover:bg-muted/10"
                      : "bg-muted/20"
                  )}
                  key={profile.id}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <AgentLogo agent={profile.agent} />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold">
                          {profile.name || t("Unnamed")}
                        </div>
                      </div>
                    </div>
                    <Toggle
                      checked={profile.enabled}
                      onChange={(enabled) =>
                        updateProfileItem(index, { enabled })
                      }
                      title={t(profile.enabled ? "Enabled" : "Disabled")}
                    />
                  </div>
                  <div className="mt-3 min-w-0 flex-1 space-y-1.5 border-t border-border/60 pt-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      {t("Configuration")}
                    </div>
                    {summaryItems.map((item) => (
                      <div className="grid min-w-0 grid-cols-[92px_minmax(0,1fr)] items-baseline gap-2 text-[12px]" key={item.label}>
                        <div className="truncate text-muted-foreground">{item.label}</div>
                        <div className="min-w-0 truncate font-medium text-foreground" title={item.value}>{item.value}</div>
                      </div>
                    ))}
                    {runtimeEntry?.botGateway ? (
                      <div className="grid min-w-0 grid-cols-[92px_minmax(0,1fr)] items-baseline gap-2 text-[12px]">
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
                  <div
                    aria-label={`${profile.name || t("Profile")} ${t("Profile actions")}`}
                    className="mt-3 flex min-w-0 items-center justify-between gap-2 border-t border-border/60 pt-2"
                    role="group"
                  >
                    <div className="flex min-w-0 items-center gap-1">
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
                            <AnimatedIconSwap
                              iconKey={cliBusy ? "busy" : "terminal"}
                            >
                              {cliBusy ? (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Terminal className="h-3.5 w-3.5" />
                              )}
                            </AnimatedIconSwap>
                          </Button>
                        </ProfileActionTooltip>
                      ) : null}
                      {showProfileLaunchActions && openSurfaces.includes("app") ? (
                        <ProfileActionTooltip label={appActionTooltip}>
                          <Button
                            aria-label={`${appActionTooltip} ${profile.name || t("Profile")}`}
                            disabled={profileActionDisabled}
                            onClick={() =>
                              appRunning
                                ? stopProfileApp(index)
                                : openProfileApp(index)
                            }
                            size="iconSm"
                            type="button"
                            variant={appRunning ? "outline" : "subtle"}
                          >
                            <AnimatedIconSwap
                              iconKey={
                                appBusy ? "busy" : appRunning ? "stop" : "play"
                              }
                            >
                              {appBusy ? (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                              ) : appRunning ? (
                                <Power className="h-3.5 w-3.5" />
                              ) : (
                                <Play className="h-3.5 w-3.5" />
                              )}
                            </AnimatedIconSwap>
                          </Button>
                        </ProfileActionTooltip>
                      ) : null}
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <ProfileActionTooltip label={t("Edit")}>
                        <Button
                          aria-label={`${t("Edit")} ${
                            profile.name || t("Profile")
                          }`}
                          onClick={() => editProfile(index)}
                          size="iconSm"
                          type="button"
                          variant="ghost"
                        >
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
    <Tooltip
      content={<span className="block truncate whitespace-nowrap">{label}</span>}
      contentClassName="max-w-[180px]"
      side="top"
    >
      {children}
    </Tooltip>
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
      className="grid grid-cols-1 gap-1 rounded-md border border-border bg-muted/20 p-1 sm:grid-cols-6"
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
  const [popoverLayout, setPopoverLayout] = useState<{
    left: number;
    maxHeight: number;
    offset: number;
    placement: "above" | "below";
    width: number;
  }>();
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useClientLayoutEffect(() => {
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
      const viewportHeight = window.innerHeight;
      const listHeight = profileAgentOptions.length * 36 + 8;
      const below = Math.max(0, viewportHeight - anchor.bottom - margin - gap);
      const above = Math.max(0, anchor.top - margin - gap);
      const placement = below < listHeight && above > below ? "above" : "below";
      setPopoverLayout({
        left: Math.max(margin, Math.min(anchor.left, window.innerWidth - anchor.width - margin)),
        maxHeight: Math.min(listHeight, Math.max(120, placement === "above" ? above : below)),
        offset: placement === "above" ? viewportHeight - anchor.top + gap : anchor.bottom + gap,
        placement,
        width: anchor.width
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
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
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

      <PopoverPortal open={open && Boolean(popoverLayout)}>
        <AnimatePresence initial={false}>
          {open && popoverLayout ? (
            <AnimatedPopover
              className="fixed z-[140]"
              placement={popoverLayout.placement}
              style={{
                left: `${popoverLayout.left}px`,
                maxHeight: `${popoverLayout.maxHeight}px`,
                width: `${popoverLayout.width}px`,
                ...(popoverLayout.placement === "above"
                  ? { bottom: `${popoverLayout.offset}px` }
                  : { top: `${popoverLayout.offset}px` })
              }}
            >
              <PopoverContent
                className="overflow-auto p-1"
                id="profile-agent-select-options"
                ref={panelRef}
                role="listbox"
                style={{ maxHeight: `${popoverLayout.maxHeight}px` }}
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
      </PopoverPortal>
    </div>
  );
}

export function AddProfileForm({
  botConfigs,
  draft,
  error,
  mode = "add",
  onChange,
  onCreateBot,
  providers,
  virtualModelProfiles = []
}: {
  botConfigs: BotGatewaySavedConfig[];
  draft: AddProfileDraft;
  error: string;
  mode?: "add" | "edit";
  onChange: (patch: Partial<AddProfileDraft>) => void;
  onCreateBot: () => void;
  providers: GatewayProviderConfig[];
  virtualModelProfiles?: VirtualModelProfileConfig[];
}) {
  const t = useAppText();
  const [advancedOpen, setAdvancedOpen] = useState(mode === "edit");
  const [appPathDragActive, setAppPathDragActive] = useState(false);
  const appPathLabel = profileAppPathLabel(draft.agent);
  const showAppPathField = draft.surface !== "cli" && Boolean(appPathLabel);
  const modelProviderOptions = useMemo(
    () => profileModelProviderOptions(providers, virtualModelProfiles),
    [providers, virtualModelProfiles]
  );
  const availableModelCount = modelProviderOptions.reduce((count, provider) => count + provider.models.length, 0);
  const modelPlaceholder = firstProfileModelPlaceholder(modelProviderOptions);
  const validation = profileDraftValidation(draft, botConfigs, availableModelCount);
  const optionalFieldLabel = t("Optional");
  const requiredFieldLabel = t("Required");
  const advancedIssueCount = [
    validation.providerId,
    validation.providerName,
    validation.bot,
    validation.handoff,
    validation.env
  ].filter(Boolean).length;
  const advancedSummary = advancedIssueCount > 0
    ? t("Advanced settings need attention")
    : t("Paths, provider identity, bot, compact, and env");
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
        <Field label={t("Agent")} requirement="required" requirementLabel={requiredFieldLabel}>
          <AgentSelectControl
            onChange={(agent) => onChange(agent === "grok" || agent === "kimi" || agent === "pi"
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
        <Field label={t("Profile name")} requirement="required" requirementLabel={requiredFieldLabel}>
          <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
          {validation.name ? <ProfileFieldHint>{t(validation.name)}</ProfileFieldHint> : null}
        </Field>
        <Field label={t("Effect scope")} requirement="required" requirementLabel={requiredFieldLabel}>
          <SelectControl
            onChange={(scope) => onChange({ scope: normalizeProfileScope(scope) })}
            options={translateOptions(
              draft.agent === "grok" || draft.agent === "kimi" || draft.agent === "pi"
                ? profileScopeOptions.filter((option) => option.value === "ccr")
                : profileScopeOptions,
              t
            )}
            value={draft.scope}
          />
        </Field>
        <Field label={t("Entry mode")} requirement="required" requirementLabel={requiredFieldLabel}>
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
                : draft.agent === "grok" || draft.agent === "kimi" || draft.agent === "pi"
                  ? profileSurfaceOptions.filter((option) => option.value === "cli")
                : profileSurfaceOptions,
              t
            )}
            value={draft.surface}
          />
        </Field>
        {draft.agent === "claude-code" ? (
          <>
            <Field label={t("Default model")} requirement="required" requirementLabel={requiredFieldLabel}>
              <ModelSelector
                placeholder={modelPlaceholder || t("Select default model")}
                providers={providers}
                value={draft.model}
                virtualModelProfiles={virtualModelProfiles}
                onChange={(model) => onChange({ model })}
              />
              {validation.defaultModel ? <ProfileFieldHint>{t(validation.defaultModel)}</ProfileFieldHint> : null}
            </Field>
            <Field label={t("Fable model")} requirement="optional" requirementLabel={optionalFieldLabel}>
              <ModelSelector
                placeholder={t("Keep Claude Code default")}
                providers={providers}
                value={draft.fableModel}
                virtualModelProfiles={virtualModelProfiles}
                onChange={(fableModel) => onChange({ fableModel })}
              />
            </Field>
            <Field label={t("Opus model")} requirement="optional" requirementLabel={optionalFieldLabel}>
              <ModelSelector
                placeholder={t("Keep Claude Code default")}
                providers={providers}
                value={draft.opusModel}
                virtualModelProfiles={virtualModelProfiles}
                onChange={(opusModel) => onChange({ opusModel })}
              />
            </Field>
            <Field label={t("Sonnet model")} requirement="optional" requirementLabel={optionalFieldLabel}>
              <ModelSelector
                placeholder={t("Keep Claude Code default")}
                providers={providers}
                value={draft.sonnetModel}
                virtualModelProfiles={virtualModelProfiles}
                onChange={(sonnetModel) => onChange({ sonnetModel })}
              />
            </Field>
            <Field label={t("Haiku model")} requirement="optional" requirementLabel={optionalFieldLabel}>
              <ModelSelector
                placeholder={t("Keep Claude Code default")}
                providers={providers}
                value={draft.haikuModel}
                virtualModelProfiles={virtualModelProfiles}
                onChange={(haikuModel) => onChange({ haikuModel, smallFastModel: haikuModel })}
              />
            </Field>
          </>
        ) : draft.agent === "grok" ? (
          <Field className="sm:col-span-2" label={t("Grok model")} requirement="optional" requirementLabel={optionalFieldLabel}>
            <ModelSelector
              placeholder={modelPlaceholder}
              providers={providers}
              value={draft.model}
              virtualModelProfiles={virtualModelProfiles}
              onChange={(model) => onChange({ model })}
            />
          </Field>
        ) : draft.agent === "pi" ? (
          <Field className="sm:col-span-2" label={t("Pi model")} requirement="optional" requirementLabel={optionalFieldLabel}>
            <ModelSelector
              placeholder={modelPlaceholder}
              providers={providers}
              value={draft.model}
              virtualModelProfiles={virtualModelProfiles}
              onChange={(model) => onChange({ model })}
            />
          </Field>
        ) : draft.agent === "kimi" ? (
          <>
            <Field className="sm:col-span-2" label={t("Kimi model")} requirement="required" requirementLabel={requiredFieldLabel}>
              <ModelSelector
                placeholder={modelPlaceholder}
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
              {validation.kimiModel ? <ProfileFieldHint>{t(validation.kimiModel)}</ProfileFieldHint> : null}
            </Field>
            <Field className="sm:col-span-2" label={t("Allowed models")} requirement="required" requirementLabel={requiredFieldLabel}>
              <ModelMultiSelector
                providers={providers}
                value={draft.availableModels}
                virtualModelProfiles={virtualModelProfiles}
                onChange={(availableModels) => onChange({
                  availableModels,
                  model: availableModels.includes(draft.model) ? draft.model : availableModels[0] ?? ""
                })}
              />
              {validation.kimiAvailableModels ? <ProfileFieldHint>{t(validation.kimiAvailableModels)}</ProfileFieldHint> : null}
            </Field>
          </>
        ) : (
          <>
            <Field className="sm:col-span-2" label={t(draft.agent === "zcode" ? "ZCode model" : draft.agent === "opencode" ? "OpenCode model" : "Codex model")} requirement="optional" requirementLabel={optionalFieldLabel}>
              <ModelSelector
                placeholder={modelPlaceholder}
                providers={providers}
                value={draft.model}
                virtualModelProfiles={virtualModelProfiles}
                onChange={(model) => onChange({ model })}
              />
            </Field>
          </>
        )}
        <div className="sm:col-span-2">
          <button
            className="flex min-h-9 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/25"
            onClick={() => setAdvancedOpen((current) => !current)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-foreground">{t("Advanced settings")}</span>
              <span className={cn("mt-0.5 block truncate text-[11px]", advancedIssueCount > 0 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                {advancedSummary}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {advancedIssueCount > 0 ? <Badge variant="warning">{advancedIssueCount}</Badge> : null}
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", advancedOpen && "rotate-180")} />
            </span>
          </button>
          <AnimatePresence initial={false}>
            {advancedOpen ? (
              <motion.div
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden"
                exit={{ height: 0, opacity: 0 }}
                initial={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-border bg-background/60 p-3 sm:grid-cols-2">
                  {showAppPathField && appPathLabel ? (
                    <Field className="sm:col-span-2" label={t(appPathLabel)} requirement="optional" requirementLabel={optionalFieldLabel}>
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
                  {draft.agent !== "claude-code" && draft.agent !== "grok" && draft.agent !== "kimi" && draft.agent !== "pi" ? (
                    <>
                      <Field label={t("Provider ID")} requirement="required" requirementLabel={requiredFieldLabel}>
                        <Input value={draft.providerId} onChange={(event) => onChange({ providerId: event.target.value })} />
                        {validation.providerId ? <ProfileFieldHint>{t(validation.providerId)}</ProfileFieldHint> : null}
                      </Field>
                      <Field label={t("Provider name")} requirement="required" requirementLabel={requiredFieldLabel}>
                        <Input value={draft.providerName} onChange={(event) => onChange({ providerName: event.target.value })} />
                        {validation.providerName ? <ProfileFieldHint>{t(validation.providerName)}</ProfileFieldHint> : null}
                      </Field>
                      {draft.agent !== "zcode" && draft.agent !== "opencode" ? (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
                          <span className="text-[12px] font-medium">{t("Show all sessions")}</span>
                          <Toggle checked={draft.showAllSessions} onChange={(showAllSessions) => onChange({ showAllSessions })} />
                        </div>
                      ) : null}
                    </>
                  ) : null}
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
                      {validation.bot ? <ProfileFieldHint>{t(validation.bot)}</ProfileFieldHint> : null}
                      {validation.handoff ? <ProfileFieldHint>{t(validation.handoff)}</ProfileFieldHint> : null}
                    </div>
                  ) : null}
                  <Field className="sm:col-span-2" label={t("Environment variables")} requirement="optional" requirementLabel={optionalFieldLabel}>
                    <KeyValueRowsControl
                      addLabel={t("Add env variable")}
                      rows={draft.envRows}
                      onChange={(envRows) => onChange({ envRows })}
                    />
                    {validation.env ? <ProfileFieldHint>{t(validation.env)}</ProfileFieldHint> : null}
                  </Field>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      {validation.models ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t(validation.models)}</span>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {t(error)}
        </div>
      ) : null}
    </>
  );
}

function ProfileFieldHint({ children }: { children: ReactNode }) {
  return <div className="text-[11px] leading-4 text-amber-700 dark:text-amber-300">{children}</div>;
}

function firstProfileModelPlaceholder(providers: ReturnType<typeof profileModelProviderOptions>): string {
  const provider = providers[0];
  const model = provider?.models[0];
  return provider && model ? `${provider.name}/${model}` : "";
}

function profileDraftValidation(
  draft: AddProfileDraft,
  botConfigs: BotGatewaySavedConfig[],
  availableModelCount: number
): Partial<Record<"bot" | "defaultModel" | "env" | "handoff" | "kimiAvailableModels" | "kimiModel" | "models" | "name" | "providerId" | "providerName", string>> {
  const issues: Partial<Record<"bot" | "defaultModel" | "env" | "handoff" | "kimiAvailableModels" | "kimiModel" | "models" | "name" | "providerId" | "providerName", string>> = {};
  if (!draft.name.trim()) {
    issues.name = "Profile name is required.";
  }
  if (availableModelCount === 0) {
    issues.models = "Configure at least one enabled provider model before saving an agent profile.";
  }
  if (draft.agent === "claude-code" && !draft.model.trim()) {
    issues.defaultModel = "Default model is required.";
  }
  if (draft.agent === "kimi") {
    if (!draft.model.trim()) {
      issues.kimiModel = "Kimi model is required.";
    }
    if (draft.availableModels.length === 0) {
      issues.kimiAvailableModels = "Select at least one allowed model.";
    }
  }
  if (draft.agent !== "claude-code" && draft.agent !== "grok" && draft.agent !== "kimi" && draft.agent !== "pi") {
    if (!draft.providerId.trim()) {
      issues.providerId = "Provider ID is required.";
    }
    if (!draft.providerName.trim()) {
      issues.providerName = "Provider name is required.";
    }
  }
  if (draft.surface !== "cli" && draft.botEnabled && !botConfigs.some((config) => config.id === draft.botConfigId.trim())) {
    issues.bot = "Select an existing bot or turn Bot off.";
  }
  if (draft.surface !== "cli" && draft.botEnabled && draft.botHandoffEnabled && !profileNumberDraftValid(draft.botHandoffIdleSeconds, 30, 86_400)) {
    issues.handoff = "Idle seconds must be between 30 and 86400.";
  }
  if (!validateProfileEnvRows(draft.envRows)) {
    issues.env = "Environment variable rows need valid keys.";
  }
  return issues;
}

function profileNumberDraftValid(value: string, min: number, max: number): boolean {
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) && numeric >= min && numeric <= max;
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
  const requiredFieldLabel = t("Required");
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
          <Tooltip
            content={botScopeHint}
            contentClassName="w-[260px] max-w-[calc(100vw-64px)] whitespace-normal px-2 py-1.5 text-left font-medium leading-4 sm:w-[280px]"
            side="bottom"
          >
            <button
              aria-label={botScopeHint}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
              type="button"
            >
              <Info
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              />
            </button>
          </Tooltip>
        </span>
        <Toggle checked={draft.botEnabled} onChange={updateEnabled} />
      </div>
      {draft.botEnabled ? (
        <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
          <Field label={t("Select bot")} requirement="required" requirementLabel={requiredFieldLabel}>
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
                    <Field label={t("Idle seconds")} requirement="required" requirementLabel={requiredFieldLabel}>
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
          <AddProfileForm
            botConfigs={botConfigs}
            draft={draft}
            error={error}
            mode={mode}
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
