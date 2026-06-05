import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Toast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import {
  ArrowLeft,
  RefreshCw,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  BarChart3,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Download,
  Gauge,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Period = 'today' | 'week' | 'month' | 'all';

interface BudgetData {
  totalSpent?: number;
  budgetLimit?: number;
  remaining?: number;
  costPerToken?: number;
  trend?: number;
  providers?: Array<{
    name: string;
    cost: number;
    color?: string;
  }>;
  models?: Array<{
    name: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    percentage: number;
  }>;
  dailySpending?: Array<{
    date: string;
    cost: number;
  }>;
  softLimit?: { limit: number; used: number; approaching: boolean };
  hardLimit?: { limit: number; used: number; exceeded: boolean };
  sessions?: Array<{
    id: string;
    cost: number;
    tokens: number;
    startedAt: string;
  }>;
  users?: Array<{
    userId: string;
    cost: number;
    tokens: number;
    requestCount: number;
  }>;
  rateLimiter?: {
    currentRate: number;
    limit: number;
    rejected: number;
    topIPs?: Array<{ ip: string; requests: number }>;
  };
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

const providerColors = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-yellow-500', 'bg-red-500',
];

export function BudgetTracker() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.getBudgetStatus();
      if (res) setData(res);
    } catch {
      setToast({ message: t('budget.fetch_error', 'Failed to fetch budget data'), type: 'error' });
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

  const totalSpent = data?.totalSpent ?? 0;
  const budgetLimit = data?.budgetLimit ?? 0;
  const remaining = budgetLimit > 0 ? Math.max(0, budgetLimit - totalSpent) : 0;
  const remainingPct = budgetLimit > 0 ? Math.min(100, (remaining / budgetLimit) * 100) : 100;
  const costPer1k = data?.costPerToken ? data.costPerToken * 1000 : 0;
  const trend = data?.trend ?? 0;

  const dailySpending = data?.dailySpending || [];
  const maxDaily = Math.max(...dailySpending.map(d => d.cost), 0.01);
  const totalProviderCost = (data?.providers || []).reduce((s, p) => s + p.cost, 0) || 1;

  const exportCSV = () => {
    if (!data) return;
    const rows = [['Model', 'Input Tokens', 'Output Tokens', 'Cost', 'Percentage']];
    (data.models || []).forEach(m => {
      rows.push([m.name, String(m.inputTokens), String(m.outputTokens), m.cost.toFixed(4), m.percentage.toFixed(1) + '%']);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ message: t('budget.exported', 'CSV exported'), type: 'success' });
  };

  const budgetColor = remainingPct > 50 ? 'text-green-600' : remainingPct > 20 ? 'text-yellow-600' : 'text-red-600';
  const barColor = remainingPct > 50 ? 'bg-green-500' : remainingPct > 20 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <TooltipProvider>
      <div className="h-screen bg-gray-50 font-sans flex flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('budget.back', 'Back')}
            </Button>
            <h1 className="text-xl font-semibold text-gray-800">
              {t('budget.title', 'Budget & Cost Tracker')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-md overflow-hidden">
              {(['today', 'week', 'month', 'all'] as Period[]).map(p => (
                <Button
                  key={p}
                  variant={period === p ? 'default' : 'ghost'}
                  size="sm"
                  className="rounded-none h-8 text-xs px-3"
                  onClick={() => setPeriod(p)}
                >
                  {p === 'today' ? t('budget.today', 'Today') :
                   p === 'week' ? t('budget.week', 'Week') :
                   p === 'month' ? t('budget.month', 'Month') :
                   t('budget.all_time', 'All Time')}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-2" />
              {t('budget.export_csv', 'Export CSV')}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={fetchData}>
                  <RefreshCw className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('budget.refresh', 'Refresh')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6">
          {loading && !data ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
            </div>
          ) : (
            <>
              {/* Row 1: 4 stat cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t('budget.total_spent', 'Total Spent')}
                      </span>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="mt-2 text-2xl font-bold">{formatCost(totalSpent)}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs">
                      {trend >= 0 ? (
                        <TrendingUp className="h-3 w-3 text-red-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-green-500" />
                      )}
                      <span className={trend >= 0 ? 'text-red-600' : 'text-green-600'}>
                        {Math.abs(trend).toFixed(1)}%
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t('budget.budget_limit', 'Budget Limit')}
                      </span>
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="mt-2 text-2xl font-bold">
                      {budgetLimit > 0 ? formatCost(budgetLimit) : t('budget.not_set', 'Not set')}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {budgetLimit > 0
                        ? `${t('budget.remaining', 'Remaining')}: ${formatCost(remaining)}`
                        : t('budget.configure_in_settings', 'Configure in settings')}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t('budget.remaining_pct', 'Remaining')}
                      </span>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="mt-2 text-2xl font-bold">
                      <span className={budgetColor}>{remainingPct.toFixed(1)}%</span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${remainingPct}%` }} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t('budget.cost_per_1k', 'Cost per 1K Tokens')}
                      </span>
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="mt-2 text-2xl font-bold">{formatCost(costPer1k)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t('budget.average', 'Average')}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Row 2: Cost by Provider + Cost by Model */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      {t('budget.cost_by_provider', 'Cost by Provider')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(!data?.providers || data.providers.length === 0) ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        {t('budget.no_data', 'No data available')}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {data.providers.map((p, i) => (
                          <div key={p.name} className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-24 truncate" title={p.name}>{p.name}</span>
                            <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                              <div
                                className={`h-full ${p.color || providerColors[i % providerColors.length]} rounded transition-all duration-500`}
                                style={{ width: `${(p.cost / totalProviderCost) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium w-20 text-right">{formatCost(p.cost)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      {t('budget.cost_by_model', 'Cost by Model')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(!data?.models || data.models.length === 0) ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        {t('budget.no_data', 'No data available')}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="pb-2 font-medium">{t('budget.model', 'Model')}</th>
                              <th className="pb-2 font-medium">{t('budget.in_out', 'In / Out')}</th>
                              <th className="pb-2 font-medium">{t('budget.cost', 'Cost')}</th>
                              <th className="pb-2 font-medium">{t('budget.pct', '%')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.models.map((m) => (
                              <tr key={m.name} className="border-b last:border-0">
                                <td className="py-2 font-medium truncate max-w-[140px]">{m.name}</td>
                                <td className="py-2 text-xs text-muted-foreground">
                                  {formatNumber(m.inputTokens)} / {formatNumber(m.outputTokens)}
                                </td>
                                <td className="py-2">{formatCost(m.cost)}</td>
                                <td className="py-2">{m.percentage.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Row 3: Spending Timeline */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {t('budget.spending_timeline', 'Spending Timeline (Last 7 Days)')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dailySpending.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4 text-center">
                      {t('budget.no_data', 'No data available')}
                    </div>
                  ) : (
                    <div className="flex items-end gap-2 h-32">
                      {dailySpending.slice(-7).map((d, i) => (
                        <Tooltip key={i}>
                          <TooltipTrigger asChild>
                            <div className="flex-1 flex flex-col items-center gap-1 cursor-pointer">
                              <div
                                className="w-full bg-blue-500/70 rounded-t hover:bg-blue-600 transition-colors"
                                style={{ height: `${Math.max((d.cost / maxDaily) * 120, 4)}px` }}
                              />
                              <span className="text-[10px] text-muted-foreground">{d.date.slice(-5)}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{d.date}: {formatCost(d.cost)}</p>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Row 4: Budget Alerts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {t('budget.budget_alerts', 'Budget Alerts')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{t('budget.soft_limit', 'Soft Limit')}</span>
                        {data?.softLimit?.approaching ? (
                          <Badge variant="secondary" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1 text-yellow-500" />
                            {t('budget.approaching', 'Approaching')} ({formatCost(data.softLimit.used)} / {formatCost(data.softLimit.limit)})
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-green-600">
                            {t('budget.ok', 'OK')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{t('budget.hard_limit', 'Hard Limit')}</span>
                        {data?.hardLimit?.exceeded ? (
                          <Badge variant="destructive" className="text-xs">
                            <ShieldAlert className="h-3 w-3 mr-1" />
                            {t('budget.exceeded', 'Exceeded')} ({formatCost(data.hardLimit.used)} / {formatCost(data.hardLimit.limit)})
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-green-600">
                            {t('budget.ok', 'OK')}
                          </Badge>
                        )}
                      </div>

                      {(data?.sessions && data.sessions.length > 0) && (
                        <div className="pt-3 border-t">
                          <div className="text-xs font-medium text-muted-foreground mb-2">
                            {t('budget.top_sessions', 'Top Sessions by Cost')}
                          </div>
                          <div className="space-y-1">
                            {data.sessions.slice(0, 10).map((s) => (
                              <div key={s.id} className="flex justify-between text-xs">
                                <span className="truncate max-w-[180px] text-muted-foreground font-mono">{s.id}</span>
                                <span className="font-medium">{formatCost(s.cost)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(data?.users && data.users.length > 0) && (
                        <div className="pt-3 border-t">
                          <div className="text-xs font-medium text-muted-foreground mb-2">
                            {t('budget.per_user', 'Per-User Spending')}
                          </div>
                          <div className="space-y-1">
                            {data.users.map((u) => (
                              <div key={u.userId} className="flex justify-between text-xs">
                                <span className="truncate max-w-[180px] text-muted-foreground">{u.userId}</span>
                                <span className="font-medium">{formatCost(u.cost)} ({formatNumber(u.requestCount)} reqs)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Row 5: Rate Limiter Status */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Gauge className="h-4 w-4" />
                      {t('budget.rate_limiter', 'Rate Limiter Status')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(!data?.rateLimiter) ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        {t('budget.no_data', 'No data available')}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('budget.current_rate', 'Current Rate')}</span>
                          <span className="font-medium">{data.rateLimiter.currentRate} req/min</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('budget.limit', 'Limit')}</span>
                          <span className="font-medium">{data.rateLimiter.limit} req/min</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('budget.rejected', 'Rejected')}</span>
                          <span className="font-medium text-red-600">{formatNumber(data.rateLimiter.rejected)}</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden mt-1">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              (data.rateLimiter.currentRate / data.rateLimiter.limit) > 0.8 ? 'bg-red-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(100, (data.rateLimiter.currentRate / data.rateLimiter.limit) * 100)}%` }}
                          />
                        </div>

                        {(data.rateLimiter.topIPs && data.rateLimiter.topIPs.length > 0) && (
                          <div className="pt-3 border-t">
                            <div className="text-xs font-medium text-muted-foreground mb-2">
                              {t('budget.top_ips', 'Top IPs')}
                            </div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b text-left text-muted-foreground">
                                  <th className="pb-1 font-medium">{t('budget.ip', 'IP')}</th>
                                  <th className="pb-1 font-medium text-right">{t('budget.requests', 'Requests')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {data.rateLimiter.topIPs.map((ip) => (
                                  <tr key={ip.ip} className="border-b last:border-0">
                                    <td className="py-1 font-mono">{ip.ip}</td>
                                    <td className="py-1 text-right">{formatNumber(ip.requests)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </main>

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
