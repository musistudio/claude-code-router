import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useConfig } from '@/components/ConfigProvider';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
}

interface SystemMetric {
  name: string;
  value: string;
  status: 'good' | 'warning' | 'error';
  icon: string;
}

export function SystemTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<SystemMetric[]>([
    { name: 'CPU Usage', value: 'N/A', status: 'warning', icon: 'microchip' },
    { name: 'Memory', value: 'N/A', status: 'warning', icon: 'memory' },
    { name: 'Network', value: 'N/A', status: 'warning', icon: 'network-wired' },
    { name: 'Disk I/O', value: 'N/A', status: 'warning', icon: 'hdd' }
  ]);
  const [logFilter, setLogFilter] = useState<string>('all');

  useEffect(() => {
    // Load real system logs instead of generating fake ones
    const loadRealLogs = async () => {
      try {
        // Try to load real logs from API if available
        // For now, show empty logs instead of fake ones
        setLogs([]);
      } catch (error) {
        console.error('Error loading system logs:', error);
        setLogs([]);
      }
    };

    loadRealLogs();
    
    // Refresh logs every 10 seconds
    const interval = setInterval(loadRealLogs, 10000);

    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logFilter === 'all' 
    ? logs 
    : logs.filter(log => log.level === logFilter);

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'debug': return 'text-blue-400 bg-blue-500/20';
      case 'info': return 'text-green-400 bg-green-500/20';
      case 'warning': return 'text-yellow-400 bg-yellow-500/20';
      case 'error': return 'text-red-400 bg-red-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  const getBorderColor = (level: string) => {
    switch (level) {
      case 'debug': return 'border-l-blue-500';
      case 'info': return 'border-l-green-500';
      case 'warning': return 'border-l-yellow-500';
      case 'error': return 'border-l-red-500';
      default: return 'border-l-gray-500';
    }
  };

  return (
    <div className="space-y-8">
      {/* System Metrics */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center gap-4 mb-6">
          <i className="fas fa-server text-2xl text-green-500"></i>
          <h2 className="text-2xl font-bold">System Health</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          {metrics.map((metric, index) => (
            <motion.div
              key={metric.name}
              className="bg-black/20 p-4 rounded-lg border border-white/10"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <div className="flex items-center gap-3 mb-2">
                <i className={`fas fa-${metric.icon} text-lg ${
                  metric.status === 'good' ? 'text-green-400' :
                  metric.status === 'warning' ? 'text-yellow-400' : 'text-red-400'
                }`}></i>
                <span className="text-sm text-gray-400">{metric.name}</span>
              </div>
              <div className={`text-xl font-bold ${
                metric.status === 'good' ? 'text-green-400' :
                metric.status === 'warning' ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {metric.value}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Real-time Logs */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <i className="fas fa-terminal text-2xl text-blue-500"></i>
            <h3 className="text-xl font-bold">Real-time System Logs</h3>
          </div>
          
          <div className="flex items-center gap-4">
            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              className="px-3 py-1 bg-black/20 border border-white/20 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Logs</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
            
            <button className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 hover:bg-blue-500/30 transition-colors">
              <i className="fas fa-download mr-2"></i>
              Export
            </button>
          </div>
        </div>

        <div className="bg-black/40 rounded-lg border border-white/10 max-h-96 overflow-y-auto">
          <div className="p-4 space-y-2">
            {filteredLogs.map((log, index) => (
              <motion.div
                key={log.id}
                className={`flex items-center gap-3 p-3 rounded bg-white/5 border-l-4 ${getBorderColor(log.level)} hover:bg-white/10 transition-colors`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.02 }}
              >
                <span className="text-gray-400 font-mono text-xs min-w-[80px]">
                  {log.timestamp}
                </span>
                
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase min-w-[70px] text-center ${getLogLevelColor(log.level)}`}>
                  {log.level}
                </span>
                
                <span className="text-white text-sm flex-1 font-mono">
                  {log.message}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
        
        {filteredLogs.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <i className="fas fa-filter text-2xl mb-2"></i>
            <p>No logs found for the selected filter.</p>
          </div>
        )}
      </motion.div>

      {/* Quick Actions */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <div className="flex items-center gap-4 mb-6">
          <i className="fas fa-tools text-2xl text-purple-500"></i>
          <h3 className="text-xl font-bold">Quick Actions</h3>
        </div>

        <div className="flex flex-wrap gap-3">
          {[
            { name: 'Restart Service', icon: 'redo', color: 'blue' },
            { name: 'Clear Cache', icon: 'trash-alt', color: 'yellow' },
            { name: 'Export Config', icon: 'download', color: 'green' },
            { name: 'System Report', icon: 'file-alt', color: 'purple' },
            { name: 'Health Check', icon: 'heartbeat', color: 'red' }
          ].map((action, index) => (
            <motion.button
              key={action.name}
              className={`px-4 py-2 bg-${action.color}-500/20 text-${action.color}-400 rounded-lg border border-${action.color}-500/30 hover:bg-${action.color}-500/30 transition-colors font-medium`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
            >
              <i className={`fas fa-${action.icon} mr-2`}></i>
              {action.name}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
