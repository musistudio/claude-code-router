import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { 
  ThemeType, 
  ThemeDefinition, 
  ThemePluginConfig, 
  ThemeContextType,
  ThemeColors 
} from '../types';

// Predefined theme definitions
const THEME_DEFINITIONS: Record<ThemeType, ThemeDefinition> = {
  light: {
    id: 'light',
    name: 'Light Theme',
    description: 'Clean and professional light theme',
    colors: {
      background: 'oklch(0.98 0 0)',
      foreground: 'oklch(0.2 0 0)',
      card: 'oklch(1 0 0)',
      cardForeground: 'oklch(0.15 0 0)',
      popover: 'oklch(1 0 0)',
      popoverForeground: 'oklch(0.15 0 0)',
      primary: 'oklch(0.5 0.15 220)',
      primaryForeground: 'oklch(0.98 0 0)',
      secondary: 'oklch(0.94 0 0)',
      secondaryForeground: 'oklch(0.2 0 0)',
      muted: 'oklch(0.94 0 0)',
      mutedForeground: 'oklch(0.5 0 0)',
      accent: 'oklch(0.92 0 0)',
      accentForeground: 'oklch(0.2 0 0)',
      destructive: 'oklch(0.65 0.2 25)',
      destructiveForeground: 'oklch(0.98 0 0)',
      border: 'oklch(0.9 0 0)',
      input: 'oklch(0.92 0 0)',
      ring: 'oklch(0.5 0.15 220)'
    },
    features: {
      glassmorphism: false,
      animations: true,
      gradients: false
    }
  },
  
  dark: {
    id: 'dark',
    name: 'Dark Theme',
    description: 'Elegant and eye-friendly dark theme',
    colors: {
      background: 'oklch(0.12 0 0)',
      foreground: 'oklch(0.9 0 0)',
      card: 'oklch(0.18 0 0)',
      cardForeground: 'oklch(0.9 0 0)',
      popover: 'oklch(0.18 0 0)',
      popoverForeground: 'oklch(0.9 0 0)',
      primary: 'oklch(0.65 0.15 200)',
      primaryForeground: 'oklch(0.12 0 0)',
      secondary: 'oklch(0.25 0 0)',
      secondaryForeground: 'oklch(0.9 0 0)',
      muted: 'oklch(0.25 0 0)',
      mutedForeground: 'oklch(0.65 0 0)',
      accent: 'oklch(0.28 0 0)',
      accentForeground: 'oklch(0.9 0 0)',
      destructive: 'oklch(0.7 0.19 22)',
      destructiveForeground: 'oklch(0.9 0 0)',
      border: 'oklch(0.25 0 0)',
      input: 'oklch(0.22 0 0)',
      ring: 'oklch(0.65 0.15 200)'
    },
    features: {
      glassmorphism: false,
      animations: true,
      gradients: false
    }
  },
  
  advanced: {
    id: 'advanced',
    name: 'Advanced Theme',
    description: 'Modern glassmorphism with gradients and effects',
    colors: {
      background: 'oklch(0.15 0.02 240)',
      foreground: 'oklch(0.95 0 0)',
      card: 'rgba(255, 255, 255, 0.1)',
      cardForeground: 'oklch(0.95 0 0)',
      popover: 'rgba(255, 255, 255, 0.15)',
      popoverForeground: 'oklch(0.95 0 0)',
      primary: 'oklch(0.75 0.2 340)',
      primaryForeground: 'oklch(0.95 0 0)',
      secondary: 'rgba(255, 255, 255, 0.2)',
      secondaryForeground: 'oklch(0.95 0 0)',
      muted: 'rgba(255, 255, 255, 0.1)',
      mutedForeground: 'oklch(0.7 0 0)',
      accent: 'rgba(255, 255, 255, 0.15)',
      accentForeground: 'oklch(0.95 0 0)',
      destructive: 'oklch(0.65 0.25 15)',
      destructiveForeground: 'oklch(0.95 0 0)',
      border: 'rgba(255, 255, 255, 0.2)',
      input: 'rgba(255, 255, 255, 0.15)',
      ring: 'oklch(0.75 0.2 340)',
      gradient: 'linear-gradient(135deg, rgba(30,30,50,0.95), rgba(20,40,70,0.95))',
      glassBg: 'rgba(255, 255, 255, 0.1)',
      glassBlur: 'blur(20px)'
    },
    features: {
      glassmorphism: true,
      animations: true,
      gradients: true
    }
  }
};

const DEFAULT_CONFIG: ThemePluginConfig = {
  enabled: true,
  activeTheme: 'light',
  availableThemes: ['light', 'dark', 'advanced'],
  persistUserChoice: true,
  autoApplySystemTheme: false
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ 
  children: ReactNode;
  initialConfig?: Partial<ThemePluginConfig>;
}> = ({ children, initialConfig }) => {
  const [pluginConfig, setPluginConfig] = useState<ThemePluginConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig
  });
  
  const [currentTheme, setCurrentTheme] = useState<ThemeType>(pluginConfig.activeTheme);

  // Load theme from config first, then localStorage
  useEffect(() => {
    if (initialConfig) {
      setPluginConfig(prev => ({ ...prev, ...initialConfig }));
      if (initialConfig.activeTheme) {
        setCurrentTheme(initialConfig.activeTheme);
      }
    } else {
      // Load configuration from runtime plugin state (not static config)
      const loadServerConfig = async () => {
        try {
          const response = await fetch('/api/plugins/getState');
          if (response.ok) {
            const pluginState = await response.json();
            if (pluginState.themes) {
              setPluginConfig(prev => ({ ...prev, ...pluginState.themes }));
              if (pluginState.themes.activeTheme) {
                setCurrentTheme(pluginState.themes.activeTheme);
              }
            }
          }
        } catch (error) {
          console.warn('Failed to load plugin state for themes:', error);
        }
      };
      loadServerConfig();
      
      // Set up polling to detect server state changes
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch('/api/plugins/getState');
          if (response.ok) {
            const pluginState = await response.json();
            const serverEnabled = pluginState.themes?.enabled ?? true;
            
            if (serverEnabled !== pluginConfig.enabled) {
              console.log(`🔄 Server state changed: themes enabled = ${serverEnabled}`);
              setPluginConfig(prev => ({ ...prev, enabled: serverEnabled }));
            }
          }
        } catch (error) {
          console.warn('Failed to poll plugin state:', error);
        }
      }, 3000); // Poll every 3 seconds (increased from 2s to give more time for sync)
      
      return () => clearInterval(pollInterval);
    }
  }, [initialConfig, pluginConfig.enabled]);

  // Load theme from localStorage on mount (only if not overridden by config)
  useEffect(() => {
    if (pluginConfig.enabled && pluginConfig.persistUserChoice && !initialConfig?.activeTheme) {
      try {
        const savedTheme = localStorage.getItem('claude-router-theme-plugin');
        if (savedTheme) {
          const parsedData = JSON.parse(savedTheme);
          if (parsedData.activeTheme && pluginConfig.availableThemes.includes(parsedData.activeTheme)) {
            setCurrentTheme(parsedData.activeTheme);
          }
          if (parsedData.config) {
            setPluginConfig(prev => ({ ...prev, ...parsedData.config }));
          }
        }
      } catch (error) {
        console.warn('Failed to load theme plugin data from localStorage:', error);
      }
    }
  }, [initialConfig?.activeTheme]); // FIXED: Remove pluginConfig.persistUserChoice to prevent infinite loop

  // Apply theme to document element
  useEffect(() => {
    const documentElement = document.documentElement;
    
    console.log(`🔌 ThemeProvider useEffect triggered - pluginEnabled: ${pluginConfig.enabled}, currentTheme: ${currentTheme}`);
    
    if (!pluginConfig.enabled) {
      // COMPREHENSIVE CLEANUP when plugin is disabled
      documentElement.classList.remove('theme-light', 'theme-dark', 'theme-advanced');
      documentElement.classList.remove('themes-plugin-active');
      documentElement.classList.remove('dark');
      
      // Remove ALL theme CSS custom properties
      const themeProperties = [
        '--background', '--foreground', '--card', '--card-foreground',
        '--popover', '--popover-foreground', '--primary', '--primary-foreground',
        '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
        '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
        '--border', '--input', '--ring', '--gradient', '--glass-bg', '--glass-blur'
      ];
      
      themeProperties.forEach(property => {
        documentElement.style.removeProperty(property);
      });
      
      // Remove plugin CSS files completely
      const pluginStyles = document.querySelectorAll('link[data-themes-plugin="true"]');
      pluginStyles.forEach(style => {
        console.log(`🧹 Removing plugin CSS: ${style.getAttribute('href')}`);
        style.remove();
      });
      
      // Reset to system default classes
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isSystemDark) {
        documentElement.classList.add('dark');
      }
      
      console.log('🔄 Themes plugin disabled - reverted to system defaults');
      return;
    }

    // Load plugin CSS when enabled
    const loadPluginCSS = () => {
      const cssFiles = [
        '/plugins/themes/styles/themes.css',
        '/plugins/themes/styles/variables.css', 
        '/plugins/themes/styles/modern-effects.css',
        '/plugins/themes/styles/components.css'
      ];
      
      cssFiles.forEach(cssFile => {
        if (!document.querySelector(`link[href="${cssFile}"]`)) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = cssFile;
          link.setAttribute('data-themes-plugin', 'true');
          document.head.appendChild(link);
          console.log(`✅ Loaded plugin CSS: ${cssFile}`);
        }
      });
    };

    // Load CSS first, then apply theme
    loadPluginCSS();

    const theme = THEME_DEFINITIONS[currentTheme];
    
    // Remove all theme classes
    documentElement.classList.remove('theme-light', 'theme-dark', 'theme-advanced');
    
    // Add new theme class
    documentElement.classList.add(`theme-${currentTheme}`);
    
    // Add plugin active indicator for CSS layout override
    documentElement.classList.add('themes-plugin-active');
    
    
    // Apply layout classes for navigation
    applyLayoutClasses();

    // Unify with TailwindCSS dark mode
    if (currentTheme === 'dark' || currentTheme === 'advanced') {
      documentElement.classList.add('dark');
    } else {
      documentElement.classList.remove('dark');
    }
    
    // COMPREHENSIVE CLEANUP: Remove ALL possible theme properties first
    const allThemeProperties = [
      '--background', '--foreground', '--card', '--card-foreground',
      '--popover', '--popover-foreground', '--primary', '--primary-foreground',
      '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
      '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
      '--border', '--input', '--ring', '--gradient', '--glass-bg', '--glass-blur'
    ];
    
    allThemeProperties.forEach(property => {
      documentElement.style.removeProperty(property);
    });
    
    console.log(`🧹 Cleared all theme properties before applying ${currentTheme} theme`);
    
    // Apply CSS custom properties for current theme
    Object.entries(theme.colors).forEach(([property, value]) => {
      if (value && typeof value === 'string') {
        const cssProperty = `--${property.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
        documentElement.style.setProperty(cssProperty, value);
        console.log(`✅ Applied ${cssProperty}: ${value}`);
      }
    });

    // Save to localStorage
    if (pluginConfig.persistUserChoice) {
      try {
        localStorage.setItem('claude-router-theme-plugin', JSON.stringify({
          activeTheme: currentTheme,
          config: pluginConfig
        }));
      } catch (error) {
        console.warn('Failed to save theme plugin data to localStorage:', error);
      }
    }
  }, [currentTheme, pluginConfig.enabled]); // FIXED: Remove full pluginConfig to prevent infinite loop

  // Auto-apply system theme
  useEffect(() => {
    if (pluginConfig.autoApplySystemTheme && pluginConfig.enabled) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setCurrentTheme(e.matches ? 'dark' : 'light');
      };
      
      // Set initial theme
      setCurrentTheme(mediaQuery.matches ? 'dark' : 'light');
      
      // Listen for changes
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [pluginConfig.autoApplySystemTheme, pluginConfig.enabled]);

  // Listen for plugin state changes from PluginContext
  useEffect(() => {
    const handlePluginStateChange = (event: CustomEvent) => {
      const { id, enabled } = event.detail;
      if (id === 'themes') {
        console.log('🔌 Received plugin state change from PluginContext:', enabled);
        if (pluginConfig.enabled !== enabled) {
          togglePlugin(enabled);
        }
      }
    };

    window.addEventListener('plugin-state-changed', handlePluginStateChange as EventListener);
    return () => window.removeEventListener('plugin-state-changed', handlePluginStateChange as EventListener);
  }, [pluginConfig.enabled]);

  const setTheme = (theme: ThemeType) => {
    if (pluginConfig.availableThemes.includes(theme)) {
      setCurrentTheme(theme);
      const newConfig = { ...pluginConfig, activeTheme: theme };
      setPluginConfig(newConfig);
      
      // Sync to server - fire and forget
      syncConfigToServer(newConfig);
    }
  };

  const isPluginEnabled = () => pluginConfig.enabled;

  const togglePlugin = async (enabled: boolean) => {
    const newConfig = { ...pluginConfig, enabled };
    setPluginConfig(newConfig);
    
    // Sync to server IMMEDIATELY to prevent race condition with polling
    await syncConfigToServer(newConfig);
    
    if (!enabled) {
      // COMPREHENSIVE CLEANUP when disabled
      const documentElement = document.documentElement;
      
      // Remove all theme classes
      documentElement.classList.remove('theme-light', 'theme-dark', 'theme-advanced');
      documentElement.classList.remove('themes-plugin-active');
      documentElement.classList.remove('dark');
      
      // Remove ALL theme CSS custom properties
      const themeProperties = [
        '--background', '--foreground', '--card', '--card-foreground',
        '--popover', '--popover-foreground', '--primary', '--primary-foreground',
        '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
        '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
        '--border', '--input', '--ring', '--gradient', '--glass-bg', '--glass-blur'
      ];
      
      themeProperties.forEach(property => {
        documentElement.style.removeProperty(property);
      });
      
      // REMOVE PLUGIN CSS FILES COMPLETELY
      const pluginStyles = document.querySelectorAll('link[data-themes-plugin="true"]');
      pluginStyles.forEach(style => {
        console.log(`🧹 Completely removing plugin CSS: ${style.getAttribute('href')}`);
        style.remove();
      });
      
      // Also remove any injected style elements
      const pluginStyleTags = document.querySelectorAll('style[data-themes-plugin="true"]');
      pluginStyleTags.forEach(style => style.remove());
      
      // Reset to system default
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isSystemDark) {
        documentElement.classList.add('dark');
      }
      
      console.log('🧹 Themes plugin completely disabled - CSS removed, reverted to system defaults');
    } else {
      // Re-apply current theme when enabled
      console.log('🎨 Themes plugin re-enabled, CSS will be loaded and theme applied:', currentTheme);
    }
  };

  const syncConfigToServer = async (config: ThemePluginConfig) => {
    try {
      // Update runtime plugin state (not static config)
      await fetch('/api/plugins/setState', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId: 'themes', enabled: config.enabled })
      });
    } catch (error) {
      console.warn('Failed to sync theme config to server:', error);
    }
  };
  
  
  const applyLayoutClasses = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    // Apply nav-tabs class to tab containers
    const tabContainers = document.querySelectorAll('[role="tablist"], .tabs-container, [data-tabs]');
    tabContainers.forEach(container => {
      container.classList.add('nav-tabs');
      if (currentTheme !== 'advanced') {
        container.classList.add('modern-tab-container');
      }
    });
    
    // Apply nav-tab class to individual tabs
    const tabs = document.querySelectorAll('[role="tab"], .tab, [data-tab]');
    tabs.forEach(tab => {
      tab.classList.add('nav-tab');
      if (currentTheme !== 'advanced') {
        tab.classList.add('modern-tab');
      }
    });
    
  };

  // Watch for analytics attribute and dynamically add/remove Mission Control tab
  useEffect(() => {
    const missionControlManager = (analyticsEnabled: boolean) => {
      const tabContainer = document.querySelector('[role="tablist"], .nav-tabs');
      if (!tabContainer) return;

      const existingTab = document.querySelector('.mission-control-tab, [data-tab="mission-control"]');

      if (analyticsEnabled && !existingTab) {
        const missionControlTab = document.createElement('button');
        missionControlTab.className = 'nav-tab mission-control-tab';
        missionControlTab.setAttribute('data-tab', 'mission-control');
        missionControlTab.textContent = '🎯 Mission Control';
        missionControlTab.addEventListener('click', () => {
          const event = new CustomEvent('navigate-mission-control');
          document.dispatchEvent(event);
        });
        tabContainer.appendChild(missionControlTab);
      } else if (!analyticsEnabled && existingTab) {
        existingTab.remove();
      }
    };

    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-analytics') {
          const analyticsEnabled = document.documentElement.hasAttribute('data-analytics');
          missionControlManager(analyticsEnabled);
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    // Initial check
    missionControlManager(document.documentElement.hasAttribute('data-analytics'));

    return () => observer.disconnect();
  }, []);

  const value: ThemeContextType = {
    currentTheme,
    themes: THEME_DEFINITIONS,
    pluginConfig,
    setTheme,
    isPluginEnabled,
    togglePlugin
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider from the themes plugin');
  }
  return context;
};

export default ThemeContext;