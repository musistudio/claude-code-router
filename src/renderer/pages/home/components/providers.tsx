import {
  AddProviderDraft, AnimatedDisclosure, AnimatedIconSwap, AnimatedListItem, AnimatedPopover, AnimatePresence, AppConfig, Badge,
  Box, Braces, Button, Card, CardContent, CardHeader, CardTitle,
  Check, Checkbox, ChevronDown, ChevronRight, CircleAlert, cn,
  compareProviderAccountSnapshots, Copy, copyTextToClipboard, createDefaultProviderAccountDraft, createModelCatalogItems, createProviderAccountDraftFromConfig, createProviderCredentialDraft, createProviderInstallLinkFromDraft,
  customProviderPresetId, defaultProviderAccountConfigForPreset, Dialog, DialogBody, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, ExternalLink, Field, findProviderPreset, formatProviderAccountMeterValue, GatewayProviderConfig,
  GatewayProviderProbeResult, getProviderPresets, Globe, inferProviderNameFromBaseUrl, Input, KeyValueRowsControl, Label,
  Layers3, LoaderCircle, localAgentProviderIconUrls, mergeProviderModelLists, modelCatalogItemMatchesQuery, motion,
  Pencil, Plus, PopoverContent, primaryProviderAccountMeter, primaryProviderPresetEndpoint,
  providerAccountConnectorApiKeySafetyIssue, providerAccountConnectorExample, ProviderAccountDraftMode, providerAccountModeOptions, ProviderAccountSnapshot,
  providerAccountSnapshotCredentialLabel, providerAccountSnapshotLabel, ProviderAccountTestPath,
  ProviderAccountTestResult, providerBaseUrl, providerCapabilitiesSummary, ProviderCredentialDraft, ProviderDeepLinkPayload, ProviderDeepLinkRequest, providerDraftSafetyIssue, providerCredentialDraftPatchFromJson, providerHttpJsonConnectorFromDraft,
  ProviderConnectivityCheckReport, providerDeepLinkDisplayIcon, providerListItemKey, providerMatchesQuery, ProviderPreset, providerPresetIconUrls, providerProbeHasSupportedProtocol,
  providerModelDisplayName, providerModelDisplayTitle, providerSelectableProtocolsFromProbe, providerUsageFieldPatch, ProviderUsageFieldTarget, providerUsageMethodOptions, Search, SelectControl,
  resolveProviderDeepLinkPreset, ShieldCheck, splitLines, splitModelTagInput, Switch, Textarea, translatedProviderProtocolLabel, translateOptions,
  translateProbeProtocolMessage, Trash2, uniqueProviderName, uniqueProviderProtocols, useAppErrorText, useAppText, useEffect, useMemo,
  useRef, useState, X, isPlainRecord
} from "../shared";
import { providerUrlWithDefaultScheme } from "../../../../shared/provider-url";
import type { LocalAgentProviderCandidate } from "../../../../shared/app";
export function ProvidersView({ accountSnapshots, addProvider, editProvider, notify, providers, removeProvider }: {
  accountSnapshots: ProviderAccountSnapshot[];
  addProvider: () => void;
  editProvider: (index: number) => void;
  notify: (message: string) => void;
  providers: Array<{ provider: GatewayProviderConfig; index: number }>;
  removeProvider: (index: number) => void;
}) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => new Set());
  const normalizedQuery = query.trim().toLowerCase();
  const visibleProviders = useMemo(
    () => providers.filter(({ provider }) => providerMatchesQuery(provider, normalizedQuery)),
    [normalizedQuery, providers]
  );
  const accountSnapshotsByProvider = useMemo(() => {
    const grouped = new Map<string, ProviderAccountSnapshot[]>();
    for (const snapshot of accountSnapshots) {
      const items = grouped.get(snapshot.provider) ?? [];
      items.push(snapshot);
      grouped.set(snapshot.provider, items);
    }
    return grouped;
  }, [accountSnapshots]);

  function toggleProvider(provider: GatewayProviderConfig, index: number) {
    const key = providerListItemKey(provider, index);
    setExpandedProviders((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function copyModel(model: string) {
    await copyTextToClipboard(model);
    notify(`${t("Copied")} ${model}`);
  }

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
              aria-label={t("Search providers")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search providers")}
              value={query}
            />
          </div>
          <Button aria-label={t("Add provider")} onClick={addProvider} title={t("Add provider")} type="button">
            <Plus className="h-4 w-4" />
            {t("Add")}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {providers.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <Layers3 className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[12px] text-muted-foreground">{t("No providers configured")}</div>
              <div className="mt-1 text-[11px] text-muted-foreground/60">{t("Click Add to create one")}</div>
            </div>
          ) : null}
          {providers.length > 0 && visibleProviders.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching providers")}</div>
          ) : null}
          {visibleProviders.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[1080px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(160px,0.8fr)_minmax(220px,1fr)_minmax(160px,0.7fr)_minmax(150px,0.65fr)_80px_84px] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Name")}</div>
                  <div className="truncate">{t("Base URL")}</div>
                  <div className="truncate">{t("Capability")}</div>
                  <div className="truncate">{t("Account")}</div>
                  <div className="truncate">{t("Models")}</div>
                  <div aria-hidden="true" />
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                  {visibleProviders.map(({ provider, index }) => {
                    const itemKey = providerListItemKey(provider, index);
                    const expanded = expandedProviders.has(itemKey);
                      const providerAccountSnapshots = accountSnapshotsByProvider.get(provider.name) ?? [];
                    return (
                      <AnimatedListItem key={itemKey}>
                        <div
                          className="grid min-h-[58px] cursor-pointer grid-cols-[minmax(160px,0.8fr)_minmax(220px,1fr)_minmax(160px,0.7fr)_minmax(150px,0.65fr)_80px_84px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                          onClick={() => toggleProvider(provider, index)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleProvider(provider, index);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <button
                              aria-expanded={expanded}
                              aria-label={`${expanded ? t("Collapse") : t("Expand")} ${provider.name || t("provider")} ${t("models")}`}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleProvider(provider, index);
                              }}
                              title={expanded ? t("Collapse models") : t("Expand models")}
                              type="button"
                            >
                              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            <div className="min-w-0">
                              <div className="truncate text-[12px] font-semibold">{provider.name || t("Unnamed")}</div>
                            </div>
                          </div>
                          <div className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" title={providerBaseUrl(provider)}>
                            {providerBaseUrl(provider) || t("Not set")}
                          </div>
                          <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={providerCapabilitiesSummary(provider, t)}>
                            {providerCapabilitiesSummary(provider, t)}
                          </div>
                          <ProviderAccountListCell provider={provider} snapshots={providerAccountSnapshots} />
                          <div className="min-w-0">
                            <button
                              aria-expanded={expanded}
                              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleProvider(provider, index);
                              }}
                              title={expanded ? t("Collapse models") : t("Expand models")}
                              type="button"
                            >
                              <Badge variant={provider.models.length > 0 ? "outline" : "warning"}>{provider.models.length}</Badge>
                            </button>
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              aria-label={`${t("Edit")} ${provider.name || t("provider")}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                editProvider(index);
                              }}
                              size="iconSm"
                              title={t("Edit provider")}
                              type="button"
                              variant="ghost"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              aria-label={`${t("Remove")} ${provider.name || t("provider")}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                removeProvider(index);
                              }}
                              size="iconSm"
                              title={t("Remove provider")}
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <AnimatePresence initial={false}>
                          {expanded ? (
                            <AnimatedDisclosure key="provider-models">
                              <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
                                {provider.capabilities?.length ? (
                                  <div className="mb-3 flex flex-wrap gap-2">
                                    {provider.capabilities.map((capability) => (
                                      <Badge key={`${capability.type}:${capability.baseUrl}`} variant="secondary">
                                        {translatedProviderProtocolLabel(capability.type, t)}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : null}
                                {provider.models.length === 0 ? (
                                  <div className="rounded-md border border-dashed border-border bg-background/60 px-3 py-4 text-center text-[12px] text-muted-foreground">{t("No models configured")}</div>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {provider.models.map((model) => {
                                      const modelKey = `${itemKey}:${model}`;
                                      const displayName = providerModelDisplayName(provider, model);
                                      return (
                                        <button
                                          aria-label={`${t("Double click to copy")} ${displayName}`}
                                          className="inline-flex max-w-full items-center rounded-full border border-border bg-background px-2.5 py-1 text-[11px] leading-4 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                                          key={modelKey}
                                          onDoubleClick={() => void copyModel(model)}
                                          title={`${providerModelDisplayTitle(provider, model)} · ${t("Double click to copy")}`}
                                          type="button"
                                        >
                                          <span className="min-w-0 truncate">{displayName}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </AnimatedDisclosure>
                          ) : null}
                        </AnimatePresence>
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

export function ModelsView({ config }: { config: AppConfig }) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => createModelCatalogItems(config), [config]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = useMemo(
    () => rows.filter((row) => modelCatalogItemMatchesQuery(row, normalizedQuery)),
    [normalizedQuery, rows]
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 min-w-0 flex-col"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col">
        <CardHeader className="flex-row flex-wrap items-center gap-2">
          <div className="min-w-[180px] flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <CardTitle className="min-w-0">{t("Models")}</CardTitle>
            </div>
          </div>
          <div className="relative w-[320px] max-w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search all models")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search all models")}
              value={query}
            />
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {rows.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <Box className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[12px] text-muted-foreground">{t("No models available")}</div>
            </div>
          ) : null}
          {rows.length > 0 && visibleRows.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching models")}</div>
          ) : null}
          {visibleRows.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[360px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(0,1fr)] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Model")}</div>
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                    {visibleRows.map((row) => (
                      <AnimatedListItem
                        className="grid min-h-[48px] grid-cols-[minmax(0,1fr)] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                        key={row.key}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-foreground" title={row.displayName ?? row.model}>
                            {row.displayName ?? row.model}
                          </div>
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

function ProviderAccountListCell({ provider, snapshots }: { provider: GatewayProviderConfig; snapshots: ProviderAccountSnapshot[] }) {
  const t = useAppText();
  const sortedSnapshots = [...snapshots].sort(compareProviderAccountSnapshots);
  const snapshot = sortedSnapshots[0];
  const meter = snapshot ? primaryProviderAccountMeter(snapshot) : undefined;
  const fallbackText = snapshot ? snapshot.message ?? snapshot.errors?.[0]?.message : undefined;

  if (!provider.account?.enabled && snapshots.length === 0) {
    return <div className="min-w-0 truncate text-[11px] text-muted-foreground">{t("Disabled")}</div>;
  }

  if (!snapshot) {
    return <div className="min-w-0 truncate text-[11px] text-muted-foreground">{t("Pending")}</div>;
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
        {meter ? <span className="min-w-0 truncate text-[11px] font-medium">{formatProviderAccountMeterValue(meter)}</span> : null}
        {sortedSnapshots.length > 1 ? <span className="shrink-0 text-muted-foreground">{sortedSnapshots.length} {t("keys")}</span> : null}
      </div>
      {providerAccountSnapshotCredentialLabel(snapshot) ? (
        <div className="mt-0.5 truncate text-[10px] font-semibold text-muted-foreground" title={providerAccountSnapshotLabel(snapshot)}>
          {providerAccountSnapshotCredentialLabel(snapshot)}
        </div>
      ) : null}
      {!meter && fallbackText ? (
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {t(fallbackText)}
        </div>
      ) : null}
    </div>
  );
}

export function DeleteProviderDialog({
  onClose,
  onConfirm,
  provider
}: {
  onClose: () => void;
  onConfirm: () => void;
  provider: GatewayProviderConfig;
}) {
  const t = useAppText();
  const name = provider.name || t("Unnamed provider");
  const baseUrl = providerBaseUrl(provider);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Delete Provider")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <div className="flex items-start gap-2 text-[12px] font-medium text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("Delete this provider from the configuration?")}</span>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <div className="truncate">
                <span className="font-medium text-foreground">{t("Name")}:</span> {name}
              </div>
              <div className="truncate" title={baseUrl}>
                <span className="font-medium text-foreground">{t("Base URL")}:</span> {baseUrl || t("Not set")}
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

export function ProviderDeepLinkDialog({
  busy,
  error,
  iconLoading = false,
  modelsLoading = false,
  onClose,
  onSubmit,
  presetsLoaded = true,
  request
}: {
  busy: boolean;
  error: string;
  iconLoading?: boolean;
  modelsLoading?: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  presetsLoaded?: boolean;
  request: ProviderDeepLinkRequest;
}) {
  const t = useAppText();
  const provider = request.provider;
  const manifest = request.manifest;
  const displayName = provider ? provider.name?.trim() || inferProviderNameFromBaseUrl(provider.baseUrl) : "";
  const providerPreset = provider ? resolveProviderDeepLinkPreset(provider) : undefined;
  const showExternalProviderWarnings = Boolean(provider && presetsLoaded && !providerPreset);
  const providerIconUrl = provider ? providerDeepLinkDisplayIcon(provider) : "";
  const modelPreview = provider?.models.slice(0, 8) ?? [];
  const actionLoading = busy || Boolean(provider && (iconLoading || modelsLoading));

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[580px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{provider ? t("Import Provider") : manifest ? t("Import Provider Manifest") : t("Provider link failed")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} disabled={busy} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          {provider ? (
            <div className="space-y-3">
              {showExternalProviderWarnings ? (
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
                  <div className="flex items-start gap-2 text-[12px] font-medium text-foreground">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{t("External provider link")}</span>
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {t("This provider link came from an external website. Review details before importing.")}
                  </div>
                </div>
              ) : null}
              {showExternalProviderWarnings ? (
                <div className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{t("Only enter an API key issued for this endpoint. Official provider keys must only be used with official endpoints.")}</span>
                </div>
              ) : null}
              <div className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5">
                <div className="relative shrink-0">
                  <ProviderPresetIcon className="h-10 w-10 rounded-md" iconUrl={providerIconUrl} preset={providerPreset} />
                  {iconLoading ? (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background">
                      <LoaderCircle className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-foreground">{displayName}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={provider.baseUrl}>{provider.baseUrl}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
                <ProviderDeepLinkDetail label={t("Name")} value={displayName} />
                <ProviderDeepLinkDetail label={t("Protocol")} value={provider.protocol ? translatedProviderProtocolLabel(provider.protocol, t) : t("Detected automatically")} />
                <ProviderDeepLinkDetail className="sm:col-span-2" label={t("Base URL")} value={provider.baseUrl} mono />
                {manifest ? (
                  <ProviderDeepLinkDetail className="sm:col-span-2" label={t("Manifest URL")} value={manifest.url} mono />
                ) : null}
                {provider.source ? (
                  <ProviderDeepLinkDetail className="sm:col-span-2" label={t("Provider website")} value={provider.source} mono />
                ) : null}
                <ProviderDeepLinkDetail
                  label={t("API key")}
                  value={provider.apiKey ? t("API key included") : t("API key not included")}
                />
                <ProviderDeepLinkDetail
                  label={t("Fetch usage")}
                  value={provider.account?.enabled === false ? t("Disabled") : t("Enabled")}
                />
                <ProviderDeepLinkDetail
                  label={t("Models")}
                  value={provider.models.length > 0 ? String(provider.models.length) : t("Models will be detected automatically.")}
                />
              </div>

              {modelPreview.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {modelPreview.map((model) => (
                    <Badge key={model} variant="outline">
                      <span className="max-w-[210px] truncate" title={provider.modelDisplayNames?.[model] ?? model}>
                        {provider.modelDisplayNames?.[model] ?? model}
                      </span>
                    </Badge>
                  ))}
                  {provider.models.length > modelPreview.length ? (
                    <Badge variant="secondary">+{provider.models.length - modelPreview.length}</Badge>
                  ) : null}
                </div>
              ) : null}

            </div>
          ) : manifest ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
                <div className="flex items-start gap-2 text-[12px] font-medium text-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{t("Remote provider manifest")}</span>
                </div>
                <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {t("CCR will fetch this HTTPS manifest with strict safety checks before showing provider details.")}
                </div>
              </div>
              <ProviderDeepLinkDetail label={t("Manifest URL")} value={manifest.url} mono />
            </div>
          ) : (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <div className="flex items-start gap-2 text-[12px] font-medium text-destructive">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{request.error || t("Invalid")}</span>
              </div>
            </div>
          )}

          {error ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t(error)}</span>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button disabled={busy} onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          {provider || manifest ? (
            <Button disabled={actionLoading} onClick={() => void onSubmit()} type="button">
              <AnimatedIconSwap iconKey={actionLoading ? "busy" : "plus"}>
                {actionLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </AnimatedIconSwap>
              {actionLoading ? t("Loading") : provider ? t("Import") : t("Fetch manifest")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProviderDeepLinkDetail({
  className,
  label,
  mono = false,
  value
}: {
  className?: string;
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-md border border-border bg-background px-3 py-2", className)}>
      <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 min-w-0 truncate text-[12px] text-foreground", mono && "font-mono text-[11px]")} title={value}>
        {value}
      </div>
    </div>
  );
}

type ProviderPresetComboboxOption = {
  iconUrl?: string;
  label: string;
  preset?: ProviderPreset;
  value: string;
};

function ProviderPresetCombobox({
  onChange,
  options,
  value
}: {
  onChange: (value: string) => void;
  options: ProviderPresetComboboxOption[];
  value: string;
}) {
  const t = useAppText();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) => providerPresetOptionMatchesQuery(option, normalizedQuery))
    : options;

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
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
      window.clearTimeout(focusTimer);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function chooseOption(nextValue: string) {
    onChange(nextValue);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        aria-controls="provider-preset-options"
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
        <ProviderPresetIcon className="h-4 w-4 rounded-[4px]" iconUrl={selected?.iconUrl} preset={selected?.preset} />
        <span className="min-w-0 flex-1 truncate">{selected ? selected.label : t("Select preset provider")}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <AnimatedPopover className="absolute left-0 right-0 top-full z-50 mt-1">
            <PopoverContent className="overflow-hidden p-1">
              <div className="relative mb-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label={t("Filter")}
                  className="h-8 pl-8"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const first = filteredOptions[0];
                      if (first) {
                        chooseOption(first.value);
                      }
                    }
                  }}
                  placeholder={t("Filter")}
                  ref={inputRef}
                  value={query}
                />
              </div>
              <div className="max-h-[240px] overflow-auto" id="provider-preset-options" role="listbox">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => {
                    const selectedOption = option.value === value;
                    return (
                      <button
                        aria-selected={selectedOption}
                        className={cn(
                          "flex h-9 w-full min-w-0 items-center gap-2 rounded-[5px] px-2 text-left text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
                          selectedOption ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                        )}
                        key={option.value}
                        onClick={() => chooseOption(option.value)}
                        role="option"
                        type="button"
                      >
                        <ProviderPresetIcon className="h-5 w-5 rounded-[5px]" iconUrl={option.iconUrl} preset={option.preset} />
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {selectedOption ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-2 py-5 text-center text-[12px] text-muted-foreground">{t("No provider presets found")}</div>
                )}
              </div>
            </PopoverContent>
          </AnimatedPopover>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ProviderPresetIcon({ className, iconUrl: explicitIconUrl, preset }: { className?: string; iconUrl?: string; preset?: ProviderPreset }) {
  const [failed, setFailed] = useState(false);
  const resolvedIconUrl = explicitIconUrl || (preset ? providerPresetIconUrls[preset.id] : "");
  const iconUrl = !failed ? resolvedIconUrl : "";
  const label = preset?.name.trim().slice(0, 1).toUpperCase() || "";

  useEffect(() => {
    setFailed(false);
  }, [preset?.id, resolvedIconUrl]);

  if (iconUrl) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-border bg-background", className)}>
        <img
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setFailed(true)}
          src={iconUrl}
        />
      </span>
    );
  }

  return (
    <span className={cn("flex shrink-0 items-center justify-center border border-border bg-muted text-[10px] font-semibold text-muted-foreground", className)}>
      {label || <Globe className="h-3.5 w-3.5" />}
    </span>
  );
}

function ProviderImportHeader({
  draft,
  provider,
  preset
}: {
  draft: AddProviderDraft;
  provider: ProviderDeepLinkPayload;
  preset?: ProviderPreset;
}) {
  const t = useAppText();
  const baseUrl = draft.baseUrl.trim() || provider.baseUrl;
  const displayName = draft.name.trim() || provider.name?.trim() || inferProviderNameFromBaseUrl(baseUrl);
  const iconUrl = draft.icon.trim() || providerDeepLinkDisplayIcon(provider);
  const platformUrl = providerImportPlatformUrl(provider, baseUrl, preset);

  function openPlatform() {
    if (!platformUrl) {
      return;
    }
    if (window.ccr?.openExternal) {
      void window.ccr.openExternal(platformUrl).catch(() => undefined);
      return;
    }
    window.open(platformUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="sm:col-span-2 flex min-w-0 items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5">
      <ProviderPresetIcon className="h-10 w-10 rounded-md" iconUrl={iconUrl} preset={preset} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-foreground">{displayName}</div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={baseUrl}>{baseUrl}</div>
      </div>
      {platformUrl ? (
        <Button
          aria-label={t("Open provider website")}
          onClick={openPlatform}
          size="iconSm"
          title={t("Open provider website")}
          type="button"
          variant="ghost"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

function providerImportPlatformUrl(provider: ProviderDeepLinkPayload, baseUrl: string, preset: ProviderPreset | undefined): string | undefined {
  return normalizedHttpUrl(provider.source) ?? normalizedHttpUrl(preset?.websiteUrl) ?? providerBaseOrigin(baseUrl || provider.baseUrl);
}

function providerBaseOrigin(value: string): string | undefined {
  const url = normalizedHttpUrl(value);
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function normalizedHttpUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(providerUrlWithDefaultScheme(trimmed));
    if (!["http:", "https:"].includes(url.protocol)) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function providerPresetOptionMatchesQuery(
  option: ProviderPresetComboboxOption,
  query: string
): boolean {
  const preset = option.preset;
  const haystack = [
    option.label,
    option.value,
    preset?.id,
    preset?.name,
    ...(preset?.aliases ?? []),
    ...(preset?.endpoints.map((endpoint) => endpoint.baseUrl) ?? [])
  ].filter(Boolean).join("\n").toLowerCase();
  return haystack.includes(query);
}

function LocalAgentProviderImportPanel({
  mode,
  onChange,
  providerPlugins,
  providers
}: {
  mode: "add" | "edit";
  onChange: (patch: Partial<AddProviderDraft>, resetProbe?: boolean) => void;
  providerPlugins: unknown[];
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const formatError = useAppErrorText();
  const [candidates, setCandidates] = useState<LocalAgentProviderCandidate[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState("");

  useEffect(() => {
    if (mode !== "add" || !window.ccr?.getLocalAgentProviderCandidates) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void window.ccr.getLocalAgentProviderCandidates()
      .then((items) => {
        if (!cancelled) {
          setCandidates(items.filter((item) =>
            item.status !== "missing" &&
            !localAgentProviderAlreadyImported(item, providers, providerPlugins)
          ));
        }
      })
      .catch((scanError) => {
        if (!cancelled) {
          setError(formatError(scanError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, providerPlugins, providers]);

  if (mode !== "add" || (candidates.length === 0 && !error)) {
    return null;
  }

  async function importCandidate(candidate: LocalAgentProviderCandidate) {
    if (!window.ccr?.importLocalAgentProvider || !candidate.importable) {
      return;
    }
    setImportingId(candidate.id);
    setError("");
    try {
      const result = await window.ccr.importLocalAgentProvider({
        id: candidate.id,
        providerNames: providers.map((provider) => provider.name)
      });
      const accountDraft = createProviderAccountDraftFromConfig(result.provider.account);
      const protocol = result.provider.protocol ?? "openai_chat_completions";
      onChange({
        ...accountDraft,
        apiKey: result.provider.apiKey ?? "",
        baseUrl: result.provider.baseUrl,
        credentials: [],
        icon: result.provider.icon ?? "",
        modelDisplayNames: result.provider.modelDisplayNames,
        modelSearch: "",
        modelsText: result.provider.models.join("\n"),
        name: result.provider.name?.trim() || inferProviderNameFromBaseUrl(result.provider.baseUrl),
        presetId: customProviderPresetId,
        providerPlugins: result.providerPlugins,
        protocol,
        selectedModels: [],
        selectedProtocols: [protocol]
      }, true);
    } catch (importError) {
      setError(formatError(importError));
    } finally {
      setImportingId("");
    }
  }

  return (
    <div className="sm:col-span-2 rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-foreground">{t("Import local agent login")}</div>
          <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t("CCR scanned this computer for Claude Code, Codex, and ZCode login states. Click Import to add one as a gateway provider.")}</div>
        </div>
        {loading ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
      </div>

      {candidates.length > 0 ? (
        <div className="grid grid-cols-1 gap-2">
          {candidates.map((candidate) => {
            const iconUrl = localAgentProviderIconUrls[candidate.kind];
            const importing = importingId === candidate.id;
            return (
              <div
                className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2"
                key={candidate.id}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                    <img alt="" className="h-full w-full object-cover" draggable={false} src={iconUrl} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate text-[12px] font-semibold">{candidate.name}</span>
                      <Badge variant={candidate.importable ? "success" : candidate.status === "locked" ? "warning" : "outline"}>
                        {candidate.importable ? t("Ready") : candidate.status === "locked" ? t("Locked") : t("Not found")}
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={candidate.sourceFile || candidate.detail}>
                      {candidate.detail ? t(candidate.detail) : candidate.sourceFile || t("No local login state was found for this agent.")}
                    </div>
                  </div>
                </div>
                <Button
                  className="h-8 px-2"
                  disabled={!candidate.importable || Boolean(importingId)}
                  onClick={() => void importCandidate(candidate)}
                  type="button"
                  variant={candidate.importable ? "default" : "outline"}
                >
                  <AnimatedIconSwap iconKey={importing ? "importing" : "import"}>
                    {importing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  </AnimatedIconSwap>
                  {t("Import")}
                </Button>
              </div>
            );
          })}
        </div>
      ) : loading ? (
        <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-[12px] text-muted-foreground">
          {t("Scanning local agent logins")}
        </div>
      ) : null}

      {error ? (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t(error)}</span>
        </div>
      ) : null}
    </div>
  );
}

const localAgentProviderApiKey = "ccr-local-agent-login";
const localAgentProviderPluginSuffixes: Record<LocalAgentProviderCandidate["kind"], string[]> = {
  "claude-code": ["-claude-code-oauth", "-claude-code-oauth-internal"],
  codex: ["-codex-oauth", "-codex-oauth-internal"],
  zcode: ["-zcode-api-key", "-zcode-api-key-internal"]
};

function localAgentProviderAlreadyImported(
  candidate: LocalAgentProviderCandidate,
  providers: GatewayProviderConfig[],
  providerPlugins: unknown[]
): boolean {
  const suffixes = localAgentProviderPluginSuffixes[candidate.kind];
  const localProviderNames = new Set(providers
    .filter((provider) => provider.api_key === localAgentProviderApiKey)
    .flatMap((provider) => [
      provider.name,
      provider.type ? `${provider.name}::${provider.type}` : ""
    ])
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean));
  if (localProviderNames.size === 0) {
    return false;
  }

  const candidateProviderExists = providers.some((provider) =>
    provider.api_key === localAgentProviderApiKey &&
    provider.name.trim().toLowerCase().startsWith(candidate.name.toLowerCase())
  );
  if (candidateProviderExists) {
    return true;
  }

  return providerPlugins.some((plugin) => {
    const key = isPlainRecord(plugin) && typeof plugin.key === "string" ? plugin.key : "";
    const providerName = isPlainRecord(plugin) && typeof plugin.providerName === "string" ? plugin.providerName : "";
    return (
      key.startsWith("ccr-local-agent-") &&
      suffixes.some((suffix) => key.endsWith(suffix)) &&
      localProviderNames.has(providerName.trim().toLowerCase())
    );
  });
}

export function AddProviderForm({
  draft,
  error,
  connectivityLoading = false,
  connectivityProbe,
  importProvider,
  mode,
  onCheck,
  onChange,
  onIconDetectingChange,
  probe,
  probeLoading,
  providerPlugins = [],
  providers
}: {
  connectivityLoading?: boolean;
  connectivityProbe?: GatewayProviderProbeResult;
  draft: AddProviderDraft;
  error: string;
  importProvider?: ProviderDeepLinkPayload;
  mode: "add" | "edit";
  onCheck?: () => Promise<unknown>;
  onChange: (patch: Partial<AddProviderDraft>, resetProbe?: boolean) => void;
  onIconDetectingChange?: (detecting: boolean) => void;
  probe?: GatewayProviderProbeResult;
  probeLoading: boolean;
  providerPlugins?: unknown[];
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const [advancedOpen, setAdvancedOpen] = useState(mode === "edit");
  const [iconDetecting, setIconDetecting] = useState(false);
  const iconDetectionRequestRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const hasModelCatalog = Boolean(probe?.models.length);
  const selectedPreset = findProviderPreset(draft.presetId);
  const customEndpoint = draft.presetId === customProviderPresetId;
  const importMode = Boolean(importProvider);
  const showBaseUrl = customEndpoint || mode === "edit";
  const detectedProtocol = probe?.detectedProtocol ?? draft.protocol;
  const detectedBaseUrl = probe?.normalizedBaseUrl || draft.baseUrl;
  const safetyIssue = providerDraftSafetyIssue(draft, detectedBaseUrl);
  const localAgentImport = draft.providerPlugins.length > 0;
  const providerPresetOptions = [
    { label: t("Select preset provider"), value: "" },
    ...getProviderPresets().map((preset) => ({ label: t(preset.name), preset, value: preset.id })),
    { iconUrl: draft.icon, label: t("Other / custom API endpoint"), value: customProviderPresetId }
  ];
  const selectableProtocols = providerSelectableProtocolsFromProbe(probe);
  const hasConnectivityCheckInputs = Boolean(
    !localAgentImport &&
    draft.baseUrl.trim() &&
    draft.apiKey.trim() &&
    mergeProviderModelLists(draft.selectedModels, splitLines(draft.modelsText)).length > 0
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onIconDetectingChange?.(iconDetecting);
    return () => {
      if (iconDetecting) {
        onIconDetectingChange?.(false);
      }
    };
  }, [iconDetecting, onIconDetectingChange]);

  useEffect(() => {
    const requestId = iconDetectionRequestRef.current + 1;
    iconDetectionRequestRef.current = requestId;
    setIconDetecting(false);

    const baseUrl = draft.baseUrl.trim();
    const ccr = window.ccr;
    if (!customEndpoint || !baseUrl || draft.icon || !ccr?.detectProviderIcon) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIconDetecting(true);
      void ccr.detectProviderIcon({ baseUrl })
        .then((result) => {
          if (iconDetectionRequestRef.current === requestId && result.icon) {
            onChangeRef.current({ icon: result.icon });
          }
        })
        .catch(() => {
          // Icon detection is optional; provider probing and saving should continue normally.
        })
        .finally(() => {
          if (iconDetectionRequestRef.current === requestId) {
            setIconDetecting(false);
          }
        });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [customEndpoint, draft.baseUrl, draft.icon]);

  function updatePreset(presetId: string) {
    if (!presetId) {
      onChange({
        ...createDefaultProviderAccountDraft(),
        baseUrl: "",
        icon: "",
        modelDisplayNames: undefined,
        modelSearch: "",
        presetId,
        providerPlugins: [],
        selectedModels: [],
        selectedProtocols: []
      }, true);
      return;
    }

    if (presetId === customProviderPresetId) {
      onChange({
        ...createDefaultProviderAccountDraft(),
        baseUrl: "",
        icon: "",
        modelDisplayNames: undefined,
        modelSearch: "",
        presetId,
        providerPlugins: [],
        selectedModels: [],
        selectedProtocols: []
      }, true);
      return;
    }

    const preset = findProviderPreset(presetId);
    const endpoint = preset ? primaryProviderPresetEndpoint(preset) : undefined;
    const generatedName = !draft.name.trim() || /^provider-\d+$/i.test(draft.name.trim());
    const accountDraft = createProviderAccountDraftFromConfig(defaultProviderAccountConfigForPreset(presetId));
    onChange({
      ...accountDraft,
      baseUrl: endpoint?.baseUrl ?? "",
      icon: "",
      modelDisplayNames: preset?.defaultModelDisplayNames,
      modelSearch: "",
      modelsText: draft.modelsText.trim() || preset?.defaultModels?.join("\n") || "",
      name: mode === "add" && preset && generatedName ? uniqueProviderName(providers, t(preset.name)) : draft.name,
      presetId,
      providerPlugins: [],
      protocol: endpoint?.protocols[0] ?? draft.protocol,
      selectedModels: [],
      selectedProtocols: uniqueProviderProtocols(preset?.endpoints.flatMap((item) => item.protocols) ?? endpoint?.protocols ?? [])
    }, true);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {importProvider ? (
          <ProviderImportHeader draft={draft} provider={importProvider} preset={selectedPreset} />
        ) : (
          <>
            <LocalAgentProviderImportPanel
              mode={mode}
              onChange={onChange}
              providerPlugins={[...providerPlugins, ...draft.providerPlugins]}
              providers={providers}
            />
            <Field label={t("Preset provider")}>
              <ProviderPresetCombobox
                value={draft.presetId}
                onChange={updatePreset}
                options={providerPresetOptions}
              />
            </Field>
          </>
        )}
        <Field label={t("Name")}>
          <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
        </Field>
        {showBaseUrl ? (
          <Field className="sm:col-span-2" label={t("API endpoint")}>
            <Input value={draft.baseUrl} onChange={(event) => onChange({ baseUrl: event.target.value, icon: "" }, true)} />
            {customEndpoint ? (
              <div className="flex min-h-4 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
                {iconDetecting ? <LoaderCircle className="h-3 w-3 shrink-0 animate-spin" /> : null}
                <span className="min-w-0">
                  {iconDetecting
                    ? t("Detecting icon")
                    : t("Enter API endpoint, API key, and at least one model to enable connectivity check.")}
                </span>
              </div>
            ) : null}
          </Field>
        ) : null}
        <Field className="sm:col-span-2" label={t("API key")}>
          <Input type="password" value={draft.apiKey} onChange={(event) => onChange({ apiKey: event.target.value }, true)} />
          <div className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
            <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{t("Only enter an API key issued for this endpoint. Official provider keys must only be used with official endpoints.")}</span>
          </div>
        </Field>
        {safetyIssue ? (
          <div className="sm:col-span-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-900 dark:text-amber-100">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{safetyIssue.message}</span>
          </div>
        ) : null}
        {selectedPreset && !showBaseUrl && !importMode ? (
          <div className="sm:col-span-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate" title={detectedBaseUrl}>{detectedBaseUrl}</span>
            </div>
          </div>
        ) : null}
        <Field className="sm:col-span-2" label={t("Models")}>
          {hasModelCatalog && probe ? (
            <div className="space-y-2">
              <ModelMultiSelect
                displayNames={draft.modelDisplayNames}
                models={probe.models}
                onQueryChange={(modelSearch) => onChange({ modelSearch })}
                onSelectedChange={(selectedModels) => onChange({ selectedModels })}
                query={draft.modelSearch}
                selected={draft.selectedModels}
              />
              <div className="space-y-1.5">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("Custom models")}</span>
                  <span className="shrink-0 text-[11px] font-medium leading-4 text-muted-foreground/75">{t("Press Enter to add")}</span>
                </div>
                <ModelTagInput
                  ariaLabel={t("Custom models")}
                  displayNames={draft.modelDisplayNames}
                  onChange={(models) => onChange({ modelsText: models.join("\n") })}
                  placeholder={t("Model name")}
                  value={splitLines(draft.modelsText)}
                />
              </div>
            </div>
          ) : (
            <ModelTagInput
              ariaLabel={t("Models")}
              displayNames={draft.modelDisplayNames}
              onChange={(models) => onChange({ modelsText: models.join("\n") }, true)}
              placeholder={t("Model name")}
              value={splitLines(draft.modelsText)}
            />
          )}
        </Field>
        <div className="sm:col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <div className="min-w-0 flex-1">
            {connectivityLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                {t("Checking connection")}
              </span>
            ) : localAgentImport ? (
              <span>{t("Local agent login will be connected after saving this provider.")}</span>
            ) : providerProbeHasSupportedProtocol(connectivityProbe) ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <Check className="h-3.5 w-3.5" />
                {t("Connection verified")}
              </span>
            ) : probeLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                {t("Detecting protocols")}
              </span>
            ) : providerProbeHasSupportedProtocol(probe) ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <Check className="h-3.5 w-3.5" />
                {t("Protocols detected")}
              </span>
            ) : probe?.detectedProtocol ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <Check className="h-3.5 w-3.5" />
                {t("Detected")}
              </span>
            ) : hasConnectivityCheckInputs ? (
              <span>{t("Click Check Connection to verify connectivity with a real model request.")}</span>
            ) : draft.baseUrl.trim() || draft.apiKey.trim() || splitLines(draft.modelsText).length > 0 || draft.selectedModels.length > 0 ? (
              <span>{t("Enter API endpoint, API key, and at least one model to enable connectivity check.")}</span>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {onCheck && hasConnectivityCheckInputs ? (
              <Button
                className="h-8 px-2"
                disabled={connectivityLoading || probeLoading}
                onClick={() => void onCheck()}
                type="button"
                variant="outline"
              >
                <AnimatedIconSwap iconKey={connectivityLoading ? "checking" : "check"}>
                  {connectivityLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                </AnimatedIconSwap>
                {t("Check Connection")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="sm:col-span-2">
          <button
            aria-expanded={advancedOpen}
            className="inline-flex min-w-0 items-center gap-2 border-0 bg-transparent p-0 text-[12px] font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
            onClick={() => setAdvancedOpen((value) => !value)}
            type="button"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} />
            <span>{t("Advanced settings")}</span>
          </button>
        </div>

        <AnimatePresence initial={false}>
          {advancedOpen ? (
            <AnimatedDisclosure className="sm:col-span-2" key="provider-advanced">
              <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-2">
                {selectedPreset && !customEndpoint && mode === "add" ? (
                  <Field className="sm:col-span-2" label={t("API endpoint")}>
                    <Input value={draft.baseUrl} onChange={(event) => onChange({ baseUrl: event.target.value }, true)} />
                  </Field>
                ) : null}
                <Field label={t("Detected compatibility")}>
                  <Input readOnly value={translatedProviderProtocolLabel(detectedProtocol, t)} />
                </Field>
                <Field label={t("Detected endpoint")}>
                  <Input readOnly value={detectedBaseUrl} />
                </Field>
                <ProviderCredentialSettings
                  draft={draft}
                  onChange={onChange}
                />
                <ProviderUsageSettings
                  customEndpoint={customEndpoint}
                  draft={draft}
                  onChange={onChange}
                  probe={probe}
                />
                <Field className="sm:col-span-2" label={t("Protocol details")}>
                  <div className="max-h-[128px] overflow-auto rounded-md border border-border bg-background p-2">
                    {probe?.protocols.length ? (
                      <div className="space-y-1.5">
                        {probe.protocols.map((item) => {
                          const selectable = item.supported && selectableProtocols.includes(item.protocol);
                          const checked = draft.selectedProtocols.includes(item.protocol);
                          return (
                            <div className="grid grid-cols-[20px_minmax(118px,0.7fr)_72px_minmax(0,1fr)] items-center gap-2 text-[11px]" key={`${item.protocol}-${item.endpoint}`}>
                              <Checkbox
                                aria-label={`${t("Add")} ${translatedProviderProtocolLabel(item.protocol, t)}`}
                                checked={checked}
                                disabled={!selectable}
                                onCheckedChange={() => {
                                  if (!selectable) {
                                    return;
                                  }
                                  onChange({
                                    selectedProtocols: checked
                                      ? draft.selectedProtocols.filter((protocol) => protocol !== item.protocol)
                                      : uniqueProviderProtocols([...draft.selectedProtocols, item.protocol])
                                  });
                                }}
                              />
                              <span className="truncate font-medium">{translatedProviderProtocolLabel(item.protocol, t)}</span>
                              <span className={cn("truncate", item.supported ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground")}>
                                {item.supported ? t("Available") : t("Unavailable")}
                              </span>
                              <span className="truncate text-muted-foreground" title={translateProbeProtocolMessage(item.message, t)}>{translateProbeProtocolMessage(item.message, t)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">
                        <span>{t("No protocol detection yet")}</span>
                      </div>
                    )}
                  </div>
                </Field>
              </div>
            </AnimatedDisclosure>
          ) : null}
        </AnimatePresence>
      </div>

      {error ? <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span></div> : null}
    </>
  );
}

function ProviderCredentialSettings({
  draft,
  onChange
}: {
  draft: AddProviderDraft;
  onChange: (patch: Partial<AddProviderDraft>, resetProbe?: boolean) => void;
}) {
  const t = useAppText();
  const formatError = useAppErrorText();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [importError, setImportError] = useState("");

  function addCredential() {
    onChange({
      credentials: [
        ...draft.credentials,
        createProviderCredentialDraft(draft.credentials.length)
      ]
    });
    setImportError("");
  }

  function updateCredential(index: number, patch: Partial<ProviderCredentialDraft>) {
    onChange({
      credentials: draft.credentials.map((credential, credentialIndex) =>
        credentialIndex === index ? { ...credential, ...patch } : credential
      )
    });
  }

  function removeCredential(index: number) {
    onChange({
      credentials: draft.credentials.filter((_, credentialIndex) => credentialIndex !== index)
    });
  }

  async function importCredentialFile(file: File | undefined) {
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const patch = providerCredentialDraftPatchFromJson(text);
      if (typeof patch === "string") {
        setImportError(formatError(new Error(patch)));
        return;
      }
      onChange(patch);
      setImportError("");
    } catch (error) {
      setImportError(formatError(error));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div className="sm:col-span-2 space-y-3 rounded-md border border-border bg-background/60 p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Label className="text-[12px] font-semibold">{t("Credential pool")}</Label>
          <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t("Configure multiple provider API keys for this supplier.")}</div>
        </div>
        <Label className="flex shrink-0 items-center gap-2 text-[12px] font-medium text-muted-foreground">
          <span>{t("Show credential settings")}</span>
          <Switch
            aria-label={t("Show credential settings")}
            checked={expanded}
            onCheckedChange={setExpanded}
          />
        </Label>
      </div>

      {expanded ? (
        <>
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
            <input
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => void importCredentialFile(event.target.files?.[0])}
              ref={fileInputRef}
              type="file"
            />
            <Button className="h-8 px-2" onClick={() => fileInputRef.current?.click()} type="button" variant="outline">
              <Braces className="h-3.5 w-3.5" />
              {t("Import JSON")}
            </Button>
            <Button className="h-8 px-2" onClick={addCredential} type="button" variant="outline">
              <Plus className="h-3.5 w-3.5" />
              {t("Add key")}
            </Button>
          </div>

          {draft.credentials.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-[12px] text-muted-foreground">
              {t("No provider credentials configured")}
            </div>
          ) : (
            <div className="space-y-2">
              {draft.credentials.map((credential, index) => (
                <ProviderCredentialRow
                  credential={credential}
                  index={index}
                  key={`credential-${index}`}
                  onChange={(patch) => updateCredential(index, patch)}
                  onRemove={() => removeCredential(index)}
                />
              ))}
            </div>
          )}

          {importError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t(importError)}</span>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ProviderCredentialRow({
  credential,
  index,
  onChange,
  onRemove
}: {
  credential: ProviderCredentialDraft;
  index: number;
  onChange: (patch: Partial<ProviderCredentialDraft>) => void;
  onRemove: () => void;
}) {
  const t = useAppText();
  const label = credential.name || `key-${index + 1}`;
  const [advancedOpen, setAdvancedOpen] = useState(
    () => Boolean(
      credential.limitsText.trim() ||
      credential.priority.trim() ||
      credential.weight.trim()
    )
  );

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_minmax(140px,0.75fr)_minmax(180px,1fr)_auto]">
        <div className="flex items-end pb-2">
          <Checkbox
            aria-label={`${t("Enable")} ${label}`}
            checked={credential.enabled}
            onCheckedChange={(enabled) => onChange({ enabled })}
          />
        </div>
        <Field label={t("Name")}>
          <Input value={credential.name} onChange={(event) => onChange({ name: event.target.value })} />
        </Field>
        <Field label={t("API key")}>
          <Input type="password" value={credential.apiKey} onChange={(event) => onChange({ apiKey: event.target.value })} />
        </Field>
        <div className="flex items-end justify-end">
          <Button aria-label={`${t("Remove")} ${label}`} onClick={onRemove} size="iconSm" title={t("Remove")} type="button" variant="ghost">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <Button
        aria-expanded={advancedOpen}
        className="mt-3 flex h-8 w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-left text-[12px] font-medium transition-colors hover:bg-muted/40"
        onClick={() => setAdvancedOpen((value) => !value)}
        type="button"
        unstyled
      >
        <span className="min-w-0 truncate">{t("Advanced key options")}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", advancedOpen && "rotate-180")} />
      </Button>
      <AnimatePresence initial={false}>
        {advancedOpen ? (
          <AnimatedDisclosure key="credential-row-advanced">
            <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
              <Field label={t("Priority")}>
                <Input min={1} placeholder={String(index + 1)} type="number" value={credential.priority} onChange={(event) => onChange({ priority: event.target.value })} />
              </Field>
              <Field label={t("Weight")}>
                <Input min={1} placeholder="1" type="number" value={credential.weight} onChange={(event) => onChange({ weight: event.target.value })} />
              </Field>
              <Field className="sm:col-span-2" label={t("Limits JSON")}>
                <Textarea
                  className="min-h-[76px] font-mono text-[11px]"
                  placeholder={`{\n  "rpm": 60,\n  "tpm": 100000\n}`}
                  value={credential.limitsText}
                  onChange={(event) => onChange({ limitsText: event.target.value })}
                />
              </Field>
            </div>
          </AnimatedDisclosure>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ProviderUsageSettings({
  customEndpoint,
  draft,
  onChange,
  probe
}: {
  customEndpoint: boolean;
  draft: AddProviderDraft;
  onChange: (patch: Partial<AddProviderDraft>, resetProbe?: boolean) => void;
  probe?: GatewayProviderProbeResult;
}) {
  const t = useAppText();
  const formatError = useAppErrorText();
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<ProviderAccountTestResult>();
  const [testError, setTestError] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const modeOptions = translateOptions(providerAccountModeOptions, t);

  useEffect(() => {
    setTestResult(undefined);
    setTestError("");
  }, [draft.accountMode, draft.usageRequestUrl, draft.usageRequestMethod]);

  useEffect(() => {
    if (!copiedLink) {
      return;
    }
    const timer = window.setTimeout(() => setCopiedLink(false), 1300);
    return () => window.clearTimeout(timer);
  }, [copiedLink]);

  async function testUsageRequest() {
    if (!window.ccr?.testProviderAccountConnector) {
      setTestError(t("Request failed."));
      return;
    }
    const connector = providerHttpJsonConnectorFromDraft(draft, { requireMeters: false });
    if (typeof connector === "string") {
      setTestError(formatError(new Error(connector)));
      return;
    }
    const safetyIssue = providerAccountConnectorApiKeySafetyIssue(connector, {
      apiKey: draft.apiKey,
      baseUrl: (probe?.normalizedBaseUrl || draft.baseUrl).trim(),
      providerName: draft.name.trim(),
      providerPresetId: draft.presetId
    });
    if (safetyIssue) {
      setTestError(formatError(new Error(safetyIssue.message)));
      return;
    }

    setTestLoading(true);
    setTestError("");
    try {
      const result = await window.ccr.testProviderAccountConnector({
        apiKey: draft.apiKey.trim(),
        baseUrl: draft.baseUrl.trim(),
        connector,
        providerName: draft.name.trim()
      });
      setTestResult(result);
    } catch (error) {
      setTestResult(undefined);
      setTestError(formatError(error));
    } finally {
      setTestLoading(false);
    }
  }

  async function copyProviderPluginLink() {
    const link = createProviderInstallLinkFromDraft(draft, probe);
    if (typeof link === "string" && link.startsWith("ccr://")) {
      await copyTextToClipboard(link);
      setCopiedLink(true);
      setTestError("");
      return;
    }
    setTestError(formatError(new Error(link)));
  }

  function selectPath(target: ProviderUsageFieldTarget, path: string) {
    onChange(providerUsageFieldPatch(target, path));
  }

  return (
    <div className="sm:col-span-2 space-y-3 rounded-md border border-border bg-background/60 p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <Label className="flex min-w-0 items-center gap-2 text-[12px] font-semibold">
          <Checkbox
            checked={draft.accountEnabled}
            onCheckedChange={(checked) => onChange({ accountEnabled: checked })}
          />
          <span className="min-w-0 truncate">{t("Fetch usage")}</span>
        </Label>
        <Button className="h-8 shrink-0 px-2" onClick={() => void copyProviderPluginLink()} type="button" variant="outline">
          <AnimatedIconSwap iconKey={copiedLink ? "copied" : "copy"}>
            {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </AnimatedIconSwap>
          {copiedLink ? t("Copied") : t("Copy provider plugin link")}
        </Button>
      </div>

      {draft.accountEnabled ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("Usage mode")}>
            <SelectControl
              onChange={(accountMode) => onChange({ accountMode: accountMode as ProviderAccountDraftMode })}
              options={modeOptions}
              value={draft.accountMode}
            />
          </Field>
          <Field label={t("Refresh interval ms")}>
            <Input
              min={30000}
              placeholder="300000"
              type="number"
              value={draft.accountRefreshIntervalMs}
              onChange={(event) => onChange({ accountRefreshIntervalMs: event.target.value })}
            />
          </Field>

          {draft.accountMode === "standard" ? (
            <div className="sm:col-span-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
              {t("Standard usage endpoint will try provider-hosted CCR account endpoints.")}
              {customEndpoint ? <span> {t("Switch to HTTP JSON request to configure method, URL, headers, body, and response fields.")}</span> : null}
            </div>
          ) : null}

          {draft.accountMode === "http-json" ? (
            <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("Method")}>
                <SelectControl
                  onChange={(usageRequestMethod) => onChange({ usageRequestMethod: usageRequestMethod as "GET" | "POST" })}
                  options={providerUsageMethodOptions}
                  value={draft.usageRequestMethod}
                />
              </Field>
              <Field label={t("Usage request URL")}>
                <Input
                  placeholder="https://api.vendor.com/account"
                  value={draft.usageRequestUrl}
                  onChange={(event) => onChange({ usageRequestUrl: event.target.value })}
                />
              </Field>
              <Field className="sm:col-span-2" label={t("Headers")}>
                <KeyValueRowsControl
                  addLabel={t("Add header")}
                  rows={draft.usageRequestHeaders}
                  onChange={(usageRequestHeaders) => onChange({ usageRequestHeaders })}
                />
              </Field>
              <Field className="sm:col-span-2" label={t("Body")}>
                <Textarea
                  className="min-h-[92px] font-mono text-[11px]"
                  placeholder={`{\n  "query": "usage"\n}`}
                  value={draft.usageRequestBodyText}
                  onChange={(event) => onChange({ usageRequestBodyText: event.target.value })}
                />
              </Field>

              <Field label={t("Balance remaining field")}>
                <Input placeholder="$.balance.remaining" value={draft.usageBalanceRemainingPath} onChange={(event) => onChange({ usageBalanceRemainingPath: event.target.value })} />
              </Field>
              <Field label={t("Balance total field")}>
                <Input placeholder="$.totalCredits" value={draft.usageBalanceLimitPath} onChange={(event) => onChange({ usageBalanceLimitPath: event.target.value })} />
              </Field>
              <Field label={t("Balance used field")}>
                <Input placeholder="$.totalUsage" value={draft.usageBalanceUsedPath} onChange={(event) => onChange({ usageBalanceUsedPath: event.target.value })} />
              </Field>
              <Field label={t("Balance unit")}>
                <Input placeholder="USD" value={draft.usageBalanceUnit} onChange={(event) => onChange({ usageBalanceUnit: event.target.value })} />
              </Field>
              <Field label={t("Subscription remaining field")}>
                <Input placeholder="$.subscription.remaining" value={draft.usageSubscriptionRemainingPath} onChange={(event) => onChange({ usageSubscriptionRemainingPath: event.target.value })} />
              </Field>
              <Field label={t("Subscription limit field")}>
                <Input placeholder="$.subscription.limit" value={draft.usageSubscriptionLimitPath} onChange={(event) => onChange({ usageSubscriptionLimitPath: event.target.value })} />
              </Field>
              <Field label={t("Subscription reset field")}>
                <Input placeholder="$.subscription.resetAt" value={draft.usageSubscriptionResetPath} onChange={(event) => onChange({ usageSubscriptionResetPath: event.target.value })} />
              </Field>
              <Field label={t("Subscription unit")}>
                <Input placeholder="tokens" value={draft.usageSubscriptionUnit} onChange={(event) => onChange({ usageSubscriptionUnit: event.target.value })} />
              </Field>
              <Field label={t("Status field")}>
                <Input placeholder="$.status" value={draft.usageStatusPath} onChange={(event) => onChange({ usageStatusPath: event.target.value })} />
              </Field>
              <Field label={t("Message field")}>
                <Input placeholder="$.message" value={draft.usageMessagePath} onChange={(event) => onChange({ usageMessagePath: event.target.value })} />
              </Field>

              <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                <Button disabled={testLoading} onClick={() => void testUsageRequest()} size="sm" type="button" variant="outline">
                  <AnimatedIconSwap iconKey={testLoading ? "testing" : "check"}>
                    {testLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  </AnimatedIconSwap>
                  {t("Test usage request")}
                </Button>
                {testResult ? <Badge variant={testResult.meters.length > 0 ? "success" : "outline"}>{testResult.meters.length} {t("meters")}</Badge> : null}
              </div>

              {testResult ? (
                <ProviderUsageTestResultPanel result={testResult} onSelectPath={selectPath} />
              ) : null}
            </div>
          ) : null}

          {draft.accountMode === "raw" ? (
            <Field className="sm:col-span-2" label={t("Connectors JSON")}>
              <Textarea
                className="min-h-[180px] font-mono text-[11px]"
                value={draft.accountConnectorsText}
                onChange={(event) => onChange({ accountConnectorsText: event.target.value })}
              />
              <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="min-w-0 truncate">{t("Supports standard, http-json, plugin, and local-estimate connectors.")}</span>
                <button
                  className="shrink-0 text-primary hover:underline"
                  type="button"
                  onClick={() => onChange({ accountConnectorsText: providerAccountConnectorExample() })}
                >
                  {t("Insert example")}
                </button>
              </div>
            </Field>
          ) : null}
        </div>
      ) : null}

      {testError ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t(testError)}</span>
        </div>
      ) : null}
    </div>
  );
}

function ProviderUsageTestResultPanel({
  onSelectPath,
  result
}: {
  onSelectPath: (target: ProviderUsageFieldTarget, path: string) => void;
  result: ProviderAccountTestResult;
}) {
  const t = useAppText();
  const visiblePaths = result.paths.slice(0, 120);

  return (
    <div className="sm:col-span-2 rounded-md border border-border bg-muted/20">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 truncate text-[12px] font-semibold">{t("Response fields")}</div>
        <Badge variant="outline">{result.paths.length}</Badge>
      </div>
      {visiblePaths.length === 0 ? (
        <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">{t("No response fields")}</div>
      ) : (
        <div className="max-h-[260px] overflow-auto p-2">
          <div className="space-y-1.5">
            {visiblePaths.map((item) => (
              <ProviderUsagePathRow item={item} key={item.path} onSelectPath={onSelectPath} />
            ))}
          </div>
          {result.paths.length > visiblePaths.length ? (
            <div className="px-1 py-2 text-[11px] text-muted-foreground">
              {t("Showing first response fields only.")}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ProviderUsagePathRow({
  item,
  onSelectPath
}: {
  item: ProviderAccountTestPath;
  onSelectPath: (target: ProviderUsageFieldTarget, path: string) => void;
}) {
  const t = useAppText();

  return (
    <div className="grid min-w-0 grid-cols-[minmax(180px,1fr)_minmax(120px,0.6fr)_auto] items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-[11px]">
      <div className="min-w-0">
        <div className="truncate font-mono font-semibold" title={item.path}>{item.path}</div>
        <div className="truncate text-muted-foreground" title={item.preview}>{item.preview}</div>
      </div>
      <Badge className="justify-self-start" variant="outline">{item.type}</Badge>
      <div className="flex flex-wrap justify-end gap-1">
        <Button className="h-6 px-1.5 text-[10px]" onClick={() => onSelectPath("balance", item.path)} type="button" variant="outline">{t("Balance rem")}</Button>
        <Button className="h-6 px-1.5 text-[10px]" onClick={() => onSelectPath("balanceLimit", item.path)} type="button" variant="outline">{t("Balance total")}</Button>
        <Button className="h-6 px-1.5 text-[10px]" onClick={() => onSelectPath("balanceUsed", item.path)} type="button" variant="outline">{t("Balance used")}</Button>
        <Button className="h-6 px-1.5 text-[10px]" onClick={() => onSelectPath("subscriptionRemaining", item.path)} type="button" variant="outline">{t("Sub rem")}</Button>
        <Button className="h-6 px-1.5 text-[10px]" onClick={() => onSelectPath("subscriptionLimit", item.path)} type="button" variant="outline">{t("Sub limit")}</Button>
        <Button className="h-6 px-1.5 text-[10px]" onClick={() => onSelectPath("subscriptionReset", item.path)} type="button" variant="outline">{t("Reset")}</Button>
      </div>
    </div>
  );
}

export function AddProviderDialog({
  canSubmit,
  connectivityLoading = false,
  connectivityProbe,
  draft,
  error,
  importProvider,
  mode,
  onCheck,
  onChange,
  onClose,
  onSubmit,
  probe,
  probeLoading,
  providerPlugins = [],
  providers,
  submitLabel,
  title
}: {
  canSubmit: boolean;
  connectivityLoading?: boolean;
  connectivityProbe?: GatewayProviderProbeResult;
  draft: AddProviderDraft;
  error: string;
  importProvider?: ProviderDeepLinkPayload;
  mode: "add" | "edit";
  onCheck?: (models: string[]) => Promise<ProviderConnectivityCheckReport>;
  onChange: (patch: Partial<AddProviderDraft>, resetProbe?: boolean) => void;
  onClose: () => void;
  onSubmit: () => Promise<boolean>;
  probe?: GatewayProviderProbeResult;
  probeLoading: boolean;
  providerPlugins?: unknown[];
  providers: GatewayProviderConfig[];
  submitLabel?: string;
  title?: string;
}) {
  const t = useAppText();
  const [checkConfirmOpen, setCheckConfirmOpen] = useState(false);
  const [checkConfirmBusy, setCheckConfirmBusy] = useState(false);
  const [iconDetecting, setIconDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkModelSelection, setCheckModelSelection] = useState<string[]>([]);
  const [checkResult, setCheckResult] = useState<ProviderConnectivityCheckReport>();
  const checkModels = mergeProviderModelLists(draft.selectedModels, splitLines(draft.modelsText));
  const submitLoading = probeLoading || connectivityLoading || iconDetecting || submitting;
  const submitDisabled = !canSubmit || submitLoading;

  function openCheckConfirm() {
    setCheckModelSelection(checkModels);
    setCheckResult(undefined);
    setCheckConfirmOpen(true);
  }

  async function confirmCheck() {
    if (!onCheck) {
      return;
    }
    setCheckConfirmBusy(true);
    try {
      setCheckResult(await onCheck(checkModelSelection));
    } finally {
      setCheckConfirmBusy(false);
    }
  }

  function toggleCheckModel(model: string) {
    setCheckModelSelection((current) =>
      current.includes(model)
        ? current.filter((item) => item !== model)
        : mergeProviderModelLists(current, [model])
    );
    setCheckResult(undefined);
  }

  async function submit() {
    if (submitDisabled) {
      return;
    }
    setSubmitting(true);
    try {
      const saved = await onSubmit();
      if (!saved) {
        setSubmitting(false);
      }
    } catch (error) {
      setSubmitting(false);
      throw error;
    }
  }

  return (
    <>
      <Dialog className="items-start" onOpenChange={(open) => !open && !submitting && onClose()}>
        <DialogContent className="mt-[clamp(8px,2dvh,20px)] h-[calc(100dvh-1.5rem-clamp(8px,2dvh,20px))] max-w-[820px] origin-top sm:mt-[clamp(8px,3dvh,28px)] sm:h-[min(860px,calc(100dvh-3rem-clamp(8px,3dvh,28px)))]">
          <DialogHeader>
            <div className="min-w-0">
              <DialogTitle>{title ?? (mode === "edit" ? t("Edit Provider") : t("Add Provider"))}</DialogTitle>
            </div>
            <Button aria-label={t("Close dialog")} disabled={submitting} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>

          <DialogBody>
            <AddProviderForm
              connectivityLoading={connectivityLoading}
              connectivityProbe={connectivityProbe}
              draft={draft}
              error={error}
              importProvider={importProvider}
              mode={mode}
              onCheck={onCheck ? async () => openCheckConfirm() : undefined}
              onChange={onChange}
              onIconDetectingChange={setIconDetecting}
              probe={probe}
              probeLoading={probeLoading}
              providerPlugins={providerPlugins}
              providers={providers}
            />
          </DialogBody>

          <DialogFooter>
            <Button disabled={submitting} onClick={onClose} type="button" variant="outline">
              {t("Cancel")}
            </Button>
            <Button disabled={submitDisabled} onClick={() => void submit()} type="button">
              <AnimatedIconSwap iconKey={submitLoading ? "loading" : mode}>
                {submitLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : mode === "edit" ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </AnimatedIconSwap>
              {submitLoading ? t("Loading") : submitLabel ?? (mode === "edit" ? t("Save") : t("Add"))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {checkConfirmOpen ? (
        <Dialog className="z-[60]" onOpenChange={(open) => !open && !checkConfirmBusy && setCheckConfirmOpen(false)}>
          <DialogContent className="max-w-[520px]">
            <DialogHeader>
              <div className="min-w-0">
                <DialogTitle>{t("Check Connection")}</DialogTitle>
              </div>
              <Button
                aria-label={t("Close dialog")}
                disabled={checkConfirmBusy}
                onClick={() => setCheckConfirmOpen(false)}
                size="iconSm"
                title={t("Close")}
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-3">
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
                  <div className="flex items-start gap-2 text-[12px] font-medium text-amber-900 dark:text-amber-100">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{t("This check sends real model requests with your provider API key and may consume account balance.")}</span>
                  </div>
                  <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                    {t("Generated output is limited to 1 token for connectivity checks.")}
                  </div>
                </div>

                <div className="rounded-md border border-border bg-background p-2">
                  <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-[12px] font-semibold">{t("Models to check")}</div>
                    <div className="flex shrink-0 gap-1">
                      <Button className="h-6 px-1.5 text-[10px]" disabled={checkConfirmBusy || connectivityLoading || checkModels.length === 0} onClick={() => { setCheckModelSelection(checkModels); setCheckResult(undefined); }} type="button" variant="outline">
                        {t("All")}
                      </Button>
                      <Button className="h-6 px-1.5 text-[10px]" disabled={checkConfirmBusy || connectivityLoading || checkModelSelection.length === 0} onClick={() => { setCheckModelSelection([]); setCheckResult(undefined); }} type="button" variant="outline">
                        {t("Clear")}
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-[180px] overflow-auto">
                    <div className="grid grid-cols-1 gap-2">
                      {checkModels.map((model) => {
                        const checked = checkModelSelection.includes(model);
                        return (
                          <Label
                            className={cn(
                              "flex min-h-8 min-w-0 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-muted",
                              checked && "border-primary bg-accent"
                            )}
                            key={model}
                          >
                            <Checkbox checked={checked} disabled={checkConfirmBusy || connectivityLoading} onCheckedChange={() => toggleCheckModel(model)} />
                            <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={model}>{model}</span>
                          </Label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {checkResult ? <ProviderConnectivityResultPanel result={checkResult} /> : null}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button disabled={checkConfirmBusy} onClick={() => setCheckConfirmOpen(false)} type="button" variant="outline">
                {checkResult ? t("Close") : t("Cancel")}
              </Button>
              <Button disabled={checkConfirmBusy || connectivityLoading || checkModelSelection.length === 0} onClick={() => void confirmCheck()} type="button">
                <AnimatedIconSwap iconKey={checkConfirmBusy || connectivityLoading ? "checking" : "start"}>
                  {checkConfirmBusy || connectivityLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                </AnimatedIconSwap>
                {t("Start check")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function ProviderConnectivityResultPanel({ result }: { result: ProviderConnectivityCheckReport }) {
  const t = useAppText();

  return (
    <div className="rounded-md border border-border bg-muted/20">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 truncate text-[12px] font-semibold">{t("Check results")}</div>
        <div className="flex shrink-0 gap-1">
          <Badge variant={result.passed.length > 0 ? "success" : "outline"}>{result.passed.length} {t("Available")}</Badge>
          <Badge variant={result.failed.length > 0 ? "warning" : "outline"}>{result.failed.length} {t("Unavailable")}</Badge>
        </div>
      </div>
      <div className="max-h-[220px] overflow-auto p-2">
        <ProviderConnectivityResultGroup
          emptyLabel={t("No available models")}
          items={result.passed}
          label={t("Available models")}
          variant="success"
        />
        <ProviderConnectivityResultGroup
          className="mt-2"
          emptyLabel={t("No unavailable models")}
          items={result.failed}
          label={t("Unavailable models")}
          variant="warning"
        />
      </div>
    </div>
  );
}

function ProviderConnectivityResultGroup({
  className,
  emptyLabel,
  items,
  label,
  variant
}: {
  className?: string;
  emptyLabel: string;
  items: ProviderConnectivityCheckReport["results"];
  label: string;
  variant: "success" | "warning";
}) {
  const t = useAppText();

  return (
    <div className={className}>
      <div className="mb-1 min-w-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="min-w-0 truncate">{label}</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background/70 px-2 py-2 text-center text-[11px] text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => {
            const supportedProtocols = item.protocols.filter((protocol) => protocol.supported);
            return (
              <div className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-[11px]" key={item.model}>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-mono font-semibold" title={item.model}>{item.model}</span>
                  <Badge variant={variant}>{item.supported ? t("Available") : t("Unavailable")}</Badge>
                </div>
                <div className="mt-1 truncate text-muted-foreground" title={translateProbeProtocolMessage(item.message, t)}>
                  {translateProbeProtocolMessage(item.message, t)}
                </div>
                {supportedProtocols.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {supportedProtocols.map((protocol) => (
                      <Badge key={`${item.model}:${protocol.protocol}:${protocol.endpoint}`} variant="outline">
                        {translatedProviderProtocolLabel(protocol.protocol, t)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModelTagInput({
  ariaLabel,
  displayNames,
  onChange,
  placeholder,
  value
}: {
  ariaLabel: string;
  displayNames?: Record<string, string>;
  onChange: (value: string[]) => void;
  placeholder: string;
  value: string[];
}) {
  const t = useAppText();
  const [draft, setDraft] = useState("");
  const models = mergeProviderModelLists(value);

  function addModels(rawValue = draft) {
    const nextModels = splitModelTagInput(rawValue);
    if (nextModels.length === 0) {
      return;
    }
    onChange(mergeProviderModelLists(models, nextModels));
    setDraft("");
  }

  function removeModel(model: string) {
    onChange(models.filter((item) => item !== model));
  }

  return (
    <>
      <Input
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addModels();
          }
        }}
        placeholder={placeholder}
        value={draft}
      />
      {models.length > 0 ? (
        <div className="flex max-h-[120px] flex-wrap gap-1.5 overflow-auto">
          {models.map((model) => {
            const displayName = displayNames?.[model] ?? model;
            return (
              <Badge className="max-w-full pr-1" key={model} variant="secondary">
                <span className="min-w-0 max-w-[260px] truncate" title={displayName}>
                  {displayName}
                </span>
                <button
                  aria-label={`${t("Remove model")} ${displayName}`}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                  onClick={() => removeModel(model)}
                  title={t("Remove model")}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function ModelMultiSelect({
  displayNames,
  models,
  onQueryChange,
  onSelectedChange,
  query,
  selected
}: {
  displayNames?: Record<string, string>;
  models: string[];
  onQueryChange: (value: string) => void;
  onSelectedChange: (value: string[]) => void;
  query: string;
  selected: string[];
}) {
  const t = useAppText();
  const normalized = query.trim().toLowerCase();
  const visibleModels = normalized
    ? models.filter((model) => model.toLowerCase().includes(normalized) || (displayNames?.[model] ?? "").toLowerCase().includes(normalized))
    : models;

  function toggleModel(model: string) {
    onSelectedChange(selected.includes(model) ? selected.filter((item) => item !== model) : [...selected, model]);
  }

  function selectVisibleModels() {
    onSelectedChange(Array.from(new Set([...selected, ...visibleModels])));
  }

  return (
    <div className="rounded-md border border-input bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={t("Search models")} className="pl-8" onChange={(event) => onQueryChange(event.target.value)} placeholder={t("Search models")} value={query} />
        </div>
        <Button disabled={visibleModels.length === 0} onClick={selectVisibleModels} size="sm" type="button" variant="outline">
          {t("All")}
        </Button>
        <Button disabled={selected.length === 0} onClick={() => onSelectedChange([])} size="sm" type="button" variant="outline">
          {t("Clear")}
        </Button>
      </div>
      <div className="max-h-[220px] overflow-auto p-2">
        {visibleModels.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-[12px] text-muted-foreground">{t("No matching models")}</div>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visibleModels.map((model) => {
            const checked = selected.includes(model);
            const displayName = displayNames?.[model];
            return (
              <Label
                className={cn(
                  "flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 text-left text-[12px] transition-colors hover:bg-muted",
                  checked && "border-primary bg-accent"
                )}
                key={model}
                title={displayName ?? model}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggleModel(model)} />
                <span className="min-w-0 flex-1 truncate">{displayName ?? model}</span>
              </Label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
