/**
 * Dynamic configuration Schema handler
 * Responsible for parsing and validating configuration schema, handling conditional logic and variable replacement
 */

import path from 'path';
import {
  RequiredInput,
  InputType,
  Condition,
  DynamicOptions,
  InputOption,
  ConfigMapping,
  TemplateConfig,
  PresetConfigSection,
  PresetFile,
  ManifestFile,
  UserInputValues,
} from './types';

/**
 * Parse field path (supports arrays and nesting)
 * Example: Providers[0].name => ['Providers', '0', 'name']
 */
export function parseFieldPath(path: string): string[] {
  const regex = /(\w+)|\[(\d+)\]/g;
  const parts: string[] = [];
  let match;

  while ((match = regex.exec(path)) !== null) {
    parts.push(match[1] || match[2]);
  }

  return parts;
}

/**
 * Get value from object by field path
 */
export function getValueByPath(obj: any, path: string): any {
  const parts = parseFieldPath(path);
  let current = obj;

  for (const part of parts) {
    if (current == null) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Set value in object by field path
 */
export function setValueByPath(obj: any, path: string, value: any): void {
  const parts = parseFieldPath(path);
  const lastKey = parts.pop()!;
  let current = obj;

  for (const part of parts) {
    if (!(part in current)) {
      // Determine if it's an array or object
      const nextPart = parts[parts.indexOf(part) + 1];
      if (nextPart && /^\d+$/.test(nextPart)) {
        current[part] = [];
      } else {
        current[part] = {};
      }
    }
    current = current[part];
  }

  current[lastKey] = value;
}

/**
 * Evaluate conditional expression
 */
export function evaluateCondition(
  condition: Condition,
  values: UserInputValues
): boolean {
  const actualValue = values[condition.field];

  // Handle exists operator
  if (condition.operator === 'exists') {
    return actualValue !== undefined && actualValue !== null;
  }

  // Handle in operator
  if (condition.operator === 'in') {
    return Array.isArray(condition.value) && condition.value.includes(actualValue);
  }

  // Handle nin operator
  if (condition.operator === 'nin') {
    return Array.isArray(condition.value) && !condition.value.includes(actualValue);
  }

  // Handle other operators
  switch (condition.operator) {
    case 'eq':
      return actualValue === condition.value;
    case 'ne':
      return actualValue !== condition.value;
    case 'gt':
      return actualValue > condition.value;
    case 'lt':
      return actualValue < condition.value;
    case 'gte':
      return actualValue >= condition.value;
    case 'lte':
      return actualValue <= condition.value;
    default:
      // Default to eq
      return actualValue === condition.value;
  }
}

/**
 * Evaluate multiple conditions (AND logic)
 */
export function evaluateConditions(
  conditions: Condition | Condition[],
  values: UserInputValues
): boolean {
  if (!conditions) {
    return true;
  }

  if (!Array.isArray(conditions)) {
    return evaluateCondition(conditions, values);
  }

  // If array, use AND logic (all conditions must be satisfied)
  return conditions.every(condition => evaluateCondition(condition, values));
}

/**
 * Determine if field should be displayed
 */
export function shouldShowField(
  field: RequiredInput,
  values: UserInputValues
): boolean {
  if (!field.when) {
    return true;
  }

  return evaluateConditions(field.when, values);
}

/**
 * Get dynamic options list
 */
export function getDynamicOptions(
  dynamicOptions: DynamicOptions,
  presetConfig: PresetConfigSection,
  values: UserInputValues
): InputOption[] {
  switch (dynamicOptions.type) {
    case 'static':
      return dynamicOptions.options || [];

    case 'providers': {
      // Extract options from preset's Providers
      const providers = presetConfig.Providers || [];
      return providers.map((p: any) => ({
        label: p.name || p.id || String(p),
        value: p.name || p.id || String(p),
        description: p.api_base_url,
      }));
    }

    case 'models': {
      // Extract from specified provider's models
      const providerField = dynamicOptions.providerField;
      if (!providerField) {
        return [];
      }

      // Parse provider reference (e.g. #{selectedProvider})
      const providerId = String(providerField).replace(/^#{(.+)}$/, '$1');
      const selectedProvider = values[providerId];

      if (!selectedProvider || !presetConfig.Providers) {
        return [];
      }

      // Find corresponding provider
      const provider = presetConfig.Providers.find(
        (p: any) => p.name === selectedProvider || p.id === selectedProvider
      );

      if (!provider || !provider.models) {
        return [];
      }

      return provider.models.map((model: string) => ({
        label: model,
        value: model,
      }));
    }

    case 'custom':
      // Reserved, not implemented yet
      return [];

    default:
      return [];
  }
}

/**
 * Resolve options (supports static and dynamic options)
 */
export function resolveOptions(
  field: RequiredInput,
  presetConfig: PresetConfigSection,
  values: UserInputValues
): InputOption[] {
  if (!field.options) {
    return [];
  }

  // Determine if static or dynamic options
  const options = field.options as any;

  if (Array.isArray(options)) {
    // Static options array
    return options as InputOption[];
  }

  if (options.type) {
    // Dynamic options
    return getDynamicOptions(options, presetConfig, values);
  }

  return [];
}

/**
 * Template variable replacement
 * Supports #{variable} syntax (different from statusline's {{variable}} format)
 */
export function replaceTemplateVariables(
  template: any,
  values: UserInputValues
): any {
  if (template === null || template === undefined) {
    return template;
  }

  // Handle strings
  if (typeof template === 'string') {
    return template.replace(/#{(\w+)}/g, (_, key) => {
      return values[key] !== undefined ? String(values[key]) : '';
    });
  }

  // Handle arrays
  if (Array.isArray(template)) {
    return template.map(item => replaceTemplateVariables(item, values));
  }

  // Handle objects
  if (typeof template === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(template)) {
      result[key] = replaceTemplateVariables(value, values);
    }
    return result;
  }

  // Return other types directly
  return template;
}

/**
 * Apply configuration mappings
 */
export function applyConfigMappings(
  mappings: ConfigMapping[],
  values: UserInputValues,
  config: PresetConfigSection
): PresetConfigSection {
  const result = { ...config };

  for (const mapping of mappings) {
    // Check condition
    if (mapping.when && !evaluateConditions(mapping.when, values)) {
      continue;
    }

    // Resolve value
    let value: any;
    if (typeof mapping.value === 'string' && mapping.value.startsWith('#')) {
      // Variable reference
      const varName = mapping.value.replace(/^#{(.+)}$/, '$1');
      value = values[varName];
    } else {
      // Fixed value
      value = mapping.value;
    }

    // Apply to target path
    setValueByPath(result, mapping.target, value);
  }

  return result;
}

/**
 * Get all field ids defined in schema
 */
function getSchemaFields(schema?: RequiredInput[]): Set<string> {
  if (!schema) return new Set();
  return new Set(schema.map(field => field.id));
}

/**
 * Apply user inputs to preset configuration
 * This is the core function of the preset configuration system, uniformly handling
 * configuration application for both CLI and UI layers
 *
 * @param presetFile Preset file object
 * @param values User input values (schema id -> value)
 * @returns Applied configuration object
 */
export function applyUserInputs(
  presetFile: PresetFile,
  values: UserInputValues
): PresetConfigSection {
  let config: PresetConfigSection = {};

  // Get field ids defined in schema, for subsequent filtering
  const schemaFields = getSchemaFields(presetFile.schema);

  // 1. First apply template (if exists)
  // template completely defines configuration structure, using #{variable} placeholders
  if (presetFile.template) {
    config = replaceTemplateVariables(presetFile.template, values) as any;
  } else {
    // If no template, start from preset's existing config
    // Keep all fields, including schema's id fields (because they may contain placeholders)
    // These fields will be updated or replaced in subsequent configMappings
    config = presetFile.config ? { ...presetFile.config } : {};

    // Replace placeholders in config (e.g. #{apiKey} -> actual value)
    config = replaceTemplateVariables(config, values) as any;

    // Finally, remove schema id fields (they should not appear in final configuration)
    for (const schemaField of schemaFields) {
      delete config[schemaField];
    }
  }

  // 2. Then apply configMappings (if exists)
  // Map user inputs to specific configuration paths
  if (presetFile.configMappings && presetFile.configMappings.length > 0) {
    config = applyConfigMappings(presetFile.configMappings, values, config);
  }

  // 3. Compatible with legacy: apply to keys containing paths (e.g. "Providers[0].api_key")
  for (const [key, value] of Object.entries(values)) {
    if (key.includes('.') || key.includes('[')) {
      setValueByPath(config, key, value);
    }
  }

  return config;
}

/**
 * Validate user input
 */
export function validateInput(
  field: RequiredInput,
  value: any
): { valid: boolean; error?: string } {
  // Check required
  if (field.required !== false && (value === undefined || value === null || value === '')) {
    return {
      valid: false,
      error: `${field.label || field.id} is required`,
    };
  }

  // If value is empty and not required, skip validation
  if (!value && field.required === false) {
    return { valid: true };
  }

  // Type check
  switch (field.type) {
    case InputType.NUMBER:
      if (isNaN(Number(value))) {
        return {
          valid: false,
          error: `${field.label || field.id} must be a number`,
        };
      }
      const numValue = Number(value);
      if (field.min !== undefined && numValue < field.min) {
        return {
          valid: false,
          error: `${field.label || field.id} must be at least ${field.min}`,
        };
      }
      if (field.max !== undefined && numValue > field.max) {
        return {
          valid: false,
          error: `${field.label || field.id} must be at most ${field.max}`,
        };
      }
      break;

    case InputType.SELECT:
    case InputType.MULTISELECT:
      // Check if value is in options
      // Skip here for now, as options need to be dynamically retrieved
      break;
  }

  // Custom validator
  if (field.validator) {
    if (field.validator instanceof RegExp) {
      if (!field.validator.test(String(value))) {
        return {
          valid: false,
          error: `${field.label || field.id} format is invalid`,
        };
      }
    } else if (typeof field.validator === 'string') {
      const regex = new RegExp(field.validator);
      if (!regex.test(String(value))) {
        return {
          valid: false,
          error: `${field.label || field.id} format is invalid`,
        };
      }
    } else if (typeof field.validator === 'function') {
      const result = field.validator(value);
      if (result === false) {
        return {
          valid: false,
          error: `${field.label || field.id} is invalid`,
        };
      } else if (typeof result === 'string') {
        return {
          valid: false,
          error: result,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Get field default value
 */
export function getDefaultValue(field: RequiredInput): any {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }

  // Return default value based on type
  switch (field.type) {
    case InputType.CONFIRM:
      return false;
    case InputType.MULTISELECT:
      return [];
    case InputType.NUMBER:
      return 0;
    default:
      return '';
  }
}

/**
 * Sort fields by dependency
 * Ensure dependent fields are arranged first
 */
export function sortFieldsByDependencies(
  fields: RequiredInput[]
): RequiredInput[] {
  const sorted: RequiredInput[] = [];
  const visited = new Set<string>();

  function visit(field: RequiredInput) {
    if (visited.has(field.id)) {
      return;
    }

    visited.add(field.id);

    // First handle dependent fields
    const dependencies = field.dependsOn || [];
    for (const depId of dependencies) {
      const depField = fields.find(f => f.id === depId);
      if (depField) {
        visit(depField);
      }
    }

    // Extract dependencies from when conditions
    if (field.when) {
      const conditions = Array.isArray(field.when) ? field.when : [field.when];
      for (const cond of conditions) {
        const depField = fields.find(f => f.id === cond.field);
        if (depField) {
          visit(depField);
        }
      }
    }

    sorted.push(field);
  }

  for (const field of fields) {
    visit(field);
  }

  return sorted;
}

/**
 * Build field dependency graph (for optimizing update order)
 */
export function buildDependencyGraph(
  fields: RequiredInput[]
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const field of fields) {
    const deps = new Set<string>();

    // Extract from dependsOn
    if (field.dependsOn) {
      for (const dep of field.dependsOn) {
        deps.add(dep);
      }
    }

    // Extract dependencies from when conditions
    if (field.when) {
      const conditions = Array.isArray(field.when) ? field.when : [field.when];
      for (const cond of conditions) {
        deps.add(cond.field);
      }
    }

    // Extract dependencies from dynamic options
    if (field.options) {
      const options = field.options as any;
      if (options.type === 'models' && options.providerField) {
        const providerId = String(options.providerField).replace(/^#{(.+)}$/, '$1');
        deps.add(providerId);
      }
    }

    graph.set(field.id, deps);
  }

  return graph;
}

/**
 * Get affected fields (when a field value changes, which fields need to be recalculated)
 */
export function getAffectedFields(
  changedFieldId: string,
  fields: RequiredInput[]
): Set<string> {
  const affected = new Set<string>();
  const graph = buildDependencyGraph(fields);

  // Find all fields that depend on changedFieldId
  for (const [fieldId, deps] of graph.entries()) {
    if (deps.has(changedFieldId)) {
      affected.add(fieldId);
    }
  }

  return affected;
}

/**
 * Process StatusLine configuration, convert relative scriptPath to absolute path
 * @param statusLineConfig StatusLine configuration
 * @param presetDir Preset directory path
 */
function processStatusLineConfig(statusLineConfig: any, presetDir?: string): any {
  if (!statusLineConfig || typeof statusLineConfig !== 'object') {
    return statusLineConfig;
  }

  const result = { ...statusLineConfig };

  // Process each theme's modules
  for (const themeKey of Object.keys(result)) {
    const theme = result[themeKey];
    if (theme && typeof theme === 'object' && theme.modules) {
      const modules = Array.isArray(theme.modules) ? theme.modules : [];
      const processedModules = modules.map((module: any) => {
        // If module has scriptPath and presetDir is provided, convert to absolute path
        if (module.scriptPath && presetDir && !module.scriptPath.startsWith('/')) {
          return {
            ...module,
            scriptPath: path.join(presetDir, module.scriptPath)
          };
        }
        return module;
      });
      result[themeKey] = {
        ...theme,
        modules: processedModules
      };
    }
  }

  return result;
}

/**
 * Process transformers configuration, convert relative path to absolute path
 * @param transformersConfig Transformers configuration array
 * @param presetDir Preset directory path
 */
function processTransformersConfig(transformersConfig: any[], presetDir?: string): any[] {
  if (!transformersConfig || !Array.isArray(transformersConfig)) {
    return transformersConfig;
  }

  if (!presetDir) {
    return transformersConfig;
  }

  return transformersConfig.map((transformer: any) => {
    // If transformer has path and it's a relative path, convert to absolute path
    if (transformer.path && !transformer.path.startsWith('/')) {
      return {
        ...transformer,
        path: path.join(presetDir, transformer.path)
      };
    }
    return transformer;
  });
}

/**
 * Load configuration from Manifest and apply userValues
 * Used when reading installed presets, applying user configuration values at runtime
 *
 * @param manifest Manifest object (contains original configuration and userValues)
 * @param presetDir Optional preset directory path (for resolving relative paths like scriptPath)
 * @returns Applied configuration object
 */
export function loadConfigFromManifest(manifest: ManifestFile, presetDir?: string): PresetConfigSection {
  // Convert manifest to PresetFile format
  const presetFile: PresetFile = {
    metadata: {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      homepage: manifest.homepage,
      repository: manifest.repository,
      license: manifest.license,
      keywords: manifest.keywords,
      ccrVersion: manifest.ccrVersion,
      source: manifest.source,
      sourceType: manifest.sourceType,
      checksum: manifest.checksum,
    },
    config: {},
    schema: manifest.schema,
    template: manifest.template,
    configMappings: manifest.configMappings,
  };

  // Extract configuration section from manifest (exclude metadata and dynamic configuration fields)
  const METADATA_FIELDS = [
    'name', 'version', 'description', 'author', 'homepage', 'repository',
    'license', 'keywords', 'ccrVersion', 'source', 'sourceType', 'checksum',
  ];
  const DYNAMIC_CONFIG_FIELDS = ['schema', 'template', 'configMappings', 'userValues'];

  for (const [key, value] of Object.entries(manifest)) {
    if (!METADATA_FIELDS.includes(key) && !DYNAMIC_CONFIG_FIELDS.includes(key)) {
      presetFile.config[key] = value;
    }
  }

  let config: PresetConfigSection;

  // If userValues exist, apply them
  if (manifest.userValues && Object.keys(manifest.userValues).length > 0) {
    config = applyUserInputs(presetFile, manifest.userValues);
  } else {
    // If no userValues, use original configuration directly
    config = presetFile.config;
  }

  // Process StatusLine configuration (convert relative scriptPath to absolute path)
  if (config.StatusLine) {
    config.StatusLine = processStatusLineConfig(config.StatusLine, presetDir);
  }

  // Process transformers configuration (convert relative path to absolute path)
  if (config.transformers) {
    config.transformers = processTransformersConfig(config.transformers, presetDir);
  }

  return config;
}
