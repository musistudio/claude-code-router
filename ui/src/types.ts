export interface RouteConfig {
  path: string;
  provider: string;
}

export interface ProviderTransformer {
  use: (string | (string | Record<string, unknown> | { max_tokens: number })[])[];
  [key: string]: any; // Allow for model-specific transformers
}

export interface Provider {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer?: ProviderTransformer;
  useCustomProvider?: boolean;
  priority?: number;
  description?: string;
}

export interface RouterConfig {
    default: string;
    background: string;
    think: string;
    longContext: string;
    longContextThreshold: number;
    webSearch: string;
    image?: string;
    custom?: any;
}

export interface Transformer {
    name?: string;
    path: string;
    options?: Record<string, any>;
}

export interface StatusLineModuleConfig {
  type: string;
  icon?: string;
  text: string;
  color?: string;
  background?: string;
  scriptPath?: string; // 用于script类型的模块，指定要执行的Node.js脚本文件路径
}

export interface StatusLineThemeConfig {
  modules: StatusLineModuleConfig[];
}

export interface StatusLineConfig {
  enabled: boolean;
  currentStyle: string;
  default: StatusLineThemeConfig;
  powerline: StatusLineThemeConfig;
  fontFamily?: string;
}

export interface PluginsConfig {
  themes?: {
    enabled: boolean;
    activeTheme: 'light' | 'dark' | 'advanced';
    availableThemes: ('light' | 'dark' | 'advanced')[];
    persistUserChoice?: boolean;
    autoApplySystemTheme?: boolean;
  };
}

export interface Config {
  Providers: Provider[];
  Router: RouterConfig;
  transformers: Transformer[];
  StatusLine?: StatusLineConfig;
  plugins?: PluginsConfig;
  // Top-level settings
  LOG: boolean;
  LOG_LEVEL: string;
  CLAUDE_PATH: string;
  HOST: string;
  PORT: number;
  APIKEY: string;
  API_TIMEOUT_MS: string;
  PROXY_URL: string;
  CUSTOM_ROUTER_PATH?: string;
  forceUseImageAgent?: boolean;
}

export type AccessLevel = 'restricted' | 'full';

// Plugin UI Registry Types
export interface PluginUIRegistry {
  headerButtons: Array<React.ComponentType>;
}

// Extend Window interface
declare global {
  interface Window {
    __PLUGIN_UI_REGISTRY__?: PluginUIRegistry;
  }
}
