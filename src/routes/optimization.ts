import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readConfigFile, writeConfigFile, backupConfigFile } from '../utils';

interface OptimizationSettings {
  // Router Performance
  tokenCalculation: 'fast' | 'accurate';
  longContextThreshold: number;
  cacheTTL: number;
  routingMode: 'simple' | 'smart';
  
  // Analytics Control
  analyticsEnabled: boolean;
  batchSize: number;
  saveFrequency: number;
  retentionDays: number;
  memoryLimit: number;
  
  // Real-time Updates
  overviewRefresh: number;
  trackingRefresh: number;
  liveMode: boolean;
  
  // AI Request Control
  aiRequestControl: boolean;
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  rateLimitPerDay: number;
  burstLimit: number;
  burstWindow: number;
  deduplicationEnabled: boolean;
  
  // Resource Management
  maxConcurrentRequests: number;
  providerTimeout: number;
  
  // Custom Router
  customRouterEnabled: boolean;
  customRouterPath: string;
}

interface RouterModelConfig {
  default: {
    enabled: boolean;
    provider: string;
    model: string;
    description: string;
  };
  background: {
    enabled: boolean;
    provider: string;
    model: string;
    description: string;
  };
  think: {
    enabled: boolean;
    provider: string;
    model: string;
    description: string;
  };
  longContext: {
    enabled: boolean;
    provider: string;
    model: string;
    description: string;
  };
  webSearch: {
    enabled: boolean;
    provider: string;
    model: string;
    description: string;
  };
}

export function registerOptimizationRoutes(server: FastifyInstance) {
  
  // Get AI Request Controller statistics
  server.get('/api/optimization/ai-control/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const executionGuard = require('../utils/ExecutionGuard').ExecutionGuard.getInstance();
      const stats = executionGuard.getStats();
      return { success: true, data: stats };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Update AI Request Controller rate limits
  server.post('/api/optimization/ai-control/limits', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const limits = request.body as {
        perMinute: number;
        perHour: number;
        perDay: number;
        burstLimit: number;
        burstWindow: number;
      };
      
      const executionGuard = require('../utils/ExecutionGuard').ExecutionGuard.getInstance();
      executionGuard.updateConfig({ rateLimiting: limits });
      
      return { success: true, message: 'Rate limits updated successfully' };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Reset circuit breaker
  server.post('/api/optimization/ai-control/reset-breaker', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const executionGuard = require('../utils/ExecutionGuard').ExecutionGuard.getInstance();
      executionGuard.resetCircuitBreaker();
      return { success: true, message: 'Circuit breaker reset successfully' };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Clear all AI control data
  server.post('/api/optimization/ai-control/clear', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const executionGuard = require('../utils/ExecutionGuard').ExecutionGuard.getInstance();
      executionGuard.clearAllData();
      return { success: true, message: 'AI control data cleared successfully' };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
  
  // Get current optimization settings
  server.get('/api/optimization/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = await readConfigFile();
      
      // Extract optimization settings from config or use defaults
      const settings: OptimizationSettings = {
        tokenCalculation: config.optimization?.tokenCalculation || 'accurate',
        longContextThreshold: config.optimization?.longContextThreshold || 32000,
        cacheTTL: config.optimization?.cacheTTL || 30000,
        routingMode: config.optimization?.routingMode || 'smart',
        analyticsEnabled: config.optimization?.analyticsEnabled !== false,
        batchSize: config.optimization?.batchSize || 10,
        saveFrequency: config.optimization?.saveFrequency || 5000,
        retentionDays: config.optimization?.retentionDays || 7,
        memoryLimit: config.optimization?.memoryLimit || 1000,
        overviewRefresh: config.optimization?.overviewRefresh || 30000,
        trackingRefresh: config.optimization?.trackingRefresh || 5000,
        liveMode: config.optimization?.liveMode !== false,
        aiRequestControl: config.optimization?.aiRequestControl !== false,
        rateLimitPerMinute: config.optimization?.rateLimitPerMinute || 60,
        rateLimitPerHour: config.optimization?.rateLimitPerHour || 500,
        rateLimitPerDay: config.optimization?.rateLimitPerDay || 5000,
        burstLimit: config.optimization?.burstLimit || 10,
        burstWindow: config.optimization?.burstWindow || 10000,
        deduplicationEnabled: config.optimization?.deduplicationEnabled !== false,
        maxConcurrentRequests: config.optimization?.maxConcurrentRequests || 10,
        providerTimeout: config.optimization?.providerTimeout || 30000,
        customRouterEnabled: !!config.CUSTOM_ROUTER_PATH,
        customRouterPath: config.CUSTOM_ROUTER_PATH || ''
      };
      
      return { success: true, data: settings };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Save optimization settings
  server.post('/api/optimization/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = request.body as OptimizationSettings;
      
      // Read current config
      const config = await readConfigFile();
      
      // Backup existing config
      const backupPath = await backupConfigFile();
      if (backupPath) {
        console.log(`Backed up config before optimization update: ${backupPath}`);
      }
      
      // Update config with optimization settings
      config.optimization = {
        ...config.optimization,
        ...settings,
        updatedAt: new Date().toISOString()
      };
      
      // Handle custom router settings separately
      if (settings.customRouterEnabled && settings.customRouterPath) {
        config.CUSTOM_ROUTER_PATH = settings.customRouterPath;
      } else if (!settings.customRouterEnabled) {
        delete config.CUSTOM_ROUTER_PATH;
      }
      
      // Save updated config
      await writeConfigFile(config);
      
      return { 
        success: true, 
        message: 'Optimization settings saved successfully',
        backupPath 
      };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Get current router model configuration
  server.get('/api/optimization/router-models', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = await readConfigFile();
      
      // Extract router configuration
      const routerConfig = config.Router || {};
      
      // Parse router configuration into structured format
      const modelConfig: RouterModelConfig = {
        default: {
          enabled: !!routerConfig.default,
          provider: routerConfig.default?.split(',')[0] || 'gemini-cli',
          model: routerConfig.default?.split(',')[1] || 'gemini-2.5-pro',
          description: 'General tasks and fallback'
        },
        background: {
          enabled: !!routerConfig.background,
          provider: routerConfig.background?.split(',')[0] || 'ollama',
          model: routerConfig.background?.split(',')[1] || 'qwen2.5-coder:latest',
          description: 'Lightweight background tasks'
        },
        think: {
          enabled: !!routerConfig.think,
          provider: routerConfig.think?.split(',')[0] || 'deepseek',
          model: routerConfig.think?.split(',')[1] || 'deepseek-reasoner',
          description: 'Reasoning and planning tasks'
        },
        longContext: {
          enabled: !!routerConfig.longContext,
          provider: routerConfig.longContext?.split(',')[0] || 'kimi',
          model: routerConfig.longContext?.split(',')[1] || 'kimi-k2-0711-preview',
          description: 'Long context scenarios (>32K tokens)'
        },
        webSearch: {
          enabled: !!routerConfig.webSearch,
          provider: routerConfig.webSearch?.split(',')[0] || 'gemini-cli',
          model: routerConfig.webSearch?.split(',')[1] || 'gemini-2.5-flash',
          description: 'Web search and real-time data'
        }
      };
      
      return { success: true, data: modelConfig };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Save router model configuration
  server.post('/api/optimization/router-models', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const modelConfig = request.body as RouterModelConfig;
      
      // Read current config
      const config = await readConfigFile();
      
      // Backup existing config
      const backupPath = await backupConfigFile();
      if (backupPath) {
        console.log(`Backed up config before router model update: ${backupPath}`);
      }
      
      // Preserve CUSTOM_ROUTER_PATH before updating Router configuration
      const customRouterPath = config.CUSTOM_ROUTER_PATH;
      
      // Update Router configuration
      config.Router = {};
      
      // Only include enabled models in Router config
      Object.keys(modelConfig).forEach((role) => {
        const roleConfig = modelConfig[role as keyof RouterModelConfig];
        if (roleConfig.enabled) {
          config.Router[role] = `${roleConfig.provider},${roleConfig.model}`;
        }
      });
      
      // Restore CUSTOM_ROUTER_PATH if it existed
      if (customRouterPath) {
        config.CUSTOM_ROUTER_PATH = customRouterPath;
      }
      
      // Save updated config
      await writeConfigFile(config);
      
      return { 
        success: true, 
        message: 'Router model configuration saved successfully',
        activeModels: Object.keys(config.Router).length,
        backupPath 
      };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Get optimization impact estimation
  server.get('/api/optimization/impact', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = await readConfigFile();
      const optimization = config.optimization || {};
      const router = config.Router || {};
      
      let impact = 0;
      const details = [];
      
      // Calculate impact based on current settings
      if (optimization.tokenCalculation === 'fast') {
        impact += 70;
        details.push({ setting: 'Fast Token Calculation', reduction: 70 });
      }
      
      if (optimization.cacheTTL > 60) {
        impact += 30;
        details.push({ setting: 'Session Cache Enabled', reduction: 30 });
      }
      
      if (optimization.routingMode === 'simple') {
        impact += 40;
        details.push({ setting: 'Simple Routing Mode', reduction: 40 });
      }
      
      if (!optimization.analyticsEnabled) {
        impact += 60;
        details.push({ setting: 'Analytics Disabled', reduction: 60 });
      }
      
      // Router models impact
      const totalRoles = 5;
      const activeRoles = Object.keys(router).length;
      const routerReduction = ((totalRoles - activeRoles) / totalRoles) * 100;
      
      if (routerReduction > 0) {
        impact += routerReduction;
        details.push({ 
          setting: `${activeRoles}/${totalRoles} Router Models Active`, 
          reduction: Math.round(routerReduction) 
        });
      }
      
      return { 
        success: true, 
        data: {
          totalReduction: Math.min(Math.round(impact), 95),
          details,
          activeModels: activeRoles,
          totalModels: totalRoles
        }
      };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Apply preset configurations
  server.post('/api/optimization/preset', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { preset } = request.body as { preset: 'high-performance' | 'balanced' | 'economy' };
      
      const config = await readConfigFile();
      const backupPath = await backupConfigFile();
      
      // Preserve CUSTOM_ROUTER_PATH before applying presets
      const customRouterPath = config.CUSTOM_ROUTER_PATH;
      
      // Apply preset configurations
      switch (preset) {
        case 'high-performance':
          config.Router = {
            default: 'gemini-cli,gemini-2.5-pro',
            background: 'ollama,qwen2.5-coder:latest',
            think: 'deepseek,deepseek-reasoner',
            longContext: 'kimi,kimi-k2-0711-preview',
            webSearch: 'gemini-cli,gemini-2.5-flash'
          };
          config.optimization = {
            ...config.optimization,
            tokenCalculation: 'accurate',
            routingMode: 'smart',
            analyticsEnabled: true
          };
          break;
          
        case 'balanced':
          config.Router = {
            default: 'gemini-cli,gemini-2.5-pro',
            background: 'ollama,qwen2.5-coder:latest',
            think: 'deepseek,deepseek-reasoner'
          };
          config.optimization = {
            ...config.optimization,
            tokenCalculation: 'fast',
            routingMode: 'smart',
            analyticsEnabled: true
          };
          break;
          
        case 'economy':
          config.Router = {
            default: 'gemini-cli,gemini-2.5-pro'
          };
          config.optimization = {
            ...config.optimization,
            tokenCalculation: 'fast',
            routingMode: 'simple',
            analyticsEnabled: false
          };
          break;
      }
      
      config.optimization.updatedAt = new Date().toISOString();
      
      // Restore CUSTOM_ROUTER_PATH if it existed
      if (customRouterPath) {
        config.CUSTOM_ROUTER_PATH = customRouterPath;
      }
      
      await writeConfigFile(config);
      
      return { 
        success: true, 
        message: `${preset} preset applied successfully`,
        backupPath 
      };
    } catch (error: any) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
}