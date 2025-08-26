// Dashboard configuration and feature flag
export const DASHBOARD_CONFIG = {
  enabled: true, // Set to false to disable dashboard completely
  defaultTab: 'overview',
  tabs: [
    { id: 'overview', label: 'Overview', icon: 'tachometer-alt' },
    { id: 'models', label: 'Model Manager', icon: 'robot' },
    { id: 'tracking', label: 'Request Tracking', icon: 'chart-line' },
    { id: 'advanced', label: 'Advanced', icon: 'cogs' },
    { id: 'tools', label: 'Tool Integration', icon: 'tools' },
    { id: 'system', label: 'System Health', icon: 'server' },
    { id: 'strategy', label: 'Strategy', icon: 'brain' } // New tab definition
  ]
};

export const DASHBOARD_ROUTES = {
  main: '/dashboard',
  overview: '/dashboard/overview',
  models: '/dashboard/models',
  tracking: '/dashboard/tracking',
  advanced: '/dashboard/advanced',
  tools: '/dashboard/tools',
  system: '/dashboard/system'
};

// Feature flags for different dashboard features
export const DASHBOARD_FEATURES = {
  realTimeMetrics: true,
  requestTracking: true,
  systemHealth: true,
  advancedCharts: true,
  toolIntegrations: true,
  glassmorphism: true,
  customProvider: false
};
