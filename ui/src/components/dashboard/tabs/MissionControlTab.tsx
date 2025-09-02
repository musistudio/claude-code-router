import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useMissionControl, type Activity } from '@/hooks/useMissionControl';
import { useRealTimeMissionControl, useProviderHistory } from '@/hooks/useMissionControlData';
import { useConfig } from '@/components/ConfigProvider';
import { formatResponseTime, formatPercentage, formatTokens, getResponseTimeColor } from '@/lib/formatters';
import type { MissionControlData, ModelStat, HealthHistoryData } from '@/types/missionControl';

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

export function MissionControlTab() {
    const [activeTab, setActiveTab] = useState<'routes' | 'overview' | 'providers' | 'analytics' | 'activity'>('routes');
  
  // Hook-uri pentru date în timp real
  const { routerConfig, routeStats, liveActivity, loading: basicLoading, error: basicError } = useMissionControl();
  const { data: missionControlData, loading: mcLoading, error: mcError } = useRealTimeMissionControl();
  const { data: providerHistory, loading: historyLoading } = useProviderHistory();
  
  // Analytics state
  const { config } = useConfig();
  const [timeRange, setTimeRange] = useState('1h');
  const [chartData, setChartData] = useState<RequestData[]>([]);
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);
  const [isLiveMode, setIsLiveMode] = useState(true);
  
  // Activity logs state
  const [activityTimeRange, setActivityTimeRange] = useState<'10m' | '1h' | '6h' | '24h' | 'all'>('1h');
  const [activityLimit, setActivityLimit] = useState<number>(50);

  // Procesează datele pentru cardurile de rute
  const routeCards: RouteCardData[] = useMemo(() => {
    if (!routerConfig) return [];

    const routes = [
      { key: 'default', name: 'Default Route', icon: 'fa-home', color: 'cyan' },
      { key: 'background', name: 'Background Tasks', icon: 'fa-tasks', color: 'green' },
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
      const routeActivity = liveActivity.filter(activity => {
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
    if (!liveActivity) return [];
    
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
      background: 'green', 
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
            model: req.model,
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
      case 'healthy': return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'warning': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'error': return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'low_success': return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
      case 'slow_response': return 'text-purple-400 bg-purple-500/20 border-purple-500/30';
      case 'inactive': return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Loading state combinat
  const isLoading = basicLoading || mcLoading || historyLoading;
  const error = basicError || mcError;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        className="glass-card p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-3xl font-bold text-white">Mission Control</h1>
        <p className="text-gray-300 mt-1">Monitorizare completă a sistemului în timp real.</p>
      </motion.div>

      {/* Navigation */}
      <div className="flex bg-slate-800/50 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('routes')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
            activeTab === 'routes' ? 'bg-green-500/20 text-green-400' : 'text-gray-300 hover:bg-slate-700/50'
          }`}
        >
          <i className="fas fa-route mr-2"></i>
          Live Routes
        </button>
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
            activeTab === 'overview' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-300 hover:bg-slate-700/50'
          }`}
        >
          <i className="fas fa-chart-line mr-2"></i>
          Overview
        </button>
        <button
          onClick={() => setActiveTab('providers')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
            activeTab === 'providers' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-300 hover:bg-slate-700/50'
          }`}
        >
          <i className="fas fa-server mr-2"></i>
          Providers
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
            activeTab === 'analytics' ? 'bg-orange-500/20 text-orange-400' : 'text-gray-300 hover:bg-slate-700/50'
          }`}
        >
          <i className="fas fa-chart-line mr-2"></i>
          Analytics
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
            activeTab === 'activity' ? 'bg-red-500/20 text-red-400' : 'text-gray-300 hover:bg-slate-700/50'
          }`}
        >
          <i className="fas fa-stream mr-2"></i>
          Activitate
        </button>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          className="glass-card p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {isLoading && <div className="text-center text-gray-400">Se încarcă datele...</div>}
          {error && <div className="text-center text-red-500">Eroare: {error}</div>}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {!aggregatedStats && !isLoading && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg">
                  <p className="text-yellow-400">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    Nu s-au putut încărca statisticile agregate. Verificați conexiunea API.
                  </p>
                </div>
              )}
              
              {aggregatedStats && (
                <>
                  {/* Statistici Generale */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-cyan-500/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-400">Total Requests</p>
                          <p className="text-2xl font-bold text-cyan-400">{aggregatedStats.totalRequests.toLocaleString()}</p>
                        </div>
                        <i className="fas fa-chart-bar text-cyan-400 text-2xl opacity-50"></i>
                      </div>
                    </div>
                    
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-green-500/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-400">Success Rate</p>
                          <p className="text-2xl font-bold text-green-400">{aggregatedStats.successRate.toFixed(1)}%</p>
                        </div>
                        <i className="fas fa-check-circle text-green-400 text-2xl opacity-50"></i>
                      </div>
                    </div>
                    
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-blue-500/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-400">Avg Response Time</p>
                          <p className="text-2xl font-bold text-blue-400">{formatResponseTime(aggregatedStats.avgResponseTime)}</p>
                        </div>
                        <i className="fas fa-clock text-blue-400 text-2xl opacity-50"></i>
                      </div>
                    </div>
                    
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-purple-500/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-400">Active Models</p>
                          <p className="text-2xl font-bold text-purple-400">{aggregatedStats.modelStats.length}</p>
                        </div>
                        <i className="fas fa-microchip text-purple-400 text-2xl opacity-50"></i>
                      </div>
                    </div>
                  </div>

                  {/* Top Performant Models */}
                  <div>
                    <h3 className="text-xl font-bold text-white mb-4">Top Performant Models</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {aggregatedStats.modelStats.slice(0, 6).map((model, index) => (
                        <div key={model.model} className="bg-slate-800/50 p-4 rounded-lg border border-slate-600/50">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-cyan-400">{model.model}</h4>
                            <span className="text-xs bg-slate-700 px-2 py-1 rounded">{model.provider}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-gray-400">Req:</span>
                              <span className="font-bold text-white ml-1">{model.totalRequests}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Rate:</span>
                              <span className="font-bold text-green-400 ml-1">{((model.successfulRequests / model.totalRequests) * 100).toFixed(1)}%</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Time:</span>
                              <span className="font-bold text-white ml-1">{formatResponseTime(model.avgResponseTime)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              
              {!aggregatedStats && !isLoading && (
                <div className="text-center py-8">
                  <i className="fas fa-chart-line text-gray-600 text-4xl mb-4"></i>
                  <p className="text-gray-400">Nu sunt disponibile statistici</p>
                  <p className="text-gray-500 text-sm mt-2">Verificați conexiunea la API</p>
                </div>
              )}
            </div>
          )}

          {/* Routes Tab - 5 Beautiful Route Cards */}
          {activeTab === 'routes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">Live Route Monitoring</h3>
                <div className="text-sm text-gray-400">
                  Actualizat în timp real • {routeCards.length} rute active
                </div>
              </div>
              
              {!routerConfig && !isLoading && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg">
                  <p className="text-yellow-400">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    Nu s-au putut încărca configurațiile rutelor. Verificați conexiunea API.
                  </p>
                </div>
              )}
              
              {routeCards.length > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
                  {routeCards.map((card, index) => {
                    const color = getRouteColor(card.route);
                    const icon = getRouteIcon(card.route);
                    const statusColors = getStatusColor(card.status);
                    const scoreColor = getScoreColor(card.score);
                    
                    return (
                      <motion.div
                        key={card.route}
                        className={`
                          relative overflow-hidden rounded-xl border-2 bg-slate-800/40 backdrop-blur-sm
                          hover:scale-105 transition-all duration-300 cursor-pointer
                          ${card.status === 'healthy' ? 'border-green-500/30 hover:border-green-400/60' : 
                            card.status === 'warning' ? 'border-yellow-500/30 hover:border-yellow-400/60' :
                            card.status === 'error' ? 'border-red-500/30 hover:border-red-400/60' :
                            'border-gray-600/30 hover:border-gray-500/60'}
                        `}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: index * 0.1 }}
                        whileHover={{ y: -5 }}
                      >
                        {/* Header */}
                        <div className="p-6 pb-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-3">
                              <div className={`w-12 h-12 rounded-lg bg-${color}-500/20 flex items-center justify-center`}>
                                <i className={`${icon} text-${color}-400 text-xl`}></i>
                              </div>
                              <div>
                                <h4 className="text-lg font-bold text-white">{card.displayName}</h4>
                                <p className="text-sm text-gray-400">{card.config.description}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-3xl font-bold ${scoreColor}`}>
                                {card.score}
                              </div>
                              <div className="text-xs text-gray-400">Score</div>
                            </div>
                          </div>
                          
                          {/* Status Badge */}
                          <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusColors}`}>
                            <div className={`w-2 h-2 rounded-full mr-2 ${
                              card.status === 'healthy' ? 'bg-green-400' :
                              card.status === 'warning' ? 'bg-yellow-400' :
                              card.status === 'error' ? 'bg-red-400' : 'bg-gray-400'
                            }`}></div>
                            {card.status === 'healthy' ? 'Sănătos' :
                             card.status === 'warning' ? 'Atenție' :
                             card.status === 'error' ? 'Eroare' :
                             card.status === 'low_success' ? 'Succes scăzut' :
                             card.status === 'slow_response' ? 'Răspuns lent' : 'Inactiv'}
                          </div>
                        </div>

                        {/* Model Configuration */}
                        <div className="px-6 pb-4">
                          <div className="bg-slate-700/50 rounded-lg p-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-400">Model Configurat:</span>
                              <span className={`font-bold text-${color}-400`}>
                                {card.config.model || 'N/A'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm mt-1">
                              <span className="text-gray-400">Provider:</span>
                              <span className="font-semibold text-white">
                                {card.config.provider || 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Statistics */}
                        {card.stats && (
                          <div className="px-6 pb-4">
                            <div className="grid grid-cols-3 gap-3">
                              <div className={`bg-${color}-500/10 p-3 rounded-lg border border-${color}-500/20`}>
                                <div className={`text-xs text-${color}-400 mb-1`}>Requests</div>
                                <div className="text-lg font-bold text-white">
                                  {card.stats.totalRequests.toLocaleString()}
                                </div>
                              </div>
                              <div className="bg-green-500/10 p-3 rounded-lg border border-green-500/20">
                                <div className="text-xs text-green-400 mb-1">Success</div>
                                <div className="text-lg font-bold text-white">
                                  {card.stats.successRate.toFixed(1)}%
                                </div>
                              </div>
                              <div className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                                <div className="text-xs text-blue-400 mb-1">Timp</div>
                                <div className="text-lg font-bold text-white">
                                  {formatResponseTime(card.stats.avgResponseTime)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}


                        {/* Recent Activity */}
                        <div className="px-6 pb-6">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="text-sm font-semibold text-white">Activitate Recentă</h5>
                            <span className="text-xs text-gray-400">
                              {card.recentActivity.length} evenimente
                            </span>
                          </div>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto">
                            {card.recentActivity.length > 0 ? (
                              card.recentActivity.map((activity, idx) => (
                                <div key={`${activity.id}-${idx}`} className="p-2 bg-slate-700/30 rounded-md">
                                  {/* First row: Status + Time + Model */}
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full ${
                                        activity.type === 'success' ? 'bg-green-500' : 
                                        activity.type === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                                      }`}></span>
                                      <span className="text-gray-400 font-mono text-[10px]">
                                        {new Date(activity.timestamp).toLocaleTimeString('ro-RO', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          second: '2-digit'
                                        })}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px]">
                                      <span className="text-cyan-400 font-mono max-w-[60px] truncate">
                                        {activity.actualModel}
                                      </span>
                                      <span className="text-gray-500 font-mono">
                                        {formatResponseTime(activity.responseTime)}
                                      </span>
                                    </div>
                                  </div>
                                  {/* Second row: Message (truncated) */}
                                  <div className="text-[11px] text-gray-300 truncate" title={activity.message}>
                                    {activity.message.replace('Request successful', '✓ Success').replace('Request failed', '✗ Failed')}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-gray-500 text-center py-3">
                                <i className="fas fa-clock text-gray-600 mb-1"></i>
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
                  <i className="fas fa-route text-gray-600 text-6xl mb-4"></i>
                  <h3 className="text-xl font-bold text-white mb-2">Nu sunt configurate rute</h3>
                  <p className="text-gray-400">Configurați rutele pentru a vedea monitorizarea în timp real</p>
                </div>
              )}
            </div>
          )}

          {/* Providers Tab */}
          {activeTab === 'providers' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-white mb-4">Status Providers</h3>
              
              {!providerStatus.length && !isLoading && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg">
                  <p className="text-yellow-400">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    Nu s-au putut încărca informațiile despre provideri. Verificați conexiunea API.
                  </p>
                </div>
              )}
              
              {providerStatus.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {providerStatus.map((provider) => (
                    <div key={provider.provider} className={`p-4 rounded-lg border-2 ${
                      provider.status === 'healthy' ? 'border-green-500/50' : 
                      provider.status === 'recovery' ? 'border-yellow-500/50' : 'border-red-500/50'
                    } bg-slate-800/30`}>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-lg font-bold text-white">{provider.provider}</h4>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${
                            provider.status === 'healthy' ? 'bg-green-500' : 
                            provider.status === 'recovery' ? 'bg-yellow-500' : 'bg-red-500'
                          }`}></div>
                          <span className="text-sm font-semibold text-white">
                            {provider.healthScore}%
                          </span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">Failures:</span>
                          <span className="font-bold text-red-400 ml-2">{provider.failureCount}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Recovering:</span>
                          <span className="font-bold text-yellow-400 ml-2">{provider.inRecovery ? 'Da' : 'Nu'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {!providerStatus.length && !isLoading && (
                <div className="text-center py-8">
                  <i className="fas fa-server text-gray-600 text-4xl mb-4"></i>
                  <p className="text-gray-400">Nu sunt disponibile informații despre provideri</p>
                  <p className="text-gray-500 text-sm mt-2">Verificați conexiunea la API</p>
                </div>
              )}
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-8">
              {/* Controls */}
              <motion.div 
                className="glass-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <i className="fas fa-chart-line text-2xl text-blue-500"></i>
                    <h2 className="text-2xl font-bold">Request Tracking</h2>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">Live Mode</span>
                      <button
                        onClick={() => setIsLiveMode(!isLiveMode)}
                        className={`toggle-switch ${isLiveMode ? 'active' : ''}`}
                      ></button>
                    </div>
                    
                    <select
                      value={timeRange}
                      onChange={(e) => setTimeRange(e.target.value)}
                      className="px-3 py-1 bg-black/20 border border-white/20 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="1h">Last Hour</option>
                      <option value="6h">Last 6 Hours</option>
                      <option value="24h">Last 24 Hours</option>
                      <option value="7d">Last Week</option>
                    </select>
                  </div>
                </div>

                {/* Tracking Stats */}
                <div className="stats-grid grid-cols-4">
                  <div className="stat-card">
                    <div className="stat-number">{totalRequests > 999 ? formatTokens(totalRequests) : totalRequests}</div>
                    <div className="stat-label">Total Requests</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-number">{totalErrors}</div>
                    <div className="stat-label">Errors</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-number">{formatResponseTime(avgLatency)}</div>
                    <div className="stat-label">Avg Latency</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-number">{formatPercentage(errorRate)}</div>
                    <div className="stat-label">Error Rate</div>
                  </div>
                </div>
              </motion.div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Request Volume Chart */}
                <motion.div 
                  className="glass-card"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <i className="fas fa-chart-area text-green-500"></i>
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
                  className="glass-card"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                >
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <i className="fas fa-clock text-yellow-500"></i>
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
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <div>
                  <h3 className="text-2xl font-bold text-white">Detailed Activity Logs</h3>
                  <p className="text-sm text-gray-400 mt-1">Filtrează și navighează prin logs</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">Interval:</span>
                    <select
                      value={activityTimeRange}
                      onChange={(e) => setActivityTimeRange(e.target.value as any)}
                      className="px-3 py-1 bg-black/20 border border-white/20 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="10m">10 minute</option>
                      <option value="1h">1 oră</option>
                      <option value="6h">6 ore</option>
                      <option value="24h">24 ore</option>
                      <option value="all">Toate</option>
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">Limită:</span>
                    <select
                      value={activityLimit}
                      onChange={(e) => setActivityLimit(Number(e.target.value))}
                      className="px-3 py-1 bg-black/20 border border-white/20 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value={0}>Toate</option>
                    </select>
                  </div>
                  
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 hover:bg-blue-500/30 transition-colors flex items-center gap-2"
                  >
                    <i className="fas fa-sync-alt"></i>
                    Refresh
                  </button>
                </div>
              </div>
              
              <div className="flex items-center justify-between text-sm text-gray-400">
                <div>Afișare: {activityLimit === 0 ? 'Toate' : activityLimit} logs</div>
                <div>{filteredActivities.length} evenimente găsite</div>
              </div>
              
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left p-3 text-gray-400">Time</th>
                      <th className="text-left p-3 text-gray-400">Type</th>
                      <th className="text-left p-3 text-gray-400">Provider</th>
                      <th className="text-left p-3 text-gray-400">Model</th>
                      <th className="text-left p-3 text-gray-400">Route</th>
                      <th className="text-left p-3 text-gray-400">Message</th>
                      <th className="text-left p-3 text-gray-400">Response Time</th>
                      <th className="text-left p-3 text-gray-400">Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActivities.map((activity: Activity) => (
                      <motion.tr
                        key={activity.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <td className="p-3 font-mono text-gray-400">
                          {new Date(activity.timestamp).toLocaleString('ro-RO', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            activity.type === 'success' 
                              ? 'bg-green-500/20 text-green-400' 
                              : activity.type === 'error'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {activity.type}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-orange-400">
                          {activity.provider || 'N/A'}
                        </td>
                        <td className="p-3 font-mono text-cyan-400">
                          {activity.actualModel}
                        </td>
                        <td className="p-3 text-purple-400">
                          {activity.route || 'N/A'}
                        </td>
                        <td className="p-3 text-gray-300 max-w-xs truncate" title={activity.message}>
                          {activity.message}
                        </td>
                        <td className={`p-3 ${getResponseTimeColor(activity.responseTime || 0)}`}>
                          {activity.responseTime ? formatResponseTime(activity.responseTime) : 'N/A'}
                        </td>
                        <td className="p-3 text-gray-300">
                          {activity.tokens !== undefined && activity.tokens !== null ? formatTokens(activity.tokens) : 'N/A'}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredActivities.length === 0 && (
                <div className="text-center py-12">
                  <i className="fas fa-inbox text-gray-600 text-4xl mb-4"></i>
                  <h3 className="text-xl font-bold text-white mb-2">No Activity Logs</h3>
                  <p className="text-gray-400">Waiting for system activity...</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}