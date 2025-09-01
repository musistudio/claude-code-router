import React from 'react';
import { usePerformanceAlerts } from '@/hooks/usePerformanceAlerts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function PerformanceAlert() {
  const { alerts, loading, error, refresh, resolveAlert, resolveAllAlerts, autoResolveAlert } = usePerformanceAlerts();

  if (loading) {
    return (
      <Card className="widget-container">
        <CardHeader className="widget-header">
          <CardTitle className="widget-title">Performance Alert</CardTitle>
        </CardHeader>
        <CardContent className="widget-content">
          <p className="text-on-dark-secondary">Se încarcă alertele...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="widget-container">
        <CardHeader className="widget-header">
          <CardTitle className="widget-title">Performance Alert</CardTitle>
        </CardHeader>
        <CardContent className="widget-content">
          <p className="text-status-error-dark">Eroare: {error}</p>
          <Button onClick={refresh} className="mt-2 action-button-dark secondary">Reîncercare</Button>
        </CardContent>
      </Card>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <Card className="widget-container">
        <CardHeader className="widget-header">
          <CardTitle className="widget-title">Performance Alert</CardTitle>
        </CardHeader>
        <CardContent className="widget-content">
          <p className="text-on-dark-secondary">Nu există alerte active.</p>
        </CardContent>
      </Card>
    );
  }

  const handleResolveAlert = async (id: string) => {
    try {
      await resolveAlert(id);
    } catch (err) {
      console.error('Error resolving alert:', err);
    }
  };

  const handleAutoResolve = async (id: string) => {
    try {
      await autoResolveAlert(id);
    } catch (err) {
      console.error('Error auto-resolving alert:', err);
    }
  };

  const handleResolveAll = async () => {
    try {
      await resolveAllAlerts();
    } catch (err) {
      console.error('Error resolving all alerts:', err);
    }
  };

  // Function to get badge variant based on severity
  const getSeverityVariant = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'warning': return 'default'; // Changed from 'warning' to 'default' since Alert only accepts 'default' | 'destructive'
      case 'info': return 'default';
      default: return 'default';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Performance Alert</CardTitle>
          <Button onClick={refresh} variant="outline">Refresh</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Array.isArray(alerts) ? alerts.map((alert) => (
            <Alert key={alert.id} variant={getSeverityVariant(alert.severity)}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{alert.title}</div>
                  <AlertDescription className="mt-2">
                    <p>{alert.description}</p>
                    <p className="mt-2">
                      <span className="font-semibold">Acțiune:</span> {alert.action}
                    </p>
                    <p>
                      <span className="font-semibold">Impact:</span> {alert.impact}
                    </p>
                  </AlertDescription>
                </div>
                <div className="flex flex-col gap-2">
                  {!alert.resolved && (
                    <>
                      <Button 
                        size="sm" 
                        onClick={() => handleAutoResolve(alert.id)}
                        disabled={alert.severity === 'info'}
                      >
                        Rezolvă automat
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleResolveAlert(alert.id)}
                      >
                        Închide alertă
                      </Button>
                    </>
                  )}
                  {alert.resolved && (
                    <Badge variant="secondary">Rezolvat</Badge>
                  )}
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {alert.timestamp.toLocaleString()}
              </div>
            </Alert>
          )) : (
            <div className="text-center text-gray-500 py-8">
              Nu există alerte de performanță.
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <Button onClick={handleResolveAll} disabled={alerts.filter(a => !a.resolved).length === 0} className="action-button-dark primary">
            Închide toate alertele
          </Button>
          <Button variant="outline" className="action-button-dark secondary">Mă învață să rezolv</Button>
        </div>
      </CardContent>
    </Card>
  );
}