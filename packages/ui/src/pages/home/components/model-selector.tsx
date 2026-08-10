import type { MouseEvent as ReactMouseEvent } from "react";
import {
  AnimatedPopover,
  AnimatePresence,
  Badge,
  Button,
  Check,
  Checkbox,
  ChevronDown,
  cn,
  GatewayProviderConfig,
  Input,
  Label,
  normalizeProviderModelSelector,
  parseProfileModelValue,
  PopoverContent,
  profileModelDisplayValue,
  profileModelMatchesQuery,
  profileModelOptionDisplayName,
  profileModelProviderMatchesQuery,
  profileModelProviderOptions,
  Search,
  useAppText,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  X,
  type VirtualModelProfileConfig
} from "../shared/index";
import { PopoverPortal } from "@/components/ui/popover";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function ModelSelector({
  onChange,
  placeholder,
  providers,
  value,
  virtualModelProfiles = []
}: {
  onChange: (value: string) => void;
  placeholder?: string;
  providers: GatewayProviderConfig[];
  value: string;
  virtualModelProfiles?: VirtualModelProfileConfig[];
}) {
  const t = useAppText();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [popoverLayout, setPopoverLayout] = useState<{
    gridHeight: number;
    left: number;
    maxHeight: number;
    offset: number;
    placement: "above" | "below";
    width: number;
  }>();
  const parsedValue = useMemo(() => parseProfileModelValue(value, providers, virtualModelProfiles), [providers, value, virtualModelProfiles]);
  const providerOptions = useMemo(() => profileModelProviderOptions(providers, virtualModelProfiles), [providers, virtualModelProfiles]);
  const filteredProviders = useMemo(
    () => providerOptions.filter((provider) => profileModelProviderMatchesQuery(provider, query)),
    [providerOptions, query]
  );
  const [activeProviderName, setActiveProviderName] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeProvider =
    filteredProviders.find((provider) => provider.name === activeProviderName) ??
    filteredProviders.find((provider) => provider.name === parsedValue.provider) ??
    filteredProviders[0];
  const filteredModels = activeProvider
    ? activeProvider.models.filter((model) => profileModelMatchesQuery(activeProvider.name, model, query, profileModelOptionDisplayName(activeProvider, model)))
    : [];
  const displayValue = profileModelDisplayValue(value, parsedValue, providers, placeholder, virtualModelProfiles);

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
      const availableWidth = Math.max(240, viewportWidth - margin * 2);
      const width = Math.min(560, availableWidth);
      const left = Math.min(Math.max(margin, anchor.left), viewportWidth - margin - width);
      const below = Math.max(0, viewportHeight - anchor.bottom - margin - gap);
      const above = Math.max(0, anchor.top - margin - gap);
      const placement = below < 240 && above > below ? "above" : "below";
      const availableHeight = Math.max(144, placement === "above" ? above : below);
      const maxHeight = Math.min(360, availableHeight);
      const gridHeight = Math.max(128, Math.min(280, maxHeight - 58));
      setPopoverLayout({
        gridHeight,
        left,
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

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (activeProviderName && filteredProviders.some((provider) => provider.name === activeProviderName)) {
      return;
    }
    setActiveProviderName(parsedValue.provider || filteredProviders[0]?.name || "");
  }, [activeProviderName, filteredProviders, open, parsedValue.provider]);

  function chooseModel(providerName: string, model: string) {
    onChange(`${providerName}/${model}`);
    setOpen(false);
    setQuery("");
    setActiveProviderName(providerName);
  }

  function openSelector() {
    setOpen(true);
    setQuery("");
    setActiveProviderName(parsedValue.provider || providerOptions[0]?.name || "");
  }

  function clearValue(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    onChange("");
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <div
        className={cn(
          "flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-[12px] shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-[background-color,border-color,box-shadow,color] hover:border-muted-foreground/45 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/25",
          open && "border-ring/35 bg-muted/40",
          !value.trim() && "text-muted-foreground"
        )}
      >
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          className="min-w-0 flex-1 truncate text-left outline-none"
          onClick={openSelector}
          type="button"
        >
          {displayValue}
        </button>
        {value.trim() ? (
          <button
            aria-label={t("Clear")}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
            onClick={clearValue}
            title={t("Clear")}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          aria-label={open ? t("Collapse") : t("Expand")}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
          onClick={openSelector}
          title={open ? t("Collapse") : t("Expand")}
          type="button"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      <PopoverPortal open={open && Boolean(popoverLayout)}>
        <AnimatePresence initial={false}>
          {open && popoverLayout ? (
            <AnimatedPopover
              className="fixed z-[140]"
              placement={popoverLayout.placement}
              style={{
                left: `${popoverLayout.left}px`,
                maxHeight: `${popoverLayout.maxHeight}px`,
                width: `${popoverLayout.width}px`,
                ...(popoverLayout.placement === "above"
                  ? { bottom: `${popoverLayout.offset}px` }
                  : { top: `${popoverLayout.offset}px` })
              }}
            >
              <PopoverContent className="w-full overflow-hidden p-2" ref={panelRef}>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    aria-label={t("Search models")}
                    className="h-9 pl-8"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("Search providers or models")}
                    value={query}
                  />
                </div>

                {providerOptions.length === 0 ? (
                  <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-[12px] text-muted-foreground">
                    {t("No models configured")}
                  </div>
                ) : (
                  <div
                    className="mt-2 grid grid-cols-[minmax(112px,0.38fr)_minmax(0,1fr)] overflow-hidden rounded-md border border-border"
                    style={{ height: `${popoverLayout?.gridHeight ?? 220}px` }}
                  >
                    <div className="min-w-0 overflow-auto border-r border-border bg-muted/30 p-1">
                      {filteredProviders.length === 0 ? (
                        <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">{t("No matching providers")}</div>
                      ) : null}
                      {filteredProviders.map((provider) => {
                        const active = provider.name === activeProvider?.name;
                        return (
                          <button
                            className={cn(
                              "flex h-9 w-full min-w-0 items-center gap-2 rounded-[5px] px-2 text-left text-[12px] outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/25",
                              active && "bg-background text-primary"
                            )}
                            key={provider.name}
                            onClick={() => setActiveProviderName(provider.name)}
                            type="button"
                          >
                            <span className="min-w-0 flex-1 truncate">{provider.name}</span>
                            <Badge className="shrink-0" variant="outline">{provider.models.length}</Badge>
                          </button>
                        );
                      })}
                    </div>
                    <div className="min-w-0 overflow-auto bg-background p-1">
                      {!activeProvider ? (
                        <div className="px-2 py-10 text-center text-[12px] text-muted-foreground">{t("No matching models")}</div>
                      ) : null}
                      {activeProvider && filteredModels.length === 0 ? (
                        <div className="px-2 py-10 text-center text-[12px] text-muted-foreground">{t("No matching models")}</div>
                      ) : null}
                      {activeProvider && filteredModels.map((model) => {
                        const selected = parsedValue.provider === activeProvider.name && parsedValue.model === model;
                        const displayName = profileModelOptionDisplayName(activeProvider, model);
                        return (
                          <button
                            className={cn(
                              "flex h-9 w-full min-w-0 items-center gap-2 rounded-[5px] px-2 text-left text-[12px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/25",
                              selected && "bg-primary/10 text-primary"
                            )}
                            key={`${activeProvider.name}/${model}`}
                            onClick={() => chooseModel(activeProvider.name, model)}
                            type="button"
                          >
                            <span className="min-w-0 flex-1 truncate" title={displayName}>{displayName}</span>
                            {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </PopoverContent>
            </AnimatedPopover>
          ) : null}
        </AnimatePresence>
      </PopoverPortal>
    </div>
  );
}

export function ModelMultiSelector({
  onChange,
  providers,
  value,
  virtualModelProfiles = []
}: {
  onChange: (value: string[]) => void;
  providers: GatewayProviderConfig[];
  value: string[];
  virtualModelProfiles?: VirtualModelProfileConfig[];
}) {
  const t = useAppText();
  const [query, setQuery] = useState("");
  const providerOptions = useMemo(
    () => profileModelProviderOptions(providers, virtualModelProfiles),
    [providers, virtualModelProfiles]
  );
  const normalizedQuery = query.trim().toLowerCase();
  const models = providerOptions.flatMap((provider) => provider.models
    .map((model) => ({
      displayName: profileModelOptionDisplayName(provider, model),
      provider: provider.name,
      value: `${provider.name}/${model}`
    })))
    .filter((model) => !normalizedQuery ||
      model.provider.toLowerCase().includes(normalizedQuery) ||
      model.value.toLowerCase().includes(normalizedQuery) ||
      model.displayName.toLowerCase().includes(normalizedQuery));
  const selected = new Set(value.map(normalizeProviderModelSelector).filter(Boolean));

  function toggleModel(model: string) {
    onChange(selected.has(model)
      ? value.filter((candidate) => normalizeProviderModelSelector(candidate) !== model)
      : [...value, model]);
  }

  function selectVisibleModels() {
    onChange(Array.from(new Set([...value.map(normalizeProviderModelSelector).filter(Boolean), ...models.map((model) => model.value)])));
  }

  return (
    <div className="rounded-md border border-input bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t("Search models")}
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search providers or models")}
            value={query}
          />
        </div>
        <Button disabled={models.length === 0} onClick={selectVisibleModels} size="sm" type="button" variant="outline">
          {t("All")}
        </Button>
        <Button disabled={selected.size === 0} onClick={() => onChange([])} size="sm" type="button" variant="outline">
          {t("Clear")}
        </Button>
      </div>
      <div className="max-h-[220px] overflow-auto p-2">
        {models.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-[12px] text-muted-foreground">
            {t(providerOptions.length === 0 ? "No models configured" : "No matching models")}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {models.map((model) => {
            const checked = selected.has(model.value);
            return (
              <Label
                className={cn(
                  "flex h-9 min-w-0 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 text-left text-[12px] transition-colors hover:bg-muted",
                  checked && "border-primary bg-accent"
                )}
                key={model.value}
                title={`${model.provider}/${model.displayName}`}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggleModel(model.value)} />
                <span className="min-w-0 flex-1 truncate">{model.provider} / {model.displayName}</span>
              </Label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
