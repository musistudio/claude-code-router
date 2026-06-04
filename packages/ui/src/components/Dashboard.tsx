import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import {
  Activity,
  DollarSign,
  Clock,
  Zap,
  Database,
  BarChart3,
  Shield,
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  CircleDot,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DashboardData {
  requests?: { total?: number; success?: number; failed?: number; trend?: number };
  tokens?: { total?: number; input?: number; output?: number; trend?: number };
  cost?: { total?: number; trend?: number };
  latency?: { avg?: number; p50?: number; p99?: number; trend?: number };
  cache?: { hitRate?: number; l1HitRate?: number; l2HitRate?: number; hits?: number; misses?: number };
  circuitBreakers?: Array<{ name: string; state: string; failures?: number; lastFailure?: string }>;
  quality?: { avgScore?: number; distribution?: { excellent: number; good: number; fair: number; poor: number } };
  providers?: Array<{ name: string; status: string; latency?: number; errorRate?: number }>;
  middleware?: Array<{ name: string; active: boolean; executions?: number }>;
  models?: Array<{ name: string; tokens: number; color?: string }>;
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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function formatCost(n: number): string {
  return '$' + n.toFixed(4);
}

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, histRes] = await Promise.allSettled([
        api.getDashboardFull(),
        api.getMetricsHistory(),
      ]);

      if (dashRes.status === 'fulfilled' && dashRes.value) {
        setData(dashRes.value);
        setError(null);
      } else if (dashRes.status === 'rejected') {
        setError(dashRes.reason?.message || t('dashboard.fetch_error', 'Failed to fetch dashboard data'));
      }

      if (histRes.status === 'fulfilled' && histRes.value) {
        const snapshots = histRes.value?.snapshots || histRes.value || [];
        if (Array.isArray(snapshots)) {
          const counts = snapshots
            .slice(-60)
            .map((s: any) =>
              typeof s === 'number'
                ? s
                : s?.requests?.total || s?.requestCount || s?.count || 0
            );
          setHistory(counts);
        }
      }
    } catch (err: any) {
      setError(err?.message || t('dashboard.fetch_error', 'Failed to fetch dashboard data'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const maxHistory = Math.max(...history, 1);

  const modelColors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
    'bg-pink-500', 'bg-cyan-500', 'bg-yellow-500', 'bg-red-500',
  ];

  const totalModelTokens = (data?.models || []).reduce((sum, m) => sum + (m.tokens || 0), 0) || 1;

  return (
    <TooltipProvider>
      <div className="h-screen bg-gray-50 font-sans flex flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('dashboard.back', 'Back')}
            </Button>
            <h1 className="text-xl font-semibold text-gray-800">
              {t('dashboard.title', 'Monitoring')}
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
                <p>{t('dashboard.refresh', 'Refresh')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6">
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4 text-red-700 text-sm">
                {t('dashboard.error', 'Error')}: {error}
              </CardContent>
            </Card>
          )}

          {/* Row 1: Stat cards */}
          {loading && !data ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {t('dashboard.total_requests', 'Total Requests')}
                    </span>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNumber(data?.requests?.total || 0)}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    {(data?.requests?.trend ?? 0) >= 0 ? (
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    )}
                    <span className={(data?.requests?.trend ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {Math.abs(data?.requests?.trend ?? 0).toFixed(1)}%
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {t('dashboard.total_tokens', 'Total Tokens')}
                    </span>
                    <Zap className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNumber(data?.tokens?.total || 0)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t('dashboard.input', 'In')}: {formatNumber(data?.tokens?.input || 0)} / {t('dashboard.output', 'Out')}: {formatNumber(data?.tokens?.output || 0)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {t('dashboard.total_cost', 'Total Cost')}
                    </span>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatCost(data?.cost?.total || 0)}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    {(data?.cost?.trend ?? 0) >= 0 ? (
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    )}
                    <span className={(data?.cost?.trend ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {Math.abs(data?.cost?.trend ?? 0).toFixed(1)}%
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {t('dashboard.avg_latency', 'Avg Latency')}
                    </span>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {Math.round(data?.latency?.avg || 0)}ms
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    P50: {Math.round(data?.latency?.p50 || 0)}ms / P99: {Math.round(data?.latency?.p99 || 0)}ms
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Row 2: Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  {t('dashboard.request_volume', 'Request Volume')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <div className="h-28 flex items-center justify-center text-sm text-muted-foreground">
                    {t('dashboard.no_data', 'No data available')}
                  </div>
                ) : (
                  <div className="flex items-end gap-[2px] h-28">
                    {history.map((v, i) => (
                      <div
                        key={i}
                        className="bg-primary/80 rounded-t flex-1 min-w-[2px] transition-all duration-300"
                        style={{ height: `${Math.max((v / maxHistory) * 100, 2)}%` }}
                        title={`${v}`}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  {t('dashboard.token_breakdown', 'Token Usage by Model')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(!data?.models || data.models.length === 0) ? (
                  <div className="h-28 flex items-center justify-center text-sm text-muted-foreground">
                    {t('dashboard.no_data', 'No data available')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex rounded-md overflow-hidden h-6">
                      {data.models.map((m, i) => (
                        <div
                          key={m.name}
                          className={`${modelColors[i % modelColors.length]} transition-all duration-300`}
                          style={{ width: `${((m.tokens || 0) / totalModelTokens) * 100}%` }}
                          title={`${m.name}: ${formatNumber(m.tokens)}`}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {data.models.map((m, i) => (
                        <div key={m.name} className="flex items-center gap-1.5 text-xs">
                          <div className={`w-2.5 h-2.5 rounded-sm ${modelColors[i % modelColors.length]}`} />
                          <span className="text-muted-foreground truncate max-w-[120px]">{m.name}</span>
                          <span className="font-medium">{formatNumber(m.tokens)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 3: 3 cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  {t('dashboard.cache_hit_rate', 'Cache Hit Rate')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div
                    className="w-20 h-20 rounded-full shrink-0"
                    style={{
                      background: `conic-gradient(#4CAF50 ${data?.cache?.hitRate ?? 0}%, #FF5722 ${data?.cache?.hitRate ?? 0}% 100%)`,
                    }}
                  />
                  <div className="space-y-1 text-sm">
                    <div className="font-bold text-2xl">{(data?.cache?.hitRate ?? 0).toFixed(1)}%</div>
                    <div className="text-muted-foreground">
                      L1: {(data?.cache?.l1HitRate ?? 0).toFixed(1)}% / L2: {(data?.cache?.l2HitRate ?? 0).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('dashboard.hits', 'Hits')}: {formatNumber(data?.cache?.hits || 0)} / {t('dashboard.misses', 'Misses')}: {formatNumber(data?.cache?.misses || 0)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  {t('dashboard.circuit_breakers', 'Circuit Breakers')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(!data?.circuitBreakers || data.circuitBreakers.length === 0) ? (
                  <div className="text-sm text-muted-foreground py-2">
                    {t('dashboard.no_data', 'No data available')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.circuitBreakers.map((cb) => (
                      <div key={cb.name} className="flex items-center justify-between text-sm">
                        <span className="truncate max-w-[140px]">{cb.name}</span>
                        <Badge
                          variant={
                            cb.state === 'closed' ? 'default' :
                            cb.state === 'open' ? 'destructive' : 'secondary'
                          }
                          className="text-xs"
                        >
                          <CircleDot className="h-2.5 w-2.5 mr-1" />
                          {cb.state}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  {t('dashboard.quality_score', 'Quality Score')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-3">
                  {(data?.quality?.avgScore ?? 0).toFixed(2)}
                </div>
                {data?.quality?.distribution && (
                  <div className="space-y-2">
                    <div className="flex rounded-md overflow-hidden h-3">
                      <div
                        className="bg-green-500"
                        style={{ width: `${data.quality.distribution.excellent || 0}%` }}
                      />
                      <div
                        className="bg-blue-500"
                        style={{ width: `${data.quality.distribution.good || 0}%` }}
                      />
                      <div
                        className="bg-yellow-500"
                        style={{ width: `${data.quality.distribution.fair || 0}%` }}
                      />
                      <div
                        className="bg-red-500"
                        style={{ width: `${data.quality.distribution.poor || 0}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-xs text-muted-foreground">
                      <span>{t('dashboard.excellent', 'Excellent')}</span>
                      <span>{t('dashboard.good', 'Good')}</span>
                      <span>{t('dashboard.fair', 'Fair')}</span>
                      <span>{t('dashboard.poor', 'Poor')}</span>
                    </div>
                  </div>
                )}
                {!data?.quality?.distribution && (
                  <div className="text-sm text-muted-foreground">
                    {t('dashboard.no_data', 'No data available')}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 4: Provider Health & Middleware */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t('dashboard.provider_health', 'Provider Health')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(!data?.providers || data.providers.length === 0) ? (
                  <div className="text-sm text-muted-foreground py-2">
                    {t('dashboard.no_data', 'No data available')}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 font-medium">{t('dashboard.name', 'Name')}</th>
                          <th className="pb-2 font-medium">{t('dashboard.status', 'Status')}</th>
                          <th className="pb-2 font-medium">{t('dashboard.latency', 'Latency')}</th>
                          <th className="pb-2 font-medium">{t('dashboard.error_rate', 'Error Rate')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.providers.map((p) => (
                          <tr key={p.name} className="border-b last:border-0">
                            <td className="py-2 font-medium">{p.name}</td>
                            <td className="py-2">
                              <Badge
                                variant={
                                  p.status === 'healthy' || p.status === 'up' ? 'default' :
                                  p.status === 'degraded' ? 'secondary' : 'destructive'
                                }
                                className="text-xs"
                              >
                                {p.status}
                              </Badge>
                            </td>
                            <td className="py-2">{p.latency != null ? `${Math.round(p.latency)}ms` : '-'}</td>
                            <td className="py-2">{p.errorRate != null ? `${(p.errorRate * 100).toFixed(1)}%` : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t('dashboard.middleware_pipeline', 'Middleware Pipeline')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(!data?.middleware || data.middleware.length === 0) ? (
                  <div className="text-sm text-muted-foreground py-2">
                    {t('dashboard.no_data', 'No data available')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.middleware.map((mw, i) => (
                      <div key={mw.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-5 text-right">{i + 1}.</span>
                          <span>{mw.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {mw.executions != null && (
                            <span className="text-xs text-muted-foreground">
                              {formatNumber(mw.executions)} {t('dashboard.execs', 'execs')}
                            </span>
                          )}
                          <Badge variant={mw.active ? 'default' : 'outline'} className="text-xs">
                            {mw.active
                              ? t('dashboard.active', 'Active')
                              : t('dashboard.inactive', 'Inactive')
                            }
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
