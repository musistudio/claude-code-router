import { useState, useEffect } from 'react';

// Define types for the data we expect
export interface RouteConfig {
    enabled: boolean;
    provider: string;
    model: string;
    description: string;
}

export interface RouterModels {
    default: RouteConfig;
    background: RouteConfig;
    think: RouteConfig;
    longContext: RouteConfig;
    webSearch: RouteConfig;
}

interface RouteStat {
    totalRequests: number;
    successfulRequests: number;
    avgResponseTime: number;
}

interface RouteStats {
    [routeName: string]: RouteStat;
}

export interface Activity {
    id: string;
    type: 'success' | 'error' | 'warning';
    message: string;
    timestamp: string;
    model: string;
    provider: string;
    responseTime: number;
    tokens: number;
    route?: string;
    originalModel?: string;
    actualModel?: string;
}

async function fetchData(url: string): Promise<any> {
    console.log(`🔄 Fetching data from: ${url}`);
    const response = await fetch(url);
    console.log(`📊 Response status for ${url}:`, response.status);
    
    if (!response.ok) {
        console.error(`❌ Fetch failed for ${url}:`, response.status, response.statusText);
        throw new Error(`Failed to fetch ${url}`);
    }
    
    const result = await response.json();
    console.log(`📦 Raw response for ${url}:`, result);
    
    // API /api/config returnează direct datele, nu cu wrapper success/data
    if (url === '/api/config') {
        console.log(`✅ Using direct response for ${url}`);
        return result;
    }
    
    // API /api/v1/mission-control/live-activity returnează direct array-ul de activități
    if (url === '/api/v1/mission-control/live-activity') {
        console.log(`✅ Using direct response for ${url}`);
        return result;
    }
    
    if (!result.success) {
        console.error(`❌ API error for ${url}:`, result.error);
        throw new Error(result.error || `API error for ${url}`);
    }
    
    console.log(`✅ Success response for ${url}:`, result.data);
    return result.data;
}

export function useMissionControl(refreshTrigger?: any) {
    const [routerConfig, setRouterConfig] = useState<RouterModels | null>(null);
    const [routeStats, setRouteStats] = useState<RouteStats | null>(null);
    const [liveActivity, setLiveActivity] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadAllData() {
            try {
                console.log('🚀 Starting to load Mission Control data...');
                setLoading(true);
                // Folosim endpoint-uri valide
                const [config, stats, activity] = await Promise.all([
                    fetchData('/api/config'),
                    fetchData('/api/v1/mission-control/route-stats'),
                    fetchData('/api/v1/mission-control/live-activity')
                ]);
                
                console.log('📋 Config loaded:', config);
                console.log('📊 Stats loaded:', stats);
                console.log('🔄 Activity loaded:', activity);
                
                // Transformăm config-ul pentru a se potrivi cu tipul RouterModels
                // Configurația router-ului este în config.Router, format: "provider,model"
                const routerConfig: RouterModels = {
                    default: {
                        enabled: true, // Sunt activate by default
                        provider: config.Router.default?.split(',')[0] || '',
                        model: config.Router.default?.split(',')[1] || '',
                        description: 'Model principal pentru sarcini generale'
                    },
                    background: {
                        enabled: true, // Sunt activate by default
                        provider: config.Router.background?.split(',')[0] || '',
                        model: config.Router.background?.split(',')[1] || '',
                        description: 'Pentru sarcini în fundal'
                    },
                    think: {
                        enabled: true, // Sunt activate by default
                        provider: config.Router.think?.split(',')[0] || '',
                        model: config.Router.think?.split(',')[1] || '',
                        description: 'Pentru raționament și planificare'
                    },
                    longContext: {
                        enabled: true, // Sunt activate by default
                        provider: config.Router.longContext?.split(',')[0] || '',
                        model: config.Router.longContext?.split(',')[1] || '',
                        description: 'Pentru contexte lungi'
                    },
                    webSearch: {
                        enabled: true, // Sunt activate by default
                        provider: config.Router.webSearch?.split(',')[0] || '',
                        model: config.Router.webSearch?.split(',')[1] || '',
                        description: 'Pentru căutări web'
                    }
                };
                
                console.log('🎯 Final routerConfig:', routerConfig);
                setRouterConfig(routerConfig);
                setRouteStats(stats);
                setLiveActivity(activity);
                console.log('✅ Mission Control data loaded successfully!');
            } catch (err: any) {
                console.error('💥 Error loading Mission Control data:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        loadAllData();
        const intervalId = setInterval(loadAllData, 30000); // Refresh every 30s
        return () => clearInterval(intervalId);
    }, [refreshTrigger]);

    return { routerConfig, routeStats, liveActivity, loading, error };
}
