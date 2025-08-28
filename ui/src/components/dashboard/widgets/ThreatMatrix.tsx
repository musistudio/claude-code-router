import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMissionControlData } from '@/hooks/useMissionControlData';
import { 
  Shield, 
  Activity, 
  Zap, 
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw
} from 'lucide-react';

interface ThreatMatrixProps {
  className?: string;
}

interface RateLimitRule {
  name: string;
  current: number;
  limit: number;
  percentage: number;
  windowMs: number;
  timeUntilReset: number;
}

// Helper function to calculate time until reset
const calculateTimeUntilReset = (windowMs: number): number => {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return Math.ceil((windowStart + windowMs - now) / 1000);
};

export function ThreatMatrix({ className }: ThreatMatrixProps) {
  const { data, loading, error } = useMissionControlData({
    interval: 15000, // 15 seconds for threat matrix (longer interval)
    initialLoad: true,
    retryCount: 3,
  });

  // Use mission control data directly
  const stats = data?.live || null;

  if (loading || !stats) {
    return (
      <div className={`glass-card p-6 h-full ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin">
            <Activity className="h-8 w-8 text-blue-500" />
          </div>
        </div>
      </div>
    );
  }

  // Transform rate limit rules from data.live.rateLimiting.rulesUsage
  const threatRules: RateLimitRule[] = [];
  
  if (stats.rateLimiting?.rulesUsage) {
    // Extract usage data directly from rulesUsage
    const { perMinuteUsage, perHourUsage, perDayUsage, burstUsage } = stats.rateLimiting.rulesUsage;
    
    // Add per minute usage
    if (perMinuteUsage) {
      threatRules.push({
        name: 'Per Minute',
        current: perMinuteUsage.current || 0,
        limit: perMinuteUsage.limit || 100,
        percentage: perMinuteUsage.percentage || 0,
        windowMs: perMinuteUsage.windowMs || 60000,
        timeUntilReset: calculateTimeUntilReset(perMinuteUsage.windowMs || 60000)
      });
    }
    
    // Add per hour usage
    if (perHourUsage) {
      threatRules.push({
        name: 'Per Hour',
        current: perHourUsage.current || 0,
        limit: perHourUsage.limit || 100,
        percentage: perHourUsage.percentage || 0,
        windowMs: perHourUsage.windowMs || 3600000,
        timeUntilReset: calculateTimeUntilReset(perHourUsage.windowMs || 3600000)
      });
    }
    
    // Add per day usage
    if (perDayUsage) {
      threatRules.push({
        name: 'Per Day',
        current: perDayUsage.current || 0,
        limit: perDayUsage.limit || 100,
        percentage: perDayUsage.percentage || 0,
        windowMs: perDayUsage.windowMs || 86400000,
        timeUntilReset: calculateTimeUntilReset(perDayUsage.windowMs || 86400000)
      });
    }
    
    // Add burst usage
    if (burstUsage) {
      threatRules.push({
        name: 'Burst',
        current: burstUsage.current || 0,
        limit: burstUsage.limit || 100,
        percentage: burstUsage.percentage || 0,
        windowMs: burstUsage.windowMs || 60000,
        timeUntilReset: calculateTimeUntilReset(burstUsage.windowMs || 60000)
      });
    }
  }

  const getThreatLevel = (percentage: number): { level: 'low' | 'medium' | 'high' | 'critical'; color: string; icon: React.ReactNode } => {
    // Using the specified threat scoring rules:
    // Low Risk: <50% utilization
    // Medium Risk: 50-80% utilization  
    // High Risk: 80-95% utilization
    // Critical Risk: >95% utilization
    
    if (percentage >= 95) {
      return {
        level: 'critical',
        color: 'text-red-500',
        icon: <AlertTriangle className="h-4 w-4" />
      };
    } else if (percentage >= 80) {
      return {
        level: 'high',
        color: 'text-orange-500',
        icon: <TrendingUp className="h-4 w-4" />
      };
    } else if (percentage >= 50) {
      return {
        level: 'medium',
        color: 'text-yellow-500',
        icon: <Clock className="h-4 w-4" />
      };
    }
    return {
      level: 'low',
      color: 'text-green-500',
      icon: <TrendingDown className="h-4 w-4" />
    };
  };

  const getCircuitBreakerThreat = () => {
    const state = stats.rateLimiting?.circuitBreakerState || 'CLOSED';
    switch (state) {
      case 'OPEN':
        return {
          level: 'critical' as const,
          color: 'text-red-500',
          icon: <Shield className="h-4 w-4" />,
          message: 'Circuit Breaker OPEN - System Protected'
        };
      case 'HALF_OPEN':
        return {
          level: 'high' as const,
          color: 'text-orange-500',
          icon: <AlertTriangle className="h-4 w-4" />,
          message: 'Circuit Breaker HALF-OPEN - Monitoring'
        };
      default:
        return {
          level: 'low' as const,
          color: 'text-green-500',
          icon: <Shield className="h-4 w-4" />,
          message: 'Circuit Breaker CLOSED - Normal Operations'
        };
    }
  };

  const circuitThreat = getCircuitBreakerThreat();

  return (
    <div className={`glass-card p-6 h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg">
          <Shield className="h-6 w-6 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Threat Matrix</h3>
          <p className="text-sm text-gray-500">Rate Limit Pressure</p>
        </div>
      </div>

      {/* Circuit Breaker Status */}
      <div className={`mb-6 p-4 rounded-lg border-2 ${
        circuitThreat.level === 'critical' ? 'bg-red-50 border-red-200' :
        circuitThreat.level === 'high' ? 'bg-orange-50 border-orange-200' :
        'bg-green-50 border-green-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {circuitThreat.icon}
            <span className={`font-medium ${circuitThreat.color}`}>
              {circuitThreat.message}
            </span>
          </div>
          {stats?.rateLimiting?.circuitBreakerState === 'OPEN' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Reset
            </motion.button>
          )}
        </div>
      </div>

      {/* Rate Limit Rules */}
      <div className="space-y-4">
        {threatRules.map((rule) => {
          const threat = getThreatLevel(rule.percentage);
          const isCritical = rule.percentage >= 95;
          
          return (
            <motion.div
              key={rule.name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * threatRules.indexOf(rule) }}
              className={`p-4 rounded-lg border ${
                isCritical ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {threat.icon}
                  <span className="font-medium text-sm">{rule.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`text-sm font-medium ${threat.color}`}>
                    {rule.percentage}%
                  </span>
                  <div className={`w-2 h-2 rounded-full ${
                    isCritical ? 'bg-red-500 animate-pulse' :
                    threat.level === 'high' ? 'bg-orange-500' :
                    threat.level === 'medium' ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`} />
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <motion.div
                  className={`h-2 rounded-full ${
                    isCritical ? 'bg-red-500' :
                    threat.level === 'high' ? 'bg-orange-500' :
                    threat.level === 'medium' ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(rule.percentage, 100)}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{rule.current} / {rule.limit}</span>
                <div className="flex items-center space-x-1">
                  <Clock className="h-3 w-3" />
                  <span>{rule.timeUntilReset}s</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* System Pressure Indicator */}
      <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-700">System Pressure</div>
            <div className="text-xs text-gray-500">Combined threat level</div>
          </div>
          <div className="flex items-center space-x-2">
            {threatRules.some(rule => rule.percentage >= 95) ? (
              <div className="flex items-center space-x-1 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Critical</span>
              </div>
            ) : threatRules.some(rule => rule.percentage >= 80) ? (
              <div className="flex items-center space-x-1 text-orange-600">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-medium">High</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 text-green-600">
                <TrendingDown className="h-4 w-4" />
                <span className="text-sm font-medium">Normal</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 grid grid-cols-2 gap-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="p-2 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          <RefreshCw className="h-3 w-3 mx-auto mb-1" />
          <span>Refresh All</span>
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="p-2 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          <Zap className="h-3 w-3 mx-auto mb-1" />
          <span>View Details</span>
        </motion.button>
      </div>
    </div>
  );
}