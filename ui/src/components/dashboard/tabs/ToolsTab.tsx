import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfig } from '@/components/ConfigProvider';
import type { StatusLineConfig, StatusLineModuleConfig } from '@/types';
import { createDefaultStatusLineConfig } from '@/utils/statusline';

interface StatusLineTemplate {
  id: string;
  name: string;
  description: string;
  style: 'default' | 'powerline';
  modules: StatusLineModuleConfig[];
  preview: string;
}

const TEMPLATES: StatusLineTemplate[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Just folder and git branch',
    style: 'default',
    modules: [
      { type: "workDir", icon: "📁", text: "{{workDirName}}", color: "bright_blue" },
      { type: "gitBranch", icon: "🌿", text: "{{gitBranch}}", color: "bright_green" }
    ],
    preview: '📁 my-project 🌿 main'
  },
  {
    id: 'developer',
    name: 'Developer',
    description: 'Perfect for coding - folder, git, and active model',
    style: 'default',
    modules: [
      { type: "workDir", icon: "📁", text: "{{workDirName}}", color: "bright_blue" },
      { type: "gitBranch", icon: "🌿", text: "{{gitBranch}}", color: "bright_magenta" },
      { type: "model", icon: "🤖", text: "{{model}}", color: "bright_cyan" }
    ],
    preview: '📁 my-project 🌿 main 🤖 gemini-2.5-pro'
  },
  {
    id: 'complete',
    name: 'Complete',
    description: 'Full info - folder, git, model, and token usage',
    style: 'default',
    modules: [
      { type: "workDir", icon: "📁", text: "{{workDirName}}", color: "bright_blue" },
      { type: "gitBranch", icon: "🌿", text: "{{gitBranch}}", color: "bright_magenta" },
      { type: "model", icon: "🤖", text: "{{model}}", color: "bright_cyan" },
      { type: "usage", icon: "⚡", text: "{{inputTokens}}→{{outputTokens}}", color: "bright_yellow" }
    ],
    preview: '📁 my-project 🌿 main 🤖 gemini-2.5-pro ⚡ 1.2k→245'
  },
  {
    id: 'powerline',
    name: 'Powerline Style',
    description: 'Modern powerline design with backgrounds',
    style: 'powerline',
    modules: [
      { type: "workDir", icon: "📁", text: "{{workDirName}}", color: "white", background: "bg_bright_blue" },
      { type: "gitBranch", icon: "🌿", text: "{{gitBranch}}", color: "white", background: "bg_bright_magenta" },
      { type: "model", icon: "🤖", text: "{{model}}", color: "white", background: "bg_bright_cyan" }
    ],
    preview: '▐📁 my-project▐🌿 main▐🤖 gemini-2.5-pro▌'
  }
];

export function ToolsTab() {
  const { config, setConfig } = useConfig();
  const [statusLineConfig, setStatusLineConfig] = useState<StatusLineConfig>(
    config?.StatusLine || createDefaultStatusLineConfig()
  );
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [isEnabled, setIsEnabled] = useState(statusLineConfig.enabled);
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (config?.StatusLine) {
      setStatusLineConfig(config.StatusLine);
      setIsEnabled(config.StatusLine.enabled);
    }
  }, [config]);

  const handleToggleStatusLine = async () => {
    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);
    
    const newStatusLineConfig = {
      ...statusLineConfig,
      enabled: newEnabled
    };
    
    setStatusLineConfig(newStatusLineConfig);
    
    if (config) {
      setConfig({
        ...config,
        StatusLine: newStatusLineConfig
      });
    }
  };

  const handleApplyTemplate = (template: StatusLineTemplate) => {
    const newStatusLineConfig: StatusLineConfig = {
      ...statusLineConfig,
      enabled: true,
      currentStyle: template.style,
      [template.style]: {
        modules: template.modules
      }
    };
    
    setStatusLineConfig(newStatusLineConfig);
    setSelectedTemplate(template.id);
    setIsEnabled(true);
    
    if (config) {
      setConfig({
        ...config,
        StatusLine: newStatusLineConfig
      });
    }
  };

  const getStatusLinePreview = () => {
    if (!isEnabled) return 'StatusLine is disabled';
    
    const currentModules = statusLineConfig[statusLineConfig.currentStyle as keyof StatusLineConfig] as { modules: StatusLineModuleConfig[] } | undefined;
    if (!currentModules?.modules || currentModules.modules.length === 0) return 'No modules configured';
    
    return currentModules.modules.map((module: StatusLineModuleConfig) => {
      let text = module.text || '';
      // Înlocuiește variabilele cu exemple
      text = text.replace(/\{\{workDirName\}\}/g, 'my-project');
      text = text.replace(/\{\{gitBranch\}\}/g, 'main');
      text = text.replace(/\{\{model\}\}/g, 'gemini-2.5-pro');
      text = text.replace(/\{\{inputTokens\}\}/g, '1.2k');
      text = text.replace(/\{\{outputTokens\}\}/g, '245');
      
      return `${module.icon || ''} ${text}`.trim();
    }).join(' ');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center gap-4 mb-6">
          <i className="fas fa-tools text-2xl text-blue-500"></i>
          <h2 className="text-2xl font-bold">Tool Integration</h2>
        </div>
        
        <div className="text-center py-6 text-gray-400">
          <i className="fas fa-terminal text-3xl mb-3"></i>
          <h3 className="text-lg mb-2">StatusLine Configuration</h3>
          <p>Customize your terminal status line to show useful information while using the CLI.</p>
        </div>
      </motion.div>

      {/* StatusLine Configuration */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <i className="fas fa-terminal text-2xl text-green-500"></i>
            <h3 className="text-xl font-bold">StatusLine for CLI</h3>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-gray-400">Enable StatusLine:</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={handleToggleStatusLine}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-green-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            </label>
          </div>
        </div>

        {/* Live Preview */}
        <div className="mb-8">
          <h4 className="text-white font-medium mb-3">Live Preview:</h4>
          <div className="bg-black rounded-lg p-4 font-mono text-sm border border-white/10">
            <div className="text-gray-500 mb-2">$ ccr code "explain this code"</div>
            <div className="text-white">
              {isEnabled ? getStatusLinePreview() : <span className="text-gray-500">StatusLine disabled</span>}
              <span className="text-gray-400 ml-2">│ Working...</span>
            </div>
          </div>
        </div>

        {/* Template Selection */}
        <AnimatePresence>
          {isEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h4 className="text-white font-medium mb-4">Choose a Template:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {TEMPLATES.map((template) => (
                  <motion.div
                    key={template.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedTemplate === template.id
                        ? 'border-green-500/50 bg-green-500/10'
                        : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-black/30'
                    }`}
                    onClick={() => handleApplyTemplate(template)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="font-bold text-white">{template.name}</h5>
                      {template.style === 'powerline' && (
                        <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded">
                          POWERLINE
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm mb-3">{template.description}</p>
                    <div className="bg-black/50 rounded p-2 font-mono text-xs">
                      <span className="text-gray-500">Preview: </span>
                      <span className="text-white">{template.preview}</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Advanced Options */}
              <div className="border-t border-white/10 pt-6">
                <button
                  onClick={() => setShowCustom(!showCustom)}
                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <i className={`fas fa-chevron-${showCustom ? 'up' : 'down'}`}></i>
                  Advanced Customization
                </button>
                
                <AnimatePresence>
                  {showCustom && (
                    <motion.div
                      className="mt-4 p-4 bg-black/20 rounded-lg border border-white/10"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="text-center py-8 text-gray-400">
                        <i className="fas fa-wrench text-2xl mb-3"></i>
                        <h4 className="text-lg mb-2">Advanced Module Editor</h4>
                        <p className="text-sm mb-4">
                          For advanced customization, you can manually edit modules, icons, colors, and positions.
                        </p>
                        <div className="text-xs text-gray-500">
                          Available module types: workDir, gitBranch, model, usage, script<br/>
                          Variables: workDirName, gitBranch, model, inputTokens, outputTokens
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Help Section */}
        {!isEnabled && (
          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <i className="fas fa-info-circle text-blue-400 mt-0.5"></i>
              <div>
                <h4 className="text-blue-400 font-medium mb-1">What is StatusLine?</h4>
                <p className="text-gray-300 text-sm">
                  StatusLine shows useful information in your terminal when using <code className="bg-black/30 px-1 rounded">ccr code</code>. 
                  It can display your current folder, git branch, active AI model, and token usage in real-time.
                </p>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
