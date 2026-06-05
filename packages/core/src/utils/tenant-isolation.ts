/**
 * Tenant Isolation - 多租户隔离
 *
 * Isolates resources per tenant/user:
 * - Separate cache namespaces
 * - Independent rate limits
 * - Isolated vector collections
 * - Per-tenant budget tracking
 */

export interface TenantConfig {
  enabled: boolean;
  /** Default tenant for unauthenticated requests */
  defaultTenant: string;
  /** Per-tenant overrides */
  tenants: Record<string, {
    rateLimit?: { requestsPerWindow: number; windowMs: number };
    budgetDailyUsd?: number;
    cacheNamespace?: string;
    allowedModels?: string[];
    priority?: number;
  }>;
}

const DEFAULT_CONFIG: TenantConfig = {
  enabled: false,
  defaultTenant: 'default',
  tenants: {},
};

export interface TenantContext {
  tenantId: string;
  rateLimit?: { requestsPerWindow: number; windowMs: number };
  budgetDailyUsd?: number;
  cacheNamespace: string;
  allowedModels?: string[];
  priority: number;
}

export class TenantManager {
  private config: TenantConfig;
  private logger?: any;

  constructor(config: Partial<TenantConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  resolve(tenantId?: string): TenantContext {
    const id = tenantId || this.config.defaultTenant;
    const tenant = this.config.tenants[id];

    return {
      tenantId: id,
      rateLimit: tenant?.rateLimit,
      budgetDailyUsd: tenant?.budgetDailyUsd,
      cacheNamespace: tenant?.cacheNamespace || `tenant:${id}`,
      allowedModels: tenant?.allowedModels,
      priority: tenant?.priority || 0,
    };
  }

  isModelAllowed(tenantId: string, model: string): boolean {
    const ctx = this.resolve(tenantId);
    if (!ctx.allowedModels || ctx.allowedModels.length === 0) return true;
    return ctx.allowedModels.includes(model);
  }

  getCacheKey(tenantId: string, key: string): string {
    const ctx = this.resolve(tenantId);
    return `${ctx.cacheNamespace}:${key}`;
  }

  getStats(): { tenants: number; enabled: boolean } {
    return { tenants: Object.keys(this.config.tenants).length, enabled: this.config.enabled };
  }

  updateConfig(config: Partial<TenantConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

let globalTenant: TenantManager | null = null;
export function getTenantManager(config?: Partial<TenantConfig>, logger?: any): TenantManager {
  if (!globalTenant) globalTenant = new TenantManager(config, logger);
  else if (config) globalTenant.updateConfig(config);
  return globalTenant;
}
