import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Dashboard as CustomDashboard } from '@/components/dashboard/Dashboard';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import '@/styles/dashboard-theme.css';

interface DashboardWrapperProps {
  children: React.ReactNode;
  onOpenSettings?: () => void;
  onSaveConfig?: () => void;
  onSaveAndRestart?: () => void;
}

export function DashboardWrapper({ 
  children, 
  onOpenSettings, 
  onSaveConfig, 
  onSaveAndRestart 
}: DashboardWrapperProps) {
  const { t } = useTranslation();
  const [showCustomDashboard, setShowCustomDashboard] = useState(false);

  if (showCustomDashboard) {
    return (
      <div className="dashboard-context relative min-h-screen">
        {/* Exit Button */}
        <motion.div
          className="fixed top-4 right-4 z-50"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Button
            onClick={() => setShowCustomDashboard(false)}
            className="bg-black/50 backdrop-blur-sm text-white border border-white/20 hover:bg-black/70"
          >
            <EyeOff className="h-4 w-4 mr-2" />
            Exit Dashboard
          </Button>
        </motion.div>
        
        <CustomDashboard 
          onOpenSettings={onOpenSettings}
          onSaveConfig={onSaveConfig}
          onSaveAndRestart={onSaveAndRestart}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Dashboard Toggle Button */}
      <motion.div
        className="fixed bottom-6 right-6 z-50"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 1 }}
      >
        <Button
          onClick={() => setShowCustomDashboard(true)}
          className="bg-gradient-to-r from-pink-500 to-violet-500 text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 rounded-full px-6 py-3 text-lg font-bold"
        >
          <Eye className="h-5 w-5 mr-2" />
          🚀 Advanced Dashboard
        </Button>
      </motion.div>

      {/* Original Content */}
      {children}
    </div>
  );
}
