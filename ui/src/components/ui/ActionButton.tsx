import React, { type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'warning' | 'danger' | 'success';
  loading?: boolean;
  icon?: React.ReactNode;
  size?: 'small' | 'normal' | 'large';
  children: React.ReactNode;
}

export function ActionButton({
  variant = 'primary',
  loading = false,
  icon,
  size = 'normal',
  children,
  className = '',
  disabled,
  ...props
}: ActionButtonProps) {
  // Base classes
  const baseClasses = [
    'action-button',
    'inline-flex',
    'items-center',
    'gap-2',
    'transition-all',
    'duration-200',
    'ease-in-out',
    'cursor-pointer',
    'font-medium',
    'border',
    'border-transparent',
  ];

  // Size classes
  const sizeClasses = {
    small: ['text-xs', 'py-1.5', 'px-3'],
    normal: ['text-sm', 'py-2', 'px-4'],
    large: ['text-base', 'py-3', 'px-6'],
  };

  // Variant classes
  const variantClasses = {
    primary: ['bg-blue-500', 'hover:bg-blue-600', 'text-white', 'hover:border-blue-700'],
    secondary: ['bg-white', 'hover:bg-gray-50', 'text-gray-700', 'border-gray-300', 'hover:border-gray-400'],
    warning: ['bg-yellow-400', 'hover:bg-yellow-500', 'text-white', 'hover:border-yellow-600'],
    danger: ['bg-red-500', 'hover:bg-red-600', 'text-white', 'hover:border-red-700'],
    success: ['bg-green-500', 'hover:bg-green-600', 'text-white', 'hover:border-green-700'],
  };

  // Disabled state
  const disabledClasses = disabled || loading 
    ? ['opacity-50', 'cursor-not-allowed', 'pointer-events-none']
    : [];

  // Loading state
  const loadingClasses = loading 
    ? ['relative', 'text-transparent']
    : [];

  // Hover effect
  const hoverClasses = !disabled && !loading 
    ? ['hover:transform', 'hover:-translate-y-0.5', 'hover:shadow-lg']
    : [];

  const allClasses = [
    ...baseClasses,
    ...sizeClasses[size],
    ...variantClasses[variant],
    ...disabledClasses,
    ...loadingClasses,
    ...hoverClasses,
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      className={allClasses}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <Loader2 className="absolute w-4 h-4 animate-spin text-current" />
      )}
      <span className={loading ? 'invisible' : ''}>
        {icon}
        {children}
      </span>
    </button>
  );
}