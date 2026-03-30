import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Local format tokens function
function formatTokens(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

interface UsageRecord {
  id: string;
  timestamp: string;
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

interface RecordsTableProps {
  records: UsageRecord[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loading?: boolean;
}

export function RecordsTable({
  records,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  loading,
}: RecordsTableProps) {
  const { t } = useTranslation();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const totalPages = Math.ceil(total / pageSize);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const formatLatency = (ms?: number) => {
    if (!ms) return '-';
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.round(ms)}ms`;
  };

  const formatSpeed = (record: UsageRecord) => {
    // speed = outputTokens / outputDuration (where outputDuration = duration - timeToFirstToken)
    const outputDuration = (record.duration || 0) - (record.timeToFirstToken || 0);
    if (!record.duration || outputDuration <= 0) return '-';
    const tokensPerSec = (record.outputTokens || 0) / (outputDuration / 1000);
    if (tokensPerSec >= 1000) return `${(tokensPerSec / 1000).toFixed(1)}K/s`;
    return `${Math.round(tokensPerSec)}/s`;
  };

  // cacheReadInputTokens comes from LLM API's usage.cache_read_input_tokens field
  // (extracted by @musistudio/llms, stored in UsageRecord)
  const formatCacheHit = (cacheRead?: number) => {
    if (!cacheRead || cacheRead === 0) return '-';
    return formatTokens(cacheRead);
  };

  // totalTokens = inputTokens + outputTokens (cacheReadInputTokens is tracked separately)
  const formatTotalTokens = (input: number, output: number) => {
    const total = input + output;
    return formatTokens(total);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-2 text-left">{t('usage.time')}</th>
              <th className="p-2 text-left">{t('usage.provider')}</th>
              <th className="p-2 text-left">{t('usage.model')}</th>
              <th className="p-2 text-right">{t('usage.input_tokens')}</th>
              <th className="p-2 text-right">{t('usage.cache_hit')}</th>
              <th className="p-2 text-right">{t('usage.reasoning')}</th>
              <th className="p-2 text-right">{t('usage.output_tokens')}</th>
              <th className="p-2 text-right">{t('usage.consumed_tokens')}</th>
              <th className="p-2 text-right">{t('usage.ttft')}</th>
              <th className="p-2 text-right">{t('usage.output_duration')}</th>
              <th className="p-2 text-right">{t('usage.speed')}</th>
              <th className="p-2 text-center">{t('usage.status')}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <>
                <tr
                  key={record.id}
                  className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => setExpandedRow(expandedRow === record.id ? null : record.id)}
                >
                  <td className="p-2 font-mono text-xs">{formatTime(record.timestamp)}</td>
                  <td className="p-2">
                    <Badge variant="secondary">{record.provider}</Badge>
                  </td>
                  <td className="p-2 text-muted-foreground text-xs truncate max-w-32">
                    {Array.isArray(record.model) ? record.model.join(', ') : record.model}
                  </td>
                  <td className="p-2 text-right font-mono">{formatTokens(record.inputTokens)}</td>
                  <td className="p-2 text-right font-mono text-xs">{formatCacheHit(record.cacheReadInputTokens)}</td>
                  <td className="p-2 text-right">
                    <span className={(record.reasoningTokens ?? 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}>
                      {(record.reasoningTokens ?? 0) > 0 ? formatTokens(record.reasoningTokens!) : '-'}
                    </span>
                  </td>
                  <td className="p-2 text-right font-mono">{formatTokens(record.outputTokens)}</td>
                  <td className="p-2 text-right font-mono">{formatTotalTokens(record.inputTokens, record.outputTokens)}</td>
                  <td className="p-2 text-right">
                    <span className={record.timeToFirstToken && record.timeToFirstToken > 1000 ? 'text-yellow-600' : ''}>
                      {formatLatency(record.timeToFirstToken)}
                    </span>
                  </td>
                  <td className="p-2 text-right">{formatLatency((record.duration || 0) - (record.timeToFirstToken || 0))}</td>
                  <td className="p-2 text-right">
                    <span className={(() => {
                      const outputDuration = (record.duration || 0) - (record.timeToFirstToken || 0);
                      return outputDuration > 0 && record.outputTokens / (outputDuration / 1000) < 10;
                    })() ? 'text-red-500' : 'text-green-600'}>
                      {formatSpeed(record)}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    {record.success ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 mx-auto" />
                    )}
                  </td>
                </tr>

                {/* Expanded row with error message */}
                {expandedRow === record.id && record.errorMessage && (
                  <tr className="bg-red-50 dark:bg-red-950/20">
                    <td colSpan={11} className="p-3">
                      <div className="text-xs text-red-600 dark:text-red-400">
                        <span className="font-semibold">{t('usage.error')}:</span>
                        <pre className="mt-1 whitespace-pre-wrap break-all">{record.errorMessage}</pre>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t('usage.showing')}</span>
          <span className="font-medium">{((page - 1) * pageSize) + 1}</span>
          <span>{t('usage.to')}</span>
          <span className="font-medium">{Math.min(page * pageSize, total)}</span>
          <span>{t('usage.of')}</span>
          <span className="font-medium">{total}</span>
          <span>{t('usage.records')}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Page size selector */}
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 px-2 text-sm border rounded-md bg-background"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>

          {/* Navigation buttons */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <span className="text-sm">
            {t('usage.page')} {page} {t('usage.of')} {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
