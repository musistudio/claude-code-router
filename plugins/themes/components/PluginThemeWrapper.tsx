import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ThemeProvider } from '../contexts/ThemeContext';

interface PluginThemeWrapperProps {
  children: ReactNode;
}

/**
 * Self-managing Theme Plugin Wrapper
 * Only loads when theme plugin is enabled
 */
export function PluginThemeWrapper({ children }: PluginThemeWrapperProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkPluginStatus = async () => {
      try {
        // Check runtime plugin state first (authoritative during session)
        const response = await fetch('/api/plugins/getState');
        if (response.ok) {
          const state = await response.json();
          const enabled = state.themes?.enabled === true;
          setIsEnabled(enabled);
        } else {
          // Fallback to localStorage
          const enabled = localStorage.getItem('themes-enabled') === 'true';
          setIsEnabled(enabled);
        }
      } catch (error) {
        // Default disabled
        setIsEnabled(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkPluginStatus();

    // Listen for plugin state changes
    const handlePluginChange = (event: CustomEvent) => {
      const { enabled } = event.detail;
      setIsEnabled(enabled);
    };

    // Listen for the correct event from PluginManager
    window.addEventListener('plugin-themes-toggled', handlePluginChange as EventListener);
    return () => window.removeEventListener('plugin-themes-toggled', handlePluginChange as EventListener);
  }, []);

  if (isLoading) {
    return <>{children}</>;
  }

  if (isEnabled) {
    return <ThemeProvider>{children}</ThemeProvider>;
  }

  // Plugin disabled - return children without wrapper
  return <>{children}</>;
}

// Export for external use when theme plugin is needed
export { ThemeProvider } from '../contexts/ThemeContext';
