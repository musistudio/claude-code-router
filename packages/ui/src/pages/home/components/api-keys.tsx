import {
  AddApiKeyDraft, AnimatedDisclosure, AnimatedIconSwap, AnimatedListItem, AnimatePresence, apiKeyExpirationOptions, ApiKeyExpirationPreset,
  ApiKeyLimitDraftRow, ApiKeyLimitMetric, apiKeyLimitMetricOptions, ApiKeyListItem, apiKeyMatchesQuery, Button,
  Card, CardContent, CardHeader, Check, ChevronDown, CircleAlert,
  cn, Copy, copyTextToClipboard, createApiKeyLimitDraftRow, Dialog, DialogBody,
  DialogContent, DialogFooter, DialogHeader, DialogTitle, disclosureSpringTransition, Field,
  formatApiKeyExpiration, formatApiKeyLimits, Input, KeyRound, limitWindowOptions, LimitWindowPreset,
  motion, Pencil, Plus, Search, SelectControl, translateOptions,
  Trash2, useAppText, useMemo, useState, X
} from "../shared/index";
export function ApiKeysView({
  addApiKey,
  apiKeys,
  editApiKey,
  error,
  notify,
  removeApiKey
}: {
  addApiKey: () => void;
  apiKeys: ApiKeyListItem[];
  editApiKey: (index: number) => void;
  error: string;
  notify: (message: string) => void;
  removeApiKey: (index: number) => void;
}) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleApiKeys = useMemo(
    () => apiKeys.filter((apiKey) => apiKeyMatchesQuery(apiKey, normalizedQuery)),
    [apiKeys, normalizedQuery]
  );

  async function copyApiKey(apiKey: ApiKeyListItem) {
    await copyTextToClipboard(apiKey.keyValue);
    notify(t("Copied API key"));
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
              aria-label={t("Search API keys")}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search API keys")}
              value={query}
            />
          </div>
          <Button aria-label={t("Add API key")} onClick={addApiKey} title={t("Add API key")} type="button">
            <Plus className="h-4 w-4" />
            {t("Add")}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {error ? <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive flex items-start gap-2"><CircleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error}</span></div> : null}
          {apiKeys.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center">
              <KeyRound className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <div className="text-[12px] text-muted-foreground">{t("No API keys configured")}</div>
              <div className="mt-1 text-[11px] text-muted-foreground/60">{t("Click Add to create one")}</div>
            </div>
          ) : null}
          {apiKeys.length > 0 && visibleApiKeys.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No matching API keys")}</div>
          ) : null}
          {visibleApiKeys.length > 0 ? (
            <div className="min-w-0">
              <div className="min-w-[980px]">
                <div className="sticky top-0 z-10 grid h-10 grid-cols-[minmax(140px,0.7fr)_minmax(390px,1.7fr)_132px_minmax(160px,0.7fr)_76px] items-center gap-3 border-b border-border/60 bg-muted/95 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="truncate">{t("Name")}</div>
                  <div className="truncate">{t("Key")}</div>
                  <div className="truncate">{t("Expires")}</div>
                  <div className="truncate">{t("Limits")}</div>
                  <div aria-hidden="true" />
                </div>
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                  {visibleApiKeys.map((apiKey) => (
                    <AnimatedListItem
                      className="grid min-h-[58px] grid-cols-[minmax(140px,0.7fr)_minmax(390px,1.7fr)_132px_minmax(160px,0.7fr)_76px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/35"
                      key={`${apiKey.keyValue}-${apiKey.index}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold" title={apiKey.name}>{apiKey.name}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold leading-5" title={apiKey.masked}>
                          <span className="min-w-0 truncate font-mono">{apiKey.masked}</span>
                          <Button
                            className="shrink-0"
                            aria-label={t("Copy API key")}
                            onClick={() => void copyApiKey(apiKey)}
                            size="iconSm"
                            title={t("Copy API key")}
                            type="button"
                            variant="ghost"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={t(formatApiKeyExpiration(apiKey))}>
                        {t(formatApiKeyExpiration(apiKey))}
                      </div>
                      <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={t(formatApiKeyLimits(apiKey.limits))}>
                        {t(formatApiKeyLimits(apiKey.limits))}
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <Button aria-label={t("Edit API key")} onClick={() => editApiKey(apiKey.index)} size="iconSm" title={t("Edit API key")} type="button" variant="ghost">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button aria-label={t("Remove API key")} onClick={() => removeApiKey(apiKey.index)} size="iconSm" title={t("Remove API key")} type="button" variant="ghost">
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

export function AddApiKeyDialog({
  canSubmit,
  draft,
  error,
  onChange,
  onClose,
  onSubmit
}: {
  canSubmit: boolean;
  draft: AddApiKeyDraft;
  error: string;
  onChange: (patch: Partial<AddApiKeyDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useAppText();
  const expirationOptions = translateOptions(apiKeyExpirationOptions, t);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Add API Key")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-2" layout transition={disclosureSpringTransition}>
            <Field label={t("Name")}>
              <Input autoFocus value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
            </Field>
            <Field label={t("Expiration")}>
              <SelectControl
                value={draft.expirationPreset}
                onChange={(expirationPreset) => onChange({ expirationPreset: expirationPreset as ApiKeyExpirationPreset })}
                options={expirationOptions}
              />
            </Field>
            {draft.expirationPreset === "custom" ? (
              <Field className="sm:col-span-2" label={t("Expires at")}>
                <Input type="datetime-local" value={draft.expiresAt} onChange={(event) => onChange({ expiresAt: event.target.value })} />
              </Field>
            ) : null}
          </motion.div>
          <ApiKeyAdvancedSettings draft={draft} onChange={onChange} />

          {error ? <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive flex items-start gap-2"><CircleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error}</span></div> : null}
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit} type="button">
            <Plus className="h-4 w-4" />
            {t("Add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeyCreatedDialog({
  apiKeyName,
  apiKeyValue,
  onClose
}: {
  apiKeyName: string;
  apiKeyValue: string;
  onClose: () => void;
}) {
  const t = useAppText();
  const [copied, setCopied] = useState(false);

  async function copyApiKey() {
    await copyTextToClipboard(apiKeyValue);
    setCopied(true);
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("API key created")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="flex items-start gap-3 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-3 text-[12px] text-emerald-700">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold">{t("API key created")}</div>
              <div className="mt-0.5 text-emerald-700/80">{t("Copy this key now. It may not be shown again.")}</div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{apiKeyName || t("API key")}</div>
            <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-background px-2 py-1.5 font-mono text-[12px] text-foreground">
                {apiKeyValue}
              </code>
              <Button
                aria-label={copied ? t("Copied") : t("Copy API key")}
                className="shrink-0"
                onClick={() => void copyApiKey()}
                title={copied ? t("Copied") : t("Copy API key")}
                type="button"
                variant={copied ? "secondary" : "default"}
              >
                <AnimatedIconSwap iconKey={copied ? "copied" : "copy"}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </AnimatedIconSwap>
                {copied ? t("Copied") : t("Copy")}
              </Button>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} type="button">
            {t("Done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditApiKeyDialog({
  canSubmit,
  draft,
  error,
  onChange,
  onClose,
  onSubmit
}: {
  canSubmit: boolean;
  draft: AddApiKeyDraft;
  error: string;
  onChange: (patch: Partial<AddApiKeyDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useAppText();
  const expirationOptions = translateOptions(apiKeyExpirationOptions, t);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>{t("Edit API Key")}</DialogTitle>
          </div>
          <Button aria-label={t("Close dialog")} onClick={onClose} size="iconSm" title={t("Close")} type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("Expiration")}>
              <SelectControl
                value={draft.expirationPreset}
                onChange={(expirationPreset) => onChange({ expirationPreset: expirationPreset as ApiKeyExpirationPreset })}
                options={expirationOptions}
              />
            </Field>
            {draft.expirationPreset === "custom" ? (
              <Field label={t("Expires at")}>
                <Input type="datetime-local" value={draft.expiresAt} onChange={(event) => onChange({ expiresAt: event.target.value })} />
              </Field>
            ) : null}
          </div>

          <ApiKeyAdvancedSettings defaultOpen draft={draft} onChange={onChange} />

          {error ? <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive flex items-start gap-2"><CircleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error}</span></div> : null}
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

function ApiKeyAdvancedSettings({
  defaultOpen = false,
  draft,
  onChange
}: {
  defaultOpen?: boolean;
  draft: AddApiKeyDraft;
  onChange: (patch: Partial<AddApiKeyDraft>) => void;
}) {
  const t = useAppText();
  const limitMetricOptions = translateOptions(apiKeyLimitMetricOptions, t);
  const limitWindowSelectOptions = translateOptions(limitWindowOptions, t);
  const [advancedOpen, setAdvancedOpen] = useState(defaultOpen);
  const updateLimitRow = (id: string, patch: Partial<ApiKeyLimitDraftRow>) => {
    onChange({
      limitRows: draft.limitRows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    });
  };
  const addLimitRow = () => {
    const row = createApiKeyLimitDraftRow();
    if (row) {
      onChange({ limitRows: [...draft.limitRows, row] });
    }
  };
  const removeLimitRow = (id: string) => {
    onChange({ limitRows: draft.limitRows.filter((row) => row.id !== id) });
  };

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-border bg-background">
      <Button
        aria-expanded={advancedOpen}
        className="flex h-10 w-full items-center justify-between gap-3 px-3 text-left text-[12px] font-medium transition-colors hover:bg-muted/40"
        onClick={() => setAdvancedOpen((value) => !value)}
        type="button"
        unstyled
      >
        <span className="min-w-0 truncate">{t("Advanced settings")}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", advancedOpen && "rotate-180")} />
      </Button>
      <AnimatePresence initial={false}>
        {advancedOpen ? (
          <AnimatedDisclosure key="api-key-advanced">
            <div className="space-y-2 border-t border-border p-3">
              {draft.limitRows.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-5 text-center text-[12px] text-muted-foreground">
                  {t("No limits configured")}
                </div>
              ) : null}
              <AnimatePresence initial={false}>
                {draft.limitRows.map((row) => (
                  <AnimatedListItem className="grid grid-cols-[minmax(110px,0.9fr)_126px_minmax(0,1fr)_28px] gap-2" key={row.id}>
                    <SelectControl
                      value={row.metric}
                      onChange={(metric) => updateLimitRow(row.id, { metric: metric as ApiKeyLimitMetric })}
                      options={limitMetricOptions}
                    />
                    <SelectControl
                      value={row.window}
                      onChange={(window) => updateLimitRow(row.id, { window: window as LimitWindowPreset })}
                      options={limitWindowSelectOptions}
                    />
                    <Input type="number" value={row.value} onChange={(event) => updateLimitRow(row.id, { value: event.target.value })} />
                    <Button aria-label={t("Remove limit")} onClick={() => removeLimitRow(row.id)} size="iconSm" title={t("Remove limit")} type="button" variant="ghost">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AnimatedListItem>
                ))}
              </AnimatePresence>
              <Button onClick={addLimitRow} size="sm" type="button" variant="outline">
                <Plus className="h-3.5 w-3.5" />
                {t("Add limit")}
              </Button>
            </div>
          </AnimatedDisclosure>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
