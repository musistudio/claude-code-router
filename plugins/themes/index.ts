/**
 * Themes Plugin - Main Entry Point
 * Unified theme system with 3 themes: Light, Dark, Advanced
 */

import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import ThemeSelector from './components/ThemeSelector';
import type {
  ThemeType,
  ThemePluginConfig,
  ThemePluginAPI,
  ThemeDefinition
} from './types';// Export components for external use
export { ThemeProvider, useTheme, ThemeSelector };
export type { ThemeType, ThemePluginConfig, ThemeDefinition };

// Default configuration
export const DEFAULT_THEME_CONFIG: ThemePluginConfig = {
  enabled: true,
  activeTheme: 'light',
  availableThemes: ['light', 'dark', 'advanced'],
  persistUserChoice: true,
  autoApplySystemTheme: false,
  // Enhanced UI Experience settings
  enableEnhancedUIExperience: false,
  autoEnableAnalytics: true,
  autoEnableDashboard: true
};

/**
 * Plugin API Implementation
 */
class ThemesPluginAPI implements ThemePluginAPI {
  readonly name = 'themes' as const;
  readonly version = '1.0.0' as const;
  
  private isRegistered = false;
  private currentConfig: ThemePluginConfig = { ...DEFAULT_THEME_CONFIG };
  
  /**
   * Register the plugin - loads CSS and initializes
   */
  register(): void {
    if (this.isRegistered) {
      console.warn('Themes plugin is already registered');
      return;
    }
    
    try {
      // Load plugin CSS
      this.loadPluginStyles();
      
      // Apply initial theme
      this.applyThemeToDocument();
      
      // Mark as registered
      this.isRegistered = true;
      
      // Expose global API (browser only)
      if (typeof window !== 'undefined') {
        window.__THEMES_PLUGIN__ = this;
      }
      
      console.log(`✅ Themes Plugin v${this.version} registered successfully`);
    } catch (error) {
      console.error('Failed to register themes plugin:', error);
      throw error;
    }
  }
  
  /**
   * Unregister the plugin - cleanup
   */
  unregister(): void {
    if (!this.isRegistered) return;
    
    try {
      // Remove theme classes
      this.removeThemeClasses();
      
      // Remove plugin styles
      this.removePluginStyles();
      
      // Clean up global API (browser only)
      if (typeof window !== 'undefined') {
        delete window.__THEMES_PLUGIN__;
      }
      
      this.isRegistered = false;
      
      console.log('🔄 Themes Plugin unregistered');
    } catch (error) {
      console.error('Failed to unregister themes plugin:', error);
    }
  }
  
  /**
   * Get current plugin configuration
   */
  getConfig(): ThemePluginConfig {
    return { ...this.currentConfig };
  }
  
  /**
   * Update plugin configuration
   */
  setConfig(config: Partial<ThemePluginConfig>): void {
    this.currentConfig = {
      ...this.currentConfig,
      ...config
    };
    
    // Apply configuration changes
    if (this.isRegistered) {
      this.applyThemeToDocument();
    }
    
    // Save to localStorage if persistence is enabled (browser only)
    if (this.currentConfig.persistUserChoice && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('claude-router-theme-plugin', JSON.stringify({
          activeTheme: this.currentConfig.activeTheme,
          config: this.currentConfig
        }));
      } catch (error) {
        console.warn('Failed to save theme config to localStorage:', error);
      }
    }
  }
  
  /**
   * Set active theme
   */
  setTheme(theme: ThemeType): void {
    if (!this.currentConfig.availableThemes.includes(theme)) {
      console.warn(`Theme "${theme}" is not available in current configuration`);
      return;
    }
    
    const previousTheme = this.currentConfig.activeTheme;
    this.setConfig({ activeTheme: theme });
    
    // Theme change is handled by ThemeContext through layout enhancer
    if (previousTheme !== theme) {
      console.log(`🎨 Theme changed from ${previousTheme} to ${theme}`);
    }
  }
  
  /**
   * Get current active theme
   */
  getCurrentTheme(): ThemeType {
    return this.currentConfig.activeTheme;
  }
  
  /**
   * Get list of available themes
   */
  getAvailableThemes(): ThemeType[] {
    return [...this.currentConfig.availableThemes];
  }
  
  /**
   * Apply theme classes to a specific element (browser only)
   */
  applyToElement(element: HTMLElement): void {
    if (!this.isRegistered || !this.currentConfig.enabled) return;
    if (typeof window === 'undefined') return; // Skip in Node.js
    
    // Remove existing theme classes
    element.classList.remove('theme-light', 'theme-dark', 'theme-advanced');
    
    // Add current theme class
    element.classList.add(`theme-${this.currentConfig.activeTheme}`);
  }
  
  /**
   * Clean up theme classes and styles
   */
  cleanup(): void {
    this.removeThemeClasses();
    this.removePluginStyles();
    
    // ENHANCED: Remove dynamic CSS variables and force style recalculation
    if (typeof document !== 'undefined') {
      const rootStyles = document.documentElement.style;
      const propertiesToRemove: string[] = [];
      for (let i = 0; i < rootStyles.length; i++) {
        const property = rootStyles[i];
        if (property && (property.startsWith('--theme-') || property.startsWith('--themes-plugin-'))) {
          propertiesToRemove.push(property);
        }
      }
      propertiesToRemove.forEach(prop => rootStyles.removeProperty(prop));
      
      // Force style recalculation
      document.documentElement.offsetHeight;
    }
  }
  
  /**
   * Private: Load plugin CSS files (browser only)
   */
  private loadPluginStyles(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.log('Themes plugin: CSS loading skipped (Node.js environment)');
      return;
    }
    
    const cssFiles = [
      '/plugins/themes/styles/themes.css',
      '/plugins/themes/styles/variables.css',
      '/plugins/themes/styles/modern-effects.css',
      '/plugins/themes/styles/components.css',
      '/plugins/themes/styles/notifications.css',
      '/plugins/themes/styles/centered-layout.css'
    ];
    
    cssFiles.forEach((cssFile) => {
      // Check if already loaded
      if (document.querySelector(`link[href="${cssFile}"]`)) {
        return;
      }
      
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssFile;
      link.setAttribute('data-themes-plugin', 'true');
      document.head.appendChild(link);
      
      console.log(`✅ Themes plugin CSS loaded: ${cssFile}`);
    });
  }

  
  /**
   * Private: Remove plugin CSS files
   */
  private removePluginStyles(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.log('Themes plugin: CSS cleanup skipped (Node.js environment)');
      return;
    }
    
    const pluginStyles = document.querySelectorAll('link[data-themes-plugin="true"]');
    pluginStyles.forEach(style => {
      console.log(`🧹 Removing themes plugin CSS: ${style.getAttribute('href')}`);
      style.remove();
    });
    
    // Also remove any injected style elements
    const pluginStyleTags = document.querySelectorAll('style[data-themes-plugin="true"]');
    pluginStyleTags.forEach(style => style.remove());
    
    console.log('✅ All themes plugin CSS removed');
  }
  
  /**
   * Private: Apply theme to document (browser only)
   */
  private applyThemeToDocument(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.log('Themes plugin: Document theming skipped (Node.js environment)');
      return;
    }
    
    const documentElement = document.documentElement;
    
    // FIXED: Always remove theme classes first, regardless of enabled state
    this.removeThemeClasses();
    
    // Only apply theme if enabled
    if (this.currentConfig.enabled) {
      // Add current theme class
      documentElement.classList.add(`theme-${this.currentConfig.activeTheme}`);
      
      // Add plugin active indicator
      documentElement.classList.add('themes-plugin-active');
      
      // Check and set analytics status
      this.checkAnalyticsStatus();
    }
  }

  /**
   * Check if analytics plugin is enabled and update HTML attributes
   */
  private checkAnalyticsStatus(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    // Check for analytics plugin indicators
    const analyticsEnabled = 
      localStorage.getItem('analytics-enabled') === 'true' ||
      document.querySelector('[data-analytics="true"]') ||
      window.location.search.includes('analytics=true') ||
      // Check if Mission Control tab exists
      document.querySelector('[class*="mission-control"]') ||
      // Check for analytics plugin global
      (window as any).__ANALYTICS_PLUGIN__;

    if (analyticsEnabled) {
      document.documentElement.setAttribute('data-analytics', 'enabled');
      console.log('📊 Analytics detected - notifying analytics plugin');
      // Notify analytics plugin to show its button
      window.dispatchEvent(new CustomEvent('themes-plugin-analytics-enabled'));
    } else {
      document.documentElement.removeAttribute('data-analytics');
      // Notify analytics plugin to hide its button
      window.dispatchEvent(new CustomEvent('themes-plugin-analytics-disabled'));
    }
  }
  
  /**
   * Private: Remove all theme classes (browser only)
   */
  private removeThemeClasses(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    const documentElement = document.documentElement;
    documentElement.classList.remove(
      'theme-light', 
      'theme-dark', 
      'theme-advanced',
      'themes-plugin-active'
    );
  }
  
  /**
   * Initialize from localStorage (browser only)
   */
  private initializeFromStorage(): void {
    // Skip localStorage operations in Node.js environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      console.log('Themes plugin: localStorage not available (Node.js environment)');
      return;
    }
    
    try {
      const saved = localStorage.getItem('claude-router-theme-plugin');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.config) {
          this.currentConfig = { ...this.currentConfig, ...data.config };
        }
        if (data.activeTheme && this.currentConfig.availableThemes.includes(data.activeTheme)) {
          this.currentConfig.activeTheme = data.activeTheme;
        }
      }
    } catch (error) {
      console.warn('Failed to load theme config from localStorage:', error);
    }
  }

  /**
   * Enhanced UI Experience - Activează automat themes + analytics
   */
  enableEnhancedUIExperience(): void {
    console.log('🚀 Enabling Enhanced UI Experience...');
    
    // Activează themes plugin
    this.setConfig({ 
      enabled: true,
      enableEnhancedUIExperience: true 
    });
    
    // Activează analytics dacă este configurat
    if (this.currentConfig.autoEnableAnalytics) {
      this.enableAnalyticsPlugin();
    }
    
    // Activează dashboard dacă este configurat
    if (this.currentConfig.autoEnableDashboard) {
      this.enableDashboardFeatures();
    }
    
    console.log('✅ Enhanced UI Experience enabled successfully');
  }

  /**
   * Dezactivează Enhanced UI Experience
   */
  disableEnhancedUIExperience(): void {
    console.log('🔄 Disabling Enhanced UI Experience...');
    
    this.setConfig({ 
      enabled: false,
      enableEnhancedUIExperience: false 
    });
    
    console.log('✅ Enhanced UI Experience disabled');
  }

  /**
   * Activează analytics plugin prin configurație
   */
  private enableAnalyticsPlugin(): void {
    try {
      // Trimite cerere către server pentru a activa pluginul analytics
      fetch('/api/plugins/analytics/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source: 'themes-plugin' })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log('📊 Analytics plugin activation requested successfully');
          
          // Emit event pentru a semnala că analytics a fost activat în UI
          window.dispatchEvent(new CustomEvent('analytics-plugin-enabled', {
            detail: { source: 'themes-plugin' }
          }));
        } else {
          console.warn('Failed to enable analytics plugin:', data.error);
        }
      })
      .catch(error => {
        console.warn('Failed to enable analytics plugin:', error);
      });
    } catch (error) {
      console.warn('Failed to enable analytics plugin:', error);
    }
  }

  /**
   * Activează dashboard features
   */
  private enableDashboardFeatures(): void {
    try {
      // Emit event pentru a semnala că dashboard trebuie activat
      window.dispatchEvent(new CustomEvent('enable-dashboard-features', {
        detail: { 
          source: 'themes-plugin',
          features: ['missionControl', 'analytics', 'realTimeMetrics']
        }
      }));
      
      console.log('📈 Dashboard features activation requested');
    } catch (error) {
      console.warn('Failed to enable dashboard features:', error);
    }
  }

  /**
   * Check dacă Enhanced UI Experience este activ
   */
  isEnhancedUIExperienceEnabled(): boolean {
    return this.currentConfig.enabled && (this.currentConfig.enableEnhancedUIExperience || false);
  }

  /**
   * Enable analytics integration manually
   */
  enableAnalyticsIntegration(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('analytics-enabled', 'true');
      this.checkAnalyticsStatus();
      console.log('📊 Analytics integration enabled manually');
    }
  }

  /**
   * Disable analytics integration
   */
  disableAnalyticsIntegration(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('analytics-enabled');
      this.checkAnalyticsStatus();
      console.log('📊 Analytics integration disabled');
    }
  }
  
  constructor() {
    this.initializeFromStorage();
  }
}

// Create and export plugin instance
export const themesPlugin = new ThemesPluginAPI();

/**
 * Auto-register helper function
 */
export function initializeThemesPlugin(config?: Partial<ThemePluginConfig>): ThemesPluginAPI {
  if (config) {
    themesPlugin.setConfig(config);
  }
  
  if (typeof window !== 'undefined' && !window.__THEMES_PLUGIN__) {
    themesPlugin.register();
  }
  
  return themesPlugin;
}

/**
 * React Hook for using the themes plugin
 */
export function useThemesPlugin() {
  const plugin = (typeof window !== 'undefined' && window.__THEMES_PLUGIN__) || themesPlugin;
  
  return {
    setTheme: plugin.setTheme.bind(plugin),
    getCurrentTheme: plugin.getCurrentTheme.bind(plugin),
    getAvailableThemes: plugin.getAvailableThemes.bind(plugin),
    getConfig: plugin.getConfig.bind(plugin),
    setConfig: plugin.setConfig.bind(plugin),
    isEnabled: () => plugin.getConfig().enabled,
    // Enhanced UI Experience methods
    enableEnhancedUIExperience: plugin.enableEnhancedUIExperience.bind(plugin),
    disableEnhancedUIExperience: plugin.disableEnhancedUIExperience.bind(plugin),
    isEnhancedUIExperienceEnabled: plugin.isEnhancedUIExperienceEnabled.bind(plugin)
  };
}

// Default export for convenience
export default themesPlugin;