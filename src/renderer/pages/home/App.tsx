import {
  AddApiKeyDraft, AddProfileDraft, AddProviderDraft, AddRoutingRuleDraft, AgentAnalysisSnapshot, AgentFilterValue,
  ApiKeyConfig, AppConfig, appCopy, AppI18nContext, AppInfo,
  AppLanguagePreference, applyProviderProbeResult, AppToast, buildExtensionList, claudeDesignRoutingConfigFromDraft,
  ClaudeDesignRoutingDraft, ClaudeDesignRoutingRuleDraft, cloneConfig, createApiKeyDraft, createApiKeyEditDraft,
  createApiKeyList, createClaudeDesignRoutingDraft, createClaudeDesignRoutingRuleDraft, createCursorProxyRoutingDraft, createCursorProxyRoutingRuleDraft, createEmptyAgentAnalysis,
  createEmptyRequestLogPage, createEmptyUsageStats, createExtensionInstallDraft, createGeneratedApiKey, createPluginSettingsDraft, createProfileDraft,
  createProfileDraftFromProfile, createProviderConfigFromDeepLink, createProviderDraft, createProviderDraftFromProvider, createRoutingRuleDraft, createRoutingRuleDraftFromRule,
  createVirtualModelDraft, createVirtualModelDraftFromProfile, DEFAULT_TRAY_WINDOW_MODULES, detectSystemLanguage, detectSystemTheme,
  ExtensionConfigTarget, ExtensionDeleteTarget, ExtensionInstallDraft, ExtensionSource, fallbackAgentAnalysis, fallbackConfig,
  fallbackGatewayStatus, fallbackInfo, fallbackProxyCertificateStatus, fallbackProxyNetworkSnapshot, fallbackProxyStatus, fallbackRequestLogPage,
  fallbackUsageStats, findProviderDeepLinkReplacementIndex, firstProviderConnectivityModel, formatJson, formatProxyCertificateInstallMessage, GatewayProviderConfig,
  GatewayProviderProbeResult, gatewayServiceMessage, GatewayStatus, getDefaultOnboardingStep, isClaudeDesignPluginConfig, isClaudeDesignRoutingDraftValid,
  isCursorProxyPluginConfig, isMacPlatform, isPlainRecord, isProfileDraftSubmittable, isProviderNameDuplicate, isProviderProbeCandidateReady,
  LayoutGroup, mergeProviderCapabilities, mergeProviderModelLists,
  navigation, NavigationId, normalizeApiKeys, normalizeConfig, normalizeLanguagePreference, normalizeOverviewWidgets,
  normalizeProfileItem, normalizeProviderBaseUrl, normalizeRouterFallbackConfig, normalizeThemePreference, normalizeTrayComponentVariants, normalizeTrayIconPreference,
  normalizeTrayProgressTargetTokens, normalizeTrayWindowModules, normalizeVirtualModelDraftPatch, numberValue, OnboardingStepId, onboardingStepOrder,
  OverviewWidgetConfig, parsePluginAppsSettingsText, parsePluginConfigSettingsText, parseProviderAccountDraft,
  persistLanguagePreference, PluginMarketplaceEntry, PluginRoutingConfigTarget, pluginSettingsConfigFromDraft, PluginSettingsDraft, presetCapabilitiesFromDraft,
  probeProviderCandidates, probeProviderDeepLinkPayload, profileAgentLabel, ProfileConfig, profileConfigFromDraft, providerAccountApiKeySafetyIssue,
  ProviderAccountSnapshot, providerApiKeySafetyIssue, providerAutoProbeDelayMs, ProviderDeepLinkRequest, providerIdentitySafetyIssue, providerProbeCandidates,
  providerProbeCandidatesApiKeySafetyIssue, providerProbeHasSupportedProtocol, providerProbeInputKey, ProxyCertificateStatus, ProxyNetworkSnapshot, proxyRestartMessage,
  ProxyStatus, readLanguagePreference, RequestLogListFilter, RequestLogPage, ResolvedLanguage,
  ResolvedTheme, resolvePluginInstallPlan, RouterRule, ServerActionBusy,
  shouldAutoProbeProviderBaseUrl, splitLines, translateProxyCertificateMessage, translateText, TrayComponentVariants, TrayWindowModuleId,
  uniqueRoutingRuleId, updateApiKeyEditableConfig, UsageStatsFilter, UsageStatsRange, UsageStatsSnapshot, useEffect,
  useMemo, useReducedMotion, useRef, useState, validateVirtualModelDraft, ViewId,
  VirtualModelDraft, virtualModelProfileFromDraft
} from "./shared";
import {
  AppDialogStack, LightToast, MainLayout, OnboardingLayout
} from "./components";

function App() {
  const [activeView, setActiveView] = useState<ViewId>("onboarding");
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStepId>(() => getDefaultOnboardingStep(fallbackConfig));
  const [appInfo, setAppInfo] = useState<AppInfo>(fallbackInfo);
  const [draftConfig, setDraftConfig] = useState<AppConfig>(fallbackConfig);
  const [configLoaded, setConfigLoaded] = useState(() => !window.ccr);
  const [onboardingStatusLoaded, setOnboardingStatusLoaded] = useState(() => !window.ccr);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>(fallbackGatewayStatus);
  const [proxyCertificateStatus, setProxyCertificateStatus] = useState<ProxyCertificateStatus>(fallbackProxyCertificateStatus);
  const [proxyNetworkSnapshot, setProxyNetworkSnapshot] = useState<ProxyNetworkSnapshot>(fallbackProxyNetworkSnapshot);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>(fallbackProxyStatus);
  const [actionBusy, setActionBusy] = useState<ServerActionBusy>("");
  const [gatewayActionBusy, setGatewayActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [profileActionError, setProfileActionError] = useState("");
  const [profileAddOpen, setProfileAddOpen] = useState(false);
  const [profileAgentTab, setProfileAgentTab] = useState<ProfileConfig["agent"]>("claude-code");
  const [profileDraft, setProfileDraft] = useState<AddProfileDraft>(() => createProfileDraft());
  const [profileEditDraft, setProfileEditDraft] = useState<AddProfileDraft>(() => createProfileDraft());
  const [profileEditIndex, setProfileEditIndex] = useState<number>();
  const [apiKeyAddOpen, setApiKeyAddOpen] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState<AddApiKeyDraft>(() => createApiKeyDraft());
  const [apiKeyEditDraft, setApiKeyEditDraft] = useState<AddApiKeyDraft>(() => createApiKeyDraft());
  const [apiKeyEditIndex, setApiKeyEditIndex] = useState<number>();
  const [apiKeyError, setApiKeyError] = useState("");
  const [providerAddOpen, setProviderAddOpen] = useState(false);
  const [providerDeleteIndex, setProviderDeleteIndex] = useState<number>();
  const [providerEditIndex, setProviderEditIndex] = useState<number>();
  const [providerDraft, setProviderDraft] = useState<AddProviderDraft>(() => createProviderDraft(fallbackConfig.Providers));
  const [providerProbe, setProviderProbe] = useState<GatewayProviderProbeResult>();
  const [providerProbeLoading, setProviderProbeLoading] = useState(false);
  const [providerDeepLinkRequest, setProviderDeepLinkRequest] = useState<ProviderDeepLinkRequest>();
  const [providerDeepLinkBusy, setProviderDeepLinkBusy] = useState(false);
  const [providerDeepLinkError, setProviderDeepLinkError] = useState("");
  const [proxyCertificateChecking, setProxyCertificateChecking] = useState(false);
  const [proxyEnablePending, setProxyEnablePending] = useState(false);
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
  const [compactLayout, setCompactLayout] = useState(() => window.matchMedia("(max-width: 720px)").matches);
  const [toast, setToast] = useState<AppToast>();
  const [languagePreference, setLanguagePreference] = useState<AppLanguagePreference>(() => readLanguagePreference());
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
  const [usageRange, setUsageRange] = useState<UsageStatsRange>("7d");
  const [usageStats, setUsageStats] = useState<UsageStatsSnapshot>(fallbackUsageStats);
  const [providerAccountSnapshots, setProviderAccountSnapshots] = useState<ProviderAccountSnapshot[]>([]);
  const resolvedLanguage = languagePreference === "system" ? systemLanguage : languagePreference;
  const copy = appCopy[resolvedLanguage];
  const t = useMemo(() => (value: string) => translateText(copy, value), [copy]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const updateCompactLayout = () => setCompactLayout(mediaQuery.matches);
    updateCompactLayout();
    mediaQuery.addEventListener("change", updateCompactLayout);
    return () => mediaQuery.removeEventListener("change", updateCompactLayout);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const theme = draftConfig.theme || "system";
    if (theme === "system") {
      root.removeAttribute("data-theme");
      return;
    }

    root.dataset.theme = theme;
  }, [draftConfig.theme]);

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
    void window.ccr.getConfig()
      .then(syncConfigState)
      .catch(() => {
        // Fall back to the bundled defaults; the rest of the UI can still render.
      })
      .finally(() => setConfigLoaded(true));
    void window.ccr.getOnboardingFinished()
      .then((finished) => setActiveView(finished ? "overview" : "onboarding"))
      .catch(() => setActiveView("onboarding"))
      .finally(() => setOnboardingStatusLoaded(true));
    void window.ccr.getPluginMarketplace().then(setPluginMarketplace).catch(() => setPluginMarketplace([]));
    void window.ccr.getProxyCertificateStatus().then(setProxyCertificateStatus);
    const refreshRuntimeStatus = () => {
      void window.ccr?.getGatewayStatus().then(setGatewayStatus);
      void window.ccr?.getProxyStatus().then(setProxyStatus);
    };
    refreshRuntimeStatus();
    const timer = window.setInterval(refreshRuntimeStatus, 2000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!window.ccr) {
      return;
    }

    const showProviderDeepLink = (request: ProviderDeepLinkRequest) => {
      setProviderAddOpen(false);
      setProviderEditIndex(undefined);
      setProviderProbe(undefined);
      setProviderProbeError("");
      setProviderProbeLoading(false);
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
    if (!window.ccr) {
      setUsageStats(createEmptyUsageStats(usageRange));
      return;
    }

    let cancelled = false;
    const refreshUsageStats = () => {
      const filter: UsageStatsFilter | undefined = usageRange === "today" ? { includeProxy: true } : undefined;
      void window.ccr?.getUsageStats(usageRange, filter).then((snapshot) => {
        if (!cancelled) {
          setUsageStats(snapshot);
        }
      });
    };
    refreshUsageStats();
    const timer = window.setInterval(refreshUsageStats, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [usageRange]);

  useEffect(() => {
    if (!window.ccr) {
      setProviderAccountSnapshots([]);
      return;
    }

    let cancelled = false;
    const refreshProviderAccounts = () => {
      void window.ccr?.getProviderAccountSnapshots()
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
    refreshProviderAccounts();
    const timer = window.setInterval(refreshProviderAccounts, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [draftConfig.Providers]);

  const agentAnalysisFilterKey = JSON.stringify({ agent: agentAnalysisAgent, range: agentAnalysisRange });

  useEffect(() => {
    if (activeView !== "observability") {
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
      void window.ccr?.getAgentAnalysis({ agent: agentAnalysisAgent, range: agentAnalysisRange })
        .then((snapshot) => {
          if (!cancelled) {
            setAgentAnalysis(snapshot);
            setAgentAnalysisError("");
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setAgentAnalysisError(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setAgentAnalysisLoading(false);
          }
        });
    };

    refreshAgentAnalysis(true);
    const timer = window.setInterval(() => refreshAgentAnalysis(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeView, agentAnalysisFilterKey]);

  const requestLogFilterKey = JSON.stringify(requestLogFilter);

  useEffect(() => {
    if (activeView !== "logs") {
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
            setRequestLogError(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setRequestLogLoading(false);
          }
        });
    };

    refreshRequestLogs(true);
    const timer = window.setInterval(() => refreshRequestLogs(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeView, requestLogFilterKey]);

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
    refreshNetworkCaptures();
    const timer = window.setInterval(refreshNetworkCaptures, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeView, draftConfig.proxy.captureNetwork]);

  const dirty = useMemo(() => formatJson(savedConfig) !== formatJson(draftConfig), [draftConfig, savedConfig]);
  const apiKeys = useMemo(() => createApiKeyList(draftConfig), [draftConfig.APIKEY, draftConfig.APIKEYS]);
  const apiKeyEditItem = apiKeyEditIndex === undefined ? undefined : apiKeys.find((apiKey) => apiKey.index === apiKeyEditIndex);
  const providerDeleteItem = providerDeleteIndex === undefined ? undefined : draftConfig.Providers[providerDeleteIndex];
  const routingDeleteRule = routingDeleteIndex === undefined ? undefined : draftConfig.Router.rules[routingDeleteIndex];
  const extensionDeleteItem = useMemo(() => {
    if (!extensionDeleteTarget) {
      return undefined;
    }
    return buildExtensionList(draftConfig).find((extension) =>
      extension.source === extensionDeleteTarget.source && extension.index === extensionDeleteTarget.index
    );
  }, [draftConfig.plugins, draftConfig.providerPlugins, draftConfig.virtualModelProfiles, extensionDeleteTarget]);
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
  const networkCaptureEnabled = draftConfig.proxy.enabled && draftConfig.proxy.captureNetwork;
  const visibleNavigation = useMemo(
    () => navigation.filter((item) => item.id !== "networking" || networkCaptureEnabled),
    [networkCaptureEnabled]
  );
  const autoSaveRequestId = useRef(0);
  const providerProbeRequestId = useRef(0);
  const toastTimer = useRef<number>();

  const shouldReduceMotion = useReducedMotion();
  const isMac = isMacPlatform(appInfo.platform);
  const needsTrafficLightSafeArea = isMac && !sidebarOpen;
  const providerTypedModels = splitLines(providerDraft.modelsText);
  const providerDialogModels = mergeProviderModelLists(providerDraft.selectedModels, providerTypedModels);
  const providerFormActive = providerAddOpen || (activeView === "onboarding" && onboardingStep === "provider");
  const canSubmitProvider =
    Boolean(providerDraft.name.trim() && providerDraft.baseUrl.trim()) &&
    providerDialogModels.length > 0;
  const canSubmitProfile = isProfileDraftSubmittable(profileDraft);
  const canSubmitProfileEdit = profileEditIndex !== undefined && isProfileDraftSubmittable(profileEditDraft);
  const canSubmitApiKey = Boolean(apiKeyDraft.name.trim()) && (apiKeyDraft.expirationPreset !== "custom" || Boolean(apiKeyDraft.expiresAt.trim()));
  const canSubmitApiKeyEdit = apiKeyEditDraft.expirationPreset !== "custom" || Boolean(apiKeyEditDraft.expiresAt.trim());
  const canSubmitRoutingRule =
    Boolean(routingRuleDraft.name.trim()) &&
    (routingRuleDraft.type === "subagent" || Boolean(routingRuleDraft.target.trim())) &&
    (routingRuleDraft.type !== "model-prefix" || Boolean(routingRuleDraft.pattern.trim()));
  const canSubmitClaudeDesignRouting = isClaudeDesignRoutingDraftValid(claudeDesignRoutingDraft);
  const canSubmitCursorProxyRouting = isClaudeDesignRoutingDraftValid(cursorProxyRoutingDraft);
  const virtualModelValidationError = useMemo(() => validateVirtualModelDraft(virtualModelDraft), [virtualModelDraft]);
  const canSubmitVirtualModel = !virtualModelValidationError;
  const canInstallExtension = Boolean(extensionInstallDraft.key.trim() && extensionInstallDraft.modulePath.trim());

  useEffect(() => {
    if (!networkCaptureEnabled && activeView === "networking") {
      setActiveView("server");
    }
  }, [activeView, networkCaptureEnabled]);

  useEffect(() => {
    if (activeView !== "onboarding" || !configLoaded || !onboardingStatusLoaded) {
      return;
    }
    const defaultStep = getDefaultOnboardingStep(draftConfig);
    const defaultIndex = onboardingStepOrder.indexOf(defaultStep);
    setOnboardingStep((current) => {
      const currentIndex = onboardingStepOrder.indexOf(current);
      return defaultIndex > currentIndex ? defaultStep : current;
    });
  }, [activeView, configLoaded, onboardingStatusLoaded, draftConfig]);

  useEffect(() => {
    if (activeView !== "onboarding" || !configLoaded || !onboardingStatusLoaded || providerAddOpen) {
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
    setProviderDraft(createProviderDraftFromProvider(provider));
    setProviderProbe(undefined);
    setProviderProbeError("");
    setProviderProbeLoading(false);
  }, [activeView, configLoaded, onboardingStatusLoaded, draftConfig.Providers, draftConfig.preferredProvider, providerAddOpen]);

  useEffect(() => () => {
    if (toastTimer.current !== undefined) {
      window.clearTimeout(toastTimer.current);
    }
  }, []);

  useEffect(() => {
    providerProbeRequestId.current += 1;
    const requestId = providerProbeRequestId.current;
    const candidates = providerProbeCandidates(providerDraft).filter(isProviderProbeCandidateReady);

    if (!providerFormActive || !window.ccr || candidates.length === 0) {
      setProviderProbeLoading(false);
      return;
    }

    const apiKey = providerDraft.apiKey.trim();
    const models = splitLines(providerDraft.modelsText);
    const inputKey = providerProbeInputKey(candidates, apiKey, models);
    const safetyIssue = providerProbeCandidatesApiKeySafetyIssue(candidates, apiKey, providerDraft.name, providerDraft.presetId);
    if (safetyIssue) {
      setProviderProbeLoading(false);
      setProviderProbeError(safetyIssue.message);
      return;
    }

    setProviderProbeLoading(true);
    const timer = window.setTimeout(() => {
      void probeProviderCandidates(candidates, apiKey, models)
        .then((result) => {
          if (providerProbeRequestId.current !== requestId) {
            return;
          }
          if (!result) {
            return;
          }
          setProviderProbe(result.probe);
          setProviderDraft((current) => {
            const currentCandidates = providerProbeCandidates(current).filter(isProviderProbeCandidateReady);
            const currentKey = providerProbeInputKey(currentCandidates, current.apiKey.trim(), splitLines(current.modelsText));
            if (currentKey !== inputKey) {
              return current;
            }
            return applyProviderProbeResult(current, result.probe);
          });
        })
        .catch(() => {
          // Background probing is best-effort. Manual model entry remains the fallback.
        })
        .finally(() => {
          if (providerProbeRequestId.current === requestId) {
            setProviderProbeLoading(false);
          }
        });
    }, providerAutoProbeDelayMs);

    return () => {
      window.clearTimeout(timer);
      setProviderProbeLoading(false);
    };
  }, [providerFormActive, providerDraft.apiKey, providerDraft.baseUrl, providerDraft.modelsText, providerDraft.name, providerDraft.presetId]);

  useEffect(() => {
    if (!window.ccr || !dirty) {
      return;
    }

    const requestId = autoSaveRequestId.current + 1;
    autoSaveRequestId.current = requestId;
    const configToSave = draftConfig;
    const timer = window.setTimeout(() => {
      void window.ccr?.saveConfig(configToSave)
        .then((saved) => {
          if (autoSaveRequestId.current === requestId) {
            syncConfigState(saved);
            setActionError("");
          }
        })
        .catch((error) => {
          if (autoSaveRequestId.current === requestId) {
            setActionError(error instanceof Error ? error.message : String(error));
          }
        });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [dirty, draftConfig]);

  function syncConfigState(config: AppConfig) {
    const normalized = normalizeConfig(config);
    setSavedConfig(normalized);
    setDraftConfig(normalized);
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

  async function persistConfig(config: AppConfig, setError: (message: string) => void): Promise<boolean> {
    autoSaveRequestId.current += 1;
    if (!window.ccr) {
      syncConfigState(config);
      return true;
    }

    try {
      const saved = await window.ccr.saveConfig(config);
      syncConfigState(saved);
      setError("");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async function persistApiKeys(apiKeys: ApiKeyConfig[], setError: (message: string) => void): Promise<boolean> {
    if (!window.ccr) {
      setError("API key persistence is only available in the Electron app.");
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
      setError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  function openAddApiKeyDialog() {
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
      setApiKeyError("Name is required.");
      return;
    }
    if (!canSubmitApiKey) {
      setApiKeyError("Expiration is required.");
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
    }
  }

  async function submitApiKeyEditDraft() {
    if (apiKeyEditIndex === undefined) {
      return;
    }
    if (!canSubmitApiKeyEdit) {
      setApiKeyError("Expiration is required.");
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
    setProviderEditIndex(undefined);
    setProviderDraft(createProviderDraft(draftConfig.Providers));
    setProviderProbe(undefined);
    setProviderProbeError("");
    setProviderProbeLoading(false);
    setProviderAddOpen(true);
  }

  function openEditProviderDialog(index: number) {
    const provider = draftConfig.Providers[index];
    if (!provider) {
      return;
    }
    setProviderEditIndex(index);
    setProviderDraft(createProviderDraftFromProvider(provider));
    setProviderProbe(undefined);
    setProviderProbeError("");
    setProviderProbeLoading(false);
    setProviderAddOpen(true);
  }

  function updateProviderDraft(patch: Partial<AddProviderDraft>, resetProbe = false) {
    setProviderDraft((current) => {
      const next = { ...current, ...patch };
      if (!resetProbe) {
        return next;
      }
      if (patch.selectedModels !== undefined) {
        return next;
      }

      return {
        ...next,
        modelsText: mergeProviderModelLists(current.selectedModels, splitLines(next.modelsText)).join("\n"),
        selectedModels: []
      };
    });
    setProviderProbeError("");
    if (resetProbe) {
      setProviderProbe(undefined);
      setProviderProbeLoading(false);
    }
  }

  async function checkProviderDraft(): Promise<void> {
    providerProbeRequestId.current += 1;
    const requestId = providerProbeRequestId.current;
    const baseUrl = providerDraft.baseUrl.trim();
    const protocol = providerDraft.protocol;
    const apiKey = providerDraft.apiKey.trim();
    const model = firstProviderConnectivityModel(providerDraft);
    const inputKey = JSON.stringify([baseUrl, protocol, apiKey, model]);

    setProviderProbeError("");
    if (!window.ccr) {
      setProviderProbeError("Request failed.");
      return;
    }
    if (!shouldAutoProbeProviderBaseUrl(baseUrl)) {
      setProviderProbeError("No endpoint candidates available.");
      return;
    }
    if (!model) {
      setProviderProbeError("Select or enter at least one model.");
      return;
    }
    const safetyIssue = providerApiKeySafetyIssue({
      apiKey,
      baseUrl,
      name: providerDraft.name,
      presetId: providerDraft.presetId
    });
    if (safetyIssue) {
      setProviderProbeError(safetyIssue.message);
      return;
    }

    setProviderProbeLoading(true);
    try {
      const probe = await window.ccr.probeProvider({
        apiKey,
        baseUrl,
        models: [model],
        protocols: [protocol],
        skipModelDiscovery: true
      });
      if (providerProbeRequestId.current !== requestId) {
        return;
      }

      setProviderProbe(probe);
      setProviderDraft((current) => {
        const currentKey = JSON.stringify([
          current.baseUrl.trim(),
          current.protocol,
          current.apiKey.trim(),
          firstProviderConnectivityModel(current)
        ]);
        if (currentKey !== inputKey) {
          return current;
        }
        return applyProviderProbeResult(current, probe);
      });

      if (!providerProbeHasSupportedProtocol(probe, protocol)) {
        const message = probe.protocols.find((item) => item.protocol === protocol)?.message || "Request failed.";
        setProviderProbeError(message);
      }
    } catch (error) {
      if (providerProbeRequestId.current === requestId) {
        setProviderProbe(undefined);
        setProviderProbeError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (providerProbeRequestId.current === requestId) {
        setProviderProbeLoading(false);
      }
    }
  }

  async function submitProviderDraft(): Promise<boolean> {
    const probe = providerProbe;

    const usesCatalog = Boolean(probe?.models.length);
    const typedModels = splitLines(providerDraft.modelsText);
    const models = mergeProviderModelLists(providerDraft.selectedModels, typedModels);
    if (models.length === 0) {
      setProviderProbeError(usesCatalog ? "Select or enter at least one model." : "Enter at least one model.");
      return false;
    }

    const providerName = providerDraft.name.trim();
    if (isProviderNameDuplicate(draftConfig.Providers, providerName, providerEditIndex)) {
      setProviderProbeError("Provider name already exists.");
      return false;
    }

    const accountConfig = parseProviderAccountDraft(providerDraft);
    if (typeof accountConfig === "string") {
      setProviderProbeError(accountConfig);
      return false;
    }

    const protocol = probe?.detectedProtocol ?? providerDraft.protocol;
    const baseUrl = probe?.normalizedBaseUrl || providerDraft.baseUrl;
    const keySafetyIssue = providerApiKeySafetyIssue({
      apiKey: providerDraft.apiKey,
      baseUrl,
      name: providerName,
      presetId: providerDraft.presetId
    });
    if (keySafetyIssue) {
      setProviderProbeError(keySafetyIssue.message);
      return false;
    }
    const identityIssue = providerIdentitySafetyIssue({
      baseUrl,
      name: providerName,
      presetId: providerDraft.presetId
    });
    if (identityIssue) {
      setProviderProbeError(identityIssue.message);
      return false;
    }

    const accountKeySafetyIssue = providerAccountApiKeySafetyIssue(accountConfig, {
      apiKey: providerDraft.apiKey,
      baseUrl,
      providerName,
      providerPresetId: providerDraft.presetId
    });
    if (accountKeySafetyIssue) {
      setProviderProbeError(accountKeySafetyIssue.message);
      return false;
    }

    const capabilities = mergeProviderCapabilities(
      presetCapabilitiesFromDraft(providerDraft),
      probe?.capabilities ?? [],
      protocol && baseUrl ? [{ baseUrl, source: probe?.detectedProtocol ? "detected" : "preset", type: protocol }] : []
    );
    const provider: GatewayProviderConfig = {
      api_base_url: normalizeProviderBaseUrl(baseUrl, protocol),
      api_key: providerDraft.apiKey.trim(),
      capabilities: capabilities.length > 0 ? capabilities : undefined,
      account: accountConfig,
      icon: providerDraft.icon.trim() || undefined,
      models,
      name: providerName,
      type: protocol
    };

    const next = buildConfigUpdate((config) => {
      if (providerEditIndex === undefined) {
        config.Providers.push(provider);
      } else {
        config.Providers[providerEditIndex] = provider;
      }
      if (!config.preferredProvider) {
        config.preferredProvider = provider.name;
      }
      return config;
    });
    setConfigDraft(next);
    if (await persistConfig(next, setProviderProbeError)) {
      setProviderEditIndex(undefined);
      setProviderAddOpen(false);
      if (activeView === "onboarding") {
        setOnboardingStep(getDefaultOnboardingStep(next));
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

    setProviderDeepLinkBusy(true);
    setProviderDeepLinkError("");
    try {
      if (!request.provider && request.manifest) {
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

      const payload = request.provider;
      if (!payload) {
        setProviderDeepLinkBusy(false);
        return;
      }
      if (payload.apiKey?.trim()) {
        throw new Error("Provider links cannot include API keys. Add the key manually after verifying the endpoint.");
      }
      const identityIssue = providerIdentitySafetyIssue({
        baseUrl: payload.baseUrl,
        name: payload.name
      });
      if (identityIssue) {
        throw new Error(identityIssue.message);
      }
      const probe = await probeProviderDeepLinkPayload(payload);
      let importedProviderName = payload.name?.trim() || "";
      const next = buildConfigUpdate((config) => {
        const replaceIndex = payload.replaceExisting
          ? findProviderDeepLinkReplacementIndex(config.Providers, payload, probe?.normalizedBaseUrl || payload.baseUrl)
          : -1;
        const provider = createProviderConfigFromDeepLink(payload, config.Providers, probe, replaceIndex);
        importedProviderName = provider.name;
        if (replaceIndex >= 0) {
          config.Providers[replaceIndex] = provider;
        } else {
          config.Providers.push(provider);
        }
        if (payload.setDefault || !config.preferredProvider) {
          config.preferredProvider = provider.name;
        }
        return config;
      });
      setConfigDraft(next);
      const saved = await persistConfig(next, setProviderDeepLinkError);
      setProviderDeepLinkBusy(false);
      if (saved) {
        setProviderDeepLinkRequest(undefined);
        showToast(`${copy.text["Imported provider"] ?? "Imported provider"} ${importedProviderName}`.trim());
        if (activeView === "onboarding") {
          setOnboardingStep(getDefaultOnboardingStep(next));
        }
      }
    } catch (error) {
      setProviderDeepLinkError(error instanceof Error ? error.message : String(error));
      setProviderDeepLinkBusy(false);
    }
  }

  async function removeProvider(index: number): Promise<boolean> {
    const next = buildConfigUpdate((config) => {
      config.Providers.splice(index, 1);
      return config;
    });
    setConfigDraft(next);
    return persistConfig(next, setActionError);
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

    const threshold = numberValue(routingRuleDraft.threshold);
    const rule: RouterRule = {
      enabled: routingRuleDraft.enabled,
      fallback: normalizeRouterFallbackConfig(routingRuleDraft.fallback),
      id: uniqueRoutingRuleId(draftConfig.Router.rules),
      name: routingRuleDraft.name.trim(),
      ...(routingRuleDraft.pattern.trim() ? { pattern: routingRuleDraft.pattern.trim() } : {}),
      ...(routingRuleDraft.target.trim() && routingRuleDraft.type !== "subagent" ? { target: routingRuleDraft.target.trim() } : {}),
      ...(threshold > 0 ? { threshold } : {}),
      type: routingRuleDraft.type
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
    setVirtualModelDraft(createVirtualModelDraftFromProfile(profile));
    setVirtualModelError("");
    setVirtualModelDialogOpen(true);
  }

  function updateVirtualModelDraft(patch: Partial<VirtualModelDraft>) {
    setVirtualModelDraft((current) => normalizeVirtualModelDraftPatch(current, patch));
    setVirtualModelError("");
  }

  function submitVirtualModelDraft() {
    if (virtualModelValidationError) {
      setVirtualModelError(virtualModelValidationError);
      return;
    }

    updateConfig((config) => {
      const values = [...(config.virtualModelProfiles ?? [])];
      const profile = virtualModelProfileFromDraft(virtualModelDraft, values, virtualModelEditIndex);
      if (virtualModelEditIndex === undefined) {
        values.push(profile);
      } else {
        values[virtualModelEditIndex] = profile;
      }
      config.virtualModelProfiles = values;
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
      setActionError("Local plugin selection is available in the Electron app.");
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
      setActionError(error instanceof Error ? error.message : String(error));
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

  function removeExtension(source: ExtensionSource, index: number) {
    updateConfig((config) => {
      if (source === "plugins") {
        config.plugins = (config.plugins ?? []).filter((_, itemIndex) => itemIndex !== index);
      } else if (source === "providerPlugins") {
        config.providerPlugins = (config.providerPlugins ?? []).filter((_, itemIndex) => itemIndex !== index);
      } else {
        config.virtualModelProfiles = (config.virtualModelProfiles ?? []).filter((_, itemIndex) => itemIndex !== index);
      }
      return config;
    });
  }

  function confirmExtensionDelete() {
    if (!extensionDeleteTarget) {
      return;
    }
    removeExtension(extensionDeleteTarget.source, extensionDeleteTarget.index);
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

  function setExtensionEnabled(source: ExtensionSource, index: number, enabled: boolean) {
    updateConfig((config) => {
      if (source === "plugins") {
        const values = [...(config.plugins ?? [])];
        const item = values[index];
        if (!item) {
          return config;
        }
        values[index] = { ...item, enabled };
        config.plugins = values;
        return config;
      }

      if (source === "providerPlugins") {
        const values = [...(config.providerPlugins ?? [])];
        const item = values[index];
        if (!isPlainRecord(item)) {
          return config;
        }
        values[index] = { ...item, enabled };
        config.providerPlugins = values;
        return config;
      }

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

  function changeThemePreference(value: string) {
    const theme = normalizeThemePreference(value);
    updateConfig((config) => ({
      ...config,
      theme
    }));
  }

  function changeTrayIconPreference(value: string) {
    const trayIcon = normalizeTrayIconPreference(value);
    updateConfig((config) => ({
      ...config,
      trayIcon
    }));
  }

  function changeTrayProgressTargetTokens(value: string) {
    const trayProgressTargetTokens = normalizeTrayProgressTargetTokens(value);
    updateConfig((config) => ({
      ...config,
      trayProgressTargetTokens
    }));
  }

  function changeTrayComponentVariant(key: keyof TrayComponentVariants, value: string) {
    updateConfig((config) => ({
      ...config,
      trayComponentVariants: normalizeTrayComponentVariants({
        ...normalizeTrayComponentVariants(config.trayComponentVariants),
        [key]: value
      })
    }));
  }

  function setTrayWindowModuleEnabled(moduleId: TrayWindowModuleId, enabled: boolean) {
    updateConfig((config) => {
      const modules = normalizeTrayWindowModules(config.trayWindowModules);
      const nextModules = enabled
        ? [...modules, moduleId]
        : modules.filter((item) => item !== moduleId);
      return {
        ...config,
        trayWindowModules: normalizeTrayWindowModules(nextModules)
      };
    });
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

  async function restartProxy() {
    if (!window.ccr) {
      setActionError("Proxy restart is available in the Electron app.");
      return;
    }

    setActionBusy("proxy");
    setActionError("");
    setActionMessage("");
    try {
      const status = await window.ccr.restartProxy();
      setProxyStatus(status);
      setActionMessage(proxyRestartMessage(status));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy("");
    }
  }

  async function openBuiltInBrowser() {
    if (!window.ccr?.openBuiltInBrowser) {
      setActionError("APPs are available in the Electron app.");
      return;
    }

    setActionBusy("browser");
    setActionError("");
    setActionMessage("");
    try {
      if (dirty && !(await persistConfig(draftConfig, setActionError))) {
        return;
      }
      await window.ccr.openBuiltInBrowser();
      const status = await window.ccr.getProxyStatus();
      setProxyStatus(status);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy("");
    }
  }

  async function completeOnboarding() {
    if (window.ccr) {
      try {
        await window.ccr.setOnboardingFinished();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    setActiveView("overview");
  }

  function selectNavigationItem(id: NavigationId) {
    if (id === "browser") {
      void openBuiltInBrowser();
      return;
    }
    setActiveView(id);
  }

  async function refreshProxyCertificateStatus(): Promise<ProxyCertificateStatus | undefined> {
    if (!window.ccr) {
      setProxyCertificateStatus(fallbackProxyCertificateStatus);
      return undefined;
    }
    const status = await window.ccr.getProxyCertificateStatus();
    setProxyCertificateStatus(status);
    return status;
  }

  async function checkProxyCertificateStatus() {
    setProxyCertificateChecking(true);
    setActionError("");
    setActionMessage("");
    try {
      const status = await refreshProxyCertificateStatus();
      setActionMessage(status?.trusted ? t("Proxy CA certificate is trusted.") : translateProxyCertificateMessage(status?.message, t) || t("Proxy CA certificate is not trusted."));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setProxyCertificateChecking(false);
    }
  }

  async function setProxyEnabled(checked: boolean) {
    setActionError("");
    setActionMessage("");
    if (!checked) {
      setProxyEnablePending(false);
      updateConfig((next) => ({ ...next, proxy: { ...next.proxy, enabled: false } }));
      return;
    }
    if (!window.ccr) {
      setActionError(t("Proxy certificate detection is available in the Electron app."));
      return;
    }

    setProxyCertificateChecking(true);
    try {
      const status = await refreshProxyCertificateStatus();
      if (status?.trusted) {
        setProxyEnablePending(false);
        updateConfig((next) => ({ ...next, proxy: { ...next.proxy, enabled: true } }));
        return;
      }
      setProxyEnablePending(true);
      setActionMessage(translateProxyCertificateMessage(status?.message, t) || t("Install and trust the proxy CA certificate before enabling proxy mode."));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setProxyCertificateChecking(false);
    }
  }

  async function toggleGatewayService() {
    if (!window.ccr) {
      setActionError("Service control is available in the Electron app.");
      return;
    }

    const shouldStop = gatewayStatus.state === "running" || gatewayStatus.state === "starting";
    setGatewayActionBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      const status = shouldStop ? await window.ccr.stopGateway() : await window.ccr.startGateway();
      setGatewayStatus(status);
      const nextProxyStatus = await window.ccr.getProxyStatus();
      setProxyStatus(nextProxyStatus);
      setActionMessage(gatewayServiceMessage(status, shouldStop));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setGatewayActionBusy(false);
    }
  }

  async function installProxyCertificate() {
    if (!window.ccr) {
      setActionError(t("Certificate install is available in the Electron app."));
      return;
    }

    setActionBusy("cert");
    setActionError("");
    setActionMessage("");
    try {
      const result = await window.ccr.installProxyCertificate();
      setProxyCertificateStatus(result.status);
      const status = result.status.trusted ? result.status : await refreshProxyCertificateStatus();
      if (proxyEnablePending && status?.trusted) {
        updateConfig((next) => ({ ...next, proxy: { ...next.proxy, enabled: true } }));
        setProxyEnablePending(false);
        setActionMessage(t("Certificate installed and trusted. Proxy mode enabled."));
        return;
      }
      setActionMessage(formatProxyCertificateInstallMessage(result, status, t));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy("");
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
    if (!window.ccr) {
      setRequestLogPage(createEmptyRequestLogPage(requestLogFilter));
      return;
    }

    setRequestLogLoading(true);
    try {
      setRequestLogPage(await window.ccr.getRequestLogs(requestLogFilter));
      setRequestLogError("");
    } catch (error) {
      setRequestLogError(error instanceof Error ? error.message : String(error));
    } finally {
      setRequestLogLoading(false);
    }
  }

  async function refreshAgentAnalysis() {
    if (!window.ccr) {
      setAgentAnalysis(createEmptyAgentAnalysis(agentAnalysisRange));
      return;
    }

    setAgentAnalysisLoading(true);
    try {
      setAgentAnalysis(await window.ccr.getAgentAnalysis({ agent: agentAnalysisAgent, range: agentAnalysisRange }));
      setAgentAnalysisError("");
    } catch (error) {
      setAgentAnalysisError(error instanceof Error ? error.message : String(error));
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
      setActiveView("server");
    }
    if (!window.ccr) {
      return;
    }
    try {
      setProxyNetworkSnapshot(await window.ccr.setProxyNetworkCaptureEnabled(enabled));
      setActionError("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  function setProxySystemProxyEnabled(enabled: boolean) {
    setActionError("");
    setActionMessage("");
    updateConfig((next) => ({ ...next, proxy: { ...next.proxy, systemProxy: enabled } }));
  }

  function openAddProfileDialog(agent: ProfileConfig["agent"] = profileAgentTab) {
    setProfileAgentTab(agent);
    setProfileDraft(createProfileDraft(agent));
    setProfileActionError("");
    setProfileAddOpen(true);
  }

  function openEditProfileDialog(index: number) {
    const profile = draftConfig.profile.profiles[index];
    if (!profile) {
      return;
    }
    setProfileEditIndex(index);
    setProfileEditDraft(createProfileDraftFromProfile(profile));
    setProfileActionError("");
  }

  function updateProfileDraft(patch: Partial<AddProfileDraft>) {
    setProfileDraft((current) => {
      const next = { ...current, ...patch };
      if (patch.agent && patch.agent !== current.agent) {
        const name = current.name === profileAgentLabel(current.agent) ? undefined : next.name;
        return {
          ...createProfileDraft(patch.agent, name),
          envRows: current.envRows
        };
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
        return {
          ...createProfileDraft(patch.agent, name),
          envRows: current.envRows
        };
      }
      return next;
    });
    setProfileActionError("");
  }

  async function submitProfileDraft(): Promise<boolean> {
    if (!canSubmitProfile) {
      setProfileActionError("Profile name, required target settings, and environment variable keys are required.");
      return false;
    }
    const profile = profileConfigFromDraft(profileDraft, draftConfig.profile.profiles);
    setProfileAgentTab(profile.agent);
    const next = buildConfigUpdate((config) => ({
      ...config,
      profile: {
        ...config.profile,
        enabled: true,
        profiles: [...config.profile.profiles, profile]
      }
    }));
    setConfigDraft(next);
    if (!(await persistConfig(next, setProfileActionError))) {
      return false;
    }
    setProfileAddOpen(false);
    setProfileDraft(createProfileDraft());
    setProfileActionError("");
    if (activeView === "onboarding") {
      setOnboardingStep("enter");
    }
    return true;
  }

  async function submitProfileEditDraft(): Promise<boolean> {
    if (profileEditIndex === undefined) {
      return false;
    }
    if (!canSubmitProfileEdit) {
      setProfileActionError("Profile name, required target settings, and environment variable keys are required.");
      return false;
    }
    const currentProfile = draftConfig.profile.profiles[profileEditIndex];
    if (!currentProfile) {
      setProfileActionError("Profile no longer exists.");
      return false;
    }
    const nextProfile = profileConfigFromDraft(profileEditDraft, draftConfig.profile.profiles, currentProfile);
    setProfileAgentTab(nextProfile.agent);
    const next = buildConfigUpdate((config) => {
      const profiles = [...config.profile.profiles];
      profiles[profileEditIndex] = nextProfile;
      return {
        ...config,
        profile: {
          ...config.profile,
          profiles
        }
      };
    });
    setConfigDraft(next);
    if (!(await persistConfig(next, setProfileActionError))) {
      return false;
    }
    setProfileEditIndex(undefined);
    setProfileEditDraft(createProfileDraft());
    setProfileActionError("");
    return true;
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
          profiles
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

  return (
    <AppI18nContext.Provider value={copy}>
      <LayoutGroup id="home-shell">
        <div className="relative flex h-full min-h-0 w-full min-w-0 overflow-hidden bg-background text-foreground max-[720px]:flex-col">
          {activeView === "onboarding" ? (
            <OnboardingLayout
              loaded={configLoaded && onboardingStatusLoaded}
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
                providerProbe,
                providerProbeLoading
              }}
            />
          ) : (
            <MainLayout
              activeView={activeView}
              compactLayout={compactLayout}
              copy={copy}
              gatewayActionBusy={gatewayActionBusy}
              gatewayEndpoint={gatewayEndpoint}
              gatewayStatus={gatewayStatus}
              isMac={isMac}
              needsTrafficLightSafeArea={needsTrafficLightSafeArea}
              networkCaptureEnabled={networkCaptureEnabled}
              onOpenServerView={() => setActiveView("server")}
              onOpenSettings={() => setSettingsOpen(true)}
              onSelectNavigationItem={selectNavigationItem}
              onToggleSidebar={() => setSidebarOpen((current) => !current)}
              proxyStatus={proxyStatus}
              shouldReduceMotion={shouldReduceMotion}
              sidebarOpen={sidebarOpen}
              toggleGatewayService={toggleGatewayService}
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
                  removeExtension: (source, index) => setExtensionDeleteTarget({ index, source }),
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
                  config: draftConfig
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
                  setAgentFilter: setAgentAnalysisAgent,
                  setRange: setAgentAnalysisRange,
                  snapshot: agentAnalysis
                },
                overview: {
                  onWidgetsChange: changeOverviewWidgets,
                  overviewWidgets: normalizeOverviewWidgets(draftConfig.overviewWidgets),
                  providerAccounts: providerAccountSnapshots,
                  setUsageRange,
                  usageRange,
                  usageStats
                },
                profile: {
                  addProfile: openAddProfileDialog,
                  applyError: profileActionError,
                  config: draftConfig,
                  editProfile: openEditProfileDialog,
                  removeProfile,
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
                  updateFallback: (fallback) => updateConfig((config) => {
                    config.Router.fallback = normalizeRouterFallbackConfig(fallback);
                    return config;
                  }),
                  updateRule: updateRoutingRule
                },
                server: {
                  actionBusy,
                  actionError,
                  actionMessage,
                  config: draftConfig,
                  installProxyCertificate,
                  onProxyEnabledChange: (checked) => void setProxyEnabled(checked),
                  onProxyNetworkCaptureChange: (enabled) => void setProxyNetworkCaptureEnabled(enabled),
                  onProxySystemProxyChange: setProxySystemProxyEnabled,
                  proxyCertificateChecking,
                  proxyCertificateStatus,
                  proxyStatus,
                  refreshProxyCertificateStatus: () => void checkProxyCertificateStatus(),
                  restartProxy,
                  updateConfig
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
              canSubmit: canSubmitProfile,
              draft: profileDraft,
              error: profileActionError,
              mode: "add",
              onChange: updateProfileDraft,
              onClose: () => setProfileAddOpen(false),
              providers: draftConfig.Providers,
              onSubmit: submitProfileDraft
            } : undefined}
            profileEdit={profileEditIndex !== undefined ? {
              canSubmit: canSubmitProfileEdit,
              draft: profileEditDraft,
              error: profileActionError,
              mode: "edit",
              onChange: updateProfileEditDraft,
              onClose: () => {
                setProfileEditIndex(undefined);
                setProfileActionError("");
              },
              providers: draftConfig.Providers,
              onSubmit: submitProfileEditDraft
            } : undefined}
            providerDeepLink={providerDeepLinkRequest ? {
              busy: providerDeepLinkBusy,
              error: providerDeepLinkError,
              onClose: () => {
                if (!providerDeepLinkBusy) {
                  setProviderDeepLinkRequest(undefined);
                }
              },
              onSubmit: confirmProviderDeepLinkImport,
              request: providerDeepLinkRequest
            } : undefined}
            providerDelete={providerDeleteItem ? {
              onClose: () => setProviderDeleteIndex(undefined),
              onConfirm: confirmProviderDelete,
              provider: providerDeleteItem
            } : undefined}
            providerUpsert={providerAddOpen ? {
              canSubmit: canSubmitProvider,
              draft: providerDraft,
              error: providerProbeError,
              onChange: updateProviderDraft,
              mode: providerEditIndex === undefined ? "add" : "edit",
              onClose: () => {
                setProviderAddOpen(false);
                setProviderEditIndex(undefined);
              },
              onCheck: checkProviderDraft,
              onSubmit: submitProviderDraft,
              probe: providerProbe,
              probeLoading: providerProbeLoading,
              providers: draftConfig.Providers
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
              copy,
              isMac,
              languagePreference,
              onChangeLanguage: changeLanguagePreference,
              onChangeTheme: changeThemePreference,
              onChangeTrayIcon: changeTrayIconPreference,
              onChangeTrayComponentVariant: changeTrayComponentVariant,
              onChangeTrayProgressTarget: changeTrayProgressTargetTokens,
              onSetTrayModuleEnabled: setTrayWindowModuleEnabled,
              onClose: () => setSettingsOpen(false),
              systemLanguage,
              systemTheme,
              themePreference: draftConfig.theme || "system",
              trayIconPreference: draftConfig.trayIcon || "random",
              trayComponentVariants: normalizeTrayComponentVariants(draftConfig.trayComponentVariants),
              trayProgressTargetTokens: draftConfig.trayProgressTargetTokens || 100000,
              trayWindowModules: draftConfig.trayWindowModules || DEFAULT_TRAY_WINDOW_MODULES
            } : undefined}
            virtualModelUpsert={virtualModelDialogOpen ? {
              canSubmit: canSubmitVirtualModel,
              draft: virtualModelDraft,
              error: virtualModelError || virtualModelValidationError,
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

export default App;
