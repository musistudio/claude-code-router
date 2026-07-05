import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  pointerWithin,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, LayoutGroup } from "motion/react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Box,
  Boxes,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Database,
  ExternalLink,
  FolderOpen,
  Gauge,
  Globe,
  Info,
  KeyRound,
  Layers3,
  LoaderCircle,
  MoveRight,
  Network,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  Route,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Terminal,
  Trash2,
  UserRound,
  X,
  type LucideIcon
} from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverContent } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import appLogoUrl from "@/assets/logo.png";
import claudeCodeLogoUrl from "@/assets/agent-logos/claude-code.png";
import codexLogoUrl from "@/assets/agent-logos/codex.png";
import onboardingMascotSpriteUrl from "@/assets/onboarding/mascot-transition.svg";
import anthropicProviderIconUrl from "@/assets/provider-icons/anthropic.png";
import bailianProviderIconUrl from "@/assets/provider-icons/bailian.ico";
import deepseekProviderIconUrl from "@/assets/provider-icons/deepseek.ico";
import geminiProviderIconUrl from "@/assets/provider-icons/gemini.svg";
import mistralProviderIconUrl from "@/assets/provider-icons/mistral.webp";
import moonshotProviderIconUrl from "@/assets/provider-icons/moonshot.ico";
import openaiProviderIconUrl from "@/assets/provider-icons/openai.png";
import openrouterProviderIconUrl from "@/assets/provider-icons/openrouter.ico";
import siliconflowProviderIconUrl from "@/assets/provider-icons/siliconflow.png";
import zaiGlobalCodingProviderIconUrl from "@/assets/provider-icons/zai-global-coding.svg";
import zaiGlobalGeneralProviderIconUrl from "@/assets/provider-icons/zai-global-general.svg";
import zhipuCnCodingProviderIconUrl from "@/assets/provider-icons/zhipu-cn-coding.png";
import zhipuCnGeneralProviderIconUrl from "@/assets/provider-icons/zhipu-cn-general.png";
import trayCyanIconUrl from "@/assets/tray-cyan.png";
import trayOrangeIconUrl from "@/assets/tray-orange.png";
import trayVioletIconUrl from "@/assets/tray-violet.png";
import {
  BUILTIN_FUSION_TOOL_SERVER_NAME,
  BUILTIN_FUSION_VISION_TOOL_NAME,
  BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME,
  CLAUDE_CODE_DEFAULT_ENV,
  DEFAULT_OVERVIEW_WIDGETS,
  DEFAULT_TRAY_COMPONENT_VARIANTS,
  DEFAULT_TRAY_WIDGETS,
  DEFAULT_TRAY_WINDOW_MODULES,
  enforceSingleEnabledGlobalProfilePerAgent,
  normalizeProfileScopeValue,
  OVERVIEW_WIDGET_SIZE_VALUES,
  TRAY_SINGLETON_WIDGET_TYPES,
  TRAY_TOP_WIDGET_TYPES,
  TRAY_WINDOW_MODULE_IDS
} from "@ccr/core/contracts/app";
import type {
  AgentAnalysisFilter,
  AgentAnalysisSessionSelection,
  AgentAnalysisSnapshot,
  AgentKind,
  AppConfig,
  AppInfo,
  AppUpdateStatus,
  ApiKeyConfig,
  ApiKeyLimitConfig,
  BotGatewayQrLoginCancelRequest,
  BotGatewayQrLoginCancelResult,
  BotGatewayQrLoginStartRequest,
  BotGatewayQrLoginStartResult,
  BotGatewayQrLoginWaitRequest,
  BotGatewayQrLoginWaitResult,
  BotGatewayQrWindowOpenResult,
  BotGatewayRuntimeConfig,
  BotGatewaySavedConfig,
  BotHandoffScanTarget,
  GatewayProviderConfig,
  GatewayProviderCapability,
  GatewayPluginAppConfig,
  GatewayProviderConnectivityCheckModelResult,
  GatewayProviderConnectivityCheckReport,
  GatewayProviderProbeCandidate,
  GatewayProviderProbeCandidateResult,
  GatewayProviderProbeResult,
  GatewayProviderProtocol,
  GatewayMcpServerConfig,
  GatewayMcpServerTransport,
  GatewayMcpStdioMessageMode,
  GatewayMcpToolInfo,
  GatewayStatus,
  OverviewMetricKind,
  OverviewWidgetConfig,
  OverviewWidgetSize,
  OverviewWidgetType,
  OverviewWidgetVariant,
  PluginDependency,
  PluginDirectorySelection,
  PluginMarketplaceEntry,
  ProviderAccountConfig,
  ProviderAccountConnectorConfig,
  ProviderAccountHttpJsonConnectorConfig,
  ProviderAccountMeter,
  ProviderAccountStandardConnectorConfig,
  ProviderAccountSnapshot,
  ProviderAccountTestPath,
  ProviderAccountTestResult,
  ProviderCredentialConfig,
  ProviderDeepLinkPayload,
  ProviderDeepLinkRequest,
  ProfileConfig,
  ProfileOpenSurface,
  CodexProfileConfigFormat,
  ProfileScope,
  ProfileSurface,
  ProxyCertificateInstallResult,
  ProxyCertificateStatus,
  ProxyNetworkBody,
  ProxyNetworkExchange,
  ProxyNetworkSnapshot,
  ProxyStatus,
  RequestLogBody,
  RequestLogEntry,
  RequestLogListFilter,
  RequestLogPage,
  RequestLogStatusFilter,
  RouterConfig,
  RouterFallbackConfig,
  RouterFallbackMode,
  RouterRule,
  RouterRuleCondition,
  RouterRuleOperator,
  RouterRuleRewrite,
  RouterRuleRewriteOperation,
  RouterRuleType,
  TrayBalanceProgressConfig,
  TrayComponentVariants,
  TrayWidgetConfig,
  TrayWidgetType,
  TrayWidgetVariant,
  TrayWindowModuleId,
  UsageComparisonRow,
  UsageSeriesPoint,
  UsageStatsFilter,
  UsageStatsRange,
  UsageStatsSnapshot,
  UsageTotals,
  VirtualModelBaseModelMode,
  VirtualModelExecutionMode,
  VirtualModelFusionCustomToolConfig,
  VirtualModelFusionVisionConfig,
  VirtualModelFusionWebSearchConfig,
  VirtualModelFusionWebSearchProvider,
  VirtualModelProfileConfig,
  VirtualModelToolVisibility
} from "@ccr/core/contracts/app";
import {
  customProviderPresetId,
  defaultProviderAccountConfig,
  standardProviderAccountConfig,
  type ProviderIdentitySafetyIssue,
  type ProviderPreset,
  type ProviderPresetEndpoint
} from "@ccr/core/providers/presets/types";
import {
  findProviderPresetByBaseUrlInList,
  findProviderPresetInList,
  primaryProviderPresetEndpoint as primaryProviderPresetEndpointFromPreset,
  providerApiKeySafetyIssueInList,
  providerEndpointCanReceiveProviderApiKeyInList,
  providerIdentitySafetyIssueInList
} from "@ccr/core/providers/presets/utils";
import { normalizeProviderBaseUrl, providerUrlWithDefaultScheme } from "@ccr/core/providers/url";
import {
  fallbackConfig,
  fallbackGatewayStatus,
  fallbackInfo,
  fallbackProxyCertificateStatus,
  fallbackProxyNetworkSnapshot,
  fallbackProxyStatus,
  fallbackUpdateStatus
} from "./fallbacks";
import {
  AppI18nContext,
  appCopy,
  languagePreferenceStorageKey,
  translateOptions,
  translateText,
  useAppText,
  type AppCopy
} from "./i18n";
import {
  AnimatedDisclosure,
  AnimatedIconSwap,
  AnimatedFieldSlot,
  AnimatedListItem,
  AnimatedPopover,
  disclosureSpringTransition,
  listSpringTransition,
  pageSpringTransition,
  ViewMotionShell
} from "./motion";
import {
  clientInitial,
  formatBytes,
  formatDuration,
  formatHeaderName,
  formatNetworkDateTime,
  formatNetworkHeaders,
  formatNetworkRequestRaw,
  formatNetworkResponseRaw,
  formatNetworkTime,
  networkCodeLabel,
  networkExchangeMatchesQuery,
  networkHeaderRows,
  networkLifecycleLabel,
  networkQueryRows,
  networkRowId,
  networkStatusLabel,
  networkStatusVariant,
  networkSummaryRows
} from "./network";
import {
  agentKindLabel,
  compactId,
  compactUserAgent,
  createEmptyAgentAnalysis,
  createEmptyAgentConcurrencySeries,
  createEmptyRequestLogPage,
  createEmptyUsageSeries,
  createEmptyUsageStats,
  emptyUsageTotals,
  formatAxisNumber,
  formatCompactNumber,
  formatPercent,
  formatStatusCodeCounts,
  formatToolCounts,
  formatUsdCost,
  logSelectOptions,
  normalizeAgentFilterValue
} from "./usage";
import {
  agentAnalysisRangeOptions,
  agentFilterOptions,
  apiKeyExpirationOptions,
  apiKeyLimitMetricOptions,
  claudeDesignRouteRuleTypeOptions,
  customFusionToolName,
  defaultFusionWebSearchProvider,
  fusionToolOptions,
  fusionWebSearchEnvKeysByProvider,
  fusionWebSearchProviderOptions,
  getDefaultOnboardingStep,
  getNextOnboardingStep,
  isOnboardingProfileReady,
  isOnboardingProviderReady,
  legacyRouterRuleTypes,
  legacyUnimcpPackageName,
  legacyUnimcpServerName,
  limitWindowOptions,
  mcpServerStartupTimeoutMs,
  mcpServerTransportOptions,
  mcpStdioMessageModeOptions,
  navigation,
  onboardingStepOrder,
  overviewMetricOptions,
  overviewWidgetSizeOptions,
  profileAgentOptions,
  profileScopeOptions,
  profileSurfaceOptions,
  providerAccountModeOptions,
  providerPresetIconUrls,
  providerProtocolOptions,
  providerUsageMethodOptions,
  requestLogPageSizeOptions,
  requestLogStatusOptions,
  removedLegacyRouterRuleIds,
  routerConditionSourceOptions,
  routerFallbackModeOptions,
  routerRewriteOperationOptions,
  routerRuleOperatorOptions,
  routerRuleTypeOptions,
  trayMascotIconUrls,
  usageRangeOptions,
  virtualModelBaseModeOptions,
  virtualModelClientToolsPolicyOptions,
  virtualModelExecutionModeOptions,
  virtualModelMatchModeOptions,
  virtualModelToolVisibilityOptions
} from "./options";
import type { AgentFilterValue, RouterConditionSource } from "./options";
import type { MotionSafeDivAttributes } from "./motion";


import { metricToneBar } from "./common";
import { profileAgentLabel, profileAgentLogoUrl } from "./profiles";
import { routeTargetOptions } from "./providers";
import { createKeyValueDraftRow } from "./virtual-models";
import type { KeyValueDraftRow } from "./types";

export function Field({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  return (
    <Label className={cn("block min-w-0 space-y-1", className)}>
      <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </Label>
  );
}

export function AgentLogo({ agent, className }: { agent: ProfileConfig["agent"]; className?: string }) {
  const label = profileAgentLabel(agent);

  return (
    <span
      className={cn("flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[5px]", className)}
      title={label}
    >
      <img alt={`${label} icon`} className="h-full w-full rounded-[inherit] object-cover" src={profileAgentLogoUrl(agent)} />
    </span>
  );
}

export function SelectControl({
  className,
  onChange,
  options,
  value
}: {
  className?: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return <Select className={className} onValueChange={onChange} options={options} value={value} />;
}

export function RouteTargetControl({
  modelOptions,
  onChange,
  value
}: {
  modelOptions: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
  value: string;
}) {
  const t = useAppText();

  if (modelOptions.length === 0) {
    return <Input onChange={(event) => onChange(event.target.value)} value={value} />;
  }

  const options = routeTargetOptions(modelOptions, value);
  return <SelectControl onChange={onChange} options={translateOptions(options, t)} value={value} />;
}

export function TextAreaControl({
  className,
  minHeight,
  onChange,
  value
}: {
  className?: string;
  minHeight: number;
  onChange: (value: string) => void;
  value: string;
}) {
  const responsiveMinHeight = `min(${minHeight}px, max(132px, calc(100dvh - 220px)))`;

  return (
    <Textarea
      className={cn(
        "min-h-0",
        className
      )}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      style={{ minHeight: responsiveMinHeight }}
      value={value}
    />
  );
}

export function KeyValueRowsControl({
  addLabel,
  onChange,
  rows
}: {
  addLabel: string;
  onChange: (rows: KeyValueDraftRow[]) => void;
  rows: KeyValueDraftRow[];
}) {
  const t = useAppText();
  const visibleRows = rows.length > 0 ? rows : [createKeyValueDraftRow()];

  function updateRow(index: number, patch: Partial<KeyValueDraftRow>) {
    const nextRows = [...visibleRows];
    nextRows[index] = { ...nextRows[index], ...patch };
    onChange(nextRows);
  }

  function addRow() {
    onChange([...visibleRows, createKeyValueDraftRow()]);
  }

  function removeRow(index: number) {
    onChange(visibleRows.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <div className="space-y-2">
      {visibleRows.map((row, index) => (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_28px_28px] gap-2" key={row.id}>
          <Input
            aria-label={t("Key")}
            onChange={(event) => updateRow(index, { key: event.target.value })}
            placeholder={t("Key")}
            value={row.key}
          />
          <Input
            aria-label={t("Value")}
            onChange={(event) => updateRow(index, { value: event.target.value })}
            placeholder={t("Value")}
            value={row.value}
          />
          <Button
            aria-label={addLabel}
            onClick={addRow}
            size="iconSm"
            title={addLabel}
            type="button"
            variant="outline"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            aria-label={t("Remove")}
            disabled={visibleRows.length === 1 && !row.key.trim() && !row.value.trim()}
            onClick={() => removeRow(index)}
            size="iconSm"
            title={t("Remove")}
            type="button"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function Toggle({ checked, disabled = false, onChange, title }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; title?: string }) {
  return <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} title={title} />;
}

export type MetricTone = "amber" | "blue" | "indigo" | "rose" | "slate" | "teal";

export function MetricCard({ label, tone, value }: { label: string; tone: MetricTone; value: string }) {
  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className={cn("h-1", metricToneBar(tone))} />
      <CardContent className="flex min-h-[88px] flex-1 flex-col justify-center">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 truncate text-[20px] font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export type SystemStatusTone = "error" | "idle" | "ok" | "warn";

export type SystemStatusPoint = {
  dateLabel: string;
  point: UsageSeriesPoint;
  tone: SystemStatusTone;
};

export function usageStatusTone(point: Pick<UsageTotals, "requestCount" | "successRate">): SystemStatusTone {
  if (point.requestCount <= 0) return "idle";
  if (point.successRate >= 0.995) return "ok";
  if (point.successRate >= 0.98) return "warn";
  return "error";
}

export function formatSystemStatusRange(segments: SystemStatusPoint[], range: UsageStatsRange): string {
  if (segments.length === 0) {
    return range;
  }
  const first = segments[0]?.dateLabel ?? "";
  const last = segments.at(-1)?.dateLabel ?? first;
  return first === last ? first : `${first} - ${last}`;
}

export function formatStatusBucketDate(bucket: string, range: UsageStatsRange): string {
  const parsed = parseStatusBucketDate(bucket);
  if (!parsed) {
    return bucket;
  }
  const dateOptions: Intl.DateTimeFormatOptions = range === "today" || range === "24h"
    ? { day: "2-digit", hour: "2-digit", hour12: false, month: "2-digit" }
    : { day: "2-digit", month: "2-digit" };
  return new Intl.DateTimeFormat(undefined, dateOptions).format(parsed);
}

export function parseStatusBucketDate(bucket: string): Date | undefined {
  const match = bucket.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})(?::00)?)?$/);
  if (!match) {
    return undefined;
  }
  const [, year, month, day, hour] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), hour === undefined ? 0 : Number(hour), 0, 0, 0);
}

export function systemStatusPointTooltip(segment: SystemStatusPoint, t: (value: string) => string): string {
  return [
    segment.dateLabel,
    `${t("Requests")}: ${formatCompactNumber(segment.point.requestCount)}`,
    `${t("Success rate")}: ${formatPercent(segment.point.successRate)}`,
    `${t("Failed requests")}: ${formatCompactNumber(segment.point.errorCount)}`,
    `${t("Duration")}: ${formatDuration(segment.point.avgDurationMs)}`
  ].join("\n");
}

export function systemStatusTooltipPositionClass(index: number, total: number): string {
  if (index <= 1) {
    return "left-0";
  }
  if (index >= total - 2) {
    return "right-0";
  }
  return "left-1/2 -translate-x-1/2";
}

export function systemStatusIconClass(tone: SystemStatusTone): string {
  if (tone === "ok") return "bg-emerald-500 text-white";
  if (tone === "warn") return "bg-amber-400 text-amber-950";
  if (tone === "error") return "bg-rose-500 text-white";
  return "bg-muted text-muted-foreground";
}

export function systemStatusSegmentClass(tone: SystemStatusTone): string {
  if (tone === "ok") return "bg-emerald-500";
  if (tone === "warn") return "bg-amber-400";
  if (tone === "error") return "bg-rose-500";
  return "bg-muted-foreground/25";
}

export function ServiceControlButton({
  busy,
  onClick,
  state
}: {
  busy: boolean;
  onClick: () => void;
  state: GatewayStatus["state"];
}) {
  const t = useAppText();
  const active = state === "running" || state === "starting";
  const title = active ? t("Pause service") : t("Start service");
  const Icon = active ? Pause : Play;

  return (
    <Button
      aria-label={title}
      className={cn(
        "app-no-drag app-service-control inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25",
        active && "text-emerald-700 hover:text-emerald-800"
      )}
      disabled={busy}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClick}
      title={title}
      type="button"
      unstyled
    >
      {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function EndpointTitleBar({
  config,
  endpoint,
  gatewayStatus
}: {
  config: AppConfig;
  endpoint: string;
  gatewayStatus: GatewayStatus;
}) {
  const t = useAppText();
  const [open, setOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const copyResetTimer = useRef<number>();
  const rootRef = useRef<HTMLDivElement>(null);
  const running = gatewayStatus.state === "running";
  const statusLabel = running ? t("running") : t("not running");
  const value = endpoint.trim() || t("Not configured");
  const loopbackEndpoint = loopbackEndpointFromStatus(value, config);
  const loopbackBaseUrl = gatewayBaseUrlFromEndpoint(loopbackEndpoint);
  const networkEndpoints = running ? gatewayStatus.networkEndpoints ?? [] : [];

  async function copyEndpoint(valueToCopy: string, key: string) {
    await copyEndpointTextToClipboard(valueToCopy);
    setCopiedKey(key);
    if (copyResetTimer.current) {
      window.clearTimeout(copyResetTimer.current);
    }
    copyResetTimer.current = window.setTimeout(() => setCopiedKey(""), 1300);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
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
    return () => {
      if (copyResetTimer.current) {
        window.clearTimeout(copyResetTimer.current);
      }
    };
  }, []);

  return (
    <div
      className="app-no-drag fixed left-1/2 top-2 z-50 w-[min(560px,56vw,calc(100%_-_48px))] min-w-[220px] -translate-x-1/2 max-[720px]:static max-[720px]:w-full max-[720px]:min-w-0 max-[720px]:translate-x-0"
      ref={rootRef}
      title={`${t("Endpoint")} ${value} - ${statusLabel}`}
    >
      <Button
        aria-controls="endpoint-info-panel"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-card px-3 text-left shadow-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/25",
          open && "border-ring/35 bg-muted/40"
        )}
        onClick={() => setOpen((current) => !current)}
        type="button"
        unstyled
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            running ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" : "bg-muted-foreground/45"
          )}
        />
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{t("Endpoint")}</span>
        <span className="h-3 w-px shrink-0 bg-border" />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">{value}</span>
        <span className="sr-only">{t("Service status")}: {statusLabel}</span>
      </Button>

      <AnimatePresence initial={false}>
        {open ? (
          <AnimatedPopover className="absolute left-1/2 top-full z-50 mt-2 w-[340px] max-w-[calc(100vw-24px)] -translate-x-1/2">
            <PopoverContent
              aria-label={t("Endpoint information")}
              className="p-3"
              id="endpoint-info-panel"
              role="dialog"
            >
              <div className="space-y-1.5">
                <EndpointInfoRow
                  copied={copiedKey === `loopback:${loopbackBaseUrl}`}
                  label="Loopback"
                  value={loopbackBaseUrl}
                  onCopy={(valueToCopy) => void copyEndpoint(valueToCopy, `loopback:${loopbackBaseUrl}`)}
                />
                {networkEndpoints.map((entry, index) => {
                  const baseUrl = gatewayBaseUrlFromEndpoint(entry.endpoint);
                  return (
                    <EndpointInfoRow
                      copied={copiedKey === `network:${entry.interfaceName}:${entry.address}`}
                      key={`${entry.interfaceName}-${entry.address}`}
                      label={index === 0 ? "Network" : ""}
                      meta={entry.interfaceName}
                      value={baseUrl}
                      onCopy={(valueToCopy) => void copyEndpoint(valueToCopy, `network:${entry.interfaceName}:${entry.address}`)}
                    />
                  );
                })}
              </div>

            </PopoverContent>
          </AnimatedPopover>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function EndpointInfoRow({
  copied,
  label,
  meta,
  value,
  onCopy
}: {
  copied: boolean;
  label: string;
  meta?: string;
  value: string;
  onCopy: (value: string) => void;
}) {
  const t = useAppText();

  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)_24px] items-center gap-2 text-[12px]">
      <span className="text-right text-muted-foreground">{label ? `${label}:` : null}</span>
      <span className="min-w-0 truncate font-medium text-foreground">
        {value}
        {meta ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">({meta})</span> : null}
      </span>
      <Button
        aria-label={copied ? t("Copied") : t("Copy")}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25",
          copied
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600"
            : "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        title={copied ? t("Copied") : t("Copy")}
        type="button"
        unstyled
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onCopy(value);
        }}
      >
        <AnimatedIconSwap iconKey={copied ? "copied" : "copy"}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </AnimatedIconSwap>
      </Button>
    </div>
  );
}

function loopbackEndpointFromStatus(endpoint: string, config: AppConfig): string {
  try {
    const parsed = new URL(endpoint);
    return `http://127.0.0.1:${parsed.port || config.gateway.port}`;
  } catch {
    return `http://127.0.0.1:${config.gateway.port}`;
  }
}

function gatewayBaseUrlFromEndpoint(endpoint: string): string {
  try {
    const parsed = new URL(endpoint);
    parsed.pathname = appendGatewayBasePath(parsed.pathname);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return `${endpoint.replace(/\/+$/, "")}/v1`;
  }
}

function appendGatewayBasePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  if (!normalized || normalized === "/") {
    return "/v1";
  }
  if (normalized.endsWith("/v1")) {
    return normalized;
  }
  return `${normalized}/v1`;
}

async function copyEndpointTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back to a temporary textarea for Electron/file contexts where clipboard permissions vary.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.left = "-9999px";
  textarea.style.position = "fixed";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
