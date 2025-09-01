// Dashboard configuration and feature flag
export const DASHBOARD_CONFIG = {
  enabled: true, // Set to false to disable dashboard completely
  defaultTab: 'overview',
  tabs: [
    { id: 'overview', label: 'Overview', icon: 'tachometer-alt' },
    { id: 'mission-control', label: 'Mission Control v2', icon: 'satellite-dish' },
    { id: 'models', label: 'Model Manager', icon: 'robot' },
    { id: 'tracking', label: 'Request Tracking', icon: 'chart-line' },
    { id: 'tools', label: 'Tool Integration', icon: 'tools' },
    { id: 'system', label: 'System Health', icon: 'server' }
  ]
};

export const DASHBOARD_ROUTES = {
  main: '/dashboard',
  overview: '/dashboard/overview',
  missionControl: '/dashboard/mission-control',
  models: '/dashboard/models',
  tracking: '/dashboard/tracking',
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
  customProvider: false,
  missionControl: true // Mission Control v2 Advanced Dashboard
};
