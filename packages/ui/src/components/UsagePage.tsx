import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { Calendar, Download, Trash2, RefreshCw, TrendingUp, Zap, Clock, AlertCircle, Layers, Timer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Toast } from '@/components/ui/toast';

// Format functions
function formatTokens(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

// Import new components
import { DateSidebar } from '@/components/usage/DateSidebar';
import { StatsTable } from '@/components/usage/StatsTable';
import { PerformanceChart } from '@/components/usage/PerformanceChart';
import { HourlyTable } from '@/components/usage/HourlyTable';
import { RecordsTable } from '@/components/usage/RecordsTable';

// Types
interface UsageSummary {
  startDate: string;
  endDate: string;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalReasoningTokens: number;
  avgLatency?: number;
  avgSpeed?: number;
  cacheHitRatio?: number;
  byProvider?: ProviderStats[];
  byModel?: ModelStats[];
  byDate?: DailyUsageSummary[];
}

interface ProviderStats {
  provider: string;
  requests: number;
  successRequests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  avgLatency?: number;
  avgSpeed?: number;
  models: ModelStats[];
}

interface ModelStats {
  model: string;
  provider: string;
  requests: number;
  successRequests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  avgLatency?: number;
  avgSpeed?: number;
}

interface DailyUsageSummary {
  date: string;
  provider: string;
  model: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  avgLatency?: number;
  avgSpeed?: number;
  hourlyBreakdown: HourlyBreakdown[];
}

interface HourlyBreakdown {
  hour: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  reasoningTokens?: number;
  avgLatency?: number;
  avgSpeed?: number;
}

interface UsageFilters {
  providers: string[];
  models: string[];
  dateRange: { startDate: string; endDate: string } | null;
}

interface UsageRecord {
  id: string;
  timestamp: string;
  date: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  duration?: number;
  timeToFirstToken?: number;
  success: boolean;
  errorMessage?: string;
  reasoningTokens?: number;
}

interface HourlyData {
  hour: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  avgLatency?: number;
  avgSpeed?: number;
  reasoningTokens?: number;
}

interface PerformanceData {
  timestamp: string;
  date: string;
  provider: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  avgLatency?: number;
  avgTimeToFirstToken?: number;
  avgSpeed?: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function UsagePage() {
  const { t } = useTranslation();

  // Plugin status state
  const [pluginEnabled, setPluginEnabled] = useState<boolean>(true);
  const [pluginChecked, setPluginChecked] = useState<boolean>(false);

  // State
  const [startDate, setStartDate] = useState<string>('');
  const [provider, setProvider] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [filters, setFilters] = useState<UsageFilters | null>(null);
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([]);
  const [dateHistory, setDateHistory] = useState<{ date: string; requests: number; tokens: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Auto-refresh state
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0); // 0 = off
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Cleanup dialog state
  const [isCleanupDialogOpen, setIsCleanupDialogOpen] = useState(false);
  const [cleanupRetentionDays, setCleanupRetentionDays] = useState(90);
  const [cleanupDryRun, setCleanupDryRun] = useState(true);
  const [cleanupResult, setCleanupResult] = useState<any>(null);

  // Fetch filters and date history on mount
  useEffect(() => {
    const checkPluginAndFetchData = async () => {
      try {
        // Check plugin status first
        const status = await api.getPluginsStatus();
        const usagePlugin = status.plugins.find(p => p.name === 'usage-tracking');
        // If plugin is not found in the list, it means it's disabled
        const isEnabled = usagePlugin ? usagePlugin.enabled : false;

        setPluginEnabled(isEnabled);
        setPluginChecked(true);

        if (!isEnabled) {
          setIsLoading(false);
          return;
        }

        // Fetch initial data if plugin is enabled
        const [filtersData, dateRangeData] = await Promise.all([
          api.getUsageFilters(),
          api.getUsageDaily({ startDate: '2000-01-01', endDate: '2099-12-31' }),
        ]);
        setFilters(filtersData);

        // Build date history
        const history = dateRangeData.data.map((d: any) => ({
          date: d.date,
          requests: d.requests,
          tokens: d.totalTokens,
        })).sort((a: any, b: any) => b.date.localeCompare(a.date));

        // Always include today's date even if no data exists yet
        const todayDate = new Date();
        const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
        if (!history.find((d: any) => d.date === today)) {
          history.unshift({ date: today, requests: 0, tokens: 0 });
        }

        setDateHistory(history);
        setStartDate(today);
      } catch (error) {
        console.error('Failed to check plugin or fetch initial data:', error);
        // On error, assume plugin is enabled but show error
        setPluginEnabled(true);
        setPluginChecked(true);
      }
    };

    checkPluginAndFetchData();
  }, []);

  // Fetch usage data
  const fetchUsage = useCallback(async () => {
    if (!startDate) return;

    setIsLoading(true);
    try {
      const [summaryData, recordsData, hourlyResponse, performanceResponse] = await Promise.all([
        api.getUsageSummary({ startDate, endDate: startDate, provider: provider && provider !== 'all' ? provider : undefined, model: model && model !== 'all' ? model : undefined }),
        api.getUsageRecords({ startDate, endDate: startDate, provider: provider && provider !== 'all' ? provider : undefined, model: model && model !== 'all' ? model : undefined, limit: pageSize, offset: (page - 1) * pageSize }),
        api.getUsageHourly({ startDate, endDate: startDate, provider: provider && provider !== 'all' ? provider : undefined, model: model && model !== 'all' ? model : undefined }),
        api.getUsagePerformance({ startDate, endDate: startDate, groupBy: 'hour', provider: provider && provider !== 'all' ? provider : undefined, model: model && model !== 'all' ? model : undefined }),
      ]);

      setSummary(summaryData);
      setRecords(recordsData.records);
      setRecordsTotal(recordsData.pagination.total);
      setHourlyData(hourlyResponse.data);
      setPerformanceData(performanceResponse.data);
    } catch (error) {
      console.error('Failed to fetch usage:', error);
      setToast({ message: t('usage.load_failed'), type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [startDate, provider, model, page, pageSize, t]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;

    const intervalId = setInterval(() => {
      setIsRefreshing(true);
      fetchUsage().finally(() => setIsRefreshing(false));
    }, autoRefreshInterval * 1000);

    return () => clearInterval(intervalId);
  }, [autoRefreshInterval, fetchUsage]);

  // Export handler
  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const content = await api.exportUsage({
        format,
        startDate,
        endDate: startDate,
        provider: provider && provider !== 'all' ? provider : undefined,
        model: model && model !== 'all' ? model : undefined,
      });

      // Download file
      const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `usage-export-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setToast({ message: t('usage.export_success'), type: 'success' });
    } catch (error) {
      console.error('Failed to export:', error);
      setToast({ message: t('usage.export_failed'), type: 'error' });
    }
  };

  // Cleanup handler
  const handleCleanup = async () => {
    try {
      const result = await api.cleanupUsage({
        retentionDays: cleanupRetentionDays,
        dryRun: cleanupDryRun,
      });

      setCleanupResult(result);

      if (!cleanupDryRun && result.success) {
        setToast({ message: t('usage.cleanup_success', { count: result.deletedCount }), type: 'success' });
        setIsCleanupDialogOpen(false);
        fetchUsage();
      }
    } catch (error) {
      console.error('Failed to cleanup:', error);
      setToast({ message: t('usage.cleanup_failed'), type: 'error' });
    }
  };

  // Date selection from sidebar
  const handleDateSelect = (date: string) => {
    setStartDate(date);
    setProvider('');
    setModel('');
    setPage(1);
  };

  // Prepare stats data for table
  const statsData = useMemo(() => {
    if (!summary?.byModel) return [];
    return summary.byModel.map(m => ({
      provider: m.provider,
      model: Array.isArray(m.model) ? m.model.join(', ') : m.model,
      requests: m.requests,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cacheCreationTokens: m.cacheCreationTokens,
      cacheReadTokens: m.cacheReadTokens,
      avgLatency: m.avgLatency,
      avgSpeed: m.avgSpeed,
      reasoningTokens: m.reasoningTokens,
    }));
  }, [summary]);

  const totalTokens = (summary?.totalInputTokens || 0) + (summary?.totalOutputTokens || 0);

  // Available providers for the selected date (from summary data)
  const availableProviders = useMemo(() => {
    if (summary?.byProvider) {
      return summary.byProvider.map(p => p.provider);
    }
    return filters?.providers || [];
  }, [summary, filters]);

  // Filter models based on selected provider, using date-filtered summary data
  const filteredModels = useMemo(() => {
    if (!provider || provider === 'all') {
      // When no provider selected, use all models from summary for this date
      if (summary?.byModel) {
        const models = summary.byModel.map(m => Array.isArray(m.model) ? m.model.join(', ') : m.model);
        return Array.from(new Set(models));
      }
      return filters?.models || [];
    }

    // Get models for the selected provider from summary data
    const providerData = summary?.byProvider?.find(p => p.provider === provider);
    if (providerData?.models) {
      const models = providerData.models.map(m => Array.isArray(m.model) ? m.model.join(', ') : m.model);
      return Array.from(new Set(models));
    }

    // Fallback to filters
    return filters?.models || [];
  }, [filters, provider, summary]);

  // Show loading state while checking plugin
  if (!pluginChecked) {
    return (
      <div className="h-screen bg-gray-50 font-sans flex items-center justify-center">
        <div className="text-gray-500">{t('usage.loading')}</div>
      </div>
    );
  }

  // Show disabled state if plugin is not enabled
  if (!pluginEnabled) {
    return (
      <div className="h-screen bg-gray-50 font-sans flex flex-col items-center justify-center space-y-6 p-8">
        <AlertCircle className="h-16 w-16 text-muted-foreground" />
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">{t('usage.disabled_title')}</h2>
          <p className="text-muted-foreground max-w-md">
            {t('usage.disabled_description')}
          </p>
        </div>
        <div className="bg-muted p-6 rounded-lg max-w-lg">
          <p className="text-sm font-medium mb-2">{t('usage.config_example')}</p>
          <pre className="text-xs bg-background p-4 rounded overflow-x-auto">
{`{
  "Plugins": [{
    "name": "usage-tracking",
    "enabled": true,
    "options": { "retentionDays": 90 }
  }]
}`}
          </pre>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('usage.restart_hint')}
        </p>
      </div>
    );
  }

  if (isLoading && !summary) {
    return (
      <div className="h-screen bg-gray-50 font-sans flex items-center justify-center">
        <div className="text-gray-500">{t('usage.loading')}</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 font-sans flex">
      {/* Left Sidebar - Date History */}
      <DateSidebar
        dates={dateHistory}
        selectedDate={startDate}
        onSelect={handleDateSelect}
        onSelectToday={() => {
          const todayDate = new Date();
          const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
          handleDateSelect(today);
        }}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b bg-white px-6">
          <h1 className="text-xl font-semibold text-gray-800">{t('usage.title')}</h1>
          <div className="flex items-center gap-2">
            {/* Auto-refresh selector */}
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <Select
                value={autoRefreshInterval.toString()}
                onValueChange={(v) => setAutoRefreshInterval(parseInt(v))}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder={t('usage.auto_refresh')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{t('usage.auto_refresh_off')}</SelectItem>
                  <SelectItem value="5">{t('usage.auto_refresh_5s')}</SelectItem>
                  <SelectItem value="10">{t('usage.auto_refresh_10s')}</SelectItem>
                  <SelectItem value="30">{t('usage.auto_refresh_30s')}</SelectItem>
                  <SelectItem value="60">{t('usage.auto_refresh_1m')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setIsRefreshing(true); fetchUsage().finally(() => setIsRefreshing(false)); }} disabled={isRefreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? t('usage.refreshing') : t('usage.refresh')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('json')}>
              <Download className="mr-2 h-4 w-4" />
              JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsCleanupDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('usage.cleanup')}
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          {/* Filters */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">{t('usage.filters')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 flex-wrap">
                <div className="space-y-2">
                  <Label>{t('usage.select_date')}</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setProvider('');
                      setModel('');
                      setPage(1);
                    }}
                    className="w-40"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('usage.provider')}</Label>
                  <Select value={provider} onValueChange={(v) => { setProvider(v); setPage(1); }}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder={t('usage.all_providers')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('usage.all_providers')}</SelectItem>
                      {availableProviders.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('usage.model')}</Label>
                  <Select value={model} onValueChange={(v) => { setModel(v); setPage(1); }}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder={t('usage.all_models')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('usage.all_models')}</SelectItem>
                      {filteredModels.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {summary && summary.totalRequests > 0 ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      {t('usage.total_requests')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(summary.totalRequests)}</div>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="default" className="text-xs">{summary.successRequests} {t('usage.success')}</Badge>
                      {summary.failedRequests > 0 && (
                        <Badge variant="destructive" className="text-xs">{summary.failedRequests} {t('usage.failed')}</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      {t('usage.consumed_tokens')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatTokens(totalTokens)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t('usage.input')}: {formatTokens(summary.totalInputTokens)} · {t('usage.output')}: {formatTokens(summary.totalOutputTokens)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {t('usage.avg_latency')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {summary.avgLatency ? (summary.avgLatency >= 1000 ? `${(summary.avgLatency / 1000).toFixed(2)}s` : `${Math.round(summary.avgLatency)}ms`) : '-'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t('usage.avg_speed')}: {summary.avgSpeed ? formatTokens(summary.avgSpeed) : '-'}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      {t('usage.cache_hit_ratio')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {summary.cacheHitRatio ? `${(summary.cacheHitRatio * 100).toFixed(1)}%` : '-'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatTokens(summary.totalCacheReadTokens)} / {formatTokens(totalTokens)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Statistics Table */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    {t('usage.by_provider_model')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StatsTable
                    data={statsData}
                    groupBy="provider"
                    loading={isLoading}
                  />
                </CardContent>
              </Card>

              {/* Performance Chart */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    {t('usage.performance_chart')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PerformanceChart
                    data={performanceData}
                    providers={availableProviders}
                    loading={isLoading}
                  />
                </CardContent>
              </Card>

              {/* Hourly Breakdown */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {t('usage.hourly_breakdown')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <HourlyTable
                    data={hourlyData}
                    detailedData={summary?.byDate?.flatMap(daily =>
                      daily.hourlyBreakdown.map(hourly => ({
                        hour: hourly.hour,
                        requests: hourly.requests,
                        inputTokens: hourly.inputTokens,
                        outputTokens: hourly.outputTokens,
                        cacheCreationTokens: hourly.cacheCreationTokens,
                        cacheReadTokens: hourly.cacheReadTokens,
                        provider: daily.provider,
                        model: Array.isArray(daily.model) ? daily.model.join(', ') : daily.model,
                        avgLatency: hourly.avgLatency,
                        avgSpeed: hourly.avgSpeed,
                        reasoningTokens: hourly.reasoningTokens,
                      }))
                    )}
                    loading={isLoading}
                    pageFilter={model && model !== 'all' ? 'model' : provider && provider !== 'all' ? 'provider' : 'none'}
                  />
                </CardContent>
              </Card>

              {/* Records Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Layers className="h-5 w-5" />
                    {t('usage.request_records')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RecordsTable
                    records={records}
                    total={recordsTotal}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                    loading={isLoading}
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-500 text-lg">{t('usage.no_data')}</p>
                <p className="text-gray-400 text-sm">{t('usage.no_data_hint')}</p>
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      {/* Cleanup Dialog */}
      <Dialog open={isCleanupDialogOpen} onOpenChange={setIsCleanupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('usage.cleanup_title')}</DialogTitle>
            <DialogDescription>{t('usage.cleanup_description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('usage.retention_days')}</Label>
              <Input
                type="number"
                value={cleanupRetentionDays}
                onChange={(e) => setCleanupRetentionDays(parseInt(e.target.value) || 90)}
              />
              <p className="text-sm text-muted-foreground">{t('usage.retention_days_hint')}</p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="dryRun"
                checked={cleanupDryRun}
                onChange={(e) => setCleanupDryRun(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="dryRun">{t('usage.dry_run')}</Label>
            </div>

            {cleanupResult && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="font-medium mb-2">
                  {cleanupDryRun ? t('usage.dry_run_result') : t('usage.cleanup_result')}
                </p>
                <p>{t('usage.records_deleted', { count: cleanupResult.deletedCount })}</p>
                <p>{t('usage.space_freed', { size: formatBytes(cleanupResult.freedBytes) })}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCleanupDialogOpen(false)}>
              {t('usage.cancel')}
            </Button>
            <Button onClick={handleCleanup}>
              {cleanupDryRun ? t('usage.preview') : t('usage.delete')}
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
  );
}
