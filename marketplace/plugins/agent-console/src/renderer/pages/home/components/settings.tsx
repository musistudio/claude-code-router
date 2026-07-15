import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useI18n, type Locale, type TFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Eye,
  EyeOff,
  HardDriveUpload,
  KeyRound,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  Smartphone,
  SquarePen,
  Trash2,
  X
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentConsolePluginInfo, AgentConsolePluginMarketplaceEntry, AgentConsolePluginSourceType, AgentConsolePluginState, AgentMcpServerConfig, AgentMcpServerMap } from "../../../../shared/plugin-types";
import { toolHubBuiltinMcpServerIds, type ToolHubBuiltinMcpServerId, type ToolHubLlmSettings, type ToolHubSettings, type ToolHubUserMcpServerConfig } from "../../../../shared/toolhub-types";
import {
  acceleratorFromKeyboardEvent,
  AgentConsoleBridge,
  AgentEnvironmentRow,
  AgentEnvironmentSettings,
  AgentProviderOption,
  AgentProviderSettingsForm,
  agentApprovalModes,
  AppSettingsState,
  BotGatewayChannelManifest,
  botGatewayDefaultAuthType,
  botGatewayDefaultTransport,
  BotGatewayFieldDefinition,
  BotGatewayIntegration,
  BotGatewayIntegrationDraft,
  botGatewayManagedTenantId,
  botGatewayPlatformNames,
  botGatewayPlatformOrder,
  BotGatewayQrDisplay,
  BotGatewayQrLoginState,
  botGatewayQrWebviewZoomFactor,
  botGatewayStartablePlatforms,
  BotGatewayStatus,
  ChatAgentProviderId,
  ConfiguredAgentProviderSettings,
  ConfiguredSubagentSettings,
  createAgentEnvironmentRow,
  createAgentProviderSettingsForm,
  createBlankAgentProviderSettingsForm,
  createBlankSubagentSettingsForm,
  createSubagentSettingsForm,
  formatShortcutAccelerator,
  getAgentEffortOptionsForModel,
  getAgentSpeedLabel,
  getAgentSpeedOptionsForModel,
  getAgentEnvironmentRows,
  getAgentProviderRuntimeAdapter,
  getAgentProviderSubagentMode,
  getAgentProviderWireProtocol,
  getValidAgentModel,
  getConfiguredAgentProviderDescription,
  getConfiguredAgentProviderFromForm,
  getConfiguredSubagentFromForm,
  getEnvironmentFromRows,
  getFallbackAgentProviderOptions,
  getSettingsSections,
  isToolHubLlmConfigured,
  isValidEnvironmentVariableName,
  maxAgentLogoBytes,
  normalizeAgentLogoDataUrl,
  normalizeAgentModelOptions,
  normalizeAgentMcpServerMap,
  popoverSpringTransition,
  SettingsPreferences,
  SettingsPreferenceValue,
  SettingsSectionId,
  SubagentSettingsForm,
  ThemePreference,
  TranscriptionConfig,
  updateSubagentSettingsFormValue
} from "../utils/core";
import { AgentLogo } from "./layout";
import {
  defaultHomeThemeConfigText,
  getHomeThemeConfigError
} from "../utils/theme";

export function BotGatewayPage({
  leftOpen,
  onBack
}: {
  leftOpen: boolean;
  onBack: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <header className={cn("drag-region flex h-[46px] shrink-0 items-center justify-between bg-background px-4 pr-[58px]", !leftOpen && "pl-[118px]")}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Bot className="h-5 w-5 shrink-0 text-primary" />
          <h1 className="min-w-0 truncate text-[15px] font-semibold text-foreground">{t("settings.botGateway.title")}</h1>
        </div>
        <button
          className="no-drag inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
          onClick={onBack}
          type="button"
        >
          <ChevronLeft className="h-[13px] w-[13px]" />
          <span>{t("settings.backToApp")}</span>
        </button>
      </header>
      <section className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[1180px] px-8 py-7">
          <BotGatewaySettingsPanel
            title={null}
          />
        </div>
      </section>
    </div>
  );
}


export function SettingsPage({
  activeSection,
  agentEnvironments,
  agentProviders,
  appSettings,
  backLabel,
  onAgentEnvironmentSave,
  onAgentProviderEnabledChange,
  onAgentProvidersSave,
  onBack,
  onPreferenceChange,
  onPluginAction,
  onSectionChange,
  onSpotlightShortcutChange,
  onSpotlightShortcutReset,
  onTranscriptionConfigChange,
  onToolHubEnabledChange,
  onToolHubBuiltinMcpServerChange,
  onToolHubCacheClear,
  onToolHubLlmConfigSave,
  onToolHubServerInstall,
  onToolHubServerRemove,
  onToolHubServerUpdate,
  onSubagentsSave,
  preferences,
  pluginState,
  transcriptionConfig
}: {
  activeSection: SettingsSectionId;
  agentEnvironments: AgentEnvironmentSettings;
  agentProviders: AgentProviderOption[];
  appSettings: AppSettingsState;
  backLabel: string;
  onAgentEnvironmentSave: (providerId: ChatAgentProviderId, env: Record<string, string>) => Promise<void>;
  onAgentProviderEnabledChange: (providerId: ChatAgentProviderId, enabled: boolean) => Promise<void>;
  onAgentProvidersSave: (providers: ConfiguredAgentProviderSettings[]) => Promise<void>;
  onSubagentsSave: (subagents: ConfiguredSubagentSettings[]) => Promise<void>;
  onBack: () => void;
  onPreferenceChange: (key: keyof SettingsPreferences, value: SettingsPreferenceValue) => void;
  onPluginAction: (
    action: "disable" | "enable" | "grant-permissions" | "install" | "reload" | "revoke-permissions" | "set-configuration" | "uninstall" | "update",
    payload?: unknown
  ) => Promise<void>;
  onSectionChange: (section: SettingsSectionId) => void;
  onSpotlightShortcutChange: (accelerator: string) => Promise<void>;
  onSpotlightShortcutReset: () => Promise<void>;
  onTranscriptionConfigChange: (key: keyof TranscriptionConfig, value: string) => void;
  onToolHubEnabledChange: (enabled: boolean) => Promise<void>;
  onToolHubBuiltinMcpServerChange: (serverId: ToolHubBuiltinMcpServerId, enabled: boolean) => Promise<void>;
  onToolHubCacheClear: () => Promise<void>;
  onToolHubLlmConfigSave: (llm: ToolHubLlmSettings) => Promise<void>;
  onToolHubServerInstall: (server: ToolHubUserMcpServerConfig) => Promise<void>;
  onToolHubServerRemove: (serverId: string) => Promise<void>;
  onToolHubServerUpdate: (server: ToolHubUserMcpServerConfig) => Promise<void>;
  preferences: SettingsPreferences;
  pluginState: AgentConsolePluginState;
  transcriptionConfig: TranscriptionConfig;
}) {
  const { t } = useI18n();
  const settingsSections = useMemo(() => getSettingsSections(t), [t]);
  const activeSectionConfig = settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0];

  return (
    <div className="settings-shell flex h-full overflow-hidden bg-background text-foreground">
      <aside className="settings-sidebar min-h-0 w-[260px] shrink-0 overflow-auto border-r border-border bg-sidebar px-2 py-3">
        <div className="settings-sidebar-header drag-region -mx-2 -mt-3 mb-1.5 flex h-[76px] flex-col justify-end px-2 pb-1">
          <button
            className="no-drag flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-[12px] font-medium text-sidebar-foreground hover:bg-muted"
            onClick={onBack}
            title={t("settings.returnTitle", { label: backLabel })}
            type="button"
          >
            <ChevronLeft className="h-[15px] w-[15px] shrink-0" />
            <span className="truncate">{t("settings.backToApp")}</span>
          </button>
        </div>
        <nav className="space-y-0.5" aria-label={t("settings.menuAria")}>
          {settingsSections.map((section) => {
            const Icon = section.icon;
            const selected = section.id === activeSection;
            return (
              <button
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "settings-nav-item flex min-h-8 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[12px] font-medium transition-colors",
                  selected ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                key={section.id}
                onClick={() => onSectionChange(section.id)}
                type="button"
              >
                <Icon className={cn("h-[15px] w-[15px] shrink-0", selected ? "text-accent-foreground" : "text-muted-foreground")} />
                <span className="min-w-0 flex-1 truncate">{section.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="settings-main min-w-0 flex-1 overflow-auto">
        <div className="settings-content mx-auto w-full max-w-[900px] px-8 py-7">
          {activeSection !== "agents" ? (
            <div className="settings-section-heading mb-5">
              <h2 className="text-[19px] font-semibold leading-6 text-foreground">{activeSectionConfig.label}</h2>
            </div>
          ) : null}

          <SettingsSectionContent
            activeSection={activeSection}
            activeSectionLabel={activeSectionConfig.label}
            agentEnvironments={agentEnvironments}
            agentProviders={agentProviders}
            appSettings={appSettings}
            onAgentEnvironmentSave={onAgentEnvironmentSave}
            onAgentProviderEnabledChange={onAgentProviderEnabledChange}
            onAgentProvidersSave={onAgentProvidersSave}
            onPreferenceChange={onPreferenceChange}
            onPluginAction={onPluginAction}
            onSpotlightShortcutChange={onSpotlightShortcutChange}
            onSpotlightShortcutReset={onSpotlightShortcutReset}
            onTranscriptionConfigChange={onTranscriptionConfigChange}
            onToolHubEnabledChange={onToolHubEnabledChange}
            onToolHubBuiltinMcpServerChange={onToolHubBuiltinMcpServerChange}
            onToolHubCacheClear={onToolHubCacheClear}
            onToolHubLlmConfigSave={onToolHubLlmConfigSave}
            onToolHubServerInstall={onToolHubServerInstall}
            onToolHubServerRemove={onToolHubServerRemove}
            onToolHubServerUpdate={onToolHubServerUpdate}
            onSubagentsSave={onSubagentsSave}
            preferences={preferences}
            pluginState={pluginState}
            transcriptionConfig={transcriptionConfig}
          />
        </div>
      </main>
    </div>
  );
}

export function SettingsSectionContent({
  activeSection,
  activeSectionLabel,
  agentEnvironments,
  agentProviders,
  appSettings,
  onAgentEnvironmentSave,
  onAgentProviderEnabledChange,
  onAgentProvidersSave,
  onSubagentsSave,
  onPreferenceChange,
  onPluginAction,
  onSpotlightShortcutChange,
  onSpotlightShortcutReset,
  onTranscriptionConfigChange,
  onToolHubEnabledChange,
  onToolHubBuiltinMcpServerChange,
  onToolHubCacheClear,
  onToolHubLlmConfigSave,
  onToolHubServerInstall,
  onToolHubServerRemove,
  onToolHubServerUpdate,
  preferences,
  pluginState,
  transcriptionConfig
}: {
  activeSection: SettingsSectionId;
  activeSectionLabel: string;
  agentEnvironments: AgentEnvironmentSettings;
  agentProviders: AgentProviderOption[];
  appSettings: AppSettingsState;
  onAgentEnvironmentSave: (providerId: ChatAgentProviderId, env: Record<string, string>) => Promise<void>;
  onAgentProviderEnabledChange: (providerId: ChatAgentProviderId, enabled: boolean) => Promise<void>;
  onAgentProvidersSave: (providers: ConfiguredAgentProviderSettings[]) => Promise<void>;
  onSubagentsSave: (subagents: ConfiguredSubagentSettings[]) => Promise<void>;
  onPreferenceChange: (key: keyof SettingsPreferences, value: SettingsPreferenceValue) => void;
  onPluginAction: (
    action: "disable" | "enable" | "grant-permissions" | "install" | "reload" | "revoke-permissions" | "set-configuration" | "uninstall" | "update",
    payload?: unknown
  ) => Promise<void>;
  onSpotlightShortcutChange: (accelerator: string) => Promise<void>;
  onSpotlightShortcutReset: () => Promise<void>;
  onTranscriptionConfigChange: (key: keyof TranscriptionConfig, value: string) => void;
  onToolHubEnabledChange: (enabled: boolean) => Promise<void>;
  onToolHubBuiltinMcpServerChange: (serverId: ToolHubBuiltinMcpServerId, enabled: boolean) => Promise<void>;
  onToolHubCacheClear: () => Promise<void>;
  onToolHubLlmConfigSave: (llm: ToolHubLlmSettings) => Promise<void>;
  onToolHubServerInstall: (server: ToolHubUserMcpServerConfig) => Promise<void>;
  onToolHubServerRemove: (serverId: string) => Promise<void>;
  onToolHubServerUpdate: (server: ToolHubUserMcpServerConfig) => Promise<void>;
  preferences: SettingsPreferences;
  pluginState: AgentConsolePluginState;
  transcriptionConfig: TranscriptionConfig;
}) {
  const { locale, setLocale, t } = useI18n();

  if (activeSection === "agents") {
    return (
      <AgentSettingsPanel
        agentEnvironments={agentEnvironments}
        agentProviders={agentProviders}
        configuredAgentProviders={appSettings.agentProviders}
        configuredSubagents={appSettings.subagents}
        disabledAgentProviders={appSettings.disabledAgentProviders}
        onAgentEnvironmentSave={onAgentEnvironmentSave}
        onAgentProviderEnabledChange={onAgentProviderEnabledChange}
        onAgentProvidersSave={onAgentProvidersSave}
        onSubagentsSave={onSubagentsSave}
        title={activeSectionLabel}
      />
    );
  }

  if (activeSection === "permissions") {
    return (
      <>
        <SettingsGroup title={t("settings.group.commands")}>
          <SettingsRow description={t("settings.permissions.approvals.description")} label={t("settings.permissions.approvals.label")}>
            <SettingsSwitch checked={preferences.commandApprovals} onChange={(checked) => onPreferenceChange("commandApprovals", checked)} />
          </SettingsRow>
          <SettingsRow description={t("settings.permissions.network.description")} label={t("settings.permissions.network.label")}>
            <SettingsSwitch checked={preferences.networkAccess} onChange={(checked) => onPreferenceChange("networkAccess", checked)} />
          </SettingsRow>
          <SettingsRow description={t("settings.permissions.dangerous.description")} label={t("settings.permissions.dangerous.label")}>
            <SettingsSwitch checked={preferences.confirmDangerousActions} onChange={(checked) => onPreferenceChange("confirmDangerousActions", checked)} />
          </SettingsRow>
        </SettingsGroup>
      </>
    );
  }

  if (activeSection === "integrations") {
    return (
      <PluginSettingsPanel
        onPluginAction={onPluginAction}
        pluginState={pluginState}
        title={t("settings.integration.installedPlugins")}
      />
    );
  }

  if (activeSection === "toolhub") {
    return (
      <ToolHubSettingsPanel
        onEnabledChange={onToolHubEnabledChange}
        onBuiltinMcpServerChange={onToolHubBuiltinMcpServerChange}
        onCacheClear={onToolHubCacheClear}
        onLlmConfigSave={onToolHubLlmConfigSave}
        onServerInstall={onToolHubServerInstall}
        onServerRemove={onToolHubServerRemove}
        onServerUpdate={onToolHubServerUpdate}
        settings={appSettings.toolHub}
      />
    );
  }

  if (activeSection === "appearance") {
    const languageOptions = [
      { label: t("language.zh"), value: "zh" },
      { label: t("language.en"), value: "en" }
    ];
    const themeOptions = [
      { label: t("settings.theme.system"), value: "system" },
      { label: t("settings.theme.light"), value: "light" },
      { label: t("settings.theme.dark"), value: "dark" }
    ];

    return (
      <>
        <SettingsGroup title={t("settings.group.appearance")}>
          <SettingsRow description={t("settings.appearance.language.description")} label={t("language.label")}>
            <Select
              aria-label={t("language.label")}
              onValueChange={(value) => setLocale(value as Locale)}
              options={languageOptions}
              selectClassName="w-[132px] justify-between border border-border bg-card"
              value={locale}
            />
          </SettingsRow>
          <SettingsRow description={t("settings.appearance.theme.description")} label={t("settings.appearance.theme.label")}>
            <Select
              aria-label={t("settings.appearance.theme.label")}
              onValueChange={(value) => onPreferenceChange("theme", value as ThemePreference)}
              options={themeOptions}
              selectClassName="w-[132px] justify-between border border-border bg-card"
              value={preferences.theme}
            />
          </SettingsRow>
          <SettingsRow description={t("settings.appearance.compactDensity.description")} label={t("settings.appearance.compactDensity.label")}>
            <SettingsSwitch checked={preferences.compactDensity} onChange={(checked) => onPreferenceChange("compactDensity", checked)} />
          </SettingsRow>
          <SettingsRow description={t("settings.appearance.reduceMotion.description")} label={t("settings.appearance.reduceMotion.label")}>
            <SettingsSwitch checked={preferences.reduceMotion} onChange={(checked) => onPreferenceChange("reduceMotion", checked)} />
          </SettingsRow>
          <SettingsStackedRow description={t("settings.appearance.homeTheme.description")} label={t("settings.appearance.homeTheme.label")}>
            <HomeThemeSettingsEditor value={preferences.homeThemeConfig} onChange={(value) => onPreferenceChange("homeThemeConfig", value)} />
          </SettingsStackedRow>
        </SettingsGroup>
      </>
    );
  }

  return (
    <>
      <SettingsGroup title={t("settings.group.startup")}>
        <SettingsRow description={t("settings.general.restoreLastThread.description")} label={t("settings.general.restoreLastThread.label")}>
          <SettingsSwitch checked={preferences.restoreLastThread} onChange={(checked) => onPreferenceChange("restoreLastThread", checked)} />
        </SettingsRow>
        <SettingsRow description={t("settings.general.autoSaveDrafts.description")} label={t("settings.general.autoSaveDrafts.label")}>
          <SettingsSwitch checked={preferences.autoSaveDrafts} onChange={(checked) => onPreferenceChange("autoSaveDrafts", checked)} />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title={t("settings.group.shortcuts")}>
        <SettingsRow description={t("settings.shortcut.spotlight.description")} label={t("settings.shortcut.spotlight.label")}>
          <ShortcutRecorder
            defaultValue={appSettings.defaultSpotlightShortcut}
            onChange={onSpotlightShortcutChange}
            onReset={onSpotlightShortcutReset}
            value={appSettings.spotlightShortcut}
          />
        </SettingsRow>
      </SettingsGroup>
      <VoiceTranscriptionSettingsPanel
        onTranscriptionConfigChange={onTranscriptionConfigChange}
        transcriptionConfig={transcriptionConfig}
      />
    </>
  );
}

export function VoiceTranscriptionSettingsPanel({
  onTranscriptionConfigChange,
  transcriptionConfig
}: {
  onTranscriptionConfigChange: (key: keyof TranscriptionConfig, value: string) => void;
  transcriptionConfig: TranscriptionConfig;
}) {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TranscriptionConfig>(() => transcriptionConfig);
  const hasApiKey = Boolean(transcriptionConfig.apiKey.trim());

  useEffect(() => {
    if (!dialogOpen) {
      setForm(transcriptionConfig);
    }
  }, [dialogOpen, transcriptionConfig]);

  const openDialog = useCallback(() => {
    setForm(transcriptionConfig);
    setDialogOpen(true);
  }, [transcriptionConfig]);

  const closeDialog = useCallback(() => {
    setForm(transcriptionConfig);
    setDialogOpen(false);
  }, [transcriptionConfig]);

  const updateForm = useCallback((key: keyof TranscriptionConfig, value: string) => {
    setForm((currentForm) => ({ ...currentForm, [key]: value }));
  }, []);

  const saveConfig = useCallback(() => {
    const keys: Array<keyof TranscriptionConfig> = ["endpoint", "apiKey", "model", "language", "prompt"];
    keys.forEach((key) => onTranscriptionConfigChange(key, form[key]));
    setDialogOpen(false);
  }, [form, onTranscriptionConfigChange]);

  return (
    <>
      <SettingsGroup title={t("settings.group.voiceApi")}>
        <SettingsRow description={hasApiKey ? t("settings.voice.configReady") : t("settings.voice.apiKeyMissing")} label={t("settings.voice.configStatus")}>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md border px-2 text-[12px]",
                hasApiKey ? "border-primary/30 bg-accent text-primary" : "border-destructive/30 bg-destructive/10 text-destructive"
              )}
            >
              <KeyRound className="h-[13px] w-[13px]" />
              <span>{hasApiKey ? t("settings.voice.configured") : t("settings.voice.notConfigured")}</span>
            </div>
            <button
              aria-label={t("settings.voice.configureButton")}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-ring/20",
                hasApiKey
                  ? "border-border bg-background text-foreground hover:bg-muted"
                  : "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15"
              )}
              onClick={openDialog}
              title={t("settings.voice.configureButton")}
              type="button"
            >
              <Settings className="h-[14px] w-[14px]" />
            </button>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <AnimatePresence>
        {dialogOpen ? (
          <AgentSettingsDialog
            dialogClassName="w-[min(92vw,560px)] max-w-none"
            footer={(
              <div className="flex min-h-8 items-center justify-end gap-2">
                <PluginActionButton label={t("common.cancel")} onClick={closeDialog} />
                <PluginActionButton label={t("common.save")} onClick={saveConfig} />
              </div>
            )}
            key="voice-transcription-settings-dialog"
            onClose={closeDialog}
            title={t("settings.voice.settingsTitle")}
          >
            <div className="space-y-4">
              <p className="text-[12px] leading-5 text-muted-foreground">{t("settings.voice.configDescription")}</p>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <ToolHubSettingsInput
                  className="lg:col-span-2"
                  label={t("settings.voice.endpoint")}
                  onChange={(nextValue) => updateForm("endpoint", nextValue)}
                  placeholder="https://api.openai.com/v1"
                  value={form.endpoint}
                />
                <ToolHubSettingsInput
                  inputType="password"
                  label={t("settings.voice.apiKey")}
                  onChange={(nextValue) => updateForm("apiKey", nextValue)}
                  placeholder="sk-..."
                  value={form.apiKey}
                />
                <ToolHubSettingsInput
                  label={t("settings.voice.model")}
                  onChange={(nextValue) => updateForm("model", nextValue)}
                  placeholder="gpt-4o-transcribe"
                  value={form.model}
                />
                <ToolHubSettingsInput
                  label={t("settings.voice.language")}
                  onChange={(nextValue) => updateForm("language", nextValue)}
                  placeholder="auto"
                  value={form.language}
                />
                <ToolHubSettingsTextArea
                  className="lg:col-span-2"
                  label={t("settings.voice.prompt")}
                  onChange={(nextValue) => updateForm("prompt", nextValue)}
                  placeholder={t("common.optional")}
                  value={form.prompt}
                />
              </div>
            </div>
          </AgentSettingsDialog>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export type ToolHubMcpServerFormAuthType = "api-key" | "basic" | "bearer" | "none";
export type ToolHubMcpServerInputMode = "form" | "json";
export type ToolHubMcpServerFormTransport = "http" | "sse" | "stdio";

export type ToolHubKeyValueRow = {
  id: string;
  key: string;
  value: string;
};

export type ToolHubMcpServerForm = {
  argsText: string;
  authHeaderName: string;
  authPassword: string;
  authToken: string;
  authType: ToolHubMcpServerFormAuthType;
  authUsername: string;
  authValue: string;
  command: string;
  connectionType: "direct" | "proxy";
  enabled: boolean;
  envRows: ToolHubKeyValueRow[];
  headers: Record<string, string>;
  id: string;
  label: string;
  type: ToolHubMcpServerFormTransport;
  url: string;
};

export type ToolHubMcpServerFormUpdate = <K extends keyof ToolHubMcpServerForm>(key: K, value: ToolHubMcpServerForm[K]) => void;
export type ToolHubLlmFormErrors = Partial<Record<keyof ToolHubLlmSettings, string>>;

export function ToolHubSettingsPanel({
  onBuiltinMcpServerChange,
  onCacheClear,
  onEnabledChange,
  onLlmConfigSave,
  onServerInstall,
  onServerRemove,
  onServerUpdate,
  settings
}: {
  onBuiltinMcpServerChange: (serverId: ToolHubBuiltinMcpServerId, enabled: boolean) => Promise<void>;
  onCacheClear: () => Promise<void>;
  onEnabledChange: (enabled: boolean) => Promise<void>;
  onLlmConfigSave: (llm: ToolHubLlmSettings) => Promise<void>;
  onServerInstall: (server: ToolHubUserMcpServerConfig) => Promise<void>;
  onServerRemove: (serverId: string) => Promise<void>;
  onServerUpdate: (server: ToolHubUserMcpServerConfig) => Promise<void>;
  settings: ToolHubSettings;
}) {
  const { t } = useI18n();
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [form, setForm] = useState<ToolHubMcpServerForm>(() => createToolHubMcpServerForm());
  const [importJsonError, setImportJsonError] = useState<string | null>(null);
  const [importJsonText, setImportJsonText] = useState("");
  const [llmDialogOpen, setLlmDialogOpen] = useState(false);
  const [llmForm, setLlmForm] = useState<ToolHubLlmSettings>(() => settings.llm);
  const [llmFormErrors, setLlmFormErrors] = useState<ToolHubLlmFormErrors>({});
  const [pendingEnableAfterLlmSave, setPendingEnableAfterLlmSave] = useState(false);
  const [serverInputMode, setServerInputMode] = useState<ToolHubMcpServerInputMode>("form");
  const [serverDialogMode, setServerDialogMode] = useState<"edit" | "install" | null>(null);
  const editingServer = editingServerId ? settings.mcpServers.find((server) => server.id === editingServerId) : undefined;
  const hasLlmConfig = isToolHubLlmConfigured(settings.llm);

  useEffect(() => {
    if (editingServerId && !editingServer) {
      setEditingServerId(null);
      setForm(createToolHubMcpServerForm());
      setServerDialogMode(null);
    }
  }, [editingServer, editingServerId]);

  useEffect(() => {
    setLlmForm(settings.llm);
    setLlmFormErrors({});
  }, [settings.llm.apiKey, settings.llm.baseUrl, settings.llm.model]);

  const updateForm = useCallback<ToolHubMcpServerFormUpdate>((key, value) => {
    setForm((currentForm) => ({ ...currentForm, [key]: value }));
  }, []);

  const updateImportJsonText = useCallback((value: string) => {
    setImportJsonText(value);
    setImportJsonError(null);
  }, []);

  const updateLlmForm = useCallback(<K extends keyof ToolHubLlmSettings>(key: K, value: ToolHubLlmSettings[K]) => {
    setLlmForm((currentForm) => ({ ...currentForm, [key]: value }));
    setLlmFormErrors((currentErrors) => currentErrors[key] ? { ...currentErrors, [key]: undefined } : currentErrors);
  }, []);

  const openLlmDialog = useCallback(() => {
    setLlmForm(settings.llm);
    setLlmFormErrors({});
    setLlmDialogOpen(true);
  }, [settings.llm]);

  const closeLlmDialog = useCallback(() => {
    setLlmForm(settings.llm);
    setLlmFormErrors({});
    setPendingEnableAfterLlmSave(false);
    setLlmDialogOpen(false);
  }, [settings.llm]);

  const saveLlmConfig = useCallback(async () => {
    const { errors, value } = getToolHubLlmSettingsFromForm(llmForm, t);
    setLlmFormErrors(errors);
    if (hasToolHubLlmFormErrors(errors)) {
      return;
    }
    await onLlmConfigSave(value);
    if (pendingEnableAfterLlmSave && isToolHubLlmConfigured(value)) {
      await onEnabledChange(true);
    }
    setPendingEnableAfterLlmSave(false);
    setLlmDialogOpen(false);
  }, [llmForm, onEnabledChange, onLlmConfigSave, pendingEnableAfterLlmSave, t]);

  const changeEnabled = useCallback(async (enabled: boolean) => {
    if (enabled && !hasLlmConfig) {
      setPendingEnableAfterLlmSave(true);
      openLlmDialog();
      return;
    }
    await onEnabledChange(enabled);
  }, [hasLlmConfig, onEnabledChange, openLlmDialog]);

  const closeServerDialog = useCallback(() => {
    setEditingServerId(null);
    setForm(createToolHubMcpServerForm());
    setImportJsonError(null);
    setImportJsonText("");
    setServerInputMode("form");
    setServerDialogMode(null);
  }, []);

  const openInstallDialog = useCallback(() => {
    setEditingServerId(null);
    setForm(createToolHubMcpServerForm());
    setImportJsonError(null);
    setImportJsonText("");
    setServerInputMode("form");
    setServerDialogMode("install");
  }, []);

  const editServer = useCallback((server: ToolHubUserMcpServerConfig) => {
    setEditingServerId(server.id);
    setForm(createToolHubMcpServerForm(server));
    setImportJsonError(null);
    setImportJsonText("");
    setServerInputMode("form");
    setServerDialogMode("edit");
  }, []);

  const saveServer = useCallback(async () => {
    if (!serverDialogMode) return;
    if (serverDialogMode === "install" && serverInputMode === "json") {
      const importedForm = getToolHubMcpServerFormFromJsonText(importJsonText, t);
      if (importedForm.error || !importedForm.form) {
        setImportJsonError(importedForm.error || t("settings.toolhub.invalidImportServer"));
        return;
      }

      const { error, server } = getToolHubMcpServerFromForm({
        ...importedForm.form,
        id: createUniqueToolHubServerId(importedForm.form, settings.mcpServers)
      }, t);
      if (error || !server) {
        setImportJsonError(error || t("settings.toolhub.invalidServer"));
        return;
      }
      await onServerInstall(server);
      closeServerDialog();
      return;
    }

    const nextForm = editingServerId ? form : {
      ...form,
      id: createUniqueToolHubServerId(form, settings.mcpServers)
    };
    const { error, server } = getToolHubMcpServerFromForm(nextForm, t);
    if (error || !server) {
      window.alert(error || t("settings.toolhub.invalidServer"));
      return;
    }
    if (editingServerId) {
      await onServerUpdate(server);
    } else {
      await onServerInstall(server);
    }
    closeServerDialog();
  }, [closeServerDialog, editingServerId, form, importJsonText, onServerInstall, onServerUpdate, serverDialogMode, serverInputMode, settings.mcpServers, t]);

  const removeServer = useCallback(async (serverId: string) => {
    if (!window.confirm(t("settings.toolhub.removeConfirm", { id: serverId }))) return;
    await onServerRemove(serverId);
    if (editingServerId === serverId) {
      closeServerDialog();
    }
  }, [closeServerDialog, editingServerId, onServerRemove, t]);

  const clearCache = useCallback(async () => {
    if (!window.confirm(t("settings.toolhub.clearCacheConfirm"))) return;
    setCacheClearing(true);
    try {
      await onCacheClear();
    } finally {
      setCacheClearing(false);
    }
  }, [onCacheClear, t]);

  return (
    <>
      <SettingsGroup>
        <SettingsRow description={t("settings.toolhub.enableDescription")} label={t("settings.toolhub.enableLabel")}>
          <div className="flex items-center gap-2">
            <SettingsSwitch checked={settings.enabled} onChange={(checked) => void changeEnabled(checked)} />
            <button
              aria-label={t("settings.toolhub.llmSettingsButton")}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-ring/20",
                hasLlmConfig
                  ? "border-border bg-background text-foreground hover:bg-muted"
                  : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              )}
              onClick={openLlmDialog}
              title={t("settings.toolhub.llmSettingsButton")}
              type="button"
            >
              <Settings className="h-[13px] w-[13px]" />
            </button>
          </div>
        </SettingsRow>
        <SettingsRow description={t("settings.toolhub.clearCacheDescription")} label={t("settings.toolhub.clearCache")}>
          <button
            className="inline-flex h-7 min-w-[96px] items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 text-[12px] font-medium text-destructive outline-none transition hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring/20"
            disabled={cacheClearing}
            onClick={() => void clearCache()}
            type="button"
          >
            {cacheClearing ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Trash2 className="h-[13px] w-[13px]" />}
            <span>{t("settings.toolhub.clearCache")}</span>
          </button>
        </SettingsRow>
      </SettingsGroup>

      <section className="settings-group mb-8">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h3 className="settings-group-title text-[14px] font-semibold text-foreground">{t("settings.toolhub.installedServers")}</h3>
          <button
            aria-label={t("settings.toolhub.installServer")}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-background text-foreground outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/20"
            onClick={openInstallDialog}
            title={t("settings.toolhub.installServer")}
            type="button"
          >
            <Plus className="h-[14px] w-[14px]" />
          </button>
        </div>
        <div className="settings-group-body space-y-1">
          <div className="space-y-2 py-4">
            {settings.enabled ? toolHubBuiltinMcpServerIds.map((serverId) => {
              const enabled = settings.builtinMcpServers[serverId];
              const label = t(`settings.toolhub.builtin.${serverId}.label`);
              return (
                <div className="rounded-md border border-border bg-card px-3 py-3" key={`builtin-${serverId}`}>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-[13px] font-medium text-foreground">{label}</div>
                        <span className="rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">{t("settings.toolhub.builtinTag")}</span>
                        <span
                          className={cn(
                            "rounded-md border px-1.5 py-0.5 text-[11px]",
                            enabled
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "border-border bg-background text-muted-foreground"
                          )}
                        >
                          {enabled ? t("settings.toolhub.serverEnabled") : t("settings.toolhub.serverDisabled")}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{t(`settings.toolhub.builtin.${serverId}.description`)}</p>
                    </div>
                    <SettingsSwitch
                      ariaLabel={label}
                      checked={enabled}
                      onChange={(checked) => void onBuiltinMcpServerChange(serverId, checked)}
                    />
                  </div>
                </div>
              );
            }) : null}
            {settings.mcpServers.map((server) => (
              <div className="rounded-md border border-border bg-card px-3 py-3" key={server.id}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-[13px] font-medium text-foreground">{server.label || server.id}</div>
                      <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{getToolHubTransportLabel(server)}</span>
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[11px]",
                          server.enabled
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-border bg-background text-muted-foreground"
                        )}
                      >
                        {server.enabled ? t("settings.toolhub.serverEnabled") : t("settings.toolhub.serverDisabled")}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[12px] text-muted-foreground" title={server.url || server.command}>
                      {server.id} · {server.url || [server.command, ...(server.args ?? [])].filter(Boolean).join(" ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      aria-label={t("common.edit")}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-background text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
                      onClick={() => editServer(server)}
                      title={t("common.edit")}
                      type="button"
                    >
                      <SquarePen className="h-[13px] w-[13px]" />
                    </button>
                    <button
                      aria-label={t("common.remove")}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive outline-none transition hover:bg-destructive/15 focus-visible:ring-2 focus-visible:ring-ring/20"
                      onClick={() => removeServer(server.id)}
                      title={t("common.remove")}
                      type="button"
                    >
                      <Trash2 className="h-[13px] w-[13px]" />
                    </button>
                    <SettingsSwitch
                      ariaLabel={t(server.enabled ? "settings.toolhub.disableServer" : "settings.toolhub.enableServer", { id: server.id })}
                      checked={server.enabled}
                      onChange={(checked) => void onServerUpdate({ ...server, enabled: checked })}
                    />
                  </div>
                </div>
                {server.description ? <div className="mt-2 text-[12px] leading-5 text-muted-foreground">{server.description}</div> : null}
              </div>
            ))}
            {settings.enabled || settings.mcpServers.length ? null : (
              <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-[12px] text-muted-foreground">
                {t("settings.toolhub.noServers")}
              </div>
            )}
          </div>
        </div>
      </section>
      <AnimatePresence>
        {llmDialogOpen ? (
          <AgentSettingsDialog
            dialogClassName="w-[min(92vw,560px)] max-w-none"
            footer={(
              <div className="flex min-h-8 items-center justify-end gap-2">
                <PluginActionButton label={t("common.cancel")} onClick={closeLlmDialog} />
                <PluginActionButton label={t("common.save")} onClick={saveLlmConfig} />
              </div>
            )}
            key="toolhub-llm-settings-dialog"
            onClose={closeLlmDialog}
            title={t("settings.toolhub.llmSettings")}
          >
            <div className="space-y-4">
              <p className="text-[12px] leading-5 text-muted-foreground">{t("settings.toolhub.llmConfigDescription")}</p>
              <div className="grid grid-cols-1 gap-3">
                <ToolHubSettingsInput
                  error={llmFormErrors.baseUrl}
                  label={t("settings.toolhub.llmBaseUrl")}
                  onChange={(value) => updateLlmForm("baseUrl", value)}
                  placeholder="https://api.openai.com/v1"
                  value={llmForm.baseUrl}
                />
                <ToolHubSettingsInput
                  error={llmFormErrors.apiKey}
                  inputType="password"
                  label={t("settings.toolhub.llmApiKey")}
                  onChange={(value) => updateLlmForm("apiKey", value)}
                  placeholder="sk-..."
                  value={llmForm.apiKey}
                />
                <ToolHubSettingsInput
                  error={llmFormErrors.model}
                  label={t("settings.toolhub.llmModel")}
                  onChange={(value) => updateLlmForm("model", value)}
                  placeholder="gpt-4.1-mini"
                  value={llmForm.model}
                />
              </div>
            </div>
          </AgentSettingsDialog>
        ) : null}
        {serverDialogMode ? (
          <AgentSettingsDialog
            dialogClassName="w-[min(92vw,720px)] max-w-none"
            footer={(
              <div className="flex min-h-8 items-center justify-end gap-2">
                <PluginActionButton label={t("common.cancel")} onClick={closeServerDialog} />
                <PluginActionButton label={serverDialogMode === "edit" ? t("common.save") : t("settings.toolhub.install")} onClick={saveServer} />
              </div>
            )}
            key="toolhub-mcp-server-dialog"
            onClose={closeServerDialog}
            title={serverDialogMode === "edit" ? t("settings.toolhub.editServer") : t("settings.toolhub.installServer")}
          >
            {serverDialogMode === "install" ? (
              <div className="space-y-4">
                <ToolHubMcpServerInputModeTabs
                  mode={serverInputMode}
                  onChange={(mode) => {
                    setServerInputMode(mode);
                    setImportJsonError(null);
                  }}
                />
                <div className="px-0.5">
                  {serverInputMode === "json" ? (
                    <ToolHubMcpServerJsonImport
                      error={importJsonError}
                      onChange={updateImportJsonText}
                      value={importJsonText}
                    />
                  ) : (
                    <ToolHubMcpServerFormFields form={form} onUpdate={updateForm} />
                  )}
                </div>
              </div>
            ) : (
              <ToolHubMcpServerFormFields form={form} onUpdate={updateForm} />
            )}
          </AgentSettingsDialog>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function ToolHubMcpServerInputModeTabs({
  mode,
  onChange
}: {
  mode: ToolHubMcpServerInputMode;
  onChange: (mode: ToolHubMcpServerInputMode) => void;
}) {
  const { t } = useI18n();
  const options: Array<{ icon: typeof SquarePen; label: string; value: ToolHubMcpServerInputMode }> = [
    { icon: SquarePen, label: t("settings.toolhub.formConfig"), value: "form" },
    { icon: HardDriveUpload, label: t("settings.toolhub.importJsonConfig"), value: "json" }
  ];

  return (
    <div className="toolhub-mcp-tabs grid grid-cols-2 gap-1 p-1" role="tablist">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = mode === option.value;
        return (
          <button
            aria-selected={selected}
            className={cn(
              "toolhub-mcp-tab inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2 text-[12px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-ring/20",
              selected && "is-selected"
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="tab"
            type="button"
          >
            <Icon className="h-[13px] w-[13px]" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ToolHubMcpServerJsonImport({
  error,
  onChange,
  value
}: {
  error: string | null;
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useI18n();

  return (
    <div className="rounded-md">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="block text-[11px] font-medium uppercase text-muted-foreground">{t("settings.toolhub.importJsonConfig")}</span>
      </div>
      <textarea
        aria-invalid={Boolean(error)}
        className={cn(
          "h-36 w-full resize-none rounded-md border border-input bg-card px-2.5 py-2 font-mono text-[11px] leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15",
          error && "border-destructive bg-destructive/5 focus:border-destructive focus:ring-destructive/15"
        )}
        onChange={(event) => onChange(event.target.value)}
        placeholder={'{\n  "mcpServers": {\n    "server-id": {\n      "type": "streamablehttp",\n      "url": "https://example.com/mcp"\n    }\n  }\n}'}
        value={value}
      />
      {error ? <p className="mt-1 text-[11px] leading-4 text-destructive">{error}</p> : null}
    </div>
  );
}

export function ToolHubMcpServerFormFields({
  form,
  onUpdate
}: {
  form: ToolHubMcpServerForm;
  onUpdate: ToolHubMcpServerFormUpdate;
}) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <ToolHubSettingsInput label={t("settings.toolhub.serverLabel")} onChange={(value) => onUpdate("label", value)} value={form.label} />
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{t("settings.toolhub.transport")}</span>
        <Select
          className="w-full"
          onValueChange={(value) => onUpdate("type", value as ToolHubMcpServerFormTransport)}
          options={[
            { label: "stdio", value: "stdio" },
            { label: "SSE", value: "sse" },
            { label: "Streamable HTTP", value: "http" }
          ]}
          selectClassName="w-full max-w-none justify-between border border-border bg-card"
          value={form.type}
        />
      </label>
      {form.type === "stdio" ? (
        <>
          <ToolHubSettingsInput label={t("settings.toolhub.command")} onChange={(value) => onUpdate("command", value)} placeholder="node" value={form.command} />
          <ToolHubSettingsTextArea className="lg:col-span-2" label={t("settings.toolhub.args")} onChange={(value) => onUpdate("argsText", value)} placeholder="--stdio" value={form.argsText} />
          <ToolHubEnvironmentRows rows={form.envRows} onChange={(rows) => onUpdate("envRows", rows)} />
        </>
      ) : (
        <>
          <ToolHubSettingsInput label={t("settings.toolhub.url")} onChange={(value) => onUpdate("url", value)} placeholder={form.type === "sse" ? "http://127.0.0.1:8787/sse" : "http://127.0.0.1:8787/mcp"} value={form.url} />
          <ToolHubHttpConnectionFields form={form} onUpdate={onUpdate} />
        </>
      )}
    </div>
  );
}

export function ToolHubHttpConnectionFields({
  form,
  onUpdate
}: {
  form: ToolHubMcpServerForm;
  onUpdate: ToolHubMcpServerFormUpdate;
}) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-1 gap-3 lg:col-span-2 lg:grid-cols-2">
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{t("settings.toolhub.connectionType")}</span>
        <Select
          className="w-full"
          onValueChange={(value) => onUpdate("connectionType", value === "proxy" ? "proxy" : "direct")}
          options={[
            { label: t("settings.toolhub.connectionDirect"), value: "direct" },
            { label: t("settings.toolhub.connectionProxy"), value: "proxy" }
          ]}
          selectClassName="w-full max-w-none justify-between border border-border bg-card"
          value={form.connectionType}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{t("settings.toolhub.authentication")}</span>
        <Select
          className="w-full"
          onValueChange={(value) => onUpdate("authType", value as ToolHubMcpServerFormAuthType)}
          options={[
            { label: t("settings.toolhub.authNone"), value: "none" },
            { label: t("settings.toolhub.authBearer"), value: "bearer" },
            { label: t("settings.toolhub.authApiKey"), value: "api-key" },
            { label: t("settings.toolhub.authBasic"), value: "basic" }
          ]}
          selectClassName="w-full max-w-none justify-between border border-border bg-card"
          value={form.authType}
        />
      </label>
      <ToolHubAuthenticationFields form={form} onUpdate={onUpdate} />
    </div>
  );
}

export function ToolHubEnvironmentRows({
  onChange,
  rows
}: {
  onChange: (rows: ToolHubKeyValueRow[]) => void;
  rows: ToolHubKeyValueRow[];
}) {
  const { t } = useI18n();
  const normalizedRows = rows.length ? rows : [createToolHubKeyValueRow()];

  const updateRow = useCallback((rowId: string, key: keyof Omit<ToolHubKeyValueRow, "id">, value: string) => {
    onChange(normalizedRows.map((row) => row.id === rowId ? { ...row, [key]: value } : row));
  }, [normalizedRows, onChange]);

  const removeRow = useCallback((rowId: string) => {
    const nextRows = normalizedRows.filter((row) => row.id !== rowId);
    onChange(nextRows.length ? nextRows : [createToolHubKeyValueRow()]);
  }, [normalizedRows, onChange]);

  return (
    <div className="lg:col-span-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="block text-[11px] font-medium uppercase text-muted-foreground">{t("settings.toolhub.env")}</span>
        <button
          aria-label={t("settings.toolhub.addEnv")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-background text-foreground outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/20"
          onClick={() => onChange([...normalizedRows, createToolHubKeyValueRow()])}
          title={t("settings.toolhub.addEnv")}
          type="button"
        >
          <Plus className="h-[13px] w-[13px]" />
        </button>
      </div>
      <div className="space-y-2">
        {normalizedRows.map((row) => (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_28px] gap-2" key={row.id}>
            <input
              className="h-8 rounded-md border border-input bg-card px-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15"
              onChange={(event) => updateRow(row.id, "key", event.target.value)}
              placeholder={t("settings.toolhub.envKey")}
              value={row.key}
            />
            <input
              className="h-8 rounded-md border border-input bg-card px-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15"
              onChange={(event) => updateRow(row.id, "value", event.target.value)}
              placeholder={t("settings.toolhub.envValue")}
              value={row.value}
            />
            <button
              aria-label={t("settings.toolhub.removeEnv")}
              className="grid h-8 w-7 place-items-center rounded-md border border-border bg-background text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
              onClick={() => removeRow(row.id)}
              title={t("settings.toolhub.removeEnv")}
              type="button"
            >
              <Trash2 className="h-[13px] w-[13px]" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ToolHubAuthenticationFields({
  form,
  onUpdate
}: {
  form: ToolHubMcpServerForm;
  onUpdate: ToolHubMcpServerFormUpdate;
}) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-1 gap-3 lg:col-span-2 lg:grid-cols-2">
      {form.authType === "bearer" ? (
        <ToolHubSettingsInput inputType="password" label={t("settings.toolhub.authToken")} onChange={(value) => onUpdate("authToken", value)} value={form.authToken} />
      ) : null}
      {form.authType === "api-key" ? (
        <>
          <ToolHubSettingsInput label={t("settings.toolhub.authHeaderName")} onChange={(value) => onUpdate("authHeaderName", value)} value={form.authHeaderName} />
          <ToolHubSettingsInput inputType="password" label={t("settings.toolhub.authValue")} onChange={(value) => onUpdate("authValue", value)} value={form.authValue} />
        </>
      ) : null}
      {form.authType === "basic" ? (
        <>
          <ToolHubSettingsInput label={t("settings.toolhub.authUsername")} onChange={(value) => onUpdate("authUsername", value)} value={form.authUsername} />
          <ToolHubSettingsInput inputType="password" label={t("settings.toolhub.authPassword")} onChange={(value) => onUpdate("authPassword", value)} value={form.authPassword} />
        </>
      ) : null}
    </div>
  );
}

export function ToolHubSettingsInput({
  className,
  error,
  inputType = "text",
  label,
  onChange,
  placeholder,
  value
}: {
  className?: string;
  error?: string;
  inputType?: "password" | "text";
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      <input
        aria-invalid={Boolean(error)}
        className={cn(
          "h-8 w-full rounded-md border border-input bg-card px-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15",
          error && "border-destructive bg-destructive/5 focus:border-destructive focus:ring-destructive/15"
        )}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={inputType}
        value={value}
      />
      {error ? <p className="mt-1 text-[11px] leading-4 text-destructive">{error}</p> : null}
    </label>
  );
}

export function ToolHubSettingsTextArea({
  className,
  label,
  onChange,
  placeholder,
  value
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      <textarea
        className="h-20 w-full resize-none rounded-md border border-input bg-card px-2.5 py-2 text-[12px] leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

export function createToolHubMcpServerForm(server?: ToolHubUserMcpServerConfig): ToolHubMcpServerForm {
  const authForm = createToolHubAuthenticationForm(server);
  const headers = { ...(server?.headers ?? {}) };
  if (authForm.type === "bearer" || authForm.type === "basic") {
    deleteToolHubHeaderCaseInsensitive(headers, "authorization");
  } else if (authForm.type === "api-key") {
    deleteToolHubHeaderCaseInsensitive(headers, authForm.headerName);
  }

  return {
    id: server?.id ?? "",
    label: server?.label ?? "",
    enabled: server?.enabled ?? false,
    type: server?.type === "sse" ? "sse" : server?.type === "stdio" || (!server?.url && server?.command) ? "stdio" : "http",
    connectionType: server?.connectionType === "proxy" ? "proxy" : "direct",
    url: server?.url ?? "",
    command: server?.command ?? "",
    argsText: (server?.args ?? []).join("\n"),
    authHeaderName: authForm.headerName,
    authPassword: authForm.password,
    authToken: authForm.token,
    authType: authForm.type,
    authUsername: authForm.username,
    authValue: authForm.value,
    envRows: createToolHubKeyValueRows(server?.env),
    headers
  };
}

export function getToolHubTransportLabel(server: ToolHubUserMcpServerConfig): string {
  const type = server.type ?? (server.url ? "http" : "stdio");
  if (type === "sse") return "SSE";
  if (type === "stdio") return "stdio";
  return "Streamable HTTP";
}

export function createUniqueToolHubServerId(form: ToolHubMcpServerForm, servers: ToolHubUserMcpServerConfig[]): string {
  const source = form.id.trim() || form.label.trim() || getToolHubServerIdSource(form) || "mcp-server";
  const baseId = source
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 72) || "mcp-server";
  const existingIds = new Set(servers.map((server) => server.id));
  let candidate = /^[a-z0-9]/.test(baseId) ? baseId : `mcp-${baseId}`;
  if (!existingIds.has(candidate)) {
    return candidate;
  }
  for (let index = 2; index < 10_000; index += 1) {
    candidate = `${baseId.slice(0, 88)}-${index}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  return `mcp-server-${Date.now()}`;
}

export function getToolHubServerIdSource(form: ToolHubMcpServerForm): string {
  if (form.type === "stdio") {
    return form.command.trim();
  }
  try {
    const url = new URL(form.url.trim());
    return `${url.hostname}${url.pathname}` || url.hostname;
  } catch {
    return form.url.trim();
  }
}

export function getToolHubLlmSettingsFromForm(form: ToolHubLlmSettings, t: TFunction): { errors: ToolHubLlmFormErrors; value: ToolHubLlmSettings } {
  const apiKey = form.apiKey.trim();
  const baseUrl = form.baseUrl.trim();
  const model = form.model.trim();
  const errors: ToolHubLlmFormErrors = {};
  if (!baseUrl) {
    errors.baseUrl = t("settings.toolhub.llmBaseUrlRequired");
  } else {
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.baseUrl = t("settings.toolhub.invalidLlmBaseUrl");
      }
    } catch {
      errors.baseUrl = t("settings.toolhub.invalidLlmBaseUrl");
    }
  }
  if (!apiKey) {
    errors.apiKey = t("settings.toolhub.llmApiKeyRequired");
  }
  if (!model) {
    errors.model = t("settings.toolhub.llmModelRequired");
  }
  return { errors, value: { apiKey, baseUrl, model } };
}

export function hasToolHubLlmFormErrors(errors: ToolHubLlmFormErrors): boolean {
  return Boolean(errors.apiKey || errors.baseUrl || errors.model);
}

export function getToolHubMcpServerFromForm(form: ToolHubMcpServerForm, t: TFunction): { error: string | null; server: ToolHubUserMcpServerConfig | null } {
  const id = form.id.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id)) {
    return { error: t("settings.toolhub.invalidId"), server: null };
  }

  const args = form.argsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const env = normalizeToolHubEnvironmentRows(form.envRows, t);
  if (env.error) return { error: env.error, server: null };

  if (form.type === "http" || form.type === "sse") {
    const url = form.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      return { error: t("settings.toolhub.invalidHttpUrl"), server: null };
    }
    const authentication = getToolHubAuthenticationFromForm(form, t);
    if (authentication.error) {
      return { error: authentication.error, server: null };
    }
    const headers = getToolHubHeadersFromForm(form, authentication.value);
    return {
      error: null,
      server: {
        id,
        label: form.label.trim() || id,
        enabled: form.enabled,
        alwaysLoad: true,
        authentication: authentication.value,
        connectionType: form.connectionType,
        type: form.type,
        url,
        args: [],
        headers,
        env: {}
      }
    };
  }

  const command = form.command.trim();
  if (!command) {
    return { error: t("settings.toolhub.invalidCommand"), server: null };
  }
  return {
    error: null,
    server: {
      id,
      label: form.label.trim() || id,
      enabled: form.enabled,
      alwaysLoad: true,
      type: "stdio",
      command,
      args,
      headers: { ...form.headers },
      env: env.value
    }
  };
}

export function getToolHubMcpServerFormFromJsonText(text: string, t: TFunction): { error: string | null; form: ToolHubMcpServerForm | null } {
  const source = text.trim();
  if (!source) {
    return { error: t("settings.toolhub.invalidImportJson"), form: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { error: t("settings.toolhub.invalidImportJson"), form: null };
  }

  const importedServers = getToolHubMcpServersFromImportValue(parsed);
  const server = importedServers[0];
  if (!server) {
    return { error: t("settings.toolhub.invalidImportServer"), form: null };
  }

  return { error: null, form: createToolHubMcpServerForm(server) };
}

export function getToolHubMcpServersFromImportValue(value: unknown): ToolHubUserMcpServerConfig[] {
  const root = getToolHubImportRecord(value);
  if (!root) return [];

  const serverMap = getToolHubImportRecord(root.mcpServers);
  if (serverMap) {
    return Object.entries(serverMap)
      .map(([serverId, serverValue]) => normalizeToolHubImportedMcpServer(serverId, serverValue))
      .filter((server): server is ToolHubUserMcpServerConfig => Boolean(server));
  }

  const directServer = normalizeToolHubImportedMcpServer(getToolHubImportString(root.id) || "mcp-server", root);
  if (directServer) return [directServer];

  return Object.entries(root)
    .map(([serverId, serverValue]) => normalizeToolHubImportedMcpServer(serverId, serverValue))
    .filter((server): server is ToolHubUserMcpServerConfig => Boolean(server));
}

export function normalizeToolHubImportedMcpServer(serverId: string, value: unknown): ToolHubUserMcpServerConfig | null {
  const record = getToolHubImportRecord(value);
  if (!record) return null;

  const id = getToolHubImportString(record.id) || serverId.trim();
  const url = getToolHubImportString(record.url);
  const command = getToolHubImportString(record.command);
  if (!id || (!url && !command)) return null;

  const type = normalizeToolHubImportedTransport(record.type, Boolean(url), Boolean(command));
  if (!type) return null;

  return {
    id,
    label: getToolHubImportString(record.label) || getToolHubImportString(record.name) || id,
    enabled: typeof record.enabled === "boolean" ? record.enabled : false,
    alwaysLoad: typeof record.alwaysLoad === "boolean" ? record.alwaysLoad : true,
    args: getToolHubImportStringArray(record.args),
    authentication: normalizeToolHubImportedAuthentication(record.authentication),
    command: command || undefined,
    connectionType: record.connectionType === "proxy" ? "proxy" : "direct",
    description: getToolHubImportString(record.description) || undefined,
    env: getToolHubImportStringRecord(record.env),
    headers: getToolHubImportStringRecord(record.headers),
    type,
    url: url || undefined
  };
}

export function normalizeToolHubImportedTransport(value: unknown, hasUrl: boolean, hasCommand: boolean): ToolHubMcpServerFormTransport | null {
  const type = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_-]+/g, "") : "";
  if (type === "stdio") return "stdio";
  if (type === "sse") return hasUrl ? "sse" : null;
  if (type === "http" || type === "streamablehttp") return hasUrl ? "http" : null;
  if (hasCommand && !hasUrl) return "stdio";
  if (hasUrl) return "http";
  return null;
}

export function normalizeToolHubImportedAuthentication(value: unknown): ToolHubUserMcpServerConfig["authentication"] {
  const record = getToolHubImportRecord(value);
  if (!record) return undefined;

  const type = getToolHubImportString(record.type).toLowerCase();
  if (type === "bearer") {
    const token = getToolHubImportString(record.token);
    return token ? { type: "bearer", token } : undefined;
  }
  if (type === "api-key") {
    const headerName = getToolHubImportString(record.headerName) || "X-API-Key";
    const authValue = getToolHubImportString(record.value);
    return authValue ? { type: "api-key", headerName, value: authValue } : undefined;
  }
  if (type === "basic") {
    const username = getToolHubImportString(record.username);
    const password = typeof record.password === "string" ? record.password : "";
    return username || password ? { type: "basic", username, password } : undefined;
  }
  return undefined;
}

export function getToolHubHeadersFromForm(
  form: ToolHubMcpServerForm,
  authentication: ToolHubUserMcpServerConfig["authentication"]
): Record<string, string> {
  const headers = { ...form.headers };
  if (!authentication || authentication.type === "none") return headers;

  if (authentication.type === "bearer" || authentication.type === "basic") {
    deleteToolHubHeaderCaseInsensitive(headers, "authorization");
  } else if (authentication.type === "api-key") {
    deleteToolHubHeaderCaseInsensitive(headers, authentication.headerName);
  }
  return headers;
}

export function deleteToolHubHeaderCaseInsensitive(headers: Record<string, string>, headerName: string): void {
  const normalizedHeaderName = headerName.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === normalizedHeaderName) {
      delete headers[key];
    }
  }
}

export function getToolHubImportRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function getToolHubImportString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getToolHubImportStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function getToolHubImportStringRecord(value: unknown): Record<string, string> {
  const record = getToolHubImportRecord(value);
  if (!record) return {};

  return Object.fromEntries(
    Object.entries(record)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[0].trim()))
      .map(([key, entryValue]) => [key.trim(), entryValue])
  );
}

export function createToolHubAuthenticationForm(server?: ToolHubUserMcpServerConfig): {
  headerName: string;
  password: string;
  token: string;
  type: ToolHubMcpServerFormAuthType;
  username: string;
  value: string;
} {
  const authentication = server?.authentication;
  if (authentication?.type === "bearer") {
    return { headerName: "X-API-Key", password: "", token: authentication.token, type: "bearer", username: "", value: "" };
  }
  if (authentication?.type === "api-key") {
    return { headerName: authentication.headerName || "X-API-Key", password: "", token: "", type: "api-key", username: "", value: authentication.value };
  }
  if (authentication?.type === "basic") {
    return { headerName: "X-API-Key", password: authentication.password, token: "", type: "basic", username: authentication.username, value: "" };
  }
  const inferred = inferToolHubAuthenticationFromHeaders(server?.headers);
  if (inferred) {
    return inferred;
  }
  return { headerName: "X-API-Key", password: "", token: "", type: "none", username: "", value: "" };
}

export function inferToolHubAuthenticationFromHeaders(headers: Record<string, string> | undefined): ReturnType<typeof createToolHubAuthenticationForm> | null {
  const entries = Object.entries(headers ?? {});
  const authorization = entries.find(([key]) => key.toLowerCase() === "authorization");
  if (authorization) {
    const value = authorization[1].trim();
    if (/^bearer\s+/i.test(value)) {
      return { headerName: "X-API-Key", password: "", token: value.replace(/^bearer\s+/i, ""), type: "bearer", username: "", value: "" };
    }
    return { headerName: authorization[0], password: "", token: "", type: "api-key", username: "", value };
  }
  const firstEntry = entries[0];
  return firstEntry ? { headerName: firstEntry[0], password: "", token: "", type: "api-key", username: "", value: firstEntry[1] } : null;
}

export function getToolHubAuthenticationFromForm(form: ToolHubMcpServerForm, t: TFunction): { error: string | null; value: ToolHubUserMcpServerConfig["authentication"] } {
  if (form.authType === "none") {
    return { error: null, value: undefined };
  }
  if (form.authType === "bearer") {
    const token = form.authToken.trim();
    return token ? { error: null, value: { type: "bearer", token } } : { error: t("settings.toolhub.invalidAuthentication"), value: undefined };
  }
  if (form.authType === "api-key") {
    const headerName = form.authHeaderName.trim();
    const value = form.authValue.trim();
    return headerName && value ? { error: null, value: { type: "api-key", headerName, value } } : { error: t("settings.toolhub.invalidAuthentication"), value: undefined };
  }
  const username = form.authUsername.trim();
  const password = form.authPassword;
  return username ? { error: null, value: { type: "basic", username, password } } : { error: t("settings.toolhub.invalidAuthentication"), value: undefined };
}

export function createToolHubKeyValueRows(value: Record<string, string> | undefined): ToolHubKeyValueRow[] {
  const rows = Object.entries(value ?? {}).map(([key, entryValue]) => createToolHubKeyValueRow(key, entryValue));
  return rows.length ? rows : [createToolHubKeyValueRow()];
}

export function createToolHubKeyValueRow(key = "", value = ""): ToolHubKeyValueRow {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    key,
    value
  };
}

export function normalizeToolHubEnvironmentRows(rows: ToolHubKeyValueRow[], t: TFunction): { error: string | null; value: Record<string, string> } {
  const result: Record<string, string> = {};
  for (const [index, row] of rows.entries()) {
    const key = row.key.trim();
    const value = row.value;
    if (!key && !value) {
      continue;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return { error: t("settings.toolhub.invalidEnvKey", { line: index + 1 }), value: {} };
    }
    result[key] = value;
  }
  return { error: null, value: result };
}

export function PluginSettingsPanel({
  onPluginAction,
  pluginState,
  title
}: {
  onPluginAction: (
    action: "disable" | "enable" | "grant-permissions" | "install" | "reload" | "revoke-permissions" | "set-configuration" | "uninstall" | "update",
    payload?: unknown
  ) => Promise<void>;
  pluginState: AgentConsolePluginState;
  title: string;
}) {
  const { t } = useI18n();
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [marketplaceQuery, setMarketplaceQuery] = useState("");
  const [marketplaceSourceFilter, setMarketplaceSourceFilter] = useState<PluginMarketplaceSourceFilter>("all");
  const [selectedMarketplaceEntryKey, setSelectedMarketplaceEntryKey] = useState<string | null>(null);
  const warnings = [...pluginState.warnings, ...pluginState.plugins.flatMap((plugin) => plugin.warnings)];
  const installedPlugins = pluginState.plugins.filter((plugin) => plugin.installed);
  const marketplaceEntries = pluginState.marketplace;
  const marketplaceSourceOptions = useMemo(() => getPluginMarketplaceSourceOptions(t), [t]);
  const filteredMarketplaceEntries = useMemo(
    () => marketplaceEntries.filter((entry) =>
      matchesPluginMarketplaceQuery(entry, marketplaceQuery) &&
      matchesPluginMarketplaceSourceFilter(entry, marketplaceSourceFilter)
    ),
    [marketplaceEntries, marketplaceQuery, marketplaceSourceFilter]
  );
  const selectedMarketplaceEntry = selectedMarketplaceEntryKey
    ? marketplaceEntries.find((entry) => getPluginMarketplaceEntryKey(entry) === selectedMarketplaceEntryKey) ?? null
    : null;

  useEffect(() => {
    if (selectedMarketplaceEntryKey && !marketplaceEntries.some((entry) => getPluginMarketplaceEntryKey(entry) === selectedMarketplaceEntryKey)) {
      setSelectedMarketplaceEntryKey(null);
    }
  }, [marketplaceEntries, selectedMarketplaceEntryKey]);

  useEffect(() => {
    if (selectedMarketplaceEntryKey && !filteredMarketplaceEntries.some((entry) => getPluginMarketplaceEntryKey(entry) === selectedMarketplaceEntryKey)) {
      setSelectedMarketplaceEntryKey(null);
    }
  }, [filteredMarketplaceEntries, selectedMarketplaceEntryKey]);

  const closeMarketplace = useCallback(() => {
    setMarketplaceOpen(false);
    setMarketplaceQuery("");
    setMarketplaceSourceFilter("all");
    setSelectedMarketplaceEntryKey(null);
  }, []);

  return (
    <>
      <section className="settings-group mb-8">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <h3 className="settings-group-title text-[14px] font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{t("settings.integration.pluginsDescription")}</p>
          </div>
          <button
            aria-label={t("settings.integration.addPlugin")}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-background text-foreground outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/20"
            onClick={() => setMarketplaceOpen(true)}
            title={t("settings.integration.addPlugin")}
            type="button"
          >
            <Plus className="h-[14px] w-[14px]" />
          </button>
        </div>
        <div className="space-y-3 py-4">
          {installedPlugins.length ? (
            <div className="space-y-2">
              {installedPlugins.map((plugin) => (
                <PluginInstalledCard key={plugin.id} onPluginAction={onPluginAction} plugin={plugin} />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-[12px] text-muted-foreground">{t("settings.integration.noInstalledPlugins")}</div>
          )}

          {warnings.map((warning, index) => (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1.5 text-[12px] leading-5 text-destructive" key={`${warning}-${index}`}>
              {warning}
            </div>
          ))}
        </div>
      </section>

      <AnimatePresence>
        {marketplaceOpen ? (
          <AgentSettingsDialog
            contentClassName="overflow-hidden"
            dialogClassName="w-[min(94vw,900px)] max-w-none"
            key="plugin-marketplace-dialog"
            onClose={closeMarketplace}
            title={t("settings.integration.marketplaceTitle")}
          >
            <motion.div className="flex h-[calc(86vh-96px)] min-h-[320px] max-h-[608px] gap-3 overflow-hidden" layout>
              <motion.div
                className={cn(
                  "flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card",
                  selectedMarketplaceEntry ? "w-[300px] shrink-0" : "w-full"
                )}
                layout
                transition={popoverSpringTransition}
              >
                <div className="sticky top-0 z-10 flex gap-1.5 border-b border-border bg-card p-1.5">
                  <label className="relative block min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-muted-foreground" />
                    <input
                      aria-label={t("settings.integration.searchPlugins")}
                      className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-[12px] text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-ring/20"
                      onChange={(event) => setMarketplaceQuery(event.target.value)}
                      placeholder={t("settings.integration.searchPlugins")}
                      value={marketplaceQuery}
                    />
                  </label>
                  <Select
                    aria-label={t("settings.integration.sourceFilter")}
                    className="w-[136px] shrink-0"
                    onValueChange={(value) => setMarketplaceSourceFilter(value as PluginMarketplaceSourceFilter)}
                    options={marketplaceSourceOptions}
                    selectClassName="h-8 w-full max-w-none border border-border bg-background px-2"
                    value={marketplaceSourceFilter}
                  />
                </div>
                {marketplaceEntries.length ? (
                  <div className="min-h-0 flex-1 overflow-auto p-1.5">
                    {filteredMarketplaceEntries.length ? filteredMarketplaceEntries.map((entry) => {
                      const entryKey = getPluginMarketplaceEntryKey(entry);
                      const selected = selectedMarketplaceEntryKey === entryKey;
                      const installable = isPluginMarketplaceEntryInstallable(entry);
                      return (
                        <div
                          className={cn(
                            "flex w-full min-w-0 items-center gap-1 rounded-md transition",
                            selected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                          )}
                          key={entryKey}
                        >
                          <button
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                            onClick={() => setSelectedMarketplaceEntryKey(entryKey)}
                            type="button"
                          >
                            <PluginIcon iconDataUrl={entry.iconDataUrl} iconUrl={entry.iconUrl} label={entry.label} />
                            <span className="min-w-0 flex-1">
                              <span className="block w-full truncate text-[13px] font-medium">{entry.label}</span>
                              <span className={cn("mt-1 block w-full truncate text-[11px]", selected ? "text-accent-foreground/75" : "text-muted-foreground")}>
                                {getPluginSourceTypeLabel(entry.sourceType, t)} · {entry.id}{entry.version ? ` · ${entry.version}` : ""}{entry.installed ? ` · ${t("settings.integration.installedStatus")}` : ""}
                              </span>
                            </span>
                          </button>
                          <button
                            aria-label={entry.installed ? t("settings.integration.installedStatus") : t("settings.integration.addMarketplacePlugin")}
                            className={cn(
                              "mr-1 inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50",
                              selected
                                ? "border-primary/25 bg-background/70 text-foreground hover:bg-background"
                                : "border-border bg-background text-foreground hover:bg-card"
                            )}
                            disabled={entry.installed || !installable}
                            onClick={() => void onPluginAction("install", getPluginMarketplaceActionPayload(entry))}
                            title={entry.installed ? t("settings.integration.installedStatus") : installable ? t("settings.integration.installPlugin") : t("settings.integration.installUnavailable")}
                            type="button"
                          >
                            {entry.installed ? <CheckCircle2 className="h-[12px] w-[12px] text-primary" /> : <Plus className="h-[12px] w-[12px]" />}
                            <span>{entry.installed ? t("settings.integration.installedStatus") : t("settings.integration.addMarketplacePlugin")}</span>
                          </button>
                        </div>
                      );
                    }) : (
                      <div className="grid min-h-[220px] place-items-center px-4 text-center text-[12px] leading-5 text-muted-foreground">
                        {t("settings.integration.noMarketplaceSearchResults")}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid min-h-[220px] place-items-center px-4 text-center text-[12px] leading-5 text-muted-foreground">
                    {t("settings.integration.noMarketplaceEntries")}
                  </div>
                )}
              </motion.div>

              <AnimatePresence>
                {selectedMarketplaceEntry ? (
                  <motion.div
                    animate={{ opacity: 1 }}
                    className="min-h-0 min-w-0 flex-1"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    key="plugin-marketplace-details"
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    <PluginMarketplaceDetails
                      entry={selectedMarketplaceEntry}
                      onPluginAction={onPluginAction}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          </AgentSettingsDialog>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function getPluginMarketplaceEntryKey(entry: AgentConsolePluginMarketplaceEntry): string {
  return entry.marketplaceKey || `${entry.sourceType}:${entry.id}`;
}

export type PluginMarketplaceSourceFilter = "all" | Extract<AgentConsolePluginSourceType, "claude" | "codex" | "marketplace">;

export function getPluginMarketplaceActionPayload(entry: AgentConsolePluginMarketplaceEntry) {
  return {
    installUrl: entry.installUrl,
    manifestPath: entry.manifestPath,
    marketplaceKey: entry.marketplaceKey,
    packagePath: entry.packagePath,
    pluginId: entry.id
  };
}

export function isPluginMarketplaceEntryInstallable(entry: AgentConsolePluginMarketplaceEntry): boolean {
  return Boolean(entry.installable || entry.installUrl || entry.manifestPath || entry.packagePath);
}

export function getPluginMarketplaceSourceOptions(t: TFunction) {
  return [
    { label: t("settings.integration.source.all"), value: "all" },
    { label: "codex", value: "codex" },
    { label: "claude", value: "claude" },
    { label: "marketplace", value: "marketplace" }
  ];
}

export function matchesPluginMarketplaceQuery(entry: AgentConsolePluginMarketplaceEntry, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    entry.id,
    entry.label,
    entry.description,
    entry.remoteId,
    entry.sourceType,
    entry.version
  ].some((value) => value?.toLowerCase().includes(normalizedQuery));
}

export function matchesPluginMarketplaceSourceFilter(entry: AgentConsolePluginMarketplaceEntry, sourceFilter: PluginMarketplaceSourceFilter): boolean {
  return sourceFilter === "all" || entry.sourceType === sourceFilter;
}

export function getPluginSourceTypeLabel(sourceType: AgentConsolePluginMarketplaceEntry["sourceType"], t: TFunction): string {
  if (sourceType === "codex") return t("settings.integration.source.codex");
  if (sourceType === "claude") return t("settings.integration.source.claude");
  if (sourceType === "development") return t("settings.integration.source.development");
  if (sourceType === "bundled") return t("settings.integration.source.bundled");
  if (sourceType === "user") return t("settings.integration.source.user");
  return t("settings.integration.source.marketplace");
}

export function PluginIcon({
  className,
  iconDataUrl,
  iconUrl,
  label
}: {
  className?: string;
  iconDataUrl?: string;
  iconUrl?: string;
  label: string;
}) {
  const fallback = label.trim().slice(0, 1).toUpperCase() || "?";
  const imageUrl = iconDataUrl || iconUrl;
  return (
    <span className={cn("grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-background text-[12px] font-semibold text-muted-foreground", className)}>
      {imageUrl ? (
        <img alt="" className="h-full w-full object-contain" draggable={false} src={imageUrl} />
      ) : (
        fallback
      )}
    </span>
  );
}

export function PluginMarketplaceDetails({
  entry,
  onPluginAction
}: {
  entry: AgentConsolePluginMarketplaceEntry;
  onPluginAction: (
    action: "disable" | "enable" | "grant-permissions" | "install" | "reload" | "revoke-permissions" | "set-configuration" | "uninstall" | "update",
    payload?: unknown
  ) => Promise<void>;
}) {
  const { t } = useI18n();

  const actionPayload = getPluginMarketplaceActionPayload(entry);
  const installable = isPluginMarketplaceEntryInstallable(entry);

  return (
    <div className="h-full min-h-0 overflow-auto rounded-md border border-border bg-card p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PluginIcon className="h-10 w-10 text-[15px]" iconDataUrl={entry.iconDataUrl} iconUrl={entry.iconUrl} label={entry.label} />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-foreground">{entry.label}</h3>
            <p className="mt-1 truncate text-[12px] text-muted-foreground">{entry.id}</p>
          </div>
        </div>
        <span className={cn(
          "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px]",
          entry.installed ? "border-primary/30 bg-accent text-primary" : "border-border bg-background text-muted-foreground"
        )}>
          {entry.installed ? t("settings.integration.installedStatus") : installable ? t("settings.integration.availableStatus") : t("settings.integration.marketplaceOnlyStatus")}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <PluginMarketplaceDetailRow label={t("settings.integration.versionLabel")} value={entry.version || "-"} />
        <PluginMarketplaceDetailRow label={t("settings.integration.sourceLabel")} value={getPluginSourceTypeLabel(entry.sourceType, t)} />
        {entry.installUrl ? (
          <PluginMarketplaceDetailRow label={t("settings.integration.installUrlLabel")} value={entry.installUrl} />
        ) : null}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="mb-1.5 text-[12px] font-medium text-foreground">{t("settings.integration.descriptionLabel")}</div>
        <p className="text-[12px] leading-5 text-muted-foreground">{entry.description || t("settings.integration.noDescription")}</p>
      </div>

      <div className="mt-4 flex justify-end">
        {entry.installed ? (
          <PluginActionButton label={t("settings.integration.updatePlugin")} onClick={() => onPluginAction("update", actionPayload)} />
        ) : (
          <PluginActionButton
            disabled={!installable}
            label={installable ? t("settings.integration.installPlugin") : t("settings.integration.installUnavailable")}
            onClick={() => onPluginAction("install", actionPayload)}
          />
        )}
      </div>
    </div>
  );
}

export function PluginMarketplaceDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-[12px] leading-5">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-foreground">{value}</div>
    </div>
  );
}

export function PluginInstalledCard({
  onPluginAction,
  plugin
}: {
  onPluginAction: (
    action: "disable" | "enable" | "grant-permissions" | "install" | "reload" | "revoke-permissions" | "set-configuration" | "uninstall" | "update",
    payload?: unknown
  ) => Promise<void>;
  plugin: AgentConsolePluginInfo;
}) {
  const hasEffectiveGrant = useCallback(
    (permission: AgentConsolePluginInfo["permissions"][number]) =>
      plugin.grants.some((grant) =>
        grant.id === permission.id &&
        (!permission.constraintDigest || grant.constraintDigest === permission.constraintDigest)
      ),
    [plugin.grants]
  );
  const missingPermissionIds = plugin.permissions.filter((permission) => !hasEffectiveGrant(permission)).map((permission) => permission.id);
  const [configurationDraft, setConfigurationDraft] = useState<Record<string, boolean | number | string>>(() => plugin.configuration?.values ?? {});

  useEffect(() => {
    setConfigurationDraft(plugin.configuration?.values ?? {});
  }, [plugin.configuration?.values, plugin.id]);

  const confirmPluginPermissions = useCallback((ids: string[]) => {
    if (!ids.length) return true;
    const permissions = plugin.permissions.filter((permission) => ids.includes(permission.id));
    const highRisk = permissions.filter((permission) => permission.risk === "high").map((permission) => permission.id);
    const message = highRisk.length
      ? `Grant high-risk plugin permissions?\n\n${highRisk.join("\n")}`
      : `Grant plugin permissions?\n\n${ids.join("\n")}`;
    return window.confirm(message);
  }, [plugin.permissions]);

  const enablePluginWithReview = useCallback(async () => {
    if (missingPermissionIds.length && !confirmPluginPermissions(missingPermissionIds)) return;
    await onPluginAction(
      "enable",
      missingPermissionIds.length
        ? { permissionIds: missingPermissionIds, pluginId: plugin.id }
        : { pluginId: plugin.id }
    );
  }, [confirmPluginPermissions, missingPermissionIds, onPluginAction, plugin.id]);

  const grantPermissions = useCallback(async (ids: string[]) => {
    if (!confirmPluginPermissions(ids)) return;
    await onPluginAction("grant-permissions", { permissionIds: ids, pluginId: plugin.id });
  }, [confirmPluginPermissions, onPluginAction, plugin.id]);

  const revokePermissions = useCallback(async (ids: string[]) => {
    const confirmed = window.confirm(`Revoke plugin permissions?\n\n${ids.join("\n")}`);
    if (!confirmed) return;
    await onPluginAction("revoke-permissions", { permissionIds: ids, pluginId: plugin.id });
  }, [onPluginAction, plugin.id]);

  return (
    <div className="rounded-md border border-border bg-card px-3 py-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <PluginIcon iconDataUrl={plugin.iconDataUrl} label={plugin.label} />
          <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-[13px] font-medium text-foreground">{plugin.label}</div>
            <PluginStatusBadge plugin={plugin} />
          </div>
          <p className="mt-1 truncate text-[12px] text-muted-foreground" title={plugin.manifestPath}>
            {plugin.id}{plugin.version ? ` · ${plugin.version}` : ""} · {plugin.sourceType} · {plugin.signature.status}
          </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SettingsSwitch
            checked={plugin.enabled}
            disabled={plugin.lifecycleState === "quarantined"}
            onChange={(checked) => {
              void (checked ? enablePluginWithReview() : onPluginAction("disable", { pluginId: plugin.id }));
            }}
          />
          <PluginActionButton label="Update" onClick={() => onPluginAction("update", { pluginId: plugin.id })} />
          <PluginActionButton danger label="Uninstall" onClick={() => onPluginAction("uninstall", { pluginId: plugin.id })} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <PluginMetric label="Panels" value={plugin.rightSidebarPanels.length} />
        <PluginMetric label="MCP" value={plugin.mcpServers.length} />
        <PluginMetric label="Commands" value={plugin.commands.length} />
        <PluginMetric label="Menus" value={plugin.menus.length} />
        <PluginMetric label="Shortcuts" value={plugin.shortcuts.length} />
        <PluginMetric label="Files" value={plugin.fileTreeItems.length} />
        <PluginMetric label="Skills" value={plugin.agentSkills.length} />
        <PluginMetric label="Automations" value={plugin.automationTemplates.length} />
      </div>

      {plugin.permissions.length ? (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="text-[12px] font-medium text-foreground">Permissions</div>
            {missingPermissionIds.length ? (
              <PluginActionButton
                label="Grant all"
                onClick={() => grantPermissions(missingPermissionIds)}
              />
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {plugin.permissions.map((permission) => (
              <button
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[11px] transition hover:bg-muted",
                  hasEffectiveGrant(permission)
                    ? "border-border bg-background text-muted-foreground"
                    : "border-amber-400/40 bg-amber-400/10 text-amber-700"
                )}
                key={permission.id}
                onClick={() => {
                  void (hasEffectiveGrant(permission) ? revokePermissions([permission.id]) : grantPermissions([permission.id]));
                }}
                title={[permission.reason, permission.constraintLabel].filter(Boolean).join("\n") || permission.id}
                type="button"
              >
                {permission.id}{hasEffectiveGrant(permission) ? "" : " (missing)"}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {plugin.configuration ? (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-2 text-[12px] font-medium text-foreground">{plugin.configuration.title}</div>
          <div className="space-y-2">
            {plugin.configuration.properties.map((property) => (
              <div className="flex min-w-0 items-center justify-between gap-3" key={property.key}>
                <div className="min-w-0">
                  <div className="truncate text-[12px] text-foreground">{property.title ?? property.key}</div>
                  {property.description ? <div className="truncate text-[11px] text-muted-foreground">{property.description}</div> : null}
                </div>
                <PluginConfigurationInput
                  property={property}
                  value={configurationDraft[property.key] ?? property.default ?? ""}
                  onChange={(value) => setConfigurationDraft((currentValues) => ({ ...currentValues, [property.key]: value }))}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <PluginActionButton label="Save settings" onClick={() => onPluginAction("set-configuration", { pluginId: plugin.id, values: configurationDraft })} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PluginConfigurationInput({
  onChange,
  property,
  value
}: {
  onChange: (value: boolean | number | string) => void;
  property: NonNullable<AgentConsolePluginInfo["configuration"]>["properties"][number];
  value: boolean | number | string;
}) {
  if (property.type === "boolean") {
    return <SettingsSwitch checked={Boolean(value)} onChange={onChange} />;
  }

  if (property.enum?.length) {
    return (
      <Select
        className="w-[180px]"
        onValueChange={(nextValue) => onChange(nextValue)}
        options={property.enum.map((option) => ({ label: option, value: option }))}
        value={String(value)}
      />
    );
  }

  return (
    <input
      className="h-7 w-[180px] rounded-md border border-input bg-background px-2 text-[12px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/15"
      max={property.maximum}
      min={property.minimum}
      onChange={(event) => onChange(property.type === "number" ? Number(event.target.value) : event.target.value)}
      type={property.type === "number" ? "number" : "text"}
      value={String(value)}
    />
  );
}

export function PluginStatusBadge({ plugin }: { plugin: AgentConsolePluginInfo }) {
  const label = plugin.lifecycleState === "quarantined" ? "quarantined" : plugin.enabled ? "enabled" : plugin.lifecycleState;
  return (
    <span
      className={cn(
        "rounded-md border px-1.5 py-0.5 text-[11px]",
        plugin.lifecycleState === "quarantined"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : plugin.enabled
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
            : "border-border bg-background text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
}

export function PluginMetric({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {label}: {value}
    </span>
  );
}

export function PluginActionButton({
  danger = false,
  disabled = false,
  label,
  onClick
}: {
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      className={cn(
        "h-7 rounded-md border px-2 text-[12px] transition disabled:cursor-not-allowed disabled:opacity-50",
        danger
          ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15"
          : "border-border bg-background text-foreground hover:bg-muted"
      )}
      disabled={disabled}
      onClick={() => {
        void onClick();
      }}
      type="button"
    >
      {label}
    </button>
  );
}

export function BotGatewaySettingsPanel({
  title = "default"
}: {
  title?: "default" | string | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<BotGatewayStatus | null>(null);
  const [channels, setChannels] = useState<BotGatewayChannelManifest[]>([]);
  const [integrations, setIntegrations] = useState<BotGatewayIntegration[]>([]);
  const [draft, setDraft] = useState<BotGatewayIntegrationDraft>(() => createDefaultBotGatewayIntegrationDraft("feishu"));
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [integrationBusyId, setIntegrationBusyId] = useState<string | null>(null);
  const [qrLogin, setQrLogin] = useState<BotGatewayQrLoginState>(() => createBotGatewayIdleQrLoginState());
  const qrLoginGenerationRef = useRef(0);
  const enabled = Boolean(status?.connected);

  const refresh = useCallback(async () => {
    const botApi = window.agentConsole?.bot;
    if (!botApi) {
      setError(t("settings.botGateway.apiUnavailable"));
      return;
    }

    const nextStatus = await botApi.getStatus();
    setStatus(nextStatus);
    if (!nextStatus.connected) {
      setChannels([]);
      setIntegrations([]);
      return;
    }

    const [channelResult, integrationResult] = await Promise.all([
      botApi.listChannels(),
      botApi.listIntegrations()
    ]);
    setChannels(channelResult.channels);
    setIntegrations(integrationResult.integrations);
  }, [t]);

  useEffect(() => {
    void refresh().catch((refreshError) => {
      setError(getErrorMessage(refreshError, t("settings.botGateway.refreshFailed")));
    });
  }, [refresh, t]);

  const setBotEnabled = useCallback(async (enabled: boolean) => {
    const botApi = window.agentConsole?.bot;
    if (!botApi) {
      setError(t("settings.botGateway.apiUnavailable"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        const result = await botApi.connect({ transport: "stdio" });
        setStatus(result.status);
        toast.success({ content: t("settings.botGateway.started"), title: t("settings.botGateway.title") });
      } else {
        const result = await botApi.disconnect();
        setStatus(result.status);
        setChannels([]);
        setIntegrations([]);
        setAddChannelOpen(false);
        toast.success({ content: t("settings.botGateway.stopped"), title: t("settings.botGateway.title") });
      }

      await refresh();
    } catch (actionError) {
      const message = getErrorMessage(actionError, t("settings.botGateway.actionFailed"));
      setError(message);
      toast.error({ content: message, title: t("settings.botGateway.title") });
    } finally {
      setBusy(false);
    }
  }, [refresh, t, toast]);

  const platformOptions = useMemo(() => getBotGatewayPlatformOptions(channels), [channels]);
  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.platform === draft.platform),
    [channels, draft.platform]
  );
  const fieldDefinitions = useMemo(() => getBotGatewayFieldDefinitions(draft.platform, selectedChannel), [draft.platform, selectedChannel]);

  const selectDraftPlatform = useCallback((platform: string) => {
    setDraft(createDefaultBotGatewayIntegrationDraft(platform, channels.find((channel) => channel.platform === platform)));
  }, [channels]);

  const resetQrLogin = useCallback(() => {
    qrLoginGenerationRef.current += 1;
    setQrLogin(createBotGatewayIdleQrLoginState());
  }, []);

  const startWeixinIlinkQrLogin = useCallback(async (force = true) => {
    const botApi = window.agentConsole?.bot;
    if (!botApi) {
      setQrLogin({
        ...createBotGatewayIdleQrLoginState(),
        error: t("settings.botGateway.apiUnavailable"),
        message: t("settings.botGateway.apiUnavailable"),
        status: "failed"
      });
      return;
    }

    const generation = qrLoginGenerationRef.current + 1;
    qrLoginGenerationRef.current = generation;
    const platform = "weixin-ilink";
    const channel = channels.find((candidate) => candidate.platform === platform);
    const integrationId = getDefaultBotGatewayIntegrationId(platform);
    setDraft(createDefaultBotGatewayIntegrationDraft(platform, channel));
    setQrLogin({
      ...createBotGatewayIdleQrLoginState(),
      message: t("settings.botGateway.weixinQrStarting"),
      status: "starting"
    });

    try {
      const response = await botApi.startQrLogin({
        config: getBotGatewayDefaultConfig(platform, channel),
        force,
        integrationId,
        platform,
        tenantId: botGatewayManagedTenantId
      });
      if (qrLoginGenerationRef.current !== generation) return;
      setQrLogin({
        expiresAt: response.result.expiresAt,
        message: response.result.message || t("settings.botGateway.weixinQrTitle"),
        qrDisplay: normalizeBotGatewayQrDisplay(response.result.qrCodeUrl || ""),
        sessionId: response.result.sessionId,
        status: "pending"
      });
    } catch (startError) {
      if (qrLoginGenerationRef.current !== generation) return;
      const message = getErrorMessage(startError, t("settings.botGateway.actionFailed"));
      setQrLogin({
        ...createBotGatewayIdleQrLoginState(),
        error: message,
        message,
        status: "failed"
      });
    }
  }, [channels, t]);

  const updateDraftField = useCallback((key: string, value: boolean | string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      fieldValues: {
        ...currentDraft.fieldValues,
        [key]: value
      }
    }));
  }, []);

  useEffect(() => {
    if (!enabled || !addChannelOpen || draft.platform !== "weixin-ilink") {
      resetQrLogin();
      return;
    }

    if (qrLogin.status === "idle") {
      void startWeixinIlinkQrLogin(true);
    }
  }, [addChannelOpen, draft.platform, enabled, qrLogin.status, resetQrLogin, startWeixinIlinkQrLogin]);

  useEffect(() => {
    if (!enabled || !addChannelOpen || draft.platform !== "weixin-ilink" || !qrLogin.sessionId || isTerminalBotGatewayQrStatus(qrLogin.status)) {
      return;
    }

    const botApi = window.agentConsole?.bot;
    if (!botApi) return;

    const generation = qrLoginGenerationRef.current;
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const result = await botApi.waitQrLogin({
          autoStart: true,
          config: getBotGatewayDefaultConfig("weixin-ilink", selectedChannel),
          integrationId: draft.id,
          platform: "weixin-ilink",
          sessionId: qrLogin.sessionId,
          tenantId: draft.tenantId,
          timeoutMs: 30_000
        });
        if (cancelled || qrLoginGenerationRef.current !== generation) return;

        setQrLogin((current) => current.sessionId === result.result.sessionId
          ? {
              ...current,
              message: result.result.message || current.message,
              status: normalizeBotGatewayQrStatus(result.result.status)
            }
          : current);

        if (result.result.status === "confirmed") {
          setStatus(result.status);
          toast.success({ content: t("settings.botGateway.weixinQrConfirmed"), title: t("settings.botGateway.title") });
          await refresh();
          if (!cancelled && qrLoginGenerationRef.current === generation) {
            setAddChannelOpen(false);
          }
          return;
        }

        if (!isTerminalBotGatewayQrStatus(result.result.status)) {
          timer = window.setTimeout(poll, 800);
        }
      } catch (waitError) {
        if (cancelled || qrLoginGenerationRef.current !== generation) return;
        const message = getErrorMessage(waitError, t("settings.botGateway.actionFailed"));
        setQrLogin((current) => ({
          ...current,
          error: message,
          message
        }));
        timer = window.setTimeout(poll, 2_500);
      }
    };

    timer = window.setTimeout(poll, 500);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [addChannelOpen, draft.id, draft.platform, draft.tenantId, enabled, qrLogin.sessionId, qrLogin.status, refresh, selectedChannel, t, toast]);

  const saveDraft = useCallback(async () => {
    const botApi = window.agentConsole?.bot;
    if (!botApi) {
      setError(t("settings.botGateway.apiUnavailable"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const existingIntegration = integrations.find((integration) => integration.id === draft.id.trim());
      if ((existingIntegration?.credentialKeys?.length ?? 0) > 0 && hasBotGatewayCredentialFields(fieldDefinitions) && !hasBotGatewayDraftCredentials(draft, fieldDefinitions)) {
        throw new Error(t("settings.botGateway.credentialsRequiredForOverwrite"));
      }
      const payload = buildBotGatewayIntegrationPayload(draft, fieldDefinitions, selectedChannel);
      const result = await botApi.createIntegration(payload);
      setStatus(result.status);
      toast.success({ content: t("settings.botGateway.integrationSaved"), title: t("settings.botGateway.title") });
      await refresh();
      setAddChannelOpen(false);
    } catch (saveError) {
      const message = getErrorMessage(saveError, t("settings.botGateway.integrationSaveFailed"));
      setError(message);
      toast.error({ content: message, title: t("settings.botGateway.title") });
    } finally {
      setBusy(false);
    }
  }, [draft, fieldDefinitions, integrations, refresh, selectedChannel, t, toast]);

  const configureFromIntegration = useCallback((integration: BotGatewayIntegration) => {
    setDraft(createBotGatewayDraftFromIntegration(integration, channels.find((channel) => channel.platform === integration.platform)));
    setAddChannelOpen(true);
  }, [channels]);

  const runIntegrationAction = useCallback(async (action: "start" | "stop", integrationId: string) => {
    const botApi = window.agentConsole?.bot;
    if (!botApi) {
      setError(t("settings.botGateway.apiUnavailable"));
      return;
    }

    setIntegrationBusyId(integrationId);
    setError(null);
    try {
      const result = action === "start"
        ? await botApi.startIntegration({ integrationId })
        : await botApi.stopIntegration({ integrationId });
      setStatus(result.status);
      toast.success({
        content: action === "start" ? t("settings.botGateway.integrationStarted") : t("settings.botGateway.integrationStopped"),
        title: t("settings.botGateway.title")
      });
      await refresh();
    } catch (actionError) {
      const message = getErrorMessage(actionError, t("settings.botGateway.integrationActionFailed"));
      setError(message);
      toast.error({ content: message, title: t("settings.botGateway.title") });
    } finally {
      setIntegrationBusyId(null);
    }
  }, [refresh, t, toast]);

  return (
    <SettingsGroup title={title === "default" ? t("settings.botGateway.title") : title}>
      <SettingsRow description={t("settings.botGateway.enableDescription")} label={t("settings.botGateway.enable")}>
        <div className="flex items-center gap-2">
          {busy ? <Loader2 className="h-[14px] w-[14px] animate-spin text-muted-foreground" /> : null}
          <SettingsSwitch
            ariaLabel={t("settings.botGateway.enable")}
            checked={enabled}
            disabled={busy}
            onChange={(checked) => void setBotEnabled(checked)}
          />
        </div>
      </SettingsRow>
      {error || status?.lastError ? (
        <div className="mx-1 mb-3 flex min-w-0 items-start gap-1.5 rounded-md border border-destructive/20 bg-destructive/10 px-2.5 py-2 text-[12px] leading-5 text-destructive">
          <AlertCircle className="mt-0.5 h-[13px] w-[13px] shrink-0" />
          <span className="min-w-0 break-words">{error || status?.lastError}</span>
        </div>
      ) : null}
      {enabled ? (
        <div className="px-1 py-3">
          <div className="mb-2 flex items-center justify-end">
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              onClick={() => {
                const platform = getDefaultBotGatewayAddPlatform(platformOptions);
                setDraft(createDefaultBotGatewayIntegrationDraft(platform, channels.find((channel) => channel.platform === platform)));
                setAddChannelOpen(true);
              }}
              type="button"
            >
              <Plus className="h-[13px] w-[13px]" />
              <span>{t("settings.botGateway.addChannel")}</span>
            </button>
          </div>
          <BotGatewayIntegrationList
            busy={busy}
            channels={channels}
            integrationBusyId={integrationBusyId}
            integrations={integrations}
            onConfigure={configureFromIntegration}
            onStart={(integrationId) => void runIntegrationAction("start", integrationId)}
            onStop={(integrationId) => void runIntegrationAction("stop", integrationId)}
          />
        </div>
      ) : null}
      <BotGatewayAddChannelDialog
        busy={busy}
        draft={draft}
        fieldDefinitions={fieldDefinitions}
        onClose={() => setAddChannelOpen(false)}
        onFieldChange={updateDraftField}
        onPlatformChange={selectDraftPlatform}
        onQrRefresh={() => void startWeixinIlinkQrLogin(true)}
        onSave={() => void saveDraft()}
        open={enabled && addChannelOpen}
        platformOptions={platformOptions}
        qrLogin={qrLogin}
      />
    </SettingsGroup>
  );
}

export function BotGatewayAddChannelDialog({
  busy,
  draft,
  fieldDefinitions,
  onClose,
  onFieldChange,
  onPlatformChange,
  onQrRefresh,
  onSave,
  open,
  platformOptions,
  qrLogin
}: {
  busy: boolean;
  draft: BotGatewayIntegrationDraft;
  fieldDefinitions: BotGatewayFieldDefinition[];
  onClose: () => void;
  onFieldChange: (key: string, value: boolean | string) => void;
  onPlatformChange: (platform: string) => void;
  onQrRefresh: () => void;
  onSave: () => void;
  open: boolean;
  platformOptions: { label: string; value: string }[];
  qrLogin: BotGatewayQrLoginState;
}) {
  const { t } = useI18n();
  const qrMode = draft.platform === "weixin-ilink";

  return (
    <AnimatePresence>
      {open ? (
        <AgentSettingsDialog
          dialogClassName="max-h-[calc(100vh-16px)] w-[min(92vw,560px)] max-w-none"
          footer={qrMode ? undefined : (
            <div className="flex min-h-8 items-center justify-end gap-3">
              <button
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
                onClick={onSave}
                type="button"
              >
                {busy ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Save className="h-[13px] w-[13px]" />}
                <span>{t("settings.botGateway.saveIntegration")}</span>
              </button>
            </div>
          )}
          key="bot-add-channel"
          onClose={onClose}
          title={t("settings.botGateway.addChannel")}
        >
          <BotGatewayIntegrationForm
            draft={draft}
            fieldDefinitions={fieldDefinitions}
            onFieldChange={onFieldChange}
            onPlatformChange={onPlatformChange}
            onQrRefresh={onQrRefresh}
            platformOptions={platformOptions}
            qrLogin={qrLogin}
          />
        </AgentSettingsDialog>
      ) : null}
    </AnimatePresence>
  );
}

export function BotGatewayIntegrationForm({
  draft,
  fieldDefinitions,
  onFieldChange,
  onPlatformChange,
  onQrRefresh,
  platformOptions,
  qrLogin
}: {
  draft: BotGatewayIntegrationDraft;
  fieldDefinitions: BotGatewayFieldDefinition[];
  onFieldChange: (key: string, value: boolean | string) => void;
  onPlatformChange: (platform: string) => void;
  onQrRefresh: () => void;
  platformOptions: { label: string; value: string }[];
  qrLogin: BotGatewayQrLoginState;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <div className="grid min-w-0 grid-cols-1 gap-2">
        <BotGatewayFormField label={t("settings.botGateway.platform")}>
          <Select
            aria-label={t("settings.botGateway.platform")}
            className="w-full"
            onValueChange={onPlatformChange}
            options={platformOptions}
            menuClassName="max-w-[min(360px,calc(100vw-32px))]"
            selectClassName="w-full max-w-none justify-between border border-border bg-card"
            value={draft.platform}
          />
        </BotGatewayFormField>
      </div>

      {fieldDefinitions.length ? (
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          {fieldDefinitions.map((field) => (
            <BotGatewayDynamicField
              field={field}
              key={`${field.target}:${field.key}`}
              onChange={(value) => onFieldChange(field.key, value)}
              value={draft.fieldValues[field.key] ?? ""}
            />
          ))}
        </div>
      ) : null}

      {draft.platform === "weixin-ilink" ? (
        <BotGatewayWeixinQrPanel
          onRefresh={onQrRefresh}
          qrLogin={qrLogin}
        />
      ) : null}
    </div>
  );
}

export function BotGatewayWeixinQrPanel({
  onRefresh,
  qrLogin
}: {
  onRefresh: () => void;
  qrLogin: BotGatewayQrLoginState;
}) {
  const { t } = useI18n();
  const terminal = isTerminalBotGatewayQrStatus(qrLogin.status);
  const confirmed = qrLogin.status === "confirmed";
  const pending = qrLogin.status === "starting" || qrLogin.status === "pending" || qrLogin.status === "scanned" || qrLogin.status === "needs_verification";

  return (
    <div className="rounded-md border border-border bg-card/45 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 text-[12px] font-medium text-foreground">{t("settings.botGateway.weixinQrTitle")}</div>
        <button
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[12px] font-medium text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={qrLogin.status === "starting"}
          onClick={onRefresh}
          type="button"
        >
          {qrLogin.status === "starting" ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <RotateCcw className="h-[13px] w-[13px]" />}
          <span>{t("settings.botGateway.weixinQrRefresh")}</span>
        </button>
      </div>

      <div className="mx-auto flex h-[clamp(520px,calc(100vh-300px),720px)] w-full max-w-[420px] items-center justify-center overflow-hidden rounded-md border border-border bg-background">
        {qrLogin.status === "starting" ? (
          <div className="flex flex-col items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin" />
            <span>{t("settings.botGateway.weixinQrStarting")}</span>
          </div>
        ) : qrLogin.qrDisplay.kind === "frame" ? (
          <BotGatewayQrWebview src={qrLogin.qrDisplay.src} />
        ) : qrLogin.qrDisplay.kind === "image" ? (
          <img
            alt={t("settings.botGateway.weixinQrTitle")}
            className="h-full w-full object-contain p-3"
            src={qrLogin.qrDisplay.src}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-[12px] text-muted-foreground">
            <Smartphone className="h-9 w-9" />
            <span>{t("settings.botGateway.weixinQrEmpty")}</span>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-md border border-border bg-background/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-foreground">
          {confirmed ? (
            <CheckCircle2 className="h-[14px] w-[14px] shrink-0 text-emerald-500" />
          ) : terminal ? (
            <AlertCircle className="h-[14px] w-[14px] shrink-0 text-destructive" />
          ) : pending ? (
            <Smartphone className="h-[14px] w-[14px] shrink-0 text-muted-foreground" />
          ) : (
            <Circle className="h-[14px] w-[14px] shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate">{getBotGatewayQrStatusLabel(qrLogin.status, t)}</span>
        </div>
        {qrLogin.message || qrLogin.error ? (
          <p className="mt-1 min-w-0 break-words text-[12px] leading-5 text-muted-foreground">{qrLogin.error || qrLogin.message}</p>
        ) : null}
        {qrLogin.expiresAt ? (
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{qrLogin.expiresAt}</p>
        ) : null}
      </div>
    </div>
  );
}

export function BotGatewayQrWebview({ src }: { src: string }) {
  const webviewRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const webview = webviewRef.current as (HTMLElement & { setZoomFactor?: (factor: number) => void }) | null;
    if (!webview) return;

    const applyZoom = () => {
      try {
        webview.setZoomFactor?.(botGatewayQrWebviewZoomFactor);
      } catch (error) {
        console.warn("[bot-gateway] Failed to set QR webview zoom.", error);
      }
    };
    webview.addEventListener("dom-ready", applyZoom);
    return () => {
      webview.removeEventListener("dom-ready", applyZoom);
    };
  }, [src]);

  return (
    <webview
      className="h-full w-full border-0 bg-white"
      partition="persist:agent-console-bot-qr"
      ref={webviewRef}
      src={src}
      webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes"
    />
  );
}

export function BotGatewayIntegrationList({
  busy,
  channels,
  integrationBusyId,
  integrations,
  onConfigure,
  onStart,
  onStop
}: {
  busy: boolean;
  channels: BotGatewayChannelManifest[];
  integrationBusyId: string | null;
  integrations: BotGatewayIntegration[];
  onConfigure: (integration: BotGatewayIntegration) => void;
  onStart: (integrationId: string) => void;
  onStop: (integrationId: string) => void;
}) {
  const { t } = useI18n();
  if (!integrations.length) {
    return (
      <div className="rounded-md border border-dashed border-border px-2.5 py-3 text-[12px] text-muted-foreground">
        {t("settings.botGateway.noIntegrations")}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {integrations.map((integration) => {
        const integrationBusy = busy || integrationBusyId === integration.id;
        const startable = isBotGatewayStartablePlatform(integration.platform, channels.find((channel) => channel.platform === integration.platform));
        const details = getBotGatewayIntegrationDetails(integration);
        return (
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-card/45 px-2.5 py-2" key={integration.id}>
            <div className="min-w-[220px] flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] font-medium text-foreground">
                <span className="min-w-0 truncate">{getBotGatewayPlatformName(integration.platform)}</span>
                <span className="shrink-0 rounded-sm border border-border px-1 py-0.5 text-[10px] text-muted-foreground">{integration.status}</span>
              </div>
              {details ? (
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{details}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                className="grid h-8 w-8 place-items-center rounded-md border border-border bg-card text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={integrationBusy}
                onClick={() => onConfigure(integration)}
                title={t("settings.botGateway.configureIntegration")}
                type="button"
              >
                <SquarePen className="h-[13px] w-[13px]" />
              </button>
              {startable ? (
                <>
                  <button
                    className="grid h-8 w-8 place-items-center rounded-md border border-border bg-card text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={integrationBusy}
                    onClick={() => onStart(integration.id)}
                    title={t("settings.botGateway.startIntegration")}
                    type="button"
                  >
                    {integrationBusyId === integration.id ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Play className="h-[13px] w-[13px]" />}
                  </button>
                  <button
                    className="grid h-8 w-8 place-items-center rounded-md border border-border bg-card text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={integrationBusy}
                    onClick={() => onStop(integration.id)}
                    title={t("settings.botGateway.stopIntegration")}
                    type="button"
                  >
                    <Pause className="h-[13px] w-[13px]" />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BotGatewayFormField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-[11px] font-medium text-muted-foreground">
      <span className="truncate">{label}</span>
      {children}
    </label>
  );
}

export function BotGatewayTextInput({
  ariaLabel,
  onChange,
  placeholder,
  type = "text",
  value
}: {
  ariaLabel: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "password" | "text";
  value: string;
}) {
  const { t } = useI18n();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordField = type === "password";
  const inputType = passwordField && passwordVisible ? "text" : type;

  return (
    <div className="relative min-w-0">
      <input
        aria-label={ariaLabel}
        className={cn(
          "h-8 w-full rounded-md border border-input bg-card px-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15",
          passwordField && "pr-9"
        )}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={inputType}
        value={value}
      />
      {passwordField ? (
        <button
          aria-label={passwordVisible ? t("settings.botGateway.hideToken") : t("settings.botGateway.showToken")}
          className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
          onClick={(event) => {
            event.preventDefault();
            setPasswordVisible((visible) => !visible);
          }}
          onMouseDown={(event) => event.preventDefault()}
          title={passwordVisible ? t("settings.botGateway.hideToken") : t("settings.botGateway.showToken")}
          type="button"
        >
          {passwordVisible ? <EyeOff className="h-[13px] w-[13px]" /> : <Eye className="h-[13px] w-[13px]" />}
        </button>
      ) : null}
    </div>
  );
}

export function BotGatewayCheckbox({
  checked,
  disabled,
  label,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-foreground">
      <input
        checked={checked}
        className="h-3.5 w-3.5 accent-primary disabled:opacity-50"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );
}

export function BotGatewayDynamicField({
  field,
  onChange,
  value
}: {
  field: BotGatewayFieldDefinition;
  onChange: (value: boolean | string) => void;
  value: boolean | string;
}) {
  const label = field.label ?? field.key;
  if (field.type === "boolean") {
    return (
      <BotGatewayCheckbox
        checked={value === true}
        label={label}
        onChange={onChange}
      />
    );
  }

  return (
    <BotGatewayFormField label={label}>
      {field.type === "select" ? (
        <Select
          aria-label={label}
          className="w-full"
          onValueChange={onChange}
          options={field.options ?? []}
          selectClassName="w-full max-w-none justify-between border border-border bg-card"
          value={typeof value === "string" ? value : ""}
        />
      ) : (
        <BotGatewayTextInput
          ariaLabel={label}
          onChange={onChange}
          placeholder={field.placeholder}
          type={field.type === "password" ? "password" : "text"}
          value={typeof value === "string" ? value : ""}
        />
      )}
    </BotGatewayFormField>
  );
}

export function getBotGatewayPlatformOptions(channels: BotGatewayChannelManifest[]): { label: string; value: string }[] {
  const byPlatform = new Map<string, BotGatewayChannelManifest>();
  for (const channel of channels) {
    if (channel.platform) byPlatform.set(channel.platform, channel);
  }
  const platforms = byPlatform.size
    ? Array.from(byPlatform.keys()).sort(compareBotGatewayPlatforms)
    : [...botGatewayPlatformOrder];
  return platforms.map((platform) => ({
    label: byPlatform.get(platform)?.displayName || getBotGatewayPlatformName(platform),
    value: platform
  }));
}

export function getDefaultBotGatewayAddPlatform(options: { value: string }[]): string {
  return options.find((option) => option.value === "feishu")?.value
    ?? options.find((option) => option.value !== "weixin-ilink" && option.value !== "weixin")?.value
    ?? "feishu";
}

export function createBotGatewayIdleQrLoginState(): BotGatewayQrLoginState {
  return {
    qrDisplay: { kind: "empty", src: "" },
    status: "idle"
  };
}

export function normalizeBotGatewayQrDisplay(raw: string): BotGatewayQrDisplay {
  const value = raw.trim();
  if (!value) return { kind: "empty", src: "" };
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return { kind: "frame", src: value };
  }
  if (value.startsWith("data:")) {
    return { kind: "image", src: value };
  }
  if (value.startsWith("<svg")) {
    return { kind: "image", src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}` };
  }
  return { kind: "image", src: `data:image/png;base64,${value}` };
}

export function normalizeBotGatewayQrStatus(status: string): BotGatewayQrLoginState["status"] {
  switch (status) {
    case "already_bound":
    case "confirmed":
    case "expired":
    case "failed":
    case "needs_verification":
    case "pending":
    case "scanned":
      return status;
    default:
      return "pending";
  }
}

export function isTerminalBotGatewayQrStatus(status: string): boolean {
  return status === "already_bound" || status === "confirmed" || status === "expired" || status === "failed";
}

export function getBotGatewayQrStatusLabel(status: BotGatewayQrLoginState["status"], t: TFunction): string {
  switch (status) {
    case "already_bound":
      return t("settings.botGateway.qrStatus.alreadyBound");
    case "confirmed":
      return t("settings.botGateway.qrStatus.confirmed");
    case "expired":
      return t("settings.botGateway.qrStatus.expired");
    case "failed":
      return t("settings.botGateway.qrStatus.failed");
    case "needs_verification":
      return t("settings.botGateway.qrStatus.needsVerification");
    case "pending":
      return t("settings.botGateway.qrStatus.pending");
    case "scanned":
      return t("settings.botGateway.qrStatus.scanned");
    case "starting":
      return t("settings.botGateway.qrStatus.starting");
    default:
      return t("settings.botGateway.qrStatus.idle");
  }
}

export function compareBotGatewayPlatforms(left: string, right: string): number {
  const leftIndex = botGatewayPlatformOrder.indexOf(left);
  const rightIndex = botGatewayPlatformOrder.indexOf(right);
  if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
  if (leftIndex >= 0) return -1;
  if (rightIndex >= 0) return 1;
  return left.localeCompare(right);
}

export function isBotGatewayStartablePlatform(platform: string, channel?: BotGatewayChannelManifest): boolean {
  return Boolean(channel?.capabilities?.inbound?.longPolling || channel?.capabilities?.inbound?.websocket)
    || botGatewayStartablePlatforms.has(platform);
}

export function getBotGatewayAuthOptions(platform: string, channel?: BotGatewayChannelManifest): { label: string; value: string }[] {
  const manifestModes = Array.isArray(channel?.authModes) ? channel.authModes : [];
  const modes = (manifestModes.length ? manifestModes : [botGatewayDefaultAuthType[platform] ?? "bot_token"])
    .filter((mode) => mode !== "webhook_secret" && (platform === "weixin-ilink" || mode !== "qr_login"));
  const uniqueModes = Array.from(new Set(modes.length ? modes : [botGatewayDefaultAuthType[platform] ?? "bot_token"]));
  return uniqueModes.map((mode) => ({ label: getBotGatewayAuthTypeLabel(mode), value: mode }));
}

export function getBotGatewayPlatformName(platform: string): string {
  return botGatewayPlatformNames[platform] ?? platform;
}

export function getBotGatewayAuthTypeLabel(authType: string): string {
  switch (authType) {
    case "app_secret":
      return "App Secret";
    case "bot_token":
      return "Bot Token";
    case "oauth2":
      return "OAuth 2";
    default:
      return authType;
  }
}

export function createDefaultBotGatewayIntegrationDraft(platform: string, channel?: BotGatewayChannelManifest): BotGatewayIntegrationDraft {
  const authOptions = getBotGatewayAuthOptions(platform, channel);
  const defaultAuthType = botGatewayDefaultAuthType[platform] ?? authOptions[0]?.value ?? "bot_token";
  const authType = authOptions.some((option) => option.value === defaultAuthType)
    ? defaultAuthType
    : authOptions[0]?.value ?? defaultAuthType;
  return {
    authType,
    fieldValues: getDefaultBotGatewayFieldValues(platform, channel),
    id: getDefaultBotGatewayIntegrationId(platform),
    platform,
    status: "active",
    tenantId: botGatewayManagedTenantId
  };
}

export function createBotGatewayDraftFromIntegration(integration: BotGatewayIntegration, channel?: BotGatewayChannelManifest): BotGatewayIntegrationDraft {
  const draft = createDefaultBotGatewayIntegrationDraft(integration.platform, channel);
  const authOptions = getBotGatewayAuthOptions(integration.platform, channel);
  const fields = getBotGatewayFieldDefinitions(integration.platform, channel);
  const nextFieldValues = { ...draft.fieldValues };
  const integrationConfig: Record<string, unknown> = { ...(integration.config ?? {}) };
  for (const field of fields) {
    if (field.target !== "config" || !(field.key in integrationConfig)) continue;
    const value = integrationConfig[field.key];
    if (field.type === "boolean") {
      nextFieldValues[field.key] = value === true;
    } else if (field.type === "select") {
      const stringValue = typeof value === "number" || typeof value === "string" ? String(value) : "";
      const defaultValue = typeof field.defaultValue === "string" ? field.defaultValue : field.options?.[0]?.value ?? "";
      nextFieldValues[field.key] = field.options?.some((option) => option.value === stringValue) ? stringValue : defaultValue;
    } else if (typeof value === "number" || typeof value === "string") {
      nextFieldValues[field.key] = String(value);
    }
  }

  return {
    ...draft,
    authType: authOptions.some((option) => option.value === integration.authType) ? integration.authType : draft.authType,
    fieldValues: nextFieldValues,
    id: integration.id,
    status: integration.status === "paused" || integration.status === "disabled" ? integration.status : "active",
    tenantId: integration.tenantId
  };
}

export function getDefaultBotGatewayIntegrationId(platform: string): string {
  return `${botGatewayManagedTenantId}-${platform}`.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function getDefaultBotGatewayFieldValues(platform: string, channel?: BotGatewayChannelManifest): Record<string, boolean | string> {
  const values: Record<string, boolean | string> = {};
  for (const field of getBotGatewayFieldDefinitions(platform, channel)) {
    if (field.defaultValue !== undefined) {
      values[field.key] = field.defaultValue;
    } else if (field.type === "boolean") {
      values[field.key] = false;
    } else if (field.type === "select") {
      values[field.key] = field.options?.[0]?.value ?? "";
    } else {
      values[field.key] = "";
    }
  }
  return values;
}

export function getBotGatewayFieldDefinitions(platform: string, channel?: BotGatewayChannelManifest): BotGatewayFieldDefinition[] {
  switch (platform) {
    case "weixin-ilink":
      return [];
    case "feishu":
      return [
        textConfigField("appId", "App ID"),
        passwordCredentialField("appSecret", "App Secret")
      ];
    case "dingtalk":
      return [
        textConfigField("appKey", "App Key"),
        passwordCredentialField("appSecret", "App Secret"),
        textConfigField("robotCode", "Robot Code")
      ];
    case "slack":
      return [
        passwordCredentialField("botToken", "Bot Token"),
        passwordCredentialField("appToken", "App Token")
      ];
    case "telegram":
      return [
        passwordCredentialField("botToken", "Bot Token")
      ];
    case "discord":
      return [
        passwordCredentialField("botToken", "Bot Token")
      ];
    case "line":
      return [
        passwordCredentialField("channelAccessToken", "Channel Access Token"),
        passwordCredentialField("channelSecret", "Channel Secret")
      ];
    case "wecom":
      return [
        textConfigField("corpId", "Corp ID"),
        textConfigField("agentId", "Agent ID"),
        passwordCredentialField("secret", "Secret"),
        passwordCredentialField("token", "Token"),
        passwordCredentialField("encodingAesKey", "Encoding AES Key")
      ];
    case "imessage":
      return [];
    default:
      return getBotGatewaySchemaFieldDefinitions(channel);
  }
}

export function getBotGatewaySchemaFieldDefinitions(channel?: BotGatewayChannelManifest): BotGatewayFieldDefinition[] {
  const properties = getBotGatewaySchemaProperties(channel);
  const requiredKeys = getBotGatewaySchemaStringArray(channel?.configSchema?.required);
  const keys = new Set<string>();

  for (const key of requiredKeys) {
    if (!isHiddenBotGatewayConfigKey(key)) keys.add(key);
  }

  for (const key of getBotGatewayAuthFieldKeys(channel, properties)) {
    if (!isHiddenBotGatewayConfigKey(key)) keys.add(key);
  }

  if (!keys.size) {
    for (const key of Object.keys(properties)) {
      if (isHiddenBotGatewayConfigKey(key)) continue;
      if (isLikelyBotGatewayCredentialKey(key) || isLikelyBotGatewayIdentityKey(key)) keys.add(key);
    }
  }

  if (!keys.size) {
    return [passwordCredentialField("botToken", "Bot Token")];
  }

  return Array.from(keys).map((key) => createBotGatewaySchemaField(key, properties[key]));
}

export function getBotGatewaySchemaProperties(channel?: BotGatewayChannelManifest): Record<string, Record<string, unknown>> {
  const properties = channel?.configSchema?.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};
  const result: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(properties)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }
  return result;
}

export function getBotGatewaySchemaStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function getBotGatewayAuthFieldKeys(channel: BotGatewayChannelManifest | undefined, properties: Record<string, Record<string, unknown>>): string[] {
  const modes = new Set((channel?.authModes ?? []).filter((mode) => mode !== "qr_login" && mode !== "webhook_secret"));
  const propertyKeys = new Set(Object.keys(properties));
  const keys: string[] = [];

  const addIfPresent = (...candidates: string[]) => {
    for (const candidate of candidates) {
      if (!propertyKeys.size || propertyKeys.has(candidate)) keys.push(candidate);
    }
  };

  if (modes.has("bot_token")) {
    addIfPresent("botToken", "token", "channelAccessToken", "channelSecret");
  }
  if (modes.has("app_secret")) {
    addIfPresent("appId", "appKey", "corpId", "agentId", "robotCode", "appSecret", "secret", "token", "encodingAesKey");
  }
  if (modes.has("oauth2")) {
    addIfPresent("clientId", "clientSecret");
  }

  return Array.from(new Set(keys));
}

export function createBotGatewaySchemaField(key: string, property?: Record<string, unknown>): BotGatewayFieldDefinition {
  const enumValues = getBotGatewaySchemaStringArray(property?.enum);
  const defaultValue = typeof property?.default === "boolean" || typeof property?.default === "string"
    ? property.default
    : undefined;
  const type = property?.type === "boolean"
    ? "boolean"
    : property?.type === "number" || property?.type === "integer"
      ? "number"
      : enumValues.length
        ? "select"
        : isLikelyBotGatewayCredentialKey(key)
          ? "password"
          : "text";
  return {
    defaultValue,
    key,
    label: getBotGatewayFieldLabel(key),
    options: enumValues.length ? enumValues.map((value) => ({ label: value, value })) : undefined,
    target: isLikelyBotGatewayCredentialKey(key) ? "credentials" : "config",
    type
  };
}

export function isHiddenBotGatewayConfigKey(key: string): boolean {
  return new Set([
    "dryRun",
    "transport",
    "sendMode",
    "outgoingWebhookUrl",
    "webhookSecret",
    "socketOpenEndpoint",
    "gatewayUrl",
    "gatewayIntents",
    "gatewayReconnectDelayMs",
    "gatewayHeartbeatJitter",
    "pollingIntervalMs",
    "longPollTimeoutMs",
    "longPollTimeoutSeconds",
    "pollingLimit",
    "allowedUpdates",
    "cursorKey",
    "baseUrl",
    "cdnBaseUrl",
    "inboundMediaDir",
    "inboundMediaMaxBytes",
    "outboundMediaTempDir",
    "downloadInboundMedia",
    "routeTag",
    "botAgent",
    "botType",
    "qrStartTimeoutMs",
    "qrWaitTimeoutMs"
  ]).has(key);
}

export function isLikelyBotGatewayCredentialKey(key: string): boolean {
  return /token|secret|password|credential|private|access/i.test(key);
}

export function isLikelyBotGatewayIdentityKey(key: string): boolean {
  return /(^|_)(app|client|corp|agent|robot).*(id|key|code)$|^(appId|appKey|corpId|agentId|robotCode)$/i.test(key);
}

export function getBotGatewayFieldLabel(key: string): string {
  const knownLabels: Record<string, string> = {
    agentId: "Agent ID",
    appId: "App ID",
    appKey: "App Key",
    appSecret: "App Secret",
    botToken: "Bot Token",
    channelAccessToken: "Channel Access Token",
    channelSecret: "Channel Secret",
    clientId: "Client ID",
    clientSecret: "Client Secret",
    corpId: "Corp ID",
    encodingAesKey: "Encoding AES Key",
    robotCode: "Robot Code"
  };
  if (knownLabels[key]) return knownLabels[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b(id|url|api|aes)\b/gi, (match) => match.toUpperCase())
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function textConfigField(key: string, label = key, defaultValue = "", placeholder?: string): BotGatewayFieldDefinition {
  return { defaultValue, key, label, placeholder, target: "config", type: "text" };
}

export function passwordCredentialField(key: string, label = key): BotGatewayFieldDefinition {
  return { key, label, target: "credentials", type: "password" };
}

export function buildBotGatewayIntegrationPayload(
  draft: BotGatewayIntegrationDraft,
  fieldDefinitions: BotGatewayFieldDefinition[],
  channel?: BotGatewayChannelManifest
): NonNullable<Parameters<AgentConsoleBridge["bot"]["createIntegration"]>[0]> {
  const tenantId = draft.tenantId.trim();
  const platform = draft.platform.trim();
  const authType = draft.authType.trim();
  if (!tenantId || !platform || !authType) {
    throw new Error("tenantId, platform and authType are required.");
  }

  const config: Record<string, unknown> = getBotGatewayDefaultConfig(platform, channel);
  const credentials: Record<string, unknown> = {};

  for (const field of fieldDefinitions) {
    const rawValue = draft.fieldValues[field.key];
    const value = normalizeBotGatewayFieldValue(field, rawValue);
    if (value === undefined) continue;
    if (field.target === "credentials") {
      credentials[field.key] = value;
    } else {
      config[field.key] = value;
    }
  }

  return {
    authType,
    config,
    credentials,
    id: draft.id.trim() || undefined,
    platform,
    status: draft.status,
    tenantId
  };
}

export function getBotGatewayDefaultConfig(platform: string, channel?: BotGatewayChannelManifest): Record<string, unknown> {
  const config: Record<string, unknown> = { dryRun: false };
  const defaultTransport = botGatewayDefaultTransport[platform] ?? getBotGatewaySchemaDefaultTransport(channel);
  if (defaultTransport) config.transport = defaultTransport;
  if (platform === "imessage") config.sendMode = "macos_messages";
  return config;
}

export function getBotGatewaySchemaDefaultTransport(channel?: BotGatewayChannelManifest): string | undefined {
  const properties = getBotGatewaySchemaProperties(channel);
  const transport = properties.transport;
  const defaultValue = typeof transport?.default === "string" ? transport.default : undefined;
  if (defaultValue && defaultValue !== "webhook") return defaultValue;

  const enumValues = getBotGatewaySchemaStringArray(transport?.enum).filter((value) => value !== "webhook");
  const preferred = ["websocket", "socket", "long_polling"];
  return preferred.find((value) => enumValues.includes(value)) ?? enumValues[0];
}

export function hasBotGatewayDraftCredentials(draft: BotGatewayIntegrationDraft, fieldDefinitions: BotGatewayFieldDefinition[]): boolean {
  return fieldDefinitions.some((field) => {
    if (field.target !== "credentials") return false;
    const value = draft.fieldValues[field.key];
    return typeof value === "string" ? value.trim().length > 0 : value === true;
  });
}

export function hasBotGatewayCredentialFields(fieldDefinitions: BotGatewayFieldDefinition[]): boolean {
  return fieldDefinitions.some((field) => field.target === "credentials");
}

export function normalizeBotGatewayFieldValue(field: BotGatewayFieldDefinition, rawValue: boolean | string | undefined): unknown {
  if (field.type === "boolean") return rawValue === true;
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) return undefined;
  if (field.type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

export function getBotGatewayIntegrationDetails(integration: BotGatewayIntegration): string {
  return integration.updatedAt ? `updated: ${formatCompactRelativeAge(Date.parse(integration.updatedAt))}` : "";
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function formatCompactRelativeAge(timestamp: number): string {
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return "now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `${elapsedDays}d`;

  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) return `${elapsedMonths}mo`;

  return `${Math.floor(elapsedMonths / 12)}y`;
}

export type AgentEnvironmentTemplateDefinition = {
  description: string;
  id: string;
  label: string;
  url: string;
};

export const agentEnvironmentTemplateCatalogUrl = "https://agent-environment-templates.pages.dev/templates.json";

export async function loadAgentEnvironmentTemplates(t: TFunction): Promise<{
  error: string | null;
  templates: AgentEnvironmentTemplateDefinition[];
}> {
  let response: Response;
  try {
    response = await fetch(agentEnvironmentTemplateCatalogUrl, { cache: "no-store" });
  } catch {
    return { error: t("settings.agentEnvironment.templateSourceFetchFailed"), templates: [] };
  }

  if (!response.ok) {
    return { error: t("settings.agentEnvironment.templateSourceFetchFailed"), templates: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    return { error: t("settings.agentEnvironment.templateSourceInvalid"), templates: [] };
  }

  const templates = getAgentEnvironmentTemplatesFromCatalog(parsed, agentEnvironmentTemplateCatalogUrl);
  return templates.length
    ? { error: null, templates }
    : { error: t("settings.agentEnvironment.templateSourceEmpty"), templates: [] };
}

export function getAgentEnvironmentTemplatesFromCatalog(
  value: unknown,
  catalogUrl: string
): AgentEnvironmentTemplateDefinition[] {
  const root = getUnknownRecord(value);
  const baseUrl = getCatalogBaseUrl(root, catalogUrl);
  const candidates = [
    root?.templates,
    root?.items,
    root?.environmentTemplates,
    root?.agentEnvironmentTemplates,
    value
  ];

  for (const candidate of candidates) {
    const templates = getAgentEnvironmentTemplatesFromCatalogValue(candidate, baseUrl);
    if (templates.length) return dedupeAgentEnvironmentTemplates(templates);
  }

  return [];
}

function getAgentEnvironmentTemplatesFromCatalogValue(value: unknown, baseUrl: string): AgentEnvironmentTemplateDefinition[] {
  if (Array.isArray(value)) {
    return value
      .map((entry, index) => normalizeAgentEnvironmentTemplateCatalogEntry(String(index + 1), entry, baseUrl))
      .filter((template): template is AgentEnvironmentTemplateDefinition => Boolean(template));
  }

  const record = getUnknownRecord(value);
  if (!record) return [];

  return Object.entries(record)
    .filter(([id]) => !isAgentEnvironmentTemplateCatalogMetadataKey(id))
    .map(([id, entry]) => normalizeAgentEnvironmentTemplateCatalogEntry(id, entry, baseUrl))
    .filter((template): template is AgentEnvironmentTemplateDefinition => Boolean(template));
}

function normalizeAgentEnvironmentTemplateCatalogEntry(
  idHint: string,
  value: unknown,
  baseUrl: string
): AgentEnvironmentTemplateDefinition | null {
  if (typeof value === "string") {
    const url = getTemplateUrl(value, baseUrl);
    if (!url) return null;
    const label = getTemplateLabelFromUrl(url, idHint);
    return {
      description: "",
      id: getTemplateId(idHint, label),
      label,
      url
    };
  }

  const record = getUnknownRecord(value);
  if (!record) return null;

  const source = getStringValue(record.url)
    || getStringValue(record.href)
    || getStringValue(record.path)
    || getStringValue(record.file)
    || getStringValue(record.template)
    || getStringValue(record.templateUrl)
    || getStringValue(record.templateURL);
  const url = getTemplateUrl(source, baseUrl);
  if (!url) return null;

  const label = getStringValue(record.label) || getStringValue(record.name) || getStringValue(record.title) || getTemplateLabelFromUrl(url, idHint);
  return {
    description: getStringValue(record.description),
    id: getTemplateId(getStringValue(record.id) || idHint, label),
    label,
    url
  };
}

function isAgentEnvironmentTemplateCatalogMetadataKey(key: string): boolean {
  return [
    "baseUrl",
    "baseURL",
    "description",
    "environmentTemplates",
    "agentEnvironmentTemplates",
    "items",
    "name",
    "templates",
    "updatedAt",
    "version"
  ].includes(key);
}

function dedupeAgentEnvironmentTemplates(templates: AgentEnvironmentTemplateDefinition[]): AgentEnvironmentTemplateDefinition[] {
  const seenIds = new Set<string>();
  return templates.map((template, index) => {
    if (!seenIds.has(template.id)) {
      seenIds.add(template.id);
      return template;
    }
    const id = `${template.id}-${index + 1}`;
    seenIds.add(id);
    return { ...template, id };
  });
}

function getCatalogBaseUrl(root: Record<string, unknown> | null, catalogUrl: string): string {
  const baseUrl = getStringValue(root?.baseUrl) || getStringValue(root?.baseURL);
  try {
    return new URL(baseUrl || ".", catalogUrl).toString();
  } catch {
    return catalogUrl;
  }
}

function getTemplateUrl(value: string, baseUrl: string): string {
  if (!value.trim()) return "";
  try {
    return new URL(value.trim(), baseUrl).toString();
  } catch {
    return "";
  }
}

function getTemplateId(idHint: string, label: string): string {
  return (idHint || label || "template")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-") || "template";
}

function getTemplateLabelFromUrl(url: string, fallback: string): string {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").filter(Boolean).pop() ?? fallback;
    return filename.replace(/\.json$/i, "").replace(/[-_]+/g, " ") || fallback;
  } catch {
    return fallback;
  }
}

export function getAgentEnvironmentFromTemplateText(
  value: string,
  t: TFunction
): { env: Record<string, string>; error: string | null } {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return { env: {}, error: t("settings.agentEnvironment.templateEmpty") };
  }

  if (trimmedValue.startsWith("{") || trimmedValue.startsWith("[")) {
    try {
      return getAgentEnvironmentFromTemplateJson(JSON.parse(trimmedValue), t);
    } catch {
      return { env: {}, error: t("settings.agentEnvironment.templateInvalidJson") };
    }
  }

  return getAgentEnvironmentFromDotEnvText(trimmedValue, t);
}

function getAgentEnvironmentFromTemplateJson(value: unknown, t: TFunction): { env: Record<string, string>; error: string | null } {
  const record = getUnknownRecord(value);
  const candidates = [
    record?.env,
    record?.environment,
    record?.variables,
    record?.agentEnvironment,
    getFirstNestedEnvironmentMap(getUnknownRecord(record?.agents)?.environments)
  ];

  for (const candidate of candidates) {
    const env = getStringEnvironmentMap(candidate);
    if (Object.keys(env).length) {
      return { env, error: null };
    }
  }

  const env = getStringEnvironmentMap(value);
  if (Object.keys(env).length) {
    return { env, error: null };
  }

  return { env: {}, error: t("settings.agentEnvironment.templateInvalid") };
}

function getAgentEnvironmentFromDotEnvText(value: string, t: TFunction): { env: Record<string, string>; error: string | null } {
  const env: Record<string, string> = {};
  const lines = value.split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      return { env: {}, error: t("settings.agentEnvironment.templateInvalidLine", { line: index + 1 }) };
    }
    const name = line.slice(0, equalsIndex).trim().replace(/^export\s+/, "");
    if (!isValidEnvironmentVariableName(name)) {
      return { env: {}, error: t("settings.agentEnvironment.invalidName", { name }) };
    }
    env[name] = line.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
  }

  return Object.keys(env).length
    ? { env, error: null }
    : { env: {}, error: t("settings.agentEnvironment.templateInvalid") };
}

function getStringEnvironmentMap(value: unknown): Record<string, string> {
  const record = getUnknownRecord(value);
  if (!record) return {};

  const env: Record<string, string> = {};
  for (const [name, rawValue] of Object.entries(record)) {
    const normalizedName = name.trim();
    if (!isValidEnvironmentVariableName(normalizedName) || typeof rawValue !== "string") continue;
    env[normalizedName] = rawValue;
  }
  return env;
}

function getFirstNestedEnvironmentMap(value: unknown): Record<string, string> | undefined {
  const record = getUnknownRecord(value);
  if (!record) return undefined;

  for (const nestedValue of Object.values(record)) {
    const env = getStringEnvironmentMap(nestedValue);
    if (Object.keys(env).length) return env;
  }

  return undefined;
}

function getUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function AgentSettingsPanel({
  agentEnvironments,
  agentProviders,
  configuredAgentProviders,
  configuredSubagents,
  disabledAgentProviders,
  onAgentEnvironmentSave,
  onAgentProviderEnabledChange,
  onAgentProvidersSave,
  onSubagentsSave,
  title
}: {
  agentEnvironments: AgentEnvironmentSettings;
  agentProviders: AgentProviderOption[];
  configuredAgentProviders: ConfiguredAgentProviderSettings[];
  configuredSubagents: ConfiguredSubagentSettings[];
  disabledAgentProviders: ChatAgentProviderId[];
  onAgentEnvironmentSave: (providerId: ChatAgentProviderId, env: Record<string, string>) => Promise<void>;
  onAgentProviderEnabledChange: (providerId: ChatAgentProviderId, enabled: boolean) => Promise<void>;
  onAgentProvidersSave: (providers: ConfiguredAgentProviderSettings[]) => Promise<void>;
  onSubagentsSave: (subagents: ConfiguredSubagentSettings[]) => Promise<void>;
  title: string;
}) {
  const { t } = useI18n();
  const disabledProviderIds = useMemo(() => new Set(disabledAgentProviders), [disabledAgentProviders]);
  const providerOptions = useMemo(() => {
    const configuredById = new Map(configuredAgentProviders.map((provider) => [provider.id, provider]));
    const runtimeProviders = agentProviders.length ? agentProviders : getFallbackAgentProviderOptions();
    const mergedProviders = runtimeProviders.map((provider) => ({
      ...provider,
      configurable: configuredById.has(provider.id),
      configuredProvider: configuredById.get(provider.id),
      enabled: provider.enabled && !disabledProviderIds.has(provider.id),
      logoDataUrl: provider.logoDataUrl ?? configuredById.get(provider.id)?.logoDataUrl
    }));
    const runtimeProviderIds = new Set(runtimeProviders.map((provider) => provider.id));

    for (const configuredProvider of configuredAgentProviders) {
      if (runtimeProviderIds.has(configuredProvider.id)) continue;
      mergedProviders.push({
        configurable: true,
        configuredProvider,
        description: configuredProvider.description,
        enabled: !disabledProviderIds.has(configuredProvider.id),
        id: configuredProvider.id,
        kind: "asp" as const,
        label: configuredProvider.label,
        logoDataUrl: configuredProvider.logoDataUrl,
        models: normalizeAgentModelOptions(configuredProvider.models)
      });
    }

    return mergedProviders;
  }, [agentProviders, configuredAgentProviders, disabledProviderIds]);
  const [settingsProviderId, setSettingsProviderId] = useState<ChatAgentProviderId | null>(null);
  const [addingProvider, setAddingProvider] = useState(false);
  const [providerForm, setProviderForm] = useState<AgentProviderSettingsForm | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [settingsSubagentId, setSettingsSubagentId] = useState<string | null>(null);
  const [addingSubagent, setAddingSubagent] = useState(false);
  const [subagentForm, setSubagentForm] = useState<SubagentSettingsForm | null>(null);
  const [subagentError, setSubagentError] = useState<string | null>(null);
  const [savingSubagent, setSavingSubagent] = useState(false);
  const [environmentImportDialogOpen, setEnvironmentImportDialogOpen] = useState(false);
  const [environmentImportError, setEnvironmentImportError] = useState<string | null>(null);
  const [environmentImportTemplateId, setEnvironmentImportTemplateId] = useState("");
  const [environmentTemplateSourceError, setEnvironmentTemplateSourceError] = useState<string | null>(null);
  const [environmentTemplates, setEnvironmentTemplates] = useState<AgentEnvironmentTemplateDefinition[]>([]);
  const [environmentTemplateLink, setEnvironmentTemplateLink] = useState("");
  const [importingEnvironmentTemplate, setImportingEnvironmentTemplate] = useState(false);
  const [loadingEnvironmentTemplates, setLoadingEnvironmentTemplates] = useState(false);
  const [savingEnabledProviderId, setSavingEnabledProviderId] = useState<ChatAgentProviderId | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const activeProvider = settingsProviderId ? providerOptions.find((provider) => provider.id === settingsProviderId) ?? null : null;
  const activeConfiguredProvider = activeProvider?.configuredProvider ?? configuredAgentProviders.find((provider) => provider.id === activeProvider?.id);
  const activeProviderId = activeProvider?.id ?? null;
  const activeSubagent = settingsSubagentId ? configuredSubagents.find((subagent) => subagent.id === settingsSubagentId) ?? null : null;
  const [environmentRows, setEnvironmentRows] = useState<AgentEnvironmentRow[]>(() => getAgentEnvironmentRows({}));
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const [environmentSaved, setEnvironmentSaved] = useState(false);
  const [savingEnvironment, setSavingEnvironment] = useState(false);

  useEffect(() => {
    if (!addingProvider && settingsProviderId && !providerOptions.some((provider) => provider.id === settingsProviderId)) {
      setSettingsProviderId(null);
      setProviderForm(null);
      setProviderError(null);
      setEnvironmentImportError(null);
    }
  }, [addingProvider, providerOptions, settingsProviderId]);

  useEffect(() => {
    if (!addingSubagent && settingsSubagentId && !configuredSubagents.some((subagent) => subagent.id === settingsSubagentId)) {
      setSettingsSubagentId(null);
      setSubagentForm(null);
      setSubagentError(null);
    }
  }, [addingSubagent, configuredSubagents, settingsSubagentId]);

  useEffect(() => {
    if (addingProvider) return;
    if (!activeProvider) {
      setProviderForm(null);
      setProviderError(null);
      setEnvironmentImportError(null);
      return;
    }
    setProviderForm(activeConfiguredProvider ? createAgentProviderSettingsForm(activeConfiguredProvider) : null);
    setProviderError(null);
    setEnvironmentImportError(null);
  }, [activeConfiguredProvider, activeProvider, addingProvider]);

  useEffect(() => {
    if (addingSubagent) return;
    if (!activeSubagent) {
      setSubagentForm(null);
      setSubagentError(null);
      return;
    }
    setSubagentForm(createSubagentSettingsForm(activeSubagent, providerOptions));
    setSubagentError(null);
  }, [activeSubagent, addingSubagent, providerOptions]);

  useEffect(() => {
    setEnvironmentImportTemplateId((currentTemplateId) => {
      if (environmentTemplates.some((template) => template.id === currentTemplateId)) {
        return currentTemplateId;
      }
      return environmentTemplates[0]?.id ?? "";
    });
    setEnvironmentImportError(null);
  }, [environmentTemplates]);

  useEffect(() => {
    if (!environmentImportDialogOpen) return;

    let cancelled = false;
    setLoadingEnvironmentTemplates(true);
    setEnvironmentTemplateSourceError(null);
    void loadAgentEnvironmentTemplates(t)
      .then(({ error, templates }) => {
        if (cancelled) return;
        setEnvironmentTemplates(templates);
        setEnvironmentTemplateSourceError(error);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingEnvironmentTemplates(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [environmentImportDialogOpen, t]);

  useEffect(() => {
    if (!activeProviderId || addingProvider) {
      setEnvironmentRows(getAgentEnvironmentRows({}));
      setEnvironmentError(null);
      setEnvironmentSaved(false);
      return;
    }

    setEnvironmentRows(getAgentEnvironmentRows(agentEnvironments[activeProviderId] ?? {}));
    setEnvironmentError(null);
    setEnvironmentSaved(false);
  }, [activeProviderId, addingProvider, agentEnvironments]);

  const startAddingProvider = useCallback(() => {
    setAddingProvider(true);
    setSettingsProviderId(null);
    setProviderForm(createBlankAgentProviderSettingsForm(configuredAgentProviders, agentProviders));
    setProviderError(null);
    setEnvironmentImportDialogOpen(false);
    setEnvironmentImportError(null);
    setEnvironmentTemplateSourceError(null);
    setEnvironmentTemplateLink("");
  }, [agentProviders, configuredAgentProviders]);

  const openProviderSettings = useCallback((providerId: ChatAgentProviderId) => {
    const configuredProvider = configuredAgentProviders.find((provider) => provider.id === providerId);
    setAddingProvider(false);
    setSettingsProviderId(providerId);
    setProviderForm(configuredProvider ? createAgentProviderSettingsForm(configuredProvider) : null);
    setProviderError(null);
    setEnvironmentImportDialogOpen(false);
    setEnvironmentImportError(null);
    setEnvironmentTemplateSourceError(null);
    setEnvironmentTemplateLink("");
  }, [configuredAgentProviders]);

  const closeProviderSettings = useCallback(() => {
    setAddingProvider(false);
    setSettingsProviderId(null);
    setProviderForm(null);
    setProviderError(null);
    setEnvironmentImportDialogOpen(false);
    setEnvironmentImportError(null);
    setEnvironmentTemplateSourceError(null);
    setEnvironmentTemplateLink("");
  }, []);

  const startAddingSubagent = useCallback(() => {
    setAddingSubagent(true);
    setSettingsSubagentId(null);
    setSubagentForm(createBlankSubagentSettingsForm(configuredSubagents, providerOptions));
    setSubagentError(null);
  }, [configuredSubagents, providerOptions]);

  const openSubagentSettings = useCallback((subagentId: string) => {
    const subagent = configuredSubagents.find((candidate) => candidate.id === subagentId);
    setAddingSubagent(false);
    setSettingsSubagentId(subagentId);
    setSubagentForm(subagent ? createSubagentSettingsForm(subagent, providerOptions) : null);
    setSubagentError(null);
  }, [configuredSubagents, providerOptions]);

  const closeSubagentSettings = useCallback(() => {
    setAddingSubagent(false);
    setSettingsSubagentId(null);
    setSubagentForm(null);
    setSubagentError(null);
  }, []);

  const updateProviderForm = useCallback((key: keyof AgentProviderSettingsForm, value: string) => {
    setProviderForm((currentForm) => currentForm ? { ...currentForm, [key]: value } : currentForm);
    setProviderError(null);
  }, []);

  const updateSubagentForm = useCallback((key: keyof SubagentSettingsForm, value: string) => {
    setSubagentForm((currentForm) => currentForm ? updateSubagentSettingsFormValue(currentForm, key, value, providerOptions) : currentForm);
    setSubagentError(null);
  }, [providerOptions]);

  const updateEnvironmentRow = useCallback((rowId: string, key: "name" | "value", value: string) => {
    setEnvironmentRows((currentRows) => currentRows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)));
    setEnvironmentError(null);
    setEnvironmentImportError(null);
    setEnvironmentSaved(false);
  }, []);

  const addEnvironmentRowAfter = useCallback((rowId: string) => {
    setEnvironmentRows((currentRows) => {
      const rowIndex = currentRows.findIndex((row) => row.id === rowId);
      if (rowIndex === -1) {
        return [...currentRows, createAgentEnvironmentRow()];
      }

      const nextRows = [...currentRows];
      nextRows.splice(rowIndex + 1, 0, createAgentEnvironmentRow());
      return nextRows;
    });
    setEnvironmentError(null);
    setEnvironmentImportError(null);
    setEnvironmentSaved(false);
  }, []);

  const removeEnvironmentRow = useCallback((rowId: string) => {
    setEnvironmentRows((currentRows) => {
      const nextRows = currentRows.filter((row) => row.id !== rowId);
      return nextRows.length ? nextRows : [createAgentEnvironmentRow()];
    });
    setEnvironmentError(null);
    setEnvironmentImportError(null);
    setEnvironmentSaved(false);
  }, []);

  const mergeEnvironmentTemplate = useCallback((env: Record<string, string>) => {
    setEnvironmentRows((currentRows) => {
      const nextRows = currentRows
        .filter((row) => row.name.trim() || row.value)
        .map((row) => ({ ...row }));

      for (const [name, value] of Object.entries(env)) {
        const existingRow = nextRows.find((row) => row.name.trim() === name);
        if (existingRow) {
          if (!existingRow.value && value) {
            existingRow.value = value;
          }
          continue;
        }
        nextRows.push(createAgentEnvironmentRow(name, value));
      }

      return nextRows.length ? nextRows : [createAgentEnvironmentRow()];
    });
    setEnvironmentError(null);
    setEnvironmentImportError(null);
    setEnvironmentSaved(false);
  }, []);

  const openEnvironmentImportDialog = useCallback(() => {
    setEnvironmentImportDialogOpen(true);
    setEnvironmentImportError(null);
  }, []);

  const closeEnvironmentImportDialog = useCallback(() => {
    setEnvironmentImportDialogOpen(false);
    setEnvironmentImportError(null);
    setEnvironmentTemplateLink("");
    setImportingEnvironmentTemplate(false);
  }, []);

  const selectEnvironmentTemplate = useCallback((templateId: string) => {
    setEnvironmentImportTemplateId(templateId);
    setEnvironmentImportError(null);
  }, []);

  const updateEnvironmentTemplateLink = useCallback((value: string) => {
    setEnvironmentTemplateLink(value);
    setEnvironmentImportError(null);
  }, []);

  const importEnvironmentTemplate = useCallback(async () => {
    const selectedTemplate = environmentTemplates.find((template) => template.id === environmentImportTemplateId) ?? environmentTemplates[0];
    const templateLink = environmentTemplateLink.trim();

    setImportingEnvironmentTemplate(true);
    setEnvironmentImportError(null);
    try {
      if (templateLink) {
        let response: Response;
        try {
          response = await fetch(templateLink);
        } catch {
          setEnvironmentImportError(t("settings.agentEnvironment.templateLinkFetchFailed"));
          return;
        }
        if (!response.ok) {
          setEnvironmentImportError(t("settings.agentEnvironment.templateLinkFetchFailed"));
          return;
        }
        const { env, error } = getAgentEnvironmentFromTemplateText(await response.text(), t);
        if (error) {
          setEnvironmentImportError(error);
          return;
        }
        mergeEnvironmentTemplate(env);
      } else if (selectedTemplate) {
        let response: Response;
        try {
          response = await fetch(selectedTemplate.url, { cache: "no-store" });
        } catch {
          setEnvironmentImportError(t("settings.agentEnvironment.templateFetchFailed"));
          return;
        }
        if (!response.ok) {
          setEnvironmentImportError(t("settings.agentEnvironment.templateFetchFailed"));
          return;
        }
        const { env, error } = getAgentEnvironmentFromTemplateText(await response.text(), t);
        if (error) {
          setEnvironmentImportError(error);
          return;
        }
        mergeEnvironmentTemplate(env);
      } else {
        setEnvironmentImportError(t("settings.agentEnvironment.templateMissing"));
        return;
      }
      setEnvironmentImportDialogOpen(false);
      setEnvironmentTemplateLink("");
    } finally {
      setImportingEnvironmentTemplate(false);
    }
  }, [environmentImportTemplateId, environmentTemplateLink, environmentTemplates, mergeEnvironmentTemplate, t]);

  const toggleProviderEnabled = useCallback(async (providerId: ChatAgentProviderId, enabled: boolean) => {
    setSavingEnabledProviderId(providerId);
    try {
      await onAgentProviderEnabledChange(providerId, enabled);
    } finally {
      setSavingEnabledProviderId(null);
    }
  }, [onAgentProviderEnabledChange]);

  const saveProvider = useCallback(async () => {
    if (!providerForm) return;

    const { error, provider } = getConfiguredAgentProviderFromForm(providerForm, configuredAgentProviders, agentProviders, t);
    if (error || !provider) {
      setProviderError(error);
      return;
    }

    const nextProviders = providerForm.originalId
      ? configuredAgentProviders.map((currentProvider) => currentProvider.id === providerForm.originalId ? provider : currentProvider)
      : [...configuredAgentProviders, provider];

    setSavingProvider(true);
    try {
      await onAgentProvidersSave(nextProviders);
      setAddingProvider(false);
      setSettingsProviderId(provider.id);
      setProviderForm(createAgentProviderSettingsForm(provider));
      setProviderError(null);
    } finally {
      setSavingProvider(false);
    }
  }, [agentProviders, configuredAgentProviders, onAgentProvidersSave, providerForm, t]);

  const saveSubagent = useCallback(async () => {
    if (!subagentForm) return;

    const { error, subagent } = getConfiguredSubagentFromForm(subagentForm, configuredSubagents, providerOptions, t);
    if (error || !subagent) {
      setSubagentError(error);
      return;
    }

    const nextSubagents = subagentForm.originalId
      ? configuredSubagents.map((currentSubagent) => currentSubagent.id === subagentForm.originalId ? subagent : currentSubagent)
      : [...configuredSubagents, subagent];

    setSavingSubagent(true);
    try {
      await onSubagentsSave(nextSubagents);
      setAddingSubagent(false);
      setSettingsSubagentId(subagent.id);
      setSubagentForm(createSubagentSettingsForm(subagent, providerOptions));
      setSubagentError(null);
    } finally {
      setSavingSubagent(false);
    }
  }, [configuredSubagents, onSubagentsSave, providerOptions, subagentForm, t]);

  const saveEnvironment = useCallback(async () => {
    if (!activeProviderId) return;

    const { env, error: validationError } = getEnvironmentFromRows(environmentRows, t);
    if (validationError) {
      setEnvironmentError(validationError);
      setEnvironmentSaved(false);
      return;
    }

    setSavingEnvironment(true);
    try {
      await onAgentEnvironmentSave(activeProviderId, env);
      setEnvironmentRows(getAgentEnvironmentRows(env));
      setEnvironmentError(null);
      setEnvironmentSaved(true);
    } catch (error) {
      setEnvironmentError(error instanceof Error && error.message ? error.message : t("settings.agentEnvironment.saveFailed"));
      setEnvironmentSaved(false);
    } finally {
      setSavingEnvironment(false);
    }
  }, [activeProviderId, environmentRows, onAgentEnvironmentSave, t]);

  const deleteProvider = useCallback(async () => {
    if (!activeConfiguredProvider) return;
    const confirmed = window.confirm(t("settings.agents.deleteConfirm", { agent: activeConfiguredProvider.label }));
    if (!confirmed) return;

    setSavingProvider(true);
    try {
      await onAgentProvidersSave(configuredAgentProviders.filter((provider) => provider.id !== activeConfiguredProvider.id));
      closeProviderSettings();
    } finally {
      setSavingProvider(false);
    }
  }, [activeConfiguredProvider, closeProviderSettings, configuredAgentProviders, onAgentProvidersSave, t]);

  const deleteSubagent = useCallback(async () => {
    if (!activeSubagent) return;
    const confirmed = window.confirm(t("settings.subagents.deleteConfirm", { agent: activeSubagent.label }));
    if (!confirmed) return;

    setSavingSubagent(true);
    try {
      await onSubagentsSave(configuredSubagents.filter((subagent) => subagent.id !== activeSubagent.id));
      closeSubagentSettings();
    } finally {
      setSavingSubagent(false);
    }
  }, [activeSubagent, closeSubagentSettings, configuredSubagents, onSubagentsSave, t]);

  const cancelAddingProvider = useCallback(() => {
    closeProviderSettings();
  }, [closeProviderSettings]);

  const cancelAddingSubagent = useCallback(() => {
    closeSubagentSettings();
  }, [closeSubagentSettings]);

  const dialogTitle = addingProvider ? t("settings.agents.newAgent") : activeProvider?.label ?? "";
  const dialogOpen = addingProvider || Boolean(activeProvider);
  const showProviderActions = addingProvider || Boolean(activeConfiguredProvider);
  const showEnvironmentActions = !addingProvider && Boolean(activeProvider);
  const dialogFooterStatus = providerError
    ?? environmentError
    ?? (environmentSaved && showEnvironmentActions
      ? t("settings.agentEnvironment.savedInline")
      : showProviderActions
        ? t("settings.agents.unsavedInline")
        : t("settings.agentEnvironment.unsavedInline"));
  const dialogFooterStatusTone = providerError || environmentError
    ? "text-destructive"
    : environmentSaved && showEnvironmentActions
      ? "text-primary"
      : "text-muted-foreground";
  const enabledProviderCount = providerOptions.filter((provider) => provider.enabled).length;
  const subagentDialogOpen = addingSubagent || Boolean(activeSubagent);
  const subagentDialogTitle = addingSubagent ? t("settings.subagents.newSubagent") : activeSubagent?.label ?? "";
  const subagentFooterStatus = subagentError ?? t("settings.subagents.unsavedInline");
  const subagentFooterStatusTone = subagentError ? "text-destructive" : "text-muted-foreground";

  return (
    <section className="mb-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="min-w-0 flex-1 truncate text-[19px] font-semibold leading-6 text-foreground">{title}</h2>
        <button
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/20"
          onClick={startAddingProvider}
          type="button"
        >
          <Plus className="h-[13px] w-[13px]" />
          <span>{t("settings.agents.add")}</span>
        </button>
      </div>

      <div className="space-y-1">
        {providerOptions.map((provider) => {
          const description = getConfiguredAgentProviderDescription(provider.configuredProvider, provider) || t("settings.agents.builtInDescription");
          const disableSwitch = savingEnabledProviderId === provider.id || (provider.enabled && enabledProviderCount <= 1);
          return (
            <div className={cn("flex min-h-[74px] items-center justify-between gap-3 rounded-md px-1 py-3", !provider.enabled && "opacity-70")} key={provider.id}>
              <div className="flex min-w-0 items-start gap-3">
                <AgentLogo className="mt-0.5 h-8 w-8" label={provider.label} logoDataUrl={provider.logoDataUrl} />
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-foreground">{provider.label}</span>
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                        provider.enabled
                          ? "border-primary/25 bg-accent text-primary"
                          : "border-border bg-muted text-muted-foreground"
                      )}
                    >
                      {provider.enabled ? t("settings.agents.enabled") : t("settings.agents.disabled")}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 max-w-[620px] text-[12px] leading-5 text-muted-foreground">{description}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SettingsSwitch
                  ariaLabel={t("settings.agents.enabledAria", { agent: provider.label })}
                  checked={provider.enabled}
                  disabled={disableSwitch}
                  onChange={(enabled) => void toggleProviderEnabled(provider.id, enabled)}
                />
                <button
                  aria-label={t("settings.agents.configure", { agent: provider.label })}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
                  onClick={() => openProviderSettings(provider.id)}
                  title={t("settings.agents.configure", { agent: provider.label })}
                  type="button"
                >
                  <Settings className="h-[14px] w-[14px]" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{t("settings.subagents.title")}</h3>
          <button
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={providerOptions.length === 0}
            onClick={startAddingSubagent}
            type="button"
          >
            <Plus className="h-[13px] w-[13px]" />
            <span>{t("settings.subagents.add")}</span>
          </button>
        </div>

        <div className="space-y-1">
          {configuredSubagents.length ? configuredSubagents.map((subagent) => {
            const provider = providerOptions.find((option) => option.id === subagent.providerId);
            const providerMode = getAgentProviderSubagentMode(provider);
            return (
              <div className="flex min-h-[64px] items-center justify-between gap-3 rounded-md px-1 py-3" key={subagent.id}>
                <div className="flex min-w-0 items-start gap-3">
                  <AgentLogo className="mt-0.5 h-8 w-8" label={provider?.label ?? subagent.providerId} logoDataUrl={provider?.logoDataUrl} />
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-foreground">{subagent.label}</span>
                      <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{provider?.label ?? subagent.providerId}</span>
                      <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{t(`settings.subagents.providerMode.${providerMode}`)}</span>
                      {subagent.capabilities.slice(0, 2).map((capability) => (
                        <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground" key={capability}>{capability}</span>
                      ))}
                    </div>
                    <p className="mt-1 line-clamp-2 max-w-[620px] text-[12px] leading-5 text-muted-foreground">{subagent.description || t("settings.subagents.defaultDescription")}</p>
                  </div>
                </div>
                <button
                  aria-label={t("settings.subagents.configure", { agent: subagent.label })}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
                  onClick={() => openSubagentSettings(subagent.id)}
                  title={t("settings.subagents.configure", { agent: subagent.label })}
                  type="button"
                >
                  <Settings className="h-[14px] w-[14px]" />
                </button>
              </div>
            );
          }) : (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-[12px] leading-5 text-muted-foreground">{t("settings.subagents.empty")}</div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {dialogOpen ? (
          <AgentSettingsDialog
            footer={
              <div className="flex min-h-8 items-center justify-between gap-3">
                <p className={cn("min-w-0 text-[12px] leading-5", dialogFooterStatusTone)}>{dialogFooterStatus}</p>
                <div className="flex shrink-0 items-center gap-2">
                  {showEnvironmentActions ? (
                    <>
                      <button
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
                        onClick={openEnvironmentImportDialog}
                        type="button"
                      >
                        <HardDriveUpload className="h-[13px] w-[13px]" />
                        <span>{t("settings.agentEnvironment.importButton")}</span>
                      </button>
                      <button
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={savingEnvironment}
                        onClick={() => void saveEnvironment()}
                        type="button"
                      >
                        {savingEnvironment ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Save className="h-[13px] w-[13px]" />}
                        <span>{t("settings.agentEnvironment.save")}</span>
                      </button>
                    </>
                  ) : null}
                  {addingProvider ? (
                    <button
                      className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
                      onClick={cancelAddingProvider}
                      type="button"
                    >
                      {t("common.cancel")}
                    </button>
                  ) : null}
                  {showProviderActions ? (
                    <button
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={savingProvider}
                      onClick={() => void saveProvider()}
                      type="button"
                    >
                      {savingProvider ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Save className="h-[13px] w-[13px]" />}
                      <span>{t("settings.agents.save")}</span>
                    </button>
                  ) : null}
                </div>
              </div>
            }
            key={addingProvider ? "new-agent" : activeProvider?.id}
            onClose={closeProviderSettings}
            title={dialogTitle}
          >
            {addingProvider || activeConfiguredProvider ? (
              <AgentProviderConfigurationEditor
                form={providerForm}
                isNew={addingProvider}
                onChange={updateProviderForm}
                onDelete={activeConfiguredProvider ? deleteProvider : undefined}
              />
            ) : null}

            {!addingProvider && activeProvider ? (
              <>
                <AgentEnvironmentEditor
                  onAddRowAfter={addEnvironmentRowAfter}
                  onRemoveRow={removeEnvironmentRow}
                  onUpdateRow={updateEnvironmentRow}
                  rows={environmentRows}
                />
                {environmentImportDialogOpen ? (
                  <AgentEnvironmentImportDialog
                    error={environmentImportError}
                    importing={importingEnvironmentTemplate}
                    link={environmentTemplateLink}
                    loadingTemplates={loadingEnvironmentTemplates}
                    onClose={closeEnvironmentImportDialog}
                    onImport={importEnvironmentTemplate}
                    onLinkChange={updateEnvironmentTemplateLink}
                    onSelectTemplate={selectEnvironmentTemplate}
                    selectedTemplateId={environmentImportTemplateId}
                    templateSourceError={environmentTemplateSourceError}
                    templates={environmentTemplates}
                  />
                ) : null}
              </>
            ) : (
              <div className="pt-4 text-[12px] leading-5 text-muted-foreground">{t("settings.agents.saveBeforeEnv")}</div>
            )}
          </AgentSettingsDialog>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {subagentDialogOpen ? (
          <AgentSettingsDialog
            footer={
              <div className="flex min-h-8 items-center justify-between gap-3">
                <p className={cn("min-w-0 text-[12px] leading-5", subagentFooterStatusTone)}>{subagentFooterStatus}</p>
                <div className="flex shrink-0 items-center gap-2">
                  {addingSubagent ? (
                    <button
                      className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
                      onClick={cancelAddingSubagent}
                      type="button"
                    >
                      {t("common.cancel")}
                    </button>
                  ) : null}
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={savingSubagent}
                    onClick={() => void saveSubagent()}
                    type="button"
                  >
                    {savingSubagent ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Save className="h-[13px] w-[13px]" />}
                    <span>{t("settings.subagents.save")}</span>
                  </button>
                </div>
              </div>
            }
            key={addingSubagent ? "new-subagent" : activeSubagent?.id}
            onClose={closeSubagentSettings}
            title={subagentDialogTitle}
          >
            <SubagentConfigurationEditor
              agentProviders={providerOptions}
              form={subagentForm}
              isNew={addingSubagent}
              onChange={updateSubagentForm}
              onDelete={activeSubagent ? deleteSubagent : undefined}
            />
          </AgentSettingsDialog>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export function AgentEnvironmentImportDialog({
  error,
  importing,
  link,
  loadingTemplates,
  onClose,
  onImport,
  onLinkChange,
  onSelectTemplate,
  selectedTemplateId,
  templateSourceError,
  templates
}: {
  error: string | null;
  importing: boolean;
  link: string;
  loadingTemplates: boolean;
  onClose: () => void;
  onImport: () => Promise<void>;
  onLinkChange: (value: string) => void;
  onSelectTemplate: (templateId: string) => void;
  selectedTemplateId: string;
  templateSourceError: string | null;
  templates: AgentEnvironmentTemplateDefinition[];
}) {
  const { t } = useI18n();

  return (
    <AgentSettingsDialog
      dialogClassName="w-[min(92vw,560px)] max-w-none"
      footer={(
        <div className="flex min-h-8 items-center justify-between gap-3">
          <p className={cn("min-w-0 text-[12px] leading-5", error ? "text-destructive" : "text-muted-foreground")}>
            {error ?? t("settings.agentEnvironment.importDescription")}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
              onClick={onClose}
              type="button"
            >
              {t("common.cancel")}
            </button>
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={importing}
              onClick={() => void onImport()}
              type="button"
            >
              {importing ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <HardDriveUpload className="h-[13px] w-[13px]" />}
              <span>{t("settings.agentEnvironment.importTemplate")}</span>
            </button>
          </div>
        </div>
      )}
      onClose={onClose}
      title={t("settings.agentEnvironment.importTitle")}
    >
      <div className="grid grid-cols-1 gap-4">
        <SearchableAgentEnvironmentTemplateSelect
          error={templateSourceError}
          loading={loadingTemplates}
          onChange={onSelectTemplate}
          selectedTemplateId={selectedTemplateId}
          templates={templates}
        />
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{t("settings.agentEnvironment.templateLink")}</span>
          <input
            className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15"
            onChange={(event) => onLinkChange(event.target.value)}
            placeholder="https://example.com/agent-env-template.json"
            spellCheck={false}
            type="url"
            value={link}
          />
        </label>
      </div>
    </AgentSettingsDialog>
  );
}

export function SearchableAgentEnvironmentTemplateSelect({
  error,
  loading,
  onChange,
  selectedTemplateId,
  templates
}: {
  error: string | null;
  loading: boolean;
  onChange: (templateId: string) => void;
  selectedTemplateId: string;
  templates: AgentEnvironmentTemplateDefinition[];
}) {
  const { t } = useI18n();
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const hasTemplates = templates.length > 0;
  const disabled = loading || !hasTemplates;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visibleTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return templates;
    return templates.filter((template) => {
      return `${template.label} ${template.description}`.toLowerCase().includes(normalizedQuery);
    });
  }, [query, templates]);

  return (
    <label className="relative block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{t("settings.agentEnvironment.template")}</span>
      <input
        aria-expanded={open}
        aria-label={t("settings.agentEnvironment.template")}
        className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (disabled) return;
          setQuery("");
          setOpen(true);
        }}
        placeholder={t("settings.agentEnvironment.templateSearchPlaceholder")}
        role="combobox"
        spellCheck={false}
        value={loading ? t("settings.agentEnvironment.templateSourceLoading") : hasTemplates ? (open ? query : selectedTemplate?.label ?? "") : t("settings.agentEnvironment.templateSourceEmpty")}
      />
      {open ? (
        <div
          className="macos-dropdown absolute left-0 right-0 top-[54px] z-[90] max-h-48 overflow-auto rounded-md border border-border bg-popover p-1"
          role="listbox"
        >
          {visibleTemplates.length ? visibleTemplates.map((template) => {
            const selected = template.id === selectedTemplateId;
            return (
              <button
                aria-selected={selected}
                className={cn(
                  "flex w-full min-w-0 flex-col rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted",
                  selected && "bg-accent text-accent-foreground"
                )}
                key={template.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(template.id);
                  setQuery("");
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                <span className="text-[12px] font-medium">{template.label}</span>
                <span className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{template.description}</span>
              </button>
            );
          }) : (
            <div className="px-2 py-3 text-center text-[12px] text-muted-foreground">{t("settings.agentEnvironment.templateNoResults")}</div>
          )}
        </div>
      ) : null}
      {selectedTemplate ? (
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{selectedTemplate.description}</p>
      ) : error ? (
        <p className="mt-1 text-[11px] leading-4 text-destructive">{error}</p>
      ) : !loading ? (
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t("settings.agentEnvironment.templateSourceEmpty")}</p>
      ) : null}
    </label>
  );
}

export function AgentSettingsDialog({
  children,
  contentClassName,
  dialogClassName,
  footer,
  onClose,
  title
}: {
  children: ReactNode;
  contentClassName?: string;
  dialogClassName?: string;
  footer?: ReactNode;
  onClose: () => void;
  title: string;
}) {
  const { t } = useI18n();

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="codex-dialog-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={onClose}
      transition={{ duration: 0.14, ease: "easeOut" }}
    >
      <motion.div
        animate={{ opacity: 1, scale: 1, y: 0 }}
        aria-label={title}
        aria-modal="true"
        className={cn(
          "codex-dialog codex-stacked-dialog flex max-h-[86vh] w-full max-w-[720px] flex-col rounded-lg border border-border bg-popover text-foreground shadow-[0_18px_60px_rgba(0,0,0,.28)]",
          dialogClassName
        )}
        exit={{ opacity: 0, scale: 0.98, y: 12 }}
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        tabIndex={-1}
        transition={popoverSpringTransition}
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 px-4">
          <div className="min-w-0 truncate text-[14px] font-semibold text-foreground">{title}</div>
          <button
            aria-label={t("common.close")}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
            onClick={onClose}
            title={t("common.close")}
            type="button"
          >
            <X className="h-[14px] w-[14px]" />
          </button>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-auto p-4", contentClassName)}>{children}</div>
        {footer ? <div className="shrink-0 border-t border-border px-4 py-3">{footer}</div> : null}
      </motion.div>
    </motion.div>
  );
}

export function AgentLogoPicker({
  label,
  logoDataUrl,
  onChange
}: {
  label: string;
  logoDataUrl: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError(t("settings.agents.logoInvalid"));
      return;
    }

    if (file.size > maxAgentLogoBytes) {
      setError(t("settings.agents.logoTooLarge"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const logo = normalizeAgentLogoDataUrl(reader.result);
      if (!logo) {
        setError(t("settings.agents.logoInvalid"));
        return;
      }
      onChange(logo);
      setError(null);
    };
    reader.onerror = () => setError(t("settings.agents.logoInvalid"));
    reader.readAsDataURL(file);
  }, [onChange, t]);

  return (
    <div className="mb-4 flex min-w-0 items-center justify-between gap-4 rounded-md border border-border bg-card/50 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <AgentLogo className="h-11 w-11 rounded-lg" label={label} logoDataUrl={logoDataUrl || undefined} />
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-foreground">{t("settings.agents.logo")}</div>
          <p className={cn("mt-1 text-[11px] leading-4", error ? "text-destructive" : "text-muted-foreground")}>
            {error ?? t("settings.agents.logoDescription")}
          </p>
        </div>
      </div>
      <input
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleFileChange}
        ref={inputRef}
        type="file"
      />
      <div className="flex shrink-0 items-center gap-2">
        {logoDataUrl ? (
          <button
            className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
            onClick={() => {
              onChange("");
              setError(null);
            }}
            type="button"
          >
            {t("settings.agents.logoRemove")}
          </button>
        ) : null}
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <HardDriveUpload className="h-[13px] w-[13px]" />
          <span>{t("settings.agents.logoUpload")}</span>
        </button>
      </div>
    </div>
  );
}

export function AgentProviderConfigurationEditor({
  form,
  isNew,
  onChange,
  onDelete
}: {
  form: AgentProviderSettingsForm | null;
  isNew: boolean;
  onChange: (key: keyof AgentProviderSettingsForm, value: string) => void;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  if (!form) return null;

  const transportOptions = [
    { label: t("settings.agents.transportStdio"), value: "stdio" },
    { label: t("settings.agents.transportWebsocket"), value: "websocket" },
    { label: t("settings.agents.transportSsh"), value: "ssh" }
  ];
  const requiresCommand = form.transport === "stdio" || form.transport === "persistent-stdio" || form.transport === "ssh";
  const requiresUrl = form.transport === "websocket" || form.transport === "ssh";
  const commandPlaceholder = form.transport === "ssh" ? "my-agent-asp" : "my-agent-asp";
  const urlPlaceholder = form.transport === "ssh" ? "ssh://user@example.com:22" : "ws://127.0.0.1:8787/asp";

  return (
    <div className="pb-4">
      {!isNew && onDelete ? (
        <div className="mb-3 flex justify-end">
          <button
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground outline-none transition hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/20"
            onClick={onDelete}
            title={t("settings.agents.delete")}
            type="button"
          >
            <Trash2 className="h-[13px] w-[13px]" />
          </button>
        </div>
      ) : null}

      <AgentLogoPicker
        label={form.label || form.id || t("settings.agents.newAgent")}
        logoDataUrl={form.logoDataUrl}
        onChange={(value) => onChange("logoDataUrl", value)}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <AgentSettingsTextField
          disabled={!isNew}
          label={t("settings.agents.id")}
          onChange={(value) => onChange("id", value)}
          placeholder="my-agent"
          value={form.id}
        />
        <AgentSettingsTextField
          label={t("settings.agents.label")}
          onChange={(value) => onChange("label", value)}
          placeholder="My Agent"
          value={form.label}
        />
        <label className="block min-w-0">
          <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{t("settings.agents.transport")}</span>
          <Select
            aria-label={t("settings.agents.transport")}
            onValueChange={(value) => onChange("transport", value)}
            options={transportOptions}
            selectClassName="h-8 w-full max-w-none border border-input bg-card px-2 text-[12px] font-normal"
            value={form.transport}
          />
        </label>
        {requiresUrl ? (
          <AgentSettingsTextField
            label={form.transport === "ssh" ? t("settings.agents.sshTarget") : t("settings.agents.url")}
            onChange={(value) => onChange("url", value)}
            placeholder={urlPlaceholder}
            value={form.url}
          />
        ) : null}
        {requiresCommand ? (
          <AgentSettingsTextField
            className={requiresUrl ? "" : "md:col-span-2"}
            label={form.transport === "ssh" ? t("settings.agents.remoteCommand") : t("settings.agents.command")}
            onChange={(value) => onChange("command", value)}
            placeholder={commandPlaceholder}
            value={form.command}
          />
        ) : null}
        {form.transport === "ssh" ? (
          <AgentSettingsTextArea
            label={t("settings.agents.installCommand")}
            onChange={(value) => onChange("installCommand", value)}
            placeholder="npm i -g my-agent-cli"
            value={form.installCommand}
          />
        ) : null}
        {requiresCommand ? (
          <AgentSettingsTextArea
            label={t("settings.agents.args")}
            onChange={(value) => onChange("argsText", value)}
            placeholder="--stdio"
            value={form.argsText}
          />
        ) : null}
        <AgentSettingsTextArea
          label={t("settings.agents.models")}
          onChange={(value) => onChange("modelsText", value)}
          placeholder="gpt-5-codex"
          value={form.modelsText}
        />
        <AgentSettingsTextField
          label={t("settings.agents.timeout")}
          onChange={(value) => onChange("timeoutMs", value)}
          placeholder="1800000"
          value={form.timeoutMs}
        />
        <AgentSettingsTextField
          className="md:col-span-2"
          label={t("settings.agents.description")}
          onChange={(value) => onChange("description", value)}
          placeholder={t("common.optional")}
          value={form.description}
        />
      </div>
    </div>
  );
}

export function SubagentConfigurationEditor({
  agentProviders,
  form,
  isNew,
  onChange,
  onDelete
}: {
  agentProviders: AgentProviderOption[];
  form: SubagentSettingsForm | null;
  isNew: boolean;
  onChange: (key: keyof SubagentSettingsForm, value: string) => void;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  if (!form) return null;

  const providerOptions = agentProviders.map((provider) => ({
    label: provider.label,
    value: provider.id
  }));
  const selectedProvider = agentProviders.find((provider) => provider.id === form.providerId) ?? agentProviders[0] ?? null;
  const modelOptions = selectedProvider?.models ?? [];
  const selectedModel = selectedProvider && modelOptions.length
    ? getValidAgentModel(form.model, agentProviders, selectedProvider.id)
    : form.model;
  const modelSelectOptions = modelOptions.map((model) => ({
    label: model.label,
    value: model.value
  }));
  const effortOptions = getAgentEffortOptionsForModel(selectedModel, modelOptions, selectedProvider).map((effort) => ({
    label: t(`agent.effort.${effort}`),
    value: effort
  }));
  const speedOptions = getAgentSpeedOptionsForModel(selectedModel, modelOptions, selectedProvider).map((speed) => ({
    label: getAgentSpeedLabel(speed, t),
    value: speed
  }));
  const speedSelectOptions = speedOptions.length
    ? speedOptions
    : [{ label: getAgentSpeedLabel("default", t), value: "default" }];
  const approvalOptions = agentApprovalModes.map((mode) => ({
    label: t(`agent.permission.${mode}`),
    value: mode
  }));
  const providerSubagentMode = getAgentProviderSubagentMode(selectedProvider);
  const runtimeModeOptions = [
    { label: t("settings.subagents.runtime.auto"), value: "auto" },
    { label: t("settings.subagents.runtime.native"), value: "native" },
    { label: t("settings.subagents.runtime.emulated"), value: "emulated" }
  ];
  const runtimeAdapter = getAgentProviderRuntimeAdapter(selectedProvider);
  const wireProtocol = getAgentProviderWireProtocol(selectedProvider);
  const transportLabel = selectedProvider?.capabilities?.transports?.join(", ") || selectedProvider?.kind || "";

  return (
    <div className="pb-4">
      {!isNew && onDelete ? (
        <div className="mb-3 flex justify-end">
          <button
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground outline-none transition hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/20"
            onClick={onDelete}
            title={t("settings.subagents.delete")}
            type="button"
          >
            <Trash2 className="h-[13px] w-[13px]" />
          </button>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <AgentSettingsTextField
            label={t("settings.subagents.label")}
            onChange={(value) => onChange("label", value)}
            placeholder="Reviewer"
            value={form.label}
          />
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{t("settings.subagents.provider")}</span>
            <Select
              aria-label={t("settings.subagents.provider")}
              className="w-full"
              onValueChange={(value) => onChange("providerId", value)}
              options={providerOptions}
              selectClassName="h-8 w-full max-w-none border border-input bg-card px-2 text-[12px] font-normal"
              value={form.providerId}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{t("agent.permissions")}</span>
            <Select
              aria-label={t("agent.permissions")}
              className="w-full"
              onValueChange={(value) => onChange("approvalMode", value)}
              options={approvalOptions}
              selectClassName="h-8 w-full max-w-none border border-input bg-card px-2 text-[12px] font-normal"
              value={form.approvalMode}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                {t(`settings.subagents.providerMode.${providerSubagentMode}`)}
              </span>
              {runtimeAdapter ? (
                <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{runtimeAdapter}</span>
              ) : null}
              {wireProtocol ? (
                <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{wireProtocol}</span>
              ) : null}
              {transportLabel ? (
                <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{transportLabel}</span>
              ) : null}
            </div>
            <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
              {selectedProvider?.capabilities?.subagents?.description || selectedProvider?.description || t("settings.subagents.providerRuntimeFallback")}
            </p>
          </div>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{t("settings.subagents.runtimeMode")}</span>
            <Select
              aria-label={t("settings.subagents.runtimeMode")}
              className="w-full"
              onValueChange={(value) => onChange("runtimeMode", value)}
              options={runtimeModeOptions}
              selectClassName="h-8 w-full max-w-none border border-input bg-card px-2 text-[12px] font-normal"
              value={form.runtimeMode}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {modelSelectOptions.length ? (
            <label className="block min-w-0">
              <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{t("settings.subagents.model")}</span>
              <Select
                aria-label={t("settings.subagents.model")}
                className="w-full"
                onValueChange={(value) => onChange("model", value)}
                options={modelSelectOptions}
                selectClassName="h-8 w-full max-w-none border border-input bg-card px-2 text-[12px] font-normal"
                value={selectedModel}
              />
            </label>
          ) : (
            <AgentSettingsTextField
              label={t("settings.subagents.model")}
              onChange={(value) => onChange("model", value)}
              placeholder={t("agent.defaultModel")}
              value={form.model}
            />
          )}
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{t("agent.effort")}</span>
            <Select
              aria-label={t("agent.effort")}
              className="w-full"
              onValueChange={(value) => onChange("effort", value)}
              options={effortOptions}
              selectClassName="h-8 w-full max-w-none border border-input bg-card px-2 text-[12px] font-normal"
              value={form.effort}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{t("agent.speed")}</span>
            <Select
              aria-label={t("agent.speed")}
              className="w-full"
              disabled={!speedOptions.length}
              onValueChange={(value) => onChange("speed", value)}
              options={speedSelectOptions}
              selectClassName="h-8 w-full max-w-none border border-input bg-card px-2 text-[12px] font-normal"
              value={speedOptions.length ? form.speed : "default"}
            />
          </label>
        </div>
        <AgentSettingsTextArea
          label={t("settings.subagents.capabilities")}
          onChange={(value) => onChange("capabilitiesText", value)}
          placeholder={t("settings.subagents.capabilitiesPlaceholder")}
          value={form.capabilitiesText}
        />
        <AgentSettingsTextArea
          label={t("settings.subagents.contextScope")}
          onChange={(value) => onChange("contextScope", value)}
          placeholder={t("settings.subagents.contextScopePlaceholder")}
          value={form.contextScope}
        />
        <AgentSettingsTextField
          label={t("settings.subagents.description")}
          onChange={(value) => onChange("description", value)}
          placeholder={t("settings.subagents.descriptionPlaceholder")}
          value={form.description}
        />
        <AgentSettingsTextArea
          label={t("settings.subagents.systemPrompt")}
          onChange={(value) => onChange("systemPrompt", value)}
          placeholder={t("settings.subagents.systemPromptPlaceholder")}
          value={form.systemPrompt}
        />
        <AgentSettingsTextArea
          label={t("settings.subagents.outputContract")}
          onChange={(value) => onChange("outputContract", value)}
          placeholder={t("settings.subagents.outputContractPlaceholder")}
          value={form.outputContract}
        />
        <AgentSettingsTextArea
          label={t("settings.subagents.qualityGates")}
          onChange={(value) => onChange("qualityGatesText", value)}
          placeholder={t("settings.subagents.qualityGatesPlaceholder")}
          value={form.qualityGatesText}
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <AgentSettingsTextField
            label={t("settings.subagents.maxDurationMs")}
            onChange={(value) => onChange("maxDurationMs", value)}
            placeholder="600000"
            value={form.maxDurationMs}
          />
          <AgentSettingsTextField
            label={t("settings.subagents.maxToolCalls")}
            onChange={(value) => onChange("maxToolCalls", value)}
            placeholder="20"
            value={form.maxToolCalls}
          />
          <AgentSettingsTextField
            label={t("settings.subagents.maxTokens")}
            onChange={(value) => onChange("maxTokens", value)}
            placeholder="12000"
            value={form.maxTokens}
          />
        </div>
        <SubagentMcpServerEditor
          onChange={(value) => onChange("toolsText", value)}
          value={form.toolsText}
        />
      </div>
    </div>
  );
}

export function SubagentMcpServerEditor({
  onChange,
  value
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useI18n();
  const [dialogMode, setDialogMode] = useState<"edit" | "install" | null>(null);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [form, setForm] = useState<ToolHubMcpServerForm>(() => createToolHubMcpServerForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<ToolHubMcpServerInputMode>("form");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState("");
  const { error: parseError, mcpServers } = useMemo(() => getSubagentMcpServersFromText(value, t), [t, value]);
  const serverEntries = useMemo(() => Object.entries(mcpServers), [mcpServers]);

  const updateForm = useCallback<ToolHubMcpServerFormUpdate>((key, nextValue) => {
    setForm((currentForm) => ({ ...currentForm, [key]: nextValue }));
    setFormError(null);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogMode(null);
    setEditingServerId(null);
    setForm(createToolHubMcpServerForm());
    setFormError(null);
    setInputMode("form");
    setJsonError(null);
    setJsonText("");
  }, []);

  const openInstallDialog = useCallback(() => {
    setDialogMode("install");
    setEditingServerId(null);
    setForm(createToolHubMcpServerForm());
    setFormError(null);
    setInputMode("form");
    setJsonError(null);
    setJsonText("");
  }, []);

  const openEditDialog = useCallback((serverId: string, server: AgentMcpServerConfig) => {
    setDialogMode("edit");
    setEditingServerId(serverId);
    setForm(createToolHubMcpServerForm(createToolHubServerFromSubagentMcpServer(serverId, server)));
    setFormError(null);
    setInputMode("form");
    setJsonError(null);
    setJsonText("");
  }, []);

  const updateJsonText = useCallback((nextValue: string) => {
    setJsonText(nextValue);
    setJsonError(null);
  }, []);

  const writeMcpServers = useCallback((nextServers: AgentMcpServerMap) => {
    onChange(stringifySubagentMcpServers(nextServers));
  }, [onChange]);

  const removeServer = useCallback((serverId: string) => {
    const nextServers = { ...mcpServers };
    delete nextServers[serverId];
    writeMcpServers(nextServers);
  }, [mcpServers, writeMcpServers]);

  const saveServer = useCallback(() => {
    if (!dialogMode) return;
    if (dialogMode === "install" && inputMode === "json") {
      const importResult = getSubagentMcpServersFromJsonText(jsonText, t);
      if (importResult.error || !importResult.mcpServers) {
        setJsonError(importResult.error || t("settings.subagents.toolsInvalid"));
        return;
      }

      const nextServers = { ...mcpServers };
      for (const [serverId, server] of Object.entries(importResult.mcpServers)) {
        nextServers[createUniqueSubagentMcpServerId(serverId, nextServers)] = server;
      }
      writeMcpServers(nextServers);
      closeDialog();
      return;
    }

    const nextForm = editingServerId ? { ...form, id: editingServerId } : {
      ...form,
      id: createUniqueSubagentMcpServerId(getToolHubServerIdSource(form) || form.label || "mcp-server", mcpServers)
    };
    const { error, server } = getToolHubMcpServerFromForm(nextForm, t);
    if (error || !server) {
      setFormError(error || t("settings.toolhub.invalidServer"));
      return;
    }

    const nextServers = { ...mcpServers };
    if (editingServerId && editingServerId !== server.id) {
      delete nextServers[editingServerId];
    }
    nextServers[server.id] = getSubagentMcpServerFromToolHubServer(server);
    writeMcpServers(nextServers);
    closeDialog();
  }, [closeDialog, dialogMode, editingServerId, form, inputMode, jsonText, mcpServers, t, writeMcpServers]);

  return (
    <div className="block min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="block text-[11px] font-medium uppercase text-muted-foreground">{t("settings.subagents.tools")}</span>
        <button
          aria-label={t("settings.subagents.addTool")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-background text-foreground outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/20"
          onClick={openInstallDialog}
          title={t("settings.subagents.addTool")}
          type="button"
        >
          <Plus className="h-[13px] w-[13px]" />
        </button>
      </div>
      <div className="min-h-[88px] rounded-md border border-input bg-card p-2">
        {serverEntries.length ? (
          <div className="space-y-2">
            {serverEntries.map(([serverId, server]) => (
              <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-2" key={serverId}>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[12px] font-medium text-foreground">{serverId}</span>
                    <span className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">{getSubagentMcpServerTransportLabel(server)}</span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground" title={server.url || server.command}>
                    {server.url || [server.command, ...(server.args ?? [])].filter(Boolean).join(" ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    aria-label={t("common.edit")}
                    className="grid h-7 w-7 place-items-center rounded-md border border-border bg-card text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
                    onClick={() => openEditDialog(serverId, server)}
                    title={t("common.edit")}
                    type="button"
                  >
                    <SquarePen className="h-[13px] w-[13px]" />
                  </button>
                  <button
                    aria-label={t("common.remove")}
                    className="grid h-7 w-7 place-items-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive outline-none transition hover:bg-destructive/15 focus-visible:ring-2 focus-visible:ring-ring/20"
                    onClick={() => removeServer(serverId)}
                    title={t("common.remove")}
                    type="button"
                  >
                    <Trash2 className="h-[13px] w-[13px]" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid min-h-[70px] place-items-center rounded-md border border-dashed border-border px-3 text-center text-[12px] leading-5 text-muted-foreground">
            {parseError ?? t("settings.subagents.noTools")}
          </div>
        )}
      </div>

      <AnimatePresence>
        {dialogMode ? (
          <AgentSettingsDialog
            dialogClassName="w-[min(92vw,720px)] max-w-none"
            footer={(
              <div className="flex min-h-8 items-center justify-between gap-3">
                <p className={cn("min-w-0 text-[12px] leading-5", formError ? "text-destructive" : "text-muted-foreground")}>
                  {formError ?? t("settings.subagents.toolsDialogDescription")}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <PluginActionButton label={t("common.cancel")} onClick={closeDialog} />
                  <PluginActionButton label={dialogMode === "edit" ? t("common.save") : t("settings.subagents.addTool")} onClick={saveServer} />
                </div>
              </div>
            )}
            key="subagent-mcp-server-dialog"
            onClose={closeDialog}
            title={dialogMode === "edit" ? t("settings.subagents.editTool") : t("settings.subagents.addTool")}
          >
            {dialogMode === "install" ? (
              <div className="space-y-4">
                <ToolHubMcpServerInputModeTabs
                  mode={inputMode}
                  onChange={(mode) => {
                    setInputMode(mode);
                    setFormError(null);
                    setJsonError(null);
                  }}
                />
                <div className="px-0.5">
                  {inputMode === "json" ? (
                    <ToolHubMcpServerJsonImport
                      error={jsonError}
                      onChange={updateJsonText}
                      value={jsonText}
                    />
                  ) : (
                    <ToolHubMcpServerFormFields form={form} onUpdate={updateForm} />
                  )}
                </div>
              </div>
            ) : (
              <ToolHubMcpServerFormFields form={form} onUpdate={updateForm} />
            )}
          </AgentSettingsDialog>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function getSubagentMcpServersFromText(value: string, t: TFunction): { error: string | null; mcpServers: AgentMcpServerMap } {
  if (!value.trim()) return { error: null, mcpServers: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return { error: t("settings.subagents.toolsInvalid"), mcpServers: {} };
  }

  const record = getToolHubImportRecord(parsed);
  const mcpServers = normalizeAgentMcpServerMap(record?.mcpServers ?? record?.tools ?? parsed);
  return { error: null, mcpServers };
}

function getSubagentMcpServersFromJsonText(text: string, t: TFunction): { error: string | null; mcpServers: AgentMcpServerMap | null } {
  const source = text.trim();
  if (!source) return { error: t("settings.subagents.toolsInvalid"), mcpServers: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { error: t("settings.subagents.toolsInvalid"), mcpServers: null };
  }

  const importedServers = getToolHubMcpServersFromImportValue(parsed);
  if (importedServers.length) {
    return {
      error: null,
      mcpServers: Object.fromEntries(importedServers.map((server) => [server.id, getSubagentMcpServerFromToolHubServer(server)]))
    };
  }

  const record = getToolHubImportRecord(parsed);
  const mcpServers = normalizeAgentMcpServerMap(record?.mcpServers ?? record?.tools ?? parsed);
  if (!Object.keys(mcpServers).length) {
    return { error: t("settings.subagents.toolsEmpty"), mcpServers: null };
  }
  return { error: null, mcpServers };
}

function stringifySubagentMcpServers(mcpServers: AgentMcpServerMap): string {
  return Object.keys(mcpServers).length ? JSON.stringify({ mcpServers }, null, 2) : "";
}

function createToolHubServerFromSubagentMcpServer(serverId: string, server: AgentMcpServerConfig): ToolHubUserMcpServerConfig {
  return {
    ...server,
    enabled: true,
    id: serverId,
    label: serverId
  };
}

function getSubagentMcpServerFromToolHubServer(server: ToolHubUserMcpServerConfig): AgentMcpServerConfig {
  const {
    enabled: _enabled,
    id: _id,
    label: _label,
    ...mcpServer
  } = server;
  return mcpServer;
}

function createUniqueSubagentMcpServerId(source: string, servers: AgentMcpServerMap): string {
  const baseId = source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 72) || "mcp-server";
  const existingIds = new Set(Object.keys(servers));
  let candidate = /^[a-z0-9]/.test(baseId) ? baseId : `mcp-${baseId}`;
  if (!existingIds.has(candidate)) return candidate;

  for (let index = 2; index < 10_000; index += 1) {
    candidate = `${baseId.slice(0, 88)}-${index}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `mcp-server-${Date.now()}`;
}

function getSubagentMcpServerTransportLabel(server: AgentMcpServerConfig): string {
  const type = server.type ?? (server.url ? "http" : "stdio");
  if (type === "sse") return "SSE";
  if (type === "stdio") return "stdio";
  return "Streamable HTTP";
}

export function AgentEnvironmentEditor({
  onAddRowAfter,
  onRemoveRow,
  onUpdateRow,
  rows
}: {
  onAddRowAfter: (rowId: string) => void;
  onRemoveRow: (rowId: string) => void;
  onUpdateRow: (rowId: string, key: "name" | "value", value: string) => void;
  rows: AgentEnvironmentRow[];
}) {
  const { t } = useI18n();

  return (
    <div className="pt-1">
      <div className="mb-3 flex min-w-0 items-center">
        <div className="text-[13px] font-medium text-foreground">{t("settings.agentEnvironment.variables.label")}</div>
      </div>
      <div className="grid grid-cols-[minmax(140px,1fr)_minmax(180px,1.35fr)_32px_32px] gap-2">
        <div className="px-1 text-[11px] font-medium uppercase text-muted-foreground">{t("settings.agentEnvironment.name")}</div>
        <div className="px-1 text-[11px] font-medium uppercase text-muted-foreground">{t("settings.agentEnvironment.value")}</div>
        <div />
        <div />
        {rows.map((row) => (
          <div className="contents" key={row.id}>
            <input
              className="h-8 min-w-0 rounded-md border border-input bg-card px-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15"
              onChange={(event) => onUpdateRow(row.id, "name", event.target.value)}
              placeholder="OPENAI_API_KEY"
              spellCheck={false}
              value={row.name}
            />
            <input
              className="h-8 min-w-0 rounded-md border border-input bg-card px-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15"
              onChange={(event) => onUpdateRow(row.id, "value", event.target.value)}
              placeholder={t("settings.agentEnvironment.valuePlaceholder")}
              spellCheck={false}
              value={row.value}
            />
            <button
              aria-label={t("settings.agentEnvironment.add")}
              className="grid h-7 w-7 place-items-center rounded-md border border-border bg-card text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
              onClick={() => onAddRowAfter(row.id)}
              title={t("settings.agentEnvironment.add")}
              type="button"
            >
              <Plus className="h-[13px] w-[13px]" />
            </button>
            <button
              aria-label={t("settings.agentEnvironment.remove", { name: row.name || t("settings.agentEnvironment.unnamed") })}
              className="grid h-7 w-7 place-items-center rounded-md border border-border bg-card text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
              onClick={() => onRemoveRow(row.id)}
              type="button"
            >
              <X className="h-[13px] w-[13px]" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentSettingsTextField({
  className,
  disabled = false,
  label,
  onChange,
  placeholder,
  value
}: {
  className?: string;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      <input
        className="h-8 w-full min-w-0 rounded-md border border-input bg-card px-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        value={value}
      />
    </label>
  );
}

export function AgentSettingsTextArea({
  label,
  onChange,
  placeholder,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      <textarea
        className="h-24 w-full resize-none rounded-md border border-input bg-card px-2 py-2 text-[12px] leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        value={value}
      />
    </label>
  );
}

export function ShortcutRecorder({
  defaultValue,
  onChange,
  onReset,
  value
}: {
  defaultValue: string;
  onChange: (accelerator: string) => Promise<void>;
  onReset: () => Promise<void>;
  value: string;
}) {
  const { t } = useI18n();
  const shortcutButtonRef = useRef<HTMLButtonElement>(null);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    if (recording) {
      shortcutButtonRef.current?.focus();
    }
  }, [recording]);

  const saveShortcut = async (accelerator: string) => {
    setPending(true);
    try {
      await onChange(accelerator);
    } finally {
      setPending(false);
    }
  };

  const resetShortcut = async () => {
    setRecording(false);
    setInputError(null);
    setPending(true);
    try {
      await onReset();
    } finally {
      setPending(false);
    }
  };

  const handleRecordKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;

    event.preventDefault();
    event.stopPropagation();

    const hasModifier = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (event.key === "Escape" && !hasModifier) {
      setRecording(false);
      setInputError(null);
      return;
    }

    const accelerator = acceleratorFromKeyboardEvent(event);
    if (!accelerator) {
      setInputError(t("settings.shortcut.invalidCombination"));
      return;
    }

    setRecording(false);
    setInputError(null);
    void saveShortcut(accelerator);
  };

  return (
    <div className="flex min-w-[240px] max-w-[360px] flex-col items-end gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          className={cn(
            "min-w-[116px] max-w-[180px] truncate rounded-md border border-border bg-card px-2.5 py-1.5 text-center text-[12px] font-semibold text-card-foreground shadow-[inset_0_-1px_0_rgba(15,23,42,.08)] outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60",
            recording && "border-primary bg-accent text-primary"
          )}
          disabled={pending}
          onBlur={() => setRecording(false)}
          onClick={() => {
            setInputError(null);
            setRecording(true);
          }}
          onKeyDown={handleRecordKeyDown}
          ref={shortcutButtonRef}
          title={t("settings.shortcut.spotlight.description")}
          type="button"
        >
          {recording ? t("settings.shortcut.recording") : formatShortcutAccelerator(value)}
        </button>
        <button
          aria-label={t("settings.shortcut.reset")}
          className="grid h-7 w-7 place-items-center rounded-md border border-border bg-card text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={pending || value === defaultValue}
          onClick={() => void resetShortcut()}
          title={t("settings.shortcut.reset")}
          type="button"
        >
          <RotateCcw className="h-[13px] w-[13px]" />
        </button>
      </div>
      {inputError ? <p className="max-w-[360px] text-right text-[11px] leading-4 text-destructive">{inputError}</p> : null}
    </div>
  );
}

export function SettingsGroup({ children, title }: { children: ReactNode; title?: string | null }) {
  return (
    <section className="settings-group mb-8">
      {title ? <h3 className="settings-group-title mb-2 px-1 text-[14px] font-semibold text-foreground">{title}</h3> : null}
      <div className="settings-group-body space-y-1">{children}</div>
    </section>
  );
}

export function SettingsRow({
  children,
  description,
  label
}: {
  children: ReactNode;
  description: string;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <div className="settings-row flex min-h-[68px] items-center justify-between gap-6 rounded-md px-1 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        <p className="settings-row-description mt-1 max-w-[520px] text-[12px] leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsStackedRow({
  children,
  description,
  label
}: {
  children: ReactNode;
  description: string;
  label: string;
}) {
  return (
    <div className="settings-stacked-row rounded-md px-1 py-3">
      <div className="settings-stacked-row-header mb-3 min-w-0">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        <p className="settings-row-description mt-1 max-w-[680px] text-[12px] leading-5 text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function HomeThemeSettingsEditor({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const { t } = useI18n();
  const editorValue = value.trim() ? value : defaultHomeThemeConfigText;
  const validationError = getHomeThemeConfigError(editorValue);

  return (
    <div className="min-w-0">
      <textarea
        className="h-[260px] w-full resize-none rounded-md border border-input bg-card px-3 py-2 font-mono text-[12px] leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15"
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        value={editorValue}
      />
      <div className="mt-2 flex min-w-0 flex-wrap items-center justify-end gap-2">
        {validationError ? (
          <div className="min-w-0 flex-1 truncate text-[11px] text-destructive" title={validationError}>
            {t("settings.appearance.homeTheme.invalid")}
          </div>
        ) : null}
        <button
          className="h-7 rounded-md border border-border bg-card px-2 text-[12px] text-card-foreground transition hover:bg-muted"
          onClick={() => onChange(defaultHomeThemeConfigText)}
          type="button"
        >
          {t("settings.appearance.homeTheme.default")}
        </button>
        <button
          className="h-7 rounded-md border border-border bg-card px-2 text-[12px] text-card-foreground transition hover:bg-muted"
          onClick={() => onChange("")}
          type="button"
        >
          {t("settings.appearance.homeTheme.reset")}
        </button>
      </div>
    </div>
  );
}

export function SettingsSwitch({
  ariaLabel,
  checked,
  disabled = false,
  onChange
}: {
  ariaLabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-checked={checked}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 shadow-[inset_0_0_0_1px_var(--settings-switch-ring)] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-primary hover:bg-primary/90" : "bg-[var(--settings-switch-off)] hover:bg-[var(--settings-switch-off-hover)]"
      )}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          "pointer-events-none h-5 w-5 rounded-full bg-[var(--settings-switch-thumb)] shadow-[0_1px_2px_rgba(0,0,0,.18)] transition-transform duration-150",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}
