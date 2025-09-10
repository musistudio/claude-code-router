import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeOption {
  id: 'light' | 'dark' | 'advanced';
  label: string;
  description: string;
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
    id: 'light',
    label: 'Classic Light',
    description: 'Clean and professional',
    previewColors: {
      primary: '#ffffff',
      secondary: '#f3f4f6',
      accent: '#3b82f6',
      background: '#ffffff',
      border: '#e5e7eb'
    }
  },
  {
    id: 'dark',
    label: 'Classic Dark',
    description: 'Dark and elegant',
    previewColors: {
      primary: '#1f2937',
      secondary: '#374151',
      accent: '#60a5fa',
      background: '#111827',
      border: '#4b5563'
    }
  },
  {
    id: 'advanced',
    label: '🚀 Advanced Space',
    description: 'Glassmorphism effects',
    previewColors: {
      primary: 'rgba(42, 42, 62, 0.9)',
      secondary: 'rgba(38, 49, 78, 0.8)',
      accent: 'rgba(31, 68, 112, 0.9)',
      background: 'linear-gradient(135deg, #2a2a3e, #26314e, #1f4470)',
      border: 'rgba(255, 255, 255, 0.2)'
    }
  }
];

const ThemeSelectorSimple: React.FC = () => {
  const { currentTheme, setTheme, isPluginEnabled } = useTheme();

  const handleThemeChange = (themeId: 'light' | 'dark' | 'advanced') => {
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
          {themeOptions.map((option) => (
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
              <div className="text-sm font-medium text-foreground mb-2">
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

export default ThemeSelectorSimple;
