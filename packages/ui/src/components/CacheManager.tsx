import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Toast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import {
  ArrowLeft,
  RefreshCw,
  Database,
  Trash2,
  Flame,
  Search,
  Clock,
  Cpu,
  BarChart3,
  DollarSign,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CacheReport {
  totalEntries?: number;
  hits?: number;
  misses?: number;
  hitRate?: number;
  avgLookupTime?: number;
  embeddingModel?: string;
  similarityThreshold?: number;
  topQueries?: Array<{ query: string; hits: number }>;
  estimatedCostSaved?: number;
  l1HitRate?: number;
  l2HitRate?: number;
}

interface CumulativeStats {
  startDate?: string;
  endDate?: string;
  totalCachedRequests?: number;
  estimatedTokensSaved?: number;
  estimatedCostSaved?: number;
  dailySnapshots?: Array<{ date: string; cachedRequests: number }>;
}

interface EmbeddingStatus {
  model?: string;
  dimensions?: number;
  totalEmbeddings?: number;
  cacheSize?: number;
}

interface RedisCacheStatus {
  connected?: boolean;
  totalKeys?: number;
  memoryUsage?: string;
  hits?: number;
  misses?: number;
  hitRate?: number;
  defaultTTL?: number;
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

export function CacheManager() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [cacheReport, setCacheReport] = useState<CacheReport | null>(null);
  const [cumulativeStats, setCumulativeStats] = useState<CumulativeStats | null>(null);
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus | null>(null);
  const [redisStatus, setRedisStatus] = useState<RedisCacheStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'all' | 'l1' | 'l2'>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [reportRes, cumulativeRes, embeddingRes, redisRes] = await Promise.allSettled([
        api.getCacheReport(),
        api.getCumulativeCacheStats(),
        api.getEmbeddingStatus(),
        api.getRedisCacheStatus(),
      ]);

      if (reportRes.status === 'fulfilled' && reportRes.value) {
        setCacheReport(reportRes.value);
      }
      if (cumulativeRes.status === 'fulfilled' && cumulativeRes.value) {
        setCumulativeStats(cumulativeRes.value);
      }
      if (embeddingRes.status === 'fulfilled' && embeddingRes.value) {
        setEmbeddingStatus(embeddingRes.value);
      }
      if (redisRes.status === 'fulfilled' && redisRes.value) {
        setRedisStatus(redisRes.value);
      }
    } catch {
      setToast({ message: t('cache.fetch_error', 'Failed to fetch cache data'), type: 'error' });
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

  const handleClearCache = async (action: 'all' | 'l1' | 'l2') => {
    try {
      await api.clearCache();
      setToast({
        message: action === 'all'
          ? t('cache.all_cleared', 'All caches cleared')
          : action === 'l1'
          ? t('cache.l1_cleared', 'L1 cache cleared')
          : t('cache.l2_cleared', 'L2 cache cleared'),
        type: 'success',
      });
      fetchData();
    } catch {
      setToast({ message: t('cache.clear_failed', 'Failed to clear cache'), type: 'error' });
    }
    setConfirmOpen(false);
  };

  const openConfirm = (action: 'all' | 'l1' | 'l2') => {
    setConfirmAction(action);
    setConfirmOpen(true);
  };

  const l1HitRate = cacheReport?.l1HitRate ?? cacheReport?.hitRate ?? 0;
  const l2HitRate = cacheReport?.l2HitRate ?? redisStatus?.hitRate ?? 0;
  const totalSavings = cacheReport?.estimatedCostSaved ?? cumulativeStats?.estimatedCostSaved ?? 0;
  const dailySnapshots = cumulativeStats?.dailySnapshots || [];
  const maxDaily = Math.max(...dailySnapshots.map(d => d.cachedRequests), 1);

  return (
    <TooltipProvider>
      <div className="h-screen bg-gray-50 font-sans flex flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('cache.back', 'Back')}
            </Button>
            <h1 className="text-xl font-semibold text-gray-800">
              {t('cache.title', 'Cache Management')}
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
                <p>{t('cache.refresh', 'Refresh')}</p>
              </TooltipContent>
            </Tooltip>
            <Button variant="destructive" size="sm" onClick={() => openConfirm('all')}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('cache.clear_all', 'Clear All Caches')}
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6">
          {loading && !cacheReport ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </div>
          ) : (
            <>
              {/* Row 1: 3 stat cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-muted-foreground">
                        {t('cache.l1_hit_rate', 'L1 Cache Hit Rate')}
                      </span>
                      <Search className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-16 h-16 rounded-full shrink-0"
                        style={{
                          background: `conic-gradient(#4CAF50 ${l1HitRate}%, #e5e7eb ${l1HitRate}% 100%)`,
                        }}
                      />
                      <div className="text-3xl font-bold">{l1HitRate.toFixed(1)}%</div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {t('cache.semantic_cache', 'Semantic cache')}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-muted-foreground">
                        {t('cache.l2_hit_rate', 'L2 Cache Hit Rate')}
                      </span>
                      <Database className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-16 h-16 rounded-full shrink-0"
                        style={{
                          background: `conic-gradient(#2196F3 ${l2HitRate}%, #e5e7eb ${l2HitRate}% 100%)`,
                        }}
                      />
                      <div className="text-3xl font-bold">{l2HitRate.toFixed(1)}%</div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {t('cache.redis_exact', 'Redis exact match')}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-muted-foreground">
                        {t('cache.total_savings', 'Total Savings')}
                      </span>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold text-green-600">
                      ${totalSavings.toFixed(4)}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {t('cache.estimated_cost_saved', 'Estimated cost saved by cache hits')}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Row 2: Cache layers detail */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      {t('cache.l1_semantic', 'L1 Semantic Cache')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cache.total_entries', 'Total Entries')}</span>
                        <span className="font-medium">{formatNumber(cacheReport?.totalEntries ?? 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cache.hits_misses', 'Hits / Misses')}</span>
                        <span className="font-medium">
                          {formatNumber(cacheReport?.hits ?? 0)} / {formatNumber(cacheReport?.misses ?? 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cache.hit_rate', 'Hit Rate')}</span>
                        <span className="font-medium">{l1HitRate.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cache.avg_lookup', 'Avg Lookup Time')}</span>
                        <span className="font-medium">{(cacheReport?.avgLookupTime ?? 0).toFixed(1)}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cache.embedding_model', 'Embedding Model')}</span>
                        <span className="font-medium truncate max-w-[180px]">
                          {embeddingStatus?.model || cacheReport?.embeddingModel || '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cache.similarity_threshold', 'Similarity Threshold')}</span>
                        <span className="font-medium">{(cacheReport?.similarityThreshold ?? 0).toFixed(2)}</span>
                      </div>
                      {(cacheReport?.topQueries && cacheReport.topQueries.length > 0) && (
                        <div className="pt-2 border-t">
                          <div className="text-xs font-medium text-muted-foreground mb-2">
                            {t('cache.top_queries', 'Top Cached Queries')}
                          </div>
                          <div className="space-y-1">
                            {cacheReport.topQueries.slice(0, 5).map((q, i) => (
                              <div key={i} className="flex justify-between text-xs">
                                <span className="truncate max-w-[220px] text-muted-foreground" title={q.query}>
                                  {q.query}
                                </span>
                                <Badge variant="secondary" className="text-xs ml-2 shrink-0">
                                  {q.hits} {t('cache.hits', 'hits')}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      {t('cache.l2_redis', 'L2 Redis Cache')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cache.connected', 'Connected')}</span>
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className={`w-2 h-2 rounded-full ${redisStatus?.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                          {redisStatus?.connected ? t('cache.yes', 'Yes') : t('cache.no', 'No')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cache.total_keys', 'Total Keys')}</span>
                        <span className="font-medium">{formatNumber(redisStatus?.totalKeys ?? 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cache.memory_usage', 'Memory Usage')}</span>
                        <span className="font-medium">{redisStatus?.memoryUsage || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cache.hits_misses', 'Hits / Misses')}</span>
                        <span className="font-medium">
                          {formatNumber(redisStatus?.hits ?? 0)} / {formatNumber(redisStatus?.misses ?? 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cache.hit_rate', 'Hit Rate')}</span>
                        <span className="font-medium">{(redisStatus?.hitRate ?? 0).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cache.default_ttl', 'Default TTL')}</span>
                        <span className="font-medium">
                          {redisStatus?.defaultTTL ? `${Math.round(redisStatus.defaultTTL / 60)}min` : '-'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Row 3: Cache Actions */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    {t('cache.actions', 'Cache Actions')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => openConfirm('l1')}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('cache.clear_l1', 'Clear L1 Cache')}
                    </Button>
                    <Button variant="outline" onClick={() => openConfirm('l2')}>
                      <Database className="h-4 w-4 mr-2" />
                      {t('cache.clear_l2', 'Clear L2 Cache')}
                    </Button>
                    <Button variant="destructive" onClick={() => openConfirm('all')}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('cache.clear_all', 'Clear All')}
                    </Button>
                    <Button variant="outline" disabled>
                      <Flame className="h-4 w-4 mr-2" />
                      {t('cache.warm_cache', 'Warm Cache')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Row 4: Cumulative Stats */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    {t('cache.cumulative_stats', 'Cumulative Stats')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-muted-foreground">{t('cache.date_range', 'Date Range')}</div>
                      <div className="text-sm font-medium mt-1">
                        {cumulativeStats?.startDate && cumulativeStats?.endDate
                          ? `${cumulativeStats.startDate} — ${cumulativeStats.endDate}`
                          : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('cache.cached_requests', 'Cached Requests')}</div>
                      <div className="text-sm font-medium mt-1">
                        {formatNumber(cumulativeStats?.totalCachedRequests ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('cache.tokens_saved', 'Tokens Saved')}</div>
                      <div className="text-sm font-medium mt-1">
                        {formatNumber(cumulativeStats?.estimatedTokensSaved ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('cache.cost_saved', 'Cost Saved')}</div>
                      <div className="text-sm font-medium mt-1 text-green-600">
                        ${(cumulativeStats?.estimatedCostSaved ?? 0).toFixed(4)}
                      </div>
                    </div>
                  </div>
                  {dailySnapshots.length > 0 ? (
                    <div>
                      <div className="text-xs text-muted-foreground mb-2">
                        {t('cache.efficiency_trend', 'Cache Efficiency Trend')}
                      </div>
                      <div className="flex items-end gap-[3px] h-20">
                        {dailySnapshots.slice(-30).map((d, i) => (
                          <Tooltip key={i}>
                            <TooltipTrigger asChild>
                              <div
                                className="bg-emerald-500/70 rounded-t flex-1 min-w-[3px] hover:bg-emerald-600 transition-colors cursor-pointer"
                                style={{ height: `${Math.max((d.cachedRequests / maxDaily) * 100, 2)}%` }}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{d.date}: {formatNumber(d.cachedRequests)}</p>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground py-2">
                      {t('cache.no_trend_data', 'No trend data available')}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </main>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('cache.confirm_clear_title', 'Confirm Cache Clear')}</DialogTitle>
              <DialogDescription>
                {confirmAction === 'all'
                  ? t('cache.confirm_clear_all', 'Are you sure you want to clear all caches? This cannot be undone.')
                  : confirmAction === 'l1'
                  ? t('cache.confirm_clear_l1', 'Are you sure you want to clear the L1 semantic cache?')
                  : t('cache.confirm_clear_l2', 'Are you sure you want to clear the L2 Redis cache?')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                {t('cache.cancel', 'Cancel')}
              </Button>
              <Button variant="destructive" onClick={() => handleClearCache(confirmAction)}>
                {t('cache.confirm', 'Confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
