import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeType } from '../types';

interface ThemeSettingsProps {
  isEnabled: boolean;
}

// This component will now only be responsible for rendering the theme selection UI.
// The enabled/disabled state is managed by the parent PluginManager.
function ThemeSelector() {
  const { currentTheme, setTheme } = useTheme();

  const handleThemeChange = (theme: ThemeType) => {
    setTheme(theme);
  };

  const themes = [
    { id: 'light', label: 'Light', icon: '☀️' },
    { id: 'dark', label: 'Dark', icon: '🌙' },
    { id: 'advanced', label: 'Advanced', icon: '✨' }
  ];

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium mb-2">Select Theme:</div>
      <div className="grid grid-cols-3 gap-2">
        {themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => handleThemeChange(theme.id as ThemeType)}
            className={`p-2 rounded-md border text-sm transition-colors ${
              currentTheme === theme.id
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-lg">{theme.icon}</div>
            <div className="text-xs">{theme.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThemeSettings({ isEnabled }: ThemeSettingsProps) {
  return (
    <div className={`rounded-lg border p-4 ${isEnabled ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-lg">🎨</span>
          <h3 className="font-semibold">Advanced Themes</h3>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Glassmorphism effects and premium theming
      </p>
      
      <div className="border-t pt-3">
        <ThemeSelector />
      </div>
    </div>
  );
}