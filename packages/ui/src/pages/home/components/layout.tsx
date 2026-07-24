import type { ComponentProps } from "react";
import { MorphIcon } from "@musistudio/lucide-morph-react";
import { collapseSidebarToExpandInspectorMorph } from "@/lib/morph-icon";
import {
  AnimatePresence, AppConfig, AppCopy, Button, Check, CircleAlert, cn, EndpointTitleBar,
  AppUpdateStatus, GatewayStatus, listSpringTransition, LucideIcon, motion, motionEase,
  LoaderCircle, NavigationId, RefreshCw,
  reducedMotionTransition, ServiceControlButton, Settings, ViewId,
  useAppText, ViewMotionShell, viewUsesInternalScroll
} from "../shared/index";
import { ApiKeysView } from "./api-keys";
import { AgentAnalysisView, OverviewView } from "./dashboard";
import { ExtensionsView } from "./extensions";
import { LogsView, NetworkingView } from "./network-logs";
import { OnboardingView } from "./onboarding";
import { ProfileView } from "./profiles";
import { ModelsView, ProvidersView } from "./providers";
import { RoutingView } from "./routing";
import { VirtualModelsView } from "./virtual-models";

export type MainNavigationItem = {
  icon: LucideIcon;
  id: NavigationId;
};

export type SidebarNavigationGroup = {
  id: "advanced" | "monitor" | "setup" | "workspace";
  items: MainNavigationItem[];
  label: string;
};

const sidebarNavigationGroupDefinitions: Array<{
  id: SidebarNavigationGroup["id"];
  itemIds: NavigationId[];
  label: string;
}> = [
  { id: "workspace", itemIds: ["overview"], label: "Workspace" },
  { id: "setup", itemIds: ["providers", "profile", "routing"], label: "Setup" },
  { id: "monitor", itemIds: ["logs", "observability"], label: "Monitor" },
  { id: "advanced", itemIds: ["virtual-models", "models", "api-keys", "extensions"], label: "Advanced" }
];

export function groupSidebarNavigation(visibleNavigation: MainNavigationItem[]): SidebarNavigationGroup[] {
  const navigationById = new Map(visibleNavigation.map((item) => [item.id, item]));
  return sidebarNavigationGroupDefinitions
    .map((group) => ({
      id: group.id,
      items: group.itemIds
        .map((id) => navigationById.get(id))
        .filter((item): item is MainNavigationItem => Boolean(item)),
      label: group.label
    }))
    .filter((group) => group.items.length > 0);
}

type MainViewProps = {
  apiKeys: ComponentProps<typeof ApiKeysView>;
  extensions: ComponentProps<typeof ExtensionsView>;
  logs: ComponentProps<typeof LogsView>;
  models: ComponentProps<typeof ModelsView>;
  networking: ComponentProps<typeof NetworkingView>;
  observability: ComponentProps<typeof AgentAnalysisView>;
  overview: ComponentProps<typeof OverviewView>;
  profile: ComponentProps<typeof ProfileView>;
  providers: ComponentProps<typeof ProvidersView>;
  routing: ComponentProps<typeof RoutingView>;
  virtualModels: ComponentProps<typeof VirtualModelsView>;
};

export function OnboardingLayout({
  gatewayStartupError,
  loaded,
  onboarding
}: {
  gatewayStartupError?: string;
  loaded: boolean;
  onboarding: ComponentProps<typeof OnboardingView>;
}) {
  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      <div className="app-drag absolute inset-x-0 top-0 z-10 h-10" />
      <div className="pointer-events-none absolute inset-x-0 top-12 z-30 px-5 max-[720px]:top-10 max-[720px]:px-3">
        <GatewayStartupErrorBanner className="pointer-events-auto mx-auto max-w-2xl shadow-lg" message={gatewayStartupError} />
      </div>
      {loaded ? <OnboardingView {...onboarding} /> : null}
    </main>
  );
}

export function MainLayout({
  activeView,
  compactLayout,
  config,
  copy,
  gatewayActionBusy,
  gatewayEndpoint,
  gatewayStartupError,
  gatewayStatus,
  gatewayTargetActive,
  isMac,
  needsTrafficLightSafeArea,
  agentAnalysisEnabled,
  networkCaptureEnabled,
  onOpenUpdate,
  onOpenServerSettings,
  onOpenSettings,
  onSelectNavigationItem,
  onToggleSidebar,
  shouldReduceMotion,
  sidebarOpen,
  toggleGatewayService,
  updateActionBusy,
  updateStatus,
  viewProps,
  requestLogsEnabled,
  visibleNavigation
}: {
  activeView: ViewId;
  agentAnalysisEnabled: boolean;
  compactLayout: boolean;
  config: AppConfig;
  copy: AppCopy;
  gatewayActionBusy: boolean;
  gatewayEndpoint: string;
  gatewayStartupError?: string;
  gatewayStatus: GatewayStatus;
  gatewayTargetActive?: boolean;
  isMac: boolean;
  needsTrafficLightSafeArea: boolean;
  networkCaptureEnabled: boolean;
  onOpenUpdate: () => void;
  onOpenServerSettings: () => void;
  onOpenSettings: () => void;
  onSelectNavigationItem: (id: NavigationId) => void;
  onToggleSidebar: () => void;
  shouldReduceMotion: boolean | null;
  sidebarOpen: boolean;
  toggleGatewayService: () => void;
  updateActionBusy: boolean;
  updateStatus: AppUpdateStatus;
  viewProps: MainViewProps;
  requestLogsEnabled: boolean;
  visibleNavigation: MainNavigationItem[];
}) {
  const showUpdateButton = updateStatus.supported;
  const windowControlSafeAreaWidth = showUpdateButton
    ? (isMac ? 188 : 124)
    : (isMac ? 152 : 88);
  const navigationGroups = groupSidebarNavigation(visibleNavigation);

  return (
    <>
      <div className={cn(
        "app-no-drag app-window-controls pointer-events-auto absolute top-2 z-[90] flex items-center",
        isMac ? "left-[84px] gap-0.5" : "left-3 gap-1"
      )}>
        <Button
          aria-controls="primary-sidebar"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? copy.sidebar.collapse : copy.sidebar.expand}
          className="app-sidebar-toggle inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onToggleSidebar}
          title={sidebarOpen ? copy.sidebar.collapse : copy.sidebar.expand}
          type="button"
          unstyled
        >
          <MorphIcon
            active={!sidebarOpen}
            asset={collapseSidebarToExpandInspectorMorph}
            color="currentColor"
            duration={300}
            size={16}
            strokeWidth={2}
          />
        </Button>
        <ServiceControlButton
          busy={gatewayActionBusy}
          onClick={toggleGatewayService}
          state={gatewayStatus.state}
          targetActive={gatewayTargetActive}
        />
        {showUpdateButton ? (
          <UpdateEntryButton
            actionBusy={updateActionBusy}
            copy={copy}
            onOpen={onOpenUpdate}
            status={updateStatus}
          />
        ) : null}
      </div>

      <motion.aside
        animate={{
          width: sidebarOpen ? (compactLayout ? "100%" : 248) : 0
        }}
        aria-hidden={!sidebarOpen}
        className={cn(
          "app-sidebar flex shrink-0 flex-col overflow-hidden bg-sidebar/95 max-[720px]:h-auto",
          sidebarOpen && compactLayout && "border-b border-border"
        )}
        id="primary-sidebar"
        initial={false}
        style={{ pointerEvents: sidebarOpen ? "auto" : "none" }}
        transition={shouldReduceMotion ? reducedMotionTransition : { duration: 0.3, ease: motionEase }}
      >
        <AnimatePresence initial={false}>
          {sidebarOpen ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="flex min-h-0 w-[248px] flex-1 flex-col max-[720px]:w-full"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={shouldReduceMotion ? reducedMotionTransition : { duration: 0.3, ease: motionEase }}
            >
            <div className="flex h-14 shrink-0 max-[720px]:h-12">
              <div className="app-no-drag shrink-0" style={{ width: windowControlSafeAreaWidth }} />
              <div className="app-drag min-w-0 flex-1" />
            </div>

            <nav className="flex min-h-0 flex-1 flex-col gap-4 px-2 py-3 max-[720px]:flex-none max-[720px]:flex-row max-[720px]:gap-1 max-[720px]:overflow-x-auto max-[720px]:py-2" aria-label={copy.sidebar.primaryNavigation}>
              {navigationGroups.map((group) => (
                <div className="grid min-w-0 gap-1 max-[720px]:contents" key={group.id}>
                  <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/65 max-[720px]:hidden">
                    {copy.text[group.label] ?? group.label}
                  </div>
                  <div className="grid min-w-0 gap-1 max-[720px]:contents">
                    {group.items.map((item) => (
                      <SidebarNavigationButton
                        active={activeView === item.id}
                        item={item}
                        key={item.id}
                        label={copy.navigation[item.id]}
                        onClick={() => onSelectNavigationItem(item.id)}
                        shouldReduceMotion={shouldReduceMotion}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="grid shrink-0 gap-1 border-t border-border/60 p-2 max-[720px]:border-t max-[720px]:pt-2">
              <Button
                className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] font-medium text-muted-foreground transition-all duration-150 hover:bg-muted/80 hover:text-foreground"
                onClick={onOpenSettings}
                title={copy.settings.title}
                type="button"
                unstyled
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
                  <Settings className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate">{copy.settings.button}</span>
              </Button>
            </div>

            <div className="h-3 shrink-0 max-[720px]:hidden" />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={cn(
            "app-drag relative flex h-12 shrink-0 items-center bg-background/95 px-5 max-[720px]:h-auto max-[720px]:px-3 max-[720px]:py-2",
            needsTrafficLightSafeArea && "pl-[116px] max-[720px]:pl-[116px]"
          )}
        >
          {needsTrafficLightSafeArea || !sidebarOpen ? (
            <div className="app-no-drag absolute left-0 top-0 h-full" style={{ width: windowControlSafeAreaWidth }} />
          ) : null}
          <EndpointTitleBar
            config={config}
            endpoint={gatewayEndpoint}
            gatewayStatus={gatewayStatus}
          />
        </div>
        <GatewayStartupErrorBanner
          className="mx-5 mt-3 max-[720px]:mx-3"
          message={gatewayStartupError}
          onOpenServerSettings={onOpenServerSettings}
        />
        <div
          className={cn(
            "min-h-0 flex-1 px-5 pb-5 pt-5 max-[720px]:px-3 max-[720px]:pb-3 max-[720px]:pt-3",
            viewUsesInternalScroll(activeView) ? "overflow-hidden" : "overflow-auto"
          )}
        >
          <MainViewSwitch
            activeView={activeView}
            agentAnalysisEnabled={agentAnalysisEnabled}
            networkCaptureEnabled={networkCaptureEnabled}
            viewProps={viewProps}
          />
        </div>
      </main>
    </>
  );
}

function SidebarNavigationButton({
  active,
  item,
  label,
  onClick,
  shouldReduceMotion
}: {
  active: boolean;
  item: MainNavigationItem;
  label: string;
  onClick: () => void;
  shouldReduceMotion: boolean | null;
}) {
  return (
    <Button
      className={cn(
        "flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] font-medium text-muted-foreground transition-all duration-150 max-[720px]:min-w-[118px]",
        active
          ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
          : "hover:bg-muted/80 hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
      unstyled
    >
      <motion.span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
          active && "bg-primary/10 text-primary"
        )}
        layout="position"
        transition={shouldReduceMotion ? reducedMotionTransition : listSpringTransition}
      >
        <item.icon className="h-3.5 w-3.5" />
      </motion.span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Button>
  );
}

export function UpdateEntryButton({
  actionBusy,
  copy,
  onOpen,
  status
}: {
  actionBusy: boolean;
  copy: AppCopy;
  onOpen: () => void;
  status: AppUpdateStatus;
}) {
  const busy = actionBusy || status.state === "checking" || status.state === "downloading" || status.state === "installing";
  const label = status.state === "downloaded"
    ? copy.text["Update ready to install"] ?? "Update ready to install"
    : status.state === "downloading"
      ? copy.text["Downloading update"] ?? "Downloading update"
      : status.state === "checking"
        ? copy.text["Checking for updates"] ?? "Checking for updates"
        : status.state === "available"
          ? copy.text["Update available"] ?? "Update available"
          : copy.text["Online updates"] ?? "Online updates";

  return (
    <Button
      aria-label={label}
      className="app-no-drag relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-primary outline-none transition-colors hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/25"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onOpen}
      title={label}
      type="button"
      unstyled
    >
      {busy ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : status.state === "downloaded" ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      {status.state === "available" ? (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 ring-2 ring-background"
          data-update-available-indicator
        />
      ) : null}
    </Button>
  );
}

export function GatewayStartupErrorBanner({
  className,
  message,
  onOpenServerSettings
}: {
  className?: string;
  message?: string;
  onOpenServerSettings?: () => void;
}) {
  const t = useAppText();
  const detail = message?.trim();
  if (!detail) {
    return null;
  }

  return (
    <div
      aria-live="assertive"
      className={cn(
        "app-no-drag flex min-w-0 items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive",
        className
      )}
      role="alert"
    >
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{t("Service failed to start")}</div>
        <div className="mt-0.5 whitespace-pre-wrap break-words">{detail}</div>
      </div>
      {onOpenServerSettings ? (
        <Button
          className="shrink-0 border-destructive/30 bg-background/80 text-destructive hover:bg-destructive/10"
          onClick={onOpenServerSettings}
          size="sm"
          type="button"
          variant="outline"
        >
          <Settings className="h-3.5 w-3.5" />
          {t("Server")}
        </Button>
      ) : null}
    </div>
  );
}

function MainViewSwitch({
  activeView,
  agentAnalysisEnabled,
  networkCaptureEnabled,
  viewProps
}: {
  activeView: ViewId;
  agentAnalysisEnabled: boolean;
  networkCaptureEnabled: boolean;
  viewProps: MainViewProps;
}) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <ViewMotionShell key={activeView} view={activeView}>
        {activeView === "overview" ? <OverviewView {...viewProps.overview} /> : null}
        {activeView === "observability" && agentAnalysisEnabled ? <AgentAnalysisView {...viewProps.observability} /> : null}
        {activeView === "api-keys" ? <ApiKeysView {...viewProps.apiKeys} /> : null}
        {activeView === "profile" ? <ProfileView {...viewProps.profile} /> : null}
        {activeView === "networking" && networkCaptureEnabled ? <NetworkingView {...viewProps.networking} /> : null}
        {activeView === "logs" ? <LogsView {...viewProps.logs} /> : null}
        {activeView === "providers" ? <ProvidersView {...viewProps.providers} /> : null}
        {activeView === "models" ? <ModelsView {...viewProps.models} /> : null}
        {activeView === "routing" ? <RoutingView {...viewProps.routing} /> : null}
        {activeView === "virtual-models" ? <VirtualModelsView {...viewProps.virtualModels} /> : null}
        {activeView === "extensions" ? <ExtensionsView {...viewProps.extensions} /> : null}
      </ViewMotionShell>
    </AnimatePresence>
  );
}
