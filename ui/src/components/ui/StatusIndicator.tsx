import React from 'react';

export type StatusType = 'success' | 'warning' | 'error' | 'info';

interface StatusIndicatorProps {
  status: StatusType;
  text?: string;
  showIcon?: boolean;
  size?: 'small' | 'normal' | 'large';
  className?: string;
}

const statusConfig = {
  success: {
    bgClass: 'bg-status-success',
    textClass: 'text-status-success',
    dotClass: 'bg-green-500',
    borderClass: 'border-green-200',
  },
  warning: {
    bgClass: 'bg-status-warning',
    textClass: 'text-status-warning',
    dotClass: 'bg-yellow-500',
    borderClass: 'border-yellow-200',
  },
  error: {
    bgClass: 'bg-status-error',
    textClass: 'text-status-error',
    dotClass: 'bg-red-500',
    borderClass: 'border-red-200',
  },
  info: {
    bgClass: 'bg-status-info',
    textClass: 'text-status-info',
    dotClass: 'bg-blue-500',
    borderClass: 'border-blue-200',
  },
};

export function StatusIndicator({
  status,
  text,
  showIcon = true,
  size = 'normal',
  className = '',
}: StatusIndicatorProps) {
  const config = statusConfig[status];
  
  const sizeClasses = {
    small: {
      container: 'px-2 py-1 text-xs',
      dot: 'w-1.5 h-1.5',
    },
    normal: {
      container: 'px-3 py-1.5 text-sm',
      dot: 'w-2 h-2',
    },
    large: {
      container: 'px-4 py-2 text-base',
      dot: 'w-3 h-3',
    },
  };

  const containerClasses = [
    config.bgClass,
    config.textClass,
    'border rounded-full',
    'inline-flex',
    'items-center',
    'gap-2',
    'font-medium',
    sizeClasses[size].container,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {showIcon && (
        <div 
          className={`${config.dotClass} ${sizeClasses[size].dot} rounded-full`}
        />
      )}
      {text && <span>{text}</span>}
    </div>
  );
}

// Status indicator as a standalone dot
export function StatusDot({
  status,
  showPulse = false,
  className = '',
}: {
  status: StatusType;
  showPulse?: boolean;
  className?: string;
}) {
  const config = statusConfig[status];
  
  const baseClasses = [
    config.dotClass,
    'rounded-full',
    'block',
  ];

  if (showPulse) {
    baseClasses.push('animate-pulse');
  }

  return (
    <div className={`${baseClasses.join(' ')} ${className}`} />
  );
}

// Status indicator with message and timestamp
export function StatusMessage({
  status,
  message,
  timestamp,
  className = '',
}: {
  status: StatusType;
  message: string;
  timestamp?: Date;
  className?: string;
}) {
  const config = statusConfig[status];

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${config.bgClass} ${className}`}>
      <StatusIndicator status={status} size="small" />
      <div className="flex-1">
        <p className={config.textClass}>{message}</p>
        {timestamp && (
          <p className="text-xs text-gray-500 mt-1">
            {timestamp.toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

// Status bar for multiple statuses
interface StatusBarProps {
  statuses: Array<{
    status: StatusType;
    text: string;
  }>;
  className?: string;
}

export function StatusBar({ statuses, className = '' }: StatusBarProps) {
  if (!statuses || !Array.isArray(statuses)) {
    return null;
  }
  
  return (
    <div className={`flex gap-2 flex-wrap ${className}`}>
      {statuses.map((item, index) => (
        <StatusIndicator
          key={index}
          status={item.status}
          text={item.text}
          showIcon={true}
        />
      ))}
    </div>
  );
}