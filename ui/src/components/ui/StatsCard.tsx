import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { type StatusType } from './StatusIndicator';

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'positive' | 'negative' | 'neutral';
    label?: string;
  };
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  size?: 'small' | 'normal' | 'large';
  icon?: React.ReactNode;
  status?: StatusType;
  className?: string;
  formatNumber?: boolean;
}

export function StatsCard({
  title,
  value,
  change,
  trend,
  trendValue,
  size = 'normal',
  icon,
  status = 'info',
  className = '',
  formatNumber = false,
}: StatsCardProps) {
  // Size classes
  const sizeClasses = {
    small: {
      container: 'p-3',
      title: 'text-xs',
      value: 'text-lg',
    },
    normal: {
      container: 'p-4',
      title: 'text-sm',
      value: 'text-xl',
    },
    large: {
      container: 'p-6',
      title: 'text-base',
      value: 'text-2xl',
    },
  };

  // Format number with commas
  const formatValue = (val: string | number): string => {
    if (typeof val === 'string') {
      // Try to parse as number first
      const num = parseFloat(val);
      if (!isNaN(num)) {
        return formatNumber ? formatNumberWithCommas(num) : num.toString();
      }
      return val;
    }
    return formatNumber ? formatNumberWithCommas(val) : val.toString();
  };

  // Function to format numbers with commas
  function formatNumberWithCommas(num: number): string {
    return num.toLocaleString('en-US', {
      maximumFractionDigits: 1,
    });
  };

  // Get trend icon
  const getTrendIcon = (trendType: 'up' | 'down' | 'stable') => {
    switch (trendType) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'stable':
        return <Minus className="h-4 w-4 text-gray-600" />;
      default:
        return null;
    }
  };

  // Get trend classes
  const getTrendClasses = (type: 'positive' | 'negative' | 'neutral') => {
    switch (type) {
      case 'positive':
        return 'text-green-600';
      case 'negative':
        return 'text-red-600';
      case 'neutral':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  };

  // Status configuration
  const statusConfig = {
    success: 'bg-status-success',
    warning: 'bg-status-warning',
    error: 'bg-status-error',
    info: 'bg-status-info',
  };

  const containerClasses = [
    'stats-card',
    'bg-white',
    'border',
    'border-gray-200',
    'rounded-lg',
    'transition-all',
    'duration-200',
    'hover:border-gray-300',
    'hover:shadow-md',
    sizeClasses[size].container,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {/* Header with icon and status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon && <div className="text-gray-400">{icon}</div>}
          <h3 className={`stats-card-title ${sizeClasses[size].title} text-gray-600`}>
            {title}
          </h3>
        </div>
        
        <div className={`status-indicator ${status} text-xs`}>
          <div className={`status-dot ${status}`} />
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </div>
      </div>

      {/* Value */}
      <div className={`stats-card-value ${sizeClasses[size].value} font-bold text-gray-900 mb-2`}>
        {formatValue(value)}
      </div>

      {/* Change and trend */}
      {change && (
        <div className={`flex items-center gap-2 text-xs ${getTrendClasses(change.type)}`}>
          {trend && getTrendIcon(trend)}
          {change.value !== undefined && (
            <span>
              {change.type === 'positive' ? '+' : ''}
              {change.value}%
            </span>
          )}
          {change.label && (
            <span className="text-gray-500">
              {change.label}
            </span>
          )}
        </div>
      )}

      {/* Trend value (when different from change) */}
      {trendValue !== undefined && change && (
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <span>
            {trendValue >= 0 ? '+' : ''}
            {trendValue}%
          </span>
          <span>vs previous</span>
        </div>
      )}
    </div>
  );
}

// Enhanced stats card with chart placeholder
interface StatsCardChartProps extends StatsCardProps {
  chartData?: Array<{ value: number; label: string }>;
  showChart?: boolean;
  chartType?: 'bar' | 'line' | 'area';
  chartHeight?: number;
}

export function StatsCardChart({
  title,
  value,
  change,
  trend,
  size = 'normal',
  icon,
  status = 'info',
  className = '',
  formatNumber = false,
  chartData,
  showChart = false,
  chartType = 'area',
  chartHeight = 60,
}: StatsCardChartProps) {
  const sizeClasses = {
    small: { value: 'text-base' },
    normal: { value: 'text-xl' },
    large: { value: 'text-2xl' },
  };

  const formatValue = (val: string | number): string => {
    if (typeof val === 'string') {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        return formatNumber ? formatNumberWithCommas(num) : num.toString();
      }
      return val;
    }
    return formatNumber ? formatNumberWithCommas(val) : val.toString();
  };

  function formatNumberWithCommas(num: number): string {
    return num.toLocaleString('en-US', { maximumFractionDigits: 1 });
  };

  const containerClasses = [
    'stats-card',
    'bg-white',
    'border',
    'border-gray-200',
    'rounded-lg',
    'transition-all',
    'duration-200',
    'hover:border-gray-300',
    'hover:shadow-md',
    'p-4',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <div className="text-gray-400">{icon}</div>}
          <h3 className={`text-sm text-gray-600`}>{title}</h3>
        </div>
        
        <div className={`status-indicator ${status} text-xs`}>
          <div className={`status-dot ${status}`} />
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </div>
      </div>

      {/* Value */}
      <div className={`${sizeClasses[size].value} font-bold text-gray-900 mb-3`}>
        {formatValue(value)}
      </div>

      {/* Chart placeholder */}
      {showChart && chartData && Array.isArray(chartData) && chartData.length > 0 && (
        <div className="relative" style={{ height: `${chartHeight}px` }}>
          {/* Simple chart visualization */}
          <div className="absolute inset-0 flex items-end justify-between gap-1">
            {chartData.map((point, index) => {
              const maxValue = Math.max(...chartData.map(d => d.value));
              const height = (point.value / maxValue) * (chartHeight - 8);
              
              return (
                <div key={index} className="flex-1 flex flex-col items-center justify-end">
                  <div
                    className="w-full bg-blue-500 rounded-t transition-all duration-300 hover:bg-blue-600"
                    style={{ height: `${height}px` }}
                  />
                  <div className="text-xs text-gray-500 mt-1 text-center">
                    {point.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Change indicator */}
      {change && (
        <div className="flex items-center gap-2 text-xs">
          {trend === 'up' && <TrendingUp className="h-3 w-3 text-green-600" />}
          {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-600" />}
          {trend === 'stable' && <Minus className="h-3 w-3 text-gray-600" />}
          <span className="text-gray-600">
            {change.value}% {change.label}
          </span>
        </div>
      )}
    </div>
  );
}