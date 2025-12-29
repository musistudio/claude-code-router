import { RouterConfig, Provider } from '../utils/modelSelector';

/**
 * Route group configuration interface
 * Contains model configurations for various routing scenarios
 */
export interface RouteGroup {
  default: string;
  background?: string;
  think?: string;
  longContext?: string;
  longContextThreshold?: number;
  webSearch?: string;
  image?: string;
  [key: string]: string | number | undefined;
}

/**
 * Route group configuration collection
 */
export interface RouteGroupsConfig {
  activeGroup: string;
  groups: Record<string, RouteGroup>;
}

/**
 * Configuration validation result
 */
export interface ValidationResult {
  isValid: boolean;
  invalidConfigs: string[];
  cleanedConfigs: string[];
}

/**
 * Extended configuration interface with route group support
 */
export interface ExtendedConfig {
  Router: RouterConfig;
  RouteGroups?: RouteGroupsConfig;
  Providers: Provider[];
  [key: string]: any;
}

/**
 * Route group operation options
 */
export interface RouteGroupOptions {
  skipValidation?: boolean;
  skipBackup?: boolean;
}

/**
 * Route group switch options
 */
export interface SwitchGroupOptions {
  force?: boolean; // Force switch even with invalid configurations
  cleanInvalid?: boolean; // Auto clean invalid configurations
}