/**
 * Types for Themes Plugin
 * Unified theme system with 3 themes: Light, Dark, Advanced
 */

export type ThemeType = 'light' | 'dark' | 'advanced';

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  // Additional colors for advanced theme
  gradient?: string;
  glassBg?: string;
  glassBlur?: string;
}

export interface ThemeDefinition {
  id: ThemeType;
  name: string;
  description: string;
  colors: ThemeColors;
  features: {
    glassmorphism: boolean;
    animations: boolean;
    gradients: boolean;
  };
}

export interface ThemePluginConfig {
  enabled: boolean;
  activeTheme: ThemeType;
  availableThemes: ThemeType[];
  persistUserChoice: boolean;
  autoApplySystemTheme: boolean;
  customThemes?: Record<string, ThemeDefinition>;
  // Enhanced UI Experience - activează automat analytics și dashboard
  enableEnhancedUIExperience?: boolean;
  autoEnableAnalytics?: boolean;
  autoEnableDashboard?: boolean;
}

export interface ThemeContextType {
  currentTheme: ThemeType;
  themes: Record<ThemeType, ThemeDefinition>;
  pluginConfig: ThemePluginConfig;
  setTheme: (theme: ThemeType) => void;
  isPluginEnabled: () => boolean;
  togglePlugin: (enabled: boolean) => void;
}

export interface ThemePluginAPI {
  name: 'themes';
  version: '1.0.0';
  register: () => void;
  unregister: () => void;
  getConfig: () => ThemePluginConfig;
  setConfig: (config: Partial<ThemePluginConfig>) => void;
  setTheme: (theme: ThemeType) => void;
  getCurrentTheme: () => ThemeType;
  getAvailableThemes: () => ThemeType[];
  applyToElement: (element: HTMLElement) => void;
  cleanup: () => void;
  // Enhanced UI Experience methods
  enableEnhancedUIExperience: () => void;
  disableEnhancedUIExperience: () => void;
  isEnhancedUIExperienceEnabled: () => boolean;
}

// Extend the main Config interface to include plugins
declare global {
  interface Window {
    __THEMES_PLUGIN__?: ThemePluginAPI;
    LayoutTransformer?: any;
  }
}

export interface PluginsConfig {
  themes?: ThemePluginConfig;
  analytics?: {
    enabled: boolean;
    dashboardEnabled?: boolean;
    missionControlEnabled?: boolean;
  };
}

// This will be merged with the main Config interface
export interface ConfigWithPlugins {
  plugins?: PluginsConfig;
}