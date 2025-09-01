import React, { useState } from 'react';
import { motion } from 'framer-motion';

export function MissionControlTab() {
  const [activeSection, setActiveSection] = useState<'overview' | 'health' | 'performance'>('overview');
  
  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div 
        className="glass-card p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg border border-blue-500/30">
              <i className="fas fa-satellite-dish text-2xl text-blue-400"></i>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Mission Control</h1>
              <p className="text-gray-300 mt-1">
                Centru de comandă și monitorizare pentru Claude Code Router
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 text-green-400 rounded-lg border border-green-500/30 text-sm font-medium">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            OPERATIONAL
          </div>
        </div>

        {/* Navigation */}
        <div className="flex bg-slate-800/50 rounded-lg p-1">
          <button
            onClick={() => setActiveSection('overview')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
              activeSection === 'overview'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-gray-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <i className="fas fa-chart-line mr-2"></i>
            Overview
          </button>
          <button
            onClick={() => setActiveSection('health')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
              activeSection === 'health'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'text-gray-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <i className="fas fa-heart mr-2"></i>
            System Health
          </button>
          <button
            onClick={() => setActiveSection('performance')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
              activeSection === 'performance'
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'text-gray-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <i className="fas fa-tachometer-alt mr-2"></i>
            Performance
          </button>
        </div>
      </motion.div>

      {/* Content Sections */}
      <motion.div 
        className="glass-card p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        {activeSection === 'overview' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white mb-4">System Overview</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 p-6 rounded-lg border border-blue-500/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <i className="fas fa-server text-blue-400"></i>
                  </div>
                  <span className="text-2xl font-bold text-blue-400">12</span>
                </div>
                <h3 className="text-lg font-semibold text-white">Active Providers</h3>
                <p className="text-sm text-gray-400">Provideri disponibili</p>
              </div>

              <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 p-6 rounded-lg border border-green-500/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <i className="fas fa-check-circle text-green-400"></i>
                  </div>
                  <span className="text-2xl font-bold text-green-400">98.5%</span>
                </div>
                <h3 className="text-lg font-semibold text-white">Success Rate</h3>
                <p className="text-sm text-gray-400">Ultima săptămână</p>
              </div>

              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 p-6 rounded-lg border border-purple-500/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <i className="fas fa-clock text-purple-400"></i>
                  </div>
                  <span className="text-2xl font-bold text-purple-400">1.2s</span>
                </div>
                <h3 className="text-lg font-semibold text-white">Avg Response</h3>
                <p className="text-sm text-gray-400">Timp mediu răspuns</p>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'health' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white mb-4">System Health</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 p-6 rounded-lg border border-green-500/20">
                <h3 className="text-lg font-semibold text-white mb-4">Service Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">API Gateway</span>
                    <span className="flex items-center gap-2 text-green-400">
                      <i className="fas fa-circle text-xs"></i>
                      Online
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Load Balancer</span>
                    <span className="flex items-center gap-2 text-green-400">
                      <i className="fas fa-circle text-xs"></i>
                      Online
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Database</span>
                    <span className="flex items-center gap-2 text-green-400">
                      <i className="fas fa-circle text-xs"></i>
                      Online
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 p-6 rounded-lg border border-orange-500/20">
                <h3 className="text-lg font-semibold text-white mb-4">Resource Usage</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">CPU</span>
                      <span className="text-orange-400">45%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div className="bg-orange-400 h-2 rounded-full" style={{width: '45%'}}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">Memory</span>
                      <span className="text-orange-400">62%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div className="bg-orange-400 h-2 rounded-full" style={{width: '62%'}}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'performance' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white mb-4">Performance Metrics</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 p-6 rounded-lg border border-purple-500/20">
                <h3 className="text-lg font-semibold text-white mb-4">Request Statistics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Total Requests</span>
                    <span className="text-purple-400 font-mono">1,247</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Successful</span>
                    <span className="text-green-400 font-mono">1,228</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Failed</span>
                    <span className="text-red-400 font-mono">19</span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 p-6 rounded-lg border border-blue-500/20">
                <h3 className="text-lg font-semibold text-white mb-4">Response Times</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Average</span>
                    <span className="text-blue-400 font-mono">1.2s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">P95</span>
                    <span className="text-blue-400 font-mono">2.8s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">P99</span>
                    <span className="text-blue-400 font-mono">4.1s</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}