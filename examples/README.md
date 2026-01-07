# Preset Example Description

This directory contains sample files for the CCR preset configurations.

# Examples of documents

## Example file

### 1. `simple-preset-example.json` - Simple Example
Suitable for beginners, showing basic dynamic configuration:
- Input type (API Key) (`"password"`)
- Drop-down selection menu (select the model) (`"select`)
- Confirmation menu (whether a proxy is used) (`"confirm"`)
- Conditional menu (proxy address input is only displayed when you choose to use a proxy) (`"when"` condition)

**Use Case**: Quickly configure a single provider

### 2. `preset-manifest-example.json` - Complete Example
Demonstrates all advanced features:
- Multiple input types (`"password"`, `"select"`, `"confirm"`, `"number"`, `"multiselect"`)
- Dynamic options (from Providers configuration)
- Complex conditional logic (`"when"` condition)
- Template variable substitution (`"{{variable}}"`)
- Configuration mapping (`"configMappings"`)

**Use Case**: Complete configuration of production environment

### 3 `dynamic-preset-example.json` - Multi-Provider Example
Shows how to switch between multiple providers:
- Provider Selector (`"select"`)
- Dynamically display the corresponding model options based on the selected Provider
- Proxy configuration
- Advanced function switches

## How to use these examples

### Method 1: Copy directly to the preset directory

```bash
# Creating a Preset Catalog
mkdir -p ~/.claude-code-router/presets/my-preset

# Copy the sample file
cp simple-preset-example.json ~/.claude-code-router/presets/my-preset/manifest.json

# Applying the presets
ccr my-preset
```

### Method 2: Modify and install

1. Copy the sample file to your local machine
2. Modify the configuration as needed
3. Install using the CLI:

```bash
ccr preset install ./simple-preset-example.json --name my-preset
```

## Schema: field type description

| Type | Description | Use Case |
|------|------|----------|
| `password` | Password input | API Key, key and other sensitive information |
| `input` | Single-line text | Base URL, endpoint address |
| `number` | Number input | Timeout, number of tokens |
| `select` | Single selection | Provider selection, model selection |
| `multiselect` | Multiple selection | Function switch, tag selection |
| `confirm` | Confirmation box | Enable/disable a feature |
| `editor` | Multi-line text | Custom configuration, script |

## Conditional operator

| operator | Description | Example |
|--------|------|------|
| `eq` | equals to | Displayed when provider == "openai" |
| `ne` | not equal to | Displayed when mode != "simple" |
| `exists` | field exists | Displayed when apiKey has a value |
| `gt/lt` | greater than/less than | Displayed when timeout > 30 |

## Dynamic Options Types

## static - Static options
```json
"options": {
  "type": "static",
  "options": [
    {"label": "option1", "value": "value1"},
    {"label": "option2", "value": "value2"}
  ]
}
```

## Providers - Extract from Providers Configuration

```json
"options": {
  "type": "providers"
}
```
Automatically extract the name as an option from the `Providers` array.

## models - Extract from the models of the specified Provider

```json
"options": {
  "type": "models",
  "providerField": "{{selectedProvider}}"
}
```
The models of the Provider are dynamically displayed based on the Provider selected by the user.

## Template Variables

Use the `{{variable name}}` syntax to reference user input in the template:

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

## Configure the Mapping

For complex configuration requirements, use `configMappings` to precisely control the location of value:

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

1. **Provide Default Values** : Set reasonable `defaultValue` for non-required fields
2. **Clear Labels**: Use user-friendly `label` and `prompt`
3. **Conditional Display**: Use `when` to avoid displaying irrelevant options.
4. **Input Validation**: Use `validator` or `min/max` to ensure valid input.
5. **Group Configuration**: Use the same prefix for related field (e.g. `proxy*`)
6. **Version Management**: Record versions and changes in metadata

# More help

- View the full documentation: [Presets Configuration Guide](../docs/docs/server/advanced/presets.md)
- View type definitions: [types.ts](.../packages/shared/src/preset/types.ts)
