import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useConfig } from '../../ConfigProvider';

interface RouterModelConfig {
  default: {
    enabled: boolean;
    provider: string;
    model: string;
    description: string;
  };
  background: {
    enabled: boolean;
    provider: string;
    model: string;
    description: string;
  };
  think: {
    enabled: boolean;
    provider: string;
    model: string;
    description: string;
  };
  longContext: {
    enabled: boolean;
    provider: string;
    model: string;
    description: string;
  };
  webSearch: {
    enabled: boolean;
    provider: string;
    model: string;
    description: string;
  };
}

const DEFAULT_ROUTER_CONFIG: RouterModelConfig = {
  default: {
    enabled: true,
    provider: "gemini-cli",
    model: "gemini-2.5-pro",
    description: "General tasks and fallback"
  },
  background: {
    enabled: true,
    provider: "ollama",
    model: "qwen2.5-coder:latest",
    description: "Lightweight background tasks"
  },
  think: {
    enabled: true,
    provider: "deepseek",
    model: "deepseek-reasoner",
    description: "Reasoning and planning tasks"
  },
  longContext: {
    enabled: true,
    provider: "kimi",
    model: "kimi-k2-0711-preview",
    description: "Long context scenarios (>32K tokens)"
  },
  webSearch: {
    enabled: false,
    provider: "gemini-cli",
    model: "gemini-2.5-flash",
    description: "Web search and real-time data"
  }
};

interface RouterModelManagementProps {
  onConfigChange?: (config: RouterModelConfig) => void;
}

export function RouterModelManagement({ onConfigChange }: RouterModelManagementProps) {
  const { config: realConfig, setConfig: setRealConfig } = useConfig();
  const [config, setConfig] = useState<RouterModelConfig>(DEFAULT_ROUTER_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load current router model configuration from real config
  useEffect(() => {
    if (realConfig) {
      loadConfigFromReal();
    }
  }, [realConfig]);

  const loadConfigFromReal = () => {
    if (!realConfig || !realConfig.Router) return;
    
    const routerConfig = realConfig.Router;
    
    // Convert real config format to component format
    const componentConfig: RouterModelConfig = {
      default: {
        enabled: !!routerConfig.default,
        provider: routerConfig.default?.split(',')[0] || 'gemini',
        model: routerConfig.default?.split(',')[1] || 'gemini-2.5-pro',
        description: 'General tasks and fallback'
      },
      background: {
        enabled: !!routerConfig.background,
        provider: routerConfig.background?.split(',')[0] || 'gemini',
        model: routerConfig.background?.split(',')[1] || 'gemini-2.5-flash',
        description: 'Lightweight background tasks'
      },
      think: {
        enabled: !!routerConfig.think,
        provider: routerConfig.think?.split(',')[0] || 'gemini',
        model: routerConfig.think?.split(',')[1] || 'gemini-2.5-pro',
        description: 'Reasoning and planning tasks'
      },
      longContext: {
        enabled: !!routerConfig.longContext,
        provider: routerConfig.longContext?.split(',')[0] || 'gemini',
        model: routerConfig.longContext?.split(',')[1] || 'gemini-2.0-flash',
        description: 'Long context scenarios (>32K tokens)'
      },
      webSearch: {
        enabled: !!routerConfig.webSearch,
        provider: routerConfig.webSearch?.split(',')[0] || 'gemini',
        model: routerConfig.webSearch?.split(',')[1] || 'gemini-2.0-flash',
        description: 'Web search and real-time data'
      }
    };
    
    setConfig(componentConfig);
    onConfigChange?.(componentConfig);
  };

  const updateConfig = (role: keyof RouterModelConfig, field: keyof RouterModelConfig['default'], value: any) => {
    const newConfig = {
      ...config,
      [role]: {
        ...config[role],
        [field]: value
      }
    };
    setConfig(newConfig);
    onConfigChange?.(newConfig);
  };

  const toggleRole = (role: keyof RouterModelConfig) => {
    updateConfig(role, 'enabled', !config[role].enabled);
  };

  const getActiveModelsCount = () => {
    return Object.values(config).filter(role => role.enabled).length;
  };

  const getEstimatedConsumeReduction = () => {
    const totalRoles = 5;
    const activeRoles = getActiveModelsCount();
    const reduction = ((totalRoles - activeRoles) / totalRoles) * 100;
    return Math.round(reduction);
  };

  const saveConfiguration = async () => {
    if (!realConfig || !setRealConfig) return;
    
    setLoading(true);
    try {
      // Convert component config back to real config format
      const newRouterConfig: any = {};
      
      Object.keys(config).forEach((role) => {
        const roleConfig = config[role as keyof RouterModelConfig];
        if (roleConfig.enabled) {
          newRouterConfig[role] = `${roleConfig.provider},${roleConfig.model}`;
        }
        // If disabled, don't include in Router config (will be undefined)
      });
      
      // Keep existing non-model properties like longContextThreshold
      if (realConfig.Router?.longContextThreshold) {
        newRouterConfig.longContextThreshold = realConfig.Router.longContextThreshold;
      }
      
      // Update real config
      const updatedConfig = {
        ...realConfig,
        Router: newRouterConfig
      };
      
      setRealConfig(updatedConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      
      const activeModels = Object.keys(newRouterConfig).filter(key => key !== 'longContextThreshold').length;
      console.log(`Router configuration saved. Active models: ${activeModels}`);
    } catch (error) {
      console.error('Failed to save router configuration:', error);
      // TODO: Show error toast
    } finally {
      setLoading(false);
    }
  };

  const resetToDefaults = () => {
    setConfig(DEFAULT_ROUTER_CONFIG);
  };

  const applyPreset = async (preset: 'high-performance' | 'balanced' | 'economy') => {
    if (!realConfig) return;
    
    setLoading(true);
    try {
      let newConfig = { ...config };
      
      // Apply preset configurations
      switch (preset) {
        case 'high-performance':
          // All models enabled with current settings
          Object.keys(newConfig).forEach(role => {
            newConfig[role as keyof RouterModelConfig].enabled = true;
          });
          break;
          
        case 'balanced':
          // Only default, background, and think enabled
          newConfig.default.enabled = true;
          newConfig.background.enabled = true;
          newConfig.think.enabled = true;
          newConfig.longContext.enabled = false;
          newConfig.webSearch.enabled = false;
          break;
          
        case 'economy':
          // Only default enabled
          newConfig.default.enabled = true;
          newConfig.background.enabled = false;
          newConfig.think.enabled = false;
          newConfig.longContext.enabled = false;
          newConfig.webSearch.enabled = false;
          break;
      }
      
      setConfig(newConfig);
      onConfigChange?.(newConfig);
      
      // Auto-save the preset
      setTimeout(() => {
        saveConfiguration();
      }, 100);
      
      console.log(`${preset} preset applied successfully`);
    } catch (error) {
      console.error('Failed to apply preset:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get available providers and models from real config
  const getAvailableProviders = () => {
    if (!realConfig?.Providers) return [];
    return realConfig.Providers.map((provider: any) => provider.name).filter(Boolean);
  };

  const getAvailableModels = (providerName: string) => {
    if (!realConfig?.Providers) return [];
    const provider = realConfig.Providers.find((p: any) => p.name === providerName);
    return provider?.models || [];
  };

  const roleIcons = {
    default: 'fas fa-home',
    background: 'fas fa-tasks',
    think: 'fas fa-brain',
    longContext: 'fas fa-scroll',
    webSearch: 'fas fa-globe'
  };

  const roleColors = {
    default: 'text-blue-500',
    background: 'text-green-500',
    think: 'text-purple-500',
    longContext: 'text-yellow-500',
    webSearch: 'text-red-500'
  };

  return (
    <motion.div 
      className="glass-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <i className="fas fa-network-wired text-2xl text-indigo-500"></i>
          <h3 className="text-2xl font-bold">Router Model Management</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-lg text-sm font-semibold ${
            getEstimatedConsumeReduction() > 50 ? 'bg-green-500/20 text-green-400' : 
            getEstimatedConsumeReduction() > 20 ? 'bg-yellow-500/20 text-yellow-400' : 
            'bg-gray-500/20 text-gray-400'
          }`}>
            -{getEstimatedConsumeReduction()}% models running
          </div>
          <button
            onClick={resetToDefaults}
            className="px-4 py-2 bg-gray-500/20 text-gray-300 rounded-lg border border-gray-500/30 hover:bg-gray-500/30 transition-colors"
          >
            <i className="fas fa-undo mr-2"></i>
            Reset
          </button>
          <button
            onClick={saveConfiguration}
            disabled={loading}
            className={`px-4 py-2 rounded-lg border transition-colors ${
              saved 
                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : loading
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/30'
            }`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 animate-spin rounded-full border border-current border-t-transparent mr-2"></div>
                Saving...
              </>
            ) : saved ? (
              <>
                <i className="fas fa-check mr-2"></i>
                Saved!
              </>
            ) : (
              <>
                <i className="fas fa-save mr-2"></i>
                Apply Config
              </>
            )}
          </button>
        </div>
      </div>

      {/* Impact Summary */}
      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-4 rounded-lg border border-indigo-500/20 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-white mb-1">Router Model Status</h4>
            <p className="text-sm text-gray-300">
              <span className="font-semibold text-indigo-400">{getActiveModelsCount()}</span> din 5 modele active - 
              reducere consum <span className="font-semibold text-indigo-400">{getEstimatedConsumeReduction()}%</span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-indigo-400">
              {getActiveModelsCount()}/5
            </div>
            <div className="text-xs text-gray-400">models active</div>
          </div>
        </div>
      </div>

      {/* Router Roles Configuration */}
      <div className="space-y-4">
        {(Object.keys(config) as Array<keyof RouterModelConfig>).map((role, index) => (
          <motion.div
            key={role}
            className={`p-4 rounded-lg border transition-all ${
              config[role].enabled 
                ? 'bg-white/5 border-white/20' 
                : 'bg-gray-500/5 border-gray-500/10 opacity-60'
            }`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <i className={`${roleIcons[role]} text-xl ${roleColors[role]}`}></i>
                  <div>
                    <h4 className="font-semibold text-white capitalize">{role}</h4>
                    <p className="text-xs text-gray-400">{config[role].description}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right mr-4">
                  <div className="text-sm text-white">
                    <span className="text-gray-400">Provider:</span> {config[role].provider}
                  </div>
                  <div className="text-sm text-gray-400">
                    <span className="text-gray-500">Model:</span> {config[role].model}
                  </div>
                </div>
                <button
                  onClick={() => toggleRole(role)}
                  className={`toggle-switch ${config[role].enabled ? 'active' : ''}`}
                ></button>
              </div>
            </div>

            {config[role].enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/10">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Provider</label>
                  <select
                    value={config[role].provider}
                    onChange={(e) => updateConfig(role, 'provider', e.target.value)}
                    className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    {getAvailableProviders().map(providerName => (
                      <option key={providerName} value={providerName}>
                        {providerName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Model</label>
                  <select
                    value={config[role].model}
                    onChange={(e) => updateConfig(role, 'model', e.target.value)}
                    className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    {getAvailableModels(config[role].provider).map(modelName => (
                      <option key={modelName} value={modelName}>
                        {modelName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Quick Presets */}
      <div className="mt-6 p-4 bg-gradient-to-r from-gray-500/10 to-gray-600/10 rounded-lg border border-gray-500/20">
        <h4 className="font-semibold text-white mb-3">Quick Configuration Presets</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => applyPreset('high-performance')}
            disabled={loading}
            className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
          >
            <i className="fas fa-rocket mr-2"></i>
            High Performance
          </button>
          <button
            onClick={() => applyPreset('balanced')}
            disabled={loading}
            className="px-4 py-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/30 transition-colors text-sm"
          >
            <i className="fas fa-balance-scale mr-2"></i>
            Balanced
          </button>
          <button
            onClick={() => applyPreset('economy')}
            disabled={loading}
            className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-colors text-sm"
          >
            <i className="fas fa-leaf mr-2"></i>
            Economy Mode
          </button>
        </div>
      </div>
    </motion.div>
  );
}