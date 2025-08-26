import { info, error } from './log';
import { aiRequestController } from './ai-request-controller';

export interface FallbackProvider {
  name: string;
  model: string;
  priority: number;
  enabled: boolean;
  url: string; // Added url property
}

export interface FallbackChain {
  primary: FallbackProvider;
  fallbacks: FallbackProvider[];
}

class ProviderFallbackManager {
  private chains: Map<string, FallbackChain> = new Map();
  private providerStatus: Map<string, { lastFailure: number }> = new Map();

  public registerChain(chainId: string, chain: FallbackChain): void {
    this.chains.set(chainId, chain);
    info(`[ProviderFallback] Registered chain '${chainId}'`);
  }

  public async executeWithFallback(
    chainId: string,
    prepareRequestFn: (provider: FallbackProvider) => { url: string; options: RequestInit } | null
  ): Promise<any> {
    const chain = this.chains.get(chainId);
    if (!chain) throw new Error(`Fallback chain '${chainId}' not found`);

    const allProviders = [chain.primary, ...chain.fallbacks]
      .filter(p => p.enabled)
      .sort((a, b) => a.priority - b.priority);

    let lastError: Error | undefined;

    for (const provider of allProviders) {
      if (this.isProviderInRecovery(provider)) {
        continue;
      }

      try {
        const requestPayload = prepareRequestFn(provider);
        if (!requestPayload) continue;
        
        const { url, options } = requestPayload;
        const result = await aiRequestController.fetchWithCache(url, options);
        
        this.recordSuccess(provider);
        return result;

      } catch (error: any) {
        lastError = error;
        this.recordFailure(provider);
        error(`[ProviderFallback] Provider ${provider.name} failed: ${error.message}`);
      }
    }

    error(`[ProviderFallback] All providers in chain '${chainId}' failed.`);
    throw lastError || new Error('All providers exhausted');
  }

  private isProviderInRecovery(provider: FallbackProvider): boolean {
    const status = this.providerStatus.get(provider.name);
    if (!status || !status.lastFailure) return false;
    // Check if the provider failed in the last 60 seconds
    return (Date.now() - status.lastFailure) < 60000;
  }

  private recordSuccess(provider: FallbackProvider): void {
    this.providerStatus.delete(provider.name);
  }

  private recordFailure(provider: FallbackProvider): void {
    this.providerStatus.set(provider.name, { lastFailure: Date.now() });
  }

  public getProviderStatus(): object {
    const status: { [key: string]: any } = {};
    this.providerStatus.forEach((value, key) => {
        status[key] = {
            lastFailure: value.lastFailure,
            inRecovery: this.isProviderInRecovery({name: key} as FallbackProvider)
        };
    });
    return status;
  }
}

export const providerFallbackManager = new ProviderFallbackManager();