/**
 * Chart components with theme-aware styling
 * Re-exports from recharts with CCR design system integration
 */

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

// Chart color palette matching CCR design system
export const CHART_COLORS = [
  '#3b82f6', // blue-500
  '#22c55e', // green-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
];

// Chart theme configuration
export const chartTheme = {
  colors: CHART_COLORS,
  grid: {
    stroke: '#e5e7eb',
    strokeDasharray: '3 3',
  },
  tooltip: {
    backgroundColor: 'white',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 8,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  axis: {
    stroke: '#9ca3af',
    tick: '#6b7280',
    fontSize: 12,
  },
  legend: {
    fontSize: 12,
    color: '#374151',
  },
};

// Format number for chart display
export function formatChartNumber(value: number): string {
  if (value >= 1000000) {
    return (value / 1000000).toFixed(1) + 'M';
  } else if (value >= 1000) {
    return (value / 1000).toFixed(1) + 'K';
  }
  return value.toString();
}

// Format milliseconds to readable time
export function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return (ms / 1000).toFixed(1) + 's';
  }
  return Math.round(ms) + 'ms';
}

// Format tokens per second
export function formatSpeed(tokensPerSec: number): string {
  if (tokensPerSec >= 1000) {
    return (tokensPerSec / 1000).toFixed(1) + 'K/s';
  }
  return Math.round(tokensPerSec) + '/s';
}

// Export recharts components
export {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
};
