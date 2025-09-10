import api from '@/lib/api';

export interface RealtimeStats {
  current: {
    activeRequests: number;
    avgResponseTime: number;
    errorRate: number;
  };
  last1h: {
    totalRequests: number;
    avgResponseTime: number;
    errorRate: number;
    topModels: Array<{ model: string; count: number }>;
  };
  last24h: {
    totalRequests: number;
    avgResponseTime: number;
    errorRate: number;
    topModels: Array<{ model: string; count: number }>;
  };
}

export interface ModelStats {
  model: string;
  provider: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  totalTokens: number;
  totalCost: number;
  lastUsed: number;
  errorRate: number;
  popularityScore: number;
}

export interface RequestLog {
  id: string;
  timestamp: number;
  model: string;
  provider: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  tokenCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  userAgent?: string;
  ipAddress?: string;
  error?: string;
  timeAgo: string;
}

export interface TimeSeriesData {
  timestamp: number;
  time: string;
  requests: number;
  successRate: number;
  avgResponseTime: number;
  errors: number;
}

export interface ModelComparison {
  name: string;
  provider: string;
  requests: number;
  successRate: string;
  avgResponseTime: number;
  totalTokens: number;
  totalCost: string;
  lastUsed: number;
  popularity: number;
  errorRate: string;
}

export interface CostAnalytics {
  breakdown: Array<{
    model: string;
    provider: string;
    totalCost: number;
    costPerRequest: number;
    totalTokens: number;
    costPerToken: number;
  }>;
  summary: {
    totalCost: string;
    totalTokens: number;
    totalRequests: number;
    avgCostPerRequest: string;
    avgCostPerToken: string;
  };
}

class AnalyticsAPI {
  // Get real-time statistics
  async getRealtimeStats(): Promise<RealtimeStats> {
    const response = await fetch('/api/analytics/realtime');
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch realtime stats');
    }
    
    return result.data;
  }

  // Get model statistics
  async getModelStats(): Promise<ModelStats[]> {
    const response = await fetch('/api/analytics/models');
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch model stats');
    }
    
    return result.data;
  }

  // Get recent requests
  async getRecentRequests(limit: number = 50): Promise<RequestLog[]> {
    const response = await fetch(`/api/analytics/requests?limit=${limit}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch recent requests');
    }
    
    return result.data;
  }

  // Get time-series data for charts
  async getTimeSeriesData(hours: number = 24): Promise<TimeSeriesData[]> {
    const response = await fetch(`/api/analytics/timeseries?hours=${hours}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch time series data');
    }
    
    return result.data;
  }

  // Get model comparison data
  async getModelComparison(): Promise<ModelComparison[]> {
    const response = await fetch('/api/analytics/comparison');
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch comparison data');
    }
    
    return result.data;
  }

  // Get top performing models
  async getTopModels(metric: string = 'requests', limit: number = 10): Promise<Array<{
    model: string;
    provider: string;
    value: number;
    totalRequests: number;
    lastUsed: number;
  }>> {
    const response = await fetch(`/api/analytics/top-models?metric=${metric}&limit=${limit}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch top models');
    }
    
    return result.data;
  }

  // Get cost analytics
  async getCostAnalytics(): Promise<CostAnalytics> {
    const response = await fetch('/api/analytics/costs');
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch cost analytics');
    }
    
    return result.data;
  }

  // Get usage analytics by period
  async getUsageAnalytics(period: 'hour' | 'day' | 'week' | 'month'): Promise<TimeSeriesData[]> {
    const response = await fetch(`/api/analytics/usage/${period}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch usage analytics');
    }
    
    return result.data;
  }

  // Helper to format currency
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4
    }).format(amount);
  }

  // Helper to format numbers
  formatNumber(num: number): string {
    if (num >= 1e6) {
      return (num / 1e6).toFixed(1) + 'M';
    } else if (num >= 1e3) {
      return (num / 1e3).toFixed(1) + 'K';
    }
    return num.toString();
  }

  // Helper to format response time
  formatResponseTime(ms: number): string {
    if (ms >= 1000) {
      return (ms / 1000).toFixed(1) + 's';
    }
    return ms.toFixed(0) + 'ms';
  }

  // Helper to format time ago
  formatTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  // Real-time data subscription (using polling for now)
  subscribeToRealtimeStats(callback: (stats: RealtimeStats) => void, interval: number = 5000): () => void {
    const intervalId = setInterval(async () => {
      try {
        const stats = await this.getRealtimeStats();
        callback(stats);
      } catch (error) {
        console.error('Failed to fetch realtime stats:', error);
      }
    }, interval);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }
}

// Export singleton instance
export const analyticsAPI = new AnalyticsAPI();

// =================================================================
// PLUGIN UI INTEGRATION - Independent Analytics Button System
// =================================================================

// Only run in browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  console.log('📊 Analytics plugin: UI integration script loaded');
  
  /**
   * Add analytics button to topbar
   */
  function addAnalyticsButtonToTopbar(): void {
    console.log('🔍 Analytics plugin: Attempting to add button to topbar');
    
    // Check if button already exists
    const existingButton = document.querySelector('[data-analytics-plugin-button="true"]');
    console.log('🔍 Analytics plugin: Existing button found:', existingButton);
    if (existingButton) {
      console.log('🔍 Analytics plugin: Button already exists in topbar');
      return;
    }
    
    // Find the topbar header
    const header = document.querySelector('header');
    console.log('🔍 Analytics plugin: Header element found:', header);
    if (!header) {
      console.warn('Could not find header element for analytics button');
      return;
    }
    
    // Find header actions container
    const headerActions = header.querySelector('.flex.items-center.gap-2');
    console.log('🔍 Analytics plugin: Header actions container found:', headerActions);
    if (!headerActions) {
      console.warn('Could not find header actions container');
      return;
    }
    
    console.log('🔍 Analytics plugin: Creating analytics button');
    
    // Create analytics button
    const analyticsButton = document.createElement('button');
    analyticsButton.className = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9 px-0 relative group ml-2';
    analyticsButton.setAttribute('data-analytics-plugin-button', 'true');
    analyticsButton.setAttribute('title', 'Analytics Dashboard');
    analyticsButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bar-chart-3">
        <path d="M3 3v18h18"/>
        <path d="M18 17V9"/>
        <path d="M13 17V5"/>
        <path d="M8 17v-3"/>
      </svg>
      <span class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse group-hover:animate-none"></span>
    `;
    
    // Add click handler to navigate to analytics
    analyticsButton.addEventListener('click', () => {
      // Try to find and activate Mission Control tab
      const missionControlTab = document.querySelector('[data-tab="mission-control"]');
      if (missionControlTab) {
        (missionControlTab as HTMLElement).click();
      } else {
        // Fallback: dispatch custom event for navigation
        const event = new CustomEvent('navigate-to-analytics', {
          detail: { tab: 'analytics' }
        });
        document.dispatchEvent(event);
      }
      
      console.log('📊 Analytics button clicked - navigating to Mission Control');
    });
    
    console.log('🔍 Analytics plugin: Inserting button into header');
    
    // Insert button in header actions (before settings button)
    if (headerActions) {
      headerActions.insertBefore(analyticsButton, headerActions.firstChild);
      console.log('✅ Analytics plugin: Button added to topbar');
    } else {
      console.warn('Could not find header actions container for analytics button');
    }
  }

  /**
   * Remove analytics button from topbar
   */
  function removeAnalyticsButtonFromTopbar(): void {
    const analyticsButton = document.querySelector('[data-analytics-plugin-button="true"]');
    if (analyticsButton) {
      analyticsButton.remove();
      console.log('🗑️ Analytics plugin: Button removed from topbar');
    }
  }

  /**
   * Check if analytics should be active based on config
   */
  function isAnalyticsActive(): boolean {
    console.log('🔍 Analytics plugin: Checking if analytics is active');
    
    // Check localStorage (set by SettingsDialog)
    const localStorageValue = localStorage.getItem('analytics-enabled');
    console.log('🔍 Analytics plugin: localStorage analytics-enabled:', localStorageValue);
    if (localStorageValue === 'true') {
      console.log('🔍 Analytics plugin: Analytics enabled via localStorage');
      return true;
    }
    
    // Check config from server
    try {
      const configStr = localStorage.getItem('app-config') || '{}';
      console.log('🔍 Analytics plugin: app-config from localStorage:', configStr);
      const config = JSON.parse(configStr);
      const isEnabled = config.plugins?.analytics?.enabled === true;
      console.log('🔍 Analytics plugin: Analytics enabled via app-config:', isEnabled);
      return isEnabled;
    } catch (e) {
      console.log('🔍 Analytics plugin: Error parsing app-config:', e);
      return false;
    }
  }

  /**
   * Initialize analytics button based on current state
   */
  function initializeAnalyticsButton(): void {
    const isActive = isAnalyticsActive();
    console.log('🔍 Analytics plugin: Initializing button, analytics active:', isActive);
    
    if (isActive) {
      console.log('🔍 Analytics plugin: Adding button to topbar');
      addAnalyticsButtonToTopbar();
    } else {
      console.log('🔍 Analytics plugin: Removing button from topbar');
      removeAnalyticsButtonFromTopbar();
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAnalyticsButton);
  } else {
    initializeAnalyticsButton();
  }

  // Listen for config changes (SettingsDialog saves to localStorage)
  window.addEventListener('storage', (event) => {
    console.log('🔄 Analytics plugin: Received storage event:', event.key, event.newValue);
    if (event.key === 'analytics-enabled' || event.key === 'app-config') {
      console.log('🔄 Analytics plugin: Config changed via storage event, updating button visibility');
      setTimeout(initializeAnalyticsButton, 100); // Small delay to ensure localStorage is updated
    }
  });
  
  // Also listen for custom events from SettingsDialog
  window.addEventListener('analytics-toggle-changed', () => {
    console.log('🔄 Analytics plugin: Received toggle change event, updating button visibility');
    setTimeout(initializeAnalyticsButton, 100);
  });

  // Also listen for custom events from SettingsDialog
  window.addEventListener('analytics-config-changed', () => {
    console.log('🔄 Analytics plugin: Received config change event, updating button visibility');
    setTimeout(initializeAnalyticsButton, 100);
  });

  console.log('📊 Analytics plugin UI integration initialized');
  
  // Debug: Check initial state
  console.log('🔍 Analytics plugin debug - Initial state:', {
    localStorageAnalytics: localStorage.getItem('analytics-enabled'),
    localStorageConfig: localStorage.getItem('app-config'),
    isAnalyticsActive: isAnalyticsActive()
  });
}
