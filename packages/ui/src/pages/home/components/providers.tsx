import {
  AddProviderDraft, AnimatedDisclosure, AnimatedIconSwap, AnimatedListItem, AnimatedPopover, AnimatePresence, AppConfig, Badge,
  Box, Braces, Button, Card, CardContent, CardHeader, CardTitle,
  Check, Checkbox, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, cn,
  compareProviderAccountSnapshots, copyTextToClipboard, createDefaultProviderAccountDraft, createModelCatalogItems, createProviderAccountDraftFromConfig, createProviderCredentialDraft,
  customProviderPresetId, defaultProviderAccountConfigForPreset, Dialog, DialogBody, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, ExternalLink, Eye, EyeOff, Field, findProviderPreset, formatProviderAccountMeterValue, GatewayProviderConfig,
  GatewayProviderProbeResult, getProviderPresets, Globe, inferProviderNameFromBaseUrl, Info, Input, KeyValueRowsControl, Label,
  Layers3, LoaderCircle, localAgentProviderIconUrls, mergeProviderModelLists, modelCatalogItemMatchesQuery, motion,
  Pencil, Plus, PopoverContent, primaryProviderAccountMeter, primaryProviderPresetEndpoint,
  providerAccountConnectorApiKeySafetyIssue, providerAccountConnectorExample, ProviderAccountDraftMode, providerAccountModeOptions, ProviderAccountSnapshot,
  providerAccountConnectorsTextWithNewApiUserBalanceTemplate, providerAccountSnapshotCredentialLabel, providerAccountSnapshotLabel, ProviderAccountTestPath,
  ProviderAccountTestResult, providerBaseUrl, providerCapabilitiesSummary, ProviderCredentialDraft, ProviderDeepLinkPayload, ProviderDeepLinkRequest, providerDraftSafetyIssue, providerCredentialDraftPatchFromJson, providerHttpJsonConnectorFromDraft,
  ProviderConnectivityCheckReport, providerCapabilityBaseUrlForProtocol, providerConnectivityApiKeyFromDraft, providerDeepLinkDisplayIcon, providerDraftHasReadyCredentialPool, providerListItemKey, providerMatchesQuery, ProviderPreset, providerPresetIconUrls, providerProbeHasSupportedProtocol,
  providerDisplayIcon, providerGlobalBaseUrlForProbe, providerModelDisplayName, providerModelDisplayTitle, providerProtocolOptions, providerSelectableProtocolsFromProbe, providerUsageFieldPatch, ProviderUsageFieldTarget, providerUsageMethodOptions, Search, SelectControl,
  resolveProviderDeepLinkPreset, ShieldCheck, splitLines, Switch, Textarea, Toggle, translatedProviderProtocolLabel, translateOptions,
  translateProbeProtocolMessage, Trash2, uniqueProviderName, uniqueProviderProtocols, useAppErrorText, useAppText, useEffect, useLayoutEffect, useMemo,
  useRef, useState, X, isGatewayProviderEnabled, isPlainRecord
} from "../shared/index";
import { providerUrlWithDefaultScheme } from "@ccr/core/providers/url";
import { createPortal } from "react-dom";
import type { LocalAgentProviderCandidate } from "@ccr/core/contracts/app";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function ProvidersView({ accountSnapshots, addProvider, editProvider, notify, providers, removeProvider, setProviderEnabled }: {
  accountSnapshots: ProviderAccountSnapshot[];
  addProvider: () => void;
  editProvider: (index: number) => void;
  notify: (message: string) => void;
  providers: Array<{ provider: GatewayProviderConfig; index: number }>;
  removeProvider: (index: number) => void;
  setProviderEnabled: (index: number, enabled: boolean) => void;
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
    if (!isGatewayProviderEnabled(provider)) {
      return;
    }
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

  function changeProviderEnabled(provider: GatewayProviderConfig, index: number, enabled: boolean) {
    if (!enabled) {
      const key = providerListItemKey(provider, index);
      setExpandedProviders((current) => {
        if (!current.has(key)) {
          return current;
        }
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
    setProviderEnabled(index, enabled);
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
            <>
              <div className="grid gap-2 p-3 md:hidden">
                <AnimatePresence initial={false}>
                  {visibleProviders.map(({ provider, index }) => {
                    const itemKey = providerListItemKey(provider, index);
                    const expanded = isGatewayProviderEnabled(provider) && expandedProviders.has(itemKey);
                    const providerAccountSnapshots = accountSnapshotsByProvider.get(provider.name) ?? [];
                    return (
                      <ProviderMobileCard
                        expanded={expanded}
                        index={index}
                        key={itemKey}
                        onCopyModel={copyModel}
                        onEdit={editProvider}
                        onRemove={removeProvider}
                        onSetEnabled={(providerIndex, enabled) => changeProviderEnabled(provider, providerIndex, enabled)}
                        onToggle={toggleProvider}
                        provider={provider}
                        snapshots={providerAccountSnapshots}
                      />
                    );
                  })}
                </AnimatePresence>
              </div>
              <div className="hidden min-w-0 md:block">
                <div className="min-w-[1080px]">
                  <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(260px,1fr)_80px_minmax(150px,0.65fr)_minmax(260px,1fr)_132px] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <div className="truncate">{t("Provider")}</div>
                    <div className="truncate">{t("Models")}</div>
                    <div className="truncate">{t("Account Usage")}</div>
                    <div className="truncate">{t("Endpoint")}</div>
                    <div aria-hidden="true" />
                  </div>
                  <div className="divide-y divide-border/60">
                    <AnimatePresence initial={false}>
                      {visibleProviders.map(({ provider, index }) => {
                        const itemKey = providerListItemKey(provider, index);
                        const providerEnabled = isGatewayProviderEnabled(provider);
                        const expanded = providerEnabled && expandedProviders.has(itemKey);
                        const providerAccountSnapshots = accountSnapshotsByProvider.get(provider.name) ?? [];
                        const providerIconUrl = providerDisplayIcon(provider);
                        return (
                          <AnimatedListItem key={itemKey}>
                            <div
                              className={cn(
                                "grid min-h-[58px] grid-cols-[minmax(260px,1fr)_80px_minmax(150px,0.65fr)_minmax(260px,1fr)_132px] items-center gap-3 px-4 py-2.5 transition-colors",
                                providerEnabled ? "cursor-pointer hover:bg-muted/35" : "bg-muted/10 text-muted-foreground"
                              )}
                              onClick={() => toggleProvider(provider, index)}
                              onKeyDown={(event) => {
                                if (providerEnabled && (event.key === "Enter" || event.key === " ")) {
                                  event.preventDefault();
                                  toggleProvider(provider, index);
                                }
                              }}
                              role={providerEnabled ? "button" : undefined}
                              tabIndex={providerEnabled ? 0 : undefined}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {providerEnabled ? (
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
                                ) : <div aria-hidden="true" className="h-6 w-6 shrink-0" />}
                                <ProviderPresetIcon className="h-8 w-8 rounded-md" iconUrl={providerIconUrl} />
                                <div className="min-w-0">
                                  <div className="truncate text-[12px] font-semibold text-foreground">{provider.name || t("Unnamed")}</div>
                                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={providerCapabilitiesSummary(provider, t)}>
                                    {providerCapabilitiesSummary(provider, t)}
                                  </div>
                                </div>
                              </div>
                              <div className="min-w-0">
                                {providerEnabled ? (
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
                                ) : <span className="text-[11px] text-muted-foreground">-</span>}
                              </div>
                              <ProviderAccountListCell provider={provider} snapshots={providerAccountSnapshots} />
                              <div className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" title={providerBaseUrl(provider)}>
                                {providerBaseUrl(provider) || t("Not set")}
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <div
                                  onClick={(event) => event.stopPropagation()}
                                  role="presentation"
                                >
                                  <Toggle
                                    ariaLabel={`${t(providerEnabled ? "Disable provider" : "Enable provider")} ${provider.name || t("provider")}`}
                                    checked={providerEnabled}
                                    onChange={(enabled) => changeProviderEnabled(provider, index, enabled)}
                                    title={t(providerEnabled ? "Enabled" : "Disabled")}
                                  />
                                </div>
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
                              {providerEnabled && expanded ? (
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
            </>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ProviderMobileCard({
  expanded,
  index,
  onCopyModel,
  onEdit,
  onRemove,
  onSetEnabled,
  onToggle,
  provider,
  snapshots
}: {
  expanded: boolean;
  index: number;
  onCopyModel: (model: string) => void | Promise<void>;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onSetEnabled: (index: number, enabled: boolean) => void;
  onToggle: (provider: GatewayProviderConfig, index: number) => void;
  provider: GatewayProviderConfig;
  snapshots: ProviderAccountSnapshot[];
}) {
  const t = useAppText();
  const providerIconUrl = providerDisplayIcon(provider);
  const providerEnabled = isGatewayProviderEnabled(provider);
  const models = providerEnabled ? provider.models : [];

  return (
    <AnimatedListItem>
      <article className={cn("rounded-md border border-border p-3", providerEnabled ? "bg-background" : "bg-muted/10 text-muted-foreground")}>
        <div className="flex min-w-0 items-start gap-3">
          <ProviderPresetIcon className="h-9 w-9 rounded-md" iconUrl={providerIconUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 truncate text-[13px] font-semibold text-foreground">{provider.name || t("Unnamed")}</h3>
              {providerEnabled ? <Badge variant={models.length > 0 ? "outline" : "warning"}>{models.length} {t("models")}</Badge> : null}
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={providerBaseUrl(provider)}>
              {providerBaseUrl(provider) || t("Not set")}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Toggle
              ariaLabel={`${t(providerEnabled ? "Disable provider" : "Enable provider")} ${provider.name || t("provider")}`}
              checked={providerEnabled}
              onChange={(enabled) => onSetEnabled(index, enabled)}
              title={t(providerEnabled ? "Enabled" : "Disabled")}
            />
            <Button
              aria-label={`${t("Edit")} ${provider.name || t("provider")}`}
              onClick={() => onEdit(index)}
              size="iconSm"
              title={t("Edit provider")}
              type="button"
              variant="ghost"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              aria-label={`${t("Remove")} ${provider.name || t("provider")}`}
              onClick={() => onRemove(index)}
              size="iconSm"
              title={t("Remove provider")}
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-2 text-[12px]">
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
            <dt className="truncate text-muted-foreground">{t("Capability")}</dt>
            <dd className="min-w-0 truncate font-medium" title={providerCapabilitiesSummary(provider, t)}>{providerCapabilitiesSummary(provider, t)}</dd>
          </div>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
            <dt className="truncate text-muted-foreground">{t("Account Usage")}</dt>
            <dd className="min-w-0"><ProviderAccountListCell provider={provider} snapshots={snapshots} /></dd>
          </div>
        </dl>

        {providerEnabled ? (
          <button
            aria-expanded={expanded}
            className="mt-3 flex h-8 w-full items-center justify-between rounded-md border border-border bg-muted/20 px-2 text-[12px] font-medium text-muted-foreground"
            onClick={() => onToggle(provider, index)}
            type="button"
          >
            <span>{expanded ? t("Hide models") : t("Show models")}</span>
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : null}

        <AnimatePresence initial={false}>
          {providerEnabled && expanded ? (
            <AnimatedDisclosure key="provider-mobile-models">
              <div className="mt-2 rounded-md border border-border bg-muted/20 p-2">
                {models.length === 0 ? (
                  <div className="px-2 py-3 text-center text-[12px] text-muted-foreground">{t("No models configured")}</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {models.map((model) => {
                      const displayName = providerModelDisplayName(provider, model);
                      return (
                        <button
                          className="inline-flex max-w-full items-center rounded-full border border-border bg-background px-2.5 py-1 text-[11px] leading-4 text-foreground"
                          key={`${provider.name}:${model}`}
                          onDoubleClick={() => void onCopyModel(model)}
                          title={`${providerModelDisplayTitle(provider, model)} · ${t("Double click to copy")}`}
                          type="button"
                        >
                          <span className="truncate">{displayName}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </AnimatedDisclosure>
          ) : null}
        </AnimatePresence>
      </article>
    </AnimatedListItem>
  );
}

export function ModelsView({
  config,
  updateModelDescription
}: {
  config: AppConfig;
  updateModelDescription: (providerIndex: number, model: string, description: string) => void;
}) {
  const t = useAppText();
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionTarget, setDescriptionTarget] = useState<{
    description: string;
    displayName?: string;
    model: string;
    providerIndex: number;
    providerName?: string;
  }>();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => createModelCatalogItems(config), [config]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = useMemo(
    () => rows.filter((row) => modelCatalogItemMatchesQuery(row, normalizedQuery)),
    [normalizedQuery, rows]
  );

  function openDescriptionDialog(row: (typeof rows)[number]) {
    if (row.providerIndex === undefined) {
      return;
    }
    const description = row.description ?? "";
    setDescriptionDraft(description);
    setDescriptionTarget({
      description,
      displayName: row.displayName,
      model: row.model,
      providerIndex: row.providerIndex,
      providerName: row.providerName
    });
  }

  function closeDescriptionDialog() {
    setDescriptionDraft("");
    setDescriptionTarget(undefined);
  }

  function saveDescriptionDialog() {
    if (!descriptionTarget) {
      return;
    }
    updateModelDescription(descriptionTarget.providerIndex, descriptionTarget.model, descriptionDraft);
    closeDescriptionDialog();
  }

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
            <div className="min-w-0">
              <div className="min-w-[680px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(0,1fr)_minmax(260px,1.5fr)] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Model")}</div>
                  <div className="truncate">{t("Description")}</div>
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                    {visibleRows.map((row) => (
                      <AnimatedListItem
                        className="grid min-h-[60px] grid-cols-[minmax(0,1fr)_minmax(260px,1.5fr)] items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                        key={row.key}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-foreground" title={row.displayName ?? row.model}>
                            {row.displayName ?? row.model}
                          </div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground" title={row.providerName ? `${row.providerName}/${row.model}` : row.model}>
                            {row.providerName ? `${row.providerName}/${row.model}` : row.model}
                          </div>
                        </div>
                        <div className="min-w-0">
                          {row.providerIndex !== undefined ? (
                            <div className="flex min-w-0 items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="line-clamp-2 text-[12px] leading-5 text-muted-foreground" title={row.description ?? ""}>
                                  {row.description || "-"}
                                </div>
                              </div>
                              <Button
                                aria-label={`${t("Edit description")} ${row.displayName ?? row.model}`}
                                className="h-7 w-7 shrink-0 p-0"
                                onClick={() => openDescriptionDialog(row)}
                                title={t("Edit description")}
                                type="button"
                                variant="ghost"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="line-clamp-2 text-[12px] leading-5 text-muted-foreground" title={row.description ?? ""}>
                              {row.description || "-"}
                            </div>
                          )}
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
      <ModelCatalogDescriptionDialog
        draft={descriptionDraft}
        onChange={setDescriptionDraft}
        onClose={closeDescriptionDialog}
        onSave={saveDescriptionDialog}
        target={descriptionTarget}
      />
    </motion.div>
  );
}

function ModelCatalogDescriptionDialog({
  draft,
  onChange,
  onClose,
  onSave,
  target
}: {
  draft: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  target?: {
    description: string;
    displayName?: string;
    model: string;
    providerName?: string;
  };
}) {
  const t = useAppText();
  const open = Boolean(target);
  const title = target?.displayName || target?.model || t("Model");
  const subtitle = target?.providerName ? `${target.providerName}/${target.model}` : target?.model;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("Edit description")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-foreground" title={title}>{title}</div>
            {subtitle ? <div className="truncate font-mono text-[11px] text-muted-foreground" title={subtitle}>{subtitle}</div> : null}
          </div>
          <Field label={t("Description")}>
            <Textarea
              aria-label={`${t("Description")} ${title}`}
              className="min-h-[160px] resize-y text-[12px]"
              onChange={(event) => onChange(event.target.value)}
              placeholder={t("Describe model strengths, tradeoffs, and best-fit tasks.")}
              value={draft}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button disabled={draft.trim() === (target?.description ?? "").trim()} onClick={onSave} type="button">
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProviderAccountListCell({ provider, snapshots }: { provider: GatewayProviderConfig; snapshots: ProviderAccountSnapshot[] }) {
  const t = useAppText();
  if (!isGatewayProviderEnabled(provider)) {
    return <div className="min-w-0 truncate text-[11px] text-muted-foreground">{t("Disabled")}</div>;
  }
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
  const [popoverLayout, setPopoverLayout] = useState<{
    left: number;
    listHeight: number;
    maxHeight: number;
    offset: number;
    placement: "above" | "below";
    width: number;
  }>();
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value) ?? options.find((option) => option.value === "");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) => providerPresetOptionMatchesQuery(option, normalizedQuery))
    : options;
  const selectedExternalUrl = providerPresetOptionPlatformUrl(selected);
  const selectedEndpointUrl = selected?.preset ? primaryProviderPresetEndpoint(selected.preset)?.baseUrl : undefined;

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
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const availableWidth = Math.max(220, viewportWidth - margin * 2);
      const width = Math.min(Math.max(260, anchor.width), availableWidth);
      const left = Math.min(Math.max(margin, anchor.left), viewportWidth - margin - width);
      const below = Math.max(0, viewportHeight - anchor.bottom - margin - gap);
      const above = Math.max(0, anchor.top - margin - gap);
      const placement = below < 260 && above > below ? "above" : "below";
      const availableHeight = Math.max(140, placement === "above" ? above : below);
      const maxHeight = Math.min(328, availableHeight);
      const listHeight = Math.max(96, Math.min(248, maxHeight - 44));

      setPopoverLayout({
        left,
        listHeight,
        maxHeight,
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
    if (!open) {
      return;
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
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

  function toggleOpen() {
    if (!open) {
      setQuery("");
    }
    setOpen((current) => !current);
  }

  function openSelectedExternalUrl() {
    if (!selectedExternalUrl) {
      return;
    }
    openExternalUrl(selectedExternalUrl);
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <div
        aria-controls="provider-preset-options"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex min-h-12 w-full min-w-0 cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-left outline-none transition-[background-color,border-color,box-shadow,color] hover:border-muted-foreground/45 hover:bg-muted/20 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/25",
          open && "border-ring/35 bg-muted/30"
        )}
        onClick={toggleOpen}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <ProviderPresetIcon className="h-8 w-8 rounded-md" iconUrl={selected?.iconUrl} preset={selected?.preset} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-foreground">{selected ? selected.label : t("Select preset provider")}</div>
          {selectedEndpointUrl ? (
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={selectedEndpointUrl}>{selectedEndpointUrl}</div>
          ) : null}
        </div>
        {selectedExternalUrl ? (
          <Button
            aria-label={t("Open provider website")}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              openSelectedExternalUrl();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            size="iconSm"
            title={t("Open provider website")}
            type="button"
            variant="ghost"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        ) : null}
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </div>

      {open && typeof document !== "undefined" ? createPortal(
        <AnimatedPopover
          className="fixed z-[140]"
          placement={popoverLayout?.placement ?? "below"}
          style={popoverLayout
            ? {
              left: `${popoverLayout.left}px`,
              maxHeight: `${popoverLayout.maxHeight}px`,
              width: `${popoverLayout.width}px`,
              ...(popoverLayout.placement === "above"
                ? { bottom: `${popoverLayout.offset}px` }
                : { top: `${popoverLayout.offset}px` })
            }
            : undefined}
        >
          <PopoverContent className="w-full overflow-hidden p-1" ref={panelRef}>
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
            <div
              className="overflow-auto"
              id="provider-preset-options"
              role="listbox"
              style={{ maxHeight: `${popoverLayout?.listHeight ?? 240}px` }}
            >
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
        </AnimatedPopover>,
        document.body
      ) : null}
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
    openExternalUrl(platformUrl);
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
  return normalizedHttpUrl(provider.source) ?? providerPresetWebsiteUrlForBaseUrl(preset, baseUrl || provider.baseUrl);
}

function openExternalUrl(url: string) {
  if (window.ccr?.openExternal) {
    void window.ccr.openExternal(url).catch(() => undefined);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
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

function providerPresetOptionPlatformUrl(option: ProviderPresetComboboxOption | undefined): string | undefined {
  if (!option?.preset) {
    return undefined;
  }
  return providerPresetWebsiteUrlForEndpoint(option.preset, primaryProviderPresetEndpoint(option.preset));
}

function providerPresetWebsiteUrlForBaseUrl(preset: ProviderPreset | undefined, baseUrl: string): string | undefined {
  if (!preset) {
    return undefined;
  }
  const normalizedBaseUrl = baseUrl.trim();
  const endpoint = normalizedBaseUrl
    ? preset.endpoints.find((item) => item.baseUrl.trim() === normalizedBaseUrl)
    : undefined;
  return providerPresetWebsiteUrlForEndpoint(preset, endpoint);
}

function providerPresetWebsiteUrlForEndpoint(
  preset: ProviderPreset,
  endpoint: ReturnType<typeof primaryProviderPresetEndpoint> | undefined
): string | undefined {
  return normalizedHttpUrl(endpoint?.websiteUrl) ?? normalizedHttpUrl(preset.websiteUrl);
}

function providerDraftNameShouldFollowPreset(
  name: string,
  previousPreset: ProviderPreset | undefined,
  t: (value: string) => string
): boolean {
  const trimmed = name.trim();
  if (!trimmed || /^provider-\d+$/i.test(trimmed)) {
    return true;
  }
  if (!previousPreset) {
    return false;
  }
  return [previousPreset.name, t(previousPreset.name)].some((baseName) =>
    providerNameMatchesGeneratedPresetName(trimmed, baseName)
  );
}

function providerNameMatchesGeneratedPresetName(name: string, baseName: string): boolean {
  const normalizedName = name.trim().toLowerCase();
  const normalizedBaseName = baseName.trim().toLowerCase();
  if (!normalizedBaseName) {
    return false;
  }
  if (normalizedName === normalizedBaseName) {
    return true;
  }
  if (!normalizedName.startsWith(`${normalizedBaseName} `)) {
    return false;
  }
  return /^\d+$/.test(normalizedName.slice(normalizedBaseName.length + 1));
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
        capabilities: result.provider.capabilities ?? [],
        credentialMode: "apiKey",
        credentials: [],
        icon: result.provider.icon?.trim() || localAgentProviderIconUrls[candidate.kind] || "",
        modelDescriptions: result.provider.modelDescriptions,
        modelDisplayNames: result.provider.modelDisplayNames,
        modelMetadata: result.provider.modelMetadata,
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
          <div className="truncate text-[12px] font-semibold text-foreground">{t("Import local agent provider")}</div>
          <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t("CCR scanned this computer for local Claude Code, Codex, Grok CLI, Kimi CLI, OpenCode CLI, and ZCode providers. Click Import to add one as a gateway provider.")}</div>
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
const localAgentProviderPluginSuffixes: Record<Exclude<LocalAgentProviderCandidate["kind"], "opencode">, string[]> = {
  "claude-code": ["-claude-code-oauth", "-claude-code-oauth-internal"],
  codex: ["-codex-oauth", "-codex-oauth-internal"],
  grok: ["-grok-cli-oauth", "-grok-cli-oauth-internal"],
  kimi: ["-kimi-cli-oauth", "-kimi-cli-oauth-internal", "-kimi-cli-api-key", "-kimi-cli-api-key-internal"],
  zcode: ["-zcode-api-key", "-zcode-api-key-internal"]
};

function localAgentProviderPluginSuffixesForCandidate(candidate: LocalAgentProviderCandidate): string[] {
  if (candidate.kind === "opencode") {
    const baseSuffix = `-opencode-${candidate.protocol.replaceAll("_", "-")}-api-key`;
    return [baseSuffix, `${baseSuffix}-internal`];
  }
  return localAgentProviderPluginSuffixes[candidate.kind];
}

function localAgentProviderAlreadyImported(
  candidate: LocalAgentProviderCandidate,
  providers: GatewayProviderConfig[],
  providerPlugins: unknown[]
): boolean {
  const suffixes = localAgentProviderPluginSuffixesForCandidate(candidate);
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

type ProviderSetupStepId = "provider" | "credentials" | "models" | "verify";

const providerSetupStepIds: ProviderSetupStepId[] = ["provider", "credentials", "models", "verify"];

function ProviderSetupProgress({
  activeStep,
  className,
  credentialReady,
  modelsReady,
  onSelectStep,
  providerReady,
  variant = "block",
  verified
}: {
  activeStep?: ProviderSetupStepId;
  className?: string;
  credentialReady: boolean;
  modelsReady: boolean;
  onSelectStep?: (step: ProviderSetupStepId) => void;
  providerReady: boolean;
  variant?: "block" | "divider";
  verified: boolean;
}) {
  const t = useAppText();
  const steps = [
    { complete: providerReady, description: "Endpoint and identity", id: "provider" as const, label: "Choose provider" },
    { complete: credentialReady, description: "Secret used for requests", id: "credentials" as const, label: "Add credentials" },
    { complete: modelsReady, description: "Available model IDs", id: "models" as const, label: "Pick models" },
    { complete: verified, description: "Optional health check", id: "verify" as const, label: "Verify connection" }
  ];
  const firstIncompleteIndex = steps.findIndex((step) => !step.complete);
  const activeIndex = activeStep
    ? Math.max(0, steps.findIndex((step) => step.id === activeStep))
    : Math.max(0, firstIncompleteIndex);

  if (activeStep) {
    const progressPercent = ((activeIndex + 1) / steps.length) * 100;

    return (
      <div
        aria-label={`${t("Step")} ${activeIndex + 1} / ${steps.length}`}
        className={cn("min-w-0", variant === "divider" && "shrink-0", className)}
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={activeIndex + 1}
      >
        <div className={cn(
          "overflow-hidden bg-muted",
          variant === "divider" ? "h-0.5 bg-border" : "h-1.5 rounded-full"
        )}>
          <div
            className={cn("h-full bg-primary transition-[width]", variant === "block" && "rounded-full")}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2 rounded-md border border-border/70 bg-muted/15 p-2 sm:grid-cols-4",
        className
      )}
    >
      {steps.map((step, index) => {
        const complete = step.complete;
        const active = index === activeIndex;
        const className = cn(
          "flex min-h-11 min-w-0 items-center gap-2 rounded-[5px] border px-2 py-1.5 text-left",
          onSelectStep && "transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
          complete
            ? active
              ? "border-border bg-background text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              : "border-transparent bg-transparent text-foreground"
            : active
              ? "border-border bg-background text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              : "border-transparent bg-transparent text-muted-foreground"
        );
        const content = (
          <>
            <span className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
              complete
                ? "border-primary/25 bg-primary/10 text-primary"
                : active
                  ? "border-foreground/15 bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground"
            )}>
              {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold">{t(step.label)}</div>
              <div className="truncate text-[10.5px] leading-4 text-muted-foreground">
                {complete ? t("Done") : active ? t("In progress") : t("Pending")}
              </div>
            </div>
          </>
        );

        return onSelectStep ? (
          <button
            aria-current={active ? "step" : undefined}
            className={className}
            key={step.label}
            onClick={() => onSelectStep(step.id)}
            type="button"
          >
            {content}
          </button>
        ) : (
          <div aria-current={active ? "step" : undefined} className={className} key={step.label}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function ProviderFormStepHeader({
  description,
  index,
  title
}: {
  description: string;
  index: number;
  title: string;
}) {
  const t = useAppText();

  return (
    <div className="sm:col-span-2 flex min-w-0 items-start justify-between gap-3 pb-1">
      <div className="min-w-0 space-y-1">
        <div className="truncate text-[14px] font-semibold text-foreground">{title}</div>
        <p className="max-w-[540px] text-[12px] leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {index} / {providerSetupStepIds.length}
      </div>
    </div>
  );
}

function ProviderConnectionStatusPanel({
  className,
  connectivityLoading,
  connectivityProbe,
  hasConnectivityCheckInputs,
  localAgentImport,
  onCheck,
  probe,
  probeLoading
}: {
  className?: string;
  connectivityLoading: boolean;
  connectivityProbe?: GatewayProviderProbeResult;
  hasConnectivityCheckInputs: boolean;
  localAgentImport: boolean;
  onCheck?: () => Promise<unknown>;
  probe?: GatewayProviderProbeResult;
  probeLoading: boolean;
}) {
  const t = useAppText();
  const protocolDetected = providerProbeHasSupportedProtocol(probe) || Boolean(probe?.detectedProtocol);
  const connectionVerified = providerProbeHasSupportedProtocol(connectivityProbe);
  const protocolTitle = probeLoading
    ? "Detecting protocols"
    : localAgentImport
      ? "Local login provider"
      : protocolDetected
        ? "Protocols detected"
        : "Waiting for provider details";
  const protocolDescription = probeLoading
    ? "CCR is checking which API protocols this endpoint supports."
    : protocolDetected
      ? "Compatible API protocols were found automatically."
      : "Choose a provider endpoint so CCR can detect compatible protocols.";
  const requestTitle = connectivityLoading
    ? "Checking connection"
    : localAgentImport
      ? "Available after saving"
      : connectionVerified
        ? "Connection verified"
        : hasConnectivityCheckInputs
          ? "Not verified yet"
          : "Waiting for required fields";
  const requestDescription = connectivityLoading
    ? "CCR is sending a limited real model request."
    : localAgentImport
      ? "The imported local agent login is connected when this provider is saved."
      : connectionVerified
        ? "A real model request succeeded with the selected provider settings."
        : hasConnectivityCheckInputs
          ? "Run Check Connection before relying on this provider."
          : "API endpoint, API key, and at least one model are required before verification.";

  return (
    <div className={cn("rounded-md border border-border bg-muted/20 p-3", className)}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ProviderConnectionStatusRow
          description={t(protocolDescription)}
          loading={probeLoading}
          state={protocolDetected || localAgentImport ? "success" : "pending"}
          title={t(protocolTitle)}
        />
        <ProviderConnectionStatusRow
          description={t(requestDescription)}
          loading={connectivityLoading}
          state={connectionVerified || localAgentImport ? "success" : hasConnectivityCheckInputs ? "warning" : "pending"}
          title={t(requestTitle)}
        />
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
        <p className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">
          {t("Protocol detection checks compatibility; connection verification confirms a real model request succeeds.")}
        </p>
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
  );
}

function ProviderConnectionStatusRow({
  description,
  loading,
  state,
  title
}: {
  description: string;
  loading?: boolean;
  state: "pending" | "success" | "warning";
  title: string;
}) {
  return (
    <div className={cn(
      "flex min-w-0 items-start gap-2 rounded-md border bg-background px-3 py-2",
      state === "success" && "border-emerald-200",
      state === "warning" && "border-amber-200",
      state === "pending" && "border-border"
    )}>
      <span className={cn(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
        state === "success" && "bg-emerald-50 text-emerald-700",
        state === "warning" && "bg-amber-50 text-amber-700",
        state === "pending" && "bg-muted text-muted-foreground"
      )}>
        {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : state === "success" ? <Check className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

function ProviderApiKeyInput({
  onChange,
  resetProbe,
  value
}: {
  onChange: (value: string, resetProbe?: boolean) => void;
  resetProbe?: boolean;
  value: string;
}) {
  const t = useAppText();
  const [visible, setVisible] = useState(false);
  const label = visible ? "Hide API key" : "Show API key";

  return (
    <div className="relative min-w-0">
      <Input
        className="pr-9"
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value, resetProbe)}
      />
      <Button
        aria-label={t(label)}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
        onClick={() => setVisible((current) => !current)}
        onMouseDown={(event) => event.preventDefault()}
        size="iconSm"
        title={t(label)}
        type="button"
        variant="ghost"
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function ProviderCredentialModeTabs({
  onChange,
  value
}: {
  onChange: (value: AddProviderDraft["credentialMode"]) => void;
  value: AddProviderDraft["credentialMode"];
}) {
  const t = useAppText();
  const options: Array<{
    description: string;
    label: string;
    value: AddProviderDraft["credentialMode"];
  }> = [
    {
      description: "Use one key for every request.",
      label: "API key",
      value: "apiKey"
    },
    {
      description: "Use multiple keys with optional limits.",
      label: "Credential pool",
      value: "pool"
    }
  ];

  return (
    <div
      aria-label={t("Credential method")}
      className="grid grid-cols-1 gap-1 rounded-md border border-border bg-muted/20 p-1 sm:grid-cols-2"
      role="tablist"
    >
      {options.map((option) => {
        const selected = value === option.value;

        return (
          <button
            aria-selected={selected}
            className={cn(
              "min-w-0 rounded-[5px] px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
              selected
                ? "bg-background text-foreground shadow-card"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="tab"
            type="button"
          >
            <span className="block truncate text-[12px] font-semibold">{t(option.label)}</span>
            <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">{t(option.description)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AddProviderForm({
  activeStep,
  draft,
  error,
  connectivityLoading = false,
  connectivityProbe,
  importProvider,
  mode,
  onCheck,
  onChange,
  onIconDetectingChange,
  onSelectStep,
  probe,
  probeLoading,
  providerPlugins = [],
  providers
}: {
  activeStep?: ProviderSetupStepId;
  connectivityLoading?: boolean;
  connectivityProbe?: GatewayProviderProbeResult;
  draft: AddProviderDraft;
  error: string;
  importProvider?: ProviderDeepLinkPayload;
  mode: "add" | "edit";
  onCheck?: () => Promise<unknown>;
  onChange: (patch: Partial<AddProviderDraft>, resetProbe?: boolean) => void;
  onIconDetectingChange?: (detecting: boolean) => void;
  onSelectStep?: (step: ProviderSetupStepId) => void;
  probe?: GatewayProviderProbeResult;
  probeLoading: boolean;
  providerPlugins?: unknown[];
  providers: GatewayProviderConfig[];
}) {
  const t = useAppText();
  const [advancedOpen, setAdvancedOpen] = useState(mode === "edit");
  const [iconDetecting, setIconDetecting] = useState(false);
  const [autoDetectInfoPosition, setAutoDetectInfoPosition] = useState<{ left: number; top: number }>();
  const [protocolProbeDetails, setProtocolProbeDetails] = useState<ProviderProtocolProbeDetailsState>();
  const iconDetectionRequestRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const selectedPreset = findProviderPreset(draft.presetId);
  const customEndpoint = draft.presetId === customProviderPresetId;
  const importMode = Boolean(importProvider);
  const showBaseUrl = customEndpoint || mode === "edit";
  const selectedDisplayProtocols = uniqueProviderProtocols(draft.selectedProtocols);
  const detectedProtocol = selectedDisplayProtocols.length === 1
    ? selectedDisplayProtocols[0]
    : probe?.detectedProtocol ?? draft.protocol;
  const detectedBaseUrl = providerCapabilityBaseUrlForProtocol(draft.baseUrl, detectedProtocol, probe);
  const safetyIssue = providerDraftSafetyIssue(draft, detectedBaseUrl);
  const localAgentImport = draft.providerPlugins.length > 0;
  const manualProtocolDetection = draft.protocolDetectionMode === "manual";
  const providerPresetOptions = [
    { iconUrl: draft.icon, label: t("Other / custom API endpoint"), value: customProviderPresetId },
    ...getProviderPresets().map((preset) => ({ label: t(preset.name), preset, value: preset.id }))
  ];
  const selectableProtocols = manualProtocolDetection
    ? providerProtocolOptions.map((option) => option.value)
    : providerSelectableProtocolsFromProbe(probe);
  const protocolProbeRows = useMemo(() => uniqueProviderProbeProtocolRows(probe?.protocols ?? []), [probe]);
  const configuredModels = mergeProviderModelLists(draft.selectedModels, splitLines(draft.modelsText));
  const catalogModelIds = new Set(probe?.models ?? []);
  const credentialApiKey = providerConnectivityApiKeyFromDraft(draft);
  const credentialPoolReady = providerDraftHasReadyCredentialPool(draft);
  const hasConnectivityCheckInputs = Boolean(
    draft.baseUrl.trim() &&
    credentialApiKey &&
    configuredModels.length > 0
  );
  const providerIdentityReady = importMode || Boolean(selectedPreset || draft.baseUrl.trim());
  const credentialReady = localAgentImport || Boolean(
    draft.credentialMode === "pool"
      ? credentialPoolReady
      : draft.apiKey.trim()
  );
  const modelsReady = configuredModels.length > 0;
  const connectionVerified = localAgentImport || providerProbeHasSupportedProtocol(connectivityProbe);
  const showStep = (step: ProviderSetupStepId) => !activeStep || activeStep === step;

  function updateConfiguredModels(models: string[]) {
    onChange({
      modelsText: models.filter((model) => !catalogModelIds.has(model)).join("\n"),
      selectedModels: models.filter((model) => catalogModelIds.has(model))
    });
  }

  function updateAutoProtocolDetection(enabled: boolean) {
    onChange({
      protocolDetectionMode: enabled ? "auto" : "manual",
      selectedProtocols: !enabled && draft.selectedProtocols.length === 0
        ? [draft.protocol]
        : draft.selectedProtocols
    }, true);
  }

  function updateCredentialMode(credentialMode: AddProviderDraft["credentialMode"]) {
    if (credentialMode === draft.credentialMode) {
      return;
    }
    onChange({
      credentialMode,
      ...(credentialMode === "pool" && draft.credentials.length === 0
        ? { credentials: [createProviderCredentialDraft(0)] }
        : {})
    }, true);
  }

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setProtocolProbeDetails(undefined);
  }, [probe]);

  useEffect(() => {
    if (!autoDetectInfoPosition && !protocolProbeDetails) {
      return;
    }
    const close = () => {
      setAutoDetectInfoPosition(undefined);
      setProtocolProbeDetails(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [autoDetectInfoPosition, protocolProbeDetails]);

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
        catalogModelMetadata: undefined,
        icon: "",
        modelDescriptions: undefined,
        modelDisplayNames: undefined,
        modelMetadata: undefined,
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
        catalogModelMetadata: undefined,
        icon: "",
        modelDescriptions: undefined,
        modelDisplayNames: undefined,
        modelMetadata: undefined,
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
    const previousPreset = findProviderPreset(draft.presetId);
    const generatedName = providerDraftNameShouldFollowPreset(draft.name, previousPreset, t);
    const accountDraft = createProviderAccountDraftFromConfig(defaultProviderAccountConfigForPreset(presetId));
    onChange({
      ...accountDraft,
      baseUrl: endpoint?.baseUrl ?? "",
      catalogModelMetadata: undefined,
      icon: "",
      modelDescriptions: undefined,
      modelDisplayNames: preset?.defaultModelDisplayNames,
      modelMetadata: undefined,
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

  function toggleProtocolProbeDetails(
    itemKey: string,
    item: GatewayProviderProbeResult["protocols"][number],
    button: HTMLButtonElement
  ) {
    const rect = button.getBoundingClientRect();
    const position = providerProtocolProbeTooltipPosition(rect);
    setAutoDetectInfoPosition(undefined);
    setProtocolProbeDetails((current) => current?.key === itemKey ? undefined : {
      item,
      key: itemKey,
      ...position
    });
  }

  function toggleAutoDetectInfo(button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    const position = providerProtocolProbeTooltipPosition(rect);
    setProtocolProbeDetails(undefined);
    setAutoDetectInfoPosition((current) =>
      current && current.left === position.left && current.top === position.top ? undefined : position
    );
  }

  return (
    <>
      <div className={cn(activeStep ? "space-y-5" : "grid grid-cols-1 gap-4 sm:grid-cols-2")}>
        {!activeStep ? (
          <ProviderSetupProgress
            className="sm:col-span-2"
            credentialReady={credentialReady}
            modelsReady={modelsReady}
            onSelectStep={onSelectStep}
            providerReady={providerIdentityReady}
            verified={connectionVerified}
          />
        ) : null}
        <div
          className={cn(
            "min-w-0",
            activeStep
              ? activeStep === "models"
                ? "mx-auto w-full max-w-[980px] space-y-4 py-1"
                : "mx-auto w-full max-w-[560px] space-y-4 py-1"
              : "grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2"
          )}
        >
        {showStep("provider") ? (
          <>
            <ProviderFormStepHeader
              description={t("Pick a preset provider or use a custom compatible API endpoint.")}
              index={1}
              title={t("Choose provider")}
            />
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
                <div className="block min-w-0 space-y-1 sm:col-span-2">
                  <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("Select preset provider")}</span>
                  <ProviderPresetCombobox
                    value={draft.presetId}
                    onChange={updatePreset}
                    options={providerPresetOptions}
                  />
                </div>
              </>
            )}
            <Field className="sm:col-span-2" label={t("Name")}>
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
          </>
        ) : null}
        {showStep("credentials") ? (
          <>
            <ProviderFormStepHeader
              description={t("Choose how this provider authenticates model requests.")}
              index={2}
              title={t("Add credentials")}
            />
            <div className="sm:col-span-2 space-y-4">
              <ProviderCredentialModeTabs
                value={draft.credentialMode}
                onChange={updateCredentialMode}
              />
              {draft.credentialMode === "apiKey" ? (
                <div className="space-y-3">
                  <Field label={t("API key")}>
                    <ProviderApiKeyInput
                      value={draft.apiKey}
                      onChange={(apiKey, resetProbe) => onChange({ apiKey }, resetProbe)}
                      resetProbe
                    />
                  </Field>
                  {safetyIssue ? (
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-900 dark:text-amber-100">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{safetyIssue.message}</span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <ProviderCredentialSettings
                    draft={draft}
                    onChange={onChange}
                  />
                  {safetyIssue ? (
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-900 dark:text-amber-100">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{safetyIssue.message}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </>
        ) : null}
        {showStep("models") ? (
          <>
            <ProviderFormStepHeader
              description={t("Choose the models that should be available through this provider.")}
              index={3}
              title={t("Pick models")}
            />
            <div className="sm:col-span-2">
              <ProviderModelPicker
                catalogModels={probe?.models ?? []}
                defaults={draft.catalogModelMetadata}
                displayNames={draft.modelDisplayNames}
                loading={probeLoading}
                metadata={draft.modelMetadata}
                onMetadataChange={(modelMetadata) => onChange({ modelMetadata })}
                onQueryChange={(modelSearch) => onChange({ modelSearch })}
                onSelectedChange={updateConfiguredModels}
                query={draft.modelSearch}
                selected={configuredModels}
              />
            </div>
          </>
        ) : null}
        {showStep("verify") ? (
          <>
            <ProviderFormStepHeader
              description={t("Run a real model request before relying on this provider.")}
              index={4}
              title={t("Verify connection")}
            />
            <ProviderConnectionStatusPanel
              className="sm:col-span-2"
              connectivityLoading={connectivityLoading}
              connectivityProbe={connectivityProbe}
              hasConnectivityCheckInputs={hasConnectivityCheckInputs}
              localAgentImport={localAgentImport}
              onCheck={onCheck}
              probe={probe}
              probeLoading={probeLoading}
            />

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
                <div className="sm:col-span-2 flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-[12px] font-semibold">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate">{t("Auto detect protocols")}</span>
                    <button
                      aria-label={t("Auto detect protocols info")}
                      aria-pressed={Boolean(autoDetectInfoPosition)}
                      className={cn(
                        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30",
                        autoDetectInfoPosition && "bg-muted text-foreground"
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleAutoDetectInfo(event.currentTarget);
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      title={t("Auto detect protocols info")}
                      type="button"
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                  <Switch
                    aria-label={t("Auto detect protocols")}
                    checked={!manualProtocolDetection}
                    onCheckedChange={updateAutoProtocolDetection}
                  />
                </div>
                <ProviderUsageSettings
                  customEndpoint={customEndpoint}
                  draft={draft}
                  onChange={onChange}
                  probe={probe}
                />
                <Field className="sm:col-span-2" label={t("Protocol details")}>
                  <div className="max-h-[128px] overflow-auto rounded-md border border-border bg-background p-2">
                    {manualProtocolDetection ? (
                      <div className="space-y-1.5">
                        {providerProtocolOptions.map((option) => {
                          const protocol = option.value;
                          const checked = draft.selectedProtocols.includes(protocol);
                          return (
                            <div className="grid grid-cols-[20px_minmax(118px,1fr)_minmax(88px,max-content)] items-center gap-2 text-[11px]" key={protocol}>
                              <Checkbox
                                aria-label={`${t("Add")} ${translatedProviderProtocolLabel(protocol, t)}`}
                                checked={checked}
                                onCheckedChange={() => {
                                  onChange({
                                    selectedProtocols: checked
                                      ? draft.selectedProtocols.filter((selected) => selected !== protocol)
                                      : uniqueProviderProtocols([...draft.selectedProtocols, protocol])
                                  });
                                }}
                              />
                              <span className="truncate font-medium">{translatedProviderProtocolLabel(protocol, t)}</span>
                              <span className={cn("inline-flex min-w-0 items-center justify-end", checked ? "text-foreground" : "text-muted-foreground")}>
                                <span className="truncate">{checked ? t("Selected") : ""}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : protocolProbeRows.length ? (
                      <div className="space-y-1.5">
                        {protocolProbeRows.map((item) => {
                          const available = item.supported;
                          const selectableProtocol = selectableProtocols.find((protocol) => protocol === item.protocol);
                          const selectable = item.supported && Boolean(selectableProtocol);
                          const checked = Boolean(selectableProtocol && draft.selectedProtocols.includes(selectableProtocol));
                          const itemKey = `${item.protocol}-${item.endpoint}`;
                          return (
                            <div className="grid grid-cols-[20px_minmax(118px,1fr)_minmax(88px,max-content)] items-center gap-2 text-[11px]" key={itemKey}>
                              <Checkbox
                                aria-label={`${t("Add")} ${translatedProviderProtocolLabel(item.protocol, t)}`}
                                checked={checked}
                                disabled={!selectable}
                                onCheckedChange={() => {
                                  if (!selectableProtocol) {
                                    return;
                                  }
                                  onChange({
                                    selectedProtocols: checked
                                      ? draft.selectedProtocols.filter((protocol) => protocol !== selectableProtocol)
                                      : uniqueProviderProtocols([...draft.selectedProtocols, selectableProtocol])
                                  });
                                }}
                              />
                              <span className="truncate font-medium">{translatedProviderProtocolLabel(item.protocol, t)}</span>
                              <span className={cn("inline-flex min-w-0 items-center justify-end gap-1.5", available ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground")}>
                                <span className="truncate">{available ? t("Available") : t("Unavailable")}</span>
                                <button
                                  aria-label={t("Protocol detection details")}
                                  aria-pressed={protocolProbeDetails?.key === itemKey}
                                  className={cn(
                                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30",
                                    protocolProbeDetails?.key === itemKey && "bg-muted text-foreground"
                                  )}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleProtocolProbeDetails(itemKey, item, event.currentTarget);
                                  }}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  title={t("Protocol detection details")}
                                  type="button"
                                >
                                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </span>
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
            {protocolProbeDetails ? (
              <ProtocolProbeDetailsTooltip
                item={protocolProbeDetails.item}
                left={protocolProbeDetails.left}
                top={protocolProbeDetails.top}
                t={t}
              />
            ) : null}
            {autoDetectInfoPosition ? (
              <AutoDetectProtocolsTooltip
                left={autoDetectInfoPosition.left}
                t={t}
                top={autoDetectInfoPosition.top}
              />
            ) : null}
          </>
        ) : null}
        </div>
      </div>

      {error ? <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span></div> : null}
    </>
  );
}

function AutoDetectProtocolsTooltip({
  left,
  t,
  top
}: {
  left: number;
  t: (value: string) => string;
  top: number;
}) {
  return (
    <div
      className="fixed z-[120] w-[260px] rounded-md border border-border bg-popover p-2.5 text-left text-[11px] leading-4 text-popover-foreground shadow-card-elevated"
      onMouseDown={(event) => event.stopPropagation()}
      role="tooltip"
      style={{ left, top }}
    >
      <div className="mb-1.5 font-semibold">{t("Auto detect protocols")}</div>
      <div className="text-muted-foreground">{t("Auto detect protocols description")}</div>
    </div>
  );
}

type ProviderProtocolProbeDetailsState = {
  item: GatewayProviderProbeResult["protocols"][number];
  key: string;
  left: number;
  top: number;
};

function uniqueProviderProbeProtocolRows(
  protocols: GatewayProviderProbeResult["protocols"]
): GatewayProviderProbeResult["protocols"] {
  const rows = new Map<string, GatewayProviderProbeResult["protocols"][number]>();
  for (const item of protocols) {
    const key = `${item.protocol}\n${item.endpoint}`;
    const current = rows.get(key);
    if (!current || (!current.supported && item.supported)) {
      rows.set(key, item);
    }
  }
  return [...rows.values()];
}

function providerProtocolProbeTooltipPosition(rect: DOMRect): { left: number; top: number } {
  const margin = 12;
  const tooltipWidth = 260;
  const tooltipHeight = 160;
  const left = Math.min(
    Math.max(margin, rect.right - tooltipWidth),
    window.innerWidth - tooltipWidth - margin
  );
  const below = rect.bottom + 8;
  const above = rect.top - tooltipHeight - 8;
  const top = below + tooltipHeight > window.innerHeight && above > margin
    ? above
    : Math.min(below, window.innerHeight - tooltipHeight - margin);
  return {
    left,
    top: Math.max(margin, top)
  };
}

function ProtocolProbeDetailsTooltip({
  item,
  left,
  t,
  top
}: {
  item: GatewayProviderProbeResult["protocols"][number];
  left: number;
  t: (value: string) => string;
  top: number;
}) {
  const status = item.status === undefined ? "-" : `HTTP ${item.status}`;
  const message = translateProbeProtocolMessage(item.message, t) || "-";

  return (
    <div
      className="fixed z-[120] w-[260px] rounded-md border border-border bg-popover p-2.5 text-left text-[11px] leading-4 text-popover-foreground shadow-card-elevated"
      onMouseDown={(event) => event.stopPropagation()}
      role="tooltip"
      style={{ left, top }}
    >
      <div className="mb-1.5 font-semibold">{t("Protocol detection details")}</div>
      <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-2 gap-y-1">
        <span className="text-muted-foreground">{t("HTTP status")}</span>
        <span className="min-w-0 truncate font-mono">{status}</span>
        <span className="text-muted-foreground">{t("Error message")}</span>
        <span className="min-w-0 break-words">{message}</span>
      </div>
    </div>
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
  const [importError, setImportError] = useState("");

  function addCredential() {
    onChange({
      credentials: [
        ...draft.credentials,
        createProviderCredentialDraft(draft.credentials.length)
      ]
    }, true);
    setImportError("");
  }

  function updateCredential(index: number, patch: Partial<ProviderCredentialDraft>) {
    onChange({
      credentials: draft.credentials.map((credential, credentialIndex) =>
        credentialIndex === index ? { ...credential, ...patch } : credential
      )
    }, true);
  }

  function removeCredential(index: number) {
    onChange({
      credentials: draft.credentials.filter((_, credentialIndex) => credentialIndex !== index)
    }, true);
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
      onChange(patch, true);
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
    <div className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Label className="text-[12px] font-semibold">{t("Pool keys")}</Label>
          <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t("Use multiple API keys with optional priorities, weights, and limits.")}</div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
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
          <ProviderApiKeyInput
            value={credential.apiKey}
            onChange={(apiKey) => onChange({ apiKey })}
          />
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
  const [newApiUserId, setNewApiUserId] = useState("");
  const modeOptions = translateOptions(providerAccountModeOptions, t);
  const globalBaseUrl = providerGlobalBaseUrlForProbe(draft.baseUrl, probe, draft.selectedProtocols);
  const usageApiKey = providerConnectivityApiKeyFromDraft(draft);
  const showNewApiUserBalanceTemplate = probe?.detectedProvider === "new-api" ||
    draft.accountConnectorsText.includes("new-api-key-usage") ||
    draft.accountConnectorsText.includes("new-api-user-self");

  useEffect(() => {
    setTestResult(undefined);
    setTestError("");
  }, [draft.accountMode, draft.usageRequestUrl, draft.usageRequestMethod]);

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
      apiKey: usageApiKey,
      baseUrl: globalBaseUrl,
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
        apiKey: usageApiKey,
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

  function selectPath(target: ProviderUsageFieldTarget, path: string) {
    onChange(providerUsageFieldPatch(target, path));
  }

  function insertNewApiUserBalanceTemplate() {
    onChange({
      accountConnectorsText: providerAccountConnectorsTextWithNewApiUserBalanceTemplate(
        draft.accountConnectorsText,
        globalBaseUrl,
        newApiUserId
      )
    });
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
            <div className="sm:col-span-2 space-y-2">
              <Field label={t("Connectors JSON")}>
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
              {showNewApiUserBalanceTemplate ? (
                <div className="grid grid-cols-1 items-end gap-2 rounded-md border border-border/60 bg-muted/20 p-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 space-y-1">
                    <Label className="text-[11px] font-medium text-muted-foreground">{t("New API user ID")}</Label>
                    <Input
                      placeholder="<user-id>"
                      value={newApiUserId}
                      onChange={(event) => setNewApiUserId(event.target.value)}
                    />
                  </div>
                  <Button size="sm" type="button" variant="outline" onClick={insertNewApiUserBalanceTemplate}>
                    {t("Insert New API user balance")}
                  </Button>
                </div>
              ) : null}
            </div>
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
  const [activeStep, setActiveStep] = useState<ProviderSetupStepId>("provider");
  const checkModels = mergeProviderModelLists(draft.selectedModels, splitLines(draft.modelsText));
  const submitLoading = probeLoading || connectivityLoading || iconDetecting || submitting;
  const submitDisabled = !canSubmit || submitLoading;
  const wizardMode = mode === "add";
  const selectedPreset = findProviderPreset(draft.presetId);
  const localAgentImport = draft.providerPlugins.length > 0;
  const providerIdentityReady = Boolean(importProvider) || Boolean(selectedPreset || draft.baseUrl.trim());
  const credentialPoolReady = providerDraftHasReadyCredentialPool(draft);
  const credentialReady = localAgentImport || Boolean(
    draft.credentialMode === "pool"
      ? credentialPoolReady
      : draft.apiKey.trim()
  );
  const modelsReady = checkModels.length > 0;
  const activeStepIndex = Math.max(0, providerSetupStepIds.indexOf(activeStep));
  const previousStep = wizardMode ? providerSetupStepIds[activeStepIndex - 1] : undefined;
  const nextStep = wizardMode ? providerSetupStepIds[activeStepIndex + 1] : undefined;
  const nextDisabled = submitting || !providerDialogStepReady(activeStep);
  const finalWizardSubmit = wizardMode && !nextStep && mode === "add";

  useEffect(() => {
    if (!wizardMode || providerDialogStepUnlocked(activeStep)) {
      return;
    }
    const latestUnlockedStep = [...providerSetupStepIds].reverse().find(providerDialogStepUnlocked) ?? "provider";
    setActiveStep(latestUnlockedStep);
  }, [activeStep, credentialReady, modelsReady, providerIdentityReady, wizardMode]);

  function providerDialogStepReady(step: ProviderSetupStepId): boolean {
    switch (step) {
      case "provider":
        return providerIdentityReady;
      case "credentials":
        return credentialReady;
      case "models":
        return modelsReady;
      case "verify":
        return true;
    }
  }

  function providerDialogStepUnlocked(step: ProviderSetupStepId): boolean {
    switch (step) {
      case "provider":
        return true;
      case "credentials":
        return providerIdentityReady;
      case "models":
        return providerIdentityReady && credentialReady;
      case "verify":
        return providerIdentityReady && credentialReady && modelsReady;
    }
  }

  function selectSetupStep(step: ProviderSetupStepId) {
    if (providerDialogStepUnlocked(step)) {
      setActiveStep(step);
    }
  }

  function goToNextStep() {
    if (!nextStep || nextDisabled) {
      return;
    }
    setActiveStep(nextStep);
  }

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
      <Dialog onOpenChange={(open) => !open && !submitting && onClose()}>
        <DialogContent
          className={cn(
            "origin-center border-border/70 bg-background shadow-[0_18px_70px_rgba(15,23,42,0.16)]",
            wizardMode
              ? "h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-h-none max-w-none sm:h-[min(760px,calc(100dvh-3rem))] sm:w-[min(1040px,calc(100vw-3rem))]"
              : "h-[calc(100dvh-1.5rem-clamp(8px,2dvh,20px))] max-w-[820px] sm:h-[min(860px,calc(100dvh-3rem-clamp(8px,3dvh,28px)))]"
          )}
        >
          <DialogHeader className={cn("h-11", wizardMode && "border-b-0")}>
            <DialogTitle>{title ?? (mode === "edit" ? t("Edit Provider") : t("Add Provider"))}</DialogTitle>
            <Button aria-label={t("Close dialog")} disabled={submitting} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>
          {wizardMode ? (
            <ProviderSetupProgress
              activeStep={activeStep}
              className="w-full"
              credentialReady={credentialReady}
              modelsReady={modelsReady}
              providerReady={providerIdentityReady}
              variant="divider"
              verified={localAgentImport || providerProbeHasSupportedProtocol(connectivityProbe)}
            />
          ) : null}

          <DialogBody className="bg-background px-5 py-4">
            <AddProviderForm
              activeStep={wizardMode ? activeStep : undefined}
              connectivityLoading={connectivityLoading}
              connectivityProbe={connectivityProbe}
              draft={draft}
              error={error}
              importProvider={importProvider}
              mode={mode}
              onCheck={onCheck ? async () => openCheckConfirm() : undefined}
              onChange={onChange}
              onIconDetectingChange={setIconDetecting}
              onSelectStep={wizardMode ? selectSetupStep : undefined}
              probe={probe}
              probeLoading={probeLoading}
              providerPlugins={providerPlugins}
              providers={providers}
            />
          </DialogBody>

          <DialogFooter className={cn("px-5 py-3", wizardMode && previousStep && "justify-between")}>
            {wizardMode && previousStep ? (
              <Button disabled={submitting} onClick={() => setActiveStep(previousStep)} type="button" variant="outline">
                <ChevronLeft className="h-4 w-4" />
                {t("Previous")}
              </Button>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              {wizardMode && nextStep ? (
                <Button disabled={nextDisabled} onClick={goToNextStep} type="button">
                  {t("Next")}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button disabled={submitDisabled} onClick={() => void submit()} type="button">
                  <AnimatedIconSwap iconKey={submitLoading ? "loading" : finalWizardSubmit ? "done" : mode}>
                    {submitLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : mode === "edit" || finalWizardSubmit ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </AnimatedIconSwap>
                  {submitLoading ? t("Loading") : submitLabel ?? (finalWizardSubmit ? t("Done") : mode === "edit" ? t("Save") : t("Add"))}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {checkConfirmOpen ? (
        <Dialog className="z-[110]" onOpenChange={(open) => !open && !checkConfirmBusy && setCheckConfirmOpen(false)}>
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

const providerReasoningLevelOptions = [
  { description: "Low", effort: "low", label: "Low" },
  { description: "Medium", effort: "medium", label: "Medium" },
  { description: "High", effort: "high", label: "High" },
  { description: "Extra high", effort: "xhigh", label: "Extra high" },
  { description: "Max", effort: "max", label: "Max" },
  { description: "Ultra", effort: "ultra", label: "Ultra" }
] as const;

function ProviderModelPicker({
  catalogModels,
  defaults,
  displayNames,
  loading = false,
  metadata,
  onMetadataChange,
  onQueryChange,
  onSelectedChange,
  query,
  selected
}: {
  catalogModels: string[];
  defaults?: NonNullable<AddProviderDraft["catalogModelMetadata"]>;
  displayNames?: Record<string, string>;
  loading?: boolean;
  metadata?: NonNullable<AddProviderDraft["modelMetadata"]>;
  onMetadataChange: (value: AddProviderDraft["modelMetadata"]) => void;
  onQueryChange: (value: string) => void;
  onSelectedChange: (value: string[]) => void;
  query: string;
  selected: string[];
}) {
  const t = useAppText();
  const [addedQuery, setAddedQuery] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customModelEditing, setCustomModelEditing] = useState(false);
  const [customModelReturning, setCustomModelReturning] = useState(false);
  const [addedControlsWidth, setAddedControlsWidth] = useState(136);
  const addedControlsRef = useRef<HTMLDivElement>(null);
  const customModelInputRef = useRef<HTMLInputElement>(null);
  const catalog = mergeProviderModelLists(catalogModels);
  const selectedModels = mergeProviderModelLists(selected);
  const selectedModelSet = new Set(selectedModels);
  const sourceQuery = query.trim().toLowerCase();
  const targetQuery = addedQuery.trim().toLowerCase();
  const visibleCatalogModels = sourceQuery
    ? catalog.filter((model) => providerModelMatchesSearch(model, sourceQuery, displayNames))
    : catalog;
  const visibleAddedModels = targetQuery
    ? selectedModels.filter((model) => providerModelMatchesSearch(model, targetQuery, displayNames))
    : selectedModels;
  const trimmedCustomModel = customModel.trim();
  const customModelExists = selectedModels.some((model) => model.toLowerCase() === trimmedCustomModel.toLowerCase());
  const canAddCustomModel = Boolean(trimmedCustomModel && !customModelExists);
  const customModelButtonWidth = 136;
  const customModelControlGap = 8;
  const customModelEditorWidth = Math.max(customModelButtonWidth, addedControlsWidth);
  const returningSearchWidth = Math.max(0, customModelEditorWidth - customModelButtonWidth - customModelControlGap);

  function addCatalogModel(model: string) {
    if (selectedModelSet.has(model)) {
      return;
    }
    onSelectedChange(mergeProviderModelLists(selectedModels, [model]));
  }

  function addCustomModel() {
    if (!canAddCustomModel) {
      return;
    }
    onSelectedChange(mergeProviderModelLists(selectedModels, [trimmedCustomModel]));
    setCustomModel("");
    closeCustomModelEditor();
  }

  function cancelCustomModel() {
    setCustomModel("");
    closeCustomModelEditor();
  }

  function closeCustomModelEditor() {
    setCustomModelReturning(true);
    setCustomModelEditing(false);
  }

  function removeModel(model: string) {
    onSelectedChange(selectedModels.filter((item) => item !== model));
    if (!metadata?.[model]) {
      return;
    }
    const nextMetadata = { ...metadata };
    delete nextMetadata[model];
    onMetadataChange(Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined);
  }

  useClientLayoutEffect(() => {
    const node = addedControlsRef.current;
    if (!node) {
      return;
    }
    const updateWidth = () => {
      setAddedControlsWidth(Math.max(136, Math.round(node.getBoundingClientRect().width)));
    };
    updateWidth();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updateWidth);
    observer?.observe(node);
    window.addEventListener("resize", updateWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [loading]);

  useEffect(() => {
    if (!customModelEditing) {
      return;
    }
    const focusTimer = window.setTimeout(() => customModelInputRef.current?.focus(), 140);
    return () => window.clearTimeout(focusTimer);
  }, [customModelEditing]);

  return (
    <div className="grid grid-cols-1 gap-3 lg:h-[min(500px,calc(100dvh-300px))] lg:min-h-[360px] lg:grid-cols-[minmax(0,1fr)_34px_minmax(0,1fr)]">
      <section className="flex h-[360px] min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card lg:h-full lg:min-h-0">
        <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold">{t("Provider models")}</div>
            <div className="truncate text-[11px] text-muted-foreground">{t("Models detected from this provider")}</div>
          </div>
          <Badge variant="outline">{loading ? <LoaderCircle className="h-3 w-3 animate-spin" /> : catalog.length}</Badge>
        </div>
        {!loading ? (
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t("Search provider models")}
                className="pl-8"
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={t("Search provider models")}
                value={query}
              />
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {loading ? (
            <ProviderModelListSkeleton />
          ) : visibleCatalogModels.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-[12px] text-muted-foreground">
              {catalog.length === 0 ? t("No provider models") : t("No matching models")}
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleCatalogModels.map((model) => {
                const label = displayNames?.[model]?.trim() || model;
                const added = selectedModelSet.has(model);
                return (
                  <button
                    className={cn(
                      "flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
                      added ? "text-muted-foreground" : "hover:bg-muted/50 hover:text-foreground"
                    )}
                    disabled={added}
                    key={model}
                    onClick={() => addCatalogModel(model)}
                    title={model}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-foreground">{label}</span>
                      {label !== model ? <span className="block truncate font-mono text-[10px] text-muted-foreground">{model}</span> : null}
                    </span>
                    {added ? (
                      <Badge variant="secondary">
                        <Check className="h-3 w-3" />
                        {t("Added")}
                      </Badge>
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="hidden min-h-0 items-center justify-center lg:flex" aria-hidden="true">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/30 text-muted-foreground shadow-sm">
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>

      <section className="flex h-[360px] min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card lg:h-full lg:min-h-0">
        <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold">{t("Added models")}</div>
            <div className="truncate text-[11px] text-muted-foreground">{t("Click a model to edit settings")}</div>
          </div>
          <Badge variant={selectedModels.length > 0 ? "secondary" : "outline"}>{selectedModels.length}</Badge>
        </div>
        {!loading ? (
          <div className="border-b border-border p-2">
            <div className="relative h-9 min-w-0" ref={addedControlsRef}>
              <AnimatePresence initial={false} mode="wait">
                {customModelEditing ? (
                <motion.div
                  animate={{ opacity: 1, width: customModelEditorWidth }}
                  className="absolute inset-y-0 right-0 flex items-center gap-1 overflow-hidden rounded-md border border-input bg-background px-1 shadow-sm"
                  exit={{ opacity: 0, width: customModelEditorWidth }}
                  initial={{ opacity: 0.92, width: customModelButtonWidth }}
                  key="custom-model-input"
                  transition={{
                    opacity: { duration: 0.12 },
                    width: { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
                  }}
                >
                  <Input
                    aria-label={t("Custom model")}
                    aria-invalid={customModelExists && trimmedCustomModel ? true : undefined}
                    className="h-7 min-w-0 flex-1 border-0 bg-transparent px-2 font-mono text-[12px] shadow-none focus-visible:ring-0"
                    onChange={(event) => setCustomModel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && canAddCustomModel) {
                        event.preventDefault();
                        addCustomModel();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelCustomModel();
                      }
                    }}
                    placeholder={customModelExists && trimmedCustomModel ? t("Model already added") : t("Custom model")}
                    ref={customModelInputRef}
                    title={customModelExists && trimmedCustomModel ? t("Model already added") : undefined}
                    value={customModel}
                  />
                  <Button
                    aria-label={t("Cancel custom model")}
                    className="h-7 w-7 shrink-0"
                    onClick={cancelCustomModel}
                    size="iconSm"
                    title={t("Cancel custom model")}
                    type="button"
                    variant="ghost"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    aria-label={t("Add custom model")}
                    className="h-7 w-7 shrink-0"
                    disabled={!canAddCustomModel}
                    onClick={addCustomModel}
                    size="iconSm"
                    title={t("Add custom model")}
                    type="button"
                    variant="ghost"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </motion.div>
                ) : customModelReturning ? (
                <motion.div
                  animate={{ opacity: 1 }}
                  className="absolute inset-y-0 left-0 flex items-center gap-2"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 1 }}
                  key="search-returning"
                  transition={{ duration: 0.12 }}
                >
                  <motion.div
                    animate={{ width: returningSearchWidth }}
                    className="relative min-w-0 shrink-0 overflow-hidden"
                    initial={{ width: 0 }}
                    onAnimationComplete={() => setCustomModelReturning(false)}
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label={t("Search added models")}
                      className="pl-8"
                      onChange={(event) => setAddedQuery(event.target.value)}
                      placeholder={t("Search added models")}
                      value={addedQuery}
                    />
                  </motion.div>
                  <button
                    className="inline-flex h-9 w-[136px] shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-[12px] font-medium text-foreground outline-none transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring/25"
                    onClick={() => {
                      setCustomModelReturning(false);
                      setCustomModelEditing(true);
                    }}
                    title={t("Custom model")}
                    type="button"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="truncate">{t("Custom model")}</span>
                  </button>
                </motion.div>
                ) : (
                <motion.div
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 flex min-w-0 items-center gap-2"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  key="search-and-custom-button"
                  transition={{ duration: 0.12 }}
                >
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label={t("Search added models")}
                      className="pl-8"
                      onChange={(event) => setAddedQuery(event.target.value)}
                      placeholder={t("Search added models")}
                      value={addedQuery}
                    />
                  </div>
                  <button
                    className="inline-flex h-9 w-[136px] shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-[12px] font-medium text-foreground outline-none transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring/25"
                    onClick={() => {
                      setCustomModelReturning(false);
                      setCustomModelEditing(true);
                    }}
                    title={t("Custom model")}
                    type="button"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="truncate">{t("Custom model")}</span>
                  </button>
                </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {loading ? (
            <ProviderModelListSkeleton compact />
          ) : (
            <ModelMetadataEditor
              defaults={defaults}
              displayNames={displayNames}
              emptyLabel={selectedModels.length === 0 ? t("No models added") : t("No matching models")}
              header={false}
              metadata={metadata}
              models={visibleAddedModels}
              onChange={onMetadataChange}
              onRemoveModel={removeModel}
              sourceModels={catalog}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function ProviderModelListSkeleton({ compact = false }: { compact?: boolean }) {
  const t = useAppText();

  return (
    <div aria-busy="true" aria-label={t("Loading provider models")} className="space-y-1.5">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2"
          key={index}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className={cn(
              "provider-skeleton-shimmer h-3 rounded-full",
              index % 3 === 0 ? "w-7/12" : index % 3 === 1 ? "w-9/12" : "w-5/12"
            )} />
            {!compact && index % 2 === 0 ? <div className="provider-skeleton-shimmer h-2 w-4/12 rounded-full" /> : null}
          </div>
          <div className="provider-skeleton-shimmer h-4 w-4 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function providerModelMatchesSearch(model: string, normalizedQuery: string, displayNames?: Record<string, string>): boolean {
  if (!normalizedQuery) {
    return true;
  }
  return model.toLowerCase().includes(normalizedQuery) ||
    (displayNames?.[model] ?? "").toLowerCase().includes(normalizedQuery);
}

function ModelMetadataEditor({
  className,
  defaults,
  displayNames,
  emptyLabel,
  header = true,
  metadata,
  models,
  onChange,
  onRemoveModel,
  sourceModels
}: {
  className?: string;
  defaults?: NonNullable<AddProviderDraft["catalogModelMetadata"]>;
  displayNames?: Record<string, string>;
  emptyLabel?: string;
  header?: boolean;
  metadata?: NonNullable<AddProviderDraft["modelMetadata"]>;
  models: string[];
  onChange: (value: AddProviderDraft["modelMetadata"]) => void;
  onRemoveModel?: (model: string) => void;
  sourceModels?: string[];
}) {
  const t = useAppText();
  const normalizedModels = mergeProviderModelLists(models);
  const sourceModelSet = new Set(sourceModels ?? Object.keys(defaults ?? {}));
  const [expandedModels, setExpandedModels] = useState<Set<string>>(() => new Set());
  if (normalizedModels.length === 0) {
    return emptyLabel ? (
      <div className={cn("rounded-md border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-[12px] text-muted-foreground", className)}>
        {emptyLabel}
      </div>
    ) : null;
  }

  type Metadata = NonNullable<AddProviderDraft["modelMetadata"]>[string];
  type CapabilityKey = keyof NonNullable<Metadata["capabilities"]>;
  type PricingKey = keyof NonNullable<Metadata["pricing"]>;

  function updateMetadata(model: string, updater: (current: Metadata) => Metadata) {
    const next = { ...(metadata ?? {}) };
    const updated = updater({ ...(next[model] ?? {}) });
    if (Object.keys(updated).length > 0) {
      next[model] = updated;
    } else {
      delete next[model];
    }
    onChange(Object.keys(next).length > 0 ? next : undefined);
  }

  function updateContextWindow(model: string, rawValue: string) {
    updateMetadata(model, (current) => {
      const next = { ...current };
      const parsed = optionalPositiveInteger(rawValue);
      if (parsed === undefined) {
        delete next.contextWindow;
        delete next.maxContextWindow;
      } else {
        next.contextWindow = parsed;
        next.maxContextWindow = parsed;
      }
      return next;
    });
  }

  function resetContextWindow(model: string) {
    updateMetadata(model, (current) => {
      const next = { ...current };
      delete next.contextWindow;
      delete next.maxContextWindow;
      return next;
    });
  }

  function updatePricing(model: string, key: PricingKey, rawValue: string) {
    updateMetadata(model, (current) => {
      const pricing = { ...(defaults?.[model]?.pricing ?? {}), ...(current.pricing ?? {}) };
      const parsed = optionalNonNegativeNumber(rawValue);
      if (parsed === undefined) delete pricing[key];
      else pricing[key] = parsed;
      if (key === "cacheWrite5mUsdPerMillionTokens") {
        delete pricing.cacheWriteUsdPerMillionTokens;
      }
      const next = { ...current };
      if (Object.keys(pricing).length > 0) next.pricing = pricing;
      else delete next.pricing;
      return next;
    });
  }

  function resetPricing(model: string) {
    updateMetadata(model, (current) => {
      const next = { ...current };
      delete next.pricing;
      return next;
    });
  }

  function updateReasoningLevel(model: string, effort: string, checked: boolean) {
    updateMetadata(model, (current) => {
      const selected = new Set(
        (current.supportedReasoningLevels ?? defaults?.[model]?.supportedReasoningLevels ?? [])
          .map((level) => level.effort.trim().toLowerCase())
      );
      if (checked) selected.add(effort);
      else selected.delete(effort);
      const supportedReasoningLevels = providerReasoningLevelOptions
        .filter((option) => selected.has(option.effort))
        .map(({ description, effort: optionEffort }) => ({ description, effort: optionEffort }));
      const next: Metadata = {
        ...current,
        supportedReasoningLevels,
        supportsReasoningSummaries: supportedReasoningLevels.length > 0
      };
      const defaultReasoningLevel = current.defaultReasoningLevel?.trim().toLowerCase();
      if (defaultReasoningLevel && !selected.has(defaultReasoningLevel)) {
        delete next.defaultReasoningLevel;
      }
      return next;
    });
  }

  function resetReasoning(model: string) {
    updateMetadata(model, (current) => {
      const next = { ...current };
      delete next.defaultReasoningLevel;
      delete next.supportedReasoningLevels;
      delete next.supportsReasoningSummaries;
      return next;
    });
  }

  function updateCapability(model: string, key: CapabilityKey, checked: boolean) {
    updateMetadata(model, (current) => ({
      ...current,
      capabilities: { ...(current.capabilities ?? {}), [key]: checked }
    }));
  }

  function resetCapability(model: string, key: CapabilityKey) {
    updateMetadata(model, (current) => {
      const capabilities = { ...(current.capabilities ?? {}) };
      delete capabilities[key];
      const next = { ...current };
      if (Object.keys(capabilities).length > 0) next.capabilities = capabilities;
      else delete next.capabilities;
      return next;
    });
  }

  function toggleExpanded(model: string) {
    setExpandedModels((current) => {
      const next = new Set(current);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }

  return (
    <div className={cn("space-y-2", header && "rounded-md border border-border bg-muted/20 p-2", className)}>
      {header ? (
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("Model settings")}</span>
          <span className="shrink-0 text-[11px] leading-4 text-muted-foreground/75">{t("Context, pricing, reasoning, web search, and image")}</span>
        </div>
      ) : null}
      <div className="space-y-2">
        {normalizedModels.map((model) => {
          const modelMetadata = metadata?.[model];
          const modelDefaults = defaults?.[model];
          const effectiveContextWindow = modelMetadata?.contextWindow ?? modelMetadata?.maxContextWindow ??
            modelDefaults?.contextWindow ?? modelDefaults?.maxContextWindow;
          const effectivePricing = {
            cacheReadUsdPerMillionTokens: modelMetadata?.pricing?.cacheReadUsdPerMillionTokens ?? modelDefaults?.pricing?.cacheReadUsdPerMillionTokens,
            cacheWrite1hUsdPerMillionTokens: modelMetadata?.pricing?.cacheWrite1hUsdPerMillionTokens ?? modelDefaults?.pricing?.cacheWrite1hUsdPerMillionTokens,
            cacheWrite5mUsdPerMillionTokens: modelMetadata?.pricing?.cacheWrite5mUsdPerMillionTokens ??
              modelMetadata?.pricing?.cacheWriteUsdPerMillionTokens ??
              modelDefaults?.pricing?.cacheWrite5mUsdPerMillionTokens ??
              modelDefaults?.pricing?.cacheWriteUsdPerMillionTokens,
            inputUsdPerMillionTokens: modelMetadata?.pricing?.inputUsdPerMillionTokens ?? modelDefaults?.pricing?.inputUsdPerMillionTokens,
            outputUsdPerMillionTokens: modelMetadata?.pricing?.outputUsdPerMillionTokens ?? modelDefaults?.pricing?.outputUsdPerMillionTokens
          };
          const expanded = expandedModels.has(model);
          const label = displayNames?.[model]?.trim() || model;
          const fromSource = sourceModelSet.has(model) || Boolean(modelDefaults);
          const hasCustomDetails = Boolean(
            modelMetadata?.contextWindow ||
            modelMetadata?.maxContextWindow ||
            modelMetadata?.pricing ||
            modelMetadata?.capabilities ||
            modelMetadata?.supportedReasoningLevels !== undefined ||
            modelMetadata?.supportsReasoningSummaries !== undefined
          );
          const configuredReasoningLevels = new Set(
            (modelMetadata?.supportedReasoningLevels ?? modelDefaults?.supportedReasoningLevels ?? [])
              .map((level) => level.effort.trim().toLowerCase())
          );
          const reasoningConfigured = modelMetadata?.supportedReasoningLevels !== undefined ||
            modelMetadata?.supportsReasoningSummaries !== undefined;
          return (
            <div className="overflow-hidden rounded-md border border-border bg-background/70" key={model}>
              <div className="flex min-w-0 items-center">
                <button
                  aria-expanded={expanded}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/25"
                  onClick={() => toggleExpanded(model)}
                  type="button"
                >
                  <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium" title={model}>{label}</span>
                  {!fromSource ? <Badge variant="secondary">{t("Custom model")}</Badge> : null}
                  {hasCustomDetails ? <Badge variant="secondary">{t("Custom")}</Badge> : null}
                  {!hasCustomDetails && fromSource ? <Badge variant="outline">{t("Preset")}</Badge> : null}
                </button>
                {onRemoveModel ? (
                  <Button
                    aria-label={`${t("Remove model")} ${label}`}
                    className="mr-1 h-7 w-7 shrink-0 text-muted-foreground"
                    onClick={() => onRemoveModel(model)}
                    size="iconSm"
                    title={t("Remove model")}
                    type="button"
                    variant="ghost"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
              {expanded ? (
                <div className="space-y-3 border-t border-border/60 p-3">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("Model settings")}</span>
                    <span className="shrink-0 text-[11px] leading-4 text-muted-foreground/75">{t("Context, pricing, reasoning, web search, and image")}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("Context window (tokens)")}</Label>
                      {modelMetadata?.contextWindow !== undefined || modelMetadata?.maxContextWindow !== undefined ? (
                        <Button className="h-6 px-2 text-[10px]" onClick={() => resetContextWindow(model)} type="button" variant="ghost">
                          {t("Use preset")}
                        </Button>
                      ) : null}
                    </div>
                    <Input
                      min={1}
                      onChange={(event) => updateContextWindow(model, event.target.value)}
                      placeholder={t("Detected automatically")}
                      step={1}
                      type="number"
                      value={effectiveContextWindow ?? ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("Pricing")}</Label>
                      {modelMetadata?.pricing ? (
                        <Button className="h-6 px-2 text-[10px]" onClick={() => resetPricing(model)} type="button" variant="ghost">
                          {t("Use preset")}
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <ModelPriceInput label={`${t("Input")}(1M tokens/$)`} onChange={(value) => updatePricing(model, "inputUsdPerMillionTokens", value)} value={effectivePricing.inputUsdPerMillionTokens} />
                      <ModelPriceInput label={`${t("Output")}(1M tokens/$)`} onChange={(value) => updatePricing(model, "outputUsdPerMillionTokens", value)} value={effectivePricing.outputUsdPerMillionTokens} />
                      <ModelPriceInput label={`${t("Cache read")}(1M tokens/$)`} onChange={(value) => updatePricing(model, "cacheReadUsdPerMillionTokens", value)} value={effectivePricing.cacheReadUsdPerMillionTokens} />
                      <ModelPriceInput label={`${t("Cache write 5m")}(1M tokens/$)`} onChange={(value) => updatePricing(model, "cacheWrite5mUsdPerMillionTokens", value)} value={effectivePricing.cacheWrite5mUsdPerMillionTokens} />
                      <ModelPriceInput label={`${t("Cache write 1h")}(1M tokens/$)`} onChange={(value) => updatePricing(model, "cacheWrite1hUsdPerMillionTokens", value)} value={effectivePricing.cacheWrite1hUsdPerMillionTokens} />
                    </div>
                    <div className="text-[10px] leading-4 text-muted-foreground/75">{t("Input and output prices are both required to override catalog pricing.")}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("Reasoning levels")}</Label>
                      {reasoningConfigured ? (
                        <Button className="h-6 px-2 text-[10px]" onClick={() => resetReasoning(model)} type="button" variant="ghost">
                          {t("Use preset")}
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
                      {providerReasoningLevelOptions.map((option) => (
                        <Label className="flex min-w-0 items-center gap-2 text-[11px] font-normal" key={option.effort}>
                          <Checkbox
                            checked={configuredReasoningLevels.has(option.effort)}
                            onCheckedChange={(checked) => updateReasoningLevel(model, option.effort, checked)}
                          />
                          <span className="truncate">{t(option.label)}</span>
                        </Label>
                      ))}
                    </div>
                    <div className="text-[10px] leading-4 text-muted-foreground/75">{t("Select every reasoning effort supported by this model.")}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <Label className="flex min-w-0 items-center gap-2 text-[12px] font-medium">
                        <Checkbox
                          checked={modelMetadata?.capabilities?.webSearch ?? modelDefaults?.capabilities?.webSearch ?? false}
                          onCheckedChange={(checked) => updateCapability(model, "webSearch", checked)}
                        />
                        <span>{t("Web search")}</span>
                      </Label>
                      {modelMetadata?.capabilities?.webSearch !== undefined ? (
                        <Button className="h-6 px-2 text-[10px]" onClick={() => resetCapability(model, "webSearch")} type="button" variant="ghost">
                          {t("Use preset")}
                        </Button>
                      ) : null}
                    </div>
                    <div className="text-[10px] leading-4 text-muted-foreground/75">{t("Declare whether the model provides native web search.")}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <Label className="flex min-w-0 items-center gap-2 text-[12px] font-medium">
                        <Checkbox
                          checked={modelMetadata?.capabilities?.imageInput ?? modelDefaults?.capabilities?.imageInput ?? false}
                          onCheckedChange={(checked) => updateCapability(model, "imageInput", checked)}
                        />
                        <span>{t("Image")}</span>
                      </Label>
                      {modelMetadata?.capabilities?.imageInput !== undefined ? (
                        <Button className="h-6 px-2 text-[10px]" onClick={() => resetCapability(model, "imageInput")} type="button" variant="ghost">
                          {t("Use preset")}
                        </Button>
                      ) : null}
                    </div>
                    <div className="text-[10px] leading-4 text-muted-foreground/75">{t("Declare whether the model accepts image input.")}</div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModelPriceInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value?: number }) {
  return (
    <Field label={label}>
      <Input min={0} onChange={(event) => onChange(event.target.value)} placeholder="0" step="any" type="number" value={value ?? ""} />
    </Field>
  );
}

function optionalPositiveInteger(value: string): number | undefined {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function optionalNonNegativeNumber(value: string): number | undefined {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
