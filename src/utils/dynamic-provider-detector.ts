/**
 * Dynamic Provider Detection and Switching System
 * Detectează automat provider-ii disponibili și poate schimba între ei
 */

// Simple logging functions since log utility was removed
const info = (...args: any[]) => console.log('[INFO]', ...args);
const error = (...args: any[]) => console.error('[ERROR]', ...args);
const warn = (...args: any[]) => console.warn('[WARN]', ...args);

export interface DetectedProvider {
  name: string;
  models: string[];
  apiBaseUrl: string;
  apiKey: string;
  transformer?: any;
  priority?: number;
  enabled: boolean;
  capabilities: {
    hasTools: boolean;
    maxContextLength: number;
    supportsStreaming: boolean;
  };
  status: {
    isOnline: boolean;
    lastChecked: number;
    responseTime?: number;
    errorCount: number;
  };
}

export interface ModelCapabilities {
  contextLength: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsAudio: boolean;
  costTier: 'free' | 'paid' | 'premium';
  speed: 'slow' | 'medium' | 'fast' | 'ultra-fast';
}

export class DynamicProviderDetector {
  private detectedProviders: Map<string, DetectedProvider> = new Map();
  private modelCapabilities: Map<string, ModelCapabilities> = new Map();
  private lastScan = 0;
  private scanInterval = 300000; // 5 minutes

  constructor() {
    this.initializeModelCapabilities();
  }

  /**
   * Scan și detectează toți provider-ii disponibili din config
   */
  async scanProvidersFromConfig(config: any): Promise<DetectedProvider[]> {
    const now = Date.now();
    
    if (now - this.lastScan < this.scanInterval && this.detectedProviders.size > 0) {
      info(`[DynamicDetector] Using cached provider scan from ${Math.floor((now - this.lastScan) / 1000)}s ago`);
      return Array.from(this.detectedProviders.values());
    }

    info(`[DynamicDetector] Scanning providers from config...`);
    this.detectedProviders.clear();

    const providers = config.Providers || [];
    
    for (const provider of providers) {
      try {
        const detected = await this.analyzeProvider(provider);
        this.detectedProviders.set(provider.name, detected);
        info(`[DynamicDetector] ✅ Detected provider: ${provider.name} with ${detected.models.length} models`);
      } catch (error: any) {
        error(`[DynamicDetector] ❌ Failed to analyze provider ${provider.name}: ${error.message}`);
      }
    }

    this.lastScan = now;
    return Array.from(this.detectedProviders.values());
  }

  /**
   * Analizează un provider și detectează capabilities
   */
  private async analyzeProvider(providerConfig: any): Promise<DetectedProvider> {
    const capabilities = {
      hasTools: this.detectToolsSupport(providerConfig),
      maxContextLength: this.detectMaxContext(providerConfig),
      supportsStreaming: this.detectStreamingSupport(providerConfig)
    };

    const detected: DetectedProvider = {
      name: providerConfig.name,
      models: providerConfig.models || [],
      apiBaseUrl: providerConfig.api_base_url,
      apiKey: providerConfig.api_key,
      transformer: providerConfig.transformer,
      priority: providerConfig.priority || 1,
      enabled: true,
      capabilities,
      status: {
        isOnline: true, // Will be tested asynchronously
        lastChecked: Date.now(),
        errorCount: 0
      }
    };

    // Test connectivity asynchronously (non-blocking)
    this.testProviderConnectivity(detected).catch(error => {
      error(`[DynamicDetector] Connectivity test failed for ${detected.name}: ${error.message}`);
    });

    return detected;
  }

  /**
   * Găsește cel mai potrivit provider pentru un request specific
   */
  findBestProviderForRequest(
    requestModel: string,
    hasTools: boolean,
    contextSize: number,
    excludeProviders: string[] = []
  ): DetectedProvider | null {
    const availableProviders = Array.from(this.detectedProviders.values())
      .filter(p => 
        p.enabled && 
        p.status.isOnline && 
        !excludeProviders.includes(p.name)
      )
      .sort((a, b) => {
        // Sort by priority first, then by capabilities match
        // Ensure 'priority' is defined before comparison
        if (a.priority !== undefined && b.priority !== undefined) {
            if (a.priority !== b.priority) return a.priority - b.priority;
        }
        
        // Prefer providers that support tools if needed
        if (hasTools && a.capabilities.hasTools !== b.capabilities.hasTools) {
          return a.capabilities.hasTools ? -1 : 1;
        }
        
        // Prefer providers with sufficient context length
        const aCanHandle = a.capabilities.maxContextLength >= contextSize;
        const bCanHandle = b.capabilities.maxContextLength >= contextSize;
        if (aCanHandle !== bCanHandle) return aCanHandle ? -1 : 1;
        
        return 0;
      });

    // Try to find exact model match first
    for (const provider of availableProviders) {
      if (provider.models.includes(requestModel)) {
        info(`[DynamicDetector] Found exact model match: ${provider.name} -> ${requestModel}`);
        return provider;
      }
    }

    // Find compatible model
    for (const provider of availableProviders) {
      const compatibleModel = this.findCompatibleModel(provider, requestModel, hasTools);
      if (compatibleModel) {
        info(`[DynamicDetector] Found compatible provider: ${provider.name} -> ${compatibleModel}`);
        return {
          ...provider,
          models: [compatibleModel] // Override with compatible model
        };
      }
    }

    info(`[DynamicDetector] No suitable provider found for ${requestModel} (tools:${hasTools}, context:${contextSize})`);
    return null;
  }

  /**
   * Găsește un model compatibil într-un provider
   */
  private findCompatibleModel(provider: DetectedProvider, requestedModel: string, needsTools: boolean): string | null {
    // Model compatibility mapping
    const compatibilityMap: { [key: string]: string[] } = {
      'gemini-2.5-pro': ['gemini-2.5-flash', 'gemini-2.0-flash', 'qwen/qwen3-coder:free'],
      'gemini-2.5-flash': ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'qwen/qwen3-coder:free'],
      'gemini-2.0-flash': ['gemini-2.5-flash', 'qwen/qwen3-coder:free'],
      'claude-3-sonnet': ['gemini-2.5-pro', 'qwen/qwen3-coder:free'],
      'gpt-4': ['gemini-2.5-pro', 'qwen/qwen3-coder:free']
    };

    const compatibleModels = compatibilityMap[requestedModel] || [];
    
    for (const model of provider.models) {
      // Direct compatibility check
      if (compatibleModels.includes(model)) {
        const modelCaps = this.modelCapabilities.get(model);
        if (!needsTools || !modelCaps || modelCaps.supportsTools) {
          return model;
        }
      }
      
      // Fuzzy matching for similar models
      if (this.areModelsCompatible(requestedModel, model)) {
        const modelCaps = this.modelCapabilities.get(model);
        if (!needsTools || !modelCaps || modelCaps.supportsTools) {
          return model;
        }
      }
    }

    // Fallback: return first model if provider supports tools when needed
    if (provider.models.length > 0) {
      const firstModel = provider.models[0];
      const modelCaps = this.modelCapabilities.get(firstModel);
      if (!needsTools || !modelCaps || modelCaps.supportsTools) {
        return firstModel;
      }
    }

    return null;
  }

  /**
   * Verifică dacă două modele sunt compatibile
   */
  private areModelsCompatible(model1: string, model2: string): boolean {
    // Normalize model names for comparison
    const normalize = (name: string) => name.toLowerCase()
      .replace(/[-_]/g, '')
      .replace(/\d+(\.\d+)?[a-z]?/g, '') // Remove version numbers
      .replace(/(free|paid|pro|lite|flash)$/g, ''); // Remove suffixes

    const norm1 = normalize(model1);
    const norm2 = normalize(model2);
    
    // Check for similar families
    const families = [
      ['gemini', 'gemma'],
      ['qwen', 'qwen3'],
      ['claude', 'anthropic'],
      ['gpt', 'openai']
    ];

    for (const family of families) {
      if (family.some(f => norm1.includes(f)) && family.some(f => norm2.includes(f))) {
        return true;
      }
    }

    return norm1 === norm2;
  }

  /**
   * Schimbă dinamic la un alt provider când unul eșuează
   */
  async switchToFallbackProvider(
    failedProvider: string,
    originalRequest: any,
    config: any
  ): Promise<{ provider: DetectedProvider; model: string } | null> {
    warn(`[DynamicDetector] Switching away from failed provider: ${failedProvider}`);
    
    // Mark provider as problematic
    const provider = this.detectedProviders.get(failedProvider);
    if (provider) {
      provider.status.errorCount++;
      if (provider.status.errorCount >= 3) {
        provider.status.isOnline = false;
        warn(`[DynamicDetector] Marked provider ${failedProvider} as offline due to errors`);
      }
    }

    // Find alternative
    const requestModel = originalRequest.model || 'gemini-2.5-flash';
    const hasTools = Array.isArray(originalRequest.tools) && originalRequest.tools.length > 0;
    const contextSize = JSON.stringify(originalRequest.messages || []).length;

    const alternative = this.findBestProviderForRequest(
      requestModel,
      hasTools,
      contextSize,
      [failedProvider] // Exclude failed provider
    );

    if (alternative) {
      const compatibleModel = this.findCompatibleModel(alternative, requestModel, hasTools) || alternative.models[0];
      info(`[DynamicDetector] Switched to: ${alternative.name} -> ${compatibleModel}`);
      return { provider: alternative, model: compatibleModel };
    }

    return null;
  }

  /**
   * Test connectivity to a provider
   */
  private async testProviderConnectivity(provider: DetectedProvider): Promise<void> {
    // Simplified connectivity test - in real implementation, make a lightweight API call
    const startTime = Date.now();
    
    try {
      // Mock test - replace with actual API ping
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
      
      provider.status.responseTime = Date.now() - startTime;
      provider.status.isOnline = true;
      provider.status.lastChecked = Date.now();
      
    } catch (error) {
      provider.status.isOnline = false;
      provider.status.errorCount++;
      throw error;
    }
  }

  // Helper methods for capability detection
  private detectToolsSupport(provider: any): boolean {
    const name = provider.name.toLowerCase();
    // Gemini, OpenAI-compatible providers usually support tools
    return name.includes('gemini') || name.includes('openai') || name.includes('anthropic');
  }

  private detectMaxContext(provider: any): number {
    const name = provider.name.toLowerCase();
    if (name.includes('gemini')) return 2000000; // 2M tokens
    if (name.includes('claude')) return 200000;   // 200k tokens
    if (name.includes('gpt')) return 128000;      // 128k tokens
    return 32000; // Conservative default
  }

  private detectStreamingSupport(provider: any): boolean {
    // Most modern providers support streaming
    return true;
  }

  private initializeModelCapabilities(): void {
    // Initialize known model capabilities
    const capabilities: Array<[string, ModelCapabilities]> = [
      ['gemini-2.5-pro', { contextLength: 2000000, supportsTools: true, supportsVision: true, supportsAudio: true, costTier: 'paid', speed: 'medium' }],
      ['gemini-2.5-flash', { contextLength: 1000000, supportsTools: true, supportsVision: true, supportsAudio: false, costTier: 'free', speed: 'fast' }],
      ['gemini-2.0-flash', { contextLength: 1000000, supportsTools: true, supportsVision: true, supportsAudio: true, costTier: 'free', speed: 'ultra-fast' }],
      ['qwen/qwen3-coder:free', { contextLength: 32000, supportsTools: false, supportsVision: false, supportsAudio: false, costTier: 'free', speed: 'fast' }],
      ['PetrosStav/gemma3-tools:4b', { contextLength: 8000, supportsTools: true, supportsVision: false, supportsAudio: false, costTier: 'free', speed: 'ultra-fast' }]
    ];

    for (const [model, caps] of capabilities) {
      this.modelCapabilities.set(model, caps);
    }
  }

  /**
   * Get current provider status for monitoring
   */
  getProviderStatus(): { [providerName: string]: any } {
    const status: any = {};
    
    for (const [name, provider] of this.detectedProviders.entries()) {
      status[name] = {
        enabled: provider.enabled,
        isOnline: provider.status.isOnline,
        models: provider.models,
        capabilities: provider.capabilities,
        lastChecked: provider.status.lastChecked,
        errorCount: provider.status.errorCount,
        responseTime: provider.status.responseTime
      };
    }
    
    return status;
  }
}

// Singleton instance
export const dynamicProviderDetector = new DynamicProviderDetector();