/**
 * Advanced System API Routes
 * API pentru dashboard-ul sistemului sofisticat de resilience
 */

import { FastifyInstance } from 'fastify';
import { dynamicProviderDetector } from '../utils/dynamic-provider-detector';
import { readConfigFile } from '../utils';
import { executionGuard } from '../utils/ExecutionGuard'; // Added ExecutionGuard import

export function registerAdvancedSystemRoutes(app: FastifyInstance) {
  
  // === SISTEM OVERVIEW ===
  app.get('/api/advanced-system/overview', async (request, reply) => {
    try {
      const config = await readConfigFile();
      
      // Detectează provideri dinamici
      const detectedProviders = await dynamicProviderDetector.scanProvidersFromConfig(config);
      
      return {
        success: true,
        system: {
          name: 'Claude Code Router Advanced Resilience System',
          version: '1.0.0',
          features: ['ExecutionGuard (Retry, Queuing, Providers, Deduplication, Rate Limiting)', 'Dynamic Detection'],
          status: 'operational'
        },
        providers: {
          total: detectedProviders.length,
          online: detectedProviders.filter(p => p.status.isOnline).length,
          detected: detectedProviders.map(p => ({
            name: p.name,
            models: p.models,
            isOnline: p.status.isOnline,
            capabilities: p.capabilities,
            priority: p.priority
          }))
        },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // === API KEY POOL STATUS ===
  app.get('/api/advanced-system/api-keys/status', async (request, reply) => {
    try {
      const poolStats = googleAPIKeyPool.getPoolStats();
      const keyStatuses = googleAPIKeyPool.getAllKeyStatuses();
      
      return {
        success: true,
        data: {
          pool: poolStats,
          keys: keyStatuses,
          recommendations: generateKeyRecommendations(keyStatuses)
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // === EXPONENTIAL BACKOFF STATS ===
  app.get('/api/advanced-system/backoff/stats', async (request, reply) => {
    try {
      // Replaced exponentialBackoff.getStats() with executionGuard.getStats().retry
      const { retry: stats } = executionGuard.getStats();
      
      return {
        success: true,
        data: {
          ...stats,
          recommendations: generateBackoffRecommendations(stats)
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // === REQUEST QUEUE STATUS ===
  app.get('/api/advanced-system/queue/status', async (request, reply) => {
    try {
      // Replaced requestQueue.getStats() with executionGuard.getStats().queue
      const { queue: queueStats } = executionGuard.getStats();
      
      return {
        success: true,
        data: {
          ...queueStats,
          recommendations: generateQueueRecommendations(queueStats)
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // === PROVIDER FALLBACK STATUS ===
  app.get('/api/advanced-system/fallback/status', async (request, reply) => {
    try {
      // Replaced providerFallback.getProviderStatus() with executionGuard.getStats().providers
      const { providers: providerStatus } = executionGuard.getStats();
      
      return {
        success: true,
        data: {
          providers: providerStatus,
          recommendations: generateFallbackRecommendations(providerStatus)
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // === DYNAMIC PROVIDER DETECTOR ===
  app.get('/api/advanced-system/providers/detected', async (request, reply) => {
    try {
      const config = await readConfigFile();
      const detectedProviders = await dynamicProviderDetector.scanProvidersFromConfig(config);
      const providerStatus = dynamicProviderDetector.getProviderStatus();
      
      return {
        success: true,
        data: {
          detected: detectedProviders,
          status: providerStatus,
          capabilities: analyzeProviderCapabilities(detectedProviders),
          recommendations: generateProviderRecommendations(detectedProviders)
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // === REAL-TIME HEALTH CHECK ===
  app.get('/api/advanced-system/health', async (request, reply) => {
    try {
      const config = await readConfigFile();
      
      // Obține status de la toate componentele
      // Refactored to get all ExecutionGuard stats in one call
      const [
        poolStats,
        executionGuardStats, 
        detectedProviders
      ] = await Promise.all([
        googleAPIKeyPool.getPoolStats(),
        executionGuard.getStats(), 
        dynamicProviderDetector.scanProvidersFromConfig(config)
      ]);

      // Destructured relevant stats from ExecutionGuard using the correct mapping
      const { retry: backoffStats, queue: queueStats, providers: providerStatus } = executionGuardStats;

      // Calculează health score
      const healthScore = calculateSystemHealthScore({
        poolStats,
        backoffStats,
        queueStats,
        providerStatus,
        detectedProviders
      });

      return {
        success: true,
        health: {
          score: healthScore.score,
          status: healthScore.status,
          components: healthScore.components,
          issues: healthScore.issues,
          recommendations: healthScore.recommendations
        },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // === CONFIGURATION OPTIMIZER ===
  app.post('/api/advanced-system/optimize-config', async (request, reply) => {
    try {
      const config = await readConfigFile();
      const optimizedConfig = await optimizeSystemConfiguration(config);
      
      return {
        success: true,
        data: {
          original: config.optimization || {},
          optimized: optimizedConfig,
          improvements: analyzeConfigImprovements(config.optimization || {}, optimizedConfig)
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // === RESET SYSTEM COMPONENTS ===
  app.post('/api/advanced-system/reset/:component', async (request, reply) => {
    try {
      const component = (request.params as any).component;
      
      switch (component) {
        case 'backoff':
          // Old exponentialBackoff.reset() call removed.
          // As per clarification, ExecutionGuard does not have individual reset for backoff.
          return reply.status(501).send({ success: false, error: `Reset for '${component}' not directly available via ExecutionGuard API. Consider 'deduplication-cache' reset if applicable.` });
        case 'queue':
          // Old requestQueue.reset() call removed.
          // As per clarification, ExecutionGuard does not have individual reset for queue.
          return reply.status(501).send({ success: false, error: `Reset for '${component}' not directly available via ExecutionGuard API. Consider 'deduplication-cache' reset if applicable.` });
        case 'rate-limiter': // New case for rate limiter reset
          executionGuard.resetCircuitBreaker();
          break;
        case 'deduplication-cache': // New case for deduplication cache clear
          executionGuard.clearCache();
          break;
        case 'api-keys':
          googleAPIKeyPool.resetAllKeys();
          break;
        default:
          return { success: false, error: `Unknown component: ${component}` };
      }
      
      return {
        success: true,
        message: `${component} component reset successfully`
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

// === HELPER FUNCTIONS ===

function generateKeyRecommendations(keyStatuses: any): string[] {
  const recommendations = [];
  
  const totalKeys = Object.keys(keyStatuses).length;
  const availableKeys = Object.values(keyStatuses).filter((status: any) => status.isAvailable).length;
  
  if (availableKeys < totalKeys * 0.5) {
    recommendations.push('Peste 50% din chei sunt indisponibile - verificați quota și limitele');
  }
  
  if (totalKeys < 3) {
    recommendations.push('Recomandăm cel puțin 3 chei API pentru redundanță optimă');
  }
  
  return recommendations;
}

function generateBackoffRecommendations(stats: any): string[] {
  const recommendations = [];
  
  if (stats.retriesExecuted > stats.successfulExecutions * 0.3) {
    recommendations.push('Rata de retry e prea mare - considerați optimizarea spacing-ului între requesturi');
  }
  
  if (stats.maxRetryReached > 0) {
    recommendations.push('Unele requesturi au atins max retry - verificați conectivitatea providerilor');
  }
  
  return recommendations;
}

function generateQueueRecommendations(stats: any): string[] {
  const recommendations = [];
  
  if (stats.averageWaitTime > 5000) {
    recommendations.push('Timpul de așteptare în coadă e mare - considerați reducerea delay-ului');
  }
  
  if (stats.queuedRequests > 10) {
    recommendations.push('Coadă supraîncărcată - verificați performanța providerilor');
  }
  
  return recommendations;
}

function generateFallbackRecommendations(providerStatus: any): string[] {
  const recommendations = [];
  
  const providers = Object.keys(providerStatus);
  const failedProviders = providers.filter(p => providerStatus[p].consecutiveFailures > 3);
  
  if (failedProviders.length > 0) {
    recommendations.push(`Provideri cu probleme: ${failedProviders.join(', ')} - verificați configurația`);
  }
  
  return recommendations;
}

function generateProviderRecommendations(detectedProviders: any[]): string[] {
  const recommendations = [];
  
  const toolsProviders = detectedProviders.filter(p => p.capabilities.hasTools);
  if (toolsProviders.length < 2) {
    recommendations.push('Recomandăm cel puțin 2 provideri cu suport pentru tools');
  }
  
  const onlineProviders = detectedProviders.filter(p => p.status.isOnline);
  if (onlineProviders.length < detectedProviders.length * 0.8) {
    recommendations.push('Peste 20% din provideri sunt offline - verificați conectivitatea');
  }
  
  return recommendations;
}

function analyzeProviderCapabilities(detectedProviders: any[]) {
  return {
    totalProviders: detectedProviders.length,
    toolsCapable: detectedProviders.filter(p => p.capabilities.hasTools).length,
    highContext: detectedProviders.filter(p => p.capabilities.maxContextLength > 100000).length,
    streamingSupport: detectedProviders.filter(p => p.capabilities.supportsStreaming).length,
    averageResponseTime: Math.round(
      detectedProviders
        .filter(p => p.status.responseTime)
        .reduce((sum, p) => sum + p.status.responseTime, 0) / 
      detectedProviders.filter(p => p.status.responseTime).length
    ) || 0
  };
}

function calculateSystemHealthScore(data: any) {
  let score = 100;
  const issues = [];
  const recommendations = [];
  
  // API Keys Health
  const availableKeys = Object.values(data.poolStats.keys || {}).filter((k: any) => k.isAvailable).length;
  const totalKeys = Object.keys(data.poolStats.keys || {}).length;
  if (availableKeys < totalKeys * 0.7) {
    score -= 20;
    issues.push('API Keys: Multe chei sunt indisponibile');
    recommendations.push('Verificați quota și limitele pentru chei API');
  }
  
  // Backoff Health
  if (data.backoffStats.retriesExecuted > data.backoffStats.successfulExecutions * 0.5) {
    score -= 15;
    issues.push('Backoff: Rata de retry prea mare');
    recommendations.push('Optimizați spacing-ul între requesturi');
  }
  
  // Queue Health
  if (data.queueStats.averageWaitTime > 10000) {
    score -= 10;
    issues.push('Queue: Timp de așteptare mare');
    recommendations.push('Reduceți delay-ul în coadă sau adăugați provideri');
  }
  
  // Provider Health
  const onlineProviders = data.detectedProviders.filter((p: any) => p.status.isOnline).length;
  if (onlineProviders < data.detectedProviders.length * 0.8) {
    score -= 25;
    issues.push('Providers: Mulți provideri offline');
    recommendations.push('Verificați conectivitatea providerilor');
  }
  
  const status = score >= 80 ? 'healthy' : score >= 60 ? 'degraded' : 'critical';
  
  return {
    score: Math.max(0, score),
    status,
    components: {
      apiKeys: availableKeys >= totalKeys * 0.7 ? 'healthy' : 'degraded',
      backoff: data.backoffStats.retriesExecuted <= data.backoffStats.successfulExecutions * 0.5 ? 'healthy' : 'degraded',
      queue: data.queueStats.averageWaitTime <= 10000 ? 'healthy' : 'degraded',
      providers: onlineProviders >= data.detectedProviders.length * 0.8 ? 'healthy' : 'degraded'
    },
    issues,
    recommendations
  };
}

async function optimizeSystemConfiguration(config: any) {
  const optimization = config.optimization || {};
  
  // Optimizări bazate pe analiza sistemului
  const optimized = {
    tokenCalculation: 'fast', // Pentru performanță
    routingMode: 'smart',     // Pentru inteligență
    aiRequestControl: true,   // Pentru control
    cacheTTL: 30000,         // 30 secunde cache
    exponentialBackoff: {
      enabled: true,
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 16000,
      jitterEnabled: true
    },
    requestQueue: {
      enabled: true,
      defaultDelay: 2000,
      conservativeDelay: 3000,
      aggressiveDelay: 1000
    },
    providerFallback: {
      enabled: true,
      recoveryTime: 60000,
      maxChainLength: 3
    }
  };
  
  return optimized;
}

function analyzeConfigImprovements(original: any, optimized: any) {
  const improvements = [];
  
  if (!original.exponentialBackoff?.enabled && optimized.exponentialBackoff.enabled) {
    improvements.push('Exponential Backoff activat pentru resilience');
  }
  
  if (!original.requestQueue?.enabled && optimized.requestQueue.enabled) {
    improvements.push('Request Queue activat pentru traffic smoothing');
  }
  
  if (!original.providerFallback?.enabled && optimized.providerFallback.enabled) {
    improvements.push('Provider Fallback activat pentru redundanță');
  }
  
  if (original.tokenCalculation !== 'fast' && optimized.tokenCalculation === 'fast') {
    improvements.push('Token calculation optimizat pentru performanță');
  }
  
  return improvements;
}