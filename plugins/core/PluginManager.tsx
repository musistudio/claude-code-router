// Plugin Manager - STANDALONE în plugins/ folder
// Zero dependențe externe, auto-contained
import React, { useState, useEffect } from 'react';
import { themesPlugin } from '../themes/index';

interface Plugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  version: string;
  component?: React.ComponentType<any>;
}

interface PluginManagerProps {
  className?: string;
}

// TOATE funcționalitățile concentrate aici - zero dependențe externe
export const PluginManager: React.FC<PluginManagerProps> = ({ className = "" }) => {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);

  // Auto-discovery plugins din folderul plugins/
    useEffect(() => {
    const initializePlugins = async () => {
      setLoading(true);
      try {
        // 1. Fetch the source of truth for state from the server
        const response = await fetch('/api/plugins/getState');
        if (!response.ok) {
          throw new Error(`Failed to fetch plugin state: ${response.statusText}`);
        }
        const serverState = await response.json();

        // 2. Discover available plugins by trying to import them
        const discoveredPlugins: Plugin[] = [];

        // Analytics Plugin
        try {
          const { AnalyticsSettings } = await import('../analytics/ui/AnalyticsSettings');
          discoveredPlugins.push({
            id: 'analytics',
            name: 'Analytics & Mission Control',
            description: 'Real-time analytics and Mission Control dashboard',
            // 3. Combine discovered plugin with server state
            enabled: serverState.analytics?.enabled ?? false,
            version: '1.0.0',
            component: AnalyticsSettings
          });
        } catch (error) {
          // Plugin not found, do nothing
        }

        // Themes Plugin
        try {
          const { ThemeSettings } = await import('../themes/ui/ThemeSettings');
          discoveredPlugins.push({
            id: 'themes',
            name: 'Advanced Themes',
            description: 'Glassmorphism effects and premium theming',
            // 3. Combine discovered plugin with server state
            enabled: serverState.themes?.enabled ?? false,
            version: '1.0.0',
            component: ThemeSettings
          });
        } catch (error) {
          // Plugin not found, do nothing
        }

        setPlugins(discoveredPlugins);
      } catch (error) {
        console.error('Failed to initialize plugins:', error);
        setPlugins([]);
      } finally {
        setLoading(false);
      }
    };

    initializePlugins();
  }, []);

  useEffect(() => {
    const analyticsPlugin = plugins.find(p => p.id === 'analytics');
    if (analyticsPlugin?.enabled) {
      document.documentElement.setAttribute('data-analytics', 'enabled');
    } else {
      document.documentElement.removeAttribute('data-analytics');
    }
  }, [plugins]);

  const togglePlugin = async (pluginId: string) => {
    const plugin = plugins.find(p => p.id === pluginId);
    if (!plugin) return;

    const newEnabled = !plugin.enabled;
    
    if (newEnabled && pluginId === 'analytics') {
      document.documentElement.setAttribute('data-analytics', 'enabled');
    } else if (!newEnabled) {
      if (pluginId === 'themes') {
        // FIXED: Properly disable themes plugin by updating its config
        themesPlugin.setConfig({ enabled: false });
        themesPlugin.cleanup();
      } else if (pluginId === 'analytics') {
        document.documentElement.removeAttribute('data-analytics');
      }
    }
        
    // Update server config
    try {
      await fetch('/api/plugins/setState', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId, enabled: newEnabled })
      });

      // Dispatch event pentru cross-tab sync
      window.dispatchEvent(new CustomEvent(`plugin-${pluginId}-toggled`, {
        detail: { enabled: newEnabled }
      }));
      
      // FIXED: Dispatch backwards-compatible events for analytics plugin
      if (pluginId === 'analytics') {
        window.dispatchEvent(new CustomEvent('analytics-toggle-changed', {
          detail: { enabled: newEnabled }
        }));
        window.dispatchEvent(new CustomEvent('analytics-config-changed', {
          detail: { enabled: newEnabled }
        }));
        
        // Sync to localStorage for compatibility
        if (newEnabled) {
          localStorage.setItem('analytics-enabled', 'true');
        } else {
          localStorage.removeItem('analytics-enabled');
        }
      }

      // Update local state
      setPlugins(prev => prev.map(p => 
        p.id === pluginId ? { ...p, enabled: newEnabled } : p
      ));

    } catch (error) {
      console.error('Failed to update plugin state:', error);
    }
  };

  if (loading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span>Discovering plugins...</span>
        </div>
      </div>
    );
  }

  if (plugins.length === 0) {
    return (
      <div className={`text-center py-8 text-muted-foreground ${className}`}>
        <div className="text-4xl mb-2">🔌</div>
        <p>No plugins available</p>
        <p className="text-xs">Place plugins in the plugins/ directory</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">🔌 Plugin Management</h3>
        <span className="text-xs text-muted-foreground">{plugins.length} plugins</span>
      </div>
      
      {plugins.map((plugin) => (
        <div key={plugin.id} className="space-y-3">
          {/* Plugin Card */}
          <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-medium">{plugin.name}</h4>
                <span className="text-xs text-muted-foreground">v{plugin.version}</span>
                <div className={`w-2 h-2 rounded-full ${
                  plugin.enabled ? 'bg-green-500' : 'bg-gray-400'
                }`} title={plugin.enabled ? 'Enabled' : 'Disabled'} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{plugin.description}</p>
            </div>
            <button
              onClick={() => togglePlugin(plugin.id)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                plugin.enabled 
                  ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {plugin.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          
          {/* Plugin Settings - doar dacă e enabled */}
          {plugin.enabled && plugin.component && (
            <div className="ml-4 pl-4 border-l border-border">
              <plugin.component isEnabled={plugin.enabled} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PluginManager;