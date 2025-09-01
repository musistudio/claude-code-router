import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { DASHBOARD_CONFIG, DASHBOARD_FEATURES } from '@/config/dashboard';
import { OverviewTab } from './tabs/OverviewTab';
import { MissionControlTab } from './tabs/MissionControlTab';
import { ModelsTab } from './tabs/ModelsTab';
import { TrackingTab } from './tabs/TrackingTab';

import { ToolsTab } from './tabs/ToolsTab';
import { SystemTab } from './tabs/SystemTab';
import '@/styles/dashboard.css';
import '@/styles/widget-enhancements.css';

interface DashboardProps {
  className?: string;
  onOpenSettings?: () => void;
  onSaveConfig?: () => void;
  onSaveAndRestart?: () => void;
}

export function Dashboard({ 
  className = '', 
  onOpenSettings, 
  onSaveConfig, 
  onSaveAndRestart 
}: DashboardProps) {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState(DASHBOARD_CONFIG.defaultTab);

  // Disable dashboard if feature flag is off
  if (!DASHBOARD_CONFIG.enabled) {
    return null;
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab />;
      case 'mission-control':
        return DASHBOARD_FEATURES.missionControl ? <MissionControlTab /> : <OverviewTab />;
      case 'models':
        return <ModelsTab />;
      case 'tracking':
        return <TrackingTab />;
      case 'tools':
        return <ToolsTab />;
      case 'system':
        return <SystemTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <div className={`dashboard-bg min-h-screen text-white ${className}`}>
      <div className="max-w-7xl mx-auto p-6">
        {/* Top Control Bar */}
        <motion.div 
          className="flex items-center justify-between mb-6 glass-card p-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent">
              Claude Code Router
            </h2>
            <span className="text-sm text-gray-400">Advanced Control Panel</span>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Language Selector */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => i18n.changeLanguage('en')}
                className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                  i18n.language.startsWith('en') 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-black/20 text-gray-400 hover:text-white hover:bg-black/40'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => i18n.changeLanguage('zh')}
                className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                  i18n.language.startsWith('zh') 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-black/20 text-gray-400 hover:text-white hover:bg-black/40'
                }`}
              >
                中文
              </button>
            </div>

            {/* Control Buttons */}
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="px-4 py-2 bg-gray-500/20 text-gray-300 rounded-lg border border-gray-500/30 hover:bg-gray-500/30 transition-colors flex items-center gap-2"
              >
                <i className="fas fa-cog"></i>
                Settings
              </button>
            )}
            
            {onSaveConfig && (
              <button
                onClick={onSaveConfig}
                className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg border border-green-500/30 hover:bg-green-500/30 transition-colors flex items-center gap-2"
              >
                <i className="fas fa-save"></i>
                {t('app.save') || 'Save'}
              </button>
            )}
            
            {onSaveAndRestart && (
              <button
                onClick={onSaveAndRestart}
                className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 hover:bg-blue-500/30 transition-colors flex items-center gap-2"
              >
                <i className="fas fa-sync-alt"></i>
                {t('app.save_and_restart') || 'Save & Restart'}
              </button>
            )}
          </div>
        </motion.div>

        {/* Header */}
        <motion.div 
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent">
            🚀 Unified AI Proxy Control Center
          </h1>
          <p className="text-lg text-gray-300">
            🎯 All-in-One Dashboard: Model Management, Real-time Tracking & Advanced Controls
          </p>
        </motion.div>

        {/* Navigation Tabs */}
        <motion.div 
          className="nav-tabs"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {DASHBOARD_CONFIG.tabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <i className={`fas fa-${tab.icon} mr-2`}></i>
              {tab.label}
            </button>
          ))}
        </motion.div>

        {/* Tab Content */}
        <motion.div
          key={activeTab}
          className="fade-in"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          {renderTabContent()}
        </motion.div>
      </div>
    </div>
  );
}
