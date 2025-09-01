import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Zap, 
  Activity,
  Play,
  Settings,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useSystemHealthChecker } from '@/hooks/useSystemHealthChecker';
import { type AutoFixAction } from '@/hooks/useSystemHealthChecker';
import { ActionButton } from '@/components/ui/ActionButton';
import { ModalWindow, ModalActions } from '@/components/ui/ModalWindow';
import { 
  StatusIndicator, 
  type StatusType 
} from '@/components/ui/StatusIndicator';
import { StatsCard } from '@/components/ui/StatsCard';

interface SystemHealthCheckerProps {
  className?: string;
}

export function SystemHealthChecker({ className }: SystemHealthCheckerProps) {
  const {
    systemHealth,
    alerts: rawAlerts,
    autoFixActions,
    loading,
    error,
    refetch,
    dismissAlert,
    executeAutoFix,
  } = useSystemHealthChecker({
    interval: 10000, // 10 seconds
    initialLoad: true,
    autoRefresh: true,
  });
  
  // Ensure alerts is always an array
  const alerts = Array.isArray(rawAlerts) ? rawAlerts : [];

  const [showAutoFix, setShowAutoFix] = useState(false);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [expandedAlerts, setExpandedAlerts] = useState<{[key: string]: boolean}>({});

  // Handle auto fix execution
  const handleExecuteAutoFix = async (actionId: string) => {
    setExecutingAction(actionId);
    try {
      await executeAutoFix(actionId);
    } catch (error) {
      console.error('Error executing auto-fix:', error);
    } finally {
      setExecutingAction(null);
    }
  };

  // Toggle alert expansion
  const toggleAlertExpansion = (alertId: string) => {
    setExpandedAlerts(prev => ({
      ...prev,
      [alertId]: !prev[alertId]
    }));
  };

  // Get overall status icon and color
  const getOverallStatus = () => {
    if (!systemHealth) return null;
    
    switch (systemHealth.overall) {
      case 'operational':
        return {
          icon: <CheckCircle className="h-6 w-6" />,
          color: 'text-green-500',
          bg: 'bg-green-50',
          border: 'border-green-200',
        };
      case 'issues':
        return {
          icon: <AlertTriangle className="h-6 w-6" />,
          color: 'text-yellow-500',
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
        };
      case 'critical':
        return {
          icon: <XCircle className="h-6 w-6" />,
          color: 'text-red-500',
          bg: 'bg-red-50',
          border: 'border-red-200',
        };
      default:
        return null;
    }
  };

  // Get status type from health level
  const getStatusType = (level: 'operational' | 'issues' | 'critical'): StatusType => {
    switch (level) {
      case 'operational': return 'success';
      case 'issues': return 'warning';
      case 'critical': return 'error';
      default: return 'info';
    }
  };

  const statusConfig = getOverallStatus();
  const hasCriticalAlerts = alerts.some(alert => alert.type === 'critical');
  const hasAutoFixableAlerts = alerts.some(alert => alert.autoFix);

  if (loading && !systemHealth) {
    return (
      <div className={`glass-card p-6 h-full ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center">
            <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mb-2" />
            <div className="text-blue-500 font-medium">Checking system health...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !systemHealth) {
    return (
      <div className={`glass-card p-6 h-full ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center text-red-500">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <div className="font-medium mb-1">Error Loading System Health</div>
            <div className="text-sm mb-4">{error || 'Failed to load system data'}</div>
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

  return (
    <div className={`glass-card p-6 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <div className={`p-4 rounded-lg border-2 ${statusConfig?.bg || 'bg-gray-50'} ${statusConfig?.border || 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={statusConfig?.color}>
                {statusConfig?.icon}
              </div>
              <div>
                <div className="text-lg font-semibold">
                  {systemHealth.overall.toUpperCase() + ' SYSTEM'}
                </div>
                <div className="text-sm text-gray-600">
                  Last checked: {new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAutoFix(!showAutoFix)}
                className={`p-2 rounded-lg flex items-center gap-1 text-sm ${
                  hasAutoFixableAlerts 
                    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Zap className="h-4 w-4" />
                <span>{hasAutoFixableAlerts ? 'Fix Issues' : 'No Fixes'}</span>
              </button>
              <ActionButton
                variant="secondary"
                size="small"
                onClick={refetch}
                loading={loading}
                className="p-2"
                icon={<RefreshCw className="h-4 w-4" />}
              >
                Refresh
              </ActionButton>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatsCard
          title="Providers Status"
          value={Object.values(systemHealth.components.providers).filter(p => p === 'online').length}
          change={{
            value: Object.values(systemHealth.components.providers).filter(p => p === 'offline').length,
            type: 'negative' as const,
            label: 'offline'
          }}
          status={getStatusType(systemHealth.overall)}
          icon={<Activity className="h-5 w-5" />}
        />
        <StatsCard
          title="Rate Limit"
          value={`${systemHealth.components.rateLimit.percentage.toFixed(0)}%`}
          change={{
            value: Math.abs(systemHealth.components.rateLimit.percentage - 100),
            type: systemHealth.components.rateLimit.percentage > 80 ? 'negative' as const : 'positive' as const,
            label: 'used'
          }}
          trend={systemHealth.components.rateLimit.percentage > 80 ? 'down' : 'stable'}
          status={getStatusType(systemHealth.overall)}
          icon={<Zap className="h-5 w-5" />}
        />
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="flex-1 overflow-auto">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              {hasCriticalAlerts ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-red-500">Critical Alerts</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span>System Alerts</span>
                </>
              )}
              <span className="text-xs text-gray-500">({alerts.length} items)</span>
            </h3>
          </div>

          <div className="space-y-3">
            {Array.isArray(alerts) ? alerts.map((alert) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-lg border ${
                  alert.type === 'critical' 
                    ? 'bg-red-50 border-red-200' 
                    : alert.type === 'warning'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusIndicator
                        status={alert.type === 'critical' ? 'error' : alert.type === 'warning' ? 'warning' : 'info'}
                        showIcon={false}
                        size="small"
                      />
                      <span className={`text-sm font-medium ${
                        alert.type === 'critical' ? 'text-red-700' : 
                        alert.type === 'warning' ? 'text-yellow-700' : 'text-blue-700'
                      }`}>
                        {alert.message}
                      </span>
                    </div>
                    
                    {alert.manualAction && expandedAlerts[alert.id] && (
                      <div className="mt-2">
                        <div className="text-xs text-gray-600 mb-1">Recommended Action:</div>
                        <div className="text-xs bg-white/50 p-2 rounded border">
                          {alert.manualAction}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1 ml-3">
                    {alert.autoFix && (
                      <ActionButton
                        variant="primary"
                        size="small"
                        loading={executingAction === alert.id}
                        onClick={() => {
                          const action = autoFixActions.find(a => 
                            a.description.toLowerCase().includes(alert.message.toLowerCase())
                          );
                          if (action) {
                            handleExecuteAutoFix(action.id);
                          }
                        }}
                        icon={executingAction === alert.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        className="p-1.5"
                      >
                        {executingAction === alert.id ? 'Fixing...' : 'Fix'}
                      </ActionButton>
                    )}
                    
                    <button
                      onClick={() => toggleAlertExpansion(alert.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                      title={expandedAlerts[alert.id] ? 'Collapse' : 'Expand'}
                    >
                      {expandedAlerts[alert.id] ? 
                        <ChevronUp className="h-4 w-4" /> : 
                        <ChevronDown className="h-4 w-4" />
                      }
                    </button>
                    
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                      title="Dismiss"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-2">
                  <div className="text-xs text-gray-500">
                    {alert.timestamp.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusIndicator
                      status={getStatusType(alert.type === 'critical' ? 'critical' : alert.type === 'warning' ? 'issues' : 'operational')}
                      showIcon={false}
                      size="small"
                    />
                    <span className="text-xs text-gray-600 capitalize">
                      {alert.type}
                    </span>
                  </div>
                </div>
              </motion.div>
            )) : (
              <div className="text-center text-gray-500 py-8">
                Nu există alerte de sistem.
              </div>
            )}
          </div>
        </div>
      )}

      {/* No alerts message */}
      {alerts.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-status-success-dark">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-status-success-dark" />
            <div className="text-lg font-medium text-on-dark-bg">All Systems Operational</div>
            <div className="text-sm text-on-dark-secondary mt-1">
              No alerts detected. System is running smoothly.
            </div>
          </div>
        </div>
      )}

      {/* Component Details */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-gray-600">Cache Health</div>
            <div className="font-medium">{systemHealth.components.cache.hitRate.toFixed(1)}% hit rate</div>
          </div>
          <div>
            <div className="text-gray-600">Active Routes</div>
            <div className="font-medium">
              {Object.values(systemHealth.components.routes).filter(r => r === 'active').length} active
            </div>
          </div>
          <div>
            <div className="text-gray-600">Rate Limit</div>
            <div className="font-medium">
              {systemHealth.components.rateLimit.percentage.toFixed(0)}% used
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Auto Fix Modal Component
interface AutoFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  actions: AutoFixAction[];
  onExecute: (actionId: string) => void;
  executingAction: string | null;
}

function AutoFixModal({ 
  isOpen, 
  onClose, 
  actions, 
  onExecute, 
  executingAction 
}: AutoFixModalProps) {
  return (
    <ModalWindow
      title="Auto-Fix Actions"
      isOpen={isOpen}
      onClose={onClose}
      size="normal"
      actions={
        <ModalActions
          onClose={onClose}
          onSave={() => {}}
          saveLabel="Close"
        />
      }
    >
      <div className="space-y-3">
        {Array.isArray(actions) ? actions.map((action) => (
          <div
            key={action.id}
            className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer"
            onClick={() => onExecute(action.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 mb-1">
                  {action.title}
                </h4>
                <p className="text-sm text-gray-600">
                  {action.description}
                </p>
              </div>
              <button
                className={`p-2 rounded ${
                  executingAction === action.id
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
                disabled={executingAction === action.id}
              >
                {executingAction === action.id ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        )) : (
          <div className="text-center text-gray-500 py-8">
            Nu există acțiuni disponibile.
          </div>
        )}
      </div>
    </ModalWindow>
  );
}