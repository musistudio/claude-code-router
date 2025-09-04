import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface ThemeOption {
  id: string;
  label: string;
  mode: 'light' | 'dark';
  variant: 'classic' | 'advanced';
  previewColors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    border: string;
  };
}

const themeOptions: ThemeOption[] = [
  {
    id: 'classic-light',
    label: 'Classic Light',
    mode: 'light',
    variant: 'classic',
    previewColors: {
      primary: '#ffffff',
      secondary: '#f3f4f6',
      accent: '#3b82f6',
      background: '#ffffff',
      border: '#e5e7eb'
    }
  },
  {
    id: 'classic-dark',
    label: 'Classic Dark',
    mode: 'dark',
    variant: 'classic',
    previewColors: {
      primary: '#1f2937',
      secondary: '#374151',
      accent: '#60a5fa',
      background: '#111827',
      border: '#4b5563'
    }
  },
  {
    id: 'advanced-light',
    label: 'Advanced Light',
    mode: 'light',
    variant: 'advanced',
    previewColors: {
      primary: 'rgba(255, 255, 255, 0.1)',
      secondary: 'rgba(243, 244, 246, 0.05)',
      accent: 'rgba(59, 130, 246, 0.8)',
      background: 'rgba(255, 255, 255, 0.05)',
      border: 'rgba(229, 231, 235, 0.1)'
    }
  },
  {
    id: 'advanced-dark',
    label: 'Advanced Dark',
    mode: 'dark',
    variant: 'advanced',
    previewColors: {
      primary: 'rgba(31, 41, 55, 0.1)',
      secondary: 'rgba(55, 65, 81, 0.05)',
      accent: 'rgba(96, 165, 250, 0.8)',
      background: 'rgba(17, 24, 39, 0.05)',
      border: 'rgba(75, 85, 99, 0.1)'
    }
  }
];

const ThemeSelector: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const currentThemeId = `${theme.variant}-${theme.mode}`;

  const handleThemeChange = (themeOption: ThemeOption) => {
    setTheme({
      mode: themeOption.mode,
      variant: themeOption.variant
    });
  };

  return (
    <div className="theme-selector space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Select Theme
        </label>
        <div className="grid grid-cols-2 gap-3">
          {themeOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleThemeChange(option)}
              className={`
                relative p-3 rounded-lg border-2 transition-all duration-200
                hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500
                ${currentThemeId === option.id 
                  ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800' 
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }
              `}
            >
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                {option.label}
              </div>
              
              {/* Theme Preview */}
              <div className="space-y-1">
                <div 
                  className="h-4 rounded transition-colors duration-200"
                  style={{ backgroundColor: option.previewColors.primary }}
                />
                <div 
                  className="h-4 rounded transition-colors duration-200"
                  style={{ backgroundColor: option.previewColors.secondary }}
                />
                <div 
                  className="h-4 rounded transition-colors duration-200"
                  style={{ backgroundColor: option.previewColors.accent }}
                />
              </div>

              {/* Selected indicator */}
              {currentThemeId === option.id && (
                <div className="absolute top-2 right-2">
                  <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                    <svg 
                      className="w-2 h-2 text-white" 
                      fill="currentColor" 
                      viewBox="0 0 20 20"
                    >
                      <path 
                        fillRule="evenodd" 
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
                        clipRule="evenodd" 
                      />
                    </svg>
                  </div>
                </div>
              )}

              {/* Glassmorphism indicator for advanced themes */}
              {option.variant === 'advanced' && (
                <div className="absolute bottom-1 right-1">
                  <div 
                    className="w-2 h-2 rounded-full border border-gray-400"
                    style={{ 
                      background: `linear-gradient(45deg, ${option.previewColors.accent}, ${option.previewColors.primary})`,
                      boxShadow: '0 0 4px rgba(0,0,0,0.2)'
                    }}
                  />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
        <p>
          <span className="font-medium">Current Theme:</span> {theme.variant} {theme.mode}
        </p>
        <p className="mt-1">
          Glassmorphism effects are available in Advanced themes.
        </p>
      </div>
    </div>
  );
};

export default ThemeSelector;