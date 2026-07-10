import {
  AnimatedListItem, AnimatePresence, AppConfig, Braces, buildExtensionList, Button,
  Card, CardContent, CardHeader, Check, CircleAlert, ClaudeDesignRouteRuleType,
  claudeDesignRouteRuleTypeLabel, claudeDesignRouteRuleTypeOptions, ClaudeDesignRoutingDraft, ClaudeDesignRoutingRuleDraft, createRouteModelOptions, Dialog,
  DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, ExtensionListItem,
  extensionMatchesQuery, ExtensionSource, Field, GatewayProviderConfig, Input, isClaudeDesignStaticRuleType,
  Label, motion, normalizeClaudeDesignRuleTypeChange, PluginSettingsDraft, Plus, RouteTargetControl,
  Search, SelectControl, Settings, TextAreaControl, Toggle, translateOptions,
  Trash2, useAppText, useMemo, useState, X
} from "../shared/index";
export function ExtensionsView({
  configureExtension,
  config,
  installExtension,
  removeExtension,
  setExtensionEnabled
}: {
  configureExtension: (source: ExtensionSource, index: number) => void;
  config: AppConfig;
  installExtension: () => void;
  removeExtension: (source: ExtensionSource, index: number, groupIndexes: number[]) => void;
  setExtensionEnabled: (source: ExtensionSource, index: number, enabled: boolean, groupIndexes: number[]) => void;
}) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const extensions = useMemo(() => buildExtensionList(config), [config.plugins, config.providerPlugins]);
  const visibleExtensions = useMemo(
    () => extensions.filter((extension) => extensionMatchesQuery(extension, normalizedQuery)),
    [extensions, normalizedQuery]
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search extensions")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search extensions")}
              value={query}
            />
          </div>
          <Button aria-label={t("Install extension")} onClick={installExtension} title={t("Install extension")} type="button">
            <Plus className="h-4 w-4" />
            {t("Install")}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {extensions.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <Braces className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[12px] text-muted-foreground">{t("No extensions installed")}</div>
              <div className="mt-1 text-[11px] text-muted-foreground/60">{t("Click Install to add one")}</div>
            </div>
          ) : null}
          {extensions.length > 0 && visibleExtensions.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching extensions")}</div>
          ) : null}
          {visibleExtensions.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(180px,0.95fr)_minmax(220px,1.15fr)_minmax(240px,1.2fr)_116px_84px] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Name")}</div>
                  <div className="truncate">{t("Path")}</div>
                  <div className="truncate">{t("Capability")}</div>
                  <div className="truncate">{t("Status")}</div>
                  <div aria-hidden="true" />
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                  {visibleExtensions.map((extension) => (
                    <AnimatedListItem
                      className="grid min-h-[58px] grid-cols-[minmax(180px,0.95fr)_minmax(220px,1.15fr)_minmax(240px,1.2fr)_116px_84px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                      key={`${extension.source}-${extension.index}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold">{extension.name}</div>
                      </div>
                      <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={extension.target}>
                        {extension.target}
                      </div>
                      <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={extension.capability}>
                        {extension.capability}
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        {extension.canToggle ? (
                          <Toggle checked={extension.enabled} onChange={(enabled) => setExtensionEnabled(extension.source, extension.index, enabled, extension.groupIndexes)} />
                        ) : null}
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          aria-label={`${t("Configure")} ${extension.name}`}
                          disabled={!extension.canConfigure}
                          onClick={() => configureExtension(extension.source, extension.index)}
                          size="iconSm"
                          title={t("Configure plugin")}
                          type="button"
                          variant="ghost"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                        <Button aria-label={`${t("Remove")} ${extension.name}`} onClick={() => removeExtension(extension.source, extension.index, extension.groupIndexes)} size="iconSm" title={t("Remove extension")} type="button" variant="ghost">
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

export function DeleteExtensionDialog({
  extension,
  onClose,
  onConfirm
}: {
  extension: ExtensionListItem;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useAppText();

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Delete Extension")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <div className="flex items-start gap-2 text-[12px] font-medium text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("Delete this extension from the configuration?")}</span>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <div className="truncate" title={extension.name}>
                <span className="font-medium text-foreground">{t("Name")}:</span> {extension.name}
              </div>
              <div className="truncate" title={extension.target}>
                <span className="font-medium text-foreground">{t("Path")}:</span> {extension.target}
              </div>
              <div className="truncate" title={extension.capability}>
                <span className="font-medium text-foreground">{t("Capability")}:</span> {extension.capability}
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

export function PluginSettingsDialog({
  draft,
  error,
  extension,
  onChange,
  onClose,
  onSubmit
}: {
  draft: PluginSettingsDraft;
  error: string;
  extension: ExtensionListItem;
  onChange: (patch: Partial<PluginSettingsDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useAppText();

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Plugin Settings")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
              <Field label={t("Enabled")}>
                <Toggle checked={draft.enabled} onChange={(enabled) => onChange({ enabled })} />
              </Field>
              <Field label={t("App surface")}>
                <Toggle checked={draft.appsSurfaceEnabled} onChange={(appsSurfaceEnabled) => onChange({ appsSurfaceEnabled })} />
              </Field>
              <Field label={t("Gateway surface")}>
                <Toggle checked={draft.gatewaySurfaceEnabled} onChange={(gatewaySurfaceEnabled) => onChange({ gatewaySurfaceEnabled })} />
              </Field>
              <Field label={t("Provider surface")}>
                <Toggle checked={draft.providerSurfaceEnabled} onChange={(providerSurfaceEnabled) => onChange({ providerSurfaceEnabled })} />
              </Field>
              <Field label={t("Name")}>
                <Input readOnly value={extension.name} />
              </Field>
              <Field className="sm:col-span-2" label={t("Module path")}>
                <Input value={draft.modulePath} onChange={(event) => onChange({ modulePath: event.target.value })} />
              </Field>
            </div>

            <Field label={t("Browser apps JSON")}>
              <TextAreaControl minHeight={132} value={draft.appsText} onChange={(appsText) => onChange({ appsText })} />
            </Field>

            <Field label={t("Plugin permissions JSON")}>
              <TextAreaControl minHeight={120} value={draft.permissionsText} onChange={(permissionsText) => onChange({ permissionsText })} />
            </Field>

            <Field label={t("Plugin proxy JSON")}>
              <TextAreaControl minHeight={120} value={draft.proxyText} onChange={(proxyText) => onChange({ proxyText })} />
            </Field>

            <Field label={t("Plugin core gateway JSON")}>
              <TextAreaControl minHeight={132} value={draft.coreGatewayText} onChange={(coreGatewayText) => onChange({ coreGatewayText })} />
            </Field>

            <Field label={t("Plugin config JSON")}>
              <TextAreaControl minHeight={160} value={draft.configText} onChange={(configText) => onChange({ configText })} />
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
            <Check className="h-4 w-4" />
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfigureClaudeDesignDialog({
  canSubmit,
  draft,
  routesLabel = "Claude Design routes",
  sourceModelLabel = "Claude Design model",
  sourceModelDefaults = { model: "claude-opus-4-8", pattern: "claude-" },
  onAddRule,
  onChange,
  onChangeRule,
  onClose,
  onRemoveRule,
  onSubmit,
  providers
}: {
  canSubmit: boolean;
  draft: ClaudeDesignRoutingDraft;
  routesLabel?: string;
  sourceModelLabel?: string;
  sourceModelDefaults?: { model: string; pattern: string };
  onAddRule: () => void;
  onChange: (patch: Partial<ClaudeDesignRoutingDraft>) => void;
  onChangeRule: (index: number, patch: Partial<ClaudeDesignRoutingRuleDraft>) => void;
  onClose: () => void;
  onRemoveRule: (index: number) => void;
  onSubmit: () => void;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const modelOptions = useMemo(() => createRouteModelOptions(providers), [providers]);
  const ruleTypeOptions = translateOptions(claudeDesignRouteRuleTypeOptions, t);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Configure Routing")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
              <Field label={t("Model routing")}>
                <Toggle checked={draft.enabled} onChange={(enabled) => onChange({ enabled })} />
              </Field>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t(routesLabel)}</div>
                <Button onClick={onAddRule} size="sm" type="button" variant="outline">
                  <Plus className="h-3.5 w-3.5" />
                  {t("Add")}
                </Button>
              </div>

              {draft.rules.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">{t("No plugin routes configured")}</div>
              ) : null}

              <div className="space-y-2">
                <AnimatePresence initial={false}>
                {draft.rules.map((rule, index) => (
                  <AnimatedListItem className="rounded-md border border-border bg-card p-3" key={rule.id || index}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label={t("Name")}>
                        <Input value={rule.name} onChange={(event) => onChangeRule(index, { name: event.target.value })} />
                      </Field>
                      <Field label={t("Condition")}>
                        <SelectControl
                          value={rule.type}
                          onChange={(type) => onChangeRule(index, normalizeClaudeDesignRuleTypeChange(rule, type as ClaudeDesignRouteRuleType, sourceModelDefaults))}
                          options={ruleTypeOptions}
                        />
                      </Field>
                      {rule.type === "model" ? (
                        <Field label={t(sourceModelLabel)}>
                          <Input value={rule.model} onChange={(event) => onChangeRule(index, { model: event.target.value })} />
                        </Field>
                      ) : null}
                      {rule.type === "model-prefix" ? (
                        <Field label={t("Model prefix")}>
                          <Input value={rule.pattern} onChange={(event) => onChangeRule(index, { pattern: event.target.value })} />
                        </Field>
                      ) : null}
                      {isClaudeDesignStaticRuleType(rule.type) ? (
                        <div className="flex min-h-[58px] items-end rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-[12px] text-muted-foreground">{t(claudeDesignRouteRuleTypeLabel(rule.type))}</div>
                      ) : null}
                      <Field label={t("Target model")}>
                        <RouteTargetControl
                          modelOptions={modelOptions}
                          onChange={(target) => onChangeRule(index, { target })}
                          value={rule.target}
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                      <Label className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
                        <Toggle checked={rule.enabled} onChange={(enabled) => onChangeRule(index, { enabled })} />
                        <span>{t("Enabled")}</span>
                      </Label>
                      <Button aria-label={`${t("Remove")} ${rule.name || t("Plugin route")}`} onClick={() => onRemoveRule(index)} size="iconSm" title={t("Remove rule")} type="button" variant="ghost">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </AnimatedListItem>
                ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit} type="button">
            <Check className="h-4 w-4" />
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
