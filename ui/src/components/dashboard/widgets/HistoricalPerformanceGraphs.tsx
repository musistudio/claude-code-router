import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAggregatedData } from '@/contexts/MissionControlContext';
import { useAggregatedMissionControl } from '@/hooks/useMissionControlData';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  AreaChart,
  BarChart,
  Bar
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle,
  BarChart3,
  Calendar,
  Clock,
  RefreshCw
} from 'lucide-react';

interface HistoricalPerformanceGraphsProps {
  className?: string;
}

interface HistoricalData {
  timestamp: string;
  requests: number;
  successRate: number;
  avgResponseTime: number;
  errorRate: number;
}

// Transformăm datele istorice pentru compatibilitate
const transformHistoricalData = (historical: any[]): any[] => {
  if (!historical || !Array.isArray(historical)) {
    return [];
  }
  return historical.map(point => ({
    timestamp: point.time || point.timestamp,
    requests: point.requests,
    successRate: point.successRate,
    avgResponseTime: point.avgResponseTime,
    errorRate: 100 - point.successRate
  }));
};

export function HistoricalPerformanceGraphs({ className }: HistoricalPerformanceGraphsProps) {
  const aggregatedData = useAggregatedData();
  const { data: missionControlData, loading, error, refetch } = useAggregatedMissionControl();

  // Transformăm datele istorice disponibile
  const historicalData = missionControlData?.historical ? transformHistoricalData(missionControlData.historical) : [];


  if (loading) {
    return (
      <div className={`glass-card p-6 h-full ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin">
            <BarChart3 className="h-8 w-8 text-blue-500" />
          </div>
        </div>
      </div>
    );
  }

  const chartData = historicalData.length > 0 ? historicalData : [];

  // Calculate trends (with fallbacks for empty data)
  const lastDataPoint = chartData.length > 0 ? chartData[chartData.length - 1] : { requests: 0, successRate: 0, avgResponseTime: 0, errorRate: 0 };
  const firstDataPoint = chartData.length > 0 ? chartData[0] : { requests: 0, successRate: 0, avgResponseTime: 0, errorRate: 0 };
  
  const requestTrend = lastDataPoint.requests - firstDataPoint.requests;
  const successTrend = lastDataPoint.successRate - firstDataPoint.successRate;
  const responseTrend = lastDataPoint.avgResponseTime - firstDataPoint.avgResponseTime;

  // Performance summary with safe calculations
  const totalRequests = chartData.reduce((sum, d) => sum + d.requests, 0);
  const avgSuccessRate = chartData.length > 0 ? chartData.reduce((sum, d) => sum + d.successRate, 0) / chartData.length : 0;
  const avgResponseTime = chartData.length > 0 ? chartData.reduce((sum, d) => sum + d.avgResponseTime, 0) / chartData.length : 0;
  const peakRequests = chartData.length > 0 ? Math.max(...chartData.map(d => d.requests)) : 0;

  return (
    <div className={`glass-card p-6 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-blue-500" />
            <h2 className="text-xl font-bold">Historical Performance</h2>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={refetch}
            disabled={loading}
            className="p-2 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </motion.button>
        </div>
        <p className="text-sm text-gray-600">
          24-hour performance trends with error overlays
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {totalRequests.toLocaleString()}
          </div>
          <div className="text-xs text-gray-600">Total Requests</div>
          {chartData.length > 0 && (
            <div className={`text-xs flex items-center justify-center gap-1 ${
              requestTrend > 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {requestTrend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(requestTrend > 0 ? requestTrend : 0).toFixed(0)}%
            </div>
          )}
        </div>
        
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {avgSuccessRate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-600">Avg Success Rate</div>
          <div className={`text-xs flex items-center justify-center gap-1 ${
            successTrend > 0 ? 'text-green-500' : 'text-red-500'
          }`}>
            {successTrend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(successTrend).toFixed(1)}%
          </div>
        </div>
        
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">
            {avgResponseTime.toFixed(0)}ms
          </div>
          <div className="text-xs text-gray-600">Avg Response Time</div>
          <div className={`text-xs flex items-center justify-center gap-1 ${
            responseTrend < 0 ? 'text-green-500' : 'text-red-500'
          }`}>
            {responseTrend < 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(responseTrend).toFixed(0)}ms
          </div>
        </div>
        
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">
            {peakRequests.toLocaleString()}
          </div>
          <div className="text-xs text-gray-600">Peak Requests</div>
          <div className="text-xs text-gray-500">
            <Clock className="h-3 w-3 inline mr-1" />
            {chartData.find(d => d.requests === peakRequests)?.timestamp}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="flex-1 space-y-6">
        {/* Request Volume Chart */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Request Volume</h3>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                  labelStyle={{ color: '#f9fafb' }}
                  formatter={(value) => [value, 'Requests']}
                />
                <Area
                  type="monotone"
                  dataKey="requests"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.2}
                  strokeWidth={2}
                  animationDuration={800}
                  animationEasing="ease-in-out"
                  isAnimationActive={true}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Success Rate vs Error Rate Chart */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Success vs Error Rate</h3>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.slice(-12)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                  labelStyle={{ color: '#f9fafb' }}
                  formatter={(value, name) => [`${value}%`, name === 'successRate' ? 'Success Rate' : 'Error Rate']}
                />
                <Bar dataKey="successRate" fill="#10b981" name="Success Rate (%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="errorRate" fill="#ef4444" name="Error Rate (%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Response Time Trend */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Response Time Trend</h3>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                  labelStyle={{ color: '#f9fafb' }}
                  formatter={(value) => [`${value}ms`, 'Response Time']}
                />
                <Line
                  type="monotone"
                  dataKey="avgResponseTime"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  animationDuration={800}
                  animationEasing="ease-in-out"
                  isAnimationActive={true}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Performance Insights */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
          <div className="text-sm text-gray-700">
            <span className="font-medium">Performance Insights:</span> 
            {avgSuccessRate < 90 && ' High error rates detected - consider implementing retry mechanisms.'}
            {avgResponseTime > 1000 && ' Response times above 1s may impact user experience.'}
            {peakRequests > 200 && ' Peak loads detected - consider scaling during business hours.'}
            {((avgSuccessRate >= 90) && (avgResponseTime <= 1000) && (peakRequests <= 200)) && ' System performance is within optimal ranges.'}
          </div>
        </div>
      </div>
    </div>
  );
}