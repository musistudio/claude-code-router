import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { api } from '@/lib/api';
import type { Config } from '@/types';

interface ConfigContextType {
  config: Config | null;
  setConfig: Dispatch<SetStateAction<Config | null>>;
  error: Error | null;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [hasFetched, setHasFetched] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string | null>(localStorage.getItem('apiKey'));

  // Listen for localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      setApiKey(localStorage.getItem('apiKey'));
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const fetchConfig = async () => {
      // Reset fetch state when API key changes
      setHasFetched(false);
      setConfig(null);
      setError(null);
    };

    fetchConfig();
  }, [apiKey]);

  useEffect(() => {
    const fetchConfig = async () => {
      // Prevent duplicate API calls in React StrictMode
      // Skip if we've already fetched
      if (hasFetched) {
        return;
      }
      setHasFetched(true);
      
      try {
        // Try to fetch config regardless of API key presence
        const data = await api.getConfig();
        
        // Start with the original data to preserve all fields
        const validConfig = { ...data };
        
        // Validate and set defaults for known fields
        validConfig.LOG = typeof data.LOG === 'boolean' ? data.LOG : false;
        validConfig.LOG_LEVEL = typeof data.LOG_LEVEL === 'string' ? data.LOG_LEVEL : 'debug';
        validConfig.CLAUDE_PATH = typeof data.CLAUDE_PATH === 'string' ? data.CLAUDE_PATH : '';
        validConfig.HOST = typeof data.HOST === 'string' ? data.HOST : '127.0.0.1';
        validConfig.PORT = typeof data.PORT === 'number' ? data.PORT : 3456;
        validConfig.APIKEY = typeof data.APIKEY === 'string' ? data.APIKEY : '';
        validConfig.API_TIMEOUT_MS = typeof data.API_TIMEOUT_MS === 'string' ? data.API_TIMEOUT_MS : '600000';
        validConfig.PROXY_URL = typeof data.PROXY_URL === 'string' ? data.PROXY_URL : '';
        validConfig.transformers = Array.isArray(data.transformers) ? data.transformers : [];
        validConfig.Providers = Array.isArray(data.Providers) ? data.Providers : [];
        
        // Preserve CUSTOM_ROUTER_PATH if it exists
        if (typeof data.CUSTOM_ROUTER_PATH === 'string') {
          validConfig.CUSTOM_ROUTER_PATH = data.CUSTOM_ROUTER_PATH;
        }
        
        // Preserve NON_INTERACTIVE_MODE if it exists
        if (typeof data.NON_INTERACTIVE_MODE === 'boolean') {
          validConfig.NON_INTERACTIVE_MODE = data.NON_INTERACTIVE_MODE;
        }
        
        validConfig.StatusLine = data.StatusLine && typeof data.StatusLine === 'object' ? {
          enabled: typeof data.StatusLine.enabled === 'boolean' ? data.StatusLine.enabled : false,
          currentStyle: typeof data.StatusLine.currentStyle === 'string' ? data.StatusLine.currentStyle : 'default',
          default: data.StatusLine.default && typeof data.StatusLine.default === 'object' && Array.isArray(data.StatusLine.default.modules) ? data.StatusLine.default : { modules: [] },
          powerline: data.StatusLine.powerline && typeof data.StatusLine.powerline === 'object' && Array.isArray(data.StatusLine.powerline.modules) ? data.StatusLine.powerline : { modules: [] }
        } : undefined;
        
        validConfig.Router = data.Router && typeof data.Router === 'object' ? {
          default: typeof data.Router.default === 'string' ? data.Router.default : '',
          background: typeof data.Router.background === 'string' ? data.Router.background : '',
          think: typeof data.Router.think === 'string' ? data.Router.think : '',
          longContext: typeof data.Router.longContext === 'string' ? data.Router.longContext : '',
          longContextThreshold: typeof data.Router.longContextThreshold === 'number' ? data.Router.longContextThreshold : 60000,
          webSearch: typeof data.Router.webSearch === 'string' ? data.Router.webSearch : ''
        } : {
          default: '',
          background: '',
          think: '',
          longContext: '',
          longContextThreshold: 60000,
          webSearch: ''
        };
        
        setConfig(validConfig);
      } catch (err) {
        console.error('Failed to fetch config:', err);
        // If we get a 401, the API client will redirect to login
        // Otherwise, set an empty config or error
        if ((err as Error).message !== 'Unauthorized') {
          // Set default empty config when fetch fails
          setConfig({
            LOG: false,
            LOG_LEVEL: 'debug',
            CLAUDE_PATH: '',
            HOST: '127.0.0.1',
            PORT: 3456,
            APIKEY: '',
            API_TIMEOUT_MS: '600000',
            PROXY_URL: '',
            transformers: [],
            Providers: [],
            StatusLine: undefined,
            Router: {
              default: '',
              background: '',
              think: '',
              longContext: '',
              longContextThreshold: 60000,
              webSearch: ''
            }
          });
          setError(err as Error);
        }
      }
    };

    fetchConfig();
  }, [hasFetched, apiKey]);

  return (
    <ConfigContext.Provider value={{ config, setConfig, error }}>
      {children}
    </ConfigContext.Provider>
  );
}
