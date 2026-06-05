import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import {
  ArrowLeft,
  RefreshCw,
  Server,
  Shield,
  Key,
  Gauge,
  Zap,
  Clock,
  CircleDot,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ProviderHealth {
  name: string;
  status: string;
  latency?: number;
  errorRate?: number;
  modelCount?: number;
  lastSuccess?: string;
  circuitBreaker?: {
    state: string;
    failures?: number;
    lastFailure?: string;
  };
}

interface KeyInfo {
  keyId: string;
  status: string;
  successCount?: number;
  failureCount?: number;
  lastUsed?: string;
  cooldownRemaining?: number;
}

interface KeyRotatorData {
  provider: string;
  keys: KeyInfo[];
}

interface RateLimiterData {
  currentRate?: number;
  limit?: number;
  totalRejected?: number;
  topIps?: Array<{
    ip: string;
    requestCount: number;
    lastRequest: string;
  }>;
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

function SkeletonTable({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 bg-muted rounded" />
      ))}
    </div>
  );
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '-';
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function maskKey(keyId: string): string {
  if (!keyId || keyId.length < 12) return keyId || '-';
  return keyId.slice(0, 4) + '***' + keyId.slice(-4);
}

function latencyColor(ms: number): string {
  if (ms < 500) return 'text-green-600';
  if (ms <= 2000) return 'text-yellow-600';
  return 'text-red-600';
}

function errorRateColor(rate: number): string {
  if (rate < 0.01) return 'text-green-600';
  if (rate <= 0.05) return 'text-yellow-600';
  return 'text-red-600';
}

function circuitBreakerBadge(state: string) {
  const normalized = state.toLowerCase();
  if (normalized === 'closed') return <Badge variant="default" className="text-xs">{state}</Badge>;
  if (normalized === 'open') return <Badge variant="destructive" className="text-xs">{state}</Badge>;
  return <Badge variant="secondary" className="text-xs">{state}</Badge>;
}

function healthDot(status: string) {
  const s = status.toLowerCase();
  const color = s === 'healthy' || s === 'up' ? 'bg-green-500' : s === 'degraded' ? 'bg-yellow-500' : 'bg-red-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${color} animate-pulse`} />;
}

export function ProviderMonitor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [keyRotators, setKeyRotators] = useState<KeyRotatorData[]>([]);
  const [rateLimiter, setRateLimiter] = useState<RateLimiterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; latency: number; message?: string }>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [cbRes, keyRes, rlRes] = await Promise.allSettled([
        api.getCircuitBreakers(),
        api.getKeyRotatorStatus(),
        api.getRateLimiterStatus(),
      ]);

      if (cbRes.status === 'fulfilled' && cbRes.value) {
        const raw = cbRes.value;
        if (Array.isArray(raw)) {
          setProviders(raw.map((p: any) => ({
            name: p.name || p.provider,
            status: p.status || p.health || 'unknown',
            latency: p.latency ?? p.avgLatency,
            errorRate: p.errorRate ?? p.error_rate,
            modelCount: p.modelCount ?? p.models?.length,
            lastSuccess: p.lastSuccess ?? p.last_success,
            circuitBreaker: p.circuitBreaker ?? p.circuit_breaker ?? { state: p.state || 'closed', failures: p.failures, lastFailure: p.lastFailure ?? p.last_failure },
          })));
        } else if (raw.providers && Array.isArray(raw.providers)) {
          setProviders(raw.providers.map((p: any) => ({
            name: p.name || p.provider,
            status: p.status || p.health || 'unknown',
            latency: p.latency ?? p.avgLatency,
            errorRate: p.errorRate ?? p.error_rate,
            modelCount: p.modelCount ?? p.models?.length,
            lastSuccess: p.lastSuccess ?? p.last_success,
            circuitBreaker: p.circuitBreaker ?? p.circuit_breaker ?? { state: p.state || 'closed', failures: p.failures, lastFailure: p.lastFailure ?? p.last_failure },
          })));
        }
      } else if (cbRes.status === 'rejected') {
        setError(cbRes.reason?.message || 'Failed to fetch provider data');
      }

      if (keyRes.status === 'fulfilled' && keyRes.value) {
        const raw = keyRes.value;
        if (Array.isArray(raw)) {
          setKeyRotators(raw.map((item: any) => ({
            provider: item.provider || item.name,
            keys: (item.keys || []).map((k: any) => ({
              keyId: k.keyId || k.key_id || k.id,
              status: k.status || 'unknown',
              successCount: k.successCount ?? k.success_count,
              failureCount: k.failureCount ?? k.failure_count,
              lastUsed: k.lastUsed ?? k.last_used,
              cooldownRemaining: k.cooldownRemaining ?? k.cooldown_remaining,
            })),
          })));
        } else if (raw.providers && Array.isArray(raw.providers)) {
          setKeyRotators(raw.providers.map((item: any) => ({
            provider: item.provider || item.name,
            keys: (item.keys || []).map((k: any) => ({
              keyId: k.keyId || k.key_id || k.id,
              status: k.status || 'unknown',
              successCount: k.successCount ?? k.success_count,
              failureCount: k.failureCount ?? k.failure_count,
              lastUsed: k.lastUsed ?? k.last_used,
              cooldownRemaining: k.cooldownRemaining ?? k.cooldown_remaining,
            })),
          })));
        }
      }

      if (rlRes.status === 'fulfilled' && rlRes.value) {
        setRateLimiter(rlRes.value);
      }

      setError(null);
    } catch (err: any) {
      setError(err?.message || t('provider_monitor.fetch_error', 'Failed to fetch data'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData, autoRefresh]);

  const testProvider = async (providerName: string) => {
    setTestingProvider(providerName);
    const start = Date.now();
    try {
      const res = await fetch('/health', {
        headers: (api as any).createHeaders ? {} : {},
      });
      const latency = Date.now() - start;
      setTestResults(prev => ({
        ...prev,
        [providerName]: { ok: res.ok, latency, message: res.ok ? undefined : `${res.status} ${res.statusText}` },
      }));
    } catch (err: any) {
      const latency = Date.now() - start;
      setTestResults(prev => ({
        ...prev,
        [providerName]: { ok: false, latency, message: err.message },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const rlCurrentRate = (rateLimiter as any)?.currentRate ?? (rateLimiter as any)?.current_rate ?? 0;
  const rlLimit = (rateLimiter as any)?.limit ?? (rateLimiter as any)?.max_rate ?? 1;
  const rlRejected = (rateLimiter as any)?.totalRejected ?? (rateLimiter as any)?.total_rejected ?? 0;
  const rlTopIps = (rateLimiter as any)?.topIps ?? (rateLimiter as any)?.top_ips ?? [];
  const rlPercent = rlLimit > 0 ? Math.min((rlCurrentRate / rlLimit) * 100, 100) : 0;

  return (
    <TooltipProvider>
      <div className="h-screen bg-gray-50 font-sans flex flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('provider_monitor.back', 'Back')}
            </Button>
            <h1 className="text-xl font-semibold text-gray-800">
              {t('provider_monitor.title', 'Provider Monitoring')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              {t('provider_monitor.auto_refresh', 'Auto-refresh')}
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={fetchData}>
                  <RefreshCw className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('provider_monitor.refresh', 'Refresh')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6">
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4 text-red-700 text-sm">
                {t('provider_monitor.error', 'Error')}: {error}
              </CardContent>
            </Card>
          )}

          {/* Section 1: Provider Health Grid */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Server className="h-5 w-5" />
              {t('provider_monitor.provider_health', 'Provider Health')}
            </h2>
            {loading && providers.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
              </div>
            ) : providers.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground text-center">
                  {t('provider_monitor.no_providers', 'No providers available')}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {providers.map(provider => (
                  <Card key={provider.name}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {healthDot(provider.status)}
                          <span className="font-semibold text-sm">{provider.name}</span>
                        </div>
                        {provider.modelCount != null && (
                          <Badge variant="outline" className="text-xs">
                            {provider.modelCount} {t('provider_monitor.models', 'models')}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">{t('provider_monitor.latency', 'Latency')}</span>
                          <div className={`font-medium ${provider.latency != null ? latencyColor(provider.latency) : ''}`}>
                            {provider.latency != null ? `${Math.round(provider.latency)}ms` : '-'}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('provider_monitor.error_rate', 'Error Rate')}</span>
                          <div className={`font-medium ${provider.errorRate != null ? errorRateColor(provider.errorRate) : ''}`}>
                            {provider.errorRate != null ? `${(provider.errorRate * 100).toFixed(1)}%` : '-'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                          {provider.circuitBreaker ? circuitBreakerBadge(provider.circuitBreaker.state) : circuitBreakerBadge('closed')}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(provider.lastSuccess)}
                        </div>
                      </div>

                      <div className="pt-1 border-t">
                        <div className="flex items-center justify-between">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            disabled={testingProvider === provider.name}
                            onClick={() => testProvider(provider.name)}
                          >
                            {testingProvider === provider.name ? (
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent mr-1" />
                            ) : (
                              <Zap className="h-3 w-3 mr-1" />
                            )}
                            {t('provider_monitor.test', 'Test')}
                          </Button>
                          {testResults[provider.name] && (
                            <div className="flex items-center gap-1 text-xs">
                              {testResults[provider.name].ok ? (
                                <Wifi className="h-3 w-3 text-green-500" />
                              ) : (
                                <WifiOff className="h-3 w-3 text-red-500" />
                              )}
                              <span className={testResults[provider.name].ok ? 'text-green-600' : 'text-red-600'}>
                                {testResults[provider.name].latency}ms
                              </span>
                              {testResults[provider.name].message && (
                                <span className="text-muted-foreground truncate max-w-[100px]">
                                  {testResults[provider.name].message}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Section 2: Key Rotator Status */}
          {keyRotators.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Key className="h-5 w-5" />
                {t('provider_monitor.key_rotator', 'Key Rotator Status')}
              </h2>
              {loading ? (
                <Card>
                  <CardContent className="p-4">
                    <SkeletonTable rows={3} />
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="px-4 py-3 font-medium">{t('provider_monitor.provider', 'Provider')}</th>
                            <th className="px-4 py-3 font-medium">{t('provider_monitor.key_id', 'Key ID')}</th>
                            <th className="px-4 py-3 font-medium">{t('provider_monitor.status', 'Status')}</th>
                            <th className="px-4 py-3 font-medium">{t('provider_monitor.success', 'Success')}</th>
                            <th className="px-4 py-3 font-medium">{t('provider_monitor.failure', 'Failure')}</th>
                            <th className="px-4 py-3 font-medium">{t('provider_monitor.last_used', 'Last Used')}</th>
                            <th className="px-4 py-3 font-medium">{t('provider_monitor.cooldown', 'Cooldown')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {keyRotators.flatMap(rotator =>
                            rotator.keys.map((key, ki) => (
                              <tr key={`${rotator.provider}-${ki}`} className="border-b last:border-0">
                                <td className="px-4 py-2 font-medium">{rotator.provider}</td>
                                <td className="px-4 py-2 font-mono text-xs">{maskKey(key.keyId)}</td>
                                <td className="px-4 py-2">
                                  <Badge
                                    variant={
                                      key.status === 'healthy' ? 'default' :
                                      key.status === 'failed' ? 'destructive' : 'secondary'
                                    }
                                    className="text-xs"
                                  >
                                    {key.status}
                                  </Badge>
                                </td>
                                <td className="px-4 py-2 text-green-600">{key.successCount ?? '-'}</td>
                                <td className="px-4 py-2 text-red-600">{key.failureCount ?? '-'}</td>
                                <td className="px-4 py-2 text-muted-foreground">{formatRelativeTime(key.lastUsed)}</td>
                                <td className="px-4 py-2">
                                  {key.cooldownRemaining != null && key.cooldownRemaining > 0 ? (
                                    <span className="text-yellow-600">{Math.round(key.cooldownRemaining)}s</span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>
          )}

          {/* Section 3: Rate Limiter */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              {t('provider_monitor.rate_limiter', 'Rate Limiter')}
            </h2>
            {loading && !rateLimiter ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">
                        {t('provider_monitor.current_rate', 'Current Rate')}
                      </span>
                      <Gauge className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold">
                      {rlCurrentRate} <span className="text-sm font-normal text-muted-foreground">/ {rlLimit}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${rlPercent > 80 ? 'bg-red-500' : rlPercent > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${rlPercent}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">
                        {t('provider_monitor.total_rejected', 'Total Rejected')}
                      </span>
                      <Shield className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold text-red-600">
                      {rlRejected.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">
                        {t('provider_monitor.utilization', 'Utilization')}
                      </span>
                      <CircleDot className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold">
                      {rlPercent.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {rlTopIps.length > 0 && (
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {t('provider_monitor.top_ips', 'Top IPs')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="px-4 py-2 font-medium">IP</th>
                          <th className="px-4 py-2 font-medium">{t('provider_monitor.request_count', 'Requests')}</th>
                          <th className="px-4 py-2 font-medium">{t('provider_monitor.last_request', 'Last Request')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rlTopIps.slice(0, 10).map((entry: any, i: number) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-4 py-2 font-mono text-xs">{entry.ip}</td>
                            <td className="px-4 py-2">{entry.requestCount?.toLocaleString()}</td>
                            <td className="px-4 py-2 text-muted-foreground">{formatRelativeTime(entry.lastRequest)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </main>
      </div>
    </TooltipProvider>
  );
}
