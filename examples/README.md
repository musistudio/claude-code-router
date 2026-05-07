# Preset Examples

This directory contains example files for CCR preset configurations.

## Example Files

### 1. `simple-preset-example.json` - Simple Example
Suitable for beginners, demonstrating basic dynamic configuration features:
- Password input (API Key)
- Single-select dropdown (model selection)
- Confirmation checkbox (whether to use a proxy)
- Conditional display (proxy address input shown only when proxy is enabled)

**Use case**: Quick configuration of a single Provider

### 2. `preset-manifest-example.json` - Complete Example
Demonstrates all advanced features:
- Multiple input types (password, select, confirm, number, multiselect)
- Dynamic options (extracted from Providers configuration)
- Complex conditional logic (when conditions)
- Template variable substitution ({{variable}})
- Configuration mappings (configMappings)

**Use case**: Production-ready complete configuration

### 3. `dynamic-preset-example.json` - Multi-Provider Example
Demonstrates switching between multiple Providers:
- Provider selector
- Dynamic model options based on selected Provider
- Proxy configuration
- Advanced feature toggles

## How to Use These Examples

### Method 1: Copy directly to presets directory

```bash
# Create preset directory
mkdir -p ~/.claude-code-router/presets/my-preset

# Copy example file
cp simple-preset-example.json ~/.claude-code-router/presets/my-preset/manifest.json

# Apply preset
ccr my-preset
```

### Method 2: Modify and use

1. Copy example file locally
2. Modify configuration as needed
3. Install using CLI:

```bash
ccr preset install ./simple-preset-example.json --name my-preset
```

## Schema Field Types

| Type | Description | Use Case |
|------|-------------|----------|
| `password` | Password input | API keys, secrets, and other sensitive info |
| `input` | Single-line text | Base URL, endpoint addresses |
| `number` | Number input | Timeout, token count |
| `select` | Single select | Provider selection, model selection |
| `multiselect` | Multi-select | Feature toggles, tag selection |
| `confirm` | Confirmation checkbox | Enable/disable a feature |
| `editor` | Multi-line text | Custom configuration, scripts |

## Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals | Show when provider == "openai" |
| `ne` | Not equals | Show when mode != "simple" |
| `exists` | Field exists | Show when apiKey has a value |
| `gt/lt` | Greater than / Less than | Show when timeout > 30 |

## Dynamic Option Types

### static - Static Options
```json
"options": {
  "type": "static",
  "options": [
    {"label": "Option 1", "value": "value1"},
    {"label": "Option 2", "value": "value2"}
  ]
}
```

### providers - Extract from Providers Configuration
```json
"options": {
  "type": "providers"
}
```
Automatically extracts `name` from the `Providers` array as options.

### models - Extract from a Specific Provider's Models
```json
"options": {
  "type": "models",
  "providerField": "{{selectedProvider}}"
}
```
Dynamically displays the models of the Provider selected by the user.

## Template Variables

Use the `{{variableName}}` syntax in templates to reference user input:

```json
"template": {
  "Providers": [
    {
      "name": "{{providerName}}",
      "api_key": "{{apiKey}}"
    }
  ]
}
```

## Configuration Mappings

For complex configuration requirements, use `configMappings` to precisely control where values are placed:

```json
"configMappings": [
  {
    "target": "Providers[0].api_key",
    "value": "{{apiKey}}"
  },
  {
    "target": "PROXY_URL",
    "value": "{{proxyUrl}}",
    "when": {
      "field": "useProxy",
      "operator": "eq",
      "value": true
    }
  }
]
```

## Best Practices

1. **Provide defaults**: Set reasonable `defaultValue` for optional fields
2. **Clear labels**: Use user-friendly `label` and `prompt`
3. **Conditional display**: Use `when` to avoid showing irrelevant options
4. **Input validation**: Use `validator` or `min/max` to ensure valid input
5. **Group configuration**: Use consistent prefixes for related fields (e.g., `proxy*`)
6. **Version management**: Record version and changes in metadata

## More Help

- Full documentation: [Presets Configuration Guide](../docs/docs/server/advanced/presets.md)
- Type definitions: [types.ts](../packages/shared/src/preset/types.ts)
