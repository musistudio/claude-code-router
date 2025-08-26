import { FastifyInstance } from 'fastify';
import { analytics } from '../utils/analytics';

export async function analyticsRoutes(fastify: FastifyInstance) {
  // Get real-time statistics
  fastify.get('/api/analytics/realtime', async (request, reply) => {
    try {
      const stats = analytics.getRealtimeStats();
      return { success: true, data: stats };
    } catch (error) {
      reply.code(500);
      return { success: false, error: 'Failed to get realtime stats' };
    }
  });

  // Get model statistics
  fastify.get('/api/analytics/models', async (request, reply) => {
    try {
      const stats = analytics.getModelStats();
      return { success: true, data: stats };
    } catch (error) {
      reply.code(500);
      return { success: false, error: 'Failed to get model stats' };
    }
  });

  // Get recent requests
  fastify.get('/api/analytics/requests', async (request, reply) => {
    try {
      const query = request.query as { limit?: string };
      const limit = parseInt(query.limit || '50');
      const requests = analytics.getRecentRequests(limit);
      return { success: true, data: requests };
    } catch (error) {
      reply.code(500);
      return { success: false, error: 'Failed to get recent requests' };
    }
  });

  // Get time-series data for charts
  fastify.get('/api/analytics/timeseries', async (request, reply) => {
    try {
      const query = request.query as { hours?: string };
      const hours = parseInt(query.hours || '24');
      const data = analytics.getTimeSeriesData(hours);
      return { success: true, data };
    } catch (error) {
      reply.code(500);
      return { success: false, error: 'Failed to get time series data' };
    }
  });

  // Get model comparison data
  fastify.get('/api/analytics/comparison', async (request, reply) => {
    try {
      const models = analytics.getModelStats();
      
      // Create comparison data
      const comparison = models.map(model => ({
        name: model.model,
        provider: model.provider,
        requests: model.totalRequests,
        successRate: ((model.successfulRequests / model.totalRequests) * 100).toFixed(1),
        avgResponseTime: Math.round(model.avgResponseTime),
        totalTokens: model.totalTokens,
        totalCost: model.totalCost.toFixed(4),
        lastUsed: model.lastUsed,
        popularity: model.popularityScore,
        errorRate: model.errorRate.toFixed(1)
      }));

      return { success: true, data: comparison };
    } catch (error) {
      reply.code(500);
      return { success: false, error: 'Failed to get comparison data' };
    }
  });

  // Get usage analytics by time period
  fastify.get('/api/analytics/usage/:period', async (request, reply) => {
    try {
      const params = request.params as { period: string };
      const period = params.period; // 'hour', 'day', 'week', 'month'
      
      let hours = 24;
      switch (period) {
        case 'hour': hours = 1; break;
        case 'day': hours = 24; break;
        case 'week': hours = 24 * 7; break;
        case 'month': hours = 24 * 30; break;
      }

      const data = analytics.getTimeSeriesData(hours);
      
      // Aggregate data by the requested period
      const aggregated = aggregateByPeriod(data, period);
      
      return { success: true, data: aggregated };
    } catch (error) {
      reply.code(500);
      return { success: false, error: 'Failed to get usage analytics' };
    }
  });

  // Get top performing models
  fastify.get('/api/analytics/top-models', async (request, reply) => {
    try {
      const query = request.query as { metric?: string; limit?: string };
      const metric = query.metric || 'requests'; // 'requests', 'responseTime', 'successRate'
      const limit = parseInt(query.limit || '10');

      const models = analytics.getModelStats();
      
      let sortedModels = [...models];
      switch (metric) {
        case 'requests':
          sortedModels.sort((a, b) => b.totalRequests - a.totalRequests);
          break;
        case 'responseTime':
          sortedModels.sort((a, b) => a.avgResponseTime - b.avgResponseTime);
          break;
        case 'successRate':
          sortedModels.sort((a, b) => 
            ((b.successfulRequests / b.totalRequests) - (a.successfulRequests / a.totalRequests))
          );
          break;
        case 'popularity':
          sortedModels.sort((a, b) => b.popularityScore - a.popularityScore);
          break;
      }

      const topModels = sortedModels.slice(0, limit).map(model => ({
        model: model.model,
        provider: model.provider,
        value: getMetricValue(model, metric),
        totalRequests: model.totalRequests,
        lastUsed: model.lastUsed
      }));

      return { success: true, data: topModels };
    } catch (error) {
      reply.code(500);
      return { success: false, error: 'Failed to get top models' };
    }
  });

  // Get cost analytics
  fastify.get('/api/analytics/costs', async (request, reply) => {
    try {
      const models = analytics.getModelStats();
      
      const costBreakdown = models.map(model => ({
        model: model.model,
        provider: model.provider,
        totalCost: model.totalCost,
        costPerRequest: model.totalRequests > 0 ? (model.totalCost / model.totalRequests) : 0,
        totalTokens: model.totalTokens,
        costPerToken: model.totalTokens > 0 ? (model.totalCost / model.totalTokens) : 0
      })).sort((a, b) => b.totalCost - a.totalCost);

      const totalCost = models.reduce((sum, model) => sum + model.totalCost, 0);
      const totalTokens = models.reduce((sum, model) => sum + model.totalTokens, 0);
      const totalRequests = models.reduce((sum, model) => sum + model.totalRequests, 0);

      return { 
        success: true, 
        data: {
          breakdown: costBreakdown,
          summary: {
            totalCost: totalCost.toFixed(4),
            totalTokens,
            totalRequests,
            avgCostPerRequest: totalRequests > 0 ? (totalCost / totalRequests).toFixed(4) : '0',
            avgCostPerToken: totalTokens > 0 ? (totalCost / totalTokens).toFixed(6) : '0'
          }
        }
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: 'Failed to get cost analytics' };
    }
  });
}

// Helper function to aggregate data by period
function aggregateByPeriod(data: any[], period: string) {
  // This is a simplified aggregation - you might want more sophisticated grouping
  return data.map(point => ({
    ...point,
    period: formatPeriod(point.timestamp, period)
  }));
}

// Helper function to format period
function formatPeriod(timestamp: number, period: string): string {
  const date = new Date(timestamp);
  
  switch (period) {
    case 'hour':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    case 'day':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'week':
      const week = Math.floor(date.getDate() / 7) + 1;
      return `Week ${week}`;
    case 'month':
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    default:
      return date.toLocaleString();
  }
}

// Helper function to get metric value
function getMetricValue(model: any, metric: string): number {
  switch (metric) {
    case 'requests':
      return model.totalRequests;
    case 'responseTime':
      return Math.round(model.avgResponseTime);
    case 'successRate':
      return Math.round((model.successfulRequests / model.totalRequests) * 100 * 10) / 10;
    case 'popularity':
      return model.popularityScore;
    default:
      return 0;
  }
}
