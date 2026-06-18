import {
  Activity, AppConfig, AppCopy, AppLanguagePreference, Boxes, Button,
  CircleAlert, cn, Database, Dialog, DialogBody, DialogContent,
  DialogFooter, DialogHeader, DialogTitle, Field, formatSystemOption, Gauge,
  Input, Label, languageDisplayName, Layers3, Network, Palette,
  PanelLeftOpen, Power, ReactNode, ResolvedLanguage, ResolvedTheme, Select, SelectControl,
  SettingsPageId, Switch, themeDisplayName, TRAY_WINDOW_MODULE_IDS, TrayComponentOptionGroup, TrayComponentVariants,
  TrayEditableModuleId, trayMascotIconUrls, TrayModuleOption, TrayWindowModuleId, useMemo, useState,
  X
} from "../shared";
export function AppSettingsDialog({
  copy,
  isMac,
  languagePreference,
  onChangeLanguage,
  onChangeTheme,
  onChangeTrayComponentVariant,
  onChangeTrayIcon,
  onChangeTrayProgressTarget,
  onSetTrayModuleEnabled,
  onClose,
  systemLanguage,
  systemTheme,
  themePreference,
  trayIconPreference,
  trayComponentVariants,
  trayProgressTargetTokens,
  trayWindowModules
}: {
  copy: AppCopy;
  isMac: boolean;
  languagePreference: AppLanguagePreference;
  onChangeLanguage: (value: string) => void;
  onChangeTheme: (value: string) => void;
  onChangeTrayComponentVariant: (key: keyof TrayComponentVariants, value: string) => void;
  onChangeTrayIcon: (value: string) => void;
  onChangeTrayProgressTarget: (value: string) => void;
  onSetTrayModuleEnabled: (moduleId: TrayWindowModuleId, enabled: boolean) => void;
  onClose: () => void;
  systemLanguage: ResolvedLanguage;
  systemTheme: ResolvedTheme;
  themePreference: AppConfig["theme"];
  trayIconPreference: AppConfig["trayIcon"];
  trayComponentVariants: TrayComponentVariants;
  trayProgressTargetTokens: number;
  trayWindowModules: TrayWindowModuleId[];
}) {
  return (
    <SettingsLayout
      copy={copy}
      isMac={isMac}
      onClose={onClose}
      renderPage={(activePage) => activePage === "appearance" ? (
        <AppearanceSettingsPage
          copy={copy}
          languagePreference={languagePreference}
          onChangeLanguage={onChangeLanguage}
          onChangeTheme={onChangeTheme}
          systemLanguage={systemLanguage}
          systemTheme={systemTheme}
          themePreference={themePreference}
        />
      ) : (
        <TraySettingsPage
          copy={copy}
          onChangeTrayComponentVariant={onChangeTrayComponentVariant}
          onChangeTrayIcon={onChangeTrayIcon}
          onChangeTrayProgressTarget={onChangeTrayProgressTarget}
          onSetTrayModuleEnabled={onSetTrayModuleEnabled}
          trayComponentVariants={trayComponentVariants}
          trayIconPreference={trayIconPreference}
          trayProgressTargetTokens={trayProgressTargetTokens}
          trayWindowModules={trayWindowModules}
        />
      )}
    />
  );
}

function SettingsLayout({
  copy,
  isMac,
  onClose,
  renderPage
}: {
  copy: AppCopy;
  isMac: boolean;
  onClose: () => void;
  renderPage: (activePage: SettingsPageId) => ReactNode;
}) {
  const [activePage, setActivePage] = useState<SettingsPageId>("appearance");
  const visiblePage = isMac ? activePage : "appearance";

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
            {isMac ? (
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
  onChangeLanguage,
  onChangeTheme,
  systemLanguage,
  systemTheme,
  themePreference
}: {
  copy: AppCopy;
  languagePreference: AppLanguagePreference;
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
    <div className="mx-auto grid max-w-[520px] grid-cols-1 gap-5">
      <h3 className="text-[15px] font-semibold text-foreground">{copy.settings.appearance}</h3>
      <div className="grid grid-cols-1 gap-4">
        <Field label={copy.settings.theme}>
          <SelectControl onChange={onChangeTheme} options={themeOptions} value={themePreference} />
        </Field>
        <Field label={copy.settings.language}>
          <SelectControl onChange={onChangeLanguage} options={languageOptions} value={languagePreference} />
        </Field>
      </div>
    </div>
  );
}

function TraySettingsPage({
  copy,
  onChangeTrayComponentVariant,
  onChangeTrayIcon,
  onChangeTrayProgressTarget,
  onSetTrayModuleEnabled,
  trayComponentVariants,
  trayIconPreference,
  trayProgressTargetTokens,
  trayWindowModules
}: {
  copy: AppCopy;
  onChangeTrayComponentVariant: (key: keyof TrayComponentVariants, value: string) => void;
  onChangeTrayIcon: (value: string) => void;
  onChangeTrayProgressTarget: (value: string) => void;
  onSetTrayModuleEnabled: (moduleId: TrayWindowModuleId, enabled: boolean) => void;
  trayComponentVariants: TrayComponentVariants;
  trayIconPreference: AppConfig["trayIcon"];
  trayProgressTargetTokens: number;
  trayWindowModules: TrayWindowModuleId[];
}) {
  const [selectedTrayModule, setSelectedTrayModule] = useState<TrayEditableModuleId>("source-tabs");
  const trayWindowModuleSet = useMemo(() => new Set(trayWindowModules), [trayWindowModules]);
  const trayIconOptions: Array<{ label: string; value: AppConfig["trayIcon"] }> = [
    { label: copy.settings.trayIconRandom, value: "random" },
    { label: copy.settings.trayIconViolet, value: "violet" },
    { label: copy.settings.trayIconOrange, value: "orange" },
    { label: copy.settings.trayIconCyan, value: "cyan" },
    { label: copy.settings.trayIconProgress, value: "progress" }
  ];
  const trayModuleOptions: TrayModuleOption[] = [
    { icon: Layers3, label: copy.settings.trayModuleSourceTabs, value: "source-tabs" },
    { icon: PanelLeftOpen, label: copy.settings.trayModuleHeader, value: "header" },
    { icon: Database, label: copy.settings.trayModuleAccount, styleKey: "account", value: "account" },
    { icon: Activity, label: copy.settings.trayModuleTokenFlow, styleKey: "tokenFlow", value: "token-flow" },
    { icon: Gauge, label: copy.settings.trayModuleStats, styleKey: "stats", value: "stats" },
    { icon: Boxes, label: copy.settings.trayModuleTokenMix, styleKey: "tokenMix", value: "token-mix" },
    { icon: CircleAlert, label: copy.settings.trayModuleRings, styleKey: "rings", value: "rings" },
    { icon: Network, label: copy.settings.trayModuleModelShare, styleKey: "modelShare", value: "model-share" }
  ];
  const trayComponentOptionGroups: TrayComponentOptionGroup[] = [
    {
      key: "account" as const,
      label: copy.settings.trayComponentAccount,
      options: [
        { label: copy.settings.trayComponentBars, value: "bar" },
        { label: copy.settings.trayComponentCompact, value: "compact" },
        { label: copy.settings.trayComponentRing, value: "ring" },
        { label: copy.settings.trayComponentArc, value: "arc" },
        { label: copy.settings.trayComponentStacked, value: "stacked" }
      ]
    },
    {
      key: "tokenFlow" as const,
      label: copy.settings.trayComponentFlow,
      options: [
        { label: copy.settings.trayComponentLine, value: "line" },
        { label: copy.settings.trayComponentArea, value: "area" },
        { label: copy.settings.trayComponentBar, value: "bar" },
        { label: copy.settings.trayComponentSparkline, value: "sparkline" }
      ]
    },
    {
      key: "stats" as const,
      label: copy.settings.trayComponentStats,
      options: [
        { label: copy.settings.trayComponentCards, value: "cards" },
        { label: copy.settings.trayComponentCompact, value: "compact" },
        { label: copy.settings.trayComponentPills, value: "pills" }
      ]
    },
    {
      key: "tokenMix" as const,
      label: copy.settings.trayComponentTokenMix,
      options: [
        { label: copy.settings.trayComponentBars, value: "bars" },
        { label: copy.settings.trayComponentStacked, value: "stacked" },
        { label: copy.settings.trayComponentDonut, value: "donut" },
        { label: copy.settings.trayComponentPie, value: "pie" }
      ]
    },
    {
      key: "rings" as const,
      label: copy.settings.trayModuleRings,
      options: [
        { label: copy.settings.trayComponentRings, value: "rings" },
        { label: copy.settings.trayComponentArc, value: "arcs" },
        { label: copy.settings.trayComponentGauges, value: "gauges" }
      ]
    },
    {
      key: "modelShare" as const,
      label: copy.settings.trayComponentModelShare,
      options: [
        { label: copy.settings.trayComponentBars, value: "bars" },
        { label: copy.settings.trayComponentList, value: "list" },
        { label: copy.settings.trayComponentDonut, value: "donut" },
        { label: copy.settings.trayComponentPie, value: "pie" }
      ]
    }
  ];
  const selectedTrayModuleOption = trayModuleOptions.find((option) => option.value === selectedTrayModule) ?? trayModuleOptions[0];
  const selectedTrayStyleGroup = selectedTrayModuleOption.styleKey
    ? trayComponentOptionGroups.find((group) => group.key === selectedTrayModuleOption.styleKey)
    : undefined;
  const SelectedTrayModuleIcon = selectedTrayModuleOption.icon;

  return (
    <div className="grid min-h-[520px] grid-rows-[auto_minmax(0,1fr)] gap-4">
      <h3 className="text-[15px] font-semibold text-foreground">{copy.settings.tray}</h3>
      <div className="grid min-h-0 grid-cols-[220px_minmax(320px,1fr)_260px] gap-4 max-[1100px]:grid-cols-1">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background">
          <div className="shrink-0 border-b border-border/70 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {copy.settings.trayComponents}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            <div className="grid grid-cols-1 gap-1.5">
              {trayModuleOptions.map((option) => {
                const Icon = option.icon;
                const enabled = trayWindowModuleSet.has(option.value);
                const selected = selectedTrayModule === option.value;

                return (
                  <Button
                    aria-pressed={selected}
                    className={cn(
                      "flex h-10 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] font-medium transition-colors",
                      selected
                        ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.18)]"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      !enabled && "opacity-70"
                    )}
                    key={option.value}
                    onClick={() => setSelectedTrayModule(option.value)}
                    type="button"
                    unstyled
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                        selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    <span
                      aria-hidden="true"
                      className={cn("h-2 w-2 shrink-0 rounded-full", enabled ? "bg-emerald-500" : "bg-muted-foreground/30")}
                    />
                  </Button>
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
            <div className="w-full max-w-[360px]">
              <TrayWindowPreview copy={copy} componentVariants={trayComponentVariants} iconPreference={trayIconPreference} modules={trayWindowModuleSet} />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background">
          <div className="shrink-0 border-b border-border/70 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {copy.settings.trayComponentProperties}
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
            <div className="space-y-3 border-b border-border/70 pb-4">
              <Field label={copy.settings.trayIcon}>
                <TrayIconSelect onChange={onChangeTrayIcon} options={trayIconOptions} value={trayIconPreference} />
              </Field>
              {trayIconPreference === "progress" ? (
                <Field label={copy.settings.trayProgressTarget}>
                  <Input
                    min={1000}
                    step={1000}
                    type="number"
                    value={String(trayProgressTargetTokens)}
                    onChange={(event) => onChangeTrayProgressTarget(event.target.value)}
                  />
                </Field>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <SelectedTrayModuleIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-foreground">{selectedTrayModuleOption.label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{copy.settings.trayComponentProperties}</div>
                </div>
              </div>

              <Label className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
                <span className="min-w-0 truncate text-[12px] font-medium text-foreground">{copy.settings.trayComponentEnabled}</span>
                <Switch
                  checked={trayWindowModuleSet.has(selectedTrayModuleOption.value)}
                  onCheckedChange={(checked) => onSetTrayModuleEnabled(selectedTrayModuleOption.value, checked)}
                />
              </Label>

              {selectedTrayStyleGroup ? (
                <Field label={copy.settings.trayComponentStyle}>
                  <SelectControl
                    onChange={(value) => onChangeTrayComponentVariant(selectedTrayStyleGroup.key, value)}
                    options={selectedTrayStyleGroup.options}
                    value={trayComponentVariants[selectedTrayStyleGroup.key]}
                  />
                </Field>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrayIconSelect({
  onChange,
  options,
  value
}: {
  onChange: (value: string) => void;
  options: Array<{ label: string; value: AppConfig["trayIcon"] }>;
  value: AppConfig["trayIcon"];
}) {
  return (
    <div className="relative min-w-0">
      <TrayIconPreview className="pointer-events-none absolute left-2 top-1/2 z-10 h-5 w-5 -translate-y-1/2 rounded-[5px]" preference={value} />
      <Select className="pl-10" onValueChange={onChange} options={options} value={value} />
    </div>
  );
}

function TrayIconPreview({
  className,
  preference
}: {
  className?: string;
  preference: AppConfig["trayIcon"];
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
      {preference === "progress" ? <TrayProgressPreview /> : null}
    </span>
  );
}

function TrayProgressPreview() {
  const radius = 12.2;
  const circumference = 2 * Math.PI * radius;
  const progress = 0.68;

  return (
    <svg aria-hidden="true" className="h-[80%] w-[80%]" viewBox="0 0 36 36">
      <circle cx="18" cy="18" fill="rgba(15,23,42,.92)" r="15.2" />
      <circle cx="18" cy="18" fill="none" r={radius} stroke="rgba(148,163,184,.55)" strokeWidth="4.2" />
      <circle
        cx="18"
        cy="18"
        fill="none"
        r={radius}
        stroke="rgb(248,250,252)"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        strokeLinecap="round"
        strokeWidth="4.2"
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

function TrayWindowPreview({
  componentVariants,
  copy,
  iconPreference,
  modules
}: {
  componentVariants: TrayComponentVariants;
  copy: AppCopy;
  iconPreference: AppConfig["trayIcon"];
  modules: ReadonlySet<TrayWindowModuleId>;
}) {
  const hasModules = TRAY_WINDOW_MODULE_IDS.some((moduleId) => moduleId !== "footer" && modules.has(moduleId));
  const showTokenMix = modules.has("token-mix");
  const showRings = modules.has("rings");

  return (
    <div className="h-[360px] min-w-0 overflow-y-auto overflow-x-hidden rounded-[14px] border border-slate-950/15 bg-slate-950 p-3 text-slate-50 shadow-[0_18px_42px_rgba(15,23,42,.28)]">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3 border-b border-white/10 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <TrayIconPreview className="h-7 w-7 border-white/15 bg-white/10" preference={iconPreference} />
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold text-slate-50">88.4k {trayPreviewText(copy, "tokens", "tokens")}</div>
            <div className="truncate text-[10px] font-medium text-slate-400">CCR</div>
          </div>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[.04] text-slate-300" aria-hidden="true">
          <Power className="h-3.5 w-3.5" />
        </span>
      </div>

      {modules.has("source-tabs") ? <TrayPreviewSourceTabs copy={copy} /> : null}
      {modules.has("header") ? <TrayPreviewHeader copy={copy} /> : null}
      {modules.has("account") ? <TrayPreviewAccount copy={copy} title={copy.settings.trayModuleAccount} variant={componentVariants.account} /> : null}
      {modules.has("token-flow") ? <TrayPreviewTokenFlow copy={copy} title={copy.settings.trayModuleTokenFlow} variant={componentVariants.tokenFlow} /> : null}
      {modules.has("stats") ? <TrayPreviewStats copy={copy} variant={componentVariants.stats} /> : null}
      {showTokenMix || showRings ? (
        <div className={cn("mb-2 grid gap-2", showTokenMix && showRings ? "grid-cols-2" : "grid-cols-1")}>
          {showTokenMix ? <TrayPreviewTokenMix copy={copy} variant={componentVariants.tokenMix} /> : null}
          {showRings ? <TrayPreviewRings title={copy.settings.trayModuleRings} variant={componentVariants.rings} /> : null}
        </div>
      ) : null}
      {modules.has("model-share") ? <TrayPreviewModelShare title={copy.settings.trayModuleModelShare} variant={componentVariants.modelShare} /> : null}
      {!hasModules ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-[10px] border border-white/10 bg-white/[.03] px-4 text-center text-[12px] font-medium text-slate-400">
          {copy.settings.trayPreviewEmpty}
        </div>
      ) : null}
    </div>
  );
}

function TrayPreviewSourceTabs({ copy }: { copy: AppCopy }) {
  return (
    <div className="mb-2 grid min-w-0 grid-cols-4 gap-1.5">
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
      <div className="shrink-0 rounded-md border border-white/10 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">{trayPreviewText(copy, "7d", "7d")}</div>
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
        {[74, 91].map((value) => (
          <div className="relative aspect-square min-w-0" key={value}>
            <PreviewRadialMetric color={value > 80 ? "rgb(45,212,191)" : "rgb(129,140,248)"} label={`${value}%`} value={value / 100} variant={variant === "rings" ? "ring" : variant === "arcs" ? "arc" : "gauge"} />
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
  color,
  label,
  value,
  variant
}: {
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
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-100">{label}</div>
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

function isTrayMascotIconPreference(value: AppConfig["trayIcon"]): value is "cyan" | "orange" | "violet" {
  return value === "cyan" || value === "orange" || value === "violet";
}

function trayPreviewText(copy: AppCopy, key: string, fallback: string, alternateKey?: string): string {
  return copy.text[key] ?? (alternateKey ? copy.text[alternateKey] : undefined) ?? fallback;
}
