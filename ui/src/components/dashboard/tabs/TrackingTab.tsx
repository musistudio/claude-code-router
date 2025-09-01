import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useConfig } from '@/components/ConfigProvider';
import { formatResponseTime, formatPercentage, formatTokens, getResponseTimeColor } from '@/lib/formatters';

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

export function TrackingTab() {
  const { config } = useConfig();
  const [timeRange, setTimeRange] = useState('1h');
  const [chartData, setChartData] = useState<RequestData[]>([]);
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);
  const [isLiveMode, setIsLiveMode] = useState(true);

  // Get available models from config
  const availableModels = React.useMemo(() => {
    const providers = config?.Providers || [];
    const allModels: string[] = [];
    providers.forEach(provider => {
      if (provider.models) {
        allModels.push(...provider.models);
      }
    });
    return [...new Set(allModels)]; // Remove duplicates
  }, [config]);

  useEffect(() => {
    // Load real analytics data instead of generating fake data
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

    loadRealData();

    // Update data every 5 seconds if live mode is on
    const interval = isLiveMode ? setInterval(() => {
      loadRealData();
    }, 5000) : null;

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLiveMode, timeRange, config, availableModels]);

  const totalRequests = chartData.reduce((sum, data) => sum + data.requests, 0);
  const totalErrors = chartData.reduce((sum, data) => sum + data.errors, 0);
  const avgLatency = Math.round(chartData.reduce((sum, data) => sum + data.latency, 0) / chartData.length) || 0;
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

  return (
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

      {/* Request Logs */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <i className="fas fa-list text-purple-500"></i>
            Live Request Logs
          </h3>
          <button className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors">
            <i className="fas fa-download mr-2"></i>
            Export Logs
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-3 text-gray-400">Time</th>
                <th className="text-left p-3 text-gray-400">Method</th>
                <th className="text-left p-3 text-gray-400">Model</th>
                <th className="text-left p-3 text-gray-400">Status</th>
                <th className="text-left p-3 text-gray-400">Response Time</th>
                <th className="text-left p-3 text-gray-400">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {requestLogs.slice(0, 10).map((log, index) => (
                <motion.tr
                  key={log.id}
                  className="border-b border-white/5 hover:bg-white/5"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <td className="p-3 font-mono text-gray-400">{log.timestamp}</td>
                  <td className="p-3 font-mono text-white">{log.method}</td>
                  <td className="p-3 text-blue-400">{log.model}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      log.status === 'success' 
                        ? 'bg-green-500/20 text-green-400' 
                        : log.status === 'error'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className={`p-3 ${getResponseTimeColor(log.responseTime)}`}>{formatResponseTime(log.responseTime)}</td>
                  <td className="p-3 text-gray-300">{formatTokens(log.tokens)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
