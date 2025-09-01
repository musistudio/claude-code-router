import React from 'react';
import { useRouteMonitorData } from '@/hooks/useRouteMonitorData';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';

export function RouteMonitor() {
  const { routeData, sessionStats, loading, error, refetch } = useRouteMonitorData();

  if (loading) {
    return (
      <Card className="widget-container">
        <CardHeader className="widget-header">
          <CardTitle className="widget-title">Route Monitor</CardTitle>
        </CardHeader>
        <CardContent className="widget-content">
          <p className="text-on-dark-secondary">Se încarcă datele...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="widget-container">
        <CardHeader className="widget-header">
          <CardTitle className="widget-title">Route Monitor</CardTitle>
        </CardHeader>
        <CardContent className="widget-content">
          <p className="text-status-error-dark">Eroare: {error}</p>
          <Button onClick={refetch} className="mt-2 action-button-dark secondary">Reîncercare</Button>
        </CardContent>
      </Card>
    );
  }

  if (!routeData || !sessionStats) {
    return (
      <Card className="widget-container">
        <CardHeader className="widget-header">
          <CardTitle className="widget-title">Route Monitor</CardTitle>
        </CardHeader>
        <CardContent className="widget-content">
          <p className="text-on-dark-secondary">Nu există date disponibile.</p>
        </CardContent>
      </Card>
    );
  }

  // Function to get status variant for badges
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'warning': return 'outline';
      case 'error': return 'destructive';
      default: return 'default';
    }
  };

  // Function to render route breakdown bars
  const renderRouteBreakdown = (routeName: string, requests: number, totalRequests: number) => {
    const percentage = totalRequests > 0 ? (requests / totalRequests) * 100 : 0;
    return (
      <div className="flex items-center">
        <div className="w-24 text-sm font-medium">{routeName}</div>
        <div className="flex-1 ml-2">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full" 
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
        </div>
        <div className="w-12 text-right text-sm">{requests}</div>
      </div>
    );
  };

  return (
    <Card className="widget-container">
      <CardHeader className="widget-header">
        <div className="flex justify-between items-center">
          <CardTitle className="widget-title">Route Monitor</CardTitle>
          <Button onClick={refetch} className="action-button-dark secondary">Refresh</Button>
        </div>
      </CardHeader>
      <CardContent className="widget-content">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-on-dark-bg">Session tracking</h3>
          <p className="text-sm text-on-dark-secondary">
            Session: {sessionStats.totalRequests} requests • {Math.floor((Date.now() - sessionStats.sessionStart.getTime()) / 60000)}:{String(Math.floor((Date.now() - sessionStats.sessionStart.getTime()) % 60000 / 1000)).padStart(2, '0')}
          </p>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Route break down</h3>
          {routeData.routes && Array.isArray(routeData.routes) ? (
            routeData.routes.map((route) => (
              <div key={route.route} className="mb-4 p-3 border rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-medium">🎯 {route.route.toUpperCase()} ROUTE</div>
                  <Badge variant={getStatusVariant(route.status)}>
                    {route.status}
                  </Badge>
                </div>
                
                {renderRouteBreakdown(
                  route.route.toUpperCase(), 
                  route.requests, 
                  sessionStats.totalRequests
                )}
                
                <div className="mt-2 text-sm">
                  <span>Model setat: {route.configuredModel}</span> • 
                  <span> Folosit: {route.actualModel}</span> • 
                  <span> Cost: ${route.cost.toFixed(2)}</span>
                </div>
                
                {route.actualModel !== route.configuredModel && (
                  <div className="mt-2 text-yellow-600 text-sm">
                    ⚠️ Model setat vs folosit diferit
                  </div>
                )}
                
                {/* Mini logs */}
                <div className="mt-2">
                  {route.recentLogs && Array.isArray(route.recentLogs) ? (
                    route.recentLogs.slice(0, 3).map((log) => (
                      <div key={log.id} className="text-xs text-gray-500 flex justify-between">
                        <span>{log.timestamp.toLocaleTimeString()}</span>
                        <span>{log.model} - {log.latency}ms - {log.status}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-gray-500">No recent logs</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-muted-foreground">No route data available</div>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="action-button-dark secondary">Configurează rută</Button>
          <Button variant="outline" className="action-button-dark secondary">Vezi logs complete</Button>
        </div>
      </CardContent>
    </Card>
  );
}