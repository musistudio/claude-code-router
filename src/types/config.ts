export interface TransformerConfig {
  use: string[] | Array<string | [string, any]>;
  [key: string]: any;
}

export interface Provider {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer?: TransformerConfig;
  disabled?: boolean;
  autoApprove?: string[];
}

export interface RouterConfig {
  default: string;
  background?: string;
  think?: string;
  longContext?: string;
  fallback?: string;
}

export interface CustomTransformer {
  path: string;
  options?: Record<string, any>;
}

export interface AppConfig {
  LOG?: boolean;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  Providers?: Provider[];
  providers?: Provider[]; // backward compatibility
  Router?: RouterConfig;
  transformers?: CustomTransformer[];
  log?: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}