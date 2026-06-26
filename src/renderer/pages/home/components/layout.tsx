import type { ComponentProps } from "react";
import {
  AnimatedIconSwap, AnimatePresence, AppConfig, AppCopy, Button, cn, EndpointTitleBar,
  GatewayStatus, listSpringTransition, LucideIcon, motion, motionEase,
  NavigationId, PanelLeftClose, PanelLeftOpen,
  reducedMotionTransition, ServiceControlButton, Settings, ViewId,
  ViewMotionShell, viewUsesInternalScroll
} from "../shared";
import { ApiKeysView } from "./api-keys";
import { AgentAnalysisView, OverviewView } from "./dashboard";
import { ExtensionsView } from "./extensions";
import { LogsView, NetworkingView } from "./network-logs";
import { OnboardingView } from "./onboarding";
import { ProfileView } from "./profiles";
import { ModelsView, ProvidersView } from "./providers";
import { RoutingView } from "./routing";
import { ServerView } from "./server";
import { VirtualModelsView } from "./virtual-models";

type MainNavigationItem = {
  icon: LucideIcon;
  id: NavigationId;
};

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
  server: ComponentProps<typeof ServerView>;
  virtualModels: ComponentProps<typeof VirtualModelsView>;
};

export function OnboardingLayout({
  loaded,
  onboarding
}: {
  loaded: boolean;
  onboarding: ComponentProps<typeof OnboardingView>;
}) {
  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      <div className="app-drag absolute inset-x-0 top-0 z-10 h-10" />
      {loaded ? <OnboardingView {...onboarding} /> : null}
    </main>
  );
}

export function MainLayout({
  activeView,
  compactLayout,
  copy,
  gatewayActionBusy,
  gatewayEndpoint,
  gatewayStatus,
  isMac,
  needsTrafficLightSafeArea,
  agentAnalysisEnabled,
  networkCaptureEnabled,
  onOpenSettings,
  onSelectNavigationItem,
  onToggleSidebar,
  shouldReduceMotion,
  sidebarOpen,
  toggleGatewayService,
  viewProps,
  requestLogsEnabled,
  visibleNavigation
}: {
  activeView: ViewId;
  agentAnalysisEnabled: boolean;
  compactLayout: boolean;
  copy: AppCopy;
  gatewayActionBusy: boolean;
  gatewayEndpoint: string;
  gatewayStatus: GatewayStatus;
  isMac: boolean;
  needsTrafficLightSafeArea: boolean;
  networkCaptureEnabled: boolean;
  onOpenSettings: () => void;
  onSelectNavigationItem: (id: NavigationId) => void;
  onToggleSidebar: () => void;
  shouldReduceMotion: boolean | null;
  sidebarOpen: boolean;
  toggleGatewayService: () => void;
  viewProps: MainViewProps;
  requestLogsEnabled: boolean;
  visibleNavigation: MainNavigationItem[];
}) {
  const windowControlSafeAreaWidth = isMac ? 152 : 88;

  return (
    <>
      <div className={cn("app-no-drag app-window-controls pointer-events-auto absolute top-2 z-[90] flex items-center gap-1", isMac ? "left-[76px]" : "left-3")}>
        <Button
          aria-controls="primary-sidebar"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? copy.sidebar.collapse : copy.sidebar.expand}
          className="app-sidebar-toggle inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onToggleSidebar}
          title={sidebarOpen ? copy.sidebar.collapse : copy.sidebar.expand}
          type="button"
          unstyled
        >
          <AnimatedIconSwap iconKey={sidebarOpen ? "close" : "open"}>
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </AnimatedIconSwap>
        </Button>
        <ServiceControlButton
          busy={gatewayActionBusy}
          onClick={toggleGatewayService}
          state={gatewayStatus.state}
        />
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
        transition={shouldReduceMotion ? reducedMotionTransition : { damping: 35, mass: 0.78, stiffness: 430, type: "spring" }}
      >
        {sidebarOpen ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="flex min-h-0 w-[248px] flex-1 flex-col max-[720px]:w-full"
            initial={{ opacity: 0 }}
            transition={shouldReduceMotion ? reducedMotionTransition : { duration: 0.14, ease: motionEase }}
          >
            <div className="flex h-14 shrink-0 max-[720px]:h-12">
              <div className="app-no-drag shrink-0" style={{ width: windowControlSafeAreaWidth }} />
              <div className="app-drag min-w-0 flex-1" />
            </div>

            <nav className="flex min-h-0 flex-1 flex-col gap-1 px-2 py-3 max-[720px]:flex-none max-[720px]:flex-row max-[720px]:overflow-x-auto max-[720px]:py-2" aria-label={copy.sidebar.primaryNavigation}>
              {visibleNavigation.map((item) => (
                <Button
                  className={cn(
                    "flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] font-medium text-muted-foreground transition-all duration-150 max-[720px]:min-w-[118px]",
                    activeView === item.id
                      ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                      : "hover:bg-muted/80 hover:text-foreground"
                  )}
                  key={item.id}
                  onClick={() => onSelectNavigationItem(item.id)}
                  type="button"
                  unstyled
                >
                  <motion.span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
                      activeView === item.id && "bg-primary/10 text-primary"
                    )}
                    layout="position"
                    transition={shouldReduceMotion ? reducedMotionTransition : listSpringTransition}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                  </motion.span>
                  <span className="min-w-0 flex-1 truncate">{copy.navigation[item.id]}</span>
                </Button>
              ))}
            </nav>

            <div className="shrink-0 border-t border-border/60 p-2 max-[720px]:border-t max-[720px]:pt-2">
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
            config={viewProps.server.config as AppConfig}
            endpoint={gatewayEndpoint}
            gatewayStatus={gatewayStatus}
          />
        </div>
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
            requestLogsEnabled={requestLogsEnabled}
            viewProps={viewProps}
          />
        </div>
      </main>
    </>
  );
}

function MainViewSwitch({
  activeView,
  agentAnalysisEnabled,
  networkCaptureEnabled,
  requestLogsEnabled,
  viewProps
}: {
  activeView: ViewId;
  agentAnalysisEnabled: boolean;
  networkCaptureEnabled: boolean;
  requestLogsEnabled: boolean;
  viewProps: MainViewProps;
}) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <ViewMotionShell key={activeView} view={activeView}>
        {activeView === "overview" ? <OverviewView {...viewProps.overview} /> : null}
        {activeView === "observability" && agentAnalysisEnabled ? <AgentAnalysisView {...viewProps.observability} /> : null}
        {activeView === "api-keys" ? <ApiKeysView {...viewProps.apiKeys} /> : null}
        {activeView === "server" ? <ServerView {...viewProps.server} /> : null}
        {activeView === "profile" ? <ProfileView {...viewProps.profile} /> : null}
        {activeView === "networking" && networkCaptureEnabled ? <NetworkingView {...viewProps.networking} /> : null}
        {activeView === "logs" && requestLogsEnabled ? <LogsView {...viewProps.logs} /> : null}
        {activeView === "providers" ? <ProvidersView {...viewProps.providers} /> : null}
        {activeView === "models" ? <ModelsView {...viewProps.models} /> : null}
        {activeView === "routing" ? <RoutingView {...viewProps.routing} /> : null}
        {activeView === "virtual-models" ? <VirtualModelsView {...viewProps.virtualModels} /> : null}
        {activeView === "extensions" ? <ExtensionsView {...viewProps.extensions} /> : null}
      </ViewMotionShell>
    </AnimatePresence>
  );
}
