---
sidebar_position: 3
---

# Presets

Use predefined configurations for quick setup.

## What are Presets?

Presets are pre-configured settings that include provider configurations, routing rules, and transformers optimized for specific use cases.

## Using Presets

### CLI Mode (Command Line)

CLI mode is suitable for developers who prefer command-line operations.

#### Installing Presets

**Install from local directory:**

```bash
ccr preset install /path/to/preset-directory
```

**Reconfigure an installed preset:**

```bash
ccr preset install my-preset
```

#### Using Presets

After installing a preset, you can use the preset name to start Claude Code:

```bash
# Start with a specific preset
ccr my-preset "your prompt"
```

The preset will:
- Automatically load pre-configured Providers
- Apply preset routing rules
- Use transformers configured in the preset

#### List All Presets

```bash
ccr preset list
```

This will display all installed presets with their names, versions, and descriptions.

#### View Preset Information

```bash
ccr preset info my-preset
```

#### Delete Preset

```bash
ccr preset delete my-preset
```

### Web UI Mode

Web UI provides a more friendly visual interface with additional installation methods.

#### Access Web UI

```bash
ccr ui
```

Then open `http://localhost:3000` in your browser.

#### Install from GitHub Repository

1. Click the "Preset Market" button
2. Select the preset you want to install from the list
3. Click the "Install" button

#### Reconfigure Preset

1. Click the "View Details" icon next to the preset
2. Modify configuration items in the detail page
3. Click "Apply" to save configuration

#### Manage Presets

- **View**: Click the info icon on the right side of the preset
- **Delete**: Click the delete icon on the right side of the preset

## Creating Custom Presets

### Preset Directory Structure

Presets are stored as directories with the following structure:

```
~/.claude-code-router/presets/<preset-name>/
├── manifest.json           # Required: Preset configuration file
├── transformers/           # Optional: Custom transformers
│   └── custom-transformer.js
├── scripts/               # Optional: Custom scripts
│   └── status.js
└── README.md              # Optional: Documentation
```

### Dynamic Configuration System

CCR introduces a powerful dynamic configuration system that supports:

- **Multiple Input Types**: Selectors, multi-select, confirm boxes, text input, number input, etc.
- **Conditional Logic**: Dynamically show/hide configuration fields based on user input
- **Variable References**: Configuration fields can reference each other
- **Dynamic Options**: Option lists can be dynamically generated from preset configuration or user input

#### Schema Field Types

| Type | Description | Example |
|------|-------------|---------|
| `password` | Password input (hidden) | API Key |
| `input` | Single-line text input | Base URL |
| `number` | Number input | Max tokens |
| `select` | Single-select dropdown | Choose Provider |
| `multiselect` | Multi-select | Enable features |
| `confirm` | Confirmation box | Use proxy |
| `editor` | Multi-line text editor | Custom config |

#### Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals | `{"field": "provider", "operator": "eq", "value": "openai"}` |
| `ne` | Not equals | `{"field": "advanced", "operator": "ne", "value": true}` |
| `in` | In (array) | `{"field": "feature", "operator": "in", "value": ["a", "b"]}` |
| `nin` | Not in (array) | `{"field": "type", "operator": "nin", "value": ["x", "y"]}` |
| `exists` | Field exists | `{"field": "apiKey", "operator": "exists"}` |
| `gt/lt/gte/lte` | Greater/less than (or equal) | For number comparisons |

#### Dynamic Options Types

##### static - Static Options
```json
"options": {
  "type": "static",
  "options": [
    {"label": "Option 1", "value": "value1"},
    {"label": "Option 2", "value": "value2"}
  ]
}
```

##### providers - Extract from Providers Configuration
```json
"options": {
  "type": "providers"
}
```
Automatically extracts names from the `Providers` array as options.

##### models - Extract from Specified Provider's Models
```json
"options": {
  "type": "models",
  "providerField": "{{selectedProvider}}"
}
```
Dynamically displays models based on the user-selected provider.

#### Template Variables

Use `{{variableName}}` syntax to reference user input in the template:

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

#### Configuration Mappings

For complex configuration needs, use `configMappings` to precisely control value placement:

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

#### Complete Example

```json
{
  "name": "multi-provider-example",
  "version": "1.0.0",
  "description": "Multi-provider configuration example - Switch between OpenAI and DeepSeek",
  "author": "CCR Team",
  "keywords": ["openai", "deepseek", "multi-provider"],
  "ccrVersion": "2.0.0",
  "schema": [
    {
      "id": "primaryProvider",
      "type": "select",
      "label": "Primary Provider",
      "prompt": "Select your primary LLM provider",
      "options": {
        "type": "static",
        "options": [
          {
            "label": "OpenAI",
            "value": "openai",
            "description": "Use OpenAI's GPT models"
          },
          {
            "label": "DeepSeek",
            "value": "deepseek",
            "description": "Use DeepSeek's cost-effective models"
          }
        ]
      },
      "required": true,
      "defaultValue": "openai"
    },
    {
      "id": "apiKey",
      "type": "password",
      "label": "API Key",
      "prompt": "Enter your API Key",
      "placeholder": "sk-...",
      "required": true
    },
    {
      "id": "defaultModel",
      "type": "select",
      "label": "Default Model",
      "prompt": "Select the default model to use",
      "options": {
        "type": "static",
        "options": [
          {"label": "GPT-4o", "value": "gpt-4o"},
          {"label": "GPT-4o-mini", "value": "gpt-4o-mini"}
        ]
      },
      "required": true,
      "defaultValue": "gpt-4o",
      "when": {
        "field": "primaryProvider",
        "operator": "eq",
        "value": "openai"
      }
    },
    {
      "id": "enableProxy",
      "type": "confirm",
      "label": "Enable Proxy",
      "prompt": "Access API through a proxy?",
      "defaultValue": false
    },
    {
      "id": "proxyUrl",
      "type": "input",
      "label": "Proxy URL",
      "prompt": "Enter proxy server address",
      "placeholder": "http://127.0.0.1:7890",
      "required": true,
      "when": {
        "field": "enableProxy",
        "operator": "eq",
        "value": true
      }
    }
  ],
  "template": {
    "Providers": [
      {
        "name": "{{primaryProvider}}",
        "api_base_url": "https://api.openai.com/v1/chat/completions",
        "api_key": "{{apiKey}}",
        "models": ["{{defaultModel}}"]
      }
    ],
    "Router": {
      "default": "{{primaryProvider}},{{defaultModel}}"
    },
    "PROXY_URL": "{{proxyUrl}}"
  },
  "configMappings": [
    {
      "target": "PROXY_URL",
      "value": "{{proxyUrl}}",
      "when": {
        "field": "enableProxy",
        "operator": "eq",
        "value": true
      }
    }
  ]
}
```

### manifest.json Complete Field Reference

`manifest.json` is the core configuration file of a preset, using JSON5 format (comments supported).

#### 1. Metadata Fields

These fields describe basic information about the preset:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Preset name (unique identifier) |
| `version` | string | ✓ | Version number (follows semver) |
| `description` | string | - | Preset description |
| `author` | string | - | Author information |
| `homepage` | string | - | Project homepage URL |
| `repository` | string | - | Source repository URL |
| `license` | string | - | License type |
| `keywords` | string[] | - | Keyword tags |
| `ccrVersion` | string | - | Compatible CCR version |

Example:

```json
{
  "name": "my-preset",
  "version": "1.0.0",
  "description": "My custom preset",
  "author": "Your Name",
  "homepage": "https://github.com/yourname/ccr-presets",
  "repository": "https://github.com/yourname/ccr-presets.git",
  "license": "MIT",
  "keywords": ["openai", "production"],
  "ccrVersion": "2.0.0"
}
```

#### 2. Configuration Fields

These fields are directly merged into CCR's configuration. All fields supported in `config.json` can be used here:

| Field | Type | Description |
|-------|------|-------------|
| `Providers` | array | Provider configuration array |
| `Router` | object | Routing configuration |
| `transformers` | array | Transformer configuration |
| `StatusLine` | object | Status bar configuration |
| `NON_INTERACTIVE_MODE` | boolean | Enable non-interactive mode (for CI/CD) |

**CLI-Only Fields** (these fields only work in CLI mode and are not used by the server):

| Field | Type | Description |
|-------|------|-------------|
| `noServer` | boolean | Skip local server startup and use provider's API directly |
| `claudeCodeSettings` | object | Claude Code specific settings (env, statusLine, etc.) |

Example:

```json
{
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "${OPENAI_API_KEY}",
      "models": ["gpt-4o", "gpt-4o-mini"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4o",
    "background": "openai,gpt-4o-mini"
  },
  "PORT": 8080
}
```

#### 3. Dynamic Configuration System Fields

These fields are used to create interactive configuration templates:

| Field | Type | Description |
|-------|------|-------------|
| `schema` | array | Configuration input form definition |
| `template` | object | Configuration template (with variable references) |
| `configMappings` | array | Configuration mapping rules |
| `userValues` | object | User-filled values (used at runtime) |

**Schema Field Types:**

| Type | Description | Use Case |
|------|-------------|----------|
| `password` | Password input (hidden) | API Key |
| `input` | Single-line text input | URL |
| `number` | Number input | Port number |
| `select` | Single-select dropdown | Select Provider |
| `multiselect` | Multi-select | Enable features |
| `confirm` | Confirmation box | Enable/disable |
| `editor` | Multi-line text editor | Custom config |

Dynamic configuration example:

```json
{
  "schema": [
    {
      "id": "apiKey",
      "type": "password",
      "label": "API Key",
      "prompt": "Enter your API Key",
      "required": true
    },
    {
      "id": "provider",
      "type": "select",
      "label": "Provider",
      "options": {
        "type": "static",
        "options": [
          {"label": "OpenAI", "value": "openai"},
          {"label": "DeepSeek", "value": "deepseek"}
        ]
      },
      "defaultValue": "openai"
    }
  ],
  "template": {
    "Providers": [
      {
        "name": "#{provider}",
        "api_key": "#{apiKey}"
      }
    ]
  }
}
```

### Creating Preset Examples

#### Example 1: Simple Preset (No Dynamic Configuration)

```bash
# Create preset directory
mkdir -p ~/.claude-code-router/presets/simple-openai

# Create manifest.json
cat > ~/.claude-code-router/presets/simple-openai/manifest.json << 'EOF'
{
  "name": "simple-openai",
  "version": "1.0.0",
  "description": "Simple OpenAI configuration",
  "author": "Your Name",

  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "${OPENAI_API_KEY}",
      "models": ["gpt-4o", "gpt-4o-mini"]
    }
  ],

  "Router": {
    "default": "openai,gpt-4o",
    "background": "openai,gpt-4o-mini"
  }
}
EOF

# Configure preset (input API Key)
ccr preset install simple-openai

# Use preset
ccr simple-openai "your prompt"
```

#### Example 2: Advanced Preset (Dynamic Configuration)

```bash
# Create preset directory
mkdir -p ~/.claude-code-router/presets/advanced-config

# Create manifest.json
cat > ~/.claude-code-router/presets/advanced-config/manifest.json << 'EOF'
{
  "name": "advanced-config",
  "version": "1.0.0",
  "description": "Advanced configuration with multi-provider support",
  "author": "Your Name",
  "keywords": ["openai", "deepseek", "multi-provider"],

  "schema": [
    {
      "id": "provider",
      "type": "select",
      "label": "Select Provider",
      "prompt": "Choose your primary LLM provider",
      "options": {
        "type": "static",
        "options": [
          {
            "label": "OpenAI",
            "value": "openai",
            "description": "Use OpenAI's GPT models"
          },
          {
            "label": "DeepSeek",
            "value": "deepseek",
            "description": "Use DeepSeek's cost-effective models"
          }
        ]
      },
      "defaultValue": "openai",
      "required": true
    },
    {
      "id": "apiKey",
      "type": "password",
      "label": "API Key",
      "prompt": "Enter your API Key",
      "placeholder": "sk-...",
      "required": true
    },
    {
      "id": "enableProxy",
      "type": "confirm",
      "label": "Enable Proxy",
      "prompt": "Access API through a proxy?",
      "defaultValue": false
    },
    {
      "id": "proxyUrl",
      "type": "input",
      "label": "Proxy URL",
      "prompt": "Enter proxy server address",
      "placeholder": "http://127.0.0.1:7890",
      "required": true,
      "when": {
        "field": "enableProxy",
        "operator": "eq",
        "value": true
      }
    }
  ],

  "template": {
    "Providers": [
      {
        "name": "#{provider}",
        "api_base_url": "#{provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepseek.com/v1/chat/completions'}",
        "api_key": "#{apiKey}",
        "models": ["gpt-4o", "gpt-4o-mini"]
      }
    ],
    "Router": {
      "default": "#{provider},gpt-4o",
      "background": "#{provider},gpt-4o-mini"
    }
  },

  "configMappings": [
    {
      "target": "PROXY_URL",
      "value": "#{proxyUrl}",
      "when": {
        "field": "enableProxy",
        "operator": "eq",
        "value": true
      }
    }
  ]
}
EOF

# Configure preset (will prompt for input)
ccr preset install advanced-config

# Use preset
ccr advanced-config "your prompt"
```

### Export Current Configuration as Preset

If you have already configured CCR, you can export the current configuration:

```bash
# Export current configuration
ccr preset export my-exported-preset
```

Export will automatically:
- Identify sensitive fields (like `api_key`) and replace with environment variable placeholders
- Generate `schema` for collecting user input
- Generate `template` and `configMappings`

Optional flags:

```bash
ccr preset export my-exported-preset \
  --description "Exported configuration" \
  --author "Your Name" \
  --tags "production,openai"
```

## Preset File Location

Presets are stored in:

```
~/.claude-code-router/presets/
```

Each preset is a directory containing a `manifest.json` file.

## Best Practices

1. **Use Dynamic Configuration**: Use the schema system for configuration items that require user input
2. **Provide Defaults**: Set reasonable defaults for optional fields
3. **Conditional Display**: Use `when` conditions to avoid unnecessary inputs
4. **Clear Labels**: Provide clear `label` and `prompt` for each field
5. **Validate Input**: Use `validator` to ensure input validity
6. **Version Control**: Keep commonly used presets in version control
7. **Document**: Add descriptions and version info for custom presets

## Next Steps

- [CLI Reference](/docs/cli/start) - Complete CLI command reference
- [Configuration](/docs/config/basic) - Detailed configuration guide
