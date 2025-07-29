export interface Provider {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer?: {
    use: (string | [string, any])[];
    [modelName: string]: any;
  };
}

export interface RouterConfig {
  default: string;
  background: string;
  think: string;
  longContext: string;
  longContextThreshold: number;
  webSearch: string;
  [key: string]: string | number;
}

export interface Config {
  Providers: Provider[];
  Router: RouterConfig;
  APIKEY: string;
  HOST: string;
  API_TIMEOUT_MS: number;
  customRouter?: string;
}