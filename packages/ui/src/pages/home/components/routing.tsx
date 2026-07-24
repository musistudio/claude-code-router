import {
  AddRoutingRuleDraft, AnimatedListItem, AnimatePresence, AppConfig, ArrowDown,
  ArrowUp, Badge, buildRoutingRuleRows, Button, Card, CardContent,
  CardHeader, Check, CircleAlert, clampNumber, cn, createRouteModelOptions, createRoutingRewriteDraftRow,
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  disclosureSpringTransition, Field, formatRouterRuleCondition, formatRouterRuleTarget, GatewayProviderConfig, Input,
  AppI18nContext, appCopy, ExternalLink, FolderOpen, Info, motion, normalizeRouteScriptSampleRequest, normalizeRouterFallbackConfig, Pencil, Plus, Route, RouterFallbackConfig,
  RouterBuiltInAgentRuleId, RouterFallbackMode, routerConditionSourceOptions, routerFallbackModeOptions, RouterRule, routerRewriteOperationOptions, routerRuleOperatorOptions,
  RouterBuiltInAgentRuleConfig, routerRuleTypeOptions,
  RouteTargetControl, routingRuleRowMatchesQuery, Search, SelectControl, Toggle, translateOptions,
  Textarea, Trash2, uniqueStrings, useAppText, useContext, useMemo, useRef, useState, X
} from "../shared/index";
import { Tooltip } from "@/components/ui/tooltip";
import {
  ROUTER_FALLBACK_MAX_RETRY_COUNT,
  ROUTER_SCRIPT_API_VERSION,
  type RouterRuleScript
} from "@ccr/core/contracts/app";
export function RoutingView({
  addRule,
  config,
  editRule,
  moveRule,
  providers,
  removeRule,
  updateBuiltInRule,
  updateFallback,
  updateRule
}: {
  addRule: () => void;
  config: AppConfig;
  editRule: (index: number) => void;
  moveRule: (index: number, direction: -1 | 1) => void;
  providers: GatewayProviderConfig[];
  removeRule: (index: number) => void;
  updateBuiltInRule: (agent: RouterBuiltInAgentRuleId, patch: Partial<RouterBuiltInAgentRuleConfig>) => void;
  updateFallback: (fallback: RouterFallbackConfig) => void;
  updateRule: (index: number, patch: Partial<RouterRule>) => void;
}) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const rows = useMemo(() => buildRoutingRuleRows(config), [config]);
  const fallback = config.Router.fallback;
  const visibleRules = useMemo(
    () => rows.filter((row) => routingRuleRowMatchesQuery(row, normalizedQuery)),
    [rows, normalizedQuery]
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
              aria-label={t("Search routing rules")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search routing rules")}
              value={query}
            />
          </div>
          <Button aria-label={t("Add routing rule")} onClick={addRule} title={t("Add routing rule")} type="button">
            <Plus className="h-4 w-4" />
            {t("Add")}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          <div className="border-b border-border/60 px-4 py-3">
            <RouterFallbackControl
              fallback={fallback}
              label={t("Default on failure")}
              onChange={updateFallback}
              providers={providers}
            />
          </div>
          {rows.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <Route className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[12px] text-muted-foreground">{t("No routing rules configured")}</div>
              <div className="mt-1 text-[11px] text-muted-foreground/60">{t("Click Add to create one")}</div>
            </div>
          ) : null}
          {rows.length > 0 && visibleRules.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching routing rules")}</div>
          ) : null}
          {visibleRules.length > 0 ? (
            <div className="min-w-0">
              <div className="min-w-[940px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(160px,0.8fr)_minmax(220px,1fr)_minmax(240px,1.15fr)_84px_148px] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Name")}</div>
                  <div className="truncate">{t("Condition")}</div>
                  <div className="truncate">{t("Request action")}</div>
                  <div className="truncate">{t("Status")}</div>
                  <div className="truncate text-right">{t("Action")}</div>
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                  {visibleRules.map((row) => {
                    const rowSourceLabel = row.builtInAgent ? t(row.sourceLabel) : row.sourceLabel;
                    const rowTarget = row.target === "Profile model unset" ? t(row.target) : row.target;
                    const toggleDisabledReason = row.toggleDisabledReason ? t(row.toggleDisabledReason) : undefined;
                    return (
                      <AnimatedListItem
                        className="grid min-h-[58px] grid-cols-[minmax(160px,0.8fr)_minmax(220px,1fr)_minmax(240px,1.15fr)_84px_148px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                        key={row.key}
                      >
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-[12px] font-semibold">{row.name || t("Unnamed")}</div>
                          {row.builtInAgent ? <BuiltInRouteInfoIcon agent={row.builtInAgent} /> : null}
                          {row.builtInAgent ? <Badge variant="outline">{t("Built-in")}</Badge> : row.readonly ? <Badge variant="outline">{t("Plugin")}</Badge> : null}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={`${rowSourceLabel}: ${row.ruleId}`}>
                          {rowSourceLabel}: {row.ruleId}
                        </div>
                      </div>
                      <div className="min-w-0">
                        {!row.builtInAgent ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge variant="outline">{t(row.typeLabel)}</Badge>
                            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={row.condition}>
                              {row.condition}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" title={row.builtInAgent ? undefined : rowTarget}>
                        {row.builtInAgent ? null : rowTarget}
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        <Tooltip
                          aria-label={toggleDisabledReason}
                          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                          content={toggleDisabledReason ?? ""}
                          contentClassName="w-[240px] px-2.5 py-2 text-left font-medium leading-4"
                          disabled={!toggleDisabledReason}
                          side="left"
                          tabIndex={toggleDisabledReason ? 0 : undefined}
                        >
                          <Toggle
                            checked={row.enabled}
                            disabled={row.readonly || row.toggleDisabled}
                            onChange={(enabled) => {
                              if (row.builtInAgent) {
                                updateBuiltInRule(row.builtInAgent, { enabled });
                              } else if (row.index !== undefined) {
                                updateRule(row.index, { enabled });
                              }
                            }}
                          />
                        </Tooltip>
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        {!row.builtInAgent ? (
                          <>
                            <Button aria-label={`${t("Move")} ${row.name || t("rule")} ${t("up")}`} disabled={row.readonly || row.index === undefined || row.index === 0} onClick={() => row.index !== undefined && moveRule(row.index, -1)} size="iconSm" title={t("Move up")} type="button" variant="ghost">
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button aria-label={`${t("Move")} ${row.name || t("rule")} ${t("down")}`} disabled={row.readonly || row.index === undefined || row.index === row.ruleCount - 1} onClick={() => row.index !== undefined && moveRule(row.index, 1)} size="iconSm" title={t("Move down")} type="button" variant="ghost">
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              aria-label={`${t("Edit")} ${row.name || t("rule")}`}
                              disabled={row.readonly || row.index === undefined}
                              onClick={() => {
                                if (row.index !== undefined) {
                                  editRule(row.index);
                                }
                              }}
                              size="iconSm"
                              title={t("Edit rule")}
                              type="button"
                              variant="ghost"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button aria-label={`${t("Remove")} ${row.name || t("rule")}`} disabled={row.readonly || row.index === undefined} onClick={() => row.index !== undefined && removeRule(row.index)} size="iconSm" title={t("Remove rule")} type="button" variant="ghost">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                      </AnimatedListItem>
                    );
                  })}
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

function BuiltInRouteInfoIcon({ agent }: { agent: RouterBuiltInAgentRuleId }) {
  const t = useAppText();
  const copy = useContext(AppI18nContext);
  const description = builtInRouteDescription(agent, t);
  const docsUrl = builtInRouteDocsUrl(agent, copy === appCopy.zh ? "zh" : "en");

  return (
    <Tooltip
      aria-label={description}
      className="h-5 w-5 items-center justify-center rounded-full text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      content={(
        <>
          <span>{description}</span>
          <a
            className="ml-1 inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            href={docsUrl}
            onClick={(event) => {
              event.preventDefault();
              openExternalUrl(docsUrl);
            }}
            rel="noreferrer"
            target="_blank"
          >
            {t("Docs")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </>
      )}
      contentClassName="w-[232px] px-2.5 py-2 text-left font-medium leading-4"
      interactive
      side="right"
      tabIndex={0}
    >
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
    </Tooltip>
  );
}

function builtInRouteDescription(agent: RouterBuiltInAgentRuleId, t: (value: string) => string): string {
  return agent === "claude-code"
    ? t("Identifies the Claude Code user-agent to provide deep Claude Code integration.")
    : t("Identifies the Codex user-agent to provide deep Codex integration.");
}

function builtInRouteDocsUrl(agent: RouterBuiltInAgentRuleId, language: "en" | "zh"): string {
  const path = language === "zh" ? "/configuration/routing" : "/en/configuration/routing";
  const hash = agent === "claude-code" ? "claude-code" : "codex";
  return `https://ccrdesk.top${path}#${hash}`;
}

function openExternalUrl(url: string) {
  if (window.ccr?.openExternal) {
    void window.ccr.openExternal(url).catch(() => undefined);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function RouterFallbackControl({
  className,
  fallback,
  label,
  onChange,
  providers
}: {
  className?: string;
  fallback: RouterFallbackConfig;
  label: string;
  onChange: (fallback: RouterFallbackConfig) => void;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const [fallbackModelDraft, setFallbackModelDraft] = useState("");
  const modelOptions = useMemo(() => createRouteModelOptions(providers), [providers]);
  const fallbackModeOptions = translateOptions(routerFallbackModeOptions, t);

  function updateFallbackPatch(patch: Partial<RouterFallbackConfig>) {
    onChange(normalizeRouterFallbackConfig({
      ...fallback,
      ...patch
    }));
  }

  function addFallbackModel() {
    const model = fallbackModelDraft.trim();
    if (!model) {
      return;
    }
    updateFallbackPatch({ models: uniqueStrings([...fallback.models, model]) });
    setFallbackModelDraft("");
  }

  function moveFallbackModel(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fallback.models.length) {
      return;
    }
    const models = [...fallback.models];
    const [model] = models.splice(index, 1);
    models.splice(nextIndex, 0, model);
    updateFallbackPatch({ models });
  }

  function removeFallbackModel(index: number) {
    updateFallbackPatch({ models: fallback.models.filter((_, modelIndex) => modelIndex !== index) });
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(180px,220px)_minmax(120px,160px)_1fr]">
        <Field label={label}>
          <SelectControl
            onChange={(mode) => updateFallbackPatch({ mode: mode as RouterFallbackMode })}
            options={fallbackModeOptions}
            value={fallback.mode}
          />
        </Field>
        {fallback.mode === "retry" ? (
          <Field label={t("Retries")}>
            <Input
              max={ROUTER_FALLBACK_MAX_RETRY_COUNT}
              min={0}
              onChange={(event) => updateFallbackPatch({ retryCount: clampNumber(Number(event.target.value), 0, ROUTER_FALLBACK_MAX_RETRY_COUNT) })}
              type="number"
              value={String(fallback.retryCount)}
            />
          </Field>
        ) : null}
        {fallback.mode === "model-chain" ? (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:col-span-2">
            <Field label={t("Fallback target")}>
              <RouteTargetControl
                modelOptions={modelOptions}
                onChange={setFallbackModelDraft}
                value={fallbackModelDraft}
              />
            </Field>
            <Button disabled={!fallbackModelDraft.trim()} onClick={addFallbackModel} type="button">
              <Plus className="h-4 w-4" />
              {t("Add")}
            </Button>
          </div>
        ) : null}
      </div>
      {fallback.mode === "model-chain" ? (
        <div className="mt-3 flex min-w-0 flex-wrap gap-2">
          {fallback.models.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">{t("No fallback targets configured")}</div>
          ) : (
            fallback.models.map((model, index) => (
              <div className="flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-1" key={`${model}-${index}`}>
                <span className="min-w-0 truncate font-mono text-[11px]" title={model}>{model}</span>
                <Button aria-label={`${t("Move")} ${model} ${t("up")}`} disabled={index === 0} onClick={() => moveFallbackModel(index, -1)} size="iconSm" title={t("Move up")} type="button" variant="ghost">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button aria-label={`${t("Move")} ${model} ${t("down")}`} disabled={index === fallback.models.length - 1} onClick={() => moveFallbackModel(index, 1)} size="iconSm" title={t("Move down")} type="button" variant="ghost">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button aria-label={`${t("Remove")} ${model}`} onClick={() => removeFallbackModel(index)} size="iconSm" title={t("Remove")} type="button" variant="ghost">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function DeleteRoutingRuleDialog({
  onClose,
  onConfirm,
  rule
}: {
  onClose: () => void;
  onConfirm: () => void;
  rule: RouterRule;
}) {
  const t = useAppText();
  const name = rule.name || t("Unnamed rule");
  const condition = formatRouterRuleCondition(rule);
  const target = formatRouterRuleTarget(rule);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Delete Routing Rule")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <div className="flex items-start gap-2 text-[12px] font-medium text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("Delete this routing rule from the configuration?")}</span>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <div className="truncate" title={name}>
                <span className="font-medium text-foreground">{t("Name")}:</span> {name}
              </div>
              <div className="truncate" title={condition}>
                <span className="font-medium text-foreground">{t("Condition")}:</span> {condition}
              </div>
              <div className="truncate" title={target}>
                <span className="font-medium text-foreground">{t("Request action")}:</span> {target}
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

export function AddRoutingRuleDialog({
  canSubmit,
  draft,
  mode,
  onChange,
  onClose,
  onSubmit,
  providers
}: {
  canSubmit: boolean;
  draft: AddRoutingRuleDraft;
  mode: "add" | "edit";
  onChange: (patch: Partial<AddRoutingRuleDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const copy = useContext(AppI18nContext);
  const conditionSourceOptions = translateOptions(routerConditionSourceOptions, t);
  const rewriteOperationOptions = translateOptions(routerRewriteOperationOptions, t);
  const ruleTypeOptions = translateOptions(routerRuleTypeOptions, t);
  const [scriptBusy, setScriptBusy] = useState<"submit" | "test" | "validate">();
  const [scriptMessage, setScriptMessage] = useState<{ ok: boolean; text: string }>();
  const scriptFileInputRef = useRef<HTMLInputElement>(null);
  const [scriptSample, setScriptSample] = useState(`{
  "headers": {
    "x-tenant-id": "demo"
  },
  "body": {
    "model": "claude-sonnet-4-5",
    "messages": [{ "role": "user", "content": "hello" }]
  },
  "method": "POST",
  "url": "/v1/messages"
}`);

  function addRewrite() {
    onChange({ rewrites: [...draft.rewrites, createRoutingRewriteDraftRow()] });
  }

  function updateRewrite(index: number, patch: Partial<AddRoutingRuleDraft["rewrites"][number]>) {
    onChange({
      rewrites: draft.rewrites.map((rewrite, rewriteIndex) =>
        rewriteIndex === index ? { ...rewrite, ...patch } : rewrite
      )
    });
  }

  function removeRewrite(index: number) {
    onChange({ rewrites: draft.rewrites.filter((_, rewriteIndex) => rewriteIndex !== index) });
  }

  function scriptFromDraft(): RouterRuleScript {
    return {
      apiVersion: ROUTER_SCRIPT_API_VERSION,
      file: draft.scriptFile.trim(),
      language: "javascript",
      timeoutMs: Number(draft.scriptTimeoutMs)
    };
  }

  function selectScriptFile(file: File | undefined) {
    if (!file) return;
    const filePath = window.ccr?.getFilePath?.(file);
    if (!filePath) {
      setScriptMessage({ ok: false, text: t("Selecting a local script file requires CCR Desktop. Enter the server-local path manually when using the web UI.") });
      return;
    }
    onChange({ scriptFile: filePath });
    setScriptMessage(undefined);
  }

  async function validateScript(action: "submit" | "validate" = "validate"): Promise<boolean> {
    setScriptBusy(action);
    setScriptMessage(undefined);
    try {
      const ccr = window.ccr;
      if (!ccr) throw new Error(t("Gateway API is unavailable"));
      const result = await ccr.validateRouteScript({ script: scriptFromDraft() });
      const message = result.ok
        ? t("Script validation passed")
        : result.diagnostics.map((diagnostic) => diagnostic.message).join("\n");
      setScriptMessage({ ok: result.ok, text: message });
      if (result.ok && action === "submit") onSubmit();
      return result.ok;
    } catch (error) {
      setScriptMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
      return false;
    } finally {
      setScriptBusy(undefined);
    }
  }

  async function testScript() {
    setScriptBusy("test");
    setScriptMessage(undefined);
    try {
      const ccr = window.ccr;
      if (!ccr) throw new Error(t("Gateway API is unavailable"));
      const parsed = JSON.parse(scriptSample) as unknown;
      const request = normalizeRouteScriptSampleRequest(parsed);
      const result = await ccr.testRouteScript({ request, script: scriptFromDraft() });
      const details = result.ok
        ? `${result.matched ? t("Matched") : t("Not matched")} · ${Math.round(result.durationMs ?? 0)}ms${result.output === undefined ? "" : `\n${JSON.stringify(result.output, null, 2)}`}`
        : result.diagnostics.map((diagnostic) => diagnostic.message).join("\n");
      setScriptMessage({ ok: result.ok, text: details });
    } catch (error) {
      setScriptMessage({ ok: false, text: error instanceof Error ? t(error.message) : String(error) });
    } finally {
      setScriptBusy(undefined);
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{mode === "edit" ? t("Edit Routing Rule") : t("Add Routing Rule")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-2" layout="position" transition={disclosureSpringTransition}>
            <Field className="sm:col-span-2" label={t("Name")}>
              <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
            </Field>
            <Field className="sm:col-span-2" label={t("Rule type")}>
              <SelectControl
                onChange={(type) => onChange({
                  type: type as AddRoutingRuleDraft["type"],
                  ...(type === "script" && draft.name === "Condition" ? { name: "Node.js script" } : {}),
                  ...(type === "condition" && draft.name === "Node.js script" ? { name: "Condition" } : {}),
                  ...(type === "script"
                    ? { rewrites: [] }
                    : draft.rewrites.length === 0
                      ? { rewrites: [createRoutingRewriteDraftRow()] }
                      : {})
                })}
                options={ruleTypeOptions}
                value={draft.type}
              />
            </Field>
            {draft.type === "condition" ? <Field className="sm:col-span-2" label={t("Condition")}>
              <div className="rounded-md border border-border bg-muted/20 p-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_minmax(0,1fr)_112px_minmax(0,1fr)]">
                  <SelectControl
                    onChange={(source) => onChange({ conditionSource: source as AddRoutingRuleDraft["conditionSource"] })}
                    options={conditionSourceOptions}
                    value={draft.conditionSource}
                  />
                  <Input
                    className="font-mono text-[12px]"
                    onChange={(event) => onChange({ conditionField: event.target.value })}
                    placeholder={draft.conditionSource.endsWith(".header") ? "x-api-key" : "model"}
                    value={draft.conditionField}
                  />
                  <SelectControl
                    onChange={(operator) => onChange({ conditionOperator: operator as AddRoutingRuleDraft["conditionOperator"] })}
                    options={routerRuleOperatorOptions}
                    value={draft.conditionOperator}
                  />
                  <Input
                    className="font-mono text-[12px]"
                    onChange={(event) => onChange({ conditionRight: event.target.value })}
                    placeholder={t("Value")}
                    value={draft.conditionRight}
                  />
                </div>
              </div>
            </Field> : (
              <>
                <div className="sm:col-span-2 min-w-0 space-y-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("Node.js route script file")}
                    </span>
                    <a
                      className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                      href={routeScriptDocsUrl(copy === appCopy.zh ? "zh" : "en")}
                      onClick={(event) => {
                        event.preventDefault();
                        openExternalUrl(routeScriptDocsUrl(copy === appCopy.zh ? "zh" : "en"));
                      }}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t("Docs")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex min-w-0 gap-2">
                    <Input
                      aria-label={t("Node.js route script file")}
                      className="min-w-0 flex-1 font-mono text-[12px]"
                      onChange={(event) => onChange({ scriptFile: event.target.value })}
                      placeholder="/path/to/route-script.js"
                      value={draft.scriptFile}
                    />
                    <Button onClick={() => scriptFileInputRef.current?.click()} type="button" variant="outline">
                      <FolderOpen className="h-4 w-4" />
                      {t("Choose file")}
                    </Button>
                    <input
                      accept=".js,.mjs,.cjs,text/javascript,application/javascript"
                      className="hidden"
                      onChange={(event) => {
                        selectScriptFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                      ref={scriptFileInputRef}
                      type="file"
                    />
                  </div>
                </div>
                <Field label={t("Timeout (ms)")}>
                  <Input
                    inputMode="numeric"
                    max={30000}
                    min={10}
                    onChange={(event) => onChange({ scriptTimeoutMs: event.target.value })}
                    type="number"
                    value={draft.scriptTimeoutMs}
                  />
                </Field>
                <Field className="sm:col-span-2" label={t("Test request JSON")}>
                  <Textarea
                    className="min-h-36 resize-y font-mono text-[12px]"
                    onChange={(event) => setScriptSample(event.target.value)}
                    spellCheck={false}
                    value={scriptSample}
                  />
                </Field>
                <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                  <Button disabled={Boolean(scriptBusy)} onClick={() => void validateScript()} type="button" variant="outline">
                    {t("Validate")}
                  </Button>
                  <Button disabled={Boolean(scriptBusy)} onClick={() => void testScript()} type="button" variant="outline">
                    {t("Test script")}
                  </Button>
                </div>
                {scriptMessage ? (
                  <pre className={cn(
                    "sm:col-span-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border px-3 py-2 text-xs",
                    scriptMessage.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "border-destructive/30 bg-destructive/10 text-destructive"
                  )}>
                    {scriptMessage.text}
                  </pre>
                ) : null}
              </>
            )}
            {draft.type === "condition" ? <Field className="sm:col-span-2" label={t("Rewrite request parameters")}>
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2">
                {draft.rewrites.map((rewrite, index) => (
                  <div
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_32px]"
                    key={rewrite.id}
                  >
                    <SelectControl
                      onChange={(operation) => updateRewrite(index, { operation: operation as AddRoutingRuleDraft["rewrites"][number]["operation"] })}
                      options={rewriteOperationOptions}
                      value={rewrite.operation}
                    />
                    <Input
                      className="font-mono text-[12px]"
                      onChange={(event) => updateRewrite(index, { key: event.target.value })}
                      placeholder="request.body.model"
                      value={rewrite.key}
                    />
                    {rewrite.operation === "delete" ? (
                      <div className="h-9 rounded-md border border-dashed border-border bg-background/40" />
                    ) : rewrite.operation === "array-replace" ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Input
                          className="font-mono text-[12px]"
                          onChange={(event) => updateRewrite(index, { match: event.target.value })}
                          placeholder={t("Match value")}
                          value={rewrite.match}
                        />
                        <Input
                          className="font-mono text-[12px]"
                          onChange={(event) => updateRewrite(index, { value: event.target.value })}
                          placeholder={t("Value")}
                          value={rewrite.value}
                        />
                      </div>
                    ) : (
                      <Input
                        className="font-mono text-[12px]"
                        onChange={(event) => updateRewrite(index, { value: event.target.value })}
                        placeholder={rewrite.operation === "set" ? "glm-5.2" : t("Value")}
                        value={rewrite.value}
                      />
                    )}
                    <Button
                      aria-label={t("Remove")}
                      disabled={draft.rewrites.length <= 1}
                      onClick={() => removeRewrite(index)}
                      size="iconSm"
                      title={t("Remove")}
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button onClick={addRewrite} type="button" variant="outline">
                  <Plus className="h-4 w-4" />
                  {t("Add parameter")}
                </Button>
              </div>
            </Field> : null}
            <Field label={t("Enabled")}>
              <Toggle checked={draft.enabled} onChange={(enabled) => onChange({ enabled })} />
            </Field>
            <RouterFallbackControl
              className="sm:col-span-2"
              fallback={draft.fallback}
              label={t("On failure")}
              onChange={(fallback) => onChange({ fallback })}
              providers={providers}
            />
          </motion.div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button
            disabled={!canSubmit || Boolean(scriptBusy)}
            onClick={() => draft.type === "script" ? void validateScript("submit") : onSubmit()}
            type="button"
          >
            {mode === "edit" ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {mode === "edit" ? t("Save") : t("Add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function routeScriptDocsUrl(language: "en" | "zh"): string {
  const path = language === "zh" ? "/configuration/routing" : "/en/configuration/routing";
  const section = language === "zh"
    ? "#nodejs-%E8%84%9A%E6%9C%AC%E8%A7%84%E5%88%99"
    : "#nodejs-script-rules";
  return `https://ccrdesk.top${path}${section}`;
}
