import { FastifyInstance } from 'fastify';
import { executionGuard } from '../utils/ExecutionGuard'; // Added ExecutionGuard import

/**
 * Request Optimization Routes
 * 
 * Provides comprehensive API endpoints for managing request deduplication
 * and rate limiting to prevent excessive Claude Code API consumption
 */
export function registerRequestOptimizationRoutes(app: FastifyInstance) {
  
  // DEDUPLICATION MANAGEMENT
  app.get('/api/optimization/deduplication', async (request, reply) => {
    try {
      // Replaced requestDeduplicationService.getDeduplicationStats() with executionGuard.getStats().deduplication
      const { deduplication: stats } = executionGuard.getStats();
      return {
        success: true,
        data: {
          ...stats,
          enabled: true, // TODO: Get from config
          description: 'Request deduplication prevents identical AI requests from being processed multiple times'
        }
      };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  app.post('/api/optimization/deduplication/clear', async (request, reply) => {
    try {
      // Replaced requestDeduplicationService.clearCache() with executionGuard.clearCache()
      executionGuard.clearCache();
      return { 
        success: true, 
        message: 'Deduplication cache cleared successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // RATE LIMITING MANAGEMENT
  app.get('/api/optimization/rate-limiter', async (request, reply) => {
    try {
      // Replaced rateLimiter.getStats() with executionGuard.getStats().rateLimiting
      const { rateLimiting: stats } = executionGuard.getStats();
      return {
        success: true,
        data: {
          ...stats,
          description: 'Rate limiting prevents API flooding and manages request quotas',
          recommendations: generateRecommendations(stats)
        }
      };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  app.post('/api/optimization/rate-limiter/reset', async (request, reply) => {
    try {
      // Replaced rateLimiter.resetCircuitBreaker() with executionGuard.resetCircuitBreaker()
      executionGuard.resetCircuitBreaker();
      return { 
        success: true, 
        message: 'Circuit breaker reset successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // COMBINED OPTIMIZATION STATUS
  app.get('/api/optimization/status', async (request, reply) => {
    try {
      // Refactored to get all ExecutionGuard stats in one call using correct property names
      const { deduplication: deduplicationStats, rateLimiting: rateLimiterStats } = executionGuard.getStats();

      const status = {
        deduplication: {
          ...deduplicationStats,
          status: deduplicationStats.totalDuplicateRequestsBlocked > 0 ? 'ACTIVE' : 'MONITORING'
        },
        rateLimiter: {
          ...rateLimiterStats,
          status: rateLimiterStats.circuitBreakerState
        },
        overall: {
          requestsSaved: deduplicationStats.totalDuplicateRequestsBlocked,
          apiConsumptionReduction: calculateConsumptionReduction(deduplicationStats, rateLimiterStats),
          health: determineOverallHealth(deduplicationStats, rateLimiterStats)
        }
      };

      return { success: true, data: status };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // CONFIGURATION MANAGEMENT
  app.post('/api/optimization/config', async (request, reply) => {
    try {
      const { deduplication, rateLimiter: rateLimiterConfig } = request.body as any;

      // Merge the incoming config parts into a single object suitable for ExecutionGuard.updateConfig
      const newConfig = {
        deduplication: deduplication,
        rateLimiting: rateLimiterConfig, // Use 'rateLimiting' for ExecutionGuard's internal config
        // ... other ExecutionGuard config parts if they exist and are relevant here
      };

      executionGuard.updateConfig(newConfig); // Use ExecutionGuard's unified updateConfig

      return { 
        success: true, 
        message: 'Optimization configuration updated',
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
}

/**
 * Generate recommendations based on current stats
 */
function generateRecommendations(stats: any): string[] {
  const recommendations: string[] = [];

  if (stats.circuitBreakerState === 'OPEN') {
    recommendations.push('⚠️ Circuit breaker is open - consider reducing request frequency');
  }

  if (stats.burstUsage?.percentage > 80) {
    recommendations.push('🔥 High burst activity detected - implement request queuing');
  }

  if (stats.perMinuteUsage?.percentage > 90) {
    recommendations.push('⏰ Approaching minute rate limit - consider caching');
  }

  if (stats.perHourUsage?.percentage > 95) {
    recommendations.push('📊 Near hourly limit - review usage patterns');
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Request patterns look healthy');
  }

  return recommendations;
}

/**
 * Calculate API consumption reduction percentage
 */
function calculateConsumptionReduction(deduplicationStats: any, rateLimiterStats: any): number {
  const requestsSaved = deduplicationStats.totalDuplicateRequestsBlocked || 0;
  const totalProcessed = deduplicationStats.totalCachedRequests || 0;
  
  if (totalProcessed === 0) return 0;
  
  return Math.round((requestsSaved / (totalProcessed + requestsSaved)) * 100);
}

/**
 * Determine overall system health
 */
function determineOverallHealth(deduplicationStats: any, rateLimiterStats: any): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
  if (rateLimiterStats.circuitBreakerState === 'OPEN') {
    return 'CRITICAL';
  }

  if (rateLimiterStats.burstUsage?.percentage > 90 || rateLimiterStats.perMinuteUsage?.percentage > 95) {
    return 'WARNING';
  }

  return 'HEALTHY';
}