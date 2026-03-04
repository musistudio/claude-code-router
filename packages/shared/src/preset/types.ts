/**
 * Type definitions for preset functionality
 */

// Collection of user input values
export interface UserInputValues {
  [inputId: string]: any;
}

// Input type enumeration
export enum InputType {
  PASSWORD = 'password',         // Password input (hidden)
  INPUT = 'input',               // Text input
  SELECT = 'select',             // Single selection
  MULTISELECT = 'multiselect',   // Multiple selection
  CONFIRM = 'confirm',           // Confirmation checkbox
  EDITOR = 'editor',             // Multi-line text editor
  NUMBER = 'number',             // Number input
}

// Option definition
export interface InputOption {
  label: string;                 // Display text
  value: string | number | boolean; // Actual value
  description?: string;          // Option description
  disabled?: boolean;            // Whether disabled
  icon?: string;                 // Icon
}

// Dynamic option source
export interface DynamicOptions {
  type: 'static' | 'providers' | 'models' | 'custom';
  // static: Use fixed options array
  // providers: Dynamically retrieve from Providers configuration
  // models: Retrieve from specified provider's models
  // custom: Custom function (reserved, not implemented yet)

  // Used when type is 'static'
  options?: InputOption[];

  // Used when type is 'providers'
  // Automatically extract name and related configuration from preset's Providers

  // Used when type is 'models'
  providerField?: string;        // Point to provider selector field path (e.g. "#{selectedProvider}")

  // Used when type is 'custom' (reserved)
  source?: string;               // Custom data source
}

// Conditional expression
export interface Condition {
  field: string;                 // Dependent field path
  operator?: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists';
  value?: any;                   // Comparison value
  // eq: equals
  // ne: not equals
  // in: included in (array)
  // nin: not included in (array)
  // gt: greater than
  // lt: less than
  // gte: greater than or equal to
  // lte: less than or equal to
  // exists: field exists (doesn't check value)
}

// Complex field input configuration
export interface RequiredInput {
  id: string;                    // Unique identifier (for variable reference)
  type?: InputType;              // Input type, defaults to password
  label?: string;                // Display label
  prompt?: string;               // Prompt information/description
  placeholder?: string;          // Placeholder

  // Option configuration (for select/multiselect)
  options?: InputOption[] | DynamicOptions;

  // Conditional display
  when?: Condition | Condition[]; // Show this field only when conditions are met (supports AND/OR logic)

  // Default value
  defaultValue?: any;

  // Validation rules
  required?: boolean;            // Whether required, defaults to true
  validator?: RegExp | string | ((value: any) => boolean | string);

  // UI configuration
  min?: number;                  // Minimum value (for number)
  max?: number;                  // Maximum value (for number)
  rows?: number;                 // Number of rows (for editor)

  // Advanced configuration
  dependsOn?: string[];          // Explicitly declare dependent fields (for optimizing update order)
}

// Provider configuration
export interface ProviderConfig {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer?: any;
  [key: string]: any;
}

// Router configuration
export interface RouterConfig {
  default?: string;
  background?: string;
  think?: string;
  longContext?: string;
  longContextThreshold?: number;
  webSearch?: string;
  image?: string;
  [key: string]: string | number | undefined;
}

// Transformer configuration
export interface TransformerConfig {
  path?: string;
  use: Array<string | [string, any]>;
  options?: any;
  [key: string]: any;
}

// Preset metadata (flattened structure, for manifest.json)
export interface PresetMetadata {
  name: string;                   // Preset name
  version: string;                // Version number (semver)
  description?: string;           // Description
  author?: string;                // Author
  homepage?: string;              // Homepage
  repository?: string;            // Source repository
  license?: string;               // License
  keywords?: string[];            // Keywords
  ccrVersion?: string;            // Compatible CCR version
  source?: string;                // Preset source URL
  sourceType?: 'local' | 'gist' | 'registry';
  checksum?: string;              // Preset content checksum
}

// Preset configuration section
export interface PresetConfigSection {
  Providers?: ProviderConfig[];
  Router?: RouterConfig;
  transformers?: TransformerConfig[];
  StatusLine?: any;
  NON_INTERACTIVE_MODE?: boolean;

  // CLI-only fields (not used by server)
  noServer?: boolean;                // CLI: Whether to skip local server startup and use provider's API directly
  claudeCodeSettings?: {             // CLI: Claude Code specific settings
    env?: Record<string, any>;       // CLI: Environment variables to pass to Claude Code
    statusLine?: any;                // CLI: Status line configuration
    [key: string]: any;
  };

  [key: string]: any;
}

// Template configuration (for dynamically generating configuration based on user input)
export interface TemplateConfig {
  // Template configuration using #{variable} syntax (different from statusline's {{variable}} format)
  // Example: { "Providers": [{ "name": "#{providerName}", "api_key": "#{apiKey}" }] }
  [key: string]: any;
}

// Configuration mapping (maps user input values to specific configuration locations)
export interface ConfigMapping {
  // Field path (supports array syntax, e.g. "Providers[0].api_key")
  target: string;

  // Value source (references user input id, or uses fixed value)
  value: string | any;  // If string and starts with #, treated as variable reference (e.g. #{fieldId})

  // Condition (optional, apply this mapping only when condition is met)
  when?: Condition | Condition[];
}

// Complete preset file format
export interface PresetFile {
  metadata?: PresetMetadata;
  config: PresetConfigSection;
  secrets?: {
    // Sensitive information storage, format: field path -> value
    // Example: { "Providers[0].api_key": "sk-xxx", "APIKEY": "my-secret" }
    [fieldPath: string]: string;
  };

  // === Dynamic configuration system ===
  // Configuration input schema
  schema?: RequiredInput[];

  // Configuration template (uses variable replacement)
  template?: TemplateConfig;

  // Configuration mappings (maps user input to configuration)
  configMappings?: ConfigMapping[];
}

// manifest.json format (file inside ZIP archive)
export interface ManifestFile extends PresetMetadata, PresetConfigSection {
  // === Dynamic configuration system ===
  schema?: RequiredInput[];
  template?: TemplateConfig;
  configMappings?: ConfigMapping[];

  // === User configuration value storage ===
  // User-filled configuration values are stored separately from original configuration
  // Values collected during installation are stored here, applied at runtime
  userValues?: UserInputValues;
}

// Online preset index entry
export interface PresetIndexEntry {
  id: string;                     // Unique identifier
  name: string;                   // Display name
  description?: string;           // Short description
  version: string;                // Latest version
  author?: string;                // Author
  downloads?: number;             // Download count
  stars?: number;                 // Star count
  tags?: string[];                // Tags
  url: string;                    // Download address
  repo?: string;                  // Repository (e.g., 'owner/repo')
  checksum?: string;              // SHA256 checksum
  ccrVersion?: string;            // Compatible version
}

// Online preset repository index
export interface PresetRegistry {
  version: string;                // Index format version
  lastUpdated: string;            // Last update time
  presets: PresetIndexEntry[];
}

// Configuration validation result
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Merge strategy enumeration
export enum MergeStrategy {
  ASK = 'ask',                    // Interactive prompt
  OVERWRITE = 'overwrite',        // Overwrite existing
  MERGE = 'merge',                // Intelligent merge
  SKIP = 'skip',                  // Skip conflicting items
}

// Sanitization result
export interface SanitizeResult {
  sanitizedConfig: any;
  sanitizedCount: number;
}

// Preset information (for list display)
export interface PresetInfo {
  name: string;                   // Preset name
  version?: string;               // Version number
  description?: string;           // Description
  author?: string;                // Author
  config: PresetConfigSection;
}

// Route group configuration collection
export interface RouteGroupsConfig {
  activeGroup: string;
  groups: Record<string, RouterConfig>;
}