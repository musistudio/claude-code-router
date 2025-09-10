
interface AnalyticsSettingsProps {
  isEnabled: boolean;
}

export function AnalyticsSettings({ isEnabled }: AnalyticsSettingsProps) {
  return (
    <div className={`rounded-lg border p-4 ${isEnabled ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-lg">📊</span>
          <h3 className="font-semibold">Analytics</h3>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Real-time analytics and Mission Control dashboard
      </p>
      
      <div className="border-t pt-3">
        <div className="space-y-2">
          <div className="p-2 text-center text-green-600 text-xs">
            ✅ Analytics enabled
          </div>
        </div>
      </div>
    </div>
  );
}
