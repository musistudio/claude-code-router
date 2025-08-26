import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api'; // Corrected import

const StrategyTab = () => {
  const [config, setConfig] = useState<any>({}); // Initialized to empty object
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [fallbackStatus, setFallbackStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    try {
      const [configData, cacheData, fallbackData] = await Promise.all([
        api.getConfig(), // Corrected call
        api.getCacheStats(), // Corrected call
        api.getFallbackStatus(), // Corrected call
      ]);
      setConfig(configData);
      setCacheStats(cacheData);
      setFallbackStatus(fallbackData);
    } catch (error) {
      console.error("Failed to load strategy data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Refresh data every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const handleSave = async () => {
    if (!config) return;
    try {
      await api.updateConfig(config); // Corrected call
      alert('Configuration saved successfully!');
    } catch (error) {
      alert('Failed to save configuration.');
      console.error("Save error:", error);
    }
  };

  const handleConfigChange = (newConfigSection: any, section: string) => {
    setConfig((prevConfig: any) => ({ ...prevConfig, [section]: newConfigSection }));
  };

  if (isLoading) {
    return <div>Loading strategy configuration...</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Fallback Strategy Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Define primary and fallback providers. The system will automatically switch to a fallback if the primary provider fails.
          </p>
          <textarea
            className="w-full p-2 border rounded font-mono text-sm"
            rows={10}
            value={JSON.stringify(config.FallbackChains || {}, null, 2)}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              try {
                const parsed = JSON.parse(e.target.value);
                handleConfigChange(parsed, 'FallbackChains');
              } catch (error) {
                // Handle invalid JSON input if necessary
                console.error("Invalid JSON input:", error);
              }
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Caching</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
                <Switch 
                    id="caching-enabled"
                    checked={config.Caching?.enabled || false}
                    onCheckedChange={(checked: boolean) => handleConfigChange({ ...config.Caching, enabled: checked }, 'Caching')}
                />
                <Label htmlFor="caching-enabled">Enable Caching</Label>
            </div>
            <div>
                <Label htmlFor="cache-ttl">Cache TTL (seconds)</Label>
                <input 
                    id="cache-ttl"
                    type="number"
                    value={config.Caching?.ttl_seconds || 300}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleConfigChange({ ...config.Caching, ttl_seconds: parseInt(e.target.value) }, 'Caching')}
                    className="w-full p-2 border rounded"
                />
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Status & Analytics</CardTitle>
        </CardHeader>
        <CardContent>
            <h3 className="font-bold">Fallback Status</h3>
            <pre className="bg-gray-100 p-2 rounded">{JSON.stringify(fallbackStatus, null, 2)}</pre>
            <h3 className="font-bold mt-4">Cache Statistics</h3>
            <pre className="bg-gray-100 p-2 rounded">{JSON.stringify(cacheStats, null, 2)}</pre>
        </CardContent>
      </Card>

      <Button onClick={handleSave}>Save Strategy Configuration</Button>
    </div>
  );
};

export default StrategyTab;