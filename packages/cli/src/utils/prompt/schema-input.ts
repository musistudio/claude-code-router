/**
 * Dynamic configuration CLI interaction handler
 * Handles user interactions for various input types
 */

import {
  RequiredInput,
  InputType,
  UserInputValues,
  PresetConfigSection,
  shouldShowField,
  resolveOptions,
  validateInput,
  getDefaultValue,
  sortFieldsByDependencies,
  getAffectedFields,
} from '@CCR/shared';
import input from '@inquirer/input';
import confirm from '@inquirer/confirm';
import select from '@inquirer/select';
import password from '@inquirer/password';
import checkbox from '@inquirer/checkbox';
import editor from '@inquirer/editor';

// ANSI color codes
export const COLORS = {
  RESET: "\x1B[0m",
  GREEN: "\x1B[32m",
  YELLOW: "\x1B[33m",
  BOLDYELLOW: "\x1B[1m\x1B[33m",
  BOLDCYAN: "\x1B[1m\x1B[36m",
  DIM: "\x1B[2m",
  BOLDGREEN: "\x1B[1m\x1B[32m",
};

/**
 * Collect user input (supports dynamic configuration)
 */
export async function collectUserInputs(
  schema: RequiredInput[],
  presetConfig: PresetConfigSection,
  existingValues?: UserInputValues
): Promise<UserInputValues> {
  // Sort by dependencies
  const sortedFields = sortFieldsByDependencies(schema);

  // Initialize values
  const values: UserInputValues = { ...existingValues };

  // Collect all inputs
  for (const field of sortedFields) {
    // Check if this field should be displayed
    if (!shouldShowField(field, values)) {
      // Skip and clear the field value (if it existed before)
      delete values[field.id];
      continue;
    }

    // Skip if value already exists and not initial collection
    if (existingValues && field.id in existingValues) {
      continue;
    }

    // Get input value
    const value = await promptField(field, presetConfig, values);

    // Validate
    const validation = validateInput(field, value);
    if (!validation.valid) {
      console.error(`${COLORS.YELLOW}Error:${COLORS.RESET} ${validation.error}`);
      // Throw error for required fields
      if (field.required !== false) {
        throw new Error(validation.error);
      }
    }

    values[field.id] = value;
    console.log('');
  }

  return values;
}

/**
 * Recollect affected fields (when a field value changes)
 */
export async function recollectAffectedFields(
  changedFieldId: string,
  schema: RequiredInput[],
  presetConfig: PresetConfigSection,
  currentValues: UserInputValues
): Promise<UserInputValues> {
  const affectedFields = getAffectedFields(changedFieldId, schema);
  const sortedFields = sortFieldsByDependencies(schema);

  const values = { ...currentValues };

  // Recollect input for affected fields
  for (const fieldId of affectedFields) {
    const field = sortedFields.find(f => f.id === fieldId);
    if (!field) {
      continue;
    }

    // Check if should be displayed
    if (!shouldShowField(field, values)) {
      delete values[field.id];
      continue;
    }

    // Recollect input
    const value = await promptField(field, presetConfig, values);
    values[field.id] = value;

    // Cascade update: if this field change affects other fields
    const newAffected = getAffectedFields(field.id, schema);
    for (const newAffectedId of newAffected) {
      if (!affectedFields.has(newAffectedId)) {
        affectedFields.add(newAffectedId);
      }
    }
  }

  return values;
}

/**
 * Prompt for a single field
 */
async function promptField(
  field: RequiredInput,
  presetConfig: PresetConfigSection,
  currentValues: UserInputValues
): Promise<any> {
  const label = field.label || field.id;
  const message = field.prompt || `${label}:`;

  switch (field.type) {
    case InputType.PASSWORD:
      return await password({
        message,
        mask: '*',
      });

    case InputType.INPUT:
      return await input({
        message,
        default: field.defaultValue,
      });

    case InputType.NUMBER:
      const numStr = await input({
        message,
        default: String(field.defaultValue ?? 0),
      });
      return Number(numStr);

    case InputType.CONFIRM:
      return await confirm({
        message,
        default: field.defaultValue ?? false,
      });

    case InputType.SELECT: {
      const options = resolveOptions(field, presetConfig, currentValues);
      if (options.length === 0) {
        console.warn(`${COLORS.YELLOW}Warning:${COLORS.RESET} No options available for ${label}`);
        return field.defaultValue;
      }

      return await select({
        message,
        choices: options.map(opt => ({
          name: opt.label,
          value: opt.value,
          description: opt.description,
          disabled: opt.disabled,
        })),
        default: field.defaultValue,
      });
    }

    case InputType.MULTISELECT: {
      const options = resolveOptions(field, presetConfig, currentValues);
      if (options.length === 0) {
        console.warn(`${COLORS.YELLOW}Warning:${COLORS.RESET} No options available for ${label}`);
        return field.defaultValue ?? [];
      }

      // @inquirer/prompts doesn't have multi-select, use checkbox
      return await checkbox({
        message,
        choices: options.map(opt => ({
          name: opt.label,
          value: opt.value,
          checked: Array.isArray(field.defaultValue) && field.defaultValue.includes(opt.value),
        })),
      });
    }

    case InputType.EDITOR: {
      return await editor({
        message,
        default: field.defaultValue,
      });
    }

    default:
      // Use input by default
      return await input({
        message,
        default: field.defaultValue,
      });
  }
}

/**
 * Collect sensitive information (legacy compatible)
 */
export async function collectSensitiveInputs(
  schema: RequiredInput[],
  presetConfig: PresetConfigSection,
  existingValues?: UserInputValues
): Promise<UserInputValues> {
  console.log(`\n${COLORS.BOLDYELLOW}This preset requires additional information:${COLORS.RESET}\n`);

  const values = await collectUserInputs(schema, presetConfig, existingValues);

  // Display summary
  console.log(`${COLORS.GREEN}✓${COLORS.RESET} All required information collected\n`);

  return values;
}
