import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouteEfficiency } from '@/hooks/useRouteEfficiency';
import { 
  Route, 
  Zap, 
  Clock, 
  DollarSign, 
  TrendingUp, 
  Brain,
  AlertCircle,
  CheckCircle,
  Target,
  Lightbulb
} from 'lucide-react';

interface RouteEfficiency {
  id: string;
  name: string;
  path: string;
  model: string;
  provider: string;
  avgResponseTime: number;
  successRate: number;
  costPerRequest: number;
  efficiencyScore: number;
  suggestions: string[];
}

interface RouteEfficiencyMatrixProps {
  className?: string;
}

export function RouteEfficiencyMatrix({ className }: RouteEfficiencyMatrixProps) {
  const { routes, stats, summary, isLoading, error, refetch } = useRouteEfficiency();

  // Map real route efficiency data to RouteEfficiency interface
  const routeEfficiencyData = useMemo(() => {
    if (!routes || routes.length === 0) {
      return [];
    }

    return routes.map((routeData, index) => {
      // Get corresponding stats for additional information
      const routeStats = stats.find(s => s.route === routeData.route);
      
      // Get provider from models data if available
      const primaryModelKey = routeStats ? Object.keys(routeStats.models)[0] : null;
      const provider = primaryModelKey ? primaryModelKey.split('_')[0] : 'Unknown';
      
      // Generate AI suggestions based on real performance data
      const suggestions: string[] = [];
      
      // Latency-based suggestions
      if (routeData.avgResponseTime > 2000) {
        suggestions.push(`High latency detected (${routeData.avgResponseTime}ms) - consider model optimization`);
      } else if (routeData.avgResponseTime > 1000) {
        suggestions.push(`Consider faster models for better response time`);
      }
      
      // Success rate suggestions
      if (routeData.successRate < 85) {
        suggestions.push(`Low success rate (${routeData.successRate}%) - investigate error patterns`);
      } else if (routeData.successRate < 95) {
        suggestions.push(`Success rate could be improved - check request patterns`);
      }
      
      // Cost optimization suggestions
      if (routeData.cost > 0.01) {
        suggestions.push(`High cost per request ($${routeData.cost.toFixed(4)}) - evaluate cost optimization`);
      }
      
      // Usage-based suggestions
      if (routeData.requests < 10) {
        suggestions.push(`Low usage route - consider consolidation with similar routes`);
      }
      
      // Route-specific suggestions based on actual performance
      if (routeData.route === 'think' && routeData.avgResponseTime > 1500) {
        suggestions.push('Think route optimization: Consider streaming responses for better UX');
      }
      
      if (routeData.route === 'background' && routeData.avgResponseTime > 1000) {
        suggestions.push('Background processing could be faster - evaluate lighter models');
      }
      
      if (routeData.route === 'webSearch' && routeData.avgResponseTime > 3000) {
        suggestions.push('Web search showing high latency - check external API performance');
      }
      
      // If no specific suggestions, provide general optimization
      if (suggestions.length === 0 && routeData.efficiency < 90) {
        suggestions.push('Consider A/B testing alternative models for this route');
      }
      
      if (suggestions.length === 0) {
        suggestions.push('Route performing well - monitor for consistency');
      }

      return {
        id: `route-${index}`,
        name: routeData.route.charAt(0).toUpperCase() + routeData.route.slice(1) + ' Route',
        path: `/${routeData.route}`,
        model: routeData.model,
        provider: provider,
        avgResponseTime: routeData.avgResponseTime,
        successRate: routeData.successRate,
        costPerRequest: routeData.cost,
        efficiencyScore: (() => {
          // Calculate efficiency score using weighted formula from improvement plan
          const successWeight = 0.4;
          const speedWeight = 0.3;
          const costWeight = 0.2;
          const reliabilityWeight = 0.1;
          
          const successScore = routeData.successRate;
          const speedScore = Math.max(0, 100 - (routeData.avgResponseTime / 100));
          const costScore = Math.max(0, 100 - (routeData.cost * 10000));
          const reliabilityScore = Math.max(0, 100 - ((100 - routeData.successRate) / 10));
          
          return Math.round(
            (successScore * successWeight) +
            (speedScore * speedWeight) + 
            (costScore * costWeight) +
            (reliabilityScore * reliabilityWeight)
          );
        })(),
        suggestions,
      };
    }).sort((a, b) => b.efficiencyScore - a.efficiencyScore);
  }, [routes, stats]);

  // Handle loading state
  if (isLoading) {
    return (
      <div className={`glass-card p-6 h-full ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin">
            <Route className="h-8 w-8 text-blue-500" />
          </div>
        </div>
      </div>
    );
  }

  // Handle error state - show message and retry button
  if (error) {
    return (
      <div className={`glass-card p-6 h-full ${className}`}>
        <div className="flex flex-col items-center justify-center h-64">
          <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
          <div className="text-red-500 mb-4">Error loading route efficiency: {error}</div>
          <button 
            onClick={refetch}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Use computed route efficiency data
  const routeEfficiency = routeEfficiencyData;

  const getEfficiencyColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 75) return 'text-yellow-500';
    if (score >= 60) return 'text-orange-500';
    return 'text-red-500';
  };

  const getEfficiencyBadge = (score: number) => {
    if (score >= 90) return { color: 'bg-green-100 text-green-800', label: 'Excellent' };
    if (score >= 75) return { color: 'bg-yellow-100 text-yellow-800', label: 'Good' };
    if (score >= 60) return { color: 'bg-orange-100 text-orange-800', label: 'Fair' };
    return { color: 'bg-red-100 text-red-800', label: 'Poor' };
  };

  return (
    <div className={`glass-card p-6 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Target className="h-6 w-6 text-purple-500" />
          <h2 className="text-xl font-bold">Route Efficiency Matrix</h2>
          <div className="ml-auto text-sm text-gray-600">
            Real-time data from analytics
          </div>
        </div>
        <p className="text-sm text-gray-600">
          AI-powered optimization suggestions based on real performance data
        </p>
      </div>

      {/* Efficiency Matrix */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-4">
          {routeEfficiency.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              No route data available. Routes will appear here after first usage.
            </div>
          ) : (
            routeEfficiency.map((route, index) => (
              <motion.div
                key={route.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-4 rounded-lg border border-gray-200 bg-white/50"
              >
                {/* Route Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Route className="h-5 w-5 text-gray-600" />
                    <div>
                      <div className="font-semibold">{route.name}</div>
                      <div className="text-sm text-gray-600 flex items-center gap-2">
                        <span>{route.path}</span>
                        <span>→</span>
                        <span className="font-mono">{route.model} ({route.provider})</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${getEfficiencyColor(route.efficiencyScore)}`}>
                      {route.efficiencyScore}
                    </div>
                    <div className="text-xs text-gray-500">Efficiency Score</div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span>{route.avgResponseTime}ms</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>{route.successRate}%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4 text-gray-500" />
                    <span>${route.costPerRequest.toFixed(4)}</span>
                  </div>
                  <div>
                    <span className={`px-2 py-1 text-xs rounded-full ${getEfficiencyBadge(route.efficiencyScore).color}`}>
                      {getEfficiencyBadge(route.efficiencyScore).label}
                    </span>
                  </div>
                </div>

                {/* AI Suggestions */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Lightbulb className="h-4 w-4 text-purple-500" />
                    <span>AI Optimization Suggestions:</span>
                  </div>
                  {route.suggestions.map((suggestion, suggestionIndex) => (
                    <motion.div
                      key={suggestionIndex}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 + suggestionIndex * 0.05 }}
                      className="flex items-start gap-2 text-sm text-gray-700 bg-purple-50 p-2 rounded"
                    >
                      <Brain className="h-3 w-3 text-purple-500 mt-0.5 flex-shrink-0" />
                      <span>{suggestion}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Total routes analyzed: {routeEfficiency.length}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span>
              Avg efficiency: {routeEfficiency.length > 0 ? Math.round(routeEfficiency.reduce((sum, r) => sum + (r.efficiencyScore || 0), 0) / routeEfficiency.length) : 0}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}