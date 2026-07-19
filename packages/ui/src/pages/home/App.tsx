import {
  AddApiKeyDraft, AddProfileDraft, AddProviderDraft, AddRoutingRuleDraft, AgentAnalysisSessionSelection, AgentAnalysisSnapshot, AgentFilterValue,
  ApiKeyConfig, AppConfig, appCopy, AppI18nContext, AppInfo, AppSaveConfigOptions, AppUpdateStatus,
  AppLanguagePreference, applyProviderProbeResult, AppToast, BotGatewaySavedConfig, buildExtensionList, claudeDesignRoutingConfigFromDraft,
  buildRouterConditionPath,
  ClaudeDesignRoutingDraft, ClaudeDesignRoutingRuleDraft, cloneConfig, createApiKeyDraft, createApiKeyEditDraft,
  createApiKeyList, createClaudeDesignRoutingDraft, createClaudeDesignRoutingRuleDraft, createCursorProxyRoutingDraft, createCursorProxyRoutingRuleDraft, createEmptyAgentAnalysis,
  copyTextToClipboard, createEmptyRequestLogPage, createEmptyUsageStats, createExtensionInstallDraft, createGeneratedApiKey, createPluginSettingsDraft, createProfileDraft,
  createProfileDraftFromProfile, createProviderDraft, createProviderDraftFromDeepLinkPayload, createProviderDraftFromProvider, createRoutingRuleDraft, createRoutingRuleDraftFromRule,
  createVirtualModelDraft, createVirtualModelDraftFromProfile, customProviderPresetId, DEFAULT_TRAY_WIDGETS, detectSystemLanguage, detectSystemTheme,
  enforceSingleEnabledGlobalProfilePerAgent,
  ExtensionConfigTarget, ExtensionDeleteTarget, ExtensionInstallDraft, ExtensionSource, fallbackAgentAnalysis, fallbackConfig,
  fallbackGatewayStatus, fallbackInfo, fallbackProxyNetworkSnapshot, fallbackProxyStatus, fallbackRequestLogPage,
  fallbackUpdateStatus, fallbackUsageStats, formatAppError, GatewayProviderConfig,
  fusionCustomMcpServerFromDraft, fusionCustomToolConfigFromProfile,
  GatewayProviderProbeResult, gatewayServiceMessage, GatewayStatus, getDefaultOnboardingStep, isClaudeDesignPluginConfig, isClaudeDesignRoutingDraftValid,
  isCursorProxyPluginConfig, isMacPlatform, isPlainRecord, isProfileDraftSubmittable, isProviderNameDuplicate, isProviderProbeCandidateReady,
  isTraySupportedPlatform,
  isRoutingRewriteDraftRowValid,
  LayoutGroup, mergeModelDisplayNames, mergeModelMetadata, mergeProviderModelLists, modelDescriptionsForModels, modelDisplayNamesForModels, modelMetadataForModels,
  navigation, NavigationId, normalizeApiKeys, normalizeBotGatewaySavedConfigs, normalizeConfig, normalizeLanguagePreference, normalizeObservabilityConfig, normalizeOverviewWidgets, normalizeProxyConfig,
  normalizeProfileItem, normalizeProfileScope, normalizeProviderBaseUrl, normalizeRouterBuiltInRules, normalizeRouterFallbackConfig, normalizeThemePreference, normalizeToolHubConfig, normalizeTrayBalanceProgressConfig, normalizeTrayIconPreference,
  normalizeTrayWidgets, normalizeTrayWindowModules, normalizeVirtualModelDraftPatch, numberValue, OnboardingReadinessOptions, OnboardingStepId, onboardingStepOrder,
  OverviewWidgetConfig, parsePluginAppsSettingsText, parsePluginConfigSettingsText, parseProviderAccountDraft,
  providerCredentialsFromDraft,
  persistLanguagePreference, PluginMarketplaceEntry, PluginRoutingConfigTarget, pluginSettingsConfigFromDraft, PluginSettingsDraft, presetCapabilitiesFromDraft,
  probeProviderCandidates, probeProviderDeepLinkPayload, profileAgentLabel, profileDraftWithDetectedAppPath, profileEnvRowsForAgent, ProfileConfig, ProfileOpenSurface, ProfileRuntimeStatus, profileConfigFromDraft, providerAccountApiKeySafetyIssue,
  profileOpenCommandFallback, profileOpenSurfaces, ProviderAccountSnapshot, providerApiKeySafetyIssue, ProviderConnectivityCheckReport, ProviderDeepLinkPayload, ProviderDeepLinkRequest, providerIdentitySafetyIssue, providerProbeCandidates,
  providerCapabilitiesForProtocols, providerGlobalBaseUrlForProbe, providerProbeCandidatesApiKeySafetyIssue, providerProbeHasSupportedProtocol, providerProbeInputKey, providerSelectableProtocolsFromProbe, ProxyNetworkSnapshot,
  ProxyStatus, readLanguagePreference, RequestLogListFilter, RequestLogPage, ResolvedLanguage,
  ResolvedTheme, resolvePluginInstallPlan, resolveProviderDeepLinkCatalogModels, RouterRule, SettingsPageId,
  routingRewriteFromDraftRow, setProviderPresets, splitLines, translateAppErrorMessage, translateText, TrayBalanceProgressConfig, TrayWidgetConfig,
  uniqueRoutingRuleId, updateApiKeyEditableConfig, UsageStatsFilter, UsageStatsRange, UsageStatsSnapshot, useEffect,
  useMemo, useReducedMotion, useRef, useState, validateVirtualModelDraft, ViewId,
  VirtualModelDraft, virtualModelProfileFromDraft
} from "./shared/index";
import { startVisiblePolling } from "./shared/polling";
import {
  AppDialogStack, LightToast, MainLayout, OnboardingLayout, shouldCheckForUpdateOnOpen
} from "./components/index";

type ProfileOpenDialogState = {
  busy?: "" | "cli" | "app";
  command?: string;
  error?: string;
  mode: "choose" | "cli";
  profile: ProfileConfig;
};

type ProfileActionBusy = {
  profileId: string;
  surface: ProfileOpenSurface;
};

const providerNamePlaceholder = "__CCR_PROVIDER_NAME__";
const providerNameSlugPlaceholder = "__CCR_PROVIDER_NAME_SLUG__";
const providerInternalNamePlaceholder = "__CCR_PROVIDER_INTERNAL_NAME__";
const localAgentProviderApiKey = "ccr-local-agent-login";
const localCodexDefaultBaseUrl = "https://chatgpt.com/backend-api/codex";
const localCodexProviderId = "codex-api";

function isLocalCodexProviderDraft(draft: AddProviderDraft): boolean {
  return (
    draft.apiKey.trim() === localAgentProviderApiKey &&
    normalizeProviderBaseUrl(draft.baseUrl) === normalizeProviderBaseUrl(localCodexDefaultBaseUrl)
  );
}

function localCodexProviderDraftProbeKey(draft: AddProviderDraft): string {
  return JSON.stringify([
    draft.apiKey.trim(),
    normalizeProviderBaseUrl(draft.baseUrl),
    draft.protocol
  ]);
}

function materializeProviderPluginTemplates(
  templates: unknown[],
  providerName: string,
  protocol: GatewayProviderConfig["type"],
  providerId: string
): unknown[] {
  if (templates.length === 0) {
    return [];
  }
  // The core gateway matches provider plugins against the provider's runtime
  // identifier (provider.id, or its slug), not the human-readable display name
  // — the internal name here must mirror providerCapabilityInternalName() in
  // gateway/service.ts or the plugin's auth-header override silently never applies.
  const internalName = protocol ? `${providerId}::${protocol}` : providerId;
  const replacements: Record<string, string> = {
    [providerInternalNamePlaceholder]: internalName,
    [providerNamePlaceholder]: providerName,
    [providerNameSlugPlaceholder]: providerNameSlug(providerName)
  };
  return templates.map((template) => replaceProviderPluginPlaceholders(template, replacements));
}

function replaceProviderPluginPlaceholders(value: unknown, replacements: Record<string, string>): unknown {
  if (typeof value === "string") {
    return Object.entries(replacements).reduce((result, [search, replacement]) => result.split(search).join(replacement), value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceProviderPluginPlaceholders(item, replacements));
  }
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceProviderPluginPlaceholders(item, replacements)])
    );
  }
  return value;
}

function mergeProviderPlugins(current: unknown[] | undefined, additions: unknown[]): unknown[] | undefined {
  if (additions.length === 0) {
    return current;
  }
  const addedKeys = new Set(additions.map(providerPluginKey).filter((key): key is string => Boolean(key)));
  const retained = (current ?? []).filter((plugin) => {
    const key = providerPluginKey(plugin);
    return !key || !addedKeys.has(key);
  });
  return [...retained, ...additions];
}

function providerPluginKey(value: unknown): string | undefined {
  return isPlainRecord(value) && typeof value.key === "string" && value.key.trim() ? value.key.trim() : undefined;
}

function removeLocalAgentProviderPluginsForProvider(
  current: unknown[] | undefined,
  provider: GatewayProviderConfig | undefined
): unknown[] | undefined {
  if (!provider || providerApiKeyValue(provider) !== localAgentProviderApiKey) {
    return current;
  }

  const providerNames = new Set([
    provider.name,
    provider.type ? `${provider.name}::${provider.type}` : ""
  ].map((value) => value.trim().toLowerCase()).filter(Boolean));
  return (current ?? []).filter((plugin) => !localAgentProviderPluginMatchesProvider(plugin, providerNames));
}

function localAgentProviderPluginMatchesProvider(plugin: unknown, providerNames: Set<string>): boolean {
  if (!isPlainRecord(plugin)) {
    return false;
  }
  const key = typeof plugin.key === "string" ? plugin.key.trim().toLowerCase() : "";
  if (!key.startsWith("ccr-local-agent-")) {
    return false;
  }
  const pluginProviderName = typeof plugin.providerName === "string"
    ? plugin.providerName
    : typeof plugin.provider === "string"
      ? plugin.provider
      : "";
  return providerNames.has(pluginProviderName.trim().toLowerCase());
}

function providerApiKeyValue(provider: GatewayProviderConfig): string {
  return provider.api_key || provider.apiKey || provider.apikey || "";
}

function providerNameSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "provider";
}

async function loadProviderAccountSnapshots(forceRefresh = false): Promise<ProviderAccountSnapshot[]> {
  if (!window.ccr) {
    return [];
  }
  return window.ccr.getProviderAccountSnapshots(undefined, forceRefresh ? { forceRefresh: true } : undefined);
}

function extensionActionIndexes(index: number, groupIndexes?: number[]): number[] {
  const indexes = groupIndexes?.length ? groupIndexes : [index];
  return [...new Set(indexes.filter((item) => Number.isInteger(item) && item >= 0))];
}

function App() {
  const [activeView, setActiveView] = useState<ViewId>("onboarding");
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStepId>(() => getDefaultOnboardingStep(fallbackConfig));
  const [onboardingFinished, setOnboardingFinished] = useState(() => !window.ccr);
  const [onboardingProfileConfirmed, setOnboardingProfileConfirmed] = useState(() => !window.ccr);
  const [appInfo, setAppInfo] = useState<AppInfo>(fallbackInfo);
  const [draftConfig, setDraftConfig] = useState<AppConfig>(fallbackConfig);
  const [configLoaded, setConfigLoaded] = useState(() => !window.ccr);
  const [onboardingStatusLoaded, setOnboardingStatusLoaded] = useState(() => !window.ccr);
  const [providerPresetsLoaded, setProviderPresetsLoaded] = useState(() => !window.ccr);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>(fallbackGatewayStatus);
  const [proxyNetworkSnapshot, setProxyNetworkSnapshot] = useState<ProxyNetworkSnapshot>(fallbackProxyNetworkSnapshot);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>(fallbackProxyStatus);
  const [updateActionBusy, setUpdateActionBusy] = useState<"" | "check" | "download" | "install">("");
  const [updateActionError, setUpdateActionError] = useState("");
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateDialogStatus, setUpdateDialogStatus] = useState<AppUpdateStatus>(fallbackUpdateStatus);
  const [gatewayActionBusy, setGatewayActionBusy] = useState(false);
  const [gatewayActionTargetActive, setGatewayActionTargetActive] = useState<boolean>();
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [profileActionError, setProfileActionError] = useState("");
  const [profileAddOpen, setProfileAddOpen] = useState(false);
  const [profileAgentTab, setProfileAgentTab] = useState<ProfileConfig["agent"]>("claude-code");
  const [profileDraft, setProfileDraft] = useState<AddProfileDraft>(() => createProfileDraft());
  const [profileEditDraft, setProfileEditDraft] = useState<AddProfileDraft>(() => createProfileDraft());
  const [profileEditIndex, setProfileEditIndex] = useState<number>();
  const [profileDeleteIndex, setProfileDeleteIndex] = useState<number>();
  const [profileOpenDialog, setProfileOpenDialog] = useState<ProfileOpenDialogState>();
  const [profileActionBusy, setProfileActionBusy] = useState<ProfileActionBusy>();
  const [profileRuntimeStatus, setProfileRuntimeStatus] = useState<ProfileRuntimeStatus>({ profiles: [] });
  const [profileSubmitBusy, setProfileSubmitBusy] = useState<"" | "add" | "edit">("");
  const [apiKeyAddOpen, setApiKeyAddOpen] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState<AddApiKeyDraft>(() => createApiKeyDraft());
  const [apiKeyEditDraft, setApiKeyEditDraft] = useState<AddApiKeyDraft>(() => createApiKeyDraft());
  const [apiKeyEditIndex, setApiKeyEditIndex] = useState<number>();
  const [apiKeyError, setApiKeyError] = useState("");
  const [createdApiKey, setCreatedApiKey] = useState<ApiKeyConfig>();
  const [providerAddOpen, setProviderAddOpen] = useState(false);
  const [providerDeleteIndex, setProviderDeleteIndex] = useState<number>();
  const [providerEditIndex, setProviderEditIndex] = useState<number>();
  const [providerDraft, setProviderDraft] = useState<AddProviderDraft>(() => createProviderDraft(fallbackConfig.Providers));
  const [providerProbe, setProviderProbe] = useState<GatewayProviderProbeResult>();
  const [providerProbeLoading, setProviderProbeLoading] = useState(false);
  const [providerConnectivityProbe, setProviderConnectivityProbe] = useState<GatewayProviderProbeResult>();
  const [providerConnectivityLoading, setProviderConnectivityLoading] = useState(false);
  const [providerImportOpen, setProviderImportOpen] = useState(false);
  const [providerImportPayload, setProviderImportPayload] = useState<ProviderDeepLinkPayload>();
  const [providerDeepLinkRequest, setProviderDeepLinkRequest] = useState<ProviderDeepLinkRequest>();
  const [providerDeepLinkBusy, setProviderDeepLinkBusy] = useState(false);
  const [providerDeepLinkError, setProviderDeepLinkError] = useState("");
  const [providerProbeError, setProviderProbeError] = useState("");
  const [extensionInstallOpen, setExtensionInstallOpen] = useState(false);
  const [extensionInstallDraft, setExtensionInstallDraft] = useState<ExtensionInstallDraft>(() => createExtensionInstallDraft());
  const [extensionInstallError, setExtensionInstallError] = useState("");
  const [extensionConfigTarget, setExtensionConfigTarget] = useState<ExtensionConfigTarget>();
  const [pluginSettingsDraft, setPluginSettingsDraft] = useState<PluginSettingsDraft>(() => createPluginSettingsDraft());
  const [pluginSettingsError, setPluginSettingsError] = useState("");
  const [pluginRoutingConfigTarget, setPluginRoutingConfigTarget] = useState<PluginRoutingConfigTarget>();
  const [extensionDeleteTarget, setExtensionDeleteTarget] = useState<ExtensionDeleteTarget>();
  const [claudeDesignRoutingDraft, setClaudeDesignRoutingDraft] = useState<ClaudeDesignRoutingDraft>(() => createClaudeDesignRoutingDraft());
  const [cursorProxyRoutingDraft, setCursorProxyRoutingDraft] = useState<ClaudeDesignRoutingDraft>(() => createCursorProxyRoutingDraft());
  const [virtualModelDialogOpen, setVirtualModelDialogOpen] = useState(false);
  const [virtualModelDraft, setVirtualModelDraft] = useState<VirtualModelDraft>(() => createVirtualModelDraft(fallbackConfig));
  const [virtualModelEditIndex, setVirtualModelEditIndex] = useState<number>();
  const [virtualModelError, setVirtualModelError] = useState("");
  const [pluginMarketplace, setPluginMarketplace] = useState<PluginMarketplaceEntry[]>([]);
  const [routingAddOpen, setRoutingAddOpen] = useState(false);
  const [routingDeleteIndex, setRoutingDeleteIndex] = useState<number>();
  const [routingEditIndex, setRoutingEditIndex] = useState<number>();
  const [routingRuleDraft, setRoutingRuleDraft] = useState<AddRoutingRuleDraft>(() => createRoutingRuleDraft());
  const [savedConfig, setSavedConfig] = useState<AppConfig>(fallbackConfig);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialPage, setSettingsInitialPage] = useState<SettingsPageId>("appearance");
  const [settingsBotAddRequestKey, setSettingsBotAddRequestKey] = useState(0);
  const [compactLayout, setCompactLayout] = useState(() => window.matchMedia("(max-width: 720px)").matches);
  const [toast, setToast] = useState<AppToast>();
  const [languagePreference, setLanguagePreference] = useState<AppLanguagePreference>(() => readLanguagePreference());
  const [themePreference, setThemePreference] = useState<AppConfig["theme"]>(() => fallbackConfig.theme || "system");
  const [systemLanguage, setSystemLanguage] = useState<ResolvedLanguage>(() => detectSystemLanguage());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => detectSystemTheme());
  const [requestLogError, setRequestLogError] = useState("");
  const [requestLogFilter, setRequestLogFilter] = useState<RequestLogListFilter>({
    page: 1,
    pageSize: 25,
    status: "all"
  });
  const [requestLogLoading, setRequestLogLoading] = useState(false);
  const [requestLogPage, setRequestLogPage] = useState<RequestLogPage>(fallbackRequestLogPage);
  const [agentAnalysis, setAgentAnalysis] = useState<AgentAnalysisSnapshot>(fallbackAgentAnalysis);
  const [agentAnalysisAgent, setAgentAnalysisAgent] = useState<AgentFilterValue>("all");
  const [agentAnalysisError, setAgentAnalysisError] = useState("");
  const [agentAnalysisLoading, setAgentAnalysisLoading] = useState(false);
  const [agentAnalysisRange, setAgentAnalysisRange] = useState<UsageStatsRange>("7d");
  const [agentAnalysisSession, setAgentAnalysisSession] = useState<AgentAnalysisSessionSelection>();
  const [usageModelFilter, setUsageModelFilter] = useState("");
  const [usageProviderFilter, setUsageProviderFilter] = useState("");
  const [usageRange, setUsageRange] = useState<UsageStatsRange>("7d");
  const [usageStats, setUsageStats] = useState<UsageStatsSnapshot>(fallbackUsageStats);
  const [providerAccountSnapshots, setProviderAccountSnapshots] = useState<ProviderAccountSnapshot[]>([]);
  const [providerAccountRefreshing, setProviderAccountRefreshing] = useState(false);
  const updateActionBusyRef = useRef(false);
  const resolvedLanguage = languagePreference === "system" ? systemLanguage : languagePreference;
  const copy = appCopy[resolvedLanguage];
  const t = useMemo(() => (value: string) => translateText(copy, value), [copy]);
  const formatError = useMemo(() => (error: unknown) => formatAppError(copy, error), [copy]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const updateCompactLayout = () => setCompactLayout(mediaQuery.matches);
    updateCompactLayout();
    mediaQuery.addEventListener("change", updateCompactLayout);
    return () => mediaQuery.removeEventListener("change", updateCompactLayout);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const theme = themePreference;
    if (theme === "system") {
      root.removeAttribute("data-theme");
      return;
    }

    root.dataset.theme = theme;
  }, [themePreference]);

  useEffect(() => {
    document.documentElement.lang = resolvedLanguage === "zh" ? "zh-CN" : "en";
  }, [resolvedLanguage]);

  useEffect(() => {
    const updateSystemLanguage = () => setSystemLanguage(detectSystemLanguage());
    window.addEventListener("languagechange", updateSystemLanguage);
    return () => window.removeEventListener("languagechange", updateSystemLanguage);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemTheme(mediaQuery.matches ? "dark" : "light");
    updateSystemTheme();
    mediaQuery.addEventListener("change", updateSystemTheme);
    return () => mediaQuery.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    if (!window.ccr) {
      return;
    }

    void window.ccr.getAppInfo().then(setAppInfo);
    void window.ccr.getProviderPresets()
      .then(setProviderPresets)
      .catch(() => setProviderPresets([]))
      .finally(() => setProviderPresetsLoaded(true));
    void window.ccr.getConfig()
      .then(syncConfigState)
      .catch(() => {
        // Fall back to the bundled defaults; the rest of the UI can still render.
      })
      .finally(() => setConfigLoaded(true));
    void window.ccr.getOnboardingFinished()
      .then((finished) => {
        setOnboardingFinished(finished);
        setOnboardingProfileConfirmed(finished);
        setActiveView(finished ? "overview" : "onboarding");
      })
      .catch(() => setActiveView("onboarding"))
      .finally(() => setOnboardingStatusLoaded(true));
    void window.ccr.getPluginMarketplace().then(setPluginMarketplace).catch(() => setPluginMarketplace([]));
    const unsubscribeOpenSettings = window.ccr.onOpenSettingsRequest(openSettingsDialog);
    const unsubscribeOpenUpdate = window.ccr.onOpenUpdateRequest(openUpdateDialog);
    const refreshRuntimeStatus = () => {
      void window.ccr?.getGatewayStatus().then(setGatewayStatus);
      void window.ccr?.getProxyStatus().then(setProxyStatus);
      void refreshProfileRuntimeStatus();
    };
    const stopPolling = startVisiblePolling(refreshRuntimeStatus, 2000);
    return () => {
      stopPolling();
      unsubscribeOpenSettings();
      unsubscribeOpenUpdate();
    };
  }, []);

  useEffect(() => {
    if (!appInfo.chatgptAppPath && !appInfo.opencodeAppPath) {
      return;
    }
    setProfileDraft((current) => profileDraftWithDetectedAppPath(current, appInfo.chatgptAppPath, appInfo.opencodeAppPath));
    setProfileEditDraft((current) => profileDraftWithDetectedAppPath(current, appInfo.chatgptAppPath, appInfo.opencodeAppPath));
  }, [appInfo.chatgptAppPath, appInfo.opencodeAppPath]);

  useEffect(() => {
    if (!window.ccr) {
      return;
    }

    let disposed = false;
    void window.ccr.getUpdateStatus()
      .then((status) => {
        if (!disposed) {
          setUpdateDialogStatus(status);
        }
      })
      .catch(() => {
        if (!disposed) {
          setUpdateDialogStatus(fallbackUpdateStatus);
        }
      });

    const unsubscribe = window.ccr.onUpdateStatusChanged((status) => {
      if (!disposed) {
        setUpdateDialogStatus(status);
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [appInfo.version]);

  useEffect(() => {
    if (!window.ccr) {
      return;
    }

    const showProviderDeepLink = (request: ProviderDeepLinkRequest) => {
      providerProbeRequestId.current += 1;
      providerConnectivityRequestId.current += 1;
      setProviderAddOpen(false);
      setProviderImportOpen(false);
      setProviderImportPayload(undefined);
      setProviderEditIndex(undefined);
      setProviderProbe(undefined);
      setProviderConnectivityProbe(undefined);
      setProviderProbeError("");
      setProviderProbeLoading(false);
      setProviderConnectivityLoading(false);
      setProviderDeepLinkRequest(request);
      setProviderDeepLinkError("");
      setProviderDeepLinkBusy(false);
      setActiveView("providers");
    };

    const unsubscribe = window.ccr.onProviderDeepLink(showProviderDeepLink);
    void window.ccr.getPendingProviderDeepLinks()
      .then((requests) => {
        for (const request of requests) {
          showProviderDeepLink(request);
        }
      })
      .catch(() => {
        // Deep links are opportunistic; normal app startup should continue.
      });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const payload = providerDeepLinkRequest?.provider;
    if (!payload || !configLoaded || !providerPresetsLoaded) {
      return;
    }
    void openImportProviderDialog(payload);
  }, [configLoaded, providerDeepLinkRequest?.id, providerDeepLinkRequest?.provider, providerPresetsLoaded]);

  useEffect(() => {
    if (!window.ccr) {
      setUsageStats(createEmptyUsageStats(usageRange));
      return;
    }

    let cancelled = false;
    const refreshUsageStats = () => {
      const filter: UsageStatsFilter = {
        ...(usageRange === "today" ? { includeProxy: true } : {}),
        ...(usageProviderFilter ? { provider: usageProviderFilter } : {}),
        ...(usageModelFilter ? { model: usageModelFilter } : {})
      };
      void window.ccr?.getUsageStats(usageRange, filter).then((snapshot) => {
        if (!cancelled) {
          setUsageStats(snapshot);
        }
      });
    };
    const stopPolling = startVisiblePolling(refreshUsageStats, 5000);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [usageModelFilter, usageProviderFilter, usageRange]);

  useEffect(() => {
    if (!usageProviderFilter) {
      return;
    }
    if (!draftConfig.Providers.some((provider) => provider.name === usageProviderFilter)) {
      setUsageProviderFilter("");
    }
  }, [draftConfig.Providers, usageProviderFilter]);

  useEffect(() => {
    if (!usageModelFilter) {
      return;
    }
    const modelAvailable = draftConfig.Providers.some((provider) =>
      (!usageProviderFilter || provider.name === usageProviderFilter) &&
      provider.models.some((model) => model.trim() === usageModelFilter)
    );
    if (!modelAvailable) {
      setUsageModelFilter("");
    }
  }, [draftConfig.Providers, usageModelFilter, usageProviderFilter]);

  useEffect(() => {
    if (!window.ccr) {
      setProviderAccountSnapshots([]);
      return;
    }

    let cancelled = false;
    const refreshProviderAccounts = () => {
      void loadProviderAccountSnapshots()
        .then((snapshots) => {
          if (!cancelled) {
            setProviderAccountSnapshots(snapshots);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setProviderAccountSnapshots([]);
          }
        });
    };
    const stopPolling = startVisiblePolling(refreshProviderAccounts, 30000);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [draftConfig.Providers]);

  async function refreshProviderAccountsNow() {
    if (providerAccountRefreshing) {
      return;
    }
    setProviderAccountRefreshing(true);
    try {
      setProviderAccountSnapshots(await loadProviderAccountSnapshots(true));
    } catch {
      setProviderAccountSnapshots([]);
    } finally {
      setProviderAccountRefreshing(false);
    }
  }

  const requestLogsEnabled = Boolean(draftConfig.observability.requestLogs);
  const agentAnalysisEnabled = Boolean(draftConfig.observability.agentAnalysis);
  const agentAnalysisFilterKey = JSON.stringify({
    agent: agentAnalysisAgent,
    range: agentAnalysisRange,
    sessionAgent: agentAnalysisSession?.agent,
    sessionId: agentAnalysisSession?.id
  });

  useEffect(() => {
    if (activeView !== "observability") {
      return;
    }
    if (!agentAnalysisEnabled) {
      setAgentAnalysis(createEmptyAgentAnalysis(agentAnalysisRange));
      setAgentAnalysisError("");
      setAgentAnalysisLoading(false);
      return;
    }
    if (!window.ccr) {
      setAgentAnalysis(createEmptyAgentAnalysis(agentAnalysisRange));
      return;
    }

    let cancelled = false;
    const refreshAgentAnalysis = (showLoading = false) => {
      if (showLoading) {
        setAgentAnalysisLoading(true);
      }
      void window.ccr?.getAgentAnalysis({
        agent: agentAnalysisAgent,
        range: agentAnalysisRange,
        sessionAgent: agentAnalysisSession?.agent,
        sessionId: agentAnalysisSession?.id
      })
        .then((snapshot) => {
          if (!cancelled) {
            setAgentAnalysis(snapshot);
            setAgentAnalysisError("");
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setAgentAnalysisError(formatError(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setAgentAnalysisLoading(false);
          }
        });
    };

    const stopPolling = startVisiblePolling(() => refreshAgentAnalysis(), 5000, { immediate: false });
    refreshAgentAnalysis(true);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [activeView, agentAnalysisEnabled, agentAnalysisFilterKey]);

  const requestLogFilterKey = JSON.stringify(requestLogFilter);

  useEffect(() => {
    if (activeView !== "logs") {
      return;
    }
    if (!requestLogsEnabled) {
      setRequestLogPage(createEmptyRequestLogPage(requestLogFilter));
      setRequestLogError("");
      setRequestLogLoading(false);
      return;
    }
    if (!window.ccr) {
      setRequestLogPage(createEmptyRequestLogPage(requestLogFilter));
      return;
    }

    let cancelled = false;
    const refreshRequestLogs = (showLoading = false) => {
      if (showLoading) {
        setRequestLogLoading(true);
      }
      void window.ccr?.getRequestLogs(requestLogFilter)
        .then((page) => {
          if (!cancelled) {
            setRequestLogPage(page);
            setRequestLogError("");
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setRequestLogError(formatError(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setRequestLogLoading(false);
          }
        });
    };

    const stopPolling = startVisiblePolling(() => refreshRequestLogs(), 5000, { immediate: false });
    refreshRequestLogs(true);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [activeView, requestLogsEnabled, requestLogFilterKey]);

  useEffect(() => {
    if (activeView !== "networking" || !draftConfig.proxy.captureNetwork) {
      return;
    }
    if (!window.ccr) {
      setProxyNetworkSnapshot(fallbackProxyNetworkSnapshot);
      return;
    }

    let cancelled = false;
    const refreshNetworkCaptures = () => {
      void window.ccr?.getProxyNetworkCaptures().then((snapshot) => {
        if (!cancelled) {
          setProxyNetworkSnapshot(snapshot);
        }
      });
    };
    const stopPolling = startVisiblePolling(refreshNetworkCaptures, 1500);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [activeView, draftConfig.proxy.captureNetwork]);

  const dirty = draftConfig !== savedConfig;
  const apiKeys = useMemo(() => createApiKeyList(draftConfig), [draftConfig.APIKEY, draftConfig.APIKEYS]);
  const apiKeyEditItem = apiKeyEditIndex === undefined ? undefined : apiKeys.find((apiKey) => apiKey.index === apiKeyEditIndex);
  const profileDeleteItem = profileDeleteIndex === undefined ? undefined : draftConfig.profile.profiles[profileDeleteIndex];
  const providerDeleteItem = providerDeleteIndex === undefined ? undefined : draftConfig.Providers[providerDeleteIndex];
  const routingDeleteRule = routingDeleteIndex === undefined ? undefined : draftConfig.Router.rules[routingDeleteIndex];
  const extensionDeleteItem = useMemo(() => {
    if (!extensionDeleteTarget) {
      return undefined;
    }
    return buildExtensionList(draftConfig).find((extension) =>
      extension.source === extensionDeleteTarget.source && extension.index === extensionDeleteTarget.index
    );
  }, [draftConfig.plugins, draftConfig.providerPlugins, extensionDeleteTarget]);
  const extensionConfigItem = useMemo(() => {
    if (!extensionConfigTarget) {
      return undefined;
    }
    return buildExtensionList(draftConfig).find((extension) =>
      extension.source === "plugins" && extension.index === extensionConfigTarget.index
    );
  }, [draftConfig.plugins, extensionConfigTarget]);
  const pluginRoutingConfigItem = useMemo(() => {
    if (!pluginRoutingConfigTarget) {
      return undefined;
    }
    return draftConfig.plugins[pluginRoutingConfigTarget.index];
  }, [draftConfig.plugins, pluginRoutingConfigTarget]);
  const providers = useMemo(() => draftConfig.Providers.map((provider, index) => ({ provider, index })), [draftConfig.Providers]);
  const gatewayEndpoint = gatewayStatus.endpoint || draftConfig.routerEndpoint;
  const gatewayStartupError = gatewayStatus.state === "error"
    ? translateAppErrorMessage(copy, gatewayStatus.lastError || "Service did not start.")
    : "";
  const networkCaptureEnabled = draftConfig.proxy.enabled && draftConfig.proxy.captureNetwork;
  const visibleNavigation = useMemo(
    () => navigation.filter((item) =>
      (item.id !== "networking" || networkCaptureEnabled) &&
      (item.id !== "logs" || requestLogsEnabled) &&
      (item.id !== "observability" || agentAnalysisEnabled)
    ),
    [agentAnalysisEnabled, networkCaptureEnabled, requestLogsEnabled]
  );
  const autoSaveRequestId = useRef(0);
  const themePreferenceRequestId = useRef(0);
  const onboardingProfileDraftSource = useRef("");
  const providerProbeRequestId = useRef(0);
  const providerConnectivityRequestId = useRef(0);
  const toastTimer = useRef<number>();

  const shouldReduceMotion = useReducedMotion();
  const isMac = isMacPlatform(appInfo.platform);
  const traySupported = isTraySupportedPlatform(appInfo.platform);
  const needsTrafficLightSafeArea = isMac && !sidebarOpen;
  const providerTypedModels = splitLines(providerDraft.modelsText);
  const providerDialogModels = mergeProviderModelLists(providerDraft.selectedModels, providerTypedModels);
  const canSubmitProvider =
    Boolean(providerDraft.name.trim() && providerDraft.baseUrl.trim()) &&
    providerDialogModels.length > 0;
  const canSubmitProfile = isProfileDraftSubmittable(profileDraft) && isProfileBotSelectionValid(profileDraft, draftConfig.botConfigs);
  const canSubmitProfileEdit = profileEditIndex !== undefined && isProfileDraftSubmittable(profileEditDraft) && isProfileBotSelectionValid(profileEditDraft, draftConfig.botConfigs);
  const canSubmitApiKey = Boolean(apiKeyDraft.name.trim()) && (apiKeyDraft.expirationPreset !== "custom" || Boolean(apiKeyDraft.expiresAt.trim()));
  const canSubmitApiKeyEdit = apiKeyEditDraft.expirationPreset !== "custom" || Boolean(apiKeyEditDraft.expiresAt.trim());
  const canSubmitRoutingRule =
    Boolean(routingRuleDraft.name.trim()) &&
    routingRuleDraft.rewrites.length > 0 &&
    routingRuleDraft.rewrites.every(isRoutingRewriteDraftRowValid) &&
    Boolean(routingRuleDraft.conditionField.trim() && routingRuleDraft.conditionOperator && routingRuleDraft.conditionRight.trim());
  const canSubmitClaudeDesignRouting = isClaudeDesignRoutingDraftValid(claudeDesignRoutingDraft);
  const canSubmitCursorProxyRouting = isClaudeDesignRoutingDraftValid(cursorProxyRoutingDraft);
  const virtualModelValidationError = useMemo(() => validateVirtualModelDraft(virtualModelDraft), [virtualModelDraft]);
  const translatedVirtualModelValidationError = useMemo(
    () => virtualModelValidationError ? translateAppErrorMessage(copy, virtualModelValidationError) : "",
    [copy, virtualModelValidationError]
  );
  const canSubmitVirtualModel = !virtualModelValidationError;
  const canInstallExtension = Boolean(extensionInstallDraft.key.trim() && extensionInstallDraft.modulePath.trim());
  const onboardingReadiness = useMemo<OnboardingReadinessOptions>(() => ({
    profileConfirmed: onboardingProfileConfirmed,
    requireProfileConfirmation: activeView === "onboarding" && !onboardingFinished
  }), [activeView, onboardingFinished, onboardingProfileConfirmed]);
  const deferProfileApplyOnSave = activeView === "onboarding" && !onboardingFinished && !onboardingProfileConfirmed;

  useEffect(() => {
    if (!networkCaptureEnabled && activeView === "networking") {
      setActiveView("overview");
    }
  }, [activeView, networkCaptureEnabled]);

  useEffect(() => {
    if (
      (activeView === "logs" && !requestLogsEnabled) ||
      (activeView === "observability" && !agentAnalysisEnabled)
    ) {
      setActiveView("overview");
    }
  }, [activeView, agentAnalysisEnabled, requestLogsEnabled]);

  useEffect(() => {
    if (activeView !== "onboarding" || !configLoaded || !onboardingStatusLoaded || !providerPresetsLoaded) {
      return;
    }
    const defaultStep = getDefaultOnboardingStep(draftConfig, onboardingReadiness);
    const defaultIndex = onboardingStepOrder.indexOf(defaultStep);
    setOnboardingStep((current) => {
      const currentIndex = onboardingStepOrder.indexOf(current);
      return defaultIndex > currentIndex ? defaultStep : current;
    });
  }, [activeView, configLoaded, onboardingStatusLoaded, providerPresetsLoaded, draftConfig, onboardingReadiness]);

  useEffect(() => {
    if (activeView !== "onboarding" || onboardingStep !== "profile" || onboardingProfileConfirmed || !configLoaded) {
      return;
    }

    const sameAgentIndex = draftConfig.profile.profiles.findIndex((profile) => profile.enabled && profile.agent === profileDraft.agent);
    const fallbackIndex = onboardingProfileDraftSource.current
      ? -1
      : draftConfig.profile.profiles.findIndex((profile) => profile.enabled);
    const profileIndex = sameAgentIndex >= 0 ? sameAgentIndex : fallbackIndex;
    const profile = profileIndex >= 0 ? draftConfig.profile.profiles[profileIndex] : undefined;
    if (!profile) {
      return;
    }

    const source = `${profile.agent}:${profile.id || profile.name || profileIndex}`;
    if (onboardingProfileDraftSource.current === source) {
      return;
    }

    onboardingProfileDraftSource.current = source;
    setProfileAgentTab(profile.agent);
    setProfileDraft(profileDraftWithDetectedAppPath(
      createProfileDraftFromProfile(profile, draftConfig.botConfigs),
      appInfo.chatgptAppPath,
      appInfo.opencodeAppPath
    ));
    setProfileActionError("");
  }, [activeView, onboardingStep, onboardingProfileConfirmed, configLoaded, draftConfig.profile.profiles, draftConfig.botConfigs, profileDraft.agent, appInfo.chatgptAppPath, appInfo.opencodeAppPath]);

  useEffect(() => {
    if (activeView !== "onboarding" || !configLoaded || !onboardingStatusLoaded || !providerPresetsLoaded || providerAddOpen) {
      return;
    }

    const providerIndex = draftConfig.Providers.findIndex((provider) => provider.name === draftConfig.preferredProvider);
    const resolvedIndex = providerIndex >= 0 ? providerIndex : draftConfig.Providers.length > 0 ? 0 : -1;
    const provider = resolvedIndex >= 0 ? draftConfig.Providers[resolvedIndex] : undefined;
    if (!provider) {
      setProviderEditIndex(undefined);
      return;
    }

    setProviderEditIndex(resolvedIndex);
    providerProbeRequestId.current += 1;
    providerConnectivityRequestId.current += 1;
    setProviderDraft(createProviderDraftFromProvider(provider));
    setProviderProbe(undefined);
    setProviderConnectivityProbe(undefined);
    setProviderProbeError("");
    setProviderProbeLoading(false);
    setProviderConnectivityLoading(false);
  }, [activeView, configLoaded, onboardingStatusLoaded, providerPresetsLoaded, draftConfig.Providers, draftConfig.preferredProvider, providerAddOpen]);

  useEffect(() => () => {
    if (toastTimer.current !== undefined) {
      window.clearTimeout(toastTimer.current);
    }
  }, []);

  useEffect(() => {
    if (!window.ccr || !dirty) {
      return;
    }

    const requestId = autoSaveRequestId.current + 1;
    autoSaveRequestId.current = requestId;
    const configToSave = normalizeConfig({
      ...draftConfig,
      theme: themePreference
    });
    const options = deferProfileApplyOnSave ? { applyProfile: false } : undefined;
    const timer = window.setTimeout(() => {
      void window.ccr?.saveConfig(configToSave, options)
        .then((saved) => {
          if (autoSaveRequestId.current === requestId) {
            syncConfigState(saved);
            setActionError("");
          }
        })
        .catch((error) => {
          if (autoSaveRequestId.current === requestId) {
            setActionError(formatError(error));
          }
        });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [dirty, draftConfig, deferProfileApplyOnSave, themePreference]);

  function syncConfigState(config: AppConfig) {
    const normalized = normalizeConfig(config);
    setSavedConfig(normalized);
    setDraftConfig(normalized);
    setThemePreference(normalized.theme || "system");
  }

  function showToast(message: string) {
    if (toastTimer.current !== undefined) {
      window.clearTimeout(toastTimer.current);
    }
    setToast({ id: Date.now(), message });
    toastTimer.current = window.setTimeout(() => {
      setToast(undefined);
      toastTimer.current = undefined;
    }, 1800);
  }

  function openUpdateDialog() {
    setUpdateDialogOpen(true);
    setUpdateActionError("");
    void checkForAppUpdate();
  }

  function openSidebarUpdateDialog() {
    setUpdateDialogOpen(true);
    setUpdateActionError("");
    if (shouldCheckForUpdateOnOpen(updateDialogStatus)) {
      void checkForAppUpdate();
    }
  }

  async function checkForAppUpdate() {
    if (updateActionBusyRef.current) {
      return;
    }
    if (!window.ccr?.updateCheck) {
      setUpdateDialogStatus({
        ...fallbackUpdateStatus,
        currentVersion: appInfo.version,
        lastError: t("Updates are only available in packaged builds."),
        state: "error"
      });
      return;
    }

    updateActionBusyRef.current = true;
    setUpdateActionBusy("check");
    setUpdateActionError("");
    try {
      setUpdateDialogStatus(await window.ccr.updateCheck());
    } catch (error) {
      setUpdateActionError(formatError(error));
    } finally {
      updateActionBusyRef.current = false;
      setUpdateActionBusy("");
    }
  }

  async function downloadAppUpdate() {
    if (updateActionBusyRef.current || !window.ccr?.updateDownload) {
      return;
    }

    updateActionBusyRef.current = true;
    setUpdateActionBusy("download");
    setUpdateActionError("");
    try {
      setUpdateDialogStatus(await window.ccr.updateDownload());
    } catch (error) {
      setUpdateActionError(formatError(error));
    } finally {
      updateActionBusyRef.current = false;
      setUpdateActionBusy("");
    }
  }

  async function installAppUpdate() {
    if (updateActionBusyRef.current || !window.ccr?.updateInstall) {
      return;
    }

    updateActionBusyRef.current = true;
    setUpdateActionBusy("install");
    setUpdateActionError("");
    try {
      await window.ccr.updateInstall();
    } catch (error) {
      setUpdateActionError(formatError(error));
      updateActionBusyRef.current = false;
      setUpdateActionBusy("");
    }
  }

  function updateConfig(mutator: (config: AppConfig) => AppConfig) {
    setDraftConfig((current) => {
      const next = normalizeConfig(mutator(cloneConfig(current)));
      return next;
    });
  }

  function buildConfigUpdate(mutator: (config: AppConfig) => AppConfig): AppConfig {
    return normalizeConfig(mutator(cloneConfig(draftConfig)));
  }

  function setConfigDraft(config: AppConfig): AppConfig {
    const normalized = normalizeConfig(config);
    setDraftConfig(normalized);
    return normalized;
  }

  async function persistConfig(config: AppConfig, setError: (message: string) => void, options?: AppSaveConfigOptions): Promise<boolean> {
    autoSaveRequestId.current += 1;
    const configWithTheme = normalizeConfig({
      ...config,
      theme: themePreference
    });
    if (!window.ccr) {
      syncConfigState(configWithTheme);
      return true;
    }

    try {
      const saveOptions = options ?? (deferProfileApplyOnSave ? { applyProfile: false } : undefined);
      const saved = await window.ccr.saveConfig(configWithTheme, saveOptions);
      syncConfigState(saved);
      setError("");
      return true;
    } catch (error) {
      setError(formatError(error));
      return false;
    }
  }

  async function persistApiKeys(apiKeys: ApiKeyConfig[], setError: (message: string) => void): Promise<boolean> {
    if (!window.ccr) {
      setError(t("API key persistence is only available in the Electron app."));
      return false;
    }

    try {
      if (!window.ccr.saveApiKeys) {
        throw new Error("This app build does not expose API key persistence. Rebuild and restart the Electron app.");
      }
      const saved = await window.ccr.saveApiKeys(apiKeys);
      syncConfigState(saved);
      setError("");
      return true;
    } catch (error) {
      setError(formatError(error));
      return false;
    }
  }

  function openAddApiKeyDialog() {
    setCreatedApiKey(undefined);
    setApiKeyDraft(createApiKeyDraft());
    setApiKeyError("");
    setApiKeyAddOpen(true);
  }

  function updateApiKeyDraft(patch: Partial<AddApiKeyDraft>) {
    setApiKeyDraft((current) => ({ ...current, ...patch }));
    setApiKeyError("");
  }

  function openEditApiKeyDialog(index: number) {
    const apiKey = apiKeys.find((item) => item.index === index);
    if (!apiKey) {
      return;
    }
    setApiKeyEditIndex(index);
    setApiKeyEditDraft(createApiKeyEditDraft(apiKey.key));
    setApiKeyError("");
  }

  function updateApiKeyEditDraft(patch: Partial<AddApiKeyDraft>) {
    setApiKeyEditDraft((current) => ({ ...current, ...patch }));
    setApiKeyError("");
  }

  async function submitApiKeyDraft() {
    if (!apiKeyDraft.name.trim()) {
      setApiKeyError(t("Name is required."));
      return;
    }
    if (!canSubmitApiKey) {
      setApiKeyError(t("Expiration is required."));
      return;
    }
    const apiKey = createGeneratedApiKey(apiKeyDraft);

    const next = buildConfigUpdate((config) => {
      const keys = normalizeApiKeys([...config.APIKEYS, apiKey], config.APIKEY);
      config.APIKEYS = keys;
      config.APIKEY = keys[0]?.key ?? "";
      return config;
    });
    setConfigDraft(next);
    if (await persistApiKeys(next.APIKEYS, setApiKeyError)) {
      setApiKeyAddOpen(false);
      setCreatedApiKey(apiKey);
    }
  }

  async function submitApiKeyEditDraft() {
    if (apiKeyEditIndex === undefined) {
      return;
    }
    if (!canSubmitApiKeyEdit) {
      setApiKeyError(t("Expiration is required."));
      return;
    }

    const next = buildConfigUpdate((config) => {
      const keys = normalizeApiKeys(config.APIKEYS, config.APIKEY).map((apiKey, index) =>
        index === apiKeyEditIndex ? updateApiKeyEditableConfig(apiKey, apiKeyEditDraft) : apiKey
      );
      config.APIKEYS = keys;
      config.APIKEY = keys[0]?.key ?? "";
      return config;
    });
    setConfigDraft(next);
    if (await persistApiKeys(next.APIKEYS, setApiKeyError)) {
      setApiKeyEditIndex(undefined);
    }
  }

  async function removeApiKey(index: number) {
    const next = buildConfigUpdate((config) => {
      const keys = normalizeApiKeys(config.APIKEYS, config.APIKEY).filter((_, itemIndex) => itemIndex !== index);
      config.APIKEYS = keys;
      config.APIKEY = keys[0]?.key ?? "";
      return config;
    });
    setConfigDraft(next);
    await persistApiKeys(next.APIKEYS, setApiKeyError);
  }

  function openAddProviderDialog() {
    if (!providerPresetsLoaded) {
      return;
    }
    providerProbeRequestId.current += 1;
    providerConnectivityRequestId.current += 1;
    setProviderEditIndex(undefined);
    setProviderImportOpen(false);
    setProviderImportPayload(undefined);
    setProviderDraft(createProviderDraft(draftConfig.Providers));
    setProviderProbe(undefined);
    setProviderConnectivityProbe(undefined);
    setProviderProbeError("");
    setProviderProbeLoading(false);
    setProviderConnectivityLoading(false);
    setProviderAddOpen(true);
  }

  function openEditProviderDialog(index: number) {
    if (!providerPresetsLoaded) {
      return;
    }
    const provider = draftConfig.Providers[index];
    if (!provider) {
      return;
    }
    providerProbeRequestId.current += 1;
    providerConnectivityRequestId.current += 1;
    setProviderEditIndex(index);
    setProviderImportOpen(false);
    setProviderImportPayload(undefined);
    setProviderDraft(createProviderDraftFromProvider(provider));
    setProviderProbe(undefined);
    setProviderConnectivityProbe(undefined);
    setProviderProbeError("");
    setProviderProbeLoading(false);
    setProviderConnectivityLoading(false);
    setProviderAddOpen(true);
  }

  async function openImportProviderDialog(payload: ProviderDeepLinkPayload) {
    if (!providerPresetsLoaded) {
      return;
    }
    const requestId = providerProbeRequestId.current + 1;
    providerProbeRequestId.current = requestId;
    providerConnectivityRequestId.current += 1;
    setProviderDeepLinkBusy(true);
    let nextPayload = payload;
    let catalogModelDisplayNames: Record<string, string> | undefined;
    let catalogModelMetadata: ProviderDeepLinkPayload["modelMetadata"] | undefined;
    let probe: GatewayProviderProbeResult | undefined;
    if (nextPayload.models.length === 0) {
      const catalogModels = await resolveProviderDeepLinkCatalogModels(nextPayload);
      if (providerProbeRequestId.current !== requestId) {
        setProviderDeepLinkBusy(false);
        return;
      }
      catalogModelDisplayNames = catalogModels.modelDisplayNames;
      catalogModelMetadata = catalogModels.modelMetadata;
      if (catalogModels.models.length > 0) {
        nextPayload = {
          ...nextPayload,
          models: catalogModels.models
        };
      }
    }
    probe = await probeProviderDeepLinkPayload(nextPayload);
    if (providerProbeRequestId.current !== requestId) {
      setProviderDeepLinkBusy(false);
      return;
    }
    if (nextPayload.apiKey?.trim() && probe?.models.length) {
      nextPayload = {
        ...nextPayload,
        models: probe.models
      };
    }

    const initialDraftFromPayload = createProviderDraftFromDeepLinkPayload(nextPayload, draftConfig.Providers);
    const initialDraft = {
      ...initialDraftFromPayload,
      modelDisplayNames: mergeModelDisplayNames(initialDraftFromPayload.modelDisplayNames, catalogModelDisplayNames),
      modelMetadata: mergeModelMetadata(initialDraftFromPayload.modelMetadata, catalogModelMetadata)
    };
    setProviderEditIndex(undefined);
    setProviderImportOpen(true);
    setProviderImportPayload(nextPayload);
    setProviderDraft(probe ? applyProviderProbeResult(initialDraft, probe) : initialDraft);
    setProviderProbe(probe);
    setProviderConnectivityProbe(undefined);
    setProviderProbeError("");
    setProviderProbeLoading(false);
    setProviderConnectivityLoading(false);
    setProviderDeepLinkRequest(undefined);
    setProviderDeepLinkError("");
    setProviderDeepLinkBusy(false);
    setProviderAddOpen(true);
  }

  function updateProviderDraft(patch: Partial<AddProviderDraft>, resetProbe = false) {
    const shouldResetProtocolProbe = resetProbe && (patch.baseUrl !== undefined || patch.presetId !== undefined || patch.protocol !== undefined);
    const shouldResetConnectivityProbe = resetProbe ||
      patch.apiKey !== undefined ||
      patch.baseUrl !== undefined ||
      patch.modelsText !== undefined ||
      patch.presetId !== undefined ||
      patch.protocol !== undefined ||
      patch.selectedModels !== undefined ||
      patch.selectedProtocols !== undefined;

    setProviderDraft((current) => {
      const next = { ...current, ...patch };
      if (!shouldResetProtocolProbe) {
        return next;
      }
      if (patch.selectedModels !== undefined) {
        return next;
      }

      return {
        ...next,
        modelDescriptions: patch.modelDescriptions ?? current.modelDescriptions,
        modelDisplayNames: patch.modelDisplayNames,
        modelMetadata: patch.modelMetadata ?? current.modelMetadata,
        modelsText: mergeProviderModelLists(current.selectedModels, splitLines(next.modelsText)).join("\n"),
        selectedModels: [],
        selectedProtocols: patch.selectedProtocols ?? current.selectedProtocols
      };
    });
    setProviderProbeError("");
    if (shouldResetConnectivityProbe) {
      providerConnectivityRequestId.current += 1;
      setProviderConnectivityProbe(undefined);
      setProviderConnectivityLoading(false);
    }
    if (shouldResetProtocolProbe) {
      providerProbeRequestId.current += 1;
      setProviderProbe(undefined);
      setProviderProbeLoading(false);
    }
  }

  useEffect(() => {
    const providerFormVisible = providerAddOpen || (activeView === "onboarding" && onboardingStep === "provider");
    if (!window.ccr || !providerFormVisible) {
      return;
    }
    if (isLocalCodexProviderDraft(providerDraft)) {
      providerProbeRequestId.current += 1;
      const requestId = providerProbeRequestId.current;
      const inputKey = localCodexProviderDraftProbeKey(providerDraft);

      setProviderProbeError("");
      if (!window.ccr.probeLocalAgentProvider) {
        setProviderProbe(undefined);
        setProviderProbeLoading(false);
        return undefined;
      }
      setProviderProbeLoading(true);

      const timer = window.setTimeout(() => {
        void window.ccr?.probeLocalAgentProvider?.({ id: localCodexProviderId })
          .then((result) => {
            if (providerProbeRequestId.current !== requestId) {
              return;
            }
            setProviderProbe(result.probe);
            setProviderDraft((current) => {
              if (!isLocalCodexProviderDraft(current) || localCodexProviderDraftProbeKey(current) !== inputKey) {
                return current;
              }
              return applyProviderProbeResult(current, result.probe);
            });
          })
          .catch((error) => {
            if (providerProbeRequestId.current === requestId) {
              setProviderProbe(undefined);
              setProviderProbeError(formatError(error));
            }
          })
          .finally(() => {
            if (providerProbeRequestId.current === requestId) {
              setProviderProbeLoading(false);
            }
          });
      }, 350);

      return () => {
        window.clearTimeout(timer);
        if (providerProbeRequestId.current === requestId) {
          providerProbeRequestId.current += 1;
          setProviderProbeLoading(false);
        }
      };
    }
    if (providerDraft.providerPlugins.length > 0) {
      providerProbeRequestId.current += 1;
      setProviderProbe(undefined);
      setProviderProbeError("");
      setProviderProbeLoading(false);
      return;
    }

    providerProbeRequestId.current += 1;
    const requestId = providerProbeRequestId.current;
    const candidates = providerProbeCandidates(providerDraft).filter(isProviderProbeCandidateReady);
    const shouldDiscoverModels = Boolean(providerDraft.apiKey.trim());
    const probeMode = shouldDiscoverModels ? "models" : "protocols";
    const probeApiKey = shouldDiscoverModels ? providerDraft.apiKey.trim() : "";
    const inputKey = providerProbeInputKey(candidates, probeApiKey, []);

    setProviderProbeError("");
    if (candidates.length === 0) {
      setProviderProbeLoading(false);
      return undefined;
    }
    setProviderProbeLoading(true);

    const timer = window.setTimeout(() => {
      void probeProviderCandidates(candidates, probeApiKey, [], { mode: probeMode })
        .then((result) => {
          if (providerProbeRequestId.current !== requestId) {
            return;
          }
          if (!result) {
            setProviderProbe(undefined);
            setProviderProbeError(t("Request failed."));
            return;
          }

          setProviderProbe(result.probe);
          setProviderDraft((current) => {
            const currentCandidates = providerProbeCandidates(current).filter(isProviderProbeCandidateReady);
            const currentShouldDiscoverModels = Boolean(current.apiKey.trim());
            const currentProbeApiKey = currentShouldDiscoverModels ? current.apiKey.trim() : "";
            const currentKey = providerProbeInputKey(currentCandidates, currentProbeApiKey, []);
            if (currentKey !== inputKey) {
              return current;
            }
            return applyProviderProbeResult(current, result.probe);
          });

          if (probeMode !== "models" && !providerProbeHasSupportedProtocol(result.probe)) {
            const message = result.probe.protocols.find((item) => item.message)?.message || "Request failed.";
            setProviderProbeError(translateAppErrorMessage(copy, message));
          }
        })
        .catch((error) => {
          if (providerProbeRequestId.current === requestId) {
            setProviderProbe(undefined);
            setProviderProbeError(formatError(error));
          }
        })
        .finally(() => {
          if (providerProbeRequestId.current === requestId) {
            setProviderProbeLoading(false);
          }
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      if (providerProbeRequestId.current === requestId) {
        providerProbeRequestId.current += 1;
        setProviderProbeLoading(false);
      }
    };
  }, [activeView, onboardingStep, providerAddOpen, providerDraft.apiKey, providerDraft.baseUrl, providerDraft.presetId, providerDraft.protocol, providerDraft.providerPlugins]);

  async function checkProviderDraft(modelsToCheck?: string[]): Promise<ProviderConnectivityCheckReport> {
    const emptyReport: ProviderConnectivityCheckReport = { failed: [], passed: [], results: [] };
    providerConnectivityRequestId.current += 1;
    const requestId = providerConnectivityRequestId.current;
    const apiKey = providerDraft.apiKey.trim();
    const models = mergeProviderModelLists(modelsToCheck ?? mergeProviderModelLists(providerDraft.selectedModels, splitLines(providerDraft.modelsText)));
    const protocols = providerDraft.selectedProtocols.length > 0 ? providerDraft.selectedProtocols : [providerDraft.protocol];
    const candidates = providerProbeCandidates(providerDraft)
      .map((candidate) => ({
        ...candidate,
        protocols: candidate.protocols.filter((protocol) => protocols.includes(protocol))
      }))
      .filter((candidate) => isProviderProbeCandidateReady(candidate) && candidate.protocols.length > 0);

    setProviderProbeError("");
    if (!window.ccr) {
      setProviderProbeError(t("Request failed."));
      return emptyReport;
    }
    if (candidates.length === 0) {
      setProviderProbeError(t("No endpoint candidates available."));
      return emptyReport;
    }
    if (models.length === 0) {
      setProviderProbeError(t("Select or enter at least one model."));
      return emptyReport;
    }
    const safetyIssue = providerProbeCandidatesApiKeySafetyIssue(
      candidates,
      apiKey,
      providerDraft.name,
      providerDraft.presetId
    );
    if (safetyIssue) {
      setProviderProbeError(translateAppErrorMessage(copy, safetyIssue.message));
      return emptyReport;
    }

    setProviderConnectivityLoading(true);
    try {
      const report = await window.ccr.checkProviderConnectivity({
        apiKey,
        candidates,
        forceRefresh: true,
        models,
        providerPlugins: providerDraft.providerPlugins,
        protocols
      });
      if (providerConnectivityRequestId.current !== requestId) {
        return emptyReport;
      }

      setProviderConnectivityProbe(report.probe);

      if (report.passed.length === 0) {
        setProviderProbeError(translateAppErrorMessage(copy, report.failed[0]?.message || "Request failed."));
      }
      return report;
    } catch (error) {
      if (providerConnectivityRequestId.current === requestId) {
        setProviderConnectivityProbe(undefined);
        setProviderProbeError(formatError(error));
      }
      return emptyReport;
    } finally {
      if (providerConnectivityRequestId.current === requestId) {
        setProviderConnectivityLoading(false);
      }
    }
  }

  async function submitProviderDraft(): Promise<boolean> {
    if (providerProbeLoading || providerConnectivityLoading) {
      return false;
    }

    const probe = providerProbe;

    const usesCatalog = Boolean(probe?.models.length);
    const typedModels = splitLines(providerDraft.modelsText);
    const models = mergeProviderModelLists(providerDraft.selectedModels, typedModels);
    if (models.length === 0) {
      setProviderProbeError(t(usesCatalog ? "Select or enter at least one model." : "Enter at least one model."));
      return false;
    }

    const providerName = providerDraft.name.trim();
    if (isProviderNameDuplicate(draftConfig.Providers, providerName, providerEditIndex)) {
      setProviderProbeError(t("Provider name already exists."));
      return false;
    }

    const accountConfig = parseProviderAccountDraft(providerDraft);
    if (typeof accountConfig === "string") {
      setProviderProbeError(translateAppErrorMessage(copy, accountConfig));
      return false;
    }
    const credentials = providerCredentialsFromDraft(providerDraft);
    if (typeof credentials === "string") {
      setProviderProbeError(translateAppErrorMessage(copy, credentials));
      return false;
    }
    const selectableProtocols = providerSelectableProtocolsFromProbe(probe);
    const selectedProtocols = providerDraft.selectedProtocols.length > 0
      ? providerDraft.selectedProtocols.filter((protocol) => !probe || selectableProtocols.includes(protocol))
      : [];
    if (selectableProtocols.length > 0 && selectedProtocols.length === 0) {
      setProviderProbeError(t("Select at least one protocol."));
      return false;
    }

    const protocolsToSave = selectedProtocols.length > 0 ? selectedProtocols : [probe?.detectedProtocol ?? providerDraft.protocol];
    const fallbackProtocol = protocolsToSave.includes(providerDraft.protocol)
      ? providerDraft.protocol
      : protocolsToSave[0] ?? probe?.detectedProtocol ?? providerDraft.protocol;
    const fallbackBaseUrl = providerGlobalBaseUrlForProbe(providerDraft.baseUrl, probe, protocolsToSave);
    const modelDescriptions = modelDescriptionsForModels(providerDraft.modelDescriptions, models);
    const modelDisplayNames = modelDisplayNamesForModels(providerDraft.modelDisplayNames, models);
    const modelMetadata = modelMetadataForModels(providerDraft.modelMetadata, models);
    const capabilities = providerCapabilitiesForProtocols(providerDraft.baseUrl, protocolsToSave, probe, presetCapabilitiesFromDraft(providerDraft));
    const primaryCapability =
      capabilities.find((capability) => capability.type === fallbackProtocol) ??
      capabilities[0];
    const protocol = primaryCapability?.type ?? fallbackProtocol;
    const baseUrl = fallbackBaseUrl;

    const keySafetyIssue = providerApiKeySafetyIssue({
      apiKey: providerDraft.apiKey,
      baseUrl,
      name: providerName,
      presetId: providerDraft.presetId
    });
    if (keySafetyIssue) {
      setProviderProbeError(translateAppErrorMessage(copy, keySafetyIssue.message));
      return false;
    }
    for (const credential of credentials) {
      const credentialKeySafetyIssue = providerApiKeySafetyIssue({
        apiKey: credential.api_key || credential.apiKey || credential.apikey,
        baseUrl,
        name: providerName,
        presetId: providerDraft.presetId
      });
      if (credentialKeySafetyIssue) {
        setProviderProbeError(translateAppErrorMessage(copy, credentialKeySafetyIssue.message));
        return false;
      }
    }
    const identityIssue = providerIdentitySafetyIssue({
      baseUrl,
      name: providerName,
      presetId: providerDraft.presetId
    });
    if (identityIssue) {
      setProviderProbeError(translateAppErrorMessage(copy, identityIssue.message));
      return false;
    }

    const accountKeySafetyIssue = providerAccountApiKeySafetyIssue(accountConfig, {
      apiKey: providerDraft.apiKey,
      baseUrl,
      providerName,
      providerPresetId: providerDraft.presetId
    });
    if (accountKeySafetyIssue) {
      setProviderProbeError(translateAppErrorMessage(copy, accountKeySafetyIssue.message));
      return false;
    }

    const existingProvider = providerEditIndex !== undefined ? draftConfig.Providers[providerEditIndex] : undefined;
    const providerId = existingProvider?.id ?? providerNameSlug(providerName);
    const provider: GatewayProviderConfig = {
      api_base_url: normalizeProviderBaseUrl(baseUrl),
      api_key: providerDraft.apiKey.trim(),
      capabilities: capabilities.length > 0 ? capabilities : undefined,
      account: accountConfig,
      credentials: credentials.length > 0 ? credentials : undefined,
      icon: providerDraft.icon.trim() || undefined,
      id: providerId,
      modelDescriptions,
      modelDisplayNames,
      modelMetadata,
      models,
      name: providerName,
      type: protocol
    };
    const importedProviderPlugins = materializeProviderPluginTemplates(providerDraft.providerPlugins, providerName, protocol, providerId);
    const wasImport = providerImportOpen;

    const next = buildConfigUpdate((config) => {
      if (providerEditIndex === undefined) {
        config.Providers.push(provider);
      } else {
        config.Providers[providerEditIndex] = provider;
      }
      config.providerPlugins = mergeProviderPlugins(config.providerPlugins, importedProviderPlugins);
      if (!config.preferredProvider) {
        config.preferredProvider = provider.name;
      }
      return config;
    });
    setConfigDraft(next);
    if (await persistConfig(next, setProviderProbeError)) {
      setProviderEditIndex(undefined);
      setProviderImportOpen(false);
      setProviderImportPayload(undefined);
      setProviderAddOpen(false);
      if (wasImport) {
        showToast(`${copy.text["Imported provider"] ?? "Imported provider"} ${provider.name}`.trim());
      }
      if (activeView === "onboarding") {
        setOnboardingStep(getDefaultOnboardingStep(next, onboardingReadiness));
      }
      return true;
    }
    return false;
  }

  async function confirmProviderDeepLinkImport() {
    const request = providerDeepLinkRequest;
    if (!request || providerDeepLinkBusy) {
      return;
    }

    if (request.provider) {
      await openImportProviderDialog(request.provider);
      return;
    }

    setProviderDeepLinkBusy(true);
    setProviderDeepLinkError("");
    try {
      if (request.manifest) {
        if (!window.ccr?.fetchProviderManifest) {
          throw new Error("Request failed.");
        }
        const result = await window.ccr.fetchProviderManifest({ url: request.manifest.url });
        setProviderDeepLinkRequest({
          ...request,
          provider: result.provider
        });
        setProviderDeepLinkBusy(false);
        return;
      }

      setProviderDeepLinkBusy(false);
    } catch (error) {
      setProviderDeepLinkError(formatError(error));
      setProviderDeepLinkBusy(false);
    }
  }

  async function removeProvider(index: number): Promise<boolean> {
    const next = buildConfigUpdate((config) => {
      const removedProvider = config.Providers[index];
      config.Providers.splice(index, 1);
      config.providerPlugins = removeLocalAgentProviderPluginsForProvider(config.providerPlugins, removedProvider);
      return config;
    });
    setConfigDraft(next);
    return persistConfig(next, setActionError);
  }

  function updateProviderModelDescription(providerIndex: number, model: string, description: string) {
    const next = buildConfigUpdate((config) => {
      const provider = config.Providers[providerIndex];
      const models = provider ? mergeProviderModelLists(provider.models) : [];
      if (!provider || !models.includes(model)) {
        return config;
      }
      const descriptions = { ...(provider.modelDescriptions ?? {}) };
      const trimmed = description.trim();
      if (trimmed) {
        descriptions[model] = trimmed;
      } else {
        delete descriptions[model];
      }
      provider.modelDescriptions = modelDescriptionsForModels(descriptions, models);
      return config;
    });
    setConfigDraft(next);
    void persistConfig(next, setActionError);
  }

  async function confirmProviderDelete() {
    if (providerDeleteIndex === undefined) {
      return;
    }
    const index = providerDeleteIndex;
    if (await removeProvider(index)) {
      setProviderDeleteIndex(undefined);
    }
  }

  function openAddRoutingRuleDialog() {
    setRoutingEditIndex(undefined);
    setRoutingRuleDraft(createRoutingRuleDraft(draftConfig));
    setRoutingAddOpen(true);
  }

  function openEditRoutingRuleDialog(index: number) {
    const rule = draftConfig.Router.rules[index];
    if (!rule) {
      return;
    }
    setRoutingEditIndex(index);
    setRoutingRuleDraft(createRoutingRuleDraftFromRule(rule, draftConfig));
    setRoutingAddOpen(true);
  }

  function updateRoutingRuleDraft(patch: Partial<AddRoutingRuleDraft>) {
    setRoutingRuleDraft((current) => ({ ...current, ...patch }));
  }

  function submitRoutingRuleDraft() {
    if (!canSubmitRoutingRule) {
      return;
    }

    const rule: RouterRule = {
      condition: {
        left: buildRouterConditionPath(routingRuleDraft.conditionSource, routingRuleDraft.conditionField),
        operator: routingRuleDraft.conditionOperator,
        right: routingRuleDraft.conditionRight.trim()
      },
      enabled: routingRuleDraft.enabled,
      fallback: normalizeRouterFallbackConfig(routingRuleDraft.fallback),
      id: uniqueRoutingRuleId(draftConfig.Router.rules),
      name: routingRuleDraft.name.trim(),
      rewrites: routingRuleDraft.rewrites.map(routingRewriteFromDraftRow),
      type: "condition"
    };

    updateConfig((config) => {
      if (routingEditIndex === undefined) {
        config.Router.rules = [...config.Router.rules, rule];
      } else {
        config.Router.rules[routingEditIndex] = {
          ...rule,
          id: config.Router.rules[routingEditIndex]?.id ?? rule.id
        };
      }
      return config;
    });
    setRoutingEditIndex(undefined);
    setRoutingAddOpen(false);
  }

  function updateRoutingRule(index: number, patch: Partial<RouterRule>) {
    updateConfig((config) => {
      config.Router.rules = config.Router.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      );
      return config;
    });
  }

  function moveRoutingRule(index: number, direction: -1 | 1) {
    updateConfig((config) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= config.Router.rules.length) {
        return config;
      }
      const rules = [...config.Router.rules];
      const [rule] = rules.splice(index, 1);
      rules.splice(nextIndex, 0, rule);
      config.Router.rules = rules;
      return config;
    });
  }

  function removeRoutingRule(index: number) {
    updateConfig((config) => {
      config.Router.rules.splice(index, 1);
      return config;
    });
  }

  function confirmRoutingRuleDelete() {
    if (routingDeleteIndex === undefined) {
      return;
    }
    removeRoutingRule(routingDeleteIndex);
    setRoutingDeleteIndex(undefined);
  }

  function openAddVirtualModelDialog() {
    setVirtualModelEditIndex(undefined);
    setVirtualModelDraft(createVirtualModelDraft(draftConfig));
    setVirtualModelError("");
    setVirtualModelDialogOpen(true);
  }

  function openEditVirtualModelDialog(index: number) {
    const profile = draftConfig.virtualModelProfiles?.[index];
    if (!profile) {
      return;
    }
    setVirtualModelEditIndex(index);
    setVirtualModelDraft(createVirtualModelDraftFromProfile(profile, draftConfig));
    setVirtualModelError("");
    setVirtualModelDialogOpen(true);
  }

  function updateVirtualModelDraft(patch: Partial<VirtualModelDraft>) {
    setVirtualModelDraft((current) => normalizeVirtualModelDraftPatch(current, patch));
    setVirtualModelError("");
  }

  function submitVirtualModelDraft() {
    if (virtualModelValidationError) {
      setVirtualModelError(translatedVirtualModelValidationError);
      return;
    }

    updateConfig((config) => {
      const values = [...(config.virtualModelProfiles ?? [])];
      const previousProfile = virtualModelEditIndex === undefined ? undefined : values[virtualModelEditIndex];
      const profile = virtualModelProfileFromDraft(virtualModelDraft, values, virtualModelEditIndex);
      const previousMcpServerName = previousProfile ? fusionCustomToolConfigFromProfile(previousProfile)?.mcpServerName : undefined;
      if (virtualModelEditIndex === undefined) {
        values.push(profile);
      } else {
        values[virtualModelEditIndex] = profile;
      }
      config.virtualModelProfiles = values;
      const existingMcpServers = [...(config.agent?.mcpServers ?? [])];
      const replacementIndex = previousMcpServerName
        ? existingMcpServers.findIndex((server) => server.name === previousMcpServerName)
        : existingMcpServers.findIndex((server) => server.name === virtualModelDraft.customMcpServer.name.trim());
      const customMcpServer = fusionCustomMcpServerFromDraft(virtualModelDraft, existingMcpServers, replacementIndex >= 0 ? replacementIndex : undefined);
      if (customMcpServer) {
        if (replacementIndex >= 0) {
          existingMcpServers[replacementIndex] = customMcpServer;
        } else {
          existingMcpServers.push(customMcpServer);
        }
      } else if (previousMcpServerName && replacementIndex >= 0) {
        existingMcpServers.splice(replacementIndex, 1);
      }
      config.agent = {
        ...(config.agent ?? { mcpServers: [] }),
        mcpServers: existingMcpServers
      };
      return config;
    });
    setVirtualModelEditIndex(undefined);
    setVirtualModelDialogOpen(false);
    setVirtualModelError("");
  }

  function setVirtualModelEnabled(index: number, enabled: boolean) {
    updateConfig((config) => {
      const values = [...(config.virtualModelProfiles ?? [])];
      const item = values[index];
      if (!item) {
        return config;
      }
      values[index] = { ...item, enabled };
      config.virtualModelProfiles = values;
      return config;
    });
  }

  function removeVirtualModel(index: number) {
    updateConfig((config) => {
      config.virtualModelProfiles = (config.virtualModelProfiles ?? []).filter((_, itemIndex) => itemIndex !== index);
      return config;
    });
  }

  function openInstallExtensionDialog() {
    setExtensionInstallDraft(createExtensionInstallDraft());
    setExtensionInstallError("");
    setExtensionInstallOpen(true);
  }

  function updateExtensionInstallDraft(patch: Partial<ExtensionInstallDraft>) {
    setExtensionInstallError("");
    setExtensionInstallDraft((current) => ({ ...current, ...patch }));
  }

  async function chooseLocalExtensionDirectory() {
    if (!window.ccr?.selectPluginDirectory) {
      setActionError(t("Local plugin selection is available in the Electron app."));
      return;
    }

    try {
      const selection = await window.ccr.selectPluginDirectory();
      if (!selection) {
        return;
      }
      setExtensionInstallDraft((current) => ({
        ...current,
        apps: selection.apps,
        dependencies: selection.dependencies,
        key: selection.id,
        marketplaceId: "",
        modulePath: selection.modulePath,
        selectedName: selection.name || selection.id
      }));
      setExtensionInstallError("");
      setActionError("");
    } catch (error) {
      setActionError(formatError(error));
    }
  }

  function submitExtensionInstallDraft() {
    if (!canInstallExtension) {
      return;
    }

    const installPlan = resolvePluginInstallPlan(
      {
        apps: extensionInstallDraft.apps,
        dependencies: extensionInstallDraft.dependencies,
        id: extensionInstallDraft.key.trim(),
        modulePath: extensionInstallDraft.modulePath.trim(),
        name: extensionInstallDraft.selectedName
      },
      pluginMarketplace,
      draftConfig.plugins ?? []
    );
    if (installPlan.missing.length > 0) {
      setExtensionInstallError(`Missing plugin dependencies: ${installPlan.missing.join(", ")}`);
      return;
    }

    updateConfig((config) => {
      const existingIds = new Set((config.plugins ?? []).map((plugin) => plugin.id));
      const pluginsToAdd = installPlan.items
        .filter((item) => !existingIds.has(item.id))
        .map((item) => ({
          ...(item.apps?.length ? { apps: item.apps } : {}),
          enabled: true,
          id: item.id,
          module: item.modulePath
        }));
      config.plugins = [...(config.plugins ?? []), ...pluginsToAdd];
      return config;
    });
    setActionError("");
    setExtensionInstallError("");

    setExtensionInstallOpen(false);
  }

  function removeExtension(source: ExtensionSource, index: number, groupIndexes?: number[]) {
    const indexes = new Set(extensionActionIndexes(index, groupIndexes));
    updateConfig((config) => {
      if (source === "plugins") {
        config.plugins = (config.plugins ?? []).filter((_, itemIndex) => !indexes.has(itemIndex));
      } else {
        config.providerPlugins = (config.providerPlugins ?? []).filter((_, itemIndex) => !indexes.has(itemIndex));
      }
      return config;
    });
  }

  function confirmExtensionDelete() {
    if (!extensionDeleteTarget) {
      return;
    }
    removeExtension(extensionDeleteTarget.source, extensionDeleteTarget.index, extensionDeleteTarget.groupIndexes);
    setExtensionDeleteTarget(undefined);
  }

  function openConfigureExtension(source: ExtensionSource, index: number) {
    if (source !== "plugins") {
      return;
    }
    const item = draftConfig.plugins[index];
    if (!item) {
      return;
    }
    setPluginSettingsDraft(createPluginSettingsDraft(item));
    setPluginSettingsError("");
    setExtensionConfigTarget({ index });
  }

  function updatePluginSettingsDraft(patch: Partial<PluginSettingsDraft>) {
    setPluginSettingsDraft((current) => ({ ...current, ...patch }));
    setPluginSettingsError("");
  }

  function submitPluginSettingsDraft() {
    if (!extensionConfigTarget) {
      return;
    }

    const appsResult = parsePluginAppsSettingsText(pluginSettingsDraft.appsText);
    if (!appsResult.ok) {
      setPluginSettingsError(appsResult.message);
      return;
    }

    const configResult = parsePluginConfigSettingsText(pluginSettingsDraft.configText);
    if (!configResult.ok) {
      setPluginSettingsError(configResult.message);
      return;
    }

    updateConfig((config) => {
      const values = [...(config.plugins ?? [])];
      const item = values[extensionConfigTarget.index];
      if (!item) {
        return config;
      }
      const nextConfig = pluginSettingsConfigFromDraft(item.config, configResult.value);
      values[extensionConfigTarget.index] = {
        ...item,
        ...(appsResult.value && appsResult.value.length > 0 ? { apps: appsResult.value } : { apps: undefined }),
        config: nextConfig,
        enabled: pluginSettingsDraft.enabled,
        module: pluginSettingsDraft.modulePath.trim()
      };
      config.plugins = values;
      return config;
    });
    setExtensionConfigTarget(undefined);
    setPluginSettingsError("");
  }

  function openConfigurePluginRouting(index: number) {
    const item = draftConfig.plugins[index];
    if (!item) {
      return;
    }
    if (isClaudeDesignPluginConfig(item)) {
      setClaudeDesignRoutingDraft(createClaudeDesignRoutingDraft(item.config));
    } else if (isCursorProxyPluginConfig(item)) {
      setCursorProxyRoutingDraft(createCursorProxyRoutingDraft(item.config));
    } else {
      return;
    }
    setPluginRoutingConfigTarget({ index });
  }

  function updateClaudeDesignRoutingDraft(patch: Partial<ClaudeDesignRoutingDraft>) {
    setClaudeDesignRoutingDraft((current) => ({ ...current, ...patch }));
  }

  function addClaudeDesignRoutingRule() {
    setClaudeDesignRoutingDraft((current) => ({
      ...current,
      rules: [...current.rules, createClaudeDesignRoutingRuleDraft(current.rules)]
    }));
  }

  function updateClaudeDesignRoutingRule(index: number, patch: Partial<ClaudeDesignRoutingRuleDraft>) {
    setClaudeDesignRoutingDraft((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule)
    }));
  }

  function removeClaudeDesignRoutingRule(index: number) {
    setClaudeDesignRoutingDraft((current) => ({
      ...current,
      rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index)
    }));
  }

  function submitClaudeDesignRoutingDraft() {
    if (!pluginRoutingConfigTarget || !canSubmitClaudeDesignRouting) {
      return;
    }

    updateConfig((config) => {
      const values = [...(config.plugins ?? [])];
      const item = values[pluginRoutingConfigTarget.index];
      if (!item || !isClaudeDesignPluginConfig(item)) {
        return config;
      }

      const configRecord = isPlainRecord(item.config) ? { ...item.config } : {};
      values[pluginRoutingConfigTarget.index] = {
        ...item,
        config: {
          ...configRecord,
          routing: claudeDesignRoutingConfigFromDraft(claudeDesignRoutingDraft)
        }
      };
      config.plugins = values;
      return config;
    });
    setPluginRoutingConfigTarget(undefined);
  }

  function updateCursorProxyRoutingDraft(patch: Partial<ClaudeDesignRoutingDraft>) {
    setCursorProxyRoutingDraft((current) => ({ ...current, ...patch }));
  }

  function addCursorProxyRoutingRule() {
    setCursorProxyRoutingDraft((current) => ({
      ...current,
      rules: [...current.rules, createCursorProxyRoutingRuleDraft(current.rules)]
    }));
  }

  function updateCursorProxyRoutingRule(index: number, patch: Partial<ClaudeDesignRoutingRuleDraft>) {
    setCursorProxyRoutingDraft((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule)
    }));
  }

  function removeCursorProxyRoutingRule(index: number) {
    setCursorProxyRoutingDraft((current) => ({
      ...current,
      rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index)
    }));
  }

  function submitCursorProxyRoutingDraft() {
    if (!pluginRoutingConfigTarget || !canSubmitCursorProxyRouting) {
      return;
    }

    updateConfig((config) => {
      const values = [...(config.plugins ?? [])];
      const item = values[pluginRoutingConfigTarget.index];
      if (!item || !isCursorProxyPluginConfig(item)) {
        return config;
      }

      const configRecord = isPlainRecord(item.config) ? { ...item.config } : {};
      values[pluginRoutingConfigTarget.index] = {
        ...item,
        config: {
          ...configRecord,
          routing: claudeDesignRoutingConfigFromDraft(cursorProxyRoutingDraft)
        }
      };
      config.plugins = values;
      return config;
    });
    setPluginRoutingConfigTarget(undefined);
  }

  function setExtensionEnabled(source: ExtensionSource, index: number, enabled: boolean, groupIndexes?: number[]) {
    const indexes = new Set(extensionActionIndexes(index, groupIndexes));
    updateConfig((config) => {
      if (source === "plugins") {
        const values = [...(config.plugins ?? [])];
        for (const itemIndex of indexes) {
          const item = values[itemIndex];
          if (!item) {
            continue;
          }
          values[itemIndex] = { ...item, enabled };
        }
        config.plugins = values;
        return config;
      }

      if (source === "providerPlugins") {
        const values = [...(config.providerPlugins ?? [])];
        for (const itemIndex of indexes) {
          const item = values[itemIndex];
          if (!isPlainRecord(item)) {
            continue;
          }
          values[itemIndex] = { ...item, enabled };
        }
        config.providerPlugins = values;
        return config;
      }
      return config;
    });
  }

  function changeThemePreference(value: string) {
    const theme = normalizeThemePreference(value);
    const previousTheme = themePreference;
    setThemePreference(theme);

    if (!window.ccr?.setThemePreference) {
      updateConfig((config) => ({
        ...config,
        theme
      }));
      return;
    }

    const requestId = themePreferenceRequestId.current + 1;
    themePreferenceRequestId.current = requestId;
    void window.ccr.setThemePreference(theme)
      .then((savedTheme) => {
        if (themePreferenceRequestId.current !== requestId) {
          return;
        }
        setThemePreference(savedTheme);
        setActionError("");
      })
      .catch((error) => {
        if (themePreferenceRequestId.current !== requestId) {
          return;
        }
        setThemePreference(previousTheme);
        setActionError(formatError(error));
      });
  }

  function changeLaunchAtLogin(launchAtLogin: boolean) {
    updateConfig((config) => ({
      ...config,
      launchAtLogin
    }));
  }

  function changeTrayIconPreference(value: string) {
    const trayIcon = normalizeTrayIconPreference(value);
    if (trayIcon === "progress" && !normalizeTrayBalanceProgressConfig(draftConfig.trayBalanceProgress)) {
      return;
    }
    updateConfig((config) => ({
      ...config,
      trayIcon
    }));
  }

  function changeTrayBalanceProgress(config: TrayBalanceProgressConfig) {
    const trayBalanceProgress = normalizeTrayBalanceProgressConfig(config);
    updateConfig((current) => ({
      ...current,
      trayBalanceProgress,
      trayIcon: trayBalanceProgress ? "progress" : current.trayIcon === "progress" ? "random" : current.trayIcon
    }));
  }

  function changeTrayWidgets(widgets: TrayWidgetConfig[]) {
    const trayWidgets = normalizeTrayWidgets(widgets);
    updateConfig((config) => ({
      ...config,
      trayWidgets,
      trayWindowModules: normalizeTrayWindowModules([...trayWidgets.map((widget) => widget.type), "footer"])
    }));
  }

  function changeBotConfigs(botConfigs: BotGatewaySavedConfig[]) {
    const normalizedBotConfigs = normalizeBotGatewaySavedConfigs(botConfigs);
    const validIds = new Set(normalizedBotConfigs.map((config) => config.id));
    updateConfig((config) => ({
      ...config,
      botConfigs: normalizedBotConfigs,
      profile: {
        ...config.profile,
        profiles: config.profile.profiles.map((profile) =>
          profile.botConfigId && !validIds.has(profile.botConfigId)
            ? removeProfileBotReference(profile)
            : profile
        )
      }
    }));
  }

  function changeObservabilityConfig(patch: Partial<AppConfig["observability"]>) {
    updateConfig((config) => ({
      ...config,
      observability: normalizeObservabilityConfig({
        ...config.observability,
        ...patch
      })
    }));
  }

  function changeProxyConfig(patch: Partial<AppConfig["proxy"]>) {
    updateConfig((config) => ({
      ...config,
      proxy: normalizeProxyConfig({
        ...config.proxy,
        ...patch,
        upstream: {
          ...config.proxy.upstream,
          ...(patch.upstream ?? {}),
          custom: {
            ...config.proxy.upstream.custom,
            ...(patch.upstream?.custom ?? {})
          }
        }
      })
    }));
  }

  function changeToolHubConfig(patch: Partial<AppConfig["toolHub"]>) {
    updateConfig((config) => ({
      ...config,
      toolHub: normalizeToolHubConfig({
        ...config.toolHub,
        ...patch,
        llm: {
          ...config.toolHub.llm,
          ...(patch.llm ?? {})
        }
      })
    }));
  }

  function openBotSettingsWithAddDialog() {
    setSettingsInitialPage("bots");
    setSettingsBotAddRequestKey((current) => current + 1);
    setSettingsOpen(true);
  }

  function openSettingsDialog() {
    setSettingsInitialPage("appearance");
    setSettingsOpen(true);
  }

  function openGeneralSettingsDialog() {
    setSettingsInitialPage("general");
    setSettingsOpen(true);
  }

  function changeOverviewWidgets(widgets: OverviewWidgetConfig[]) {
    updateConfig((config) => ({
      ...config,
      overviewWidgets: normalizeOverviewWidgets(widgets)
    }));
  }

  function changeLanguagePreference(value: string) {
    const language = normalizeLanguagePreference(value);
    setLanguagePreference(language);
    persistLanguagePreference(language);
  }

  async function completeOnboarding() {
    if (window.ccr) {
      try {
        await window.ccr.setOnboardingFinished();
      } catch (error) {
        setActionError(formatError(error));
        return;
      }
    }
    setOnboardingFinished(true);
    setOnboardingProfileConfirmed(true);
    setActiveView("overview");
  }

  function selectNavigationItem(id: NavigationId) {
    setActiveView(id);
  }

  async function toggleGatewayService() {
    if (!window.ccr) {
      setActionError(t("Service control is available in the Electron app."));
      return;
    }

    const shouldStop = gatewayStatus.state === "running" || gatewayStatus.state === "starting";
    setGatewayActionTargetActive(!shouldStop);
    setGatewayActionBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      const status = shouldStop ? await window.ccr.stopGateway() : await window.ccr.startGateway();
      setGatewayStatus(status);
      const nextProxyStatus = await window.ccr.getProxyStatus();
      setProxyStatus(nextProxyStatus);
      setActionMessage(translateAppErrorMessage(copy, gatewayServiceMessage(status, shouldStop)));
    } catch (error) {
      setActionError(formatError(error));
    } finally {
      setGatewayActionBusy(false);
      setGatewayActionTargetActive(undefined);
    }
  }

  async function refreshProxyNetworkCaptures() {
    if (!window.ccr) {
      setProxyNetworkSnapshot(fallbackProxyNetworkSnapshot);
      return;
    }
    setProxyNetworkSnapshot(await window.ccr.getProxyNetworkCaptures());
  }

  async function refreshRequestLogs() {
    if (!requestLogsEnabled) {
      setRequestLogPage(createEmptyRequestLogPage(requestLogFilter));
      setRequestLogError("");
      setRequestLogLoading(false);
      return;
    }
    if (!window.ccr) {
      setRequestLogPage(createEmptyRequestLogPage(requestLogFilter));
      return;
    }

    setRequestLogLoading(true);
    try {
      setRequestLogPage(await window.ccr.getRequestLogs(requestLogFilter));
      setRequestLogError("");
    } catch (error) {
      setRequestLogError(formatError(error));
    } finally {
      setRequestLogLoading(false);
    }
  }

  async function refreshAgentAnalysis() {
    if (!agentAnalysisEnabled) {
      setAgentAnalysis(createEmptyAgentAnalysis(agentAnalysisRange));
      setAgentAnalysisError("");
      setAgentAnalysisLoading(false);
      return;
    }
    if (!window.ccr) {
      setAgentAnalysis(createEmptyAgentAnalysis(agentAnalysisRange));
      return;
    }

    setAgentAnalysisLoading(true);
    try {
      setAgentAnalysis(await window.ccr.getAgentAnalysis({
        agent: agentAnalysisAgent,
        range: agentAnalysisRange,
        sessionAgent: agentAnalysisSession?.agent,
        sessionId: agentAnalysisSession?.id
      }));
      setAgentAnalysisError("");
    } catch (error) {
      setAgentAnalysisError(formatError(error));
    } finally {
      setAgentAnalysisLoading(false);
    }
  }

  function updateRequestLogFilter(patch: RequestLogListFilter, resetPage = true) {
    setRequestLogFilter((current) => ({
      ...current,
      ...patch,
      page: resetPage ? 1 : patch.page ?? current.page
    }));
  }

  function updateAgentAnalysisAgent(value: AgentFilterValue) {
    setAgentAnalysisAgent(value);
    setAgentAnalysisSession(undefined);
  }

  function updateAgentAnalysisRange(value: UsageStatsRange) {
    setAgentAnalysisRange(value);
    setAgentAnalysisSession(undefined);
  }

  async function clearProxyNetworkCaptures() {
    if (!window.ccr) {
      setProxyNetworkSnapshot(fallbackProxyNetworkSnapshot);
      return;
    }
    setProxyNetworkSnapshot(await window.ccr.clearProxyNetworkCaptures());
  }

  async function setProxyNetworkCaptureEnabled(enabled: boolean) {
    updateConfig((next) => ({ ...next, proxy: { ...next.proxy, captureNetwork: enabled } }));
    setProxyNetworkSnapshot((current) => ({ ...current, captureEnabled: enabled }));
    if (!enabled && activeView === "networking") {
      setActiveView("overview");
    }
    if (!window.ccr) {
      return;
    }
    try {
      setProxyNetworkSnapshot(await window.ccr.setProxyNetworkCaptureEnabled(enabled));
      setActionError("");
    } catch (error) {
      setActionError(formatError(error));
    }
  }

  function openAddProfileDialog(agent: ProfileConfig["agent"] = profileAgentTab) {
    setProfileAgentTab(agent);
    setProfileDraft(profileDraftWithDetectedAppPath(createProfileDraft(agent), appInfo.chatgptAppPath, appInfo.opencodeAppPath));
    setProfileActionError("");
    setProfileAddOpen(true);
  }

  function openEditProfileDialog(index: number) {
    const profile = draftConfig.profile.profiles[index];
    if (!profile) {
      return;
    }
    setProfileEditIndex(index);
    setProfileEditDraft(profileDraftWithDetectedAppPath(
      createProfileDraftFromProfile(profile, draftConfig.botConfigs),
      appInfo.chatgptAppPath,
      appInfo.opencodeAppPath
    ));
    setProfileActionError("");
  }

  function openProfileDialog(index: number) {
    const profile = draftConfig.profile.profiles[index];
    if (!profile?.enabled) {
      return;
    }
    setProfileActionError("");
    const surfaces = profileOpenSurfaces(profile);
    if (surfaces.length > 1) {
      void showProfileCliCommand(profile, "choose");
      return;
    }
    if (surfaces[0] === "app") {
      void openProfileApp(profile);
      return;
    }
    void showProfileCliCommand(profile);
  }

  async function copyProfileCliCommand(index: number) {
    const profile = draftConfig.profile.profiles[index];
    if (!profile?.enabled || !profileOpenSurfaces(profile).includes("cli") || profileActionBusy) {
      return;
    }

    setProfileActionError("");
    setProfileActionBusy({ profileId: profile.id, surface: "cli" });
    try {
      let saveError = "";
      const setSaveError = (message: string) => {
        saveError = message;
        setProfileActionError(message);
      };
      if (!(await persistConfig(draftConfig, setSaveError))) {
        if (!saveError) {
          setProfileActionError(t("Failed to save profile before copying."));
        }
        return;
      }

      let command = profileOpenCommandFallback(profile, "cli");
      if (window.ccr?.getProfileOpenCommand) {
        const result = await window.ccr.getProfileOpenCommand({ profileId: profile.id, surface: "cli" });
        command = result.command;
      }
      await copyTextToClipboard(command);
      setProfileActionError("");
      showToast(t("Copied"));
    } catch (error) {
      setProfileActionError(formatError(error));
    } finally {
      setProfileActionBusy((current) =>
        current?.profileId === profile.id && current.surface === "cli" ? undefined : current
      );
    }
  }

  async function openProfileAppFromList(index: number) {
    const profile = draftConfig.profile.profiles[index];
    if (!profile?.enabled || !profileOpenSurfaces(profile).includes("app") || profileActionBusy) {
      return;
    }

    setProfileActionError("");
    setProfileActionBusy({ profileId: profile.id, surface: "app" });
    try {
      let saveError = "";
      const setSaveError = (message: string) => {
        saveError = message;
        setProfileActionError(message);
      };
      if (!(await persistConfig(draftConfig, setSaveError))) {
        if (!saveError) {
          setProfileActionError(t("Failed to save profile before opening."));
        }
        return;
      }

      if (!window.ccr?.openProfile) {
        setProfileActionError(t("Profile opening is only available in the Electron app."));
        return;
      }
      const result = await window.ccr.openProfile({ profileId: profile.id, surface: "app" });
      await refreshProfileRuntimeStatus();
      showToast(translateAppErrorMessage(copy, result.message));
    } catch (error) {
      setProfileActionError(formatError(error));
    } finally {
      setProfileActionBusy((current) =>
        current?.profileId === profile.id && current.surface === "app" ? undefined : current
      );
    }
  }

  async function stopProfileAppFromList(index: number) {
    const profile = draftConfig.profile.profiles[index];
    if (!profile?.enabled || !profileOpenSurfaces(profile).includes("app") || profileActionBusy) {
      return;
    }

    setProfileActionError("");
    setProfileActionBusy({ profileId: profile.id, surface: "app" });
    try {
      if (!window.ccr?.stopProfile) {
        setProfileActionError(t("Profile stopping is only available in the Electron app."));
        return;
      }
      const result = await window.ccr.stopProfile({ profileId: profile.id, surface: "app" });
      removeProfileRuntimeEntry(result.profileId, result.surface);
      await refreshProfileRuntimeStatus();
      showToast(translateAppErrorMessage(copy, result.message));
    } catch (error) {
      setProfileActionError(formatError(error));
    } finally {
      setProfileActionBusy((current) =>
        current?.profileId === profile.id && current.surface === "app" ? undefined : current
      );
    }
  }

  async function showProfileCliCommand(profile: ProfileConfig, mode: "choose" | "cli" = "cli") {
    const fallbackCommand = profileOpenCommandFallback(profile, "cli");
    setProfileOpenDialog({ busy: "cli", command: fallbackCommand, mode, profile });
    if (!(await persistConfig(draftConfig, setProfileActionError))) {
      setProfileOpenDialog((current) => current?.profile.id === profile.id
        ? { ...current, busy: "", error: profileActionError || t("Failed to save profile before opening.") }
        : current);
      return;
    }
    if (!window.ccr?.getProfileOpenCommand) {
      setProfileOpenDialog((current) => current?.profile.id === profile.id ? { ...current, busy: "" } : current);
      return;
    }
    try {
      const result = await window.ccr.getProfileOpenCommand({ profileId: profile.id, surface: "cli" });
      setProfileOpenDialog((current) => current?.profile.id === profile.id
        ? { ...current, busy: "", command: result.command, error: "" }
        : current);
    } catch (error) {
      setProfileOpenDialog((current) => current?.profile.id === profile.id
        ? { ...current, busy: "", error: formatError(error) }
        : current);
    }
  }

  async function openProfileApp(profile: ProfileConfig) {
    setProfileOpenDialog((current) => current?.profile.id === profile.id
      ? { ...current, busy: "app", error: "" }
      : { busy: "app", mode: "choose", profile });
    if (!(await persistConfig(draftConfig, setProfileActionError))) {
      setProfileOpenDialog((current) => current?.profile.id === profile.id
        ? { ...current, busy: "", error: profileActionError || t("Failed to save profile before opening.") }
        : current);
      return;
    }
    if (!window.ccr?.openProfile) {
      setProfileOpenDialog((current) => current?.profile.id === profile.id
        ? { ...current, busy: "", error: t("Profile opening is only available in the Electron app.") }
        : current);
      return;
    }
    try {
      const result = await window.ccr.openProfile({ profileId: profile.id, surface: "app" });
      await refreshProfileRuntimeStatus();
      setProfileOpenDialog(undefined);
      showToast(translateAppErrorMessage(copy, result.message));
    } catch (error) {
      setProfileOpenDialog((current) => current?.profile.id === profile.id
        ? { ...current, busy: "", error: formatError(error) }
        : current);
    }
  }

  async function stopProfileApp(profile: ProfileConfig) {
    setProfileOpenDialog((current) => current?.profile.id === profile.id
      ? { ...current, busy: "app", error: "" }
      : current);
    if (!window.ccr?.stopProfile) {
      setProfileOpenDialog((current) => current?.profile.id === profile.id
        ? { ...current, busy: "", error: t("Profile stopping is only available in the Electron app.") }
        : current);
      return;
    }
    try {
      const result = await window.ccr.stopProfile({ profileId: profile.id, surface: "app" });
      removeProfileRuntimeEntry(result.profileId, result.surface);
      await refreshProfileRuntimeStatus();
      setProfileOpenDialog(undefined);
      showToast(translateAppErrorMessage(copy, result.message));
    } catch (error) {
      setProfileOpenDialog((current) => current?.profile.id === profile.id
        ? { ...current, busy: "", error: formatError(error) }
        : current);
    }
  }

  async function refreshProfileRuntimeStatus(): Promise<void> {
    if (!window.ccr?.getProfileRuntimeStatus) {
      setProfileRuntimeStatus({ profiles: [] });
      return;
    }
    try {
      setProfileRuntimeStatus(await window.ccr.getProfileRuntimeStatus());
    } catch {
      setProfileRuntimeStatus({ profiles: [] });
    }
  }

  function removeProfileRuntimeEntry(profileId: string, surface: ProfileOpenSurface) {
    setProfileRuntimeStatus((current) => ({
      profiles: current.profiles.filter((entry) => entry.profileId !== profileId || entry.surface !== surface)
    }));
  }

  function updateProfileDraft(patch: Partial<AddProfileDraft>) {
    setProfileDraft((current) => {
      const next = { ...current, ...patch };
      if (patch.agent && patch.agent !== current.agent) {
        const name = current.name === profileAgentLabel(current.agent) ? undefined : next.name;
        return profileDraftWithDetectedAppPath({
          ...createProfileDraft(patch.agent, name),
          envRows: profileEnvRowsForAgent(patch.agent, current.envRows)
        }, appInfo.chatgptAppPath, appInfo.opencodeAppPath);
      }
      return next;
    });
    setProfileActionError("");
  }

  function updateProfileEditDraft(patch: Partial<AddProfileDraft>) {
    setProfileEditDraft((current) => {
      const next = { ...current, ...patch };
      if (patch.agent && patch.agent !== current.agent) {
        const name = current.name === profileAgentLabel(current.agent) ? undefined : next.name;
        return profileDraftWithDetectedAppPath({
          ...createProfileDraft(patch.agent, name),
          envRows: profileEnvRowsForAgent(patch.agent, current.envRows)
        }, appInfo.chatgptAppPath, appInfo.opencodeAppPath);
      }
      return next;
    });
    setProfileActionError("");
  }

  async function submitProfileDraft(): Promise<boolean> {
    if (profileSubmitBusy) {
      return false;
    }
    if (!canSubmitProfile) {
      setProfileActionError(t("Profile name, required target settings, and environment variable keys are required."));
      return false;
    }
    setProfileSubmitBusy("add");
    const onboardingProfileIndex = activeView === "onboarding"
      ? draftConfig.profile.profiles.findIndex((item) => item.enabled && item.agent === profileDraft.agent)
      : -1;
    const existingProfile = onboardingProfileIndex >= 0 ? draftConfig.profile.profiles[onboardingProfileIndex] : undefined;
    const profile = profileConfigFromDraft(profileDraft, draftConfig.profile.profiles, existingProfile, draftConfig.botConfigs);
    setProfileAgentTab(profile.agent);
    const next = buildConfigUpdate((config) => ({
      ...config,
      profile: {
        ...config.profile,
        enabled: true,
        profiles: (() => {
          const profiles = [...config.profile.profiles];
          const profileIndex = onboardingProfileIndex >= 0 && profiles[onboardingProfileIndex]
            ? onboardingProfileIndex
            : profiles.length;
          profiles[profileIndex] = profile;
          return enforceSingleEnabledGlobalProfilePerAgent(profiles, profileIndex);
        })()
      }
    }));
    setConfigDraft(next);
    try {
      if (!(await persistConfig(next, setProfileActionError, { applyProfile: true }))) {
        return false;
      }
      setProfileAddOpen(false);
      setProfileDraft(createProfileDraft());
      setProfileActionError("");
      if (activeView === "onboarding") {
        setOnboardingProfileConfirmed(true);
        setOnboardingStep("enter");
      }
      return true;
    } finally {
      setProfileSubmitBusy("");
    }
  }

	  async function submitProfileEditDraft(): Promise<boolean> {
	    if (profileSubmitBusy) {
	      return false;
	    }
	    if (profileEditIndex === undefined) {
	      return false;
	    }
	    if (!canSubmitProfileEdit) {
	      setProfileActionError(t("Profile name, required target settings, and environment variable keys are required."));
	      return false;
	    }
	    setProfileSubmitBusy("edit");
	    const currentProfile = draftConfig.profile.profiles[profileEditIndex];
	    if (!currentProfile) {
	      setProfileSubmitBusy("");
	      setProfileActionError(t("Profile no longer exists."));
	      return false;
	    }
    const nextProfile = profileConfigFromDraft(profileEditDraft, draftConfig.profile.profiles, currentProfile, draftConfig.botConfigs);
    setProfileAgentTab(nextProfile.agent);
    const next = buildConfigUpdate((config) => {
      const profiles = [...config.profile.profiles];
      profiles[profileEditIndex] = nextProfile;
      return {
        ...config,
        profile: {
          ...config.profile,
          profiles: enforceSingleEnabledGlobalProfilePerAgent(profiles, profileEditIndex)
        }
      };
    });
    setConfigDraft(next);
	    try {
	      if (!(await persistConfig(next, setProfileActionError))) {
	        return false;
	      }
	      setProfileEditIndex(undefined);
	      setProfileEditDraft(createProfileDraft());
	      setProfileActionError("");
	      return true;
	    } finally {
	      setProfileSubmitBusy("");
	    }
	  }

  function updateProfileItem(index: number, patch: Partial<ProfileConfig>) {
    updateConfig((next) => {
      const profiles = [...next.profile.profiles];
      const current = profiles[index];
      if (!current) {
        return next;
      }
      profiles[index] = normalizeProfileItem({ ...current, ...patch }, index);
      return {
        ...next,
        profile: {
          ...next.profile,
          profiles: enforceSingleEnabledGlobalProfilePerAgent(profiles, index)
        }
      };
    });
  }

  function removeProfile(index: number) {
    updateConfig((next) => ({
      ...next,
      profile: {
        ...next.profile,
        profiles: next.profile.profiles.filter((_, itemIndex) => itemIndex !== index)
      }
    }));
  }

  function confirmProfileDelete() {
    if (profileDeleteIndex === undefined) {
      return;
    }
    removeProfile(profileDeleteIndex);
    setProfileDeleteIndex(undefined);
  }

  return (
    <AppI18nContext.Provider value={copy}>
      <LayoutGroup id="home-shell">
        <div className="relative flex h-full min-h-0 w-full min-w-0 overflow-hidden bg-background text-foreground max-[720px]:flex-col">
          {activeView === "onboarding" ? (
            <OnboardingLayout
              gatewayStartupError={gatewayStartupError}
              loaded={configLoaded && onboardingStatusLoaded && providerPresetsLoaded}
              onboarding={{
                activeStep: onboardingStep,
                canSubmitProfile,
                canSubmitProvider,
                config: draftConfig,
                endpoint: gatewayEndpoint,
                gatewayStatus,
                onCheckProvider: checkProviderDraft,
                onComplete: completeOnboarding,
                onChangeProfile: updateProfileDraft,
                onChangeProvider: updateProviderDraft,
                onSelectStep: setOnboardingStep,
                onSubmitProfile: submitProfileDraft,
                onSubmitProvider: submitProviderDraft,
                profileDraft,
                profileError: profileActionError,
                providerDraft,
                providerError: providerProbeError,
                providerConnectivityLoading,
                providerConnectivityProbe,
                providerProbe,
                providerProbeLoading,
                readiness: onboardingReadiness
              }}
            />
          ) : (
            <MainLayout
              activeView={activeView}
              agentAnalysisEnabled={agentAnalysisEnabled}
              compactLayout={compactLayout}
              config={draftConfig}
              copy={copy}
              gatewayActionBusy={gatewayActionBusy}
              gatewayEndpoint={gatewayEndpoint}
              gatewayStartupError={gatewayStartupError}
              gatewayStatus={gatewayStatus}
              gatewayTargetActive={gatewayActionTargetActive}
              isMac={isMac}
              needsTrafficLightSafeArea={needsTrafficLightSafeArea}
              networkCaptureEnabled={networkCaptureEnabled}
              onOpenUpdate={openSidebarUpdateDialog}
              onOpenServerSettings={openGeneralSettingsDialog}
              onOpenSettings={openSettingsDialog}
              onSelectNavigationItem={selectNavigationItem}
              onToggleSidebar={() => setSidebarOpen((current) => !current)}
              requestLogsEnabled={requestLogsEnabled}
              shouldReduceMotion={shouldReduceMotion}
              sidebarOpen={sidebarOpen}
              toggleGatewayService={toggleGatewayService}
              updateActionBusy={Boolean(updateActionBusy)}
              updateStatus={updateDialogStatus}
              visibleNavigation={visibleNavigation}
              viewProps={{
                apiKeys: {
                  addApiKey: openAddApiKeyDialog,
                  apiKeys,
                  editApiKey: openEditApiKeyDialog,
                  error: apiKeyError,
                  notify: showToast,
                  removeApiKey
                },
                extensions: {
                  configureExtension: openConfigureExtension,
                  config: draftConfig,
                  installExtension: openInstallExtensionDialog,
                  removeExtension: (source, index, groupIndexes) => setExtensionDeleteTarget({ groupIndexes: extensionActionIndexes(index, groupIndexes), index, source }),
                  setExtensionEnabled
                },
                logs: {
                  error: requestLogError,
                  filter: requestLogFilter,
                  loading: requestLogLoading,
                  page: requestLogPage,
                  refreshLogs: () => void refreshRequestLogs(),
                  updateFilter: updateRequestLogFilter
                },
                models: {
                  config: draftConfig,
                  updateModelDescription: updateProviderModelDescription
                },
                networking: {
                  clearCaptures: () => void clearProxyNetworkCaptures(),
                  proxyStatus,
                  refreshCaptures: () => void refreshProxyNetworkCaptures(),
                  setCaptureEnabled: (enabled) => void setProxyNetworkCaptureEnabled(enabled),
                  snapshot: proxyNetworkSnapshot
                },
                observability: {
                  agentFilter: agentAnalysisAgent,
                  error: agentAnalysisError,
                  loading: agentAnalysisLoading,
                  range: agentAnalysisRange,
                  refreshAnalysis: () => void refreshAgentAnalysis(),
                  selectedSession: agentAnalysisSession,
                  setAgentFilter: updateAgentAnalysisAgent,
                  setRange: updateAgentAnalysisRange,
                  setSelectedSession: setAgentAnalysisSession,
                  snapshot: agentAnalysis
                },
                overview: {
                  usageFilters: {
                    modelFilter: usageModelFilter,
                    providerFilter: usageProviderFilter,
                    providers: draftConfig.Providers,
                    setModelFilter: setUsageModelFilter,
                    setProviderFilter: setUsageProviderFilter
                  },
                  onWidgetsChange: changeOverviewWidgets,
                  overviewWidgets: normalizeOverviewWidgets(draftConfig.overviewWidgets),
                  providerAccounts: providerAccountSnapshots,
                  providerAccountRefreshing,
                  refreshProviderAccounts: () => void refreshProviderAccountsNow(),
                  setUsageRange,
                  usageRange,
                  usageStats
                },
                profile: {
                  addProfile: openAddProfileDialog,
                  applyError: profileActionError,
                  copyProfileCliCommand: (index) => void copyProfileCliCommand(index),
                  config: draftConfig,
                  editProfile: openEditProfileDialog,
                  openProfileApp: (index) => void openProfileAppFromList(index),
                  profileActionBusy,
                  profileRuntimeStatus,
                  removeProfile: setProfileDeleteIndex,
                  stopProfileApp: (index) => void stopProfileAppFromList(index),
                  updateProfileItem
                },
                providers: {
                  accountSnapshots: providerAccountSnapshots,
                  addProvider: openAddProviderDialog,
                  editProvider: openEditProviderDialog,
                  notify: showToast,
                  providers,
                  removeProvider: setProviderDeleteIndex
                },
                routing: {
                  addRule: openAddRoutingRuleDialog,
                  config: draftConfig,
                  editRule: openEditRoutingRuleDialog,
                  moveRule: moveRoutingRule,
                  providers: draftConfig.Providers,
                  removeRule: setRoutingDeleteIndex,
                  updateBuiltInRule: (agent, patch) => updateConfig((config) => {
                    config.Router.builtInRules = normalizeRouterBuiltInRules(config.Router.builtInRules);
                    if (agent === "claude-code") {
                      config.Router.builtInRules["claude-code"] = {
                        ...config.Router.builtInRules["claude-code"],
                        ...patch
                      };
                    } else {
                      config.Router.builtInRules.codex = {
                        ...config.Router.builtInRules.codex,
                        ...patch
                      };
                    }
                    return config;
                  }),
                  updateFallback: (fallback) => updateConfig((config) => {
                    config.Router.fallback = normalizeRouterFallbackConfig(fallback);
                    return config;
                  }),
                  updateRule: updateRoutingRule
                },
                virtualModels: {
                  addVirtualModel: openAddVirtualModelDialog,
                  editVirtualModel: openEditVirtualModelDialog,
                  profiles: draftConfig.virtualModelProfiles ?? [],
                  removeVirtualModel,
                  setVirtualModelEnabled
                }
              }}
            />
          )}

          <AppDialogStack
            apiKeyAdd={apiKeyAddOpen ? {
              canSubmit: canSubmitApiKey,
              draft: apiKeyDraft,
              error: apiKeyError,
              onChange: updateApiKeyDraft,
              onClose: () => setApiKeyAddOpen(false),
              onSubmit: submitApiKeyDraft
            } : undefined}
            apiKeyCreated={createdApiKey ? {
              apiKeyName: createdApiKey.name?.trim() || t("API key"),
              apiKeyValue: createdApiKey.key,
              onClose: () => setCreatedApiKey(undefined)
            } : undefined}
            apiKeyEdit={apiKeyEditItem ? {
              canSubmit: canSubmitApiKeyEdit,
              draft: apiKeyEditDraft,
              error: apiKeyError,
              onChange: updateApiKeyEditDraft,
              onClose: () => setApiKeyEditIndex(undefined),
              onSubmit: submitApiKeyEditDraft
            } : undefined}
            claudeDesignConfig={pluginRoutingConfigItem && isClaudeDesignPluginConfig(pluginRoutingConfigItem) ? {
              canSubmit: canSubmitClaudeDesignRouting,
              draft: claudeDesignRoutingDraft,
              routesLabel: "Claude Design routes",
              sourceModelLabel: "Claude Design model",
              sourceModelDefaults: { model: "claude-opus-4-8", pattern: "claude-" },
              onAddRule: addClaudeDesignRoutingRule,
              onChange: updateClaudeDesignRoutingDraft,
              onChangeRule: updateClaudeDesignRoutingRule,
              onClose: () => setPluginRoutingConfigTarget(undefined),
              onRemoveRule: removeClaudeDesignRoutingRule,
              onSubmit: submitClaudeDesignRoutingDraft,
              providers: draftConfig.Providers
            } : undefined}
            cursorProxyConfig={pluginRoutingConfigItem && isCursorProxyPluginConfig(pluginRoutingConfigItem) ? {
              canSubmit: canSubmitCursorProxyRouting,
              draft: cursorProxyRoutingDraft,
              routesLabel: "Cursor Proxy routes",
              sourceModelLabel: "Cursor model",
              sourceModelDefaults: { model: "default", pattern: "cursor-" },
              onAddRule: addCursorProxyRoutingRule,
              onChange: updateCursorProxyRoutingDraft,
              onChangeRule: updateCursorProxyRoutingRule,
              onClose: () => setPluginRoutingConfigTarget(undefined),
              onRemoveRule: removeCursorProxyRoutingRule,
              onSubmit: submitCursorProxyRoutingDraft,
              providers: draftConfig.Providers
            } : undefined}
            extensionDelete={extensionDeleteItem ? {
              extension: extensionDeleteItem,
              onClose: () => setExtensionDeleteTarget(undefined),
              onConfirm: confirmExtensionDelete
            } : undefined}
            extensionInstall={extensionInstallOpen ? {
              canSubmit: canInstallExtension,
              draft: extensionInstallDraft,
              error: extensionInstallError,
              marketplace: pluginMarketplace,
              onChange: updateExtensionInstallDraft,
              onChooseLocal: chooseLocalExtensionDirectory,
              onClose: () => setExtensionInstallOpen(false),
              onSubmit: submitExtensionInstallDraft
            } : undefined}
            extensionSettings={extensionConfigItem ? {
              draft: pluginSettingsDraft,
              error: pluginSettingsError,
              extension: extensionConfigItem,
              onChange: updatePluginSettingsDraft,
              onClose: () => setExtensionConfigTarget(undefined),
              onSubmit: submitPluginSettingsDraft
            } : undefined}
            profileAdd={profileAddOpen ? {
              botConfigs: draftConfig.botConfigs,
              canSubmit: canSubmitProfile,
              draft: profileDraft,
              error: profileActionError,
              mode: "add",
	              onChange: updateProfileDraft,
	              onCreateBot: openBotSettingsWithAddDialog,
	              onClose: () => setProfileAddOpen(false),
	              providers: draftConfig.Providers,
	              submitting: profileSubmitBusy === "add",
	              virtualModelProfiles: draftConfig.virtualModelProfiles ?? [],
	              onSubmit: submitProfileDraft
	            } : undefined}
            profileDelete={profileDeleteItem ? {
              onClose: () => setProfileDeleteIndex(undefined),
              onConfirm: confirmProfileDelete,
              profile: profileDeleteItem
            } : undefined}
            profileEdit={profileEditIndex !== undefined ? {
              botConfigs: draftConfig.botConfigs,
              canSubmit: canSubmitProfileEdit,
              draft: profileEditDraft,
              error: profileActionError,
              mode: "edit",
              onChange: updateProfileEditDraft,
              onCreateBot: openBotSettingsWithAddDialog,
              onClose: () => {
                setProfileEditIndex(undefined);
                setProfileActionError("");
	              },
	              providers: draftConfig.Providers,
	              submitting: profileSubmitBusy === "edit",
	              virtualModelProfiles: draftConfig.virtualModelProfiles ?? [],
	              onSubmit: submitProfileEditDraft
	            } : undefined}
            profileOpen={profileOpenDialog ? {
              appRunning: profileRuntimeStatus.profiles.some((entry) =>
                entry.profileId === profileOpenDialog.profile.id && entry.surface === "app" && entry.state === "running"
              ),
              busy: profileOpenDialog.busy,
              command: profileOpenDialog.command,
              error: profileOpenDialog.error,
              mode: profileOpenDialog.mode,
              onChooseApp: () => void openProfileApp(profileOpenDialog.profile),
              onClose: () => setProfileOpenDialog(undefined),
              onStopApp: () => void stopProfileApp(profileOpenDialog.profile),
              profile: profileOpenDialog.profile
            } : undefined}
            providerDeepLink={providerDeepLinkRequest && !providerDeepLinkRequest.provider ? {
              busy: providerDeepLinkBusy,
              error: providerDeepLinkError,
              onClose: () => {
                if (!providerDeepLinkBusy) {
                  setProviderDeepLinkRequest(undefined);
                }
              },
              onSubmit: confirmProviderDeepLinkImport,
              presetsLoaded: providerPresetsLoaded,
              request: providerDeepLinkRequest
            } : undefined}
            providerDelete={providerDeleteItem ? {
              onClose: () => setProviderDeleteIndex(undefined),
              onConfirm: confirmProviderDelete,
              provider: providerDeleteItem
            } : undefined}
            providerUpsert={providerAddOpen ? {
              canSubmit: canSubmitProvider,
              connectivityLoading: providerConnectivityLoading,
              connectivityProbe: providerConnectivityProbe,
              draft: providerDraft,
              error: providerProbeError,
              importProvider: providerImportOpen ? providerImportPayload : undefined,
              onChange: updateProviderDraft,
              mode: providerEditIndex === undefined ? "add" : "edit",
              onClose: () => {
                setProviderAddOpen(false);
                setProviderEditIndex(undefined);
                setProviderImportOpen(false);
                setProviderImportPayload(undefined);
              },
              onCheck: checkProviderDraft,
              onSubmit: submitProviderDraft,
              probe: providerProbe,
              probeLoading: providerProbeLoading,
              providerPlugins: draftConfig.providerPlugins ?? [],
              providers: draftConfig.Providers,
              submitLabel: providerImportOpen ? t("Import") : undefined,
              title: providerImportOpen ? t("Import Provider") : undefined
            } : undefined}
            routingDelete={routingDeleteRule ? {
              onClose: () => setRoutingDeleteIndex(undefined),
              onConfirm: confirmRoutingRuleDelete,
              rule: routingDeleteRule
            } : undefined}
            routingUpsert={routingAddOpen ? {
              canSubmit: canSubmitRoutingRule,
              draft: routingRuleDraft,
              mode: routingEditIndex === undefined ? "add" : "edit",
              onChange: updateRoutingRuleDraft,
              onClose: () => {
                setRoutingAddOpen(false);
                setRoutingEditIndex(undefined);
              },
              onSubmit: submitRoutingRuleDraft,
              providers: draftConfig.Providers
            } : undefined}
            settings={settingsOpen ? {
              appInfo,
              botAddRequestKey: settingsBotAddRequestKey,
              botConfigs: draftConfig.botConfigs,
              config: draftConfig,
              copy,
              initialPage: settingsInitialPage,
              languagePreference,
              launchAtLogin: Boolean(draftConfig.launchAtLogin),
              onChangeBotConfigs: changeBotConfigs,
              onChangeLaunchAtLogin: changeLaunchAtLogin,
              onChangeLanguage: changeLanguagePreference,
              onChangeObservability: changeObservabilityConfig,
              onChangeProxy: changeProxyConfig,
              onChangeTheme: changeThemePreference,
              onChangeToolHub: changeToolHubConfig,
              onChangeTrayBalanceProgress: changeTrayBalanceProgress,
              onChangeTrayIcon: changeTrayIconPreference,
              onChangeTrayWidgets: changeTrayWidgets,
              onClose: () => setSettingsOpen(false),
              observability: draftConfig.observability,
              profiles: draftConfig.profile.profiles,
              proxy: draftConfig.proxy,
              providers: draftConfig.Providers,
              systemLanguage,
              systemTheme,
              themePreference,
              toolHub: draftConfig.toolHub,
              providerAccountSnapshots,
              trayBalanceProgress: normalizeTrayBalanceProgressConfig(draftConfig.trayBalanceProgress),
              trayIconPreference: draftConfig.trayIcon || "random",
              traySupported,
              trayWidgets: normalizeTrayWidgets(draftConfig.trayWidgets ?? DEFAULT_TRAY_WIDGETS, draftConfig.trayWindowModules, draftConfig.trayComponentVariants),
              updateConfig
            } : undefined}
            update={updateDialogOpen ? {
              actionBusy: updateActionBusy,
              actionError: updateActionError,
              copy,
              onCheck: checkForAppUpdate,
              onClose: () => {
                if (updateActionBusy !== "install") {
                  setUpdateDialogOpen(false);
                  setUpdateActionError("");
                }
              },
              onDownload: downloadAppUpdate,
              onInstall: installAppUpdate,
              status: updateDialogStatus
            } : undefined}
            virtualModelUpsert={virtualModelDialogOpen ? {
              canSubmit: canSubmitVirtualModel,
              draft: virtualModelDraft,
              error: virtualModelError || translatedVirtualModelValidationError,
              mcpServers: draftConfig.agent?.mcpServers ?? [],
              mode: virtualModelEditIndex === undefined ? "add" : "edit",
              onChange: updateVirtualModelDraft,
              onClose: () => {
                setVirtualModelDialogOpen(false);
                setVirtualModelEditIndex(undefined);
              },
              onSubmit: submitVirtualModelDraft,
              providers: draftConfig.Providers
            } : undefined}
          />
          <LightToast toast={toast} />
        </div>
      </LayoutGroup>
    </AppI18nContext.Provider>
  );
}

function removeProfileBotReference(profile: ProfileConfig): ProfileConfig {
  const { botConfigId: _botConfigId, botGateway: _botGateway, ...rest } = profile;
  return rest;
}

function isProfileBotSelectionValid(draft: AddProfileDraft, botConfigs: BotGatewaySavedConfig[]): boolean {
  return !draft.botEnabled || botConfigs.some((config) => config.id === draft.botConfigId.trim());
}

export default App;
