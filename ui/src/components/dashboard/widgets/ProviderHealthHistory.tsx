import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMissionControlData } from '@/hooks/useMissionControlData';
import { useMissionControl } from '@/contexts/MissionControlContext';
import {
  BarChart3,
  Clock,
  TrendingUp,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

interface ProviderHealthHistoryProps {
  className?: string;
  provider?: string; // Optional: show specific provider history
}

export function ProviderHealthHistory({ className, provider }: ProviderHealthHistoryProps) {
  const { data: phhData, loading: phhLoading, error: phhError } = useMissionControlData();
  const { setData } = useMissionControl();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(provider || null);

  // Safe data extraction with fallbacks
  const history = phhData?.historicalProviders || [];
  const filteredHistory = provider && history.length > 0
    ? history.filter((h: any) => h && h.provider === provider)
    : history;

  const fetchHealthHistory = async () => {
    try {
      // Simulate refresh - in reality, data is already from hook
      console.log('Refreshing health history...');
    } catch (err) {
      console.error('Error refreshing health history:', err);
    }
  };

  if (phhLoading || !phhData) {
    return (
      <div className={`glass-card p-4 h-full ${className}`}>
        <div className="flex items-center justify-center h-48">
          {phhError ? (
            <div className="text-red-500 text-center">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
              <p>Error loading data</p>
            </div>
          ) : (
            <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
          )}
        </div>
      </div>
    );
  }

  if (filteredHistory.length === 0) {
    return (
      <div className={`glass-card p-4 h-full ${className}`}>
        <div className="flex items-center justify-center h-48 text-gray-500">
          <BarChart3 className="h-6 w-6" />
          <span className="ml-2">No historical data available</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-card p-4 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-500" />
          <h3 className="text-lg font-semibold">Health History</h3>
        </div>
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchHealthHistory}
            className="p-1 rounded hover:bg-gray-100"
          >
            <RefreshCw className="h-4 w-4 text-gray-600" />
          </motion.button>
        </div>
      </div>

      {/* Selected Provider Info */}
      {selectedProvider && (
        <div className="mb-4 p-2 bg-blue-50 rounded-lg">
          <span className="text-sm font-medium text-blue-800">
            Viewing: {selectedProvider}
          </span>
        </div>
      )}

      {/* Provider Selector */}
      {!selectedProvider && filteredHistory.length > 1 && (
        <div className="mb-4">
          <label className="text-sm text-gray-600 mb-1 block">Provider</label>
          <select
            onChange={(e) => setSelectedProvider(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg bg-white"
          >
            <option value="">All Providers</option>
            {filteredHistory
              .filter((h: any) => h && h.provider)
              .map((h: any) => (
                <option key={h.provider} value={h.provider}>
                  {h.provider}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {selectedProvider && (() => {
          const providerData = filteredHistory.find((h: any) => h.provider === selectedProvider);
          if (!providerData) {
            return <div>No provider data found</div>;
          }

          return (
            <>
              <div className="p-3 rounded-lg border bg-green-50 border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-medium">Success Rate</span>
                </div>
                <div className="text-xl font-bold text-green-600">
                  {providerData.successRate ? providerData.successRate.toFixed(1) : '0'}%
                </div>
              </div>
              <div className="p-3 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-xs font-medium">Avg Response</span>
                </div>
                <div className="text-xl font-bold">
                  {providerData.avgResponseTime ? providerData.avgResponseTime.toFixed(0) : '0'}ms
                </div>
              </div>
              <div className="p-3 rounded-lg border bg-red-50 border-red-200">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-xs font-medium">Error Rate</span>
                </div>
                <div className="text-xl font-bold text-red-600">
                  {providerData.errorRate ? providerData.errorRate.toFixed(1) : '0'}%
                </div>
              </div>
            </>
          );
        })()}

        {!selectedProvider && (
          <>
            <div className="p-3 rounded-lg bg-blue-50 border-blue-200">
              <div className="text-xs font-medium text-blue-800 mb-1">Total Requests</div>
              <div className="text-xl font-bold text-blue-900">
                {filteredHistory.reduce((sum: number, h: any) => sum + (h.totalRequests || 0), 0).toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-green-50 border-green-200">
              <div className="text-xs font-medium text-green-800 mb-1">Avg Success</div>
              <div className="text-xl font-bold text-green-900">
                {filteredHistory.length > 0
                  ? (filteredHistory.reduce((sum: number, h: any) => sum + (h.successRate || 0), 0) / filteredHistory.length).toFixed(1)
                  : '0'}%
              </div>
            </div>
            <div className="p-3 rounded-lg bg-purple-50 border-purple-200">
              <div className="text-xs font-medium text-purple-800 mb-1">Active Providers</div>
              <div className="text-xl font-bold text-purple-900">{filteredHistory.length}</div>
            </div>
          </>
        )}
      </div>

      {/* Provider List */}
      <div className="flex-1 overflow-auto">
        {selectedProvider && (() => {
          // Show details for selected provider
          const providerData = filteredHistory.find((h: any) => h.provider === selectedProvider);
          if (!providerData) return null;

          return (
            <div className="space-y-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{providerData.provider}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      ({(providerData.totalRequests || 0).toLocaleString()} requests)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div className="text-center p-2 bg-white rounded border">
                    <div className="text-lg font-bold">{providerData.successRate ? providerData.successRate.toFixed(1) : '0'}%</div>
                    <div className="text-xs text-gray-600">Success Rate</div>
                  </div>
                  <div className="text-center p-2 bg-white rounded border">
                    <div className="text-lg font-bold">{providerData.avgResponseTime ? providerData.avgResponseTime.toFixed(0) : '0'}ms</div>
                    <div className="text-xs text-gray-600">Avg Response</div>
                  </div>
                  <div className="text-center p-2 bg-white rounded border text-red-600">
                    <div className="text-lg font-bold">{providerData.errorRate ? providerData.errorRate.toFixed(1) : '0'}%</div>
                    <div className="text-xs text-gray-600">Error Rate</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {!selectedProvider && (
          // Show all providers
          <div className="space-y-2">
            {filteredHistory
              .filter((providerHistory: any) => providerHistory && providerHistory.provider)
              .map((providerHistory: any) => (
                <motion.div
                  key={providerHistory.provider}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-gray-50 rounded-lg border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{providerHistory.provider}</span>
                    <span className="text-xs text-gray-500">
                      {(providerHistory.totalRequests || 0).toLocaleString()} requests
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-sm">
                        <TrendingUp className="h-3 w-3 text-green-500" />
                        <span className="text-green-600 font-medium">
                          {providerHistory.successRate ? providerHistory.successRate.toFixed(1) : '0'}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3 text-gray-500" />
                        <span className="text-gray-600">
                          {providerHistory.avgResponseTime ? providerHistory.avgResponseTime.toFixed(0) : '0'}ms
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-red-600">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{providerHistory.errorRate ? providerHistory.errorRate.toFixed(1) : '0'}%</span>
                      </div>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedProvider(providerHistory.provider)}
                      className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      View Details
                    </motion.button>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-green-500"
                      style={{ width: `${providerHistory.successRate || 0}%` }}
                    />
                  </div>
                </motion.div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}