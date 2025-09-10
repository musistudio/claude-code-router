import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

export interface PluginSettingsComponent {
  id: string;
  name: string;
  description: string;
  component: React.ComponentType<any>;
  enabled: boolean;
  version?: string;
  author?: string;
  category?: 'ui' | 'analytics' | 'performance' | 'security' | 'integration' | 'utility';
  status?: 'active' | 'inactive' | 'loading' | 'error' | 'updating';
  lastUpdated?: number;
  dependencies?: string[];
}

export interface PluginContextType {
  plugins: PluginSettingsComponent[];
  isLoading: boolean;
  error: string | null;
  registerPlugin: (plugin: PluginSettingsComponent) => void;
  unregisterPlugin: (id: string) => void;
  togglePlugin: (id: string, enabled: boolean) => Promise<void>;
  refreshPlugins: () => Promise<void>;
  getPluginById: (id: string) => PluginSettingsComponent | undefined;
  getPluginsByCategory: (category: string) => PluginSettingsComponent[];
}

const PluginContext = createContext<PluginContextType | undefined>(undefined);

export const usePlugins = () => {
  const context = useContext(PluginContext);
  if (!context) {
    throw new Error('usePlugins must be used within a PluginProvider');
  }
  return context;
};

interface PluginProviderProps {
  children: ReactNode;
}

export const PluginProvider: React.FC<PluginProviderProps> = ({ children }) => {
  const [plugins, setPlugins] = useState<PluginSettingsComponent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerPlugin = useCallback((plugin: PluginSettingsComponent) => {
    setPlugins(prev => {
      const exists = prev.find(p => p.id === plugin.id);
      if (exists) {
        // Update existing plugin with current enabled state from localStorage
        const currentEnabled = localStorage.getItem(`${plugin.id}-enabled`) === 'true';
        return prev.map(p => p.id === plugin.id ? { 
          ...plugin, 
          enabled: currentEnabled,
          lastUpdated: Date.now(),
          status: currentEnabled ? 'active' : 'inactive'
        } : p);
      }
      // Add new plugin with state from localStorage
      const currentEnabled = localStorage.getItem(`${plugin.id}-enabled`) === 'true';
      return [...prev, { 
        ...plugin, 
        enabled: currentEnabled,
        lastUpdated: Date.now(),
        status: currentEnabled ? 'active' : 'inactive'
      }];
    });
  }, []);

  const unregisterPlugin = useCallback((id: string) => {
    setPlugins(prev => prev.filter(p => p.id !== id));
  }, []);

  const togglePlugin = useCallback(async (id: string, enabled: boolean): Promise<void> => {
    // Set loading state
    setPlugins(prev => 
      prev.map(p => p.id === id ? { ...p, status: 'loading' } : p)
    );
    
    try {
      // Simulate async operation (API call, etc.)
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setPlugins(prev => 
        prev.map(p => p.id === id ? { 
          ...p, 
          enabled, 
          status: enabled ? 'active' : 'inactive',
          lastUpdated: Date.now()
        } : p)
      );
      
      // Save to localStorage
      localStorage.setItem(`${id}-enabled`, enabled.toString());
      
      // Dispatch plugin state change event
      window.dispatchEvent(new CustomEvent('plugin-state-changed', {
        detail: { id, enabled }
      }));
      
      console.log(`🔌 PluginContext: ${id} toggled to ${enabled}`);
    } catch (err) {
      setPlugins(prev => 
        prev.map(p => p.id === id ? { ...p, status: 'error' } : p)
      );
      setError(`Failed to toggle plugin ${id}: ${err}`);
      throw err;
    }
  }, []);

  const refreshPlugins = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate plugin refresh - in real implementation, this would scan for new plugins
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update status for all plugins
      setPlugins(prev => prev.map(plugin => ({
        ...plugin,
        lastUpdated: Date.now(),
        status: plugin.enabled ? 'active' : 'inactive'
      })));
      
      console.log('🔌 Plugins refreshed successfully');
    } catch (err) {
      setError(`Failed to refresh plugins: ${err}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getPluginById = useCallback((id: string): PluginSettingsComponent | undefined => {
    return plugins.find(p => p.id === id);
  }, [plugins]);

  const getPluginsByCategory = useCallback((category: string): PluginSettingsComponent[] => {
    return plugins.filter(p => p.category === category);
  }, [plugins]);

  // Listen for plugin state changes and sync with localStorage
  useEffect(() => {
    const handlePluginStateChange = (event: CustomEvent) => {
      const { id, enabled } = event.detail;
      setPlugins(prev => 
        prev.map(p => p.id === id ? { ...p, enabled } : p)
      );
    };

    window.addEventListener('plugin-state-changed', handlePluginStateChange as EventListener);
    return () => window.removeEventListener('plugin-state-changed', handlePluginStateChange as EventListener);
  }, []);

  const contextValue: PluginContextType = {
    plugins,
    isLoading,
    error,
    registerPlugin,
    unregisterPlugin,
    togglePlugin,
    refreshPlugins,
    getPluginById,
    getPluginsByCategory
  };

  return (
    <PluginContext.Provider value={contextValue}>
      {children}
    </PluginContext.Provider>
  );
};
