import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useMissionControlData } from '@/hooks/useMissionControlData';
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Clock,
  TrendingUp,
  Target
} from 'lucide-react';

interface ProviderHealthManagementProps {
  className?: string;
}

export function ProviderHealthManagement({ className }: ProviderHealthManagementProps) {
  const { data: phmData, loading: phmLoading } = useMissionControlData({ interval: 15000 }); // 15s polling
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  
  // Safe data extraction with fallbacks
  const providers = phmData?.live?.providers || {};
  const providerList = Object.entries(providers).map(([name, provider]: [string, any]) => ({
    id: name,
    name,
    status: provider?.status || 'unknown',
    failureCount: provider?.failureCount || 0,
    inRecovery: provider?.inRecovery || false,
    lastCheck: provider?.lastCheck || new Date().toISOString(),
    successRate: provider?.successRate || 0,
    avgResponseTime: provider?.avgResponseTime || 0,
    errorRate: provider?.errorRate || 0
  }));

  const runHealthCheck = async () => {
    try {
      console.log('Running health check...');
      // Simulate health check
    } catch (err) {
      console.error('Error running health check:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'online':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'warning':
      case 'degraded':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical':
      case 'offline':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'online':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning':
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'critical':
      case 'offline':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  if (phmLoading || !phmData) {
    return (
      <div className={`glass-card p-4 h-full ${className}`}>
        <div className="flex items-center justify-center h-48">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-card p-4 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-500" />
          <h3 className="text-lg font-semibold">Provider Health</h3>
        </div>
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={runHealthCheck}
            className="p-1 rounded hover:bg-gray-100"
          >
            <RefreshCw className="h-4 w-4 text-gray-600" />
          </motion.button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-blue-50 border-blue-200">
          <div className="text-xs font-medium text-blue-800 mb-1">Total Providers</div>
          <div className="text-xl font-bold text-blue-900">{providerList.length}</div>
        </div>
        <div className="p-3 rounded-lg bg-green-50 border-green-200">
          <div className="text-xs font-medium text-green-800 mb-1">Healthy</div>
          <div className="text-xl font-bold text-green-900">
            {providerList.filter(p => p.status === 'healthy' || p.status === 'online').length}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-red-50 border-red-200">
          <div className="text-xs font-medium text-red-800 mb-1">Issues</div>
          <div className="text-xl font-bold text-red-900">
            {providerList.filter(p => p.status === 'critical' || p.status === 'offline' || p.failureCount > 0).length}
          </div>
        </div>
      </div>

      {/* Provider List */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-2">
          {providerList.map((provider) => (
            <motion.div
              key={provider.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-lg border ${getStatusColor(provider.status)}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getStatusIcon(provider.status)}
                  <span className="font-medium">{provider.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {provider.inRecovery && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
                      Recovering
                    </span>
                  )}
                  {provider.failureCount > 0 && (
                    <span className="px-2 py-1 bg-red-100 text-red-800 rounded">
                      {provider.failureCount} failures
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  <span>{provider.successRate ? provider.successRate.toFixed(1) : '0'}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-gray-500" />
                  <span>{provider.avgResponseTime ? provider.avgResponseTime.toFixed(0) : '0'}ms</span>
                </div>
                <div className="flex items-center gap-1">
                  <Target className="h-3 w-3 text-blue-500" />
                  <span>{provider.errorRate ? provider.errorRate.toFixed(1) : '0'}%</span>
                </div>
              </div>

              <div className="mt-2 text-xs text-gray-500">
                Last check: {new Date(provider.lastCheck).toLocaleTimeString()}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
