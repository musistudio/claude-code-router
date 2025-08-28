import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MissionControlProvider } from '../../../contexts/MissionControlContext';
import { ColumnLeft_RealTimeOps } from '../ColumnLeft_RealTimeOps';
import { ColumnMiddle_StrategicInsights } from '../ColumnMiddle_StrategicInsights';
import { ColumnRight_ControlCenter } from '../ColumnRight_ControlCenter';

export function MissionControlTab() {
  const [activeSubTab, setActiveSubTab] = useState<'realtime' | 'strategic' | 'control'>('realtime');
  
  return (
    <MissionControlProvider>
      <div className="space-y-8">
        {/* Header Section */}
        <motion.div 
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg border border-blue-500/30">
                <i className="fas fa-satellite-dish text-2xl text-blue-400"></i>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Mission Control v2</h1>
                <p className="text-gray-300 mt-1">
                  Advanced Analytics & Control Center pentru Claude Code Router
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 text-green-400 rounded-lg border border-green-500/30 text-sm font-medium">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                LIVE MONITORING
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 p-4 rounded-lg border border-blue-500/20">
              <div className="flex items-center gap-3 mb-2">
                <i className="fas fa-eye text-blue-400"></i>
                <span className="text-sm font-medium text-blue-400">Real-Time Ops</span>
              </div>
              <p className="text-xs text-gray-300">
                Live system health, activity feed și threat matrix pentru monitoring în timp real
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 p-4 rounded-lg border border-purple-500/20">
              <div className="flex items-center gap-3 mb-2">
                <i className="fas fa-brain text-purple-400"></i>
                <span className="text-sm font-medium text-purple-400">Strategic Intel</span>
              </div>
              <p className="text-xs text-gray-300">
                Performance analysis, route efficiency și AI-powered suggestions pentru optimizare
              </p>
            </div>

            <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 p-4 rounded-lg border border-orange-500/20">
              <div className="flex items-center gap-3 mb-2">
                <i className="fas fa-cogs text-orange-400"></i>
                <span className="text-sm font-medium text-orange-400">Control Center</span>
              </div>
              <p className="text-xs text-gray-300">
                Configuration management, A/B testing și provider health pentru control complet
              </p>
            </div>
          </div>
        </motion.div>

        {/* Mission Control Subtabs */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg border border-slate-700/50 mb-6">
            <button
              onClick={() => setActiveSubTab('realtime')}
              className={`flex-1 px-6 py-3 text-sm font-medium rounded-md transition-all duration-200 ${
                activeSubTab === 'realtime'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-lg'
                  : 'text-gray-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <i className="fas fa-eye mr-2"></i>
              Real-Time Ops
            </button>
            <button
              onClick={() => setActiveSubTab('strategic')}
              className={`flex-1 px-6 py-3 text-sm font-medium rounded-md transition-all duration-200 ${
                activeSubTab === 'strategic'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-lg'
                  : 'text-gray-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <i className="fas fa-brain mr-2"></i>
              Strategic Insights
            </button>
            <button
              onClick={() => setActiveSubTab('control')}
              className={`flex-1 px-6 py-3 text-sm font-medium rounded-md transition-all duration-200 ${
                activeSubTab === 'control'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-lg'
                  : 'text-gray-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <i className="fas fa-cogs mr-2"></i>
              Control Center
            </button>
          </div>

          {/* Subtab Content */}
          <div className="min-h-[600px]">
            {activeSubTab === 'realtime' && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="flex items-center justify-center h-full"
              >
                <div className="w-full max-w-6xl">
                  <ColumnLeft_RealTimeOps />
                </div>
              </motion.div>
            )}

            {activeSubTab === 'strategic' && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="flex items-center justify-center h-full"
              >
                <div className="w-full max-w-6xl">
                  <ColumnMiddle_StrategicInsights />
                </div>
              </motion.div>
            )}

            {activeSubTab === 'control' && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="flex items-center justify-center h-full"
              >
                <div className="w-full max-w-6xl">
                  <ColumnRight_ControlCenter />
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </MissionControlProvider>
  );
}