import React from 'react';
import { useProviderHistory } from '@/hooks/useMissionControlData';
import { 
  RefreshCw, 
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { 
  ActionButton 
} from '@/components/ui/ActionButton';
import { 
  StatusIndicator 
} from '@/components/ui/StatusIndicator';
import type { StatusType } from '@/components/ui/StatusIndicator';

interface ProviderTimelineProps {
  className?: string;
}

export function ProviderTimeline({ className = '' }: ProviderTimelineProps) {
  const { data: timelineEvents, loading, error, refetch } = useProviderHistory();

  const handleRefresh = () => {
    refetch();
  };

  const formatTimeAgo = (timestamp: string): string => {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className={`widget-container p-6 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <BarChart3 className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Provider Timeline</h2>
              <p className="text-sm text-gray-400">
                Istoric provideri cu insights practice
              </p>
            </div>
          </div>
          <ActionButton
            variant="secondary"
            size="small"
            onClick={handleRefresh}
            loading={loading}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </ActionButton>
        </div>
      </div>

      {/* Timeline Events */}
      <div className="flex-1 overflow-auto">
        <h3 className="font-medium text-white mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Recent Health Snapshots
        </h3>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p>Loading timeline...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-500">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {timelineEvents && timelineEvents.length > 0 ? (
              timelineEvents.map((event, index) => {
                const status: StatusType = event.successRate > 99 ? 'success' : event.successRate > 95 ? 'info' : event.successRate > 90 ? 'warning' : 'error';

                return (
                  <div 
                    key={`${event.provider}-${event.timestamp}-${index}`}
                    className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:bg-gray-800/70 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {status === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {status === 'info' && <Clock className="h-4 w-4 text-blue-500" />}
                        {status === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                        {status === 'error' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-white">{event.provider} Health Snapshot</div>
                          <div className="flex items-center gap-2">
                            <StatusIndicator 
                              status={status}
                              size="small" 
                            />
                            <span className="text-xs text-gray-500">
                              {formatTimeAgo(event.timestamp)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                          <span>Success: <span className="font-medium text-white">{event.successRate.toFixed(2)}%</span></span>
                          <span>Avg Resp: <span className="font-medium text-white">{event.avgResponseTime.toFixed(0)}ms</span></span>
                          <span>Errors: <span className="font-medium text-white">{((event.errorRate || 0) * 100).toFixed(2)}%</span></span>
                          <span>Total Req: <span className="font-medium text-white">{event.totalRequests || 'N/A'}</span></span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-gray-500">No historical provider data available.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
