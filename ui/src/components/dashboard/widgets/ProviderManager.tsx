import React, { useState } from 'react';
import { 
  RefreshCw, 
  Play, 
  Eye, 
  History,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap
} from 'lucide-react';
import { useProviderManager } from '@/hooks/useProviderManager';
import { 
  ActionButton 
} from '@/components/ui/ActionButton';
import { 
  StatusIndicator 
} from '@/components/ui/StatusIndicator';
import type { StatusType } from '@/components/ui/StatusIndicator';
import { 
  ModalWindow, 
  ModalActions 
} from '@/components/ui/ModalWindow';
import { MiniLogs } from '@/components/ui/MiniLogs';
import { StatsCard } from '@/components/ui/StatsCard';
import type { Provider } from '@/types/dashboard';

interface ProviderManagerProps {
  className?: string;
}

export function ProviderManager({ className = '' }: ProviderManagerProps) {
  const {
    providers,
    loading,
    error,
    refetch,
    lastUpdated
  } = useProviderManager();

  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: 'success' | 'error' | 'pending'; message: string }>>({});

  // Handle provider switch
  const handleSwitchProvider = (providerId: string) => {
    console.log(`Switching to provider: ${providerId}`);
    // In a real implementation, this would make an API call
    // For now, we'll just show a mock success
    alert(`Switching to provider: ${providerId}`);
  };

  // Handle test connection
  const handleTestConnection = async (providerId: string) => {
    setTestingProvider(providerId);
    setTestResults(prev => ({
      ...prev,
      [providerId]: { status: 'pending', message: 'Testing connection...' }
    }));

    try {
      // In a real implementation, this would make an API call
      // For demo purposes, we'll simulate a successful test
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setTestResults(prev => ({
        ...prev,
        [providerId]: { status: 'success', message: 'Connection successful!' }
      }));
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setTestResults(prev => {
          const newResults = { ...prev };
          delete newResults[providerId];
          return newResults;
        });
      }, 3000);
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [providerId]: { status: 'error', message: 'Connection failed' }
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  // Handle view history
  const handleViewHistory = (provider: Provider) => {
    setSelectedProvider(provider);
    setShowHistory(true);
  };

  // Get status type from provider status
  const getStatusType = (status: 'online' | 'offline' | 'degraded'): StatusType => {
    switch (status) {
      case 'online': return 'success';
      case 'degraded': return 'warning';
      case 'offline': return 'error';
      default: return 'info';
    }
  };

  // Get status icon
  const getStatusIcon = (status: 'online' | 'offline' | 'degraded') => {
    switch (status) {
      case 'online': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'degraded': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'offline': return <XCircle className="h-5 w-5 text-red-500" />;
      default: return <Shield className="h-5 w-5 text-gray-500" />;
    }
  };

  if (loading && !providers) {
    return (
      <div className={`glass-card p-6 h-full ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center">
            <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mb-2" />
            <div className="text-blue-500 font-medium">Loading provider status...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !providers) {
    return (
      <div className={`glass-card p-6 h-full ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center text-red-500">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <div className="font-medium mb-1">Error Loading Provider Data</div>
            <div className="text-sm mb-4">{error || 'Failed to load provider data'}</div>
            <ActionButton 
              variant="primary" 
              onClick={refetch}
              loading={loading}
            >
              Retry
            </ActionButton>
          </div>
        </div>
      </div>
    );
  }

  // Calculate overall status
  const onlineProviders = providers.filter(p => p.status === 'online').length;
  const degradedProviders = providers.filter(p => p.status === 'degraded').length;
  const offlineProviders = providers.filter(p => p.status === 'offline').length;
  
  const overallStatus = offlineProviders > 0 
    ? 'error' 
    : degradedProviders > 0 
      ? 'warning' 
      : 'success';

  return (
    <div className={`widget-container p-6 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Zap className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Provider Manager</h2>
              <p className="text-sm text-gray-400">
                Manage and monitor all LLM providers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500">
              Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Never'}
            </div>
            <ActionButton
              variant="secondary"
              size="small"
              onClick={refetch}
              loading={loading}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Refresh
            </ActionButton>
          </div>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatsCard
          title="Online Providers"
          value={onlineProviders}
          status="success"
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatsCard
          title="Degraded Providers"
          value={degradedProviders}
          status="warning"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatsCard
          title="Offline Providers"
          value={offlineProviders}
          status="error"
          icon={<XCircle className="h-5 w-5" />}
        />
      </div>

      {/* Provider List */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-4">
          {Array.isArray(providers) ? providers.map((provider) => (
            <div 
              key={provider.id}
              className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:bg-gray-800/70 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(provider.status)}
                    <div>
                      <h3 className="font-medium text-white">{provider.name}</h3>
                      <div className="flex items-center gap-2 text-xs">
                        <StatusIndicator 
                          status={getStatusType(provider.status)} 
                          text={`${provider.uptime.toFixed(1)}% uptime`} 
                          size="small" 
                        />
                        <span className="text-gray-400">
                          {provider.responseTime}ms avg
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {testResults[provider.id] && (
                    <div className={`text-xs px-2 py-1 rounded ${
                      testResults[provider.id].status === 'success' 
                        ? 'bg-green-500/20 text-green-400' 
                        : testResults[provider.id].status === 'error' 
                          ? 'bg-red-500/20 text-red-400' 
                          : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {testResults[provider.id].message}
                    </div>
                  )}
                  
                  <ActionButton
                    variant="secondary"
                    size="small"
                    onClick={() => handleSwitchProvider(provider.id)}
                    icon={<Play className="h-3 w-3" />}
                  >
                    Switch
                  </ActionButton>
                  
                  <ActionButton
                    variant="secondary"
                    size="small"
                    loading={testingProvider === provider.id}
                    onClick={() => handleTestConnection(provider.id)}
                    icon={<Eye className="h-3 w-3" />}
                  >
                    Test
                  </ActionButton>
                  
                  <ActionButton
                    variant="secondary"
                    size="small"
                    onClick={() => handleViewHistory(provider)}
                    icon={<History className="h-3 w-3" />}
                  >
                    History
                  </ActionButton>
                </div>
              </div>
              
              {/* Provider details */}
              <div className="mt-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  <span className="text-gray-400">
                    {provider.outages} outages today
                  </span>
                  <span className="text-gray-400">
                    Last check: {new Date(provider.lastCheck).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Models:</span>
                  <div className="flex gap-1">
                    {Array.isArray(provider.modelOverrides) ? provider.modelOverrides.slice(0, 2).map((override, index) => (
                      <span 
                        key={index} 
                        className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs"
                      >
                        {override.route}
                      </span>
                    )) : null}
                    {Array.isArray(provider.modelOverrides) && provider.modelOverrides.length > 2 && (
                      <span className="px-2 py-0.5 bg-gray-500/20 text-gray-400 rounded text-xs">
                        +{provider.modelOverrides.length - 2}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )) : (
            <div className="text-center text-gray-500 py-8">
              Nu există provideri disponibili.
            </div>
          )}
        </div>
      </div>

      {/* Failover Automation Section */}
      <div className="mt-6 pt-4 border-t border-gray-700/50">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-white">Failover Automation</h3>
          <div className="flex items-center gap-2">
            <div className={`text-xs px-2 py-1 rounded ${
              overallStatus === 'success' 
                ? 'bg-green-500/20 text-green-400' 
                : overallStatus === 'warning' 
                  ? 'bg-yellow-500/20 text-yellow-400' 
                  : 'bg-red-500/20 text-red-400'
            }`}>
              {overallStatus === 'success' ? 'All systems operational' : 
               overallStatus === 'warning' ? 'Degraded performance' : 'Service disruption'}
            </div>
            <ActionButton
              variant="primary"
              size="small"
              onClick={() => alert('Configuring failover automation...')}
            >
              Configure
            </ActionButton>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Automatic failover when providers become unavailable
        </p>
      </div>

      {/* Provider History Modal */}
      <ModalWindow
        title={selectedProvider ? `${selectedProvider.name} History` : 'Provider History'}
        isOpen={showHistory && selectedProvider !== null}
        onClose={() => setShowHistory(false)}
        size="large"
      >
        {selectedProvider && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <div className="text-sm text-gray-400">Current Status</div>
                <div className="font-medium text-white flex items-center gap-2 mt-1">
                  {getStatusIcon(selectedProvider.status)}
                  {selectedProvider.status.charAt(0).toUpperCase() + selectedProvider.status.slice(1)}
                </div>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <div className="text-sm text-gray-400">Uptime</div>
                <div className="font-medium text-white">{selectedProvider.uptime.toFixed(2)}%</div>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-white mb-2">Recent Activity</h4>
              <MiniLogs 
                logs={[]} // In a real implementation, this would be actual logs
                maxItems={10}
                showTimestamp={true}
                maxHeight="300px"
              />
            </div>
            
            <div>
              <h4 className="font-medium text-white mb-2">Model Overrides</h4>
              <div className="space-y-2">
                {Array.isArray(selectedProvider.modelOverrides) ? selectedProvider.modelOverrides.map((override, index) => (
                  <div 
                    key={index} 
                    className="p-3 bg-gray-800/50 rounded-lg flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium text-white">{override.route}</div>
                      <div className="text-sm text-gray-400">
                        {override.configuredModel} → {override.actualModel}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(override.timestamp).toLocaleString()}
                    </div>
                  </div>
                )) : (
                  <div className="text-center text-gray-500 py-4">
                    Nu există overrides disponibile.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </ModalWindow>
    </div>
  );
}