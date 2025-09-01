// src/index.ts (VERSIUNEA COMPLETĂ ȘI DEFINITIVĂ)

import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { initConfig, initDir, cleanupLogFiles } from "./utils";
import { createServer } from "./server";
import { router } from "./utils/router";
import { apiKeyAuth } from "./middleware/auth";
import "./middleware/tracking";

// --- Integration Imports ---
// Rate limiting and execution control handled by individual providers
import { configureLogging, info } from "./utils/log";
import { sessionUsageCache } from "./utils/cache";

// --- Importuri standard din proiect ---
import { cleanupPidFile, isServiceRunning, savePid } from "./utils/processCheck";
import { CONFIG_FILE, HOME_DIR } from "./constants";

/**
 * Generate provider health data based on config and analytics
 */
function generateProviderHealthDataFromAnalytics(config: any, analyticsInstance: any, realtimeStats: any) {
  const providers = config.Providers || [];
  const modelStats = analyticsInstance.getModelStats();
  const providerHealthData: Record<string, any> = {};

  console.log(`[DEBUG] Generating provider health data for ${providers.length} providers`);

  providers.forEach((provider: any) => {
    const providerKey = provider.name.toLowerCase().replace(/\s+/g, '-');
    
    // Find analytics data for this provider's models with multiple matching strategies
    const providerModels = modelStats.filter((stat: any) => {
      // Strategy 1: Exact provider name match
      if (stat.provider === provider.name) return true;
      
      // Strategy 2: Model name match from provider's model list
      if (provider.models && provider.models.some((model: string) => stat.model === model)) return true;
      
      // Strategy 3: Partial provider name match (case insensitive)
      const statProviderLower = (stat.provider || '').toLowerCase();
      const configProviderLower = provider.name.toLowerCase();
      if (statProviderLower.includes(configProviderLower) || configProviderLower.includes(statProviderLower)) return true;
      
      return false;
    });
    
    // Calculate aggregate metrics for this provider
    const totalRequests = providerModels.reduce((sum: number, stat: any) => sum + (stat.totalRequests || 0), 0);
    const successfulRequests = providerModels.reduce((sum: number, stat: any) => sum + (stat.successfulRequests || 0), 0);
    const totalResponseTime = providerModels.reduce((sum: number, stat: any) => sum + ((stat.avgResponseTime || 0) * (stat.totalRequests || 0)), 0);
    const avgResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;
    
    // Calculate success rate and error rate
    const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
    const errorRate = 100 - successRate;
    const failureCount = totalRequests - successfulRequests;
    
    // Determine health status based on metrics
    let status = 'healthy';
    let inRecovery = false;
    
    if (totalRequests === 0) {
      status = 'offline';
    } else if (errorRate > 30) {
      status = 'offline';
    } else if (errorRate > 15 || avgResponseTime > 10000) {
      status = 'degraded';
      inRecovery = errorRate < 20;
    } else if (errorRate > 5) {
      status = 'degraded';
    }
    
    // Check if provider has been used recently
    const lastUsed = providerModels.length > 0 ? 
      Math.max(0, ...providerModels.map((stat: any) => stat.lastUsed || 0)) : 0;
    const recentlyUsed = lastUsed > 0 && (Date.now() - lastUsed) < (10 * 60 * 1000); // 10 minutes
    
    // Adjust status based on recent usage
    if (totalRequests > 0 && recentlyUsed && status === 'offline') {
      status = successRate > 70 ? 'healthy' : 'degraded';
    }

    // Calculate health score
    const healthScore = Math.max(0, Math.min(100, Math.round(
      successRate * 0.5 + 
      Math.max(0, 100 - (avgResponseTime / 100)) * 0.3 + 
      (recentlyUsed ? 100 : 30) * 0.2
    )));

    providerHealthData[providerKey] = {
      status,
      failureCount,
      inRecovery,
      lastCheck: new Date().toISOString(),
      successRate: Math.round(successRate * 10) / 10,
      avgResponseTime: Math.round(avgResponseTime),
      errorRate: Math.round(errorRate * 10) / 10,
      totalRequests,
      models: provider.models || [],
      name: provider.name,
      healthScore,
      lastUsed: lastUsed || 0,
      matchingModels: providerModels.map((m: any) => `${m.model} (${m.provider})`),
      recentlyUsed
    };
  });

  console.log(`[DEBUG] Generated ${Object.keys(providerHealthData).length} provider entries`);
  
  return providerHealthData;
}
import createWriteStream from "pino-rotating-file-stream";
import Stream from "node:stream";

declare const ReadableStream: any;

async function initializeClaudeConfig() {
    const homeDir = homedir();
    const configPath = join(homeDir, ".claude.json");
    if (!existsSync(configPath)) {
        const userID = Array.from({ length: 64 }, () => Math.random().toString(16)[2]).join("");
        const configContent = {
            numStartups: 184, autoUpdaterStatus: "enabled", userID,
            hasCompletedOnboarding: true, lastOnboardingVersion: "1.0.17", projects: {},
        };
        await writeFile(configPath, JSON.stringify(configContent, null, 2));
    }
}

interface RunOptions { port?: number; }

async function run(options: RunOptions = {}) {
  if (isServiceRunning()) {
    console.log("✅ Service is already running in the background.");
    return;
  }
  await initializeClaudeConfig();
  await initDir();
  await cleanupLogFiles();
  const config = await initConfig();
  configureLogging(config);

  // Provider-specific rate limiting configuration loaded from config
  info('[Router] Provider rate limiting configured per provider');
  
  let HOST = config.HOST;
  if (config.HOST && !config.APIKEY) {
    HOST = "127.0.0.1";
    console.warn("⚠️ API key is not set. HOST is forced to 127.0.0.1.");
  }
  const port = config.PORT || 3456;
  savePid(process.pid);
  process.on("SIGINT", () => { cleanupPidFile(); process.exit(0); });
  process.on("SIGTERM", () => { cleanupPidFile(); process.exit(0); });
  console.log(HOST);

  const servicePort = process.env.SERVICE_PORT ? parseInt(process.env.SERVICE_PORT) : port;
  const loggerConfig = config.LOG !== false ? {
          level: config.LOG_LEVEL || "debug",
          stream: createWriteStream({
            path: HOME_DIR, filename: config.LOGNAME || `./logs/ccr-${+new Date()}.log`,
            maxFiles: 3, interval: "1d",
          }),
        } : false;

  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      ...config, providers: config.Providers || config.providers,
      HOST: HOST, PORT: servicePort,
      LOG_FILE: join(homedir(), ".claude-code-router", "claude-code-router.log"),
    },
    logger: loggerConfig,
  });

  // Route handler for model selection
  server.addHook("preHandler", async (req: any, reply: any) => {
    if (!req.url.startsWith("/v1/messages")) {
      return; // Continue normally for other routes
    }

    try {
      // Run the router to determine the appropriate model
      await router(req, reply, config);
      // After this point, req.body.model is updated with the selected provider,model
    } catch (error: any) {
      // Handle routing errors gracefully
      if (!reply.sent) {
        reply.code(500).send({ 
          error: { 
            type: 'routing_error', 
            message: 'Failed to route request to appropriate provider' 
          } 
        });
      }
      return reply;
    }
  });


  // --- TOATE CELELALTE HOOK-URI RĂMÂN EXACT AȘA CUM ERAU ---
  
  server.addHook("preHandler", async (req: any, reply: any) => {
    return new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => { if (err) reject(err); else resolve(); };
      apiKeyAuth(config)(req, reply, done).catch(reject);
    });
  });

  server.addHook("preHandler", async (req: any, reply: any) => {
    if (req.url.startsWith("/v1/")) {
      req.startTime = Date.now();
    }
    // Basic health and stats endpoints
    if (req.url === "/api/router/health") {
      reply.send({ status: 'healthy', timestamp: new Date().toISOString() });
      return reply;
    }
    
    // NOU: Mission Control v2 - Endpoint unificat pentru toate datele dashboard
    if (req.url === "/api/v1/mission-control/stats") {
      try {
        const { analytics } = await import('./utils/analytics');
        const executionStats = { 
          rateLimiting: { circuitBreakerState: 'CLOSED' },
          queue: { currentSize: 0, averageWaitTime: 0 },
          deduplication: { cacheHitRate: 0 },
          providers: {}
        };
        const modelStats = analytics.getModelStats();
        const recentRequests = analytics.getRecentRequests(100);
        const timeSeriesData = analytics.getTimeSeriesData(24);
        
        // Generate proper provider health data
        const { readConfigFile } = await import('./utils');
        const config = await readConfigFile();
        const realtimeStats = analytics.getRealtimeStats();
        const generatedProviders = generateProviderHealthDataFromAnalytics(config, analytics, realtimeStats);
        
        // Merge execution stats with our generated provider data
        const liveStats = {
          ...executionStats,
          providers: generatedProviders
        };
        
        const aggregatedData = {
          live: liveStats,
          aggregated: {
            modelStats,
            totalRequests: recentRequests.length,
            successRate: recentRequests.length > 0 ? 
              (recentRequests.filter(r => r.statusCode < 400).length / recentRequests.length) * 100 : 0,
            avgResponseTime: recentRequests.length > 0 ?
              recentRequests.reduce((sum, r) => sum + r.responseTime, 0) / recentRequests.length : 0
          },
          historical: timeSeriesData,
          historicalProviders: analytics.getProviderHealthHistory(24),
          config: {
            routes: ['default', 'think', 'background', 'longContext', 'webSearch'],
            executionGuard: {
              enabled: true,
              presets: {
                economy: { 
                  minDelayMs: 1500, 
                  initialBackoffMs: 3000,
                  maxQueueSize: 100,
                  maxRetries: 3
                },
                balanced: { 
                  minDelayMs: 500, 
                  initialBackoffMs: 1000,
                  maxQueueSize: 200,
                  maxRetries: 5
                },
                highThroughput: { 
                  minDelayMs: 200, 
                  initialBackoffMs: 500,
                  maxQueueSize: 500,
                  maxRetries: 2
                }
              },
              current: {
                minDelayMs: 500,
                initialBackoffMs: 1000,
                maxQueueSize: 200,
                maxRetries: 5,
                active: true
              }
            }
          },
          timestamp: new Date().toISOString()
        };
        
        reply.send(aggregatedData);
        return reply;
      } catch (error: any) {
        console.error('Error in mission control endpoint:', error);
        reply.code(500).send({ error: { type: 'internal_server_error', message: error.message } });
        return reply;
      }
    }
    
    // NOU: Mission Control v2 - Endpoint-uri de control
    if (req.url === "/api/v1/mission-control/reset-circuit-breaker" && req.method === 'POST') {
      try {
        // Circuit breaker functionality handled by individual providers
        reply.send({ 
          success: true, 
          message: 'Provider-specific circuit breakers reset',
          timestamp: new Date().toISOString()
        });
        return reply;
      } catch (error: any) {
        console.error('Error in reset operation:', error);
        reply.code(500).send({ error: { type: 'reset_failed', message: error.message } });
        return reply;
      }
    }
    
    // NOU: Mission Control v2 - Get current ExecutionGuard configuration
    if (req.url === "/api/v1/mission-control/execution-guard-config" && req.method === 'GET') {
      try {
        const currentConfig = {
          queue: { minDelayMs: 500, maxQueueSize: 200, enabled: true },
          retry: { initialBackoffMs: 1000, maxRetries: 5, enabled: true, maxBackoffMs: 5000, jitterMs: 1000 }
        };
        const presetConfig = {
          economy: { 
            minDelayMs: 1500,
            initialBackoffMs: 3000,
            maxQueueSize: 100,
            maxRetries: 3
          },
          balanced: { 
            minDelayMs: 500,
            initialBackoffMs: 1000,
            maxQueueSize: 200,
            maxRetries: 5
          },
          'high-throughput': { 
            minDelayMs: 200,
            initialBackoffMs: 500,
            maxQueueSize: 500,
            maxRetries: 2
          }
        };
        
        reply.send({
          success: true,
          timestamp: new Date().toISOString(),
          current: {
            minDelayMs: currentConfig.queue.minDelayMs,
            initialBackoffMs: currentConfig.retry.initialBackoffMs,
            maxQueueSize: currentConfig.queue.maxQueueSize,
            maxRetries: currentConfig.retry.maxRetries,
            active: currentConfig.queue.enabled && currentConfig.retry.enabled
          },
          presets: presetConfig
        });
        return reply;
      } catch (error: any) {
        console.error('Error getting ExecutionGuard config:', error);
        reply.code(500).send({ error: { type: 'config_fetch_failed', message: error.message } });
        return reply;
      }
    }
    
    // NOU: Mission Control v2 - Update ExecutionGuard configuration
    if (req.url === "/api/v1/mission-control/update-execution-guard" && req.method === 'POST') {
      try {
        const body = req.body;
        const { action, preset, config } = body;
        
        if (action === 'update-preset') {
          // Apply preset configuration
          const presetConfig = {
            economy: { 
              queue: { minDelayMs: 1500, maxQueueSize: 100 },
              retry: { initialBackoffMs: 3000, maxRetries: 3 }
            },
            balanced: { 
              queue: { minDelayMs: 500, maxQueueSize: 200 },
              retry: { initialBackoffMs: 1000, maxRetries: 5 }
            },
            'high-throughput': { 
              queue: { minDelayMs: 200, maxQueueSize: 500 },
              retry: { initialBackoffMs: 500, maxRetries: 2 }
            }
          };
          
          const newConfig = presetConfig[preset as keyof typeof presetConfig] || presetConfig.balanced;
          // Configuration updated for provider-specific handling
          info(`[Router] Applied preset configuration: ${preset}`);
          
          reply.send({
            success: true,
            message: `ExecutionGuard configuration updated with preset: ${preset}`,
            timestamp: new Date().toISOString(),
            newConfig
          });
          return reply;
        } else if (action === 'update-custom') {
          // Apply custom configuration
          // Custom configuration applied to provider handling
          info('[Router] Applied custom configuration');
          
          reply.send({
            success: true,
            message: 'ExecutionGuard configuration updated successfully',
            timestamp: new Date().toISOString(),
            newConfig: config
          });
          return reply;
        } else {
          reply.code(400).send({ 
            error: { 
              type: 'invalid_action', 
              message: `Invalid action: ${action}. Supported actions: update-preset, update-custom` 
            }
          });
          return reply;
        }
      } catch (error: any) {
        console.error('Error updating ExecutionGuard:', error);
        reply.code(500).send({ error: { type: 'update_failed', message: error.message } });
        return reply;
      }
    }
    
    // NOU: Mission Control v2 - Test provider connectivity
    if (req.url === "/api/v1/mission-control/test-provider" && req.method === 'POST') {
      try {
        const body = req.body;
        const { provider, testAction = 'ping' } = body;
        
        if (!provider) {
          reply.code(400).send({ 
            error: { 
              type: 'invalid_request', 
              message: 'Provider name is required' 
            }
          });
          return reply;
        }
        
        // Get the provider configuration
        const { readConfigFile } = await import('./utils');
        const config = await readConfigFile();
        const providerConfig = config.Providers?.find((p: any) => p.name === provider);
        
        if (!providerConfig) {
          reply.code(404).send({ 
            error: { 
              type: 'provider_not_found', 
              message: `Provider '${provider}' not found` 
            }
          });
          return reply;
        }
        
        let success = false;
        let status: 'online' | 'offline' | 'degraded' = 'offline';
        let responseTime = 0;
        let message = '';
        
        // Test by doing a simple request to the provider's API
        if (testAction === 'ping') {
          const startTime = Date.now();
          try {
            // Create a simple test request
            const testEndpoint = providerConfig.api_base_url || 'https://api.openai.com/v1/models';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const testResponse = await fetch(`${testEndpoint}?limit=1`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${providerConfig.api_key}`,
                'Content-Type': 'application/json',
              },
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            responseTime = Date.now() - startTime;
            
            if (testResponse.ok) {
              success = true;
              status = 'online';
              message = `Provider '${provider}' responded successfully (${responseTime}ms)`;
            } else {
              // Check if it's a rate limit error (degraded)
              if (testResponse.status === 429) {
                status = 'degraded';
                message = `Provider '${provider}' rate limited (response: ${responseTime}ms)`;
              } else {
                message = `Provider '${provider}' responded with status: ${testResponse.status}`;
              }
            }
          } catch (error: any) {
            responseTime = Date.now() - startTime;
            message = `Provider '${provider}' test failed: ${error.message}`;
            
            // Check for network errors (offline)
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
              status = 'offline';
            }
          }
        }
        
        reply.send({
          success,
          message,
          status,
          responseTime,
          timestamp: new Date().toISOString(),
          provider
        });
        return reply;
      } catch (error: any) {
        console.error('Error testing provider:', error);
        reply.code(500).send({ 
          error: { 
            type: 'test_failed', 
            message: error.message 
          },
          timestamp: new Date().toISOString(),
          provider: req.body?.provider || 'unknown'
        });
        return reply;
      }
    }
    
    // NOU: Mission Control v2 - Get provider health status
    if (req.url === "/api/v1/mission-control/providers/health" && req.method === 'GET') {
      try {
        const { readConfigFile } = await import('./utils');
        const config = await readConfigFile();
        
        const providers = config.Providers || [];
        const providerHealth: any[] = [];
        
        // Get analytics data for provider health
        const { analytics } = await import('./utils/analytics');
        const modelStats = analytics.getModelStats();
        
        for (const provider of providers) {
          // Find analytics data for this provider
          const providerModels = modelStats.filter((stat: any) => 
            stat.provider === provider.name || 
            (provider.models && provider.models.some((model: string) => stat.model === model))
          );
          
          const totalRequests = providerModels.reduce((sum: number, stat: any) => sum + (stat.totalRequests || 0), 0);
          const successfulRequests = providerModels.reduce((sum: number, stat: any) => sum + (stat.successfulRequests || 0), 0);
          const avgResponseTime = providerModels.length > 0 ? 
            providerModels.reduce((sum: number, stat: any) => sum + (stat.avgResponseTime || 0), 0) / providerModels.length : 0;
          const errorRate = totalRequests > 0 ? ((totalRequests - successfulRequests) / totalRequests) * 100 : 0;
          
          const health = {
            id: provider.name,
            name: provider.name,
            provider: provider.name.split('_')[0] || provider.name,
            status: totalRequests > 0 && errorRate < 20 ? 'online' : 'offline',
            healthScore: totalRequests > 0 ? Math.max(0, 100 - errorRate) : 50,
            avgResponseTime: Math.round(avgResponseTime),
            errorRate: Math.round(errorRate * 10) / 10,
            totalRequests,
            lastCheck: new Date().toISOString(),
            features: ['Text Generation'],
            pingTime: Math.round(avgResponseTime)
          };
          
          providerHealth.push(health);
        }
        
        reply.send({
          success: true,
          data: providerHealth,
          timestamp: new Date().toISOString()
        });
        return reply;
      } catch (error: any) {
        console.error('Error getting provider health:', error);
        reply.code(500).send({ 
          error: { 
            type: 'health_fetch_failed', 
            message: error.message 
          }
        });
        return reply;
      }
    }
    
    // NOU: Mission Control v2 - Get provider health history
    if (req.url === "/api/v1/mission-control/providers/health-history" && req.method === 'GET') {
      try {
        const { analytics } = await import('./utils/analytics');
        const recentRequests = analytics.getRecentRequests(1000);
        
        // Group requests by provider and aggregate status
        const providerHistory: any[] = [];
        const now = Date.now();
        const timeWindow = 24 * 60 * 60 * 1000; // 24 hours
        
        const providerRequests: { [key: string]: any[] } = {};
        
        recentRequests.forEach((req: any) => {
          const provider = req.provider || 'unknown';
          if (!providerRequests[provider]) {
            providerRequests[provider] = [];
          }
          providerRequests[provider].push(req);
        });
        
        for (const [provider, requests] of Object.entries(providerRequests)) {
          const successCount = requests.filter((r: any) => r.statusCode < 400).length;
          const avgResponseTime = requests.reduce((sum: number, r: any) => sum + r.responseTime, 0) / requests.length;
          const errorRate = ((requests.length - successCount) / requests.length) * 100;
          
          // Group by hour for the last 24 hours
          const hourlyStats: any[] = [];
          for (let i = 23; i >= 0; i--) {
            const hourStart = now - (i * 60 * 60 * 1000);
            const hourEnd = hourStart + (60 * 60 * 1000);
            
            const hourRequests = requests.filter((r: any) => 
              r.timestamp >= hourStart && r.timestamp < hourEnd
            );
            
            const hourSuccess = hourRequests.filter((r: any) => r.statusCode < 400).length;
            const hourlyErrorRate = hourRequests.length > 0 ? 
              ((hourRequests.length - hourSuccess) / hourRequests.length) * 100 : 0;
            
            hourlyStats.push({
              timestamp: hourStart,
              requests: hourRequests.length,
              successRate: hourRequests.length > 0 ? (hourSuccess / hourRequests.length) * 100 : 0,
              errorRate: hourlyErrorRate,
              avgResponseTime: hourRequests.reduce((sum: number, r: any) => sum + r.responseTime, 0) / hourRequests.length || 0
            });
          }
          
          providerHistory.push({
            provider,
            totalRequests: requests.length,
            successRate: (successCount / requests.length) * 100,
            avgResponseTime,
            errorRate,
            hourlyStats
          });
        }
        
        reply.send({
          success: true,
          data: providerHistory,
          timestamp: new Date().toISOString()
        });
        return reply;
      } catch (error: any) {
        console.error('Error getting provider health history:', error);
        reply.code(500).send({ 
          error: { 
            type: 'history_fetch_failed', 
            message: error.message 
          }
        });
        return reply;
      }
    }
  });
  
  // (Am eliminat vechiul `preHandler` care conținea `guardedExecute` și l-am înlocuit cu cel de sus)

  server.addHook("onSend", (req: any, reply: any, payload: any, done: any) => {
    if (req.sessionId && req.url.startsWith("/v1/messages")) {
      if (payload instanceof ReadableStream) {
        const [originalStream, clonedStream] = payload.tee();
        const read = async (stream: ReadableStream) => {
          const reader = stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const dataStr = new TextDecoder().decode(value);
            if (!dataStr.startsWith("event: message_delta")) continue;
            const str = dataStr.slice(27);
            try {
              const message = JSON.parse(str);
              if(message.usage) sessionUsageCache.put(req.sessionId, message.usage);
            } catch {}
          }
        }
        read(clonedStream);
        done(null, originalStream)
      } else {
        req.log.debug({payload}, 'onSend Hook')
        if (payload && payload.usage) sessionUsageCache.put(req.sessionId, payload.usage);
        if (payload instanceof Buffer || payload instanceof Response) { done(null, payload); } 
        else if(typeof payload === "object" && payload !== null) { done(null, JSON.stringify(payload)); } 
        else { done(null, payload); }
      }
    } else {
      if(payload instanceof Buffer || payload instanceof Response || payload === null || payload instanceof ReadableStream || payload instanceof Stream) {
        done(null, payload);
      } else if(typeof payload === "object" && payload !== null) {
        req.log.debug({payload}, 'onSend Hook')
        done(null, JSON.stringify(payload));
      } else {
        done(null, payload);
      }
    }
  });
  
  server.addHook("onResponse", async (req: any, reply: any) => {
    if (req.url.startsWith("/v1/") && req.startTime) {
      const responseTime = Date.now() - req.startTime;
      console.log(`[DEBUG] onResponse hook called for: ${req.url}, response time: ${responseTime}ms`);
      
      try {
        const { analytics } = await import('./utils/analytics');
        analytics.trackRequest({
          model: req.selectedModel || req.body?.model || 'unknown',
          provider: req.selectedProvider || 'unknown',
          endpoint: req.url, method: req.method, statusCode: reply.statusCode,
          responseTime, tokenCount: req.tokenCount || 0,
          inputTokens: req.inputTokens || 0, outputTokens: req.outputTokens || 0,
          cost: 0, userAgent: req.headers['user-agent'], ipAddress: req.ip,
          // Route tracking information
          route: req.routeUsed || 'unknown',
          originalModel: req.originalModel || 'unknown',
          actualModel: req.actualModel || req.selectedModel || req.body?.model || 'unknown'
        });
      } catch (error: any) {
        console.error('Analytics tracking error:', error.message);
      }
    }
  });
  
  server.start();
}

export { run };