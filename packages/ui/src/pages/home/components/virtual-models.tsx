import {
  AnimatedListItem, AnimatedPopover, AnimatePresence, Boxes, Button,
  Card, CardContent, CardHeader, CardTitle, Check, ChevronDown, ChevronRight,
  cn, createMcpServerDraftFromConfig, createRouteModelOptions, defaultFusionWebSearchProvider, Dialog, DialogBody, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, ExtensionInstallDraft, Field, FolderOpen, formatPluginDependencies,
  createFusionWebSearchEnvRows, createKeyValueDraftRow, customFusionToolName, fusionToolExecutionFlagsFromTools, fusionToolOptions,
  fusionWebSearchProviderOptions, GatewayMcpServerConfig, GatewayMcpToolInfo, GatewayProviderConfig, Input, isBuiltInFusionToolName, isFusionImageGenerationToolName, isFusionVideoGenerationToolName, isFusionVisionToolName, isFusionWebSearchToolName, KeyValueRowsControl, LoaderCircle,
  mcpServerConfigFromDraft, mcpServerEndpointSummary, mcpServerTransportOptions,
  mcpStdioMessageModeOptions, motion, normalizeFusionToolName, Pencil,
  PluginMarketplaceEntry, Plus, PopoverContent, RouteTargetControl, Search, selectedFusionToolNames,
  SelectControl, Toggle, Trash2, translateOptions, useAppErrorText, useAppText, useEffect, useLayoutEffect, useMemo,
  useRef, useState, validateMcpServerDraft, virtualModelBaseModelSummary, VirtualModelDraft, virtualModelMatchesQuery, virtualModelMatchSummary,
  type KeyValueDraftRow,
  VirtualModelProfileConfig, virtualModelToolSummary, X
} from "../shared/index";
import { PopoverPortal } from "@/components/ui/popover";
import { createGrokMediaModelOptions } from "@ccr/core/media/models";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const virtualModelTableGridClass = "grid-cols-[minmax(180px,0.9fr)_minmax(220px,1.1fr)_minmax(220px,1.1fr)_minmax(170px,0.85fr)_112px_96px]";
const virtualModelTableMinWidthClass = "min-w-[1100px]";
const browserWebSearchEngineEnvKey = "BROWSER_SEARCH_ENGINE";
const browserWebSearchLanguageEnvKey = "BROWSER_SEARCH_LANGUAGE";
const browserWebSearchCountryEnvKey = "BROWSER_SEARCH_COUNTRY";
const browserWebSearchSafeSearchEnvKey = "BROWSER_SEARCH_SAFE_SEARCH";
const browserWebSearchKnownEnvKeys = new Set([
  browserWebSearchEngineEnvKey,
  browserWebSearchLanguageEnvKey,
  browserWebSearchCountryEnvKey,
  browserWebSearchSafeSearchEnvKey
]);
const browserWebSearchEngineOptions = [
  { label: "Bing", value: "bing" },
  { label: "Google", value: "google" },
  { label: "DuckDuckGo", value: "duckduckgo" }
];
const browserWebSearchSafeSearchOptions = [
  { label: "Default", value: "default" },
  { label: "Moderate", value: "moderate" },
  { label: "Strict", value: "strict" },
  { label: "Off", value: "off" }
];

function uniqueFusionTools(tools: string[]): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const tool of tools) {
    const normalized = normalizeFusionToolName(tool);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    values.push(normalized);
    seen.add(normalized);
  }
  return values;
}

function visibleFusionToolOption(toolName: string, currentValue: string, excludedValues: Set<string>): boolean {
  const normalized = normalizeFusionToolName(toolName);
  return Boolean(normalized) && (normalized === currentValue || !excludedValues.has(normalized));
}

export function VirtualModelsView({
  addVirtualModel,
  editVirtualModel,
  profiles,
  removeVirtualModel,
  setVirtualModelEnabled
}: {
  addVirtualModel: () => void;
  editVirtualModel: (index: number) => void;
  profiles: VirtualModelProfileConfig[];
  removeVirtualModel: (index: number) => void;
  setVirtualModelEnabled: (index: number, enabled: boolean) => void;
}) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleProfiles = useMemo(
    () => profiles
      .map((profile, index) => ({ index, profile }))
      .filter(({ profile }) => virtualModelMatchesQuery(profile, normalizedQuery)),
    [profiles, normalizedQuery]
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col gap-3"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle className="min-w-0 shrink-0 truncate">{t("Virtual Models")}</CardTitle>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search virtual models")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search virtual models")}
              value={query}
            />
          </div>
          <Button aria-label={t("Add virtual model")} onClick={addVirtualModel} title={t("Add virtual model")} type="button">
            <Plus className="h-4 w-4" />
            {t("Add")}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {profiles.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <Boxes className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[13px] font-semibold text-foreground">{t("No virtual models configured")}</div>
              <div className="mx-auto mt-1 max-w-[480px] text-[12px] leading-5 text-muted-foreground">{t("Fusion combines a model with another model or tools into a new model.")}</div>
              <div className="mt-2 font-mono text-[11px] text-muted-foreground/70">{t("Fusion example")}</div>
            </div>
          ) : null}
          {profiles.length > 0 && visibleProfiles.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching virtual models")}</div>
          ) : null}
          {visibleProfiles.length > 0 ? (
            <div className="min-w-0">
              <div className={cn("w-full", virtualModelTableMinWidthClass)}>
                <div className={cn("sticky top-0 z-10 grid h-10 items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground", virtualModelTableGridClass)}>
                  <div className="truncate">{t("Name")}</div>
                  <div className="truncate">{t("New model")}</div>
                  <div className="truncate">{t("Base model")}</div>
                  <div className="truncate">{t("Tools")}</div>
                  <div className="truncate">{t("Status")}</div>
                  <div aria-hidden="true" />
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                    {visibleProfiles.map(({ index, profile }) => (
                      <AnimatedListItem
                        className={cn("grid min-h-[58px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35", virtualModelTableGridClass)}
                        key={`${profile.id || profile.key}-${index}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold" title={profile.displayName || profile.key}>{profile.displayName || profile.key}</div>
                          <div className="truncate text-[11px] text-muted-foreground" title={profile.key}>{profile.key}</div>
                        </div>
                        <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={virtualModelMatchSummary(profile)}>
                          {virtualModelMatchSummary(profile)}
                        </div>
                        <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={virtualModelBaseModelSummary(profile)}>
                          {virtualModelBaseModelSummary(profile)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[11px] text-muted-foreground" title={virtualModelToolSummary(profile)}>
                            {virtualModelToolSummary(profile)}
                          </div>
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <Toggle checked={profile.enabled !== false} onChange={(enabled) => setVirtualModelEnabled(index, enabled)} />
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <Button aria-label={`${t("Edit virtual model")} ${profile.displayName || profile.key}`} onClick={() => editVirtualModel(index)} size="iconSm" title={t("Edit virtual model")} type="button" variant="ghost">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button aria-label={`${t("Remove virtual model")} ${profile.displayName || profile.key}`} onClick={() => removeVirtualModel(index)} size="iconSm" title={t("Remove virtual model")} type="button" variant="ghost">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </AnimatedListItem>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function MediaModelConfigurationPanel({
  draft,
  kind,
  modelOptions,
  onChange
}: {
  draft: VirtualModelDraft;
  kind: "image" | "video";
  modelOptions: ReturnType<typeof createRouteModelOptions>;
  onChange: (patch: Partial<VirtualModelDraft>) => void;
}) {
  const t = useAppText();
  const value = kind === "image" ? draft.imageGenerationModel : draft.videoGenerationModel;
  const options = useMemo(() => {
    const values = [...modelOptions];
    if (value && !values.some((option) => option.value === value)) {
      values.push({ label: value, value });
    }
    return values;
  }, [modelOptions, t, value]);

  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border border-border/70 bg-muted/25 p-3">
      <Field label={t(kind === "image" ? "Image model" : "Video model")}>
        <SelectControl
          onChange={(model) => onChange(kind === "image" ? { imageGenerationModel: model } : { videoGenerationModel: model })}
          options={options}
          value={value}
        />
      </Field>
      <p className="text-[11px] leading-4 text-muted-foreground">{t("CCR routes media through the selected ai-gateway provider. Imported Grok Agents reuse their existing login automatically.")}</p>
    </div>
  );
}

export function VirtualModelDialog({
  canSubmit,
  draft,
  error,
  mcpServers,
  mode,
  onChange,
  onClose,
  onSubmit,
  providers
}: {
  canSubmit: boolean;
  draft: VirtualModelDraft;
  error: string;
  mcpServers: GatewayMcpServerConfig[];
  mode: "add" | "edit";
  onChange: (patch: Partial<VirtualModelDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const formatError = useAppErrorText();
  const modelOptions = useMemo(() => createRouteModelOptions(providers), [providers]);
  const imageModelOptions = useMemo(() => createGrokMediaModelOptions(providers, "image"), [providers]);
  const videoModelOptions = useMemo(() => createGrokMediaModelOptions(providers, "video"), [providers]);
  const selectedTools = selectedFusionToolNames(draft.toolsText);
  const [customMcpDialogOpen, setCustomMcpDialogOpen] = useState(false);
  const [customMcpDialogDraft, setCustomMcpDialogDraft] = useState(draft.customMcpServer);
  const [customMcpDialogError, setCustomMcpDialogError] = useState("");
  const [addingFusionTool, setAddingFusionTool] = useState(false);
  const [mcpToolStateByServer, setMcpToolStateByServer] = useState<Record<string, {
    error?: string;
    loading?: boolean;
    tools?: GatewayMcpToolInfo[];
  }>>({});
  const customMcpServerConfig = useMemo(() => {
    if (validateMcpServerDraft(draft.customMcpServer)) {
      return undefined;
    }
    const editIndex = mcpServers.findIndex((server) => server.name === draft.customMcpServer.name.trim());
    return mcpServerConfigFromDraft(draft.customMcpServer, mcpServers, editIndex >= 0 ? editIndex : undefined);
  }, [draft.customMcpServer, mcpServers]);
  const availableMcpServers = useMemo(() => {
    const servers: GatewayMcpServerConfig[] = [];
    const seen = new Set<string>();
    if (customMcpServerConfig) {
      servers.push(customMcpServerConfig);
      seen.add(customMcpServerConfig.name);
    }
    for (const server of mcpServers) {
      if (seen.has(server.name)) {
        continue;
      }
      servers.push(server);
      seen.add(server.name);
    }
    return servers;
  }, [customMcpServerConfig, mcpServers]);

  useEffect(() => {
    if (!customMcpDialogOpen) {
      setCustomMcpDialogDraft(draft.customMcpServer);
    }
  }, [customMcpDialogOpen, draft.customMcpServer]);

  function applyFusionTools(nextTools: string[], server?: GatewayMcpServerConfig, selectedCustomTool?: string) {
    const currentCustomServerName = draft.customMcpServer.name.trim();
    const normalizedTools = uniqueFusionTools(
      server && currentCustomServerName && currentCustomServerName !== server.name
        ? nextTools.filter((tool) => isBuiltInFusionToolName(tool) || tool === selectedCustomTool)
        : nextTools
    );
    const flags = fusionToolExecutionFlagsFromTools(normalizedTools);
    const customTool = normalizedTools.find((tool) => !isBuiltInFusionToolName(tool));
    onChange({
      ...(flags.matchWebSearch && draft.webSearchEnvRows.length === 0 ? { webSearchEnvRows: createFusionWebSearchEnvRows(draft.webSearchProvider) } : {}),
      ...(customTool ? {
        ...(server ? { customMcpServer: createMcpServerDraftFromConfig(server) } : {}),
        customToolName: customTool || draft.customToolName || customFusionToolName
      } : {}),
      toolsText: normalizedTools.join(", "),
      ...flags
    });
  }

  function appendFusionTool(toolName: string, server?: GatewayMcpServerConfig) {
    const nextTool = normalizeFusionToolName(toolName);
    if (!nextTool) {
      return;
    }
    applyFusionTools([...selectedFusionToolNames(draft.toolsText), nextTool], server, server ? nextTool : undefined);
    setAddingFusionTool(false);
  }

  function updateFusionTool(index: number, toolName: string, server?: GatewayMcpServerConfig) {
    const nextTool = normalizeFusionToolName(toolName);
    if (!nextTool) {
      return;
    }
    const currentTools = selectedFusionToolNames(draft.toolsText);
    const nextTools = currentTools.map((tool, toolIndex) => toolIndex === index ? nextTool : tool);
    applyFusionTools(nextTools, server, server ? nextTool : undefined);
  }

  function removeFusionTool(index: number) {
    applyFusionTools(selectedFusionToolNames(draft.toolsText).filter((_, toolIndex) => toolIndex !== index));
  }

  function openCustomMcpDialog() {
    setCustomMcpDialogDraft(draft.customMcpServer);
    setCustomMcpDialogError("");
    setCustomMcpDialogOpen(true);
  }

  async function discoverMcpServerTools(server: GatewayMcpServerConfig, force = false): Promise<GatewayMcpToolInfo[]> {
    if (!window.ccr?.listMcpServerTools) {
      const message = "MCP tool discovery is available in the Electron app.";
      setMcpToolStateByServer((current) => ({
        ...current,
        [server.name]: { error: message, loading: false, tools: [] }
      }));
      return [];
    }
    const savedServer = mcpServers.find((candidate) => candidate.name === server.name);
    if (!savedServer) {
      const message = "MCP server must be saved before tool discovery.";
      setMcpToolStateByServer((current) => ({
        ...current,
        [server.name]: { error: message, loading: false, tools: current[server.name]?.tools ?? [] }
      }));
      return [];
    }
    const currentState = mcpToolStateByServer[server.name];
    if (!force && currentState?.tools) {
      return currentState.tools;
    }
    if (!force && currentState?.loading) {
      return currentState.tools ?? [];
    }
    setMcpToolStateByServer((current) => ({
      ...current,
      [server.name]: { ...current[server.name], error: "", loading: true }
    }));
    try {
      const tools = await window.ccr.listMcpServerTools(savedServer.name);
      setMcpToolStateByServer((current) => ({
        ...current,
        [server.name]: { loading: false, tools }
      }));
      return tools;
    } catch (discoverError) {
      const message = formatError(discoverError);
      setMcpToolStateByServer((current) => ({
        ...current,
        [server.name]: { error: message || t("Tool discovery failed"), loading: false, tools: current[server.name]?.tools ?? [] }
      }));
      return [];
    }
  }

  function discoverVisibleMcpServers() {
    for (const server of availableMcpServers) {
      void discoverMcpServerTools(server);
    }
  }

  async function submitCustomMcpDialog() {
    const validationError = validateMcpServerDraft(customMcpDialogDraft);
    if (validationError) {
      setCustomMcpDialogError(formatError(new Error(validationError)));
      return;
    }
    const normalizedDraft = customMcpDialogDraft.transport === "stdio"
      ? customMcpDialogDraft
      : {
        ...customMcpDialogDraft,
        apiKey: "",
        apiKeyEnv: ""
      };
    const editIndex = mcpServers.findIndex((server) => server.name === normalizedDraft.name.trim());
    const server = mcpServerConfigFromDraft(normalizedDraft, mcpServers, editIndex >= 0 ? editIndex : undefined);
    onChange({ customMcpServer: createMcpServerDraftFromConfig(server) });
    setCustomMcpDialogOpen(false);
    const tools = await discoverMcpServerTools(server, true);
    const nextTool = normalizeFusionToolName(tools[0]?.name || "");
    if (nextTool) {
      const currentTools = selectedFusionToolNames(draft.toolsText);
      applyFusionTools(currentTools.includes(nextTool) ? currentTools : [...currentTools, nextTool], server, nextTool);
      setAddingFusionTool(false);
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{mode === "edit" ? t("Edit Virtual Model") : t("Add Virtual Model")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Field label={t("New model")}>
                <Input value={draft.exactAliasesText} onChange={(event) => onChange({ exactAliasesText: event.target.value })} />
              </Field>
              <div className="flex h-5 items-center justify-center font-mono text-[13px] font-semibold text-muted-foreground">=</div>
              <Field label={t("Base model")}>
                <RouteTargetControl modelOptions={modelOptions} onChange={(fixedModel) => onChange({ fixedModel })} value={draft.fixedModel} />
              </Field>
              <div className="flex h-5 items-center justify-center font-mono text-[13px] font-semibold text-muted-foreground">+</div>
              <Field label={t("Tools")}>
                <FusionToolsListControl
                  adding={addingFusionTool}
                  draft={draft}
                  imageModelOptions={imageModelOptions}
                  mcpServers={availableMcpServers}
                  mcpToolStateByServer={mcpToolStateByServer}
                  modelOptions={modelOptions}
                  onAddCustomMcpTool={openCustomMcpDialog}
                  onAddTool={() => setAddingFusionTool(true)}
                  onAppendTool={appendFusionTool}
                  onCancelAddTool={() => setAddingFusionTool(false)}
                  onChange={onChange}
                  onChangeTool={updateFusionTool}
                  onDiscoverMcpTools={(server, force) => {
                    if (server) {
                      void discoverMcpServerTools(server, force);
                      return;
                    }
                    discoverVisibleMcpServers();
                  }}
                  onRemoveTool={removeFusionTool}
                  selectedMcpServerName={draft.customMcpServer.name}
                  videoModelOptions={videoModelOptions}
                  values={selectedTools}
                />
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
          <Button disabled={!canSubmit} onClick={onSubmit} type="button">
            {mode === "edit" ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
	            {mode === "edit" ? t("Save") : t("Add")}
	          </Button>
	        </DialogFooter>
	      </DialogContent>
	      <CustomMcpToolDialog
	        draft={customMcpDialogDraft}
	        error={customMcpDialogError}
	        onChange={(patch) => {
	          setCustomMcpDialogDraft((current) => ({
	            ...current,
	            ...patch
	          }));
	          setCustomMcpDialogError("");
	        }}
	        onClose={() => setCustomMcpDialogOpen(false)}
	        onSubmit={submitCustomMcpDialog}
	        open={customMcpDialogOpen}
	      />
	    </Dialog>
	  );
	}

function WebSearchToolConfigurationPanel({
  draft,
  onChange
}: {
  draft: VirtualModelDraft;
  onChange: (patch: Partial<VirtualModelDraft>) => void;
}) {
  const t = useAppText();
  const providerOptions = translateOptions(fusionWebSearchProviderOptions, t);

  function updateProvider(provider: string) {
    const webSearchProvider = fusionWebSearchProviderOptions.some((option) => option.value === provider)
      ? provider as VirtualModelDraft["webSearchProvider"]
      : defaultFusionWebSearchProvider;
    onChange({
      webSearchEnvRows: createFusionWebSearchEnvRows(webSearchProvider),
      webSearchProvider
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border border-border/70 bg-muted/25 p-3">
      <Field label={t("Search provider")}>
        <SelectControl onChange={updateProvider} options={providerOptions} value={draft.webSearchProvider} />
      </Field>
      {draft.webSearchProvider === "browser" ? (
        <BrowserWebSearchConfigurationPanel
          onChange={(webSearchEnvRows) => onChange({ webSearchEnvRows })}
          rows={draft.webSearchEnvRows}
        />
      ) : (
        <Field label={t("Provider configuration")}>
          <KeyValueRowsControl
            addLabel={t("Add variable")}
            onChange={(webSearchEnvRows) => onChange({ webSearchEnvRows })}
            rows={draft.webSearchEnvRows}
          />
        </Field>
      )}
    </div>
  );
}

function BrowserWebSearchConfigurationPanel({
  onChange,
  rows
}: {
  onChange: (rows: KeyValueDraftRow[]) => void;
  rows: KeyValueDraftRow[];
}) {
  const t = useAppText();
  const extraRows = browserWebSearchExtraRows(rows);
  const engine = browserWebSearchEnvValue(rows, browserWebSearchEngineEnvKey) || "bing";
  const language = browserWebSearchEnvValue(rows, browserWebSearchLanguageEnvKey);
  const country = browserWebSearchEnvValue(rows, browserWebSearchCountryEnvKey);
  const safeSearch = browserWebSearchEnvValue(rows, browserWebSearchSafeSearchEnvKey) || "default";

  function updateKnownValue(key: string, value: string) {
    onChange(upsertBrowserWebSearchEnvRows(rows, key, value === "default" ? "" : value));
  }

  function updateExtraRows(nextExtraRows: KeyValueDraftRow[]) {
    onChange(mergeBrowserWebSearchEnvRows(rows, nextExtraRows));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label={t("Search engine")}>
          <SelectControl
            onChange={(value) => updateKnownValue(browserWebSearchEngineEnvKey, value)}
            options={browserWebSearchEngineOptions}
            value={browserWebSearchEngineOptions.some((option) => option.value === engine) ? engine : "bing"}
          />
        </Field>
        <Field label={t("Safe search")}>
          <SelectControl
            onChange={(value) => updateKnownValue(browserWebSearchSafeSearchEnvKey, value)}
            options={translateOptions(browserWebSearchSafeSearchOptions, t)}
            value={browserWebSearchSafeSearchOptions.some((option) => option.value === safeSearch) ? safeSearch : "default"}
          />
        </Field>
        <Field label={t("Language")}>
          <Input
            onChange={(event) => updateKnownValue(browserWebSearchLanguageEnvKey, event.target.value)}
            placeholder="en, zh-CN"
            value={language}
          />
        </Field>
        <Field label={t("Country")}>
          <Input
            onChange={(event) => updateKnownValue(browserWebSearchCountryEnvKey, event.target.value)}
            placeholder="US, CN"
            value={country}
          />
        </Field>
      </div>
      <Field label={t("Advanced variables")}>
        <KeyValueRowsControl
          addLabel={t("Add variable")}
          onChange={updateExtraRows}
          rows={extraRows}
        />
      </Field>
    </div>
  );
}

function browserWebSearchEnvValue(rows: KeyValueDraftRow[], key: string): string {
  return rows.find((row) => row.key.trim() === key)?.value.trim() ?? "";
}

function browserWebSearchExtraRows(rows: KeyValueDraftRow[]): KeyValueDraftRow[] {
  return rows.filter((row) => {
    const key = row.key.trim();
    return key && !browserWebSearchKnownEnvKeys.has(key);
  });
}

function upsertBrowserWebSearchEnvRows(rows: KeyValueDraftRow[], key: string, value: string): KeyValueDraftRow[] {
  const normalizedValue = value.trim();
  const nextRows = rows.filter((row) => row.key.trim() !== key);
  return normalizedValue ? [createKeyValueDraftRow(key, normalizedValue), ...nextRows] : nextRows;
}

function mergeBrowserWebSearchEnvRows(currentRows: KeyValueDraftRow[], extraRows: KeyValueDraftRow[]): KeyValueDraftRow[] {
  const knownRows = currentRows.filter((row) => browserWebSearchKnownEnvKeys.has(row.key.trim()) && row.value.trim());
  const cleanedExtraRows = extraRows.filter((row) => row.key.trim() || row.value.trim());
  return [...knownRows, ...cleanedExtraRows];
}

function CustomMcpToolDialog({
  draft,
  error,
  onChange,
  onClose,
  onSubmit,
  open
}: {
  draft: VirtualModelDraft["customMcpServer"];
  error: string;
  onChange: (patch: Partial<VirtualModelDraft["customMcpServer"]>) => void;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
}) {
  const t = useAppText();
  const mcp = draft;
  const transportOptions = translateOptions(mcpServerTransportOptions, t);
  const stdioMessageModeOptions = translateOptions(mcpStdioMessageModeOptions, t);

  function updateMcpServer(patch: Partial<VirtualModelDraft["customMcpServer"]>) {
    onChange(patch);
  }

  return (
    <Dialog className="z-[110]" onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Add custom MCP")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("MCP server")}>
                <Input onChange={(event) => updateMcpServer({ name: event.target.value })} value={mcp.name} />
              </Field>
              <Field label={t("Transport")}>
                <SelectControl
                  onChange={(transport) => updateMcpServer({ transport: transport as VirtualModelDraft["customMcpServer"]["transport"] })}
                  options={transportOptions}
                  value={mcp.transport}
                />
              </Field>
            </div>
            {mcp.transport === "stdio" ? (
              <div className="grid grid-cols-1 gap-3">
                <Field label={t("Command")}>
                  <Input onChange={(event) => updateMcpServer({ command: event.target.value })} value={mcp.command} />
                </Field>
                <Field label={t("Arguments")}>
                  <Input onChange={(event) => updateMcpServer({ argsText: event.target.value })} value={mcp.argsText} />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t("Working directory")}>
                    <Input onChange={(event) => updateMcpServer({ cwd: event.target.value })} value={mcp.cwd} />
                  </Field>
                  <Field label={t("Stdio message mode")}>
                    <SelectControl
                      onChange={(stdioMessageMode) => updateMcpServer({ stdioMessageMode: stdioMessageMode as VirtualModelDraft["customMcpServer"]["stdioMessageMode"] })}
                      options={stdioMessageModeOptions}
                      value={mcp.stdioMessageMode}
                    />
                  </Field>
                </div>
                <Field label={t("Environment variables")}>
                  <KeyValueRowsControl
                    addLabel={t("Add variable")}
                    onChange={(envRows) => updateMcpServer({ envRows })}
                    rows={mcp.envRows}
                  />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                <Field label={t("URL")}>
                  <Input onChange={(event) => updateMcpServer({ url: event.target.value })} value={mcp.url} />
                </Field>
                <Field label={t("Headers")}>
                  <KeyValueRowsControl
                    addLabel={t("Add variable")}
                    onChange={(headerRows) => updateMcpServer({ headerRows })}
                    rows={mcp.headerRows}
                  />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("Request timeout")}>
                <Input onChange={(event) => updateMcpServer({ requestTimeoutMs: event.target.value })} type="number" value={mcp.requestTimeoutMs} />
              </Field>
              <Field label={t("Startup timeout")}>
                <Input onChange={(event) => updateMcpServer({ startupTimeoutMs: event.target.value })} type="number" value={mcp.startupTimeoutMs} />
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
            {t("Add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FusionToolConfigurationPanel({
  draft,
  imageModelOptions,
  modelOptions,
  onChange,
  toolName,
  videoModelOptions
}: {
  draft: VirtualModelDraft;
  imageModelOptions: ReturnType<typeof createGrokMediaModelOptions>;
  modelOptions: ReturnType<typeof createRouteModelOptions>;
  onChange: (patch: Partial<VirtualModelDraft>) => void;
  toolName: string;
  videoModelOptions: ReturnType<typeof createGrokMediaModelOptions>;
}) {
  if (isFusionVisionToolName(toolName)) {
    return <VisionToolConfigurationPanel draft={draft} modelOptions={modelOptions} onChange={onChange} />;
  }
  if (isFusionWebSearchToolName(toolName)) {
    return <WebSearchToolConfigurationPanel draft={draft} onChange={onChange} />;
  }
  if (isFusionImageGenerationToolName(toolName)) {
    return <MediaModelConfigurationPanel draft={draft} kind="image" modelOptions={imageModelOptions} onChange={onChange} />;
  }
  if (isFusionVideoGenerationToolName(toolName)) {
    return <MediaModelConfigurationPanel draft={draft} kind="video" modelOptions={videoModelOptions} onChange={onChange} />;
  }
  return null;
}

function VisionToolConfigurationPanel({
  draft,
  modelOptions,
  onChange
}: {
  draft: VirtualModelDraft;
  modelOptions: ReturnType<typeof createRouteModelOptions>;
  onChange: (patch: Partial<VirtualModelDraft>) => void;
}) {
  const t = useAppText();

  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border border-border/70 bg-muted/25 p-3">
      <Field label={t("Vision model")}>
        <RouteTargetControl modelOptions={modelOptions} onChange={(visionModel) => onChange({ visionModel })} value={draft.visionModel} />
      </Field>
    </div>
  );
}

function FusionToolsListControl({
  adding,
  draft,
  imageModelOptions,
  mcpServers,
  mcpToolStateByServer,
  modelOptions,
  onAddCustomMcpTool,
  onAddTool,
  onAppendTool,
  onCancelAddTool,
  onChange,
  onChangeTool,
  onDiscoverMcpTools,
  onRemoveTool,
  selectedMcpServerName,
  videoModelOptions,
  values
}: {
  adding: boolean;
  draft: VirtualModelDraft;
  imageModelOptions: ReturnType<typeof createGrokMediaModelOptions>;
  mcpServers: GatewayMcpServerConfig[];
  mcpToolStateByServer: Record<string, {
    error?: string;
    loading?: boolean;
    tools?: GatewayMcpToolInfo[];
  }>;
  modelOptions: ReturnType<typeof createRouteModelOptions>;
  onAddCustomMcpTool: () => void;
  onAddTool: () => void;
  onAppendTool: (value: string, server?: GatewayMcpServerConfig) => void;
  onCancelAddTool: () => void;
  onChange: (patch: Partial<VirtualModelDraft>) => void;
  onChangeTool: (index: number, value: string, server?: GatewayMcpServerConfig) => void;
  onDiscoverMcpTools: (server?: GatewayMcpServerConfig, force?: boolean) => void;
  onRemoveTool: (index: number) => void;
  selectedMcpServerName: string;
  videoModelOptions: ReturnType<typeof createGrokMediaModelOptions>;
  values: string[];
}) {
  const t = useAppText();
  const selectedToolValues = values.map(normalizeFusionToolName).filter(Boolean);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      {values.map((value, index) => (
        <div className="grid min-w-0 grid-cols-1 gap-2 rounded-md border border-border/70 bg-muted/15 p-2" key={`${value}-${index}`}>
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <FusionToolSelectControl
                excludedValues={selectedToolValues.filter((_, toolIndex) => toolIndex !== index)}
                mcpServers={mcpServers}
                mcpToolStateByServer={mcpToolStateByServer}
                onAddCustomMcpTool={onAddCustomMcpTool}
                onChange={(toolName, server) => onChangeTool(index, toolName, server)}
                onDiscoverMcpTools={onDiscoverMcpTools}
                selectedMcpServerName={selectedMcpServerName}
                value={value}
              />
            </div>
            <Button
              aria-label={t("Remove tool")}
              onClick={() => onRemoveTool(index)}
              size="iconSm"
              title={t("Remove tool")}
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <FusionToolConfigurationPanel
            draft={draft}
            imageModelOptions={imageModelOptions}
            modelOptions={modelOptions}
            onChange={onChange}
            toolName={value}
            videoModelOptions={videoModelOptions}
          />
        </div>
      ))}

      {adding ? (
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <FusionToolSelectControl
              excludedValues={selectedToolValues}
              mcpServers={mcpServers}
              mcpToolStateByServer={mcpToolStateByServer}
              onAddCustomMcpTool={onAddCustomMcpTool}
              onChange={onAppendTool}
              onDiscoverMcpTools={onDiscoverMcpTools}
              selectedMcpServerName={selectedMcpServerName}
              value=""
            />
          </div>
          <Button
            aria-label={t("Cancel")}
            onClick={onCancelAddTool}
            size="iconSm"
            title={t("Cancel")}
            type="button"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}

      <Button
        className="justify-start"
        disabled={adding}
        onClick={onAddTool}
        type="button"
        variant="outline"
      >
        <Plus className="h-4 w-4" />
        {t("Add tool")}
      </Button>
    </div>
  );
}

function FusionToolSelectControl({
  excludedValues,
  mcpServers,
  mcpToolStateByServer,
  onAddCustomMcpTool,
  onChange,
  onDiscoverMcpTools,
  selectedMcpServerName,
  value
}: {
  excludedValues?: string[];
  mcpServers: GatewayMcpServerConfig[];
  mcpToolStateByServer: Record<string, {
    error?: string;
    loading?: boolean;
    tools?: GatewayMcpToolInfo[];
  }>;
  onAddCustomMcpTool: () => void;
  onChange: (value: string, server?: GatewayMcpServerConfig) => void;
  onDiscoverMcpTools: (server?: GatewayMcpServerConfig, force?: boolean) => void;
  selectedMcpServerName: string;
  value: string;
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
  const normalizedValue = normalizeFusionToolName(value);
  const excludedValueSet = new Set((excludedValues ?? []).map(normalizeFusionToolName).filter(Boolean));
  const selected = fusionToolOptions.find((option) => option.value === normalizedValue);
  const selectedServer = selectedMcpServerName
    ? mcpServers.find((server) => server.name === selectedMcpServerName)
    : mcpServers.find((server) => mcpToolStateByServer[server.name]?.tools?.some((tool) => tool.name === normalizedValue));
  const selectedLabel = selected ? t(selected.label) : (selectedServer && normalizedValue ? `${selectedServer.name} / ${normalizedValue}` : normalizedValue || t("Select tool"));

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
      const desiredHeight = 320;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const availableWidth = Math.max(240, viewportWidth - margin * 2);
      const width = Math.min(Math.max(anchor.width, 280), availableWidth);
      const left = Math.min(Math.max(margin, anchor.left), viewportWidth - margin - width);
      const below = Math.max(0, viewportHeight - anchor.bottom - margin - gap);
      const above = Math.max(0, anchor.top - margin - gap);
      const placement = below < desiredHeight && above > below ? "above" : "below";
      const availableHeight = Math.max(96, placement === "above" ? above : below);
      setPopoverLayout({
        left,
        maxHeight: Math.min(360, availableHeight),
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
    if (open) {
      onDiscoverMcpTools();
    }
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
        aria-controls="fusion-tool-select-options"
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
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
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
                width: `${popoverLayout.width}px`,
                ...(popoverLayout.placement === "above"
                  ? { bottom: `${popoverLayout.offset}px` }
                  : { top: `${popoverLayout.offset}px` })
              }}
            >
              <PopoverContent
                className="w-full overflow-y-auto p-1"
                id="fusion-tool-select-options"
                ref={panelRef}
                role="listbox"
                style={{ maxHeight: `${popoverLayout.maxHeight}px` }}
              >
                {fusionToolOptions.filter((option) => visibleFusionToolOption(option.value, normalizedValue, excludedValueSet)).map((option) => {
                  const selectedOption = option.value === selected?.value;
                  return (
                    <button
                      aria-selected={selectedOption}
                      className={cn(
                        "flex min-h-[58px] w-full min-w-0 items-start gap-2 rounded-[5px] px-2 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
                        selectedOption ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                      )}
                      key={option.value}
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      role="option"
                      type="button"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold">{t(option.label)}</span>
                        <span className={cn("mt-0.5 block text-[11px] leading-4", selectedOption ? "text-primary/80" : "text-muted-foreground")}>
                          {t(option.description)}
                        </span>
                      </span>
                      {selectedOption ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
                    </button>
                  );
                })}
                {mcpServers.length > 0 ? <div className="my-1 border-t border-border/70" /> : null}
                {mcpServers.map((server) => {
                  const state = mcpToolStateByServer[server.name];
                  const tools = (state?.tools ?? []).filter((tool) => visibleFusionToolOption(tool.name, normalizedValue, excludedValueSet));
                  const discoveredTools = state?.tools ?? [];
                  const serverSelected = selectedMcpServerName === server.name;
                  return (
                    <div className="rounded-[5px] px-1 py-1" key={server.name}>
                      <div className="flex min-w-0 items-center gap-1.5 px-1 py-1 text-[11px] font-semibold text-foreground">
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate" title={server.name}>{server.name}</span>
                        <button
                          aria-label={`${t("Discover tools")} ${server.name}`}
                          className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDiscoverMcpTools(server, true);
                          }}
                          title={mcpServerEndpointSummary(server)}
                          type="button"
                        >
                          {state?.loading ? <LoaderCircle className="h-3 w-3 animate-spin" /> : t("Discover tools")}
                        </button>
                      </div>
                      <div className="ml-3 border-l border-border/70 pl-2">
                        {tools.map((tool) => {
                          const selectedTool = normalizedValue === tool.name && (serverSelected || !selectedMcpServerName);
                          return (
                            <button
                              aria-selected={selectedTool}
                              className={cn(
                                "flex min-h-[44px] w-full min-w-0 items-start gap-2 rounded-[5px] px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
                                selectedTool ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                              )}
                              key={`${server.name}:${tool.name}`}
                              onClick={() => {
                                onChange(tool.name, server);
                                setOpen(false);
                              }}
                              role="option"
                              type="button"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-semibold">{tool.name}</span>
                                {tool.description ? (
                                  <span className={cn("mt-0.5 line-clamp-2 text-[11px] leading-4", selectedTool ? "text-primary/80" : "text-muted-foreground")}>
                                    {tool.description}
                                  </span>
                                ) : null}
                              </span>
                              {selectedTool ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
                            </button>
                          );
                        })}
                        {state?.loading && tools.length === 0 ? (
                          <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-muted-foreground">
                            <LoaderCircle className="h-3 w-3 animate-spin" />
                            <span>{t("Discover tools")}</span>
                          </div>
                        ) : null}
                        {!state?.loading && state?.tools && discoveredTools.length > 0 && tools.length === 0 && !state.error ? (
                          <div className="px-2 py-2 text-[11px] text-muted-foreground">{t("No tools available")}</div>
                        ) : null}
                        {!state?.loading && state?.tools && discoveredTools.length === 0 && !state.error ? (
                          <div className="px-2 py-2 text-[11px] text-muted-foreground">{t("No tools discovered")}</div>
                        ) : null}
                        {state?.error ? (
                          <div className="px-2 py-2 text-[11px] text-destructive" title={state.error}>{t("Tool discovery failed")}</div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <div className="my-1 border-t border-border/70" />
                <button
                  className="flex min-h-[36px] w-full min-w-0 items-center gap-2 rounded-[5px] px-2 py-2 text-left text-[12px] font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/25"
                  onClick={() => {
                    setOpen(false);
                    onAddCustomMcpTool();
                  }}
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{t("Add custom MCP")}</span>
                </button>
              </PopoverContent>
            </AnimatedPopover>
          ) : null}
        </AnimatePresence>
      </PopoverPortal>
    </div>
  );
}

export function InstallExtensionDialog({
  canSubmit,
  draft,
  error,
  marketplace,
  onChange,
  onChooseLocal,
  onClose,
  onSubmit
}: {
  canSubmit: boolean;
  draft: ExtensionInstallDraft;
  error: string;
  marketplace: PluginMarketplaceEntry[];
  onChange: (patch: Partial<ExtensionInstallDraft>) => void;
  onChooseLocal: () => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useAppText();

  function selectMarketplace(entry: PluginMarketplaceEntry) {
    onChange({
      key: entry.id,
      apps: entry.apps,
      dependencies: entry.dependencies,
      marketplaceId: entry.id,
      modulePath: entry.modulePath,
      selectedName: entry.name
    });
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Install Extension")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-3">
            <div className="space-y-2">
              {marketplace.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">{t("No marketplace extensions")}</div>
              ) : (
                marketplace.map((entry) => (
                  <button
                    className={cn(
                      "flex w-full min-w-0 flex-col gap-1 rounded-md border px-3 py-2 text-left text-[12px] transition-colors",
                      draft.marketplaceId === entry.id ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                    )}
                    key={entry.id}
                    onClick={() => selectMarketplace(entry)}
                    type="button"
                  >
                    <span className="truncate font-semibold text-foreground">{entry.name}</span>
                    <span className="line-clamp-2 text-[11px] text-muted-foreground">{entry.description}</span>
                    <span className="truncate text-[10px] text-muted-foreground/80">{entry.capabilities.join(", ")}</span>
                    {entry.dependencies.length > 0 ? (
                      <span className="truncate text-[10px] text-muted-foreground/80">{t("Dependencies")}: {formatPluginDependencies(entry.dependencies)}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{error}</div>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter className="justify-between">
          <Button onClick={onChooseLocal} type="button" variant="outline">
            <FolderOpen className="h-4 w-4" />
            {t("Choose folder")}
          </Button>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              {t("Cancel")}
            </Button>
            <Button disabled={!canSubmit} onClick={onSubmit} type="button">
              <Plus className="h-4 w-4" />
              {t("Install")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
