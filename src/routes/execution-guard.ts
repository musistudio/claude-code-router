// src/routes/execution-guard.ts
import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { executionGuard, ExecutionStats } from '../utils/ExecutionGuard';

/**
 * ExecutionGuard Monitoring & Control Routes
 * 
 * Provides endpoints for monitoring ExecutionGuard statistics and 
 * manual control operations (reset circuit breaker, clear cache)
 */
export default async function executionGuardRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

  /**
   * GET /api/execution-guard/stats
   * Returns complete ExecutionGuard statistics, formatted for a dashboard.
   *
   * Reference: INTEGRATION_EXAMPLE.md, lines 93-110
   */
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Retrieve raw statistics from ExecutionGuard
      const stats = executionGuard.getStats() as ExecutionStats;

      // Format the response for dashboard display with AdvancedTab compatibility
      const formattedResponse = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(), // Returns uptime in seconds
        // AdvancedTab expects these structures at root level
        current: {
          activeRequests: stats.queue.currentSize || 0,
          avgResponseTime: stats.queue.averageWaitTime || 0,
          errorRate: 0 // Default error rate since ExecutionGuard doesn't track this directly
        },
        last1h: {
          totalRequests: stats.rateLimiting.totalRequestsTracked || 0,
          avgResponseTime: stats.queue.averageWaitTime || 0,
          errorRate: 0, // Default error rate
          topModels: [] // Empty array as default
        },
        last24h: {
          totalRequests: stats.rateLimiting.totalRequestsTracked || 0,
          avgResponseTime: stats.queue.averageWaitTime || 0,
          errorRate: 0, // Default error rate  
          topModels: [] // Empty array as default
        },
        executionGuard: {
          ...stats, // Include all raw stats
          summary: {
            cacheEfficiency: `${(stats.deduplication.cacheHitRate * 100).toFixed(1)}%`,
            requestsInQueue: stats.queue.currentSize,
            systemStatus: stats.rateLimiting.circuitBreakerState,
            avgResponseTime: `${stats.queue.averageWaitTime.toFixed(0)}ms`
          }
        }
      };

      return reply.send(formattedResponse);
    } catch (error) {
      console.error('Error fetching ExecutionGuard stats:', error);
      // Provide a generic error message for internal server errors
      return reply.status(500).send({ error: 'Failed to retrieve ExecutionGuard statistics' });
    }
  });

  /**
   * POST /api/execution-guard/reset
   * Allows manual control to reset specific ExecutionGuard components.
   *
   * Request Body: { "component": "circuit-breaker" | "cache" }
   * Reference: INTEGRATION_EXAMPLE.md, lines 113-129
   */
  fastify.post<{ Body: { component: string } }>('/reset', async (request, reply) => {
    const { component } = request.body;

    // Validate input: 'component' field must be a non-empty string
    if (typeof component !== 'string' || !component.trim()) {
      return reply.status(400).send({ 
        error: 'Invalid request body', 
        message: '`component` field is required and must be a non-empty string.' 
      });
    }

    try {
      switch (component.toLowerCase()) {
        case 'circuit-breaker':
          executionGuard.resetCircuitBreaker();
          return reply.send({ 
            success: true,
            message: 'Circuit breaker reset successfully',
            timestamp: new Date().toISOString()
          });
        case 'cache':
          executionGuard.clearCache();
          return reply.send({ 
            success: true,
            message: 'Cache cleared successfully',
            timestamp: new Date().toISOString()
          });
        case 'all':
          executionGuard.clearAllRecords();
          return reply.send({ 
            success: true,
            message: 'All ExecutionGuard records cleared successfully',
            timestamp: new Date().toISOString()
          });
        default:
          // Handle unrecognized component types
          return reply.status(400).send({ 
            error: 'Invalid component specified', 
            message: `Component '${component}' is not recognized. Valid components are 'circuit-breaker', 'cache', and 'all'.` 
          });
      }
    } catch (error) {
      console.error(`Error resetting ExecutionGuard component '${component}':`, error);
      // Provide a generic error message for internal server errors during reset
      return reply.status(500).send({ 
        success: false,
        error: `Failed to reset component '${component}'` 
      });
    }
  });

  /**
   * GET /api/execution-guard/health
   * Quick health check endpoint for ExecutionGuard system status
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = executionGuard.getStats() as ExecutionStats;
      
      // Determine overall health based on key metrics
      let healthStatus = 'healthy';
      const issues: string[] = [];
      
      if (stats.rateLimiting.circuitBreakerState === 'OPEN') {
        healthStatus = 'critical';
        issues.push('Circuit breaker is OPEN');
      }
      
      if (stats.queue.currentSize > 50) {
        healthStatus = healthStatus === 'critical' ? 'critical' : 'warning';
        issues.push('Queue size is high');
      }
      
      if (stats.queue.averageWaitTime > 10000) {
        healthStatus = healthStatus === 'critical' ? 'critical' : 'warning';
        issues.push('Average wait time is high');
      }

      return reply.send({
        status: healthStatus,
        timestamp: new Date().toISOString(),
        issues: issues.length > 0 ? issues : ['System operating normally'],
        metrics: {
          circuitBreakerState: stats.rateLimiting.circuitBreakerState,
          queueSize: stats.queue.currentSize,
          cacheHitRate: `${(stats.deduplication.cacheHitRate * 100).toFixed(1)}%`,
          avgWaitTime: `${stats.queue.averageWaitTime.toFixed(0)}ms`
        }
      });
    } catch (error) {
      console.error('Error checking ExecutionGuard health:', error);
      return reply.status(500).send({ 
        status: 'error',
        error: 'Failed to check system health',
        timestamp: new Date().toISOString()
      });
    }
  });
}