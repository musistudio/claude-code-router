// Shared types for dashboard widgets and hooks
export interface Provider {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'degraded';
  uptime: number; // percentage
  responseTime: number; // ms
  lastCheck: Date;
  outages: number;
  modelOverrides: ModelOverride[];
}

export interface ModelOverride {
  route: string;
  configuredModel: string;
  actualModel: string;
  timestamp: Date;
}

export interface CostOptimization {
  totalSavings: number;
  recommendations: OptimizationRecommendation[];
  currentMonthlyCost: number;
  projectedMonthlyCost: number;
}

export interface OptimizationRecommendation {
  id: string;
  title: string;
  description: string;
  savings: number;
  action: 'auto-apply' | 'manual' | 'settings-change';
  status: 'pending' | 'applied' | 'dismissed';
}

export interface PerformanceAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  action: string;
  impact: string;
  timestamp: Date;
  resolved: boolean;
}

export interface RouteUsage {
  route: string; // 'default', 'background', 'think', 'webSearch', 'longContext'
  requests: number;
  configuredModel: string;
  actualModel: string;
  cost: number;
  avgResponseTime: number;
  successRate: number;
  recentLogs: ActivityLog[];
  status: 'active' | 'warning' | 'error';
}

export interface ActivityLog {
  id: string;
  timestamp: Date;
  model: string;
  provider: string;
  route: string;
  status: 'success' | 'error' | 'retrying' | 'cached';
  latency: number;
  statusCode?: number;
}

export interface SessionStats {
  totalRequests: number;
  totalCost: number;
  avgResponseTime: number;
  mostUsedRoute: string;
  modelOverrides: number;
  fallbacks: number;
  sessionStart: Date;
}