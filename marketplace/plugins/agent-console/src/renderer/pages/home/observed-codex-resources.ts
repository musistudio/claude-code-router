export type ObservedCodexFeature =
  | "app-shell"
  | "thread"
  | "composer"
  | "command"
  | "plugins"
  | "automations"
  | "mcp"
  | "settings"
  | "browser"
  | "diff-files"
  | "terminal"
  | "remote"
  | "worktrees"
  | "profile"
  | "usage";

export type ObservedCodexResource = {
  feature: ObservedCodexFeature;
  chunks: string[];
  reconstructedSources: string[];
  implementationNotes: string[];
};

export const observedCodexResources: ObservedCodexResource[] = [
  {
    feature: "app-shell",
    chunks: [
      "app-shell-DnmC_oyn.js",
      "app-shell-state-SfLRxSEg.js",
      "app-shell-tab-controller-BpCuB_Nz.js",
      "thread-app-shell-chrome-D6sTw290.js"
    ],
    reconstructedSources: ["ShellLayout", "SidebarNav", "TopBar", "RightPanelDock", "AppShellState"],
    implementationNotes: [
      "46px toolbar with draggable titlebar region",
      "Fixed app shell; inner content and sidebar lists scroll independently",
      "Right panel is docked only for thread and new-thread surfaces"
    ]
  },
  {
    feature: "thread",
    chunks: [
      "thread-scroll-layout-DttpRt0e.js",
      "thread-side-panel-tabs-BL2fcy4d.js",
      "thread-actions-CPBpck3D.js",
      "thread-context-qjluNZCo.js"
    ],
    reconstructedSources: ["ThreadSurface", "MessageCard", "ToolRunRow", "ContextDrawer", "AgentControlStrip"],
    implementationNotes: [
      "Conversation, tool output and workspace state remain tied to a selected thread",
      "Context and approvals open as overlays rather than full navigation"
    ]
  },
  {
    feature: "composer",
    chunks: [
      "composer-EYkAbDY0.js",
      "composer-D295bLTI.css",
      "composer-footer-branch-switcher-DzuP91Hw.js",
      "composer-view-state-BrB9cHZx.js"
    ],
    reconstructedSources: ["Composer", "ModeControls", "ComposerContextBar", "HeaderSelect"],
    implementationNotes: [
      "Model, reasoning, approval and sandbox state are visible near the prompt",
      "Context, mention, command and image actions stay in the composer footer"
    ]
  },
  {
    feature: "command",
    chunks: ["command-keybindings-B9IgRGSI.js", "anchored-autocomplete-overlay-Caas7CK-.js"],
    reconstructedSources: ["CommandPalette", "CommandSearchInput", "CommandResultRow"],
    implementationNotes: ["Command palette uses animated overlay and Escape/Command-K keyboard handling"]
  },
  {
    feature: "plugins",
    chunks: [
      "plugins-page-D2hN-W-s.js",
      "plugin-detail-page-txpGRO8P.js",
      "plugin-uninstall-dialog-CUpFQrJ_.js",
      "plugins-settings-DOvcDXMe.js"
    ],
    reconstructedSources: ["PluginsSurface", "PluginStatusBadge", "PluginActionRow"],
    implementationNotes: ["Plugins render as dense rows with type, status and install/configure actions"]
  },
  {
    feature: "automations",
    chunks: [
      "automations-page-DeVwcIsN.js",
      "automation-dialog-CbmgxqsD.js",
      "automation-schedule-wEVXO_Fw.js",
      "automation-shared-CZbAgKsK.js"
    ],
    reconstructedSources: ["AutomationsSurface", "AutomationRows", "AutomationCreatePanel"],
    implementationNotes: ["Heartbeat and cron automations share a row list with a right-side creation panel"]
  },
  {
    feature: "mcp",
    chunks: [
      "mcp-settings-W1KvN4n5.js",
      "mcp-capability-view-page-6qwT0U1e.js",
      "mcp-app-resource-content-QbM48kY7.js"
    ],
    reconstructedSources: ["McpSurface", "McpStatusBadge", "McpCapabilityRow"],
    implementationNotes: ["MCP servers expose transport, connection state, tools and resources in one list"]
  },
  {
    feature: "settings",
    chunks: [
      "settings-page-DQKw-JsA.js",
      "settings-row-D-T3_hWW.js",
      "settings-content-layout-B4F7ZmxE.js",
      "settings-group-BXAVZ8Oc.js"
    ],
    reconstructedSources: ["SettingsSurface", "SettingsSectionNav", "SettingsRow", "Field"],
    implementationNotes: ["Settings use a two-column shell with section nav and row-based controls"]
  },
  {
    feature: "browser",
    chunks: [
      "browser-sidebar-manager-DjV9_67c.js",
      "browser-sidebar-state-k_iKyVMa.js",
      "browser-use-settings-C_iIpbpC.js"
    ],
    reconstructedSources: ["BrowserPanel", "BrowserPreview", "BrowserPermissionState"],
    implementationNotes: ["Browser state is surfaced as a thread side-panel tab"]
  },
  {
    feature: "diff-files",
    chunks: [
      "diff-unified-CQyosSrm.js",
      "file-diff-DOe5AmOw.js",
      "file-tree-search-input-BAwk78tU.js",
      "file-preview-page-BR_eo2-k.js"
    ],
    reconstructedSources: ["FilesPanel", "DiffPanel", "FileTreeRow", "UnifiedDiffPreview"],
    implementationNotes: ["Files and diff views share the docked thread side-panel"]
  },
  {
    feature: "terminal",
    chunks: ["terminal-service-Bp-7B5CU.js", "terminal-CNbIwMET.js"],
    reconstructedSources: ["TerminalPanel", "TerminalOutput"],
    implementationNotes: ["Terminal output is kept in a scoped tab rather than a global page"]
  },
  {
    feature: "remote",
    chunks: ["remote-connections-settings-DMpWAJwQ.js", "remote-conversation-page-4tAjlczP.js", "remote-projects-T90XwaVV.js"],
    reconstructedSources: ["RemoteSurface", "RemoteConnectionRows"],
    implementationNotes: ["Remote hosts show auth status, projects and terminal/project actions"]
  },
  {
    feature: "worktrees",
    chunks: ["worktrees-settings-page-Ds6IBlIn.js", "worktree-environment-dropdown-CrFwFvXb.js", "worktree-init-v2-page-CFoZNrH6.js"],
    reconstructedSources: ["WorktreesSurface", "WorktreeRows", "LocalEnvironmentSteps"],
    implementationNotes: ["Worktrees are represented as rows with base branch, status and environment setup"]
  },
  {
    feature: "profile",
    chunks: ["profile-dropdown-DmkmXrXH.js", "profile-Bfsx8nDw.js", "profile-visibility-wrzvr3Ea.js"],
    reconstructedSources: ["ProfileSurface", "ProfileActions"],
    implementationNotes: ["Profile state lives in the sidebar footer and a dedicated settings-like surface"]
  },
  {
    feature: "usage",
    chunks: ["usage-settings-CUIV6Ufk.js"],
    reconstructedSources: ["UsageSurface", "UsageMetric", "UsageRows"],
    implementationNotes: ["Usage page uses compact metrics above a row table"]
  }
];

export const observedCodexDesignTokens = [
  "--height-toolbar: 46px",
  "--height-toolbar-sm: 36px",
  "--height-toolbar-pane: 40px",
  "--spacing-token-sidebar: clamp(240px, 300px, min(520px, calc(100vw - 320px)))",
  "--radius-md-base: .5rem",
  "--radius-lg-base: .625rem",
  "--cubic-enter: cubic-bezier(.19, 1, .22, 1)",
  "--cubic-exit-snappy: cubic-bezier(.65, 0, .4, 1)",
  "--transition-duration-basic: .15s",
  "--transition-duration-relaxed: .3s",
  "--thread-content-max-width: none"
];

export function observedModuleSummary() {
  return observedCodexResources
    .map((resource) => `${resource.feature}: ${resource.reconstructedSources.join(", ")}`)
    .join("; ");
}
