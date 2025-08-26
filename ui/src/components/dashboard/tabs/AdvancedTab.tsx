import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RouterModelManagement } from './RouterModelManagement';
import { useConfig } from '../../ConfigProvider';
import type { Transformer } from '@/types';

interface OptimizationSettings {
  // Router Performance
  tokenCalculation: 'fast' | 'accurate';
  longContextThreshold: number;
  cacheTTL: number;
  routingMode: 'simple' | 'smart';
  
  // Analytics Control
  analyticsEnabled: boolean;
  batchSize: number;
  saveFrequency: number;
  retentionDays: number;
  memoryLimit: number;
  
  // Real-time Updates
  overviewRefresh: number;
  trackingRefresh: number;
  liveMode: boolean;
  
  // AI Request Control
  aiRequestControl: boolean;
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  rateLimitPerDay: number;
  burstLimit: number;
  burstWindow: number;
  deduplicationEnabled: boolean;
  
  // Resource Management
  maxConcurrentRequests: number;
  providerTimeout: number;
  
  // Custom Router
  customRouterEnabled: boolean;
  customRouterPath: string;
}

const DEFAULT_SETTINGS: OptimizationSettings = {
  tokenCalculation: 'accurate',
  longContextThreshold: 60000,
  cacheTTL: 30000,
  routingMode: 'smart',
  analyticsEnabled: true,
  batchSize: 10,
  saveFrequency: 5000,
  retentionDays: 7,
  memoryLimit: 1000,
  overviewRefresh: 30000,
  trackingRefresh: 5000,
  liveMode: true,
  aiRequestControl: true,
  rateLimitPerMinute: 60,
  rateLimitPerHour: 500,
  rateLimitPerDay: 5000,
  burstLimit: 10,
  burstWindow: 10000,
  deduplicationEnabled: true,
  maxConcurrentRequests: 10,
  providerTimeout: 30000,
  customRouterEnabled: false,
  customRouterPath: '/home/mircea/.claude-code-router/custom-hybrid-router.js'
};

export function AdvancedTab() {
  const [settings, setSettings] = useState<OptimizationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load current settings
  useEffect(() => {
    loadCurrentSettings();
  }, []);

  const loadCurrentSettings = async () => {
    try {
      const response = await fetch('/api/optimization/settings');
      const result = await response.json();
      
      if (result.success) {
        setSettings(result.data);
      } else {
        console.error('Failed to load settings:', result.error);
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (error) {
      console.error('Failed to load optimization settings:', error);
      setSettings(DEFAULT_SETTINGS);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/optimization/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        throw new Error(result.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      // TODO: Show error toast
    } finally {
      setLoading(false);
    }
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  const estimateImpact = () => {
    let impact = 0;
    
    if (settings.tokenCalculation === 'fast') impact += 70;
    if (settings.cacheTTL > 60) impact += 30;
    if (settings.routingMode === 'simple') impact += 40;
    if (!settings.analyticsEnabled) impact += 60;
    if (settings.batchSize > 1) impact += 20;
    if (settings.overviewRefresh > 30000) impact += 15;
    if (settings.trackingRefresh > 5000) impact += 25;
    if (settings.providerTimeout < 30000) impact += 20;
    
    return Math.min(impact, 95);
  };

  return (
    <div className="space-y-8">
      {/* Header cu control panel */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <i className="fas fa-sliders-h text-2xl text-orange-500"></i>
            <h2 className="text-2xl font-bold">Performance Optimization Center</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 rounded-lg text-sm font-semibold ${
              estimateImpact() > 50 ? 'bg-green-500/20 text-green-400' : 
              estimateImpact() > 25 ? 'bg-yellow-500/20 text-yellow-400' : 
              'bg-gray-500/20 text-gray-400'
            }`}>
              -{estimateImpact()}% consum estimate
            </div>
            <button
              onClick={resetToDefaults}
              className="px-4 py-2 bg-gray-500/20 text-gray-300 rounded-lg border border-gray-500/30 hover:bg-gray-500/30 transition-colors"
            >
              <i className="fas fa-undo mr-2"></i>
              Reset
            </button>
            <button
              onClick={saveSettings}
              disabled={loading}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                saved 
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : loading
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  : 'bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30'
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
                  Apply Settings
                </>
              )}
            </button>
          </div>
        </div>

        {/* Performance impact summary */}
        <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 p-4 rounded-lg border border-orange-500/20 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-white mb-1">Optimizare Estimată</h4>
              <p className="text-sm text-gray-300">
                Configurația actuală va reduce consumul cu aproximativ <span className="font-semibold text-orange-400">{estimateImpact()}%</span>
              </p>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold ${
                estimateImpact() > 50 ? 'text-green-400' : 
                estimateImpact() > 25 ? 'text-yellow-400' : 'text-gray-400'
              }`}>
                -{estimateImpact()}%
              </div>
              <div className="text-xs text-gray-400">requests</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Router Performance Settings */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <div className="flex items-center gap-4 mb-6">
          <i className="fas fa-route text-xl text-blue-500"></i>
          <h3 className="text-xl font-bold">Router Performance</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Token Calculation */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Token Calculation</span>
              <div className="text-xs text-gray-400">
                {settings.tokenCalculation === 'fast' ? '-70% timp procesare' : 'Calcul precis'}
              </div>
            </label>
            <select
              value={settings.tokenCalculation}
              onChange={(e) => setSettings(s => ({ ...s, tokenCalculation: e.target.value as 'fast' | 'accurate' }))}
              className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="accurate">Accurate (tiktoken)</option>
              <option value="fast">Fast (estimare)</option>
            </select>
          </div>

          {/* Long Context Threshold */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Long Context Threshold</span>
              <span className="text-xs text-blue-400">{settings.longContextThreshold.toLocaleString()} tokens</span>
            </label>
            <input
              type="range"
              min="32000"
              max="200000"
              step="1000"
              value={settings.longContextThreshold}
              onChange={(e) => setSettings(s => ({ ...s, longContextThreshold: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>32K</span>
              <span>200K</span>
            </div>
          </div>

          {/* Cache TTL */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Session Cache TTL</span>
              <span className="text-xs text-green-400">{settings.cacheTTL}s</span>
            </label>
            <input
              type="range"
              min="0"
              max="3600"
              step="30"
              value={settings.cacheTTL}
              onChange={(e) => setSettings(s => ({ ...s, cacheTTL: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>0s (disabled)</span>
              <span>1h</span>
            </div>
          </div>

          {/* Routing Mode */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Routing Mode</span>
              <div className="text-xs text-gray-400">
                {settings.routingMode === 'simple' ? '-40% logică complexă' : 'Toate funcțiile'}
              </div>
            </label>
            <select
              value={settings.routingMode}
              onChange={(e) => setSettings(s => ({ ...s, routingMode: e.target.value as 'simple' | 'smart' }))}
              className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="smart">Smart (toate verificările)</option>
              <option value="simple">Simple (routing basic)</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Analytics Control */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="flex items-center gap-4 mb-6">
          <i className="fas fa-chart-bar text-xl text-purple-500"></i>
          <h3 className="text-xl font-bold">Analytics Control</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Analytics Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">Analytics Tracking</span>
              <button
                onClick={() => setSettings(s => ({ ...s, analyticsEnabled: !s.analyticsEnabled }))}
                className={`toggle-switch ${settings.analyticsEnabled ? 'active' : ''}`}
              ></button>
            </div>
            <div className="text-xs text-gray-400">
              {settings.analyticsEnabled ? 'Tracking activat' : '-60% overhead tracking'}
            </div>
          </div>

          {/* Batch Size */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Batch Size</span>
              <span className="text-xs text-blue-400">{settings.batchSize} requests</span>
            </label>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={settings.batchSize}
              onChange={(e) => setSettings(s => ({ ...s, batchSize: parseInt(e.target.value) }))}
              className="w-full"
              disabled={!settings.analyticsEnabled}
            />
          </div>

          {/* Save Frequency */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Save Frequency</span>
              <span className="text-xs text-green-400">
                {settings.saveFrequency < 1000 ? `${settings.saveFrequency}ms` : `${settings.saveFrequency/1000}s`}
              </span>
            </label>
            <select
              value={settings.saveFrequency}
              onChange={(e) => setSettings(s => ({ ...s, saveFrequency: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-blue-500 focus:outline-none"
              disabled={!settings.analyticsEnabled}
            >
              <option value="0">Real-time</option>
              <option value="30000">30 secunde</option>
              <option value="300000">5 minute</option>
              <option value="900000">15 minute</option>
            </select>
          </div>

          {/* Memory Limit */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Memory Limit</span>
              <span className="text-xs text-yellow-400">{settings.memoryLimit} requests</span>
            </label>
            <select
              value={settings.memoryLimit}
              onChange={(e) => setSettings(s => ({ ...s, memoryLimit: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-blue-500 focus:outline-none"
              disabled={!settings.analyticsEnabled}
            >
              <option value="100">100 requests</option>
              <option value="500">500 requests</option>
              <option value="1000">1000 requests</option>
              <option value="5000">5000 requests</option>
            </select>
          </div>

          {/* Retention */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Data Retention</span>
              <span className="text-xs text-gray-400">{settings.retentionDays} zile</span>
            </label>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={settings.retentionDays}
              onChange={(e) => setSettings(s => ({ ...s, retentionDays: parseInt(e.target.value) }))}
              className="w-full"
              disabled={!settings.analyticsEnabled}
            />
          </div>
        </div>
      </motion.div>

      {/* Real-time Updates */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <div className="flex items-center gap-4 mb-6">
          <i className="fas fa-wifi text-xl text-green-500"></i>
          <h3 className="text-xl font-bold">Real-time Update Control</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Live Mode Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">Live Mode</span>
              <button
                onClick={() => setSettings(s => ({ ...s, liveMode: !s.liveMode }))}
                className={`toggle-switch ${settings.liveMode ? 'active' : ''}`}
              ></button>
            </div>
          </div>

          {/* Overview Refresh */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Overview Refresh</span>
              <span className="text-xs text-blue-400">{settings.overviewRefresh/1000}s</span>
            </label>
            <select
              value={settings.overviewRefresh}
              onChange={(e) => setSettings(s => ({ ...s, overviewRefresh: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-blue-500 focus:outline-none"
              disabled={!settings.liveMode}
            >
              <option value="10000">10 secunde</option>
              <option value="30000">30 secunde</option>
              <option value="60000">1 minut</option>
              <option value="300000">5 minute</option>
              <option value="0">OFF</option>
            </select>
          </div>

          {/* Tracking Refresh */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Tracking Refresh</span>
              <span className="text-xs text-green-400">{settings.trackingRefresh/1000}s</span>
            </label>
            <select
              value={settings.trackingRefresh}
              onChange={(e) => setSettings(s => ({ ...s, trackingRefresh: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-blue-500 focus:outline-none"
              disabled={!settings.liveMode}
            >
              <option value="1000">1 secundă</option>
              <option value="5000">5 secunde</option>
              <option value="30000">30 secunde</option>
              <option value="0">OFF</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Resource Management */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <div className="flex items-center gap-4 mb-6">
          <i className="fas fa-server text-xl text-red-500"></i>
          <h3 className="text-xl font-bold">Resource Management</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Max Concurrent */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Max Concurrent</span>
              <span className="text-xs text-yellow-400">{settings.maxConcurrentRequests} requests</span>
            </label>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={settings.maxConcurrentRequests}
              onChange={(e) => setSettings(s => ({ ...s, maxConcurrentRequests: parseInt(e.target.value) }))}
              className="w-full"
            />
          </div>

          {/* Rate Limit */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Rate Limit</span>
              <span className="text-xs text-blue-400">{settings.rateLimitPerMinute}/min</span>
            </label>
            <input
              type="range"
              min="10"
              max="300"
              step="10"
              value={settings.rateLimitPerMinute}
              onChange={(e) => setSettings(s => ({ ...s, rateLimitPerMinute: parseInt(e.target.value) }))}
              className="w-full"
            />
          </div>

          {/* Provider Timeout */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Provider Timeout</span>
              <span className="text-xs text-green-400">{settings.providerTimeout/1000}s</span>
            </label>
            <input
              type="range"
              min="5000"
              max="60000"
              step="5000"
              value={settings.providerTimeout}
              onChange={(e) => setSettings(s => ({ ...s, providerTimeout: parseInt(e.target.value) }))}
              className="w-full"
            />
          </div>
        </div>
      </motion.div>

      {/* Custom Router Settings */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <div className="flex items-center gap-4 mb-6">
          <i className="fas fa-code text-xl text-purple-500"></i>
          <h3 className="text-xl font-bold">Custom Router</h3>
          <div className="flex-1"></div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            settings.customRouterEnabled 
              ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
              : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
          }`}>
            {settings.customRouterEnabled ? 'ENABLED' : 'DISABLED'}
          </div>
        </div>

        <div className="space-y-6">
          {/* Enable Custom Router */}
          <div className="flex items-center justify-between p-4 bg-black/20 rounded-lg border border-white/10">
            <div>
              <h4 className="text-white font-medium mb-1">Enable Custom Router</h4>
              <p className="text-gray-400 text-sm">
                Use your custom hybrid router for intelligent provider switching and context preservation
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.customRouterEnabled}
                onChange={(e) => setSettings(s => ({ ...s, customRouterEnabled: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          {/* Router Path */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-white font-medium">Router Script Path</span>
              <div className="text-xs text-gray-400">
                Path to your custom router JavaScript file
              </div>
            </label>
            <input
              type="text"
              value={settings.customRouterPath}
              onChange={(e) => setSettings(s => ({ ...s, customRouterPath: e.target.value }))}
              placeholder="/path/to/custom-router.js"
              className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-purple-500 focus:outline-none"
              disabled={!settings.customRouterEnabled}
            />
            <p className="text-xs text-gray-500">
              💡 Tip: Use the dynamic hybrid router for intelligent provider detection and 429 error resilience
            </p>
          </div>

          {/* Router Features Preview */}
          {settings.customRouterEnabled && (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
              <h4 className="text-purple-400 font-medium mb-3">
                <i className="fas fa-star mr-2"></i>
                Custom Router Features
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <i className="fas fa-brain text-purple-400"></i>
                  Dynamic provider detection
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <i className="fas fa-shield-alt text-green-400"></i>
                  429 error resilience
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <i className="fas fa-memory text-blue-400"></i>
                  Context preservation
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <i className="fas fa-clock text-yellow-400"></i>
                  Timeout protection
                </div>
              </div>
            </div>
          )}

          {/* Warning when disabled */}
          {!settings.customRouterEnabled && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-yellow-400 mb-2">
                <i className="fas fa-exclamation-triangle"></i>
                <span className="font-medium">Custom Router Disabled</span>
              </div>
              <p className="text-gray-300 text-sm">
                Using default routing - you'll miss advanced features like dynamic provider switching and resilience optimizations.
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Router Model Management - MERGE-SAFE: Nou component separat */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
      >
        <RouterModelManagement onConfigChange={(config) => {
          console.log('Router configuration changed:', config);
        }} />
      </motion.div>
    </div>
  );
}
