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

  // Get trend icon - using semantic colors
  const getTrendIcon = (trendType: 'up' | 'down' | 'stable') => {
    switch (trendType) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-success" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      case 'stable':
        return <Minus className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  // Get trend classes - using semantic colors
  const getTrendClasses = (type: 'positive' | 'negative' | 'neutral') => {
    switch (type) {
      case 'positive':
        return 'text-green-500';
      case 'negative':
        return 'text-destructive';
      case 'neutral':
        return 'text-muted-foreground';
      default:
        return 'text-muted-foreground';
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
    'bg-card',
    'border',
    'border-border',
    'rounded-lg',
    'shadow-sm',
    'transition-all',
    'duration-200',
    'hover:shadow-md',
    sizeClasses[size].container,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {/* Header with icon and status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon && <div className="text-muted-foreground">{icon}</div>}
          <h3 className={`stats-card-title ${sizeClasses[size].title} text-muted-foreground`}>
            {title}
          </h3>
        </div>
        
        <div className={`status-indicator ${status} text-xs`}>
          <div className={`status-dot ${status}`} />
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </div>
      </div>

      {/* Value */}
      <div className={`stats-card-value ${sizeClasses[size].value} font-bold text-card-foreground mb-2`}>
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
            <span className="text-muted-foreground">
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
    'bg-card',
    'border',
    'border-border',
    'rounded-lg',
    'shadow-sm',
    'transition-all',
    'duration-200',
    'hover:shadow-md',
    'p-4',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <div className="text-muted-foreground">{icon}</div>}
          <h3 className={`text-sm text-muted-foreground`}>{title}</h3>
        </div>
        
        <div className={`status-indicator ${status} text-xs`}>
          <div className={`status-dot ${status}`} />
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </div>
      </div>

      {/* Value */}
      <div className={`${sizeClasses[size].value} font-bold text-card-foreground mb-3`}>
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
                    className="w-full bg-primary rounded-t transition-all duration-300 hover:opacity-80"
                    style={{ height: `${height}px` }}
                  />
                  <div className="text-xs text-muted-foreground mt-1 text-center">
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
          {trend === 'up' && <TrendingUp className="h-3 w-3 text-success" />}
          {trend === 'down' && <TrendingDown className="h-3 w-3 text-destructive" />}
          {trend === 'stable' && <Minus className="h-3 w-3 text-muted-foreground" />}
          <span className="text-muted-foreground">
            {change.value}% {change.label}
          </span>
        </div>
      )}
    </div>
  );
}