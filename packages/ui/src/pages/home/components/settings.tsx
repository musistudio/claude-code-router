import {
  Activity, AppConfig, AppCopy, AppInfo, AppLanguagePreference, Boxes, BotGatewayConfigDraft, botGatewayAuthSpecsForPlatform,
  botGatewayDefaultAuthType, botGatewayFieldsForAuth, botGatewayPickAuthFields, botGatewayPlatformLabel, botGatewayPlatformOptions,
  botGatewaySavedConfigFromDraft, botGatewaySavedConfigLabel, BotGatewayQrLoginStartResult, BotGatewayQrLoginWaitResult, BotGatewayQrWindowOpenResult, BotGatewaySavedConfig, Button,
  CircleAlert, closestCenter, cn, CSS, Database, Dialog, DialogBody, DialogContent,
  DialogFooter, DialogHeader, DialogTitle, Field, formatAppError, formatProviderAccountMeterValue, formatSystemOption, Gauge,
  Globe,
  createBotGatewayConfigDraft, createMcpServerDraft, createMcpServerDraftFromConfig, createMcpServerDraftFromUnknown, createRouteModelOptions, DndContext, DragEndEvent, GatewayMcpServerConfig, GatewayProviderConfig, Input, isBotGatewayConfigDraftSubmittable, KeyboardSensor, KeyRound, KeyValueRowsControl, languageDisplayName, Layers3, LoaderCircle,
  mcpServerConfigFromDraft, mcpServerEndpointSummary, mcpServerTransportOptions, mcpStdioMessageModeOptions, McpServerDraft, normalizeBotGatewayAuthType, normalizeBotGatewayPlatform, normalizeToolHubConfig, Palette, Pencil, Plus, ProfileConfig, profileAgentLabel,
  PanelLeftOpen, Power, ProviderAccountMeter, ProviderAccountSnapshot, ReactNode, ResolvedLanguage, ResolvedTheme, Select, SelectControl,
  PointerSensor, rectSortingStrategy, SettingsPageId, SortableContext, sortableKeyboardCoordinates, themeDisplayName,
  translateOptions, TrayBalanceProgressConfig, TrayComponentVariants, TrayWidgetConfig, TrayWidgetType, TrayWidgetVariant,
  appLogoUrl, trayMascotIconUrls, arrayMove, defaultTrayWidgetVariant, isTraySingletonWidgetType, normalizeTrayWidget, normalizeTrayWidgets, Switch, Textarea, Trash2, trayWidgetVariantOptions, useAppText, useEffect, useMemo, useRef, useSensor, useSensors, useSortable, useState, validateMcpServerDraft,
  X
} from "../shared/index";

const settingsPageContentWidthClassName = "mx-auto w-full max-w-[900px]";

export function AppSettingsDialog({
  appInfo,
  botAddRequestKey,
  botConfigs,
  copy,
  initialPage = "appearance",
  languagePreference,
  launchAtLogin,
  onChangeBotConfigs,
  onChangeLaunchAtLogin,
  onChangeObservability,
  onChangeToolHub,
  onChangeTrayBalanceProgress,
  onChangeLanguage,
  onChangeTheme,
  onChangeTrayIcon,
  onChangeTrayWidgets,
  onClose,
  observability,
  profiles,
  providers,
  providerAccountSnapshots,
  systemLanguage,
  systemTheme,
  themePreference,
  toolHub,
  traySupported,
  trayBalanceProgress,
  trayIconPreference,
  trayWidgets
}: {
  appInfo: AppInfo;
  botAddRequestKey?: number;
  botConfigs: BotGatewaySavedConfig[];
  copy: AppCopy;
  initialPage?: SettingsPageId;
  languagePreference: AppLanguagePreference;
  launchAtLogin: boolean;
  onChangeBotConfigs: (configs: BotGatewaySavedConfig[]) => void;
  onChangeLaunchAtLogin: (checked: boolean) => void;
  onChangeObservability: (patch: Partial<AppConfig["observability"]>) => void;
  onChangeToolHub: (patch: Partial<AppConfig["toolHub"]>) => void;
  onChangeTrayBalanceProgress: (config: TrayBalanceProgressConfig) => void;
  onChangeLanguage: (value: string) => void;
  onChangeTheme: (value: string) => void;
  onChangeTrayIcon: (value: string) => void;
  onChangeTrayWidgets: (widgets: TrayWidgetConfig[]) => void;
  onClose: () => void;
  observability: AppConfig["observability"];
  profiles: ProfileConfig[];
  providers: GatewayProviderConfig[];
  providerAccountSnapshots: ProviderAccountSnapshot[];
  systemLanguage: ResolvedLanguage;
  systemTheme: ResolvedTheme;
  themePreference: AppConfig["theme"];
  toolHub: AppConfig["toolHub"];
  traySupported: boolean;
  trayBalanceProgress?: TrayBalanceProgressConfig;
  trayIconPreference: AppConfig["trayIcon"];
  trayWidgets: TrayWidgetConfig[];
}) {
  return (
    <SettingsLayout
      copy={copy}
      initialPage={initialPage}
      onClose={onClose}
      renderPage={(activePage) => {
        if (activePage === "appearance") {
          return (
            <AppearanceSettingsPage
              copy={copy}
              languagePreference={languagePreference}
              launchAtLogin={launchAtLogin}
              launchAtLoginSupported={appInfo.launchAtLoginSupported}
              onChangeLaunchAtLogin={onChangeLaunchAtLogin}
              onChangeLanguage={onChangeLanguage}
              onChangeTheme={onChangeTheme}
              systemLanguage={systemLanguage}
              systemTheme={systemTheme}
              themePreference={themePreference}
            />
          );
        }
        if (activePage === "tray") {
          return (
            <TraySettingsPage
              copy={copy}
              onChangeTrayBalanceProgress={onChangeTrayBalanceProgress}
              onChangeTrayIcon={onChangeTrayIcon}
              onChangeTrayWidgets={onChangeTrayWidgets}
              providerAccountSnapshots={providerAccountSnapshots}
              trayBalanceProgress={trayBalanceProgress}
              trayIconPreference={trayIconPreference}
              trayWidgets={trayWidgets}
            />
          );
        }
        if (activePage === "observability") {
          return (
            <ObservabilitySettingsPage
              copy={copy}
              observability={observability}
              onChange={onChangeObservability}
            />
          );
        }
        if (activePage === "toolhub") {
          return (
            <ToolHubSettingsPage
              copy={copy}
              onChange={onChangeToolHub}
              providers={providers}
              toolHub={toolHub}
            />
          );
        }
        if (activePage === "bots") {
          return (
            <BotSettingsPage
              addRequestKey={botAddRequestKey}
              botConfigs={botConfigs}
              copy={copy}
              onChange={onChangeBotConfigs}
              profiles={profiles}
            />
          );
        }
        if (activePage === "data") {
          return (
            <DataSettingsPage
              appInfo={appInfo}
              copy={copy}
            />
          );
        }
        return null;
      }}
      traySupported={traySupported}
    />
  );
}

function SettingsLayout({
  copy,
  initialPage,
  onClose,
  renderPage,
  traySupported
}: {
  copy: AppCopy;
  initialPage: SettingsPageId;
  onClose: () => void;
  renderPage: (activePage: SettingsPageId) => ReactNode;
  traySupported: boolean;
}) {
  const [activePage, setActivePage] = useState<SettingsPageId>(initialPage);
  const visiblePage = activePage === "tray" && !traySupported ? "appearance" : activePage;

  useEffect(() => {
    setActivePage(initialPage);
  }, [initialPage]);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[min(700px,calc(100dvh-2rem))] max-w-[1160px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{copy.settings.title}</DialogTitle>
          </div>
          <Button aria-label={copy.settings.close} onClick={onClose} size="iconSm" title={copy.settings.close} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody className="flex overflow-hidden p-0 max-[640px]:flex-col">
          <aside className="flex w-[220px] shrink-0 flex-col border-r border-border/70 bg-muted/20 p-2 max-[640px]:w-full max-[640px]:border-b max-[640px]:border-r-0">
            <SettingsPageButton
              active={visiblePage === "appearance"}
              icon={Palette}
              label={copy.settings.appearance}
              onClick={() => setActivePage("appearance")}
            />
            <SettingsPageButton
              active={visiblePage === "observability"}
              className="mt-1"
              icon={Activity}
              label={copy.settings.observability}
              onClick={() => setActivePage("observability")}
            />
            <SettingsPageButton
              active={visiblePage === "toolhub"}
              className="mt-1"
              icon={KeyRound}
              label={copy.settings.toolHub}
              onClick={() => setActivePage("toolhub")}
            />
            <SettingsPageButton
              active={visiblePage === "bots"}
              className="mt-1"
              icon={Boxes}
              label={copy.settings.bots}
              onClick={() => setActivePage("bots")}
            />
            <SettingsPageButton
              active={visiblePage === "data"}
              className="mt-1"
              icon={Database}
              label={copy.settings.data}
              onClick={() => setActivePage("data")}
            />
            {traySupported ? (
              <SettingsPageButton
                active={visiblePage === "tray"}
                className="mt-1"
                icon={Gauge}
                label={copy.settings.tray}
                onClick={() => setActivePage("tray")}
              />
            ) : null}
          </aside>

          <section className="min-h-0 flex-1 overflow-auto p-5">
            {renderPage(visiblePage)}
          </section>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button">
            {copy.settings.done}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsPageButton({
  active,
  className,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  className?: string;
  icon: typeof Palette;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      className={cn(
        "flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className
      )}
      onClick={onClick}
      type="button"
      unstyled
    >
      <span className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground"
      )}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Button>
  );
}

function AppearanceSettingsPage({
  copy,
  languagePreference,
  launchAtLogin,
  launchAtLoginSupported,
  onChangeLaunchAtLogin,
  onChangeLanguage,
  onChangeTheme,
  systemLanguage,
  systemTheme,
  themePreference
}: {
  copy: AppCopy;
  languagePreference: AppLanguagePreference;
  launchAtLogin: boolean;
  launchAtLoginSupported: boolean;
  onChangeLaunchAtLogin: (checked: boolean) => void;
  onChangeLanguage: (value: string) => void;
  onChangeTheme: (value: string) => void;
  systemLanguage: ResolvedLanguage;
  systemTheme: ResolvedTheme;
  themePreference: AppConfig["theme"];
}) {
  const themeOptions = [
    { label: formatSystemOption(copy.settings.themeSystem, themeDisplayName(systemTheme, copy)), value: "system" },
    { label: copy.settings.themeLight, value: "light" },
    { label: copy.settings.themeDark, value: "dark" }
  ];
  const languageOptions = [
    { label: formatSystemOption(copy.settings.languageSystem, languageDisplayName(systemLanguage, copy)), value: "system" },
    { label: copy.settings.languageChinese, value: "zh" },
    { label: copy.settings.languageEnglish, value: "en" }
  ];

  return (
    <div className={cn(settingsPageContentWidthClassName, "grid grid-cols-1 gap-5")}>
      <h3 className="text-[15px] font-semibold text-foreground">{copy.settings.appearance}</h3>
      <div className="grid grid-cols-1 gap-4">
        <Field label={copy.settings.theme}>
          <SelectControl onChange={onChangeTheme} options={themeOptions} value={themePreference} />
        </Field>
        <Field label={copy.settings.language}>
          <SelectControl onChange={onChangeLanguage} options={languageOptions} value={languagePreference} />
        </Field>
        {launchAtLoginSupported ? (
          <SettingsSwitchRow
            checked={launchAtLogin}
            description={copy.settings.launchAtLoginDescription}
            icon={Power}
            label={copy.settings.launchAtLogin}
            onChange={onChangeLaunchAtLogin}
          />
        ) : null}
      </div>
    </div>
  );
}

function ObservabilitySettingsPage({
  copy,
  observability,
  onChange
}: {
  copy: AppCopy;
  observability: AppConfig["observability"];
  onChange: (patch: Partial<AppConfig["observability"]>) => void;
}) {
  return (
    <div className={cn(settingsPageContentWidthClassName, "grid grid-cols-1 gap-5")}>
      <h3 className="text-[15px] font-semibold text-foreground">{copy.settings.observability}</h3>
      <div className="grid grid-cols-1 gap-3">
        <SettingsSwitchRow
          checked={observability.requestLogs}
          description={copy.settings.requestLogsDescription}
          icon={Database}
          label={copy.settings.requestLogs}
          onChange={(requestLogs) => onChange({ requestLogs })}
        />
        <SettingsSwitchRow
          checked={observability.agentAnalysis}
          description={copy.settings.agentAnalysisDescription}
          icon={Activity}
          label={copy.settings.agentAnalysis}
          onChange={(agentAnalysis) => onChange({ agentAnalysis })}
        />
      </div>
    </div>
  );
}

function ToolHubSettingsPage({
  copy,
  onChange,
  providers,
  toolHub
}: {
  copy: AppCopy;
  onChange: (patch: Partial<AppConfig["toolHub"]>) => void;
  providers: GatewayProviderConfig[];
  toolHub: AppConfig["toolHub"];
}) {
  const t = useAppText();
  const modelOptions = useMemo(() => createRouteModelOptions(providers), [providers]);
  const selectedProviderModel = useMemo(() => selectedToolHubProviderModelValue(toolHub, providers), [providers, toolHub]);
  const [mcpDialogDraft, setMcpDialogDraft] = useState<McpServerDraft>(() => createMcpServerDraft(toolHub.mcpServers));
  const [mcpDialogError, setMcpDialogError] = useState("");
  const [mcpDialogIndex, setMcpDialogIndex] = useState<number | undefined>();
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [mcpJsonDialogOpen, setMcpJsonDialogOpen] = useState(false);
  const [mcpJsonError, setMcpJsonError] = useState("");
  const [mcpJsonText, setMcpJsonText] = useState("");

  const selectProviderModel = (value: string) => {
    if (!value) {
      return;
    }
    const parsed = parseProviderModelSelectValue(value);
    if (!parsed) {
      return;
    }
    const provider = providers.find((item) => item.name === parsed.provider);
    onChange({
      llm: {
        ...toolHub.llm,
        apiKey: providerApiKey(provider),
        baseUrl: providerBaseUrl(provider),
        model: parsed.model
      }
    });
  };

  const patchNumber = (key: "maxTools" | "requestTimeoutMs", raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return;
    }
    onChange(normalizeToolHubConfig({
      ...toolHub,
      [key]: parsed
    }));
  };

  const openAddMcpDialog = () => {
    setMcpDialogDraft(createMcpServerDraft(toolHub.mcpServers));
    setMcpDialogError("");
    setMcpDialogIndex(undefined);
    setMcpDialogOpen(true);
  };

  const openImportMcpJsonDialog = () => {
    setMcpJsonText("");
    setMcpJsonError("");
    setMcpJsonDialogOpen(true);
  };

  const openEditMcpDialog = (index: number) => {
    const server = toolHub.mcpServers[index];
    if (!server) {
      return;
    }
    setMcpDialogDraft(createMcpServerDraftFromConfig(server));
    setMcpDialogError("");
    setMcpDialogIndex(index);
    setMcpDialogOpen(true);
  };

  const submitMcpDialog = () => {
    const validationError = validateMcpServerDraft(mcpDialogDraft);
    if (validationError) {
      setMcpDialogError(validationError);
      return;
    }
    const normalizedName = mcpDialogDraft.name.trim().toLowerCase();
    if (toolHub.mcpServers.some((server, index) => index !== mcpDialogIndex && server.name.trim().toLowerCase() === normalizedName)) {
      setMcpDialogError("MCP server name already exists.");
      return;
    }
    const nextServers = [...toolHub.mcpServers];
    const server = mcpServerConfigFromDraft(mcpDialogDraft, nextServers, mcpDialogIndex);
    if (mcpDialogIndex === undefined) {
      nextServers.push(server);
    } else {
      nextServers[mcpDialogIndex] = server;
    }
    onChange({ mcpServers: nextServers });
    setMcpDialogOpen(false);
    setMcpDialogError("");
  };

  const removeMcpServer = (index: number) => {
    onChange({
      mcpServers: toolHub.mcpServers.filter((_, itemIndex) => itemIndex !== index)
    });
  };

  const importMcpJson = () => {
    const result = parseToolHubMcpServersJson(mcpJsonText, toolHub.mcpServers);
    if ("error" in result) {
      setMcpJsonError(result.error);
      return;
    }
    onChange({ mcpServers: [...toolHub.mcpServers, ...result.servers] });
    setMcpJsonDialogOpen(false);
    setMcpJsonError("");
    setMcpJsonText("");
  };

  return (
    <div className={cn(settingsPageContentWidthClassName, "grid grid-cols-1 gap-5")}>
      <div className="grid gap-1">
        <h3 className="text-[15px] font-semibold text-foreground">{copy.settings.toolHub}</h3>
        <p className="text-[12px] leading-5 text-muted-foreground">{copy.settings.toolHubDescription}</p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <SettingsSwitchRow
          checked={toolHub.enabled}
          description={copy.settings.toolHubEnabledDescription}
          icon={KeyRound}
          label={copy.settings.toolHubEnabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </div>
      {toolHub.enabled ? (
        <>
          <SettingsSwitchRow
            checked={toolHub.browserAutomation}
            description={copy.settings.toolHubBrowserAutomationDescription}
            icon={Globe}
            label={copy.settings.toolHubBrowserAutomation}
            onChange={(browserAutomation) => onChange({ browserAutomation })}
          />
          <div className="grid grid-cols-1 gap-3 rounded-md border border-border/70 bg-card/70 p-3 md:grid-cols-2">
            <Field className="md:col-span-2" label={copy.settings.toolHubModel}>
              <SelectControl
                onChange={selectProviderModel}
                options={[
                  { disabled: true, label: copy.settings.toolHubModelPlaceholder, value: "" },
                  ...modelOptions
                ]}
                value={selectedProviderModel}
              />
            </Field>
            <Field label={copy.settings.toolHubMaxTools}>
              <Input
                min={1}
                max={20}
                onChange={(event) => patchNumber("maxTools", event.target.value)}
                type="number"
                value={String(toolHub.maxTools)}
              />
            </Field>
            <Field label={copy.settings.toolHubTimeout}>
              <Input
                min={8000}
                max={300000}
                onChange={(event) => patchNumber("requestTimeoutMs", event.target.value)}
                step={1000}
                type="number"
                value={String(toolHub.requestTimeoutMs)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 rounded-md border border-border/70 bg-card/70 p-3">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-foreground">{t("MCP servers")}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button onClick={openImportMcpJsonDialog} size="sm" type="button" variant="outline">
                  {t("Import JSON")}
                </Button>
                <Button onClick={openAddMcpDialog} size="sm" type="button" variant="outline">
                  <Plus className="h-4 w-4" />
                  {t("Add MCP server")}
                </Button>
              </div>
            </div>
            {toolHub.mcpServers.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/70 px-3 py-3 text-[12px] text-muted-foreground">
                {t("No MCP servers configured")}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {toolHub.mcpServers.map((server, index) => (
                  <div key={`${server.name}-${index}`} className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-background/60 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold text-foreground" title={server.name}>{server.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground" title={mcpServerEndpointSummary(server)}>
                        {server.transport} · {mcpServerEndpointSummary(server)}
                      </div>
                    </div>
                    <Button aria-label={t("Edit MCP server")} onClick={() => openEditMcpDialog(index)} size="iconSm" title={t("Edit MCP server")} type="button" variant="ghost">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button aria-label={t("Remove MCP server")} onClick={() => removeMcpServer(index)} size="iconSm" title={t("Remove MCP server")} type="button" variant="ghost">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <ToolHubMcpServerDialog
            draft={mcpDialogDraft}
            error={mcpDialogError}
            mode={mcpDialogIndex === undefined ? "add" : "edit"}
            onChange={(patch) => setMcpDialogDraft((current) => ({ ...current, ...patch }))}
            onClose={() => setMcpDialogOpen(false)}
            onSubmit={submitMcpDialog}
            open={mcpDialogOpen}
          />
          <ToolHubMcpJsonDialog
            error={mcpJsonError}
            onChange={setMcpJsonText}
            onClose={() => setMcpJsonDialogOpen(false)}
            onSubmit={importMcpJson}
            open={mcpJsonDialogOpen}
            value={mcpJsonText}
          />
        </>
      ) : null}
    </div>
  );
}

function ToolHubMcpServerDialog({
  draft,
  error,
  mode,
  onChange,
  onClose,
  onSubmit,
  open
}: {
  draft: McpServerDraft;
  error: string;
  mode: "add" | "edit";
  onChange: (patch: Partial<McpServerDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
}) {
  const t = useAppText();
  const transportOptions = translateOptions(mcpServerTransportOptions, t);
  const stdioMessageModeOptions = translateOptions(mcpStdioMessageModeOptions, t);

  return (
    <Dialog className="z-[80]" onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{mode === "add" ? t("Add MCP server") : t("Edit MCP server")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("MCP server")}>
                <Input onChange={(event) => onChange({ name: event.target.value })} value={draft.name} />
              </Field>
              <Field label={t("Transport")}>
                <SelectControl
                  onChange={(transport) => onChange({ transport: transport as McpServerDraft["transport"] })}
                  options={transportOptions}
                  value={draft.transport}
                />
              </Field>
            </div>
            {draft.transport === "stdio" ? (
              <div className="grid grid-cols-1 gap-3">
                <Field label={t("Command")}>
                  <Input onChange={(event) => onChange({ command: event.target.value })} value={draft.command} />
                </Field>
                <Field label={t("Arguments")}>
                  <Input onChange={(event) => onChange({ argsText: event.target.value })} value={draft.argsText} />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t("Working directory")}>
                    <Input onChange={(event) => onChange({ cwd: event.target.value })} value={draft.cwd} />
                  </Field>
                  <Field label={t("Stdio message mode")}>
                    <SelectControl
                      onChange={(stdioMessageMode) => onChange({ stdioMessageMode: stdioMessageMode as McpServerDraft["stdioMessageMode"] })}
                      options={stdioMessageModeOptions}
                      value={draft.stdioMessageMode}
                    />
                  </Field>
                </div>
                <Field label={t("Environment variables")}>
                  <KeyValueRowsControl
                    addLabel={t("Add variable")}
                    onChange={(envRows) => onChange({ envRows })}
                    rows={draft.envRows}
                  />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                <Field label={t("URL")}>
                  <Input onChange={(event) => onChange({ url: event.target.value })} value={draft.url} />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t("API key")}>
                    <Input autoComplete="off" onChange={(event) => onChange({ apiKey: event.target.value })} type="password" value={draft.apiKey} />
                  </Field>
                  <Field label={t("API key env")}>
                    <Input onChange={(event) => onChange({ apiKeyEnv: event.target.value })} value={draft.apiKeyEnv} />
                  </Field>
                </div>
                <Field label={t("Headers")}>
                  <KeyValueRowsControl
                    addLabel={t("Add variable")}
                    onChange={(headerRows) => onChange({ headerRows })}
                    rows={draft.headerRows}
                  />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("Request timeout")}>
                <Input onChange={(event) => onChange({ requestTimeoutMs: event.target.value })} type="number" value={draft.requestTimeoutMs} />
              </Field>
              <Field label={t("Startup timeout")}>
                <Input onChange={(event) => onChange({ startupTimeoutMs: event.target.value })} type="number" value={draft.startupTimeoutMs} />
              </Field>
            </div>
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{t(error)}</div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button onClick={onSubmit} type="button">
            <Plus className="h-4 w-4" />
            {mode === "add" ? t("Add") : t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToolHubMcpJsonDialog({
  error,
  onChange,
  onClose,
  onSubmit,
  open,
  value
}: {
  error: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  value: string;
}) {
  const t = useAppText();

  return (
    <Dialog className="z-[80]" onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Import MCP JSON")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-1 gap-3">
            <Field label={t("MCP JSON")}>
              <Textarea
                className="min-h-[260px] font-mono text-[12px]"
                onChange={(event) => onChange(event.target.value)}
                placeholder={[
                  '{',
                  '  "mcpServers": {',
                  '    "filesystem": {',
                  '      "command": "npx",',
                  '      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]',
                  "    }",
                  "  }",
                  "}"
                ].join("\n")}
                value={value}
              />
            </Field>
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{t(error)}</div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button onClick={onSubmit} type="button">
            {t("Import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ParsedMcpServerRecord = {
  nameHint?: string;
  value: Record<string, unknown>;
};

function parseToolHubMcpServersJson(raw: string, existingServers: GatewayMcpServerConfig[]): { error: string } | { servers: GatewayMcpServerConfig[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Invalid JSON." };
  }

  const records = mcpServerRecordsFromJson(parsed);
  if (records.length === 0) {
    return { error: "No MCP servers found in JSON." };
  }

  const importedNames = new Set(existingServers.map((server) => server.name.trim().toLowerCase()));
  const servers: GatewayMcpServerConfig[] = [];
  for (const record of records) {
    const draft = createMcpServerDraftFromUnknown({
      ...record.value,
      name: typeof record.value.name === "string" && record.value.name.trim() ? record.value.name : record.nameHint ?? ""
    });
    const validationError = validateMcpServerDraft(draft);
    if (validationError) {
      return { error: validationError };
    }
    const normalizedName = draft.name.trim().toLowerCase();
    if (importedNames.has(normalizedName)) {
      return { error: "MCP server name already exists." };
    }
    importedNames.add(normalizedName);
    servers.push(mcpServerConfigFromDraft(draft, [...existingServers, ...servers], undefined));
  }

  return { servers };
}

function mcpServerRecordsFromJson(value: unknown): ParsedMcpServerRecord[] {
  if (Array.isArray(value)) {
    return value
      .filter(isPlainObject)
      .map((item) => ({ value: item }));
  }
  if (!isPlainObject(value)) {
    return [];
  }
  const mcpServers = value.mcpServers ?? value.mcp_servers;
  if (Array.isArray(mcpServers)) {
    return mcpServers
      .filter(isPlainObject)
      .map((item) => ({ value: item }));
  }
  if (isPlainObject(mcpServers)) {
    return Object.entries(mcpServers)
      .filter(([, item]) => isPlainObject(item))
      .map(([nameHint, item]) => ({ nameHint, value: item as Record<string, unknown> }));
  }
  return [{ value }];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectedToolHubProviderModelValue(toolHub: AppConfig["toolHub"], providers: GatewayProviderConfig[]): string {
  const model = toolHub.llm.model.trim();
  if (!model) {
    return "";
  }
  const baseUrl = toolHub.llm.baseUrl.trim();
  const matchedProvider = providers.find((provider) =>
    provider.models?.includes(model) &&
    (!baseUrl || !providerBaseUrl(provider) || providerBaseUrl(provider) === baseUrl)
  ) ?? providers.find((provider) => provider.models?.includes(model));
  return matchedProvider ? `${matchedProvider.name},${model}` : "";
}

function parseProviderModelSelectValue(value: string): { model: string; provider: string } | undefined {
  const commaIndex = value.indexOf(",");
  if (commaIndex <= 0 || commaIndex >= value.length - 1) {
    return undefined;
  }
  const provider = value.slice(0, commaIndex).trim();
  const model = value.slice(commaIndex + 1).trim();
  return provider && model ? { model, provider } : undefined;
}

function providerBaseUrl(provider: GatewayProviderConfig | undefined): string {
  return provider?.baseUrl || provider?.baseurl || provider?.api_base_url || "";
}

function providerApiKey(provider: GatewayProviderConfig | undefined): string {
  const direct = provider?.api_key || provider?.apiKey || provider?.apikey;
  if (direct) {
    return direct;
  }
  const credential = provider?.credentials?.find((item) => item.enabled !== false && (item.api_key || item.apiKey || item.apikey));
  return credential?.api_key || credential?.apiKey || credential?.apikey || "";
}

function SettingsSwitchRow({
  checked,
  description,
  icon: Icon,
  label,
  onChange
}: {
  checked: boolean;
  description: string;
  icon: typeof Activity;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-3">
      <span className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
        checked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function DataSettingsPage({
  appInfo,
  copy
}: {
  appInfo: AppInfo;
  copy: AppCopy;
}) {
  const t = (value: string) => copy.text[value] ?? value;
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [exportedFile, setExportedFile] = useState("");

  async function exportData() {
    if (exporting) {
      return;
    }
    if (!window.ccr?.exportData) {
      setError(t("Data export is only available in the Electron app."));
      return;
    }
    setExporting(true);
    setError("");
    setExportedFile("");
    try {
      const result = await window.ccr.exportData();
      if (!result.canceled) {
        setExportedFile(result.file || "");
      }
    } catch (exportError) {
      setError(formatAppError(copy, exportError));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={cn(settingsPageContentWidthClassName, "grid grid-cols-1 gap-5")}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-foreground">{copy.settings.data}</h3>
        <div className="mt-1 text-[12px] text-muted-foreground">{t("Configuration is stored in SQLite. The legacy JSON file is only read once for migration.")}</div>
      </div>

      <div className="grid gap-2 rounded-md border border-border bg-background p-3">
        <DataPathRow label={t("Config database")} value={appInfo.appConfigDbFile} />
        <DataPathRow label={t("API key database")} value={appInfo.apiKeysDbFile} />
        <DataPathRow label={t("Request log database")} value={appInfo.requestLogsDbFile} />
        <DataPathRow label={t("Usage database")} value={appInfo.usageDbFile} />
      </div>

      <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Database className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-foreground">{t("Export data")}</div>
            <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              {t("Export current configuration and SQLite data into a single JSON backup file. The export contains API keys and should be stored securely.")}
            </div>
          </div>
          <Button disabled={exporting} onClick={exportData} size="sm" type="button">
            {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {exporting ? t("Exporting") : t("Export")}
          </Button>
        </div>
        {exportedFile ? (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            <span className="font-medium">{t("Exported")}:</span> <span className="break-all">{exportedFile}</span>
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DataPathRow({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md bg-muted/20 px-2 py-2 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="min-w-0 break-all font-mono text-[11px] text-foreground">{value}</div>
    </div>
  );
}

function BotSettingsPage({
  addRequestKey = 0,
  botConfigs,
  copy,
  onChange,
  profiles
}: {
  addRequestKey?: number;
  botConfigs: BotGatewaySavedConfig[];
  copy: AppCopy;
  onChange: (configs: BotGatewaySavedConfig[]) => void;
  profiles: ProfileConfig[];
}) {
  const t = (value: string) => copy.text[value] ?? value;
  const [editor, setEditor] = useState<{ config?: BotGatewaySavedConfig; mode: "add" | "edit" }>();
  const [deleteTarget, setDeleteTarget] = useState<BotGatewaySavedConfig>();
  const lastAddRequestKey = useRef(0);

  useEffect(() => {
    if (addRequestKey === lastAddRequestKey.current) {
      return;
    }
    lastAddRequestKey.current = addRequestKey;
    setEditor({ mode: "add" });
  }, [addRequestKey]);

  function saveBotConfig(config: BotGatewaySavedConfig) {
    const exists = botConfigs.some((item) => item.id === config.id);
    onChange(exists
      ? botConfigs.map((item) => item.id === config.id ? config : item)
      : [...botConfigs, config]);
    setEditor(undefined);
  }

  function removeBotConfig(config: BotGatewaySavedConfig) {
    if (botConfigUsageProfiles(config, profiles).length > 0) {
      return;
    }
    onChange(botConfigs.filter((item) => item.id !== config.id));
    setDeleteTarget(undefined);
  }

  return (
    <div className={cn(settingsPageContentWidthClassName, "grid grid-cols-1 gap-5")}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground">{copy.settings.bots}</h3>
          <div className="mt-1 text-[12px] text-muted-foreground">{t("Manage bots used by agent profiles.")}</div>
        </div>
        <Button onClick={() => setEditor({ mode: "add" })} size="sm" type="button">
          {t("Add bot")}
        </Button>
      </div>

      <div className="grid gap-2">
        {botConfigs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-[12px] text-muted-foreground">
            {t("No bots configured")}
          </div>
        ) : null}
        {botConfigs.map((config) => {
          const usedByProfiles = botConfigUsageProfiles(config, profiles);
          return (
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5" key={config.id}>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-foreground">{config.name}</div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {t(botGatewayPlatformLabel(config.botGateway.platform))}
                  {config.botGateway.authType ? ` / ${t(authMethodLabel(config.botGateway.platform, config.botGateway.authType))}` : ""}
                  {usedByProfiles.length > 0 ? ` · ${botUsageCountLabel(usedByProfiles.length, t)}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button onClick={() => setEditor({ config, mode: "edit" })} size="sm" type="button" variant="outline">
                  {t("Edit")}
                </Button>
                <Button onClick={() => setDeleteTarget(config)} size="sm" type="button" variant="outline">
                  {t("Delete")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {editor ? (
        <BotConfigDialog
          botConfigs={botConfigs}
          config={editor.config}
          copy={copy}
          mode={editor.mode}
          onClose={() => setEditor(undefined)}
          onSave={saveBotConfig}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteBotDialog
          config={deleteTarget}
          copy={copy}
          onClose={() => setDeleteTarget(undefined)}
          onConfirm={() => removeBotConfig(deleteTarget)}
          usedByProfiles={botConfigUsageProfiles(deleteTarget, profiles)}
        />
      ) : null}
    </div>
  );
}

function botConfigUsageProfiles(config: BotGatewaySavedConfig, profiles: ProfileConfig[]): ProfileConfig[] {
  return profiles.filter((profile) => profile.botConfigId === config.id);
}

function botUsageProfileLabel(profile: ProfileConfig, t: (value: string) => string): string {
  const agent = t(profileAgentLabel(profile.agent));
  const name = profile.name.trim();
  return name && name !== agent ? `${agent} / ${name}` : agent;
}

function botUsageCountLabel(count: number, t: (value: string) => string): string {
  return t("{count} agent profiles use this bot").replace("{count}", String(count));
}

function DeleteBotDialog({
  config,
  copy,
  onClose,
  onConfirm,
  usedByProfiles
}: {
  config: BotGatewaySavedConfig;
  copy: AppCopy;
  onClose: () => void;
  onConfirm: () => void;
  usedByProfiles: ProfileConfig[];
}) {
  const t = (value: string) => copy.text[value] ?? value;
  const isBlocked = usedByProfiles.length > 0;
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Delete bot")}</DialogTitle>
          </div>
          <Button aria-label={copy.settings.close} onClick={onClose} size="iconSm" title={copy.settings.close} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        <DialogBody>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <div className="flex items-start gap-2 text-[12px] font-medium text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{isBlocked ? t("This bot is being used by the following agents and cannot be deleted.") : t("Delete this bot?")}</span>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <div className="truncate" title={config.name}>
                <span className="font-medium text-foreground">{t("Name")}:</span> {config.name}
              </div>
              <div className="truncate">
                <span className="font-medium text-foreground">{t("Platform")}:</span> {t(botGatewayPlatformLabel(config.botGateway.platform))}
              </div>
              {isBlocked ? (
                <div className="space-y-1 pt-1">
                  {usedByProfiles.map((profile) => (
                    <div className="truncate rounded border border-destructive/20 bg-background/70 px-2 py-1 text-foreground" key={profile.id} title={botUsageProfileLabel(profile, t)}>
                      {botUsageProfileLabel(profile, t)}
                    </div>
                  ))}
                </div>
              ) : (
                <div>{t("After deletion, this bot data cannot be recovered.")}</div>
              )}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          {isBlocked ? (
            <Button autoFocus onClick={onClose} type="button">
              {copy.settings.close}
            </Button>
          ) : (
            <>
              <Button autoFocus onClick={onClose} type="button" variant="outline">
                {t("Cancel")}
              </Button>
              <Button onClick={onConfirm} type="button" variant="destructive">
                <Trash2 className="h-4 w-4" />
                {t("Delete")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BotQrDisplay =
  | { kind: "empty"; src: "" }
  | { kind: "image"; src: string }
  | { kind: "window"; src: string };

type BotQrLoginState = {
  display: BotQrDisplay;
  error: string;
  loading: boolean;
  message: string;
  savedConfig?: BotGatewaySavedConfig;
  start?: BotGatewayQrLoginStartResult;
  status: string;
  wait?: BotGatewayQrLoginWaitResult;
};

function BotConfigDialog({
  botConfigs,
  config,
  copy,
  mode,
  onClose,
  onSave
}: {
  botConfigs: BotGatewaySavedConfig[];
  config?: BotGatewaySavedConfig;
  copy: AppCopy;
  mode: "add" | "edit";
  onClose: () => void;
  onSave: (config: BotGatewaySavedConfig) => void;
}) {
  const t = (value: string) => copy.text[value] ?? value;
  const [draft, setDraft] = useState<BotGatewayConfigDraft>(() => createBotGatewayConfigDraft(config));
  const [error, setError] = useState("");
  const [qrLogin, setQrLogin] = useState<BotQrLoginState>(() => emptyBotQrLoginState());
  const [saving, setSaving] = useState(false);
  const qrMountedRef = useRef(false);
  const qrStartGenerationRef = useRef(0);
  const qrSessionRef = useRef("");
  const platform = normalizeBotGatewayPlatform(draft.botPlatform);
  const authType = normalizeBotGatewayAuthType(platform, draft.botAuthType);
  const authSpecs = botGatewayAuthSpecsForPlatform(platform);
  const authFields = botGatewayFieldsForAuth(platform, authType);
  const platformOptions = botGatewayPlatformOptions.map((option) => ({ ...option, label: t(option.label) }));
  const authOptions = authSpecs.map((option) => ({ label: t(option.label), value: option.value }));
  const qrLoginSupported = platform === "weixin-ilink" && authType === "qr_login";
  const busy = saving || qrLogin.loading;
  const shouldCompleteQrLoginOnSave = qrLoginSupported && !canReuseExistingQrConfig();

  function update(patch: Partial<BotGatewayConfigDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  }

  function updatePlatform(value: string) {
    const nextPlatform = normalizeBotGatewayPlatform(value);
    const nextAuthType = botGatewayDefaultAuthType(nextPlatform);
    update({
      botAuthFields: botGatewayPickAuthFields(draft.botAuthFields, nextPlatform, nextAuthType),
      botAuthType: nextAuthType,
      botPlatform: nextPlatform
    });
  }

  function updateAuthType(value: string) {
    const nextAuthType = normalizeBotGatewayAuthType(platform, value);
    update({
      botAuthFields: botGatewayPickAuthFields(draft.botAuthFields, platform, nextAuthType),
      botAuthType: nextAuthType
    });
  }

  async function save() {
    if (busy) {
      return;
    }
    if (!isBotGatewayConfigDraftSubmittable(draft)) {
      setError(t("Bot name, platform, and required authentication fields are required."));
      return;
    }
    const saved = botGatewaySavedConfigFromDraft(draft, botConfigs, config ?? qrLogin.savedConfig);
    if (shouldCompleteQrLoginOnSave) {
      await saveWithQrLogin(saved);
      return;
    }
    onSave(configWithQrLoginResult(saved, qrLogin.start));
  }

  function canReuseExistingQrConfig(): boolean {
    const bot = config?.botGateway;
    return Boolean(
      bot &&
      bot.platform === platform &&
      bot.authType === authType &&
      bot.integrationId?.trim() &&
      bot.stateDir?.trim()
    );
  }

  function configWithQrLoginResult(
    saved: BotGatewaySavedConfig,
    start?: BotGatewayQrLoginStartResult,
    wait?: BotGatewayQrLoginWaitResult
  ): BotGatewaySavedConfig {
    if (!start || saved.botGateway.platform !== "weixin-ilink") {
      return saved;
    }
    return {
      ...saved,
      botGateway: {
        ...saved.botGateway,
        integrationId: wait?.integrationId || start.integrationId,
        stateDir: wait?.stateDir || start.stateDir,
        tenantId: wait?.tenantId || start.tenantId
      }
    };
  }

  async function cancelQrSession(sessionId = qrSessionRef.current) {
    const normalized = sessionId.trim();
    if (!normalized) {
      return;
    }
    qrSessionRef.current = "";
    await closeQrWindow(normalized);
    await window.ccr?.cancelBotGatewayQrLogin?.({ sessionId: normalized }).catch(() => undefined);
  }

  async function discardQrSession(sessionId: string) {
    const normalized = sessionId.trim();
    if (!normalized) {
      return;
    }
    await window.ccr?.closeBotGatewayQrWindow?.({ sessionId: normalized }).catch(() => undefined);
    await window.ccr?.cancelBotGatewayQrLogin?.({ sessionId: normalized }).catch(() => undefined);
  }

  async function closeQrWindow(sessionId = qrSessionRef.current) {
    const normalized = sessionId.trim();
    if (!normalized) {
      return;
    }
    await window.ccr?.closeBotGatewayQrWindow?.({ sessionId: normalized }).catch(() => undefined);
  }

  async function openQrWindow(
    start: BotGatewayQrLoginStartResult,
    display: BotQrDisplay,
    waitForScan = false
  ): Promise<BotGatewayQrWindowOpenResult | undefined> {
    if (display.kind !== "window") {
      return undefined;
    }
    if (!window.ccr?.openBotGatewayQrWindow) {
      throw new Error(t("QR window is available in the Electron app."));
    }
    return window.ccr.openBotGatewayQrWindow({
      scanTimeoutMs: 5 * 60 * 1000,
      sessionId: start.sessionId,
      title: `${t("Weixin Login")} - ${draft.name.trim() || t("Bot")}`,
      url: display.src,
      waitForScan
    });
  }

  async function saveWithQrLogin(savedConfig: BotGatewaySavedConfig) {
    const generation = qrStartGenerationRef.current + 1;
    qrStartGenerationRef.current = generation;
    setSaving(true);
    setError("");
    try {
      const start = await startQrLogin(savedConfig, true, generation);
      const display = normalizeBotQrDisplay(start.qrCodeUrl);
      if (display.kind !== "window") {
        throw new Error(t("Weixin login requires a web login URL."));
      }
      const opened = await openQrWindow(start, display, true);
      if (!qrMountedRef.current || generation !== qrStartGenerationRef.current) {
        await discardQrSession(start.sessionId);
        return;
      }
      if (opened?.reason === "timeout") {
        throw new Error(t("QR scan timed out."));
      }
      if (opened?.reason === "error") {
        throw new Error(t(opened.message || "QR scan observation failed."));
      }
      if (display.kind === "window" && opened && !opened.observed) {
        throw new Error(t("QR scan observation failed."));
      }
      setQrLogin((current) => current.start?.sessionId === start.sessionId
        ? {
            ...current,
            error: "",
            loading: true,
            message: t("Weixin login window closed, confirming login status."),
            status: "scanned"
          }
        : current);
      const wait = await waitForQrLoginConfirmation(start.sessionId, generation);
      qrSessionRef.current = "";
      onSave(configWithQrLoginResult(savedConfig, start, wait));
    } catch (error) {
      if (qrMountedRef.current && generation === qrStartGenerationRef.current) {
        const message = formatAppError(copy, error);
        setError(message);
        setQrLogin((current) => ({
          ...current,
          error: message,
          loading: false,
          message: "",
          status: "failed"
        }));
        await cancelQrSession();
      }
    } finally {
      if (qrMountedRef.current && generation === qrStartGenerationRef.current) {
        setSaving(false);
      }
    }
  }

  async function startQrLogin(
    savedConfig: BotGatewaySavedConfig,
    force: boolean,
    generation: number
  ): Promise<BotGatewayQrLoginStartResult> {
    if (!window.ccr?.startBotGatewayQrLogin) {
      throw new Error(t("QR login is available in the Electron app."));
    }

    setQrLogin((current) => ({
      ...current,
      error: "",
      loading: true,
      message: t("Preparing Weixin login."),
      savedConfig,
      status: "starting"
    }));
    await cancelQrSession();
    if (!qrMountedRef.current || generation !== qrStartGenerationRef.current) {
      throw new Error(t("QR login canceled."));
    }
    const start = await window.ccr.startBotGatewayQrLogin({ config: savedConfig, force });
    if (!qrMountedRef.current || generation !== qrStartGenerationRef.current) {
      if (qrSessionRef.current !== start.sessionId) {
        await discardQrSession(start.sessionId);
      }
      throw new Error(t("QR login canceled."));
    }
    qrSessionRef.current = start.sessionId;
    const display = normalizeBotQrDisplay(start.qrCodeUrl);
    setQrLogin({
      display,
      error: "",
      loading: true,
      message: start.message || t("Scan with Weixin in the opened window."),
      savedConfig,
      start,
      status: "qr_pending"
    });
    return start;
  }

  async function waitForQrLoginConfirmation(
    sessionId: string,
    generation: number
  ): Promise<BotGatewayQrLoginWaitResult> {
    if (!window.ccr?.waitBotGatewayQrLogin) {
      throw new Error(t("QR login is available in the Electron app."));
    }
    while (qrMountedRef.current && generation === qrStartGenerationRef.current) {
      const wait = await window.ccr.waitBotGatewayQrLogin({ sessionId, timeoutMs: 5000 });
      if (!qrMountedRef.current || generation !== qrStartGenerationRef.current) {
        throw new Error(t("QR login canceled."));
      }
      setQrLogin((current) => current.start?.sessionId === sessionId
        ? {
            ...current,
            error: "",
            loading: true,
            message: wait.message || current.message,
            status: wait.status,
            wait
          }
        : current);
      if (wait.confirmed || wait.status === "confirmed") {
        return wait;
      }
      if (isTerminalBotQrLoginStatus(wait.status)) {
        throw new Error(wait.message || t(botQrLoginStatusLabel(wait.status)));
      }
    }
    throw new Error(t("QR login canceled."));
  }

  useEffect(() => {
    qrMountedRef.current = true;
    return () => {
      qrMountedRef.current = false;
      qrStartGenerationRef.current += 1;
      const sessionId = qrSessionRef.current;
      if (sessionId) {
        void window.ccr?.closeBotGatewayQrWindow?.({ sessionId }).catch(() => undefined);
        void window.ccr?.cancelBotGatewayQrLogin?.({ sessionId }).catch(() => undefined);
      }
    };
  }, []);

  return (
    <Dialog onOpenChange={(open) => !open && !busy && onClose()} open>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? t("Add bot") : t("Edit bot")}</DialogTitle>
          <Button aria-label={copy.settings.close} disabled={busy} onClick={onClose} size="iconSm" title={copy.settings.close} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        <DialogBody>
          <fieldset className="m-0 grid min-w-0 grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2" disabled={busy}>
            <Field className="sm:col-span-2" label={t("Name")}>
              <Input value={draft.name} onChange={(event) => update({ name: event.target.value })} />
            </Field>
            <Field label={t("Platform")}>
              <SelectControl onChange={updatePlatform} options={platformOptions} value={platform} />
            </Field>
            {authOptions.length > 0 ? (
              <Field label={t("Auth method")}>
                <SelectControl onChange={updateAuthType} options={authOptions} value={authType} />
              </Field>
            ) : null}
            {authFields.map((field) => (
              <Field
                key={field.key}
                label={field.required ? t(field.label) : `${t(field.label)} (${t("Optional")})`}
              >
                <Input
                  autoComplete="off"
                  placeholder={field.placeholder ?? ""}
                  type={field.type === "password" ? "password" : "text"}
                  value={draft.botAuthFields[field.key] ?? ""}
                  onChange={(event) => update({
                    botAuthFields: {
                      ...draft.botAuthFields,
                      [field.key]: event.target.value
                    }
                  })}
                />
              </Field>
            ))}
          </fieldset>
          {error ? (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button disabled={busy} onClick={onClose} type="button" variant="outline">{t("Cancel")}</Button>
          <Button disabled={busy} onClick={() => void save()} type="button">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function emptyBotQrLoginState(): BotQrLoginState {
  return {
    display: { kind: "empty", src: "" },
    error: "",
    loading: false,
    message: "",
    status: "idle"
  };
}

function normalizeBotQrDisplay(raw: string): BotQrDisplay {
  const value = raw.trim();
  if (!value) {
    return { kind: "empty", src: "" };
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return { kind: "window", src: value };
  }
  if (value.startsWith("data:")) {
    return { kind: "image", src: value };
  }
  if (value.startsWith("<svg")) {
    return { kind: "image", src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}` };
  }
  return { kind: "image", src: `data:image/png;base64,${value}` };
}

function isTerminalBotQrLoginStatus(status: string): boolean {
  return ["already_bound", "confirmed", "expired", "failed"].includes(status);
}

function botQrLoginStatusLabel(status: string): string {
  switch (status) {
    case "starting":
      return "Waiting for QR code";
    case "qr_pending":
    case "pending":
      return "Waiting for scan";
    case "scanned":
      return "Scanned, confirm on phone";
    case "needs_verification":
      return "Verification required";
    case "confirmed":
      return "Connected";
    case "expired":
      return "QR code expired";
    case "already_bound":
      return "Already connected";
    case "failed":
      return "QR login failed";
    default:
      return "Waiting for QR code";
  }
}

function authMethodLabel(platform: string, authType: string): string {
  const normalized = normalizeBotGatewayAuthType(platform, authType);
  return botGatewayAuthSpecsForPlatform(platform).find((option) => option.value === normalized)?.label ?? normalized;
}

function TraySettingsPage({
  copy,
  onChangeTrayBalanceProgress,
  onChangeTrayIcon,
  onChangeTrayWidgets,
  providerAccountSnapshots,
  trayBalanceProgress,
  trayIconPreference,
  trayWidgets
}: {
  copy: AppCopy;
  onChangeTrayBalanceProgress: (config: TrayBalanceProgressConfig) => void;
  onChangeTrayIcon: (value: string) => void;
  onChangeTrayWidgets: (widgets: TrayWidgetConfig[]) => void;
  providerAccountSnapshots: ProviderAccountSnapshot[];
  trayBalanceProgress?: TrayBalanceProgressConfig;
  trayIconPreference: AppConfig["trayIcon"];
  trayWidgets: TrayWidgetConfig[];
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [selectedTrayWidgetId, setSelectedTrayWidgetId] = useState<string>();
  const [pendingScrollTrayWidgetId, setPendingScrollTrayWidgetId] = useState<string>();
  const [progressSelectionActive, setProgressSelectionActive] = useState(false);
  const [progressDraft, setProgressDraft] = useState<Partial<TrayBalanceProgressConfig>>(trayBalanceProgress ?? {});
  const widgets = useMemo(() => normalizeTrayWidgets(trayWidgets), [trayWidgets]);
  const selectedWidget = widgets.find((widget) => widget.id === selectedTrayWidgetId) ?? widgets[0];
  const selectedWidgetIndex = selectedWidget ? widgets.findIndex((widget) => widget.id === selectedWidget.id) : -1;
  const progressAccounts = useMemo(() => trayBalanceProgressAccounts(providerAccountSnapshots), [providerAccountSnapshots]);
  const progressProvider = progressDraft.provider ?? "";
  const progressMeters = useMemo(() => trayBalanceProgressMeters(progressAccounts, progressProvider), [progressAccounts, progressProvider]);
  const progressProviderValue = progressAccounts.some((snapshot) => snapshot.provider === progressProvider) ? progressProvider : "";
  const progressMeterValue = progressMeters.some((meter) => meter.id === progressDraft.meterId) ? progressDraft.meterId ?? "" : "";
  const progressBinding = trayBalanceProgressBindingFromDraft(progressDraft);
  const progressPreviewBinding = progressBinding ?? trayBalanceProgress;
  const progressPreviewValue = trayBalanceProgressValue(providerAccountSnapshots, progressPreviewBinding);
  const effectiveTrayIconPreference: AppConfig["trayIcon"] = progressSelectionActive ? "progress" : trayIconPreference;
  const progressEditorOpen = effectiveTrayIconPreference === "progress";
  const trayIconOptions: Array<{ label: string; value: AppConfig["trayIcon"] }> = [
    { label: copy.settings.trayIconRandom, value: "random" },
    { label: copy.settings.trayIconViolet, value: "violet" },
    { label: copy.settings.trayIconOrange, value: "orange" },
    { label: copy.settings.trayIconCyan, value: "cyan" },
    { label: copy.settings.trayIconProgress, value: "progress" }
  ];
  const paletteItems = trayWidgetPalette(copy);
  const trayT = (value: string) => copy.text[value] ?? value;
  const selectedCategory = selectedWidget ? trayComponentCategoryForType(selectedWidget.type) : "provider-tabs";
  const selectedCategoryOption = paletteItems.find((item) => item.value === selectedCategory) ?? paletteItems[0];
  const selectedStyleOptions = selectedWidget ? trayWidgetVariantOptions(selectedWidget.type) : [];
  const SelectedTrayCategoryIcon = selectedCategoryOption.icon;
  const trayPreviewSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  useEffect(() => {
    if (!progressSelectionActive) {
      setProgressDraft(trayBalanceProgress ?? {});
    }
  }, [progressSelectionActive, trayBalanceProgress?.meterId, trayBalanceProgress?.provider]);

  function commitWidgets(nextWidgets: TrayWidgetConfig[]) {
    onChangeTrayWidgets(normalizeTrayWidgets(nextWidgets));
  }

  function changeTrayIcon(value: string) {
    if (value === "progress") {
      setProgressSelectionActive(true);
      setProgressDraft(trayBalanceProgress ?? {});
      return;
    }
    setProgressSelectionActive(false);
    onChangeTrayIcon(value);
  }

  function changeProgressProvider(provider: string) {
    setProgressSelectionActive(true);
    setProgressDraft(provider ? { provider } : {});
  }

  function changeProgressMeter(meterId: string) {
    const provider = progressDraft.provider?.trim();
    if (!provider || !meterId.trim()) {
      setProgressDraft((current) => ({ ...current, meterId }));
      return;
    }
    const nextProgress = { meterId: meterId.trim(), provider };
    setProgressDraft(nextProgress);
    setProgressSelectionActive(false);
    onChangeTrayBalanceProgress(nextProgress);
  }

  function addTrayWidget(template: TrayWidgetConfig) {
    const existingSingleton = isTraySingletonWidgetType(template.type)
      ? widgets.find((widget) => widget.type === template.type)
      : undefined;
    if (existingSingleton) {
      setSelectedTrayWidgetId(existingSingleton.id);
      return;
    }
    const id = uniqueTrayWidgetId(widgets, template.id);
    const widget = normalizeTrayWidget({ ...template, id });
    if (!widget) {
      return;
    }
    commitWidgets([...widgets, widget]);
    setSelectedTrayWidgetId(id);
    setPendingScrollTrayWidgetId(id);
  }

  function toggleSingletonTrayWidget(template: TrayWidgetConfig, enabled: boolean) {
    const existingWidget = widgets.find((widget) => widget.type === template.type);
    if (enabled) {
      if (existingWidget) {
        setSelectedTrayWidgetId(existingWidget.id);
        return;
      }
      addTrayWidget(template);
      return;
    }
    if (!existingWidget) {
      return;
    }
    removeTrayWidget(existingWidget.id);
  }

  function updateTrayWidget(id: string, patch: Partial<TrayWidgetConfig>) {
    commitWidgets(widgets.map((widget) => widget.id === id ? normalizeTrayWidget({ ...widget, ...patch }) ?? widget : widget));
  }

  function changeTrayWidgetVariant(variant: TrayWidgetVariant) {
    if (!selectedWidget) {
      return;
    }
    updateTrayWidget(selectedWidget.id, { variant });
  }

  function removeSelectedTrayWidget() {
    if (!selectedWidget || selectedWidgetIndex < 0) {
      return;
    }
    removeTrayWidget(selectedWidget.id);
  }

  function removeTrayWidget(id: string) {
    const widgetIndex = widgets.findIndex((widget) => widget.id === id);
    if (widgetIndex < 0) {
      return;
    }
    const nextWidgets = widgets.filter((widget) => widget.id !== id);
    commitWidgets(nextWidgets);
    setSelectedTrayWidgetId((currentId) => currentId === id
      ? nextWidgets[Math.min(widgetIndex, nextWidgets.length - 1)]?.id
      : currentId);
  }

  useEffect(() => {
    if (!selectedWidget || selectedWidgetIndex < 0) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.key !== "Delete" && event.key !== "Backspace")) {
        return;
      }
      const target = event.target instanceof Element ? event.target : undefined;
      if (isEditableKeyboardTarget(target)) {
        return;
      }
      if (target && target !== document.body && !pageRef.current?.contains(target)) {
        return;
      }
      event.preventDefault();
      removeTrayWidget(selectedWidget.id);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedWidget, selectedWidgetIndex, widgets]);

  return (
    <div className={cn(settingsPageContentWidthClassName, "grid min-h-[520px] grid-rows-[auto_auto_auto] gap-4")} ref={pageRef}>
      <h3 className="text-[15px] font-semibold text-foreground">{copy.settings.tray}</h3>
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-background p-3">
        <Field className="min-w-[220px] flex-1" label={copy.settings.trayIcon}>
          <TrayIconSelect onChange={changeTrayIcon} options={trayIconOptions} progress={progressPreviewValue} value={effectiveTrayIconPreference} />
        </Field>
        {progressEditorOpen ? (
          progressAccounts.length > 0 ? (
            <>
              <Field className="min-w-[180px] flex-1" label={copy.settings.trayBalanceProgressAccount}>
                <Select
                  onValueChange={changeProgressProvider}
                  options={[
                    { disabled: true, label: trayT("Select account"), value: "" },
                    ...progressAccounts.map((snapshot) => ({ label: snapshot.provider, value: snapshot.provider }))
                  ]}
                  value={progressProviderValue}
                />
              </Field>
              <Field className="min-w-[180px] flex-1" label={copy.settings.trayBalanceProgressData}>
                <Select
                  disabled={!progressProvider}
                  onValueChange={changeProgressMeter}
                  options={[
                    { disabled: true, label: trayT("Select data"), value: "" },
                    ...progressMeters.map((meter) => ({ label: trayBalanceProgressMeterLabel(meter, trayT), value: meter.id }))
                  ]}
                  value={progressMeterValue}
                />
              </Field>
              <div className="basis-full text-[11px] font-medium text-muted-foreground">
                {copy.settings.trayBalanceProgressRequired}
              </div>
            </>
          ) : (
            <div className="min-w-[240px] flex-1 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
              {copy.settings.trayBalanceProgressNoData}
            </div>
          )
        ) : null}
      </div>
      <div className="grid min-h-0 grid-cols-[220px_minmax(320px,1fr)_260px] gap-4 max-[1140px]:grid-cols-1">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background">
          <div className="shrink-0 border-b border-border/70 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {copy.settings.trayComponents}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            <div className="grid grid-cols-1 gap-1.5">
              {paletteItems.map((option) => {
                const Icon = option.icon;
                const enabledSingleton = !option.repeatable && widgets.some((widget) => widget.type === option.template.type);

                return option.repeatable ? (
                  <Button
                    className={cn(
                      "flex min-h-[46px] w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium transition-colors",
                      "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    key={option.value}
                    onClick={() => addTrayWidget(option.template)}
                    type="button"
                    unstyled
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      <span className="block truncate text-[10px] font-normal opacity-70">{option.description}</span>
                    </span>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                      +
                    </span>
                  </Button>
                ) : (
                  <div
                    className={cn(
                      "flex min-h-[46px] w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium transition-colors",
                      enabledSingleton ? "bg-primary/5 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    key={option.value}
                  >
                    <span className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                      enabledSingleton ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        const existingWidget = widgets.find((widget) => widget.type === option.template.type);
                        if (existingWidget) {
                          setSelectedTrayWidgetId(existingWidget.id);
                          return;
                        }
                        toggleSingletonTrayWidget(option.template, true);
                      }}
                      type="button"
                    >
                      <span className="block truncate">{option.label}</span>
                      <span className="block truncate text-[10px] font-normal opacity-70">{option.description}</span>
                    </button>
                    <Switch
                      checked={enabledSingleton}
                      onCheckedChange={(checked) => toggleSingletonTrayWidget(option.template, checked)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-muted/15">
          <div className="shrink-0 border-b border-border/70 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {copy.settings.trayPreview}
          </div>
          <div className="flex min-h-0 flex-1 justify-center overflow-auto p-3">
            <div className="w-full max-w-[420px]">
              <TrayWindowPreview
                copy={copy}
                pendingScrollWidgetId={pendingScrollTrayWidgetId}
                selectedWidgetId={selectedWidget?.id}
                widgets={widgets}
                onPendingScrollComplete={() => setPendingScrollTrayWidgetId(undefined)}
                onSelectWidget={setSelectedTrayWidgetId}
                onSortWidgets={commitWidgets}
                sensors={trayPreviewSensors}
              />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background">
          <div className="shrink-0 border-b border-border/70 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {copy.settings.trayComponentProperties}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {selectedWidget ? (
            <div className="space-y-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <SelectedTrayCategoryIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-foreground">{selectedCategoryOption.label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{trayWidgetTypeLabel(selectedWidget.type, copy)}</div>
                </div>
              </div>

              {selectedStyleOptions.length > 0 ? (
                <Field label={copy.settings.trayComponentStyle}>
                  <SelectControl
                    onChange={(value) => changeTrayWidgetVariant(value as TrayWidgetVariant)}
                    options={selectedStyleOptions.map((option) => ({ ...option, label: trayT(option.label) }))}
                    value={selectedWidget.variant ?? defaultTrayWidgetVariant(selectedWidget.type) ?? ""}
                  />
                </Field>
              ) : null}

              <Button className="w-full justify-center" onClick={removeSelectedTrayWidget} size="sm" type="button" variant="outline">
                {trayT("Remove widget")}
              </Button>
            </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">
                {trayT("No widget selected")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type TrayComponentCategory = "account" | "activity" | "breakdown" | "header" | "metrics" | "provider-tabs" | "trend";

type TrayWidgetPaletteItem = {
  dataOptions: Array<{ label: string; value: TrayWidgetType }>;
  description: string;
  icon: typeof Layers3;
  label: string;
  repeatable: boolean;
  template: TrayWidgetConfig;
  value: TrayComponentCategory;
};

function trayWidgetPalette(copy: AppCopy): TrayWidgetPaletteItem[] {
  const t = (value: string) => copy.text[value] ?? value;

  return [
    {
      dataOptions: [{ label: copy.settings.trayModuleSourceTabs, value: "source-tabs" }],
      description: copy.settings.trayModuleSourceTabs,
      icon: Layers3,
      label: t("Provider component"),
      repeatable: false,
      template: { id: "source-tabs", type: "source-tabs" },
      value: "provider-tabs"
    },
    {
      dataOptions: [{ label: copy.settings.trayModuleHeader, value: "header" }],
      description: copy.settings.trayModuleHeader,
      icon: PanelLeftOpen,
      label: t("Header component"),
      repeatable: false,
      template: { id: "header", type: "header" },
      value: "header"
    },
    {
      dataOptions: [{ label: copy.settings.trayModuleAccount, value: "account" }],
      description: copy.settings.trayModuleAccount,
      icon: Database,
      label: t("Account component"),
      repeatable: true,
      template: { id: "account", type: "account", variant: defaultTrayWidgetVariant("account") },
      value: "account"
    },
    {
      dataOptions: [{ label: copy.settings.trayModuleTokenFlow, value: "token-flow" }],
      description: copy.settings.trayModuleTokenFlow,
      icon: Activity,
      label: t("Trend component"),
      repeatable: true,
      template: { id: "token-flow", type: "token-flow", variant: defaultTrayWidgetVariant("token-flow") },
      value: "trend"
    },
    {
      dataOptions: [{ label: copy.settings.trayModuleActivity, value: "activity" }],
      description: copy.settings.trayModuleActivity,
      icon: Activity,
      label: t("Activity component"),
      repeatable: true,
      template: { id: "activity", type: "activity" },
      value: "activity"
    },
    {
      dataOptions: [{ label: copy.settings.trayModuleStats, value: "stats" }],
      description: copy.settings.trayModuleStats,
      icon: Gauge,
      label: t("Metric component"),
      repeatable: true,
      template: { id: "stats", type: "stats", variant: defaultTrayWidgetVariant("stats") },
      value: "metrics"
    },
    {
      dataOptions: [
        { label: copy.settings.trayModuleTokenMix, value: "token-mix" },
        { label: copy.settings.trayModuleRings, value: "rings" },
        { label: copy.settings.trayModuleModelShare, value: "model-share" }
      ],
      description: t("Token mix, rings, model share"),
      icon: Boxes,
      label: t("Breakdown component"),
      repeatable: true,
      template: { id: "token-mix", type: "token-mix", variant: defaultTrayWidgetVariant("token-mix") },
      value: "breakdown"
    }
  ];
}

function trayComponentCategoryForType(type: TrayWidgetType): TrayComponentCategory {
  if (type === "source-tabs") return "provider-tabs";
  if (type === "header") return "header";
  if (type === "account") return "account";
  if (type === "activity") return "activity";
  if (type === "token-flow") return "trend";
  if (type === "stats") return "metrics";
  return "breakdown";
}

function trayWidgetTypeLabel(type: TrayWidgetType, copy: AppCopy): string {
  if (type === "account") return copy.settings.trayModuleAccount;
  if (type === "activity") return copy.settings.trayModuleActivity;
  if (type === "header") return copy.settings.trayModuleHeader;
  if (type === "model-share") return copy.settings.trayModuleModelShare;
  if (type === "rings") return copy.settings.trayModuleRings;
  if (type === "source-tabs") return copy.settings.trayModuleSourceTabs;
  if (type === "stats") return copy.settings.trayModuleStats;
  if (type === "token-flow") return copy.settings.trayModuleTokenFlow;
  return copy.settings.trayModuleTokenMix;
}

function uniqueTrayWidgetId(widgets: TrayWidgetConfig[], baseId: string): string {
  const ids = new Set(widgets.map((widget) => widget.id));
  if (!ids.has(baseId)) {
    return baseId;
  }
  let index = 2;
  while (ids.has(`${baseId}-${index}`)) {
    index += 1;
  }
  return `${baseId}-${index}`;
}

function TrayIconSelect({
  onChange,
  options,
  progress,
  value
}: {
  onChange: (value: string) => void;
  options: Array<{ label: string; value: AppConfig["trayIcon"] }>;
  progress?: number;
  value: AppConfig["trayIcon"];
}) {
  return (
    <div className="relative min-w-0">
      <TrayIconPreview className="pointer-events-none absolute left-2 top-1/2 z-10 h-5 w-5 -translate-y-1/2 rounded-[5px]" preference={value} progress={progress} />
      <Select className="pl-10" onValueChange={onChange} options={options} value={value} />
    </div>
  );
}

function TrayIconPreview({
  className,
  preference,
  progress
}: {
  className?: string;
  preference: AppConfig["trayIcon"];
  progress?: number;
}) {
  const randomIcons: Array<"violet" | "orange" | "cyan"> = ["violet", "orange", "cyan"];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]",
        className
      )}
    >
      {preference === "random" ? (
        randomIcons.map((iconId, index) => (
          <img
            alt=""
            className={cn(
              "absolute h-[66%] w-[66%] object-contain drop-shadow-sm",
              index === 0 && "left-[9%] top-[22%]",
              index === 1 && "left-[22%] top-[11%]",
              index === 2 && "left-[34%] top-[27%]"
            )}
            key={iconId}
            src={trayMascotIconUrls[iconId]}
          />
        ))
      ) : null}
      {isTrayMascotIconPreference(preference) ? (
        <img alt="" className="h-[88%] w-[88%] object-contain drop-shadow-sm" src={trayMascotIconUrls[preference]} />
      ) : null}
      {preference === "progress" ? <TrayProgressPreview progress={progress} /> : null}
    </span>
  );
}

function TrayProgressPreview({ progress = 0 }: { progress?: number }) {
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <svg aria-hidden="true" className="h-[82%] w-[82%]" viewBox="0 0 36 36">
      <rect fill="rgba(15,23,42,.92)" height="30" rx="8" width="30" x="3" y="3" />
      <rect fill="rgba(148,163,184,.28)" height="5" rx="2.5" width="22" x="7" y="22" />
      <rect fill="rgb(248,250,252)" height="5" rx="2.5" width={Math.max(2, 22 * clamped)} x="7" y="22" />
      <rect fill="rgba(248,250,252,.78)" height="2.5" rx="1.25" width="12" x="7" y="9" />
      <rect fill="rgba(45,212,191,.9)" height="2.5" rx="1.25" width="18" x="7" y="15" />
    </svg>
  );
}

function isEditableKeyboardTarget(target: Element | undefined): boolean {
  return Boolean(target?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only'], [role='textbox']"));
}

function TrayWindowPreview({
  copy,
  pendingScrollWidgetId,
  selectedWidgetId,
  widgets,
  onPendingScrollComplete,
  onSelectWidget,
  onSortWidgets,
  sensors
}: {
  copy: AppCopy;
  pendingScrollWidgetId?: string;
  selectedWidgetId?: string;
  widgets: TrayWidgetConfig[];
  onPendingScrollComplete?: () => void;
  onSelectWidget?: (id: string) => void;
  onSortWidgets?: (widgets: TrayWidgetConfig[]) => void;
  sensors: ReturnType<typeof useSensors>;
}) {
  const previewRef = useRef<HTMLDivElement>(null);

  function finishWidgetSort(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId || activeId === overId) {
      return;
    }
    const activeIndex = widgets.findIndex((widget) => widget.id === activeId);
    const overIndex = widgets.findIndex((widget) => widget.id === overId);
    if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
      return;
    }
    onSortWidgets?.(arrayMove(widgets, activeIndex, overIndex));
    onSelectWidget?.(activeId);
  }

  useEffect(() => {
    if (!pendingScrollWidgetId || !widgets.some((widget) => widget.id === pendingScrollWidgetId)) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = findTrayWidgetElement(previewRef.current, pendingScrollWidgetId);
      if (!element) {
        return;
      }
      element.scrollIntoView({ block: "center", inline: "nearest" });
      onPendingScrollComplete?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [onPendingScrollComplete, pendingScrollWidgetId, widgets]);

  return (
    <div className="h-[740px] min-w-0 overflow-y-auto overflow-x-hidden rounded-[14px] border border-slate-950/15 bg-slate-950 p-3 text-slate-50 shadow-[0_18px_42px_rgba(15,23,42,.28)]" ref={previewRef}>
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3 border-b border-white/10 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <TrayWindowHeaderIcon />
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold text-slate-50">88.4k {trayPreviewText(copy, "tokens", "tokens")}</div>
            <div className="truncate text-[10px] font-medium text-slate-400">CCR</div>
          </div>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[.04] text-slate-300" aria-hidden="true">
          <Power className="h-3.5 w-3.5" />
        </span>
      </div>

      <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={finishWidgetSort}>
        <SortableContext items={widgets.map((widget) => widget.id)} strategy={rectSortingStrategy}>
          <div className="space-y-2">
            {widgets.map((widget) => (
              <SortableTrayPreviewWidget
                copy={copy}
                key={widget.id}
                selected={widget.id === selectedWidgetId}
                widget={widget}
                onSelect={onSelectWidget}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {widgets.length === 0 ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-[10px] border border-white/10 bg-white/[.03] px-4 text-center text-[12px] font-medium text-slate-400">
          {copy.settings.trayPreviewEmpty}
        </div>
      ) : null}
    </div>
  );
}

function TrayWindowHeaderIcon() {
  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/15 bg-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]"
    >
      <img alt="" className="h-[72%] w-[72%] object-contain" src={appLogoUrl} />
    </span>
  );
}

function findTrayWidgetElement(root: HTMLElement | null, id: string): HTMLElement | undefined {
  if (!root) {
    return undefined;
  }
  return Array.from(root.querySelectorAll<HTMLElement>("[data-tray-widget-id]"))
    .find((element) => element.dataset.trayWidgetId === id);
}

function SortableTrayPreviewWidget({
  copy,
  selected,
  widget,
  onSelect
}: {
  copy: AppCopy;
  selected: boolean;
  widget: TrayWidgetConfig;
  onSelect?: (id: string) => void;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition
  } = useSortable({
    id: widget.id
  });

  return (
    <div
      className={cn(
        "cursor-grab touch-none rounded-[10px]",
        isDragging && "relative z-20 cursor-grabbing opacity-70"
      )}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
      {...attributes}
      {...listeners}
    >
      <TrayPreviewWidget
        copy={copy}
        selected={selected}
        widget={widget}
        onSelect={onSelect}
      />
    </div>
  );
}

function TrayPreviewWidget({
  copy,
  selected,
  widget,
  onSelect
}: {
  copy: AppCopy;
  selected: boolean;
  widget: TrayWidgetConfig;
  onSelect?: (id: string) => void;
}) {
  let content: ReactNode;
  if (widget.type === "source-tabs") {
    content = <TrayPreviewSourceTabs copy={copy} />;
  } else if (widget.type === "header") {
    content = <TrayPreviewHeader copy={copy} />;
  } else if (widget.type === "account") {
    content = <TrayPreviewAccount copy={copy} title={copy.settings.trayModuleAccount} variant={(widget.variant ?? defaultTrayWidgetVariant("account")) as TrayComponentVariants["account"]} />;
  } else if (widget.type === "token-flow") {
    content = <TrayPreviewTokenFlow copy={copy} title={copy.settings.trayModuleTokenFlow} variant={(widget.variant ?? defaultTrayWidgetVariant("token-flow")) as TrayComponentVariants["tokenFlow"]} />;
  } else if (widget.type === "activity") {
    content = <TrayPreviewActivity copy={copy} />;
  } else if (widget.type === "stats") {
    content = <TrayPreviewStats copy={copy} variant={(widget.variant ?? defaultTrayWidgetVariant("stats")) as TrayComponentVariants["stats"]} />;
  } else if (widget.type === "token-mix") {
    content = <TrayPreviewTokenMix copy={copy} variant={(widget.variant ?? defaultTrayWidgetVariant("token-mix")) as TrayComponentVariants["tokenMix"]} />;
  } else if (widget.type === "rings") {
    content = <TrayPreviewRings title={copy.settings.trayModuleRings} variant={(widget.variant ?? defaultTrayWidgetVariant("rings")) as TrayComponentVariants["rings"]} />;
  } else {
    content = <TrayPreviewModelShare title={copy.settings.trayModuleModelShare} variant={(widget.variant ?? defaultTrayWidgetVariant("model-share")) as TrayComponentVariants["modelShare"]} />;
  }

  if (!onSelect) {
    return <div data-tray-widget-id={widget.id}>{content}</div>;
  }

  return (
    <button
      className={cn(
        "block w-full rounded-[10px] text-left transition",
        selected ? "outline outline-2 outline-teal-300/80 outline-offset-2" : "outline outline-1 outline-transparent hover:outline-white/18"
      )}
      data-tray-widget-id={widget.id}
      onClick={() => onSelect(widget.id)}
      type="button"
    >
      {content}
    </button>
  );
}

function TrayPreviewSourceTabs({ copy }: { copy: AppCopy }) {
  return (
    <div className="grid min-w-0 grid-cols-4 gap-1.5">
      {["All", "OpenAI", "Claude", "More"].map((label, index) => (
        <div
          className={cn(
            "min-w-0 truncate rounded-md border px-2 py-1 text-center text-[10px] font-semibold",
            index === 0 ? "border-teal-300/35 bg-teal-300/16 text-teal-50" : "border-white/10 bg-white/[.04] text-slate-300"
          )}
          key={label}
        >
          {trayPreviewText(copy, label, label)}
        </div>
      ))}
    </div>
  );
}

function TrayPreviewHeader({ copy }: { copy: AppCopy }) {
  return (
    <div className="mb-2 flex min-w-0 items-start justify-between gap-2 rounded-[8px] border border-white/10 bg-white/[.04] px-2.5 py-2">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-bold text-slate-50">{copy.settings.trayModuleHeader}</div>
        <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
          {trayPreviewText(copy, "Today", "Today")} - {trayPreviewText(copy, "All providers", "All providers", "全部供应商")}
        </div>
      </div>
      <div className="flex shrink-0 rounded-md border border-white/10 bg-slate-900/70 p-0.5">
        {["24h", "7d", "30d"].map((range) => (
          <span
            className={cn(
              "h-5 rounded-[5px] px-1.5 text-[10px] font-bold",
              range === "30d" ? "bg-white/14 text-slate-50" : "text-slate-400"
            )}
            key={range}
          >
            {trayPreviewText(copy, range, range)}
          </span>
        ))}
      </div>
    </div>
  );
}

function TrayPreviewAccount({
  copy,
  title,
  variant
}: {
  copy: AppCopy;
  title: string;
  variant: TrayComponentVariants["account"];
}) {
  const meters = [
    { label: trayPreviewText(copy, "Weekly quota", "Weekly quota"), value: "7.8h", progress: 0.62, color: "rgb(45,212,191)" },
    { label: trayPreviewText(copy, "5h quota", "5h quota"), value: "3.4h", progress: 0.74, color: "rgb(129,140,248)" }
  ];

  return (
    <div className="mb-2 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="truncate text-[11px] font-bold text-slate-100">{title}</div>
        <span className="shrink-0 rounded-full bg-teal-300/15 px-1.5 py-0.5 text-[9px] font-bold text-teal-100">{trayPreviewText(copy, "ok", "ok")}</span>
      </div>
      {variant === "compact" ? (
        <div className="grid grid-cols-2 gap-1.5">
          {meters.map((meter) => (
            <div className="min-w-0 rounded-md bg-white/[.04] px-2 py-1" key={meter.label}>
              <div className="truncate text-[9px] font-medium text-slate-400">{meter.label}</div>
              <div className="truncate text-[12px] font-bold text-slate-50">{meter.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {variant === "ring" || variant === "arc" ? (
        <div className="grid grid-cols-2 gap-2">
          {meters.map((meter) => (
            <PreviewRadialMetric color={meter.color} key={meter.label} label={meter.value} value={meter.progress} variant={variant} />
          ))}
        </div>
      ) : null}
      {variant === "stacked" ? (
        <div className="space-y-1.5">
          {meters.map((meter) => (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_48px] items-center gap-2" key={meter.label}>
              <div className="min-w-0">
                <div className="truncate text-[10px] font-medium text-slate-400">{meter.label}</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ backgroundColor: meter.color, width: `${meter.progress * 100}%` }} />
                </div>
              </div>
              <div className="truncate text-right text-[12px] font-bold text-slate-50">{meter.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {variant === "bar" ? (
        <>
          <div className="flex min-w-0 items-end justify-between gap-2">
            <div className="min-w-0 truncate text-[10px] font-medium text-slate-400">{meters[0].label}</div>
            <div className="shrink-0 text-[13px] font-bold text-slate-50">{meters[0].value}</div>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-teal-300" style={{ width: `${meters[0].progress * 100}%` }} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function TrayPreviewTokenFlow({
  copy,
  title,
  variant
}: {
  copy: AppCopy;
  title: string;
  variant: TrayComponentVariants["tokenFlow"];
}) {
  const bars = [24, 52, 38, 66, 46, 58, 72, 44, 64, 50];
  const linePath = "M0 58 C 34 42, 48 50, 74 35 S 119 15, 146 28 S 189 54, 219 22 S 247 18, 260 11";
  const cachePath = "M0 62 C 31 55, 55 60, 79 50 S 120 30, 153 38 S 197 65, 260 42";

  return (
    <div className="mb-2 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[11px] font-bold text-slate-100">{title}</div>
        <div className="shrink-0 text-[10px] font-medium text-slate-400">42 {trayPreviewText(copy, "Requests", "req")}</div>
      </div>
      <svg aria-hidden="true" className="mt-2 h-16 w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 260 72">
        {[20, 68, 116, 164, 212].map((x) => (
          <line key={x} stroke="rgba(148,163,184,.12)" strokeWidth="1" x1={x} x2={x} y1="0" y2="72" />
        ))}
        {variant === "bar" ? (
          bars.map((value, index) => {
            const width = 14;
            const x = index * 26 + 4;
            const height = Math.max(4, value * 0.74);
            return <rect fill={index % 2 === 0 ? "rgba(45,212,191,.9)" : "rgba(167,139,250,.72)"} height={height} key={index} rx="4" width={width} x={x} y={64 - height} />;
          })
        ) : null}
        {variant === "area" ? (
          <>
            <path d={`${linePath} L 260 68 L 0 68 Z`} fill="rgba(45,212,191,.18)" />
            <path d={`${cachePath} L 260 68 L 0 68 Z`} fill="rgba(167,139,250,.12)" />
          </>
        ) : null}
        {variant !== "bar" ? (
          <>
            <path d={linePath} fill="none" stroke="rgba(45,212,191,.95)" strokeLinecap="round" strokeWidth={variant === "sparkline" ? 3 : 4} />
            {variant === "sparkline" ? null : <path d={cachePath} fill="none" stroke="rgba(167,139,250,.72)" strokeLinecap="round" strokeWidth="2.5" />}
          </>
        ) : null}
      </svg>
    </div>
  );
}

function TrayPreviewActivity({ copy }: { copy: AppCopy }) {
  const t = (value: string) => trayPreviewText(copy, value, value);
  const values = [
    0, 1, 0, 0, 2, 0, 0,
    0, 0, 2, 0, 3, 1, 0,
    1, 0, 0, 4, 0, 0, 0,
    0, 2, 0, 0, 0, 3, 0,
    0, 0, 1, 0, 4, 2, 0,
    2, 0, 3, 4, 1, 0, 0,
    0, 1, 0, 2, 0, 0, 0,
    0, 0, 0, 1, 3, 0, 2,
    1, 0, 0, 0, 0, 2, 0,
    0, 0, 1, 0, 0, 0, 0
  ];
  const months = [
    { label: "Apr", weekIndex: 0 },
    { label: "May", weekIndex: 4 },
    { label: "Jun", weekIndex: 8 }
  ];
  const dayLabels = [t("M"), "", t("W"), "", t("F"), "", ""];
  const cellGap = 3;
  const cellSize = 9;
  const labelColumnWidth = 14;

  return (
    <div className="min-w-0 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="truncate text-[11px] font-bold text-slate-100">{copy.settings.trayModuleActivity}</div>
        <div className="shrink-0 text-[10px] font-medium text-slate-400">{t("Tokens")}</div>
      </div>
      <div className="mb-2 grid grid-cols-4 gap-px overflow-hidden rounded-[7px] border border-white/8 bg-white/[.08]">
        {[
          { label: t("Longest streak"), value: "8", unit: t("days") },
          { label: t("Avg / day"), value: "44K" },
          { label: t("Avg / week"), value: "309K" },
          { label: t("Total"), value: "23.1M" }
        ].map((item) => (
          <div className="min-w-0 bg-slate-950/35 px-1.5 py-1" key={item.label}>
            <div className="truncate text-[8px] font-semibold text-slate-400">{item.label}</div>
            <div className="flex min-w-0 items-baseline gap-1">
              <span className="truncate text-[11px] font-bold text-slate-50">{item.value}</span>
              {item.unit ? <span className="shrink-0 text-[8px] font-medium text-slate-500">{item.unit}</span> : null}
            </div>
          </div>
        ))}
      </div>
      <div className="min-w-0 overflow-x-auto overflow-y-hidden">
        <div className="w-max">
          <div
            className="mb-1 grid text-[8px] font-medium text-slate-500"
            style={{
              columnGap: `${cellGap}px`,
              gridTemplateColumns: `repeat(10, ${cellSize}px)`,
              marginLeft: `${labelColumnWidth + cellGap}px`
            }}
          >
            {months.map((month) => (
              <span className="truncate" key={month.label} style={{ gridColumn: `${month.weekIndex + 1} / span 2` }}>{month.label}</span>
            ))}
          </div>
          <div
            className="grid"
            style={{
              gap: `${cellGap}px`,
              gridTemplateColumns: `${labelColumnWidth}px repeat(10, ${cellSize}px)`,
              gridTemplateRows: `repeat(7, ${cellSize}px)`
            }}
          >
            {dayLabels.map((label, index) => (
              <span className="self-center truncate text-[8px] font-medium leading-none text-slate-500" key={`${label}-${index}`} style={{ gridColumn: 1, gridRow: index + 1 }}>{label}</span>
            ))}
            {values.map((value, index) => (
              <span
                className="rounded-[3px]"
                key={index}
                style={{
                  backgroundColor: previewActivityColor(value),
                  gridColumn: Math.floor(index / 7) + 2,
                  gridRow: index % 7 + 1
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
        <span>{t("Less")}</span>
        {[0, 1, 2, 3, 4].map((value) => (
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" key={value} style={{ backgroundColor: previewActivityColor(value) }} />
        ))}
        <span>{t("More")}</span>
      </div>
    </div>
  );
}

function previewActivityColor(value: number): string {
  if (value <= 0) return "rgba(129,140,248,.14)";
  if (value === 1) return "rgba(129,140,248,.32)";
  if (value === 2) return "rgba(129,140,248,.52)";
  if (value === 3) return "rgba(129,140,248,.72)";
  return "rgba(129,140,248,.94)";
}

function TrayPreviewStats({
  copy,
  variant
}: {
  copy: AppCopy;
  variant: TrayComponentVariants["stats"];
}) {
  const stats = [
    { label: trayPreviewText(copy, "Input", "Input", "输入"), value: "41k" },
    { label: trayPreviewText(copy, "Output", "Output", "输出"), value: "19k" },
    { label: trayPreviewText(copy, "Cache read", "Cache read", "缓存读取"), value: "28k" },
    { label: trayPreviewText(copy, "Success", "Success", "成功"), value: "99%" }
  ];

  if (variant === "compact") {
    return (
      <div className="mb-2 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
        {stats.map((stat) => (
          <div className="flex min-w-0 items-center justify-between gap-2 py-0.5 text-[10px]" key={stat.label}>
            <span className="truncate font-medium text-slate-400">{stat.label}</span>
            <span className="shrink-0 font-bold text-slate-50">{stat.value}</span>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "pills") {
    return (
      <div className="mb-2 flex flex-wrap gap-1.5">
        {stats.map((stat) => (
          <div className="rounded-full border border-white/10 bg-white/[.05] px-2 py-1 text-[10px] font-bold text-slate-100" key={stat.label}>
            <span className="text-slate-400">{stat.label}</span> {stat.value}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-2 grid grid-cols-2 gap-1.5">
      {stats.map((stat) => (
        <div className="min-w-0 rounded-[7px] border border-white/10 bg-white/[.04] px-2 py-1.5" key={stat.label}>
          <div className="truncate text-[10px] font-medium text-slate-400">{stat.label}</div>
          <div className="truncate text-[13px] font-bold text-slate-50">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

function TrayPreviewTokenMix({
  copy,
  variant
}: {
  copy: AppCopy;
  variant: TrayComponentVariants["tokenMix"];
}) {
  const bars = [
    { label: trayPreviewText(copy, "Input", "Input", "输入"), percent: 0.46, value: "46%", className: "bg-blue-400", color: "rgb(96,165,250)" },
    { label: trayPreviewText(copy, "Output", "Output", "输出"), percent: 0.28, value: "28%", className: "bg-amber-300", color: "rgb(252,211,77)" },
    { label: trayPreviewText(copy, "Cache read", "Cache read", "缓存读取"), percent: 0.26, value: "26%", className: "bg-rose-300", color: "rgb(253,164,175)" }
  ];

  return (
    <div className="min-w-0 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 truncate text-[11px] font-bold text-slate-100">{copy.settings.trayModuleTokenMix}</div>
      {variant === "donut" || variant === "pie" ? (
        <div className="grid grid-cols-[54px_minmax(0,1fr)] items-center gap-2">
          <PreviewShareChart rows={bars} variant={variant} />
          <PreviewShareLegend rows={bars} />
        </div>
      ) : null}
      {variant === "stacked" ? (
        <div className="space-y-1.5">
          <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
            {bars.map((bar) => (
              <div className={bar.className} key={bar.label} style={{ width: bar.value }} />
            ))}
          </div>
          <PreviewShareLegend rows={bars} />
        </div>
      ) : null}
      {variant === "bars" ? (
        <div className="space-y-1.5">
          {bars.map((bar) => (
            <div className="min-w-0" key={bar.label}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium text-slate-400">
                <span className="truncate">{bar.label}</span>
                <span className="shrink-0">{bar.value}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={cn("h-full rounded-full", bar.className)} style={{ width: bar.value }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TrayPreviewRings({
  title,
  variant
}: {
  title: string;
  variant: TrayComponentVariants["rings"];
}) {
  return (
    <div className="min-w-0 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 truncate text-[11px] font-bold text-slate-100">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { centerUnit: "requests", centerValue: "38", label: "74%", value: 74 },
          { centerUnit: "tokens", centerValue: "9.1K", label: "91%", value: 91 }
        ].map((item) => (
          <div className="relative aspect-square min-w-0" key={item.centerUnit}>
            <PreviewRadialMetric centerUnit={item.centerUnit} centerValue={item.centerValue} color={item.value > 80 ? "rgb(45,212,191)" : "rgb(129,140,248)"} label={item.label} value={item.value / 100} variant={variant === "rings" ? "ring" : variant === "arcs" ? "arc" : "gauge"} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TrayPreviewModelShare({
  title,
  variant
}: {
  title: string;
  variant: TrayComponentVariants["modelShare"];
}) {
  const rows = [
    { label: "claude-sonnet", percent: 0.48, value: "48%", color: "rgb(45,212,191)", className: "bg-teal-300" },
    { label: "gpt-4.1", percent: 0.31, value: "31%", color: "rgb(129,140,248)", className: "bg-indigo-400" },
    { label: "deepseek-chat", percent: 0.21, value: "21%", color: "rgb(251,191,36)", className: "bg-amber-300" }
  ];

  return (
    <div className="mb-2 min-w-0 rounded-[8px] border border-white/10 bg-white/[.04] p-2">
      <div className="mb-2 truncate text-[11px] font-bold text-slate-100">{title}</div>
      {variant === "donut" || variant === "pie" ? (
        <div className="grid grid-cols-[54px_minmax(0,1fr)] items-center gap-2">
          <PreviewShareChart rows={rows} variant={variant} />
          <PreviewShareLegend rows={rows} />
        </div>
      ) : null}
      {variant === "list" ? (
        <div className="space-y-1">
          {rows.map((row, index) => (
            <div className="flex min-w-0 items-center justify-between gap-2 text-[10px]" key={row.label}>
              <span className="min-w-0 truncate font-medium text-slate-300">{index + 1}. {row.label}</span>
              <span className="shrink-0 font-semibold text-slate-400">{row.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {variant === "bars" ? (
        rows.map((row) => (
          <div className="mb-1.5 flex min-w-0 items-center gap-2 last:mb-0" key={row.label}>
            <div className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-300">{row.label}</div>
            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10">
              <div className={cn("h-full rounded-full", row.className)} style={{ width: row.value }} />
            </div>
            <div className="w-7 shrink-0 text-right text-[10px] font-semibold text-slate-400">{row.value}</div>
          </div>
        ))
      ) : null}
    </div>
  );
}

function PreviewRadialMetric({
  centerUnit,
  centerValue,
  color,
  label,
  value,
  variant
}: {
  centerUnit?: string;
  centerValue?: string;
  color: string;
  label: string;
  value: number;
  variant: "arc" | "gauge" | "ring";
}) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  const span = variant === "ring" ? 1 : variant === "arc" ? 0.78 : 0.55;
  const dash = circumference * span;
  const rotation = variant === "ring" ? -90 : variant === "arc" ? 130 : 160;

  return (
    <div className="relative aspect-square min-w-0">
      <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 40 40">
        <circle
          cx="20"
          cy="20"
          fill="none"
          r={radius}
          stroke="rgba(148,163,184,.22)"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          strokeWidth="4"
          transform={`rotate(${rotation} 20 20)`}
        />
        <circle
          cx="20"
          cy="20"
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={`${dash * clamped} ${circumference - dash * clamped}`}
          strokeLinecap="round"
          strokeWidth="4"
          transform={`rotate(${rotation} 20 20)`}
        />
      </svg>
      <div className="absolute inset-0 flex min-w-0 flex-col items-center justify-center px-1 text-center leading-none">
        <div className="max-w-full truncate text-[11px] font-bold text-slate-100">{centerValue ?? label}</div>
        {centerUnit ? <div className="mt-0.5 max-w-full truncate text-[8px] font-semibold uppercase text-slate-400">{centerUnit}</div> : null}
      </div>
    </div>
  );
}

function PreviewShareChart({
  rows,
  variant
}: {
  rows: Array<{ color: string; percent: number }>;
  variant: "donut" | "pie";
}) {
  const radius = variant === "pie" ? 10 : 13;
  const strokeWidth = variant === "pie" ? 20 : 7;
  const circumference = 2 * Math.PI * radius;
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.percent), 0) || 1;
  let cursor = 0;
  const segments = rows.map((row) => {
    const length = circumference * (Math.max(0, row.percent) / total);
    const segment = { ...row, length, offset: cursor };
    cursor += length;
    return segment;
  });

  return (
    <svg aria-hidden="true" className="h-[54px] w-[54px]" viewBox="0 0 40 40">
      <circle cx="20" cy="20" fill="none" r={radius} stroke="rgba(148,163,184,.16)" strokeWidth={strokeWidth} />
      {segments.map((segment) => (
        <circle
          cx="20"
          cy="20"
          fill="none"
          key={`${segment.color}-${segment.offset}`}
          r={radius}
          stroke={segment.color}
          strokeDasharray={`${segment.length} ${circumference - segment.length}`}
          strokeDashoffset={-segment.offset}
          strokeWidth={strokeWidth}
          transform="rotate(-90 20 20)"
        />
      ))}
      {variant === "donut" ? <circle cx="20" cy="20" fill="rgb(15,23,42)" r="8" /> : null}
    </svg>
  );
}

function PreviewShareLegend({ rows }: { rows: Array<{ color: string; label: string; value: string }> }) {
  return (
    <div className="min-w-0 space-y-1">
      {rows.map((row) => (
        <div className="flex min-w-0 items-center gap-1.5 text-[9px] font-medium text-slate-400" key={row.label}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
          <span className="min-w-0 flex-1 truncate">{row.label}</span>
          <span className="shrink-0 text-slate-300">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function trayBalanceProgressAccounts(snapshots: ProviderAccountSnapshot[]): ProviderAccountSnapshot[] {
  return snapshots
    .filter((snapshot) => snapshot.meters.length > 0)
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

function trayBalanceProgressMeters(accounts: ProviderAccountSnapshot[], provider: string): ProviderAccountMeter[] {
  const snapshot = accounts.find((account) => account.provider === provider);
  if (!snapshot) {
    return [];
  }
  return [...snapshot.meters].sort((a, b) => {
    if (a.kind === "balance" && b.kind !== "balance") return -1;
    if (a.kind !== "balance" && b.kind === "balance") return 1;
    return a.label.localeCompare(b.label);
  });
}

function trayBalanceProgressBindingFromDraft(value: Partial<TrayBalanceProgressConfig>): TrayBalanceProgressConfig | undefined {
  const provider = value.provider?.trim();
  const meterId = value.meterId?.trim();
  return provider && meterId ? { meterId, provider } : undefined;
}

function trayBalanceProgressValue(
  snapshots: ProviderAccountSnapshot[],
  binding: TrayBalanceProgressConfig | undefined
): number | undefined {
  if (!binding) {
    return undefined;
  }
  const snapshot = snapshots.find((account) => account.provider === binding.provider);
  const meter = snapshot?.meters.find((candidate) => candidate.id === binding.meterId);
  return meter ? trayBalanceMeterProgress(meter) : undefined;
}

function trayBalanceMeterProgress(meter: ProviderAccountMeter): number {
  if (meter.limit && meter.limit > 0) {
    if (meter.remaining !== undefined) {
      return Math.max(0, Math.min(1, meter.remaining / meter.limit));
    }
    if (meter.used !== undefined) {
      return Math.max(0, Math.min(1, 1 - meter.used / meter.limit));
    }
  }
  if (meter.unit === "%") {
    if (meter.remaining !== undefined) {
      return Math.max(0, Math.min(1, meter.remaining / 100));
    }
    if (meter.used !== undefined) {
      return Math.max(0, Math.min(1, 1 - meter.used / 100));
    }
  }
  const rawValue = meter.remaining ?? meter.limit ?? meter.used ?? 0;
  return rawValue > 0 ? 1 : 0;
}

function trayBalanceProgressMeterLabel(meter: ProviderAccountMeter, t: (value: string) => string): string {
  return `${t(meter.label)} - ${formatProviderAccountMeterValue(meter)}`;
}

function isTrayMascotIconPreference(value: AppConfig["trayIcon"]): value is "cyan" | "orange" | "violet" {
  return value === "cyan" || value === "orange" || value === "violet";
}

function trayPreviewText(copy: AppCopy, key: string, fallback: string, alternateKey?: string): string {
  return copy.text[key] ?? (alternateKey ? copy.text[alternateKey] : undefined) ?? fallback;
}
