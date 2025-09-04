interface PerformanceAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  action: string;
  impact: string;
  timestamp: string;
  resolved: boolean;
}

export let mockPerformanceAlerts: PerformanceAlert[] = [
  {
    id: 'alert-1',
    severity: 'critical',
    title: 'High Latency Detected',
    description: 'The average response time for the /default route has exceeded 1000ms.',
    action: 'Investigate the /default route for performance bottlenecks.',
    impact: 'Users are experiencing slow response times.',
    timestamp: new Date().toISOString(),
    resolved: false,
  },
  {
    id: 'alert-2',
    severity: 'warning',
    title: 'Increased Error Rate',
    description: 'The error rate for the /background route has exceeded 5%.',
    action: 'Check the logs for the /background route to identify the cause of the errors.',
    impact: 'Some background tasks may be failing.',
    timestamp: new Date().toISOString(),
    resolved: false,
  },
  {
    id: 'alert-3',
    severity: 'info',
    title: 'New Model Available',
    description: 'A new, more performant model is available for the /summarize route.',
    action: 'Consider switching to the new model to improve performance.',
    impact: 'Potential for improved performance and user experience.',
    timestamp: new Date().toISOString(),
    resolved: true,
  },
];
