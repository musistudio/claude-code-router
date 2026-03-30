import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';

function formatTokens(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
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

interface DetailedHourlyData extends HourlyData {
  provider?: string;
  model?: string;
}

interface HourlyTableProps {
  data: HourlyData[];
  detailedData?: DetailedHourlyData[];
  loading?: boolean;
  pageFilter?: 'none' | 'provider' | 'model';
}

type DrillDownLevel = 'hour' | 'provider' | 'model';

function getDefaultDrillLevel(pageFilter?: 'none' | 'provider' | 'model'): DrillDownLevel {
  if (pageFilter === 'model') return 'model';
  if (pageFilter === 'provider') return 'provider';
  return 'hour';
}

export function HourlyTable({ data, detailedData, loading, pageFilter }: HourlyTableProps) {
  const { t } = useTranslation();
  const [drillDownLevel, setDrillDownLevel] = useState<DrillDownLevel>(() => getDefaultDrillLevel(pageFilter));
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (rowId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };
  const isRowExpanded = (rowId: string) => expandedRows.has(rowId);

  const formatLatency = (ms?: number) => !ms ? '-' : ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
  const formatSpeed = (speed?: number) => !speed ? '-' : speed >= 1000 ? `${(speed / 1000).toFixed(1)}K/s` : `${Math.round(speed)}/s`;
  const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
  const formatCacheHit = (v: number) => v === 0 ? '-' : formatTokens(v);
  const formatTotalTokens = (input: number, output: number) => formatTokens(input + output);

  const aggStats = (items: DetailedHourlyData[]) => items.reduce((acc, d) => ({
    requests: acc.requests + d.requests,
    inputTokens: acc.inputTokens + d.inputTokens,
    outputTokens: acc.outputTokens + d.outputTokens,
    cacheReadTokens: acc.cacheReadTokens + d.cacheReadTokens,
    reasoningTokens: acc.reasoningTokens + (d.reasoningTokens || 0),
  }), { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0 });

  // Aggregate HourStats (already aggregated per hour from hierarchicalData)
  const aggHourStatsMap = (statsArr: HourStats[]) => {
    const result = statsArr.reduce((acc, d) => ({
      requests: acc.requests + d.requests,
      inputTokens: acc.inputTokens + d.inputTokens,
      outputTokens: acc.outputTokens + d.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + d.cacheReadTokens,
      reasoningTokens: acc.reasoningTokens + d.reasoningTokens,
      totalLatency: acc.totalLatency + d.totalLatency,
      totalSpeed: acc.totalSpeed + d.totalSpeed,
      latencyCount: acc.latencyCount + d.latencyCount,
      speedCount: acc.speedCount + d.speedCount,
    }), {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      reasoningTokens: 0,
      totalLatency: 0,
      totalSpeed: 0,
      latencyCount: 0,
      speedCount: 0
    });
    return result;
  };

  const calcAvgLatency = (stats: { totalLatency: number; latencyCount: number }) => {
    return stats.latencyCount > 0 ? stats.totalLatency / stats.latencyCount : undefined;
  };

  const calcAvgSpeed = (stats: { totalSpeed: number; speedCount: number }) => {
    return stats.speedCount > 0 ? stats.totalSpeed / stats.speedCount : undefined;
  };

  const aggHourStats = (items: HourlyData[]) => items.reduce((acc, d) => ({
    requests: acc.requests + d.requests,
    inputTokens: acc.inputTokens + d.inputTokens,
    outputTokens: acc.outputTokens + d.outputTokens,
    cacheReadTokens: acc.cacheReadTokens + d.cacheReadTokens,
    reasoningTokens: acc.reasoningTokens + (d.reasoningTokens || 0),
  }), { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0 });

  // Build: provider -> model -> hour, with aggregated stats (all dates merged)
  // hour key -> aggregated stats
  type HourStats = {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    reasoningTokens: number;
    totalLatency: number;
    totalSpeed: number;
    latencyCount: number;
    speedCount: number;
  };
  const hierarchicalData = useMemo(() => {
    if (!detailedData) return null;
    // provider -> model -> hour -> stats
    const providerMap = new Map<string, Map<string, Map<number, HourStats>>>();
    detailedData.forEach(item => {
      if (item.requests === 0) return;
      const p = item.provider || 'unknown';
      const m = item.model || 'unknown';
      if (!providerMap.has(p)) providerMap.set(p, new Map());
      const modelMap = providerMap.get(p)!;
      if (!modelMap.has(m)) modelMap.set(m, new Map());
      const hourMap = modelMap.get(m)!;
      if (!hourMap.has(item.hour)) {
        hourMap.set(item.hour, {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          reasoningTokens: 0,
          totalLatency: 0,
          totalSpeed: 0,
          latencyCount: 0,
          speedCount: 0
        });
      }
      const stats = hourMap.get(item.hour)!;
      stats.requests += item.requests;
      stats.inputTokens += item.inputTokens;
      stats.outputTokens += item.outputTokens;
      stats.cacheReadTokens += item.cacheReadTokens;
      stats.reasoningTokens += item.reasoningTokens || 0;
      if (item.avgLatency !== undefined && item.avgLatency > 0) {
        stats.totalLatency += item.avgLatency * item.requests;
        stats.latencyCount += item.requests;
      }
      if (item.avgSpeed !== undefined && item.avgSpeed > 0) {
        stats.totalSpeed += item.avgSpeed * item.outputTokens;
        stats.speedCount += item.outputTokens;
      }
    });
    return providerMap;
  }, [detailedData]);

  const filteredData = data.filter(item => item.requests > 0);
  const totals = aggHourStats(filteredData);
  const maxRequests = Math.max(...filteredData.map(d => d.requests), 0);
  const getIntensity = (v: number) => {
    const r = maxRequests > 0 ? v / maxRequests : 0;
    if (r > 0.7) return 'bg-blue-500/20';
    if (r > 0.4) return 'bg-blue-500/10';
    if (r > 0.1) return 'bg-blue-500/5';
    return '';
  };

  // Column headers - dynamic label for first column
  const firstColLabel = drillDownLevel === 'model'
    ? `${t('usage.provider')} / ${t('usage.model')} / ${t('usage.hour')}`
    : drillDownLevel === 'provider'
    ? `${t('usage.provider')} / ${t('usage.hour')}`
    : t('usage.hour');

  // ========== RENDER FUNCTIONS ==========

  const renderStatCells = (stats: { requests: number; inputTokens: number; cacheReadTokens: number; outputTokens: number; reasoningTokens?: number }, isHourRow = false) => [
    <td key="req" className="p-2 text-right">{stats.requests.toLocaleString()}</td>,
    <td key="input" className="p-2 text-right font-mono">{formatTokens(stats.inputTokens)}</td>,
    <td key="cache" className="p-2 text-right font-mono text-xs">{formatCacheHit(stats.cacheReadTokens)}</td>,
    <td key="reasoning" className="p-2 text-right">
      <span className={(stats.reasoningTokens ?? 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}>
        {(stats.reasoningTokens ?? 0) > 0 ? formatTokens(stats.reasoningTokens!) : '-'}
      </span>
    </td>,
    <td key="output" className="p-2 text-right font-mono">{formatTokens(stats.outputTokens)}</td>,
    <td key="total" className="p-2 text-right font-mono">{formatTotalTokens(stats.inputTokens, stats.outputTokens)}</td>,
    <td key="lat" className="p-2 text-right">-</td>,
    <td key="spd" className="p-2 text-right">-</td>,
  ];

  // Hour-only view
  const renderHourOnlyRows = () =>
    filteredData.map(item => (
      <tr key={`hour-${item.hour}`} className={`border-b hover:bg-muted/30 ${getIntensity(item.requests)}`}>
        <td className="p-2 font-mono text-sm">{formatHour(item.hour)}</td>
        <td className="p-2 text-right">{item.requests.toLocaleString()}</td>
        <td className="p-2 text-right font-mono">{formatTokens(item.inputTokens)}</td>
        <td className="p-2 text-right font-mono text-xs">{formatCacheHit(item.cacheReadTokens)}</td>
        <td className="p-2 text-right">
          <span className={(item.reasoningTokens ?? 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}>
            {(item.reasoningTokens ?? 0) > 0 ? formatTokens(item.reasoningTokens!) : '-'}
          </span>
        </td>
        <td className="p-2 text-right font-mono">{formatTokens(item.outputTokens)}</td>
        <td className="p-2 text-right font-mono">{formatTotalTokens(item.inputTokens, item.outputTokens)}</td>
        <td className="p-2 text-right">
          <span className={item.avgLatency && item.avgLatency > 5000 ? 'text-red-500' : 'text-green-600'}>{formatLatency(item.avgLatency)}</span>
        </td>
        <td className="p-2 text-right">
          <span className={item.avgSpeed && item.avgSpeed < 10 ? 'text-red-500' : 'text-green-600'}>{formatSpeed(item.avgSpeed)}</span>
        </td>
      </tr>
    ));

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  if (filteredData.length === 0) return (
    <div className="text-center py-8 text-muted-foreground h-48 flex items-center justify-center">
      {t('usage.no_data')}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Drill-down selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{t('usage.view_level')}:</span>
        <div className="flex gap-1">
          {(['hour', 'provider', 'model'] as DrillDownLevel[]).map(level => (
            <button key={level} onClick={() => { setDrillDownLevel(level); setExpandedRows(new Set()); }}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${drillDownLevel === level ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}>
              {t(`usage.${level}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-2 text-left">{firstColLabel}</th>
              <th className="p-2 text-right">{t('usage.request_count')}</th>
              <th className="p-2 text-right">{t('usage.input_tokens')}</th>
              <th className="p-2 text-right">{t('usage.cache_hit')}</th>
              <th className="p-2 text-right">{t('usage.reasoning')}</th>
              <th className="p-2 text-right">{t('usage.output_tokens')}</th>
              <th className="p-2 text-right">{t('usage.consumed_tokens')}</th>
              <th className="p-2 text-right">{t('usage.avg_latency')}</th>
              <th className="p-2 text-right">{t('usage.avg_speed')}</th>
            </tr>
          </thead>
          <tbody>
            {drillDownLevel === 'hour' && renderHourOnlyRows()}

            {/* provider: provider -> hour */}
            {drillDownLevel === 'provider' && hierarchicalData && Array.from(hierarchicalData.entries()).map(([provider, modelMap]) => {
              // Aggregate all hours for this provider
              const allHourStats: HourStats[] = [];
              modelMap.forEach(hourMap => hourMap.forEach(stats => allHourStats.push(stats)));
              const providerStats = aggHourStatsMap(allHourStats);
              const providerAvgLatency = calcAvgLatency(providerStats);
              const providerAvgSpeed = calcAvgSpeed(providerStats);
              const providerRowId = `p-${provider}`;
              const expanded = isRowExpanded(providerRowId);

              // Collect per-hour stats across all models
              const hourStatsMap = new Map<number, HourStats>();
              modelMap.forEach(hourMap => {
                hourMap.forEach((stats, hour) => {
                  if (!hourStatsMap.has(hour)) hourStatsMap.set(hour, {
                    requests: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    cacheReadTokens: 0,
                    reasoningTokens: 0,
                    totalLatency: 0,
                    totalSpeed: 0,
                    latencyCount: 0,
                    speedCount: 0
                  });
                  const acc = hourStatsMap.get(hour)!;
                  acc.requests += stats.requests;
                  acc.inputTokens += stats.inputTokens;
                  acc.outputTokens += stats.outputTokens;
                  acc.cacheReadTokens += stats.cacheReadTokens;
                  acc.reasoningTokens += stats.reasoningTokens;
                  acc.totalLatency += stats.totalLatency;
                  acc.totalSpeed += stats.totalSpeed;
                  acc.latencyCount += stats.latencyCount;
                  acc.speedCount += stats.speedCount;
                });
              });

              return (
                <>
                  <tr key={providerRowId}
                    className={`border-b hover:bg-muted/30 cursor-pointer ${getIntensity(providerStats.requests)}`}
                    onClick={() => toggleRow(providerRowId)}>
                    <td className="p-2 flex items-center gap-1">
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <span className="font-medium">{provider}</span>
                    </td>
                    <td className="p-2 text-right">{providerStats.requests.toLocaleString()}</td>
                    <td className="p-2 text-right font-mono">{formatTokens(providerStats.inputTokens)}</td>
                    <td className="p-2 text-right font-mono text-xs">{formatCacheHit(providerStats.cacheReadTokens)}</td>
                    <td className="p-2 text-right">
                      <span className={(providerStats.reasoningTokens ?? 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}>
                        {(providerStats.reasoningTokens ?? 0) > 0 ? formatTokens(providerStats.reasoningTokens) : '-'}
                      </span>
                    </td>
                    <td className="p-2 text-right font-mono">{formatTokens(providerStats.outputTokens)}</td>
                    <td className="p-2 text-right font-mono">{formatTotalTokens(providerStats.inputTokens, providerStats.outputTokens)}</td>
                    <td className="p-2 text-right">
                      <span className={providerAvgLatency && providerAvgLatency > 5000 ? 'text-red-500' : 'text-green-600'}>{formatLatency(providerAvgLatency)}</span>
                    </td>
                    <td className="p-2 text-right">
                      <span className={providerAvgSpeed && providerAvgSpeed < 10 ? 'text-red-500' : 'text-green-600'}>{formatSpeed(providerAvgSpeed)}</span>
                    </td>
                  </tr>
                  {expanded && Array.from(hourStatsMap.entries())
                    .sort(([a], [b]) => a - b)
                    .map(([hour, stats]) => {
                      const hourAvgLatency = calcAvgLatency(stats);
                      const hourAvgSpeed = calcAvgSpeed(stats);
                      return (
                        <tr key={`${providerRowId}-h-${hour}`} className="border-b bg-muted/10">
                          <td className="p-2 text-muted-foreground text-xs pl-8">{formatHour(hour)}</td>
                          <td className="p-2 text-right">{stats.requests.toLocaleString()}</td>
                          <td className="p-2 text-right font-mono">{formatTokens(stats.inputTokens)}</td>
                          <td className="p-2 text-right font-mono text-xs">{formatCacheHit(stats.cacheReadTokens)}</td>
                          <td className="p-2 text-right">
                            <span className={(stats.reasoningTokens ?? 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}>
                              {(stats.reasoningTokens ?? 0) > 0 ? formatTokens(stats.reasoningTokens) : '-'}
                            </span>
                          </td>
                          <td className="p-2 text-right font-mono">{formatTokens(stats.outputTokens)}</td>
                          <td className="p-2 text-right font-mono">{formatTotalTokens(stats.inputTokens, stats.outputTokens)}</td>
                          <td className="p-2 text-right">
                            <span className={hourAvgLatency && hourAvgLatency > 5000 ? 'text-red-500' : 'text-green-600'}>{formatLatency(hourAvgLatency)}</span>
                          </td>
                          <td className="p-2 text-right">
                            <span className={hourAvgSpeed && hourAvgSpeed < 10 ? 'text-red-500' : 'text-green-600'}>{formatSpeed(hourAvgSpeed)}</span>
                          </td>
                        </tr>
                      );
                    })}
                </>
              );
            })}

            {/* model: provider -> model -> hour */}
            {drillDownLevel === 'model' && hierarchicalData && Array.from(hierarchicalData.entries()).map(([provider, modelMap]) => {
              const providerRowId = `p-${provider}`;
              const providerExpanded = isRowExpanded(providerRowId);
              const allHourStats: HourStats[] = [];
              modelMap.forEach(h => h.forEach(s => allHourStats.push(s)));
              const providerStats = aggHourStatsMap(allHourStats);
              const providerAvgLatency = calcAvgLatency(providerStats);
              const providerAvgSpeed = calcAvgSpeed(providerStats);

              return (
                <>
                  <tr key={providerRowId}
                    className={`border-b hover:bg-muted/30 cursor-pointer ${getIntensity(providerStats.requests)}`}
                    onClick={() => toggleRow(providerRowId)}>
                    <td className="p-2 flex items-center gap-1">
                      {providerExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <span className="font-medium">{provider}</span>
                    </td>
                    <td className="p-2 text-right">{providerStats.requests.toLocaleString()}</td>
                    <td className="p-2 text-right font-mono">{formatTokens(providerStats.inputTokens)}</td>
                    <td className="p-2 text-right font-mono text-xs">{formatCacheHit(providerStats.cacheReadTokens)}</td>
                    <td className="p-2 text-right">
                      <span className={(providerStats.reasoningTokens ?? 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}>
                        {(providerStats.reasoningTokens ?? 0) > 0 ? formatTokens(providerStats.reasoningTokens) : '-'}
                      </span>
                    </td>
                    <td className="p-2 text-right font-mono">{formatTokens(providerStats.outputTokens)}</td>
                    <td className="p-2 text-right font-mono">{formatTotalTokens(providerStats.inputTokens, providerStats.outputTokens)}</td>
                    <td className="p-2 text-right">
                      <span className={providerAvgLatency && providerAvgLatency > 5000 ? 'text-red-500' : 'text-green-600'}>{formatLatency(providerAvgLatency)}</span>
                    </td>
                    <td className="p-2 text-right">
                      <span className={providerAvgSpeed && providerAvgSpeed < 10 ? 'text-red-500' : 'text-green-600'}>{formatSpeed(providerAvgSpeed)}</span>
                    </td>
                  </tr>

                  {providerExpanded && Array.from(modelMap.entries()).map(([model, hourMap]) => {
                    const modelRowId = `${providerRowId}-m-${model}`;
                    const modelExpanded = isRowExpanded(modelRowId);
                    const modelStats = aggHourStatsMap(Array.from(hourMap.values()));
                    const modelAvgLatency = calcAvgLatency(modelStats);
                    const modelAvgSpeed = calcAvgSpeed(modelStats);

                    return (
                      <>
                        <tr key={modelRowId}
                          className="border-b bg-muted/5 hover:bg-muted/10 cursor-pointer"
                          onClick={() => toggleRow(modelRowId)}>
                          <td className="p-2 flex items-center gap-1 pl-8">
                            {modelExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            <span className="text-muted-foreground text-sm">{model}</span>
                          </td>
                          <td className="p-2 text-right">{modelStats.requests.toLocaleString()}</td>
                          <td className="p-2 text-right font-mono">{formatTokens(modelStats.inputTokens)}</td>
                          <td className="p-2 text-right font-mono text-xs">{formatCacheHit(modelStats.cacheReadTokens)}</td>
                          <td className="p-2 text-right">
                            <span className={(modelStats.reasoningTokens ?? 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}>
                              {(modelStats.reasoningTokens ?? 0) > 0 ? formatTokens(modelStats.reasoningTokens) : '-'}
                            </span>
                          </td>
                          <td className="p-2 text-right font-mono">{formatTokens(modelStats.outputTokens)}</td>
                          <td className="p-2 text-right font-mono">{formatTotalTokens(modelStats.inputTokens, modelStats.outputTokens)}</td>
                          <td className="p-2 text-right">
                            <span className={modelAvgLatency && modelAvgLatency > 5000 ? 'text-red-500' : 'text-green-600'}>{formatLatency(modelAvgLatency)}</span>
                          </td>
                          <td className="p-2 text-right">
                            <span className={modelAvgSpeed && modelAvgSpeed < 10 ? 'text-red-500' : 'text-green-600'}>{formatSpeed(modelAvgSpeed)}</span>
                          </td>
                        </tr>

                        {modelExpanded && Array.from(hourMap.entries())
                          .sort(([a], [b]) => a - b)
                          .map(([hour, stats]) => {
                            const hourAvgLatency = calcAvgLatency(stats);
                            const hourAvgSpeed = calcAvgSpeed(stats);
                            return (
                              <tr key={`${modelRowId}-h-${hour}`} className="border-b bg-muted/5">
                                <td className="p-2 text-muted-foreground text-xs pl-16">{formatHour(hour)}</td>
                                <td className="p-2 text-right">{stats.requests.toLocaleString()}</td>
                                <td className="p-2 text-right font-mono">{formatTokens(stats.inputTokens)}</td>
                                <td className="p-2 text-right font-mono text-xs">{formatCacheHit(stats.cacheReadTokens)}</td>
                                <td className="p-2 text-right">
                                  <span className={(stats.reasoningTokens ?? 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}>
                                    {(stats.reasoningTokens ?? 0) > 0 ? formatTokens(stats.reasoningTokens) : '-'}
                                  </span>
                                </td>
                                <td className="p-2 text-right font-mono">{formatTokens(stats.outputTokens)}</td>
                                <td className="p-2 text-right font-mono">{formatTotalTokens(stats.inputTokens, stats.outputTokens)}</td>
                                <td className="p-2 text-right">
                                  <span className={hourAvgLatency && hourAvgLatency > 5000 ? 'text-red-500' : 'text-green-600'}>{formatLatency(hourAvgLatency)}</span>
                                </td>
                                <td className="p-2 text-right">
                                  <span className={hourAvgSpeed && hourAvgSpeed < 10 ? 'text-red-500' : 'text-green-600'}>{formatSpeed(hourAvgSpeed)}</span>
                                </td>
                              </tr>
                            );
                          })}
                      </>
                    );
                  })}
                </>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-muted font-semibold bg-muted/30">
              <td className="p-2">{t('usage.total')}</td>
              <td className="p-2 text-right">{totals.requests.toLocaleString()}</td>
              <td className="p-2 text-right font-mono">{formatTokens(totals.inputTokens)}</td>
              <td className="p-2 text-right font-mono text-xs">{formatCacheHit(totals.cacheReadTokens)}</td>
              <td className="p-2 text-right">
                {(totals.reasoningTokens ?? 0) > 0 ? <span className="text-red-500">{formatTokens(totals.reasoningTokens)}</span> : '-'}
              </td>
              <td className="p-2 text-right font-mono">{formatTokens(totals.outputTokens)}</td>
              <td className="p-2 text-right font-mono">{formatTotalTokens(totals.inputTokens, totals.outputTokens)}</td>
              <td className="p-2 text-right">-</td>
              <td className="p-2 text-right">-</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
