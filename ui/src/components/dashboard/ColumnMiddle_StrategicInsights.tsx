import React from 'react';
import { motion } from 'framer-motion';
import { useMissionControlData } from '@/hooks/useMissionControlData';
import { Trophy, TrendingUp, TrendingDown, Clock, Star, BarChart3, Zap } from 'lucide-react';
import { RouteEfficiencyMatrix } from './widgets/RouteEfficiencyMatrix';
import { HistoricalPerformanceGraphs } from './widgets/HistoricalPerformanceGraphs';
import { ModelPerformanceLeaderboard } from './widgets/ModelPerformanceLeaderboard';

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

export function ColumnMiddle_StrategicInsights() {
  const { data, loading, error } = useMissionControlData();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-center">
          <BarChart3 className="h-8 w-8 mx-auto mb-4 text-purple-500" />
          <p className="text-gray-300">Loading strategic insights...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <TrendingDown className="h-8 w-8 mx-auto mb-4 text-red-500" />
          <p className="text-red-400">Error loading insights: {error}</p>
        </div>
      </div>
    );
  }

  // Get top performing models from real data
  const topModels = data?.aggregated?.modelStats?.slice(0, 5) || [];

  return (
    <motion.div
      className="space-y-6"
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {/* Performance Overview Cards */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="h-6 w-6 text-yellow-500" />
            <h3 className="text-lg font-semibold">Top Performance</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Best Success Rate:</span>
              <span className="text-green-400 font-medium">
                {Math.max(...(topModels.map(m => 100 - (m.errorRate || 0)) || [0])).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Fastest Response:</span>
              <span className="text-blue-400 font-medium">
                {Math.min(...(topModels.map(m => m.avgResponseTime || Infinity) || [0])).toFixed(0)}ms
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Most Used:</span>
              <span className="text-purple-400 font-medium">
                {topModels[0]?.model?.split('/')[1]?.split(':')[0] || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="h-6 w-6 text-green-500" />
            <h3 className="text-lg font-semibold">System Health</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Overall Success:</span>
              <span className="text-green-400 font-medium">{data?.aggregated?.successRate || 0}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Avg Response:</span>
              <span className="text-blue-400 font-medium">{Math.round(data?.aggregated?.avgResponseTime || 0)}ms</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Active Models:</span>
              <span className="text-purple-400 font-medium">{topModels.length}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Model Performance & Route Efficiency - Two columns layout */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ModelPerformanceLeaderboard />
        <RouteEfficiencyMatrix />
      </motion.div>

      {/* Quick Insights */}
      <motion.div variants={item} className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Zap className="h-6 w-6 text-blue-500" />
          <h3 className="text-lg font-semibold">Quick Insights</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-blue-400" />
              <span className="font-medium">Performance Tip</span>
            </div>
            <p className="text-gray-300">
              {data?.aggregated?.avgResponseTime && data.aggregated.avgResponseTime > 10000 
                ? "Consider optimizing slow models or implementing caching for better response times."
                : "Response times are within acceptable ranges. System performing well."}
            </p>
          </div>
          
          <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <span className="font-medium">Success Rate</span>
            </div>
            <p className="text-gray-300">
              {data?.aggregated?.successRate && data.aggregated.successRate > 95 
                ? "Excellent success rate! System reliability is high."
                : "Monitor error rates and consider implementing retry mechanisms."}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Historical Performance Graphs - Full width widget */}
      <motion.div variants={item}>
        <HistoricalPerformanceGraphs />
      </motion.div>
    </motion.div>
  );
}