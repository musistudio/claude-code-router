import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeType } from '../types';

interface ThemeOption {
  id: ThemeType;
  label: string;
  description: string;
  icon: string;
  previewColors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    border: string;
  };
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    label: 'Light Theme',
    description: 'Clean and professional light theme',
    icon: '☀️',
    previewColors: {
      primary: '#e5e8eeff',
      secondary: '#050c13ff',
      accent: '#3b82f6',
      background: '#ffffff',
      border: '#e2e8f0'
    }
  },
  {
    id: 'dark',
    label: 'Dark Theme', 
    description: 'Elegant and sophisticated dark experience',
    icon: '🌙',
    previewColors: {
      primary: '#0b0c0cff',
      secondary: '#eaeff5ff',
      accent: '#60a5fa',
      background: '#0f172a',
      border: '#334155'
    }
  },
  {
    id: 'advanced',
    label: 'Advanced Theme',
    description: 'Spectacular glassmorphism space experience',
    icon: '🚀',
    previewColors: {
      primary: 'rgba(255, 255, 255, 0.95)',
      secondary: 'rgba(255, 255, 255, 0.25)',
      accent: '#e94560',
      background: 'rgba(45,45,75,0.95)',
      border: 'rgba(255, 255, 255, 0.2)'
    }
  }
];

const ThemeSelector: React.FC = () => {
  const { currentTheme, setTheme, isPluginEnabled } = useTheme();

  const handleThemeChange = (themeId: ThemeType) => {
    if (isPluginEnabled()) {
      setTheme(themeId);
    }
  };

  if (!isPluginEnabled()) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        Enable Advanced Themes plugin to access theme options
      </div>
    );
  }

  return (
    <div className="theme-selector space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Select Theme
        </label>
        <div className="grid grid-cols-2 gap-3">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => handleThemeChange(option.id)}
              className={`
                relative p-3 rounded-lg border-2 transition-all duration-200
                hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/50
                ${currentTheme === option.id 
                  ? 'border-primary ring-2 ring-primary/20' 
                  : 'border-border hover:border-primary/50'
                }
              `}
            >
              <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <span>{option.icon}</span>
                {option.label}
              </div>
              
              <div className="text-xs text-muted-foreground mb-2">
                {option.description}
              </div>
              
              {/* Theme Preview */}
              <div className="space-y-1">
                <div 
                  className="h-3 rounded transition-colors duration-200"
                  style={{ backgroundColor: option.previewColors.primary }}
                />
                <div 
                  className="h-3 rounded transition-colors duration-200"
                  style={{ backgroundColor: option.previewColors.secondary }}
                />
                <div 
                  className="h-3 rounded transition-colors duration-200"
                  style={{ backgroundColor: option.previewColors.accent }}
                />
              </div>

              {/* Selected indicator */}
              {currentTheme === option.id && (
                <div className="absolute top-2 right-2">
                  <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <svg 
                      className="w-2 h-2 text-primary-foreground" 
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
              {option.id === 'advanced' && (
                <div className="absolute bottom-2 right-2">
                  <div 
                    className="w-2 h-2 rounded-full border border-primary/40"
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

      <div className="text-xs text-muted-foreground mt-2">
        <p>
          <span className="font-medium">Current:</span> {currentTheme}
        </p>
        <p className="mt-1">
          Glassmorphism effects available in Advanced themes.
        </p>
      </div>
    </div>
  );
};

export default ThemeSelector;