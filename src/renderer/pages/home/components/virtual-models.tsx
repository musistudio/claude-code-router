import {
  AnimatedListItem, AnimatedPopover, AnimatePresence, Boxes, Button,
  Card, CardContent, CardHeader, CardTitle, Check, ChevronDown, ChevronRight,
  cn, createMcpServerDraftFromConfig, createRouteModelOptions, defaultFusionWebSearchProvider, Dialog, DialogBody, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, ExtensionInstallDraft, Field, FolderOpen, formatPluginDependencies,
  createFusionWebSearchEnvRows, customFusionToolName, fusionToolExecutionFlags, fusionToolOptions,
  fusionWebSearchProviderOptions, GatewayMcpServerConfig, GatewayMcpToolInfo, GatewayProviderConfig, Input, KeyValueRowsControl, LoaderCircle,
  mcpServerConfigFromDraft, mcpServerEndpointSummary, mcpServerTransportOptions,
  mcpStdioMessageModeOptions, motion, normalizeFusionToolName, Pencil,
  PluginMarketplaceEntry, Plus, PopoverContent, RouteTargetControl, Search, selectedFusionToolName,
  SelectControl, Toggle, Trash2, translateOptions, useAppText, useEffect, useLayoutEffect, useMemo,
  useRef, useState, validateMcpServerDraft, virtualModelBaseModelSummary, VirtualModelDraft, virtualModelMatchesQuery, virtualModelMatchSummary,
  VirtualModelProfileConfig, virtualModelToolSummary, X
} from "../shared";

const virtualModelTableGridClass = "grid-cols-[minmax(180px,0.9fr)_minmax(220px,1.1fr)_minmax(220px,1.1fr)_minmax(170px,0.85fr)_112px_96px]";
const virtualModelTableMinWidthClass = "min-w-[1100px]";

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
            <div className="overflow-x-auto">
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
  const modelOptions = useMemo(() => createRouteModelOptions(providers), [providers]);
  const selectedTool = selectedFusionToolName(draft.toolsText);
  const selectedToolFlags = fusionToolExecutionFlags(selectedTool);
  const [customMcpDialogOpen, setCustomMcpDialogOpen] = useState(false);
  const [customMcpDialogDraft, setCustomMcpDialogDraft] = useState(draft.customMcpServer);
  const [customMcpDialogError, setCustomMcpDialogError] = useState("");
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

  function updateFusionTool(toolName: string, server?: GatewayMcpServerConfig) {
    const nextTool = normalizeFusionToolName(toolName);
    const flags = fusionToolExecutionFlags(nextTool);
    onChange({
      ...(flags.matchWebSearch && draft.webSearchEnvRows.length === 0 ? { webSearchEnvRows: createFusionWebSearchEnvRows(draft.webSearchProvider) } : {}),
      ...(!flags.matchMultimodal && !flags.matchWebSearch ? {
        ...(server ? { customMcpServer: createMcpServerDraftFromConfig(server) } : {}),
        customToolName: nextTool || draft.customToolName || customFusionToolName
      } : {}),
      toolsText: nextTool,
      ...flags
    });
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
      const tools = await window.ccr.listMcpServerTools(server);
      setMcpToolStateByServer((current) => ({
        ...current,
        [server.name]: { loading: false, tools }
      }));
      return tools;
    } catch (discoverError) {
      const message = discoverError instanceof Error ? discoverError.message : String(discoverError);
      setMcpToolStateByServer((current) => ({
        ...current,
        [server.name]: { error: message || "Tool discovery failed.", loading: false, tools: current[server.name]?.tools ?? [] }
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
      setCustomMcpDialogError(validationError);
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
      onChange({
        customMcpServer: createMcpServerDraftFromConfig(server),
        customToolName: nextTool,
        toolsText: nextTool,
        ...fusionToolExecutionFlags(nextTool)
      });
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
	                <FusionToolSelectControl
	                  mcpServers={availableMcpServers}
	                  mcpToolStateByServer={mcpToolStateByServer}
	                  onAddCustomMcpTool={openCustomMcpDialog}
	                  onChange={updateFusionTool}
	                  onDiscoverMcpTools={(server, force) => {
	                    if (server) {
	                      void discoverMcpServerTools(server, force);
	                      return;
	                    }
	                    discoverVisibleMcpServers();
	                  }}
	                  selectedMcpServerName={draft.customMcpServer.name}
	                  value={selectedTool}
	                />
	              </Field>
            </div>

            {selectedToolFlags.matchMultimodal ? (
              <div className="grid grid-cols-1 gap-3 rounded-md border border-border/70 bg-muted/25 p-3">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-foreground">{t("Vision tool configuration")}</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t("Choose a configured gateway model for image understanding.")}</div>
                </div>
                <Field label={t("Vision model")}>
                  <RouteTargetControl modelOptions={modelOptions} onChange={(visionModel) => onChange({ visionModel })} value={draft.visionModel} />
                </Field>
              </div>
            ) : null}

            {selectedToolFlags.matchWebSearch ? (
              <WebSearchToolConfigurationPanel draft={draft} onChange={onChange} />
            ) : null}

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
      <div className="min-w-0">
        <div className="truncate text-[12px] font-semibold text-foreground">{t("Web search configuration")}</div>
      </div>
      <Field label={t("Search provider")}>
        <SelectControl onChange={updateProvider} options={providerOptions} value={draft.webSearchProvider} />
      </Field>
      <Field label={t("Provider configuration")}>
        <KeyValueRowsControl
          addLabel={t("Add variable")}
          onChange={(webSearchEnvRows) => onChange({ webSearchEnvRows })}
          rows={draft.webSearchEnvRows}
        />
      </Field>
    </div>
  );
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
    <Dialog className="z-[80]" onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
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

function FusionToolSelectControl({
  mcpServers,
  mcpToolStateByServer,
  onAddCustomMcpTool,
  onChange,
  onDiscoverMcpTools,
  selectedMcpServerName,
  value
}: {
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
  const rootRef = useRef<HTMLDivElement>(null);
  const normalizedValue = normalizeFusionToolName(value);
  const selected = fusionToolOptions.find((option) => option.value === normalizedValue);
  const selectedServer = selectedMcpServerName
    ? mcpServers.find((server) => server.name === selectedMcpServerName)
    : mcpServers.find((server) => mcpToolStateByServer[server.name]?.tools?.some((tool) => tool.name === normalizedValue));
  const selectedLabel = selected?.label ?? (selectedServer && normalizedValue ? `${selectedServer.name} / ${normalizedValue}` : normalizedValue || t("Select tool"));

  useLayoutEffect(() => {
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

      <AnimatePresence initial={false}>
        {open ? (
          <AnimatedPopover
            className="fixed z-[70]"
            placement={popoverLayout?.placement ?? "below"}
            style={popoverLayout
              ? {
                left: `${popoverLayout.left}px`,
                width: `${popoverLayout.width}px`,
                ...(popoverLayout.placement === "above"
                  ? { bottom: `${popoverLayout.offset}px` }
                  : { top: `${popoverLayout.offset}px` })
              }
              : undefined}
          >
            <PopoverContent
              className="w-full overflow-y-auto p-1"
              id="fusion-tool-select-options"
              role="listbox"
	              style={{ maxHeight: `${popoverLayout?.maxHeight ?? 360}px` }}
	            >
	              {fusionToolOptions.map((option) => {
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
                      <span className="block truncate text-[12px] font-semibold">{option.label}</span>
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
	                const tools = state?.tools ?? [];
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
	                      {!state?.loading && state?.tools && tools.length === 0 && !state.error ? (
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
