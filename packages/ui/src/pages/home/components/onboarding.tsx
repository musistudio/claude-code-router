import {
  AddProfileDraft, AddProviderDraft, AppConfig, ArrowDown, Button, Check, ChevronLeft,
  ChevronRight, CircleAlert, CloudSyncOperationResult, CloudSyncStatus, cn, Field, findProviderPreset, GatewayProviderProbeResult, GatewayStatus, Gauge, getDefaultOnboardingStep, getNextOnboardingStep,
  Globe, Input, isOnboardingProfileReady, isOnboardingProviderReady, KeyRound, Layers3, LucideIcon, mergeProviderModelLists, motion, motionEase,
  LoaderCircle, onboardingMascotSpriteUrl, OnboardingReadinessOptions, OnboardingStepId, onboardingStepOrder, type ProfileAgentOption, providerDraftHasReadyCredentialPool, ProviderConnectivityCheckReport, reducedMotionTransition, splitLines, Tabs, TabsContent, TabsList, TabsTrigger, useAppErrorText, useAppText, useEffect, useReducedMotion,
  useRef, useState,
  UserRound, X
} from "../shared/index";
import { AddProviderForm, providerSetupStepIds, type ProviderSetupStepId } from "./providers";
import { AddProfileForm } from "./profiles";

type OnboardingMascotTone = "cyan" | "orange" | "violet";

const onboardingStepDetails: Record<OnboardingStepId, {
  description: string;
  icon: LucideIcon;
  title: string;
  tone: OnboardingMascotTone;
}> = {
  provider: {
    description: "Add or verify a model provider.",
    icon: Layers3,
    title: "Configure provider",
    tone: "violet"
  },
  profile: {
    description: "Create a profile for your agent.",
    icon: UserRound,
    title: "Connect agent",
    tone: "orange"
  },
  enter: {
    description: "Start using CCR.",
    icon: Gauge,
    title: "Let's start",
    tone: "cyan"
  }
};

export function OnboardingView({
  activeStep,
  agentOptions,
  canSubmitProfile,
  canSubmitProvider,
  config,
  endpoint,
  gatewayStatus,
  onCheckProvider,
  onChangeProfile,
  onChangeProvider,
  onCloudConfigRestore,
  onCloudToast,
  onComplete,
  onSelectStep,
  onSubmitProfile,
  onSubmitProvider,
  profileDraft,
  profileError,
  providerDraft,
  providerError,
  providerConnectivityLoading,
  providerConnectivityProbe,
  providerProbe,
  providerProbeLoading,
  readiness
}: {
  activeStep: OnboardingStepId;
  agentOptions: ProfileAgentOption[];
  canSubmitProfile: boolean;
  canSubmitProvider: boolean;
  config: AppConfig;
  endpoint: string;
  gatewayStatus: GatewayStatus;
  onCheckProvider: () => Promise<ProviderConnectivityCheckReport>;
  onChangeProfile: (patch: Partial<AddProfileDraft>) => void;
  onChangeProvider: (patch: Partial<AddProviderDraft>, resetProbe?: boolean) => void;
  onCloudConfigRestore?: (config: AppConfig) => void;
  onCloudToast?: (message: string) => void;
  onComplete: () => void | Promise<void>;
  onSelectStep: (step: OnboardingStepId) => void;
  onSubmitProfile: () => Promise<boolean>;
  onSubmitProvider: () => Promise<boolean>;
  profileDraft: AddProfileDraft;
  profileError: string;
  providerDraft: AddProviderDraft;
  providerError: string;
  providerConnectivityLoading: boolean;
  providerConnectivityProbe?: GatewayProviderProbeResult;
  providerProbe?: GatewayProviderProbeResult;
  providerProbeLoading: boolean;
  readiness?: OnboardingReadinessOptions;
}) {
  const t = useAppText();
  const shouldReduceMotion = useReducedMotion();
  const [providerIconDetecting, setProviderIconDetecting] = useState(false);
  const [providerSetupStep, setProviderSetupStep] = useState<ProviderSetupStepId>("provider");
  const providerReady = isOnboardingProviderReady(config);
  const profileReady = isOnboardingProfileReady(config, readiness);
  const serviceReady = gatewayStatus.state === "running";
  const routeReady = providerReady && profileReady;
  const activeIndex = Math.max(0, onboardingStepOrder.indexOf(activeStep));
  const activeDetails = onboardingStepDetails[activeStep];
  const previousStep = onboardingStepOrder[activeIndex - 1];
  const nextStep = getNextOnboardingStep(activeStep, config, readiness);
  const localAgentProviderImport = providerDraft.providerPlugins.length > 0;
  const providerIdentityReady = Boolean(findProviderPreset(providerDraft.presetId) || providerDraft.baseUrl.trim());
  const providerCredentialReady = localAgentProviderImport || Boolean(
    providerDraft.credentialMode === "pool"
      ? providerDraftHasReadyCredentialPool(providerDraft)
      : providerDraft.apiKey.trim()
  );
  const providerModelsReady = mergeProviderModelLists(providerDraft.selectedModels, splitLines(providerDraft.modelsText)).length > 0;
  const providerSetupIndex = Math.max(0, providerSetupStepIds.indexOf(providerSetupStep));
  const previousProviderSetupStep = activeStep === "provider" ? providerSetupStepIds[providerSetupIndex - 1] : undefined;
  const nextProviderSetupStep = activeStep === "provider" ? providerSetupStepIds[providerSetupIndex + 1] : undefined;
  const providerSubmitLoading = activeStep === "provider" && (providerProbeLoading || providerConnectivityLoading || providerIconDetecting);
  const nextDisabled = activeStep === "provider"
    ? providerSubmitLoading || (nextProviderSetupStep
      ? !isProviderSetupStepReady(providerSetupStep)
      : !(providerReady || canSubmitProvider))
    : activeStep === "profile"
      ? !(profileReady || (providerReady && canSubmitProfile))
      : !routeReady;

  useEffect(() => {
    if (activeStep !== "provider" || isProviderSetupStepUnlocked(providerSetupStep)) {
      return;
    }
    setProviderSetupStep(getLatestUnlockedProviderSetupStep());
  }, [activeStep, providerCredentialReady, providerIdentityReady, providerModelsReady, providerSetupStep]);

  function isProviderSetupStepReady(step: ProviderSetupStepId): boolean {
    switch (step) {
      case "provider":
        return providerIdentityReady;
      case "credentials":
        return providerCredentialReady;
      case "models":
        return providerModelsReady;
      case "verify":
        return true;
    }
  }

  function isProviderSetupStepUnlocked(step: ProviderSetupStepId): boolean {
    switch (step) {
      case "provider":
        return true;
      case "credentials":
        return providerIdentityReady;
      case "models":
        return providerIdentityReady && providerCredentialReady;
      case "verify":
        return providerIdentityReady && providerCredentialReady && providerModelsReady;
    }
  }

  function getLatestUnlockedProviderSetupStep(): ProviderSetupStepId {
    return [...providerSetupStepIds].reverse().find(isProviderSetupStepUnlocked) ?? "provider";
  }

  function goToPreviousStep() {
    if (activeStep === "provider" && previousProviderSetupStep) {
      setProviderSetupStep(previousProviderSetupStep);
      return;
    }
    if (previousStep) {
      if (previousStep === "provider") {
        setProviderSetupStep(getLatestUnlockedProviderSetupStep());
      }
      onSelectStep(previousStep);
    }
  }

  async function goToNextStep() {
    if (activeStep === "enter") {
      if (routeReady) {
        await onComplete();
      }
      return;
    }

    if (activeStep === "provider") {
      if (providerSubmitLoading) {
        return;
      }
      if (nextProviderSetupStep) {
        if (isProviderSetupStepReady(providerSetupStep)) {
          setProviderSetupStep(nextProviderSetupStep);
        }
        return;
      }
      if (canSubmitProvider) {
        const saved = await onSubmitProvider();
        if (saved) {
          return;
        }
      }
      if (providerReady && nextStep) {
        onSelectStep(nextStep);
      }
      return;
    }

    if (activeStep === "profile" && !profileReady) {
      await onSubmitProfile();
      return;
    }

    if (nextStep) {
      onSelectStep(nextStep);
    }
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 w-full flex-col"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 overflow-hidden bg-card">
          <motion.div
            className="relative z-10 flex h-full min-h-0 flex-1 flex-col overflow-hidden"
            layout
            style={{ transformPerspective: 900 }}
            transition={shouldReduceMotion ? reducedMotionTransition : { duration: 0.28, ease: motionEase }}
          >
            <OnboardingProgress activeStep={activeStep} providerSetupStep={providerSetupStep} />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-5">
              <div className="flex h-8 shrink-0 items-center">
                {previousStep || previousProviderSetupStep ? (
                  <Button
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-1 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
                    onClick={goToPreviousStep}
                    type="button"
                    unstyled
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t("Back")}
                  </Button>
                ) : null}
              </div>

              <div className="flex min-w-0 shrink-0 flex-col items-center gap-2 text-center">
                <OnboardingMascotSprite activeStep={activeStep} />
                <div className="min-w-0">
                  <h2 className="text-[20px] font-semibold tracking-normal">{t(activeDetails.title)}</h2>
                  <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{t(activeDetails.description)}</p>
                </div>
              </div>

              <OnboardingCloudRestorePanel
                config={config}
                onConfigRestore={(restoredConfig) => {
                  onCloudConfigRestore?.(restoredConfig);
                  onSelectStep(getDefaultOnboardingStep(restoredConfig, {
                    ...readiness,
                    profileConfirmed: true
                  }));
                }}
                onToast={onCloudToast}
              />

              <div className="onboarding-step-panels mt-5 min-h-0 flex-1 overflow-hidden">
                <div
                  aria-hidden={activeStep !== "provider"}
                  className={cn("onboarding-step-panel flex min-w-0 flex-1 flex-col gap-3", activeStep === "provider" && "onboarding-step-panel-active")}
                >
                  <div className="mx-auto w-full max-w-[780px]">
                    <AddProviderForm
                      connectivityLoading={providerConnectivityLoading}
                      connectivityProbe={providerConnectivityProbe}
                      draft={providerDraft}
                      error={providerError}
                      activeStep={providerSetupStep}
                      mode={providerReady ? "edit" : "add"}
                      onCheck={onCheckProvider}
                      onChange={onChangeProvider}
                      onIconDetectingChange={setProviderIconDetecting}
                      onSelectStep={(step) => {
                        if (isProviderSetupStepUnlocked(step)) {
                          setProviderSetupStep(step);
                        }
                      }}
                      probe={providerProbe}
                      probeLoading={providerProbeLoading}
                      providerPlugins={config.providerPlugins ?? []}
                      providers={config.Providers}
                    />
                  </div>
                </div>

                <div
                  aria-hidden={activeStep !== "profile"}
                  className={cn("onboarding-step-panel flex min-w-0 flex-1 flex-col gap-3", activeStep === "profile" && "onboarding-step-panel-active")}
                >
                  <div className="mx-auto w-full max-w-[720px]">
                    <AddProfileForm
                      agentOptions={agentOptions}
                      botConfigs={[]}
                      draft={profileDraft}
                      error={profileError}
                      onChange={onChangeProfile}
                      onCreateBot={() => undefined}
                      providers={config.Providers}
                      virtualModelProfiles={config.virtualModelProfiles ?? []}
                    />
                  </div>
                </div>

                <div
                  aria-hidden={activeStep !== "enter"}
                  className={cn("onboarding-step-panel flex min-w-0 flex-1 flex-col gap-3", activeStep === "enter" && "onboarding-step-panel-active")}
                >
                  <div className="mx-auto flex w-full max-w-[520px] flex-col overflow-hidden rounded-lg border border-border bg-background/70">
                    <OnboardingStatusRow label={t("Provider")} ready={providerReady} />
                    <OnboardingStatusRow label={t("Profile")} ready={profileReady} />
                    <OnboardingStatusRow label={t("Service")} ready={serviceReady} />
                    <OnboardingDetailRow label={t("Endpoint")} value={endpoint} />
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-center gap-2">
                    {!providerReady ? (
                      <Button onClick={() => onSelectStep("provider")} type="button" variant="outline">
                        {t("Configure provider")}
                      </Button>
                    ) : null}
                    {providerReady && !profileReady ? (
                      <Button onClick={() => onSelectStep("profile")} type="button" variant="outline">
                        {t("Connect agent")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex shrink-0 items-center justify-end gap-3 border-t border-border/60 pt-4 max-[640px]:items-stretch">
                <Button disabled={nextDisabled} onClick={() => void goToNextStep()} type="button">
                  {providerSubmitLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : activeStep === "enter" ? <Check className="h-4 w-4" /> : null}
                  {providerSubmitLoading ? t("Loading") : activeStep === "enter" ? t("Let's start") : t("Next step")}
                  {!providerSubmitLoading && activeStep !== "enter" ? <ChevronRight className="h-4 w-4" /> : null}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function OnboardingCloudRestorePanel({
  config,
  onConfigRestore,
  onToast
}: {
  config: AppConfig;
  onConfigRestore?: (config: AppConfig) => void;
  onToast?: (message: string) => void;
}) {
  const t = useAppText();
  const formatError = useAppErrorText();
  const [open, setOpen] = useState(Boolean(config.cloudSync?.accessToken || config.cloudSync?.refreshToken));
  const [keyMode, setKeyMode] = useState<"key-file" | "password">(config.cloudSync?.keyMode ?? "key-file");
  const [password, setPassword] = useState("");
  const [keyFilePath, setKeyFilePath] = useState("");
  const [status, setStatus] = useState<CloudSyncStatus>();
  const [busy, setBusy] = useState<"" | "login" | "restore" | "status">("");
  const [error, setError] = useState("");
  const keyFileInputRef = useRef<HTMLInputElement>(null);
  const effectiveStatus = status ?? onboardingCloudStatusFromConfig(config);
  const authenticated = effectiveStatus.authenticated;
  const restoreReady = keyMode === "key-file" ? Boolean(keyFilePath.trim()) : Boolean(password);

  useEffect(() => {
    setStatus(onboardingCloudStatusFromConfig(config));
    setKeyMode(config.cloudSync?.keyMode ?? "key-file");
  }, [
    config.cloudSync?.accessToken,
    config.cloudSync?.deviceId,
    config.cloudSync?.enabled,
    config.cloudSync?.keyId,
    config.cloudSync?.keyMode,
    config.cloudSync?.lastRevision,
    config.cloudSync?.lastSyncAt,
    config.cloudSync?.refreshToken,
    config.cloudSync?.userAvatarUrl,
    config.cloudSync?.userEmail,
    config.cloudSync?.userId,
    config.cloudSync?.userLogin,
    config.cloudSync?.userName
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ccr?.cloudSyncGetStatus) {
      return;
    }
    setBusy((current) => current || "status");
    void window.ccr.cloudSyncGetStatus()
      .then((nextStatus) => {
        setStatus(nextStatus);
        if (nextStatus.authenticated) {
          setOpen(true);
        }
      })
      .catch(() => undefined)
      .finally(() => setBusy((current) => current === "status" ? "" : current));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ccr?.onCloudSyncAuthChanged) {
      return undefined;
    }
    return window.ccr.onCloudSyncAuthChanged(() => {
      void refreshCloudSyncAfterAuth();
    });
  }, []);

  function keyInput() {
    return keyMode === "key-file"
      ? { keyFilePath: keyFilePath.trim(), restoreOnly: true }
      : { password, restoreOnly: true };
  }

  function applyStatusResult(result: CloudSyncOperationResult) {
    setStatus(result.status);
    const authExpired = Boolean(result.authExpired);
    if (authExpired) {
      setError(t(result.message));
      return;
    }
    if (result.snapshotApplied && result.config) {
      onConfigRestore?.(result.config);
      onToast?.(t("Cloud configuration restored. Review it before entering CCR."));
      setPassword("");
      setError("");
      return;
    }
    setError(t(result.message));
  }

  async function refreshCloudSyncAfterAuth() {
    if (typeof window === "undefined" || !window.ccr) {
      return;
    }
    try {
      const nextStatus = await window.ccr.cloudSyncGetStatus();
      setStatus(nextStatus);
      setOpen(true);
      setError("");
      onToast?.(t("Cloud login completed. Choose the encryption method used by your cloud snapshot."));
    } catch (authError) {
      setError(formatError(authError));
    }
  }

  async function pollCloudSyncAuthCompletion(deadline = Date.now() + 2 * 60 * 1000) {
    if (typeof window === "undefined" || !window.ccr) {
      return;
    }
    try {
      const nextStatus = await window.ccr.cloudSyncGetStatus();
      if (nextStatus.authenticated) {
        setStatus(nextStatus);
        setOpen(true);
        setError("");
        onToast?.(t("Cloud login completed. Choose the encryption method used by your cloud snapshot."));
        return;
      }
    } catch {
      // Continue polling until the browser login finishes or the deadline expires.
    }
    if (Date.now() < deadline) {
      window.setTimeout(() => void pollCloudSyncAuthCompletion(deadline), 2000);
    }
  }

  async function runCloudLogin() {
    if (typeof window === "undefined" || !window.ccr?.cloudSyncLogin) {
      setError(t("Cloud sync login is only available in the desktop app."));
      return;
    }
    setBusy("login");
    setError("");
    try {
      const login = await window.ccr.cloudSyncLogin();
      setStatus(login.status);
      setOpen(true);
      onToast?.(t("Complete login in the browser, then return to CCR."));
      void pollCloudSyncAuthCompletion();
    } catch (loginError) {
      setError(formatError(loginError));
    } finally {
      setBusy("");
    }
  }

  async function restoreFromCloud() {
    if (typeof window === "undefined" || !window.ccr?.cloudSyncSetup) {
      setError(t("Cloud sync is only available in the Electron app."));
      return;
    }
    setBusy("restore");
    setError("");
    try {
      applyStatusResult(await window.ccr.cloudSyncSetup(keyInput()));
    } catch (restoreError) {
      setError(formatError(restoreError));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="mx-auto mt-4 grid w-full max-w-[780px] gap-3 rounded-md border border-border bg-background/75 p-3 text-left">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground">{t("Restore from cloud")}</h3>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            {t("Use an encrypted cloud snapshot instead of setting up providers manually.")}
          </p>
          {authenticated ? (
            <div className="mt-1 truncate text-[11px] text-muted-foreground">
              {t("Signed in as")} {onboardingCloudAccountName(effectiveStatus)}
            </div>
          ) : null}
        </div>
        <Button disabled={Boolean(busy)} onClick={() => authenticated ? setOpen((value) => !value) : void runCloudLogin()} size="sm" type="button" variant={authenticated ? "outline" : "default"}>
          {busy === "login" || busy === "status" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
          {authenticated ? t(open ? "Hide restore options" : "Restore from cloud") : t("Sign in with GitHub")}
        </Button>
      </div>

      {open && authenticated ? (
        <div className="grid grid-cols-1 gap-3 border-t border-border/60 pt-3">
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{t("Use the same password or key file that encrypted your cloud snapshot. Losing it makes cloud data unrecoverable.")}</div>
            </div>
          </div>

          <Tabs
            className="grid grid-cols-1 gap-3"
            onValueChange={(value) => setKeyMode(value === "password" ? "password" : "key-file")}
            value={keyMode}
          >
            <TabsList aria-label={t("Encryption method")} className="w-fit border border-border bg-muted/20">
              <TabsTrigger className="gap-2" value="key-file">
                <KeyRound className="h-4 w-4" />
                {t("Key file")}
              </TabsTrigger>
              <TabsTrigger className="gap-2" value="password">
                <KeyRound className="h-4 w-4" />
                {t("Password")}
              </TabsTrigger>
            </TabsList>

            <TabsContent className="grid grid-cols-1 gap-3" value="key-file">
              <Field label={t("Key file path")}>
                <Input value={keyFilePath} onChange={(event) => setKeyFilePath(event.target.value)} placeholder={t("Choose an E2EE key file")} />
              </Field>
              <input
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  const filePath = file && window.ccr?.getFilePath ? window.ccr.getFilePath(file) : "";
                  if (filePath) {
                    setKeyFilePath(filePath);
                  }
                  if (keyFileInputRef.current) {
                    keyFileInputRef.current.value = "";
                  }
                }}
                ref={keyFileInputRef}
                type="file"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button onClick={() => keyFileInputRef.current?.click()} size="sm" type="button" variant="outline">
                  <KeyRound className="h-4 w-4" />
                  {t("Choose key file")}
                </Button>
                <Button disabled={Boolean(busy) || !restoreReady} onClick={() => void restoreFromCloud()} size="sm" type="button">
                  {busy === "restore" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowDown className="h-4 w-4" />}
                  {t("Pull cloud config")}
                </Button>
              </div>
            </TabsContent>

            <TabsContent className="grid grid-cols-1 gap-3" value="password">
              <Field label={t("Encryption password")}>
                <Input
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("Required unless you use a key file")}
                  type="password"
                  value={password}
                />
              </Field>
              <div className="flex justify-end">
                <Button disabled={Boolean(busy) || !restoreReady} onClick={() => void restoreFromCloud()} size="sm" type="button">
                  {busy === "restore" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowDown className="h-4 w-4" />}
                  {t("Pull cloud config")}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}
    </section>
  );
}

const onboardingProgressItems: Array<{ key: ProviderSetupStepId | "profile" | "enter"; label: string }> = [
  { key: "provider", label: "Choose provider" },
  { key: "credentials", label: "Add credentials" },
  { key: "models", label: "Pick models" },
  { key: "verify", label: "Verify connection" },
  { key: "profile", label: "Connect agent" },
  { key: "enter", label: "Let's start" }
];

function OnboardingProgress({
  activeStep,
  providerSetupStep
}: {
  activeStep: OnboardingStepId;
  providerSetupStep: ProviderSetupStepId;
}) {
  const t = useAppText();
  const activeKey = activeStep === "provider" ? providerSetupStep : activeStep;
  const activeIndex = Math.max(0, onboardingProgressItems.findIndex((item) => item.key === activeKey));
  const stepCount = onboardingProgressItems.length;
  const progressWidth = `${((activeIndex + 1) / stepCount) * 100}%`;

  return (
    <div className="relative shrink-0 border-b border-border/60 bg-card/95" aria-label={`${t("Step")} ${activeIndex + 1} / ${stepCount}`}>
      <div className="mx-auto flex h-11 max-w-[920px] items-center justify-start overflow-x-auto px-3 text-[12px] font-medium sm:justify-center">
        {onboardingProgressItems.map((item, index) => (
          <div className="flex shrink-0 items-center" key={item.key}>
            <span
              className={cn(
                "max-w-[128px] truncate max-[560px]:max-w-[96px]",
                index === activeIndex ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {t(item.label)}
            </span>
            {index < stepCount - 1 ? <ChevronRight className="mx-2.5 h-4 w-4 shrink-0 text-muted-foreground/70 max-[560px]:mx-1.5" /> : null}
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={stepCount} aria-valuenow={activeIndex + 1}>
        <div className="h-full bg-foreground transition-[width] duration-200" style={{ width: progressWidth }} />
      </div>
    </div>
  );
}

function OnboardingStatusRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex min-h-11 min-w-0 items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0">
      <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{label}</span>
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          ready ? "bg-emerald-500/12 text-emerald-600" : "bg-destructive/10 text-destructive"
        )}
      >
        {ready ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
      </span>
    </div>
  );
}

function OnboardingDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 min-w-0 items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0">
      <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{label}</span>
      <span className="min-w-0 max-w-[68%] truncate text-right font-mono text-[12px] text-muted-foreground" title={value}>{value}</span>
    </div>
  );
}

function onboardingCloudStatusFromConfig(config: AppConfig): CloudSyncStatus {
  const cloudSync = config.cloudSync ?? {
    baseUrl: "",
    deviceName: "",
    enabled: false,
    lastRevision: 0,
    namespace: "ccr"
  };
  return {
    authenticated: Boolean(cloudSync.accessToken || cloudSync.refreshToken),
    baseUrl: cloudSync.baseUrl,
    configured: Boolean(cloudSync.baseUrl && cloudSync.keyId && cloudSync.keySalt),
    deviceId: cloudSync.deviceId,
    deviceName: cloudSync.deviceName,
    enabled: cloudSync.enabled,
    keyId: cloudSync.keyId,
    keyMode: cloudSync.keyMode,
    lastRevision: cloudSync.lastRevision,
    lastSyncAt: cloudSync.lastSyncAt,
    lastSyncError: cloudSync.lastSyncError,
    namespace: cloudSync.namespace,
    snapshotHash: cloudSync.snapshotHash,
    unlocked: false,
    userAvatarUrl: cloudSync.userAvatarUrl,
    userEmail: cloudSync.userEmail,
    userId: cloudSync.userId,
    userLogin: cloudSync.userLogin,
    userName: cloudSync.userName
  };
}

function onboardingCloudAccountName(status: CloudSyncStatus): string {
  if (status.userName && status.userLogin) {
    return `${status.userName} @${status.userLogin}`;
  }
  if (status.userLogin) {
    return `@${status.userLogin}`;
  }
  return status.userName || status.userEmail || status.userId || "";
}

function OnboardingMascotSprite({ activeStep }: { activeStep: OnboardingStepId }) {
  return (
    <div
      aria-hidden
      className={cn("onboarding-mascot-sprite", `onboarding-mascot-sprite-${activeStep}`)}
      style={{
        backgroundImage: `url(${onboardingMascotSpriteUrl})`
      }}
    />
  );
}
