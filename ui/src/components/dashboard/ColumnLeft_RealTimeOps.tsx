import { motion } from 'framer-motion';
import { useMissionControlData } from '@/hooks/useMissionControlData';
import { Activity, Shield, Zap, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { ThreatMatrix } from './widgets/ThreatMatrix';
import { LiveActivityFeed } from './widgets/LiveActivityFeed';

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.3 }
  }
};

export function ColumnLeft_RealTimeOps() {
  const { data, loading, error } = useMissionControlData();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-center">
          <Activity className="h-8 w-8 mx-auto mb-4 text-blue-500" />
          <p className="text-gray-300">Loading real-time data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-red-500" />
          <p className="text-red-400">Error loading data: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {/* Live Activity Feed - Top position */}
      <motion.div variants={item}>
        <LiveActivityFeed />
      </motion.div>

      {/* System Status Cards */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Circuit Breaker Status */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield className={`h-6 w-6 ${data?.live?.rateLimiting?.circuitBreakerState === 'CLOSED' ? 'text-green-500' : 'text-red-500'}`} />
            <h3 className="text-lg font-semibold">Circuit Breaker</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">State:</span>
              <span className={`font-medium ${data?.live?.rateLimiting?.circuitBreakerState === 'CLOSED' ? 'text-green-400' : 'text-red-400'}`}>
                {data?.live?.rateLimiting?.circuitBreakerState || 'Unknown'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Queue Size:</span>
              <span className="text-white font-medium">{data?.live?.queue?.currentSize || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Processed:</span>
              <span className="text-blue-400 font-medium">{data?.live?.queue?.totalProcessed || 0}</span>
            </div>
          </div>
        </div>

        {/* Request Activity */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="h-6 w-6 text-blue-500" />
            <h3 className="text-lg font-semibold">Activity</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Requests:</span>
              <span className="text-white font-medium">{data?.aggregated?.totalRequests || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Success Rate:</span>
              <span className="text-green-400 font-medium">{data?.aggregated?.successRate || 0}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Avg Response:</span>
              <span className="text-purple-400 font-medium">{Math.round(data?.aggregated?.avgResponseTime || 0)}ms</span>
            </div>
          </div>
        </div>

        {/* Provider Health */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="h-6 w-6 text-orange-500" />
            <h3 className="text-lg font-semibold">Providers</h3>
          </div>
          <div className="space-y-3">
            {data?.live?.providers ? Object.entries(data.live.providers).slice(0, 2).map(([name, provider]: [string, any]) => (
              <div key={name} className="flex justify-between items-center">
                <span className="text-gray-400 text-sm truncate">{name.split('-')[0]}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{provider.failureCount || 0} fails</span>
                  {provider.inRecovery ? (
                    <Clock className="h-3 w-3 text-yellow-400" />
                  ) : (
                    <CheckCircle className="h-3 w-3 text-green-400" />
                  )}
                </div>
              </div>
            )) : (
              <p className="text-gray-500 text-sm">No provider data</p>
            )}
          </div>
        </div>
      </motion.div>


      {/* Threat Matrix - Medium width widget */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <ThreatMatrix />
        </div>
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="h-6 w-6 text-yellow-500" />
            <h3 className="text-xl font-semibold">System Alerts</h3>
          </div>
          <div className="space-y-3">
            {data?.live?.rateLimiting?.circuitBreakerState !== 'CLOSED' && (
              <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <span className="text-red-400 font-medium">Circuit Breaker Open</span>
                </div>
                <p className="text-sm text-gray-300 mt-1">System is throttling requests</p>
              </div>
            )}
            {(data?.live?.queue?.currentSize || 0) > 50 && (
              <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-400" />
                  <span className="text-yellow-400 font-medium">High Queue Size</span>
                </div>
                <p className="text-sm text-gray-300 mt-1">{data?.live?.queue?.currentSize} requests queued</p>
              </div>
            )}
            {((data?.aggregated?.successRate || 100) < 90) && (
              <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-400" />
                  <span className="text-orange-400 font-medium">Low Success Rate</span>
                </div>
                <p className="text-sm text-gray-300 mt-1">Success rate below 90%</p>
              </div>
            )}
            {data?.live?.rateLimiting?.circuitBreakerState === 'CLOSED' && 
             (data?.live?.queue?.currentSize || 0) <= 50 && 
             (data?.aggregated?.successRate || 100) >= 90 && (
              <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span className="text-green-400 font-medium">System Healthy</span>
                </div>
                <p className="text-sm text-gray-300 mt-1">All systems operating normally</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

    </motion.div>
  );
}