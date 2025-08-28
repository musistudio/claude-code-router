import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useMissionControlData } from '@/hooks/useMissionControlData';
import { missionControlAPI } from '@/lib/missionControlAPI';
import { 
  Settings,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Zap,
  Activity,
  Clock,
  Target,
  Save,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Shield
} from 'lucide-react';

interface ExecutionGuardFineTuningProps {
  className?: string;
}

interface GuardConfig {
  minDelayMs: number;
  maxQueueSize: number;
  maxRetries: number;
  initialBackoffMs: number;
  failureThreshold: number;
  recoveryTimeMs: number;
}

interface PresetConfig {
  name: string;
  description: string;
  icon: React.ReactNode;
  config: GuardConfig;
  color: string;
}

const PRESETS: PresetConfig[] = [
  {
    name: 'Economy',
    description: 'Conservative settings, reduces API costs',
    icon: <TrendingDown className="h-4 w-4" />,
    config: {
      minDelayMs: 2000,
      maxQueueSize: 50,
      maxRetries: 2,
      initialBackoffMs: 2000,
      failureThreshold: 3,
      recoveryTimeMs: 30000
    },
    color: 'text-green-600 bg-green-50 border-green-200'
  },
  {
    name: 'Balanced',
    description: 'Optimized for performance and reliability',
    icon: <Activity className="h-4 w-4" />,
    config: {
      minDelayMs: 1000,
      maxQueueSize: 100,
      maxRetries: 3,
      initialBackoffMs: 1000,
      failureThreshold: 5,
      recoveryTimeMs: 60000
    },
    color: 'text-blue-600 bg-blue-50 border-blue-200'
  },
  {
    name: 'High Throughput',
    description: 'Maximum speed, higher resource usage',
    icon: <TrendingUp className="h-4 w-4" />,
    config: {
      minDelayMs: 500,
      maxQueueSize: 200,
      maxRetries: 5,
      initialBackoffMs: 500,
      failureThreshold: 8,
      recoveryTimeMs: 120000
    },
    color: 'text-orange-600 bg-orange-50 border-orange-200'
  }
];

export function ExecutionGuardFineTuning({ className }: ExecutionGuardFineTuningProps) {
  const { data, loading, refetch } = useMissionControlData({ interval: 10000 });
  const [selectedPreset, setSelectedPreset] = useState<string>('balanced');
  const [customConfig, setCustomConfig] = useState<GuardConfig>(PRESETS[1].config);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [applying, setApplying] = useState(false);
  const [lastApplied, setLastApplied] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Current ExecutionGuard stats
  const guardStats = data?.live || null;

  useEffect(() => {
    // Clear feedback after 5 seconds
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const handlePresetChange = (presetName: string) => {
    const preset = PRESETS.find(p => p.name.toLowerCase() === presetName.toLowerCase());
    if (preset) {
      setSelectedPreset(presetName.toLowerCase());
      setCustomConfig(preset.config);
      setIsCustomMode(false);
      setPreviewMode(true);
    }
  };

  const handleCustomConfigChange = (key: keyof GuardConfig, value: number) => {
    setCustomConfig(prev => ({
      ...prev,
      [key]: value
    }));
    setIsCustomMode(true);
    setPreviewMode(true);
  };

  const applyConfiguration = async () => {
    try {
      setApplying(true);
      
      let response;
      if (isCustomMode) {
        response = await missionControlAPI.updateExecutionGuardCustom({
          minDelayMs: customConfig.minDelayMs,
          initialBackoffMs: customConfig.initialBackoffMs,
          maxQueueSize: customConfig.maxQueueSize,
          maxRetries: customConfig.maxRetries
        });
      } else {
        response = await missionControlAPI.updateExecutionGuardPreset(
          selectedPreset as 'economy' | 'balanced' | 'high-throughput'
        );
      }

      if (response.success) {
        setLastApplied(new Date().toLocaleTimeString());
        setPreviewMode(false);
        setFeedback({ type: 'success', message: 'Configuration applied successfully!' });
        await refetch(); // Refresh data
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      setFeedback({ 
        type: 'error', 
        message: `Failed to apply configuration: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
    } finally {
      setApplying(false);
    }
  };

  const revertChanges = () => {
    const preset = PRESETS.find(p => p.name.toLowerCase() === selectedPreset);
    if (preset) {
      setCustomConfig(preset.config);
    }
    setIsCustomMode(false);
    setPreviewMode(false);
  };

  const getImpactIndicator = (current: number, newValue: number) => {
    if (newValue > current * 1.2) return { icon: <TrendingUp className="h-3 w-3 text-red-500" />, text: 'Higher' };
    if (newValue < current * 0.8) return { icon: <TrendingDown className="h-3 w-3 text-green-500" />, text: 'Lower' };
    return { icon: <Target className="h-3 w-3 text-gray-500" />, text: 'Similar' };
  };

  if (loading && !guardStats) {
    return (
      <div className={`glass-card p-6 h-full ${className}`}>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  const currentMinDelay = 1000; // From ExecutionGuard default config
  const currentQueueSize = guardStats?.queue?.currentSize || 0;

  return (
    <div className={`glass-card p-6 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg">
            <Settings className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">ExecutionGuard Fine Tuning</h3>
            <p className="text-sm text-gray-600">Real-time parameter control</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {lastApplied && (
            <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
              <CheckCircle className="h-3 w-3" />
              <span>Applied {lastApplied}</span>
            </div>
          )}
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-4 p-3 rounded-lg border ${
            feedback.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? 
              <CheckCircle className="h-4 w-4" /> : 
              <AlertTriangle className="h-4 w-4" />
            }
            <span className="text-sm">{feedback.message}</span>
          </div>
        </motion.div>
      )}

      {/* Preset Selector */}
      <div className="mb-6">
        <label className="text-sm font-medium text-gray-700 mb-2 block">Configuration Preset</label>
        <div className="grid grid-cols-1 gap-2">
          {PRESETS.map((preset) => (
            <motion.button
              key={preset.name}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handlePresetChange(preset.name)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                selectedPreset === preset.name.toLowerCase() && !isCustomMode
                  ? preset.color
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {preset.icon}
                  <span className="font-medium text-sm">{preset.name}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {preset.config.minDelayMs}ms delay
                </div>
              </div>
              <div className="text-xs text-gray-600">{preset.description}</div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Custom Configuration Sliders */}
      <div className="mb-6 space-y-4">
        <h4 className="text-sm font-medium text-gray-700">Fine-tune Parameters</h4>
        
        <div className="space-y-4">
          {/* Min Delay */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-600">Min Delay (ms)</label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono">{customConfig.minDelayMs}ms</span>
                {previewMode && getImpactIndicator(currentMinDelay, customConfig.minDelayMs).icon}
              </div>
            </div>
            <input
              type="range"
              min="100"
              max="5000"
              step="100"
              value={customConfig.minDelayMs}
              onChange={(e) => handleCustomConfigChange('minDelayMs', Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>100ms</span>
              <span>5000ms</span>
            </div>
          </div>

          {/* Max Queue Size */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-600">Max Queue Size</label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono">{customConfig.maxQueueSize}</span>
                {guardStats?.queue && (
                  <span className="text-xs text-gray-500">
                    (current: {guardStats.queue.currentSize})
                  </span>
                )}
              </div>
            </div>
            <input
              type="range"
              min="10"
              max="500"
              step="10"
              value={customConfig.maxQueueSize}
              onChange={(e) => handleCustomConfigChange('maxQueueSize', Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>10</span>
              <span>500</span>
            </div>
          </div>

          {/* Max Retries */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-600">Max Retries</label>
              <span className="text-sm font-mono">{customConfig.maxRetries}</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={customConfig.maxRetries}
              onChange={(e) => handleCustomConfigChange('maxRetries', Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1</span>
              <span>10</span>
            </div>
          </div>

          {/* Initial Backoff */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-600">Initial Backoff (ms)</label>
              <span className="text-sm font-mono">{customConfig.initialBackoffMs}ms</span>
            </div>
            <input
              type="range"
              min="100"
              max="5000"
              step="100"
              value={customConfig.initialBackoffMs}
              onChange={(e) => handleCustomConfigChange('initialBackoffMs', Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>100ms</span>
              <span>5000ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Impact Preview */}
      {previewMode && guardStats && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">Impact Preview</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-gray-600">Queue Processing</div>
              <div className="font-medium">
                {customConfig.minDelayMs < currentMinDelay ? 'Faster' : 
                 customConfig.minDelayMs > currentMinDelay ? 'Slower' : 'Same'}
              </div>
            </div>
            <div>
              <div className="text-gray-600">Error Recovery</div>
              <div className="font-medium">
                {customConfig.maxRetries > 3 ? 'More resilient' : 'Standard'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="mt-auto space-y-2">
        {previewMode && (
          <div className="flex gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={applyConfiguration}
              disabled={applying}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {applying ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>{applying ? 'Applying...' : 'Apply Changes'}</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={revertChanges}
              disabled={applying}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
            </motion.button>
          </div>
        )}

        {/* Status Indicators */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-blue-600">
              <Shield className="h-3 w-3" />
              <span>{guardStats?.rateLimiting?.circuitBreakerState || 'CLOSED'}</span>
            </div>
            <div className="text-gray-500">Circuit Breaker</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-green-600">
              <Clock className="h-3 w-3" />
              <span>{guardStats?.queue?.averageWaitTime || 0}ms</span>
            </div>
            <div className="text-gray-500">Avg Wait</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-orange-600">
              <Activity className="h-3 w-3" />
              <span>{guardStats?.queue?.currentSize || 0}</span>
            </div>
            <div className="text-gray-500">Queue Size</div>
          </div>
        </div>
      </div>
    </div>
  );
}