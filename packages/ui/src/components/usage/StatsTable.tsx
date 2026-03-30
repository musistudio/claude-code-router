import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';

// Local format tokens function
function formatTokens(num?: number): string {
  if (num == null || isNaN(num)) return '-';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

interface StatsData {
  provider: string;
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  avgLatency?: number;
  avgSpeed?: number;
  reasoningTokens?: number;
}

interface StatsTableProps {
  data: StatsData[];
  groupBy: 'provider' | 'model';
  loading?: boolean;
}

type SortKey = keyof StatsData;
type SortOrder = 'asc' | 'desc';

export function StatsTable({ data, groupBy, loading }: StatsTableProps) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>('requests');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  // Aggregate data by provider if needed
  const aggregatedData = useMemo(() => {
    if (groupBy === 'model') return data;

    // Group by provider
    const providerMap = new Map<string, StatsData>();

    for (const item of data) {
      const existing = providerMap.get(item.provider);
      if (existing) {
        existing.requests += item.requests;
        existing.inputTokens += item.inputTokens;
        existing.outputTokens += item.outputTokens;
        existing.cacheCreationTokens += item.cacheCreationTokens;
        existing.cacheReadTokens += item.cacheReadTokens;
        existing.reasoningTokens = (existing.reasoningTokens || 0) + (item.reasoningTokens || 0);

        // Weighted average for latency and speed
        if (item.avgLatency && existing.avgLatency) {
          const totalWeight = existing.requests + item.requests;
          existing.avgLatency = Math.round(
            (existing.avgLatency * existing.requests + item.avgLatency * item.requests) / totalWeight
          );
        }
        if (item.avgSpeed && existing.avgSpeed) {
          const totalWeight = existing.requests + item.requests;
          existing.avgSpeed = Math.round(
            (existing.avgSpeed * existing.requests + item.avgSpeed * item.requests) / totalWeight
          );
        }
      } else {
        providerMap.set(item.provider, { ...item, model: '' });
      }
    }

    return Array.from(providerMap.values());
  }, [data, groupBy]);

  // Sort data
  const sortedData = useMemo(() => {
    return [...aggregatedData].sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [aggregatedData, sortKey, sortOrder]);

  // Get models for a provider
  const getProviderModels = (provider: string) => {
    return data.filter(d => d.provider === provider);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const toggleProvider = (provider: string) => {
    const newExpanded = new Set(expandedProviders);
    if (newExpanded.has(provider)) {
      newExpanded.delete(provider);
    } else {
      newExpanded.add(provider);
    }
    setExpandedProviders(newExpanded);
  };

  const formatCacheHit = (cacheRead: number) => {
    if (cacheRead === 0) return '-';
    return formatTokens(cacheRead);
  };

  const formatNewTokens = (input: number, output: number) => {
    const total = input + output;
    return formatTokens(total);
  };

  // totalTokens = inputTokens + outputTokens (cacheReadInputTokens is tracked separately)
  const formatTotalTokens = (input: number, output: number) => {
    const total = input + output;
    return formatTokens(total);
  };

  const formatLatency = (ms?: number) => {
    if (!ms) return '-';
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.round(ms)}ms`;
  };

  const formatSpeed = (speed?: number) => {
    if (!speed) return '-';
    if (speed >= 1000) return `${(speed / 1000).toFixed(1)}K/s`;
    return `${Math.round(speed)}/s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('usage.no_data')}
      </div>
    );
  }

  const SortHeader = ({ key, children, align = 'left' }: { key: SortKey; children: React.ReactNode; align?: 'left' | 'right' }) => (
    <th
      className={`p-3 text-${align} cursor-pointer hover:bg-muted/50 transition-colors whitespace-nowrap`}
      onClick={() => handleSort(key)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {children}
        <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
      </div>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <SortHeader key="provider">
              {groupBy === 'provider' ? t('usage.provider') : t('usage.provider_model')}
            </SortHeader>
            <SortHeader key="requests" align="right">{t('usage.request_count')}</SortHeader>
            <SortHeader key="inputTokens" align="right">{t('usage.input_tokens')}</SortHeader>
            <th className="p-3 text-right">{t('usage.cache_hit')}</th>
            <th className="p-3 text-right">{t('usage.reasoning')}</th>
            <SortHeader key="outputTokens" align="right">{t('usage.output_tokens')}</SortHeader>
            <th className="p-3 text-right">{t('usage.consumed_tokens')}</th>
            <SortHeader key="avgLatency" align="right">{t('usage.avg_latency')}</SortHeader>
            <SortHeader key="avgSpeed" align="right">{t('usage.avg_speed')}</SortHeader>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((item) => {
            const isExpanded = expandedProviders.has(item.provider);
            const models = getProviderModels(item.provider);
            const hasModels = models.length > 1;

            return (
              <>
                <tr
                  key={item.provider}
                  className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => hasModels && toggleProvider(item.provider)}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {hasModels && (
                        <span className="text-muted-foreground">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </span>
                      )}
                      <span className="font-medium">{item.provider}</span>
                      {hasModels && (
                        <span className="text-xs text-muted-foreground">
                          ({models.length} {t('usage.models')})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right">{item.requests.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono">{formatTokens(item.inputTokens)}</td>
                  <td className="p-3 text-right">
                    {formatCacheHit(item.cacheReadTokens)}
                  </td>
                  <td className="p-3 text-right">
                    <span className={(item.reasoningTokens ?? 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}>
                      {(item.reasoningTokens ?? 0) > 0 ? formatTokens(item.reasoningTokens!) : '-'}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono">{formatTokens(item.outputTokens)}</td>
                  <td className="p-3 text-right font-mono">{formatTotalTokens(item.inputTokens, item.outputTokens)}</td>
                  <td className="p-3 text-right">
                    <span className={item.avgLatency && item.avgLatency > 5000 ? 'text-red-500' : 'text-green-600'}>
                      {formatLatency(item.avgLatency)}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <span className={item.avgSpeed && item.avgSpeed < 10 ? 'text-red-500' : 'text-green-600'}>
                      {formatSpeed(item.avgSpeed)}
                    </span>
                  </td>
                </tr>

                {/* Expanded model rows */}
                {isExpanded && models.map((model) => (
                  <tr key={`${model.provider}-${model.model}`} className="border-b bg-muted/30">
                    <td className="p-3 pl-8">
                      <span className="text-muted-foreground">{model.model}</span>
                    </td>
                    <td className="p-3 text-right">{model.requests.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">{formatTokens(model.inputTokens)}</td>
                    <td className="p-3 text-right">
                      {formatCacheHit(model.cacheReadTokens)}
                    </td>
                    <td className="p-3 text-right">
                      <span className={(model.reasoningTokens ?? 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}>
                        {(model.reasoningTokens ?? 0) > 0 ? formatTokens(model.reasoningTokens!) : '-'}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono">{formatTokens(model.outputTokens)}</td>
                    <td className="p-3 text-right font-mono">{formatTotalTokens(model.inputTokens, model.outputTokens)}</td>
                    <td className="p-3 text-right">
                      <span className={model.avgLatency && model.avgLatency > 5000 ? 'text-red-500' : 'text-green-600'}>
                        {formatLatency(model.avgLatency)}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span className={model.avgSpeed && model.avgSpeed < 10 ? 'text-red-500' : 'text-green-600'}>
                        {formatSpeed(model.avgSpeed)}
                      </span>
                    </td>
                  </tr>
                ))}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
