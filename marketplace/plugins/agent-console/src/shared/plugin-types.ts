export type AgentMcpServerTransport = "http" | "sse" | "stdio";
export type AgentMcpServerConnectionType = "direct" | "proxy";

export type AgentMcpServerAuthentication =
  | { type: "api-key"; headerName: string; value: string }
  | { type: "basic"; password: string; username: string }
  | { type: "bearer"; token: string }
  | { type: "none" };

export type AgentMcpServerConfig = {
  alwaysLoad?: boolean;
  args?: string[];
  authentication?: AgentMcpServerAuthentication;
  command?: string;
  connectionType?: AgentMcpServerConnectionType;
  defaultToolsApprovalMode?: "auto" | "approve" | "prompt";
  description?: string;
  disabledTools?: string[];
  enabledTools?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  startupTimeoutSec?: number;
  supportsParallelToolCalls?: boolean;
  toolTimeoutSec?: number;
  type?: AgentMcpServerTransport;
  url?: string;
};

export type AgentMcpServerMap = Record<string, AgentMcpServerConfig>;

export type PluginThemeStyle = Record<string, number | string>;

export type AgentConsolePluginLifecycleState =
  | "discovered"
  | "installed_disabled"
  | "enabled"
  | "disabled"
  | "quarantined"
  | "removed";

export type AgentConsolePluginSourceType = "bundled" | "claude" | "codex" | "development" | "marketplace" | "user";

export type AgentConsolePluginPermission = {
  constraintDigest?: string;
  constraintLabel?: string;
  id: string;
  reason?: string;
  risk?: "high" | "low" | "medium";
};

export type AgentConsolePluginGrant = {
  constraintDigest?: string;
  grantedAt: number;
  id: string;
};

export type AgentConsolePluginSignatureStatus = {
  actualDigest?: string;
  algorithm?: string;
  expectedDigest?: string;
  message?: string;
  status: "invalid" | "unsigned" | "valid";
};

export type PluginThemeSectionConfig = {
  className?: string;
  connectedIcon?: string;
  descriptionClassName?: string;
  descriptionStyle?: PluginThemeStyle;
  icon?: string;
  iconClassName?: string;
  iconStyle?: PluginThemeStyle;
  style?: PluginThemeStyle;
  titleClassName?: string;
  titleStyle?: PluginThemeStyle;
};

export type PluginHomeThemeConfig = {
  colors?: PluginThemeStyle;
  sections?: Record<string, PluginThemeSectionConfig>;
  variables?: PluginThemeStyle;
};

export type AgentConsolePluginRightSidebarPanel = {
  entryUrl: string;
  icon?: string;
  id: string;
  label: string;
  pluginId: string;
  title: string;
};

export type AgentConsolePluginCommandKind = "prompt" | "view" | "command";

export type AgentConsolePluginCommand = {
  category?: string;
  description?: string;
  icon?: string;
  id: string;
  insertText?: string;
  kind: AgentConsolePluginCommandKind;
  label: string;
  panelId?: string;
  pluginId: string;
  rawCommandId?: string;
  title: string;
};

export type AgentConsolePluginMenuContribution = {
  commandId: string;
  group?: string;
  id: string;
  label?: string;
  location: string;
  pluginId: string;
  when?: string;
};

export type AgentConsolePluginShortcutContribution = {
  accelerator: string;
  commandId: string;
  id: string;
  pluginId: string;
  when?: string;
};

export type AgentConsolePluginFileTreeItem = {
  commandId?: string;
  icon?: string;
  id: string;
  label: string;
  path?: string;
  pluginId: string;
  when?: string;
};

export type AgentConsolePluginConfigurationProperty = {
  default?: boolean | number | string;
  description?: string;
  enum?: string[];
  key: string;
  maximum?: number;
  minimum?: number;
  title?: string;
  type: "boolean" | "number" | "string";
};

export type AgentConsolePluginConfigurationContribution = {
  pluginId: string;
  properties: AgentConsolePluginConfigurationProperty[];
  title: string;
  values: Record<string, boolean | number | string>;
};

export type AgentConsolePluginAgentSkill = {
  description?: string;
  id: string;
  path?: string;
  pluginId: string;
  title: string;
  when?: string;
};

export type AgentConsolePluginAutomationTemplate = {
  description?: string;
  id: string;
  pluginId: string;
  prompt?: string;
  schedule?: string;
  title: string;
  when?: string;
};

export type AgentConsolePluginMcpServer = AgentMcpServerConfig & {
  id: string;
  label?: string;
  pluginId: string;
  providers?: string[];
};

export type AgentConsolePluginInfo = {
  agentSkills: AgentConsolePluginAgentSkill[];
  automationTemplates: AgentConsolePluginAutomationTemplate[];
  commands: AgentConsolePluginCommand[];
  configuration?: AgentConsolePluginConfigurationContribution;
  description?: string;
  enabled: boolean;
  fileTreeItems: AgentConsolePluginFileTreeItem[];
  grants: AgentConsolePluginGrant[];
  iconDataUrl?: string;
  id: string;
  installed: boolean;
  label: string;
  lifecycleState: AgentConsolePluginLifecycleState;
  manifestPath: string;
  manifestHash?: string;
  menus: AgentConsolePluginMenuContribution[];
  mcpServers: AgentConsolePluginMcpServer[];
  packageDigest?: string;
  permissions: AgentConsolePluginPermission[];
  rightSidebarPanels: AgentConsolePluginRightSidebarPanel[];
  shortcuts: AgentConsolePluginShortcutContribution[];
  signature: AgentConsolePluginSignatureStatus;
  sourceType: AgentConsolePluginSourceType;
  theme?: PluginHomeThemeConfig;
  version?: string;
  warnings: string[];
};

export type AgentConsolePluginMarketplaceEntry = {
  description?: string;
  enabled: boolean;
  iconDataUrl?: string;
  iconUrl?: string;
  id: string;
  installable?: boolean;
  installUrl?: string;
  installed: boolean;
  label: string;
  marketplaceKey?: string;
  manifestPath?: string;
  packagePath?: string;
  remoteId?: string;
  sourceType: AgentConsolePluginSourceType;
  version?: string;
};

export type AgentConsolePluginState = {
  agentSkills: AgentConsolePluginAgentSkill[];
  automationTemplates: AgentConsolePluginAutomationTemplate[];
  commands: AgentConsolePluginCommand[];
  fileTreeItems: AgentConsolePluginFileTreeItem[];
  marketplace: AgentConsolePluginMarketplaceEntry[];
  menus: AgentConsolePluginMenuContribution[];
  mcpServers: AgentConsolePluginMcpServer[];
  pluginRoot: string;
  plugins: AgentConsolePluginInfo[];
  rightSidebarPanels: AgentConsolePluginRightSidebarPanel[];
  shortcuts: AgentConsolePluginShortcutContribution[];
  warnings: string[];
};
