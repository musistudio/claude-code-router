import {
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  GitBranch,
  Globe2,
  Puzzle,
  Terminal as TerminalIcon,
  type LucideIcon
} from "lucide-react";
import { lazy, Suspense, useMemo, type ComponentType } from "react";
import { useI18n, type TFunction, type TranslationKey } from "@/lib/i18n";
import type { AgentConsolePluginRightSidebarPanel } from "../../../shared/plugin-types";
import type { SidebarProject, SidebarThread } from "../../../shared/sidebar-data";
import type { AgentProviderOption, ChatAgentApprovalMode, ChatAgentEffort } from "./utils/core";
import { BrowserPanel } from "./plugins/browser";
import { FilesPanel } from "./plugins/files";
import { GitPanel } from "./plugins/git";
import { TerminalPanel } from "./plugins/terminal";

export type RightSidebarPluginId = string;

export type RightSidebarPluginPanelProps = {
  agentContext?: RightSidebarAgentContext;
  nativeViewOccluded?: boolean;
  onSelectThread?: (threadId: string) => void;
  onThreadsChanged?: () => void | Promise<void>;
};

export type RightSidebarAgentContext = {
  activeModel: string;
  agentApprovalMode: ChatAgentApprovalMode;
  agentEffort: ChatAgentEffort;
  agentProviderId: string;
  agentProviders: AgentProviderOption[];
  project: SidebarProject | null;
  selectedThread: SidebarThread | null;
};

export type RightSidebarPlugin = {
  component: ComponentType<RightSidebarPluginPanelProps>;
  icon: LucideIcon;
  id: RightSidebarPluginId;
  label: string;
  title: string;
};

type RightSidebarPluginDefinition = Omit<RightSidebarPlugin, "label" | "title"> & {
  labelKey: TranslationKey;
  titleKey: TranslationKey;
};

const LazyFileEditorPanel = lazy(() => import("./plugins/editor/index.js").then((module) => ({ default: module.FileEditorPanel })));
const LazyDocsPanel = lazy(() => import("./plugins/docs/index.js").then((module) => ({ default: module.DocsPanel })));

function FileEditorPanelLoader(props: RightSidebarPluginPanelProps) {
  const { t } = useI18n();
  return (
    <Suspense fallback={<div className="grid h-full min-h-[260px] w-full place-items-center text-[12px] text-muted-foreground">{t("fileTree.loadingEditor")}</div>}>
      <LazyFileEditorPanel {...props} />
    </Suspense>
  );
}

function DocsPanelLoader(props: RightSidebarPluginPanelProps) {
  const { t } = useI18n();
  return (
    <Suspense fallback={<div className="grid h-full min-h-[260px] w-full place-items-center text-[12px] text-muted-foreground">{t("docs.loading")}</div>}>
      <LazyDocsPanel {...props} />
    </Suspense>
  );
}

const rightSidebarPluginDefinitions: RightSidebarPluginDefinition[] = [
  { id: "files", labelKey: "rightSidebar.files.label", titleKey: "rightSidebar.files.title", icon: FolderTree, component: FilesPanel },
  { id: "docs", labelKey: "rightSidebar.docs.label", titleKey: "rightSidebar.docs.title", icon: FileText, component: DocsPanelLoader },
  { id: "editor", labelKey: "rightSidebar.editor.label", titleKey: "rightSidebar.editor.title", icon: FileCode2, component: FileEditorPanelLoader },
  { id: "git", labelKey: "rightSidebar.git.label", titleKey: "rightSidebar.git.title", icon: GitBranch, component: GitPanel },
  { id: "browser", labelKey: "rightSidebar.browser.label", titleKey: "rightSidebar.browser.title", icon: Globe2, component: BrowserPanel },
  { id: "terminal", labelKey: "rightSidebar.terminal.label", titleKey: "rightSidebar.terminal.title", icon: TerminalIcon, component: TerminalPanel }
];

const rightSidebarIconRegistry = {
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  GitBranch,
  Globe2,
  Puzzle,
  Terminal: TerminalIcon
} satisfies Record<string, LucideIcon>;

export const rightSidebarPlugins: RightSidebarPlugin[] = rightSidebarPluginDefinitions.map((plugin) => ({
  component: plugin.component,
  icon: plugin.icon,
  id: plugin.id,
  label: plugin.id,
  title: plugin.id
}));

export const defaultRightSidebarPluginId: RightSidebarPluginId = "files";

export function useRightSidebarPlugins(pluginPanels: AgentConsolePluginRightSidebarPanel[] = []) {
  const { t } = useI18n();
  return useMemo(
    () => [...localizeRightSidebarPlugins(t), ...pluginPanels.map(createPluginRightSidebarPlugin)],
    [pluginPanels, t]
  );
}

export function getRightSidebarPlugin(pluginId: RightSidebarPluginId, plugins: RightSidebarPlugin[] = rightSidebarPlugins) {
  return plugins.find((plugin) => plugin.id === pluginId) ?? plugins[0];
}

function localizeRightSidebarPlugins(t: TFunction): RightSidebarPlugin[] {
  return rightSidebarPluginDefinitions.map((plugin) => ({
    component: plugin.component,
    icon: plugin.icon,
    id: plugin.id,
    label: t(plugin.labelKey),
    title: t(plugin.titleKey)
  }));
}

function createPluginRightSidebarPlugin(panel: AgentConsolePluginRightSidebarPanel): RightSidebarPlugin {
  const PluginPanel = (props: RightSidebarPluginPanelProps) => (
    <PluginIframePanel nativeViewOccluded={props.nativeViewOccluded} panel={panel} />
  );
  PluginPanel.displayName = "PluginRightSidebarPanel(" + panel.id + ")";

  return {
    component: PluginPanel,
    icon: resolveRightSidebarIcon(panel.icon),
    id: panel.id,
    label: panel.label,
    title: panel.title
  };
}

function resolveRightSidebarIcon(iconName: string | undefined): LucideIcon {
  if (iconName && Object.prototype.hasOwnProperty.call(rightSidebarIconRegistry, iconName)) {
    return rightSidebarIconRegistry[iconName as keyof typeof rightSidebarIconRegistry];
  }
  return Puzzle;
}

function PluginIframePanel({
  nativeViewOccluded,
  panel
}: RightSidebarPluginPanelProps & {
  panel: AgentConsolePluginRightSidebarPanel;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <iframe
        className="h-full w-full border-0 bg-background"
        sandbox="allow-forms allow-modals allow-popups allow-scripts"
        src={panel.entryUrl}
        title={panel.title}
      />
      {nativeViewOccluded ? <div className="pointer-events-none absolute inset-0 bg-transparent" /> : null}
    </div>
  );
}
