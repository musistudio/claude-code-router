import React from 'react';
import { motion } from 'framer-motion';
import { useMissionControlData } from '@/hooks/useMissionControlData';
import { ProviderHealthManagement } from './widgets/ProviderHealthManagement';
import { ProviderHealthHistory } from './widgets/ProviderHealthHistory';
import { ExecutionGuardFineTuning } from './widgets/ExecutionGuardFineTuning';
import { Settings, Shield, Database, AlertTriangle } from 'lucide-react';

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.3 }
  }
};

export function ColumnRight_ControlCenter() {
  const { data, loading, error } = useMissionControlData();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-center">
          <Settings className="h-8 w-8 mx-auto mb-4 text-orange-500" />
          <p className="text-gray-300">Loading control center...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-red-500" />
          <p className="text-red-400">Error loading control center: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {/* ExecutionGuard Fine Tuning */}
      <motion.div variants={item}>
        <ExecutionGuardFineTuning />
      </motion.div>

      {/* Provider Health Widgets - Two columns */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProviderHealthManagement />
        <ProviderHealthHistory />
      </motion.div>
    </motion.div>
  );
}