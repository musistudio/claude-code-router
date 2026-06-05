import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import {
  Workflow,
  Activity,
  Database,
  Brain,
  Shield,
  FileText,
  BarChart3,
  GitBranch,
  Eye,
  Zap,
  CheckCircle,
  XCircle,
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Layers,
  MessageSquare,
  Cpu,
  Lightbulb,
  Gauge,
  Anchor,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MiddlewareEntry {
  name: string;
  enabled: boolean;
  description?: string;
  stats?: Record<string, any>;
}

interface PipelinePhase {
  id: string;
  label: string;
  middlewares: MiddlewareEntry[];
}

interface QualityData {
  avgScore?: number;
  distribution?: Record<string, number>;
  trend?: 'improving' | 'declining' | 'stable';
  scores?: Array<{ score: number; count: number }>;
}

interface FeedbackData {
  thumbsUp?: number;
  thumbsDown?: number;
  recent?: Array<{ rating: string; comment?: string; timestamp: string }>;
}

interface SlidingWindowData {
  activeTokens?: number;
  maxTokens?: number;
  summarizationCount?: number;
  activeSessions?: number;
  avgMessagesPerSession?: number;
  compactionEvents?: number;
}

interface PipelineData {
  phases?: PipelinePhase[];
  quality?: QualityData;
  feedback?: FeedbackData;
  slidingWindow?: SlidingWindowData;
  middleware?: MiddlewareEntry[];
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-8 w-32 rounded bg-muted" />
          <div className="h-3 w-16 rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonFlow() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3 overflow-x-auto">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 shrink-0">
              <div className="animate-pulse h-24 w-36 rounded-lg bg-muted" />
              {i < 4 && <span className="text-muted-foreground text-xl">→</span>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const MIDDLEWARE_META: Record<string, { icon: any; description: string }> = {
  HookManager: { icon: Anchor, description: 'Manages lifecycle hooks (onRequest, onRouteDecision, onResponse)' },
  SemanticCache: { icon: Brain, description: 'L1 semantic similarity cache for response deduplication' },
  RedisCache: { icon: Database, description: 'L2 Redis-backed cache for distributed response caching' },
  RAGEnricher: { icon: Lightbulb, description: 'Enriches prompts with retrieved documents from knowledge base' },
  MemoryBridge: { icon: Brain, description: 'Bridges conversation memory between sessions' },
  ReasoningCache: { icon: Cpu, description: 'Caches reasoning chains and serves hints for similar queries' },
  PromptTemplate: { icon: FileText, description: 'Applies prompt templates and variable substitution' },
  ComplianceDisclaimer: { icon: Shield, description: 'Injects compliance disclaimers and policy notices' },
  SessionBridge: { icon: MessageSquare, description: 'Tracks session state and manages context compaction' },
  EvolutionBridge: { icon: GitBranch, description: 'Records skill evolution traces and detects new patterns' },
  ContextCapture: { icon: Eye, description: 'Captures request/response context for analytics' },
  QualityScorer: { icon: Gauge, description: 'Scores response quality on a 0-10 scale' },
  AuditLogger: { icon: FileText, description: 'Logs all request/response pairs for audit compliance' },
};

const PHASES_DEFAULT: PipelinePhase[] = [
  {
    id: 'onPreRoute',
    label: 'onPreRoute',
    middlewares: [
      { name: 'HookManager', enabled: true, description: 'onRequest hooks' },
      { name: 'SemanticCache', enabled: true, description: 'L1 lookup' },
      { name: 'RedisCache', enabled: true, description: 'L2 lookup' },
    ],
  },
  {
    id: 'router',
    label: 'Router',
    middlewares: [],
  },
  {
    id: 'onPostRoute',
    label: 'onPostRoute',
    middlewares: [
      { name: 'RAGEnricher', enabled: true },
      { name: 'MemoryBridge', enabled: true },
      { name: 'ReasoningCache', enabled: true },
      { name: 'HookManager', enabled: true, description: 'onRouteDecision hooks' },
      { name: 'PromptTemplate', enabled: true },
      { name: 'ComplianceDisclaimer', enabled: true },
      { name: 'SessionBridge', enabled: true },
      { name: 'EvolutionBridge', enabled: true },
    ],
  },
  {
    id: 'provider',
    label: 'Provider',
    middlewares: [],
  },
  {
    id: 'onPostResponse',
    label: 'onPostResponse',
    middlewares: [
      { name: 'SemanticCache', enabled: true, description: 'Store response' },
      { name: 'MemoryBridge', enabled: true, description: 'Extract memories' },
      { name: 'ContextCapture', enabled: true },
      { name: 'QualityScorer', enabled: true },
      { name: 'AuditLogger', enabled: true },
      { name: 'SessionBridge', enabled: true, description: 'Track session' },
      { name: 'EvolutionBridge', enabled: true, description: 'Trace evolution' },
      { name: 'HookManager', enabled: true, description: 'onResponse hooks' },
    ],
  },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function MiddlewareBadge({ mw }: { mw: MiddlewareEntry }) {
  const meta = MIDDLEWARE_META[mw.name];
  const Icon = meta?.icon || Activity;
  const desc = mw.description || meta?.description || mw.name;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium cursor-default transition-colors ${
            mw.enabled
              ? 'bg-green-100 text-green-800 border border-green-200'
              : 'bg-gray-100 text-gray-500 border border-gray-200'
          }`}
        >
          <Icon className="h-3 w-3" />
          {mw.name}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p className="font-medium">{mw.name}</p>
        <p className="text-xs text-muted-foreground mt-1">{desc}</p>
        <p className="text-xs mt-1">
          {mw.enabled ? '● Enabled' : '○ Disabled'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function PhaseCard({ phase, enabledSet }: { phase: PipelinePhase; enabledSet: Set<string> }) {
  const isSystem = phase.id === 'router' || phase.id === 'provider';
  const mws = phase.middlewares.map((mw) => ({
    ...mw,
    enabled: enabledSet.has(mw.name) ? mw.enabled : false,
  }));

  return (
    <div className="flex items-center gap-3 shrink-0">
      <div
        className={`rounded-lg border p-3 min-w-[140px] ${
          isSystem
            ? 'bg-blue-50 border-blue-200'
            : 'bg-white border-gray-200'
        }`}
      >
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 text-center">
          {phase.label}
        </div>
        {isSystem ? (
          <div className="flex items-center justify-center h-8">
            <Badge variant="secondary" className="text-xs">
              {phase.id === 'router' ? 'Route' : 'LLM Call'}
            </Badge>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 justify-center">
            {mws.map((mw, i) => (
              <MiddlewareBadge key={`${mw.name}-${i}`} mw={mw} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineFlow({ phases, enabledSet }: { phases: PipelinePhase[]; enabledSet: Set<string> }) {
  const flowPhases = [
    { id: 'request', label: 'Request', middlewares: [] },
    ...phases,
    { id: 'response', label: 'Response', middlewares: [] },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {flowPhases.map((phase, i) => (
        <div key={phase.id} className="flex items-center gap-2 shrink-0">
          {(phase.id === 'request' || phase.id === 'response') ? (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-3 min-w-[90px] text-center">
              <span className="text-xs font-semibold text-gray-600 uppercase">
                {phase.label}
              </span>
            </div>
          ) : (
            <PhaseCard phase={phase} enabledSet={enabledSet} />
          )}
          {i < flowPhases.length - 1 && (
            <span className="text-gray-400 text-lg font-bold shrink-0">→</span>
          )}
        </div>
      ))}
    </div>
  );
}

function DetailCard({ mw, dashboardData }: { mw: MiddlewareEntry; dashboardData: any }) {
  const { t } = useTranslation();
  const meta = MIDDLEWARE_META[mw.name];
  const Icon = meta?.icon || Activity;
  const stats = mw.stats || {};
  const mid = dashboardData?.middleware?.find((m: any) => m.name === mw.name);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {mw.name}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch checked={mw.enabled} disabled />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {mid?.executions != null && (
          <div className="text-xs text-muted-foreground mb-2">
            {formatNumber(mid.executions)} {t('pipeline.executions', 'executions')}
          </div>
        )}
        <div className="space-y-1 text-xs text-muted-foreground">
          {mw.name === 'SemanticCache' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.hits', 'Hits')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.hits || dashboardData?.cache?.hits || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.misses', 'Misses')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.misses || dashboardData?.cache?.misses || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.hit_rate', 'Hit Rate')}</span>
                <span className="font-medium text-foreground">{(stats.hitRate || dashboardData?.cache?.hitRate || 0).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.entries', 'Entries')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.entryCount || 0)}</span>
              </div>
            </>
          )}
          {mw.name === 'MemoryBridge' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.memories_stored', 'Memories Stored')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.memoriesStored || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.sessions', 'Sessions')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.sessions || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.last_sync', 'Last Sync')}</span>
                <span className="font-medium text-foreground">{stats.lastSync || '-'}</span>
              </div>
            </>
          )}
          {mw.name === 'RAGEnricher' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.docs_indexed', 'Docs Indexed')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.documentsIndexed || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.queries_served', 'Queries Served')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.queriesServed || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.avg_enrichment', 'Avg Enrichment')}</span>
                <span className="font-medium text-foreground">{stats.avgEnrichmentTime || '-'}ms</span>
              </div>
            </>
          )}
          {mw.name === 'ContextCapture' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.captures', 'Captures')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.capturesCount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.storage_type', 'Storage')}</span>
                <span className="font-medium text-foreground">{stats.storageType || 'JSONL'}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.last_capture', 'Last Capture')}</span>
                <span className="font-medium text-foreground">{stats.lastCapture || '-'}</span>
              </div>
            </>
          )}
          {mw.name === 'ReasoningCache' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.chains_stored', 'Chains Stored')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.chainsStored || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.hints_served', 'Hints Served')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.hintsServed || 0)}</span>
              </div>
            </>
          )}
          {mw.name === 'SessionBridge' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.sessions_tracked', 'Sessions Tracked')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.sessionsTracked || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.compaction_events', 'Compactions')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.compactionEvents || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.contexts_preserved', 'Contexts Preserved')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.contextsPreserved || 0)}</span>
              </div>
            </>
          )}
          {mw.name === 'EvolutionBridge' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.skills_detected', 'Skills Detected')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.skillsDetected || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.traces_recorded', 'Traces Recorded')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.tracesRecorded || 0)}</span>
              </div>
            </>
          )}
          {mw.name === 'QualityScorer' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.avg_score', 'Avg Score')}</span>
                <span className="font-medium text-foreground">{(stats.avgScore || dashboardData?.quality?.avgScore || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.scores_count', 'Scores')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.scoresCount || 0)}</span>
              </div>
            </>
          )}
          {mw.name === 'AuditLogger' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.entries_logged', 'Entries Logged')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.entriesLogged || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.storage_size', 'Storage Size')}</span>
                <span className="font-medium text-foreground">{stats.storageSize || '-'}</span>
              </div>
            </>
          )}
          {mw.name === 'HookManager' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.hooks_registered', 'Hooks Registered')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.hooksRegistered || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.lifecycle_stages', 'Lifecycle Stages')}</span>
                <span className="font-medium text-foreground">{stats.lifecycleStages || '3'}</span>
              </div>
            </>
          )}
          {mw.name === 'RedisCache' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.l2_hit_rate', 'L2 Hit Rate')}</span>
                <span className="font-medium text-foreground">{(stats.hitRate || dashboardData?.cache?.l2HitRate || 0).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.keys_stored', 'Keys Stored')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.keysStored || 0)}</span>
              </div>
            </>
          )}
          {mw.name === 'PromptTemplate' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.templates_loaded', 'Templates Loaded')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.templatesLoaded || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('pipeline.variables_substituted', 'Variables Substituted')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.variablesSubstituted || 0)}</span>
              </div>
            </>
          )}
          {mw.name === 'ComplianceDisclaimer' && (
            <>
              <div className="flex justify-between">
                <span>{t('pipeline.disclaimers_injected', 'Disclaimers Injected')}</span>
                <span className="font-medium text-foreground">{formatNumber(stats.disclaimersInjected || 0)}</span>
              </div>
            </>
          )}
          {![
            'SemanticCache', 'MemoryBridge', 'RAGEnricher', 'ContextCapture',
            'ReasoningCache', 'SessionBridge', 'EvolutionBridge', 'QualityScorer',
            'AuditLogger', 'HookManager', 'RedisCache', 'PromptTemplate', 'ComplianceDisclaimer',
          ].includes(mw.name) && (
            <div className="text-muted-foreground">
              {meta?.description || mw.name}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function QualityPanel({ quality }: { quality: QualityData | undefined }) {
  const { t } = useTranslation();
  const scores = quality?.scores || [];
  const avg = quality?.avgScore ?? 0;
  const trend = quality?.trend;

  const buckets = Array.from({ length: 11 }, (_, i) => ({ score: i, count: 0 }));
  for (const s of scores) {
    const bucket = buckets.find((b) => b.score === Math.round(s.score));
    if (bucket) bucket.count += s.count;
  }
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          {t('pipeline.quality_distribution', 'Quality Score Distribution')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl font-bold">{avg.toFixed(2)}</span>
          <div className="flex items-center gap-1 text-sm">
            {trend === 'improving' && <TrendingUp className="h-4 w-4 text-green-500" />}
            {trend === 'declining' && <TrendingDown className="h-4 w-4 text-red-500" />}
            {trend === 'stable' && <Minus className="h-4 w-4 text-gray-500" />}
            <span className={
              trend === 'improving' ? 'text-green-600' :
              trend === 'declining' ? 'text-red-600' : 'text-gray-600'
            }>
              {trend === 'improving' ? t('pipeline.improving', 'Improving') :
               trend === 'declining' ? t('pipeline.declining', 'Declining') :
               t('pipeline.stable', 'Stable')}
            </span>
          </div>
        </div>
        <div className="flex items-end gap-1 h-24">
          {buckets.map((b) => (
            <div key={b.score} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full rounded-t transition-all duration-300 ${
                  b.score >= 8 ? 'bg-green-500' :
                  b.score >= 6 ? 'bg-blue-500' :
                  b.score >= 4 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ height: `${Math.max((b.count / maxCount) * 100, 2)}%` }}
                title={`${b.score}: ${b.count}`}
              />
              <span className="text-[10px] text-muted-foreground">{b.score}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FeedbackPanel({ feedback }: { feedback: FeedbackData | undefined }) {
  const { t } = useTranslation();
  const up = feedback?.thumbsUp ?? 0;
  const down = feedback?.thumbsDown ?? 0;
  const recent = feedback?.recent || [];

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          {t('pipeline.user_feedback', 'User Feedback')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <ThumbsUp className="h-5 w-5 text-green-500" />
            <span className="text-lg font-bold">{formatNumber(up)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ThumbsDown className="h-5 w-5 text-red-500" />
            <span className="text-lg font-bold">{formatNumber(down)}</span>
          </div>
        </div>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {recent.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              {t('pipeline.no_feedback', 'No feedback yet')}
            </div>
          ) : (
            recent.slice(0, 10).map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-xs border-b pb-1.5 last:border-0">
                {entry.rating === 'positive' || entry.rating === 'up' ? (
                  <ThumbsUp className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <ThumbsDown className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  {entry.comment && (
                    <p className="truncate text-foreground">{entry.comment}</p>
                  )}
                  <p className="text-muted-foreground">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '-'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ContextWindowPanel({ slidingWindow }: { slidingWindow: SlidingWindowData | undefined }) {
  const { t } = useTranslation();
  const sw = slidingWindow || {};
  const active = sw.activeTokens ?? 0;
  const max = sw.maxTokens ?? 1;
  const pct = Math.min((active / max) * 100, 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          {t('pipeline.context_window', 'Context Window Management')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">{t('pipeline.token_usage', 'Token Usage')}</span>
                <span className="font-medium">{formatNumber(active)} / {formatNumber(max)}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t('pipeline.summarizations', 'Summarizations')}: {sw.summarizationCount ?? 0}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded bg-gray-50">
              <div className="text-lg font-bold">{sw.activeSessions ?? 0}</div>
              <div className="text-xs text-muted-foreground">{t('pipeline.active_sessions', 'Active Sessions')}</div>
            </div>
            <div className="text-center p-2 rounded bg-gray-50">
              <div className="text-lg font-bold">{sw.avgMessagesPerSession ?? 0}</div>
              <div className="text-xs text-muted-foreground">{t('pipeline.avg_messages', 'Avg Msgs/Session')}</div>
            </div>
            <div className="text-center p-2 rounded bg-gray-50">
              <div className="text-lg font-bold">{sw.compactionEvents ?? 0}</div>
              <div className="text-xs text-muted-foreground">{t('pipeline.compaction_events', 'Compactions')}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Pipeline() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [auditData, setAuditData] = useState<any>(null);
  const [feedbackData, setFeedbackData] = useState<any>(null);
  const [slidingWindowData, setSlidingWindowData] = useState<SlidingWindowData | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [pipelineRes, dashRes, auditRes, feedbackRes, slidingRes] = await Promise.allSettled([
        api.getPipelineStatus(),
        api.getDashboardFull(),
        api.getAuditStats(),
        api.getFeedbackStats(),
        api.getSlidingWindowStatus(),
      ]);

      if (pipelineRes.status === 'fulfilled' && pipelineRes.value) {
        const raw = pipelineRes.value;
        const middlewareList: MiddlewareEntry[] = (raw?.middleware || raw || []).map((mw: any) => ({
          name: mw.name,
          enabled: mw.enabled ?? mw.active ?? true,
          description: mw.description,
          stats: mw.stats || {},
        }));
        const phases = raw?.phases || PHASES_DEFAULT;
        const enabledSet = new Set(middlewareList.filter((m) => m.enabled).map((m) => m.name));
        setPipelineData({ phases, middleware: middlewareList });
      }

      if (dashRes.status === 'fulfilled' && dashRes.value) {
        setDashboardData(dashRes.value);
      }

      if (auditRes.status === 'fulfilled' && auditRes.value) {
        setAuditData(auditRes.value);
      }

      if (feedbackRes.status === 'fulfilled' && feedbackRes.value) {
        setFeedbackData(feedbackRes.value);
      }

      if (slidingRes.status === 'fulfilled' && slidingRes.value) {
        setSlidingWindowData(slidingRes.value);
      }

      setError(null);
    } catch (err: any) {
      setError(err?.message || t('pipeline.fetch_error', 'Failed to fetch pipeline data'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const enabledSet = new Set(
    (pipelineData?.middleware || []).filter((m) => m.enabled).map((m) => m.name)
  );

  const uniqueMiddlewares = (pipelineData?.middleware || []).length > 0
    ? pipelineData!.middleware
    : Object.keys(MIDDLEWARE_META).map((name) => ({ name, enabled: true, stats: {} }));

  const quality: QualityData = {
    avgScore: dashboardData?.quality?.avgScore ?? auditData?.avgScore ?? undefined,
    distribution: dashboardData?.quality?.distribution,
    trend: auditData?.trend ?? 'stable',
    scores: auditData?.scores || [],
  };

  const feedback: FeedbackData = {
    thumbsUp: feedbackData?.thumbsUp ?? feedbackData?.positive ?? undefined,
    thumbsDown: feedbackData?.thumbsDown ?? feedbackData?.negative ?? undefined,
    recent: feedbackData?.recent || [],
  };

  return (
    <TooltipProvider>
      <div className="h-screen bg-gray-50 font-sans flex flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('pipeline.back', 'Back')}
            </Button>
            <h1 className="text-xl font-semibold text-gray-800">
              {t('pipeline.title', 'Middleware Pipeline')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={fetchData}>
                  <RefreshCw className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('pipeline.refresh', 'Refresh')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6">
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4 text-red-700 text-sm">
                {t('pipeline.error', 'Error')}: {error}
              </CardContent>
            </Card>
          )}

          {/* Section 1: Pipeline Flow */}
          {loading && !pipelineData ? (
            <SkeletonFlow />
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Workflow className="h-4 w-4" />
                  {t('pipeline.flow_title', 'Request Lifecycle')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PipelineFlow phases={pipelineData?.phases || PHASES_DEFAULT} enabledSet={enabledSet} />
              </CardContent>
            </Card>
          )}

          {/* Section 2: Middleware Detail Cards */}
          {loading && !pipelineData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </div>
          ) : (
            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                {t('pipeline.middleware_details', 'Middleware Details')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(uniqueMiddlewares || []).map((mw: any) => (
                  <DetailCard key={mw.name} mw={mw} dashboardData={dashboardData} />
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Quality & Feedback */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {loading && !dashboardData ? (
              <><SkeletonCard /><SkeletonCard /></>
            ) : (
              <>
                <QualityPanel quality={quality} />
                <FeedbackPanel feedback={feedback} />
              </>
            )}
          </div>

          {/* Section 4: Context Window */}
          {loading && !slidingWindowData ? (
            <SkeletonCard />
          ) : (
            <ContextWindowPanel slidingWindow={slidingWindowData || undefined} />
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
