import React from 'react';
import { motion } from 'framer-motion';
import { useMissionControlData } from '@/hooks/useMissionControlData';
import { 
  Trophy, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Zap,
  Clock,
  Star,
  BarChart3
} from 'lucide-react';

interface ModelPerformance {
  id: string;
  name: string;
  provider: string;
  totalRequests: number;
  successRate: number;
  avgResponseTime: number;
  costEstimate: number;
  tags: string[];
}

interface ModelPerformanceLeaderboardProps {
  className?: string;
}

export function ModelPerformanceLeaderboard({ className }: ModelPerformanceLeaderboardProps) {
  // Use mission control data with 10s polling
  const { data, loading } = useMissionControlData({
    interval: 10000, // 10 seconds as requested
    initialLoad: true,
    retryCount: 3,
  });

  // Transform data from useMissionControlData to ModelPerformance format
  const modelPerformance: ModelPerformance[] = React.useMemo(() => {
    // Protect against undefined data at all levels
    const modelStats = data?.aggregated?.modelStats || [];

    if (modelStats.length === 0) {
      // Return empty array if no real data available
      return [];
    }

    return modelStats.map((model, index) => {
      // Calculate success rate from available data with protection
      const totalRequests = model.totalRequests || 0;
      const successfulRequests = model.successfulRequests || 0;
      const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;

      // Generate tags based on model performance - use a function to avoid scoping issues
      const generateTags = (modelData: any, successRateValue: number) => {
        const modelTags: string[] = [];
        if (successRateValue > 95) modelTags.push('high-accuracy');
        if (modelData.avgResponseTime < 800) modelTags.push('fast-response');
        if (modelData.totalCost && totalRequests > 0 && (modelData.totalCost / totalRequests) < 0.003) {
          modelTags.push('cost-effective');
        }
        if (modelData.model && (modelData.model.includes('GPT') || modelData.model.toLowerCase().includes('claude'))) {
          modelTags.push('feature-rich');
        }
        return modelTags;
      };

      const modelTags = generateTags(model, successRate);

      return {
        id: `model-${index}`,
        name: model.model || 'Unknown Model',
        provider: model.provider || 'Unknown Provider',
        totalRequests,
        successRate: Math.round(successRate * 100) / 100,
        avgResponseTime: model.avgResponseTime || 0,
        costEstimate: model.totalCost || 0,
        tags: modelTags,
      };
    }).sort((a, b) => b.successRate - a.successRate);
  }, [data]);

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

  const getPerformanceColor = (successRate: number) => {
    if (successRate >= 95) return 'text-green-500';
    if (successRate >= 90) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getBestForTag = (model: ModelPerformance) => {
    if (model.tags.includes('high-accuracy') && model.tags.includes('fast-response')) {
      return 'Best for critical tasks';
    }
    if (model.tags.includes('cost-effective')) {
      return 'Best for bulk processing';
    }
    if (model.tags.includes('feature-rich')) {
      return 'Best for complex tasks';
    }
    return 'Standard performance';
  };

  return (
    <div className={`glass-card p-6 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Trophy className="h-6 w-6 text-yellow-500" />
          <h2 className="text-xl font-bold">Model Performance Leaderboard</h2>
        </div>
        <p className="text-sm text-gray-600">
          Ranked by success rate with cost estimates
        </p>
      </div>

      {/* Performance Leaderboard */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-3">
          {modelPerformance.map((model, index) => (
            <motion.div
              key={model.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`p-4 rounded-lg border ${
                index === 0 ? 'border-yellow-400 bg-yellow-50/30' : 
                index === 1 ? 'border-gray-300 bg-gray-50/20' : 
                index === 2 ? 'border-orange-200 bg-orange-50/20' : 
                'border-gray-200 bg-white/50'
              }`}
            >
              {/* Rank and Model Info */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0 ? 'bg-yellow-500 text-white' :
                    index === 1 ? 'bg-gray-400 text-white' :
                    index === 2 ? 'bg-orange-400 text-white' :
                    'bg-gray-200 text-gray-700'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      <span>{model.name}</span>
                      <Star className="h-4 w-4 text-yellow-500 fill-current" />
                    </div>
                    <div className="text-sm text-gray-600">{model.provider}</div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`text-lg font-bold ${getPerformanceColor(model.successRate)}`}>
                    {model.successRate}%
                  </div>
                  <div className="text-xs text-gray-500">Success Rate</div>
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span>{model.avgResponseTime}ms</span>
                </div>
                <div className="flex items-center gap-1">
                  <Zap className="h-4 w-4 text-gray-500" />
                  <span>{model.totalRequests.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4 text-gray-500" />
                  <span>${model.costEstimate}</span>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 mb-2">
                {model.tags.map((tag, tagIndex) => (
                  <span
                    key={tagIndex}
                    className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Best For */}
              <div className="text-xs text-gray-600 italic">
                {getBestForTag(model)}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-sm">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span>
              Top 3: Avg {
                modelPerformance.length >= 3 
                ? Math.round(modelPerformance.slice(0, 3).reduce((sum, m) => sum + m.successRate, 0) / 3)
                : Math.round(modelPerformance.reduce((sum, m) => sum + m.successRate, 0) / Math.max(modelPerformance.length, 1))
              }% success
            </span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span>
              All models: {
                modelPerformance.length > 0 
                ? Math.round(modelPerformance.reduce((sum, m) => sum + m.successRate, 0) / modelPerformance.length)
                : 0
              }% avg
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}