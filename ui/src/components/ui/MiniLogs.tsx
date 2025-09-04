import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Clock, Activity } from 'lucide-react';
import type { StatusType } from './StatusIndicator';

interface ActivityLog {
  id: string;
  timestamp: Date;
  model: string;
  provider: string;
  route: string;
  status: 'success' | 'error' | 'retrying' | 'cached';
  latency: number;
  statusCode?: number;
  errorMessage?: string;
}

interface MiniLogsProps {
  logs: ActivityLog[];
  maxItems?: number;
  showTimestamp?: boolean;
  showFullDetails?: boolean;
  className?: string;
  maxHeight?: string;
  onLogClick?: (log: ActivityLog) => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function MiniLogs({
  logs,
  maxItems = 5,
  showTimestamp = true,
  showFullDetails = false,
  className = '',
  maxHeight = '200px',
  onLogClick,
  autoRefresh = false,
  refreshInterval = 30000,
}: MiniLogsProps) {
  const [expanded, setExpanded] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(autoRefresh);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter logs and limit items - ensure logs is always an array
  const safeLogs = Array.isArray(logs) ? logs : [];
  const displayLogs = expanded ? safeLogs : safeLogs.slice(0, maxItems);

  // Determine if we need show more button
  const hasMoreLogs = safeLogs.length > maxItems;

    // Auto refresh logic
  useEffect(() => {
    if (autoRefreshEnabled && safeLogs.length > 0) {
      const interval = setInterval(() => {
        // Trigger refresh if there's a refresh callback
        if (onLogClick) {
          // This could trigger a parent component refresh
        }
      }, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefreshEnabled, refreshInterval, safeLogs.length]);

  const getStatusType = (status: ActivityLog['status']): StatusType => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'error';
      case 'retrying':
        return 'warning';
      case 'cached':
        return 'info';
      default:
        return 'info';
    }
  };

  const formatLatency = (latency: number): string => {
    if (latency < 1000) return `${latency}ms`;
    return `${(latency / 1000).toFixed(1)}s`;
  };

  const formatTimeAgo = (timestamp: Date): string => {
    const seconds = Math.floor((Date.now() - timestamp.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  const handleExpandToggle = () => {
    setExpanded(!expanded);
  };

  const handleAutoRefreshToggle = () => {
    setAutoRefreshEnabled(!autoRefreshEnabled);
  };

  const handleClick = (log: ActivityLog) => {
    if (onLogClick) {
      onLogClick(log);
    } else {
      // Default action: copy to clipboard or show details
      console.log('Log clicked:', log);
    }
  };

  return (
    <div className={`mini-logs-container ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">
            Activity ({safeLogs.length} items)
          </span>
          {autoRefreshEnabled && (
            <div className="flex items-center gap-1 text-xs text-blue-600">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
              <span>Live</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoRefreshToggle}
            className={`p-1 rounded text-xs ${
              autoRefreshEnabled
                ? 'text-blue-600 bg-blue-50'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            title={autoRefreshEnabled ? 'Stop auto refresh' : 'Start auto refresh'}
          >
            {autoRefreshEnabled ? (
              <Clock className="h-3 w-3" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
          </button>
          
          {hasMoreLogs && (
            <button
              onClick={handleExpandToggle}
              className="p-1 rounded text-xs text-gray-500 hover:bg-gray-100"
            >
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {expanded ? 'Show Less' : `Show ${safeLogs.length - maxItems} More`}
            </button>
          )}
        </div>
      </div>

      {/* Logs container */}
      <div
        ref={containerRef}
        className="mini-logs overflow-y-auto border border-gray-200 rounded-md bg-white"
        style={{ maxHeight }}
      >
        <div className="divide-y divide-gray-200">
          {displayLogs.map((log) => (
            <MiniLogEntry
              key={log.id}
              log={log}
              showTimestamp={showTimestamp}
              showFullDetails={showFullDetails}
              onClick={() => handleClick(log)}
            />
          ))}
          
          {safeLogs.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent activity</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MiniLogEntryProps {
  log: ActivityLog;
  showTimestamp?: boolean;
  showFullDetails?: boolean;
  onClick?: () => void;
}

function MiniLogEntry({
  log,
  showTimestamp = true,
  showFullDetails = false,
  onClick,
}: MiniLogEntryProps) {
  const getStatusType = (status: ActivityLog['status']): StatusType => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'error';
      case 'retrying':
        return 'warning';
      case 'cached':
        return 'info';
      default:
        return 'info';
    }
  };

  const formatLatency = (latency: number): string => {
    if (latency < 1000) return `${latency}ms`;
    return `${(latency / 1000).toFixed(1)}s`;
  };

  const formatTimeAgo = (timestamp: Date): string => {
    const seconds = Math.floor((Date.now() - timestamp.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  const statusType = getStatusType(log.status);
  const latency = formatLatency(log.latency);
  const timeAgo = formatTimeAgo(log.timestamp);

  return (
    <div
      className={`mini-log-entry ${statusType} cursor-pointer hover:bg-gray-50 transition-colors`}
      onClick={onClick}
      title={showFullDetails ? 'Click for details' : undefined}
    >
      <div className="mini-log-content">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-medium truncate">{log.model}</span>
            <span className="mini-log-status text-xs">
              {log.status}
            </span>
          </div>
          
          {showFullDetails && (
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
              <span>{log.provider}</span>
              <span>•</span>
              <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                {log.route}
              </span>
              {log.statusCode && (
                <>
                  <span>•</span>
                  <span>{log.statusCode}</span>
                </>
              )}
            </div>
          )}
          
          {log.errorMessage && (
            <p className="text-xs text-red-600 mt-1 truncate">
              Error: {log.errorMessage}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-mono text-gray-500">
            {latency}
          </span>
          {showTimestamp && (
            <span className="mini-log-timestamp text-xs">
              {timeAgo}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Hook for auto-refreshing logs
export function useMiniLogs(refetchInterval: number = 30000) {
  // This hook could be extended to fetch real logs
  // For now, it's a placeholder for potential future use
  return {
    refresh: () => {
      console.log('Refreshing logs...');
    },
    stopRefresh: () => {
      console.log('Stopping auto refresh...');
    },
  };
}