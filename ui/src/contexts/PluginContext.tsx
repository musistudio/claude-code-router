import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

export interface PluginSettingsComponent {
  id: string;
  name: string;
  description: string;
  component: React.ComponentType<any>;
  enabled: boolean;
}

export interface PluginContextType {
  plugins: PluginSettingsComponent[];
  registerPlugin: (plugin: PluginSettingsComponent) => void;
  unregisterPlugin: (id: string) => void;
  togglePlugin: (id: string, enabled: boolean) => void;
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

  const registerPlugin = useCallback((plugin: PluginSettingsComponent) => {
    setPlugins(prev => {
      const exists = prev.find(p => p.id === plugin.id);
      if (exists) {
        // Update existing plugin with current enabled state from localStorage
        const currentEnabled = localStorage.getItem(`${plugin.id}-enabled`) === 'true';
        return prev.map(p => p.id === plugin.id ? { ...plugin, enabled: currentEnabled } : p);
      }
      // Add new plugin with state from localStorage
      const currentEnabled = localStorage.getItem(`${plugin.id}-enabled`) === 'true';
      return [...prev, { ...plugin, enabled: currentEnabled }];
    });
  }, []);

  const unregisterPlugin = useCallback((id: string) => {
    setPlugins(prev => prev.filter(p => p.id !== id));
  }, []);

  const togglePlugin = useCallback((id: string, enabled: boolean) => {
    setPlugins(prev => 
      prev.map(p => p.id === id ? { ...p, enabled } : p)
    );
    
    // Save to localStorage
    localStorage.setItem(`${id}-enabled`, enabled.toString());
    
    // Dispatch plugin state change event
    window.dispatchEvent(new CustomEvent('plugin-state-changed', {
      detail: { id, enabled }
    }));
    
    console.log(`🔌 PluginContext: ${id} toggled to ${enabled}`);
  }, []);

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
    registerPlugin,
    unregisterPlugin,
    togglePlugin
  };

  return (
    <PluginContext.Provider value={contextValue}>
      {children}
    </PluginContext.Provider>
  );
};
