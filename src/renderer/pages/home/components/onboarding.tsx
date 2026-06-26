import {
  AddProfileDraft, AddProviderDraft, AppConfig, Button, Check, ChevronLeft,
  ChevronRight, cn, GatewayProviderProbeResult, GatewayStatus, Gauge, getNextOnboardingStep,
  isOnboardingProfileReady, isOnboardingProviderReady, Layers3, LucideIcon, motion, motionEase,
  LoaderCircle, onboardingMascotSpriteUrl, OnboardingReadinessOptions, OnboardingStepId, onboardingStepOrder, ProviderConnectivityCheckReport, reducedMotionTransition, useAppText, useReducedMotion,
  useState,
  UserRound, X
} from "../shared";
import { AddProviderForm } from "./providers";
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

const onboardingMascotPalettes: Record<OnboardingMascotTone, { accent: string; glow: string; main: string; shadow: string }> = {
  cyan: {
    accent: "#8CF7FF",
    glow: "rgba(34, 211, 238, 0.22)",
    main: "#22D3EE",
    shadow: "rgba(8, 145, 178, 0.22)"
  },
  orange: {
    accent: "#FFD166",
    glow: "rgba(249, 115, 22, 0.2)",
    main: "#F97316",
    shadow: "rgba(194, 65, 12, 0.22)"
  },
  violet: {
    accent: "#C084FC",
    glow: "rgba(139, 92, 246, 0.2)",
    main: "#8B5CF6",
    shadow: "rgba(109, 40, 217, 0.22)"
  }
};

export function OnboardingView({
  activeStep,
  canSubmitProfile,
  canSubmitProvider,
  config,
  endpoint,
  gatewayStatus,
  onCheckProvider,
  onChangeProfile,
  onChangeProvider,
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
  canSubmitProfile: boolean;
  canSubmitProvider: boolean;
  config: AppConfig;
  endpoint: string;
  gatewayStatus: GatewayStatus;
  onCheckProvider: () => Promise<ProviderConnectivityCheckReport>;
  onChangeProfile: (patch: Partial<AddProfileDraft>) => void;
  onChangeProvider: (patch: Partial<AddProviderDraft>, resetProbe?: boolean) => void;
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
  const providerReady = isOnboardingProviderReady(config);
  const profileReady = isOnboardingProfileReady(config, readiness);
  const serviceReady = gatewayStatus.state === "running";
  const routeReady = providerReady && profileReady;
  const activeIndex = Math.max(0, onboardingStepOrder.indexOf(activeStep));
  const activeDetails = onboardingStepDetails[activeStep];
  const previousStep = onboardingStepOrder[activeIndex - 1];
  const nextStep = getNextOnboardingStep(activeStep, config, readiness);
  const providerSubmitLoading = activeStep === "provider" && (providerProbeLoading || providerConnectivityLoading || providerIconDetecting);
  const nextDisabled = activeStep === "provider"
    ? providerSubmitLoading || !(providerReady || canSubmitProvider)
    : activeStep === "profile"
      ? !(profileReady || (providerReady && canSubmitProfile))
      : !routeReady;

  function goToPreviousStep() {
    if (previousStep) {
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
            <OnboardingProgress activeIndex={activeIndex} />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-5">
              <div className="flex h-8 shrink-0 items-center">
                {previousStep ? (
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
                      mode={providerReady ? "edit" : "add"}
                      onCheck={onCheckProvider}
                      onChange={onChangeProvider}
                      onIconDetectingChange={setProviderIconDetecting}
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

              <div className="mt-5 flex shrink-0 items-center justify-end gap-3 border-t border-border/60 pt-4">
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

function OnboardingProgress({ activeIndex }: { activeIndex: number }) {
  const t = useAppText();
  const stepCount = onboardingStepOrder.length;
  const progressWidth = `${((activeIndex + 1) / stepCount) * 100}%`;

  return (
    <div className="relative shrink-0 border-b border-border/60 bg-card/95" aria-label={`${t("Step")} ${activeIndex + 1} / ${stepCount}`}>
      <div className="mx-auto flex h-11 max-w-[520px] items-center justify-center px-3 text-[13px] font-medium">
        {onboardingStepOrder.map((step, index) => (
          <div className="flex min-w-0 items-center" key={step}>
            <span
              className={cn(
                "max-w-[136px] truncate",
                index === activeIndex ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {t(onboardingStepDetails[step].title)}
            </span>
            {index < stepCount - 1 ? <ChevronRight className="mx-5 h-4 w-4 shrink-0 text-muted-foreground/70 max-[560px]:mx-2" /> : null}
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
