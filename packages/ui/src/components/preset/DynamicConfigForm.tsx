import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

// Type definitions
interface InputOption {
  label: string;
  value: string | number | boolean;
  description?: string;
  disabled?: boolean;
}

interface DynamicOptions {
  type: 'static' | 'providers' | 'models' | 'custom';
  options?: InputOption[];
  providerField?: string;
}

interface Condition {
  field: string;
  operator?: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists';
  value?: any;
}

interface RequiredInput {
  id: string;
  type?: 'password' | 'input' | 'select' | 'multiselect' | 'confirm' | 'editor' | 'number';
  label?: string;
  prompt?: string;
  placeholder?: string;
  options?: InputOption[] | DynamicOptions;
  when?: Condition | Condition[];
  defaultValue?: any;
  required?: boolean;
  validator?: RegExp | string | ((value: any) => boolean | string);
  min?: number;
  max?: number;
  rows?: number;
  dependsOn?: string[];
}

interface PresetConfigSection {
  Providers?: Array<{
    name: string;
    api_base_url?: string;
    models?: string[];
    [key: string]: any;
  }>;
  [key: string]: any;
}

interface DynamicConfigFormProps {
  schema: RequiredInput[];
  presetConfig: PresetConfigSection;
  onSubmit: (values: Record<string, any>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  initialValues?: Record<string, any>;
}

export function DynamicConfigForm({
  schema,
  presetConfig,
  onSubmit,
  onCancel,
  isSubmitting = false,
  initialValues = {},
}: DynamicConfigFormProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());

  // Calculate visible fields
  useEffect(() => {
    const updateVisibility = () => {
      const visible = new Set<string>();

      for (const field of schema) {
        if (shouldShowField(field)) {
          visible.add(field.id);
        }
      }

      setVisibleFields(visible);
    };

    updateVisibility();
  }, [values, schema]);

  // Evaluate condition
  const evaluateCondition = (condition: Condition): boolean => {
    const actualValue = values[condition.field];

    if (condition.operator === 'exists') {
      return actualValue !== undefined && actualValue !== null;
    }

    if (condition.operator === 'in') {
      return Array.isArray(condition.value) && condition.value.includes(actualValue);
    }

    if (condition.operator === 'nin') {
      return Array.isArray(condition.value) && !condition.value.includes(actualValue);
    }

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
        return actualValue === condition.value;
    }
  };

  // Determine if field should be displayed
  const shouldShowField = (field: RequiredInput): boolean => {
    if (!field.when) {
      return true;
    }

    const conditions = Array.isArray(field.when) ? field.when : [field.when];
    return conditions.every(condition => evaluateCondition(condition));
  };

  // Get options list
  const getOptions = (field: RequiredInput): InputOption[] => {
    if (!field.options) {
      return [];
    }

    const options = field.options as any;

    if (Array.isArray(options)) {
      return options as InputOption[];
    }

    if (options.type === 'static') {
      return options.options || [];
    }

    if (options.type === 'providers') {
      const providers = presetConfig.Providers || [];
      return providers.map((p) => ({
        label: p.name || p.id || String(p),
        value: p.name || p.id || String(p),
        description: p.api_base_url,
      }));
    }

    if (options.type === 'models') {
      const providerField = options.providerField;
      if (!providerField) {
        return [];
      }

      const providerId = String(providerField).replace(/^{{(.+)}}$/, '$1');
      const selectedProvider = values[providerId];

      if (!selectedProvider || !presetConfig.Providers) {
        return [];
      }

      const provider = presetConfig.Providers.find(
        (p) => p.name === selectedProvider || p.id === selectedProvider
      );

      if (!provider || !provider.models) {
        return [];
      }

      return provider.models.map((model: string) => ({
        label: model,
        value: model,
      }));
    }

    return [];
  };

  // Update field value
  const updateValue = (fieldId: string, value: any) => {
    setValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
    // Clear errors for this field
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[fieldId];
      return newErrors;
    });
  };

  // Validate single field
  const validateField = (field: RequiredInput): string | null => {
    const value = values[field.id];
    const fieldName = field.label || field.id;

    // Check required (for confirm type, false is a valid value)
    const isEmpty = value === undefined || value === null || value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (field.required !== false && isEmpty) {
      return t('presets.form.field_required', { field: fieldName });
    }

    // Type check
    if (field.type === 'number' && value !== '' && isNaN(Number(value))) {
      return t('presets.form.must_be_number', { field: fieldName });
    }

    if (field.type === 'number') {
      const numValue = Number(value);
      if (field.min !== undefined && numValue < field.min) {
        return t('presets.form.must_be_at_least', { field: fieldName, min: field.min });
      }
      if (field.max !== undefined && numValue > field.max) {
        return t('presets.form.must_be_at_most', { field: fieldName, max: field.max });
      }
    }

    // Custom validator
    if (field.validator && value !== '') {
      if (field.validator instanceof RegExp) {
        if (!field.validator.test(String(value))) {
          return t('presets.form.format_invalid', { field: fieldName });
        }
      } else if (typeof field.validator === 'string') {
        const regex = new RegExp(field.validator);
        if (!regex.test(String(value))) {
          return t('presets.form.format_invalid', { field: fieldName });
        }
      }
    }

    return null;
  };

  // Submit form
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all visible fields
    const newErrors: Record<string, string> = {};

    for (const field of schema) {
      if (!visibleFields.has(field.id)) {
        continue;
      }

      const error = validateField(field);
      if (error) {
        newErrors[field.id] = error;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {schema.map((field) => {
        if (!visibleFields.has(field.id)) {
          return null;
        }

        const label = field.label || field.id;
        const prompt = field.prompt;
        const error = errors[field.id];

        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={`field-${field.id}`}>
              {label}
              {field.required !== false && <span className="text-red-500 ml-1">*</span>}
            </Label>

            {prompt && (
              <p className="text-sm text-gray-600">{prompt}</p>
            )}

            {/* Password / Input */}
            {(field.type === 'password' || field.type === 'input' || !field.type) && (
              <Input
                id={`field-${field.id}`}
                type={field.type === 'password' ? 'password' : 'text'}
                placeholder={field.placeholder}
                value={values[field.id] || ''}
                onChange={(e) => updateValue(field.id, e.target.value)}
                disabled={isSubmitting}
              />
            )}

            {/* Number */}
            {field.type === 'number' && (
              <Input
                id={`field-${field.id}`}
                type="number"
                placeholder={field.placeholder}
                value={values[field.id] || ''}
                onChange={(e) => updateValue(field.id, Number(e.target.value))}
                min={field.min}
                max={field.max}
                disabled={isSubmitting}
              />
            )}

            {/* Select */}
            {field.type === 'select' && (
              <Select
                value={values[field.id] || ''}
                onValueChange={(value: string) => updateValue(field.id, value)}
                disabled={isSubmitting}
              >
                <SelectTrigger id={`field-${field.id}`}>
                  <SelectValue placeholder={field.placeholder || t('presets.form.select', { label })} />
                </SelectTrigger>
                <SelectContent>
                  {getOptions(field).map((option) => (
                    <SelectItem
                      key={String(option.value)}
                      value={String(option.value)}
                      disabled={option.disabled}
                    >
                      <div>
                        <div>{option.label}</div>
                        {option.description && (
                          <div className="text-xs text-gray-500">{option.description}</div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Multiselect */}
            {field.type === 'multiselect' && (
              <div className="space-y-2">
                {getOptions(field).map((option) => (
                  <div key={String(option.value)} className="flex items-center space-x-2">
                    <Checkbox
                      id={`field-${field.id}-${option.value}`}
                      checked={Array.isArray(values[field.id]) && values[field.id].includes(option.value)}
                      onCheckedChange={(checked: boolean | 'indeterminate') => {
                        const current = Array.isArray(values[field.id]) ? values[field.id] : [];
                        if (checked === true) {
                          updateValue(field.id, [...current, option.value]);
                        } else {
                          updateValue(field.id, current.filter((v: any) => v !== option.value));
                        }
                      }}
                      disabled={isSubmitting || option.disabled}
                    />
                    <Label
                      htmlFor={`field-${field.id}-${option.value}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {option.label}
                      {option.description && (
                        <span className="text-gray-500 ml-2">{option.description}</span>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            )}

            {/* Confirm */}
            {field.type === 'confirm' && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`field-${field.id}`}
                  checked={values[field.id] || false}
                  onCheckedChange={(checked: boolean | 'indeterminate') => updateValue(field.id, checked)}
                  disabled={isSubmitting}
                />
                <Label htmlFor={`field-${field.id}`} className="text-sm font-normal cursor-pointer">
                  {field.prompt || label}
                </Label>
              </div>
            )}

            {/* Editor */}
            {field.type === 'editor' && (
              <Textarea
                id={`field-${field.id}`}
                placeholder={field.placeholder}
                value={values[field.id] || ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateValue(field.id, e.target.value)}
                rows={field.rows || 5}
                disabled={isSubmitting}
              />
            )}

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
          </div>
        );
      })}

      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {t('app.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('presets.form.saving')}
            </>
          ) : (
            t('app.save')
          )}
        </Button>
      </div>
    </form>
  );
}
