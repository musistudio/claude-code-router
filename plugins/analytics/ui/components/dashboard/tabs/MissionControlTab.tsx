import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useMissionControl, type Activity } from '@plugins/analytics/ui/hooks/useMissionControl';
import { useRealTimeMissionControl, useProviderHistory } from '@plugins/analytics/ui/hooks/useMissionControlData';
import { useConfig } from '@/components/ConfigProvider';
import { formatResponseTime, formatPercentage, formatTokens, getResponseTimeColor, formatSuccessRate, getErrorRateColor } from '@/lib/formatters';
import type { MissionControlData, ModelStat, HealthHistoryData } from '@plugins/analytics/ui/types/missionControl';
import { api } from '@/lib/api';
import { analyticsAPI } from '@plugins/analytics/ui/lib/analytics';
import type { RealtimeStats, ModelStats } from '@plugins/analytics/ui/lib/analytics';
import '@plugins/analytics/styles/mission-control.css';

interface RouteCardData {
  route: string;
  displayName: string;
  config: {
    enabled: boolean;
    provider: string;
    model: string;
    description: string;
  };
  stats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    avgResponseTime: number;
    successRate: number;
    errorRate: number;
    totalTokens: number;
    totalCost: number;
    lastUsed: number;
  } | null;
  recentActivity: Activity[];
  score: number;
  status: 'healthy' | 'warning' | 'error' | 'inactive' | 'low_success' | 'slow_response';
}

interface RequestData {
  time: string;
  requests: number;
  errors: number;
  latency: number;
}

interface RequestLog {
  id: string;
  timestamp: string;
  method: string;
  model: string;
  status: 'success' | 'error' | 'pending';
  responseTime: number;
  tokens: number;
}

interface ServiceStatus {
  name: string;
  status: 'online' | 'offline' | 'loading';
  port?: string;
  icon: string;
  details: string;
}

export function MissionControlTab() {
    const [activeTab, setActiveTab] = useState<'routes' | 'overview' | 'providers' | 'analytics' | 'activity'>('routes');
  
  // Hook-uri pentru date în timp real
  const { routerConfig, routeStats, liveActivity, loading: basicLoading, error: basicError } = useMissionControl();
  const { data: missionControlData, loading: mcLoading, error: mcError } = useRealTimeMissionControl(); // Too aggressive - 2s polling
  const { data: providerHistory, loading: historyLoading } = useProviderHistory();
  
  // Theme context
  // Independent theme configuration for analytics (when themes plugin is disabled)
  const isAdvanced = false; // Use standard UI styling for analytics dashboard
  
  // Analytics state
  const { config } = useConfig();
  const [timeRange, setTimeRange] = useState('1h');
  const [chartData, setChartData] = useState<RequestData[]>([]);
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);
  const [isLiveMode, setIsLiveMode] = useState(true);
  
  // Activity logs state
  const [activityTimeRange, setActivityTimeRange] = useState<'10m' | '1h' | '6h' | '24h' | 'all'>('1h');
  const [activityLimit, setActivityLimit] = useState<number>(50);

  // Overview state - integrated from OverviewTab
  const [realtimeStats, setRealtimeStats] = useState<RealtimeStats | null>(null);
  const [modelStats, setModelStats] = useState<ModelStats[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [services, setServices] = useState<ServiceStatus[]>([
    {
      name: 'Proxy Service',
      status: 'loading',
      port: '8001',
      icon: 'exchange-alt',
      details: 'AI Request Proxy'
    },
    {
      name: 'Web Interface',
      status: 'online',
      port: '3456',
      icon: 'globe',
      details: 'Management UI'
    },
    {
      name: 'Socket Connections',
      status: 'loading',
      icon: 'plug',
      details: 'WebSocket'
    },
    {
      name: 'API Endpoints',
      status: 'loading',
      icon: 'code',
      details: 'REST API'
    }
  ]);

  // Real stats from config
  const providers = Array.isArray(config?.Providers) ? config.Providers : [];
  const totalProviders = providers.length;
  const configuredProviders = providers.filter(p => p.api_key).length;
  const totalModels = providers.reduce((acc, provider) => acc + (provider.models?.length || 0), 0);
  const activeModel = config?.Router?.default || 'None selected';
  const hasActiveModel = activeModel !== 'None selected' && activeModel !== '';

  // Procesează datele pentru cardurile de rute
  const routeCards: RouteCardData[] = useMemo(() => {
    if (!routerConfig) return [];

    const routes = [
      { key: 'default', name: 'Default Route', icon: 'fa-home', color: 'cyan' },
      { key: 'background', name: 'Background Tasks', icon: 'fa-tasks', color: isAdvanced ? 'blue' : 'green' },
      { key: 'think', name: 'Thinking & Planning', icon: 'fa-brain', color: 'purple' },
      { key: 'longContext', name: 'Long Context', icon: 'fa-scroll', color: 'blue' },
      { key: 'webSearch', name: 'Web Search', icon: 'fa-search', color: 'orange' }
    ];

    return routes.map(route => {
      const config = routerConfig[route.key as keyof typeof routerConfig];
      
      // Găsește statisticile pentru această rută din routeStats
      const routeStat = Array.isArray(routeStats) 
        ? routeStats.find(stat => stat.route === route.key)
        : routeStats?.[route.key];

      // Filtrează activitatea recentă pentru această rută
      const safeActivity = Array.isArray(liveActivity) ? liveActivity : [];
      const routeActivity = safeActivity.filter(activity => {
        // Verifică dacă activitatea aparține acestei rute prin diverse metode
        if (activity.route === route.key) return true;
        
        // Fallback: încearcă să determine ruta din mesaj sau model
        const message = activity.message.toLowerCase();
        const model = (activity.actualModel || activity.model).toLowerCase();
        
        switch (route.key) {
          case 'background':
            return message.includes('background') || message.includes('task');
          case 'think':
            return message.includes('think') || message.includes('reasoning') || message.includes('planning');
          case 'longContext':
            return message.includes('long') || message.includes('context') || message.includes('large');
          case 'webSearch':
            return message.includes('search') || message.includes('web') || message.includes('browse');
          case 'default':
            // Default primește tot ce nu se potrivește altundeva
            return !['background', 'think', 'long', 'context', 'search', 'web'].some(keyword => 
              message.includes(keyword) || model.includes(keyword)
            );
          default:
            return false;
        }
      }).slice(0, 10); // Limitează la ultimele 10 activități

      // Calculează scorul pentru această rută
      const calculateScore = (stats: any) => {
        if (!stats || stats.totalRequests === 0) return 0;
        
        const successWeight = 0.7; // Creștem ponderea succesului
        const performanceWeight = 0.3; // Reducem ponderea performanței
        
        const successScore = (stats.successfulRequests / stats.totalRequests) * 100;
        // Ajustăm formula pentru performance - permițând timpi mai lungi (până la 30 secunde)
        const performanceScore = Math.max(0, 100 - Math.min(100, (stats.avgResponseTime / 300))); // 0-100 scale based on response time (30s max)
        
        return Math.round(successScore * successWeight + performanceScore * performanceWeight);
      };

      const score = calculateScore(routeStat);

      // Determină statusul
      const getStatus = (config: any, stats: any, score: number) => {
        if (!config.enabled) return 'inactive';
        if (!stats || stats.totalRequests === 0) return 'inactive';
        if (score >= 80) return 'healthy';
        if (score >= 60) return 'warning';
        // Pentru scoruri sub 60, determinăm cauza specifică
        if (stats && stats.totalRequests > 0) {
          const successRate = (stats.successfulRequests / stats.totalRequests) * 100;
          if (successRate < 70) return 'low_success';
          if (stats.avgResponseTime > 15000) return 'slow_response';
        }
        return 'warning';
      };

      return {
        route: route.key,
        displayName: route.name,
        config,
        stats: routeStat || null,
        recentActivity: routeActivity,
        score: Math.round(score),
        status: getStatus(config, routeStat, score)
      };
    });
  }, [routerConfig, routeStats, liveActivity]);

    // Calculăm statistici agregate pentru celelalte taburi
  const aggregatedStats = useMemo(() => {
    if (!missionControlData?.aggregated) return null;
    
    const { modelStats, totalRequests, successRate, avgResponseTime } = missionControlData.aggregated;
    
    return {
      totalRequests,
      successRate,
      avgResponseTime,
      modelStats
    };
  }, [missionControlData]);

  // Status sistem
  const systemStatus = useMemo(() => {
    if (!missionControlData?.live) return null;
    
    const { queue, rateLimiting, deduplication } = missionControlData.live;
    
    return {
      queueStatus: queue.currentSize > 0 ? 'active' : 'idle',
      circuitBreaker: rateLimiting.circuitBreakerState,
      cacheHealth: deduplication.cacheHitRate > 50 ? 'good' : deduplication.cacheHitRate > 20 ? 'warning' : 'poor',
      isProcessing: queue.processing
    };
  }, [missionControlData]);
  
  // Filter activities based on time range and limit
  const filteredActivities = useMemo(() => {
    if (!liveActivity || !Array.isArray(liveActivity)) return [];
    
    let filtered = [...liveActivity];
    
    // Filter by time range
    if (activityTimeRange !== 'all') {
      const now = Date.now();
      let timeRangeMs: number;
      
      switch (activityTimeRange) {
        case '10m': timeRangeMs = 10 * 60 * 1000; break;
        case '1h': timeRangeMs = 60 * 60 * 1000; break;
        case '6h': timeRangeMs = 6 * 60 * 60 * 1000; break;
        case '24h': timeRangeMs = 24 * 60 * 60 * 1000; break;
        default: timeRangeMs = 0;
      }
      
      filtered = filtered.filter(activity => {
        // Convert timestamp to number if it's a string
        const activityTimestamp = typeof activity.timestamp === 'string' 
          ? new Date(activity.timestamp).getTime() 
          : activity.timestamp;
        return now - activityTimestamp <= timeRangeMs;
      });
    }
    
    // Apply limit
    if (activityLimit > 0) {
      filtered = filtered.slice(0, activityLimit);
    }
    
    return filtered;
  }, [liveActivity, activityTimeRange, activityLimit]);

  // Provider status
  const providerStatus = useMemo(() => {
    if (!missionControlData?.live?.providers) return [];
    
    return Object.entries(missionControlData.live.providers).map(([provider, stats]) => ({
      provider,
      status: stats.failureCount > 5 ? 'degraded' : stats.inRecovery ? 'recovery' : 'healthy',
      healthScore: Math.max(0, 100 - (stats.failureCount * 10)),
      ...stats
    }));
  }, [missionControlData]);

  // Funcții helper pentru culori și iconițe
  const getRouteColor = (route: string) => {
    const colors = {
      default: 'cyan',
      background: isAdvanced ? 'blue' : 'green', 
      think: 'purple',
      longContext: 'blue',
      webSearch: 'orange'
    };
    return colors[route as keyof typeof colors] || 'gray';
  };

  // Analytics data loading effect
  useEffect(() => {
    const loadRealData = async () => {
      try {
        // Load realtime stats
        const realtimeResponse = await fetch('/api/analytics/realtime');
        const realtimeData = await realtimeResponse.json();
        
        // Load recent requests
        const requestsResponse = await fetch('/api/analytics/requests?limit=50');
        const requestsData = await requestsResponse.json();
        
        // Generate chart data from real analytics time-series data
        const generateChartDataFromReal = async () => {
          try {
            // Get time-series data based on selected time range
            let hours = 1;
            switch (timeRange) {
              case '1h': hours = 1; break;
              case '6h': hours = 6; break;
              case '24h': hours = 24; break;
              case '7d': hours = 24 * 7; break;
            }
            
            const timeSeriesResponse = await fetch(`/api/analytics/timeseries?hours=${hours}`);
            const timeSeriesData = await timeSeriesResponse.json();
            
            if (timeSeriesData.success && timeSeriesData.data && Array.isArray(timeSeriesData.data)) {
              // Convert backend time-series data to chart format
              const chartData: RequestData[] = timeSeriesData.data.map((point: any) => ({
                time: point.time,
                requests: point.requests || 0,
                errors: point.errors || 0,
                latency: point.avgResponseTime || 0
              }));
              setChartData(chartData);
            } else {
              // Fallback to empty data if no time-series available
              const data: RequestData[] = [];
              const now = new Date();
              for (let i = 23; i >= 0; i--) {
                const time = new Date(now.getTime() - i * 5 * 60 * 1000);
                data.push({
                  time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  requests: 0,
                  errors: 0,
                  latency: 0
                });
              }
              setChartData(data);
            }
          } catch (error) {
            console.error('Error loading time-series data:', error);
            // Fallback to empty data
            setChartData([]);
          }
        };

        // Convert real requests to request logs
        if (requestsData.success && requestsData.data && Array.isArray(requestsData.data)) {
          const realLogs: RequestLog[] = requestsData.data.map((req: any, i: number) => ({
            id: req.id || `req-${i}`,
            timestamp: new Date(req.timestamp).toLocaleTimeString(),
            method: `${req.method} ${req.endpoint}`,
            model: req.actualModel || req.model,
            status: req.statusCode < 400 ? 'success' : 'error',
            responseTime: req.responseTime,
            tokens: req.tokenCount || 0
          }));
          setRequestLogs(realLogs);
        } else {
          // No real data, show empty
          setRequestLogs([]);
        }

        await generateChartDataFromReal();
      } catch (error) {
        console.error('Error loading real analytics data:', error);
        // Fallback to empty data instead of fake data
        setChartData([]);
        setRequestLogs([]);
      }
    };

    // Only load analytics data when analytics tab is active
    if (activeTab === 'analytics') {
      loadRealData();

      // Update data every 5 seconds if live mode is on
      const interval = isLiveMode ? setInterval(() => {
        loadRealData();
      }, 5000) : null;

      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [isLiveMode, timeRange, config, activeTab]);

  // Overview data loading effect - integrated from OverviewTab
  useEffect(() => {
    let cleanup: (() => void) | null = null;

    const loadOverviewData = async () => {
      if (activeTab !== 'overview') return;
      
      try {
        setOverviewLoading(true);
        
        // Load initial data
        const [realtimeData, modelData] = await Promise.all([
          analyticsAPI.getRealtimeStats(),
          analyticsAPI.getModelStats()
        ]);

        setRealtimeStats(realtimeData);
        setModelStats(modelData);

        // Check service statuses
        await checkServices();

        // Set up real-time subscription
        cleanup = analyticsAPI.subscribeToRealtimeStats((stats) => {
          setRealtimeStats(stats);
        }, 30000); // Update every 30 seconds

      } catch (error) {
        console.error('Error loading overview analytics data:', error);
        // Fallback to config-only data if analytics fail
      } finally {
        setOverviewLoading(false);
      }
    };

    loadOverviewData();

    return () => {
      if (cleanup) cleanup();
    };
  }, [activeTab]);

  const checkServices = async () => {
    try {
      // Test if we can reach the API (since we're using it)
      await api.getConfig();
      
      setServices(prev => prev.map(service => {
        if (service.name === 'API Endpoints') {
          return { ...service, status: 'online' };
        }
        if (service.name === 'Proxy Service') {
          return { ...service, status: 'online' }; // Assume online if we can reach API
        }
        // For other services, mark as online if we can reach the API, otherwise offline
        return { ...service, status: 'online' };
      }));
    } catch (error) {
      console.error('Error checking services:', error);
      setServices(prev => prev.map(service => ({
        ...service,
        status: service.name === 'Web Interface' ? 'online' : 'offline'
      })));
    }
  };

  // Analytics calculations
  const totalRequests = chartData.reduce((sum, data) => sum + data.requests, 0);
  const totalErrors = chartData.reduce((sum, data) => sum + data.errors, 0);
  const avgLatency = Math.round(chartData.reduce((sum, data) => sum + data.latency, 0) / chartData.length) || 0;
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

  const getRouteIcon = (route: string) => {
    const icons = {
      default: 'fa-home',
      background: 'fa-tasks',
      think: 'fa-brain', 
      longContext: 'fa-scroll',
      webSearch: 'fa-search'
    };
    return icons[route as keyof typeof icons] || 'fa-circle';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': 
        return isAdvanced ? 'text-blue-400 border-blue-400/30' : 'text-green-400 border-green-400/30';
      case 'warning': 
        return 'text-yellow-400 border-yellow-400/30';
      case 'error': 
        return 'text-red-400 border-red-400/30';
      case 'low_success': 
        return 'text-orange-400 border-orange-400/30';
      case 'slow_response': 
        return 'text-blue-400 border-blue-400/30';
      case 'inactive': 
        return 'text-gray-400 border-gray-400/30';
      default: 
        return 'text-gray-400 border-gray-400/30';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'healthy': 
        return isAdvanced ? 'bg-blue-400/10 hover:bg-blue-400/20' : 'bg-green-400/10 hover:bg-green-400/20';
      case 'warning': 
        return 'bg-yellow-400/10 hover:bg-yellow-400/20';
      case 'error': 
        return 'bg-red-400/10 hover:bg-red-400/20';
      case 'low_success': 
        return 'bg-orange-400/10 hover:bg-orange-400/20';
      case 'slow_response': 
        return 'bg-blue-400/10 hover:bg-blue-400/20';
      case 'inactive': 
        return 'bg-gray-400/10 hover:bg-gray-400/20';
      default: 
        return 'bg-gray-400/10 hover:bg-gray-400/20';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return isAdvanced ? 'text-blue-400' : 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getActivityStatusColor = (type: string) => {
    switch (type) {
      case 'success': 
        return isAdvanced ? 'bg-blue-400' : 'bg-green-400';
      case 'error': 
        return 'bg-red-400';
      case 'warning': 
        return 'bg-yellow-400';
      default: 
        return 'bg-blue-400';
    }
  };

  // Loading state combinat
  const isLoading = basicLoading || mcLoading || historyLoading;
  const error = basicError || mcError;

  return (
    <div className="space-y-8 h-full overflow-y-auto p-4">
      {/* Header */}
      <motion.div
        className={isAdvanced ? "glass-card" : "bg-card border border-border rounded-lg p-6 mb-6"}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-3xl font-bold text-foreground">Mission Control</h1>
        <p className="text-muted-foreground mt-1">Monitorizare completă a sistemului în timp real.</p>
      </motion.div>

      {/* Navigation */}
      <div className={isAdvanced ? "nav-tabs" : "flex bg-card border border-border rounded-lg p-2 mb-6 overflow-x-auto"}>
        <button
          onClick={() => setActiveTab('routes')}
          className={isAdvanced 
            ? `nav-tab ${activeTab === 'routes' ? 'active' : ''}` 
            : `flex-1 min-w-[150px] px-4 py-3 text-center border-none rounded-lg cursor-pointer transition-all duration-300 font-medium ${
                activeTab === 'routes' 
                ? 'bg-primary text-primary-foreground shadow-md' 
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`
          }
        >
          <i className="fas fa-route mr-2"></i>
          Live Routes
        </button>
        <button
          onClick={() => setActiveTab('overview')}
          className={isAdvanced 
            ? `nav-tab ${activeTab === 'overview' ? 'active' : ''}` 
            : `flex-1 min-w-[150px] px-4 py-3 text-center border-none rounded-lg cursor-pointer transition-all duration-300 font-medium ${
                activeTab === 'overview' 
                ? 'bg-primary text-primary-foreground shadow-md' 
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`
          }
        >
          <i className="fas fa-chart-line mr-2"></i>
          Overview
        </button>
        <button
          onClick={() => setActiveTab('providers')}
          className={isAdvanced 
            ? `nav-tab ${activeTab === 'providers' ? 'active' : ''}` 
            : `flex-1 min-w-[150px] px-4 py-3 text-center border-none rounded-lg cursor-pointer transition-all duration-300 font-medium ${
                activeTab === 'providers' 
                ? 'bg-primary text-primary-foreground shadow-md' 
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`
          }
        >
          <i className="fas fa-server mr-2"></i>
          Providers
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={isAdvanced 
            ? `nav-tab ${activeTab === 'analytics' ? 'active' : ''}` 
            : `flex-1 min-w-[150px] px-4 py-3 text-center border-none rounded-lg cursor-pointer transition-all duration-300 font-medium ${
                activeTab === 'analytics' 
                ? 'bg-primary text-primary-foreground shadow-md' 
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`
          }
        >
          <i className="fas fa-chart-line mr-2"></i>
          Analytics
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={isAdvanced 
            ? `nav-tab ${activeTab === 'activity' ? 'active' : ''}` 
            : `flex-1 min-w-[150px] px-4 py-3 text-center border-none rounded-lg cursor-pointer transition-all duration-300 font-medium ${
                activeTab === 'activity' 
                ? 'bg-primary text-primary-foreground shadow-md' 
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`
          }
        >
          <i className="fas fa-stream mr-2"></i>
          Activitate
        </button>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          className={isAdvanced ? "glass-card" : "bg-card border border-border rounded-lg p-6"}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {isLoading && <div className="text-center text-muted-foreground">Se încarcă datele...</div>}
          {error && <div className="text-center text-destructive">Eroare: {error}</div>}

          {/* Enhanced Overview Tab - Integrated from OverviewTab */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* System Overview - Real Stats from Config and Analytics */}
              <motion.div 
                className={isAdvanced ? "glass-card" : "bg-card border border-border rounded-lg p-6 mb-6"}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="flex items-center gap-4 mb-6">
                  <i className="fas fa-tachometer-alt text-2xl text-primary"></i>
                  <h2 className="text-2xl font-bold">System Overview</h2>
                  {overviewLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-3 h-3 animate-spin rounded-full border border-current border-t-transparent"></div>
                      Loading real-time data...
                    </div>
                  )}
                </div>
                
                {/* Real Stats from Config and Analytics */}
                <div className={isAdvanced ? "stats-grid" : "grid grid-cols-2 lg:grid-cols-4 gap-4"}>
                  <motion.div 
                    className={isAdvanced ? "stat-card" : "bg-card/50 border border-border rounded-lg p-4 text-center hover:bg-card/70 transition-colors"}
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className={isAdvanced ? "stat-number" : "text-2xl font-bold text-primary mb-2"}>{realtimeStats?.last24h.totalRequests || 0}</div>
                    <div className={isAdvanced ? "stat-label" : "text-sm text-muted-foreground font-medium"}>Total Requests (24h)</div>
                  </motion.div>
                  
                  <motion.div 
                    className={isAdvanced ? "stat-card" : "bg-card/50 border border-border rounded-lg p-4 text-center hover:bg-card/70 transition-colors"}
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className={isAdvanced ? "stat-number" : "text-2xl font-bold text-primary mb-2"}>{totalProviders}</div>
                    <div className={isAdvanced ? "stat-label" : "text-sm text-muted-foreground font-medium"}>Total Providers</div>
                  </motion.div>
                  
                  <motion.div 
                    className={isAdvanced ? "stat-card" : "bg-card/50 border border-border rounded-lg p-4 text-center hover:bg-card/70 transition-colors"}
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className={isAdvanced ? "stat-number" : "text-2xl font-bold text-primary mb-2"}>{formatResponseTime(realtimeStats?.last24h.avgResponseTime || 0)}</div>
                    <div className={isAdvanced ? "stat-label" : "text-sm text-muted-foreground font-medium"}>Avg Response Time</div>
                  </motion.div>
                  
                  <motion.div 
                    className={isAdvanced ? "stat-card" : "bg-card/50 border border-border rounded-lg p-4 text-center hover:bg-card/70 transition-colors"}
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className={isAdvanced ? "stat-number" : "text-2xl font-bold text-primary mb-2"}>{formatSuccessRate(realtimeStats?.last24h.errorRate || 0)}</div>
                    <div className={isAdvanced ? "stat-label" : "text-sm text-muted-foreground font-medium"}>Success Rate</div>
                  </motion.div>
                </div>

                {/* Live Performance Metrics */}
                {realtimeStats && (
                  <div className="mt-8">
                    <div className="flex items-center gap-4 mb-6">
                      <i className="fas fa-pulse text-xl text-chart-1"></i>
                      <h3 className="text-xl font-bold">Live Performance</h3>
                      <span className="text-sm text-chart-1">● Live</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-card/50 p-4 rounded-lg border border-border">
                        <h4 className="text-lg font-semibold text-card-foreground mb-2">Current Activity</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Active Requests:</span>
                            <span className="text-chart-1 font-mono">{realtimeStats.current.activeRequests}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Avg Response:</span>
                            <span className={`font-mono ${getResponseTimeColor(realtimeStats.current.avgResponseTime)}`}>
                              {formatResponseTime(realtimeStats.current.avgResponseTime)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Error Rate:</span>
                            <span className={`font-mono ${getErrorRateColor(realtimeStats?.current?.errorRate || 0)}`}>
                              {formatPercentage(realtimeStats?.current?.errorRate || 0)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-card/50 p-4 rounded-lg border border-border">
                        <h4 className="text-lg font-semibold text-card-foreground mb-2">Last Hour</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Requests:</span>
                            <span className="text-primary font-mono">{realtimeStats.last1h.totalRequests}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Avg Response:</span>
                            <span className={`font-mono ${getResponseTimeColor(realtimeStats.last1h.avgResponseTime)}`}>
                              {formatResponseTime(realtimeStats.last1h.avgResponseTime)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Top Model:</span>
                            <span className="text-chart-1 font-mono text-sm">
                              {realtimeStats.last1h.topModels[0]?.model.substring(0, 15) || 'None'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-card/50 p-4 rounded-lg border border-border">
                        <h4 className="text-lg font-semibold text-card-foreground mb-2">Top Models (24h)</h4>
                        <div className="space-y-2">
                          {realtimeStats?.last24h?.topModels && Array.isArray(realtimeStats.last24h.topModels) ? 
                            realtimeStats.last24h.topModels.slice(0, 3).map((model, index) => (
                              <div key={index} className="flex justify-between items-center">
                                <span className="text-muted-foreground text-sm">{model.model.substring(0, 12)}:</span>
                                <span className="text-primary font-mono text-sm">{model.count}</span>
                              </div>
                            )) : (
                              <div className="text-muted text-sm">No data available</div>
                            )
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Current Configuration Summary */}
                <div className="mt-8">
                  <div className="flex items-center gap-4 mb-6">
                    <i className="fas fa-cog text-xl text-primary"></i>
                    <h3 className="text-xl font-bold">Current Configuration</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Active Model */}
                    <div className="bg-card/50 p-4 rounded-lg border border-border">
                      <h4 className="text-lg font-semibold text-card-foreground mb-2">Active Router</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Default Model:</span>
                          <span className={`font-mono ${hasActiveModel ? 'text-chart-1' : 'text-destructive'}`}>
                            {activeModel}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Background Model:</span>
                          <span className="text-foreground font-mono">{config?.Router?.background || 'Not set'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Long Context:</span>
                          <span className="text-foreground font-mono">{config?.Router?.longContext || 'Not set'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Provider Summary */}
                    <div className="bg-card/50 p-4 rounded-lg border border-border">
                      <h4 className="text-lg font-semibold text-card-foreground mb-2">Provider Status</h4>
                      <div className="space-y-2">
                        {providers.slice(0, 3).map((provider, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-muted-foreground">{provider.name || `Provider ${index + 1}`}:</span>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${provider.api_key ? (isAdvanced ? 'bg-blue-500' : 'bg-green-500') : 'bg-red-500'}`}></span>
                              <span className="text-sm text-foreground">{provider.models?.length || 0} models</span>
                            </div>
                          </div>
                        ))}
                        {providers.length > 3 && (
                          <div className="text-sm text-muted text-center pt-2">
                            +{providers.length - 3} more providers
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Services Status */}
              <motion.div 
                className={isAdvanced ? "glass-card" : "bg-card border border-border rounded-lg p-6"}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <i className="fas fa-server text-2xl text-chart-1"></i>
                    <h2 className="text-2xl font-bold">Services Status</h2>
                  </div>
                  <button 
                    onClick={checkServices}
                    className="px-4 py-2 bg-blue-500/20 text-primary rounded-lg border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                  >
                    <i className="fas fa-sync-alt mr-2"></i>
                    Refresh
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {services.map((service, index) => (
                    <motion.div
                      key={service.name}
                      className={isAdvanced ? "service-status-card" : "bg-card/50 border border-border rounded-lg p-4 flex items-center gap-4 hover:bg-card/70 transition-colors"}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      whileHover={{ scale: 1.02 }}
                    >
                      <div className="service-icon">
                        <i className={`fas fa-${service.icon}`}></i>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-bold text-foreground">{service.name}</h4>
                        <p className="text-muted-foreground text-sm">{service.details}</p>
                        {service.port && <p className="text-muted text-xs">Port {service.port}</p>}
                      </div>
                      <span className={`service-badge ${service.status}`}>
                        {service.status === 'loading' ? 'Checking...' : service.status}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}

          {/* Routes Tab - 5 Beautiful Route Cards */}
          {activeTab === 'routes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-foreground">Live Route Monitoring</h3>
                <div className="text-sm text-muted-foreground">
                  Actualizat în timp real • {routeCards.length} rute active
                </div>
              </div>
              
              {!routerConfig && !isLoading && (
                <div className="bg-chart-4/10 border border-chart-4/30 p-4 rounded-lg">
                  <p className="text-chart-4">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    Nu s-au putut încărca configurațiile rutelor. Verificați conexiunea API.
                  </p>
                </div>
              )}
              
              {routeCards.length > 0 && (
                <div className="route-cards-grid grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {routeCards.map((card, index) => {
                    const color = getRouteColor(card.route);
                    const icon = getRouteIcon(card.route);
                    const statusColors = getStatusColor(card.status);
                    const scoreColor = getScoreColor(card.score);
                    
                    return (
                      <motion.div
                        key={card.route}
                        className={`
                          relative overflow-hidden rounded-xl border-2 h-48
                          ${isAdvanced 
                            ? 'backdrop-blur-sm border-route-card-border hover:border-glass-border-strong transition-all duration-300' 
                            : 'bg-card/90 border-border/50 hover:scale-105 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl'
                          }
                          ${!isAdvanced ? `${getStatusBg(card.status)} ${statusColors}` : ''}
                          ${isAdvanced ? 'hover:backdrop-blur-md' : ''}
                        `}
                        style={isAdvanced ? {
                          background: 'var(--route-card-bg)',
                          backdropFilter: 'blur(15px) saturate(110%)',
                          border: '1px solid var(--route-card-border)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        } : {}}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: index * 0.1 }}
                        whileHover={{ y: -5 }}
                      >
                        {/* Header - more compact */}
                        <div className="p-4 pb-3">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                              <div className={`w-8 h-8 rounded-lg bg-${color}-500/20 flex items-center justify-center`}>
                                <i className={`${icon} text-${color}-400 text-sm`}></i>
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-foreground">{card.displayName}</h4>
                                <p className="text-xs text-muted-foreground truncate max-w-32">{card.config.description}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-xl font-bold ${scoreColor}`}>
                                {card.score}
                              </div>
                              <div className="text-xs text-muted-foreground">Score</div>
                            </div>
                          </div>
                          
                          {/* Status Badge - more compact */}
                          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border ${
                            isAdvanced 
                              ? 'bg-glass-bg-strong border-glass-border-strong text-foreground backdrop-blur-sm' 
                              : `${statusColors} ${getStatusBg(card.status)}`
                          }`}>
                            <div className={`w-2 h-2 rounded-full mr-1 animate-pulse ${getActivityStatusColor(
                              card.status === 'healthy' ? 'success' :
                              card.status === 'warning' ? 'warning' :
                              card.status === 'error' ? 'error' : 'info'
                            )}`}></div>
                            {card.status === 'healthy' ? 'Sănătos' :
                             card.status === 'warning' ? 'Atenție' :
                             card.status === 'error' ? 'Eroare' :
                             card.status === 'low_success' ? 'Succes scăzut' :
                             card.status === 'slow_response' ? 'Răspuns lent' : 'Inactiv'}
                          </div>
                        </div>

                        {/* Model Configuration - more compact */}
                        <div className="px-3 pb-1">
                          <div className="bg-slate-700/50 rounded-lg p-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Model:</span>
                              <span className={`font-bold text-${color}-400 truncate max-w-20`}>
                                {card.config.model || 'N/A'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs mt-1">
                              <span className="text-muted-foreground">Provider:</span>
                              <span className="font-semibold text-foreground truncate max-w-20">
                                {card.config.provider || 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Statistics - more compact */}
                        {card.stats && (
                          <div className="px-3 pb-1">
                            <div className="grid grid-cols-3 gap-1">
                              <div className={`p-1.5 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-md ${
                                isAdvanced 
                                  ? 'bg-glass-bg-strong border border-glass-border-strong backdrop-blur-sm' 
                                  : `bg-${color}-500/10 border-${color}-500/20`
                              } text-center border`}>
                                <div className={`text-xs font-bold transition-all duration-200 hover:scale-110 ${
                                  isAdvanced ? 'text-foreground' : `text-${color}-600`
                                }`}>
                                  {card.stats.totalRequests.toLocaleString()}
                                </div>
                                <div className="text-xs text-muted-foreground">Cereri</div>
                              </div>
                              <div className={`p-1.5 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-md ${
                                isAdvanced 
                                  ? 'bg-glass-bg-strong border border-glass-border-strong backdrop-blur-sm' 
                                  : 'bg-chart-1/10 border-chart-1/20'
                              } text-center border`}>
                                <div className={`text-xs font-bold transition-all duration-200 hover:scale-110 ${
                                  isAdvanced ? 'text-foreground' : 'text-chart-1'
                                }`}>
                                  {card.stats.successRate.toFixed(1)}%
                                </div>
                                <div className="text-xs text-muted-foreground">Succes</div>
                              </div>
                              <div className={`p-1.5 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-md ${
                                isAdvanced 
                                  ? 'bg-glass-bg-strong border border-glass-border-strong backdrop-blur-sm' 
                                  : 'bg-primary/10 border-primary/20'
                              } text-center border`}>
                                <div className={`text-xs font-bold transition-all duration-200 hover:scale-110 ${
                                  isAdvanced ? 'text-foreground' : 'text-primary'
                                }`}>
                                  {formatResponseTime(card.stats.avgResponseTime)}
                                </div>
                                <div className="text-xs text-muted-foreground">Timp</div>
                              </div>
                            </div>
                          </div>
                        )}


                        {/* Recent Activity - more compact with internal scroll */}
                        <div className="px-3 pb-3">
                          <div className="flex items-center justify-between mb-1">
                            <h5 className="text-xs font-semibold text-foreground">Activitate</h5>
                            <span className="text-xs text-muted-foreground">
                              {card.recentActivity.length}
                            </span>
                          </div>
                          <div className="space-y-1 max-h-32 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-400/60 scrollbar-track-gray-200/20 hover:scrollbar-thumb-gray-500/80">
                            {card.recentActivity.length > 0 ? (
                              card.recentActivity.map((activity, idx) => (
                                <div key={`${activity.id}-${idx}`} className={`p-2 rounded text-xs border transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${
                                  isAdvanced ? 'bg-glass-bg/30 border-glass-border/50 backdrop-blur-sm' : 'bg-card/60 border-border/50'
                                } ${getStatusBg(activity.type === 'success' ? 'healthy' : activity.type === 'error' ? 'error' : 'warning')}`}>
                                  {/* Single compact row: Status + Time */}
                                  <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-1">
                                      <span className={`w-2 h-2 rounded-full ${getActivityStatusColor(activity.type)}`}></span>
                                      <span className="text-muted-foreground font-mono text-[11px] truncate">
                                        {new Date(activity.timestamp).toLocaleTimeString('ro-RO', {
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}
                                      </span>
                                    </div>
                                    <span className="text-primary font-mono text-[11px] truncate">
                                      {formatResponseTime(activity.responseTime)}
                                    </span>
                                  </div>
                                  {/* Message row */}
                                  <div className="text-[11px] text-foreground truncate mt-1" title={activity.message}>
                                    {activity.message.replace('Request successful', '✓').replace('Request failed', '✗')}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-muted text-center py-3">
                                <i className="fas fa-clock text-muted mb-1"></i>
                                <div>Nicio activitate recentă</div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Decorative Elements */}
                        <div className={`absolute top-0 right-0 w-20 h-20 bg-${color}-500/5 rounded-bl-full`}></div>
                        <div className={`absolute bottom-0 left-0 w-16 h-16 bg-${color}-500/5 rounded-tr-full`}></div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
              
              {routeCards.length === 0 && !isLoading && (
                <div className="text-center py-12">
                  <i className="fas fa-route text-muted text-6xl mb-4"></i>
                  <h3 className="text-xl font-bold text-foreground mb-2">Nu sunt configurate rute</h3>
                  <p className="text-muted-foreground">Configurați rutele pentru a vedea monitorizarea în timp real</p>
                </div>
              )}
            </div>
          )}

          {/* Providers Tab */}
          {activeTab === 'providers' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-foreground mb-4">Status Providers</h3>
              
              {!providerStatus.length && !isLoading && (
                <div className="bg-chart-4/10 border border-chart-4/30 p-4 rounded-lg">
                  <p className="text-chart-4">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    Nu s-au putut încărca informațiile despre provideri. Verificați conexiunea API.
                  </p>
                </div>
              )}
              
              {providerStatus.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {providerStatus.map((provider) => (
                    <div key={provider.provider} className={`p-4 rounded-lg border-2 ${
                      provider.status === 'healthy' ? 'border-chart-1/50' : 
                      provider.status === 'recovery' ? 'border-chart-4/50' : 'border-destructive/50'
                    } bg-card/30`}>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-lg font-bold text-foreground">{provider.provider}</h4>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${
                            provider.status === 'healthy' ? 'bg-chart-1' : 
                            provider.status === 'recovery' ? 'bg-chart-4' : 'bg-destructive'
                          }`}></div>
                          <span className="text-sm font-semibold text-foreground">
                            {provider.healthScore}%
                          </span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Failures:</span>
                          <span className="font-bold text-destructive ml-2">{provider.failureCount}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Recovering:</span>
                          <span className="font-bold text-chart-4 ml-2">{provider.inRecovery ? 'Da' : 'Nu'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {!providerStatus.length && !isLoading && (
                <div className="text-center py-8">
                  <i className="fas fa-server text-muted text-4xl mb-4"></i>
                  <p className="text-muted-foreground">Nu sunt disponibile informații despre provideri</p>
                  <p className="text-muted text-sm mt-2">Verificați conexiunea la API</p>
                </div>
              )}
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-8">
              {/* Controls */}
              <motion.div 
                className={isAdvanced ? "glass-card" : "bg-card border border-border rounded-lg p-6 mb-6"}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <i className="fas fa-chart-line text-2xl text-primary"></i>
                    <h2 className="text-2xl font-bold">Request Tracking</h2>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Live Mode</span>
                      <button
                        onClick={() => setIsLiveMode(!isLiveMode)}
                        className={`toggle-switch ${isLiveMode ? 'active' : ''} transition-all duration-200 hover:scale-110`}
                      ></button>
                    </div>
                    
                    <select
                      value={timeRange}
                      onChange={(e) => setTimeRange(e.target.value)}
                      className="px-3 py-1 bg-card/50 border border-white/20 rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                    >
                      <option value="1h">Last Hour</option>
                      <option value="6h">Last 6 Hours</option>
                      <option value="24h">Last 24 Hours</option>
                      <option value="7d">Last Week</option>
                    </select>
                  </div>
                </div>

                {/* Tracking Stats */}
                <div className={isAdvanced ? "stats-grid" : "grid grid-cols-2 lg:grid-cols-4 gap-4"}>
                  <div className={isAdvanced ? "stat-card" : "bg-card/50 border border-border rounded-lg p-4 text-center hover:bg-card/70 transition-colors"}>
                    <div className={isAdvanced ? "stat-number" : "text-2xl font-bold text-primary mb-2"}>{totalRequests > 999 ? formatTokens(totalRequests) : totalRequests}</div>
                    <div className={isAdvanced ? "stat-label" : "text-sm text-muted-foreground font-medium"}>Total Requests</div>
                  </div>
                  <div className={isAdvanced ? "stat-card" : "bg-card/50 border border-border rounded-lg p-4 text-center hover:bg-card/70 transition-colors"}>
                    <div className={isAdvanced ? "stat-number" : "text-2xl font-bold text-primary mb-2"}>{totalErrors}</div>
                    <div className={isAdvanced ? "stat-label" : "text-sm text-muted-foreground font-medium"}>Errors</div>
                  </div>
                  <div className={isAdvanced ? "stat-card" : "bg-card/50 border border-border rounded-lg p-4 text-center hover:bg-card/70 transition-colors"}>
                    <div className={isAdvanced ? "stat-number" : "text-2xl font-bold text-primary mb-2"}>{formatResponseTime(avgLatency)}</div>
                    <div className={isAdvanced ? "stat-label" : "text-sm text-muted-foreground font-medium"}>Avg Latency</div>
                  </div>
                  <div className={isAdvanced ? "stat-card" : "bg-card/50 border border-border rounded-lg p-4 text-center hover:bg-card/70 transition-colors"}>
                    <div className={isAdvanced ? "stat-number" : "text-2xl font-bold text-primary mb-2"}>{formatPercentage(errorRate)}</div>
                    <div className={isAdvanced ? "stat-label" : "text-sm text-muted-foreground font-medium"}>Error Rate</div>
                  </div>
                </div>
              </motion.div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Request Volume Chart */}
                <motion.div 
                  className={isAdvanced ? "glass-card" : "bg-card border border-border rounded-lg p-6"}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <i className="fas fa-chart-area text-chart-1"></i>
                    Request Volume
                  </h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(0,0,0,0.8)', 
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '8px'
                        }} 
                      />
                      <Line type="monotone" dataKey="requests" stroke="#10b981" strokeWidth={2} />
                      <Line type="monotone" dataKey="errors" stroke="#ef4444" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </motion.div>

                {/* Latency Chart */}
                <motion.div 
                  className={isAdvanced ? "glass-card" : "bg-card border border-border rounded-lg p-6"}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                >
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <i className="fas fa-clock text-chart-4"></i>
                    Response Latency
                  </h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(0,0,0,0.8)', 
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '8px'
                        }} 
                      />
                      <Bar dataKey="latency" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>
              </div>

                          </div>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (

<div className="space-y-6">
              {/* Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-4 bg-card/50 rounded-lg border border-slate-700/50">
                <div>
                  <h3 className="text-2xl font-bold text-foreground">Detailed Activity Logs</h3>
                  <p className="text-sm text-muted-foreground mt-1">Filtrează și navighează prin logs</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Interval:</span>
                    <select
                      value={activityTimeRange}
                      onChange={(e) => setActivityTimeRange(e.target.value as any)}
                      className="px-3 py-1 bg-card/50 border border-white/20 rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                    >
                      <option value="10m">10 minute</option>
                      <option value="1h">1 oră</option>
                      <option value="6h">6 ore</option>
                      <option value="24h">24 ore</option>
                      <option value="all">Toate</option>
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Limită:</span>
                    <select
                      value={activityLimit}
                      onChange={(e) => setActivityLimit(Number(e.target.value))}
                      className="px-3 py-1 bg-card/50 border border-white/20 rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value={0}>Toate</option>
                    </select>
                  </div>
                  
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-primary/20 text-primary rounded-lg border border-primary/30 hover:bg-primary/30 transition-colors flex items-center gap-2"
                  >
                    <i className="fas fa-sync-alt"></i>
                    Refresh
                  </button>
                </div>
              </div>
              
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div>Afișare: {activityLimit === 0 ? 'Toate' : activityLimit} logs</div>
                <div>{filteredActivities.length} evenimente găsite</div>
              </div>
              
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-muted-foreground">Time</th>
                      <th className="text-left p-3 text-muted-foreground">Type</th>
                      <th className="text-left p-3 text-muted-foreground">Provider</th>
                      <th className="text-left p-3 text-muted-foreground">Model</th>
                      <th className="text-left p-3 text-muted-foreground">Route</th>
                      <th className="text-left p-3 text-muted-foreground">Message</th>
                      <th className="text-left p-3 text-muted-foreground">Response Time</th>
                      <th className="text-left p-3 text-muted-foreground">Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActivities.map((activity: Activity) => (
                      <motion.tr
                        key={activity.id}
                        className="border-b border-border/50 hover:bg-white/5 transition-colors"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <td className="p-3 font-mono text-muted-foreground">
                          {new Date(activity.timestamp).toLocaleString('ro-RO', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </td>
                        <td className="p-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-2 ${
                            activity.type === 'success' 
                              ? (isAdvanced ? 'bg-blue-400/20 text-blue-400 border border-blue-400/30' : 'bg-green-400/20 text-green-400 border border-green-400/30') 
                              : activity.type === 'error'
                              ? 'bg-red-400/20 text-red-400 border border-red-400/30'
                              : 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30'
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${getActivityStatusColor(activity.type)}`}></span>
                            {activity.type}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-accent-foreground">
                          {activity.provider || 'N/A'}
                        </td>
                        <td className="p-3 font-mono text-primary">
                          {activity.actualModel}
                        </td>
                        <td className="p-3 text-chart-3">
                          {activity.route || 'N/A'}
                        </td>
                        <td className="p-3 text-foreground max-w-xs truncate" title={activity.message}>
                          {activity.message}
                        </td>
                        <td className={`p-3 ${getResponseTimeColor(activity.responseTime || 0)}`}>
                          {activity.responseTime ? formatResponseTime(activity.responseTime) : 'N/A'}
                        </td>
                        <td className="p-3 text-foreground">
                          {activity.tokens !== undefined && activity.tokens !== null ? formatTokens(activity.tokens) : 'N/A'}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredActivities.length === 0 && (
                <div className="text-center py-12">
                  <i className="fas fa-inbox text-muted text-4xl mb-4"></i>
                  <h3 className="text-xl font-bold text-foreground mb-2">No Activity Logs</h3>
                  <p className="text-muted-foreground">Waiting for system activity...</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}