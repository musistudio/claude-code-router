import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMissionControlData } from '@/hooks/useMissionControlData';
import { missionControlAPI } from '@/lib/missionControlAPI';
import { 
  Clock, 
  ChevronRight, 
  ExternalLink,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity
} from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: Date;
  model: string;
  provider: string;
  endpoint: string;
  status: 'success' | 'error' | 'retrying' | 'cached';
  latency: number;
  retries?: number;
  cached?: boolean;
  // Add route tracking fields
  route?: string;
  originalModel?: string;
  actualModel?: string;
  statusCode?: number;
}

interface LiveActivityFeedProps {
  onSelectLog?: (log: LogEntry) => void;
}

// Helper to transform real activity data from API to LogEntry format
const transformActivityDataToLogs = (activityData: any[]): LogEntry[] => {
  if (!Array.isArray(activityData)) {
    return [];
  }

  return activityData.map((activity: any) => ({
    id: activity.id || `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(activity.timestamp),
    model: activity.model || 'unknown',
    provider: activity.provider || 'unknown',
    endpoint: activity.endpoint || '/api/v1/chat/completions',
    status: activity.type === 'success' ? 'success' : 
            activity.type === 'error' ? 'error' : 
            activity.type === 'warning' ? 'retrying' : 'success',
    latency: activity.responseTime || 0,
    retries: activity.type === 'warning' ? 1 : undefined,
    cached: false, // Real data doesn't include cache info in current format
    // Add route tracking information from real data
    route: activity.route,
    originalModel: activity.originalModel,
    actualModel: activity.actualModel,
    statusCode: activity.statusCode
  }));
};

export function LiveActivityFeed({ onSelectLog }: LiveActivityFeedProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Function to fetch real activity data
  const fetchLiveActivity = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await missionControlAPI.getLiveActivity();
      
      if (response.success && Array.isArray(response.data)) {
        const realLogs = transformActivityDataToLogs(response.data);
        setLogs(realLogs);
      } else {
        console.warn('Live activity API returned unexpected format:', response);
        setError('Failed to load activity data');
      }
    } catch (error) {
      console.error('Error fetching live activity:', error);
      setError('Failed to fetch live activity');
    } finally {
      setLoading(false);
    }
  };

  // Initialize with real data on mount
  useEffect(() => {
    fetchLiveActivity();
  }, []);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchLiveActivity, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const formatLatency = (latency: number): string => {
    if (latency < 1000) return `${latency}ms`;
    return `${(latency / 1000).toFixed(1)}s`;
  };

  const formatTimeAgo = (timestamp: Date): string => {
    const seconds = Math.floor((Date.now() - timestamp.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  const getStatusBadge = (status: LogEntry['status'], retries?: number) => {
    switch (status) {
      case 'success':
        return (
          <div className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-500" />
            <span className="text-xs text-green-600">Success</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-1">
            <XCircle className="h-3 w-3 text-red-500" />
            <span className="text-xs text-red-600">Error</span>
          </div>
        );
      case 'retrying':
        return (
          <div className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-yellow-500" />
            <span className="text-xs text-yellow-600">Retrying {retries && `(${retries})`}</span>
          </div>
        );
      case 'cached':
        return (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-blue-500" />
            <span className="text-xs text-blue-600">Cached</span>
          </div>
        );
    }
  };

  return (
    <div className="glass-card p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Live Activity Feed</h3>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded">
              Real Data
            </span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`p-1 rounded transition-colors ${
                autoRefresh ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:bg-gray-100'
              }`}
            >
              <Activity className={`h-4 w-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
            </button>
            <button
              onClick={fetchLiveActivity}
              disabled={loading}
              className="p-1 rounded transition-colors text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <span className="text-xs">
              {logs.length} activities
            </span>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-2 mb-4 text-xs">
        <div className="text-center">
          <div className="text-lg font-bold text-green-600">
            {logs.filter(l => l.status === 'success').length}
          </div>
          <div className="text-gray-600">Success</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-red-600">
            {logs.filter(l => l.status === 'error').length}
          </div>
          <div className="text-gray-600">Errors</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-yellow-600">
            {logs.filter(l => l.status === 'retrying').length}
          </div>
          <div className="text-gray-600">Retrying</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-blue-600">
            {logs.filter(l => l.status === 'cached').length}
          </div>
          <div className="text-gray-600">Cached</div>
        </div>
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-auto space-y-2">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
            <div className="text-sm text-red-600">{error}</div>
            <button
              onClick={fetchLiveActivity}
              className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
            >
              Retry
            </button>
          </div>
        )}
        
        {loading && logs.length === 0 && (
          <div className="p-3 text-center text-gray-500">
            <Activity className="h-6 w-6 animate-spin mx-auto mb-2" />
            <div className="text-sm">Loading activity feed...</div>
          </div>
        )}
        
        {!loading && !error && logs.length === 0 && (
          <div className="p-3 text-center text-gray-500">
            <div className="text-sm">No recent activity</div>
          </div>
        )}
        
        <AnimatePresence>
          {logs.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.3 }}
              className="p-3 bg-gray-50 rounded-lg border cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => setSelectedLog(log)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusBadge(log.status, log.retries)}
                  <div>
                    <div className="font-medium text-sm">{log.model}</div>
                    <div className="text-xs text-gray-600">
                      {log.provider}
                      {log.route && log.route !== 'default' && (
                        <span className="ml-1 px-1 bg-blue-100 text-blue-600 rounded text-xs">
                          {log.route}
                        </span>
                      )}
                      • {formatTimeAgo(log.timestamp)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="text-sm font-mono">{formatLatency(log.latency)}</div>
                    <div className="text-xs text-gray-500">
                      {log.endpoint}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-semibold">Activity Details</h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Model</div>
                      <div className="font-medium">{selectedLog.model}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Provider</div>
                      <div className="font-medium">{selectedLog.provider}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Endpoint</div>
                      <div className="font-mono text-sm">{selectedLog.endpoint}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Status</div>
                      {getStatusBadge(selectedLog.status, selectedLog.retries)}
                    </div>
                  </div>

                  {/* Route Information - show if available */}
                  {(selectedLog.route || selectedLog.originalModel || selectedLog.actualModel) && (
                    <div className="border-t pt-4">
                      <div className="text-sm font-medium text-gray-700 mb-2">Route Information</div>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        {selectedLog.route && (
                          <div>
                            <div className="text-gray-600">Route Used</div>
                            <div className="font-medium capitalize">
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                                {selectedLog.route}
                              </span>
                            </div>
                          </div>
                        )}
                        {selectedLog.originalModel && (
                          <div>
                            <div className="text-gray-600">Original Model</div>
                            <div className="font-mono text-sm">{selectedLog.originalModel}</div>
                          </div>
                        )}
                        {selectedLog.actualModel && selectedLog.actualModel !== selectedLog.model && (
                          <div>
                            <div className="text-gray-600">Actual Model</div>
                            <div className="font-mono text-sm">{selectedLog.actualModel}</div>
                          </div>
                        )}
                        {selectedLog.statusCode && (
                          <div>
                            <div className="text-gray-600">Status Code</div>
                            <div className="font-mono text-sm">{selectedLog.statusCode}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Latency</div>
                      <div className="font-mono text-lg">{formatLatency(selectedLog.latency)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Timestamp</div>
                      <div className="text-sm">
                        {selectedLog.timestamp.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {selectedLog.retries && (
                    <div>
                      <div className="text-sm text-gray-600">Retries</div>
                      <div className="text-sm">
                        <span className="ml-2 font-medium">{selectedLog.retries}</span>
                      </div>
                    </div>
                  )}

                  {selectedLog.cached && (
                    <div>
                      <div className="text-sm text-gray-600">Cache Status</div>
                      <div className="text-sm text-blue-600">
                        <span className="ml-2 font-medium">Retrieved from cache</span>
                      </div>
                    </div>
                  )}

                  {/* Data Source Info */}
                  <div className="bg-green-50 p-3 rounded">
                    <div className="text-sm text-green-600 mb-1">Source: Real Analytics Data</div>
                    <div className="text-xs text-green-500">
                      Live activity feed from actual system requests and responses
                    </div>
                  </div>

                  {/* Request/Response Preview */}
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-sm text-gray-600 mb-2">Request Details</div>
                    <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto">
                      {JSON.stringify({
                        id: selectedLog.id,
                        model: selectedLog.model,
                        provider: selectedLog.provider,
                        endpoint: selectedLog.endpoint,
                        status: selectedLog.status,
                        latency: selectedLog.latency,
                        timestamp: selectedLog.timestamp.toISOString()
                      }, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}